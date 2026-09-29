import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
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

import { DriverIcon, type DriverIconName } from '@/components/driver-icon';
import { DRIVER_ONBOARDING_STEP_LABELS } from '@/components/driver-onboarding-checklist';
import { useAuth } from '@/context/auth-context';
import { getSourceErrorMessage } from '@/localization/response-message';
import {
  getDriverVehicle,
  getVehicleLoadCapacity,
  saveVehicleLoadCapacity,
} from '@/lib/api';
import {
  clearLoadCapacityDraft,
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
import { useAndroidKeyboardInset } from '@/hooks/use-android-keyboard-inset';
import type {
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

function toNumericInput(value?: number | null): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function createEmptyCapacityForm(): CapacityFormState {
  return {
    name: '', maxLoadKg: '', cargoLengthM: '', cargoWidthM: '', cargoHeightM: '',
    allowedCargoTypes: [], isDefault: true,
  };
}

function buildFormState(
  vehicle: DriverVehicle,
  capacity?: VehicleLoadCapacity | null,
): CapacityFormState {
  const defaults = createEmptyCapacityForm();

  return {
    name: capacity?.name ?? vehicle.loadProfileName ?? defaults.name,
    maxLoadKg: toNumericInput(capacity?.maxLoadKg ?? vehicle.capacityKg) || defaults.maxLoadKg,
    cargoLengthM: toNumericInput(
      capacity?.cargoLengthM ??
        (vehicle.lengthCm !== null && vehicle.lengthCm !== undefined
          ? Number((vehicle.lengthCm / 100).toFixed(2))
          : null),
    ) || defaults.cargoLengthM,
    cargoWidthM: toNumericInput(
      capacity?.cargoWidthM ??
        (vehicle.widthCm !== null && vehicle.widthCm !== undefined
          ? Number((vehicle.widthCm / 100).toFixed(2))
          : null),
    ) || defaults.cargoWidthM,
    cargoHeightM: toNumericInput(
      capacity?.cargoHeightM ??
        (vehicle.heightCm !== null && vehicle.heightCm !== undefined
          ? Number((vehicle.heightCm / 100).toFixed(2))
          : null),
    ) || defaults.cargoHeightM,
    allowedCargoTypes:
      capacity?.allowedCargoTypes?.length
        ? capacity.allowedCargoTypes
        : vehicle.allowedCargoTypes?.length
          ? vehicle.allowedCargoTypes
          : defaults.allowedCargoTypes,
    isDefault: Boolean(capacity?.isDefault ?? vehicle.isDefaultLoadProfile ?? defaults.isDefault),
  };
}

function getVehicleIcon(vehicleType: DriverVehicle['vehicleType']): DriverIconName {
  if (vehicleType === 'MOTORCYCLE') return 'motorcycle';
  if (vehicleType === 'OPEN_CAR_CARRIER' || vehicleType === 'ENCLOSED_CARRIER') return 'car';
  return 'truck';
}

export default function LoadCapacityScreen() {
  const keyboardInset = useAndroidKeyboardInset();
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
  const [hydratedVehicleId, setHydratedVehicleId] = useState('');

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
    setHasHydratedDraft(false);
    setLoadError('');

    try {
      const currentVehicle = await getDriverVehicle(vehicleId);
      const draftRaw = flow === 'onboarding' ? await readLoadCapacityDraft(vehicleId) : null;
      const draft = draftRaw ? (JSON.parse(draftRaw) as CapacityFormState) : null;
      let capacity: VehicleLoadCapacity | null = null;

      try {
        capacity = await getVehicleLoadCapacity(vehicleId);
      } catch (error) {
        const message = getSourceErrorMessage(error).toLowerCase();
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
      setHydratedVehicleId(vehicleId);
      setHasHydratedDraft(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('Failed to load vehicle capacity.');
      const normalized = getSourceErrorMessage(error, message).toLowerCase();
      if (normalized.includes('unauthorized') || normalized.includes('token')) {
        await signOut();
        router.replace('/');
        return;
      }
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }, [flow, router, signOut, t, vehicleId]);

  useEffect(() => {
    if (flow !== 'onboarding' || !hasHydratedDraft || hydratedVehicleId !== vehicleId || !form) return;
    void persistLoadCapacityDraft(vehicleId, JSON.stringify(form)).catch(() => {});
  }, [flow, form, hasHydratedDraft, hydratedVehicleId, vehicleId]);

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
          await clearLoadCapacityDraft(vehicleId);
        } catch {
          // The server has saved the capacity; draft cleanup can be retried later.
        }
        router.replace(`/check-details?vehicleId=${encodeURIComponent(vehicleId)}`);
        return;
      }

      setSubmitSuccess(
        existingCapacity ? t('Load capacity updated successfully.') : t('Load capacity saved successfully.'),
      );
      setTimeout(() => {
        router.replace(returnTo);
      }, 500);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('Failed to save load capacity.');
      const normalized = getSourceErrorMessage(error, message).toLowerCase();
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
        <ActivityIndicator size="large" color="#F4B900" />
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
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          keyboardInset > 0 ? { paddingBottom: 40 + keyboardInset } : undefined,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.progress}>
            {flow === 'onboarding' ? t(DRIVER_ONBOARDING_STEP_LABELS[4]) : t('Vehicle Capacity Management')}
          </Text>
          <Text style={styles.title}>{t('Define Load Capacity')}</Text>
          <Text style={styles.subtitle}>
            {vehicle.brand} {vehicle.model} ({vehicle.year}) • {VEHICLE_TYPE_LABELS[vehicle.vehicleType]}
          </Text>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <View style={styles.infoIcon}>
              <DriverIcon name={getVehicleIcon(vehicle.vehicleType)} size={25} color="#171717" strokeWidth={2} />
            </View>
            <Text style={styles.infoTitle}>{t('Capacity guidance')}</Text>
          </View>
          <Text style={styles.infoText}>{guidance?.note ? t(guidance.note) : null}</Text>
          <Text style={styles.infoText}>{t('Suggested cargo types')}: {guidance ? t(guidance.usageLabel) : t('Custom transport')}</Text>
          {existingCapacity?.allowedCargoTypes?.length ? (
            <Text style={styles.infoText}>
              {t('Current cargo types')}: {formatCargoTypes(existingCapacity.allowedCargoTypes)
                .split(', ')
                .map((label) => t(label))
                .join(', ')}
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
              trackColor={{ false: '#CBD5E1', true: '#F7D560' }}
              thumbColor={form.isDefault ? '#F1B900' : '#F7F8F9'}
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
            <ActivityIndicator color="#171717" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {flow === 'onboarding'
                ? t('Continue to check details')
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
  container: { flex: 1, backgroundColor: '#F7F8F9' },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#F7F8F9',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 20,
  },
  loadingText: { color: '#707A8C' },
  content: {
    paddingHorizontal: 22,
    paddingTop: 25,
    paddingBottom: 40,
    gap: 14,
  },
  header: { gap: 6, marginBottom: 5 },
  progress: { color: '#A66F00', fontWeight: '800', fontSize: 13 },
  title: {
    color: '#151515',
    fontSize: 31,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  subtitle: { color: '#707A8C', fontSize: 15, lineHeight: 21 },
  infoCard: {
    borderWidth: 1,
    borderColor: '#DFE3E8',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    gap: 6,
    shadowColor: '#111111',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  infoHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 3 },
  infoIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFC515',
  },
  infoTitle: { fontSize: 18, fontWeight: '800', color: '#202020' },
  infoText: { color: '#707A8C', fontSize: 13, lineHeight: 19 },
  section: {
    borderWidth: 1,
    borderColor: '#DFE3E8',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    gap: 10,
    shadowColor: '#111111',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#202020' },
  helperText: { color: '#707A8C', fontSize: 13, lineHeight: 19 },
  fieldLabel: { color: '#505A6A', fontSize: 13, fontWeight: '700' },
  smallLabel: { color: '#505A6A', fontSize: 12, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#DFE3E8',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: '#202020',
    backgroundColor: '#FCFCFC',
  },
  standardDimensionsCard: {
    borderRadius: 14,
    backgroundColor: '#FFF9E6',
    padding: 12,
    gap: 4,
  },
  standardDimensionsTitle: { color: '#202020', fontWeight: '800' },
  standardDimensionsText: { color: '#707A8C', fontSize: 13 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    borderWidth: 1,
    borderColor: '#F1D46B',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  chipSelected: {
    backgroundColor: '#FFC515',
    borderColor: '#FFC515',
  },
  chipText: { color: '#8A6200', fontWeight: '700' },
  chipTextSelected: { color: '#171717' },
  dayCard: {
    borderWidth: 1,
    borderColor: '#DFE3E8',
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
  dayTitle: { fontSize: 16, fontWeight: '800', color: '#202020' },
  timeRangesWrap: { gap: 10 },
  timeRangeRow: {
    borderWidth: 1,
    borderColor: '#DFE3E8',
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
    minHeight: 54,
    borderRadius: 17,
    backgroundColor: '#FFC515',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { color: '#171717', fontWeight: '800', fontSize: 15 },
  secondaryButton: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F1B900',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryButtonText: { color: '#8A6200', fontWeight: '800' },
  buttonDisabled: { opacity: 0.6 },
  errorText: { color: '#C73333', fontSize: 13 },
  successText: { color: '#166534', fontSize: 13, fontWeight: '600' },
});
