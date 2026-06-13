import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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

import { useAuth } from '@/context/auth-context';
import { getDriverVehicle, getVehicleLoadCapacity, saveVehicleLoadCapacity } from '@/lib/api';
import {
  clearLastOnboardingRoute,
  persistLastOnboardingRoute,
} from '@/lib/auth-storage';
import { nextStepToRoute } from '@/lib/onboarding-route';
import {
  CARGO_TYPE_OPTIONS,
  createDefaultWorkingSchedule,
  DAY_LABELS,
  ensureFullWorkingSchedule,
  formatCargoTypes,
  getVehicleCapacityGuidance,
  isCarCarrierVehicleType,
  ORDERED_DAYS,
  parsePositiveNumber,
  TIME_24H_REGEX,
  toMinutes,
  VEHICLE_TYPE_LABELS,
} from '@/lib/vehicle-load-capacity';
import type {
  DriverVehicle,
  VehicleCargoType,
  VehicleLoadCapacity,
  VehicleLoadCapacityPayload,
  WorkingDaySchedule,
} from '@/types/auth';

interface CapacityFormState {
  name: string;
  maxLoadKg: string;
  cargoLengthM: string;
  cargoWidthM: string;
  cargoHeightM: string;
  allowedCargoTypes: VehicleCargoType[];
  workingSchedule: WorkingDaySchedule[];
  isDefault: boolean;
}

function toNumericInput(value?: number | null): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function buildFormState(
  vehicle: DriverVehicle,
  capacity?: VehicleLoadCapacity | null,
): CapacityFormState {
  const workingSchedule = ensureFullWorkingSchedule(
    capacity?.workingSchedule?.length
      ? capacity.workingSchedule
      : vehicle.workingSchedule?.length
        ? vehicle.workingSchedule
        : createDefaultWorkingSchedule(),
  );

  return {
    name: capacity?.name ?? vehicle.loadProfileName ?? '',
    maxLoadKg: toNumericInput(capacity?.maxLoadKg ?? vehicle.capacityKg),
    cargoLengthM: toNumericInput(
      capacity?.cargoLengthM ??
        (vehicle.lengthCm !== null && vehicle.lengthCm !== undefined
          ? Number((vehicle.lengthCm / 100).toFixed(2))
          : null),
    ),
    cargoWidthM: toNumericInput(
      capacity?.cargoWidthM ??
        (vehicle.widthCm !== null && vehicle.widthCm !== undefined
          ? Number((vehicle.widthCm / 100).toFixed(2))
          : null),
    ),
    cargoHeightM: toNumericInput(
      capacity?.cargoHeightM ??
        (vehicle.heightCm !== null && vehicle.heightCm !== undefined
          ? Number((vehicle.heightCm / 100).toFixed(2))
          : null),
    ),
    allowedCargoTypes:
      capacity?.allowedCargoTypes?.length
        ? capacity.allowedCargoTypes
        : vehicle.allowedCargoTypes?.length
          ? vehicle.allowedCargoTypes
          : isCarCarrierVehicleType(vehicle.vehicleType)
            ? ['VEHICLE']
            : ['GOODS'],
    workingSchedule,
    isDefault: Boolean(capacity?.isDefault ?? vehicle.isDefaultLoadProfile),
  };
}

