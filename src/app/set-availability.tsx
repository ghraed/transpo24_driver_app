import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  approveDriverForTestingDebug,
} from '@/lib/api';
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
import {
  clearLastOnboardingRoute,
  persistLastOnboardingRoute,
} from '@/lib/auth-storage';
import { nextStepToRoute } from '@/lib/onboarding-route';
import type {
  DayOfWeek,
  DriverAvailabilityForm,
  DriverAvailabilityFormDay,
  UpdateDriverAvailabilityPayload,
} from '@/types/auth';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_LABELS: Record<DayOfWeek, string> = {
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
  SATURDAY: 'Saturday',
  SUNDAY: 'Sunday',
};

const ORDERED_DAYS: DayOfWeek[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

function parseNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toMinutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function detectDefaultTimezone(countryCode?: string | null): string {
  if (countryCode?.toUpperCase() === 'CH') {
    return 'Europe/Zurich';
  }

  const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return deviceTimezone || 'UTC';
}

function createDefaultWeeklySchedule(): DriverAvailabilityFormDay[] {
  return ORDERED_DAYS.map((day) => {
    const weekday = day !== 'SATURDAY' && day !== 'SUNDAY';
    return {
      dayOfWeek: day,
      label: DAY_LABELS[day],
      isAvailable: weekday,
      startTime: weekday ? '08:00' : '',
      endTime: weekday ? '18:00' : '',
    };
  });
}

export default function SetAvailabilityScreen() {
  const router = useRouter();
  const {
    driver,
    refreshDriverAvailability,
    saveDriverAvailability,
    refreshDriverMe,
    signOut,
  } = useAuth();

  const [form, setForm] = useState<DriverAvailabilityForm>({
    timezone: detectDefaultTimezone(driver?.countryCode),
    isOnline: false,
    serviceRadiusKm: '30',
    baseLatitude: '',
    baseLongitude: '',
    baseAddress: '',
    acceptsImmediateRequests: true,
    acceptsScheduledRequests: true,
    weeklySchedule: createDefaultWeeklySchedule(),
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isGettingLocation, setIsGettingLocation] = useState<boolean>(false);
  const [isApprovingForTesting, setIsApprovingForTesting] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>('');
  const [submitError, setSubmitError] = useState<string>('');
  const [submitSuccess, setSubmitSuccess] = useState<string>('');
  const [approveDebugMessage, setApproveDebugMessage] = useState<string>('');
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') || '(EXPO_PUBLIC_API_URL not set)';

  useEffect(() => {
    void persistLastOnboardingRoute('/set-availability');
  }, []);

  const applyAvailability = useCallback((response: Awaited<ReturnType<typeof refreshDriverAvailability>>): void => {
    setForm({
      timezone: response.timezone || detectDefaultTimezone(driver?.countryCode),
      isOnline: response.isOnline,
      serviceRadiusKm: String(response.serviceRadiusKm ?? 30),
      baseLatitude: response.baseLatitude !== null ? String(response.baseLatitude) : '',
      baseLongitude: response.baseLongitude !== null ? String(response.baseLongitude) : '',
      baseAddress: response.baseAddress ?? '',
      acceptsImmediateRequests: response.acceptsImmediateRequests,
      acceptsScheduledRequests: response.acceptsScheduledRequests,
      weeklySchedule: ORDERED_DAYS.map((day) => {
        const found = response.weeklySchedule.find((entry) => entry.dayOfWeek === day);
        return {
          dayOfWeek: day,
          label: DAY_LABELS[day],
          isAvailable: found?.isAvailable ?? false,
          startTime: found?.startTime ?? '',
          endTime: found?.endTime ?? '',
        };
      }),
    });
  }, [driver?.countryCode, refreshDriverAvailability]);

  const loadAvailability = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setLoadError('');

    try {
      const response = await refreshDriverAvailability();
      applyAvailability(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load availability.';
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }, [applyAvailability, refreshDriverAvailability]);

  useEffect(() => {
    void loadAvailability();
  }, [loadAvailability]);

  const fieldErrors = useMemo(() => {
    const errors: Record<string, string> = {};

    if (!form.timezone.trim()) {
      errors.timezone = 'Timezone is required.';
    }

    const radius = parseNumber(form.serviceRadiusKm);
    if (radius === undefined) {
      errors.serviceRadiusKm = 'Service radius is required and must be numeric.';
    } else if (radius < 1 || radius > 500) {
      errors.serviceRadiusKm = 'Service radius must be between 1 and 500 km.';
    }

    const latitude = parseNumber(form.baseLatitude);
    const longitude = parseNumber(form.baseLongitude);

    if ((latitude === undefined) !== (longitude === undefined)) {
      errors.baseLocation = 'Base latitude and longitude must be provided together.';
    }

    if (latitude !== undefined && (latitude < -90 || latitude > 90)) {
      errors.baseLatitude = 'Base latitude must be between -90 and 90.';
    }

    if (longitude !== undefined && (longitude < -180 || longitude > 180)) {
      errors.baseLongitude = 'Base longitude must be between -180 and 180.';
    }

    if (!form.acceptsImmediateRequests && !form.acceptsScheduledRequests) {
      errors.requestPreferences = 'Enable at least one request preference.';
    }

    if (form.weeklySchedule.length !== 7) {
      errors.weeklySchedule = 'Weekly schedule must contain exactly 7 days.';
    }

    const uniqueDays = new Set(form.weeklySchedule.map((day) => day.dayOfWeek));
    if (uniqueDays.size !== 7) {
      errors.weeklySchedule = 'Each day must appear once in weekly schedule.';
    }

    let availableDayCount = 0;

    form.weeklySchedule.forEach((day) => {
      if (!day.isAvailable) {
        return;
      }

      availableDayCount += 1;

      if (!day.startTime.trim()) {
        errors[`startTime-${day.dayOfWeek}`] = `${day.label}: start time is required.`;
      } else if (!TIME_REGEX.test(day.startTime.trim())) {
        errors[`startTime-${day.dayOfWeek}`] = `${day.label}: start time must be HH:mm.`;
      }

      if (!day.endTime.trim()) {
        errors[`endTime-${day.dayOfWeek}`] = `${day.label}: end time is required.`;
      } else if (!TIME_REGEX.test(day.endTime.trim())) {
        errors[`endTime-${day.dayOfWeek}`] = `${day.label}: end time must be HH:mm.`;
      }

      if (
        TIME_REGEX.test(day.startTime.trim()) &&
        TIME_REGEX.test(day.endTime.trim()) &&
        toMinutes(day.endTime.trim()) <= toMinutes(day.startTime.trim())
      ) {
        errors[`endTime-${day.dayOfWeek}`] = `${day.label}: end time must be after start time.`;
      }
    });

    if (availableDayCount === 0) {
      errors.availableDays = 'At least one day must be available.';
    }

    return errors;
  }, [form]);

  const isFormValid = Object.keys(fieldErrors).length === 0;

  const onChange = <K extends keyof DriverAvailabilityForm>(
    key: K,
    value: DriverAvailabilityForm[K],
  ): void => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onScheduleChange = (
    dayOfWeek: DayOfWeek,
    patch: Partial<DriverAvailabilityFormDay>,
  ): void => {
    setForm((prev) => ({
      ...prev,
      weeklySchedule: prev.weeklySchedule.map((entry) =>
        entry.dayOfWeek === dayOfWeek ? { ...entry, ...patch } : entry,
      ),
    }));
  };

  const onUseCurrentLocation = async (): Promise<void> => {
    setSubmitError('');
    setSubmitSuccess('');
    setIsGettingLocation(true);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setSubmitError('Location permission denied. You can enter coordinates manually.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({});
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;

      let baseAddress = form.baseAddress;
      try {
        const geocode = await Location.reverseGeocodeAsync({ latitude, longitude });
        const first = geocode[0];
        if (first) {
          const parts = [first.name, first.street, first.city, first.region, first.country].filter(Boolean);
          if (parts.length > 0) {
            baseAddress = parts.join(', ');
          }
        }
      } catch {
        // Keep coordinates even if reverse geocoding fails.
      }

      setForm((prev) => ({
        ...prev,
        baseLatitude: String(latitude),
        baseLongitude: String(longitude),
        baseAddress,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get current location.';
      setSubmitError(message);
    } finally {
      setIsGettingLocation(false);
    }
  };

  const onContinue = async (): Promise<void> => {
    if (!isFormValid || isSaving) {
      return;
    }

    setSubmitError('');
    setSubmitSuccess('');
    setIsSaving(true);

    const radiusValue = Number(form.serviceRadiusKm.trim());
    const latitude = parseNumber(form.baseLatitude);
    const longitude = parseNumber(form.baseLongitude);

    const payload: UpdateDriverAvailabilityPayload = {
      timezone: form.timezone.trim(),
      isOnline: form.isOnline,
      serviceRadiusKm: radiusValue,
      baseLatitude: latitude,
      baseLongitude: longitude,
      baseAddress: form.baseAddress.trim() || undefined,
      acceptsImmediateRequests: form.acceptsImmediateRequests,
      acceptsScheduledRequests: form.acceptsScheduledRequests,
      weeklySchedule: form.weeklySchedule.map((day) => ({
        dayOfWeek: day.dayOfWeek,
        isAvailable: day.isAvailable,
        startTime: day.isAvailable ? day.startTime.trim() : undefined,
        endTime: day.isAvailable ? day.endTime.trim() : undefined,
      })),
    };

    try {
      const response = await saveDriverAvailability(payload);
      setSubmitSuccess(
        `Availability saved. Online: ${response.isOnline ? 'YES' : 'NO'} | Radius: ${response.serviceRadiusKm} km`,
      );

      if (response.nextStep === 'SET_AVAILABILITY') {
        setSubmitError('Please complete all required availability fields.');
        return;
      }

      if (response.nextStep === 'HOME') {
        await clearLastOnboardingRoute();
      }

      router.replace(nextStepToRoute(response.nextStep));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save availability.';
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
        setSubmitError('Profile is incomplete. Redirecting to Complete Profile...');
        setTimeout(() => {
          router.replace('/complete-profile');
        }, 700);
        return;
      }

      if (normalized.includes('vehicle') || normalized.includes('documents')) {
        setSubmitError('Vehicle/documents are incomplete. Redirecting...');
        setTimeout(() => {
          router.replace('/vehicle-information');
        }, 700);
        return;
      }

      setSubmitError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const onApproveForTesting = async (): Promise<void> => {
    if (isApprovingForTesting) return;
    setSubmitError('');
    setSubmitSuccess('');
    setApproveDebugMessage('');
    setIsApprovingForTesting(true);

    try {
      if (!isFormValid) {
        setSubmitError('Fix availability form errors before approving for testing.');
        return;
      }

      const radiusValue = Number(form.serviceRadiusKm.trim());
      const latitude = parseNumber(form.baseLatitude);
      const longitude = parseNumber(form.baseLongitude);

      const availabilityPayload: UpdateDriverAvailabilityPayload = {
        timezone: form.timezone.trim(),
        isOnline: form.isOnline,
        serviceRadiusKm: radiusValue,
        baseLatitude: latitude,
        baseLongitude: longitude,
        baseAddress: form.baseAddress.trim() || undefined,
        acceptsImmediateRequests: form.acceptsImmediateRequests,
        acceptsScheduledRequests: form.acceptsScheduledRequests,
        weeklySchedule: form.weeklySchedule.map((day) => ({
          dayOfWeek: day.dayOfWeek,
          isAvailable: day.isAvailable,
          startTime: day.isAvailable ? day.startTime.trim() : undefined,
          endTime: day.isAvailable ? day.endTime.trim() : undefined,
        })),
      };

      const availabilityResponse = await saveDriverAvailability(availabilityPayload);
      setSubmitSuccess(
        `Availability saved. Online: ${availabilityResponse.isOnline ? 'YES' : 'NO'} | Radius: ${availabilityResponse.serviceRadiusKm} km`,
      );

      const debug = await approveDriverForTestingDebug();
      const normalizedRaw = debug.rawBody?.trim() || '<empty response body>';
      setApproveDebugMessage(`HTTP ${debug.status}\n${normalizedRaw}`);

      if (!debug.ok) {
        return;
      }

      const response = await refreshDriverMe();
      if (response.nextStep === 'HOME') {
        await clearLastOnboardingRoute();
        router.replace('/driver-home');
        return;
      }
      if (response.nextStep === 'WAITING_APPROVAL') {
        router.replace('/waiting-approval');
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to approve driver in testing mode.';
      setSubmitError(message);
    } finally {
      setIsApprovingForTesting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1D4ED8" />
        <Text style={styles.loadingText}>Loading availability...</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>{loadError}</Text>
        <Pressable style={styles.retryButton} onPress={() => void loadAvailability()}>
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
          <Text style={styles.progress}>Step 3 of 3: Availability</Text>
          <Text style={styles.title}>Set Your Availability</Text>
          <Text style={styles.subtitle}>
            Choose when and where you can receive transport requests.
          </Text>
          <Text style={styles.helper}>
            Your availability helps us match you with transport requests at the right time and place.
          </Text>
          <Text style={styles.endpointText}>Backend: {apiBaseUrl}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Service Area</Text>

          <Text style={styles.fieldLabel}>Timezone *</Text>
          <TextInput
            style={styles.input}
            value={form.timezone}
            onChangeText={(value) => onChange('timezone', value)}
            placeholder="Europe/Zurich"
            autoCapitalize="none"
          />
          {fieldErrors.timezone ? <Text style={styles.errorText}>{fieldErrors.timezone}</Text> : null}

          <Text style={styles.fieldLabel}>Service radius (km) *</Text>
          <TextInput
            style={styles.input}
            value={form.serviceRadiusKm}
            onChangeText={(value) => onChange('serviceRadiusKm', value)}
            placeholder="30"
            keyboardType="number-pad"
          />
          {fieldErrors.serviceRadiusKm ? <Text style={styles.errorText}>{fieldErrors.serviceRadiusKm}</Text> : null}

          <Text style={styles.fieldLabel}>Base address</Text>
          <TextInput
            style={styles.input}
            value={form.baseAddress}
            onChangeText={(value) => onChange('baseAddress', value)}
            placeholder="Zurich, Switzerland"
          />

          <View style={styles.row}>
            <View style={styles.halfWidth}>
              <Text style={styles.fieldLabel}>Base latitude</Text>
              <TextInput
                style={styles.input}
                value={form.baseLatitude}
                onChangeText={(value) => onChange('baseLatitude', value)}
                placeholder="47.3769"
                keyboardType="decimal-pad"
              />
              {fieldErrors.baseLatitude ? <Text style={styles.errorText}>{fieldErrors.baseLatitude}</Text> : null}
            </View>
            <View style={styles.halfWidth}>
              <Text style={styles.fieldLabel}>Base longitude</Text>
              <TextInput
                style={styles.input}
                value={form.baseLongitude}
                onChangeText={(value) => onChange('baseLongitude', value)}
                placeholder="8.5417"
                keyboardType="decimal-pad"
              />
              {fieldErrors.baseLongitude ? <Text style={styles.errorText}>{fieldErrors.baseLongitude}</Text> : null}
            </View>
          </View>
          {fieldErrors.baseLocation ? <Text style={styles.errorText}>{fieldErrors.baseLocation}</Text> : null}

          <Pressable
            style={[styles.secondaryButton, isGettingLocation && styles.secondaryButtonDisabled]}
            onPress={() => void onUseCurrentLocation()}
            disabled={isGettingLocation}
          >
            {isGettingLocation ? (
              <ActivityIndicator color="#1D4ED8" />
            ) : (
              <Text style={styles.secondaryButtonText}>Use Current Location</Text>
            )}
          </Pressable>
          {isGettingLocation ? <Text style={styles.statusText}>Getting current location...</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Request Preferences</Text>

          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>Accept immediate requests</Text>
            <Switch
              value={form.acceptsImmediateRequests}
              onValueChange={(value) => onChange('acceptsImmediateRequests', value)}
            />
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>Accept scheduled requests</Text>
            <Switch
              value={form.acceptsScheduledRequests}
              onValueChange={(value) => onChange('acceptsScheduledRequests', value)}
            />
          </View>

          {fieldErrors.requestPreferences ? (
            <Text style={styles.errorText}>{fieldErrors.requestPreferences}</Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Weekly Schedule</Text>

          {form.weeklySchedule.map((day) => {
            const startKey = `startTime-${day.dayOfWeek}`;
            const endKey = `endTime-${day.dayOfWeek}`;

            return (
              <View key={day.dayOfWeek} style={styles.dayCard}>
                <View style={styles.switchRow}>
                  <Text style={styles.dayTitle}>{day.label}</Text>
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
                  <View style={styles.row}>
                    <View style={styles.halfWidth}>
                      <Text style={styles.fieldLabel}>Start (HH:mm)</Text>
                      <TextInput
                        style={styles.input}
                        value={day.startTime}
                        onChangeText={(value) => onScheduleChange(day.dayOfWeek, { startTime: value })}
                        placeholder="08:00"
                        autoCapitalize="none"
                      />
                      {fieldErrors[startKey] ? <Text style={styles.errorText}>{fieldErrors[startKey]}</Text> : null}
                    </View>
                    <View style={styles.halfWidth}>
                      <Text style={styles.fieldLabel}>End (HH:mm)</Text>
                      <TextInput
                        style={styles.input}
                        value={day.endTime}
                        onChangeText={(value) => onScheduleChange(day.dayOfWeek, { endTime: value })}
                        placeholder="18:00"
                        autoCapitalize="none"
                      />
                      {fieldErrors[endKey] ? <Text style={styles.errorText}>{fieldErrors[endKey]}</Text> : null}
                    </View>
                  </View>
                ) : (
                  <Text style={styles.helper}>Unavailable</Text>
                )}
              </View>
            );
          })}

          {fieldErrors.availableDays ? <Text style={styles.errorText}>{fieldErrors.availableDays}</Text> : null}
          {fieldErrors.weeklySchedule ? <Text style={styles.errorText}>{fieldErrors.weeklySchedule}</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Online Status</Text>
          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>Go Online</Text>
            <Switch value={form.isOnline} onValueChange={(value) => onChange('isOnline', value)} />
          </View>
          <Text style={styles.helper}>
            You can save availability now. Going online may be enabled after account approval.
          </Text>
          <Pressable
            style={[styles.testingApproveButton, isApprovingForTesting && styles.primaryButtonDisabled]}
            onPress={() => void onApproveForTesting()}
            disabled={isApprovingForTesting}
          >
            {isApprovingForTesting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.testingApproveButtonText}>Approve Driver (Testing)</Text>
            )}
          </Pressable>
          <Text style={styles.workflowNoteTitle}>Real production workflow:</Text>
          <Text style={styles.workflowNoteText}>
            1) Driver completes profile. 2) Driver submits vehicle and required documents. 3) Admin/operations reviews documents. 4) Admin approves driver. 5) Driver can go online and receive requests.
          </Text>
          <Text style={styles.workflowNoteText}>
            Testing mode: this red button skips admin review and marks the driver as approved.
          </Text>
          {approveDebugMessage ? (
            <View style={styles.debugBox}>
              <Text style={styles.debugTitle}>Temporary approve debug response:</Text>
              <Text style={styles.debugText}>{approveDebugMessage}</Text>
            </View>
          ) : null}
        </View>

        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
        {submitSuccess ? <Text style={styles.successText}>{submitSuccess}</Text> : null}

        <Pressable
          style={[styles.primaryButton, (!isFormValid || isSaving) && styles.primaryButtonDisabled]}
          onPress={() => void onContinue()}
          disabled={!isFormValid || isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Save & Continue</Text>
          )}
        </Pressable>

        {isSaving ? <Text style={styles.statusText}>Saving availability...</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    padding: 20,
    gap: 10,
  },
  loadingText: {
    color: '#475569',
  },
  content: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 30,
    gap: 12,
  },
  header: {
    gap: 4,
    marginBottom: 4,
  },
  progress: {
    color: '#1D4ED8',
    fontWeight: '700',
    fontSize: 13,
  },
  title: {
    fontSize: 27,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    color: '#475569',
    fontSize: 14,
  },
  helper: {
    color: '#64748B',
    fontSize: 13,
  },
  endpointText: {
    color: '#0369A1',
    fontSize: 12,
    marginTop: 2,
  },
  section: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  fieldLabel: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 12,
  },
  successText: {
    color: '#15803D',
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  halfWidth: {
    flex: 1,
    gap: 4,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  secondaryButton: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  secondaryButtonDisabled: {
    opacity: 0.5,
  },
  secondaryButtonText: {
    color: '#1D4ED8',
    fontWeight: '700',
    fontSize: 13,
  },
  dayCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  dayTitle: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 14,
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 10,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  testingApproveButton: {
    marginTop: 6,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  testingApproveButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  workflowNoteTitle: {
    marginTop: 6,
    color: '#7F1D1D',
    fontWeight: '700',
    fontSize: 12,
  },
  workflowNoteText: {
    color: '#991B1B',
    fontSize: 12,
    lineHeight: 18,
  },
  debugBox: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    padding: 8,
    gap: 4,
  },
  debugTitle: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 12,
  },
  debugText: {
    color: '#334155',
    fontSize: 12,
  },
  statusText: {
    textAlign: 'center',
    color: '#475569',
    fontSize: 12,
  },
  retryButton: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
