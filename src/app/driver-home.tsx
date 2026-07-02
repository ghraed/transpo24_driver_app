import { useRouter, type Href } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth-context';
import { getMyDriverVehicles } from '@/lib/api';
import { connectSocket, disconnectSocket, onOfferAccepted } from '@/services/socketService';
import { validateOfferAcceptedPayload } from '@/utils/locationValidation';

export default function DriverHomeScreen() {
  const router = useRouter();
  const { user, driver, signOut, accessToken } = useAuth();
  const [vehicleNotice, setVehicleNotice] = useState<string>('');

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
    const timeoutId = setTimeout(() => {
      void (async () => {
        try {
          const response = await getMyDriverVehicles();
          const hasCompleteVehicle = response.vehicles.some(
            (item) => item.vehicle.completeness?.isComplete,
          );
          if (!hasCompleteVehicle) {
            setVehicleNotice(
              'Add at least one complete vehicle before you can receive requests.',
            );
          } else {
            setVehicleNotice('');
          }
        } catch {
          setVehicleNotice('');
        }
      })();
    }, 0);

    return () => clearTimeout(timeoutId);
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
        {vehicleNotice ? <Text style={styles.noticeText}>{vehicleNotice}</Text> : null}

        <Pressable style={styles.vehiclesButton} onPress={() => router.push('/my-vehicles' as Href)}>
          <Text style={styles.requestsButtonText}>My Vehicles</Text>
        </Pressable>

        <Pressable
          style={[
            styles.requestsButton,
            vehicleNotice ? styles.disabledButton : null,
          ]}
          onPress={() =>
            vehicleNotice
              ? router.push('/my-vehicles' as Href)
              : router.push('/receive-requests')
          }
        >
          <Text style={styles.requestsButtonText}>Available Requests</Text>
        </Pressable>

        <Pressable style={styles.acceptedJobsButton} onPress={() => router.push('/accepted-jobs')}>
          <Text style={styles.acceptedJobsButtonText}>Accepted Jobs</Text>
        </Pressable>

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
  noticeText: {
    color: '#B45309',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
  },
  vehiclesButton: {
    marginTop: 8,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestsButton: {
    marginTop: 8,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#0EA5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.6,
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
  acceptedJobsButtonText: { color: '#FFFFFF', fontWeight: '700' },
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