export default function LoadCapacityScreen() {
  const router = useRouter();
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

  useEffect(() => {
    if (flow !== 'onboarding' || !vehicleId) return;

    const route =
      `/load-capacity?vehicleId=${encodeURIComponent(vehicleId)}` +
      `&flow=onboarding&nextStep=${encodeURIComponent(nextStep)}`;
    void persistLastOnboardingRoute(route);
  }, [flow, nextStep, vehicleId]);

  const loadData = useCallback(async (): Promise<void> => {
    if (!vehicleId) {
      setLoadError('Vehicle ID is missing.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError('');

    try {
      const currentVehicle = await getDriverVehicle(vehicleId);
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
      setForm(buildFormState(currentVehicle, capacity));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load vehicle capacity.';
      const normalized = message.toLowerCase();
      if (normalized.includes('unauthorized') || normalized.includes('token')) {
        await signOut();
        router.replace('/');
        return;
      }
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }, [router, signOut, vehicleId]);

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
      errors.name = 'Custom capacity name must be 120 characters or fewer.';
    }

    const maxLoadKg = parsePositiveNumber(form.maxLoadKg);
    const cargoLengthM = parsePositiveNumber(form.cargoLengthM);
    const cargoWidthM = parsePositiveNumber(form.cargoWidthM);
    const cargoHeightM = parsePositiveNumber(form.cargoHeightM);

    if (isCarCarrier) {
      if (form.maxLoadKg.trim() && !maxLoadKg) {
        errors.maxLoadKg = 'Maximum load capacity must be greater than 0.';
      }
    } else {
      if (!maxLoadKg) {
        errors.maxLoadKg = 'Maximum load capacity is required and must be greater than 0.';
      }
      if (!cargoLengthM) {
        errors.cargoLengthM = 'Cargo length is required and must be greater than 0.';
      }
      if (!cargoWidthM) {
        errors.cargoWidthM = 'Cargo width is required and must be greater than 0.';
      }
      if (!cargoHeightM) {
        errors.cargoHeightM = 'Cargo height is required and must be greater than 0.';
      }
    }

    if (!form.allowedCargoTypes.length) {
      errors.allowedCargoTypes = 'Select at least one allowed cargo type.';
    }

    if (form.workingSchedule.length !== 7) {
      errors.workingSchedule = 'Working schedule must contain exactly 7 days.';
      return errors;
    }

    const uniqueDays = new Set(form.workingSchedule.map((day) => day.dayOfWeek));
    if (uniqueDays.size !== 7) {
      errors.workingSchedule = 'Each working day must appear once.';
    }

    let availableDayCount = 0;

    form.workingSchedule.forEach((day) => {
      if (!day.isAvailable) {
        return;
      }

      availableDayCount += 1;

      if (!day.timeRanges.length) {
        errors[`day-${day.dayOfWeek}`] = `${DAY_LABELS[day.dayOfWeek]} needs at least one time range.`;
        return;
      }

      const normalizedRanges = [...day.timeRanges].sort((left, right) =>
        left.startTime.localeCompare(right.startTime),
      );

      normalizedRanges.forEach((range, index) => {
        const startKey = `${day.dayOfWeek}-start-${index}`;
        const endKey = `${day.dayOfWeek}-end-${index}`;

        if (!TIME_24H_REGEX.test(range.startTime.trim())) {
          errors[startKey] = `${DAY_LABELS[day.dayOfWeek]} start time must be HH:mm.`;
        }

        if (!TIME_24H_REGEX.test(range.endTime.trim())) {
          errors[endKey] = `${DAY_LABELS[day.dayOfWeek]} end time must be HH:mm.`;
        }

        if (
          TIME_24H_REGEX.test(range.startTime.trim()) &&
          TIME_24H_REGEX.test(range.endTime.trim()) &&
          toMinutes(range.startTime.trim()) >= toMinutes(range.endTime.trim())
        ) {
          errors[endKey] = `${DAY_LABELS[day.dayOfWeek]} end time must be after start time.`;
        }
      });

      for (let index = 1; index < normalizedRanges.length; index += 1) {
        const previous = normalizedRanges[index - 1];
        const current = normalizedRanges[index];
        if (
          TIME_24H_REGEX.test(previous.endTime.trim()) &&
          TIME_24H_REGEX.test(current.startTime.trim()) &&
          toMinutes(previous.endTime.trim()) > toMinutes(current.startTime.trim())
        ) {
          errors[`day-${day.dayOfWeek}`] = `${DAY_LABELS[day.dayOfWeek]} time ranges must not overlap.`;
        }
      }
    });

    if (availableDayCount === 0) {
      errors.availableDays = 'At least one working day must be available.';
    }

    return errors;
  }, [form, isCarCarrier, vehicle]);

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

  const onDayAvailabilityChange = (dayOfWeek: WorkingDaySchedule['dayOfWeek'], value: boolean): void => {
    setForm((current) => {
      if (!current) return current;
      return {
        ...current,
        workingSchedule: current.workingSchedule.map((day) =>
          day.dayOfWeek === dayOfWeek
            ? {
                ...day,
                isAvailable: value,
                timeRanges: value
                  ? day.timeRanges.length
                    ? day.timeRanges
                    : [{ startTime: '08:00', endTime: '18:00' }]
                  : [],
              }
            : day,
        ),
      };
    });
  };

  const onTimeRangeChange = (
    dayOfWeek: WorkingDaySchedule['dayOfWeek'],
    index: number,
    key: 'startTime' | 'endTime',
    value: string,
  ): void => {
    setForm((current) => {
      if (!current) return current;
      return {
        ...current,
        workingSchedule: current.workingSchedule.map((day) =>
          day.dayOfWeek === dayOfWeek
            ? {
                ...day,
                timeRanges: day.timeRanges.map((range, rangeIndex) =>
                  rangeIndex === index ? { ...range, [key]: value } : range,
                ),
              }
            : day,
        ),
      };
    });
  };

  const onAddTimeRange = (dayOfWeek: WorkingDaySchedule['dayOfWeek']): void => {
    setForm((current) => {
      if (!current) return current;
      return {
        ...current,
        workingSchedule: current.workingSchedule.map((day) =>
          day.dayOfWeek === dayOfWeek
            ? {
                ...day,
                timeRanges: [...day.timeRanges, { startTime: '08:00', endTime: '18:00' }],
              }
            : day,
        ),
      };
    });
  };

  const onRemoveTimeRange = (dayOfWeek: WorkingDaySchedule['dayOfWeek'], index: number): void => {
    setForm((current) => {
      if (!current) return current;
      return {
        ...current,
        workingSchedule: current.workingSchedule.map((day) =>
          day.dayOfWeek === dayOfWeek
            ? {
                ...day,
                timeRanges: day.timeRanges.filter((_, rangeIndex) => rangeIndex !== index),
              }
            : day,
        ),
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
        workingSchedule: ensureFullWorkingSchedule(form.workingSchedule).map((day) => ({
          dayOfWeek: day.dayOfWeek,
          isAvailable: day.isAvailable,
          timeRanges: day.isAvailable
            ? day.timeRanges.map((range) => ({
                startTime: range.startTime.trim(),
                endTime: range.endTime.trim(),
              }))
            : [],
        })),
        isDefault: form.isDefault,
      };

      const response = await saveVehicleLoadCapacity(vehicleId, payload);
      setExistingCapacity(response);
      setSubmitSuccess(existingCapacity ? 'Load capacity updated successfully.' : 'Load capacity saved successfully.');

      setTimeout(() => {
        if (flow === 'onboarding') {
          if (nextStep === 'HOME') {
            void clearLastOnboardingRoute();
          }
          router.replace(nextStepToRoute(nextStep));
        } else {
          router.replace(returnTo);
        }
      }, 500);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save load capacity.';
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
        <Text style={styles.loadingText}>Loading vehicle load capacity...</Text>
      </View>
    );
  }

  if (loadError || !vehicle || !form) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>{loadError || 'Vehicle not found.'}</Text>
        <Pressable style={styles.primaryButton} onPress={() => void loadData()}>
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
            {flow === 'onboarding' ? 'Next Step: Define Load Capacity' : 'Vehicle Capacity Management'}
          </Text>
          <Text style={styles.title}>Define Load Capacity</Text>
          <Text style={styles.subtitle}>
            {vehicle.brand} {vehicle.model} ({vehicle.year}) • {VEHICLE_TYPE_LABELS[vehicle.vehicleType]}
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Capacity guidance</Text>
          <Text style={styles.infoText}>{guidance?.note}</Text>
          <Text style={styles.infoText}>Suggested cargo types: {guidance ? guidance.usageLabel : 'Custom transport'}</Text>
          {existingCapacity?.allowedCargoTypes?.length ? (
            <Text style={styles.infoText}>
              Current cargo types: {formatCargoTypes(existingCapacity.allowedCargoTypes)}
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Load Profile</Text>
          <Text style={styles.fieldLabel}>Custom capacity name</Text>
          <TextInput
            style={styles.input}
            placeholder="Small Car Carrier"
            value={form.name}
            onChangeText={(value) => onChange('name', value)}
          />
          {fieldErrors.name ? <Text style={styles.errorText}>{fieldErrors.name}</Text> : null}

          <Text style={styles.fieldLabel}>Maximum load capacity (kg){isCarCarrier ? '' : ' *'}</Text>
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
              <Text style={styles.standardDimensionsTitle}>Standard dimensions</Text>
              <Text style={styles.standardDimensionsText}>
                No dimensions required for car carriers.
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.fieldLabel}>Cargo length (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder={guidance?.lengthPlaceholder ?? '2'}
                keyboardType="decimal-pad"
                value={form.cargoLengthM}
                onChangeText={(value) => onChange('cargoLengthM', value)}
              />
              {fieldErrors.cargoLengthM ? <Text style={styles.errorText}>{fieldErrors.cargoLengthM}</Text> : null}

              <Text style={styles.fieldLabel}>Cargo width (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder={guidance?.widthPlaceholder ?? '1.8'}
                keyboardType="decimal-pad"
                value={form.cargoWidthM}
                onChangeText={(value) => onChange('cargoWidthM', value)}
              />
              {fieldErrors.cargoWidthM ? <Text style={styles.errorText}>{fieldErrors.cargoWidthM}</Text> : null}

              <Text style={styles.fieldLabel}>Cargo height (m) *</Text>
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
          <Text style={styles.sectionTitle}>Allowed Cargo Types</Text>
          <Text style={styles.helperText}>Select one or more cargo types your vehicle can carry.</Text>
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
                    {option.label}
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
          <Text style={styles.sectionTitle}>Working Days and Hours</Text>
          <Text style={styles.helperText}>
            Add the days and time ranges when this vehicle is available.
          </Text>
          {form.workingSchedule.map((day) => (
            <View key={day.dayOfWeek} style={styles.dayCard}>
              <View style={styles.dayHeader}>
                <View style={styles.dayTitleWrap}>
                  <Text style={styles.dayTitle}>{DAY_LABELS[day.dayOfWeek]}</Text>
                  {fieldErrors[`day-${day.dayOfWeek}`] ? (
                    <Text style={styles.errorText}>{fieldErrors[`day-${day.dayOfWeek}`]}</Text>
                  ) : null}
                </View>
                <Switch
                  value={day.isAvailable}
                  onValueChange={(value) => onDayAvailabilityChange(day.dayOfWeek, value)}
                  trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                  thumbColor={day.isAvailable ? '#1D4ED8' : '#F8FAFC'}
                />
              </View>

              {day.isAvailable ? (
                <View style={styles.timeRangesWrap}>
                  {day.timeRanges.map((range, index) => (
                    <View key={`${day.dayOfWeek}-${index}`} style={styles.timeRangeRow}>
                      <View style={styles.timeFieldWrap}>
                        <Text style={styles.smallLabel}>Start</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="08:00"
                          value={range.startTime}
                          onChangeText={(value) =>
                            onTimeRangeChange(day.dayOfWeek, index, 'startTime', value)
                          }
                        />
                        {fieldErrors[`${day.dayOfWeek}-start-${index}`] ? (
                          <Text style={styles.errorText}>
                            {fieldErrors[`${day.dayOfWeek}-start-${index}`]}
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.timeFieldWrap}>
                        <Text style={styles.smallLabel}>End</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="18:00"
                          value={range.endTime}
                          onChangeText={(value) =>
                            onTimeRangeChange(day.dayOfWeek, index, 'endTime', value)
                          }
                        />
                        {fieldErrors[`${day.dayOfWeek}-end-${index}`] ? (
                          <Text style={styles.errorText}>
                            {fieldErrors[`${day.dayOfWeek}-end-${index}`]}
                          </Text>
                        ) : null}
                      </View>
                      {day.timeRanges.length > 1 ? (
                        <Pressable
                          style={styles.removeRangeButton}
                          onPress={() => onRemoveTimeRange(day.dayOfWeek, index)}
                        >
                          <Text style={styles.removeRangeButtonText}>Remove</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() => onAddTimeRange(day.dayOfWeek)}
                  >
                    <Text style={styles.secondaryButtonText}>Add Time Range</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))}
          {fieldErrors.availableDays ? <Text style={styles.errorText}>{fieldErrors.availableDays}</Text> : null}
          {fieldErrors.workingSchedule ? <Text style={styles.errorText}>{fieldErrors.workingSchedule}</Text> : null}
        </View>

        <View style={styles.section}>
          <View style={styles.defaultRow}>
            <View style={styles.defaultTextWrap}>
              <Text style={styles.sectionTitle}>Preferred Default Capacity</Text>
              <Text style={styles.helperText}>
                Use this load profile as the default one for request matching.
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
              {existingCapacity ? 'Save Capacity Changes' : 'Save Load Capacity'}
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
