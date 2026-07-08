import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  getStripeConnectStatus,
  retryTransferForTrip,
  syncStripeConnectAccount,
  type RetryTransferResponse,
  type StripeConnectStatusResponse,
} from '@/lib/api';
import type { RequestStatus } from '@/types/auth';
import { isValidTripId } from '@/utils/deliveryValidation';

type DriverPayoutStatusCardProps = {
  title?: string;
  tripId?: string | null;
  requestStatus?: RequestStatus | null;
  amountLabel?: string | null;
  onOpenStripeConnect?: (() => void) | null;
};

function normalizeAccountStatus(status: string | null): string {
  if (!status) return 'Not available';

  return status
    .split('_')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(' ');
}

function isTripAwaitingPayout(status: RequestStatus | null | undefined): boolean {
  return status === 'DELIVERED' || status === 'COMPLETED';
}

function resolveStatusTone(params: {
  stripeStatus: StripeConnectStatusResponse | null;
  requestStatus?: RequestStatus | null;
  transferResult: RetryTransferResponse | null;
  transferError: string;
  isReleasing: boolean;
}): 'info' | 'warning' | 'success' | 'danger' {
  const { stripeStatus, requestStatus, transferResult, transferError, isReleasing } = params;

  if (isReleasing) return 'info';
  if (transferError) return 'danger';
  if (transferResult?.transferred) return 'success';
  if (!stripeStatus?.stripeAccountId || !stripeStatus.payoutsEnabled) return 'warning';
  if (requestStatus && !isTripAwaitingPayout(requestStatus)) return 'info';
  if (transferResult && !transferResult.transferred) return 'warning';
  return 'info';
}

function resolveHeadline(params: {
  stripeStatus: StripeConnectStatusResponse | null;
  requestStatus?: RequestStatus | null;
  transferResult: RetryTransferResponse | null;
  transferError: string;
  isReleasing: boolean;
  hasValidTripId: boolean;
}): string {
  const { stripeStatus, requestStatus, transferResult, transferError, isReleasing, hasValidTripId } =
    params;

  if (isReleasing) {
    return 'Releasing held funds to your Stripe payout account...';
  }

  if (requestStatus && !isTripAwaitingPayout(requestStatus)) {
    return 'Payout is not available for this trip yet.';
  }

  if (!stripeStatus?.stripeAccountId) {
    return 'Funds stay held until you create a Stripe Connect payout account.';
  }

  if (!stripeStatus.payoutsEnabled) {
    return 'Funds are held because Stripe payouts are not enabled yet.';
  }

  if (transferResult?.transferred) {
    return 'Held funds were released successfully to your Stripe-connected payout account.';
  }

  if (transferError) {
    return 'The last payout release attempt for this trip failed.';
  }

  if (transferResult && !transferResult.transferred) {
    return 'Stripe did not create a new payout release for this trip.';
  }

  if (hasValidTripId) {
    return 'Held funds are ready to release for this delivered trip.';
  }

  return 'Your payout account is ready. Delivered trips can be released from here.';
}

function resolveDetails(params: {
  stripeStatus: StripeConnectStatusResponse | null;
  requestStatus?: RequestStatus | null;
  transferResult: RetryTransferResponse | null;
  transferError: string;
  hasValidTripId: boolean;
}): string {
  const { stripeStatus, requestStatus, transferResult, transferError, hasValidTripId } = params;

  if (requestStatus && !isTripAwaitingPayout(requestStatus)) {
    return 'This trip must reach Delivered or Completed before payout release is available.';
  }

  if (!stripeStatus?.stripeAccountId) {
    return 'Create your Stripe Connect account first, then come back to release held trip funds.';
  }

  if (!stripeStatus.payoutsEnabled) {
    return 'Complete Stripe onboarding and enable payouts before held funds can be released.';
  }

  if (transferResult?.transferred && transferResult.stripeTransferId) {
    return `Transfer reference: ${transferResult.stripeTransferId}`;
  }

  if (transferResult?.reason?.trim()) {
    return transferResult.reason.trim();
  }

  if (transferError) {
    return transferError;
  }

  if (hasValidTripId) {
    return 'The app will only request payout release when the trip is payout-eligible and Stripe payouts are ready.';
  }

  return 'No delivered trip is currently selected for release in this summary.';
}

