import { useFocusEffect, useRouter } from 'expo-router';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DriverIcon } from '@/components/driver-icon';
import {
  DriverButton,
  DriverCard,
  DriverNotice,
  DriverPageHeader,
  DriverText,
} from '@/components/ui/driver-ui';
import { getDriverPaymentHistory } from '@/lib/api';
import { useAppLanguage } from '@/localization/provider';
import {
  driverLayout,
  driverRadius,
  driverSpace,
  useDriverColors,
  type DriverColors,
} from '@/theme/driver-theme';
import type { DriverEarning } from '@/types/auth';

function formatMoney(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
}

function formatDate(value: string | null, locale: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

function paymentDetails(payment: DriverEarning, t: TFunction, locale: string) {
  if (payment.requiresManualReview)
    return {
      label: t('Under review'),
      detail: t('Payment needs review before release.'),
      tone: 'warning' as const,
    };
  if (payment.paymentStatus === 'PAYMENT_REFUNDED')
    return { label: t('Refunded'), detail: t('This payment was refunded.'), tone: 'info' as const };
  if (payment.paymentStatus === 'PAYMENT_PARTIALLY_REFUNDED')
    return {
      label: t('Partially refunded'),
      detail: t('Payment needs review before release.'),
      tone: 'warning' as const,
    };
  if (payment.tripStatus === 'CANCELLED' || payment.status === 'CANCELLED')
    return {
      label: t('Cancelled'),
      detail: t('This earning was cancelled'),
      tone: 'danger' as const,
    };
  if (payment.paymentStatus === 'PAYMENT_RELEASED' || payment.paymentStatus === 'PAYMENT_CANCELLED')
    return {
      label: t('Released'),
      detail: t('The payment hold was released.'),
      tone: 'info' as const,
    };
  if (payment.paymentStatus === 'PAYMENT_HELD')
    return {
      label: t('Not captured'),
      detail: t('Funds held. Open trip to check release.'),
      tone: 'warning' as const,
    };
  if (payment.paymentStatus === 'PAYMENT_CAPTURED')
    return {
      label: t('Captured'),
      detail: t('Payment collected into the Stripe account.'),
      tone: 'success' as const,
    };
  if (payment.paymentStatus === 'PAYMENT_FAILED')
    return {
      label: t('Payment failed'),
      detail: t('Payment has not been captured.'),
      tone: 'danger' as const,
    };
  if (payment.status === 'PAID_OUT')
    return {
      label: t('Paid'),
      detail: t('Paid {{date}}', { date: formatDate(payment.paidOutAt, locale) }),
      tone: 'success' as const,
    };
  return {
    label: t('Pending'),
    detail: t('Payment has not been captured.'),
    tone: 'info' as const,
  };
}

function canOpenPayment(payment: DriverEarning) {
  return (
    !payment.requiresManualReview &&
    payment.status !== 'PAID_OUT' &&
    payment.status !== 'CANCELLED' &&
    payment.tripStatus !== 'CANCELLED' &&
    ![
      'PAYMENT_REFUNDED',
      'PAYMENT_PARTIALLY_REFUNDED',
      'PAYMENT_RELEASED',
      'PAYMENT_CANCELLED',
      'PAYMENT_FAILED',
    ].includes(payment.paymentStatus ?? '')
  );
}

export default function EarningsHistoryScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { locale, isRTL } = useAppLanguage();
  const colors = useDriverColors();
  const styles = createStyles(colors);
  const [payments, setPayments] = useState<DriverEarning[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const loadingMore = useRef(false);

  const loadPayments = useCallback(
    async (refreshing = false) => {
      const current = ++generation.current;
      if (refreshing) setIsRefreshing(true);
      else setIsLoading(true);
      setError('');
      try {
        const response = await getDriverPaymentHistory(1);
        if (current !== generation.current) return;
        setPayments(response.items);
        setPage(response.page);
        setTotalPages(response.totalPages);
      } catch {
        if (current === generation.current) setError(t('Failed to load earnings history.'));
      } finally {
        if (current === generation.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [t],
  );

  useFocusEffect(
    useCallback(() => {
      void loadPayments();
      return () => {
        generation.current++;
      };
    }, [loadPayments]),
  );

  const loadMore = async () => {
    if (loadingMore.current || isLoading || isRefreshing || page >= totalPages) return;
    const current = generation.current;
    loadingMore.current = true;
    setIsLoadingMore(true);
    setError('');
    try {
      const response = await getDriverPaymentHistory(page + 1);
      if (current !== generation.current) return;
      setPayments((previous) => [
        ...previous,
        ...response.items.filter(
          (item) => !previous.some((existing) => existing.tripId === item.tripId),
        ),
      ]);
      setPage(response.page);
      setTotalPages(response.totalPages);
    } catch {
      if (current === generation.current) setError(t('Failed to load earnings history.'));
    } finally {
      loadingMore.current = false;
      setIsLoadingMore(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <DriverPageHeader
        title={t('Earnings History')}
        backLabel={t('Go back')}
        onBack={() => router.back()}
        rtl={isRTL}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadPayments(true)}
            tintColor={colors.primary}
          />
        }
      >
        <DriverNotice
          tone="info"
          title={t('Your app transactions')}
          description={t(
            'Captured payments and held funds appear here. Open a pending payment to check release.',
          )}
        />
        {isLoading ? (
          <ActivityIndicator
            style={styles.loading}
            accessibilityLabel={t('Loading')}
            color={colors.primary}
          />
        ) : (
          <>
            {error ? <DriverNotice tone="danger" title={error} /> : null}
            {error && payments.length === 0 ? (
              <DriverButton label={t('Try Again')} onPress={() => void loadPayments()} />
            ) : null}
            {!error && payments.length === 0 ? (
              <DriverCard>
                <DriverText variant="section">{t('No transactions yet')}</DriverText>
                <DriverText secondary>
                  {t('Captured payments and held funds will appear here.')}
                </DriverText>
              </DriverCard>
            ) : null}
            {payments.map((payment) => {
              const status = paymentDetails(payment, t, locale);
              const clickable = canOpenPayment(payment);
              const captured =
                payment.paymentStatus === 'PAYMENT_CAPTURED' || payment.status === 'PAID_OUT';
              const foreground = colors[status.tone];
              const content = (
                <>
                  <View style={styles.topRow}>
                    <View style={styles.icon}>
                      <DriverIcon
                        name={captured ? 'money' : 'clock'}
                        color={foreground}
                        size={24}
                      />
                    </View>
                    <View style={styles.info}>
                      <DriverText variant="section">{t('Trip earning')}</DriverText>
                      <DriverText variant="caption" secondary>
                        {status.detail}
                      </DriverText>
                    </View>
                    <View style={styles.amountBlock}>
                      <DriverText
                        variant="section"
                        style={{ color: captured ? colors.success : colors.text }}
                      >
                        {formatMoney(payment.netAmount, payment.currency, locale)}
                      </DriverText>
                      <DriverText variant="caption" secondary>
                        {t('Before Stripe fees')}
                      </DriverText>
                    </View>
                    {clickable ? (
                      <View
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                        style={isRTL ? styles.rtlArrow : undefined}
                      >
                        <DriverIcon name="chevron-right" color={colors.textSecondary} />
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.footer}>
                    <DriverText
                      variant="caption"
                      secondary
                      style={styles.reference}
                    >{`TRP-${payment.tripId.replace(/-/g, '').slice(0, 8).toUpperCase()}`}</DriverText>
                    <View style={[styles.badge, { backgroundColor: colors[`${status.tone}Soft`] }]}>
                      <DriverText variant="caption" style={{ color: foreground }}>
                        {status.label}
                      </DriverText>
                    </View>
                  </View>
                </>
              );
              return clickable ? (
                <Pressable
                  key={payment.tripId}
                  accessibilityRole="button"
                  accessibilityLabel={t('Open payment for trip {{id}}', {
                    id: payment.tripId.replace(/-/g, '').slice(0, 8).toUpperCase(),
                  })}
                  accessibilityHint={t('Opens the trip payment release screen.')}
                  style={({ pressed }) => [styles.card, pressed && styles.pressed]}
                  onPress={() =>
                    router.push({
                      pathname: '/driver-trip-completed',
                      params: {
                        tripId: payment.tripId,
                        deliveredAt: payment.deliveredAt ?? '',
                        tripStatus: payment.tripStatus ?? '',
                        fromHistory: 'true',
                      },
                    })
                  }
                >
                  {content}
                </Pressable>
              ) : (
                <View key={payment.tripId} style={styles.card}>
                  {content}
                </View>
              );
            })}
            {page < totalPages ? (
              <DriverButton
                label={t('Load more')}
                variant="secondary"
                loading={isLoadingMore}
                disabled={isRefreshing}
                onPress={() => void loadMore()}
              />
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Keep the existing light driver palette and shared dimensions.
function createStyles(colors: DriverColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.canvas },
    content: {
      padding: driverSpace.xl,
      paddingBottom: driverSpace.section,
      gap: driverSpace.md,
      width: '100%',
      maxWidth: driverLayout.maxWidth,
      alignSelf: 'center',
      flexGrow: 1,
    },
    loading: { marginVertical: driverSpace.section },
    card: {
      padding: driverSpace.lg,
      borderRadius: driverRadius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      minHeight: 100,
    },
    pressed: { opacity: 0.75 },
    topRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: driverSpace.sm },
    icon: {
      width: 42,
      height: 42,
      borderRadius: driverRadius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accentSoft,
    },
    info: { flexGrow: 1, flexShrink: 1, flexBasis: 110 },
    amountBlock: { flexShrink: 1, alignItems: 'flex-end' },
    footer: {
      marginTop: driverSpace.md,
      paddingTop: driverSpace.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: driverSpace.sm,
    },
    reference: { flexShrink: 1 },
    badge: {
      paddingHorizontal: driverSpace.sm,
      paddingVertical: driverSpace.xs,
      borderRadius: driverRadius.pill,
    },
    rtlArrow: { transform: [{ scaleX: -1 }] },
  });
}
