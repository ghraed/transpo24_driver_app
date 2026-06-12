import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
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
import { deleteDriverVehicle, getDriverVehicles } from '@/lib/api';
import type { DriverVehicle, VehicleReviewStatus } from '@/types/auth';

const STATUS_LABELS: Record<VehicleReviewStatus, string> = {
  PENDING_REVIEW: 'Pending review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  INACTIVE: 'Inactive',
};

function getStatusColor(status: VehicleReviewStatus | null): string {
  switch (status) {
    case 'APPROVED':
      return '#166534';
    case 'REJECTED':
      return '#B91C1C';
    case 'INACTIVE':
      return '#475569';
    case 'PENDING_REVIEW':
    default:
      return '#1D4ED8';
  }
}

const VEHICLE_TYPE_LABELS: Record<DriverVehicle['vehicleType'], string> = {
  OPEN_CAR_CARRIER: 'Open car carrier / open flatbed',
  ENCLOSED_CARRIER: 'Enclosed carrier',
  SMALL_TRUCK: 'Small truck',
  MEDIUM_TRUCK: 'Medium truck',
  PICKUP: 'Pickup',
  VAN: 'Van',
  TOW_TRUCK: 'Tow truck',
  MOTORCYCLE: 'Motorcycle',
};

const VEHICLE_CONDITION_LABELS: Record<DriverVehicle['condition'], string> = {
  EXCELLENT: 'Excellent',
  GOOD: 'Good',
  NEEDS_MAINTENANCE: 'Needs maintenance',
};

export default function MyVehiclesScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [vehicles, setVehicles] = useState<DriverVehicle[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isMutatingId, setIsMutatingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const loadVehicles = useCallback(async (refresh = false): Promise<void> => {
    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setErrorMessage('');

    try {
      const response = await getDriverVehicles();
      setVehicles(response);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load your vehicles.';
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
      void loadVehicles();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadVehicles]);

  const onDeactivateVehicle = async (vehicleId: string): Promise<void> => {
    if (isMutatingId) return;

    setIsMutatingId(vehicleId);
    setErrorMessage('');
    try {
      const updatedVehicle = await deleteDriverVehicle(vehicleId);
      setVehicles((current) =>
        current.map((vehicle) => (vehicle.id === vehicleId ? updatedVehicle : vehicle)),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to deactivate vehicle.',
      );
    } finally {
      setIsMutatingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => void loadVehicles(true)} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>My Vehicles</Text>
          <Text style={styles.subtitle}>
            Add at least one vehicle to start receiving requests.
          </Text>
        </View>

        <Pressable
          style={styles.primaryButton}
          onPress={() => router.push('/vehicle-information?flow=management')}
        >
          <Text style={styles.primaryButtonText}>Add New Vehicle</Text>
        </Pressable>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color="#1D4ED8" />
            <Text style={styles.helperText}>Loading your vehicles...</Text>
          </View>
        ) : vehicles.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No vehicles added yet</Text>
            <Text style={styles.helperText}>
              Add your first vehicle so your account can be ready for transport requests.
            </Text>
          </View>
        ) : (
          vehicles.map((vehicle) => {
            const vehicleStatus = vehicle.verificationStatus ?? vehicle.status;
            const statusLabel = vehicleStatus ? STATUS_LABELS[vehicleStatus] : 'Pending review';
            return (
              <View key={vehicle.id} style={styles.vehicleCard}>
                <View style={styles.vehicleHeader}>
                  <Text style={styles.vehicleTitle}>
                    {vehicle.brand} {vehicle.model} ({vehicle.year})
                  </Text>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: `${getStatusColor(vehicleStatus)}15` },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        { color: getStatusColor(vehicleStatus) },
                      ]}
                    >
                      {statusLabel}
                    </Text>
                  </View>
                </View>

                <Text style={styles.metaText}>
                  Type: {VEHICLE_TYPE_LABELS[vehicle.vehicleType] ?? vehicle.vehicleType}
                </Text>
                <Text style={styles.metaText}>
                  License plate: {vehicle.licensePlateNumber}
                </Text>
                <Text style={styles.metaText}>
                  Condition: {VEHICLE_CONDITION_LABELS[vehicle.condition] ?? vehicle.condition}
                </Text>
                <Text style={styles.metaText}>Verification: {statusLabel}</Text>
                <Text style={styles.metaText}>
                  State: {vehicle.isActive ? 'Active' : 'Inactive'}
                </Text>
                {vehicleStatus === 'PENDING_REVIEW' ? (
                  <Text style={styles.pendingText}>Your vehicle is under review.</Text>
                ) : null}
                {vehicleStatus === 'REJECTED' && vehicle.rejectionReason ? (
                  <Text style={styles.errorText}>
                    Rejection reason: {vehicle.rejectionReason}
                  </Text>
                ) : null}

                <View style={styles.actionRow}>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() =>
                      router.push(`/vehicle-information?vehicleId=${vehicle.id}&flow=management`)
                    }
                  >
                    <Text style={styles.secondaryButtonText}>Edit</Text>
                  </Pressable>
                  {vehicle.isActive ? (
                    <Pressable
                      style={[
                        styles.dangerButton,
                        isMutatingId === vehicle.id && styles.buttonDisabled,
                      ]}
                      disabled={isMutatingId === vehicle.id}
                      onPress={() => void onDeactivateVehicle(vehicle.id)}
                    >
                      {isMutatingId === vehicle.id ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <Text style={styles.dangerButtonText}>Deactivate</Text>
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
    gap: 8,
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
    gap: 10,
    alignItems: 'flex-start',
  },
  vehicleTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusBadgeText: { fontSize: 12, fontWeight: '700' },
  metaText: { color: '#334155', fontSize: 14 },
  pendingText: { color: '#1D4ED8', fontSize: 13, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  primaryButton: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  secondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: { color: '#1D4ED8', fontWeight: '700' },
  dangerButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButtonText: { color: '#FFFFFF', fontWeight: '700' },
  buttonDisabled: { opacity: 0.6 },
  errorText: { color: '#B91C1C', fontSize: 13 },
});
