import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DriverChatButton } from '@/components/driver-chat-button';
import {
  NativeMapView,
  NativeMarker,
  PROVIDER_GOOGLE,
  isNativeMapRuntimeAvailable,
} from '@/components/native-maps';
import { DriverPayoutStatusCard } from '@/components/driver-payout-status-card';
import { resolveBackendAssetUrl } from '@/config/backend';
import { useAuth } from '@/context/auth-context';
import { isDeliveryPhaseRequestStatus, isTerminalRequestStatus } from '@/lib/request-status';
import { getDriverAcceptedJobDetails } from '@/lib/api';
import { isSupportedLanguage, type AppLanguage } from '@/localization/languages';
import { translateDynamicBatch } from '@/services/translation-service';
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

function resolveAssetUrl(url: string): string {
  return resolveBackendAssetUrl(url);
}

function formatDisplayAddress(
  address: string | null | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (!address) return t('Address unavailable');
  if (address === 'Current location') return t('Current location');
  return address;
}

function getProgressLabel(status: DriverAcceptedJobDetailsResponse['requestStatus']): string {
  switch (status) {
    case 'ACCEPTED':
    case 'DRIVER_ASSIGNED':
      return 'Accept Request';
    case 'DRIVER_GOING_TO_PICKUP':
      return 'On the Way to Pickup';
    case 'DRIVER_ARRIVED_PICKUP':
      return 'Arrived at Location';
    case 'ITEM_PICKED_UP':
    case 'PICKUP_IN_PROGRESS':
      return 'Picked Up';
    case 'IN_TRANSIT':
    case 'DRIVER_GOING_TO_DROPOFF':
      return 'On the Way to Delivery';
    case 'DELIVERED':
      return 'Delivered';
    default:
      return status.replaceAll('_', ' ');
  }
}

function getNextActionLabel(status: DriverAcceptedJobDetailsResponse['requestStatus']): string | null {
  switch (status) {
    case 'ACCEPTED':
    case 'DRIVER_ASSIGNED':
    case 'DRIVER_GOING_TO_PICKUP':
      return 'On the Way to Pickup';
    case 'DRIVER_ARRIVED_PICKUP':
      return 'Picked Up';
    case 'ITEM_PICKED_UP':
    case 'PICKUP_IN_PROGRESS':
    case 'IN_TRANSIT':
    case 'DRIVER_GOING_TO_DROPOFF':
      return 'On the Way to Delivery';
    case 'DELIVERED':
      return 'Delivered';
    default:
      return null;
  }
}

function getPrimaryRoutePath(status: DriverAcceptedJobDetailsResponse['requestStatus']): '/go-to-pickup' | '/deliver-item' {
  switch (status) {
    case 'DRIVER_ARRIVED_PICKUP':
      return '/go-to-pickup';
    case 'ITEM_PICKED_UP':
    case 'IN_TRANSIT':
    case 'DRIVER_GOING_TO_DROPOFF':
      return '/deliver-item';
    default:
      return '/go-to-pickup';
  }
}

function getPrimaryRouteLabel(
  status: DriverAcceptedJobDetailsResponse['requestStatus'],
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  switch (status) {
    case 'DRIVER_ARRIVED_PICKUP':
      return t('Go To Pickup Confirmation');
    case 'ITEM_PICKED_UP':
    case 'IN_TRANSIT':
    case 'DRIVER_GOING_TO_DROPOFF':
      return t('Go to Dropoff Location');
    default:
      return t('Go to Pickup Location');
  }
}

