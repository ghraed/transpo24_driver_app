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
import {
  connectSocket,
  joinTripRoom,
  leaveTripRoom,
  onAdditionalChargeAdded,
  onItemDelivered,
  onItemPickedUp,
  onTripStatusUpdated,
} from '@/services/socketService';
import type { DriverAcceptedJobDetailsResponse } from '@/types/auth';
import { calculateDistanceMeters } from '@/utils/pickupValidation';

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

function formatRequestStatus(status: string): string {
  return status.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (char) => char.toUpperCase());
}

function toProgressStages(status: string): Array<{ label: string; state: 'done' | 'current' | 'upcoming' }> {
  const order = [
    'DRIVER_ASSIGNED',
    'DRIVER_GOING_TO_PICKUP',
    'DRIVER_ARRIVED_PICKUP',
    'ITEM_PICKED_UP',
    'DRIVER_GOING_TO_DROPOFF',
    'DELIVERED',
  ] as const;

  const labels: Record<(typeof order)[number], string> = {
    DRIVER_ASSIGNED: 'Accept Request',
    DRIVER_GOING_TO_PICKUP: 'On the Way to Pickup',
    DRIVER_ARRIVED_PICKUP: 'Arrived at Location',
    ITEM_PICKED_UP: 'Picked Up',
    DRIVER_GOING_TO_DROPOFF: 'On the Way to Delivery',
    DELIVERED: 'Delivered',
  };

  const normalizedStatus =
    status === 'ACCEPTED'
      ? 'DRIVER_ASSIGNED'
      : status === 'PICKUP_IN_PROGRESS' || status === 'IN_TRANSIT'
      ? 'DRIVER_GOING_TO_DROPOFF'
      : status === 'COMPLETED'
      ? 'DELIVERED'
      : status;

  const currentIndex = order.indexOf(normalizedStatus as (typeof order)[number]);

  return order.map((item, index) => ({
    label: labels[item],
    state:
      currentIndex === -1
        ? index === 0
          ? 'current'
          : 'upcoming'
        : index < currentIndex
        ? 'done'
        : index === currentIndex
        ? 'current'
        : 'upcoming',
  }));
}

function getNextAction(status: string): {
  label: string;
  route: '/go-to-pickup' | '/pickup-item' | '/deliver-item';
  enabled: boolean;
} {
  switch (status) {
    case 'ACCEPTED':
      return { label: 'Accept Request', route: '/go-to-pickup', enabled: true };
    case 'DRIVER_ASSIGNED':
      return { label: 'Accept Request', route: '/go-to-pickup', enabled: true };
    case 'DRIVER_GOING_TO_PICKUP':
      return { label: 'On the Way to Pickup', route: '/go-to-pickup', enabled: true };
    case 'DRIVER_ARRIVED_PICKUP':
      return { label: 'Picked Up', route: '/pickup-item', enabled: true };
    case 'ITEM_PICKED_UP':
    case 'PICKUP_IN_PROGRESS':
    case 'IN_TRANSIT':
    case 'DRIVER_GOING_TO_DROPOFF':
      return { label: 'On the Way to Delivery', route: '/deliver-item', enabled: true };
    case 'DELIVERED':
    case 'COMPLETED':
      return { label: 'Delivered', route: '/deliver-item', enabled: false };
    default:
      return { label: 'Waiting for next step', route: '/go-to-pickup', enabled: false };
  }
}

