import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DriverChatButton } from '@/components/driver-chat-button';
import {
  NativeMapView,
  NativeMapViewDirections,
  NativeMarker,
  PROVIDER_GOOGLE,
  isNativeMapRuntimeAvailable,
} from '@/components/native-maps';
import { GOOGLE_MAPS_API_KEY } from '@/config/maps';
import { useAuth } from '@/context/auth-context';
import { getDriverAcceptedJobDetails } from '@/lib/api';
import { isDeliveryPhaseRequestStatus, isTerminalRequestStatus } from '@/lib/request-status';
import { isSupportedLanguage, type AppLanguage } from '@/localization/languages';
import {
  connectSocket,
  emitDriverArrivedPickup,
  emitDriverLocationUpdate,
  joinTripRoom,
  leaveTripRoom,
  onDriverArrivedPickupConfirmed,
  onItemPickedUp,
  onSocketDisconnect,
  onSocketError,
  onTripStatusUpdated,
} from '@/services/socketService';
import { translateDynamicBatch } from '@/services/translation-service';
import { pickupItem } from '@/services/tripService';
import type { LocalDocumentAsset } from '@/types/auth';
import type { AddressedLocation, GeoLocation, PickupItemRequest } from '@/types/trip.types';
import {
  PICKUP_CONFIRM_RADIUS_METERS,
  calculateDistanceMeters as calculatePickupDistanceMeters,
  canConfirmPickup,
  isValidGeoLocation as isValidPickupGeoLocation,
  isValidTripId,
  validatePickupItemRequest,
} from '@/utils/pickupValidation';
import {
  canMarkArrived,
  calculateDistanceMeters,
  isValidGeoLocation,
  validateDriverArrivedPickupConfirmedPayload,
  validateTripId,
} from '@/utils/locationValidation';

const EMIT_DISTANCE_THRESHOLD_METERS = 20;
const EMIT_TIME_THRESHOLD_MS = 5000;
const MAX_PROOF_PHOTOS = 8;
const TEST_FAKE_LOCATIONS: GeoLocation[] = [
  { latitude: 34.4367, longitude: 35.8497 },
  { latitude: 34.364, longitude: 35.9208 },
  { latitude: 33.9808, longitude: 35.6178 },
  { latitude: 33.8938, longitude: 35.5018 },
  { latitude: 33.5571, longitude: 35.3715 },
  { latitude: 33.397834, longitude: 35.684763 },
  { latitude: 33.398171, longitude: 35.687181 },
];

