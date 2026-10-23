import { MapLocationMarker, MAP_COLORS } from '@/components/map-location-marker';
import { GOOGLE_MAPS_API_KEY } from '@/config/maps';
import {
  startBackgroundTripTracking,
  stopBackgroundTripTracking,
} from '@/location/background-trip-tracking';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  DriverButton,
  DriverCard,
  DriverIcon,
  DriverNotice,
  DriverPageHeader,
  DriverStatus,
  DriverText,
} from '@/components/ui/driver-ui';
import { TripProgress, TripRouteCard } from '@/components/ui/trip-ui';
import { createTripScreenStyles } from '@/components/ui/trip-screen-styles';
import { driverLayout, useDriverColors } from '@/theme/driver-theme';

import { DriverChatButton } from '@/components/driver-chat-button';
import { DriverRoutePolyline } from '@/components/driver-route-polyline';
import {
  NativeMapView,
  NativeMarker,
  PROVIDER_GOOGLE,
  isNativeMapRuntimeAvailable,
} from '@/components/native-maps';
import { getDriverAcceptedJobDetails } from '@/lib/api';
import { isSupportedLanguage, type AppLanguage } from '@/localization/languages';
import { isDeliveryPhaseRequestStatus, isTerminalRequestStatus } from '@/lib/request-status';
import {
  emitDriverLocationUpdate,
  onItemDelivered,
  onTripStatusUpdated,
} from '@/services/socketService';
import { translateDynamicBatch } from '@/services/translation-service';
import { getSourceErrorMessage } from '@/localization/response-message';
import { deliverItem, startDelivery } from '@/services/tripService';
import type { LocalDocumentAsset } from '@/types/auth';
import type { AddressedLocation, DeliverItemRequest, GeoLocation } from '@/types/trip.types';
import {
  DELIVER_CONFIRM_RADIUS_METERS,
  calculateDistanceMeters,
  canConfirmDelivery,
  isValidGeoLocation,
  isValidTripId,
  validateDeliverItemRequest,
  validateTripStatusUpdatedPayload,
} from '@/utils/deliveryValidation';

const EMIT_DISTANCE_THRESHOLD_METERS = 20;
const EMIT_TIME_THRESHOLD_MS = 5000;
const MAX_PROOF_PHOTOS = 8;
type DeliverItemParams = {
  tripId?: string;
  pickupLatitude?: string;
  pickupLongitude?: string;
  pickupAddress?: string;
  dropoffLatitude?: string;
  dropoffLongitude?: string;
  dropoffAddress?: string;
};

function parseNumber(value: string | string[] | undefined): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toAssetFromImagePicker(asset: ImagePicker.ImagePickerAsset): LocalDocumentAsset {
  return {
    uri: asset.uri,
    fileName: asset.fileName ?? undefined,
    mimeType: asset.mimeType ?? undefined,
    fileSize: asset.fileSize ?? undefined,
    width: asset.width,
    height: asset.height,
  };
}

function buildCompletedRoute(tripId: string, deliveredAt: string): Href {
  return {
    pathname: '/driver-trip-completed',
    params: { tripId, deliveredAt },
  };
}

function normalizeDynamicText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value).trim();
  return '';
}

function formatDisplayAddress(
  address: string | null | undefined,
  fallbackKey: 'Pickup address unavailable' | 'Dropoff address unavailable',
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (!address) return t(fallbackKey);
  if (address === 'Current location') return t('Current location');
  return address;
}

function buildRoutePolylineKey(
  origin: GeoLocation | null | undefined,
  destination: AddressedLocation | null | undefined,
): string {
  return [
    origin?.latitude ?? 'na',
    origin?.longitude ?? 'na',
    destination?.latitude ?? 'na',
    destination?.longitude ?? 'na',
  ].join(':');
}

function localizeDeliveryError(
  message: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const normalized = message.trim().toLowerCase();
  if (normalized === 'request is not in accepted job state.') {
    return t('Request is not in accepted job state.');
  }
  return message;
}