export default function AcceptedJobDetailsScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { signOut } = useAuth();
  const params = useLocalSearchParams<{ requestId?: string }>();
  const requestId = typeof params.requestId === 'string' ? params.requestId : '';

  const [details, setDetails] = useState<DriverAcceptedJobDetailsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [expandedPhotoUrl, setExpandedPhotoUrl] = useState<string>('');
  const [translatedTextByKey, setTranslatedTextByKey] = useState<Record<string, string>>({});
  const [activeMapLocation, setActiveMapLocation] = useState<{
    title: string;
    address: string;
    latitude: number;
    longitude: number;
  } | null>(null);

  const loadDetails = useCallback(async (): Promise<void> => {
    if (!requestId.trim()) {
      setError(t('Missing request ID.'));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await getDriverAcceptedJobDetails(requestId);
      setDetails(response);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : t('Failed to load accepted job details.');
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
  }, [requestId, router, signOut, t]);

  useFocusEffect(
    useCallback(() => {
      void loadDetails();
    }, [loadDetails]),
  );

  useEffect(() => {
    const targetLanguage = i18n.language.split('-')[0];
    if (!details || !isSupportedLanguage(targetLanguage) || targetLanguage === 'en') {
      setTranslatedTextByKey({});
      return;
    }

    const items: { key: string; text: string }[] = [];
    const pushItem = (key: string, text: string | number | null | undefined): void => {
      const normalized = typeof text === 'string' ? text : typeof text === 'number' ? String(text) : '';
      const trimmed = normalized.trim();
      if (!trimmed || trimmed === 'Current location') return;
      items.push({ key, text: trimmed });
    };

    pushItem('pickupAddress', details.pickup.address);
    pushItem('dropoffAddress', details.dropoff.address);
    pushItem('itemTitle', details.itemDetails.title || details.item.title);
    pushItem('itemType', details.itemDetails.type);
    pushItem('itemDescription', details.itemDetails.description);
    pushItem('brand', details.itemDetails.brand);
    pushItem('model', details.itemDetails.model);
    pushItem('year', details.itemDetails.year);
    pushItem('condition', details.itemDetails.condition);
    pushItem('specialInstructions', details.itemDetails.specialInstructions);

    if (!items.length) {
      setTranslatedTextByKey({});
      return;
    }

    let active = true;
    void translateDynamicBatch({
      items,
      targetLanguage: targetLanguage as AppLanguage,
    }).then((translations) => {
      if (active) {
        setTranslatedTextByKey(translations);
      }
    });

    return () => {
      active = false;
    };
  }, [details, i18n.language]);

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
    return isDeliveryPhaseRequestStatus(details.requestStatus);
  }, [details]);

  const currentStageLabel = useMemo(
    () => (details ? getProgressLabel(details.requestStatus) : ''),
    [details],
  );

  const nextActionLabel = useMemo(
    () => (details ? getNextActionLabel(details.requestStatus) : null),
    [details],
  );

  const canOpenExpenses = useMemo(() => {
    if (!details) return false;
    return !isTerminalRequestStatus(details.requestStatus);
  }, [details]);

  const openMap = (
    title: string,
    address: string | null,
    latitude: number | null,
    longitude: number | null,
  ): void => {
    if (!hasValidCoordinates(latitude, longitude)) {
      return;
    }

    setActiveMapLocation({
      title,
      address: address?.trim() || t('Address unavailable'),
      latitude: latitude as number,
      longitude: longitude as number,
    });
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.stateText}>{t('Loading accepted job...')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !details) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centeredState}>
          <Text style={styles.errorText}>{error || t('Accepted job not found.')}</Text>
          <Pressable style={styles.primaryButton} onPress={() => void loadDetails()}>
            <Text style={styles.primaryButtonText}>{t('Retry')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.successHeader}>
          <Text style={styles.title}>{t('Your offer was accepted')}</Text>
          <Text style={styles.subtitle}>
            {isTerminalRequestStatus(details.requestStatus)
              ? t('This request is completed and read-only.')
              : t('Review the job details and get ready for pickup.')}
          </Text>
          <Text style={styles.offerPrice}>
            {formatMoney(details.acceptedOffer.price, details.acceptedOffer.currency)}
          </Text>
          <Text style={styles.metaText}>{t('Accepted at')}: {formatDate(details.acceptedAt)}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('Request Progress')}</Text>
          <Text style={styles.progressBadge}>{t(currentStageLabel)}</Text>
          <Text style={styles.metaText}>
            {t('Next action')}: {nextActionLabel ? t(nextActionLabel) : t('No next action available right now.')}
          </Text>
        </View>

        <DriverPayoutStatusCard
          title={t('Trip Payout Status')}
          tripId={details.requestId}
          requestStatus={details.requestStatus}
          amountLabel={formatMoney(details.acceptedOffer.price, details.acceptedOffer.currency)}
          onOpenStripeConnect={() => router.push('/stripe-connect')}
        />

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('Customer Summary')}</Text>
          <Text style={styles.metaText}>{t('Name')}: {details.customer?.firstName || 'N/A'}</Text>
          <Text style={styles.metaText}>
            {t('Phone')}: {details.customer?.phone || t('Contact details will appear when pickup starts.')}
          </Text>
          <Text style={styles.metaText}>
            {t('Rating')}:{' '}
            {typeof details.customer?.rating === 'number' ? details.customer.rating.toFixed(1) : 'N/A'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('Offer Summary')}</Text>
          <Text style={styles.metaText}>
            {t('Price')}: {formatMoney(details.acceptedOffer.price, details.acceptedOffer.currency)}
          </Text>
          <Text style={styles.metaText}>{t('Estimated pickup')}: {formatDate(details.acceptedOffer.estimatedPickupAt)}</Text>
          <Text style={styles.metaText}>
            {t('Estimated delivery')}: {formatDate(details.acceptedOffer.estimatedDeliveryAt)}
          </Text>
          <Text style={styles.metaText}>
            {t('Estimated duration')}:{' '}
            {typeof details.acceptedOffer.estimatedDurationMinutes === 'number'
              ? t('{{count}} minutes', { count: details.acceptedOffer.estimatedDurationMinutes })
              : 'N/A'}
          </Text>
          <Text style={styles.metaText}>{t('Message')}: {details.acceptedOffer.message || 'N/A'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('Pickup Location')}</Text>
          <Text style={styles.metaText}>{translatedTextByKey.pickupAddress || formatDisplayAddress(details.pickup.address, t)}</Text>
          <Text style={styles.metaText}>
            {t('Coordinates')}: {details.pickup.latitude ?? '-'}, {details.pickup.longitude ?? '-'}
          </Text>
          <Pressable
            style={[
              styles.secondaryButton,
              !hasValidCoordinates(details.pickup.latitude, details.pickup.longitude) && styles.disabledButton,
            ]}
            onPress={() =>
              openMap(t('Pickup Location'), translatedTextByKey.pickupAddress || details.pickup.address, details.pickup.latitude, details.pickup.longitude)
            }
            disabled={!hasValidCoordinates(details.pickup.latitude, details.pickup.longitude)}
          >
            <Text style={styles.secondaryButtonText}>{t('Open Pickup in Maps')}</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('Dropoff Location')}</Text>
          <Text style={styles.metaText}>{translatedTextByKey.dropoffAddress || formatDisplayAddress(details.dropoff.address, t)}</Text>
          <Text style={styles.metaText}>
            {t('Coordinates')}: {details.dropoff.latitude ?? '-'}, {details.dropoff.longitude ?? '-'}
          </Text>
          <Pressable
            style={[
              styles.secondaryButton,
              !hasValidCoordinates(details.dropoff.latitude, details.dropoff.longitude) && styles.disabledButton,
            ]}
            onPress={() =>
              openMap(t('Dropoff Location'), translatedTextByKey.dropoffAddress || details.dropoff.address, details.dropoff.latitude, details.dropoff.longitude)
            }
            disabled={!hasValidCoordinates(details.dropoff.latitude, details.dropoff.longitude)}
          >
            <Text style={styles.secondaryButtonText}>{t('Open Dropoff in Maps')}</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('Schedule')}</Text>
          <Text style={styles.metaText}>
            {details.schedule.isImmediate
              ? t('Immediate pickup')
              : t('Scheduled: {{value}}', { value: formatDate(details.schedule.scheduledPickupAt) })}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('Item Details')}</Text>
          <Text style={styles.metaText}>{t('Title')}: {translatedTextByKey.itemTitle || details.itemDetails.title || details.item.title || t('N/A')}</Text>
          <Text style={styles.metaText}>{t('Type')}: {translatedTextByKey.itemType || details.itemDetails.type || t('N/A')}</Text>
          <Text style={styles.metaText}>{t('Description')}: {translatedTextByKey.itemDescription || details.itemDetails.description || t('N/A')}</Text>
          <Text style={styles.metaText}>
            {t('Brand/Model/Year')}: {[
              translatedTextByKey.brand || details.itemDetails.brand,
              translatedTextByKey.model || details.itemDetails.model,
              translatedTextByKey.year || details.itemDetails.year,
            ].filter((value) => value !== null && value !== undefined && value !== '').join(' / ') || t('N/A')}
          </Text>
          <Text style={styles.metaText}>{t('Condition')}: {translatedTextByKey.condition || details.itemDetails.condition || t('N/A')}</Text>
          <Text style={styles.metaText}>
            {t('Weight')}: {details.itemDetails.weightKg !== null ? t('{{value}} kg', { value: details.itemDetails.weightKg }) : t('N/A')}
          </Text>
          <Text style={styles.metaText}>
            {t('Dimensions')}: {details.itemDetails.dimensions.lengthCm ?? '-'} x{' '}
            {details.itemDetails.dimensions.widthCm ?? '-'} x {details.itemDetails.dimensions.heightCm ?? '-'} cm
          </Text>
          <Text style={styles.metaText}>
            {t('Loading help')}: {details.itemDetails.requiresLoadingHelp ? t('Yes') : t('No')}
            {details.itemDetails.requiresLoadingHelp && details.itemDetails.loadingWorkersCount
              ? t(' ({{count}} workers)', { count: details.itemDetails.loadingWorkersCount })
              : ''}
          </Text>
          <Text style={styles.metaText}>{t('Special instructions')}: {translatedTextByKey.specialInstructions || details.itemDetails.specialInstructions || t('N/A')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('Photos')}</Text>
          {details.photos.length === 0 ? (
            <Text style={styles.metaText}>{t('No photos added.')}</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photosRow}>
              {details.photos.map((photo) => (
                <Pressable key={photo.id} onPress={() => setExpandedPhotoUrl(resolveAssetUrl(photo.url))}>
                  <Image source={{ uri: resolveAssetUrl(photo.url) }} style={styles.photo} />
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </ScrollView>

      <Modal visible={Boolean(expandedPhotoUrl)} transparent animationType="fade" onRequestClose={() => setExpandedPhotoUrl('')}>
        <Pressable style={styles.modalBackdrop} onPress={() => setExpandedPhotoUrl('')}>
          {expandedPhotoUrl ? <Image source={{ uri: expandedPhotoUrl }} style={styles.expandedPhoto} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>

      <Modal
        visible={Boolean(activeMapLocation)}
        transparent
        animationType="slide"
        onRequestClose={() => setActiveMapLocation(null)}
      >
        <View style={styles.mapModalBackdrop}>
          <View style={styles.mapModalCard}>
            {activeMapLocation ? (
              <>
                <View style={styles.mapModalHeader}>
                  <View style={styles.mapModalHeaderText}>
                    <Text style={styles.mapModalTitle}>{activeMapLocation.title}</Text>
                    <Text style={styles.mapModalAddress}>{activeMapLocation.address}</Text>
                  </View>
                  <Pressable style={styles.mapCloseButton} onPress={() => setActiveMapLocation(null)}>
                    <Text style={styles.mapCloseButtonText}>{t('Close')}</Text>
                  </Pressable>
                </View>

                {isNativeMapRuntimeAvailable && NativeMapView && NativeMarker ? (
                  <NativeMapView
                    provider={PROVIDER_GOOGLE}
                    style={styles.map}
                    initialRegion={{
                      latitude: activeMapLocation.latitude,
                      longitude: activeMapLocation.longitude,
                      latitudeDelta: 0.01,
                      longitudeDelta: 0.01,
                    }}
                  >
                    <NativeMarker
                      coordinate={{
                        latitude: activeMapLocation.latitude,
                        longitude: activeMapLocation.longitude,
                      }}
                      title={activeMapLocation.title}
                      description={activeMapLocation.address}
                    />
                  </NativeMapView>
                ) : (
                  <View style={styles.mapFallback}>
                    <Text style={styles.mapFallbackText}>{t('Map preview is unavailable on this platform.')}</Text>
                  </View>
                )}

                <Text style={styles.mapCoordinates}>
                  {activeMapLocation.latitude.toFixed(6)}, {activeMapLocation.longitude.toFixed(6)}
                </Text>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <View style={styles.footer}>
        <DriverChatButton
          transportRequestId={details.requestId}
          initialChatRoom={details.chatRoom}
          label={t('Chat with client')}
          showUnavailableState
          requestStatus={details.requestStatus}
        />
        <Pressable
          style={[styles.secondaryFooterButton, !canOpenExpenses && styles.disabledButton]}
          onPress={() =>
            router.push({
              pathname: '/trip-expenses',
              params: {
                tripId: details.requestId,
              },
            })
          }
          disabled={!canOpenExpenses}
        >
          <Text style={styles.secondaryFooterButtonText}>{t('Additional Expenses')}</Text>
        </Pressable>
        <Pressable
          style={[
            styles.primaryActionButton,
            !canGoToPickup && !canGoToDropoff && styles.disabledButton,
          ]}
          onPress={() =>
            router.push({
              pathname: getPrimaryRoutePath(details.requestStatus),
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
            {getPrimaryRouteLabel(details.requestStatus, t)}
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
    paddingBottom: 190,
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
  progressBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#DBEAFE',
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '700',
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  expandedPhoto: {
    width: '100%',
    height: '100%',
  },
  mapModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  mapModalCard: {
    minHeight: '68%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  mapModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  mapModalHeaderText: {
    flex: 1,
    gap: 4,
  },
  mapModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  mapModalAddress: {
    fontSize: 13,
    color: '#475569',
  },
  mapCloseButton: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapCloseButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  map: {
    flex: 1,
    minHeight: 320,
  },
  mapFallback: {
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 16,
  },
  mapFallbackText: {
    color: '#475569',
    textAlign: 'center',
  },
  mapCoordinates: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 12,
    color: '#475569',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  secondaryFooterButton: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryFooterButtonText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
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