export default function AcceptedJobDetailsScreen() {
  const router = useRouter();
  const { accessToken, signOut } = useAuth();
  const params = useLocalSearchParams<{ requestId?: string }>();
  const requestId = typeof params.requestId === 'string' ? params.requestId : '';

  const [details, setDetails] = useState<DriverAcceptedJobDetailsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('');

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

  useEffect(() => {
    if (!accessToken || !requestId.trim()) return;

    try {
      connectSocket(accessToken);
      joinTripRoom(requestId);
    } catch {
      return;
    }

    const unsubscribeStatus = onTripStatusUpdated((payload) => {
      if (payload.tripId !== requestId) return;
      setStatusMessage(`Status updated to ${formatRequestStatus(payload.status)}.`);
      if (payload.status === 'DELIVERED') {
        router.replace({
          pathname: '/driver-trip-completed',
          params: { tripId: requestId, deliveredAt: payload.updatedAt },
        });
        return;
      }
      void loadDetails();
    });

    const unsubscribePickedUp = onItemPickedUp((payload) => {
      if (payload.tripId !== requestId) return;
      setStatusMessage('Pickup confirmed successfully.');
      void loadDetails();
    });

    const unsubscribeDelivered = onItemDelivered((payload) => {
      if (payload.tripId !== requestId) return;
      router.replace({
        pathname: '/driver-trip-completed',
        params: { tripId: requestId, deliveredAt: payload.deliveredAt },
      });
    });

    const unsubscribeAdditionalCharge = onAdditionalChargeAdded((payload) => {
      if (payload.requestId !== requestId) return;
      setStatusMessage(
        `Additional expense submitted: ${formatMoney(payload.walletDeduction.amount, payload.walletDeduction.currency)} will be deducted from the customer wallet.`,
      );
    });

    return () => {
      unsubscribeStatus();
      unsubscribePickedUp();
      unsubscribeDelivered();
      unsubscribeAdditionalCharge();
      leaveTripRoom(requestId);
    };
  }, [accessToken, loadDetails, requestId, router]);

  const nextAction = useMemo(
    () => (details ? getNextAction(String(details.requestStatus)) : null),
    [details],
  );

  const progressStages = useMemo(
    () => (details ? toProgressStages(String(details.requestStatus)) : []),
    [details],
  );

  const canSubmitExpense = useMemo(() => {
    if (!details) return false;
    return !['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(String(details.requestStatus));
  }, [details]);

  const tripDistanceLabel = useMemo(() => {
    if (!details) return 'Distance unavailable';
    if (
      !hasValidCoordinates(details.pickup.latitude, details.pickup.longitude) ||
      !hasValidCoordinates(details.dropoff.latitude, details.dropoff.longitude)
    ) {
      return 'Distance unavailable';
    }

    const distanceMeters = calculateDistanceMeters(
      { latitude: details.pickup.latitude as number, longitude: details.pickup.longitude as number },
      { latitude: details.dropoff.latitude as number, longitude: details.dropoff.longitude as number },
    );

    return `${(distanceMeters / 1000).toFixed(1)} km`;
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
          <Text style={styles.title}>Active Request</Text>
          <Text style={styles.subtitle}>Review the job details and continue the next required execution step.</Text>
          <Text style={styles.offerPrice}>
            {formatMoney(details.acceptedOffer.price, details.acceptedOffer.currency)}
          </Text>
          <Text style={styles.metaText}>Accepted at: {formatDate(details.acceptedAt)}</Text>
          <Text style={styles.walletNotice}>
            The amount has been reserved from the customer wallet.
          </Text>
          {statusMessage ? <Text style={styles.statusNotice}>{statusMessage}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Request Summary</Text>
          <Text style={styles.metaText}>Service: {details.service?.nameEn || details.service?.key || 'Transport request'}</Text>
          <Text style={styles.metaText}>Pickup: {details.pickup.address || 'Address unavailable'}</Text>
          <Text style={styles.metaText}>Dropoff: {details.dropoff.address || 'Address unavailable'}</Text>
          <Text style={styles.metaText}>Distance: {tripDistanceLabel}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Request Progress</Text>
          <Text style={styles.progressLabel}>Current status: {formatRequestStatus(String(details.requestStatus))}</Text>
          <Text style={styles.metaText}>Next action: {nextAction?.label || 'N/A'}</Text>
          <View style={styles.progressList}>
            {progressStages.map((stage) => (
              <View key={stage.label} style={styles.progressRow}>
                <View
                  style={[
                    styles.progressDot,
                    stage.state === 'done' && styles.progressDotDone,
                    stage.state === 'current' && styles.progressDotCurrent,
                  ]}
                />
                <Text
                  style={[
                    styles.progressText,
                    stage.state === 'current' && styles.progressTextCurrent,
                  ]}
                >
                  {stage.label}
                </Text>
              </View>
            ))}
          </View>
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
          <Pressable
            style={styles.secondaryButton}
            onPress={() =>
              router.push({
                pathname: '/request-chat',
                params: { requestId: details.requestId },
              })
            }
          >
            <Text style={styles.secondaryButtonText}>Chat with Customer</Text>
          </Pressable>
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

        {canSubmitExpense ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Additional Expenses</Text>
            <Text style={styles.metaText}>
              Submit unexpected costs with an invoice or receipt photo. This amount will be deducted from the customer&apos;s wallet.
            </Text>
            <Pressable
              style={styles.secondaryButton}
              onPress={() =>
                router.push((`/additional-expense?requestId=${encodeURIComponent(details.requestId)}`) as never)
              }
            >
              <Text style={styles.secondaryButtonText}>Submit Expense</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[
            styles.primaryActionButton,
            !nextAction?.enabled && styles.disabledButton,
          ]}
          onPress={() =>
            router.push({
              pathname: nextAction?.route || '/go-to-pickup',
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
          disabled={!nextAction?.enabled}
        >
          <Text style={styles.primaryActionButtonText}>
            {nextAction?.label || 'Waiting for next step'}
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
  walletNotice: {
    color: '#166534',
    fontSize: 13,
    fontWeight: '600',
  },
  statusNotice: {
    color: '#1D4ED8',
    fontSize: 13,
    fontWeight: '600',
  },
  progressLabel: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
  },
  progressList: {
    marginTop: 6,
    gap: 6,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#CBD5E1',
  },
  progressDotDone: {
    backgroundColor: '#16A34A',
  },
  progressDotCurrent: {
    backgroundColor: '#2563EB',
  },
  progressText: {
    fontSize: 13,
    color: '#64748B',
  },
  progressTextCurrent: {
    color: '#0F172A',
    fontWeight: '700',
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