export function DriverPayoutStatusCard({
  title = 'Payout Status',
  tripId,
  requestStatus,
  amountLabel,
  onOpenStripeConnect,
}: DriverPayoutStatusCardProps) {
  const normalizedTripId = tripId?.trim() ?? '';
  const hasValidTripId = isValidTripId(normalizedTripId);
  const isEligibleForRelease = hasValidTripId && isTripAwaitingPayout(requestStatus);

  const [stripeStatus, setStripeStatus] = useState<StripeConnectStatusResponse | null>(null);
  const [transferResult, setTransferResult] = useState<RetryTransferResponse | null>(null);
  const [screenError, setScreenError] = useState('');
  const [transferError, setTransferError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReleasing, setIsReleasing] = useState(false);

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
            // Keep cached account status if sync fails.
          }
        }

        setStripeStatus(currentStripeStatus);

        if (!isEligibleForRelease) {
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
          const payoutRelease = await retryTransferForTrip(normalizedTripId);
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
          error instanceof Error ? error.message : 'Failed to load payout status.',
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [isEligibleForRelease, normalizedTripId],
  );

  useFocusEffect(
    useCallback(() => {
      void loadWorkflow({ attemptRelease: false, silent: false });
    }, [loadWorkflow]),
  );

  const handleRefresh = async () => {
    await loadWorkflow({ attemptRelease: false, silent: true });
  };

  const handleRelease = async () => {
    await loadWorkflow({ attemptRelease: true, silent: true });
  };

  const tone = resolveStatusTone({
    stripeStatus,
    requestStatus,
    transferResult,
    transferError,
    isReleasing,
  });

  const payoutHeadline = resolveHeadline({
    stripeStatus,
    requestStatus,
    transferResult,
    transferError,
    isReleasing,
    hasValidTripId,
  });

  const payoutDetails = resolveDetails({
    stripeStatus,
    requestStatus,
    transferResult,
    transferError,
    hasValidTripId,
  });

  return (
    <View
      style={[
        styles.card,
        tone === 'warning' && styles.cardWarning,
        tone === 'success' && styles.cardSuccess,
        tone === 'danger' && styles.cardDanger,
      ]}
    >
      <Text style={styles.title}>{title}</Text>

      {isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="#1D4ED8" />
          <Text style={styles.loadingText}>Checking payout status...</Text>
        </View>
      ) : (
        <>
          <Text
            style={[
              styles.headline,
              tone === 'warning' && styles.headlineWarning,
              tone === 'success' && styles.headlineSuccess,
              tone === 'danger' && styles.headlineDanger,
            ]}
          >
            {payoutHeadline}
          </Text>
          <Text style={styles.details}>{payoutDetails}</Text>
          {amountLabel ? <Text style={styles.meta}>Trip amount: {amountLabel}</Text> : null}
          {requestStatus ? <Text style={styles.meta}>Trip status: {requestStatus}</Text> : null}
          <Text style={styles.meta}>
            Stripe payouts enabled: {stripeStatus?.payoutsEnabled ? 'Yes' : 'No'}
          </Text>
          <Text style={styles.meta}>
            Stripe account status: {normalizeAccountStatus(stripeStatus?.accountStatus ?? null)}
          </Text>
        </>
      )}

      {screenError ? <Text style={styles.errorText}>{screenError}</Text> : null}
      {!screenError && transferError ? <Text style={styles.errorText}>{transferError}</Text> : null}

      <View style={styles.actions}>
        {onOpenStripeConnect && (!stripeStatus?.stripeAccountId || !stripeStatus.payoutsEnabled) ? (
          <Pressable style={styles.secondaryButton} onPress={onOpenStripeConnect}>
            <Text style={styles.secondaryButtonText}>Open Stripe Connect</Text>
          </Pressable>
        ) : null}

        {isEligibleForRelease && stripeStatus?.payoutsEnabled && !transferResult?.transferred ? (
          <Pressable
            style={[styles.secondaryButton, isReleasing && styles.disabledButton]}
            disabled={isReleasing}
            onPress={() => void handleRelease()}
          >
            {isReleasing ? (
              <ActivityIndicator size="small" color="#1D4ED8" />
            ) : (
              <Text style={styles.secondaryButtonText}>Release Held Funds</Text>
            )}
          </Pressable>
        ) : null}

        <Pressable
          style={[styles.secondaryButton, (isRefreshing || isLoading) && styles.disabledButton]}
          disabled={isRefreshing || isLoading}
          onPress={() => void handleRefresh()}
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color="#1D4ED8" />
          ) : (
            <Text style={styles.secondaryButtonText}>Refresh Status</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    padding: 12,
    gap: 6,
  },
  cardWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  cardSuccess: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  cardDanger: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
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
  headline: {
    color: '#1E3A8A',
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
  headlineWarning: {
    color: '#B45309',
  },
  headlineSuccess: {
    color: '#15803D',
  },
  headlineDanger: {
    color: '#B91C1C',
  },
  details: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 19,
  },
  meta: {
    color: '#475569',
    fontSize: 12,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    marginTop: 4,
    gap: 8,
  },
  secondaryButton: {
    minHeight: 42,
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
});
