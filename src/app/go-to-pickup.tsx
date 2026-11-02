import { NavigationCameraToggle } from '@/components/navigation-camera-toggle';
import { useNavigationCamera, type NavigationLocation } from '@/hooks/use-navigation-camera';
import { MapLocationMarker, MAP_COLORS } from '@/components/map-location-marker';
import {
  startBackgroundTripTracking,
  stopBackgroundTripTracking,
} from '@/location/background-trip-tracking';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Linking from 'expo-linking';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
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
import { GOOGLE_MAPS_API_KEY } from '@/config/maps';
import { useAuth } from '@/context/auth-context';
import { getDriverAcceptedJobDetails, startReservedPickup } from '@/lib/api';
import { isDeliveryPhaseRequestStatus, isTerminalRequestStatus } from '@/lib/request-status';
import { isSupportedLanguage, type AppLanguage } from '@/localization/languages';
import {
  connectSocket,
  emitDriverArrivedPickupWithAck,
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
  const colors = useDriverColors();
  const styles = useMemo(() => createTripScreenStyles(colors), [colors]);
  const [showPickupForm, setShowPickupForm] = useState(true);
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

  const [driverLocation, setDriverLocation] = useState<NavigationLocation | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState<boolean>(true);
  const [isRefreshingLocation, setIsRefreshingLocation] = useState<boolean>(false);
  const [isStartingTrip, setIsStartingTrip] = useState<boolean>(false);
  const [isSubmittingPickup, setIsSubmittingPickup] = useState<boolean>(false);
  const [isMapFullscreen, setIsMapFullscreen] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>('');
  const [proofPhotos, setProofPhotos] = useState<LocalDocumentAsset[]>([]);
  const [locationMessage, setLocationMessage] = useState<string>('');
  const [socketError, setSocketError] = useState<string>('');
  const [routeError, setRouteError] = useState<string>('');
  const [navigationError, setNavigationError] = useState('');
  const [isOpeningNavigation, setIsOpeningNavigation] = useState(false);
  const [submitError, setSubmitError] = useState<string>('');
  const [requestStatus, setRequestStatus] = useState<string | null>(null);
  const [translatedTextByKey, setTranslatedTextByKey] = useState<Record<string, string>>({});

  const mapRef = useRef<any>(null);
  const { isNavigationView, isNavigationEnabled, toggleNavigationView, followDriver } = useNavigationCamera(mapRef, driverLocation);
  const mapReadyRef = useRef(false);
  const routeCoordinatesRef = useRef<GeoLocation[]>([]);
  const hasFitPickupRouteRef = useRef(false);
  const hasFitDriverLocationRef = useRef(false);

  useEffect(() => {
    routeCoordinatesRef.current = [];
    hasFitPickupRouteRef.current = false;
    hasFitDriverLocationRef.current = false;
  }, [tripId, pickupLocation?.latitude, pickupLocation?.longitude]);

  const fitPickupRoute = useCallback(() => {
    if (!mapReadyRef.current || isNavigationEnabled() || !pickupLocation) return;
    // Frame the actual pickup even before directions arrive (or if routing fails).
    // Road-snapped route endpoints may differ from the customer's pickup pin.
    const seen = new Set<string>();
    const coordinates = [
      ...routeCoordinatesRef.current,
      ...(driverLocation ? [driverLocation] : []),
      pickupLocation,
    ].filter(point => {
      const key = `${point.latitude},${point.longitude}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    mapRef.current?.fitToCoordinates(coordinates, {
      // Leave room for the 44-point pickup pin below the floating top controls.
      edgePadding: { top: 112, right: 40, bottom: 80, left: 40 },
      animated: false,
    });
    hasFitPickupRouteRef.current = routeCoordinatesRef.current.length > 0;
    hasFitDriverLocationRef.current = Boolean(driverLocation);
  }, [driverLocation, isNavigationEnabled, pickupLocation]);

  useEffect(() => {
    // GPS can finish after the map becomes ready. Fit its first usable fix once,
    // without moving the overview camera on every subsequent location update.
    if (driverLocation && !hasFitDriverLocationRef.current) fitPickupRoute();
  }, [driverLocation, fitPickupRoute]);

  const onPickupRouteReady = useCallback((coordinates: GeoLocation[]) => {
    setRouteError('');
    routeCoordinatesRef.current = coordinates;
    if (!hasFitPickupRouteRef.current) fitPickupRoute();
  }, [fitPickupRoute, setRouteError]);

  const onNavigateToPickup = async () => {
    if (!pickupLocation || isOpeningNavigation) return;
    setNavigationError('');
    setIsOpeningNavigation(true);
    try {
      const destination = encodeURIComponent(`${pickupLocation.latitude},${pickupLocation.longitude}`);
      await Linking.openURL(
        `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving&dir_action=navigate`,
      );
    } catch {
      setNavigationError(t('pickupUi.navigationFailed'));
    } finally {
      setIsOpeningNavigation(false);
    }
  };

  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const lastEmitLocationRef = useRef<GeoLocation | null>(null);
  const lastEmitAtRef = useRef<number>(0);
  const arrivalConfirmationRef = useRef<(() => void) | null>(null);

  const isTripValid = isValidTripId(tripId);
  const hasValidPickup = Boolean(pickupLocation && isValidPickupGeoLocation(pickupLocation));
  const hasValidDropoff = Boolean(dropoffLocation && isValidPickupGeoLocation(dropoffLocation));
  const isInvalidRoute = !isTripValid || !hasValidPickup || !hasValidDropoff;
  const isArrivedAtPickup = requestStatus === 'DRIVER_ARRIVED_PICKUP';
  const isPickupFormExpanded = showPickupForm;
  const isPrimaryActionBusy =
    isLoadingLocation || isStartingTrip || isSubmittingPickup;

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
        if (active) {
          setTranslatedTextByKey(translations);
        }
      })
      .catch(() => {
        if (active) {
          setTranslatedTextByKey({});
        }
      });

    return () => {
      active = false;
    };
  }, [dropoffLocation?.address, i18n.language, pickupLocation?.address]);

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
            t('Location permission denied. Please enable location permission for driver tracking.'),
          );
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

        const currentLocation: NavigationLocation = {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
          heading: current.coords.heading,
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
            heading:
              typeof current.coords.heading === 'number' ? current.coords.heading : undefined,
            speed: typeof current.coords.speed === 'number' ? current.coords.speed : undefined,
            accuracy:
              typeof current.coords.accuracy === 'number' ? current.coords.accuracy : undefined,
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
    },
    [
      setDriverLocation,
      setIsRefreshingLocation,
      setLocationMessage,
      setSocketError,
      t,
      tripId,
    ],
  );

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
          void stopBackgroundTripTracking(validTripId).catch(() => undefined);
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
          arrivalConfirmationRef.current?.();
          setSubmitError('');
          setSocketError('');
          setLocationMessage('');
        });

        tripStatusUnsub = onTripStatusUpdated((payload) => {
          if (payload.tripId !== validTripId) return;
          setRequestStatus(payload.status);
          if (payload.status === 'DRIVER_ARRIVED_PICKUP') {
            arrivalConfirmationRef.current?.();
          }
          if (isTerminalRequestStatus(payload.status))
            void stopBackgroundTripTracking(validTripId).catch(() => undefined);
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
        setLocationMessage(
          t('Location permission denied. Please enable location permission for driver tracking.'),
        );
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
            const liveLocation: NavigationLocation = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              heading: position.coords.heading,
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

            try {
              emitDriverLocationUpdate({
                tripId: validTripId,
                latitude: liveLocation.latitude,
                longitude: liveLocation.longitude,
                heading:
                  typeof position.coords.heading === 'number' ? position.coords.heading : undefined,
                speed:
                  typeof position.coords.speed === 'number' ? position.coords.speed : undefined,
                accuracy:
                  typeof position.coords.accuracy === 'number'
                    ? position.coords.accuracy
                    : undefined,
              });
              lastEmitLocationRef.current = liveLocation;
              lastEmitAtRef.current = now;
            } catch (error) {
              setSocketError(
                error instanceof Error ? error.message : t('Socket connection failed.'),
              );
            }
          },
        );

        if (!active) {
          subscription.remove();
          return;
        }

        locationSubscriptionRef.current = subscription;
        void startBackgroundTripTracking(validTripId, () => active)
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
  }, [
    accessToken,
    deliverRoute,
    dropoffLocation,
    isInvalidRoute,
    pickupLocation,
    refreshDriverLocation,
    router,
    t,
    tripId,
  ]);

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

  const onStartTrip = async (): Promise<void> => {
    if (isStartingTrip || isSubmittingPickup) {
      return;
    }

    setSubmitError('');

    const validTripId = validateTripId(tripId);
    if (!validTripId) {
      setSubmitError(t('Invalid trip id.'));
      return;
    }

    setIsStartingTrip(true);
    try {
      const started = await startReservedPickup(validTripId);
      setRequestStatus(started.status);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : t('Unable to start pickup.'));
    } finally {
      setIsStartingTrip(false);
    }
  };

  const onConfirmPickup = async (): Promise<void> => {
    if (isSubmittingPickup || isStartingTrip) {
      return;
    }

    setIsSubmittingPickup(true);
    setSubmitError('');

    try {
      if (isInvalidRoute || !pickupLocation || !dropoffLocation || !deliverRoute) {
        setSubmitError(t('Invalid trip data. Please reopen this trip from Accepted Jobs.'));
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

      if (!latestLocation || !isValidGeoLocation(latestLocation)) {
        setSubmitError(t('Current location is required to confirm pickup.'));
        return;
      }
      if (!canConfirmPickup(latestLocation, pickupLocation)) {
        setSubmitError(t('You are too far from pickup location. Move closer to continue.'));
        return;
      }

      const payload: PickupItemRequest = {
        notes: notes.trim() || undefined,
        proofPhotos: proofPhotos.length ? proofPhotos : undefined,
        latitude: latestLocation.latitude,
        longitude: latestLocation.longitude,
      };

      const validationError = validatePickupItemRequest(payload);
      if (validationError) {
        setSubmitError(validationError);
        return;
      }

      if (!isArrivedAtPickup) {
        if (!latestLocation || !isValidGeoLocation(latestLocation)) {
          setSubmitError(t('Current location is not ready.'));
          return;
        }

        if (!canMarkArrived(latestLocation, pickupLocation)) {
          setSubmitError(t('You are too far from pickup location. Move closer to continue.'));
          return;
        }

        let arrivalError: unknown;
        const arrivalConfirmed = new Promise<void>((resolve) => {
          arrivalConfirmationRef.current = resolve;
        });
        try {
          await Promise.race([
            arrivalConfirmed,
            emitDriverArrivedPickupWithAck({
              tripId,
              latitude: latestLocation.latitude,
              longitude: latestLocation.longitude,
            }),
          ]);
        } catch (error) {
          arrivalError = error;
        } finally {
          arrivalConfirmationRef.current = null;
        }

        // Confirm persisted status, including when the socket acknowledgement was lost.
        const details = await getDriverAcceptedJobDetails(tripId);
        setRequestStatus(details.requestStatus);
        if (isDeliveryPhaseRequestStatus(details.requestStatus)) {
          router.replace(deliverRoute);
          return;
        }
        if (details.requestStatus !== 'DRIVER_ARRIVED_PICKUP') {
          throw arrivalError instanceof Error
            ? arrivalError
            : new Error(t('Failed to send arrival confirmation.'));
        }
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

  if (isInvalidRoute || !pickupLocation || !dropoffLocation) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <Stack.Screen options={{ headerShown: false }} />
        <DriverCard style={{ width: '100%', maxWidth: driverLayout.maxWidth }}>
          <DriverNotice
            tone="warning"
            title={t('pickupUi.tripUnavailable')}
            description={t('Invalid trip data. Please reopen this trip from Accepted Jobs.')}
          />
          <DriverButton
            label={t('Accepted Jobs')}
            onPress={() => router.replace('/accepted-jobs')}
          />
        </DriverCard>
      </SafeAreaView>
    );
  }

  const actionDisabled =
    isPrimaryActionBusy ||
    isRefreshingLocation ||
    !driverLocation ||
    Boolean(payloadValidationMessage) ||
    (isArrivedAtPickup && tooFarFromPickup) ||
    (!isArrivedAtPickup && requestStatus !== 'DRIVER_ASSIGNED' && !canArriveNow);

  const primaryActionLabel =
    requestStatus === 'DRIVER_ASSIGNED'
      ? t('pickupUi.startTrip')
      : t('pickupUi.confirmPickup');

  return (
    <SafeAreaView style={[styles.container, { direction: i18n.dir() }]} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        style={styles.keyboardArea}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {!isMapFullscreen ? (
          <DriverPageHeader
            title={t('pickupUi.pickup')}
            subtitle={t('pickupUi.tripReference', { id: tripId.slice(-8).toUpperCase() })}
            backLabel={t('Back')}
            rtl={i18n.dir() === 'rtl'}
            onBack={() => (router.canGoBack() ? router.back() : router.replace('/accepted-jobs'))}
            trailing={
              <DriverStatus
                label={
                  isArrivedAtPickup
                    ? t('pickupUi.atPickup')
                    : requestStatus === 'DRIVER_ASSIGNED'
                      ? t('pickupUi.ready')
                      : t('pickupUi.enRoute')
                }
                tone={isArrivedAtPickup ? 'success' : 'neutral'}
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
              <TripProgress />
              <DriverText variant="display">
                {isArrivedAtPickup
                  ? t('pickupUi.confirmPickupTitle')
                  : requestStatus === 'DRIVER_ASSIGNED'
                    ? t('pickupUi.readyTitle')
                    : t('pickupUi.headingToPickup')}
              </DriverText>
              {isArrivedAtPickup ? (
                <DriverText secondary>{t('pickupUi.confirmPickupBody')}</DriverText>
              ) : null}
            </View>
          ) : null}
          <View
            style={[
              styles.mapCard,
              {
                height: isMapFullscreen
                  ? windowHeight - 160
                  : Math.max(220, Math.min(300, windowHeight * 0.3)),
              },
            ]}
          >
            {mapsApiKey && isNativeMapRuntimeAvailable && NativeMapView && NativeMarker ? (
              <NativeMapView
                ref={mapRef}
                onMapReady={() => {
                  mapReadyRef.current = true;
                  if (isNavigationEnabled()) followDriver(0);
                  else fitPickupRoute();
                }}
                onLayout={fitPickupRoute}
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
                    origin={driverLocation}
                    destination={pickupLocation}
                    apikey={mapsApiKey}
                    strokeWidth={5}
                    strokeColor={MAP_COLORS.route}
                    onError={setRouteError}
                    onReady={onPickupRouteReady}
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
            <View style={styles.mapBottomControls} pointerEvents="box-none">
              <DriverButton
                style={styles.mapRefreshButton}
                variant="secondary"
                label={
                  isRefreshingLocation ? t('pickupUi.locating') : t('pickupUi.refreshLocation')
                }
                loading={isRefreshingLocation}
                icon={{ ios: 'location', android: 'my_location', web: 'my_location' }}
                onPress={() => void refreshDriverLocation(true)}
              />
              {mapsApiKey && isNativeMapRuntimeAvailable ? (
                <NavigationCameraToggle
                  active={isNavigationView}
                  disabled={!driverLocation}
                  onPress={toggleNavigationView}
                  style={styles.navigationCameraButton}
                />
              ) : null}
            </View>
          </View>
          <DriverButton
            variant="secondary"
            label={t('pickupUi.navigateToPickup')}
            icon={{ ios: 'location.north.fill', android: 'navigation', web: 'navigation' }}
            loading={isOpeningNavigation}
            onPress={() => void onNavigateToPickup()}
          />
          {navigationError ? (
            <DriverNotice tone="warning" title={t('pickupUi.navigationUnavailable')} description={navigationError} />
          ) : null}
          {!isMapFullscreen ? (
            <>
              <TripRouteCard
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
              {routeError ? (
                <DriverNotice
                  tone="warning"
                  title={t('pickupUi.routeUnavailable')}
                  description={t('pickupUi.routeUnavailableBody')}
                />
              ) : null}
              {socketError ? (
                <DriverNotice
                  tone="warning"
                  title={t('pickupUi.connectionInterrupted')}
                  description={t('pickupUi.connectionInterruptedBody')}
                />
              ) : null}
              {tooFarFromPickup && isArrivedAtPickup ? (
                <DriverNotice
                  tone="warning"
                  title={t('pickupUi.locationAccuracy')}
                  description={t(
                    'You must be within {{distance}}m of pickup to confirm pickup.',
                    { distance: PICKUP_CONFIRM_RADIUS_METERS },
                  )}
                />
              ) : null}
              <DriverChatButton
                transportRequestId={tripId}
                requestStatus={requestStatus}
                showUnavailableState
              />
              <DriverCard>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('pickupUi.pickupDetails')}
                  accessibilityState={{ expanded: isPickupFormExpanded }}
                  onPress={() => setShowPickupForm(!isPickupFormExpanded)}
                  style={({ pressed }) => [styles.formHeader, pressed && styles.pressed]}
                >
                  <View style={styles.formHeading}>
                    <DriverIcon
                      name={{ ios: 'shippingbox', android: 'inventory_2', web: 'inventory_2' }}
                      color={colors.text}
                      size={22}
                    />
                    <View style={styles.headerCopy}>
                      <DriverText variant="section">{t('pickupUi.pickupDetails')}</DriverText>
                      <DriverText variant="caption" secondary>
                        {t('pickupUi.notesAndPhotos')}
                      </DriverText>
                    </View>
                  </View>
                  <DriverIcon
                    name={{
                      ios: isPickupFormExpanded ? 'chevron.up' : 'chevron.down',
                      android: isPickupFormExpanded ? 'expand_less' : 'expand_more',
                      web: isPickupFormExpanded ? 'expand_less' : 'expand_more',
                    }}
                  />
                </Pressable>
                {isPickupFormExpanded ? (
                  <View style={styles.formBody}>
                    <DriverText variant="label">{t('Pickup Notes (Optional)')}</DriverText>
                    <TextInput
                      style={styles.textArea}
                      multiline
                      numberOfLines={4}
                      placeholder={t('Package received from customer.')}
                      placeholderTextColor={colors.textSecondary}
                      accessibilityLabel={t('Pickup Notes (Optional)')}
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
                          {t('pickupUi.photoHint', { count: MAX_PROOF_PHOTOS })}
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
                {isPrimaryActionBusy
                  ? t('pickupUi.updatingTrip')
                  : !driverLocation
                    ? t('pickupUi.locationRequired')
                    : requestStatus === 'DRIVER_ASSIGNED'
                      ? t('pickupUi.startHint')
                      : !isArrivedAtPickup && !canArriveNow
                        ? t('You are too far from pickup location. Move closer to continue.')
                        : t('pickupUi.readyToConfirm')}
              </DriverText>
              <DriverButton
                label={primaryActionLabel}
                disabled={actionDisabled}
                loading={isPrimaryActionBusy}
                icon={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }}
                onPress={() =>
                  void (requestStatus === 'DRIVER_ASSIGNED' ? onStartTrip() : onConfirmPickup())
                }
              />
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
