import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
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

import { DriverBottomNav, DRIVER_BOTTOM_NAV_HEIGHT } from '@/components/driver-bottom-nav';
import { DriverIcon, type DriverIconName } from '@/components/driver-icon';
import { DriverJobSwitcher } from '@/components/driver-job-switcher';
import { readAccessToken } from '@/lib/auth-storage';
import { getDriverRequestAlerts } from '@/lib/api';
import { connectSocket, onRequestDeleted } from '@/services/socketService';
import type { DriverRequestAlertSummary } from '@/types/auth';

type PricedAlert = DriverRequestAlertSummary & {
  suggestedPrice?: number | null;
  currency?: string | null;
  matchPercent?: number | null;
};

function compactPlace(address: string | null | undefined, fallback: string): string {
  const normalized = address?.trim();
  if (!normalized) return fallback;
  return normalized.split(',')[0]?.trim() || normalized;
}

function serviceTitle(alert: DriverRequestAlertSummary): string {
  return alert.service?.nameEn?.trim() || alert.item?.title?.trim() || 'Transport Request';
}

function serviceIcon(alert: DriverRequestAlertSummary): DriverIconName {
  const value = [
    alert.service?.key,
    alert.service?.icon,
    alert.service?.nameEn,
    alert.item?.type,
    alert.item?.title,
  ]
    .filter((part): part is string => typeof part === 'string')
    .join(' ')
    .toLowerCase();

  if (/motorcycle|motorbike|bike|scooter/.test(value)) return 'motorcycle';
  if (/furniture|sofa|moving/.test(value)) return 'furniture';
  if (/goods|cargo|box|package|parcel|shipment/.test(value)) return 'goods';
  if (/vehicle|car|auto/.test(value)) return 'car';

  return 'truck';
}

function displayPrice(alert: PricedAlert): string {
  if (typeof alert.suggestedPrice !== 'number') return 'CHF —';
  return `${alert.currency || 'CHF'} ${Math.round(alert.suggestedPrice).toLocaleString()}`;
}

function displayMatch(alert: PricedAlert): string {
  if (typeof alert.matchPercent === 'number') {
    return `${Math.round(alert.matchPercent)}% match`;
  }
  return 'Available';
}

