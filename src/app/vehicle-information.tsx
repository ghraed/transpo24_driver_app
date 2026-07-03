import * as ImagePicker from 'expo-image-picker';
import { useRouter, type Href } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  createMyDriverVehicle,
  uploadMyDriverVehicleDocuments,
} from '@/lib/api';
import { getDriverRouteForNextStep } from '@/lib/driver-onboarding';
import { useAuth } from '@/context/auth-context';
import type {
  CreateDriverVehiclePayload,
  DriverVehicleCondition,
  DriverVehicleDocumentType,
  DriverVehicleForm,
  DriverVehiclePhotoType,
  LocalDocumentAsset,
  VehicleType,
} from '@/types/auth';

const VEHICLE_TYPE_OPTIONS: { label: string; value: VehicleType }[] = [
  { label: 'Open car carrier', value: 'OPEN_CAR_CARRIER' },
  { label: 'Enclosed carrier', value: 'ENCLOSED_CARRIER' },
  { label: 'Small truck', value: 'SMALL_TRUCK' },
  { label: 'Medium truck', value: 'MEDIUM_TRUCK' },
  { label: 'Pickup', value: 'PICKUP' },
  { label: 'Van', value: 'VAN' },
  { label: 'Tow truck', value: 'TOW_TRUCK' },
  { label: 'Motorcycle', value: 'MOTORCYCLE' },
];

const VEHICLE_CONDITION_OPTIONS: {
  label: string;
  value: DriverVehicleCondition;
}[] = [
  { label: 'Excellent', value: 'EXCELLENT' },
  { label: 'Good', value: 'GOOD' },
  { label: 'Needs maintenance', value: 'NEEDS_MAINTENANCE' },
];

interface VehicleUploadForm {
  frontPhoto?: LocalDocumentAsset;
  rearPhoto?: LocalDocumentAsset;
  sidePhoto?: LocalDocumentAsset;
  licensePlatePhoto?: LocalDocumentAsset;
  registrationFrontDocument?: LocalDocumentAsset;
  registrationBackDocument?: LocalDocumentAsset;
  insuranceDocument?: LocalDocumentAsset;
}

function parsePositiveNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function toAssetFromImagePicker(asset: ImagePicker.ImagePickerAsset): LocalDocumentAsset {
  return {
    uri: asset.uri,
    fileName: asset.fileName ?? undefined,
    mimeType: asset.mimeType ?? undefined,
    fileSize: asset.fileSize ?? undefined,
    width: asset.width,
    height: asset.height,
  };
}