export default function DeliverItemScreen() {
  const colors = useDriverColors();
  const styles = useMemo(() => createTripScreenStyles(colors), [colors]);
  const [showDeliveryForm, setShowDeliveryForm] = useState<boolean | null>(null);
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<DeliverItemParams>();
  const tripId = typeof params.tripId === 'string' ? params.tripId.trim() : '';
  const mapsApiKey = GOOGLE_MAPS_API_KEY;

  const pickupLocation = useMemo<AddressedLocation | null>(() => {
    const latitude = parseNumber(params.pickupLatitude);
    const longitude = parseNumber(params.pickupLongitude);
    if (latitude === null || longitude === null) return null;
    return {
      latitude,
      longitude,
      address: typeof params.pickupAddress === 'string' ? params.pickupAddress : null,
    };
  }, [params.pickupAddress, params.pickupLatitude, params.pickupLongitude]);

  const dropoffLocation = useMemo<AddressedLocation | null>(() => {
    const latitude = parseNumber(params.dropoffLatitude);
    const longitude = parseNumber(params.dropoffLongitude);
    if (latitude === null || longitude === null) return null;
    return {
      latitude,
      longitude,
      address: typeof params.dropoffAddress === 'string' ? params.dropoffAddress : null,
    };
  }, [params.dropoffAddress, params.dropoffLatitude, params.dropoffLongitude]);

  const [driverLocation, setDriverLocation] = useState<GeoLocation | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState<boolean>(true);
  const [isRefreshingLocation, setIsRefreshingLocation] = useState<boolean>(false);
  const [isStartingDelivery, setIsStartingDelivery] = useState<boolean>(true);
  const [notes, setNotes] = useState<string>('');
  const [proofPhotos, setProofPhotos] = useState<LocalDocumentAsset[]>([]);
  const [locationMessage, setLocationMessage] = useState<string>('');
  const [submitError, setSubmitError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [routeBlockedMessage, setRouteBlockedMessage] = useState<string>('');
  const [isMapFullscreen, setIsMapFullscreen] = useState<boolean>(false);
  const [requestStatus, setRequestStatus] = useState<string | null>(null);
  const [translatedTextByKey, setTranslatedTextByKey] = useState<Record<string, string>>({});
  const { height: windowHeight } = useWindowDimensions();

  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const lastEmitLocationRef = useRef<GeoLocation | null>(null);
  const lastEmitAtRef = useRef<number>(0);
  const mapRef = useRef<any>(null);
  const hasFittedToCoordinatesRef = useRef<boolean>(false);
  const isTripValid = isValidTripId(tripId);
  const hasValidPickup = Boolean(pickupLocation && isValidGeoLocation(pickupLocation));
  const hasValidDropoff = Boolean(dropoffLocation && isValidGeoLocation(dropoffLocation));
  const isInvalidRoute = !isTripValid || !hasValidPickup || !hasValidDropoff;

  const distanceMeters = useMemo(() => {
    if (!driverLocation || !dropoffLocation || !isValidGeoLocation(dropoffLocation)) {
      return null;
    }
    return calculateDistanceMeters(driverLocation, dropoffLocation);
  }, [driverLocation, dropoffLocation]);

  const tooFarFromDropoff = useMemo(() => {
    if (!driverLocation || !dropoffLocation) return false;
    return !canConfirmDelivery(driverLocation, dropoffLocation);
  }, [driverLocation, dropoffLocation]);

  const isAtDropoff = distanceMeters !== null && !tooFarFromDropoff;
  const isDeliveryFormExpanded = showDeliveryForm ?? isAtDropoff;

  const payloadValidationMessage = useMemo(() => {
    const payload: DeliverItemRequest = {
      notes: notes.trim() || undefined,
      latitude: driverLocation?.latitude,
      longitude: driverLocation?.longitude,
    };
    return validateDeliverItemRequest(payload);
  }, [driverLocation, notes]);

  useEffect(() => {
    let active = true;
    const targetLanguage = i18n.language.split('-')[0];
    if (!isSupportedLanguage(targetLanguage) || targetLanguage === 'en') {
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
    const pickupAddress = normalizeDynamicText(pickupLocation?.address);
    const dropoffAddress = normalizeDynamicText(dropoffLocation?.address);

    if (pickupAddress && pickupAddress !== 'Current location') {
      items.push({ key: 'pickupAddress', text: pickupAddress });
    }
    if (dropoffAddress && dropoffAddress !== 'Current location') {
      items.push({ key: 'dropoffAddress', text: dropoffAddress });
    }

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
    })
      .then((translations) => {
        if (active) setTranslatedTextByKey(translations);
      })
      .catch(() => {
        if (active) setTranslatedTextByKey({});
      });

    return () => {
      active = false;
    };
  }, [dropoffLocation?.address, i18n.language, pickupLocation?.address]);

  const onBack = useCallback((): void => {
    if (router.canGoBack()) router.back();
    else router.replace('/accepted-jobs');
  }, [router]);

  const ensureDriverGoingToDropoff = useCallback(
    async (currentStatus?: string | null): Promise<void> => {
      const effectiveStatus = currentStatus ?? requestStatus;

      if (effectiveStatus === 'DRIVER_GOING_TO_DROPOFF' || effectiveStatus === 'IN_TRANSIT') {
        return;
      }

      try {
        const response = await startDelivery(tripId);
        setRequestStatus(response.status);
        setRouteBlockedMessage('');
      } catch (error) {
        const message =
          error instanceof Error
            ? localizeDeliveryError(error.message, t)
            : t('Failed to start delivery.');
        const normalizedMessage = getSourceErrorMessage(error, message).toLowerCase();

        if (
          normalizedMessage.includes('already') ||
          normalizedMessage.includes('driver_going_to_dropoff')
        ) {
          setRequestStatus('DRIVER_GOING_TO_DROPOFF');
          setRouteBlockedMessage('');
          return;
        }

        throw error;
      }
    },
    [requestStatus, setRequestStatus, setRouteBlockedMessage, t, tripId],
  );

  const refreshDriverLocation = useCallback(
    async (showLoader = false): Promise<GeoLocation | null> => {
      if (showLoader) {
        setIsRefreshingLocation(true);
      }

      setLocationMessage('');

      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          setLocationMessage(
            t('Location permission denied. Enable location to continue delivery confirmation.'),
          );
          return null;
        }

        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (!servicesEnabled) {
          setLocationMessage(t('GPS unavailable. Please enable location services.'));
          return null;
        }

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Highest,
        });

        const currentLocation: GeoLocation = {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
        };

        if (!isValidGeoLocation(currentLocation)) {
          setLocationMessage(t('Unable to get a valid driver location. Please try again.'));
          return null;
        }

        setDriverLocation(currentLocation);
        emitDriverLocationUpdate({
          tripId,
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          heading: typeof current.coords.heading === 'number' ? current.coords.heading : undefined,
          speed: typeof current.coords.speed === 'number' ? current.coords.speed : undefined,
          accuracy:
            typeof current.coords.accuracy === 'number' ? current.coords.accuracy : undefined,
        });
        lastEmitLocationRef.current = currentLocation;
        lastEmitAtRef.current = Date.now();
        return currentLocation;
      } catch (error) {
        setLocationMessage(
          error instanceof Error
            ? error.message
            : t('Unable to get current location. Please verify GPS availability.'),
        );
        return null;
      } finally {
        if (showLoader) {
          setIsRefreshingLocation(false);
        }
      }
    },
    [setDriverLocation, setIsRefreshingLocation, setLocationMessage, t, tripId],
  );

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (isMapFullscreen) setIsMapFullscreen(false);
        else onBack();
        return true;
      });
      return () => subscription.remove();
    }, [isMapFullscreen, onBack, setIsMapFullscreen]),
  );

  useEffect(() => {
    let active = true;

    const setup = async (): Promise<(() => void) | void> => {
      if (isInvalidRoute) {
        setIsLoadingLocation(false);
        setIsStartingDelivery(false);
        return;
      }

      let currentRequestStatus: string | null = null;

      try {
        const details = await getDriverAcceptedJobDetails(tripId);
        if (!active) return;

        currentRequestStatus = details.requestStatus;
        setRequestStatus(details.requestStatus);
        if (isTerminalRequestStatus(details.requestStatus)) {
          void stopBackgroundTripTracking(tripId).catch(() => undefined);
          router.replace(buildCompletedRoute(tripId, new Date().toISOString()));
          return;
        }

        if (!isDeliveryPhaseRequestStatus(details.requestStatus)) {
          setRouteBlockedMessage(t('Pickup must be confirmed and saved before opening delivery.'));
          setIsStartingDelivery(false);
          setIsLoadingLocation(false);
          return;
        }
      } catch (error) {
        if (!active) return;
        setSubmitError(
          error instanceof Error
            ? localizeDeliveryError(error.message, t)
            : t('Failed to load trip status.'),
        );
        setIsStartingDelivery(false);
        setIsLoadingLocation(false);
        return;
      }

      try {
        await ensureDriverGoingToDropoff(currentRequestStatus);
      } catch (error) {
        const message =
          error instanceof Error
            ? localizeDeliveryError(error.message, t)
            : t('Failed to start delivery.');
        const normalizedMessage = getSourceErrorMessage(error, message).toLowerCase();
        if (
          normalizedMessage.includes(
            'trip status must be item_picked_up before starting delivery',
          ) ||
          normalizedMessage.includes('pickup must be confirmed')
        ) {
          try {
            const details = await getDriverAcceptedJobDetails(tripId);
            if (
              details.requestStatus !== 'DRIVER_GOING_TO_DROPOFF' &&
              details.requestStatus !== 'IN_TRANSIT'
            ) {
              setRouteBlockedMessage(
                t('Pickup must be confirmed and saved before opening delivery.'),
              );
              setIsStartingDelivery(false);
              setIsLoadingLocation(false);
              return;
            }

            setRequestStatus(details.requestStatus);
            setRouteBlockedMessage('');
            setSubmitError('');
            setIsStartingDelivery(false);
          } catch {
            setRouteBlockedMessage(
              t('Pickup must be confirmed and saved before opening delivery.'),
            );
            setIsStartingDelivery(false);
            setIsLoadingLocation(false);
            return;
          }
        }
        if (
          !normalizedMessage.includes('already') &&
          !normalizedMessage.includes('driver_going_to_dropoff')
        ) {
          setSubmitError(message);
          setIsStartingDelivery(false);
          setIsLoadingLocation(false);
          return;
        }
      } finally {
        if (active) setIsStartingDelivery(false);
      }

      let offTripStatus: (() => void) | null = null;
      let offItemDelivered: (() => void) | null = null;
      try {
        offTripStatus = onTripStatusUpdated((rawPayload) => {
          const payload = validateTripStatusUpdatedPayload(rawPayload);
          if (!payload || payload.tripId !== tripId) return;
          if (isTerminalRequestStatus(payload.status))
            void stopBackgroundTripTracking(tripId).catch(() => undefined);
          if (payload.status === 'DELIVERED') {
            router.replace(buildCompletedRoute(tripId, payload.updatedAt));
          }
        });
        offItemDelivered = onItemDelivered((payload) => {
          if (payload.tripId !== tripId) return;
          void stopBackgroundTripTracking(tripId).catch(() => undefined);
          router.replace(buildCompletedRoute(tripId, payload.deliveredAt));
        });
      } catch {
        // Socket listeners are best-effort on this screen.
      }

      const permission = await Location.requestForegroundPermissionsAsync();
      if (!active) return;

      if (permission.status !== 'granted') {
        setLocationMessage(
          t('Location permission denied. Enable location to continue delivery confirmation.'),
        );
        setIsLoadingLocation(false);
        return;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!active) return;
      if (!servicesEnabled) {
        setLocationMessage(t('GPS unavailable. Please enable location services.'));
        setIsLoadingLocation(false);
        return;
      }

      try {
        await refreshDriverLocation();
        if (!active) return;

        const subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Highest,
            distanceInterval: 10,
            timeInterval: 3000,
          },
          (position) => {
            const liveLocation: GeoLocation = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            };
            if (!isValidGeoLocation(liveLocation)) return;
            setDriverLocation(liveLocation);

            const now = Date.now();
            const lastLocation = lastEmitLocationRef.current;
            const timeElapsed = now - lastEmitAtRef.current;
            const distanceMoved = lastLocation
              ? calculateDistanceMeters(lastLocation, liveLocation)
              : Number.POSITIVE_INFINITY;

            if (
              distanceMoved < EMIT_DISTANCE_THRESHOLD_METERS &&
              timeElapsed < EMIT_TIME_THRESHOLD_MS
            ) {
              return;
            }

            emitDriverLocationUpdate({
              tripId,
              latitude: liveLocation.latitude,
              longitude: liveLocation.longitude,
              heading:
                typeof position.coords.heading === 'number' ? position.coords.heading : undefined,
              speed: typeof position.coords.speed === 'number' ? position.coords.speed : undefined,
              accuracy:
                typeof position.coords.accuracy === 'number' ? position.coords.accuracy : undefined,
            });
            lastEmitLocationRef.current = liveLocation;
            lastEmitAtRef.current = now;
          },
        );

        if (!active) {
          subscription.remove();
          return;
        }
        locationSubscriptionRef.current = subscription;
        void startBackgroundTripTracking(tripId, () => active)
          .then((started) => {
            if (active && !started)
              setLocationMessage(
                t(
                  'Keep this screen open for live tracking, or enable background location in device settings.',
                ),
              );
          })
          .catch(() => {
            if (active)
              setLocationMessage(
                t(
                  'Keep this screen open for live tracking, or enable background location in device settings.',
                ),
              );
          });
      } catch (error) {
        setLocationMessage(
          error instanceof Error
            ? localizeDeliveryError(error.message, t)
            : t('Unable to get current location. Please verify GPS availability.'),
        );
      } finally {
        if (active) {
          setIsLoadingLocation(false);
        }
      }

      return () => {
        offTripStatus?.();
        offItemDelivered?.();
      };
    };

    let teardown: (() => void) | void;
    void setup().then((cleanup) => {
      teardown = cleanup;
    });

    return () => {
      active = false;
      if (teardown) teardown();
      if (locationSubscriptionRef.current) {
        locationSubscriptionRef.current.remove();
        locationSubscriptionRef.current = null;
      }
    };
  }, [ensureDriverGoingToDropoff, isInvalidRoute, refreshDriverLocation, router, t, tripId]);

  // Auto-fit map to show both driver and dropoff when driver location first arrives
  useEffect(() => {
    if (!driverLocation || !dropoffLocation || hasFittedToCoordinatesRef.current) return;
    hasFittedToCoordinatesRef.current = true;
    const timer = setTimeout(() => {
      const distance = calculateDistanceMeters(driverLocation, dropoffLocation);
      if (distance < 10) {
        // Driver and dropoff are at the same location - just center on it
        mapRef.current?.animateToRegion(
          {
            latitude: dropoffLocation.latitude,
            longitude: dropoffLocation.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          },
          300,
        );
      } else {
        mapRef.current?.fitToCoordinates(
          [
            { latitude: driverLocation.latitude, longitude: driverLocation.longitude },
            { latitude: dropoffLocation.latitude, longitude: dropoffLocation.longitude },
          ],
          {
            edgePadding: { top: 80, right: 80, bottom: 80, left: 80 },
            animated: true,
          },
        );
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [driverLocation, dropoffLocation]);

  const appendProofPhotos = (assets: LocalDocumentAsset[]): void => {
    setProofPhotos((current) => [...current, ...assets].slice(0, MAX_PROOF_PHOTOS));
  };

  const onSelectProofPhotos = async (): Promise<void> => {
    setSubmitError('');

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
      setSubmitError(t('Media library permission is required to select proof photos.'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_PROOF_PHOTOS,
      quality: 0.9,
    });

    if (result.canceled) return;
    appendProofPhotos(result.assets.map(toAssetFromImagePicker));
  };

  const onTakeProofPhoto = async (): Promise<void> => {
    setSubmitError('');

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
      setSubmitError(t('Camera permission is required to take proof photos.'));
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });

    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    appendProofPhotos([toAssetFromImagePicker(asset)]);
  };

  const onConfirmDelivery = async (): Promise<void> => {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');
    try {
      if (isInvalidRoute || !dropoffLocation) {
        setSubmitError(t('Invalid trip data. Please reopen this trip from Accepted Jobs.'));
        return;
      }
      if (proofPhotos.length === 0) {
        setSubmitError(t('At least one delivery proof photo is required.'));
        return;
      }
      if (!driverLocation || !isValidGeoLocation(driverLocation)) {
        setSubmitError(t('Current location is required to confirm delivery.'));
        return;
      }

      let latestLocation = driverLocation;
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (permission.status === 'granted') {
          const fresh = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });
          const normalizedLocation: GeoLocation = {
            latitude: fresh.coords.latitude,
            longitude: fresh.coords.longitude,
          };
          if (isValidGeoLocation(normalizedLocation)) {
            latestLocation = normalizedLocation;
            setDriverLocation(normalizedLocation);
          }
        }
      } catch {
        // use latest known location
      }

      if (!canConfirmDelivery(latestLocation, dropoffLocation)) {
        setSubmitError(t('You are too far from dropoff location. Move closer to continue.'));
        return;
      }

      const payload: DeliverItemRequest = {
        notes: notes.trim() || undefined,
        proofPhotos: proofPhotos.length ? proofPhotos : undefined,
        latitude: latestLocation.latitude,
        longitude: latestLocation.longitude,
      };

      const validationError = validateDeliverItemRequest(payload);
      if (validationError) {
        setSubmitError(validationError);
        return;
      }

      await ensureDriverGoingToDropoff();
      let response: Awaited<ReturnType<typeof deliverItem>>;
      try {
        response = await deliverItem(tripId, payload);
      } catch (error) {
        const message = error instanceof Error ? error.message : t('Failed to confirm delivery.');
        const normalizedMessage = getSourceErrorMessage(error, message).toLowerCase();
        if (
          normalizedMessage.includes(
            'trip status must be driver_going_to_dropoff before confirming delivery',
          )
        ) {
          await ensureDriverGoingToDropoff();
          response = await deliverItem(tripId, payload);
        } else {
          throw error;
        }
      }

      void stopBackgroundTripTracking(tripId).catch(() => undefined);
      router.replace(buildCompletedRoute(tripId, response.deliveredAt));
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? localizeDeliveryError(error.message, t)
          : t('Failed to confirm delivery.'),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isInvalidRoute || !pickupLocation || !dropoffLocation || routeBlockedMessage) {
    return (
      <SafeAreaView style={[styles.container, { direction: i18n.dir() }]} edges={['top', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <DriverPageHeader
          title={t('pickupUi.delivery')}
          backLabel={t('Back')}
          onBack={onBack}
          rtl={i18n.dir() === 'rtl'}
        />
        <View style={styles.centeredContainer}>
          <DriverCard style={{ width: '100%', maxWidth: driverLayout.maxWidth }}>
            <DriverNotice
              tone="warning"
              title={t('pickupUi.tripUnavailable')}
              description={
                routeBlockedMessage ||
                t('Invalid trip data. Please reopen this trip from Accepted Jobs.')
              }
            />
            <DriverButton
              label={routeBlockedMessage ? t('Go to Pickup Location') : t('Accepted Jobs')}
              onPress={() => {
                if (routeBlockedMessage && pickupLocation && dropoffLocation)
                  router.replace({
                    pathname: '/go-to-pickup',
                    params: {
                      tripId,
                      pickupLatitude: String(pickupLocation.latitude),
                      pickupLongitude: String(pickupLocation.longitude),
                      pickupAddress: pickupLocation.address ?? '',
                      dropoffLatitude: String(dropoffLocation.latitude),
                      dropoffLongitude: String(dropoffLocation.longitude),
                      dropoffAddress: dropoffLocation.address ?? '',
                    },
                  });
                else router.replace('/accepted-jobs');
              }}
            />
          </DriverCard>
        </View>
      </SafeAreaView>
    );
  }
  const actionDisabled =
    isSubmitting ||
    isLoadingLocation ||
    isRefreshingLocation ||
    isStartingDelivery ||
    !driverLocation ||
    tooFarFromDropoff ||
    Boolean(payloadValidationMessage);

  return (
    <SafeAreaView style={[styles.container, { direction: i18n.dir() }]} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <KeyboardAvoidingView
        style={styles.keyboardArea}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {!isMapFullscreen ? (
          <DriverPageHeader
            title={t('pickupUi.delivery')}
            subtitle={t('pickupUi.tripReference', { id: tripId.slice(-8).toUpperCase() })}
            backLabel={t('Back')}
            rtl={i18n.dir() === 'rtl'}
            onBack={onBack}
            trailing={
              <DriverStatus
                label={isAtDropoff ? t('deliveryUi.atDropoff') : t('pickupUi.enRoute')}
                tone={isAtDropoff ? 'success' : 'neutral'}
              />
            }
          />
        ) : null}
        <ScrollView
          style={styles.bottomScroll}
          contentContainerStyle={[styles.bottomCard, isMapFullscreen && styles.fullscreenContent]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {!isMapFullscreen ? (
            <View style={styles.intro}>
              <TripProgress current={1} />
              <DriverText variant="display">
                {isAtDropoff ? t('deliveryUi.confirmTitle') : t('deliveryUi.heading')}
              </DriverText>
              {isAtDropoff ? (
                <DriverText secondary>{t('deliveryUi.confirmBody')}</DriverText>
              ) : null}
            </View>
          ) : null}
          <View
            style={[
              styles.mapCard,
              {
                height: isMapFullscreen
                  ? windowHeight - 80
                  : Math.max(220, Math.min(300, windowHeight * 0.3)),
              },
            ]}
          >
            {mapsApiKey && isNativeMapRuntimeAvailable && NativeMapView && NativeMarker ? (
              <NativeMapView
                ref={mapRef}
                provider={PROVIDER_GOOGLE}
                style={styles.map}
                initialRegion={{
                  latitude: driverLocation?.latitude ?? dropoffLocation.latitude,
                  longitude: driverLocation?.longitude ?? dropoffLocation.longitude,
                  latitudeDelta: 0.03,
                  longitudeDelta: 0.03,
                }}
              >
                {driverLocation ? (
                  <MapLocationMarker
                    kind="driver"
                    coordinate={driverLocation}
                    title={t('Driver')}
                  />
                ) : null}
                <MapLocationMarker
                  kind="pickup"
                  coordinate={pickupLocation}
                  title={t('Pickup')}
                />
                <MapLocationMarker
                  kind="dropoff"
                  coordinate={dropoffLocation}
                  title={t('Dropoff')}
                />
                {driverLocation ? (
                  <DriverRoutePolyline
                    key={buildRoutePolylineKey(driverLocation, dropoffLocation)}
                    origin={driverLocation}
                    destination={dropoffLocation}
                    apikey={mapsApiKey}
                    strokeWidth={5}
                    strokeColor={MAP_COLORS.route}
                  />
                ) : null}
              </NativeMapView>
            ) : (
              <View style={styles.centeredMapState}>
                <View style={styles.mapPlaceholderIcon}>
                  <DriverIcon name={{ ios: 'map', android: 'map', web: 'map' }} size={32} />
                </View>
                <DriverText variant="section">{t('pickupUi.mapUnavailable')}</DriverText>
                <DriverText variant="caption" secondary>
                  {t('pickupUi.mapFallback')}
                </DriverText>
              </View>
            )}
            <View style={styles.mapTopControls}>
              <View style={styles.distanceBadge}>
                <DriverIcon
                  name={{ ios: 'location', android: 'near_me', web: 'near_me' }}
                  size={16}
                  color={colors.text}
                />
                <DriverText variant="label">
                  {distanceMeters !== null
                    ? t('pickupUi.distanceAway', { distance: (distanceMeters / 1000).toFixed(1) })
                    : isLoadingLocation || isRefreshingLocation
                      ? t('pickupUi.findingLocation')
                      : t('pickupUi.locationUnavailable')}
                </DriverText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  isMapFullscreen ? t('pickupUi.closeMap') : t('pickupUi.expandMap')
                }
                style={({ pressed }) => [styles.mapToggleButton, pressed && styles.pressed]}
                onPress={() => setIsMapFullscreen((value) => !value)}
              >
                <DriverIcon
                  name={{
                    ios: isMapFullscreen
                      ? 'arrow.down.right.and.arrow.up.left'
                      : 'arrow.up.left.and.arrow.down.right',
                    android: isMapFullscreen ? 'fullscreen_exit' : 'fullscreen',
                    web: isMapFullscreen ? 'fullscreen_exit' : 'fullscreen',
                  }}
                  color={colors.text}
                />
              </Pressable>
            </View>
            <View style={styles.mapBottomControls}>
              <DriverButton
                variant="secondary"
                label={
                  isRefreshingLocation ? t('pickupUi.locating') : t('pickupUi.refreshLocation')
                }
                loading={isRefreshingLocation}
                icon={{ ios: 'location', android: 'my_location', web: 'my_location' }}
                onPress={() => void refreshDriverLocation(true)}
              />
            </View>
          </View>
          {!isMapFullscreen ? (
            <>
              <TripRouteCard
                activeStop="dropoff"
                pickup={
                  translatedTextByKey.pickupAddress ||
                  formatDisplayAddress(pickupLocation.address, 'Pickup address unavailable', t)
                }
                dropoff={
                  translatedTextByKey.dropoffAddress ||
                  formatDisplayAddress(dropoffLocation.address, 'Dropoff address unavailable', t)
                }
              />
              {locationMessage ? (
                <DriverNotice title={t('pickupUi.locationUpdate')} description={locationMessage} />
              ) : null}
              <DriverChatButton
                transportRequestId={tripId}
                requestStatus={requestStatus}
                showUnavailableState
              />
              <DriverCard>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('deliveryUi.details')}
                  accessibilityState={{ expanded: isDeliveryFormExpanded }}
                  onPress={() => setShowDeliveryForm(!isDeliveryFormExpanded)}
                  style={({ pressed }) => [styles.formHeader, pressed && styles.pressed]}
                >
                  <View style={styles.formHeading}>
                    <DriverIcon
                      name={{ ios: 'shippingbox', android: 'inventory_2', web: 'inventory_2' }}
                      color={colors.text}
                      size={22}
                    />
                    <View style={styles.headerCopy}>
                      <DriverText variant="section">{t('deliveryUi.details')}</DriverText>
                      <DriverText variant="caption" secondary>
                        {t('pickupUi.notesAndPhotos')}
                      </DriverText>
                    </View>
                  </View>
                  <DriverIcon
                    name={{
                      ios: isDeliveryFormExpanded ? 'chevron.up' : 'chevron.down',
                      android: isDeliveryFormExpanded ? 'expand_less' : 'expand_more',
                      web: isDeliveryFormExpanded ? 'expand_less' : 'expand_more',
                    }}
                  />
                </Pressable>
                {isDeliveryFormExpanded ? (
                  <View style={styles.formBody}>
                    <DriverText variant="label">{t('Delivery Notes (Optional)')}</DriverText>
                    <TextInput
                      style={styles.textArea}
                      multiline
                      numberOfLines={4}
                      placeholder={t('Package delivered to recipient.')}
                      placeholderTextColor={colors.textSecondary}
                      accessibilityLabel={t('Delivery Notes (Optional)')}
                      value={notes}
                      onChangeText={setNotes}
                      maxLength={500}
                    />
                    <DriverText variant="caption" secondary style={styles.hintText}>
                      {notes.length}/500
                    </DriverText>
                    <View style={styles.photoHeading}>
                      <DriverText variant="label">{t('Proof Photos')}</DriverText>
                      <DriverText variant="caption" secondary>
                        {proofPhotos.length}/{MAX_PROOF_PHOTOS}
                      </DriverText>
                    </View>
                    {proofPhotos.length > 0 ? (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.proofRow}
                      >
                        {proofPhotos.map((photo, index) => (
                          <View key={`${photo.uri}-${index}`} style={styles.proofItem}>
                            <Image
                              source={{ uri: photo.uri }}
                              style={styles.proofPreview}
                              resizeMode="cover"
                              accessibilityLabel={t('pickupUi.proofPhoto', { number: index + 1 })}
                            />
                            <DriverButton
                              variant="quiet"
                              label={t('Remove')}
                              onPress={() =>
                                setProofPhotos((current) =>
                                  current.filter((_, currentIndex) => currentIndex !== index),
                                )
                              }
                            />
                          </View>
                        ))}
                      </ScrollView>
                    ) : (
                      <View style={styles.photoEmpty}>
                        <DriverIcon
                          name={{
                            ios: 'photo.on.rectangle',
                            android: 'photo_library',
                            web: 'photo_library',
                          }}
                          size={28}
                        />
                        <DriverText variant="caption" secondary>
                          {t('deliveryUi.photoHint', { count: MAX_PROOF_PHOTOS })}
                        </DriverText>
                      </View>
                    )}
                    <View style={styles.uploadActions}>
                      <DriverButton
                        variant="secondary"
                        style={styles.flexButton}
                        label={t('pickupUi.gallery')}
                        disabled={proofPhotos.length >= MAX_PROOF_PHOTOS}
                        icon={{ ios: 'photo', android: 'photo_library', web: 'photo_library' }}
                        onPress={() => void onSelectProofPhotos()}
                      />
                      <DriverButton
                        variant="secondary"
                        style={styles.flexButton}
                        label={t('pickupUi.camera')}
                        disabled={proofPhotos.length >= MAX_PROOF_PHOTOS}
                        icon={{ ios: 'camera', android: 'photo_camera', web: 'photo_camera' }}
                        onPress={() => void onTakeProofPhoto()}
                      />
                    </View>
                    {proofPhotos.length > 0 ? (
                      <DriverButton
                        variant="quiet"
                        label={t('Clear All')}
                        onPress={() => setProofPhotos([])}
                      />
                    ) : null}
                  </View>
                ) : null}
              </DriverCard>
              <DriverButton
                variant="secondary"
                label={t('Additional Expenses')}
                icon={{ ios: 'receipt', android: 'receipt_long', web: 'receipt_long' }}
                onPress={() => router.push({ pathname: '/trip-expenses', params: { tripId } })}
              />
              {submitError ? (
                <DriverNotice
                  tone="danger"
                  title={t('pickupUi.actionFailed')}
                  description={submitError}
                />
              ) : null}
            </>
          ) : null}
        </ScrollView>
        {!isMapFullscreen ? (
          <View style={styles.footer}>
            <View style={styles.footerContent}>
              <DriverText variant="caption" secondary style={styles.footerHint}>
                {isStartingDelivery
                  ? t('Starting delivery...')
                  : isLoadingLocation
                    ? t('pickupUi.findingLocation')
                    : !driverLocation
                      ? t('pickupUi.locationRequired')
                      : tooFarFromDropoff
                        ? t('deliveryUi.distanceHint', {
                            distance: DELIVER_CONFIRM_RADIUS_METERS / 1000,
                          })
                        : t('deliveryUi.confirmHint')}
              </DriverText>
              <DriverButton
                label={t('deliveryUi.confirmAction')}
                disabled={actionDisabled}
                loading={isSubmitting || isStartingDelivery || isLoadingLocation}
                icon={{ ios: 'checkmark', android: 'check', web: 'check' }}
                onPress={() => void onConfirmDelivery()}
              />
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