export default function ReceiveRequestAlertsScreen() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<DriverRequestAlertSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [immediateOnly, setImmediateOnly] = useState(false);

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
      setError(requestError instanceof Error ? requestError.message : 'Unable to load requests.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadAlerts();
      let unsubscribeDeleted: (() => void) | null = null;

      void (async () => {
        const token = await readAccessToken();
        if (!token) return;
        connectSocket(token);
        unsubscribeDeleted = onRequestDeleted((payload) => {
          setAlerts((current) => current.filter((alert) => alert.requestId !== payload.requestId));
        });
      })();

      const pollingId = setInterval(() => void loadAlerts(true), 20000);
      return () => {
        clearInterval(pollingId);
        unsubscribeDeleted?.();
      };
    }, [loadAlerts]),
  );

  const visibleAlerts = useMemo(
    () => (immediateOnly ? alerts.filter((alert) => alert.schedule?.isImmediate === true) : alerts),
    [alerts, immediateOnly],
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>Job Requests</Text>
          <Pressable
            accessibilityLabel="Filter job requests"
            accessibilityState={{ checked: immediateOnly }}
            style={[styles.filterButton, immediateOnly && styles.filterButtonActive]}
            onPress={() => setImmediateOnly((value) => !value)}
          >
            <DriverIcon name="sliders" size={27} strokeWidth={1.8} />
          </Pressable>
        </View>
        <DriverJobSwitcher active="jobs" />
      </View>

      {isLoading ? (
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color="#F4B900" />
          <Text style={styles.stateText}>Loading job requests…</Text>
        </View>
      ) : error ? (
        <View style={styles.centeredState}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={() => void loadAlerts()}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : visibleAlerts.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyScroll}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void loadAlerts(true)} />}
        >
          <View style={styles.emptyIcon}>
            <DriverIcon name="grid" size={34} color="#F1B800" />
          </View>
          <Text style={styles.emptyTitle}>
            {immediateOnly ? 'No immediate requests' : 'No job requests right now'}
          </Text>
          <Text style={styles.emptyText}>New matching transport jobs will appear here automatically.</Text>
        </ScrollView>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              tintColor="#F4B900"
              colors={['#F4B900']}
              onRefresh={() => void loadAlerts(true)}
            />
          }
        >
          {visibleAlerts.map((rawAlert) => {
            const alert = rawAlert as PricedAlert;
            const pickup = compactPlace(alert.pickup.address, 'Pickup');
            const dropoff = compactPlace(alert.dropoff.address, 'Dropoff');
            const distance = typeof alert.distanceKm === 'number' ? `${Math.round(alert.distanceKm)} km` : '— km';
            const jobNumber = alert.requestId.slice(-6).toUpperCase();

            return (
              <Pressable
                key={alert.alertId}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                onPress={() =>
                  router.push({
                    pathname: '/review-request-details',
                    params: { requestId: alert.requestId },
                  })
                }
              >
                <View style={styles.cardTop}>
                  <View style={styles.serviceIcon}>
                    <DriverIcon name={serviceIcon(alert)} size={29} color="#111111" strokeWidth={2} />
                  </View>

                  <View style={styles.cardHeading}>
                    <Text style={styles.serviceTitle} numberOfLines={1}>{serviceTitle(alert)}</Text>
                    <Text style={styles.jobId}>JOB-{jobNumber}</Text>
                  </View>

                  <View style={styles.priceColumn}>
                    <Text style={styles.price}>{displayPrice(alert)}</Text>
                    <Text style={styles.distance}>{distance}</Text>
                  </View>
                </View>

                <View style={styles.routeRow}>
                  <Text style={styles.routePlace} numberOfLines={1}>{pickup}</Text>
                  <Text style={styles.routeArrow}>╌╌▸</Text>
                  <Text style={[styles.routePlace, styles.dropoffPlace]} numberOfLines={1}>{dropoff}</Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.cardFooter}>
                  <View style={styles.onWayRow}>
                    <DriverIcon name="location" size={18} color="#F6B900" strokeWidth={1.8} />
                    <Text style={styles.onWayText}>
                      {alert.schedule?.isImmediate ? 'On your way' : 'Scheduled'}
                    </Text>
                  </View>
                  <Text style={styles.matchText}>{displayMatch(alert)}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <DriverBottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7F8F9',
  },
  header: {
    minHeight: 158,
    paddingHorizontal: 22,
    paddingTop: 25,
    paddingBottom: 14,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  title: {
    color: '#151515',
    fontSize: 31,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  filterButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DFE3E8',
  },
  filterButtonActive: {
    borderColor: '#F1B900',
    backgroundColor: '#FFF9E6',
  },
  listContent: {
    paddingHorizontal: 22,
    paddingBottom: DRIVER_BOTTOM_NAV_HEIGHT + 30,
    gap: 14,
  },
  card: {
    minHeight: 194,
    paddingHorizontal: 18,
    paddingTop: 17,
    paddingBottom: 16,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DFE3E8',
    shadowColor: '#111111',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.995 }],
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  serviceIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFC515',
  },
  cardHeading: {
    flex: 1,
    minWidth: 0,
    marginLeft: 17,
  },
  serviceTitle: {
    color: '#1C1C1C',
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '800',
  },
  jobId: {
    marginTop: 2,
    color: '#707A8C',
    fontSize: 15,
    lineHeight: 20,
  },
  priceColumn: {
    minWidth: 88,
    marginLeft: 8,
    alignItems: 'flex-end',
  },
  price: {
    color: '#F3B800',
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '800',
  },
  distance: {
    marginTop: 4,
    color: '#707A8C',
    fontSize: 15,
  },
  routeRow: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  routePlace: {
    maxWidth: '39%',
    color: '#707A8C',
    fontSize: 16,
    lineHeight: 22,
  },
  routeArrow: {
    marginHorizontal: 10,
    color: '#9CA6B5',
    fontSize: 17,
    letterSpacing: -1,
  },
  dropoffPlace: {
    flex: 1,
    maxWidth: undefined,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 17,
    backgroundColor: '#DDE1E6',
  },
  cardFooter: {
    marginTop: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  onWayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  onWayText: {
    color: '#707A8C',
    fontSize: 15,
  },
  matchText: {
    color: '#F3B800',
    fontSize: 15,
  },
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    paddingBottom: DRIVER_BOTTOM_NAV_HEIGHT,
    gap: 14,
  },
  stateText: {
    color: '#707A8C',
    fontSize: 16,
  },
  errorText: {
    color: '#C73333',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 46,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: '#FFC515',
  },
  retryText: {
    color: '#171717',
    fontSize: 15,
    fontWeight: '800',
  },
  emptyScroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 34,
    paddingBottom: DRIVER_BOTTOM_NAV_HEIGHT,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF8DC',
  },
  emptyTitle: {
    marginTop: 20,
    color: '#202020',
    fontSize: 19,
    fontWeight: '800',
  },
  emptyText: {
    marginTop: 8,
    color: '#707A8C',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
});
