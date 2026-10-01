import { RequestDocuments } from '@/components/request-documents';
import { TransportedVehicleCard } from '@/components/transported-vehicle-card';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { getSourceErrorMessage } from '@/localization/response-message';
import type { DriverAcceptedJobDetailsResponse } from '@/types/auth';

function formatDate(value: string | null): string {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString(undefined, { hour12: false });
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
      return 'Accepted';
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
      return 'Go To Pickup Confirmation';
    case 'ITEM_PICKED_UP':
    case 'PICKUP_IN_PROGRESS':
    case 'IN_TRANSIT':
    case 'DRIVER_GOING_TO_DROPOFF':
      return 'On the Way to Delivery';
    case 'DELIVERED':
      return null;
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

function DetailRow({ label, value, stacked = false }: { label: string; value: string | number; stacked?: boolean }) {
  return (
    <View style={[styles.detailRow, stacked && styles.stackedDetailRow]}>
      <Text style={[styles.detailLabel, stacked && styles.stackedDetailLabel]}>{label}</Text>
      <Text style={[styles.detailValue, stacked && styles.stackedDetailValue]}>{value}</Text>
    </View>
  );
}

export default function AcceptedJobDetailsScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { signOut } = useAuth();
  const params = useLocalSearchParams<{ requestId?: string }>();
  const requestId = typeof params.requestId === 'string' ? params.requestId : '';

  const loadVersion = useRef(0);
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
    const version = ++loadVersion.current;
    setDetails(null);
    setActiveMapLocation(null);
    setExpandedPhotoUrl('');
    if (!requestId.trim()) {
      setError(t('Missing request ID.'));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await getDriverAcceptedJobDetails(requestId);
      if (version !== loadVersion.current) return;
      setDetails(response);
    } catch (requestError) {
      if (version !== loadVersion.current) return;
      const message = requestError instanceof Error ? requestError.message : t('Failed to load accepted job details.');
      const normalized = getSourceErrorMessage(requestError, message).toLowerCase();
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
      if (version === loadVersion.current) setIsLoading(false);
    }
  }, [requestId, router, signOut, t]);

  useFocusEffect(
    useCallback(() => {
      void loadDetails();
      return () => { loadVersion.current += 1; };
    }, [loadDetails]),
  );

  useEffect(() => {
    let active = true;
    const targetLanguage = i18n.language.split('-')[0];
    if (!details || !isSupportedLanguage(targetLanguage) || targetLanguage === 'en') {
      const resetTimeout = setTimeout(() => {
        if (active) {
          setTranslatedTextByKey({});
        }
      }, 0);
      return () => {
        active = false;
        clearTimeout(resetTimeout);
      };
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
    pushItem('customerNote', details.customerNote);

    if (!items.length) {
      const resetTimeout = setTimeout(() => {
        if (active) {
          setTranslatedTextByKey({});
        }
      }, 0);
      return () => {
        active = false;
        clearTimeout(resetTimeout);
      };
    }

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
          <ActivityIndicator size="large" color="#FFC515" />
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
          <Pressable style={styles.secondaryButton} onPress={() => router.replace('/accepted-jobs')}>
            <Text style={styles.secondaryButtonText}>{t('Back to Accepted Jobs')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.reference}>#TRP-{details.requestId.slice(0, 8).toUpperCase()}</Text>
          <Text style={styles.title}>{t('Accepted Job Details')}</Text>
          <View style={styles.heroSummary}>
            <View style={styles.heroStatus}>
              <Text style={styles.progressBadge}>{t(currentStageLabel)}</Text>
              <Text style={styles.heroMeta}>{t('Accepted at')}: {formatDate(details.acceptedAt)}</Text>
            </View>
            <Text style={styles.offerPrice}>{formatMoney(details.acceptedOffer.price, details.acceptedOffer.currency)}</Text>
          </View>
          {nextActionLabel ? (
            <Text style={styles.nextAction}>{t('Next action')}: {t(nextActionLabel)}</Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <View style={styles.locationBlock}>
            <Text style={styles.locationLabel}>{t('Pickup Location')}</Text>
            <Text style={styles.locationAddress}>
              {translatedTextByKey.pickupAddress || formatDisplayAddress(details.pickup.address, t)}
            </Text>
            <Text style={styles.locationCoordinates}>
              {t('Coordinates')}: {details.pickup.latitude ?? '-'}, {details.pickup.longitude ?? '-'}
            </Text>
            <Pressable
              style={[styles.mapLink, !hasValidCoordinates(details.pickup.latitude, details.pickup.longitude) && styles.disabledButton]}
              onPress={() => openMap(
                t('Pickup Location'),
                translatedTextByKey.pickupAddress || details.pickup.address,
                details.pickup.latitude,
                details.pickup.longitude,
              )}
              disabled={!hasValidCoordinates(details.pickup.latitude, details.pickup.longitude)}
            >
              <Text style={styles.mapLinkText}>{t('Open Pickup in Maps')}</Text>
            </Pressable>
          </View>
          <View style={styles.locationDivider} />
          <View style={styles.locationBlock}>
            <Text style={styles.locationLabel}>{t('Dropoff Location')}</Text>
            <Text style={styles.locationAddress}>
              {translatedTextByKey.dropoffAddress || formatDisplayAddress(details.dropoff.address, t)}
            </Text>
            <Text style={styles.locationCoordinates}>
              {t('Coordinates')}: {details.dropoff.latitude ?? '-'}, {details.dropoff.longitude ?? '-'}
            </Text>
            <Pressable
              style={[styles.mapLink, !hasValidCoordinates(details.dropoff.latitude, details.dropoff.longitude) && styles.disabledButton]}
              onPress={() => openMap(
                t('Dropoff Location'),
                translatedTextByKey.dropoffAddress || details.dropoff.address,
                details.dropoff.latitude,
                details.dropoff.longitude,
              )}
              disabled={!hasValidCoordinates(details.dropoff.latitude, details.dropoff.longitude)}
            >
              <Text style={styles.mapLinkText}>{t('Open Dropoff in Maps')}</Text>
            </Pressable>
          </View>
          <View style={styles.locationDivider} />
          <DetailRow
            label={t('Schedule')}
            value={details.schedule.isImmediate
              ? t('Immediate pickup')
              : t('Scheduled: {{value}}', { value: formatDate(details.schedule.scheduledPickupAt) })}
          />
        </View>

        {details.service?.key === 'VEHICLE_TRANSPORT' ? <RequestDocuments requestId={details.requestId} /> : null}

        {details.service?.key === 'VEHICLE_TRANSPORT' && details.vehicleDetails ? (
          <TransportedVehicleCard vehicle={details.vehicleDetails} />
        ) : (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t('Item Details')}</Text>
            <View style={styles.fields}>
              <DetailRow label={t('Title')} value={translatedTextByKey.itemTitle || details.itemDetails.title || details.item.title || t('N/A')} />
              <DetailRow label={t('Type')} value={translatedTextByKey.itemType || details.itemDetails.type || t('N/A')} />
              <DetailRow label={t('Description')} stacked value={translatedTextByKey.itemDescription || details.itemDetails.description || t('N/A')} />
              <DetailRow label={t('Brand/Model/Year')} value={[
                translatedTextByKey.brand || details.itemDetails.brand,
                translatedTextByKey.model || details.itemDetails.model,
                translatedTextByKey.year || details.itemDetails.year,
              ].filter((value) => value !== null && value !== undefined && value !== '').join(' / ') || t('N/A')} />
              <DetailRow label={t('Condition')} value={translatedTextByKey.condition || details.itemDetails.condition || t('N/A')} />
              <DetailRow label={t('Weight')} value={details.itemDetails.weightKg !== null ? t('{{value}} kg', { value: details.itemDetails.weightKg }) : t('N/A')} />
              <DetailRow label={t('Dimensions')} value={`${details.itemDetails.dimensions.lengthCm ?? '-'} × ${details.itemDetails.dimensions.widthCm ?? '-'} × ${details.itemDetails.dimensions.heightCm ?? '-'} cm`} />
              <DetailRow label={t('Loading help')} value={`${t(details.itemDetails.requiresLoadingHelp ? 'Yes' : 'No')}${details.itemDetails.requiresLoadingHelp && details.itemDetails.loadingWorkersCount ? t(' ({{count}} workers)', { count: details.itemDetails.loadingWorkersCount }) : ''}`} />
              <DetailRow label={t('Special instructions')} stacked value={translatedTextByKey.specialInstructions || details.itemDetails.specialInstructions || t('N/A')} />
              <DetailRow label={t('Customer note')} stacked value={translatedTextByKey.customerNote || details.customerNote || t('N/A')} />
            </View>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('Customer Summary')}</Text>
          <View style={styles.fields}>
            <DetailRow label={t('Name')} value={details.customer?.firstName || t('N/A')} />
            <DetailRow label={t('Phone')} value={details.customer?.phone || t('Contact details will appear when pickup starts.')} />
            <DetailRow label={t('Rating')} value={typeof details.customer?.rating === 'number' ? details.customer.rating.toFixed(1) : t('N/A')} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('Offer Summary')}</Text>
          <View style={styles.fields}>
            <DetailRow label={t('Estimated pickup')} value={formatDate(details.acceptedOffer.estimatedPickupAt)} />
            <DetailRow label={t('Estimated delivery')} value={formatDate(details.acceptedOffer.estimatedDeliveryAt)} />
            <DetailRow label={t('Estimated duration')} value={typeof details.acceptedOffer.estimatedDurationMinutes === 'number'
              ? t('{{count}} minutes', { count: details.acceptedOffer.estimatedDurationMinutes })
              : t('N/A')} />
            <DetailRow label={t('Message')} stacked value={details.acceptedOffer.message || t('N/A')} />
          </View>
        </View>

        {details.photos.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t('Photos')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photosRow}>
              {details.photos.map((photo) => (
                <Pressable key={photo.id} onPress={() => setExpandedPhotoUrl(resolveAssetUrl(photo.url))}>
                  <Image source={{ uri: resolveAssetUrl(photo.url) }} style={styles.photo} />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <DriverPayoutStatusCard
          appearance="neutral"
          title={t('Trip Payout Status')}
          tripId={details.requestId}
          requestStatus={details.requestStatus}
          amountLabel={formatMoney(details.acceptedOffer.price, details.acceptedOffer.currency)}
          onOpenStripeConnect={() => router.push('/stripe-connect')}
        />
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
        <View style={styles.footerSecondaryRow}>
          <View style={styles.footerSecondaryCell}>
            <DriverChatButton
              transportRequestId={details.requestId}
              initialChatRoom={details.chatRoom}
              label={t('Chat with client')}
              appearance="secondary"
              showUnavailableState
              requestStatus={details.requestStatus}
            />
          </View>
          <Pressable
            style={[styles.secondaryFooterButton, !canOpenExpenses && styles.disabledButton]}
            onPress={() =>
              router.push({
                pathname: '/trip-expenses',
                params: { tripId: details.requestId },
              })
            }
            disabled={!canOpenExpenses}
          >
            <Text style={styles.secondaryFooterButtonText}>{t('Additional Expenses')}</Text>
          </Pressable>
        </View>
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
    backgroundColor: '#F7F8F9',
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
    color: '#505A6A',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#B91C1C',
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#FFC515',
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#171717',
    fontSize: 15,
    fontWeight: '600',
  },
  content: {
    padding: 16,
    paddingBottom: 190,
    gap: 12,
  },
  hero: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    padding: 18,
    gap: 10,
  },
  reference: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#172033',
  },
  heroSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 12,
  },
  heroStatus: { flex: 1, alignItems: 'flex-start', gap: 8 },
  heroMeta: { fontSize: 12, color: '#64748B' },
  offerPrice: {
    fontSize: 22,
    fontWeight: '800',
    color: '#172033',
  },
  nextAction: {
    borderTopWidth: 1,
    borderTopColor: '#EEF1F5',
    paddingTop: 10,
    fontSize: 13,
    color: '#475569',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#172033',
  },
  progressBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
    overflow: 'hidden',
  },
  locationBlock: { gap: 6 },
  locationLabel: { color: '#64748B', fontSize: 12, fontWeight: '700' },
  locationAddress: { color: '#172033', fontSize: 15, fontWeight: '600' },
  locationCoordinates: { color: '#94A3B8', fontSize: 12 },
  locationDivider: { height: 1, backgroundColor: '#EEF1F5' },
  mapLink: {
    alignSelf: 'flex-start',
    minHeight: 36,
    justifyContent: 'center',
  },
  mapLinkText: { color: '#9A6900', fontSize: 13, fontWeight: '700' },
  fields: { borderTopWidth: 1, borderTopColor: '#EEF1F5' },
  detailRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F5',
  },
  detailLabel: { width: '38%', fontSize: 13, color: '#64748B' },
  detailValue: { flex: 1, fontSize: 14, fontWeight: '600', color: '#172033', textAlign: 'right' },
  stackedDetailRow: { flexDirection: 'column', gap: 5 },
  stackedDetailLabel: { width: '100%' },
  stackedDetailValue: { textAlign: 'left' },
  secondaryButton: {
    marginTop: 6,
    minHeight: 38,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#334155',
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
    backgroundColor: '#DFE3E8',
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
    borderBottomColor: '#DFE3E8',
  },
  mapModalHeaderText: {
    flex: 1,
    gap: 4,
  },
  mapModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#202020',
  },
  mapModalAddress: {
    fontSize: 13,
    color: '#707A8C',
  },
  mapCloseButton: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#DFE3E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapCloseButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#202020',
  },
  map: {
    flex: 1,
    minHeight: 320,
  },
  mapFallback: {
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DFE3E8',
    paddingHorizontal: 16,
  },
  mapFallbackText: {
    color: '#707A8C',
    textAlign: 'center',
  },
  mapCoordinates: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 12,
    color: '#707A8C',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F7F8F9',
    borderTopWidth: 1,
    borderTopColor: '#DFE3E8',
  },
  footerSecondaryRow: { flexDirection: 'row', gap: 10 },
  footerSecondaryCell: { flex: 1 },
  secondaryFooterButton: {
    flex: 1,
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
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  primaryActionButton: {
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: '#F4B900',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionButtonText: {
    color: '#172033',
    fontSize: 15,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.5,
  },
});
