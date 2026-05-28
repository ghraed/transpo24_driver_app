import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import MapViewDirections from 'react-native-maps-directions';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth-context';
import {
  connectSocket,
  emitDriverArrivedPickup,
  emitDriverLocationUpdate,
  joinTripRoom,
  leaveTripRoom,
  onDriverArrivedPickupConfirmed,
  onSocketDisconnect,
  onSocketError,
} from '@/services/socketService';
import type { AddressedLocation, GeoLocation } from '@/types/trip.types';
import {
  calculateDistanceMeters,
  canMarkArrived,
  isValidGeoLocation,
  validateDriverArrivedPickupConfirmedPayload,
  validateTripId,
} from '@/utils/locationValidation';

const EMIT_DISTANCE_THRESHOLD_METERS = 20;
const EMIT_TIME_THRESHOLD_MS = 5000;
const ARRIVAL_RADIUS_METERS = 100;
const TEST_FAKE_LOCATIONS: GeoLocation[] = [
  { latitude: 34.4367, longitude: 35.8497 }, // North: Tripoli area
  { latitude: 34.3640, longitude: 35.9208 }, // Batroun area
  { latitude: 33.9808, longitude: 35.6178 }, // Jounieh area
  { latitude: 33.8938, longitude: 35.5018 }, // Beirut area
  { latitude: 33.5571, longitude: 35.3715 }, // Sidon area
  { latitude: 33.2704, longitude: 35.2038 }, // South: Tyre area
];

