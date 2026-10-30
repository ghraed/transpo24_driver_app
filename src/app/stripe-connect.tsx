import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  createStripeConnectAccount,
  getStripeConnectDashboardLink,
  getStripeConnectStatus,
  removeStripeConnectAccount,
  syncStripeConnectAccount,
  type StripeConnectStatusResponse,
} from '@/lib/api';
import { DriverButton, DriverCard, DriverNotice, DriverText } from '@/components/ui/driver-ui';
import { driverComponents, driverSpace, useDriverColors } from '@/theme/driver-theme';

export default function StripeConnectScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colors = useDriverColors();
  const [status, setStatus] = useState<StripeConnectStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOpeningDashboard, setIsOpeningDashboard] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const statusRevision = useRef(0);
  const isBusy = isCreating || isSyncing || isOpeningDashboard || isRemoving;

  const loadStatus = useCallback(async () => {
    const revision = statusRevision.current;
    setIsLoading(true);
    setError('');
    try {
      const data = await getStripeConnectStatus();
      if (revision === statusRevision.current) setStatus(data);
    } catch (err) {
      if (revision === statusRevision.current) {
        setError(err instanceof Error ? err.message : t('Failed to load Stripe Connect status.'));
      }
    } finally {
      if (revision === statusRevision.current) setIsLoading(false);
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
      const result = await createStripeConnectAccount(status?.stripeAccountId ? undefined : email);
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

  const handleRemoveAccount = async () => {
    setIsRemoving(true);
    setError('');
    statusRevision.current += 1;
    try {
      const disconnectedStatus = await removeStripeConnectAccount();
      statusRevision.current += 1;
      setStatus(disconnectedStatus);
      setEmail('');
      setConfirmRemoval(false);
    } catch {
      setError(t('Failed to remove Stripe account. Please try again.'));
    } finally {
      setIsLoading(false);
      setIsRemoving(false);
    }
  };

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
          <ActivityIndicator size="large" color="#FFC515" />
          <Text style={styles.loadingText}>{t('Loading')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
            <DriverCard>
              <DriverText variant="label">{t('Stripe email (optional)')}</DriverText>
              <TextInput
                accessibilityLabel={t('Stripe email (optional)')}
                value={email}
                onChangeText={setEmail}
                editable={!isBusy}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                style={{
                  minHeight: driverComponents.input.minHeight,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: driverComponents.input.radius,
                  paddingHorizontal: driverSpace.lg,
                  marginVertical: driverSpace.sm,
                  color: colors.text,
                  backgroundColor: colors.surface,
                }}
              />
              <DriverText secondary variant="caption">
                {t('Use the same or a different email. Leave blank to use your Transpo24 email.')}
              </DriverText>
            </DriverCard>
          ) : null}

          {!hasAccount ? (
            <Pressable
              style={[styles.actionButton, isBusy && styles.disabledButton]}
              disabled={isBusy}
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
              style={[styles.actionButton, isBusy && styles.disabledButton]}
              disabled={isBusy}
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
              style={[styles.secondaryButton, isBusy && styles.disabledButton]}
              disabled={isBusy}
              onPress={() => void handleSync()}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color="#FFC515" />
              ) : (
                <Text style={styles.secondaryButtonText}>{t('Refresh status')}</Text>
              )}
            </Pressable>
          ) : null}

          {isReady ? (
            <Pressable
              style={[styles.dashboardButton, isBusy && styles.disabledButton]}
              disabled={isBusy}
              onPress={() => void handleOpenDashboard()}
            >
              {isOpeningDashboard ? (
                <ActivityIndicator size="small" color="#202020" />
              ) : (
                <Text style={styles.dashboardButtonText}>{t('View Stripe Dashboard')}</Text>
              )}
            </Pressable>
          ) : null}

          {hasAccount ? (
            confirmRemoval ? (
              <DriverCard style={{ gap: driverSpace.md }}>
                <DriverNotice
                  tone="warning"
                  title={t('Remove Stripe account?')}
                  description={t('This disconnects your payout account from Transpo24. Your Stripe account and previous payouts remain. New payouts wait until you complete onboarding again. You can use the same or a different email.')}
                />
                <DriverButton
                  label={t('Remove Stripe account')}
                  variant="secondary"
                  loading={isRemoving}
                  disabled={isBusy}
                  onPress={() => void handleRemoveAccount()}
                />
                <DriverButton
                  label={t('Cancel')}
                  variant="quiet"
                  disabled={isBusy}
                  onPress={() => setConfirmRemoval(false)}
                />
              </DriverCard>
            ) : (
              <DriverButton
                label={t('Remove Stripe account')}
                variant="secondary"
                disabled={isBusy}
                onPress={() => setConfirmRemoval(true)}
              />
            )
          ) : null}

          <Pressable style={styles.backButton} disabled={isRemoving} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>{t('Back')}</Text>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F8F9',
  },
  header: {
    padding: 20,
    gap: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#202020',
  },
  subtitle: {
    fontSize: 14,
    color: '#707A8C',
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#707A8C',
    fontSize: 14,
  },
  content: {
    flexGrow: 1,
    padding: 20,
    gap: 16,
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DFE3E8',
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
    color: '#505A6A',
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
    backgroundColor: '#FFC515',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    color: '#171717',
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
    color: '#FFC515',
    fontWeight: '700',
    fontSize: 15,
  },
  dashboardButton: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#202020',
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashboardButtonText: {
    color: '#202020',
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
    color: '#707A8C',
    fontSize: 15,
    fontWeight: '500',
  },
});
