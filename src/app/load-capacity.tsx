import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Switch,
} from 'react-native';

import { useAuth } from '@/context/auth-context';
import {
  getDriverDocumentsStatus,
  getDriverVehicles,
  getDriverVehicle,
  getVehicleLoadCapacity,
  saveVehicleLoadCapacity,
  submitDriverDocumentsForReview,
} from '@/lib/api';
import {
  clearLoadCapacityDraft,
  clearLastOnboardingRoute,
  clearOnboardingDocumentsStatus,
  persistLastOnboardingRoute,
  persistLoadCapacityDraft,
  readLoadCapacityDraft,
} from '@/lib/auth-storage';
import {
  CARGO_TYPE_OPTIONS,
  formatCargoTypes,
  getVehicleCapacityGuidance,
  isCarCarrierVehicleType,
  parsePositiveNumber,
  VEHICLE_TYPE_LABELS,
} from '@/lib/vehicle-load-capacity';
import type {
  DriverDocumentType,
  DriverVehicle,
  VehicleCargoType,
  VehicleLoadCapacity,
  VehicleLoadCapacityPayload,
} from '@/types/auth';

interface CapacityFormState {
  name: string;
  maxLoadKg: string;
  cargoLengthM: string;
  cargoWidthM: string;
  cargoHeightM: string;
  allowedCargoTypes: VehicleCargoType[];
  isDefault: boolean;
}

const REQUIRED_VEHICLE_DOCUMENT_TYPES: DriverDocumentType[] = [
  'VEHICLE_FRONT_PHOTO',
  'VEHICLE_REAR_PHOTO',
  'VEHICLE_SIDE_PHOTO',
  'VEHICLE_LICENSE_PLATE_PHOTO',
  'VEHICLE_REGISTRATION_FRONT',
  'VEHICLE_REGISTRATION_BACK',
  'VEHICLE_INSURANCE_DOCUMENT',
];

function hasCompleteVehicleDocuments(vehicle: DriverVehicle): boolean {
  const eligibleTypes = new Set(
    (vehicle.documents ?? [])
      .filter((document) => document.status !== 'REJECTED')
      .map((document) => document.type),
  );

  return REQUIRED_VEHICLE_DOCUMENT_TYPES.every((type) => eligibleTypes.has(type));
}

function hasCompleteLoadCapacityProfile(vehicle: DriverVehicle): boolean {
  if (!vehicle.allowedCargoTypes?.length) {
    return false;
  }

  if (isCarCarrierVehicleType(vehicle.vehicleType)) {
    return true;
  }

  return Boolean(
    vehicle.capacityKg &&
      vehicle.capacityKg > 0 &&
      vehicle.lengthCm &&
      vehicle.lengthCm > 0 &&
      vehicle.widthCm &&
      vehicle.widthCm > 0 &&
      vehicle.heightCm &&
      vehicle.heightCm > 0,
  );
}

function toNumericInput(value?: number | null): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function createTestCapacityDefaults(vehicle: DriverVehicle): CapacityFormState {
  const isCarrier = isCarCarrierVehicleType(vehicle.vehicleType);

  return {
    name: `${vehicle.brand} ${vehicle.model} Test Capacity`.trim(),
    maxLoadKg: isCarrier ? '2200' : '1200',
    cargoLengthM: isCarrier ? '' : '2.4',
    cargoWidthM: isCarrier ? '' : '1.6',
    cargoHeightM: isCarrier ? '' : '1.5',
    allowedCargoTypes: isCarrier ? ['VEHICLE'] : ['GOODS', 'FURNITURE'],
    isDefault: true,
  };
}

