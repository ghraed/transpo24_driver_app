import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  getStripeConnectStatus,
  retryTransferForTrip,
  syncStripeConnectAccount,
  type RetryTransferResponse,
  type StripeConnectStatusResponse,
} from '@/lib/api';
import { getRequestStatusLabel } from '@/lib/request-status-display';
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

export function DriverPayoutStatusCard({
  title,
  tripId,
  requestStatus,
  amountLabel,
  onOpenStripeConnect,
}: DriverPayoutStatusCardProps) {
  const { t } = useTranslation();
  const normalizedTripId = tripId?.trim() ?? '';
  const hasValidTripId = isValidTripId(normalizedTripId);
  const isEligibleForRelease = hasValidTripId && isTripAwaitingPayout(requestStatus);

  const [stripeStatus, setStripeStatus] = useState<StripeConnectStatusResponse | null>(null);
  const [transferResult, setTransferResult] = useState<RetryTransferResponse | null>(null);
  const [screenError, setScreenError] = useState('');
  const [transferError, setTransferError] = useState('');
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
            error instanceof Error ? error.message : t('Failed to release held trip funds.'),
          );
        } finally {
          setIsReleasing(false);
        }
      } catch (error) {
        setScreenError(
          error instanceof Error ? error.message : t('Failed to load payout status.'),
        );
      } finally {
        setIsRefreshing(false);
      }
    },
    [isEligibleForRelease, normalizedTripId, t],
  );

  useFocusEffect(
    useCallback(() => {
      void loadWorkflow({ attemptRelease: false, silent: false });
    }, [loadWorkflow]),
  );

  const tone = resolveStatusTone({
    stripeStatus,
    requestStatus,
    transferResult,
    transferError,
    isReleasing,
  });

  const headline = isReleasing
    ? t('Releasing held funds to your Stripe payout account...')
    : requestStatus && !isTripAwaitingPayout(requestStatus)
      ? t('Payout is not available for this trip yet.')
      : !stripeStatus?.stripeAccountId
        ? t('Funds stay held until you create a Stripe Connect payout account.')
        : !stripeStatus.payoutsEnabled
          ? t('Funds are held because Stripe payouts are not enabled yet.')
          : transferResult?.transferred
            ? t('Held funds were released successfully to your Stripe-connected payout account.')
            : transferError
              ? t('The last payout release attempt for this trip failed.')
              : transferResult && !transferResult.transferred
                ? t('Stripe did not create a new payout release for this trip.')
                : hasValidTripId
                  ? t('Held funds are ready to release for this delivered trip.')
                  : t('Your payout account is ready. Delivered trips can be released from here.');

  const details = requestStatus && !isTripAwaitingPayout(requestStatus)
    ? t('This trip must reach Delivered or Completed before payout release is available.')
    : !stripeStatus?.stripeAccountId
      ? t('Create your Stripe Connect account first, then come back to release held trip funds.')
      : !stripeStatus.payoutsEnabled
        ? t('Complete Stripe onboarding and enable payouts before held funds can be released.')
        : transferResult?.transferred && transferResult.stripeTransferId
          ? `${t('Request')}: ${transferResult.stripeTransferId}`
          : transferResult?.reason?.trim()
            ? transferResult.reason.trim()
            : transferError
              ? transferError
              : hasValidTripId
                ? t('The app will only request payout release when the trip is payout-eligible and Stripe payouts are ready.')
                : t('No delivered trip is currently selected for release in this summary.');

  const toneStyle =
    tone === 'danger'
      ? styles.dangerTone
      : tone === 'success'
        ? styles.successTone
        : tone === 'warning'
          ? styles.warningTone
          : styles.infoTone;

  return (
    <View style={[styles.card, toneStyle]}>
      <Text style={styles.title}>{title || t('Payout Status')}</Text>
      {requestStatus ? (
        <Text style={styles.metaText}>{getRequestStatusLabel(requestStatus)}</Text>
      ) : null}
      {amountLabel ? <Text style={styles.amountText}>{amountLabel}</Text> : null}
      <Text style={styles.headline}>{headline}</Text>
      <Text style={styles.details}>{details}</Text>
      {stripeStatus?.accountStatus ? (
        <Text style={styles.metaText}>{normalizeAccountStatus(stripeStatus.accountStatus)}</Text>
      ) : null}
      {screenError ? <Text style={styles.errorText}>{screenError}</Text> : null}

      <View style={styles.actionsRow}>
        <Pressable style={styles.secondaryButton} onPress={() => void loadWorkflow({ attemptRelease: false, silent: true })}>
          <Text style={styles.secondaryButtonText}>
            {isRefreshing ? t('Loading') : t('Refresh payout status')}
          </Text>
        </Pressable>
        {onOpenStripeConnect ? (
          <Pressable style={styles.secondaryButton} onPress={onOpenStripeConnect}>
            <Text style={styles.secondaryButtonText}>{t('Stripe Connect (Payouts)')}</Text>
          </Pressable>
        ) : null}
      </View>

      {isEligibleForRelease ? (
        <Pressable
          style={[styles.primaryButton, isReleasing && styles.primaryButtonDisabled]}
          onPress={() => void loadWorkflow({ attemptRelease: true, silent: true })}
          disabled={isReleasing}
        >
          {isReleasing ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{t('Release Payout')}</Text>}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  infoTone: {
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
  },
  warningTone: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  successTone: {
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FDF4',
  },
  dangerTone: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  title: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  headline: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  details: { fontSize: 13, color: '#475569' },
  metaText: { fontSize: 12, color: '#64748B' },
  amountText: { fontSize: 20, fontWeight: '700', color: '#0F172A' },
  errorText: { color: '#B91C1C', fontSize: 13 },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  secondaryButton: {
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  secondaryButtonText: { color: '#334155', fontWeight: '700', fontSize: 12 },
  primaryButton: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: { opacity: 0.7 },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '700' },
});
