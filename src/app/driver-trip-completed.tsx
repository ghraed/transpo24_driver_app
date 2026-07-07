import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getStripeConnectStatus,
  retryTransferForTrip,
  syncStripeConnectAccount,
  type RetryTransferResponse,
  type StripeConnectStatusResponse,
} from '@/lib/api';
import { isValidTripId } from '@/utils/deliveryValidation';

type CompletedParams = {
  tripId?: string;
  deliveredAt?: string;
};

function formatTimestamp(value: string | null): string {
  if (!value) return 'N/A';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function normalizeAccountStatus(status: string | null): string {
  if (!status) return 'Not available';

  return status
    .split('_')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(' ');
}

function resolveTransferHeadline(
  stripeStatus: StripeConnectStatusResponse | null,
  transferResult: RetryTransferResponse | null,
  transferError: string,
  isReleasing: boolean,
): string {
  if (isReleasing) {
    return 'Releasing held funds to your Stripe payout account...';
  }

  if (!stripeStatus?.stripeAccountId) {
    return 'Funds are currently held until you create a Stripe Connect payout account.';
  }

  if (!stripeStatus.payoutsEnabled) {
    return 'Funds are still held because your Stripe Connect payouts are not enabled yet.';
  }

  if (transferResult?.transferred) {
    return 'Held funds were released successfully to your Stripe-connected payout account.';
  }

  if (transferError) {
    return 'The app could not confirm payout release for this trip.';
  }

  if (transferResult && !transferResult.transferred) {
    return 'No new payout release was created for this trip yet.';
  }

  return 'Your payout account is ready. You can release the held funds for this trip from here.';
}

function resolveTransferDetails(
  stripeStatus: StripeConnectStatusResponse | null,
  transferResult: RetryTransferResponse | null,
): string {
  if (!stripeStatus?.stripeAccountId) {
    return 'Create your Stripe Connect account first, then return here to release the held trip funds.';
  }

  if (!stripeStatus.payoutsEnabled) {
    return 'Complete Stripe onboarding and enable payouts before this trip can be released to your connected payout account.';
  }

  if (transferResult?.transferred && transferResult.stripeTransferId) {
    return `Transfer reference: ${transferResult.stripeTransferId}`;
  }

  if (transferResult?.reason?.trim()) {
    return transferResult.reason.trim();
  }

  if (transferResult?.transferred) {
    return 'Stripe accepted the payout release request for this completed trip.';
  }

  return 'The driver app is using live backend payout state instead of a fixed release timer.';
}

export default function DriverTripCompletedScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<CompletedParams>();
  const tripId = typeof params.tripId === 'string' ? params.tripId.trim() : '';
  const deliveredAt = typeof params.deliveredAt === 'string' ? params.deliveredAt : null;
  const hasValidTripId = isValidTripId(tripId);

  const [stripeStatus, setStripeStatus] = useState<StripeConnectStatusResponse | null>(null);
  const [transferResult, setTransferResult] = useState<RetryTransferResponse | null>(null);
  const [screenError, setScreenError] = useState('');
  const [transferError, setTransferError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReleasing, setIsReleasing] = useState(false);
  const hasAttemptedInitialReleaseRef = useRef(false);

  const loadWorkflow = useCallback(
    async ({
      attemptRelease,
      silent,
    }: {
      attemptRelease: boolean;
      silent: boolean;
    }) => {
      if (silent) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setScreenError('');
      setTransferError('');

      try {
        let currentStripeStatus = await getStripeConnectStatus();

        if (currentStripeStatus.stripeAccountId) {
          try {
            await syncStripeConnectAccount();
            currentStripeStatus = await getStripeConnectStatus();
          } catch {
            // Keep the most recent cached status if sync fails.
          }
        }

        setStripeStatus(currentStripeStatus);

        if (!hasValidTripId) {
          setTransferResult(null);
          return;
        }

        if (!currentStripeStatus.payoutsEnabled) {
          setTransferResult(null);
          return;
        }

        if (!attemptRelease) {
          return;
        }

        setIsReleasing(true);
        try {
          const payoutRelease = await retryTransferForTrip(tripId);
          setTransferResult(payoutRelease);
        } catch (error) {
          setTransferResult(null);
          setTransferError(
            error instanceof Error ? error.message : 'Failed to release held trip funds.',
          );
        } finally {
          setIsReleasing(false);
        }
      } catch (error) {
        setScreenError(
          error instanceof Error ? error.message : 'Failed to load payout workflow.',
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [hasValidTripId, tripId],
  );

  useFocusEffect(
    useCallback(() => {
      const attemptRelease = !hasAttemptedInitialReleaseRef.current;
      hasAttemptedInitialReleaseRef.current = true;
      void loadWorkflow({ attemptRelease, silent: false });
    }, [loadWorkflow]),
  );

  const handleRefresh = async () => {
    await loadWorkflow({ attemptRelease: false, silent: true });
  };

  const handleReleaseFunds = async () => {
    await loadWorkflow({ attemptRelease: true, silent: true });
  };

  const payoutHeadline = resolveTransferHeadline(
    stripeStatus,
    transferResult,
    transferError,
    isReleasing,
  );
  const payoutDetails = resolveTransferDetails(stripeStatus, transferResult);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Trip Delivered</Text>
        <Text style={styles.subtitle}>Delivery confirmed successfully.</Text>
        <Text style={styles.meta}>Trip ID: {hasValidTripId ? tripId : 'N/A'}</Text>
        <Text style={styles.meta}>Delivered At: {formatTimestamp(deliveredAt)}</Text>

        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>Held Funds Release</Text>
          {isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#1D4ED8" />
              <Text style={styles.loadingText}>Checking Stripe payout status...</Text>
            </View>
          ) : (
            <>
              <Text style={styles.noticeText}>{payoutHeadline}</Text>
              <Text style={styles.noticeMeta}>{payoutDetails}</Text>
              <Text style={styles.statusMeta}>
                Stripe payouts enabled: {stripeStatus?.payoutsEnabled ? 'Yes' : 'No'}
              </Text>
              <Text style={styles.statusMeta}>
                Stripe account status: {normalizeAccountStatus(stripeStatus?.accountStatus ?? null)}
              </Text>
            </>
          )}
        </View>

        {screenError ? <Text style={styles.errorText}>{screenError}</Text> : null}
        {transferError ? <Text style={styles.errorText}>{transferError}</Text> : null}
        {!hasValidTripId ? (
          <Text style={styles.errorText}>
            This trip id is invalid, so the app cannot request payout release safely.
          </Text>
        ) : null}

        <View style={styles.actionGroup}>
          {!stripeStatus?.stripeAccountId || !stripeStatus.payoutsEnabled ? (
            <Pressable
              style={styles.secondaryButton}
              onPress={() => router.push('/stripe-connect' as Href)}
            >
              <Text style={styles.secondaryButtonText}>Open Stripe Connect</Text>
            </Pressable>
          ) : null}

          {stripeStatus?.payoutsEnabled && hasValidTripId && !transferResult?.transferred ? (
            <Pressable
              style={[styles.secondaryButton, isReleasing && styles.disabledButton]}
              disabled={isReleasing}
              onPress={() => void handleReleaseFunds()}
            >
              {isReleasing ? (
                <ActivityIndicator size="small" color="#1D4ED8" />
              ) : (
                <Text style={styles.secondaryButtonText}>Release Held Funds</Text>
              )}
            </Pressable>
          ) : null}

          <Pressable
            style={[styles.secondaryButton, isRefreshing && styles.disabledButton]}
            disabled={isRefreshing || isLoading}
            onPress={() => void handleRefresh()}
          >
            {isRefreshing ? (
              <ActivityIndicator size="small" color="#1D4ED8" />
            ) : (
              <Text style={styles.secondaryButtonText}>Refresh Payout Status</Text>
            )}
          </Pressable>

          <Pressable style={styles.button} onPress={() => router.replace('/driver-home')}>
            <Text style={styles.buttonText}>Back to Driver Home</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 20,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    color: '#334155',
  },
  meta: {
    color: '#475569',
  },
  noticeCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  noticeTitle: {
    color: '#1D4ED8',
    fontSize: 15,
    fontWeight: '700',
  },
  noticeText: {
    color: '#1E3A8A',
    fontSize: 13,
    lineHeight: 20,
  },
  noticeMeta: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '600',
  },
  statusMeta: {
    color: '#334155',
    fontSize: 12,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#1D4ED8',
    fontSize: 13,
    fontWeight: '600',
  },
  actionGroup: {
    marginTop: 8,
    gap: 8,
  },
  button: {
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.65,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
    lineHeight: 18,
  },
});
