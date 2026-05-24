import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  acceptDriverRequestAlert,
  getDriverRequestDetails,
  ignoreDriverRequestAlert,
} from '@/lib/api';
import type { DriverRequestDetailsResponse } from '@/types/auth';

function formatDate(value: string | null): string {
  if (!value) return 'Not specified';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not specified';
  return date.toLocaleString();
}

function availabilityMessage(requestStatus: string): string | null {
  if (requestStatus === 'PENDING_QUOTES') {
    return null;
  }

  return 'This request is no longer available.';
}

function formatRoute(address: string | null, latitude: number | null, longitude: number | null): string {
  if (address) {
    return address;
  }

  if (typeof latitude === 'number' && typeof longitude === 'number') {
    return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  }

  return 'Location unavailable';
}

export default function ReviewRequestDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ requestId?: string }>();
  const requestId = typeof params.requestId === 'string' ? params.requestId : '';

  const [details, setDetails] = useState<DriverRequestDetailsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const loadDetails = useCallback(async (): Promise<void> => {
    if (!requestId) {
      setError('Missing request ID.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await getDriverRequestDetails(requestId);
      setDetails(response);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Failed to load request details.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  const requestUnavailableMessage = useMemo(
    () => (details ? availabilityMessage(details.requestStatus) : null),
    [details],
  );

  const canAccept = useMemo(() => {
    if (!details) return false;
    if (details.alertStatus === 'IGNORED' || details.alertStatus === 'EXPIRED') return false;
    if (details.requestStatus !== 'PENDING_QUOTES') return false;
    return true;
  }, [details]);

  const onIgnore = (): void => {
    if (!requestId || isBusy) return;

    Alert.alert('Ignore this request?', 'You will stop seeing this request in your alerts.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Ignore',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setIsBusy(true);
            setError('');
            try {
              await ignoreDriverRequestAlert(requestId);
              router.replace('/receive-requests');
            } catch (requestError) {
              const message =
                requestError instanceof Error ? requestError.message : 'Failed to ignore this request.';
              setError(message);
            } finally {
              setIsBusy(false);
            }
          })();
        },
      },
    ]);
  };

  const onAccept = async (): Promise<void> => {
    if (!requestId || !canAccept || isBusy) return;

    setIsBusy(true);
    setError('');
    try {
      const response = await acceptDriverRequestAlert(requestId);
      router.replace({
        pathname: '/send-price-offer',
        params: {
          requestId: response.requestId,
          alertId: response.alertId,
        },
      });
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Failed to accept this request.';
      setError(message);
    } finally {
      setIsBusy(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.stateText}>Loading request details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !details) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centeredState}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.primaryButton} onPress={() => void loadDetails()}>
            <Text style={styles.primaryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!details) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centeredState}>
          <Text style={styles.errorText}>Request not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Request Details</Text>
          <Text style={styles.subtitle}>Review the transport request before sending an offer.</Text>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {requestUnavailableMessage ? <Text style={styles.warningText}>{requestUnavailableMessage}</Text> : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Service</Text>
          <Text style={styles.sectionValue}>{details.service?.nameEn || details.service?.key || 'Service'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Customer</Text>
          <Text style={styles.sectionValue}>
            {details.customer?.firstName || 'Customer details hidden until quote is accepted'}
          </Text>
          <Text style={styles.metaText}>
            Rating: {typeof details.customer?.rating === 'number' ? details.customer.rating.toFixed(1) : 'N/A'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Pickup</Text>
          <Text style={styles.sectionValue}>
            {formatRoute(details.pickup.address, details.pickup.latitude, details.pickup.longitude)}
          </Text>
          <Text style={styles.sectionTitleAlt}>Dropoff</Text>
          <Text style={styles.sectionValue}>
            {formatRoute(details.dropoff.address, details.dropoff.latitude, details.dropoff.longitude)}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Schedule</Text>
          <Text style={styles.sectionValue}>
            {details.schedule.isImmediate
              ? 'Immediate pickup'
              : `Scheduled: ${formatDate(details.schedule.scheduledPickupAt)}`}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Item Details</Text>
          <Text style={styles.sectionValue}>{details.itemDetails.title || details.itemDetails.type || 'Item'}</Text>
          {details.itemDetails.description ? (
            <Text style={styles.metaText}>{details.itemDetails.description}</Text>
          ) : null}
          <Text style={styles.metaText}>Type: {details.itemDetails.type || 'N/A'}</Text>
          <Text style={styles.metaText}>
            Brand/Model/Year: {[details.itemDetails.brand, details.itemDetails.model, details.itemDetails.year]
              .filter((value) => value !== null && value !== undefined && value !== '')
              .join(' / ') || 'N/A'}
          </Text>
          <Text style={styles.metaText}>Condition: {details.itemDetails.condition || 'N/A'}</Text>
          <Text style={styles.metaText}>
            Weight: {details.itemDetails.weightKg !== null ? `${details.itemDetails.weightKg} kg` : 'N/A'}
          </Text>
          <Text style={styles.metaText}>
            Dimensions: {details.itemDetails.dimensions.lengthCm ?? '-'} x {details.itemDetails.dimensions.widthCm ?? '-'} x{' '}
            {details.itemDetails.dimensions.heightCm ?? '-'} cm
          </Text>
          <Text style={styles.metaText}>
            Loading help: {details.itemDetails.requiresLoadingHelp ? 'Yes' : 'No'}
            {details.itemDetails.requiresLoadingHelp && details.itemDetails.loadingWorkersCount
              ? ` (${details.itemDetails.loadingWorkersCount} workers)`
              : ''}
          </Text>
          {details.itemDetails.specialInstructions ? (
            <Text style={styles.metaText}>Special: {details.itemDetails.specialInstructions}</Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Photos</Text>
          {details.photos.length === 0 ? (
            <Text style={styles.metaText}>No photos added.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photosRow}>
              {details.photos.map((photo) => (
                <Image key={photo.id} source={{ uri: photo.url }} style={styles.photo} />
              ))}
            </ScrollView>
          )}
        </View>
      </ScrollView>

      <View style={styles.actionsContainer}>
        <Pressable
          style={[styles.secondaryButton, isBusy ? styles.disabledButton : undefined]}
          onPress={onIgnore}
          disabled={isBusy}
        >
          <Text style={styles.secondaryButtonText}>Ignore</Text>
        </Pressable>
        <Pressable
          style={[styles.primaryActionButton, (!canAccept || isBusy) ? styles.disabledButton : undefined]}
          onPress={() => void onAccept()}
          disabled={!canAccept || isBusy}
        >
          <Text style={styles.primaryActionButtonText}>
            {isBusy ? 'Please wait...' : 'Accept & Send Offer'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  stateText: {
    fontSize: 16,
    color: '#334155',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#B91C1C',
    textAlign: 'left',
  },
  warningText: {
    fontSize: 14,
    color: '#B45309',
    textAlign: 'left',
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  content: {
    padding: 16,
    paddingBottom: 140,
    gap: 12,
  },
  header: {
    gap: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 14,
    color: '#475569',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  sectionTitleAlt: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 8,
  },
  sectionValue: {
    fontSize: 14,
    color: '#1E293B',
  },
  metaText: {
    fontSize: 13,
    color: '#475569',
  },
  photosRow: {
    gap: 8,
    paddingVertical: 4,
  },
  photo: {
    width: 84,
    height: 84,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  actionsContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#334155',
    fontWeight: '600',
  },
  primaryActionButton: {
    flex: 1.4,
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: '#0EA5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.6,
  },
});
