import { RequestRouteCard } from '@/components/request-route-card';
import { TransportedVehicleCard } from '@/components/transported-vehicle-card';
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

import { resolveBackendAssetUrl } from '@/config/backend';
import {
  acceptDriverRequestAlert,
  ApiResponseError,
  getDriverRequestDetails,
} from '@/lib/api';
import { DriverButton, DriverCard, DriverNotice, DriverStatus, DriverText } from '@/components/ui/driver-ui';
import { syncRequestMatchingLocation } from '@/location/request-matching-location';
import { driverSpace, driverThemes } from '@/theme/driver-theme';
import { isSupportedLanguage, type AppLanguage } from '@/localization/languages';
import { translateDynamicBatch } from '@/services/translation-service';
import type { DriverRequestDetailsResponse } from '@/types/auth';
import { calculateDistanceMeters } from '@/utils/locationValidation';

function formatDate(value: string | null): string {
  if (!value) return 'Not specified';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not specified';
  return date.toLocaleString(undefined, { hour12: false });
}

function availabilityMessage(requestStatus: string): string | null {
  if (requestStatus === 'PENDING_QUOTES' || requestStatus === 'QUOTED') {
    return null;
  }

  return requestStatus === 'RESERVED' ? 'Pending client payment. New offers are closed.' : 'This request is booked. New offers are closed.';
}

function formatRoute(
  address: string | null | undefined,
  latitude: number | null,
  longitude: number | null,
): string {
  if (address) {
    return address;
  }

  if (typeof latitude === 'number' && typeof longitude === 'number') {
    return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  }

  return 'Location unavailable';
}

function formatServiceLabel(
  service: DriverRequestDetailsResponse['service'] | null | undefined,
  language: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (!service) return t('Service');
  const nameAr = typeof service.nameAr === 'string' ? service.nameAr.trim() : '';
  const nameEn = typeof service.nameEn === 'string' ? service.nameEn.trim() : '';
  const serviceKey = typeof service.key === 'string' ? service.key.trim() : '';
  if (language.startsWith('ar') && nameAr) return nameAr;
  const fallbackLabel = nameEn || serviceKey || t('Service');
  const translated = t(fallbackLabel);
  return translated === fallbackLabel ? fallbackLabel : translated;
}

