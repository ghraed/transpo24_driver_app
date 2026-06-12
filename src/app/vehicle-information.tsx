import ExpoDateTimePicker from '@expo/ui/community/datetime-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/context/auth-context';
import {
  createDriverVehicle,
  getDriverVehicle,
  updateDriverVehicle,
  uploadDriverVehicleDocuments,
} from '@/lib/api';
import type {
  CreateDriverVehicleForm,
  CreateDriverVehiclePayload,
  DriverNextStep,
  DriverVehicle,
  DriverVehicleDocumentsResponse,
  LocalDocumentAsset,
  VehicleCondition,
  VehicleType,
} from '@/types/auth';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const IMAGE_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DOCUMENT_ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const VEHICLE_TYPE_OPTIONS: { label: string; value: VehicleType }[] = [
  { label: 'Open car carrier / open flatbed', value: 'OPEN_CAR_CARRIER' },
  { label: 'Enclosed carrier', value: 'ENCLOSED_CARRIER' },
  { label: 'Small Truck', value: 'SMALL_TRUCK' },
  { label: 'Medium Truck', value: 'MEDIUM_TRUCK' },
  { label: 'Pickup', value: 'PICKUP' },
  { label: 'Van', value: 'VAN' },
  { label: 'Tow Truck', value: 'TOW_TRUCK' },
  { label: 'Motorcycle', value: 'MOTORCYCLE' },
];

const VEHICLE_CONDITION_OPTIONS: { label: string; value: VehicleCondition }[] = [
  { label: 'Excellent', value: 'EXCELLENT' },
  { label: 'Good', value: 'GOOD' },
  { label: 'Needs Maintenance', value: 'NEEDS_MAINTENANCE' },
];

const OTHER_OPTION = 'OTHER';

const VEHICLE_BRAND_OPTIONS = [
  'Toyota',
  'Nissan',
  'Ford',
  'Chevrolet',
  'GMC',
  'RAM',
  'Isuzu',
  'Mitsubishi',
  'Hyundai',
  'Kia',
  'Mercedes-Benz',
  'BMW',
  'Audi',
  'Volkswagen',
  'Volvo',
  'Scania',
  'MAN',
  'DAF',
  'Iveco',
  'Hino',
  'Fuso',
  'Tata',
  'Mahindra',
  'Peugeot',
  'Renault',
  'Suzuki',
  'Honda',
  'Yamaha',
  'Harley-Davidson',
  'Ducati',
];

const VEHICLE_MODELS_BY_BRAND: Record<string, string[]> = {
  Toyota: ['Hilux', 'HiAce', 'Land Cruiser', 'Coaster', 'Dyna'],
  Nissan: ['Navara', 'Urvan', 'Patrol', 'Cabstar', 'Titan'],
  Ford: ['F-150', 'Ranger', 'Transit', 'Super Duty', 'Maverick'],
  Chevrolet: ['Silverado', 'Colorado', 'Express', 'S10', 'Tahoe'],
  GMC: ['Sierra', 'Canyon', 'Savana', 'Yukon', 'TopKick'],
  RAM: ['1500', '2500', '3500', 'ProMaster', 'Dakota'],
  Isuzu: ['D-Max', 'N-Series', 'F-Series', 'MU-X', 'Elf'],
  Mitsubishi: ['L200', 'Canter', 'Fuso', 'Pajero', 'Outlander'],
  Hyundai: ['H-1', 'Staria', 'Porter', 'Mighty', 'Santa Fe'],
  Kia: ['K2700', 'Bongo', 'Carnival', 'Sorento', 'Mohave'],
  'Mercedes-Benz': ['Sprinter', 'Actros', 'Atego', 'Vito', 'G-Class'],
  BMW: ['X5', 'X3', '3 Series', '5 Series', 'X7'],
  Audi: ['Q7', 'Q5', 'A6', 'A4', 'Q8'],
  Volkswagen: ['Transporter', 'Crafter', 'Amarok', 'Caddy', 'Tiguan'],
  Volvo: ['FH', 'FM', 'XC90', 'XC60', 'FL'],
  Scania: ['R-Series', 'S-Series', 'P-Series', 'G-Series', 'L-Series'],
  MAN: ['TGX', 'TGS', 'TGM', 'TGL', 'Lion'],
  DAF: ['XF', 'CF', 'LF', 'XG', 'XD'],
  Iveco: ['Daily', 'Eurocargo', 'S-Way', 'Trakker', 'Massif'],
  Hino: ['300', '500', '700', 'Dutro', 'Ranger'],
  Fuso: ['Canter', 'Super Great', 'Fighter', 'Rosa', 'Aero Star'],
  Tata: ['Xenon', 'Prima', 'Ultra', 'Yodha', 'Ace'],
  Mahindra: ['Bolero Pickup', 'Scorpio', 'Jeeto', 'Supro', 'Pik-Up'],
  Peugeot: ['Boxer', 'Partner', 'Expert', 'Landtrek', 'Traveller'],
  Renault: ['Master', 'Trafic', 'Kangoo', 'Alaskan', 'Duster'],
  Suzuki: ['Carry', 'Jimny', 'Vitara', 'Eeco', 'Super Carry'],
  Honda: ['Ridgeline', 'CR-V', 'Pilot', 'Civic', 'Accord'],
  Yamaha: ['YZF-R3', 'MT-07', 'Tenere 700', 'NMAX', 'XMAX'],
  'Harley-Davidson': ['Street Glide', 'Road King', 'Sportster', 'Fat Boy', 'Pan America'],
  Ducati: ['Multistrada', 'Monster', 'Diavel', 'Scrambler', 'Hypermotard'],
};

