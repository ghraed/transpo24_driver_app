import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

import { DriverIcon, type DriverIconName } from '@/components/driver-icon';
import { useAuth } from '@/context/auth-context';
import { getSourceErrorMessage } from '@/localization/response-message';
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

function getStatusLabel(status: VehicleReviewStatus, t: (key: string) => string): string {
  switch (status) {
    case 'APPROVED':
      return t('Approved');
    case 'REJECTED':
      return t('Rejected');
    case 'INACTIVE':
      return t('Inactive');
    case 'PENDING_REVIEW':
    default:
      return t('Pending approval');
  }
}

function getStatusColor(status: VehicleReviewStatus | null): string {
  switch (status) {
    case 'APPROVED':
      return '#166534';
    case 'REJECTED':
      return '#B91C1C';
    case 'INACTIVE':
      return '#707A8C';
    case 'PENDING_REVIEW':
    default:
      return '#A66F00';
  }
}

function getVehicleIcon(vehicleType: DriverVehicle['vehicleType']): DriverIconName {
  if (vehicleType === 'MOTORCYCLE') return 'motorcycle';
  if (vehicleType === 'OPEN_CAR_CARRIER' || vehicleType === 'ENCLOSED_CARRIER') return 'car';
  return 'truck';
}

function getVehicleConditionLabel(
  condition: DriverVehicle['condition'],
  t: (key: string) => string,
): string {
  switch (condition) {
    case 'EXCELLENT':
      return t('Excellent');
    case 'GOOD':
      return t('Good');
    case 'NEEDS_MAINTENANCE':
      return t('Needs maintenance');
    default:
      return condition;
  }
}

