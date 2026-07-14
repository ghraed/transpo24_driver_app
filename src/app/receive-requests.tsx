import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
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

import { readAccessToken } from '@/lib/auth-storage';
import { getDriverRequestAlerts } from '@/lib/api';
import { formatDateTime, formatDistanceKm } from '@/localization/format';
import { getRequestStatusLabel } from '@/lib/request-status-display';
import { connectSocket, onRequestDeleted } from '@/services/socketService';
import type { DriverRequestAlertSummary } from '@/types/auth';

function formatSchedule(
  isImmediate: boolean,
  scheduledPickupAt: string | null,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (isImmediate) {
    return t('Immediate pickup');
  }

  if (!scheduledPickupAt) {
    return t('Scheduled pickup');
  }

  return formatDateTime(scheduledPickupAt);
}

function badgeLabel(
  alertStatus: DriverRequestAlertSummary['alertStatus'],
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (alertStatus === 'NEW') return t('New');
  if (alertStatus === 'SEEN') return t('Seen');
  if (alertStatus === 'ACCEPTED') return t('Accepted');
  if (alertStatus === 'IGNORED') return t('Ignored');
  return t('Expired');
}

export default function ReceiveRequestAlertsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [alerts, setAlerts] = useState<DriverRequestAlertSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadAlerts = useCallback(async (refreshing = false): Promise<void> => {
    if (refreshing) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    setError('');
    try {
      const response = await getDriverRequestAlerts();
      setAlerts(response.alerts ?? []);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : t('Loading requests...');
      setError(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void loadAlerts();
      let unsubscribeDeleted: (() => void) | null = null;
      void (async () => {
        const token = await readAccessToken();
        if (!token) return;
        connectSocket(token);
        unsubscribeDeleted = onRequestDeleted((payload) => {
          setAlerts((current) =>
            current.filter((alert) => alert.requestId !== payload.requestId),
          );
        });
      })();
      const pollingId = setInterval(() => {
        void loadAlerts(true);
      }, 20000);

      return () => {
        clearInterval(pollingId);
        unsubscribeDeleted?.();
      };
    }, [loadAlerts]),
  );

  const hasAlerts = useMemo(() => alerts.length > 0, [alerts]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('Available Requests')}</Text>
        <Text style={styles.subtitle}>
          {t('Review new transport requests and choose which ones you want to quote.')}
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.stateText}>{t('Loading requests...')}</Text>
        </View>
      ) : error ? (
        <View style={styles.centeredState}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.primaryButton} onPress={() => void loadAlerts()}>
            <Text style={styles.primaryButtonText}>{t('Retry')}</Text>
          </Pressable>
        </View>
      ) : !hasAlerts ? (
        <View style={styles.centeredState}>
          <Text style={styles.stateText}>{t('No available requests right now.')}</Text>
          <Text style={styles.hintText}>{t('Make sure you are online and your availability is active.')}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={() => void loadAlerts(true)} />
          }
        >
          {alerts.map((alert) => (
            <Pressable
              key={alert.alertId}
              style={styles.card}
              onPress={() =>
                router.push({
                  pathname: '/review-request-details',
                  params: { requestId: alert.requestId },
                })
              }
            >
              <View style={styles.cardTopRow}>
                <Text style={styles.serviceText}>
                  {alert.service?.nameEn || alert.service?.key || t('Service')}
                </Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badgeLabel(alert.alertStatus, t)}</Text>
                </View>
              </View>

              <Text style={styles.itemText}>{alert.item.title || alert.item.type || t('Transport request')}</Text>
              <Text style={styles.routeText}>{t('Pickup')}: {alert.pickup.address || t('Coordinates unavailable')}</Text>
              <Text style={styles.routeText}>{t('Dropoff')}: {alert.dropoff.address || t('Coordinates unavailable')}</Text>
              <Text style={styles.metaText}>
                {formatSchedule(alert.schedule.isImmediate, alert.schedule.scheduledPickupAt, t)}
              </Text>
              <Text style={styles.metaText}>
                {t('Distance')}: {typeof alert.distanceKm === 'number' ? formatDistanceKm(alert.distanceKm) : t('Not available')}
              </Text>
              <Text style={styles.metaText}>{getRequestStatusLabel(alert.requestStatus)}</Text>

              <View style={styles.reviewButton}>
                <Text style={styles.reviewButtonText}>{t('Review Details')}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
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
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 6,
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
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  stateText: {
    fontSize: 16,
    color: '#334155',
    textAlign: 'center',
  },
  hintText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#B91C1C',
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 22,
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  serviceText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    flex: 1,
  },
  badge: {
    backgroundColor: '#DBEAFE',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  itemText: {
    color: '#0F172A',
    fontWeight: '600',
  },
  routeText: {
    color: '#334155',
    fontSize: 13,
  },
  metaText: {
    color: '#64748B',
    fontSize: 12,
  },
  reviewButton: {
    marginTop: 6,
    backgroundColor: '#2563EB',
    borderRadius: 10,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
