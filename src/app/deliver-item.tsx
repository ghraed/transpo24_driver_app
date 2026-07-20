import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

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
import { emitDriverLocationUpdate, onItemDelivered, onTripStatusUpdated } from '@/services/socketService';
import { translateDynamicBatch } from '@/services/translation-service';
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
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<DeliverItemParams>();
  const tripId = typeof params.tripId === 'string' ? params.tripId.trim() : '';
  const mapsApiKey =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    (Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY?.trim()
      : process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY?.trim()) ||
    '';

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
  const fakeLocationIndexRef = useRef<number>(0);
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

  const payloadValidationMessage = useMemo(() => {
    const payload: DeliverItemRequest = {
      notes: notes.trim() || undefined,
      latitude: driverLocation?.latitude,
      longitude: driverLocation?.longitude,
    };
    return validateDeliverItemRequest(payload);
  }, [driverLocation, notes]);

  useEffect(() => {
    const targetLanguage = i18n.language.split('-')[0];
    if (!isSupportedLanguage(targetLanguage) || targetLanguage === 'en') {
      setTranslatedTextByKey({});
      return;
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
      setTranslatedTextByKey({});
      return;
    }

    let active = true;
    void translateDynamicBatch({
      items,
      targetLanguage: targetLanguage as AppLanguage,
    }).then((translations) => {
      if (active) setTranslatedTextByKey(translations);
    }).catch(() => {
      if (active) setTranslatedTextByKey({});
    });

    return () => {
      active = false;
    };
  }, [dropoffLocation?.address, i18n.language, pickupLocation?.address]);

  const onBackToHome = (): void => {
    router.replace('/driver-home');
  };

  const ensureDriverGoingToDropoff = useCallback(async (): Promise<void> => {
    if (requestStatus === 'DRIVER_GOING_TO_DROPOFF' || requestStatus === 'IN_TRANSIT') {
      return;
    }

    try {
      const response = await startDelivery(tripId);
      setRequestStatus(response.status);
      setRouteBlockedMessage('');
    } catch (error) {
      const message = error instanceof Error ? localizeDeliveryError(error.message, t) : t('Failed to start delivery.');
      const normalizedMessage = message.toLowerCase();

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
  }, [requestStatus, t, tripId]);

  const refreshDriverLocation = useCallback(async (showLoader = false): Promise<GeoLocation | null> => {
    if (showLoader) {
      setIsRefreshingLocation(true);
    }

    setLocationMessage('');

    try {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocationMessage(t('Location permission denied. Enable location to continue delivery confirmation.'));
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
        accuracy: typeof current.coords.accuracy === 'number' ? current.coords.accuracy : undefined,
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
  }, [tripId]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBackToHome();
      return true;
    });

    return () => {
      subscription.remove();
    };
  }, [router]);

  useEffect(() => {
    let active = true;

    const setup = async (): Promise<(() => void) | void> => {
      if (isInvalidRoute) {
        setIsLoadingLocation(false);
        setIsStartingDelivery(false);
        return;
      }

      try {
        const details = await getDriverAcceptedJobDetails(tripId);
        if (!active) return;

        setRequestStatus(details.requestStatus);
        if (isTerminalRequestStatus(details.requestStatus)) {
          router.replace(buildCompletedRoute(tripId, new Date().toISOString()));
          return;
        }

        if (!isDeliveryPhaseRequestStatus(details.requestStatus)) {
          setRouteBlockedMessage('Pickup must be confirmed and saved before opening delivery.');
          setIsStartingDelivery(false);
          setIsLoadingLocation(false);
          return;
        }
      } catch (error) {
        if (!active) return;
        setSubmitError(error instanceof Error ? localizeDeliveryError(error.message, t) : t('Failed to load trip status.'));
        setIsStartingDelivery(false);
        setIsLoadingLocation(false);
        return;
      }

      try {
        await ensureDriverGoingToDropoff();
      } catch (error) {
        const message = error instanceof Error ? localizeDeliveryError(error.message, t) : t('Failed to start delivery.');
        const normalizedMessage = message.toLowerCase();
        if (
          normalizedMessage.includes('trip status must be item_picked_up before starting delivery') ||
          normalizedMessage.includes('pickup must be confirmed')
        ) {
          try {
            const details = await getDriverAcceptedJobDetails(tripId);
            if (
              details.requestStatus !== 'DRIVER_GOING_TO_DROPOFF' &&
              details.requestStatus !== 'IN_TRANSIT'
            ) {
              setRouteBlockedMessage(t('Pickup must be confirmed and saved before opening delivery.'));
              setIsStartingDelivery(false);
              setIsLoadingLocation(false);
              return;
            }
          } catch {
            setRouteBlockedMessage(t('Pickup must be confirmed and saved before opening delivery.'));
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
          if (payload.status === 'DELIVERED') {
            router.replace(buildCompletedRoute(tripId, payload.updatedAt));
          }
        });
        offItemDelivered = onItemDelivered((payload) => {
          if (payload.tripId !== tripId) return;
          router.replace(buildCompletedRoute(tripId, payload.deliveredAt));
        });
      } catch {
        // Socket listeners are best-effort on this screen.
      }

      const permission = await Location.requestForegroundPermissionsAsync();
      if (!active) return;

      if (permission.status !== 'granted') {
        setLocationMessage(t('Location permission denied. Enable location to continue delivery confirmation.'));
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

            if (distanceMoved < EMIT_DISTANCE_THRESHOLD_METERS && timeElapsed < EMIT_TIME_THRESHOLD_MS) {
              return;
            }

            emitDriverLocationUpdate({
              tripId,
              latitude: liveLocation.latitude,
              longitude: liveLocation.longitude,
              heading: typeof position.coords.heading === 'number' ? position.coords.heading : undefined,
              speed: typeof position.coords.speed === 'number' ? position.coords.speed : undefined,
              accuracy: typeof position.coords.accuracy === 'number' ? position.coords.accuracy : undefined,
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
  }, [ensureDriverGoingToDropoff, isInvalidRoute, refreshDriverLocation, router, tripId]);

  // Auto-fit map to show both driver and dropoff when driver location first arrives
  useEffect(() => {
    if (!driverLocation || !dropoffLocation || hasFittedToCoordinatesRef.current) return;
    hasFittedToCoordinatesRef.current = true;
    const timer = setTimeout(() => {
      const distance = calculateDistanceMeters(driverLocation, dropoffLocation);
      if (distance < 10) {
        // Driver and dropoff are at the same location - just center on it
        mapRef.current?.animateToRegion({
          latitude: dropoffLocation.latitude,
          longitude: dropoffLocation.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }, 300);
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

  // TESTING ONLY: Simulates movement to dropoff for testing without physical GPS.
  const onSendFakeLocationPress = (): void => {
    if (!dropoffLocation) return;
    const fakeLocations: GeoLocation[] = [
      { latitude: 33.396067, longitude: 35.673211 },
      { latitude: dropoffLocation.latitude + 0.001, longitude: dropoffLocation.longitude + 0.001 },
      { latitude: dropoffLocation.latitude, longitude: dropoffLocation.longitude },
    ];
    const nextLocation = fakeLocations[fakeLocationIndexRef.current % fakeLocations.length];
    fakeLocationIndexRef.current += 1;
    setDriverLocation(nextLocation);
    setIsLoadingLocation(false);
    emitDriverLocationUpdate({
      tripId,
      latitude: nextLocation.latitude,
      longitude: nextLocation.longitude,
    });
    lastEmitLocationRef.current = nextLocation;
    lastEmitAtRef.current = Date.now();
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
          const fresh = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
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
        const normalizedMessage = message.toLowerCase();
        if (
          normalizedMessage.includes('trip status must be driver_going_to_dropoff before confirming delivery')
        ) {
          await ensureDriverGoingToDropoff();
          response = await deliverItem(tripId, payload);
        } else {
          throw error;
        }
      }

      router.replace(buildCompletedRoute(tripId, response.deliveredAt));
    } catch (error) {
      setSubmitError(error instanceof Error ? localizeDeliveryError(error.message, t) : t('Failed to confirm delivery.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isInvalidRoute || !pickupLocation || !dropoffLocation) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <Text style={styles.errorText}>{t('Invalid trip data. Please reopen this trip from Accepted Jobs.')}</Text>
      </SafeAreaView>
    );
  }

  if (routeBlockedMessage) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <Text style={styles.errorText}>{routeBlockedMessage}</Text>
        <Pressable
          style={styles.actionButton}
          onPress={() =>
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
            })
          }
        >
          <Text style={styles.actionButtonText}>{t('Go to Pickup Location')}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const actionDisabled =
    isSubmitting ||
    isLoadingLocation ||
    isStartingDelivery ||
    !driverLocation ||
    tooFarFromDropoff ||
    Boolean(payloadValidationMessage);

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          gestureEnabled: false,
          headerBackVisible: false,
          headerLeft: () => (
            <Pressable hitSlop={12} onPress={onBackToHome}>
              <Text style={styles.headerBackText}>{t('Back')}</Text>
            </Pressable>
          ),
        }}
      />
      <View style={[styles.mapContainer, { height: isMapFullscreen ? windowHeight : windowHeight * 0.5 }]}>
        {isLoadingLocation && !driverLocation ? (
          <View style={styles.centeredMapState}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.helperText}>{t('Getting location...')}</Text>
          </View>
        ) : mapsApiKey && isNativeMapRuntimeAvailable && NativeMapView && NativeMarker ? (
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
              <NativeMarker coordinate={driverLocation} title={t('Driver')} anchor={{ x: 0.5, y: 0.5 }}>
                <Text style={styles.driverMarkerIcon}>🚗</Text>
              </NativeMarker>
            ) : null}
            <NativeMarker coordinate={dropoffLocation} title={t('Dropoff')} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={styles.destinationXMarker}>
                <Text style={styles.destinationXText}>X</Text>
              </View>
            </NativeMarker>
            {driverLocation ? (
              <DriverRoutePolyline
                key={buildRoutePolylineKey(driverLocation, dropoffLocation)}
                origin={driverLocation}
                destination={dropoffLocation}
                apikey={mapsApiKey}
                strokeWidth={4}
                strokeColor="#0EA5E9"
              />
            ) : null}
          </NativeMapView>
        ) : (
          <View style={styles.centeredMapState}>
            <Text style={styles.warningText}>
              {t('Google Maps key missing. Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY to enable map preview.')}
            </Text>
          </View>
        )}
        <Pressable
          style={styles.mapToggleButton}
          onPress={() => setIsMapFullscreen((value) => !value)}
        >
          <SymbolView
            name={{
              ios: isMapFullscreen ? 'arrow.down.right.and.arrow.up.left' : 'arrow.up.left.and.arrow.down.right',
              android: isMapFullscreen ? 'fullscreen_exit' : 'fullscreen',
              web: isMapFullscreen ? 'fullscreen_exit' : 'fullscreen',
            }}
            size={20}
            weight="bold"
            tintColor="#FFFFFF"
          />
        </Pressable>
      </View>

      <ScrollView
        style={[styles.bottomScroll, isMapFullscreen && styles.hidden]}
        contentContainerStyle={styles.bottomCard}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{t('Deliver Item')}</Text>
        <Text style={styles.addressText}>
          {translatedTextByKey.dropoffAddress || formatDisplayAddress(dropoffLocation.address, 'Dropoff address unavailable', t)}
        </Text>
        <Text style={styles.subText}>{t('Trip ID')}: {tripId}</Text>
        <Text style={styles.subText}>
          {t('Pickup')}: {translatedTextByKey.pickupAddress || formatDisplayAddress(pickupLocation.address, 'Pickup address unavailable', t)}
        </Text>
        <DriverChatButton transportRequestId={tripId} requestStatus={requestStatus} />
        <Text style={styles.distanceText}>
          {t('Distance remaining')}:{' '}
          {distanceMeters !== null ? `${(distanceMeters / 1000).toFixed(2)} km` : '--'}
        </Text>
        <Pressable
          style={[styles.secondaryActionButton, isRefreshingLocation && styles.disabledSecondaryActionButton]}
          onPress={() => void refreshDriverLocation(true)}
          disabled={isRefreshingLocation}
        >
          <Text style={styles.secondaryActionButtonText}>
            {isRefreshingLocation ? t('Refreshing location...') : t('Refresh Driver Location')}
          </Text>
        </Pressable>

        <Text style={styles.infoText}>
          {t('You are on the delivery step. Add optional notes, attach proof photos, then confirm delivery.')}
        </Text>

        {isStartingDelivery ? (
          <Text style={styles.infoText}>{t('Starting delivery...')}</Text>
        ) : null}
        {isLoadingLocation ? <Text style={styles.infoText}>{t('Getting location...')}</Text> : null}
        {locationMessage ? <Text style={styles.infoText}>{locationMessage}</Text> : null}
        {tooFarFromDropoff && distanceMeters !== null ? (
          <Text style={styles.warningText}>
            {t('Too far from dropoff. Move within {{limit}}m. Current: {{current}}m', {
              limit: DELIVER_CONFIRM_RADIUS_METERS,
              current: distanceMeters.toFixed(0),
            })}
          </Text>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('Delivery Notes (Optional)')}</Text>
          <TextInput
            style={styles.textArea}
            placeholder={t('Package delivered to recipient.')}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            maxLength={500}
          />
          <Text style={styles.hintText}>{notes.trim().length}/500</Text>

          <Text style={styles.sectionTitle}>{t('Proof Photos')}</Text>
          <Text style={styles.metaText}>
            {t('Select multiple images from the gallery or capture more photos with the camera. Max {{count}}.', { count: MAX_PROOF_PHOTOS })}
          </Text>
          {proofPhotos.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.proofRow}>
              {proofPhotos.map((photo, index) => (
                <View key={`${photo.uri}-${index}`} style={styles.proofItem}>
                  <Image source={{ uri: photo.uri }} style={styles.proofPreview} resizeMode="cover" />
                  <Text style={styles.proofName} numberOfLines={1}>
                    {photo.fileName?.trim() || `${t('Proof')} ${index + 1}`}
                  </Text>
                  <Pressable
                    style={styles.removeProofButton}
                    onPress={() =>
                      setProofPhotos((current) => current.filter((_, currentIndex) => currentIndex !== index))
                    }
                  >
                    <Text style={styles.removeProofButtonText}>{t('Remove')}</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}
          <View style={styles.uploadActions}>
            <Pressable
              style={[styles.uploadButton, proofPhotos.length >= MAX_PROOF_PHOTOS && styles.disabledUploadButton]}
              onPress={() => void onSelectProofPhotos()}
              disabled={proofPhotos.length >= MAX_PROOF_PHOTOS}
            >
              <Text style={styles.uploadButtonText}>{t('Choose Images')}</Text>
            </Pressable>
            <Pressable
              style={[styles.uploadButton, proofPhotos.length >= MAX_PROOF_PHOTOS && styles.disabledUploadButton]}
              onPress={() => void onTakeProofPhoto()}
              disabled={proofPhotos.length >= MAX_PROOF_PHOTOS}
            >
              <Text style={styles.uploadButtonText}>{t('Take Photo')}</Text>
            </Pressable>
            {proofPhotos.length > 0 ? (
              <Pressable style={styles.clearButton} onPress={() => setProofPhotos([])}>
                <Text style={styles.clearButtonText}>{t('Clear All')}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {payloadValidationMessage ? <Text style={styles.errorText}>{payloadValidationMessage}</Text> : null}
        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

        <Pressable
          style={styles.secondaryActionButton}
          onPress={() =>
            router.push({
              pathname: '/trip-expenses',
              params: { tripId },
            })
          }
        >
          <Text style={styles.secondaryActionButtonText}>{t('Additional Expenses')}</Text>
        </Pressable>

        <Pressable style={styles.testButton} onPress={onSendFakeLocationPress}>
          <Text style={styles.testButtonText}>{t('Send Fake Location')}</Text>
        </Pressable>
      </ScrollView>

      <Pressable
        style={[styles.floatingSubmitButton, actionDisabled && styles.disabledButton, isMapFullscreen && styles.hidden]}
        disabled={actionDisabled}
        onPress={() => void onConfirmDelivery()}
      >
        {isSubmitting ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
        <Text style={styles.floatingSubmitButtonText}>
          {isSubmitting ? t('Submitting Delivery...') : t('Submit Delivery')}
        </Text>
        {!isSubmitting ? (
          <SymbolView
            name={{ ios: 'arrow.forward', android: 'arrow_forward', web: 'arrow_forward' }}
            size={24}
            weight="bold"
            tintColor="#FFFFFF"
          />
        ) : null}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  mapContainer: {
    position: 'relative',
  },
  hidden: {
    display: 'none',
  },
  map: {
    flex: 1,
  },
  mapToggleButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(17, 24, 39, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    elevation: 10,
  },
  centeredMapState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#D1D5DB',
  },
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F3F4F6',
  },
  bottomScroll: {
    flex: 1,
  },
  bottomCard: {
    gap: 14,
    padding: 20,
    paddingBottom: 96,
  },
  floatingSubmitButton: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    right: 24,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 20,
  },
  floatingSubmitButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
  },
  headerBackText: {
    color: '#2563EB',
    fontSize: 16,
    fontWeight: '600',
  },
  addressText: {
    fontSize: 16,
    color: '#374151',
    lineHeight: 24,
  },
  subText: {
    fontSize: 14,
    color: '#6B7280',
  },
  distanceText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  infoText: {
    fontSize: 14,
    color: '#1D4ED8',
    lineHeight: 20,
  },
  card: {
    gap: 12,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    padding: 18,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  textArea: {
    minHeight: 110,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: 'top',
    fontSize: 15,
    color: '#111827',
  },
  hintText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'right',
  },
  metaText: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  helperText: {
    color: '#475569',
  },
  uploadActions: {
    gap: 10,
  },
  uploadButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#DBEAFE',
    paddingVertical: 12,
  },
  disabledUploadButton: {
    opacity: 0.5,
  },
  uploadButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  clearButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    paddingVertical: 12,
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4B5563',
  },
  removeProofButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    paddingVertical: 8,
  },
  removeProofButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B91C1C',
  },
  warningText: {
    fontSize: 14,
    color: '#B45309',
    lineHeight: 20,
  },
  errorText: {
    fontSize: 14,
    color: '#DC2626',
    textAlign: 'center',
    lineHeight: 20,
  },
  actionButton: {
    marginTop: 6,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    paddingVertical: 14,
  },
  disabledSecondaryActionButton: {
    opacity: 0.6,
  },
  disabledButton: {
    backgroundColor: '#94A3B8',
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryActionButtonText: {
    fontWeight: '700',
    fontSize: 15,
    color: '#111827',
  },
  driverMarkerIcon: {
    fontSize: 28,
  },
  destinationXMarker: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#111827',
  },
  destinationXText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  proofRow: {
    gap: 12,
    paddingTop: 8,
  },
  proofItem: {
    width: 132,
    gap: 8,
  },
  proofPreview: {
    width: 132,
    height: 132,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
  },
  proofName: {
    fontSize: 12,
    color: '#374151',
  },
  testButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
    paddingVertical: 12,
  },
  testButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
  },
});
