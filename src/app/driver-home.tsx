import { useFocusEffect, useRouter, type Href } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
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

function formatMoney(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(price);
  } catch {
    return `${price.toFixed(2)} ${currency}`;
  }
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
  const { user, driver, signOut, accessToken } = useAuth();
  const [hasVehicles, setHasVehicles] = useState<boolean>(true);
  const [isLoadingVehicles, setIsLoadingVehicles] = useState<boolean>(true);
  const [isOnline, setIsOnline] = useState<boolean>(false);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState<boolean>(true);
  const [isUpdatingAvailability, setIsUpdatingAvailability] = useState<boolean>(false);
  const [availabilityError, setAvailabilityError] = useState<string>('');
  const [requiresAvailabilitySetup, setRequiresAvailabilitySetup] = useState<boolean>(false);
  const [isSendingTestNotification, setIsSendingTestNotification] = useState<boolean>(false);
  const [testNotificationMessage, setTestNotificationMessage] = useState<string>('');
  const [acceptedJobs, setAcceptedJobs] = useState<DriverAcceptedJobSummary[]>([]);
  const [payoutJobsError, setPayoutJobsError] = useState<string>('');

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

    void loadVehicles();

    return () => {
      isMounted = false;
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
            error instanceof Error ? error.message : 'Failed to load availability.',
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingAvailability(false);
        }
      }
    };

    void loadAvailability();

    return () => {
      isMounted = false;
    };
  }, []);

  const loadAcceptedJobs = useCallback(async (): Promise<void> => {
    setPayoutJobsError('');

    try {
      const response = await getDriverAcceptedJobs();
      setAcceptedJobs(response.jobs ?? []);
    } catch (error) {
      setAcceptedJobs([]);
      setPayoutJobsError(
        error instanceof Error ? error.message : 'Failed to load payout-eligible jobs.',
      );
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadAcceptedJobs();
    }, [loadAcceptedJobs]),
  );

  const onToggleAvailability = async (nextValue: boolean): Promise<void> => {
    if (isLoadingAvailability || isUpdatingAvailability) return;
    if (requiresAvailabilitySetup) {
      setAvailabilityError('Set availability first before changing online status.');
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
        error instanceof Error ? error.message : 'Failed to update online status.';
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
      setTestNotificationMessage(`Test notification sent to ${response.email}.`);
    } catch (error) {
      setTestNotificationMessage(
        error instanceof Error ? error.message : 'Failed to send test notification.',
      );
    } finally {
      setIsSendingTestNotification(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Driver Home</Text>
        <Text style={styles.subtitle}>Welcome {driver?.firstName || user?.email || 'Driver'}.</Text>

        <View style={styles.availabilityCard}>
          <View style={styles.availabilityHeader}>
            <View style={styles.availabilityCopy}>
              <Text style={styles.availabilityTitle}>Set Availability</Text>
              <Text style={styles.availabilitySubtitle}>
                {isLoadingAvailability
                  ? 'Loading online status...'
                  : isOnline
                    ? 'You are online and can receive matching requests.'
                    : 'You are offline and will not receive new requests.'}
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
            <Text style={styles.availabilityHint}>Updating availability...</Text>
          ) : null}
          {requiresAvailabilitySetup ? (
            <Pressable
              style={styles.setupAvailabilityButton}
              onPress={() => router.push(nextStepToRoute('SET_AVAILABILITY'))}
            >
              <Text style={styles.setupAvailabilityButtonText}>Complete Availability Setup</Text>
            </Pressable>
          ) : null}
          {availabilityError ? (
            <Text style={styles.availabilityErrorText}>{availabilityError}</Text>
          ) : null}
        </View>

        <DriverPayoutStatusCard
          title="Payout Status"
          tripId={latestPayoutJob?.requestId}
          requestStatus={latestPayoutJob?.requestStatus}
          amountLabel={
            latestPayoutJob
              ? formatMoney(
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
            <Text style={styles.payoutJobButtonText}>Open Latest Payout Job</Text>
          </Pressable>
        ) : (
          <Text style={styles.payoutHintText}>
            No delivered trip is waiting for payout release right now.
          </Text>
        )}

        {payoutJobsError ? <Text style={styles.availabilityErrorText}>{payoutJobsError}</Text> : null}

        <Pressable style={styles.requestsButton} onPress={() => router.push('/receive-requests')}>
          <Text style={styles.requestsButtonText}>Available Requests</Text>
        </Pressable>

        <Pressable style={styles.acceptedJobsButton} onPress={() => router.push('/accepted-jobs')}>
          <Text style={styles.acceptedJobsButtonText}>Accepted Jobs</Text>
        </Pressable>

        <Pressable style={styles.vehiclesButton} onPress={() => router.push('/my-vehicles')}>
          <Text style={styles.acceptedJobsButtonText}>My Vehicles</Text>
        </Pressable>

        <Pressable style={styles.vehiclesButton} onPress={() => router.push('/stripe-connect' as Href)}>
          <Text style={styles.acceptedJobsButtonText}>Stripe Connect (Payouts)</Text>
        </Pressable>

        {isLoadingVehicles ? (
          <View style={styles.vehicleHintRow}>
            <ActivityIndicator size="small" color="#1D4ED8" />
            <Text style={styles.vehicleHintText}>Checking your vehicle status...</Text>
          </View>
        ) : !hasVehicles ? (
          <Text style={styles.vehicleHintText}>
            Add at least one vehicle to start receiving requests.
          </Text>
        ) : null}

        <Pressable style={styles.debugButton} onPress={() => router.push('/socket-debug' as Href)}>
          <Text style={styles.acceptedJobsButtonText}>Socket Debug</Text>
        </Pressable>

        <Pressable
          style={styles.testNotificationButton}
          onPress={() => void onSendTestNotification()}
          disabled={isSendingTestNotification}
        >
          <Text style={styles.acceptedJobsButtonText}>
            {isSendingTestNotification
              ? 'Sending Test Notification...'
              : 'Send Test Notification to Raed'}
          </Text>
        </Pressable>

        {testNotificationMessage ? (
          <Text style={styles.testNotificationMessage}>{testNotificationMessage}</Text>
        ) : null}

        <Pressable style={styles.button} onPress={() => void onSignOut()}>
          <Text style={styles.buttonText}>Logout</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF', padding: 20 },
  card: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 16, gap: 10 },
  title: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  subtitle: { color: '#475569' },
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