const EMPTY_FORM: CreateDriverVehicleForm = {
  vehicleType: '',
  brand: '',
  model: '',
  year: '',
  licensePlateNumber: '',
  condition: '',
  insuranceExpiryDate: '',
  registrationExpiryDate: '',
};

type DateFieldKey = 'insuranceExpiryDate' | 'registrationExpiryDate';
type SelectorField = 'vehicleType' | 'brand' | 'model' | 'condition' | 'year';

interface SelectorOption {
  label: string;
  value: string;
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

function formatDate(value: string): string {
  if (!value) return 'Select date';
  return value;
}

function readAssetLabel(asset?: LocalDocumentAsset, fallback?: string | null): string {
  if (asset?.fileName?.trim()) return asset.fileName;
  if (fallback) {
    const withoutQuery = fallback.split('?')[0] ?? fallback;
    const filename = withoutQuery.split('/').filter(Boolean).pop();
    if (filename) {
      try {
        return decodeURIComponent(filename);
      } catch {
        return filename;
      }
    }
    return 'Uploaded file';
  }
  return 'No file selected';
}

function isPdfFile(asset?: LocalDocumentAsset, remoteUrl?: string | null): boolean {
  if (asset?.mimeType === 'application/pdf') return true;
  if (remoteUrl?.toLowerCase().includes('.pdf')) return true;
  return false;
}

function normalizeDateValue(value: string): Date {
  if (!value) return new Date();
  return new Date(value);
}

function formatSelectorLabel(value: string, options: SelectorOption[]): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function nextStepToRoute(nextStep: DriverNextStep): '/vehicle-documents' | '/my-vehicles' | '/set-availability' | '/waiting-approval' | '/driver-home' {
  switch (nextStep) {
    case 'ADD_VEHICLE_DOCUMENTS':
      return '/my-vehicles';
    case 'SET_AVAILABILITY':
      return '/set-availability';
    case 'WAITING_APPROVAL':
      return '/waiting-approval';
    case 'HOME':
      return '/driver-home';
    case 'COMPLETE_PROFILE':
      return '/vehicle-documents';
  }
}

export default function VehicleInformationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ vehicleId?: string; flow?: string }>();
  const vehicleId =
    typeof params.vehicleId === 'string' && params.vehicleId.trim() ? params.vehicleId : undefined;
  const flow = params.flow === 'management' ? 'management' : 'onboarding';
  const { signOut } = useAuth();

  const [vehicleForm, setVehicleForm] = useState<CreateDriverVehicleForm>(EMPTY_FORM);
  const [existingVehicle, setExistingVehicle] = useState<DriverVehicle | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(vehicleId));
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>('');
  const [submitError, setSubmitError] = useState<string>('');
  const [submitSuccess, setSubmitSuccess] = useState<string>('');
  const [activeDateField, setActiveDateField] = useState<DateFieldKey | null>(null);
  const [activeSelectorField, setActiveSelectorField] = useState<SelectorField | null>(null);
  const [selectorSearch, setSelectorSearch] = useState<string>('');
  const [brandOtherValue, setBrandOtherValue] = useState<string>('');
  const [modelOtherValue, setModelOtherValue] = useState<string>('');
  const [brandSelection, setBrandSelection] = useState<string>('');
  const [modelSelection, setModelSelection] = useState<string>('');

  const isEditing = Boolean(vehicleId);

  const loadVehicle = useCallback(async (): Promise<void> => {
    if (!vehicleId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError('');

    try {
      const vehicle = await getDriverVehicle(vehicleId);
      setExistingVehicle(vehicle);
      setVehicleForm({
        vehicleType: vehicle.vehicleType,
        brand: vehicle.brand,
        model: vehicle.model,
        year: String(vehicle.year),
        licensePlateNumber: vehicle.licensePlateNumber,
        condition: vehicle.condition,
        insuranceExpiryDate: vehicle.insuranceExpiryDate?.slice(0, 10) ?? '',
        registrationExpiryDate: vehicle.registrationExpiryDate?.slice(0, 10) ?? '',
      });
      const matchedBrand = VEHICLE_BRAND_OPTIONS.includes(vehicle.brand);
      setBrandSelection(matchedBrand ? vehicle.brand : OTHER_OPTION);
      setBrandOtherValue(matchedBrand ? '' : vehicle.brand);
      const modelOptions = matchedBrand ? VEHICLE_MODELS_BY_BRAND[vehicle.brand] ?? [] : [];
      const matchedModel = modelOptions.includes(vehicle.model);
      setModelSelection(matchedModel ? vehicle.model : OTHER_OPTION);
      setModelOtherValue(matchedModel ? '' : vehicle.model);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load vehicle information.';
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }, [vehicleId]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadVehicle();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadVehicle]);

  const fieldErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    const currentYear = new Date().getFullYear();

    const validateImageAsset = (
      asset: LocalDocumentAsset | undefined,
      fieldKey: string,
      label: string,
      fallbackUrl?: string | null,
    ): void => {
      if (!asset && !fallbackUrl) {
        errors[fieldKey] = `${label} is required.`;
        return;
      }
      if (!asset) return;

      const mime = asset.mimeType ?? '';
      if (!IMAGE_ALLOWED_TYPES.has(mime)) {
        errors[fieldKey] = `${label} must be JPEG, PNG, or WEBP.`;
        return;
      }
      if (asset.fileSize && asset.fileSize > MAX_IMAGE_BYTES) {
        errors[fieldKey] = `${label} must be 5 MB or smaller.`;
      }
    };

    const validateDocumentAsset = (
      asset: LocalDocumentAsset | undefined,
      fieldKey: string,
      label: string,
      fallbackUrl?: string | null,
    ): void => {
      if (!asset && !fallbackUrl) {
        errors[fieldKey] = `${label} is required.`;
        return;
      }
      if (!asset) return;

      const mime = asset.mimeType ?? '';
      if (!DOCUMENT_ALLOWED_TYPES.has(mime)) {
        errors[fieldKey] = `${label} must be PDF, JPEG, PNG, or WEBP.`;
        return;
      }
      const maxBytes = mime === 'application/pdf' ? MAX_DOCUMENT_BYTES : MAX_IMAGE_BYTES;
      if (asset.fileSize && asset.fileSize > maxBytes) {
        errors[fieldKey] = `${label} exceeds the allowed size limit.`;
      }
    };

    if (!vehicleForm.vehicleType) errors.vehicleType = 'Vehicle type is required.';
    if (!vehicleForm.brand.trim()) {
      errors.brand = 'Vehicle brand is required.';
    }
    if (brandSelection === OTHER_OPTION && !brandOtherValue.trim()) {
      errors.brandOther = 'Type the vehicle brand.';
    }
    if (!vehicleForm.model.trim()) {
      errors.model = 'Vehicle model is required.';
    }
    if (modelSelection === OTHER_OPTION && !modelOtherValue.trim()) {
      errors.modelOther = 'Type the vehicle model.';
    }

    if (!vehicleForm.year.trim()) {
      errors.year = 'Vehicle year is required.';
    } else {
      const year = Number(vehicleForm.year);
      if (!Number.isInteger(year)) {
        errors.year = 'Vehicle year must be a number.';
      } else if (year < 1980 || year > currentYear + 1) {
        errors.year = `Vehicle year must be between 1980 and ${currentYear + 1}.`;
      }
    }

    if (!vehicleForm.licensePlateNumber.trim()) {
      errors.licensePlateNumber = 'License plate number is required.';
    }

    if (!vehicleForm.condition) {
      errors.condition = 'Vehicle condition is required.';
    }

    validateImageAsset(
      vehicleForm.frontPhoto,
      'frontPhoto',
      'Front photo',
      existingVehicle?.frontPhotoUrl,
    );
    validateImageAsset(
      vehicleForm.rearPhoto,
      'rearPhoto',
      'Rear photo',
      existingVehicle?.rearPhotoUrl,
    );
    validateImageAsset(
      vehicleForm.sidePhoto,
      'sidePhoto',
      'Side photo',
      existingVehicle?.sidePhotoUrl,
    );
    validateImageAsset(
      vehicleForm.licensePlatePhoto,
      'licensePlatePhoto',
      'License plate photo',
      existingVehicle?.licensePlatePhotoUrl,
    );

    validateDocumentAsset(
      vehicleForm.registrationFrontDocument,
      'registrationFrontDocument',
      'Registration card front side',
      existingVehicle?.registrationFrontDocumentUrl,
    );
    validateDocumentAsset(
      vehicleForm.registrationBackDocument,
      'registrationBackDocument',
      'Registration card back side',
      existingVehicle?.registrationBackDocumentUrl,
    );
    validateDocumentAsset(
      vehicleForm.insuranceDocument,
      'insuranceDocument',
      'Insurance document',
      existingVehicle?.insuranceDocumentUrl,
    );

    const validateDate = (value: string, key: DateFieldKey, label: string): void => {
      if (!value.trim()) return;

      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        errors[key] = `${label} must be a valid date.`;
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      parsed.setHours(0, 0, 0, 0);
      if (parsed.getTime() < today.getTime()) {
        errors[key] = `${label} must not be in the past.`;
      }
    };

    validateDate(vehicleForm.insuranceExpiryDate, 'insuranceExpiryDate', 'Insurance expiry date');
    validateDate(
      vehicleForm.registrationExpiryDate,
      'registrationExpiryDate',
      'Registration expiry date',
    );

    return errors;
  }, [
    brandOtherValue,
    brandSelection,
    existingVehicle,
    modelOtherValue,
    modelSelection,
    vehicleForm,
  ]);

  const vehicleTypeSelectorOptions = useMemo<SelectorOption[]>(
    () => VEHICLE_TYPE_OPTIONS.map((option) => ({ label: option.label, value: option.value })),
    [],
  );

  const yearSelectorOptions = useMemo<SelectorOption[]>(() => {
    const currentYear = new Date().getFullYear() + 1;
    return Array.from({ length: currentYear - 1979 }, (_, index) => {
      const year = String(currentYear - index);
      return { label: year, value: year };
    });
  }, []);

  const brandSelectorOptions = useMemo<SelectorOption[]>(
    () => [
      ...VEHICLE_BRAND_OPTIONS.map((brand) => ({ label: brand, value: brand })),
      { label: 'Other', value: OTHER_OPTION },
    ],
    [],
  );

  const modelSelectorOptions = useMemo<SelectorOption[]>(() => {
    const options = brandSelection && brandSelection !== OTHER_OPTION
      ? VEHICLE_MODELS_BY_BRAND[brandSelection] ?? []
      : [];

    return [
      ...options.map((model) => ({ label: model, value: model })),
      { label: 'Other', value: OTHER_OPTION },
    ];
  }, [brandSelection]);

  const conditionSelectorOptions = useMemo<SelectorOption[]>(
    () => VEHICLE_CONDITION_OPTIONS.map((option) => ({ label: option.label, value: option.value })),
    [],
  );

  const activeSelectorOptions = useMemo<SelectorOption[]>(() => {
    switch (activeSelectorField) {
      case 'vehicleType':
        return vehicleTypeSelectorOptions;
      case 'brand':
        return brandSelectorOptions;
      case 'model':
        return modelSelectorOptions;
      case 'condition':
        return conditionSelectorOptions;
      case 'year':
        return yearSelectorOptions;
      default:
        return [];
    }
  }, [
    activeSelectorField,
    brandSelectorOptions,
    conditionSelectorOptions,
    modelSelectorOptions,
    vehicleTypeSelectorOptions,
    yearSelectorOptions,
  ]);

  const filteredSelectorOptions = useMemo<SelectorOption[]>(() => {
    const normalizedSearch = selectorSearch.trim().toLowerCase();
    if (!normalizedSearch) return activeSelectorOptions;

    return activeSelectorOptions.filter((option) =>
      option.label.toLowerCase().includes(normalizedSearch),
    );
  }, [activeSelectorOptions, selectorSearch]);

  const isFormValid = Object.keys(fieldErrors).length === 0;

  const onVehicleChange = <K extends keyof CreateDriverVehicleForm>(
    key: K,
    value: CreateDriverVehicleForm[K],
  ): void => {
    setVehicleForm((prev) => ({ ...prev, [key]: value }));
  };

  const openSelector = (field: SelectorField): void => {
    setActiveSelectorField(field);
    setSelectorSearch('');
  };

  const closeSelector = (): void => {
    setActiveSelectorField(null);
    setSelectorSearch('');
  };

  const onSelectVehicleType = (value: string): void => {
    onVehicleChange('vehicleType', value as VehicleType);
    closeSelector();
  };

  const onSelectBrand = (value: string): void => {
    setBrandSelection(value);
    setModelSelection('');
    setModelOtherValue('');

    if (value === OTHER_OPTION) {
      onVehicleChange('brand', brandOtherValue.trim());
      onVehicleChange('model', '');
    } else {
      onVehicleChange('brand', value);
      onVehicleChange('model', '');
    }

    closeSelector();
  };

  const onSelectModel = (value: string): void => {
    setModelSelection(value);
    if (value === OTHER_OPTION) {
      onVehicleChange('model', modelOtherValue.trim());
    } else {
      onVehicleChange('model', value);
    }
    closeSelector();
  };

  const onSelectCondition = (value: string): void => {
    onVehicleChange('condition', value as VehicleCondition);
    closeSelector();
  };

  const onSelectYear = (value: string): void => {
    onVehicleChange('year', value);
    closeSelector();
  };

  const pickImage = async (
    key:
      | 'frontPhoto'
      | 'rearPhoto'
      | 'sidePhoto'
      | 'licensePlatePhoto',
  ): Promise<void> => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
      setSubmitError('Media library permission is required to select images.');
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
    onVehicleChange(key, toAssetFromImagePicker(asset));
  };

  const pickDocument = async (
    key:
      | 'registrationFrontDocument'
      | 'registrationBackDocument'
      | 'insuranceDocument',
  ): Promise<void> => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    onVehicleChange(key, toAssetFromDocumentPicker(asset));
  };

  const buildPayload = (): CreateDriverVehiclePayload => ({
    vehicleType: vehicleForm.vehicleType as VehicleType,
    brand: vehicleForm.brand.trim(),
    model: vehicleForm.model.trim(),
    year: Number(vehicleForm.year),
    licensePlateNumber: vehicleForm.licensePlateNumber.trim(),
    condition: vehicleForm.condition as VehicleCondition,
    insuranceExpiryDate: vehicleForm.insuranceExpiryDate || undefined,
    registrationExpiryDate: vehicleForm.registrationExpiryDate || undefined,
  });

  const onSaveVehicle = async (): Promise<void> => {
    if (!isFormValid || isSaving) return;

    setIsSaving(true);
    setSubmitError('');
    setSubmitSuccess('');

    try {
      const payload = buildPayload();
      const vehicle = isEditing && vehicleId
        ? await updateDriverVehicle(vehicleId, payload)
        : await createDriverVehicle(payload);
      let documentResponse: DriverVehicleDocumentsResponse | null = null;

      const shouldUploadDocuments =
        Boolean(vehicleForm.frontPhoto) ||
        Boolean(vehicleForm.rearPhoto) ||
        Boolean(vehicleForm.sidePhoto) ||
        Boolean(vehicleForm.licensePlatePhoto) ||
        Boolean(vehicleForm.registrationFrontDocument) ||
        Boolean(vehicleForm.registrationBackDocument) ||
        Boolean(vehicleForm.insuranceDocument) ||
        vehicleForm.insuranceExpiryDate !== (existingVehicle?.insuranceExpiryDate?.slice(0, 10) ?? '') ||
        vehicleForm.registrationExpiryDate !==
          (existingVehicle?.registrationExpiryDate?.slice(0, 10) ?? '');

      if (shouldUploadDocuments) {
        documentResponse = await uploadDriverVehicleDocuments(vehicle.id, {
          frontPhoto: vehicleForm.frontPhoto,
          rearPhoto: vehicleForm.rearPhoto,
          sidePhoto: vehicleForm.sidePhoto,
          licensePlatePhoto: vehicleForm.licensePlatePhoto,
          registrationFrontDocument: vehicleForm.registrationFrontDocument,
          registrationBackDocument: vehicleForm.registrationBackDocument,
          insuranceDocument: vehicleForm.insuranceDocument,
          insuranceExpiryDate: vehicleForm.insuranceExpiryDate || undefined,
          registrationExpiryDate: vehicleForm.registrationExpiryDate || undefined,
        });
      }

      setSubmitSuccess(isEditing ? 'Vehicle updated successfully.' : 'Vehicle saved successfully.');
      setTimeout(() => {
        if (flow === 'management') {
          if (isEditing) {
            router.replace('/my-vehicles');
          } else {
            router.replace(
              `/load-capacity?vehicleId=${vehicle.id}&flow=management&returnTo=manage-load-capacities`,
            );
          }
        } else {
          const nextStep = documentResponse?.nextStep ?? 'WAITING_APPROVAL';
          router.replace(
            `/load-capacity?vehicleId=${vehicle.id}&flow=onboarding&nextStep=${nextStep}`,
          );
        }
      }, 500);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save vehicle.';
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

      setSubmitError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const renderUploadCard = ({
    field,
    label,
    helper,
    remoteUrl,
    onPress,
    kind = 'image',
  }: {
    field:
      | 'frontPhoto'
      | 'rearPhoto'
      | 'sidePhoto'
      | 'licensePlatePhoto'
      | 'registrationFrontDocument'
      | 'registrationBackDocument'
      | 'insuranceDocument';
    label: string;
    helper: string;
    remoteUrl?: string | null;
    onPress: () => Promise<void>;
    kind?: 'image' | 'document';
  }) => {
    const localAsset = vehicleForm[field];
    const hasImagePreview = kind === 'image' && !isPdfFile(localAsset, remoteUrl);
    const documentLabel = readAssetLabel(localAsset, remoteUrl);
    return (
      <View style={styles.uploadCard}>
        <Text style={styles.uploadTitle}>{label} *</Text>
        <Text style={styles.uploadHelper}>{helper}</Text>
        {hasImagePreview && (localAsset?.uri || remoteUrl) ? (
          <Image
            source={{ uri: localAsset?.uri ?? remoteUrl ?? undefined }}
            style={styles.previewImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.documentPlaceholder}>
            <Text style={styles.documentPlaceholderText}>{documentLabel}</Text>
          </View>
        )}
        {fieldErrors[field] ? <Text style={styles.errorText}>{fieldErrors[field]}</Text> : null}
        <View style={styles.uploadActionRow}>
          <Pressable style={styles.secondaryButton} onPress={() => void onPress()}>
            <Text style={styles.secondaryButtonText}>
              {localAsset || remoteUrl ? 'Replace file' : 'Choose file'}
            </Text>
          </Pressable>
          {kind === 'document' && remoteUrl ? (
            <Pressable
              style={styles.secondaryButton}
              onPress={() => {
                void Linking.openURL(remoteUrl);
              }}
            >
              <Text style={styles.secondaryButtonText}>Open</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1D4ED8" />
        <Text style={styles.loadingText}>Loading vehicle information...</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>{loadError}</Text>
        <Pressable style={styles.primaryButton} onPress={() => void loadVehicle()}>
          <Text style={styles.primaryButtonText}>Retry</Text>
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
          <Text style={styles.progress}>
            {flow === 'management' ? 'Vehicle Management' : 'Step 3 of 3: Vehicle Information'}
          </Text>
          <Text style={styles.title}>{isEditing ? 'Edit Vehicle' : 'Add Vehicle'}</Text>
          <Text style={styles.subtitle}>
            Save the vehicle details, photos, and documents required for transport requests.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vehicle Details</Text>
          <Text style={styles.requiredLabel}>Required fields are marked *</Text>

          <Text style={styles.fieldLabel}>Vehicle type *</Text>
          <Pressable style={styles.selectorField} onPress={() => openSelector('vehicleType')}>
            <Text style={vehicleForm.vehicleType ? styles.selectorValue : styles.selectorPlaceholder}>
              {vehicleForm.vehicleType
                ? formatSelectorLabel(vehicleForm.vehicleType, vehicleTypeSelectorOptions)
                : 'Select vehicle type'}
            </Text>
          </Pressable>
          {fieldErrors.vehicleType ? <Text style={styles.errorText}>{fieldErrors.vehicleType}</Text> : null}

          <Text style={styles.fieldLabel}>Vehicle brand *</Text>
          <Pressable style={styles.selectorField} onPress={() => openSelector('brand')}>
            <Text style={vehicleForm.brand ? styles.selectorValue : styles.selectorPlaceholder}>
              {vehicleForm.brand || 'Select vehicle brand'}
            </Text>
          </Pressable>
          {fieldErrors.brand ? <Text style={styles.errorText}>{fieldErrors.brand}</Text> : null}
          {brandSelection === OTHER_OPTION ? (
            <>
              <Text style={styles.fieldLabel}>Other vehicle brand *</Text>
              <TextInput
                style={styles.input}
                placeholder="Type vehicle brand"
                value={brandOtherValue}
                onChangeText={(value) => {
                  setBrandOtherValue(value);
                  onVehicleChange('brand', value);
                }}
              />
              {fieldErrors.brandOther ? (
                <Text style={styles.errorText}>{fieldErrors.brandOther}</Text>
              ) : null}
            </>
          ) : null}

          <Text style={styles.fieldLabel}>Vehicle model *</Text>
          <Pressable
            style={[styles.selectorField, !vehicleForm.brand && styles.selectorFieldDisabled]}
            onPress={() => {
              if (!vehicleForm.brand) return;
              openSelector('model');
            }}
          >
            <Text style={vehicleForm.model ? styles.selectorValue : styles.selectorPlaceholder}>
              {vehicleForm.model || 'Select vehicle model'}
            </Text>
          </Pressable>
          {fieldErrors.model ? <Text style={styles.errorText}>{fieldErrors.model}</Text> : null}
          {modelSelection === OTHER_OPTION ? (
            <>
              <Text style={styles.fieldLabel}>Other vehicle model *</Text>
              <TextInput
                style={styles.input}
                placeholder="Type vehicle model"
                value={modelOtherValue}
                onChangeText={(value) => {
                  setModelOtherValue(value);
                  onVehicleChange('model', value);
                }}
              />
              {fieldErrors.modelOther ? (
                <Text style={styles.errorText}>{fieldErrors.modelOther}</Text>
              ) : null}
            </>
          ) : null}

          <Text style={styles.fieldLabel}>Vehicle year *</Text>
          <Pressable style={styles.selectorField} onPress={() => openSelector('year')}>
            <Text style={vehicleForm.year ? styles.dateValue : styles.datePlaceholder}>
              {vehicleForm.year || 'Select vehicle year'}
            </Text>
          </Pressable>
          {fieldErrors.year ? <Text style={styles.errorText}>{fieldErrors.year}</Text> : null}

          <Text style={styles.fieldLabel}>License plate number *</Text>
          <TextInput
            style={styles.input}
            placeholder="License plate number"
            value={vehicleForm.licensePlateNumber}
            onChangeText={(value) => onVehicleChange('licensePlateNumber', value)}
          />
          {fieldErrors.licensePlateNumber ? (
            <Text style={styles.errorText}>{fieldErrors.licensePlateNumber}</Text>
          ) : null}

          <Text style={styles.fieldLabel}>Vehicle condition *</Text>
          <Pressable style={styles.selectorField} onPress={() => openSelector('condition')}>
            <Text style={vehicleForm.condition ? styles.selectorValue : styles.selectorPlaceholder}>
              {vehicleForm.condition
                ? formatSelectorLabel(vehicleForm.condition, conditionSelectorOptions)
                : 'Select vehicle condition'}
            </Text>
          </Pressable>
          {fieldErrors.condition ? <Text style={styles.errorText}>{fieldErrors.condition}</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vehicle Photos</Text>
          {renderUploadCard({
            field: 'frontPhoto',
            label: 'Front photo',
            helper: 'Upload a clear photo showing the front of the vehicle.',
            remoteUrl: existingVehicle?.frontPhotoUrl,
            onPress: () => pickImage('frontPhoto'),
          })}
          {renderUploadCard({
            field: 'rearPhoto',
            label: 'Rear photo',
            helper: 'Upload a clear photo showing the rear of the vehicle.',
            remoteUrl: existingVehicle?.rearPhotoUrl,
            onPress: () => pickImage('rearPhoto'),
          })}
          {renderUploadCard({
            field: 'sidePhoto',
            label: 'Side photo',
            helper: 'Upload a side view of the vehicle.',
            remoteUrl: existingVehicle?.sidePhotoUrl,
            onPress: () => pickImage('sidePhoto'),
          })}
          {renderUploadCard({
            field: 'licensePlatePhoto',
            label: 'License plate photo',
            helper: 'Make sure the plate number is fully readable.',
            remoteUrl: existingVehicle?.licensePlatePhotoUrl,
            onPress: () => pickImage('licensePlatePhoto'),
          })}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vehicle Documents</Text>
          {renderUploadCard({
            field: 'registrationFrontDocument',
            label: 'Registration card front side',
            helper: 'Upload the front side of the vehicle registration card.',
            remoteUrl: existingVehicle?.registrationFrontDocumentUrl,
            onPress: () => pickDocument('registrationFrontDocument'),
            kind: 'document',
          })}
          {renderUploadCard({
            field: 'registrationBackDocument',
            label: 'Registration card back side',
            helper: 'Upload the back side of the vehicle registration card.',
            remoteUrl: existingVehicle?.registrationBackDocumentUrl,
            onPress: () => pickDocument('registrationBackDocument'),
            kind: 'document',
          })}
          {renderUploadCard({
            field: 'insuranceDocument',
            label: 'Insurance document',
            helper: 'Upload the valid vehicle insurance document.',
            remoteUrl: existingVehicle?.insuranceDocumentUrl,
            onPress: () => pickDocument('insuranceDocument'),
            kind: 'document',
          })}

          <Text style={styles.fieldLabel}>Insurance expiry date</Text>
          <Pressable
            style={styles.dateField}
            onPress={() => setActiveDateField('insuranceExpiryDate')}
          >
            <Text style={vehicleForm.insuranceExpiryDate ? styles.dateValue : styles.datePlaceholder}>
              {formatDate(vehicleForm.insuranceExpiryDate)}
            </Text>
          </Pressable>
          {fieldErrors.insuranceExpiryDate ? (
            <Text style={styles.errorText}>{fieldErrors.insuranceExpiryDate}</Text>
          ) : null}

          <Text style={styles.fieldLabel}>Registration expiry date</Text>
          <Pressable
            style={styles.dateField}
            onPress={() => setActiveDateField('registrationExpiryDate')}
          >
            <Text
              style={
                vehicleForm.registrationExpiryDate ? styles.dateValue : styles.datePlaceholder
              }
            >
              {formatDate(vehicleForm.registrationExpiryDate)}
            </Text>
          </Pressable>
          {fieldErrors.registrationExpiryDate ? (
            <Text style={styles.errorText}>{fieldErrors.registrationExpiryDate}</Text>
          ) : null}
        </View>

        {existingVehicle?.status === 'REJECTED' && existingVehicle.rejectionReason ? (
          <Text style={styles.errorText}>
            Rejection reason: {existingVehicle.rejectionReason}
          </Text>
        ) : null}
        {existingVehicle?.status === 'PENDING_REVIEW' ? (
          <Text style={styles.infoText}>Your vehicle is under review.</Text>
        ) : null}
        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
        {submitSuccess ? <Text style={styles.successText}>{submitSuccess}</Text> : null}

        <Pressable
          style={[styles.primaryButton, (!isFormValid || isSaving) && styles.buttonDisabled]}
          disabled={!isFormValid || isSaving}
          onPress={() => void onSaveVehicle()}
        >
          {isSaving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {flow === 'management'
                ? isEditing
                  ? 'Save Changes'
                  : 'Save Vehicle'
                : 'Save Vehicle'}
            </Text>
          )}
        </Pressable>
      </ScrollView>

      {activeDateField ? (
        <ExpoDateTimePicker
          mode="date"
          presentation="dialog"
          value={normalizeDateValue(vehicleForm[activeDateField])}
          onValueChange={(_event, selectedDate) => {
            if (selectedDate) {
              onVehicleChange(activeDateField, selectedDate.toISOString().slice(0, 10));
            }
            setActiveDateField(null);
          }}
          onDismiss={() => setActiveDateField(null)}
        />
      ) : null}
      {activeDateField ? (
        <Pressable style={styles.dateDismissButton} onPress={() => setActiveDateField(null)}>
          <Text style={styles.dateDismissText}>Done</Text>
        </Pressable>
      ) : null}
      <Modal
        visible={Boolean(activeSelectorField)}
        animationType="slide"
        transparent
        onRequestClose={closeSelector}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={closeSelector} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {activeSelectorField === 'vehicleType'
                  ? 'Select vehicle type'
                  : activeSelectorField === 'brand'
                    ? 'Select vehicle brand'
                    : activeSelectorField === 'model'
                      ? 'Select vehicle model'
                      : activeSelectorField === 'year'
                        ? 'Select vehicle year'
                      : 'Select vehicle condition'}
              </Text>
              <Pressable onPress={closeSelector}>
                <Text style={styles.modalCloseText}>Close</Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.searchInput}
              placeholder="Search"
              value={selectorSearch}
              onChangeText={setSelectorSearch}
            />
            <ScrollView contentContainerStyle={styles.selectorList}>
              {filteredSelectorOptions.map((option) => (
                <Pressable
                  key={option.value}
                  style={styles.selectorOption}
                  onPress={() => {
                    if (activeSelectorField === 'vehicleType') {
                      onSelectVehicleType(option.value);
                    } else if (activeSelectorField === 'brand') {
                      onSelectBrand(option.value);
                    } else if (activeSelectorField === 'model') {
                      onSelectModel(option.value);
                    } else if (activeSelectorField === 'condition') {
                      onSelectCondition(option.value);
                    } else if (activeSelectorField === 'year') {
                      onSelectYear(option.value);
                    }
                  }}
                >
                  <Text style={styles.selectorOptionText}>{option.label}</Text>
                </Pressable>
              ))}
              {filteredSelectorOptions.length === 0 ? (
                <Text style={styles.emptySelectorText}>No matching options found.</Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 20,
  },
  loadingText: { color: '#475569' },
  content: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 40,
    gap: 14,
  },
  header: { gap: 4 },
  progress: { color: '#1D4ED8', fontWeight: '700', fontSize: 13 },
  title: { fontSize: 28, fontWeight: '700', color: '#0F172A' },
  subtitle: { color: '#475569', fontSize: 14 },
  section: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  requiredLabel: { color: '#64748B', fontSize: 12 },
  fieldLabel: { color: '#334155', fontSize: 13, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  selectorField: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
  },
  selectorFieldDisabled: {
    opacity: 0.5,
  },
  selectorPlaceholder: { color: '#94A3B8', fontSize: 15 },
  selectorValue: { color: '#0F172A', fontSize: 15 },
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  optionChipSelected: { borderColor: '#1D4ED8', backgroundColor: '#DBEAFE' },
  optionText: { color: '#334155', fontSize: 12, fontWeight: '500' },
  optionTextSelected: { color: '#1D4ED8', fontWeight: '700' },
  uploadCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  uploadActionRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  uploadTitle: { color: '#0F172A', fontWeight: '700', fontSize: 14 },
  uploadHelper: { color: '#64748B', fontSize: 12 },
  previewImage: {
    width: '100%',
    height: 170,
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
  },
  documentPlaceholder: {
    minHeight: 70,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  documentPlaceholderText: {
    color: '#475569',
    fontSize: 13,
    textAlign: 'center',
  },
  dateField: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
  },
  datePlaceholder: { color: '#94A3B8', fontSize: 15 },
  dateValue: { color: '#0F172A', fontSize: 15 },
  primaryButton: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  secondaryButton: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { color: '#1D4ED8', fontWeight: '700' },
  buttonDisabled: { opacity: 0.5 },
  errorText: { color: '#B91C1C', fontSize: 13 },
  successText: { color: '#166534', fontSize: 13, fontWeight: '600' },
  infoText: { color: '#1D4ED8', fontSize: 13, fontWeight: '600' },
  dateDismissButton: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    backgroundColor: '#0F172A',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  dateDismissText: { color: '#FFFFFF', fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.3)',
  },
  modalBackdrop: {
    flex: 1,
  },
  modalSheet: {
    maxHeight: '75%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalCloseText: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  selectorList: {
    gap: 8,
    paddingBottom: 18,
  },
  selectorOption: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  selectorOptionText: {
    color: '#0F172A',
    fontSize: 15,
  },
  emptySelectorText: {
    color: '#64748B',
    textAlign: 'center',
    paddingVertical: 16,
  },
});