export default function VehicleInformationScreen() {
  const router = useRouter();
  const { signOut } = useAuth();

  const [vehicleForm, setVehicleForm] = useState<DriverVehicleForm>({
    vehicleType: '',
    make: '',
    model: '',
    year: '',
    plateNumber: '',
    condition: '',
    color: '',
    capacityKg: '',
    lengthCm: '',
    widthCm: '',
    heightCm: '',
    hasTrailer: false,
  });
  const [uploads, setUploads] = useState<VehicleUploadForm>({});
  const [isSavingVehicle, setIsSavingVehicle] = useState<boolean>(false);
  const [activeUploadKey, setActiveUploadKey] = useState<
    keyof VehicleUploadForm | null
  >(null);
  const [submitError, setSubmitError] = useState<string>('');
  const [submitSuccess, setSubmitSuccess] = useState<string>('');

  const fieldErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    const currentYear = new Date().getFullYear();

    if (!vehicleForm.vehicleType) errors.vehicleType = 'Vehicle type is required.';
    if (!vehicleForm.make.trim()) errors.make = 'Brand is required.';
    if (!vehicleForm.model.trim()) errors.model = 'Model is required.';
    if (!vehicleForm.year.trim()) {
      errors.year = 'Year is required.';
    } else {
      const yearNumber = Number(vehicleForm.year);
      if (!Number.isInteger(yearNumber)) {
        errors.year = 'Year must be a number.';
      } else if (yearNumber < 1980 || yearNumber > currentYear + 1) {
        errors.year = `Year must be between 1980 and ${currentYear + 1}.`;
      }
    }
    if (!vehicleForm.plateNumber.trim()) {
      errors.plateNumber = 'Plate number is required.';
    }
    if (!vehicleForm.condition) {
      errors.condition = 'Vehicle condition is required.';
    }

    const numericOptionalFields: { key: keyof DriverVehicleForm; label: string }[] = [
      { key: 'capacityKg', label: 'Capacity (kg)' },
      { key: 'lengthCm', label: 'Length (cm)' },
      { key: 'widthCm', label: 'Width (cm)' },
      { key: 'heightCm', label: 'Height (cm)' },
    ];

    numericOptionalFields.forEach((field) => {
      const rawValue = vehicleForm[field.key];
      const raw = typeof rawValue === 'string' ? rawValue : '';
      if (!raw.trim()) return;
      if (parsePositiveNumber(raw) === undefined) {
        errors[field.key] = `${field.label} must be a positive number.`;
      }
    });

    if (!uploads.frontPhoto) errors.frontPhoto = 'Front photo is required.';
    if (!uploads.rearPhoto) errors.rearPhoto = 'Rear photo is required.';
    if (!uploads.sidePhoto) errors.sidePhoto = 'Side photo is required.';
    if (!uploads.licensePlatePhoto) errors.licensePlatePhoto = 'Plate photo is required.';
    if (!uploads.registrationFrontDocument) {
      errors.registrationFrontDocument = 'Registration front side is required.';
    }
    if (!uploads.registrationBackDocument) {
      errors.registrationBackDocument = 'Registration back side is required.';
    }
    if (!uploads.insuranceDocument) {
      errors.insuranceDocument = 'Insurance document is required.';
    }

    return errors;
  }, [uploads, vehicleForm]);

  const isFormValid = Object.keys(fieldErrors).length === 0;
  const isBusy = isSavingVehicle || Boolean(activeUploadKey);

  const onVehicleChange = <K extends keyof DriverVehicleForm>(
    key: K,
    value: DriverVehicleForm[K],
  ): void => {
    setVehicleForm((prev) => ({ ...prev, [key]: value }));
  };

  const onUploadChange = <K extends keyof VehicleUploadForm>(
    key: K,
    value?: VehicleUploadForm[K],
  ): void => {
    setUploads((prev) => ({ ...prev, [key]: value }));
  };

  const chooseImageSource = (
    key: keyof VehicleUploadForm,
    title: string,
  ): void => {
    if (isBusy) return;

    Alert.alert(title, 'Choose how you want to provide this file.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Take photo',
        onPress: () => {
          void captureImage(key);
        },
      },
      {
        text: 'Choose photo',
        onPress: () => {
          void pickImage(key);
        },
      },
    ]);
  };

  const pickImage = async (key: keyof VehicleUploadForm): Promise<void> => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
      setSubmitError('Photo library permission is required to select images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.9,
    });

    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    onUploadChange(key, toAssetFromImagePicker(asset));
  };

  const captureImage = async (key: keyof VehicleUploadForm): Promise<void> => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
      setSubmitError('Camera permission is required to capture images.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.9,
    });

    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    onUploadChange(key, toAssetFromImagePicker(asset));
  };

  const onSaveVehicle = async (): Promise<void> => {
    if (!isFormValid || isBusy) return;

    setSubmitError('');
    setSubmitSuccess('');
    setIsSavingVehicle(true);

    const payload: CreateDriverVehiclePayload = {
      vehicleType: vehicleForm.vehicleType as VehicleType,
      make: vehicleForm.make.trim(),
      model: vehicleForm.model.trim(),
      year: Number(vehicleForm.year),
      plateNumber: vehicleForm.plateNumber.trim(),
      condition: vehicleForm.condition as DriverVehicleCondition,
      color: vehicleForm.color.trim() || undefined,
      capacityKg: parsePositiveNumber(vehicleForm.capacityKg),
      lengthCm: parsePositiveNumber(vehicleForm.lengthCm),
      widthCm: parsePositiveNumber(vehicleForm.widthCm),
      heightCm: parsePositiveNumber(vehicleForm.heightCm),
      hasTrailer: vehicleForm.hasTrailer,
    };

    try {
      const created = await createMyDriverVehicle(payload);
      const vehicleId = created.vehicle.id;

      setActiveUploadKey('frontPhoto');
      const uploaded = await uploadMyDriverVehicleDocuments(vehicleId, {
        frontPhoto: uploads.frontPhoto as LocalDocumentAsset,
        rearPhoto: uploads.rearPhoto as LocalDocumentAsset,
        sidePhoto: uploads.sidePhoto as LocalDocumentAsset,
        licensePlatePhoto: uploads.licensePlatePhoto as LocalDocumentAsset,
        registrationFrontDocument: uploads.registrationFrontDocument as LocalDocumentAsset,
        registrationBackDocument: uploads.registrationBackDocument as LocalDocumentAsset,
        insuranceDocument: uploads.insuranceDocument as LocalDocumentAsset,
      });

      setSubmitSuccess('Vehicle saved successfully.');
      if (uploaded.nextStep === 'ADD_VEHICLE_DOCUMENTS') {
        router.replace({
          pathname: '/vehicle-load',
          params: { vehicleId },
        });
        return;
      }

      router.replace(
        uploaded.nextStep === 'HOME' || uploaded.nextStep === 'WAITING_APPROVAL'
          ? ('/my-vehicles' as Href)
          : getDriverRouteForNextStep(uploaded.nextStep),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save vehicle.';
      const normalized = message.toLowerCase();

      if (normalized.includes('plate')) {
        setSubmitError('Plate number is already in use.');
      } else if (
        normalized.includes('invalid or expired token') ||
        normalized.includes('authorization') ||
        normalized.includes('unauthorized')
      ) {
        await signOut();
        router.replace('/');
        return;
      } else {
        setSubmitError(message);
      }
    } finally {
      setActiveUploadKey(null);
      setIsSavingVehicle(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.progress}>Vehicle Management</Text>
          <Text style={styles.title}>Add Vehicle</Text>
          <Text style={styles.subtitle}>
            Add at least one complete vehicle to start receiving requests.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vehicle Details</Text>

          <Text style={styles.fieldLabel}>Vehicle type</Text>
          <View style={styles.optionWrap}>
            {VEHICLE_TYPE_OPTIONS.map((option) => {
              const selected = vehicleForm.vehicleType === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.optionChip, selected && styles.optionChipSelected]}
                  onPress={() => onVehicleChange('vehicleType', option.value)}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {fieldErrors.vehicleType ? <Text style={styles.errorText}>{fieldErrors.vehicleType}</Text> : null}

          <Text style={styles.fieldLabel}>Brand</Text>
          <TextInput
            style={styles.input}
            placeholder="Brand"
            value={vehicleForm.make}
            onChangeText={(value) => onVehicleChange('make', value)}
          />
          {fieldErrors.make ? <Text style={styles.errorText}>{fieldErrors.make}</Text> : null}

          <Text style={styles.fieldLabel}>Model</Text>
          <TextInput
            style={styles.input}
            placeholder="Model"
            value={vehicleForm.model}
            onChangeText={(value) => onVehicleChange('model', value)}
          />
          {fieldErrors.model ? <Text style={styles.errorText}>{fieldErrors.model}</Text> : null}

          <Text style={styles.fieldLabel}>Year</Text>
          <TextInput
            style={styles.input}
            placeholder="Year"
            keyboardType="number-pad"
            value={vehicleForm.year}
            onChangeText={(value) => onVehicleChange('year', value)}
          />
          {fieldErrors.year ? <Text style={styles.errorText}>{fieldErrors.year}</Text> : null}

          <Text style={styles.fieldLabel}>Plate number</Text>
          <TextInput
            style={styles.input}
            placeholder="Plate number"
            value={vehicleForm.plateNumber}
            onChangeText={(value) => onVehicleChange('plateNumber', value)}
          />
          {fieldErrors.plateNumber ? (
            <Text style={styles.errorText}>{fieldErrors.plateNumber}</Text>
          ) : null}

          <Text style={styles.fieldLabel}>Vehicle condition</Text>
          <View style={styles.optionWrap}>
            {VEHICLE_CONDITION_OPTIONS.map((option) => {
              const selected = vehicleForm.condition === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.optionChip, selected && styles.optionChipSelected]}
                  onPress={() => onVehicleChange('condition', option.value)}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {fieldErrors.condition ? (
            <Text style={styles.errorText}>{fieldErrors.condition}</Text>
          ) : null}

          <Text style={styles.fieldLabel}>Color</Text>
          <TextInput
            style={styles.input}
            placeholder="Color"
            value={vehicleForm.color}
            onChangeText={(value) => onVehicleChange('color', value)}
          />

          <Text style={styles.fieldLabel}>Capacity (kg)</Text>
          <TextInput
            style={styles.input}
            placeholder="Capacity (kg)"
            keyboardType="decimal-pad"
            value={vehicleForm.capacityKg}
            onChangeText={(value) => onVehicleChange('capacityKg', value)}
          />

          <Text style={styles.fieldLabel}>Length (cm)</Text>
          <TextInput
            style={styles.input}
            placeholder="Length (cm)"
            keyboardType="decimal-pad"
            value={vehicleForm.lengthCm}
            onChangeText={(value) => onVehicleChange('lengthCm', value)}
          />

          <Text style={styles.fieldLabel}>Width (cm)</Text>
          <TextInput
            style={styles.input}
            placeholder="Width (cm)"
            keyboardType="decimal-pad"
            value={vehicleForm.widthCm}
            onChangeText={(value) => onVehicleChange('widthCm', value)}
          />

          <Text style={styles.fieldLabel}>Height (cm)</Text>
          <TextInput
            style={styles.input}
            placeholder="Height (cm)"
            keyboardType="decimal-pad"
            value={vehicleForm.heightCm}
            onChangeText={(value) => onVehicleChange('heightCm', value)}
          />

          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>Has trailer</Text>
            <Switch
              value={vehicleForm.hasTrailer}
              onValueChange={(value) => onVehicleChange('hasTrailer', value)}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vehicle Photos</Text>
          {renderUploadCard(
            'Front photo',
            'Upload the front photo of the vehicle.',
            'FRONT',
            uploads.frontPhoto,
            'frontPhoto',
          )}
          {renderUploadCard(
            'Rear photo',
            'Upload the rear photo of the vehicle.',
            'REAR',
            uploads.rearPhoto,
            'rearPhoto',
          )}
          {renderUploadCard(
            'Side photo',
            'Upload the side photo of the vehicle.',
            'SIDE',
            uploads.sidePhoto,
            'sidePhoto',
          )}
          {renderUploadCard(
            'Plate photo',
            'Upload a clear photo of the plate number.',
            'PLATE',
            uploads.licensePlatePhoto,
            'licensePlatePhoto',
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vehicle Documents</Text>
          {renderDocumentCard(
            'Registration front side',
            'Upload the registration document/card front side.',
            'REGISTRATION_FRONT',
            uploads.registrationFrontDocument,
            'registrationFrontDocument',
          )}
          {renderDocumentCard(
            'Registration back side',
            'Upload the registration document/card back side.',
            'REGISTRATION_BACK',
            uploads.registrationBackDocument,
            'registrationBackDocument',
          )}
          {renderDocumentCard(
            'Insurance document',
            'Upload a valid insurance document.',
            'INSURANCE',
            uploads.insuranceDocument,
            'insuranceDocument',
          )}
        </View>

        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
        {submitSuccess ? <Text style={styles.successText}>{submitSuccess}</Text> : null}

        <Pressable
          style={[styles.saveButton, (!isFormValid || isBusy) && styles.buttonDisabled]}
          disabled={!isFormValid || isBusy}
          onPress={() => void onSaveVehicle()}
        >
          {isSavingVehicle ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Save Vehicle</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  function renderUploadCard(
    label: string,
    description: string,
    _type: DriverVehiclePhotoType,
    asset: LocalDocumentAsset | undefined,
    key: keyof VehicleUploadForm,
  ): React.ReactNode {
    return (
      <View style={styles.uploadCard}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.helper}>{description}</Text>
        {asset ? <Image source={{ uri: asset.uri }} style={styles.preview} /> : null}
        {asset?.fileName ? <Text style={styles.fileName}>{asset.fileName}</Text> : null}
        <Pressable
          style={styles.uploadButton}
          disabled={isBusy}
          onPress={() => chooseImageSource(key, label)}
        >
          <Text style={styles.uploadButtonText}>{asset ? 'Replace' : 'Add'}</Text>
        </Pressable>
        {fieldErrors[key] ? <Text style={styles.errorText}>{fieldErrors[key]}</Text> : null}
      </View>
    );
  }

  function renderDocumentCard(
    label: string,
    description: string,
    _type: DriverVehicleDocumentType,
    asset: LocalDocumentAsset | undefined,
    key: keyof VehicleUploadForm,
  ): React.ReactNode {
    return renderUploadCard(label, description, 'FRONT', asset, key);
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  content: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
    paddingBottom: 32,
  },
  header: { gap: 4 },
  progress: { color: '#1D4ED8', fontWeight: '700', fontSize: 13 },
  title: { fontSize: 28, fontWeight: '700', color: '#0F172A' },
  subtitle: { color: '#475569', fontSize: 14 },
  helper: { color: '#64748B', fontSize: 13 },
  section: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  fieldLabel: { color: '#334155', fontSize: 13, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: '#0F172A',
  },
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  optionChipSelected: { borderColor: '#1D4ED8', backgroundColor: '#DBEAFE' },
  optionText: { color: '#334155', fontSize: 12 },
  optionTextSelected: { color: '#1D4ED8', fontWeight: '700' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  uploadCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
    gap: 6,
  },
  preview: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
  },
  fileName: { color: '#475569', fontSize: 12 },
  uploadButton: {
    minHeight: 40,
    borderRadius: 8,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadButtonText: { color: '#FFFFFF', fontWeight: '700' },
  saveButton: {
    minHeight: 50,
    borderRadius: 10,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  buttonDisabled: { opacity: 0.5 },
  errorText: { color: '#DC2626', fontSize: 12 },
  successText: { color: '#15803D', fontSize: 12 },
});
