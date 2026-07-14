import { useFocusEffect, useRouter, type Href } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DriverPayoutStatusCard } from '@/components/driver-payout-status-card';
import { useAuth } from '@/context/auth-context';
import {
  getDriverAvailability,
  getDriverAcceptedJobs,
  getDriverVehicles,
  sendCustomerTestNotification,
  updateDriverOnlineStatus,
} from '@/lib/api';
import { clearLastOnboardingRoute } from '@/lib/auth-storage';
import { formatCurrency } from '@/localization/format';
import { LANGUAGE_CONFIGS, SUPPORTED_LANGUAGES } from '@/localization/languages';
import { useAppLanguage } from '@/localization/provider';
import { nextStepToRoute } from '@/lib/onboarding-route';
import { connectSocket, disconnectSocket, onOfferAccepted } from '@/services/socketService';
import type { DriverAvailabilityResponse, DriverAcceptedJobSummary } from '@/types/auth';
import { validateOfferAcceptedPayload } from '@/utils/locationValidation';

function hasCompletedAvailabilitySetup(availability: DriverAvailabilityResponse): boolean {
  if (availability.nextStep === 'SET_AVAILABILITY') {
    return false;
  }

  if (!availability.id) {
    return false;
  }

  if (availability.baseLatitude === null || availability.baseLongitude === null) {
    return false;
  }

  return availability.weeklySchedule.some((day) => day.isAvailable);
}

function pickLatestPayoutCandidate(jobs: DriverAcceptedJobSummary[]): DriverAcceptedJobSummary | null {
  const deliveredJobs = jobs.filter(
    (job) => job.requestStatus === 'DELIVERED' || job.requestStatus === 'COMPLETED',
  );

  if (deliveredJobs.length === 0) {
    return null;
  }

  return [...deliveredJobs].sort((left, right) => {
    const leftTime = left.acceptedAt ? new Date(left.acceptedAt).getTime() : 0;
    const rightTime = right.acceptedAt ? new Date(right.acceptedAt).getTime() : 0;
    return rightTime - leftTime;
  })[0] ?? null;
}

