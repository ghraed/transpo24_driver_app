import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
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
  clearVehicleInformationDraft,
  persistLastOnboardingRoute,
  persistVehicleInformationDraft,
  readVehicleInformationDraft,
} from '@/lib/auth-storage';
import {
  createDriverVehicle,
  deleteDriverVehicle,
  getDriverVehicles,
  getDriverVehicle,
  updateDriverVehicle,
  uploadDriverVehicleDocuments,
} from '@/lib/api';
import {
  VEHICLE_MODELS_BY_BRAND_AND_TYPE,
  type VehicleBrand,
  type VehicleModelType,
} from '@/lib/vehicle-catalog';
import i18n from '@/localization/i18n';
import type {
  CreateDriverVehicleForm,
  CreateDriverVehiclePayload,
  DriverVehicle,
  DriverVehicleDocumentsResponse,
  LocalDocumentAsset,
  VehicleCondition,
  VehicleType,
} from '@/types/auth';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

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

function createTestVehicleFormDefaults(): CreateDriverVehicleForm {
  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);
  const defaultExpiryDate = nextYear.toISOString().slice(0, 10);

  return {
    vehicleType: 'PICKUP',
    brand: 'Toyota',
    model: 'Hilux',
    year: String(new Date().getFullYear()),
    licensePlateNumber: 'TEST-1234',
    condition: 'EXCELLENT',
    insuranceExpiryDate: defaultExpiryDate,
    registrationExpiryDate: defaultExpiryDate,
  };
}

type DateFieldKey = 'insuranceExpiryDate' | 'registrationExpiryDate';
type SelectorField = 'vehicleType' | 'brand' | 'model' | 'condition' | 'year';

interface SelectorOption {
  label: string;
  value: string;
}

function toVehicleModelType(vehicleType: VehicleType | ''): VehicleModelType | null {
  return vehicleType ? (vehicleType as VehicleModelType) : null;
}

function getBrandsForVehicleType(vehicleType: VehicleType | ''): VehicleBrand[] {
  const modelType = toVehicleModelType(vehicleType);
  if (!modelType) return [];

  return (Object.keys(VEHICLE_MODELS_BY_BRAND_AND_TYPE) as VehicleBrand[]).filter(
    (brand) => VEHICLE_MODELS_BY_BRAND_AND_TYPE[brand][modelType].length > 0,
  );
}

function getModelsForVehicleSelection(
  vehicleType: VehicleType | '',
  brand: string,
): readonly string[] {
  const modelType = toVehicleModelType(vehicleType);
  if (!modelType || !brand || !(brand in VEHICLE_MODELS_BY_BRAND_AND_TYPE)) return [];

  return VEHICLE_MODELS_BY_BRAND_AND_TYPE[brand as VehicleBrand][modelType];
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
  if (!value) return i18n.t('Select date');
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
    return i18n.t('Uploaded file');
  }
  return i18n.t('No file selected');
}

function normalizeDateValue(value: string): Date {
  if (!value) return new Date();
  return new Date(value);
}

function formatSelectorLabel(value: string, options: SelectorOption[]): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function buildRollbackPayload(vehicle: DriverVehicle): CreateDriverVehiclePayload {
  return {
    vehicleType: vehicle.vehicleType,
    brand: vehicle.brand,
    model: vehicle.model,
    year: vehicle.year,
    licensePlateNumber: vehicle.licensePlateNumber,
    condition: vehicle.condition,
    insuranceExpiryDate: vehicle.insuranceExpiryDate ?? undefined,
    registrationExpiryDate: vehicle.registrationExpiryDate ?? undefined,
  };
}

