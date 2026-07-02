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

import {
  getMyDriverVehicle,
  getMyVehicleLoad,
  setMyDefaultVehicleLoad,
  upsertMyVehicleLoad,
} from '@/lib/api';
import {
  DRIVER_CARGO_TYPE_OPTIONS,
  createDefaultLoadWorkingSchedule,
  isCarCarrierVehicleType,
  mapWorkingAvailabilityToForm,
} from '@/lib/driver-loads';
import { useAuth } from '@/context/auth-context';
import type {
  DriverCargoType,
  DriverVehicle,
  DriverVehicleLoadFormDay,
  DriverVehicleLoadFormValues,
  DriverVehicleLoadPayload,
  WorkingAvailabilityItem,
} from '@/types/auth';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function toSingleParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function toMinutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function parsePositiveNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return Number.isInteger(value) ? String(value) : String(value);
}

function buildInitialForm(vehicle: DriverVehicle): DriverVehicleLoadFormValues {
  return {
    name: vehicle.loadProfileName ?? '',
    maxLoadKg: formatNumber(vehicle.capacityKg),
    cargoLengthM:
      vehicle.lengthCm !== null && vehicle.lengthCm !== undefined
        ? formatNumber(vehicle.lengthCm / 100)
        : '',
    cargoWidthM:
      vehicle.widthCm !== null && vehicle.widthCm !== undefined
        ? formatNumber(vehicle.widthCm / 100)
        : '',
    cargoHeightM:
      vehicle.heightCm !== null && vehicle.heightCm !== undefined
        ? formatNumber(vehicle.heightCm / 100)
        : '',
    allowedCargoTypes: (vehicle.allowedCargoTypes ?? []) as DriverCargoType[],
    workingSchedule: mapWorkingAvailabilityToForm(vehicle.workingSchedule),
    isDefault: Boolean(vehicle.isDefaultLoadProfile),
  };
}

function mapFormSchedule(schedule: DriverVehicleLoadFormDay[]): WorkingAvailabilityItem[] {
  return schedule.map((day) => ({
    dayOfWeek: day.dayOfWeek,
    isAvailable: day.isAvailable,
    timeRanges:
      day.isAvailable && day.startTime.trim() && day.endTime.trim()
        ? [{ startTime: day.startTime.trim(), endTime: day.endTime.trim() }]
        : [],
  }));
}