function buildFormState(
  vehicle: DriverVehicle,
  capacity?: VehicleLoadCapacity | null,
): CapacityFormState {
  const testDefaults = createTestCapacityDefaults(vehicle);

  return {
    name: capacity?.name ?? vehicle.loadProfileName ?? testDefaults.name,
    maxLoadKg: toNumericInput(capacity?.maxLoadKg ?? vehicle.capacityKg) || testDefaults.maxLoadKg,
    cargoLengthM: toNumericInput(
      capacity?.cargoLengthM ??
        (vehicle.lengthCm !== null && vehicle.lengthCm !== undefined
          ? Number((vehicle.lengthCm / 100).toFixed(2))
          : null),
    ) || testDefaults.cargoLengthM,
    cargoWidthM: toNumericInput(
      capacity?.cargoWidthM ??
        (vehicle.widthCm !== null && vehicle.widthCm !== undefined
          ? Number((vehicle.widthCm / 100).toFixed(2))
          : null),
    ) || testDefaults.cargoWidthM,
    cargoHeightM: toNumericInput(
      capacity?.cargoHeightM ??
        (vehicle.heightCm !== null && vehicle.heightCm !== undefined
          ? Number((vehicle.heightCm / 100).toFixed(2))
          : null),
    ) || testDefaults.cargoHeightM,
    allowedCargoTypes:
      capacity?.allowedCargoTypes?.length
        ? capacity.allowedCargoTypes
        : vehicle.allowedCargoTypes?.length
          ? vehicle.allowedCargoTypes
          : testDefaults.allowedCargoTypes,
    isDefault: Boolean(capacity?.isDefault ?? vehicle.isDefaultLoadProfile ?? testDefaults.isDefault),
  };
}

