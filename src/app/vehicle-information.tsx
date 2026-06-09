import { useRouter } from 'expo-router';
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

import { createDriverVehicle, getDriverVehicles } from '@/lib/api';
import { useAuth } from '@/context/auth-context';
import type { CreateDriverVehiclePayload, DriverVehicle, DriverVehicleForm, VehicleType } from '@/types/auth';

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

export default function VehicleInformationScreen() {
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
  const [existingVehicle, setExistingVehicle] = useState<DriverVehicle | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSavingVehicle, setIsSavingVehicle] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>('');
  const [loadHint, setLoadHint] = useState<string>('');
  const [submitError, setSubmitError] = useState<string>('');

  const loadExistingVehicle = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setLoadError('');
    setLoadHint('');

    try {
      const vehicles = await getDriverVehicles();
      if (vehicles.length > 0) {
        const first = vehicles[0];
        setExistingVehicle(first);
        setVehicleForm({
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
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load vehicle.';
      const normalized = message.toLowerCase();
      if (normalized.includes('timed out') || normalized.includes('canceled')) {
        setLoadHint('Could not preload existing vehicle data. You can still enter it manually.');
      } else {
        setLoadError(message);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadExistingVehicle();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadExistingVehicle]);

  const fieldErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    const currentYear = new Date().getFullYear();

    if (!vehicleForm.vehicleType) errors.vehicleType = 'Vehicle type is required.';
    if (!vehicleForm.make.trim() || vehicleForm.make.trim().length < 2) {
      errors.make = 'Make is required (min 2 chars).';
    }
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

    return errors;
  }, [vehicleForm]);

  const isFormValid = Object.keys(fieldErrors).length === 0;

  const onVehicleChange = <K extends keyof DriverVehicleForm>(
    key: K,
    value: DriverVehicleForm[K],
  ): void => {
    setVehicleForm((prev) => ({ ...prev, [key]: value }));
  };

  const onContinue = async (): Promise<void> => {
    if (!isFormValid || isSavingVehicle) return;

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

    if (existingVehicle) {
      router.replace('/set-availability');
      return;
    }

    setIsSavingVehicle(true);
    try {
      await createDriverVehicle(payload);
      router.replace('/set-availability');
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

      if (normalized.includes('documents')) {
        setSubmitError('Upload your documents first. Redirecting...');
        setTimeout(() => {
          router.replace('/vehicle-documents');
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
    } finally {
      setIsSavingVehicle(false);
    }
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
        <Pressable style={styles.retryButton} onPress={() => void loadExistingVehicle()}>
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
          <Text style={styles.progress}>Step 3 of 3: Vehicle Information</Text>
          <Text style={styles.title}>Add Vehicle Information</Text>
          <Text style={styles.subtitle}>
            Tell us about your vehicle so we can finish the driver setup.
          </Text>
          {loadHint ? <Text style={styles.helper}>{loadHint}</Text> : null}
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
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {fieldErrors.vehicleType ? <Text style={styles.errorText}>{fieldErrors.vehicleType}</Text> : null}

          <Text style={styles.fieldLabel}>Make *</Text>
          <TextInput
            style={styles.input}
            placeholder="Make *"
            value={vehicleForm.make}
            onChangeText={(value) => onVehicleChange('make', value)}
          />
          {fieldErrors.make ? <Text style={styles.errorText}>{fieldErrors.make}</Text> : null}

          <Text style={styles.fieldLabel}>Model *</Text>
          <TextInput
            style={styles.input}
            placeholder="Model *"
            value={vehicleForm.model}
            onChangeText={(value) => onVehicleChange('model', value)}
          />
          {fieldErrors.model ? <Text style={styles.errorText}>{fieldErrors.model}</Text> : null}

          <Text style={styles.fieldLabel}>Year *</Text>
          <TextInput
            style={styles.input}
            placeholder="Year *"
            keyboardType="number-pad"
            value={vehicleForm.year}
            onChangeText={(value) => onVehicleChange('year', value)}
          />
          {fieldErrors.year ? <Text style={styles.errorText}>{fieldErrors.year}</Text> : null}

          <Text style={styles.fieldLabel}>Plate number *</Text>
          <TextInput
            style={styles.input}
            placeholder="Plate number *"
            value={vehicleForm.plateNumber}
            onChangeText={(value) => onVehicleChange('plateNumber', value)}
          />
          {fieldErrors.plateNumber ? <Text style={styles.errorText}>{fieldErrors.plateNumber}</Text> : null}

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
          {fieldErrors.capacityKg ? <Text style={styles.errorText}>{fieldErrors.capacityKg}</Text> : null}

          <Text style={styles.fieldLabel}>Length (cm)</Text>
          <TextInput
            style={styles.input}
            placeholder="Length (cm)"
            keyboardType="decimal-pad"
            value={vehicleForm.lengthCm}
            onChangeText={(value) => onVehicleChange('lengthCm', value)}
          />
          {fieldErrors.lengthCm ? <Text style={styles.errorText}>{fieldErrors.lengthCm}</Text> : null}

          <Text style={styles.fieldLabel}>Width (cm)</Text>
          <TextInput
            style={styles.input}
            placeholder="Width (cm)"
            keyboardType="decimal-pad"
            value={vehicleForm.widthCm}
            onChangeText={(value) => onVehicleChange('widthCm', value)}
          />
          {fieldErrors.widthCm ? <Text style={styles.errorText}>{fieldErrors.widthCm}</Text> : null}

          <Text style={styles.fieldLabel}>Height (cm)</Text>
          <TextInput
            style={styles.input}
            placeholder="Height (cm)"
            keyboardType="decimal-pad"
            value={vehicleForm.heightCm}
            onChangeText={(value) => onVehicleChange('heightCm', value)}
          />
          {fieldErrors.heightCm ? <Text style={styles.errorText}>{fieldErrors.heightCm}</Text> : null}

          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>Has trailer *</Text>
            <Switch
              value={vehicleForm.hasTrailer}
              onValueChange={(value) => onVehicleChange('hasTrailer', value)}
            />
          </View>
        </View>

        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

        <Pressable
          style={[styles.continueButton, (!isFormValid || isSavingVehicle) && styles.continueButtonDisabled]}
          disabled={!isFormValid || isSavingVehicle}
          onPress={() => void onContinue()}
        >
          {isSavingVehicle ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.continueButtonText}>Continue to Set Availability</Text>
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
