import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  NativeMapView,
  NativeMapViewDirections,
  NativeMarker,
  PROVIDER_GOOGLE,
  isNativeMapRuntimeAvailable,
} from '@/components/native-maps';
import { getDriverAcceptedJobDetails } from '@/lib/api';
import { emitDriverLocationUpdate, onItemDelivered, onTripStatusUpdated } from '@/services/socketService';
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

export default function DeliverItemScreen() {
  const router = useRouter();
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
  const [isStartingDelivery, setIsStartingDelivery] = useState<boolean>(true);
  const [notes, setNotes] = useState<string>('');
  const [proofPhotos, setProofPhotos] = useState<LocalDocumentAsset[]>([]);
  const [locationMessage, setLocationMessage] = useState<string>('');
  const [submitError, setSubmitError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [routeBlockedMessage, setRouteBlockedMessage] = useState<string>('');

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

    const setup = async (): Promise<(() => void) | void> => {
      if (isInvalidRoute) {
        setIsLoadingLocation(false);
        setIsStartingDelivery(false);
        return;
      }

      try {
        await startDelivery(tripId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to start delivery.';
        const normalizedMessage = message.toLowerCase();
        if (
          normalizedMessage.includes('trip status must be item_picked_up before starting delivery') ||
          normalizedMessage.includes('pickup must be confirmed')
        ) {
          try {
            const details = await getDriverAcceptedJobDetails(tripId);
            if (details.requestStatus !== 'DRIVER_GOING_TO_DROPOFF') {
              setRouteBlockedMessage('Pickup must be confirmed and saved before opening delivery.');
              setIsStartingDelivery(false);
              setIsLoadingLocation(false);
              return;
            }
          } catch {
            setRouteBlockedMessage('Pickup must be confirmed and saved before opening delivery.');
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
        setLocationMessage('Location permission denied. Enable location to continue delivery confirmation.');
        setIsLoadingLocation(false);
        return;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!active) return;
      if (!servicesEnabled) {
        setLocationMessage('GPS unavailable. Please enable location services.');
        setIsLoadingLocation(false);
        return;
      }

      try {
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Highest,
        });
        if (!active) return;

        const currentLocation: GeoLocation = {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
        };
        if (isValidGeoLocation(currentLocation)) {
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
        }

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
            ? error.message
            : 'Unable to get current location. Please verify GPS availability.',
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
  }, [isInvalidRoute, router, tripId]);

  // Auto-fit map to show both driver and dropoff when driver location first arrives
  useEffect(() => {
    if (!driverLocation || !dropoffLocation || hasFittedToCoordinatesRef.current) return;
    hasFittedToCoordinatesRef.current = true;
    const timer = setTimeout(() => {
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
      setSubmitError('Media library permission is required to select proof photos.');
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
      setSubmitError('Camera permission is required to take proof photos.');
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
    setSubmitError('');
    if (isInvalidRoute || !dropoffLocation) {
      setSubmitError('Invalid trip data. Please reopen this trip from Accepted Jobs.');
      return;
    }
    if (proofPhotos.length === 0) {
      setSubmitError('At least one delivery proof photo is required.');
      return;
    }
    if (!driverLocation || !isValidGeoLocation(driverLocation)) {
      setSubmitError('Current location is required to confirm delivery.');
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
      setSubmitError('You are too far from dropoff location. Move closer to continue.');
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

    setIsSubmitting(true);
    try {
      const response = await deliverItem(tripId, payload);
      router.replace(buildCompletedRoute(tripId, response.deliveredAt));
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to confirm delivery.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isInvalidRoute || !pickupLocation || !dropoffLocation) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <Text style={styles.errorText}>Invalid trip data. Please reopen this trip from Accepted Jobs.</Text>
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
              pathname: '/pickup-item',
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
          <Text style={styles.actionButtonText}>Go To Pickup Confirmation</Text>
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
      <View style={styles.mapContainer}>
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
              <NativeMarker coordinate={driverLocation} title="Driver" anchor={{ x: 0.5, y: 0.5 }}>
                <Text style={styles.driverMarkerIcon}>🚗</Text>
              </NativeMarker>
            ) : null}
            <NativeMarker coordinate={dropoffLocation} title="Dropoff" anchor={{ x: 0.5, y: 0.5 }}>
              <View style={styles.destinationXMarker}>
                <Text style={styles.destinationXText}>X</Text>
              </View>
            </NativeMarker>
            {driverLocation && NativeMapViewDirections ? (
              <NativeMapViewDirections
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
              Google Maps key missing. Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY to enable map preview.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.bottomCard}>
        <Text style={styles.title}>Deliver Item</Text>
        <Text style={styles.addressText}>{dropoffLocation.address || 'Dropoff address unavailable'}</Text>
        <Text style={styles.subText}>Trip ID: {tripId}</Text>
        <Text style={styles.subText}>Pickup: {pickupLocation.address || 'Pickup address unavailable'}</Text>
        <Text style={styles.distanceText}>
          Distance remaining:{' '}
          {distanceMeters !== null ? `${(distanceMeters / 1000).toFixed(2)} km` : '--'}
        </Text>

        <Text style={styles.sectionTitle}>Delivery Notes (Optional)</Text>
        <TextInput
          style={styles.textArea}
          placeholder="Package delivered to recipient."
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
          maxLength={500}
        />
        <Text style={styles.hintText}>{notes.trim().length}/500</Text>
        <Text style={styles.subText}>Proof Photos</Text>
        <Text style={styles.helperText}>
          Select multiple images from the gallery or capture more photos with the camera. Max {MAX_PROOF_PHOTOS}.
        </Text>
        {proofPhotos.length > 0 ? (
          <View style={styles.proofGrid}>
            {proofPhotos.map((photo, index) => (
              <View key={`${photo.uri}-${index}`} style={styles.proofItem}>
                <Image source={{ uri: photo.uri }} style={styles.proofPreview} resizeMode="cover" />
                <Text style={styles.helperText} numberOfLines={1}>
                  {photo.fileName?.trim() || `Proof ${index + 1}`}
                </Text>
                <Pressable
                  style={styles.removeProofButton}
                  onPress={() =>
                    setProofPhotos((current) => current.filter((_, currentIndex) => currentIndex !== index))
                  }
                >
                  <Text style={styles.removeProofButtonText}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.uploadActions}>
          <Pressable
            style={[styles.uploadButton, proofPhotos.length >= MAX_PROOF_PHOTOS && styles.disabledUploadButton]}
            onPress={() => void onSelectProofPhotos()}
            disabled={proofPhotos.length >= MAX_PROOF_PHOTOS}
          >
            <Text style={styles.uploadButtonText}>Choose Images</Text>
          </Pressable>
          <Pressable
            style={[styles.uploadButton, proofPhotos.length >= MAX_PROOF_PHOTOS && styles.disabledUploadButton]}
            onPress={() => void onTakeProofPhoto()}
            disabled={proofPhotos.length >= MAX_PROOF_PHOTOS}
          >
            <Text style={styles.uploadButtonText}>Take Photo</Text>
          </Pressable>
          {proofPhotos.length > 0 ? (
            <Pressable style={styles.clearButton} onPress={() => setProofPhotos([])}>
              <Text style={styles.clearButtonText}>Clear All</Text>
            </Pressable>
          ) : null}
        </View>

        {isStartingDelivery ? (
          <View style={styles.row}>
            <ActivityIndicator size="small" color="#2563EB" />
            <Text style={styles.helperText}>Starting delivery...</Text>
          </View>
        ) : null}
        {isLoadingLocation ? <Text style={styles.helperText}>Getting location...</Text> : null}
        {locationMessage ? <Text style={styles.warningText}>{locationMessage}</Text> : null}
        {tooFarFromDropoff && distanceMeters !== null ? (
          <Text style={styles.warningText}>
            Too far from dropoff. Move within {DELIVER_CONFIRM_RADIUS_METERS}m. Current: {distanceMeters.toFixed(0)}m
          </Text>
        ) : null}
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
          <Text style={styles.secondaryActionButtonText}>Additional Expenses</Text>
        </Pressable>

        <Pressable
          style={[styles.actionButton, actionDisabled && styles.disabledButton]}
          disabled={actionDisabled}
          onPress={onConfirmDelivery}
        >
          <Text style={styles.actionButtonText}>
            {isLoadingLocation
              ? 'Getting location...'
              : tooFarFromDropoff
                ? 'Too far from dropoff'
                : isSubmitting
                  ? 'Confirming delivery...'
                  : 'Confirm Delivery'}
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
  mapContainer: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  centeredMapState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#F8FAFC',
  },
  bottomCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  addressText: {
    color: '#334155',
    fontSize: 14,
  },
  subText: {
    color: '#475569',
    fontSize: 13,
  },
  distanceText: {
    color: '#0F172A',
    fontWeight: '600',
    fontSize: 14,
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '700',
  },
  textArea: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
    textAlignVertical: 'top',
  },
  hintText: {
    color: '#64748B',
    fontSize: 12,
  },
  proofCard: {
    gap: 8,
  },
  proofGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  proofItem: {
    width: '48%',
    gap: 6,
  },
  proofPreview: {
    width: '100%',
    height: 120,
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
  },
  uploadActions: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  uploadButton: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledUploadButton: {
    backgroundColor: '#94A3B8',
  },
  uploadButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  clearButton: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  clearButtonText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
  },
  removeProofButton: {
    minHeight: 32,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeProofButtonText: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '700',
  },
  helperText: {
    color: '#475569',
  },
  warningText: {
    color: '#B45309',
    fontSize: 13,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
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
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    backgroundColor: '#94A3B8',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryActionButtonText: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 14,
  },
  driverMarkerIcon: {
    fontSize: 28,
  },
  destinationXMarker: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#B91C1C',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  destinationXText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