export default function LoadCapacityScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    vehicleId?: string;
    flow?: string;
    nextStep?: string;
    returnTo?: string;
  }>();
  const vehicleId =
    typeof params.vehicleId === 'string' && params.vehicleId.trim() ? params.vehicleId : '';
  const flow = params.flow === 'onboarding' ? 'onboarding' : 'management';
  const nextStep =
    params.nextStep === 'COMPLETE_PROFILE' ||
    params.nextStep === 'ADD_VEHICLE_DOCUMENTS' ||
    params.nextStep === 'UPLOAD_DOCUMENTS' ||
    params.nextStep === 'SET_AVAILABILITY' ||
    params.nextStep === 'WAITING_APPROVAL' ||
    params.nextStep === 'HOME'
      ? params.nextStep
      : 'WAITING_APPROVAL';
  const returnTo = params.returnTo === 'my-vehicles' ? '/my-vehicles' : '/manage-load-capacities';
  const { signOut } = useAuth();

  const [vehicle, setVehicle] = useState<DriverVehicle | null>(null);
  const [existingCapacity, setExistingCapacity] = useState<VehicleLoadCapacity | null>(null);
  const [form, setForm] = useState<CapacityFormState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [hasHydratedDraft, setHasHydratedDraft] = useState(false);

  useEffect(() => {
    if (flow !== 'onboarding' || !vehicleId) return;

    const route =
      `/load-capacity?vehicleId=${encodeURIComponent(vehicleId)}` +
      `&flow=onboarding&nextStep=${encodeURIComponent(nextStep)}`;
    void persistLastOnboardingRoute(route);
  }, [flow, nextStep, vehicleId]);

  const loadData = useCallback(async (): Promise<void> => {
    if (!vehicleId) {
      setLoadError(t('Vehicle ID is missing.'));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError('');

    try {
      const currentVehicle = await getDriverVehicle(vehicleId);
      const draftRaw = flow === 'onboarding' ? await readLoadCapacityDraft() : null;
      const draft = draftRaw ? (JSON.parse(draftRaw) as CapacityFormState) : null;
      let capacity: VehicleLoadCapacity | null = null;

      try {
        capacity = await getVehicleLoadCapacity(vehicleId);
      } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : '';
        if (!message.includes('not found')) {
          throw error;
        }
      }

      setVehicle(currentVehicle);
      setExistingCapacity(capacity);
      const nextForm = draft
        ? { ...buildFormState(currentVehicle, capacity), ...draft }
        : buildFormState(currentVehicle, capacity);
      setForm(nextForm);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('Failed to load vehicle capacity.');
      const normalized = message.toLowerCase();
      if (normalized.includes('unauthorized') || normalized.includes('token')) {
        await signOut();
        router.replace('/');
        return;
      }
      setLoadError(message);
    } finally {
      setHasHydratedDraft(true);
      setIsLoading(false);
    }
  }, [flow, router, signOut, t, vehicleId]);

  useEffect(() => {
    if (flow !== 'onboarding' || !hasHydratedDraft || !form) return;
    void persistLoadCapacityDraft(JSON.stringify(form));
  }, [flow, form, hasHydratedDraft]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadData();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadData]);

  const isCarCarrier = vehicle ? isCarCarrierVehicleType(vehicle.vehicleType) : false;
  const guidance = vehicle ? getVehicleCapacityGuidance(vehicle.vehicleType) : null;

  const fieldErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    if (!form || !vehicle) return errors;

    if (form.name.trim().length > 120) {
      errors.name = t('Custom capacity name must be 120 characters or fewer.');
    }

    const maxLoadKg = parsePositiveNumber(form.maxLoadKg);
    const cargoLengthM = parsePositiveNumber(form.cargoLengthM);
    const cargoWidthM = parsePositiveNumber(form.cargoWidthM);
    const cargoHeightM = parsePositiveNumber(form.cargoHeightM);

    if (isCarCarrier) {
      if (form.maxLoadKg.trim() && !maxLoadKg) {
        errors.maxLoadKg = t('Maximum load capacity must be greater than 0.');
      }
    } else {
      if (!maxLoadKg) {
        errors.maxLoadKg = t('Maximum load capacity is required and must be greater than 0.');
      }
      if (!cargoLengthM) {
        errors.cargoLengthM = t('Cargo length is required and must be greater than 0.');
      }
      if (!cargoWidthM) {
        errors.cargoWidthM = t('Cargo width is required and must be greater than 0.');
      }
      if (!cargoHeightM) {
        errors.cargoHeightM = t('Cargo height is required and must be greater than 0.');
      }
    }

    if (!form.allowedCargoTypes.length) {
      errors.allowedCargoTypes = t('Select at least one allowed cargo type.');
    }

    return errors;
  }, [form, isCarCarrier, t, vehicle]);

  const isFormValid = Boolean(form) && Object.keys(fieldErrors).length === 0;

  const onChange = <K extends keyof CapacityFormState>(
    key: K,
    value: CapacityFormState[K],
  ): void => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  };

  const onToggleCargoType = (cargoType: VehicleCargoType): void => {
    setForm((current) => {
      if (!current) return current;
      const exists = current.allowedCargoTypes.includes(cargoType);
      return {
        ...current,
        allowedCargoTypes: exists
          ? current.allowedCargoTypes.filter((value) => value !== cargoType)
          : [...current.allowedCargoTypes, cargoType],
      };
    });
  };

  const onSave = async (): Promise<void> => {
    if (!vehicleId || !vehicle || !form || !isFormValid || isSaving) return;

    setIsSaving(true);
    setSubmitError('');
    setSubmitSuccess('');

    try {
      const previousSnapshot: VehicleLoadCapacityPayload = {
        name: existingCapacity?.name ?? vehicle.loadProfileName ?? undefined,
        maxLoadKg:
          existingCapacity?.maxLoadKg ?? vehicle.capacityKg ?? undefined,
        cargoLengthM:
          existingCapacity?.cargoLengthM ??
          (vehicle.lengthCm !== null && vehicle.lengthCm !== undefined
            ? Number((vehicle.lengthCm / 100).toFixed(2))
            : undefined),
        cargoWidthM:
          existingCapacity?.cargoWidthM ??
          (vehicle.widthCm !== null && vehicle.widthCm !== undefined
            ? Number((vehicle.widthCm / 100).toFixed(2))
            : undefined),
        cargoHeightM:
          existingCapacity?.cargoHeightM ??
          (vehicle.heightCm !== null && vehicle.heightCm !== undefined
            ? Number((vehicle.heightCm / 100).toFixed(2))
            : undefined),
        dimensionsAreStandard:
          existingCapacity?.dimensionsAreStandard ?? Boolean(vehicle.dimensionsAreStandard),
        allowedCargoTypes: existingCapacity?.allowedCargoTypes ?? vehicle.allowedCargoTypes ?? [],
        isDefault: existingCapacity?.isDefault ?? Boolean(vehicle.isDefaultLoadProfile),
      };
      const payload: VehicleLoadCapacityPayload = {
        name: form.name.trim() || undefined,
        maxLoadKg: parsePositiveNumber(form.maxLoadKg),
        cargoLengthM: isCarCarrier ? undefined : parsePositiveNumber(form.cargoLengthM),
        cargoWidthM: isCarCarrier ? undefined : parsePositiveNumber(form.cargoWidthM),
        cargoHeightM: isCarCarrier ? undefined : parsePositiveNumber(form.cargoHeightM),
        dimensionsAreStandard: isCarCarrier,
        allowedCargoTypes: [...new Set(form.allowedCargoTypes)],
        isDefault: form.isDefault,
      };

      const response = await saveVehicleLoadCapacity(vehicleId, payload);
      setExistingCapacity(response);
      if (flow === 'onboarding') {
        try {
          const [documentsStatus, refreshedVehicle, refreshedVehicles] = await Promise.all([
            getDriverDocumentsStatus(),
            getDriverVehicle(vehicleId),
            getDriverVehicles(),
          ]);
          const reviewVehicle =
            refreshedVehicles.find((candidate) => candidate.id === vehicleId) ?? refreshedVehicle;

          if (documentsStatus.missingDocuments.length > 0) {
            throw new Error(
              t('Missing required documents: {{documents}}.', {
                documents: documentsStatus.missingDocuments.join(', '),
              }),
            );
          }

          if (!hasCompleteVehicleDocuments(reviewVehicle)) {
            throw new Error(t('The selected vehicle does not have all required documents.'));
          }

          if (!hasCompleteLoadCapacityProfile(refreshedVehicle)) {
            throw new Error(t('The selected vehicle does not have a complete load-capacity profile.'));
          }

          await submitDriverDocumentsForReview();
          await Promise.all([
            clearLoadCapacityDraft(),
            clearLastOnboardingRoute(),
            clearOnboardingDocumentsStatus(),
          ]);
          setSubmitSuccess(t('Submitted for review successfully.'));
          setTimeout(() => {
            router.replace('/waiting-approval');
          }, 500);
          return;
        } catch (error) {
          await saveVehicleLoadCapacity(vehicleId, previousSnapshot);
          throw error;
        }
      }

      setSubmitSuccess(
        existingCapacity ? t('Load capacity updated successfully.') : t('Load capacity saved successfully.'),
      );
      setTimeout(() => {
        router.replace(returnTo);
      }, 500);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('Failed to save load capacity.');
      const normalized = message.toLowerCase();
      if (normalized.includes('unauthorized') || normalized.includes('token')) {
        await signOut();
        router.replace('/');
        return;
      }
      setSubmitError(message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1D4ED8" />
        <Text style={styles.loadingText}>{t('Loading vehicle load capacity...')}</Text>
      </View>
    );
  }

  if (loadError || !vehicle || !form) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>{loadError || t('Vehicle not found.')}</Text>
        <Pressable style={styles.primaryButton} onPress={() => void loadData()}>
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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.progress}>
            {flow === 'onboarding' ? t('Next Step: Define Load Capacity') : t('Vehicle Capacity Management')}
          </Text>
          <Text style={styles.title}>{t('Define Load Capacity')}</Text>
          <Text style={styles.subtitle}>
            {vehicle.brand} {vehicle.model} ({vehicle.year}) • {VEHICLE_TYPE_LABELS[vehicle.vehicleType]}
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>{t('Capacity guidance')}</Text>
          <Text style={styles.infoText}>{guidance?.note}</Text>
          <Text style={styles.infoText}>{t('Suggested cargo types')}: {guidance ? guidance.usageLabel : t('Custom transport')}</Text>
          {existingCapacity?.allowedCargoTypes?.length ? (
            <Text style={styles.infoText}>
              {t('Current cargo types')}: {formatCargoTypes(existingCapacity.allowedCargoTypes)}
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('Load Profile')}</Text>
          <Text style={styles.fieldLabel}>{t('Custom capacity name')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('Small Car Carrier')}
            value={form.name}
            onChangeText={(value) => onChange('name', value)}
          />
          {fieldErrors.name ? <Text style={styles.errorText}>{fieldErrors.name}</Text> : null}

          <Text style={styles.fieldLabel}>{t('Maximum load capacity (kg)')}{isCarCarrier ? '' : ' *'}</Text>
          <TextInput
            style={styles.input}
            placeholder={guidance?.loadPlaceholder ?? '900'}
            keyboardType="decimal-pad"
            value={form.maxLoadKg}
            onChangeText={(value) => onChange('maxLoadKg', value)}
          />
          {fieldErrors.maxLoadKg ? <Text style={styles.errorText}>{fieldErrors.maxLoadKg}</Text> : null}

          {isCarCarrier ? (
            <View style={styles.standardDimensionsCard}>
              <Text style={styles.standardDimensionsTitle}>{t('Standard dimensions')}</Text>
              <Text style={styles.standardDimensionsText}>
                {t('No dimensions required for car carriers.')}
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.fieldLabel}>{t('Cargo length (m) *')}</Text>
              <TextInput
                style={styles.input}
                placeholder={guidance?.lengthPlaceholder ?? '2'}
                keyboardType="decimal-pad"
                value={form.cargoLengthM}
                onChangeText={(value) => onChange('cargoLengthM', value)}
              />
              {fieldErrors.cargoLengthM ? <Text style={styles.errorText}>{fieldErrors.cargoLengthM}</Text> : null}

              <Text style={styles.fieldLabel}>{t('Cargo width (m) *')}</Text>
              <TextInput
                style={styles.input}
                placeholder={guidance?.widthPlaceholder ?? '1.8'}
                keyboardType="decimal-pad"
                value={form.cargoWidthM}
                onChangeText={(value) => onChange('cargoWidthM', value)}
              />
              {fieldErrors.cargoWidthM ? <Text style={styles.errorText}>{fieldErrors.cargoWidthM}</Text> : null}

              <Text style={styles.fieldLabel}>{t('Cargo height (m) *')}</Text>
              <TextInput
                style={styles.input}
                placeholder={guidance?.heightPlaceholder ?? '1.2'}
                keyboardType="decimal-pad"
                value={form.cargoHeightM}
                onChangeText={(value) => onChange('cargoHeightM', value)}
              />
              {fieldErrors.cargoHeightM ? <Text style={styles.errorText}>{fieldErrors.cargoHeightM}</Text> : null}
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('Allowed Cargo Types')}</Text>
          <Text style={styles.helperText}>{t('Select one or more cargo types your vehicle can carry.')}</Text>
          <View style={styles.chipsWrap}>
            {CARGO_TYPE_OPTIONS.map((option) => {
              const isSelected = form.allowedCargoTypes.includes(option.value);
              return (
                <Pressable
                  key={option.value}
                  style={[styles.chip, isSelected && styles.chipSelected]}
                  onPress={() => onToggleCargoType(option.value)}
                >
                  <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                    {t(option.label)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {fieldErrors.allowedCargoTypes ? (
            <Text style={styles.errorText}>{fieldErrors.allowedCargoTypes}</Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <View style={styles.defaultRow}>
            <View style={styles.defaultTextWrap}>
              <Text style={styles.sectionTitle}>{t('Preferred Default Capacity')}</Text>
              <Text style={styles.helperText}>
                {t('Use this load profile as the default one for request matching.')}
              </Text>
            </View>
            <Switch
              value={form.isDefault}
              onValueChange={(value) => onChange('isDefault', value)}
              trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
              thumbColor={form.isDefault ? '#1D4ED8' : '#F8FAFC'}
            />
          </View>
        </View>

        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
        {submitSuccess ? <Text style={styles.successText}>{submitSuccess}</Text> : null}

        <Pressable
          style={[styles.primaryButton, (!isFormValid || isSaving) && styles.buttonDisabled]}
          disabled={!isFormValid || isSaving}
          onPress={() => void onSave()}
        >
          {isSaving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {flow === 'onboarding'
                ? t('Submit for Review')
                : existingCapacity
                  ? t('Save Capacity Changes')
                  : t('Save Load Capacity')}
            </Text>
          )}
        </Pressable>
      </ScrollView>
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
  infoCard: {
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  infoTitle: { fontSize: 16, fontWeight: '700', color: '#1E3A8A' },
  infoText: { color: '#1E3A8A', fontSize: 13 },
  section: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  helperText: { color: '#64748B', fontSize: 13 },
  fieldLabel: { color: '#334155', fontSize: 13, fontWeight: '600' },
  smallLabel: { color: '#334155', fontSize: 12, fontWeight: '600' },
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
  standardDimensionsCard: {
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    padding: 12,
    gap: 4,
  },
  standardDimensionsTitle: { color: '#0F172A', fontWeight: '700' },
  standardDimensionsText: { color: '#475569', fontSize: 13 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  chipSelected: {
    backgroundColor: '#1D4ED8',
    borderColor: '#1D4ED8',
  },
  chipText: { color: '#1D4ED8', fontWeight: '600' },
  chipTextSelected: { color: '#FFFFFF' },
  dayCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  dayTitleWrap: { flex: 1, gap: 4 },
  dayTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  timeRangesWrap: { gap: 10 },
  timeRangeRow: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 10,
    gap: 10,
  },
  timeFieldWrap: { gap: 6 },
  removeRangeButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  removeRangeButtonText: { color: '#B91C1C', fontWeight: '700' },
  defaultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  defaultTextWrap: { flex: 1, gap: 4 },
  primaryButton: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  secondaryButton: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryButtonText: { color: '#1D4ED8', fontWeight: '700' },
  buttonDisabled: { opacity: 0.6 },
  errorText: { color: '#B91C1C', fontSize: 13 },
  successText: { color: '#166534', fontSize: 13, fontWeight: '600' },
});
