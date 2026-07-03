import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getMyDriverVehicles } from '@/lib/api';
import type { DriverVehicle, DriverVehiclesListResponse } from '@/types/auth';

function summarizeVehicle(vehicle: DriverVehicle): string {
  return `${vehicle.make} ${vehicle.model} (${vehicle.plateNumber})`;
}

function getLoadActionRoute(vehicleId: string) {
  return {
    pathname: '/vehicle-load' as const,
    params: { vehicleId },
  };
}

export default function MyVehiclesScreen() {
  const router = useRouter();
  const [data, setData] = useState<DriverVehiclesListResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>('');

  const loadVehicles = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setLoadError('');

    try {
      const response = await getMyDriverVehicles();
      setData(response);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'Failed to load vehicles.',
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

  if (isLoading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#1D4ED8" />
        <Text style={styles.helper}>Loading your vehicles...</Text>
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

  const vehicles = data?.vehicles ?? [];
  const hasCompleteVehicle = vehicles.some((item) => item.vehicle.completeness?.isComplete);
  const hasVehicles = vehicles.length > 0;
  const needsLoadSetup = vehicles.some(
    (item) => !item.vehicle.completeness?.hasLoadCapacityProfile,
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>My Vehicles</Text>
          <Text style={styles.subtitle}>
            Add at least one vehicle to start receiving requests.
          </Text>
        </View>

        {!hasCompleteVehicle ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>Vehicle required</Text>
            <Text style={styles.noticeText}>
              At least one complete vehicle with load setup is required before you can receive
              transport requests.
            </Text>
          </View>
        ) : null}

        {needsLoadSetup ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>Load setup required</Text>
            <Text style={styles.noticeText}>
              Complete the vehicle load setup before the driver account can receive requests.
            </Text>
          </View>
        ) : null}

        <Pressable
          style={styles.primaryButton}
          onPress={() => router.push('/vehicle-information')}
        >
          <Text style={styles.primaryButtonText}>Add New Vehicle</Text>
        </Pressable>

        {hasVehicles ? (
          <Pressable
            style={styles.secondaryButton}
            onPress={() =>
              vehicles.length === 1
                ? router.push(getLoadActionRoute(vehicles[0]?.vehicle.id ?? ''))
                : router.push('/manage-loads')
            }
          >
            <Text style={styles.secondaryButtonText}>
              {vehicles.length === 1 ? 'Set Load Capacity' : 'Manage Loads'}
            </Text>
          </Pressable>
        ) : null}

        {vehicles.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No vehicles yet</Text>
            <Text style={styles.helper}>
              Add at least one vehicle to start receiving requests.
            </Text>
          </View>
        ) : null}

        {vehicles.map((item) => (
          <View key={item.vehicle.id} style={styles.vehicleCard}>
            <Text style={styles.vehicleTitle}>{summarizeVehicle(item.vehicle)}</Text>
            <Text style={styles.vehicleMeta}>
              Type: {item.vehicle.vehicleType} | Condition: {item.vehicle.condition}
            </Text>
            <Text
              style={[
                styles.statusText,
                item.vehicle.completeness?.isComplete
                  ? styles.statusComplete
                  : styles.statusIncomplete,
              ]}
            >
              {item.vehicle.completeness?.isComplete
                ? 'Complete'
                : `Incomplete: ${(item.vehicle.completeness?.missingFields ?? []).join(', ')}`}
            </Text>
            <Text
              style={[
                styles.loadStatus,
                item.vehicle.completeness?.hasLoadCapacityProfile
                  ? styles.statusComplete
                  : styles.statusIncomplete,
              ]}
            >
              {item.vehicle.completeness?.hasLoadCapacityProfile
                ? `Load ready${item.vehicle.isDefaultLoadProfile ? ' • Default load' : ''}`
                : 'Load capacity setup required'}
            </Text>
            <Pressable
              style={styles.inlineButton}
              onPress={() => router.push(getLoadActionRoute(item.vehicle.id))}
            >
              <Text style={styles.inlineButtonText}>
                {item.vehicle.completeness?.hasLoadCapacityProfile
                  ? 'Edit Load'
                  : 'Set Load Capacity'}
              </Text>
            </Pressable>
          </View>
        ))}
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
    gap: 12,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    padding: 20,
    gap: 12,
  },
  header: {
    gap: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    color: '#475569',
    fontSize: 14,
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
    padding: 12,
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
  primaryButton: {
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#1D4ED8',
    fontWeight: '700',
    fontSize: 15,
  },
  emptyCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 16,
    gap: 6,
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
    gap: 4,
  },
  vehicleTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '700',
  },
  vehicleMeta: {
    color: '#475569',
    fontSize: 13,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  statusComplete: {
    color: '#15803D',
  },
  statusIncomplete: {
    color: '#B45309',
  },
  loadStatus: {
    fontSize: 13,
    fontWeight: '700',
  },
  inlineButton: {
    marginTop: 6,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  inlineButtonText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 14,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 13,
    textAlign: 'center',
  },
});
