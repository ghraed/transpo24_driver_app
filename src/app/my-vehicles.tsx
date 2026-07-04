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
import {
  activateDriverVehicle,
  approveDriverVehicleForTesting,
  getDriverAvailability,
  getDriverVehicles,
} from '@/lib/api';
import {
  formatDimensionsSummary,
  getCapacityStatusLabel,
  VEHICLE_TYPE_LABELS,
} from '@/lib/vehicle-load-capacity';
import type {
  DriverAvailabilityResponse,
  DriverVehicle,
  VehicleReviewStatus,
} from '@/types/auth';

const STATUS_LABELS: Record<VehicleReviewStatus, string> = {
  PENDING_REVIEW: 'Pending approval',
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

const VEHICLE_CONDITION_LABELS: Record<DriverVehicle['condition'], string> = {
  EXCELLENT: 'Excellent',
  GOOD: 'Good',
  NEEDS_MAINTENANCE: 'Needs maintenance',
};

export default function MyVehiclesScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [vehicles, setVehicles] = useState<DriverVehicle[]>([]);
  const [availability, setAvailability] = useState<DriverAvailabilityResponse | null>(null);
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
      const [vehiclesResponse, availabilityResponse] = await Promise.all([
        getDriverVehicles(),
        getDriverAvailability(),
      ]);
      setVehicles(vehiclesResponse);
      setAvailability(availabilityResponse);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to load your vehicles and service radius.';
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

  const onActivateVehicle = async (vehicleId: string): Promise<void> => {
    if (isMutatingId) return;

    setIsMutatingId(vehicleId);
    setErrorMessage('');
    try {
      const updatedVehicle = await activateDriverVehicle(vehicleId);
      setVehicles((current) =>
        current.map((vehicle) => (vehicle.id === vehicleId ? updatedVehicle : vehicle)),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to activate vehicle.',
      );
    } finally {
      setIsMutatingId(null);
    }
  };

  const onApproveVehicleForTesting = async (vehicleId: string): Promise<void> => {
    if (isMutatingId) return;

    setIsMutatingId(vehicleId);
    setErrorMessage('');
    try {
      const updatedVehicle = await approveDriverVehicleForTesting(vehicleId);
      setVehicles((current) =>
        current.map((vehicle) => (vehicle.id === vehicleId ? updatedVehicle : vehicle)),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to approve vehicle in testing mode.',
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

        <View style={styles.availabilityCard}>
          <View style={styles.availabilityHeader}>
            <View style={styles.availabilityCopy}>
              <Text style={styles.availabilityTitle}>Service Radius</Text>
              <Text style={styles.availabilitySubtitle}>
                Requests are matched against this radius from your base location.
              </Text>
            </View>
            <Pressable
              style={styles.availabilityButton}
              onPress={() => router.push('/set-availability')}
            >
              <Text style={styles.availabilityButtonText}>Edit Radius</Text>
            </Pressable>
          </View>
          <Text style={styles.availabilityValue}>
            {availability ? `${availability.serviceRadiusKm} km` : 'Not set'}
          </Text>
          <Text style={styles.metaText}>
            Online: {availability?.isOnline ? 'Yes' : 'No'}
          </Text>
          <Text style={styles.metaText}>
            Base location:{' '}
            {availability?.baseAddress?.trim()
              ? availability.baseAddress.trim()
              : availability?.baseLatitude !== null &&
                  availability?.baseLatitude !== undefined &&
                  availability?.baseLongitude !== null &&
                  availability?.baseLongitude !== undefined
                ? `${availability.baseLatitude.toFixed(6)}, ${availability.baseLongitude.toFixed(6)}`
                : 'Not set'}
          </Text>
        </View>

        {vehicles.length > 0 ? (
          <Pressable
            style={styles.secondaryActionButton}
            onPress={() => router.push('/manage-load-capacities')}
          >
            <Text style={styles.secondaryActionButtonText}>Manage Load Capacities</Text>
          </Pressable>
        ) : null}

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
                <Text style={styles.metaText}>
                  Load capacity: {getCapacityStatusLabel(vehicle)}
                </Text>
                {getCapacityStatusLabel(vehicle) === 'Defined' ? (
                  <Text style={styles.metaText}>
                    Capacity summary: {vehicle.loadProfileName?.trim() || 'Vehicle load profile'}
                    {' • '}
                    {vehicle.capacityKg ? `${vehicle.capacityKg} kg` : 'Weight optional'}
                    {' • '}
                    {formatDimensionsSummary(
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
                    )}
                  </Text>
                ) : null}
                {vehicleStatus === 'PENDING_REVIEW' ? (
                  <Text style={styles.pendingText}>Your vehicle is pending approval.</Text>
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
                      router.push(
                        `/load-capacity?vehicleId=${vehicle.id}&flow=management&returnTo=manage-load-capacities`,
                      )
                    }
                  >
                    <Text style={styles.secondaryButtonText}>
                      {getCapacityStatusLabel(vehicle) === 'Defined'
                        ? 'Edit Capacity'
                        : 'Define Capacity'}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() =>
                      router.push(`/vehicle-information?vehicleId=${vehicle.id}&flow=management`)
                    }
                  >
                    <Text style={styles.secondaryButtonText}>Edit</Text>
                  </Pressable>
                  {!vehicle.isActive ? (
                    <Pressable
                      style={[
                        styles.secondaryButton,
                        isMutatingId === vehicle.id && styles.buttonDisabled,
                      ]}
                      disabled={isMutatingId === vehicle.id}
                      onPress={() => void onActivateVehicle(vehicle.id)}
                    >
                      {isMutatingId === vehicle.id ? (
                        <ActivityIndicator color="#1D4ED8" />
                      ) : (
                        <Text style={styles.secondaryButtonText}>Activate</Text>
                      )}
                    </Pressable>
                  ) : null}
                </View>
                {vehicleStatus === 'PENDING_REVIEW' ? (
                  <Pressable
                    style={[
                      styles.testingButton,
                      isMutatingId === vehicle.id && styles.buttonDisabled,
                    ]}
                    disabled={isMutatingId === vehicle.id}
                    onPress={() => void onApproveVehicleForTesting(vehicle.id)}
                  >
                    {isMutatingId === vehicle.id ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.testingButtonText}>Approve Vehicle For Testing</Text>
                    )}
                  </Pressable>
                ) : null}
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
  availabilityCard: {
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  availabilityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  availabilityCopy: {
    flex: 1,
    gap: 4,
  },
  availabilityTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  availabilitySubtitle: {
    fontSize: 13,
    color: '#475569',
  },
  availabilityValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  availabilityButton: {
    minHeight: 40,
    borderRadius: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1D4ED8',
  },
  availabilityButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
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
  secondaryActionButton: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  secondaryActionButtonText: { color: '#1D4ED8', fontWeight: '700', fontSize: 15 },
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
  testingButton: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  testingButtonText: { color: '#FFFFFF', fontWeight: '700' },
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
