import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
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
  getDriverRequestDetails,
  ignoreDriverRequestAlert,
} from '@/lib/api';
import { isSupportedLanguage, type AppLanguage } from '@/localization/languages';
import { translateDynamicBatch } from '@/services/translation-service';
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
      const response = await getDriverRequestDetails(requestId);
      setDetails(response);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : t('Failed to load request details.');
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [requestId, t]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

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
    pushItem('itemTitle', details.itemDetails.title || details.itemDetails.type);
    pushItem('itemDescription', details.itemDetails.description);
    pushItem('itemType', details.itemDetails.type);
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

    Alert.alert(t('Ignore this request?'), t('You will stop seeing this request in your alerts.'), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Ignore'),
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
                requestError instanceof Error ? requestError.message : t('Failed to ignore this request.');
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
          serviceName: details?.service?.nameEn || details?.service?.key || '',
          pickupAddress: details?.pickup?.address || '',
          dropoffAddress: details?.dropoff?.address || '',
          scheduledPickupAt: details?.schedule?.scheduledPickupAt || '',
        },
      });
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : t('Failed to accept this request.');
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

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {requestUnavailableMessage ? <Text style={styles.warningText}>{requestUnavailableMessage}</Text> : null}

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

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('Pickup')}</Text>
          <Text style={styles.sectionValue}>
            {translatedTextByKey.pickupAddress || formatDisplayAddress(details.pickup.address, details.pickup.latitude, details.pickup.longitude, t)}
          </Text>
          <Text style={styles.sectionTitleAlt}>{t('Dropoff')}</Text>
          <Text style={styles.sectionValue}>
            {translatedTextByKey.dropoffAddress || formatDisplayAddress(details.dropoff.address, details.dropoff.latitude, details.dropoff.longitude, t)}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('Schedule')}</Text>
          <Text style={styles.sectionValue}>
            {details.schedule.isImmediate
              ? t('Immediate pickup')
              : t('Scheduled: {{value}}', { value: formatDate(details.schedule.scheduledPickupAt) })}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('Item Details')}</Text>
          <Text style={styles.sectionValue}>
            {translatedTextByKey.itemTitle || details.itemDetails.title || details.itemDetails.type || t('Item')}
          </Text>
          {(translatedTextByKey.itemDescription || details.itemDetails.description) ? (
            <Text style={styles.metaText}>{translatedTextByKey.itemDescription || details.itemDetails.description}</Text>
          ) : null}
          <Text style={styles.metaText}>{t('Type')}: {translatedTextByKey.itemType || details.itemDetails.type || t('N/A')}</Text>
          <Text style={styles.metaText}>
            {t('Brand/Model/Year')}: {[
              translatedTextByKey.brand || details.itemDetails.brand,
              translatedTextByKey.model || details.itemDetails.model,
              translatedTextByKey.year || details.itemDetails.year,
            ].filter((value) => value !== null && value !== undefined && value !== '').join(' / ') || t('N/A')}
          </Text>
          <Text style={styles.metaText}>{t('Condition')}: {translatedTextByKey.condition || details.itemDetails.condition || t('N/A')}</Text>
          <Text style={styles.metaText}>
            {t('Weight')}: {details.itemDetails.weightKg !== null ? `${details.itemDetails.weightKg} kg` : t('N/A')}
          </Text>
          <Text style={styles.metaText}>
            {t('Dimensions')}: {details.itemDetails.dimensions.lengthCm ?? '-'} x {details.itemDetails.dimensions.widthCm ?? '-'} x{' '}
            {details.itemDetails.dimensions.heightCm ?? '-'} cm
          </Text>
          <Text style={styles.metaText}>
            {t('Loading help')}: {details.itemDetails.requiresLoadingHelp ? t('Yes') : t('No')}
            {details.itemDetails.requiresLoadingHelp && details.itemDetails.loadingWorkersCount
              ? t(' ({{count}} workers)', { count: details.itemDetails.loadingWorkersCount })
              : ''}
          </Text>
          {details.itemDetails.specialInstructions ? (
            <Text style={styles.metaText}>{t('Special')}: {translatedTextByKey.specialInstructions || details.itemDetails.specialInstructions}</Text>
          ) : null}
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

      <View style={styles.actionsContainer}>
        <Pressable
          style={[styles.secondaryButton, isBusy ? styles.disabledButton : undefined]}
          onPress={onIgnore}
          disabled={isBusy}
        >
          <Text style={styles.secondaryButtonText}>{t('Ignore')}</Text>
        </Pressable>
        <Pressable
          style={[styles.primaryActionButton, (!canAccept || isBusy) ? styles.disabledButton : undefined]}
          onPress={() => void onAccept()}
          disabled={!canAccept || isBusy}
        >
          <Text style={styles.primaryActionButtonText}>
            {isBusy ? t('Please wait...') : t('Accept & Send Offer')}
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
