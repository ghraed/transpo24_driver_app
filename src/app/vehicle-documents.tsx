import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
  createDriverVehicle,
  getDriverVehicles,
  uploadDriverVehicleDocuments,
} from '@/lib/api';
import { useAuth } from '@/context/auth-context';
import { getDriverRouteForNextStep } from '@/lib/driver-onboarding';
import type {
  CreateDriverVehiclePayload,
  DriverDocument,
  DriverDocumentType,
  DriverDocumentsForm,
  DriverVehicle,
  DriverVehicleForm,
  LocalDocumentAsset,
  VehicleType,
} from '@/types/auth';

const MAX_VEHICLE_PHOTOS = 8;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const DOCUMENT_ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);
const PHOTO_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const REQUIRED_SINGLE_DOCUMENT_TYPES: DriverDocumentType[] = [
  'DRIVER_LICENSE_FRONT',
  'DRIVER_LICENSE_BACK',
  'IDENTITY_DOCUMENT',
  'VEHICLE_REGISTRATION',
  'VEHICLE_INSURANCE',
];

const VEHICLE_TYPE_OPTIONS: { label: string; value: VehicleType }[] = [
  { label: 'Car carrier', value: 'CAR_CARRIER' },
  { label: 'Flatbed truck', value: 'FLATBED_TRUCK' },
  { label: 'Tow truck', value: 'TOW_TRUCK' },
  { label: 'Van', value: 'VAN' },
  { label: 'Box truck', value: 'BOX_TRUCK' },
  { label: 'Pickup truck', value: 'PICKUP_TRUCK' },
  { label: 'Motorcycle trailer', value: 'MOTORCYCLE_TRAILER' },
  { label: 'Furniture truck', value: 'FURNITURE_TRUCK' },
  { label: 'Other', value: 'OTHER' },
];

function parsePositiveNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function toAssetFromDocumentPicker(
  asset: DocumentPicker.DocumentPickerAsset,
): LocalDocumentAsset {
  return {
    uri: asset.uri,
    fileName: asset.name,
    mimeType: asset.mimeType ?? undefined,
    fileSize: asset.size ?? undefined,
  };
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

function isRejectedDocument(document: DriverDocument): boolean {
  return document.status === 'REJECTED';
}

function hasExistingDocument(
  documents: DriverDocument[] | undefined,
  type: DriverDocumentType,
): boolean {
  return Boolean(documents?.some((doc) => doc.type === type && !isRejectedDocument(doc)));
}

function countExistingVehiclePhotos(documents: DriverDocument[] | undefined): number {
  return (
    documents?.filter(
      (doc) => doc.type === 'VEHICLE_PHOTO' && !isRejectedDocument(doc),
    ).length ?? 0
  );
}

export default function VehicleDocumentsScreen() {
  const router = useRouter();
  const { signOut } = useAuth();

  const [vehicleForm, setVehicleForm] = useState<DriverVehicleForm>({
    vehicleType: '',
    make: '',
    model: '',
    year: '',
    plateNumber: '',
    color: '',
    capacityKg: '',
    lengthCm: '',
    widthCm: '',
    heightCm: '',
    hasTrailer: false,
  });

  const [documentsForm, setDocumentsForm] = useState<DriverDocumentsForm>({
    vehiclePhotos: [],
  });

  const [existingVehicle, setExistingVehicle] = useState<DriverVehicle | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSavingVehicle, setIsSavingVehicle] = useState<boolean>(false);
  const [isUploadingDocuments, setIsUploadingDocuments] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>('');
  const [submitError, setSubmitError] = useState<string>('');

  const isBusy = isSavingVehicle || isUploadingDocuments;

  const loadExistingVehicles = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setLoadError('');

    try {
      const vehicles = await getDriverVehicles();
      if (vehicles.length > 0) {
        const first = vehicles[0];
        setExistingVehicle(first);
        setVehicleForm((prev) => ({
          ...prev,
          vehicleType: first.vehicleType,
          make: first.make,
          model: first.model,
          year: String(first.year),
          plateNumber: first.plateNumber,
          color: first.color ?? '',
          capacityKg: first.capacityKg ? String(first.capacityKg) : '',
          lengthCm: first.lengthCm ? String(first.lengthCm) : '',
          widthCm: first.widthCm ? String(first.widthCm) : '',
          heightCm: first.heightCm ? String(first.heightCm) : '',
          hasTrailer: first.hasTrailer,
        }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load vehicles.';
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadExistingVehicles();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadExistingVehicles]);

  const fieldErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    const currentYear = new Date().getFullYear();

    if (!vehicleForm.vehicleType) errors.vehicleType = 'Vehicle type is required.';
    if (!vehicleForm.make.trim() || vehicleForm.make.trim().length < 2) errors.make = 'Make is required (min 2 chars).';
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

    if (!vehicleForm.plateNumber.trim()) errors.plateNumber = 'Plate number is required.';

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

    const existingDocs = existingVehicle?.documents;
    const hasAllRequiredExistingDocuments = REQUIRED_SINGLE_DOCUMENT_TYPES.every((type) =>
      hasExistingDocument(existingDocs, type),
    );
    const existingVehiclePhotos = countExistingVehiclePhotos(existingDocs);
    const existingStepAlreadyComplete =
      hasAllRequiredExistingDocuments && existingVehiclePhotos >= 1;

    if (!existingStepAlreadyComplete && !documentsForm.driverLicenseFront) {
      errors.driverLicenseFront = 'Driver license front is required.';
    }
    if (!existingStepAlreadyComplete && !documentsForm.driverLicenseBack) {
      errors.driverLicenseBack = 'Driver license back is required.';
    }
    if (!existingStepAlreadyComplete && !documentsForm.identityDocument) {
      errors.identityDocument = 'Identity document is required.';
    }
    if (!existingStepAlreadyComplete && !documentsForm.vehicleRegistration) {
      errors.vehicleRegistration = 'Vehicle registration is required.';
    }
    if (!existingStepAlreadyComplete && !documentsForm.vehicleInsurance) {
      errors.vehicleInsurance = 'Vehicle insurance is required.';
    }

    const totalVehiclePhotos = existingStepAlreadyComplete
      ? existingVehiclePhotos + documentsForm.vehiclePhotos.length
      : documentsForm.vehiclePhotos.length;

    if (!existingStepAlreadyComplete && totalVehiclePhotos === 0) {
      errors.vehiclePhotos = 'At least one vehicle photo is required.';
    } else if (totalVehiclePhotos > MAX_VEHICLE_PHOTOS) {
      errors.vehiclePhotos = `Maximum ${MAX_VEHICLE_PHOTOS} vehicle photos allowed.`;
    }

    const validateDocumentFile = (
      asset: LocalDocumentAsset | undefined,
      fieldKey: string,
      label: string,
    ): void => {
      if (!asset) return;
      const mime = asset.mimeType ?? '';
      if (!DOCUMENT_ALLOWED_TYPES.has(mime)) {
        errors[fieldKey] = `${label} must be PDF, JPEG, PNG, or WEBP.`;
        return;
      }
      if (mime === 'application/pdf') {
        if (asset.fileSize && asset.fileSize > MAX_PDF_BYTES) {
          errors[fieldKey] = `${label} PDF must be 10 MB or smaller.`;
        }
      } else if (asset.fileSize && asset.fileSize > MAX_IMAGE_BYTES) {
        errors[fieldKey] = `${label} image must be 5 MB or smaller.`;
      }
    };

    validateDocumentFile(documentsForm.driverLicenseFront, 'driverLicenseFront', 'Driver license front');
    validateDocumentFile(documentsForm.driverLicenseBack, 'driverLicenseBack', 'Driver license back');
    validateDocumentFile(documentsForm.identityDocument, 'identityDocument', 'Identity document');
    validateDocumentFile(documentsForm.vehicleRegistration, 'vehicleRegistration', 'Vehicle registration');
    validateDocumentFile(documentsForm.vehicleInsurance, 'vehicleInsurance', 'Vehicle insurance');

    documentsForm.vehiclePhotos.forEach((photo, index) => {
      const mime = photo.mimeType ?? '';
      if (!PHOTO_ALLOWED_TYPES.has(mime)) {
        errors.vehiclePhotos = `Vehicle photo ${index + 1} must be JPEG, PNG, or WEBP.`;
        return;
      }
      if (photo.fileSize && photo.fileSize > MAX_IMAGE_BYTES) {
        errors.vehiclePhotos = `Vehicle photo ${index + 1} must be 5 MB or smaller.`;
      }
    });

    return errors;
  }, [documentsForm, existingVehicle, vehicleForm]);

  const isFormValid = Object.keys(fieldErrors).length === 0;

  const onVehicleChange = <K extends keyof DriverVehicleForm>(key: K, value: DriverVehicleForm[K]): void => {
    setVehicleForm((prev) => ({ ...prev, [key]: value }));
  };

  const setDocument = (key: Exclude<keyof DriverDocumentsForm, 'vehiclePhotos'>, value?: LocalDocumentAsset): void => {
    setDocumentsForm((prev) => ({ ...prev, [key]: value }));
  };

  const pickDocument = async (key: Exclude<keyof DriverDocumentsForm, 'vehiclePhotos'>): Promise<void> => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    setDocument(key, toAssetFromDocumentPicker(asset));
  };

  const pickVehiclePhotos = async (): Promise<void> => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
      setSubmitError('Media library permission is required to pick vehicle photos.');
      return;
    }

    const remainingSlots = MAX_VEHICLE_PHOTOS - documentsForm.vehiclePhotos.length;
    if (remainingSlots <= 0) {
      setSubmitError(`You can upload up to ${MAX_VEHICLE_PHOTOS} vehicle photos.`);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remainingSlots,
      quality: 0.9,
    });

    if (result.canceled) return;

    const selected = result.assets.map(toAssetFromImagePicker);
    setDocumentsForm((prev) => ({
      ...prev,
      vehiclePhotos: [...prev.vehiclePhotos, ...selected].slice(0, MAX_VEHICLE_PHOTOS),
    }));
  };

  const removeVehiclePhoto = (index: number): void => {
    setDocumentsForm((prev) => ({
      ...prev,
      vehiclePhotos: prev.vehiclePhotos.filter((_, i) => i !== index),
    }));
  };

  const onContinue = async (): Promise<void> => {
    if (!isFormValid || isBusy) return;

    setSubmitError('');

    const payload: CreateDriverVehiclePayload = {
      vehicleType: vehicleForm.vehicleType as VehicleType,
      make: vehicleForm.make.trim(),
      model: vehicleForm.model.trim(),
      year: Number(vehicleForm.year),
      plateNumber: vehicleForm.plateNumber.trim(),
      color: vehicleForm.color.trim() || undefined,
      capacityKg: parsePositiveNumber(vehicleForm.capacityKg),
      lengthCm: parsePositiveNumber(vehicleForm.lengthCm),
      widthCm: parsePositiveNumber(vehicleForm.widthCm),
      heightCm: parsePositiveNumber(vehicleForm.heightCm),
      hasTrailer: vehicleForm.hasTrailer,
    };

    let targetVehicleId = existingVehicle?.id;

    if (!targetVehicleId) {
      setIsSavingVehicle(true);
      try {
        const createdVehicle = await createDriverVehicle(payload);
        targetVehicleId = createdVehicle.id;
        setExistingVehicle(createdVehicle);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to save vehicle.';
        const normalized = message.toLowerCase();

        if (normalized.includes('profile must be completed')) {
          setSubmitError('Complete your profile first. Redirecting...');
          setTimeout(() => {
            router.replace('/complete-profile');
          }, 700);
          return;
        }

        if (normalized.includes('plate')) {
          setSubmitError('Plate number is already in use.');
          return;
        }

        if (
          normalized.includes('invalid or expired token') ||
          normalized.includes('authorization') ||
          normalized.includes('unauthorized')
        ) {
          await signOut();
          router.replace('/');
          return;
        }

        setSubmitError(message);
        return;
      } finally {
        setIsSavingVehicle(false);
      }
    }

    if (!targetVehicleId) {
      setSubmitError('Failed to determine vehicle for document upload. Please retry.');
      return;
    }

    const existingDocs = existingVehicle?.documents ?? [];
    const hasAllRequiredExistingDocuments = REQUIRED_SINGLE_DOCUMENT_TYPES.every((type) =>
      hasExistingDocument(existingDocs, type),
    );
    const existingVehiclePhotos = countExistingVehiclePhotos(existingDocs);
    const totalVehiclePhotos = existingVehiclePhotos + documentsForm.vehiclePhotos.length;
    const hasAnyNewUploads =
      Boolean(documentsForm.driverLicenseFront) ||
      Boolean(documentsForm.driverLicenseBack) ||
      Boolean(documentsForm.identityDocument) ||
      Boolean(documentsForm.vehicleRegistration) ||
      Boolean(documentsForm.vehicleInsurance) ||
      documentsForm.vehiclePhotos.length > 0;

    if (hasAllRequiredExistingDocuments && totalVehiclePhotos >= 1 && !hasAnyNewUploads) {
      router.replace('/set-availability');
      return;
    }

    setIsUploadingDocuments(true);

    try {
      const response = await uploadDriverVehicleDocuments(targetVehicleId, {
        driverLicenseFront: documentsForm.driverLicenseFront!,
        driverLicenseBack: documentsForm.driverLicenseBack!,
        identityDocument: documentsForm.identityDocument!,
        vehicleRegistration: documentsForm.vehicleRegistration!,
        vehicleInsurance: documentsForm.vehicleInsurance!,
        vehiclePhotos: documentsForm.vehiclePhotos,
      });

      if (
        response.nextStep === 'ADD_VEHICLE_DOCUMENTS' ||
        response.nextStep === 'UPLOAD_DOCUMENTS'
      ) {
        setSubmitError('Some required documents are still missing. Please review uploads.');
        return;
      }

      router.replace(getDriverRouteForNextStep(response.nextStep));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload documents.';
      const normalized = message.toLowerCase();

      if (
        normalized.includes('invalid or expired token') ||
        normalized.includes('authorization') ||
        normalized.includes('unauthorized')
      ) {
        await signOut();
        router.replace('/');
        return;
      }

      if (normalized.includes('profile must be completed')) {
        setSubmitError('Complete your profile first. Redirecting...');
        setTimeout(() => {
          router.replace('/complete-profile');
        }, 700);
        return;
      }

      setSubmitError(message);
    } finally {
      setIsUploadingDocuments(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1D4ED8" />
        <Text style={styles.loadingText}>Loading vehicle setup...</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>{loadError}</Text>
        <Pressable style={styles.retryButton} onPress={() => void loadExistingVehicles()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.progress}>Step 2 of 3: Vehicle & Documents</Text>
          <Text style={styles.title}>Add Vehicle & Documents</Text>
          <Text style={styles.subtitle}>
            Tell us about your vehicle and upload the documents needed for verification.
          </Text>
          <Text style={styles.helper}>Clear documents help us verify your driver account faster.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vehicle Information</Text>
          <Text style={styles.requiredLabel}>Required fields are marked *</Text>

          <Text style={styles.fieldLabel}>Vehicle type *</Text>
          <View style={styles.optionWrap}>
            {VEHICLE_TYPE_OPTIONS.map((option) => {
              const selected = vehicleForm.vehicleType === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.optionChip, selected && styles.optionChipSelected]}
                  onPress={() => onVehicleChange('vehicleType', option.value)}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {fieldErrors.vehicleType ? <Text style={styles.errorText}>{fieldErrors.vehicleType}</Text> : null}

          <TextInput style={styles.input} placeholder="Make *" value={vehicleForm.make} onChangeText={(value) => onVehicleChange('make', value)} />
          {fieldErrors.make ? <Text style={styles.errorText}>{fieldErrors.make}</Text> : null}

          <TextInput style={styles.input} placeholder="Model *" value={vehicleForm.model} onChangeText={(value) => onVehicleChange('model', value)} />
          {fieldErrors.model ? <Text style={styles.errorText}>{fieldErrors.model}</Text> : null}

          <TextInput style={styles.input} placeholder="Year *" keyboardType="number-pad" value={vehicleForm.year} onChangeText={(value) => onVehicleChange('year', value)} />
          {fieldErrors.year ? <Text style={styles.errorText}>{fieldErrors.year}</Text> : null}

          <TextInput style={styles.input} placeholder="Plate number *" value={vehicleForm.plateNumber} onChangeText={(value) => onVehicleChange('plateNumber', value)} />
          {fieldErrors.plateNumber ? <Text style={styles.errorText}>{fieldErrors.plateNumber}</Text> : null}

          <TextInput style={styles.input} placeholder="Color" value={vehicleForm.color} onChangeText={(value) => onVehicleChange('color', value)} />
          <TextInput style={styles.input} placeholder="Capacity (kg)" keyboardType="decimal-pad" value={vehicleForm.capacityKg} onChangeText={(value) => onVehicleChange('capacityKg', value)} />
          {fieldErrors.capacityKg ? <Text style={styles.errorText}>{fieldErrors.capacityKg}</Text> : null}

          <TextInput style={styles.input} placeholder="Length (cm)" keyboardType="decimal-pad" value={vehicleForm.lengthCm} onChangeText={(value) => onVehicleChange('lengthCm', value)} />
          {fieldErrors.lengthCm ? <Text style={styles.errorText}>{fieldErrors.lengthCm}</Text> : null}

          <TextInput style={styles.input} placeholder="Width (cm)" keyboardType="decimal-pad" value={vehicleForm.widthCm} onChangeText={(value) => onVehicleChange('widthCm', value)} />
          {fieldErrors.widthCm ? <Text style={styles.errorText}>{fieldErrors.widthCm}</Text> : null}

          <TextInput style={styles.input} placeholder="Height (cm)" keyboardType="decimal-pad" value={vehicleForm.heightCm} onChangeText={(value) => onVehicleChange('heightCm', value)} />
          {fieldErrors.heightCm ? <Text style={styles.errorText}>{fieldErrors.heightCm}</Text> : null}

          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>Has trailer *</Text>
            <Switch value={vehicleForm.hasTrailer} onValueChange={(value) => onVehicleChange('hasTrailer', value)} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Driver Documents</Text>
          {renderDocumentPicker('Driver license front *', documentsForm.driverLicenseFront, () => void pickDocument('driverLicenseFront'), () => setDocument('driverLicenseFront', undefined))}
          {fieldErrors.driverLicenseFront ? <Text style={styles.errorText}>{fieldErrors.driverLicenseFront}</Text> : null}

          {renderDocumentPicker('Driver license back *', documentsForm.driverLicenseBack, () => void pickDocument('driverLicenseBack'), () => setDocument('driverLicenseBack', undefined))}
          {fieldErrors.driverLicenseBack ? <Text style={styles.errorText}>{fieldErrors.driverLicenseBack}</Text> : null}

          {renderDocumentPicker('Identity document *', documentsForm.identityDocument, () => void pickDocument('identityDocument'), () => setDocument('identityDocument', undefined))}
          {fieldErrors.identityDocument ? <Text style={styles.errorText}>{fieldErrors.identityDocument}</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vehicle Documents</Text>
          {renderDocumentPicker('Vehicle registration *', documentsForm.vehicleRegistration, () => void pickDocument('vehicleRegistration'), () => setDocument('vehicleRegistration', undefined))}
          {fieldErrors.vehicleRegistration ? <Text style={styles.errorText}>{fieldErrors.vehicleRegistration}</Text> : null}

          {renderDocumentPicker('Vehicle insurance *', documentsForm.vehicleInsurance, () => void pickDocument('vehicleInsurance'), () => setDocument('vehicleInsurance', undefined))}
          {fieldErrors.vehicleInsurance ? <Text style={styles.errorText}>{fieldErrors.vehicleInsurance}</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vehicle Photos</Text>
          <Text style={styles.helper}>Upload at least 1 photo, maximum 8.</Text>
          <Pressable style={styles.uploadButton} onPress={() => void pickVehiclePhotos()}>
            <Text style={styles.uploadButtonText}>Add Vehicle Photos</Text>
          </Pressable>
          <Text style={styles.counterText}>{documentsForm.vehiclePhotos.length} / {MAX_VEHICLE_PHOTOS}</Text>

          <View style={styles.photosGrid}>
            {documentsForm.vehiclePhotos.map((photo, index) => (
              <View key={`${photo.uri}-${index}`} style={styles.photoCard}>
                <Image source={{ uri: photo.uri }} style={styles.photoThumb} />
                <Pressable style={styles.removePhotoButton} onPress={() => removeVehiclePhoto(index)}>
                  <Text style={styles.removePhotoButtonText}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
          {fieldErrors.vehiclePhotos ? <Text style={styles.errorText}>{fieldErrors.vehiclePhotos}</Text> : null}
        </View>

        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

        <Pressable
          style={[styles.continueButton, (!isFormValid || isBusy) && styles.continueButtonDisabled]}
          disabled={!isFormValid || isBusy}
          onPress={() => void onContinue()}
        >
          {isBusy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.continueButtonText}>Continue to Set Availability</Text>
          )}
        </Pressable>

        {isSavingVehicle ? <Text style={styles.statusText}>Saving vehicle...</Text> : null}
        {isUploadingDocuments ? <Text style={styles.statusText}>Uploading documents...</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );

  function renderDocumentPicker(
    label: string,
    asset: LocalDocumentAsset | undefined,
    onPick: () => void,
    onRemove: () => void,
  ): React.ReactNode {
    return (
      <View style={styles.docRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {asset ? <Text style={styles.fileName}>{asset.fileName ?? 'Selected file'}</Text> : null}
        <View style={styles.docButtonsRow}>
          <Pressable style={styles.uploadButtonSmall} onPress={onPick}>
            <Text style={styles.uploadButtonText}>{asset ? 'Replace' : 'Upload'}</Text>
          </Pressable>
          {asset ? (
            <Pressable style={styles.removeButtonSmall} onPress={onRemove}>
              <Text style={styles.removeButtonText}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    padding: 20,
    gap: 10,
  },
  loadingText: { color: '#475569' },
  content: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 10,
    paddingBottom: 30,
  },
  header: { gap: 4, marginBottom: 4 },
  progress: { color: '#1D4ED8', fontWeight: '700', fontSize: 13 },
  title: { fontSize: 27, fontWeight: '700', color: '#0F172A' },
  subtitle: { color: '#475569', fontSize: 14 },
  helper: { color: '#64748B', fontSize: 13 },
  section: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  requiredLabel: { color: '#64748B', fontSize: 12 },
  fieldLabel: { color: '#334155', fontSize: 13, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
  },
  errorText: { color: '#DC2626', fontSize: 12 },
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
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  docRow: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
    gap: 6,
  },
  fileName: { color: '#475569', fontSize: 12 },
  docButtonsRow: { flexDirection: 'row', gap: 8 },
  uploadButton: {
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  uploadButtonSmall: {
    flex: 1,
    minHeight: 38,
    borderRadius: 8,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  removeButtonSmall: {
    flex: 1,
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E11D48',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  removeButtonText: { color: '#E11D48', fontWeight: '700', fontSize: 13 },
  counterText: { color: '#64748B', fontSize: 12 },
  photosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoCard: {
    width: '31%',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 6,
    gap: 6,
  },
  photoThumb: { width: '100%', height: 72, borderRadius: 6, backgroundColor: '#E2E8F0' },
  removePhotoButton: {
    minHeight: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E11D48',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePhotoButtonText: { color: '#E11D48', fontSize: 11, fontWeight: '700' },
  continueButton: {
    marginTop: 4,
    minHeight: 50,
    borderRadius: 10,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonDisabled: { opacity: 0.5 },
  continueButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  statusText: { textAlign: 'center', color: '#475569', fontSize: 12 },
  retryButton: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  retryButtonText: { color: '#FFFFFF', fontWeight: '700' },
});