export default function DriverHomeScreen() {
  const testCustomerEmail = 'raed.ghanim.2014@gmail.com';
  const router = useRouter();
  const { t } = useTranslation();
  const { language, isChangingLanguage, setLanguage } = useAppLanguage();
  const { user, driver, signOut, accessToken } = useAuth();
  const [hasVehicles, setHasVehicles] = useState(true);
  const [isLoadingVehicles, setIsLoadingVehicles] = useState(true);
  const [isOnline, setIsOnline] = useState(false);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(true);
  const [isUpdatingAvailability, setIsUpdatingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const [requiresAvailabilitySetup, setRequiresAvailabilitySetup] = useState(false);
  const [isSendingTestNotification, setIsSendingTestNotification] = useState(false);
  const [testNotificationMessage, setTestNotificationMessage] = useState('');
  const [acceptedJobs, setAcceptedJobs] = useState<DriverAcceptedJobSummary[]>([]);
  const [payoutJobsError, setPayoutJobsError] = useState('');

  useEffect(() => {
    void clearLastOnboardingRoute();
  }, []);

  useEffect(() => {
    if (!accessToken) return;

    connectSocket(accessToken);

    const unsubscribeOfferAccepted = onOfferAccepted((payload) => {
      const validated = validateOfferAcceptedPayload(payload);
      if (!validated) return;

      router.push({
        pathname: '/go-to-pickup',
        params: {
          tripId: validated.tripId,
          pickupLatitude: String(validated.pickupLocation.latitude),
          pickupLongitude: String(validated.pickupLocation.longitude),
          pickupAddress: validated.pickupLocation.address ?? '',
          dropoffLatitude: String(validated.dropoffLocation.latitude),
          dropoffLongitude: String(validated.dropoffLocation.longitude),
          dropoffAddress: validated.dropoffLocation.address ?? '',
        },
      });
    });

    return () => {
      unsubscribeOfferAccepted();
      disconnectSocket();
    };
  }, [accessToken, router]);

  useEffect(() => {
    let isMounted = true;

    const loadVehicles = async (): Promise<void> => {
      setIsLoadingVehicles(true);
      try {
        const vehicles = await getDriverVehicles();
        if (isMounted) {
          setHasVehicles(vehicles.length > 0);
        }
      } catch {
        if (isMounted) {
          setHasVehicles(true);
        }
      } finally {
        if (isMounted) {
          setIsLoadingVehicles(false);
        }
      }
    };

    const timeoutId = setTimeout(() => {
      void loadVehicles();
    }, 0);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadAvailability = async (): Promise<void> => {
      setIsLoadingAvailability(true);
      setAvailabilityError('');
      try {
        const availability = await getDriverAvailability();
        if (isMounted) {
          setIsOnline(availability.isOnline);
          setRequiresAvailabilitySetup(!hasCompletedAvailabilitySetup(availability));
        }
      } catch (error) {
        if (isMounted) {
          setAvailabilityError(
            error instanceof Error ? error.message : t('Failed to load availability.'),
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingAvailability(false);
        }
      }
    };

    const timeoutId = setTimeout(() => {
      void loadAvailability();
    }, 0);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [t]);

  const loadAcceptedJobs = useCallback(async (): Promise<void> => {
    setPayoutJobsError('');

    try {
      const response = await getDriverAcceptedJobs();
      setAcceptedJobs(response.jobs ?? []);
    } catch (error) {
      setAcceptedJobs([]);
      setPayoutJobsError(
        error instanceof Error ? error.message : t('Failed to load payout-eligible jobs.'),
      );
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void loadAcceptedJobs();
    }, [loadAcceptedJobs]),
  );

  const onToggleAvailability = async (nextValue: boolean): Promise<void> => {
    if (isLoadingAvailability || isUpdatingAvailability) return;
    if (requiresAvailabilitySetup) {
      setAvailabilityError(t('Set availability first before changing online status.'));
      router.push(nextStepToRoute('SET_AVAILABILITY'));
      return;
    }

    setIsUpdatingAvailability(true);
    setAvailabilityError('');

    try {
      const response = await updateDriverOnlineStatus({ isOnline: nextValue });
      setIsOnline(response.isOnline);
      setRequiresAvailabilitySetup(!hasCompletedAvailabilitySetup(response));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('Failed to update online status.');
      setAvailabilityError(message);

      if (message.toLowerCase().includes('set availability first')) {
        setRequiresAvailabilitySetup(true);
        router.push(nextStepToRoute('SET_AVAILABILITY'));
      }
    } finally {
      setIsUpdatingAvailability(false);
    }
  };

  const latestPayoutJob = useMemo(
    () => pickLatestPayoutCandidate(acceptedJobs),
    [acceptedJobs],
  );

  const onSignOut = async (): Promise<void> => {
    await signOut();
    router.replace('/');
  };

  const onSendTestNotification = async (): Promise<void> => {
    if (isSendingTestNotification) return;

    setIsSendingTestNotification(true);
    setTestNotificationMessage('');

    try {
      const response = await sendCustomerTestNotification(testCustomerEmail);
      setTestNotificationMessage(
        t('Test notification sent to {{email}}.', { email: response.email }),
      );
    } catch (error) {
      setTestNotificationMessage(
        error instanceof Error ? error.message : t('Failed to send test notification.'),
      );
    } finally {
      setIsSendingTestNotification(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.title}>{t('Driver Home')}</Text>
          <Text style={styles.subtitle}>
            {t('Welcome {{name}}.', { name: driver?.firstName || user?.email || t('Driver') })}
          </Text>

          <View style={styles.languageCard}>
            <Text style={styles.availabilityTitle}>{t('Language')}</Text>
            <Text style={styles.availabilitySubtitle}>
              {t('Current language')}: {LANGUAGE_CONFIGS[language].nativeLabel}
            </Text>
            <View style={styles.languageList}>
              {SUPPORTED_LANGUAGES.map((code) => {
                const config = LANGUAGE_CONFIGS[code];
                const selected = code === language;

                return (
                  <Pressable
                    key={code}
                    style={[styles.languageButton, selected && styles.languageButtonSelected]}
                    onPress={() => void setLanguage(code)}
                    disabled={isChangingLanguage}
                  >
                    <Text style={[styles.languageButtonText, selected && styles.languageButtonTextSelected]}>
                      {config.nativeLabel}
                    </Text>
                    <Text style={[styles.languageButtonMeta, selected && styles.languageButtonTextSelected]}>
                      {selected ? '✓' : config.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.availabilityCard}>
            <View style={styles.availabilityHeader}>
              <View style={styles.availabilityCopy}>
                <Text style={styles.availabilityTitle}>{t('Online status')}</Text>
                <Text style={styles.availabilitySubtitle}>
                  {isLoadingAvailability
                    ? t('Loading online status...')
                    : isOnline
                      ? t('You are online and can receive matching requests.')
                      : t('You are offline and will not receive new requests.')}
                </Text>
              </View>
              {isLoadingAvailability ? (
                <ActivityIndicator size="small" color="#1D4ED8" />
              ) : (
                <Switch
                  value={isOnline}
                  onValueChange={(value) => void onToggleAvailability(value)}
                  disabled={isUpdatingAvailability}
                  trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                  thumbColor={isOnline ? '#1D4ED8' : '#FFFFFF'}
                />
              )}
            </View>
            {isUpdatingAvailability ? (
              <Text style={styles.availabilityHint}>{t('Updating availability...')}</Text>
            ) : null}
            {requiresAvailabilitySetup ? (
              <Pressable
                style={styles.setupAvailabilityButton}
                onPress={() => router.push(nextStepToRoute('SET_AVAILABILITY'))}
              >
                <Text style={styles.setupAvailabilityButtonText}>{t('Complete Availability Setup')}</Text>
              </Pressable>
            ) : null}
            {availabilityError ? (
              <Text style={styles.availabilityErrorText}>{availabilityError}</Text>
            ) : null}
          </View>

          <DriverPayoutStatusCard
            title={t('Payout Status')}
            tripId={latestPayoutJob?.requestId}
            requestStatus={latestPayoutJob?.requestStatus}
            amountLabel={
              latestPayoutJob
                ? formatCurrency(
                    latestPayoutJob.acceptedOffer.price,
                    latestPayoutJob.acceptedOffer.currency,
                  )
                : null
            }
            onOpenStripeConnect={() => router.push('/stripe-connect' as Href)}
          />

          {latestPayoutJob ? (
            <Pressable
              style={styles.payoutJobButton}
              onPress={() =>
                router.push({
                  pathname: '/accepted-job-details',
                  params: { requestId: latestPayoutJob.requestId },
                })
              }
            >
              <Text style={styles.payoutJobButtonText}>{t('Open Latest Payout Job')}</Text>
            </Pressable>
          ) : (
            <Text style={styles.payoutHintText}>
              {t('No delivered trip is waiting for payout release right now.')}
            </Text>
          )}

          {payoutJobsError ? <Text style={styles.availabilityErrorText}>{payoutJobsError}</Text> : null}

          <Pressable style={styles.requestsButton} onPress={() => router.push('/receive-requests')}>
            <Text style={styles.requestsButtonText}>{t('Available Requests button')}</Text>
          </Pressable>

          <Pressable style={styles.acceptedJobsButton} onPress={() => router.push('/accepted-jobs')}>
            <Text style={styles.acceptedJobsButtonText}>{t('Accepted Jobs button')}</Text>
          </Pressable>

          <Pressable style={styles.vehiclesButton} onPress={() => router.push('/my-vehicles')}>
            <Text style={styles.acceptedJobsButtonText}>{t('My Vehicles')}</Text>
          </Pressable>

          <Pressable
            style={styles.vehiclesButton}
            onPress={() => router.push('/stripe-connect' as Href)}
          >
            <Text style={styles.acceptedJobsButtonText}>{t('Stripe Connect (Payouts)')}</Text>
          </Pressable>

          {isLoadingVehicles ? (
            <View style={styles.vehicleHintRow}>
              <ActivityIndicator size="small" color="#1D4ED8" />
              <Text style={styles.vehicleHintText}>{t('Checking your vehicle status...')}</Text>
            </View>
          ) : !hasVehicles ? (
            <Text style={styles.vehicleHintText}>
              {t('Add at least one vehicle to start receiving requests.')}
            </Text>
          ) : null}

          <Pressable style={styles.debugButton} onPress={() => router.push('/socket-debug' as Href)}>
            <Text style={styles.acceptedJobsButtonText}>{t('Socket Debug')}</Text>
          </Pressable>

          <Pressable
            style={styles.testNotificationButton}
            onPress={() => void onSendTestNotification()}
            disabled={isSendingTestNotification}
          >
            <Text style={styles.acceptedJobsButtonText}>
              {isSendingTestNotification
                ? t('Sending Test Notification...')
                : t('Send Test Notification to Raed')}
            </Text>
          </Pressable>

          {testNotificationMessage ? (
            <Text style={styles.testNotificationMessage}>{testNotificationMessage}</Text>
          ) : null}

          <Pressable style={styles.button} onPress={() => void onSignOut()}>
            <Text style={styles.buttonText}>{t('Logout')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF', padding: 20 },
  scrollContent: { paddingBottom: 24 },
  card: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 16, gap: 10 },
  title: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  subtitle: { color: '#475569' },
  languageCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 8,
  },
  languageList: { gap: 8 },
  languageButton: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  languageButtonSelected: {
    borderColor: '#1D4ED8',
    backgroundColor: '#DBEAFE',
  },
  languageButtonText: { color: '#0F172A', fontWeight: '700' },
  languageButtonMeta: { color: '#475569', fontSize: 12 },
  languageButtonTextSelected: { color: '#1D4ED8' },
  availabilityCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    borderRadius: 12,
    backgroundColor: '#F8FBFF',
    padding: 14,
    gap: 8,
  },
  availabilityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  availabilityCopy: {
    flex: 1,
    gap: 4,
  },
  availabilityTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  availabilitySubtitle: {
    fontSize: 13,
    color: '#475569',
  },
  availabilityHint: {
    color: '#1D4ED8',
    fontSize: 13,
    fontWeight: '600',
  },
  setupAvailabilityButton: {
    minHeight: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 14,
  },
  setupAvailabilityButtonText: {
    color: '#1D4ED8',
    fontSize: 13,
    fontWeight: '700',
  },
  availabilityErrorText: {
    color: '#B91C1C',
    fontSize: 13,
  },
  requestsButton: {
    marginTop: 8,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#0EA5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestsButtonText: { color: '#FFFFFF', fontWeight: '700' },
  acceptedJobsButton: {
    marginTop: 8,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  debugButton: {
    marginTop: 8,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  testNotificationButton: {
    marginTop: 8,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#9333EA',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 1,
  },
  vehiclesButton: {
    marginTop: 8,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptedJobsButtonText: { color: '#FFFFFF', fontWeight: '700' },
  vehicleHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  vehicleHintText: { color: '#1D4ED8', fontSize: 13, fontWeight: '600' },
  payoutJobButton: {
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  payoutJobButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  payoutHintText: {
    color: '#475569',
    fontSize: 13,
  },
  testNotificationMessage: {
    color: '#475569',
    fontSize: 13,
  },
  button: {
    marginTop: 8,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#FFFFFF', fontWeight: '700' },
});