export default function VehicleInformationScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ vehicleId?: string; flow?: string }>();
  const vehicleId =
    typeof params.vehicleId === 'string' && params.vehicleId.trim() ? params.vehicleId : undefined;
  const flow = params.flow === 'management' ? 'management' : 'onboarding';
  const { signOut } = useAuth();
  const testDefaults = useMemo(() => createTestVehicleFormDefaults(), []);

  const [vehicleForm, setVehicleForm] = useState<CreateDriverVehicleForm>(testDefaults);
  const [existingVehicle, setExistingVehicle] = useState<DriverVehicle | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(vehicleId));
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>('');
  const [submitError, setSubmitError] = useState<string>('');
  const [submitSuccess, setSubmitSuccess] = useState<string>('');
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState<boolean>(false);
  const [activeDateField, setActiveDateField] = useState<DateFieldKey | null>(null);
  const [activeSelectorField, setActiveSelectorField] = useState<SelectorField | null>(null);
  const [selectorSearch, setSelectorSearch] = useState<string>('');
  const [brandOtherValue, setBrandOtherValue] = useState<string>('');
  const [modelOtherValue, setModelOtherValue] = useState<string>('');
  const [brandSelection, setBrandSelection] = useState<string>('');
  const [modelSelection, setModelSelection] = useState<string>('');
  const [hasHydratedDraft, setHasHydratedDraft] = useState<boolean>(false);

  const isEditing = Boolean(vehicleId);

  useEffect(() => {
    if (flow !== 'onboarding') return;

    const route = vehicleId
      ? `/vehicle-information?vehicleId=${encodeURIComponent(vehicleId)}&flow=onboarding`
      : '/vehicle-information?flow=onboarding';
    void persistLastOnboardingRoute(route);
  }, [flow, vehicleId]);

  const loadVehicle = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setLoadError('');

    try {
      const draftRaw = flow === 'onboarding' ? await readVehicleInformationDraft() : null;
      const draft = draftRaw ? (JSON.parse(draftRaw) as CreateDriverVehicleForm) : null;
      let resolvedVehicleId = vehicleId;

      if (!resolvedVehicleId && flow === 'onboarding') {
        const vehicles = await getDriverVehicles();
        const latestVehicle = [...vehicles]
          .sort(
            (left, right) =>
              new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
          )[0];
        resolvedVehicleId = latestVehicle?.id;
      }

      if (!resolvedVehicleId) {
        setExistingVehicle(null);
        const nextForm = {
          ...testDefaults,
          ...draft,
        };
        setVehicleForm(nextForm);
        const nextBrandOptions = getBrandsForVehicleType(nextForm.vehicleType);
        const matchedBrand = nextBrandOptions.includes(nextForm.brand as VehicleBrand);
        setBrandSelection(matchedBrand ? nextForm.brand : nextForm.brand ? OTHER_OPTION : '');
        setBrandOtherValue(matchedBrand ? '' : nextForm.brand);
        const nextModelOptions = matchedBrand
          ? getModelsForVehicleSelection(nextForm.vehicleType, nextForm.brand)
          : [];
        const matchedModel = nextModelOptions.includes(nextForm.model);
        setModelSelection(matchedModel ? nextForm.model : nextForm.model ? OTHER_OPTION : '');
        setModelOtherValue(matchedModel ? '' : nextForm.model);
        return;
      }

      const vehicle = await getDriverVehicle(resolvedVehicleId);
      setExistingVehicle(vehicle);
      const baseForm: CreateDriverVehicleForm = {
        vehicleType: vehicle.vehicleType,
        brand: vehicle.brand,
        model: vehicle.model,
        year: String(vehicle.year),
        licensePlateNumber: vehicle.licensePlateNumber,
        condition: vehicle.condition,
        frontPhoto: undefined,
        rearPhoto: undefined,
        sidePhoto: undefined,
        licensePlatePhoto: undefined,
        registrationFrontDocument: undefined,
        registrationBackDocument: undefined,
        insuranceDocument: undefined,
        insuranceExpiryDate:
          vehicle.insuranceExpiryDate?.slice(0, 10) ?? testDefaults.insuranceExpiryDate,
        registrationExpiryDate:
          vehicle.registrationExpiryDate?.slice(0, 10) ?? testDefaults.registrationExpiryDate,
      };
      const nextForm = draft ? { ...baseForm, ...draft } : baseForm;
      setVehicleForm(nextForm);
      const brandOptions = getBrandsForVehicleType(nextForm.vehicleType);
      const matchedBrand = brandOptions.includes(nextForm.brand as VehicleBrand);
      setBrandSelection(matchedBrand ? nextForm.brand : nextForm.brand ? OTHER_OPTION : '');
      setBrandOtherValue(matchedBrand ? '' : nextForm.brand);
      const modelOptions = matchedBrand
        ? getModelsForVehicleSelection(nextForm.vehicleType, nextForm.brand)
        : [];
      const matchedModel = modelOptions.includes(nextForm.model);
      setModelSelection(matchedModel ? nextForm.model : nextForm.model ? OTHER_OPTION : '');
      setModelOtherValue(matchedModel ? '' : nextForm.model);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load vehicle information.';
      setLoadError(message);
    } finally {
      setHasHydratedDraft(true);
      setIsLoading(false);
    }
  }, [flow, testDefaults, vehicleId]);

  useEffect(() => {
    if (flow !== 'onboarding' || !hasHydratedDraft) return;
    void persistVehicleInformationDraft(JSON.stringify(vehicleForm));
  }, [flow, hasHydratedDraft, vehicleForm]);

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
      if (!asset && !fallbackUrl) return;
      if (!asset) return;

      const mime = asset.mimeType ?? '';
      if (!IMAGE_ALLOWED_TYPES.has(mime)) {
        errors[fieldKey] = t('{{label}} must be JPEG, PNG, or WEBP.', { label });
        return;
      }
      if (asset.fileSize && asset.fileSize > MAX_IMAGE_BYTES) {
        errors[fieldKey] = t('{{label}} must be 5 MB or smaller.', { label });
      }
    };

    if (!vehicleForm.vehicleType) errors.vehicleType = t('Vehicle type is required.');
    if (!vehicleForm.brand.trim()) {
      errors.brand = t('Vehicle brand is required.');
    } else if (
      brandSelection !== OTHER_OPTION &&
      vehicleForm.vehicleType &&
      !getBrandsForVehicleType(vehicleForm.vehicleType).includes(vehicleForm.brand as VehicleBrand)
    ) {
      errors.brand = t('Vehicle brand must match the selected vehicle type.');
    }
    if (brandSelection === OTHER_OPTION && !brandOtherValue.trim()) {
      errors.brandOther = t('Type the vehicle brand.');
    }
    if (!vehicleForm.model.trim()) {
      errors.model = t('Vehicle model is required.');
    } else if (
      modelSelection !== OTHER_OPTION &&
      brandSelection !== OTHER_OPTION &&
      !getModelsForVehicleSelection(vehicleForm.vehicleType, vehicleForm.brand).includes(
        vehicleForm.model,
      )
    ) {
      errors.model = t('Vehicle model must match the selected vehicle type and brand.');
    }
    if (modelSelection === OTHER_OPTION && !modelOtherValue.trim()) {
      errors.modelOther = t('Type the vehicle model.');
    }

    if (!vehicleForm.year.trim()) {
      errors.year = t('Vehicle year is required.');
    } else {
      const year = Number(vehicleForm.year);
      if (!Number.isInteger(year)) {
        errors.year = t('Vehicle year must be a number.');
      } else if (year < 1980 || year > currentYear + 1) {
        errors.year = t('Vehicle year must be between 1980 and {{maxYear}}.', {
          maxYear: currentYear + 1,
        });
      }
    }

    if (!vehicleForm.licensePlateNumber.trim()) {
      errors.licensePlateNumber = t('License plate number is required.');
    }

    if (!vehicleForm.condition) {
      errors.condition = t('Vehicle condition is required.');
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

    validateImageAsset(
      vehicleForm.registrationFrontDocument,
      'registrationFrontDocument',
      'Registration card front side',
      existingVehicle?.registrationFrontDocumentUrl,
    );
    validateImageAsset(
      vehicleForm.registrationBackDocument,
      'registrationBackDocument',
      'Registration card back side',
      existingVehicle?.registrationBackDocumentUrl,
    );
    validateImageAsset(
      vehicleForm.insuranceDocument,
      'insuranceDocument',
      'Insurance document',
      existingVehicle?.insuranceDocumentUrl,
    );

    const validateDate = (value: string, key: DateFieldKey, label: string): void => {
      if (!value.trim()) return;

      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        errors[key] = t('{{label}} must be a valid date.', { label });
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      parsed.setHours(0, 0, 0, 0);
      if (parsed.getTime() < today.getTime()) {
        errors[key] = t('{{label}} must not be in the past.', { label });
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
    t,
    vehicleForm,
  ]);

  const vehicleTypeSelectorOptions = useMemo<SelectorOption[]>(
    () => VEHICLE_TYPE_OPTIONS.map((option) => ({ label: t(option.label), value: option.value })),
    [t],
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
      ...getBrandsForVehicleType(vehicleForm.vehicleType).map((brand) => ({
        label: brand,
        value: brand,
      })),
      { label: t('Other'), value: OTHER_OPTION },
    ],
    [t, vehicleForm.vehicleType],
  );

  const modelSelectorOptions = useMemo<SelectorOption[]>(() => {
    const options =
      brandSelection && brandSelection !== OTHER_OPTION
        ? getModelsForVehicleSelection(vehicleForm.vehicleType, brandSelection)
        : [];

    return [
      ...options.map((model) => ({ label: model, value: model })),
      { label: t('Other'), value: OTHER_OPTION },
    ];
  }, [brandSelection, t, vehicleForm.vehicleType]);

  const conditionSelectorOptions = useMemo<SelectorOption[]>(
    () => VEHICLE_CONDITION_OPTIONS.map((option) => ({ label: t(option.label), value: option.value })),
    [t],
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
    const nextVehicleType = value as VehicleType;
    const nextBrandOptions = getBrandsForVehicleType(nextVehicleType);
    const currentBrandIsValid =
      brandSelection === OTHER_OPTION ||
      nextBrandOptions.includes(brandSelection as VehicleBrand);
    const nextBrandSelection = currentBrandIsValid ? brandSelection : '';
    const nextBrandValue =
      nextBrandSelection === OTHER_OPTION
        ? brandOtherValue.trim()
        : nextBrandSelection;
    const nextModelOptions = getModelsForVehicleSelection(nextVehicleType, nextBrandValue);
    const currentModelIsValid =
      modelSelection === OTHER_OPTION || nextModelOptions.includes(modelSelection);

    onVehicleChange('vehicleType', nextVehicleType);
    if (!currentBrandIsValid) {
      setBrandSelection('');
      setBrandOtherValue('');
      onVehicleChange('brand', '');
    }
    if (!currentModelIsValid || !currentBrandIsValid) {
      setModelSelection('');
      setModelOtherValue('');
      onVehicleChange('model', '');
    }
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
      | 'licensePlatePhoto'
      | 'registrationFrontDocument'
      | 'registrationBackDocument'
      | 'insuranceDocument',
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

  const takeVehicleDocumentImage = async (
    key:
      | 'frontPhoto'
      | 'rearPhoto'
      | 'sidePhoto'
      | 'licensePlatePhoto'
      | 'registrationFrontDocument'
      | 'registrationBackDocument'
      | 'insuranceDocument',
  ): Promise<void> => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
      setSubmitError('Camera permission is required to take images.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });

    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    onVehicleChange(key, toAssetFromImagePicker(asset));
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

  const saveVehicle = async (): Promise<void> => {
    Keyboard.dismiss();
    setHasAttemptedSubmit(true);

    if (!isFormValid || isSaving) return;

    setIsSaving(true);
    setSubmitError('');
    setSubmitSuccess('');

    let savedVehicle: DriverVehicle | null = null;
    let shouldRollbackCreatedVehicle = false;

    try {
      const payload = buildPayload();
      const targetVehicleId =
        isEditing && vehicleId
          ? vehicleId
          : flow === 'onboarding' && existingVehicle?.id
            ? existingVehicle.id
            : undefined;
      const vehicle = targetVehicleId
        ? await updateDriverVehicle(targetVehicleId, payload)
        : await createDriverVehicle(payload);
      savedVehicle = vehicle;
      shouldRollbackCreatedVehicle = !targetVehicleId;
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

      if (flow === 'onboarding') {
        await clearVehicleInformationDraft();
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
          router.replace(`/load-capacity?vehicleId=${vehicle.id}&flow=onboarding`);
        }
      }, 500);
    } catch (error) {
      if (savedVehicle) {
        try {
          if (shouldRollbackCreatedVehicle) {
            await deleteDriverVehicle(savedVehicle.id);
          } else if (existingVehicle) {
            await updateDriverVehicle(savedVehicle.id, buildRollbackPayload(existingVehicle));
          }
        } catch (rollbackError) {
          const rollbackMessage =
            rollbackError instanceof Error
              ? rollbackError.message
              : 'Rollback failed after the vehicle save error.';
          setSubmitError(
            `${error instanceof Error ? error.message : 'Failed to save vehicle.'} ` +
              `The vehicle rollback also failed: ${rollbackMessage}`,
          );
          setIsSaving(false);
          return;
        }
      }

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

  const onSaveVehicle = async (): Promise<void> => {
    await saveVehicle();
  };

  const renderUploadCard = ({
    field,
    label,
    helper,
    remoteUrl,
    onPick,
    onTakeImage,
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
    onPick: () => Promise<void>;
    onTakeImage: () => Promise<void>;
  }) => {
    const localAsset = vehicleForm[field];
    const previewUri = localAsset?.uri || remoteUrl;
    return (
      <View style={styles.docRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.helper}>{helper}</Text>
        {previewUri ? (
          <Image
            source={{ uri: previewUri }}
            style={styles.onboardingPreview}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.documentPlaceholder}>
            <Text style={styles.fileName}>
              {readAssetLabel(localAsset, remoteUrl)}
            </Text>
          </View>
        )}
        {localAsset ? <Text style={styles.fileName}>{localAsset.fileName ?? t('Selected file')}</Text> : null}
        {hasAttemptedSubmit && fieldErrors[field] ? (
          <Text style={styles.errorText}>{fieldErrors[field]}</Text>
        ) : null}
        <View style={styles.docButtonsRow}>
          <Pressable style={styles.uploadButtonSmall} onPress={() => void onPick()}>
            <Text style={styles.uploadButtonText}>
              {localAsset || remoteUrl ? t('Replace') : t('Select')}
            </Text>
          </Pressable>
          <Pressable style={styles.uploadButtonSmall} onPress={() => void onTakeImage()}>
            <Text style={styles.uploadButtonText}>{t('Take image')}</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1D4ED8" />
        <Text style={styles.loadingText}>{t('Loading vehicle information...')}</Text>
        </View>
      );
  }

  if (loadError) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>{loadError}</Text>
        <Pressable style={styles.primaryButton} onPress={() => void loadVehicle()}>
          <Text style={styles.primaryButtonText}>{t('Retry')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="always">
        <View style={styles.header}>
          <Text style={styles.progress}>
            {flow === 'management' ? t('Vehicle Management') : t('Step 2 of 3: Vehicle Information')}
          </Text>
          <Text style={styles.title}>{isEditing ? t('Edit Vehicle') : t('Add Vehicle')}</Text>
          <Text style={styles.subtitle}>
            {t('Save the vehicle details, photos, and documents required for transport requests.')}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('Vehicle Details')}</Text>
          <Text style={styles.requiredLabel}>{t('Required fields are marked *')}</Text>

          <Text style={styles.fieldLabel}>{t('Vehicle type *')}</Text>
          <Pressable style={styles.selectorField} onPress={() => openSelector('vehicleType')}>
            <Text style={vehicleForm.vehicleType ? styles.selectorValue : styles.selectorPlaceholder}>
              {vehicleForm.vehicleType
                ? formatSelectorLabel(vehicleForm.vehicleType, vehicleTypeSelectorOptions)
                : t('Select vehicle type')}
            </Text>
          </Pressable>
          {hasAttemptedSubmit && fieldErrors.vehicleType ? (
            <Text style={styles.errorText}>{fieldErrors.vehicleType}</Text>
          ) : null}

          <Text style={styles.fieldLabel}>{t('Vehicle brand *')}</Text>
          <Pressable
            style={[styles.selectorField, !vehicleForm.vehicleType && styles.selectorFieldDisabled]}
            onPress={() => {
              if (!vehicleForm.vehicleType) return;
              openSelector('brand');
            }}
          >
            <Text style={vehicleForm.brand ? styles.selectorValue : styles.selectorPlaceholder}>
              {vehicleForm.vehicleType
                ? vehicleForm.brand || t('Select vehicle brand')
                : t('Select vehicle type first')}
            </Text>
          </Pressable>
          {hasAttemptedSubmit && fieldErrors.brand ? (
            <Text style={styles.errorText}>{fieldErrors.brand}</Text>
          ) : null}
          {brandSelection === OTHER_OPTION ? (
            <>
              <Text style={styles.fieldLabel}>{t('Other vehicle brand *')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('Type vehicle brand')}
                value={brandOtherValue}
                onChangeText={(value) => {
                  setBrandOtherValue(value);
                  onVehicleChange('brand', value);
                }}
              />
              {hasAttemptedSubmit && fieldErrors.brandOther ? (
                <Text style={styles.errorText}>{fieldErrors.brandOther}</Text>
              ) : null}
            </>
          ) : null}

          <Text style={styles.fieldLabel}>{t('Vehicle model *')}</Text>
          <Pressable
            style={[styles.selectorField, !vehicleForm.brand && styles.selectorFieldDisabled]}
            onPress={() => {
              if (!vehicleForm.brand) return;
              openSelector('model');
            }}
          >
            <Text style={vehicleForm.model ? styles.selectorValue : styles.selectorPlaceholder}>
              {vehicleForm.brand ? vehicleForm.model || t('Select vehicle model') : t('Select vehicle brand first')}
            </Text>
          </Pressable>
          {hasAttemptedSubmit && fieldErrors.model ? (
            <Text style={styles.errorText}>{fieldErrors.model}</Text>
          ) : null}
          {modelSelection === OTHER_OPTION ? (
            <>
              <Text style={styles.fieldLabel}>{t('Other vehicle model *')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('Type vehicle model')}
                value={modelOtherValue}
                onChangeText={(value) => {
                  setModelOtherValue(value);
                  onVehicleChange('model', value);
                }}
              />
              {hasAttemptedSubmit && fieldErrors.modelOther ? (
                <Text style={styles.errorText}>{fieldErrors.modelOther}</Text>
              ) : null}
            </>
          ) : null}

          <Text style={styles.fieldLabel}>{t('Vehicle year *')}</Text>
          <Pressable style={styles.selectorField} onPress={() => openSelector('year')}>
            <Text style={vehicleForm.year ? styles.dateValue : styles.datePlaceholder}>
              {vehicleForm.year || t('Select vehicle year')}
            </Text>
          </Pressable>
          {hasAttemptedSubmit && fieldErrors.year ? (
            <Text style={styles.errorText}>{fieldErrors.year}</Text>
          ) : null}

          <Text style={styles.fieldLabel}>{t('License plate number *')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('License plate number')}
            value={vehicleForm.licensePlateNumber}
            onChangeText={(value) => onVehicleChange('licensePlateNumber', value)}
          />
          {hasAttemptedSubmit && fieldErrors.licensePlateNumber ? (
            <Text style={styles.errorText}>{fieldErrors.licensePlateNumber}</Text>
          ) : null}

          <Text style={styles.fieldLabel}>{t('Vehicle condition *')}</Text>
          <Pressable style={styles.selectorField} onPress={() => openSelector('condition')}>
            <Text style={vehicleForm.condition ? styles.selectorValue : styles.selectorPlaceholder}>
              {vehicleForm.condition
                ? formatSelectorLabel(vehicleForm.condition, conditionSelectorOptions)
                : t('Select vehicle condition')}
            </Text>
          </Pressable>
          {hasAttemptedSubmit && fieldErrors.condition ? (
            <Text style={styles.errorText}>{fieldErrors.condition}</Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('Vehicle Photos')}</Text>
          {renderUploadCard({
            field: 'frontPhoto',
            label: t('Front photo'),
            helper: t('Select or take a clear image showing the front of the vehicle.'),
            remoteUrl: existingVehicle?.frontPhotoUrl,
            onPick: () => pickImage('frontPhoto'),
            onTakeImage: () => takeVehicleDocumentImage('frontPhoto'),
          })}
          {renderUploadCard({
            field: 'rearPhoto',
            label: t('Rear photo'),
            helper: t('Select or take a clear image showing the rear of the vehicle.'),
            remoteUrl: existingVehicle?.rearPhotoUrl,
            onPick: () => pickImage('rearPhoto'),
            onTakeImage: () => takeVehicleDocumentImage('rearPhoto'),
          })}
          {renderUploadCard({
            field: 'sidePhoto',
            label: t('Side photo'),
            helper: t('Select or take a clear side-view image of the vehicle.'),
            remoteUrl: existingVehicle?.sidePhotoUrl,
            onPick: () => pickImage('sidePhoto'),
            onTakeImage: () => takeVehicleDocumentImage('sidePhoto'),
          })}
          {renderUploadCard({
            field: 'licensePlatePhoto',
            label: t('License plate photo'),
            helper: t('Make sure the plate number is fully readable.'),
            remoteUrl: existingVehicle?.licensePlatePhotoUrl,
            onPick: () => pickImage('licensePlatePhoto'),
            onTakeImage: () => takeVehicleDocumentImage('licensePlatePhoto'),
          })}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('Vehicle Documents')}</Text>
          {renderUploadCard({
            field: 'registrationFrontDocument',
            label: t('Registration card front side'),
            helper: t('Select or take a clear image of the front side of the vehicle registration card.'),
            remoteUrl: existingVehicle?.registrationFrontDocumentUrl,
            onPick: () => pickImage('registrationFrontDocument'),
            onTakeImage: () => takeVehicleDocumentImage('registrationFrontDocument'),
          })}
          {renderUploadCard({
            field: 'registrationBackDocument',
            label: t('Registration card back side'),
            helper: t('Select or take a clear image of the back side of the vehicle registration card.'),
            remoteUrl: existingVehicle?.registrationBackDocumentUrl,
            onPick: () => pickImage('registrationBackDocument'),
            onTakeImage: () => takeVehicleDocumentImage('registrationBackDocument'),
          })}
          {renderUploadCard({
            field: 'insuranceDocument',
            label: t('Insurance document'),
            helper: t('Select or take a clear image of the valid vehicle insurance document.'),
            remoteUrl: existingVehicle?.insuranceDocumentUrl,
            onPick: () => pickImage('insuranceDocument'),
            onTakeImage: () => takeVehicleDocumentImage('insuranceDocument'),
          })}

          <Text style={styles.fieldLabel}>{t('Insurance expiry date')}</Text>
          <Pressable
            style={styles.dateField}
            onPress={() => setActiveDateField('insuranceExpiryDate')}
          >
            <Text style={vehicleForm.insuranceExpiryDate ? styles.dateValue : styles.datePlaceholder}>
              {formatDate(vehicleForm.insuranceExpiryDate)}
            </Text>
          </Pressable>
          {hasAttemptedSubmit && fieldErrors.insuranceExpiryDate ? (
            <Text style={styles.errorText}>{fieldErrors.insuranceExpiryDate}</Text>
          ) : null}

          <Text style={styles.fieldLabel}>{t('Registration expiry date')}</Text>
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
          {hasAttemptedSubmit && fieldErrors.registrationExpiryDate ? (
            <Text style={styles.errorText}>{fieldErrors.registrationExpiryDate}</Text>
          ) : null}
        </View>

        {existingVehicle?.status === 'REJECTED' && existingVehicle.rejectionReason ? (
          <Text style={styles.errorText}>
            {t('Rejection reason')}: {existingVehicle.rejectionReason}
          </Text>
        ) : null}
        {existingVehicle?.status === 'PENDING_REVIEW' ? (
          <Text style={styles.infoText}>{t('Your vehicle is pending approval.')}</Text>
        ) : null}
        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
        {submitSuccess ? <Text style={styles.successText}>{submitSuccess}</Text> : null}

        <Pressable
          style={[styles.primaryButton, isSaving && styles.buttonDisabled]}
          disabled={isSaving}
          onPress={() => void onSaveVehicle()}
        >
          {isSaving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {flow === 'management'
                ? isEditing
                  ? t('Save Changes')
                  : t('Save Vehicle')
                : t('Next')}
            </Text>
          )}
        </Pressable>
      </ScrollView>

      {activeDateField ? (
        <DateTimePicker
          mode="date"
          display="default"
          value={normalizeDateValue(vehicleForm[activeDateField])}
          minimumDate={new Date()}
          onChange={(event, selectedDate) => {
            if (event.type === 'dismissed') {
              setActiveDateField(null);
              return;
            }

            if (selectedDate) {
              onVehicleChange(activeDateField, selectedDate.toISOString().slice(0, 10));
            }
            setActiveDateField(null);
          }}
        />
      ) : null}
      {activeDateField ? (
        <Pressable style={styles.dateDismissButton} onPress={() => setActiveDateField(null)}>
          <Text style={styles.dateDismissText}>{t('Done')}</Text>
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
                  ? t('Select vehicle type')
                  : activeSelectorField === 'brand'
                    ? t('Select vehicle brand')
                    : activeSelectorField === 'model'
                      ? t('Select vehicle model')
                      : activeSelectorField === 'year'
                        ? t('Select vehicle year')
                      : t('Select vehicle condition')}
              </Text>
              <Pressable onPress={closeSelector}>
                <Text style={styles.modalCloseText}>{t('Close')}</Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.searchInput}
              placeholder={t('Search')}
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
                <Text style={styles.emptySelectorText}>{t('No matching options found.')}</Text>
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
  helper: { color: '#64748B', fontSize: 13 },
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
  docRow: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
    gap: 6,
  },
  docButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  onboardingPreview: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
  },
  fileName: { color: '#475569', fontSize: 12 },
  documentPlaceholder: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
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
    minHeight: 50,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#1D4ED8',
    fontWeight: '700',
    fontSize: 15,
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
