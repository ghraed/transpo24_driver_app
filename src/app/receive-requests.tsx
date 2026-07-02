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

import { useAuth } from '@/context/auth-context';
import { getDriverRequestAlerts } from '@/lib/api';
import {
  connectSocket,
  onRequestNew,
  onSocketConnected,
  onSocketDisconnect,
  onSocketError,
} from '@/services/socketService';
import type { DriverRequestAlertSummary } from '@/types/auth';
import { validateRequestNewPayload } from '@/utils/locationValidation';

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

function formatVehicleCondition(condition: string | null): string {
  if (!condition) return 'N/A';
  return condition.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (char) => char.toUpperCase());
}
export default function ReceiveRequestAlertsScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [alerts, setAlerts] = useState<DriverRequestAlertSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [socketStatus, setSocketStatus] = useState<'connected' | 'disconnected' | 'connecting'>(
    'connecting',
  );
  const [socketMessage, setSocketMessage] = useState<string>('');
  const [requestBanner, setRequestBanner] = useState<string>('');

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

  React.useEffect(() => {
    if (!accessToken) return;

    connectSocket(accessToken);
    setSocketStatus('connecting');

    const unsubscribeRequestNew = onRequestNew((payload) => {
      const validated = validateRequestNewPayload(payload);
      if (!validated) return;

      const serviceName = validated.service?.nameEn || validated.service?.key || 'Transport request';
      const distanceLabel =
        typeof validated.distanceKm === 'number'
          ? `${validated.distanceKm.toFixed(1)} km`
          : 'Distance available in app';

      setRequestBanner(`${serviceName} • ${distanceLabel}`);
      setAlerts((current) => {
        const nextItem: DriverRequestAlertSummary = {
          ...validated,
        };
        const withoutDuplicate = current.filter((item) => item.alertId !== nextItem.alertId);
        return [nextItem, ...withoutDuplicate];
      });
    });

    const unsubscribeConnected = onSocketConnected(() => {
      setSocketStatus('connected');
      setSocketMessage('');
    });
    const unsubscribeDisconnected = onSocketDisconnect(() => {
      setSocketStatus('disconnected');
    });
    const unsubscribeSocketError = onSocketError((message) => {
      setSocketStatus('disconnected');
      setSocketMessage(message);
    });

    return () => {
      unsubscribeRequestNew();
      unsubscribeConnected();
      unsubscribeDisconnected();
      unsubscribeSocketError();
    };
  }, [accessToken]);

  const hasAlerts = useMemo(() => alerts.length > 0, [alerts]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Available Requests</Text>
        <Text style={styles.subtitle}>
          Review new transport requests and choose which ones you want to quote.
        </Text>
        <Text style={styles.connectionText}>
          Real-time connection: {socketStatus}
          {socketMessage ? ` • ${socketMessage}` : ''}
        </Text>
      </View>

      {requestBanner ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>New request: {requestBanner}</Text>
        </View>
      ) : null}

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
              {alert.vehicleDetails?.condition ? (
                <Text style={styles.metaText}>
                  Vehicle condition: {formatVehicleCondition(alert.vehicleDetails.condition)}
                </Text>
              ) : null}
              {alert.vehicleDetails?.conditionNotes ? (
                <Text style={styles.metaText}>Notes: {alert.vehicleDetails.conditionNotes}</Text>
              ) : null}

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
  connectionText: {
    fontSize: 12,
    color: '#64748B',
  },
  banner: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    padding: 12,
  },
  bannerText: {
    color: '#1D4ED8',
    fontSize: 13,
    fontWeight: '700',
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
