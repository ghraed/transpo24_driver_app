import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getMyDriverVehicles, setMyDefaultVehicleLoad } from '@/lib/api';
import type { DriverVehicle, DriverVehiclesListResponse } from '@/types/auth';

function summarizeVehicle(vehicle: DriverVehicle): string {
  return `${vehicle.make} ${vehicle.model} (${vehicle.plateNumber})`;
}

function describeLoadStatus(vehicle: DriverVehicle): string {
  if (vehicle.completeness?.hasLoadCapacityProfile) {
    return vehicle.loadProfileName?.trim()
      ? vehicle.loadProfileName
      : 'Load setup completed';
  }
  return 'Load setup required';
}

export default function ManageLoadsScreen() {
  const router = useRouter();
  const [data, setData] = useState<DriverVehiclesListResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>('');
  const [actionError, setActionError] = useState<string>('');
  const [activeDefaultVehicleId, setActiveDefaultVehicleId] = useState<string>('');

  const loadVehicles = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setLoadError('');
    setActionError('');

    try {
      const response = await getMyDriverVehicles();
      setData(response);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'Failed to load vehicle capacities.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadVehicles();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadVehicles]);

  const vehicles = data?.vehicles ?? [];
  const title = vehicles.length === 1 ? 'Set Load Capacity' : 'Manage Loads';
  const requiresLoadSetup = useMemo(
    () => vehicles.some((item) => !item.vehicle.completeness?.hasLoadCapacityProfile),
    [vehicles],
  );

  const onEditVehicleLoad = (vehicleId: string): void => {
    router.push({
      pathname: '/vehicle-load',
      params: { vehicleId },
    });
  };

  const onSetDefault = async (vehicleId: string): Promise<void> => {
    setActiveDefaultVehicleId(vehicleId);
    setActionError('');

    try {
      await setMyDefaultVehicleLoad(vehicleId);
      await loadVehicles();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Failed to set preferred default load.',
      );
    } finally {
      setActiveDefaultVehicleId('');
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#1D4ED8" />
        <Text style={styles.helper}>Loading your vehicle loads...</Text>
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorText}>{loadError}</Text>
        <Pressable style={styles.primaryButton} onPress={() => void loadVehicles()}>
          <Text style={styles.primaryButtonText}>Retry</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>
            Add your vehicle capacity and working availability so we can send you suitable
            requests.
          </Text>
        </View>

        {requiresLoadSetup ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>Load setup required</Text>
            <Text style={styles.noticeText}>
              Complete vehicle load setup before receiving transport requests.
            </Text>
          </View>
        ) : null}

        {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}

        {vehicles.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No vehicles yet</Text>
            <Text style={styles.helper}>
              Add a vehicle first, then return here to set load capacity.
            </Text>
            <Pressable
              style={styles.primaryButton}
              onPress={() => router.replace('/vehicle-information')}
            >
              <Text style={styles.primaryButtonText}>Add Vehicle</Text>
            </Pressable>
          </View>
        ) : null}

        {vehicles.map((item) => {
          const { vehicle } = item;
          const hasLoadProfile = Boolean(vehicle.completeness?.hasLoadCapacityProfile);
          return (
            <View key={vehicle.id} style={styles.vehicleCard}>
              <View style={styles.vehicleHeader}>
                <View style={styles.vehicleCopy}>
                  <Text style={styles.vehicleTitle}>{summarizeVehicle(vehicle)}</Text>
                  <Text style={styles.vehicleMeta}>Type: {vehicle.vehicleType}</Text>
                </View>
                {vehicle.isDefaultLoadProfile ? (
                  <View style={styles.defaultBadge}>
                    <Text style={styles.defaultBadgeText}>Default</Text>
                  </View>
                ) : null}
              </View>

              <Text
                style={[
                  styles.loadStatus,
                  hasLoadProfile ? styles.statusReady : styles.statusPending,
                ]}
              >
                {describeLoadStatus(vehicle)}
              </Text>

              {hasLoadProfile ? (
                <Text style={styles.helper}>
                  Cargo types: {(vehicle.allowedCargoTypes ?? []).join(', ') || 'Not set'}
                </Text>
              ) : (
                <Text style={styles.helper}>
                  Add capacity, cargo types, and working availability for this vehicle.
                </Text>
              )}

              <View style={styles.actionsRow}>
                <Pressable
                  style={styles.primaryButton}
                  onPress={() => onEditVehicleLoad(vehicle.id)}
                >
                  <Text style={styles.primaryButtonText}>
                    {hasLoadProfile ? 'Edit Load' : 'Set Load Capacity'}
                  </Text>
                </Pressable>

                {vehicles.length > 1 && hasLoadProfile && !vehicle.isDefaultLoadProfile ? (
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() => void onSetDefault(vehicle.id)}
                    disabled={activeDefaultVehicleId === vehicle.id}
                  >
                    {activeDefaultVehicleId === vehicle.id ? (
                      <ActivityIndicator color="#1D4ED8" />
                    ) : (
                      <Text style={styles.secondaryButtonText}>Set Default</Text>
                    )}
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    padding: 20,
    gap: 14,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 12,
    backgroundColor: '#FFFFFF',
  },
  header: {
    gap: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 20,
  },
  helper: {
    color: '#64748B',
    fontSize: 13,
  },
  noticeCard: {
    borderWidth: 1,
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  noticeTitle: {
    color: '#92400E',
    fontWeight: '700',
  },
  noticeText: {
    color: '#B45309',
    fontSize: 13,
  },
  emptyCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  emptyTitle: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 18,
  },
  vehicleCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  vehicleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  vehicleCopy: {
    flex: 1,
    gap: 4,
  },
  vehicleTitle: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 16,
  },
  vehicleMeta: {
    color: '#475569',
    fontSize: 13,
  },
  defaultBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#DBEAFE',
    alignSelf: 'flex-start',
  },
  defaultBadgeText: {
    color: '#1D4ED8',
    fontWeight: '700',
    fontSize: 12,
  },
  loadStatus: {
    fontSize: 13,
    fontWeight: '700',
  },
  statusReady: {
    color: '#15803D',
  },
  statusPending: {
    color: '#B45309',
  },
  actionsRow: {
    gap: 10,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryButtonText: {
    color: '#1D4ED8',
    fontWeight: '700',
    fontSize: 15,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 13,
    textAlign: 'center',
  },
});
