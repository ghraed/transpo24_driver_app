import { useRouter, type Href } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth-context';
import { getMyDriverVehicles, updateDriverOnlineStatus } from '@/lib/api';
import {
  connectSocket,
  disconnectSocket,
  onOfferAccepted,
  onRequestNew,
  onSocketConnected,
  onSocketDisconnect,
  onSocketError,
} from '@/services/socketService';
import {
  validateOfferAcceptedPayload,
  validateRequestNewPayload,
} from '@/utils/locationValidation';

export default function DriverHomeScreen() {
  const router = useRouter();
  const { user, driver, signOut, accessToken, refreshDriverAvailability } = useAuth();
  const [vehicleNotice, setVehicleNotice] = useState<string>('');
  const [isOnline, setIsOnline] = useState<boolean>(false);
  const [isUpdatingOnline, setIsUpdatingOnline] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [socketStatus, setSocketStatus] = useState<'connected' | 'disconnected' | 'connecting'>(
    'connecting',
  );
  const [socketMessage, setSocketMessage] = useState<string>('');
  const [requestBanner, setRequestBanner] = useState<string>('');

  useEffect(() => {
    if (!accessToken) return;

    connectSocket(accessToken);
    setSocketStatus('connecting');

    const unsubscribeOfferAccepted = onOfferAccepted((payload) => {
      const validated = validateOfferAcceptedPayload(payload);
      if (!validated) return;

      Alert.alert(
        'You were selected',
        'You were selected for this request. The amount has been reserved from the customer wallet.',
        [
          {
            text: 'View job',
            onPress: () =>
              router.push({
                pathname: '/accepted-job-details',
                params: { requestId: validated.tripId },
              }),
          },
        ],
      );
    });

    const unsubscribeRequestNew = onRequestNew((payload) => {
      const validated = validateRequestNewPayload(payload);
      if (!validated) return;

      const serviceName = validated.service?.nameEn || validated.service?.key || 'Transport request';
      const distanceLabel =
        typeof validated.distanceKm === 'number'
          ? `${validated.distanceKm.toFixed(1)} km`
          : 'Distance available in app';
      setRequestBanner(`New request: ${serviceName} • ${distanceLabel}`);
    });

    const unsubscribeConnected = onSocketConnected(() => {
      setSocketStatus('connected');
      setSocketMessage('');
    });

    const unsubscribeDisconnected = onSocketDisconnect(() => {
      setSocketStatus('disconnected');
    });

    const unsubscribeSocketError = onSocketError((message) => {
      setSocketStatus('disconnected');
      setSocketMessage(message);
    });

    return () => {
      unsubscribeOfferAccepted();
      unsubscribeRequestNew();
      unsubscribeConnected();
      unsubscribeDisconnected();
      unsubscribeSocketError();
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
              'Complete at least one vehicle and its load setup before you can receive requests.',
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

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void (async () => {
        try {
          const availability = await refreshDriverAvailability();
          setIsOnline(availability.isOnline);
          if (!availability.isOnline && driver?.status !== 'APPROVED') {
            setStatusMessage('Account pending review. Going online is unavailable until approval.');
            return;
          }
          setStatusMessage('');
        } catch (error) {
          setStatusMessage(
            error instanceof Error ? error.message : 'Failed to load driver availability.',
          );
        }
      })();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [driver?.status, refreshDriverAvailability]);

  const eligibilityMessage = useMemo(() => {
    if (driver?.status !== 'APPROVED') {
      return 'Not eligible to go online: account pending review.';
    }

    if (vehicleNotice) {
      return 'Not eligible to go online: complete vehicle and load setup first.';
    }

    return '';
  }, [driver?.status, vehicleNotice]);

  const onToggleOnline = async (nextValue: boolean): Promise<void> => {
    if (isUpdatingOnline) return;

    setIsUpdatingOnline(true);
    setStatusMessage('');
    try {
      const response = await updateDriverOnlineStatus({ isOnline: nextValue });
      setIsOnline(response.isOnline);
      setStatusMessage(response.isOnline ? 'You are online and can receive requests.' : 'You are offline.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update online status.';
      setStatusMessage(message);
    } finally {
      setIsUpdatingOnline(false);
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
        {vehicleNotice ? <Text style={styles.noticeText}>{vehicleNotice}</Text> : null}
        {requestBanner ? <Text style={styles.successText}>{requestBanner}</Text> : null}

        <View style={styles.statusCard}>
          <View style={styles.statusCopy}>
            <Text style={styles.statusTitle}>Driver status</Text>
            <Text style={styles.statusValue}>{isOnline ? 'Online' : 'Offline'}</Text>
            <Text style={styles.statusHint}>
              {eligibilityMessage || statusMessage || 'Switch online to receive transport requests.'}
            </Text>
            <Text style={styles.socketHint}>
              Real-time connection: {socketStatus}
              {socketMessage ? ` • ${socketMessage}` : ''}
            </Text>
          </View>
          <View style={styles.toggleWrap}>
            {isUpdatingOnline ? <ActivityIndicator color="#2563EB" /> : null}
            <Switch
              value={isOnline}
              onValueChange={(value) => void onToggleOnline(value)}
              disabled={isUpdatingOnline}
            />
          </View>
        </View>

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
  statusCard: {
    borderWidth: 1,
    borderColor: '#DBEAFE',
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  statusCopy: {
    flex: 1,
    gap: 4,
  },
  statusTitle: {
    color: '#1E3A8A',
    fontWeight: '700',
    fontSize: 14,
  },
  statusValue: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 18,
  },
  statusHint: {
    color: '#334155',
    fontSize: 13,
  },
  socketHint: {
    color: '#475569',
    fontSize: 12,
  },
  toggleWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  noticeText: {
    color: '#B45309',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
  },
  successText: {
    color: '#166534',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
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
