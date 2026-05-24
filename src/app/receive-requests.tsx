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
import { SafeAreaView } from 'react-native-safe-area-context';

import { getDriverRequestAlerts } from '@/lib/api';
import type { DriverRequestAlertSummary } from '@/types/auth';

function formatSchedule(isImmediate: boolean, scheduledPickupAt: string | null): string {
  if (isImmediate) {
    return 'Immediate pickup';
  }

  if (!scheduledPickupAt) {
    return 'Scheduled pickup';
  }

  const date = new Date(scheduledPickupAt);
  if (Number.isNaN(date.getTime())) {
    return 'Scheduled pickup';
  }

  return date.toLocaleString();
}

function badgeLabel(alertStatus: DriverRequestAlertSummary['alertStatus']): string {
  if (alertStatus === 'NEW') return 'New';
  if (alertStatus === 'SEEN') return 'Seen';
  if (alertStatus === 'ACCEPTED') return 'Accepted';
  if (alertStatus === 'IGNORED') return 'Ignored';
  return 'Expired';
}

export default function ReceiveRequestAlertsScreen() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<DriverRequestAlertSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

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
      const message = requestError instanceof Error ? requestError.message : 'Failed to load alerts.';
      setError(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadAlerts();
      const pollingId = setInterval(() => {
        void loadAlerts(true);
      }, 20000);

      return () => {
        clearInterval(pollingId);
      };
    }, [loadAlerts]),
  );

  const hasAlerts = useMemo(() => alerts.length > 0, [alerts]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Available Requests</Text>
        <Text style={styles.subtitle}>
          Review new transport requests and choose which ones you want to quote.
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.stateText}>Loading requests...</Text>
        </View>
      ) : error ? (
        <View style={styles.centeredState}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.primaryButton} onPress={() => void loadAlerts()}>
            <Text style={styles.primaryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : !hasAlerts ? (
        <View style={styles.centeredState}>
          <Text style={styles.stateText}>No available requests right now.</Text>
          <Text style={styles.hintText}>Make sure you are online and your availability is active.</Text>
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
                <Text style={styles.serviceText}>{alert.service?.nameEn || alert.service?.key || 'Service'}</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badgeLabel(alert.alertStatus)}</Text>
                </View>
              </View>

              <Text style={styles.itemText}>{alert.item.title || alert.item.type || 'Transport request'}</Text>
              <Text style={styles.routeText}>Pickup: {alert.pickup.address || 'Coordinates unavailable'}</Text>
              <Text style={styles.routeText}>Dropoff: {alert.dropoff.address || 'Coordinates unavailable'}</Text>
              <Text style={styles.metaText}>
                {formatSchedule(alert.schedule.isImmediate, alert.schedule.scheduledPickupAt)}
              </Text>
              <Text style={styles.metaText}>
                {typeof alert.distanceKm === 'number'
                  ? `Distance: ${alert.distanceKm.toFixed(1)} km`
                  : 'Distance: Not available'}
              </Text>

              <View style={styles.reviewButton}>
                <Text style={styles.reviewButtonText}>Review Details</Text>
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
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
  },
  routeText: {
    fontSize: 13,
    color: '#334155',
  },
  metaText: {
    fontSize: 12,
    color: '#64748B',
  },
  reviewButton: {
    marginTop: 8,
    backgroundColor: '#0EA5E9',
    borderRadius: 10,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
});
