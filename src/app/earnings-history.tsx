import { useFocusEffect, useRouter } from 'expo-router';
import type { TFunction } from 'i18next';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DriverIcon } from '@/components/driver-icon';
import { getDriverEarnings } from '@/lib/api';
import { useAppLanguage } from '@/localization/provider';
import type { DriverEarning } from '@/types/auth';

function formatMoney(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function formatDate(value: string | null, locale: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusDetails(
  earning: DriverEarning,
  locale: string,
  t: TFunction,
): { label: string; detail: string; color: string; background: string } {
  switch (earning.status) {
    case 'PAID_OUT':
      return {
        label: t('Paid'),
        detail: t('Paid {{date}}', { date: formatDate(earning.paidOutAt, locale) }),
        color: '#07883E',
        background: '#E5F7EC',
      };
    case 'AVAILABLE':
      return {
        label: t('Ready for payout'),
        detail: t('Waiting for transfer'),
        color: '#A96900',
        background: '#FFF4D6',
      };
    case 'CANCELLED':
      return {
        label: t('Cancelled'),
        detail: t('This earning was cancelled'),
        color: '#C92828',
        background: '#FDE8E8',
      };
    default:
      return {
        label: t('Pending'),
        detail: earning.availableAt
          ? t('Available {{date}}', { date: formatDate(earning.availableAt, locale) })
          : t('Being processed'),
        color: '#6A7280',
        background: '#EEF0F3',
      };
  }
}

export default function EarningsHistoryScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { locale } = useAppLanguage();
  const [earnings, setEarnings] = useState<DriverEarning[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadEarnings = useCallback(async (refreshing = false) => {
    if (refreshing) setIsRefreshing(true);
    else setIsLoading(true);
    setError('');
    try {
      const response = await getDriverEarnings();
      setEarnings(response.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Failed to load earnings history.'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void loadEarnings();
    }, [loadEarnings]),
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Pressable accessibilityLabel={t('Go back')} hitSlop={12} onPress={() => router.back()}>
          <DriverIcon name="arrow-back" size={29} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.title}>{t('Earnings History')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadEarnings(true)}
            tintColor="#F0AF00"
            colors={['#F0AF00']}
          />
        }
      >
        <View style={styles.introCard}>
          <DriverIcon name="money" size={25} color="#A96900" />
          <View style={styles.introTextWrap}>
            <Text style={styles.introTitle}>{t('Your app transactions')}</Text>
            <Text style={styles.introText}>{t('Track earnings and transfers made to your payout account.')}</Text>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.centerContent}><ActivityIndicator size="large" color="#F0AF00" /></View>
        ) : error ? (
          <View style={styles.centerContent}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryButton} onPress={() => void loadEarnings()}>
              <Text style={styles.retryText}>{t('Try Again')}</Text>
            </Pressable>
          </View>
        ) : earnings.length === 0 ? (
          <View style={styles.emptyCard}>
            <DriverIcon name="money" size={35} color="#9CA6B5" />
            <Text style={styles.emptyTitle}>{t('No transactions yet')}</Text>
            <Text style={styles.emptyText}>{t('Completed jobs and payout transfers will appear here.')}</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {earnings.map((earning) => {
              const status = statusDetails(earning, locale, t);
              return (
                <View key={earning.id} style={styles.transactionCard}>
                  <View style={styles.transactionTopRow}>
                    <View style={styles.transactionIcon}><DriverIcon name="money" size={22} color="#A96900" /></View>
                    <View style={styles.transactionInfo}>
                      <Text style={styles.transactionTitle}>{t('Trip earning')}</Text>
                      <Text style={styles.transactionDate}>{status.detail}</Text>
                    </View>
                    <Text style={styles.amount}>+{formatMoney(earning.netAmount, earning.currency, locale)}</Text>
                  </View>
                  <View style={styles.transactionFooter}>
                    <Text style={styles.tripId}>{t('Trip #{{id}}', { id: earning.tripId.slice(-8).toUpperCase() })}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: status.background }]}>
                      <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8F9FB' },
  header: { height: 62, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFFFF' },
  title: { color: '#202020', fontSize: 19, fontWeight: '800' },
  headerSpacer: { width: 29 },
  content: { padding: 20, paddingBottom: 38, flexGrow: 1 },
  introCard: { flexDirection: 'row', gap: 13, padding: 16, borderRadius: 14, backgroundColor: '#FFF8E8', borderWidth: 1, borderColor: '#F5DC98' },
  introTextWrap: { flex: 1 },
  introTitle: { color: '#202020', fontSize: 15, fontWeight: '800' },
  introText: { marginTop: 3, color: '#596273', fontSize: 13, lineHeight: 18 },
  centerContent: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 14 },
  list: { marginTop: 16, gap: 12 },
  transactionCard: { padding: 15, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E4E7EC' },
  transactionTopRow: { flexDirection: 'row', alignItems: 'center' },
  transactionIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF4D6' },
  transactionInfo: { flex: 1, marginLeft: 11 },
  transactionTitle: { color: '#202020', fontSize: 15, fontWeight: '800' },
  transactionDate: { marginTop: 3, color: '#687386', fontSize: 12 },
  amount: { color: '#07883E', fontSize: 15, fontWeight: '800' },
  transactionFooter: { marginTop: 13, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E4E7EC', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tripId: { maxWidth: '57%', color: '#7A8495', fontSize: 12, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  statusText: { fontSize: 11, fontWeight: '800' },
  emptyCard: { marginTop: 22, padding: 30, alignItems: 'center', borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E4E7EC' },
  emptyTitle: { marginTop: 12, color: '#202020', fontSize: 16, fontWeight: '800' },
  emptyText: { marginTop: 5, color: '#687386', fontSize: 13, textAlign: 'center', lineHeight: 19 },
  errorText: { color: '#C92828', fontSize: 14, textAlign: 'center' },
  retryButton: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, backgroundColor: '#202020' },
  retryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
});
