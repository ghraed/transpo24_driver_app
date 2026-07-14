import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  createStripeConnectAccount,
  getStripeConnectDashboardLink,
  getStripeConnectStatus,
  syncStripeConnectAccount,
  type StripeConnectStatusResponse,
} from '@/lib/api';

export default function StripeConnectScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [status, setStatus] = useState<StripeConnectStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOpeningDashboard, setIsOpeningDashboard] = useState(false);
  const [error, setError] = useState('');

  const loadStatus = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await getStripeConnectStatus();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Failed to load Stripe Connect status.'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  // Auto-sync with Stripe when the screen gains focus (e.g. returning from
  // onboarding redirect). This picks up the latest account status from Stripe.
  useFocusEffect(
    useCallback(() => {
      void (async () => {
        // First load cached status for instant UI
        await loadStatus();

        // Then sync with Stripe if account exists
        try {
          const currentStatus = await getStripeConnectStatus();
          if (currentStatus.stripeAccountId) {
            await syncStripeConnectAccount();
            await loadStatus();
          }
        } catch {
          // Sync is best-effort; cached status is already loaded
        }
      })();
    }, [loadStatus]),
  );

  const handleCreateAccount = async () => {
    setIsCreating(true);
    setError('');
    try {
      const result = await createStripeConnectAccount();
      if (result.onboardingUrl) {
        await Linking.openURL(result.onboardingUrl);
      }
      // Sync after returning from onboarding
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Failed to create Stripe Connect account.'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setError('');
    try {
      await syncStripeConnectAccount();
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Failed to sync Stripe Connect account.'));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleOpenDashboard = async () => {
    setIsOpeningDashboard(true);
    setError('');
    try {
      const result = await getStripeConnectDashboardLink();
      if (result.url) {
        await Linking.openURL(result.url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Failed to open Stripe dashboard.'));
    } finally {
      setIsOpeningDashboard(false);
    }
  };

  const hasAccount = Boolean(status?.stripeAccountId);
  const isReady = Boolean(status?.payoutsEnabled);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('Stripe Connect')}</Text>
        <Text style={styles.subtitle}>
          {t('Set up your payout account to receive earnings directly to your bank account.')}
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>{t('Loading')}</Text>
        </View>
      ) : (
        <View style={styles.content}>
          <View style={styles.statusCard}>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>{t('Account Created')}</Text>
              <Text style={hasAccount ? styles.statusYes : styles.statusNo}>
                {hasAccount ? t('Yes') : t('No')}
              </Text>
            </View>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>{t('Details Submitted')}</Text>
              <Text
                style={status?.detailsSubmitted ? styles.statusYes : styles.statusNo}
              >
                {status?.detailsSubmitted ? t('Yes') : t('No')}
              </Text>
            </View>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>{t('Payouts Enabled')}</Text>
              <Text style={isReady ? styles.statusYes : styles.statusNo}>
                {isReady ? t('Yes') : t('No')}
              </Text>
            </View>
          </View>

          {isReady ? (
            <View style={styles.readyCard}>
              <Text style={styles.readyText}>
                {t('Your Stripe Connect account can receive payouts. When a delivery is confirmed, held funds can be released to your connected payout account.')}
              </Text>
            </View>
          ) : (
            <View style={styles.warningCard}>
              <Text style={styles.warningText}>
                {t('You need to complete Stripe Connect onboarding to receive payouts. Without this, your earnings will be held as pending.')}
              </Text>
            </View>
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {!hasAccount ? (
            <Pressable
              style={[styles.actionButton, isCreating && styles.disabledButton]}
              disabled={isCreating}
              onPress={() => void handleCreateAccount()}
            >
              {isCreating ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.actionButtonText}>{t('Create Stripe Account')}</Text>
              )}
            </Pressable>
          ) : !isReady ? (
            <Pressable
              style={[styles.actionButton, isCreating && styles.disabledButton]}
              disabled={isCreating}
              onPress={() => void handleCreateAccount()}
            >
              {isCreating ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.actionButtonText}>{t('Complete Onboarding')}</Text>
              )}
            </Pressable>
          ) : null}

          {hasAccount ? (
            <Pressable
              style={[styles.secondaryButton, isSyncing && styles.disabledButton]}
              disabled={isSyncing}
              onPress={() => void handleSync()}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color="#2563EB" />
              ) : (
                <Text style={styles.secondaryButtonText}>{t('Refresh status')}</Text>
              )}
            </Pressable>
          ) : null}

          {isReady ? (
            <Pressable
              style={[styles.dashboardButton, isOpeningDashboard && styles.disabledButton]}
              disabled={isOpeningDashboard}
              onPress={() => void handleOpenDashboard()}
            >
              {isOpeningDashboard ? (
                <ActivityIndicator size="small" color="#0F172A" />
              ) : (
                <Text style={styles.dashboardButtonText}>{t('View Stripe Dashboard')}</Text>
              )}
            </Pressable>
          ) : null}

          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>{t('Back')}</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    padding: 20,
    gap: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 14,
    color: '#475569',
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#64748B',
    fontSize: 14,
  },
  content: {
    flex: 1,
    padding: 20,
    gap: 16,
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    gap: 12,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 15,
    color: '#334155',
    fontWeight: '500',
  },
  statusYes: {
    fontSize: 15,
    color: '#16A34A',
    fontWeight: '700',
  },
  statusNo: {
    fontSize: 15,
    color: '#B91C1C',
    fontWeight: '700',
  },
  readyCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    padding: 16,
  },
  readyText: {
    color: '#15803D',
    fontSize: 14,
    lineHeight: 20,
  },
  warningCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 16,
  },
  warningText: {
    color: '#B45309',
    fontSize: 14,
    lineHeight: 20,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 14,
  },
  actionButton: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#2563EB',
    fontWeight: '700',
    fontSize: 15,
  },
  dashboardButton: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0F172A',
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashboardButtonText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 15,
  },
  disabledButton: {
    opacity: 0.6,
  },
  backButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    color: '#64748B',
    fontSize: 15,
    fontWeight: '500',
  },
});
