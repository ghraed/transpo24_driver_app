import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { getDriverVehicles, getMyLoadCapacities, setDefaultLoadCapacity } from '@/lib/api';
import {
  formatCargoTypes,
  formatDimensionsSummary,
  getCapacityStatusLabel,
  VEHICLE_TYPE_LABELS,
} from '@/lib/vehicle-load-capacity';
import type { DriverVehicle, VehicleLoadCapacity } from '@/types/auth';

function toCapacityMap(loadCapacities: VehicleLoadCapacity[]): Map<string, VehicleLoadCapacity> {
  return new Map(loadCapacities.map((capacity) => [capacity.vehicleId, capacity]));
}

export default function ManageLoadCapacitiesScreen() {
  const router = useRouter();
  const { signOut } = useAuth();

  const [vehicles, setVehicles] = useState<DriverVehicle[]>([]);
  const [capacityMap, setCapacityMap] = useState<Map<string, VehicleLoadCapacity>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [mutatingVehicleId, setMutatingVehicleId] = useState<string | null>(null);

  const loadData = useCallback(async (refresh = false): Promise<void> => {
    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setErrorMessage('');

    try {
      const [vehicleResponse, capacityResponse] = await Promise.all([
        getDriverVehicles(),
        getMyLoadCapacities(),
      ]);
      setVehicles(vehicleResponse);
      setCapacityMap(toCapacityMap(capacityResponse));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load vehicle capacities.';
      const normalized = message.toLowerCase();
      if (normalized.includes('unauthorized') || normalized.includes('token')) {
        await signOut();
        router.replace('/');
        return;
      }
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [router, signOut]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadData();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadData]);

  const hasVehicles = vehicles.length > 0;

  const cards = useMemo(
    () =>
      vehicles.map((vehicle) => ({
        vehicle,
        capacity: capacityMap.get(vehicle.id),
      })),
    [capacityMap, vehicles],
  );

  const onSetDefault = async (vehicleId: string): Promise<void> => {
    if (mutatingVehicleId) return;

    setMutatingVehicleId(vehicleId);
    setErrorMessage('');
    try {
      const updated = await setDefaultLoadCapacity(vehicleId);
      setCapacityMap((current) => {
        const next = new Map(current);
        for (const [key, value] of next.entries()) {
          next.set(key, {
            ...value,
            isDefault: key === vehicleId,
          });
        }
        next.set(vehicleId, updated);
        return next;
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to update default capacity.',
      );
    } finally {
      setMutatingVehicleId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => void loadData(true)} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Manage Load Capacities</Text>
          <Text style={styles.subtitle}>
            Define a load profile for each vehicle and choose the default one for matching.
          </Text>
        </View>

        <Pressable
          style={styles.secondaryButton}
          onPress={() => router.push('/my-vehicles')}
        >
          <Text style={styles.secondaryButtonText}>Back to My Vehicles</Text>
        </Pressable>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color="#1D4ED8" />
            <Text style={styles.helperText}>Loading vehicle load capacities...</Text>
          </View>
        ) : !hasVehicles ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No vehicles available yet</Text>
            <Text style={styles.helperText}>
              Add a vehicle first, then come back here to define its load capacity.
            </Text>
            <Pressable
              style={styles.primaryButton}
              onPress={() => router.push('/vehicle-information?flow=management')}
            >
              <Text style={styles.primaryButtonText}>Add Vehicle</Text>
            </Pressable>
          </View>
        ) : (
          cards.map(({ vehicle, capacity }) => {
            const statusLabel = getCapacityStatusLabel(vehicle, capacity);
            const dimensionsSummary = capacity
              ? formatDimensionsSummary(
                  capacity.dimensionsAreStandard,
                  capacity.cargoLengthM,
                  capacity.cargoWidthM,
                  capacity.cargoHeightM,
                )
              : formatDimensionsSummary(
                  Boolean(vehicle.dimensionsAreStandard),
                  vehicle.lengthCm !== null && vehicle.lengthCm !== undefined
                    ? Number((vehicle.lengthCm / 100).toFixed(2))
                    : null,
                  vehicle.widthCm !== null && vehicle.widthCm !== undefined
                    ? Number((vehicle.widthCm / 100).toFixed(2))
                    : null,
                  vehicle.heightCm !== null && vehicle.heightCm !== undefined
                    ? Number((vehicle.heightCm / 100).toFixed(2))
                    : null,
                );

            return (
              <View key={vehicle.id} style={styles.vehicleCard}>
                <View style={styles.vehicleHeader}>
                  <View style={styles.headerTextWrap}>
                    <Text style={styles.vehicleTitle}>
                      {vehicle.brand} {vehicle.model} ({vehicle.year})
                    </Text>
                    <Text style={styles.vehicleMeta}>
                      {VEHICLE_TYPE_LABELS[vehicle.vehicleType]}
                    </Text>
                  </View>
                  {capacity?.isDefault ? (
                    <View style={styles.defaultBadge}>
                      <Text style={styles.defaultBadgeText}>Default</Text>
                    </View>
                  ) : null}
                </View>

                <Text style={styles.metaText}>Load profile: {capacity?.name?.trim() || 'Not named'}</Text>
                <Text style={styles.metaText}>Status: {statusLabel}</Text>
                <Text style={styles.metaText}>
                  Max load: {capacity?.maxLoadKg ?? vehicle.capacityKg ?? 'Not defined'}
                  {capacity?.maxLoadKg || vehicle.capacityKg ? ' kg' : ''}
                </Text>
                <Text style={styles.metaText}>Dimensions: {dimensionsSummary}</Text>
                <Text style={styles.metaText}>
                  Cargo types:{' '}
                  {capacity?.allowedCargoTypes?.length
                    ? formatCargoTypes(capacity.allowedCargoTypes)
                    : vehicle.allowedCargoTypes?.length
                      ? formatCargoTypes(vehicle.allowedCargoTypes)
                      : 'Not defined'}
                </Text>
                <Text style={styles.metaText}>
                  Working schedule:{' '}
                  {capacity?.workingSchedule?.filter((day) => day.isAvailable).length ??
                  vehicle.workingSchedule?.filter((day) => day.isAvailable).length
                    ? `${capacity?.workingSchedule?.filter((day) => day.isAvailable).length ?? vehicle.workingSchedule?.filter((day) => day.isAvailable).length} day(s) available`
                    : 'Not defined'}
                </Text>

                <View style={styles.actionRow}>
                  <Pressable
                    style={styles.primaryButton}
                    onPress={() =>
                      router.push(
                        `/load-capacity?vehicleId=${vehicle.id}&flow=management&returnTo=manage-load-capacities`,
                      )
                    }
                  >
                    <Text style={styles.primaryButtonText}>
                      {statusLabel === 'Defined' ? 'Edit Capacity' : 'Define Capacity'}
                    </Text>
                  </Pressable>
                  {capacity && !capacity.isDefault ? (
                    <Pressable
                      style={[
                        styles.secondaryButton,
                        mutatingVehicleId === vehicle.id && styles.buttonDisabled,
                      ]}
                      disabled={mutatingVehicleId === vehicle.id}
                      onPress={() => void onSetDefault(vehicle.id)}
                    >
                      {mutatingVehicleId === vehicle.id ? (
                        <ActivityIndicator color="#1D4ED8" />
                      ) : (
                        <Text style={styles.secondaryButtonText}>Set Default</Text>
                      )}
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  content: {
    padding: 20,
    gap: 14,
    paddingBottom: 36,
  },
  header: { gap: 6 },
  title: { fontSize: 28, fontWeight: '700', color: '#0F172A' },
  subtitle: { color: '#475569', fontSize: 14 },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 220,
  },
  emptyCard: {
    borderWidth: 1,
    borderColor: '#DBEAFE',
    backgroundColor: '#F8FBFF',
    borderRadius: 16,
    padding: 18,
    gap: 10,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  helperText: { color: '#475569', fontSize: 14, textAlign: 'center' },
  vehicleCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  vehicleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  headerTextWrap: { flex: 1, gap: 2 },
  vehicleTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  vehicleMeta: { color: '#475569', fontSize: 13 },
  defaultBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  defaultBadgeText: { color: '#166534', fontSize: 12, fontWeight: '700' },
  metaText: { color: '#334155', fontSize: 14 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButtonText: { color: '#1D4ED8', fontWeight: '700', fontSize: 15 },
  errorText: { color: '#B91C1C', fontSize: 13 },
  buttonDisabled: { opacity: 0.6 },
});
