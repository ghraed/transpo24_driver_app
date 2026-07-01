import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth-context';
import { getDriverAcceptedJobDetails } from '@/lib/api';
import type { DriverAcceptedJobDetailsResponse } from '@/types/auth';

function formatDate(value: string | null): string {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString();
}

function formatMoney(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(price);
  } catch {
    return `${price.toFixed(2)} ${currency}`;
  }
}

function hasValidCoordinates(latitude: number | null, longitude: number | null): boolean {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function formatVehicleCondition(condition: string | null): string {
  if (!condition) return 'N/A';
  return condition.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (char) => char.toUpperCase());
}
export default function AcceptedJobDetailsScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const params = useLocalSearchParams<{ requestId?: string }>();
  const requestId = typeof params.requestId === 'string' ? params.requestId : '';

  const [details, setDetails] = useState<DriverAcceptedJobDetailsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  const loadDetails = useCallback(async (): Promise<void> => {
    if (!requestId.trim()) {
      setError('Missing request ID.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await getDriverAcceptedJobDetails(requestId);
      setDetails(response);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Failed to load accepted job details.';
      const normalized = message.toLowerCase();
      if (
        normalized.includes('invalid or expired token') ||
        normalized.includes('authorization') ||
        normalized.includes('unauthorized')
      ) {
        await signOut();
        router.replace('/');
        return;
      }
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [requestId, router, signOut]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  const canGoToPickup = useMemo(() => {
    if (!details) return false;
    return (
      details.requestStatus === 'ACCEPTED' ||
      details.requestStatus === 'DRIVER_ASSIGNED' ||
      details.requestStatus === 'DRIVER_GOING_TO_PICKUP' ||
      details.requestStatus === 'DRIVER_ARRIVED_PICKUP'
    );
  }, [details]);

  const canGoToDropoff = useMemo(() => {
    if (!details) return false;
    const requestStatus = String(details.requestStatus);
    return (
      requestStatus === 'ITEM_PICKED_UP' ||
      requestStatus === 'PICKUP_IN_PROGRESS' ||
      requestStatus === 'IN_TRANSIT' ||
      requestStatus === 'DRIVER_GOING_TO_DROPOFF'
    );
  }, [details]);

  const openMap = async (latitude: number | null, longitude: number | null): Promise<void> => {
    if (!hasValidCoordinates(latitude, longitude)) {
      return;
    }

    const latValue = latitude as number;
    const lngValue = longitude as number;
    const lat = latValue.toFixed(6);
    const lng = lngValue.toFixed(6);
    const url = Platform.select({
      ios: `http://maps.apple.com/?ll=${lat},${lng}`,
      android: `geo:${lat},${lng}?q=${lat},${lng}`,
      default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    });

    if (!url) return;
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) return;
    await Linking.openURL(url);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.stateText}>Loading accepted job...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !details) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centeredState}>
          <Text style={styles.errorText}>{error || 'Accepted job not found.'}</Text>
          <Pressable style={styles.primaryButton} onPress={() => void loadDetails()}>
            <Text style={styles.primaryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.successHeader}>
          <Text style={styles.title}>Your offer was accepted</Text>
          <Text style={styles.subtitle}>Review the job details and get ready for pickup.</Text>
          <Text style={styles.offerPrice}>
            {formatMoney(details.acceptedOffer.price, details.acceptedOffer.currency)}
          </Text>
          <Text style={styles.metaText}>Accepted at: {formatDate(details.acceptedAt)}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Customer Summary</Text>
          <Text style={styles.metaText}>Name: {details.customer?.firstName || 'N/A'}</Text>
          <Text style={styles.metaText}>
            Phone: {details.customer?.phone || 'Contact details will appear when pickup starts.'}
          </Text>
          <Text style={styles.metaText}>
            Rating:{' '}
            {typeof details.customer?.rating === 'number' ? details.customer.rating.toFixed(1) : 'N/A'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Offer Summary</Text>
          <Text style={styles.metaText}>
            Price: {formatMoney(details.acceptedOffer.price, details.acceptedOffer.currency)}
          </Text>
          <Text style={styles.metaText}>Estimated pickup: {formatDate(details.acceptedOffer.estimatedPickupAt)}</Text>
          <Text style={styles.metaText}>
            Estimated delivery: {formatDate(details.acceptedOffer.estimatedDeliveryAt)}
          </Text>
          <Text style={styles.metaText}>
            Estimated duration:{' '}
            {typeof details.acceptedOffer.estimatedDurationMinutes === 'number'
              ? `${details.acceptedOffer.estimatedDurationMinutes} minutes`
              : 'N/A'}
          </Text>
          <Text style={styles.metaText}>Message: {details.acceptedOffer.message || 'N/A'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Pickup Location</Text>
          <Text style={styles.metaText}>{details.pickup.address || 'Address unavailable'}</Text>
          <Text style={styles.metaText}>
            Coordinates: {details.pickup.latitude ?? '-'}, {details.pickup.longitude ?? '-'}
          </Text>
          <Pressable
            style={[
              styles.secondaryButton,
              !hasValidCoordinates(details.pickup.latitude, details.pickup.longitude) && styles.disabledButton,
            ]}
            onPress={() => void openMap(details.pickup.latitude, details.pickup.longitude)}
            disabled={!hasValidCoordinates(details.pickup.latitude, details.pickup.longitude)}
          >
            <Text style={styles.secondaryButtonText}>Open Pickup in Maps</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Dropoff Location</Text>
          <Text style={styles.metaText}>{details.dropoff.address || 'Address unavailable'}</Text>
          <Text style={styles.metaText}>
            Coordinates: {details.dropoff.latitude ?? '-'}, {details.dropoff.longitude ?? '-'}
          </Text>
          <Pressable
            style={[
              styles.secondaryButton,
              !hasValidCoordinates(details.dropoff.latitude, details.dropoff.longitude) && styles.disabledButton,
            ]}
            onPress={() => void openMap(details.dropoff.latitude, details.dropoff.longitude)}
            disabled={!hasValidCoordinates(details.dropoff.latitude, details.dropoff.longitude)}
          >
            <Text style={styles.secondaryButtonText}>Open Dropoff in Maps</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Schedule</Text>
          <Text style={styles.metaText}>
            {details.schedule.isImmediate
              ? 'Immediate pickup'
              : `Scheduled: ${formatDate(details.schedule.scheduledPickupAt)}`}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Item Details</Text>
          <Text style={styles.metaText}>Title: {details.itemDetails.title || details.item.title || 'N/A'}</Text>
          <Text style={styles.metaText}>Type: {details.itemDetails.type || 'N/A'}</Text>
          <Text style={styles.metaText}>Description: {details.itemDetails.description || 'N/A'}</Text>
          <Text style={styles.metaText}>
            Brand/Model/Year: {[details.itemDetails.brand, details.itemDetails.model, details.itemDetails.year]
              .filter((value) => value !== null && value !== undefined && value !== '')
              .join(' / ') || 'N/A'}
          </Text>
          <Text style={styles.metaText}>Condition: {details.itemDetails.condition || 'N/A'}</Text>
          {details.vehicleDetails?.condition ? (
            <Text style={styles.metaText}>
              Vehicle condition: {formatVehicleCondition(details.vehicleDetails.condition)}
            </Text>
          ) : null}
          {details.vehicleDetails?.conditionNotes ? (
            <Text style={styles.metaText}>Condition notes: {details.vehicleDetails.conditionNotes}</Text>
          ) : null}
          <Text style={styles.metaText}>
            Weight: {details.itemDetails.weightKg !== null ? `${details.itemDetails.weightKg} kg` : 'N/A'}
          </Text>
          <Text style={styles.metaText}>
            Dimensions: {details.itemDetails.dimensions.lengthCm ?? '-'} x{' '}
            {details.itemDetails.dimensions.widthCm ?? '-'} x {details.itemDetails.dimensions.heightCm ?? '-'} cm
          </Text>
          <Text style={styles.metaText}>
            Loading help: {details.itemDetails.requiresLoadingHelp ? 'Yes' : 'No'}
            {details.itemDetails.requiresLoadingHelp && details.itemDetails.loadingWorkersCount
              ? ` (${details.itemDetails.loadingWorkersCount} workers)`
              : ''}
          </Text>
          <Text style={styles.metaText}>Special instructions: {details.itemDetails.specialInstructions || 'N/A'}</Text>
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

      <View style={styles.footer}>
        <Pressable
          style={[
            styles.primaryActionButton,
            !canGoToPickup && !canGoToDropoff && styles.disabledButton,
          ]}
          onPress={() =>
            router.push({
              pathname: canGoToDropoff ? '/deliver-item' : '/go-to-pickup',
              params: {
                tripId: details.requestId,
                pickupLatitude: String(details.pickup.latitude ?? ''),
                pickupLongitude: String(details.pickup.longitude ?? ''),
                pickupAddress: details.pickup.address ?? '',
                dropoffLatitude: String(details.dropoff.latitude ?? ''),
                dropoffLongitude: String(details.dropoff.longitude ?? ''),
                dropoffAddress: details.dropoff.address ?? '',
              },
            })
          }
          disabled={!canGoToPickup && !canGoToDropoff}
        >
          <Text style={styles.primaryActionButtonText}>
            {canGoToDropoff ? 'Go to Dropoff Location' : 'Go to Pickup Location'}
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
    textAlign: 'center',
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
    paddingBottom: 120,
    gap: 12,
  },
  successHeader: {
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 14,
    backgroundColor: '#F0FDF4',
    padding: 14,
    gap: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#14532D',
  },
  subtitle: {
    fontSize: 14,
    color: '#166534',
  },
  offerPrice: {
    marginTop: 6,
    fontSize: 24,
    fontWeight: '800',
    color: '#14532D',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    gap: 6,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  metaText: {
    fontSize: 13,
    color: '#334155',
  },
  secondaryButton: {
    marginTop: 6,
    minHeight: 38,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#1D4ED8',
    fontSize: 13,
    fontWeight: '700',
  },
  photosRow: {
    gap: 10,
    paddingVertical: 4,
  },
  photo: {
    width: 120,
    height: 90,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  primaryActionButton: {
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.5,
  },
});