type PickupParams = {
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

function toDeliverRoute(
  tripId: string,
  pickupLocation: AddressedLocation,
  dropoffLocation: AddressedLocation,
): Href {
  return {
    pathname: '/deliver-item',
    params: {
      tripId,
      pickupLatitude: String(pickupLocation.latitude),
      pickupLongitude: String(pickupLocation.longitude),
      pickupAddress: pickupLocation.address ?? '',
      dropoffLatitude: String(dropoffLocation.latitude),
      dropoffLongitude: String(dropoffLocation.longitude),
      dropoffAddress: dropoffLocation.address ?? '',
    },
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

export default function GoToPickupScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<PickupParams>();
  const { height: windowHeight } = useWindowDimensions();

  const tripId = typeof params.tripId === 'string' ? params.tripId.trim() : '';
  const mapsApiKey = GOOGLE_MAPS_API_KEY?.trim() || '';

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
  const [isSubmittingArrival, setIsSubmittingArrival] = useState<boolean>(false);
  const [isSubmittingPickup, setIsSubmittingPickup] = useState<boolean>(false);
  const [isAwaitingArrivalConfirmation, setIsAwaitingArrivalConfirmation] = useState<boolean>(false);
  const [isMapFullscreen, setIsMapFullscreen] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>('');
  const [proofPhotos, setProofPhotos] = useState<LocalDocumentAsset[]>([]);
  const [locationMessage, setLocationMessage] = useState<string>('');
  const [socketError, setSocketError] = useState<string>('');
  const [submitError, setSubmitError] = useState<string>('');
  const [requestStatus, setRequestStatus] = useState<string | null>(null);
  const [translatedTextByKey, setTranslatedTextByKey] = useState<Record<string, string>>({});

  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const lastEmitLocationRef = useRef<GeoLocation | null>(null);
  const lastEmitAtRef = useRef<number>(0);
  const fakeLocationIndexRef = useRef<number>(0);

  const isTripValid = isValidTripId(tripId);
  const hasValidPickup = Boolean(pickupLocation && isValidPickupGeoLocation(pickupLocation));
  const hasValidDropoff = Boolean(dropoffLocation && isValidPickupGeoLocation(dropoffLocation));
  const isInvalidRoute = !isTripValid || !hasValidPickup || !hasValidDropoff;
  const isArrivedAtPickup = requestStatus === 'DRIVER_ARRIVED_PICKUP';
  const isPrimaryActionBusy =
    isLoadingLocation || isSubmittingArrival || isSubmittingPickup || isAwaitingArrivalConfirmation;

  const distanceMeters = useMemo(() => {
    if (!driverLocation || !pickupLocation || !isValidGeoLocation(pickupLocation)) {
      return null;
    }
    return calculateDistanceMeters(driverLocation, pickupLocation);
  }, [driverLocation, pickupLocation]);

  const tooFarFromPickup = useMemo(() => {
    if (!driverLocation || !pickupLocation) return false;
    return !canConfirmPickup(driverLocation, pickupLocation);
  }, [driverLocation, pickupLocation]);

  const canArriveNow = useMemo(() => {
    if (!driverLocation || !pickupLocation || !isValidGeoLocation(driverLocation)) {
      return false;
    }
    return canMarkArrived(driverLocation, pickupLocation);
  }, [driverLocation, pickupLocation]);

  const payloadValidationMessage = useMemo(() => {
    const payload: PickupItemRequest = {
      notes: notes.trim() || undefined,
      latitude: driverLocation?.latitude,
      longitude: driverLocation?.longitude,
    };
    return validatePickupItemRequest(payload);
  }, [driverLocation, notes]);

  const deliverRoute = useMemo(() => {
    if (!pickupLocation || !dropoffLocation) return null;
    return toDeliverRoute(tripId, pickupLocation, dropoffLocation);
  }, [dropoffLocation, pickupLocation, tripId]);

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
      if (active) {
        setTranslatedTextByKey(translations);
      }
    }).catch(() => {
      if (active) {
        setTranslatedTextByKey({});
      }
    });

    return () => {
      active = false;
    };
  }, [dropoffLocation?.address, i18n.language, pickupLocation?.address]);

  const refreshDriverLocation = useCallback(async (showLoader = false): Promise<GeoLocation | null> => {
    if (showLoader) {
      setIsRefreshingLocation(true);
    }

    setLocationMessage('');

    try {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocationMessage(t('Location permission denied. Please enable location permission for driver tracking.'));
        return null;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setLocationMessage(t('GPS is unavailable. Please enable location services.'));
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

      try {
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
      } catch (error) {
        setSocketError(error instanceof Error ? error.message : t('Socket connection failed.'));
      }

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
  }, [t, tripId]);

  useEffect(() => {
    let active = true;

    const setup = async (): Promise<(() => void) | void> => {
      if (isInvalidRoute || !pickupLocation || !dropoffLocation || !deliverRoute) {
        setIsLoadingLocation(false);
        return;
      }

      const validTripId = validateTripId(tripId);
      if (!validTripId) {
        setSubmitError(t('Invalid trip id.'));
        setIsLoadingLocation(false);
        return;
      }

      if (!accessToken) {
        setSubmitError(t('Missing authentication token. Please login again.'));
        setIsLoadingLocation(false);
        return;
      }

      try {
        const details = await getDriverAcceptedJobDetails(validTripId);
        if (!active) return;

        setRequestStatus(details.requestStatus);

        if (isTerminalRequestStatus(details.requestStatus)) {
          router.replace('/accepted-jobs');
          return;
        }

        if (isDeliveryPhaseRequestStatus(details.requestStatus)) {
          router.replace(deliverRoute);
          return;
        }

        if (
          ![
            'ACCEPTED',
            'DRIVER_ASSIGNED',
            'DRIVER_GOING_TO_PICKUP',
            'DRIVER_ARRIVED_PICKUP',
          ].includes(details.requestStatus)
        ) {
          router.replace({
            pathname: '/accepted-job-details',
            params: { requestId: validTripId },
          });
          return;
        }
      } catch (error) {
        if (!active) return;
        setSubmitError(error instanceof Error ? error.message : t('Failed to load trip status.'));
        setIsLoadingLocation(false);
        return;
      }

      let disconnectUnsub: (() => void) | null = null;
      let socketErrorUnsub: (() => void) | null = null;
      let arrivedUnsub: (() => void) | null = null;
      let tripStatusUnsub: (() => void) | null = null;
      let itemPickedUpUnsub: (() => void) | null = null;

      try {
        connectSocket(accessToken);
        joinTripRoom(validTripId);

        disconnectUnsub = onSocketDisconnect(() => {
          setSocketError(t('Socket disconnected. Reconnecting...'));
        });

        socketErrorUnsub = onSocketError((message) => {
          setSocketError(message || t('Socket connection failed.'));
        });

        arrivedUnsub = onDriverArrivedPickupConfirmed((payload) => {
          const validated = validateDriverArrivedPickupConfirmedPayload(payload);
          if (!validated || validated.tripId !== validTripId) return;
          setRequestStatus('DRIVER_ARRIVED_PICKUP');
          setIsAwaitingArrivalConfirmation(false);
          setSubmitError('');
          setSocketError('');
          setLocationMessage('');
        });

        tripStatusUnsub = onTripStatusUpdated((payload) => {
          if (payload.tripId !== validTripId) return;
          setRequestStatus(payload.status);
          if (payload.status === 'DRIVER_ARRIVED_PICKUP' || isDeliveryPhaseRequestStatus(payload.status)) {
            setIsAwaitingArrivalConfirmation(false);
          }
          if (isDeliveryPhaseRequestStatus(payload.status)) {
            router.replace(deliverRoute);
          }
        });

        itemPickedUpUnsub = onItemPickedUp((payload) => {
          if (payload.tripId !== validTripId) return;
          router.replace(deliverRoute);
        });
      } catch (error) {
        setSocketError(error instanceof Error ? error.message : t('Socket connection failed.'));
      }

      const permission = await Location.requestForegroundPermissionsAsync();
      if (!active) return;

      if (permission.status !== 'granted') {
        setLocationMessage(t('Location permission denied. Please enable location permission for driver tracking.'));
        setIsLoadingLocation(false);
        return;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!active) return;

      if (!servicesEnabled) {
        setLocationMessage(t('GPS is unavailable. Please enable location services.'));
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

            try {
              emitDriverLocationUpdate({
                tripId: validTripId,
                latitude: liveLocation.latitude,
                longitude: liveLocation.longitude,
                heading: typeof position.coords.heading === 'number' ? position.coords.heading : undefined,
                speed: typeof position.coords.speed === 'number' ? position.coords.speed : undefined,
                accuracy: typeof position.coords.accuracy === 'number' ? position.coords.accuracy : undefined,
              });
              lastEmitLocationRef.current = liveLocation;
              lastEmitAtRef.current = now;
            } catch (error) {
              setSocketError(error instanceof Error ? error.message : t('Socket connection failed.'));
            }
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
            ? error.message
            : t('Unable to get current location. Please verify GPS availability.'),
        );
      } finally {
        if (active) {
          setIsLoadingLocation(false);
        }
      }

      return () => {
        disconnectUnsub?.();
        socketErrorUnsub?.();
        arrivedUnsub?.();
        tripStatusUnsub?.();
        itemPickedUpUnsub?.();
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
      const validTripId = validateTripId(tripId);
      if (validTripId) {
        leaveTripRoom(validTripId);
      }
    };
  }, [accessToken, deliverRoute, dropoffLocation, isInvalidRoute, pickupLocation, refreshDriverLocation, router, t, tripId]);

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

  const onMarkArrived = async (): Promise<void> => {
    if (isSubmittingArrival || isSubmittingPickup || isAwaitingArrivalConfirmation) {
      return;
    }

    setSubmitError('');

    const validTripId = validateTripId(tripId);
    if (!validTripId) {
      setSubmitError(t('Invalid trip id.'));
      return;
    }

    if (!driverLocation || !isValidGeoLocation(driverLocation)) {
      setSubmitError(t('Current location is not ready.'));
      return;
    }

    if (!pickupLocation || !isValidGeoLocation(pickupLocation)) {
      setSubmitError(t('Pickup location is invalid.'));
      return;
    }

    if (!canMarkArrived(driverLocation, pickupLocation)) {
      setSubmitError(t('You are too far from pickup location. Move closer to continue.'));
      return;
    }

    setIsSubmittingArrival(true);
    setIsAwaitingArrivalConfirmation(true);
    try {
      emitDriverArrivedPickup({
        tripId: validTripId,
        latitude: driverLocation.latitude,
        longitude: driverLocation.longitude,
      });
      setLocationMessage(t('Arrival confirmation sent. Waiting for trip status update.'));
    } catch (error) {
      setIsAwaitingArrivalConfirmation(false);
      setSubmitError(error instanceof Error ? error.message : t('Failed to send arrival confirmation.'));
    } finally {
      setIsSubmittingArrival(false);
    }
  };

  const onConfirmPickup = async (): Promise<void> => {
    if (isSubmittingPickup || isSubmittingArrival || isAwaitingArrivalConfirmation) {
      return;
    }

    setIsSubmittingPickup(true);
    setSubmitError('');

    try {
      if (isInvalidRoute || !pickupLocation || !dropoffLocation || !deliverRoute) {
        setSubmitError(t('Invalid trip data. Please reopen this trip from Accepted Jobs.'));
        return;
      }

      if (!isArrivedAtPickup) {
        setSubmitError(t('Arrive at pickup first before submitting pickup confirmation.'));
        return;
      }

      if (proofPhotos.length === 0) {
        setSubmitError(t('At least one pickup proof photo is required.'));
        return;
      }

      let latestLocation = driverLocation;

      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (permission.status === 'granted') {
          const freshLocation = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });

          const normalizedLocation: GeoLocation = {
            latitude: freshLocation.coords.latitude,
            longitude: freshLocation.coords.longitude,
          };

          if (isValidGeoLocation(normalizedLocation)) {
            latestLocation = normalizedLocation;
            setDriverLocation(normalizedLocation);
          }
        }
      } catch {
        // Use latest known location.
      }

      const canSendLocation =
        latestLocation && pickupLocation
          ? canConfirmPickup(latestLocation, pickupLocation)
          : false;

      const payload: PickupItemRequest = {
        notes: notes.trim() || undefined,
        proofPhotos: proofPhotos.length ? proofPhotos : undefined,
        latitude: canSendLocation ? latestLocation?.latitude : undefined,
        longitude: canSendLocation ? latestLocation?.longitude : undefined,
      };

      if (latestLocation && !canSendLocation) {
        setLocationMessage(
          t('GPS shows you are farther than {{distance}}m from pickup. Sending confirmation without coordinates.', {
            distance: PICKUP_CONFIRM_RADIUS_METERS,
          }),
        );
      }

      const validationError = validatePickupItemRequest(payload);
      if (validationError) {
        setSubmitError(validationError);
        return;
      }

      const response = await pickupItem(tripId, payload);
      if (!isDeliveryPhaseRequestStatus(response.status)) {
        setSubmitError(t('Unexpected pickup status returned by backend.'));
        return;
      }

      router.replace(deliverRoute);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : t('Failed to confirm pickup item.'));
    } finally {
      setIsSubmittingPickup(false);
    }
  };

  const onSendFakeLocationPress = (): void => {
    if (!pickupLocation) return;

    const nextLocation =
      TEST_FAKE_LOCATIONS[fakeLocationIndexRef.current] ??
      { latitude: pickupLocation.latitude, longitude: pickupLocation.longitude };

    setDriverLocation(nextLocation);
    setIsLoadingLocation(false);

    try {
      emitDriverLocationUpdate({
        tripId,
        latitude: nextLocation.latitude,
        longitude: nextLocation.longitude,
      });
      lastEmitLocationRef.current = nextLocation;
      lastEmitAtRef.current = Date.now();
      fakeLocationIndexRef.current = (fakeLocationIndexRef.current + 1) % TEST_FAKE_LOCATIONS.length;
    } catch (error) {
      setSocketError(error instanceof Error ? error.message : t('Socket connection failed.'));
    }
  };

  if (isInvalidRoute || !pickupLocation || !dropoffLocation) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <Text style={styles.errorText}>{t('Invalid trip data. Please reopen this trip from Accepted Jobs.')}</Text>
      </SafeAreaView>
    );
  }

  const actionDisabled =
    isPrimaryActionBusy ||
    isRefreshingLocation ||
    !driverLocation ||
    Boolean(payloadValidationMessage) ||
    (!isArrivedAtPickup && !canArriveNow);

  const primaryActionLabel = isArrivedAtPickup
    ? isSubmittingPickup
      ? t('Submitting Pickup...')
      : t('Submit Pickup')
    : isAwaitingArrivalConfirmation
      ? t('Marking Arrival...')
      : isSubmittingArrival
        ? t('Sending Arrival...')
        : t('Mark Arrived at Pickup');

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: isArrivedAtPickup ? t('Pickup Item') : t('Go to Pickup Location') }} />
      <View style={[styles.mapContainer, { height: isMapFullscreen ? windowHeight : windowHeight * 0.5 }]}>
        {mapsApiKey && isNativeMapRuntimeAvailable && NativeMapView && NativeMarker ? (
          <NativeMapView
            provider={PROVIDER_GOOGLE}
            style={styles.map}
            initialRegion={{
              latitude: driverLocation?.latitude ?? pickupLocation.latitude,
              longitude: driverLocation?.longitude ?? pickupLocation.longitude,
              latitudeDelta: 0.03,
              longitudeDelta: 0.03,
            }}
          >
            {driverLocation ? (
              <NativeMarker coordinate={driverLocation} title={t('Driver')} anchor={{ x: 0.5, y: 0.5 }}>
                <Text style={styles.driverMarkerIcon}>🚗</Text>
              </NativeMarker>
            ) : null}
            <NativeMarker coordinate={pickupLocation} title={t('Pickup')} />
            <NativeMarker coordinate={dropoffLocation} title={t('Dropoff')} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={styles.destinationXMarker}>
                <Text style={styles.destinationXText}>X</Text>
              </View>
            </NativeMarker>
            {driverLocation && NativeMapViewDirections ? (
              <NativeMapViewDirections
                origin={driverLocation}
                destination={pickupLocation}
                apikey={mapsApiKey}
                strokeWidth={4}
                strokeColor="#F97316"
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
        <Text style={styles.title}>{isArrivedAtPickup ? t('Pickup Item') : t('Go to Pickup Location')}</Text>
        <Text style={styles.addressText}>
          {translatedTextByKey.pickupAddress || formatDisplayAddress(pickupLocation.address, 'Pickup address unavailable', t)}
        </Text>
        <Text style={styles.subText}>{t('Trip ID')}: {tripId}</Text>
        <Text style={styles.subText}>
          {t('Dropoff')}: {translatedTextByKey.dropoffAddress || formatDisplayAddress(dropoffLocation.address, 'Dropoff address unavailable', t)}
        </Text>
        <DriverChatButton transportRequestId={tripId} requestStatus={requestStatus} />
        <Text style={styles.distanceText}>
          {t('Distance to pickup')}:{' '}
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

        {!isArrivedAtPickup ? (
          <Text style={styles.infoText}>
            {t('Move within 100m of the pickup point to mark arrival, then submit the pickup from this same screen.')}
          </Text>
        ) : (
          <Text style={styles.infoText}>
            {t('You are marked arrived. Add optional notes, attach proof photos, then submit pickup.')}
          </Text>
        )}

        {tooFarFromPickup && isArrivedAtPickup ? (
          <Text style={styles.warningText}>
            {t('GPS distance is above {{distance}}m. Pickup can still be submitted without coordinates.', {
              distance: PICKUP_CONFIRM_RADIUS_METERS,
            })}
          </Text>
        ) : null}
        {locationMessage ? <Text style={styles.infoText}>{locationMessage}</Text> : null}
        {socketError ? <Text style={styles.warningText}>{socketError}</Text> : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('Pickup Notes (Optional)')}</Text>
          <TextInput
            style={styles.textArea}
            multiline
            numberOfLines={4}
            placeholder={t('Package received from customer.')}
            value={notes}
            onChangeText={setNotes}
            maxLength={500}
          />
          <Text style={styles.hintText}>{notes.trim().length}/500</Text>

          <Text style={styles.sectionTitle}>{t('Proof Photos')}</Text>
          <Text style={styles.metaText}>
            {t('Select multiple images from the gallery or capture more photos with the camera. Max {{count}}.', {
              count: MAX_PROOF_PHOTOS,
            })}
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
        style={[
          styles.floatingSubmitButton,
          actionDisabled && styles.disabledFloatingSubmitButton,
          isMapFullscreen && styles.hidden,
        ]}
        disabled={actionDisabled}
        onPress={() => void (isArrivedAtPickup ? onConfirmPickup() : onMarkArrived())}
        accessibilityLabel={primaryActionLabel}
      >
        {isPrimaryActionBusy ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
        <Text style={styles.floatingSubmitButtonText}>{primaryActionLabel}</Text>
        {!isPrimaryActionBusy ? (
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
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F3F4F6',
  },
  mapContainer: {
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  centeredMapState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#D1D5DB',
  },
  mapToggleButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.72)',
  },
  bottomScroll: {
    flex: 1,
  },
  bottomCard: {
    gap: 14,
    padding: 20,
    paddingBottom: 120,
  },
  hidden: {
    display: 'none',
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
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
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
    textAlign: 'right',
    fontSize: 12,
    color: '#6B7280',
  },
  metaText: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
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
  secondaryActionButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
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
  disabledFloatingSubmitButton: {
    backgroundColor: '#94A3B8',
  },
  testButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 12,
  },
  testButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
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
});