export default function MyVehiclesScreen() {
  const router = useRouter();
  const { t } = useTranslation();
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
          : t('Failed to load your vehicles and service radius.');
      const normalized = getSourceErrorMessage(error, message).toLowerCase();
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
  }, [router, signOut, t]);

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
        error instanceof Error ? error.message : t('Failed to activate vehicle.'),
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
        error instanceof Error ? error.message : t('Failed to approve vehicle in testing mode.'),
      );
    } finally {
      setIsMutatingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => void loadVehicles(true)} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>{t('My Vehicles')}</Text>
          <Text style={styles.subtitle}>
            {t('Add at least one vehicle to start receiving requests.')}
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
          onPress={() => router.push('/vehicle-information?flow=management')}
        >
          <Text style={styles.primaryButtonText}>{t('Add New Vehicle')}</Text>
        </Pressable>

        <View style={styles.availabilityCard}>
          <View style={styles.availabilityHeader}>
            <View style={styles.availabilityIcon}>
              <DriverIcon name="location" size={25} color="#171717" strokeWidth={2} />
            </View>
            <View style={styles.availabilityCopy}>
              <Text style={styles.availabilityTitle}>{t('Service Radius')}</Text>
              <Text style={styles.availabilitySubtitle}>
                {t('Requests are matched against this radius from your base location.')}
              </Text>
            </View>
            <Pressable
              style={styles.availabilityButton}
              onPress={() => router.push('/set-availability')}
            >
              <Text style={styles.availabilityButtonText}>{t('Edit Radius')}</Text>
            </Pressable>
          </View>
          <Text style={styles.availabilityValue}>
            {availability ? `${availability.serviceRadiusKm} km` : t('Not set')}
          </Text>
          <Text style={styles.metaText}>
            {t('Online')}: {availability?.isOnline ? t('Yes') : t('No')}
          </Text>
          <Text style={styles.metaText}>
            {t('Base location')}:{' '}
            {availability?.baseAddress?.trim()
              ? availability.baseAddress.trim()
              : availability?.baseLatitude !== null &&
                  availability?.baseLatitude !== undefined &&
                  availability?.baseLongitude !== null &&
                  availability?.baseLongitude !== undefined
                ? `${availability.baseLatitude.toFixed(6)}, ${availability.baseLongitude.toFixed(6)}`
                : t('Not set')}
          </Text>
        </View>

        {vehicles.length > 0 ? (
          <Pressable
            style={styles.secondaryActionButton}
            onPress={() => router.push('/manage-load-capacities')}
          >
            <Text style={styles.secondaryActionButtonText}>{t('Manage Load Capacities')}</Text>
          </Pressable>
        ) : null}

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color="#F1B900" />
            <Text style={styles.helperText}>{t('Loading your vehicles...')}</Text>
          </View>
        ) : vehicles.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{t('No vehicles added yet')}</Text>
            <Text style={styles.helperText}>
              {t('Add your first vehicle so your account can be ready for transport requests.')}
            </Text>
          </View>
        ) : (
          vehicles.map((vehicle) => {
            const vehicleStatus = vehicle.verificationStatus ?? vehicle.status;
            const statusLabel = vehicleStatus ? getStatusLabel(vehicleStatus, t) : t('Pending review');
            return (
              <View key={vehicle.id} style={styles.vehicleCard}>
                <View style={styles.vehicleHeader}>
                  <View style={styles.vehicleIdentity}>
                    <View style={styles.vehicleIcon}>
                      <DriverIcon name={getVehicleIcon(vehicle.vehicleType)} size={27} color="#171717" strokeWidth={2} />
                    </View>
                    <Text style={styles.vehicleTitle}>
                      {vehicle.brand} {vehicle.model} ({vehicle.year})
                    </Text>
                  </View>
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
                  {t('Type')}: {VEHICLE_TYPE_LABELS[vehicle.vehicleType] ?? vehicle.vehicleType}
                </Text>
                <Text style={styles.metaText}>
                  {t('License plate')}: {vehicle.licensePlateNumber}
                </Text>
                <Text style={styles.metaText}>
                  {t('Condition')}: {getVehicleConditionLabel(vehicle.condition, t)}
                </Text>
                <Text style={styles.metaText}>{t('Verification')}: {statusLabel}</Text>
                <Text style={styles.metaText}>
                  {t('State')}: {vehicle.isActive ? t('Active') : t('Inactive')}
                </Text>
                <Text style={styles.metaText}>
                  {t('Load capacity')}: {getCapacityStatusLabel(vehicle) === 'Defined' ? t('Defined') : getCapacityStatusLabel(vehicle)}
                </Text>
                {getCapacityStatusLabel(vehicle) === 'Defined' ? (
                  <Text style={styles.metaText}>
                    {t('Capacity summary')}: {vehicle.loadProfileName?.trim() || t('Vehicle load profile')}
                    {' • '}
                    {vehicle.capacityKg ? `${vehicle.capacityKg} kg` : t('Weight optional')}
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
                  <Text style={styles.pendingText}>{t('Your vehicle is pending approval.')}</Text>
                ) : null}
                {vehicleStatus === 'REJECTED' && vehicle.rejectionReason ? (
                  <Text style={styles.errorText}>
                    {t('Rejection reason')}: {vehicle.rejectionReason}
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
                        ? t('Edit Capacity')
                        : t('Define Capacity')}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() =>
                      router.push(`/vehicle-information?vehicleId=${vehicle.id}&flow=management`)
                    }
                  >
                    <Text style={styles.secondaryButtonText}>{t('Edit')}</Text>
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
                        <ActivityIndicator color="#171717" />
                      ) : (
                        <Text style={styles.secondaryButtonText}>{t('Activate')}</Text>
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
                      <Text style={styles.testingButtonText}>{t('Approve Vehicle For Testing')}</Text>
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
  container: { flex: 1, backgroundColor: '#F7F8F9' },
  content: {
    paddingHorizontal: 22,
    paddingTop: 25,
    gap: 14,
    paddingBottom: 40,
  },
  header: { gap: 7, marginBottom: 5 },
  title: {
    color: '#151515',
    fontSize: 31,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  subtitle: { color: '#707A8C', fontSize: 15, lineHeight: 21 },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 220,
  },
  emptyCard: {
    borderWidth: 1,
    borderColor: '#DFE3E8',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    gap: 8,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#202020' },
  helperText: { color: '#707A8C', fontSize: 14, textAlign: 'center' },
  availabilityCard: {
    borderWidth: 1,
    borderColor: '#DFE3E8',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    gap: 8,
    shadowColor: '#111111',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  availabilityHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  availabilityIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFC515',
  },
  availabilityCopy: {
    flex: 1,
    gap: 4,
  },
  availabilityTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#202020',
  },
  availabilitySubtitle: {
    fontSize: 13,
    color: '#707A8C',
    lineHeight: 19,
  },
  availabilityValue: {
    marginTop: 2,
    fontSize: 25,
    fontWeight: '800',
    color: '#F3B800',
  },
  availabilityButton: {
    minHeight: 38,
    borderRadius: 13,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFC515',
  },
  availabilityButtonText: {
    color: '#171717',
    fontWeight: '800',
    fontSize: 13,
  },
  vehicleCard: {
    borderWidth: 1,
    borderColor: '#DFE3E8',
    borderRadius: 24,
    padding: 18,
    gap: 9,
    backgroundColor: '#FFFFFF',
    shadowColor: '#111111',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  vehicleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'flex-start',
  },
  vehicleIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  vehicleIcon: {
    width: 50,
    height: 50,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFC515',
  },
  vehicleTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: '#202020',
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusBadgeText: { fontSize: 12, fontWeight: '700' },
  metaText: { color: '#707A8C', fontSize: 14, lineHeight: 20 },
  pendingText: { color: '#A66F00', fontSize: 13, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  primaryButton: {
    minHeight: 54,
    borderRadius: 17,
    backgroundColor: '#FFC515',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: { opacity: 0.78, transform: [{ scale: 0.995 }] },
  secondaryActionButton: {
    minHeight: 52,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#F1B900',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  primaryButtonText: { color: '#171717', fontWeight: '800', fontSize: 15 },
  secondaryActionButtonText: { color: '#8A6200', fontWeight: '800', fontSize: 15 },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F1B900',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFCF0',
  },
  secondaryButtonText: { color: '#8A6200', fontWeight: '800' },
  testingButton: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: '#FFC515',
    alignItems: 'center',
    justifyContent: 'center',
  },
  testingButtonText: { color: '#171717', fontWeight: '800' },
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
  errorText: { color: '#C73333', fontSize: 13 },
});