function parseNumber(value: string | string[] | undefined): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function GoToPickupScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const params = useLocalSearchParams<{
    tripId?: string;
    pickupLatitude?: string;
    pickupLongitude?: string;
    pickupAddress?: string;
    dropoffLatitude?: string;
    dropoffLongitude?: string;
    dropoffAddress?: string;
  }>();

  const tripId = typeof params.tripId === 'string' ? params.tripId : '';
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

  const [isLoadingLocation, setIsLoadingLocation] = useState<boolean>(true);
  const [driverLocation, setDriverLocation] = useState<GeoLocation | null>(null);
  const [locationError, setLocationError] = useState<string>('');
  const [socketError, setSocketError] = useState<string>('');
  const [arrivalError, setArrivalError] = useState<string>('');
  const [isSubmittingArrival, setIsSubmittingArrival] = useState<boolean>(false);

  const lastEmitLocationRef = useRef<GeoLocation | null>(null);
  const lastEmitAtRef = useRef<number>(0);
  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const fakeLocationIndexRef = useRef<number>(0);

  const distanceMeters = useMemo(() => {
    if (!driverLocation || !pickupLocation || !isValidGeoLocation(pickupLocation)) return null;
    return calculateDistanceMeters(driverLocation, pickupLocation);
  }, [driverLocation, pickupLocation]);

  const canArriveNow = useMemo(() => {
    if (!driverLocation || !pickupLocation) return false;
    if (!isValidGeoLocation(driverLocation) || !isValidGeoLocation(pickupLocation)) return false;
    return canMarkArrived(driverLocation, pickupLocation);
  }, [driverLocation, pickupLocation]);

  useEffect(() => {
    let active = true;

    const setup = async (): Promise<(() => void) | void> => {
      const validTripId = validateTripId(tripId);
      if (!validTripId) {
        setLocationError('Invalid trip id.');
        setIsLoadingLocation(false);
        return;
      }

      if (!pickupLocation || !isValidGeoLocation(pickupLocation)) {
        setLocationError('Invalid pickup location parameters.');
        setIsLoadingLocation(false);
        return;
      }

      if (!accessToken) {
        setLocationError('Missing authentication token. Please login again.');
        setIsLoadingLocation(false);
        return;
      }

      try {
        connectSocket(accessToken);
        joinTripRoom(validTripId);
      } catch (error) {
        setSocketError(error instanceof Error ? error.message : 'Socket connection failed.');
      }

      const disconnectUnsub = onSocketDisconnect(() => {
        setSocketError('Socket disconnected. Reconnecting...');
      });
      const socketErrorUnsub = onSocketError((message) => {
        setSocketError(message || 'Socket connection failed.');
      });

      const arrivedUnsub = onDriverArrivedPickupConfirmed((payload) => {
        const validated = validateDriverArrivedPickupConfirmedPayload(payload);
        if (!validated) return;
        if (validated.tripId !== validTripId) return;

        router.replace(('/pickup-item?tripId=' + encodeURIComponent(validTripId)) as Href);
      });

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!active) return;

      if (status !== 'granted') {
        setLocationError('Location permission denied. Please enable location permission for driver tracking.');
        setIsLoadingLocation(false);
        return;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!active) return;

      if (!servicesEnabled) {
        setLocationError('GPS is unavailable. Please enable location services.');
        setIsLoadingLocation(false);
        return;
      }

      try {
        const currentLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Highest,
        });

        if (!active) return;

        const nextLocation: GeoLocation = {
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
        };

        if (isValidGeoLocation(nextLocation)) {
          setDriverLocation(nextLocation);
          emitDriverLocationUpdate({
            tripId: validTripId,
            latitude: nextLocation.latitude,
            longitude: nextLocation.longitude,
            heading:
              typeof currentLocation.coords.heading === 'number'
                ? currentLocation.coords.heading
                : undefined,
            speed:
              typeof currentLocation.coords.speed === 'number' ? currentLocation.coords.speed : undefined,
            accuracy:
              typeof currentLocation.coords.accuracy === 'number'
                ? currentLocation.coords.accuracy
                : undefined,
          });
          lastEmitLocationRef.current = nextLocation;
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
              tripId: validTripId,
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
      } catch (error) {
        setLocationError(
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
        disconnectUnsub();
        socketErrorUnsub();
        arrivedUnsub();
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
      if (validTripId) leaveTripRoom(validTripId);
    };
  }, [accessToken, dropoffLocation, pickupLocation, router, tripId]);

  const onArrivedPress = (): void => {
    setArrivalError('');

    const validTripId = validateTripId(tripId);
    if (!validTripId) {
      setArrivalError('Invalid trip id.');
      return;
    }

    if (!driverLocation || !isValidGeoLocation(driverLocation)) {
      setArrivalError('Current location is not ready.');
      return;
    }

    if (!pickupLocation || !isValidGeoLocation(pickupLocation)) {
      setArrivalError('Pickup location is invalid.');
      return;
    }

    if (!canMarkArrived(driverLocation, pickupLocation)) {
      setArrivalError('You are too far from pickup location. Move closer to continue.');
      return;
    }

    setIsSubmittingArrival(true);
    try {
      emitDriverArrivedPickup({
        tripId: validTripId,
        latitude: driverLocation.latitude,
        longitude: driverLocation.longitude,
      });
    } catch (error) {
      setArrivalError(error instanceof Error ? error.message : 'Failed to send arrival confirmation.');
    } finally {
      setIsSubmittingArrival(false);
    }
  };

  // TESTING ONLY: Simulates movement without physical GPS changes.
  const onSendFakeLocationPress = (): void => {
    setArrivalError('');
    const validTripId = validateTripId(tripId);
    if (!validTripId) {
      setArrivalError('Invalid trip id.');
      return;
    }

    const nextLocation = TEST_FAKE_LOCATIONS[fakeLocationIndexRef.current];
    if (!nextLocation) return;

    setDriverLocation(nextLocation);
    emitDriverLocationUpdate({
      tripId: validTripId,
      latitude: nextLocation.latitude,
      longitude: nextLocation.longitude,
    });
    lastEmitLocationRef.current = nextLocation;
    lastEmitAtRef.current = Date.now();
    fakeLocationIndexRef.current = (fakeLocationIndexRef.current + 1) % TEST_FAKE_LOCATIONS.length;
  };

  if (!mapsApiKey) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <Text style={styles.errorText}>
          Google Maps API key is missing. Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY or platform key
          (EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY / EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY).
        </Text>
      </SafeAreaView>
    );
  }

  if (!pickupLocation || !isValidGeoLocation(pickupLocation)) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <Text style={styles.errorText}>Invalid pickup location. Please reopen this trip from driver home.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mapContainer}>
        {driverLocation ? (
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: driverLocation.latitude,
              longitude: driverLocation.longitude,
              latitudeDelta: 0.03,
              longitudeDelta: 0.03,
            }}
          >
            <Marker coordinate={driverLocation} title="Driver" pinColor="#2563EB" />
            <Marker coordinate={pickupLocation} title="Pickup" pinColor="#16A34A" />
            <MapViewDirections
              origin={driverLocation}
              destination={pickupLocation}
              apikey={mapsApiKey}
              strokeWidth={4}
              strokeColor="#0EA5E9"
            />
          </MapView>
        ) : (
          <View style={styles.centeredMapState}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.helperText}>Getting live location...</Text>
          </View>
        )}
      </View>

      <View style={styles.bottomCard}>
        <Text style={styles.title}>Go to Pickup Location</Text>
        <Text style={styles.addressText}>{pickupLocation.address || 'Pickup address unavailable'}</Text>
        {distanceMeters !== null ? (
          <Text style={styles.distanceText}>Distance remaining: {(distanceMeters / 1000).toFixed(2)} km</Text>
        ) : (
          <Text style={styles.distanceText}>Distance remaining: --</Text>
        )}

        {isLoadingLocation ? <Text style={styles.helperText}>Getting location...</Text> : null}
        {locationError ? <Text style={styles.errorText}>{locationError}</Text> : null}
        {socketError ? <Text style={styles.errorText}>{socketError}</Text> : null}
        {arrivalError ? <Text style={styles.errorText}>{arrivalError}</Text> : null}

        <Pressable
          style={[styles.actionButton, !canArriveNow && styles.disabledButton]}
          disabled={!canArriveNow || isSubmittingArrival || Boolean(locationError)}
          onPress={onArrivedPress}
        >
          <Text style={styles.actionButtonText}>
            {!driverLocation
              ? 'Getting location...'
              : !canArriveNow
              ? 'Too far from pickup'
              : isSubmittingArrival
              ? 'Confirming arrival...'
              : 'Arrived at Pickup'}
          </Text>
        </Pressable>
        <Pressable style={styles.testButton} onPress={onSendFakeLocationPress}>
          <Text style={styles.testButtonText}>TESTING ONLY: Send Fake Location</Text>
        </Pressable>

        <Text style={styles.radiusText}>Arrival allowed within {ARRIVAL_RADIUS_METERS} meters of pickup.</Text>
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
    gap: 10,
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
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  addressText: {
    fontSize: 14,
    color: '#334155',
  },
  distanceText: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
  },
  helperText: {
    color: '#475569',
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
  disabledButton: {
    backgroundColor: '#94A3B8',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  radiusText: {
    color: '#64748B',
    fontSize: 12,
  },
  testButton: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  testButtonText: {
    color: '#92400E',
    fontWeight: '700',
    fontSize: 13,
  },
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#F8FAFC',
  },
});