export default function VehicleLoadScreen() {
  const router = useRouter();
  const { vehicleId: vehicleIdParam } = useLocalSearchParams<{ vehicleId?: string }>();
  const { signOut } = useAuth();

  const vehicleId = toSingleParam(vehicleIdParam);
  const [vehicle, setVehicle] = useState<DriverVehicle | null>(null);
  const [form, setForm] = useState<DriverVehicleLoadFormValues>({
    name: '',
    maxLoadKg: '',
    cargoLengthM: '',
    cargoWidthM: '',
    cargoHeightM: '',
    allowedCargoTypes: [],
    workingSchedule: createDefaultLoadWorkingSchedule(),
    isDefault: false,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>('');
  const [submitError, setSubmitError] = useState<string>('');
  const [submitSuccess, setSubmitSuccess] = useState<string>('');

  const isCarCarrier = isCarCarrierVehicleType(vehicle?.vehicleType);

  const loadVehicle = useCallback(async (): Promise<void> => {
    if (!vehicleId) {
      setLoadError('Vehicle not found. Please choose a vehicle first.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError('');

    try {
      const vehicleResponse = await getMyDriverVehicle(vehicleId);
      setVehicle(vehicleResponse.vehicle);
      setForm(buildInitialForm(vehicleResponse.vehicle));

      try {
        const loadResponse = await getMyVehicleLoad(vehicleId);
        setForm({
          name: loadResponse.name ?? '',
          maxLoadKg: formatNumber(loadResponse.maxLoadKg),
          cargoLengthM: formatNumber(loadResponse.cargoLengthM),
          cargoWidthM: formatNumber(loadResponse.cargoWidthM),
          cargoHeightM: formatNumber(loadResponse.cargoHeightM),
          allowedCargoTypes: loadResponse.allowedCargoTypes,
          workingSchedule: mapWorkingAvailabilityToForm(loadResponse.workingSchedule),
          isDefault: loadResponse.isDefault,
        });
      } catch {
        // Keep the vehicle payload as the initial fallback when no saved load exists yet.
      }
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'Failed to load vehicle capacity.',
      );
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

    if (form.allowedCargoTypes.length === 0) {
      errors.allowedCargoTypes = 'Select at least one cargo type.';
    }

    const maxLoadKg = parsePositiveNumber(form.maxLoadKg);
    if (!isCarCarrier && maxLoadKg === undefined) {
      errors.maxLoadKg = 'Maximum load capacity is required for this vehicle type.';
    }

    const cargoLengthM = parsePositiveNumber(form.cargoLengthM);
    const cargoWidthM = parsePositiveNumber(form.cargoWidthM);
    const cargoHeightM = parsePositiveNumber(form.cargoHeightM);

    if (!isCarCarrier && cargoLengthM === undefined) {
      errors.cargoLengthM = 'Length is required for this vehicle type.';
    }
    if (!isCarCarrier && cargoWidthM === undefined) {
      errors.cargoWidthM = 'Width is required for this vehicle type.';
    }
    if (!isCarCarrier && cargoHeightM === undefined) {
      errors.cargoHeightM = 'Height is required for this vehicle type.';
    }

    let availableDayCount = 0;

    form.workingSchedule.forEach((day) => {
      if (!day.isAvailable) return;

      availableDayCount += 1;

      if (!TIME_REGEX.test(day.startTime.trim())) {
        errors[`start-${day.dayOfWeek}`] = `${day.label}: start time must be HH:mm.`;
      }
      if (!TIME_REGEX.test(day.endTime.trim())) {
        errors[`end-${day.dayOfWeek}`] = `${day.label}: end time must be HH:mm.`;
      }
      if (
        TIME_REGEX.test(day.startTime.trim()) &&
        TIME_REGEX.test(day.endTime.trim()) &&
        toMinutes(day.endTime.trim()) <= toMinutes(day.startTime.trim())
      ) {
        errors[`end-${day.dayOfWeek}`] = `${day.label}: end time must be after start time.`;
      }
    });

    if (availableDayCount === 0) {
      errors.workingSchedule = 'Select at least one available day.';
    }

    return errors;
  }, [form, isCarCarrier]);

  const isFormValid = Object.keys(fieldErrors).length === 0;

  const onChange = <K extends keyof DriverVehicleLoadFormValues>(
    key: K,
    value: DriverVehicleLoadFormValues[K],
  ): void => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onScheduleChange = (
    dayOfWeek: DriverVehicleLoadFormDay['dayOfWeek'],
    patch: Partial<DriverVehicleLoadFormDay>,
  ): void => {
    setForm((prev) => ({
      ...prev,
      workingSchedule: prev.workingSchedule.map((entry) =>
        entry.dayOfWeek === dayOfWeek ? { ...entry, ...patch } : entry,
      ),
    }));
  };

  const onToggleCargoType = (cargoType: DriverCargoType): void => {
    setForm((prev) => {
      const exists = prev.allowedCargoTypes.includes(cargoType);
      return {
        ...prev,
        allowedCargoTypes: exists
          ? prev.allowedCargoTypes.filter((item) => item !== cargoType)
          : [...prev.allowedCargoTypes, cargoType],
      };
    });
  };

  const onSave = async (): Promise<void> => {
    if (!vehicleId || !vehicle || isSaving || !isFormValid) return;

    setIsSaving(true);
    setSubmitError('');
    setSubmitSuccess('');

    const payload: DriverVehicleLoadPayload = {
      name: form.name.trim() || undefined,
      maxLoadKg: parsePositiveNumber(form.maxLoadKg),
      cargoLengthM: isCarCarrier ? undefined : parsePositiveNumber(form.cargoLengthM),
      cargoWidthM: isCarCarrier ? undefined : parsePositiveNumber(form.cargoWidthM),
      cargoHeightM: isCarCarrier ? undefined : parsePositiveNumber(form.cargoHeightM),
      dimensionsAreStandard: isCarCarrier,
      allowedCargoTypes: form.allowedCargoTypes,
      workingSchedule: mapFormSchedule(form.workingSchedule),
      isDefault: form.isDefault,
    };

    try {
      const response = await upsertMyVehicleLoad(vehicleId, payload);
      if (form.isDefault && !response.isDefault) {
        await setMyDefaultVehicleLoad(vehicleId);
      }
      setSubmitSuccess('Load capacity saved successfully.');
      router.replace('/my-vehicles');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save load capacity.';
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

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1D4ED8" />
        <Text style={styles.helper}>Loading vehicle capacity...</Text>
      </View>
    );
  }

  if (loadError || !vehicle) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{loadError || 'Vehicle not found.'}</Text>
        <Pressable style={styles.secondaryButton} onPress={() => router.replace('/my-vehicles')}>
          <Text style={styles.secondaryButtonText}>Back to My Vehicles</Text>
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
          <Text style={styles.title}>Set Load Capacity</Text>
          <Text style={styles.subtitle}>
            Add your vehicle capacity and working availability so we can send you suitable
            requests.
          </Text>
          <Text style={styles.helper}>
            {vehicle.make} {vehicle.model} ({vehicle.plateNumber})
          </Text>
        </View>

        <Text style={styles.label}>Load name</Text>
        <TextInput
          style={styles.input}
          placeholder="Small Car Carrier"
          value={form.name}
          onChangeText={(value) => onChange('name', value)}
        />

        <Text style={styles.label}>Maximum load capacity (kg)</Text>
        <TextInput
          style={styles.input}
          placeholder={isCarCarrier ? 'Optional for car carriers' : 'Maximum load capacity (kg)'}
          keyboardType="numeric"
          value={form.maxLoadKg}
          onChangeText={(value) => onChange('maxLoadKg', value)}
        />
        {fieldErrors.maxLoadKg ? <Text style={styles.errorText}>{fieldErrors.maxLoadKg}</Text> : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cargo Space Dimensions</Text>
          {isCarCarrier ? (
            <View style={styles.noteCard}>
              <Text style={styles.noteTitle}>Standard dimensions</Text>
              <Text style={styles.noteText}>
                Car carriers use standard dimensions, so you do not need to enter cargo
                dimensions.
              </Text>
            </View>
          ) : (
            <View style={styles.dimensionsGrid}>
              <View style={styles.dimensionField}>
                <Text style={styles.label}>Length (m)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="2.0"
                  keyboardType="numeric"
                  value={form.cargoLengthM}
                  onChangeText={(value) => onChange('cargoLengthM', value)}
                />
                {fieldErrors.cargoLengthM ? (
                  <Text style={styles.errorText}>{fieldErrors.cargoLengthM}</Text>
                ) : null}
              </View>
              <View style={styles.dimensionField}>
                <Text style={styles.label}>Width (m)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="1.8"
                  keyboardType="numeric"
                  value={form.cargoWidthM}
                  onChangeText={(value) => onChange('cargoWidthM', value)}
                />
                {fieldErrors.cargoWidthM ? (
                  <Text style={styles.errorText}>{fieldErrors.cargoWidthM}</Text>
                ) : null}
              </View>
              <View style={styles.dimensionField}>
                <Text style={styles.label}>Height (m)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="1.2"
                  keyboardType="numeric"
                  value={form.cargoHeightM}
                  onChangeText={(value) => onChange('cargoHeightM', value)}
                />
                {fieldErrors.cargoHeightM ? (
                  <Text style={styles.errorText}>{fieldErrors.cargoHeightM}</Text>
                ) : null}
              </View>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Allowed cargo types</Text>
          <View style={styles.chipsRow}>
            {DRIVER_CARGO_TYPE_OPTIONS.map((option) => {
              const selected = form.allowedCargoTypes.includes(option.value);
              return (
                <Pressable
                  key={option.value}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => onToggleCargoType(option.value)}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
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
          <Text style={styles.sectionTitle}>Working Availability</Text>
          {form.workingSchedule.map((day) => (
            <View key={day.dayOfWeek} style={styles.scheduleCard}>
              <View style={styles.scheduleHeader}>
                <Text style={styles.scheduleDay}>{day.label}</Text>
                <Switch
                  value={day.isAvailable}
                  onValueChange={(value) =>
                    onScheduleChange(day.dayOfWeek, {
                      isAvailable: value,
                      startTime: value ? day.startTime || '08:00' : '',
                      endTime: value ? day.endTime || '18:00' : '',
                    })
                  }
                />
              </View>

              {day.isAvailable ? (
                <View style={styles.timeRow}>
                  <View style={styles.timeField}>
                    <Text style={styles.label}>Start</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="08:00"
                      value={day.startTime}
                      onChangeText={(value) =>
                        onScheduleChange(day.dayOfWeek, { startTime: value })
                      }
                    />
                    {fieldErrors[`start-${day.dayOfWeek}`] ? (
                      <Text style={styles.errorText}>{fieldErrors[`start-${day.dayOfWeek}`]}</Text>
                    ) : null}
                  </View>
                  <View style={styles.timeField}>
                    <Text style={styles.label}>End</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="18:00"
                      value={day.endTime}
                      onChangeText={(value) =>
                        onScheduleChange(day.dayOfWeek, { endTime: value })
                      }
                    />
                    {fieldErrors[`end-${day.dayOfWeek}`] ? (
                      <Text style={styles.errorText}>{fieldErrors[`end-${day.dayOfWeek}`]}</Text>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </View>
          ))}
          {fieldErrors.workingSchedule ? (
            <Text style={styles.errorText}>{fieldErrors.workingSchedule}</Text>
          ) : null}
        </View>

        <View style={styles.defaultRow}>
          <View style={styles.defaultCopy}>
            <Text style={styles.defaultLabel}>Set as preferred default load</Text>
            <Text style={styles.defaultHint}>
              This load will be used as your preferred default option.
            </Text>
          </View>
          <Switch value={form.isDefault} onValueChange={(value) => onChange('isDefault', value)} />
        </View>

        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
        {submitSuccess ? <Text style={styles.successText}>{submitSuccess}</Text> : null}

        <Pressable
          style={[styles.primaryButton, (!isFormValid || isSaving) && styles.buttonDisabled]}
          onPress={() => void onSave()}
          disabled={!isFormValid || isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Save Load</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    padding: 20,
    gap: 14,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 12,
    backgroundColor: '#FFFFFF',
  },
  header: {
    gap: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 20,
  },
  helper: {
    color: '#64748B',
    fontSize: 13,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 16,
  },
  label: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  dimensionsGrid: {
    gap: 10,
  },
  dimensionField: {
    gap: 6,
  },
  noteCard: {
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  noteTitle: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  noteText: {
    color: '#1E40AF',
    fontSize: 13,
    lineHeight: 18,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  chipSelected: {
    borderColor: '#1D4ED8',
    backgroundColor: '#DBEAFE',
  },
  chipText: {
    color: '#334155',
    fontWeight: '600',
    fontSize: 13,
  },
  chipTextSelected: {
    color: '#1D4ED8',
  },
  scheduleCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  scheduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scheduleDay: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 15,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  timeField: {
    flex: 1,
    gap: 6,
  },
  defaultRow: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  defaultCopy: {
    flex: 1,
    gap: 4,
  },
  defaultLabel: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 15,
  },
  defaultHint: {
    color: '#64748B',
    fontSize: 13,
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 10,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryButtonText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 15,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 13,
  },
  successText: {
    color: '#15803D',
    fontSize: 13,
    fontWeight: '600',
  },
});