function getRequestItemCategory(
  details: DriverRequestDetailsResponse,
): 'vehicle' | 'cargo' | 'generic' {
  const searchValue = [
    details.service?.key,
    details.service?.nameEn,
    details.itemDetails.type,
    details.itemDetails.title,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase();

  if (
    /motorcycle|motorbike|bike|scooter|vehicle|car|auto/.test(searchValue)
  ) {
    return 'vehicle';
  }

  if (
    /goods|furniture|cargo|package|parcel|appliance|shipment|load/.test(searchValue)
  ) {
    return 'cargo';
  }

  return 'generic';
}

function hasDimensionValue(details: DriverRequestDetailsResponse['itemDetails']['dimensions']): boolean {
  return (
    details.lengthCm !== null ||
    details.widthCm !== null ||
    details.heightCm !== null
  );
}

function formatDisplayAddress(
  address: string | null | undefined,
  latitude: number | null,
  longitude: number | null,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (address === 'Current location') return t('Current location');
  return formatRoute(address, latitude, longitude);
}

function resolveAssetUrl(url: string): string {
  return resolveBackendAssetUrl(url);
}

function formatRouteDistance(details: DriverRequestDetailsResponse): string | null {
  const { pickup, dropoff } = details;
  if (
    typeof pickup.latitude !== 'number' ||
    typeof pickup.longitude !== 'number' ||
    typeof dropoff.latitude !== 'number' ||
    typeof dropoff.longitude !== 'number'
  ) {
    return null;
  }

  const distanceKm = calculateDistanceMeters(
    { latitude: pickup.latitude, longitude: pickup.longitude },
    { latitude: dropoff.latitude, longitude: dropoff.longitude },
  ) / 1000;

  if (!Number.isFinite(distanceKm)) return null;
  return `${distanceKm.toFixed(distanceKm < 1 ? 2 : 1)} km`;
}

export default function ReviewRequestDetailsScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{ requestId?: string }>();
  const requestId = typeof params.requestId === 'string' ? params.requestId : '';

  const [details, setDetails] = useState<DriverRequestDetailsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [expandedPhotoUrl, setExpandedPhotoUrl] = useState<string>('');
  const [translatedTextByKey, setTranslatedTextByKey] = useState<Record<string, string>>({});

  const loadDetails = useCallback(async (): Promise<void> => {
    if (!requestId) {
      setError(t('Missing request ID.'));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await syncRequestMatchingLocation().catch(() => undefined);
      const response = await getDriverRequestDetails(requestId);
      setDetails(response);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : t('Failed to load request details.');
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [requestId, t]);

  useFocusEffect(useCallback(() => {
    const loadTimeout = setTimeout(() => {
      void loadDetails();
    }, 0);

    return () => {
      clearTimeout(loadTimeout);
    };
  }, [loadDetails]));

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
    pushItem('itemTitle', details.itemDetails.title || details.itemDetails.type);
    pushItem('itemDescription', details.itemDetails.description);
    pushItem('itemType', details.itemDetails.type);
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

  const requestUnavailableMessage = useMemo(
    () => (details ? availabilityMessage(details.requestStatus) : null),
    [details],
  );
  const itemCategory = useMemo(
    () => (details ? getRequestItemCategory(details) : 'generic'),
    [details],
  );
  const routeDistance = useMemo(() => (details ? formatRouteDistance(details) : null), [details]);

  const canAccept = useMemo(() => {
    if (!details) return false;
    if (details.offerStatus || details.offerEligibility?.canSendOffer === false) return false;
    if (details.requestStatus !== 'PENDING_QUOTES' && details.requestStatus !== 'QUOTED') return false;
    return true;
  }, [details]);

  const onAccept = async (): Promise<void> => {
    if (!requestId || !canAccept || isBusy) return;

    setIsBusy(true);
    setError('');
    try {
      await syncRequestMatchingLocation().catch(() => undefined);
      const response = await acceptDriverRequestAlert(requestId);
      router.replace({
        pathname: '/send-price-offer',
        params: {
          requestId: response.requestId,
          requestVersion: details?.requestVersion || '',
          alertId: response.alertId,
          serviceName: details?.service?.nameEn || details?.service?.key || '',
          pickupAddress: details?.pickup?.address || '',
          dropoffAddress: details?.dropoff?.address || '',
          pickupLatitude: details?.pickup?.latitude?.toString() || '',
          pickupLongitude: details?.pickup?.longitude?.toString() || '',
          dropoffLatitude: details?.dropoff?.latitude?.toString() || '',
          dropoffLongitude: details?.dropoff?.longitude?.toString() || '',
          scheduledPickupAt: details?.schedule?.scheduledPickupAt || '',
        },
      });
    } catch (requestError) {
      if (requestError instanceof ApiResponseError && requestError.code?.startsWith('REQUEST_')) {
        const reason = requestError.code.slice('REQUEST_'.length);
        setDetails(current => current ? {
          ...current, offerEligibility: { canSendOffer: false, reason },
        } : current);
      } else {
        const message = requestError instanceof Error ? requestError.message : t('Failed to accept this request.');
        setError(message);
      }
    } finally {
      setIsBusy(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color="#FFC515" />
          <Text style={styles.stateText}>{t('Loading request details...')}</Text>
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
            <Text style={styles.primaryButtonText}>{t('Retry')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!details) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centeredState}>
          <Text style={styles.errorText}>{t('Request not found.')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('Request Details')}</Text>
          <Text style={styles.subtitle}>{t('Review the transport request before sending an offer.')}</Text>
        </View>

        {error ? <DriverNotice title={error} tone="danger" /> : null}
        {requestUnavailableMessage ? <DriverNotice title={t(requestUnavailableMessage)} tone="warning" /> : null}
        {!details.offerStatus && !requestUnavailableMessage && details.offerEligibility?.canSendOffer === false ? (
          <DriverCard>
            <DriverStatus label={t('requestEligibility.unavailable')} tone="warning" />
            <DriverText>
              {t(`requestEligibility.${details.offerEligibility.reason}`, {
                defaultValue: t('requestEligibility.fallback'),
              })}
            </DriverText>
            <View style={{ gap: driverSpace.sm }}>
              <DriverButton label={t('Set Availability')} variant="secondary" onPress={() => router.push('/set-availability')} />
              {details.offerEligibility.reason === 'NO_COMPATIBLE_VEHICLE' ? (
                <DriverButton label={t('My Vehicles')} variant="secondary" onPress={() => router.push('/my-vehicles')} />
              ) : null}
              <DriverButton label={t('requestEligibility.check')} variant="quiet" onPress={() => void loadDetails()} />
            </View>
          </DriverCard>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('Service')}</Text>
          <Text style={styles.sectionValue}>{formatServiceLabel(details.service, i18n.language, t)}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('Customer')}</Text>
          <Text style={styles.sectionValue}>
            {details.customer?.firstName || t('Customer details hidden until quote is accepted')}
          </Text>
          <Text style={styles.metaText}>
            {t('Rating')}: {typeof details.customer?.rating === 'number' ? details.customer.rating.toFixed(1) : t('N/A')}
          </Text>
        </View>

        <RequestRouteCard
          key={requestId}
          pickup={details.pickup}
          dropoff={details.dropoff}
          pickupAddress={translatedTextByKey.pickupAddress || formatDisplayAddress(details.pickup.address, details.pickup.latitude, details.pickup.longitude, t)}
          dropoffAddress={translatedTextByKey.dropoffAddress || formatDisplayAddress(details.dropoff.address, details.dropoff.latitude, details.dropoff.longitude, t)}
          distance={routeDistance}
        />

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('Schedule')}</Text>
          <Text style={styles.sectionValue}>
            {details.schedule.isImmediate
              ? t('Immediate pickup')
              : t('Scheduled: {{value}}', { value: formatDate(details.schedule.scheduledPickupAt) })}
          </Text>
        </View>

        {details.service?.key === 'VEHICLE_TRANSPORT' && details.vehicleDetails ? <TransportedVehicleCard vehicle={details.vehicleDetails} /> : (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('Item Details')}</Text>
          <Text style={styles.sectionValue}>
            {translatedTextByKey.itemTitle || details.itemDetails.title || details.itemDetails.type || t('Item')}
          </Text>
          {(translatedTextByKey.itemDescription || details.itemDetails.description) ? (
            <Text style={styles.metaText}>{translatedTextByKey.itemDescription || details.itemDetails.description}</Text>
          ) : null}
          <Text style={styles.metaText}>{t('Type')}: {translatedTextByKey.itemType || details.itemDetails.type || t('N/A')}</Text>
          {itemCategory === 'vehicle' ? (
            <>
              {[
                translatedTextByKey.brand || details.itemDetails.brand,
                translatedTextByKey.model || details.itemDetails.model,
                translatedTextByKey.year || details.itemDetails.year,
              ].filter((value) => value !== null && value !== undefined && value !== '').length ? (
                <Text style={styles.metaText}>
                  {t('Brand/Model/Year')}: {[
                    translatedTextByKey.brand || details.itemDetails.brand,
                    translatedTextByKey.model || details.itemDetails.model,
                    translatedTextByKey.year || details.itemDetails.year,
                  ].filter((value) => value !== null && value !== undefined && value !== '').join(' / ')}
                </Text>
              ) : null}
              {(translatedTextByKey.condition || details.itemDetails.condition) ? (
                <Text style={styles.metaText}>
                  {t('Condition')}: {translatedTextByKey.condition || details.itemDetails.condition}
                </Text>
              ) : null}
            </>
          ) : null}
          {details.itemDetails.weightKg !== null ? (
            <Text style={styles.metaText}>
              {t('Weight')}: {details.itemDetails.weightKg} kg
            </Text>
          ) : null}
          {hasDimensionValue(details.itemDetails.dimensions) ? (
            <Text style={styles.metaText}>
              {t('Dimensions')}: {details.itemDetails.dimensions.lengthCm ?? '-'} x {details.itemDetails.dimensions.widthCm ?? '-'} x{' '}
              {details.itemDetails.dimensions.heightCm ?? '-'} cm
            </Text>
          ) : null}
          {itemCategory !== 'vehicle' || details.itemDetails.requiresLoadingHelp ? (
            <Text style={styles.metaText}>
              {t('Loading help')}: {details.itemDetails.requiresLoadingHelp ? t('Yes') : t('No')}
              {details.itemDetails.requiresLoadingHelp && details.itemDetails.loadingWorkersCount
                ? t(' ({{count}} workers)', { count: details.itemDetails.loadingWorkersCount })
                : ''}
            </Text>
          ) : null}
          {details.itemDetails.specialInstructions ? (
            <Text style={styles.metaText}>{t('Special')}: {translatedTextByKey.specialInstructions || details.itemDetails.specialInstructions}</Text>
          ) : null}
        </View>
        )}

        {details.customerNote ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t('Customer note')}</Text>
            <Text style={styles.noteText}>{translatedTextByKey.customerNote || details.customerNote}</Text>
          </View>
        ) : null}

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

      {details.offerStatus === 'PENDING' && !requestUnavailableMessage ? (
        <View style={styles.actionsContainer}>
          <Text style={styles.metaText}>
            {t('Your offer is pending customer review. We will notify you when the customer chooses.')}
          </Text>
        </View>
      ) : (
        <View style={styles.actionsContainer}>
          <DriverButton
            label={t('Back')}
            variant="secondary"
            onPress={() => router.replace('/receive-requests')}
            disabled={isBusy}
            style={{ flex: 1 }}
          />
          <DriverButton
            label={t('Accept & Send Offer')}
            onPress={() => void onAccept()}
            disabled={!canAccept}
            loading={isBusy}
            style={{ flex: 1 }}
          />
        </View>
      )}
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
    textAlign: 'left',
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
    paddingBottom: 140,
    gap: 12,
  },
  header: {
    gap: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#202020',
  },
  subtitle: {
    fontSize: 14,
    color: '#707A8C',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DFE3E8',
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#202020',
  },
  sectionTitleAlt: {
    fontSize: 14,
    fontWeight: '700',
    color: '#202020',
    marginTop: 8,
  },
  sectionValue: {
    fontSize: 14,
    color: '#1E293B',
  },
  metaText: {
    fontSize: 13,
    color: '#707A8C',
  },
  noteText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#1E293B',
  },
  photosRow: {
    gap: 8,
    paddingVertical: 4,
  },
  photo: {
    width: 84,
    height: 84,
    borderRadius: 10,
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
  actionsContainer: {
    padding: driverSpace.lg,
    backgroundColor: driverThemes.light.surface,
    borderTopWidth: 1,
    borderTopColor: driverThemes.light.border,
    flexDirection: 'row',
    gap: driverSpace.md,
  },
});
