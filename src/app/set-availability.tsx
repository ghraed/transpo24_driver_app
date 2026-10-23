import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

import { getBackendApiBaseUrl } from '@/config/backend';
import { useAuth } from '@/context/auth-context';
import {
  clearLastOnboardingRoute,
  persistLastOnboardingRoute,
} from '@/lib/auth-storage';
import { useAndroidKeyboardInset } from '@/hooks/use-android-keyboard-inset';
import { nextStepToRoute } from '@/lib/onboarding-route';
import i18n from '@/localization/i18n';
import { getSourceErrorMessage } from '@/localization/response-message';
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

function createDefaultWeeklySchedule(): DriverAvailabilityFormDay[] {
  return ORDERED_DAYS.map((day) => {
    const weekday = day !== 'SATURDAY' && day !== 'SUNDAY';
    return {
      dayOfWeek: day,
      label: i18n.t(DAY_LABELS[day]),
      isAvailable: weekday,
      startTime: weekday ? '08:00' : '',
      endTime: weekday ? '18:00' : '',
    };
  });
}

export default function SetAvailabilityScreen() {
  const keyboardInset = useAndroidKeyboardInset();
  const router = useRouter();
  const { t } = useTranslation();
  const {
    refreshDriverAvailability,
    saveDriverAvailability,
    signOut,
  } = useAuth();

  const [form, setForm] = useState<DriverAvailabilityForm>({
    isOnline: false,
    serviceRadiusKm: '30',
    acceptsImmediateRequests: true,
    acceptsScheduledRequests: true,
    weeklySchedule: createDefaultWeeklySchedule(),
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>('');
  const [submitError, setSubmitError] = useState<string>('');
  const [submitSuccess, setSubmitSuccess] = useState<string>('');
  const apiBaseUrl = (() => {
    try {
      return getBackendApiBaseUrl();
    } catch (error) {
      return error instanceof Error ? error.message : '(EXPO_PUBLIC_API_URL not set)';
    }
  })();

  useEffect(() => {
    void persistLastOnboardingRoute('/set-availability');
  }, []);

  const applyAvailability = useCallback((response: Awaited<ReturnType<typeof refreshDriverAvailability>>): void => {
    setForm({
      isOnline: response.isOnline,
      serviceRadiusKm: String(response.serviceRadiusKm ?? 30),
      acceptsImmediateRequests: response.acceptsImmediateRequests,
      acceptsScheduledRequests: response.acceptsScheduledRequests,
      weeklySchedule: ORDERED_DAYS.map((day) => {
        const found = response.weeklySchedule.find((entry) => entry.dayOfWeek === day);
        return {
          dayOfWeek: day,
          label: i18n.t(DAY_LABELS[day]),
          isAvailable: found?.isAvailable ?? false,
          startTime: found?.startTime ?? '',
          endTime: found?.endTime ?? '',
        };
      }),
    });
  }, []);

  const loadAvailability = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setLoadError('');

    try {
      const response = await refreshDriverAvailability();
      applyAvailability(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('Failed to load availability.');
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }, [applyAvailability, refreshDriverAvailability, t]);

  useEffect(() => {
    const loadTimeout = setTimeout(() => {
      void loadAvailability();
    }, 0);

    return () => {
      clearTimeout(loadTimeout);
    };
  }, [loadAvailability]);

  const fieldErrors = useMemo(() => {
    const errors: Record<string, string> = {};

    const radius = parseNumber(form.serviceRadiusKm);
    if (radius === undefined) {
      errors.serviceRadiusKm = t('Service radius is required and must be numeric.');
    } else if (radius < 1 || radius > 500) {
      errors.serviceRadiusKm = t('Service radius must be between 1 and 500 km.');
    }

    if (!form.acceptsImmediateRequests && !form.acceptsScheduledRequests) {
      errors.requestPreferences = t('Enable at least one request preference.');
    }

    if (form.weeklySchedule.length !== 7) {
      errors.weeklySchedule = t('Weekly schedule must contain exactly 7 days.');
    }

    const uniqueDays = new Set(form.weeklySchedule.map((day) => day.dayOfWeek));
    if (uniqueDays.size !== 7) {
      errors.weeklySchedule = t('Each day must appear once in weekly schedule.');
    }

    let availableDayCount = 0;

    form.weeklySchedule.forEach((day) => {
      if (!day.isAvailable) {
        return;
      }

      availableDayCount += 1;

      if (!day.startTime.trim()) {
        errors[`startTime-${day.dayOfWeek}`] = t('{{day}}: start time is required.', { day: day.label });
      } else if (!TIME_REGEX.test(day.startTime.trim())) {
        errors[`startTime-${day.dayOfWeek}`] = t('{{day}}: start time must be HH:mm.', { day: day.label });
      }

      if (!day.endTime.trim()) {
        errors[`endTime-${day.dayOfWeek}`] = t('{{day}}: end time is required.', { day: day.label });
      } else if (!TIME_REGEX.test(day.endTime.trim())) {
        errors[`endTime-${day.dayOfWeek}`] = t('{{day}}: end time must be HH:mm.', { day: day.label });
      }

      if (
        TIME_REGEX.test(day.startTime.trim()) &&
        TIME_REGEX.test(day.endTime.trim()) &&
        toMinutes(day.endTime.trim()) <= toMinutes(day.startTime.trim())
      ) {
        errors[`endTime-${day.dayOfWeek}`] = t('{{day}}: end time must be after start time.', { day: day.label });
      }
    });

    if (availableDayCount === 0) {
      errors.availableDays = t('At least one day must be available.');
    }

    return errors;
  }, [form, t]);

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

  const onContinue = async (): Promise<void> => {
    if (!isFormValid || isSaving) {
      return;
    }

    setSubmitError('');
    setSubmitSuccess('');
    setIsSaving(true);

    const radiusValue = Number(form.serviceRadiusKm.trim());

    const payload: UpdateDriverAvailabilityPayload = {
      isOnline: form.isOnline,
      serviceRadiusKm: radiusValue,
      cityCoverage: [],
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
        t('Availability saved. Online: {{online}} | Radius: {{radius}} km', {
          online: response.isOnline ? t('YES') : t('NO'),
          radius: response.serviceRadiusKm,
        }),
      );

      if (response.nextStep === 'SET_AVAILABILITY') {
        setSubmitError(t('Please complete all required availability fields.'));
        return;
      }

      if (response.nextStep === 'HOME') {
        await clearLastOnboardingRoute();
      }

      router.replace(nextStepToRoute(response.nextStep));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('Failed to save availability.');
      const normalized = getSourceErrorMessage(error, message).toLowerCase();

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
        setSubmitError(t('Profile is incomplete. Redirecting to Complete Profile...'));
        setTimeout(() => {
          router.replace('/complete-profile');
        }, 700);
        return;
      }

      if (normalized.includes('vehicle') || normalized.includes('documents')) {
        setSubmitSuccess(t('Continuing to approval despite backend document prerequisite.'));
        setSubmitError('');
        router.replace('/waiting-approval');
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
        <ActivityIndicator size="large" color="#F1B900" />
        <Text style={styles.loadingText}>{t('Loading availability...')}</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>{loadError}</Text>
        <Pressable style={styles.retryButton} onPress={() => void loadAvailability()}>
          <Text style={styles.retryButtonText}>{t('Retry')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          keyboardInset > 0 ? { paddingBottom: 40 + keyboardInset } : undefined,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.replace('/vehicle-documents')}>
            <Text style={styles.backButtonText}>{t('Back')}</Text>
          </Pressable>
          <Text style={styles.progress}>{t('Step 3 of 3: Availability')}</Text>
          <Text style={styles.title}>{t('Set Your Availability')}</Text>
          <Text style={styles.subtitle}>
            {t('Choose when and where you can receive transport requests.')}
          </Text>
          <Text style={styles.helper}>
            {t('Your availability helps us match you with transport requests at the right time and place.')}
          </Text>
          <Text style={styles.endpointText}>{t('Backend')}: {apiBaseUrl}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('Service Area')}</Text>

          <Text style={styles.fieldLabel}>{t('Service radius (km) *')}</Text>
          <TextInput
            style={styles.input}
            value={form.serviceRadiusKm}
            onChangeText={(value) => onChange('serviceRadiusKm', value)}
            placeholder="30"
            keyboardType="number-pad"
          />
          {fieldErrors.serviceRadiusKm ? <Text style={styles.errorText}>{fieldErrors.serviceRadiusKm}</Text> : null}

          <Text style={styles.searchHint}>{t('All pickups use your current GPS location. Enable location access to receive requests within your service radius.')}</Text>
          <Pressable style={styles.locationButton} onPress={() => {
            void Location.requestForegroundPermissionsAsync().then(permission => {
              if (permission.granted) setSubmitSuccess(t('All pickups use your current GPS location.'));
              else setSubmitError(t('Enable GPS and location access to receive requests.'));
            }).catch(() => setSubmitError(t('Enable GPS and location access to receive requests.')));
          }}>
            <Text style={styles.locationButtonText}>{t('Enable location access')}</Text>
          </Pressable>

        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('Request Preferences')}</Text>

          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>{t('Accept immediate requests')}</Text>
            <Switch
              value={form.acceptsImmediateRequests}
              onValueChange={(value) => onChange('acceptsImmediateRequests', value)}
            />
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>{t('Accept scheduled requests')}</Text>
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
          <Text style={styles.sectionTitle}>{t('Weekly Schedule')}</Text>

          {form.weeklySchedule.map((day) => {
            const startKey = `startTime-${day.dayOfWeek}`;
            const endKey = `endTime-${day.dayOfWeek}`;

            return (
              <View key={day.dayOfWeek} style={styles.dayCard}>
                <View style={styles.switchRow}>
                  <Text style={styles.dayTitle}>{t(day.label)}</Text>
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
                      <Text style={styles.fieldLabel}>{t('Start (HH:mm)')}</Text>
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
                      <Text style={styles.fieldLabel}>{t('End (HH:mm)')}</Text>
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
                  <Text style={styles.helper}>{t('Unavailable')}</Text>
                )}
              </View>
            );
          })}

          {fieldErrors.availableDays ? <Text style={styles.errorText}>{fieldErrors.availableDays}</Text> : null}
          {fieldErrors.weeklySchedule ? <Text style={styles.errorText}>{fieldErrors.weeklySchedule}</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('Online Status')}</Text>
          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>{t('Go Online')}</Text>
            <Switch value={form.isOnline} onValueChange={(value) => onChange('isOnline', value)} />
          </View>
          <Text style={styles.helper}>
            {t('You can save availability now. Going online may be enabled after account approval.')}
          </Text>
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
            <Text style={styles.primaryButtonText}>{t('Save & Continue')}</Text>
          )}
        </Pressable>

        {isSaving ? <Text style={styles.statusText}>{t('Saving availability...')}</Text> : null}
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
    color: '#707A8C',
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
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingRight: 12,
  },
  backButtonText: {
    color: '#F1B900',
    fontWeight: '700',
    fontSize: 14,
  },
  progress: {
    color: '#F1B900',
    fontWeight: '700',
    fontSize: 13,
  },
  title: {
    fontSize: 27,
    fontWeight: '700',
    color: '#202020',
  },
  subtitle: {
    color: '#707A8C',
    fontSize: 14,
  },
  helper: {
    color: '#707A8C',
    fontSize: 13,
  },
  endpointText: {
    color: '#8A6200',
    fontSize: 12,
    marginTop: 2,
  },
  section: {
    borderWidth: 1,
    borderColor: '#DFE3E8',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#202020',
  },
  fieldLabel: {
    color: '#505A6A',
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#DFE3E8',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
  },
  searchContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E7EC',
    borderRadius: 12,
    padding: 10,
  },
  searchInput: {
    height: 44,
    borderWidth: 1,
    borderColor: '#DFE3E8',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#101828',
    backgroundColor: '#FFFFFF',
  },
  searchHint: {
    marginTop: 6,
    fontSize: 12,
    color: '#667085',
  },
  searchSpinner: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  suggestionsList: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#DFE3E8',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#EAECF0',
  },
  suggestionText: {
    fontSize: 14,
    color: '#101828',
  },
  locationButton: {
    marginTop: 10,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F3D26B',
    backgroundColor: '#FFF9E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationButtonDisabled: {
    opacity: 0.7,
  },
  locationButtonText: {
    color: '#F1B900',
    fontSize: 14,
    fontWeight: '700',
  },
  mapContainer: {
    height: 280,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E4E7EC',
    backgroundColor: '#FFFFFF',
  },
  map: {
    flex: 1,
  },
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#EEF2F7',
    gap: 8,
  },
  mapFallbackTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#202020',
    textAlign: 'center',
  },
  mapFallbackText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#475467',
    textAlign: 'center',
  },
  mapOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mapOverlayText: {
    color: '#505A6A',
    fontSize: 12,
    fontWeight: '500',
  },
  infoMessage: {
    marginTop: 8,
    color: '#B54708',
    fontSize: 13,
  },
  bottomCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#DFE3E8',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    padding: 12,
  },
  bottomTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  bottomDetails: {
    marginTop: 4,
    color: '#475467',
    fontSize: 13,
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
  dayCard: {
    borderWidth: 1,
    borderColor: '#DFE3E8',
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  dayTitle: {
    color: '#202020',
    fontWeight: '700',
    fontSize: 14,
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 10,
    backgroundColor: '#F1B900',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#171717',
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
    backgroundColor: '#F7F8F9',
    padding: 8,
    gap: 4,
  },
  debugTitle: {
    color: '#202020',
    fontWeight: '700',
    fontSize: 12,
  },
  debugText: {
    color: '#505A6A',
    fontSize: 12,
  },
  statusText: {
    textAlign: 'center',
    color: '#707A8C',
    fontSize: 12,
  },
  retryButton: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#F1B900',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  retryButtonText: {
    color: '#171717',
    fontWeight: '700',
  },
});
