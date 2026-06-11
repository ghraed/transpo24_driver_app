import { useRouter, type Href } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth-context';
import { getDriverVehicles } from '@/lib/api';
import { connectSocket, disconnectSocket, onOfferAccepted } from '@/services/socketService';
import { validateOfferAcceptedPayload } from '@/utils/locationValidation';

export default function DriverHomeScreen() {
  const router = useRouter();
  const { user, driver, signOut, accessToken } = useAuth();
  const [hasVehicles, setHasVehicles] = useState<boolean>(true);
  const [isLoadingVehicles, setIsLoadingVehicles] = useState<boolean>(true);

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

  const onSignOut = async (): Promise<void> => {
    await signOut();
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Driver Home</Text>
        <Text style={styles.subtitle}>Welcome {driver?.firstName || user?.email || 'Driver'}.</Text>

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
