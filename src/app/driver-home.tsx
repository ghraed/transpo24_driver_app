import { useRouter, type Href } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth-context';
import {
  getDriverAvailability,
  getDriverVehicles,
  updateDriverOnlineStatus,
} from '@/lib/api';
import { clearLastOnboardingRoute } from '@/lib/auth-storage';
import { connectSocket, disconnectSocket, onOfferAccepted } from '@/services/socketService';
import { validateOfferAcceptedPayload } from '@/utils/locationValidation';

export default function DriverHomeScreen() {
  const router = useRouter();
  const { user, driver, signOut, accessToken } = useAuth();
  const [hasVehicles, setHasVehicles] = useState<boolean>(true);
  const [isLoadingVehicles, setIsLoadingVehicles] = useState<boolean>(true);
  const [isOnline, setIsOnline] = useState<boolean>(false);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState<boolean>(true);
  const [isUpdatingAvailability, setIsUpdatingAvailability] = useState<boolean>(false);
  const [availabilityError, setAvailabilityError] = useState<string>('');

  useEffect(() => {
    void clearLastOnboardingRoute();
  }, []);

  useEffect(() => {
    if (!accessToken) return;

    connectSocket(accessToken);

    const unsubscribeOfferAccepted = onOfferAccepted((payload) => {
      const validated = validateOfferAcceptedPayload(payload);
      if (!validated) return;

      router.push({
        pathname: '/go-to-pickup',
        params: {
          tripId: validated.tripId,
          pickupLatitude: String(validated.pickupLocation.latitude),
          pickupLongitude: String(validated.pickupLocation.longitude),
          pickupAddress: validated.pickupLocation.address ?? '',
          dropoffLatitude: String(validated.dropoffLocation.latitude),
          dropoffLongitude: String(validated.dropoffLocation.longitude),
          dropoffAddress: validated.dropoffLocation.address ?? '',
        },
      });
    });

    return () => {
      unsubscribeOfferAccepted();
      disconnectSocket();
    };
  }, [accessToken, router]);

  useEffect(() => {
    let isMounted = true;

    const loadVehicles = async (): Promise<void> => {
      setIsLoadingVehicles(true);
      try {
        const vehicles = await getDriverVehicles();
        if (isMounted) {
          setHasVehicles(vehicles.length > 0);
        }
      } catch {
        if (isMounted) {
          setHasVehicles(true);
        }
      } finally {
        if (isMounted) {
          setIsLoadingVehicles(false);
        }
      }
    };

    void loadVehicles();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadAvailability = async (): Promise<void> => {
      setIsLoadingAvailability(true);
      setAvailabilityError('');
      try {
        const availability = await getDriverAvailability();
        if (isMounted) {
          setIsOnline(availability.isOnline);
        }
      } catch (error) {
        if (isMounted) {
          setAvailabilityError(
            error instanceof Error ? error.message : 'Failed to load availability.',
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingAvailability(false);
        }
      }
    };

    void loadAvailability();

    return () => {
      isMounted = false;
    };
  }, []);

  const onToggleAvailability = async (nextValue: boolean): Promise<void> => {
    if (isLoadingAvailability || isUpdatingAvailability) return;

    setIsUpdatingAvailability(true);
    setAvailabilityError('');

    try {
      const response = await updateDriverOnlineStatus({ isOnline: nextValue });
      setIsOnline(response.isOnline);
    } catch (error) {
      setAvailabilityError(
        error instanceof Error ? error.message : 'Failed to update online status.',
      );
    } finally {
      setIsUpdatingAvailability(false);
    }
  };

  const onSignOut = async (): Promise<void> => {
    await signOut();
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Driver Home</Text>
        <Text style={styles.subtitle}>Welcome {driver?.firstName || user?.email || 'Driver'}.</Text>

        <View style={styles.availabilityCard}>
          <View style={styles.availabilityHeader}>
            <View style={styles.availabilityCopy}>
              <Text style={styles.availabilityTitle}>Set Availability</Text>
              <Text style={styles.availabilitySubtitle}>
                {isLoadingAvailability
                  ? 'Loading online status...'
                  : isOnline
                    ? 'You are online and can receive matching requests.'
                    : 'You are offline and will not receive new requests.'}
              </Text>
            </View>
            {isLoadingAvailability ? (
              <ActivityIndicator size="small" color="#1D4ED8" />
            ) : (
              <Switch
                value={isOnline}
                onValueChange={(value) => void onToggleAvailability(value)}
                disabled={isUpdatingAvailability}
                trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                thumbColor={isOnline ? '#1D4ED8' : '#FFFFFF'}
              />
            )}
          </View>
          {isUpdatingAvailability ? (
            <Text style={styles.availabilityHint}>Updating availability...</Text>
          ) : null}
          {availabilityError ? (
            <Text style={styles.availabilityErrorText}>{availabilityError}</Text>
          ) : null}
        </View>

        <Pressable style={styles.requestsButton} onPress={() => router.push('/receive-requests')}>
          <Text style={styles.requestsButtonText}>Available Requests</Text>
        </Pressable>

        <Pressable style={styles.acceptedJobsButton} onPress={() => router.push('/accepted-jobs')}>
          <Text style={styles.acceptedJobsButtonText}>Accepted Jobs</Text>
        </Pressable>

        <Pressable style={styles.vehiclesButton} onPress={() => router.push('/my-vehicles')}>
          <Text style={styles.acceptedJobsButtonText}>My Vehicles</Text>
        </Pressable>

        {isLoadingVehicles ? (
          <View style={styles.vehicleHintRow}>
            <ActivityIndicator size="small" color="#1D4ED8" />
            <Text style={styles.vehicleHintText}>Checking your vehicle status...</Text>
          </View>
        ) : !hasVehicles ? (
          <Text style={styles.vehicleHintText}>
            Add at least one vehicle to start receiving requests.
          </Text>
        ) : null}

        <Pressable style={styles.debugButton} onPress={() => router.push('/socket-debug' as Href)}>
          <Text style={styles.acceptedJobsButtonText}>Socket Debug</Text>
        </Pressable>

        <Pressable style={styles.button} onPress={() => void onSignOut()}>
          <Text style={styles.buttonText}>Logout</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF', padding: 20 },
  card: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 16, gap: 10 },
  title: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  subtitle: { color: '#475569' },
  availabilityCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    borderRadius: 12,
    backgroundColor: '#F8FBFF',
    padding: 14,
    gap: 8,
  },
  availabilityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  availabilityCopy: {
    flex: 1,
    gap: 4,
  },
  availabilityTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  availabilitySubtitle: {
    fontSize: 13,
    color: '#475569',
  },
  availabilityHint: {
    color: '#1D4ED8',
    fontSize: 13,
    fontWeight: '600',
  },
  availabilityErrorText: {
    color: '#B91C1C',
    fontSize: 13,
  },
  requestsButton: {
    marginTop: 8,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#0EA5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestsButtonText: { color: '#FFFFFF', fontWeight: '700' },
  acceptedJobsButton: {
    marginTop: 8,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  debugButton: {
    marginTop: 8,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehiclesButton: {
    marginTop: 8,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptedJobsButtonText: { color: '#FFFFFF', fontWeight: '700' },
  vehicleHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  vehicleHintText: { color: '#1D4ED8', fontSize: 13, fontWeight: '600' },
  button: {
    marginTop: 8,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#FFFFFF', fontWeight: '700' },
});
