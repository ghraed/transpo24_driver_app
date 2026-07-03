import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { onItemPickedUp, onTripStatusUpdated } from '@/services/socketService';
import { pickupItem } from '@/services/tripService';
import type { LocalDocumentAsset } from '@/types/auth';
import type { AddressedLocation, GeoLocation, PickupItemRequest } from '@/types/trip.types';
import {
  PICKUP_CONFIRM_RADIUS_METERS,
  calculateDistanceMeters,
  canConfirmPickup,
  isValidGeoLocation,
  isValidTripId,
  validatePickupItemRequest,
} from '@/utils/pickupValidation';

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

function toDeliverRouteParams(
  tripId: string,
  pickupLocation: AddressedLocation,
  dropoffLocation: AddressedLocation,
): Record<string, string> {
  return {
    tripId,
    pickupLatitude: String(pickupLocation.latitude),
    pickupLongitude: String(pickupLocation.longitude),
    pickupAddress: pickupLocation.address ?? '',
    dropoffLatitude: String(dropoffLocation.latitude),
    dropoffLongitude: String(dropoffLocation.longitude),
    dropoffAddress: dropoffLocation.address ?? '',
  };
}

export default function PickupItemScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<PickupParams>();

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
  const [locationMessage, setLocationMessage] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [proofPhotos, setProofPhotos] = useState<LocalDocumentAsset[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string>('');

  const isTripValid = isValidTripId(tripId);
  const hasValidPickup = Boolean(pickupLocation && isValidGeoLocation(pickupLocation));
  const hasValidDropoff = Boolean(dropoffLocation && isValidGeoLocation(dropoffLocation));

  const distanceMeters = useMemo(() => {
    if (!driverLocation || !pickupLocation || !isValidGeoLocation(pickupLocation)) {
      return null;
    }
    return calculateDistanceMeters(driverLocation, pickupLocation);
  }, [driverLocation, pickupLocation]);

  const tooFarFromPickup = useMemo(() => {
    if (!driverLocation || !pickupLocation || !isValidGeoLocation(pickupLocation)) {
      return false;
    }
    return !canConfirmPickup(driverLocation, pickupLocation);
  }, [driverLocation, pickupLocation]);

  const payloadValidationMessage = useMemo(() => {
    const payload: PickupItemRequest = {
      notes: notes.trim() || undefined,
      proofPhotos,
      latitude: driverLocation?.latitude,
      longitude: driverLocation?.longitude,
    };
    return validatePickupItemRequest(payload);
  }, [driverLocation, notes, proofPhotos]);

  const isInvalidRoute = !isTripValid || !hasValidPickup || !hasValidDropoff;

  useEffect(() => {
    let active = true;

    const setupLocation = async (): Promise<void> => {
      if (isInvalidRoute) {
        setIsLoadingLocation(false);
        return;
      }

      const permission = await Location.requestForegroundPermissionsAsync();
      if (!active) return;

      if (permission.status !== 'granted') {
        setLocationMessage('Location permission denied. You can still confirm without coordinates.');
        setIsLoadingLocation(false);
        return;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!active) return;

      if (!servicesEnabled) {
        setLocationMessage('GPS unavailable. You can still confirm pickup, backend will validate request state.');
        setIsLoadingLocation(false);
        return;
      }

      try {
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Highest,
        });

        if (!active) return;

        const currentLocation: GeoLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        if (isValidGeoLocation(currentLocation)) {
          setDriverLocation(currentLocation);
        }
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
    };

    void setupLocation();

    if (isInvalidRoute || !pickupLocation || !dropoffLocation) {
      return () => {
        active = false;
      };
    }

    const deliverParams = toDeliverRouteParams(tripId, pickupLocation, dropoffLocation);
    let offTripStatus: (() => void) | null = null;
    let offItemPickedUp: (() => void) | null = null;

    try {
      offTripStatus = onTripStatusUpdated((payload) => {
        if (payload.tripId !== tripId || payload.status !== 'ITEM_PICKED_UP') return;
        router.replace({ pathname: '/deliver-item', params: deliverParams });
      });

      offItemPickedUp = onItemPickedUp((payload) => {
        if (payload.tripId !== tripId) return;
        router.replace({ pathname: '/deliver-item', params: deliverParams });
      });
    } catch {
      // Socket is optional for this screen; API success still drives navigation.
    }

    return () => {
      active = false;
      offTripStatus?.();
      offItemPickedUp?.();
    };
  }, [dropoffLocation, isInvalidRoute, pickupLocation, router, tripId]);

  const onConfirmPickup = async (): Promise<void> => {
    setSubmitError('');

    if (isInvalidRoute || !pickupLocation || !dropoffLocation) {
      setSubmitError('Invalid trip data. Please reopen this trip from Accepted Jobs.');
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
      latestLocation ? canConfirmPickup(latestLocation, pickupLocation) : false;

    const payload: PickupItemRequest = {
      notes: notes.trim() || undefined,
      proofPhotos,
      latitude: canSendLocation ? latestLocation?.latitude : undefined,
      longitude: canSendLocation ? latestLocation?.longitude : undefined,
    };

    if (latestLocation && !canSendLocation) {
      setLocationMessage(
        'GPS shows you are farther than 150m from pickup. Sending confirmation without coordinates.'
      );
    }

    const validationError = validatePickupItemRequest(payload);
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await pickupItem(tripId, payload);
      if (response.status !== 'ITEM_PICKED_UP') {
        setSubmitError('Unexpected pickup status returned by backend.');
        return;
      }

      router.replace({
        pathname: '/deliver-item',
        params: toDeliverRouteParams(tripId, pickupLocation, dropoffLocation),
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to confirm pickup item.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const pickFromLibrary = async (): Promise<void> => {
    setSubmitError('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
      setSubmitError('Photo library permission is required to select pickup photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.9,
      selectionLimit: 8,
    });

    if (result.canceled) return;
    const pickedAssets = result.assets.map(toAssetFromImagePicker);
    setProofPhotos((current) => [...current, ...pickedAssets].slice(0, 8));
  };

  const capturePhoto = async (): Promise<void> => {
    setSubmitError('');
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
      setSubmitError('Camera permission is required to capture pickup photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.9,
    });

    if (result.canceled || !result.assets[0]) return;
    setProofPhotos((current) => [...current, toAssetFromImagePicker(result.assets[0])].slice(0, 8));
  };

  const removeProofPhoto = (uri: string): void => {
    setProofPhotos((current) => current.filter((item) => item.uri !== uri));
  };

  if (isInvalidRoute || !pickupLocation || !dropoffLocation) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <Text style={styles.errorText}>Invalid trip data. Please reopen this trip from Accepted Jobs.</Text>
      </SafeAreaView>
    );
  }

  const actionButtonDisabled =
    isSubmitting || Boolean(payloadValidationMessage) || !isTripValid;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>Picked Up</Text>
          <Text style={styles.subTitle}>Confirm pickup after collecting the cargo or vehicle from the customer.</Text>
          <Text style={styles.metaText}>Trip ID: {tripId}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Pickup Details</Text>
          <Text style={styles.metaText}>Pickup: {pickupLocation.address || 'Address unavailable'}</Text>
          <Text style={styles.metaText}>Dropoff: {dropoffLocation.address || 'Address unavailable'}</Text>
          {distanceMeters !== null ? (
            <Text style={styles.metaText}>Distance to pickup: {distanceMeters.toFixed(0)} m</Text>
          ) : (
            <Text style={styles.metaText}>Distance to pickup: --</Text>
          )}
          {tooFarFromPickup ? (
            <Text style={styles.warningText}>GPS distance is above 150m. You can still confirm without coordinates.</Text>
          ) : null}
          {locationMessage ? <Text style={styles.warningText}>{locationMessage}</Text> : null}
        </View>

        {mapsApiKey ? (
          <View style={styles.mapCard}>
            <MapView
              style={styles.map}
              initialRegion={{
                latitude: driverLocation?.latitude ?? pickupLocation.latitude,
                longitude: driverLocation?.longitude ?? pickupLocation.longitude,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              }}
            >
              <Marker coordinate={pickupLocation} title="Pickup" />
              <Marker coordinate={dropoffLocation} title="Dropoff" anchor={{ x: 0.5, y: 0.5 }}>
                <View style={styles.destinationXMarker}>
                  <Text style={styles.destinationXText}>X</Text>
                </View>
              </Marker>
              {driverLocation ? (
                <Marker coordinate={driverLocation} title="Driver" anchor={{ x: 0.5, y: 0.5 }}>
                  <Text style={styles.driverMarkerIcon}>🚗</Text>
                </Marker>
              ) : null}
            </MapView>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.warningText}>
              Google Maps key missing. Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY to enable map preview.
            </Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Pickup Notes (Optional)</Text>
          <TextInput
            style={styles.textArea}
            multiline
            numberOfLines={4}
            placeholder="Package received from customer."
            value={notes}
            onChangeText={setNotes}
            maxLength={500}
          />
          <Text style={styles.hintText}>{notes.trim().length}/500</Text>

          <Text style={styles.sectionTitle}>Pickup Photos</Text>
          <Text style={styles.helperText}>
            Take photos of the cargo or vehicle at pickup. This is required.
          </Text>
          <View style={styles.photoActionsRow}>
            <Pressable style={styles.secondaryButton} onPress={() => void capturePhoto()}>
              <Text style={styles.secondaryButtonText}>Take Photo</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => void pickFromLibrary()}>
              <Text style={styles.secondaryButtonText}>Choose Photos</Text>
            </Pressable>
          </View>
          {proofPhotos.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
              {proofPhotos.map((photo) => (
                <View key={photo.uri} style={styles.photoCard}>
                  <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
                  <Pressable style={styles.removePhotoButton} onPress={() => removeProofPhoto(photo.uri)}>
                    <Text style={styles.removePhotoButtonText}>Remove</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.hintText}>No pickup photos selected yet.</Text>
          )}
        </View>

        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

        <Pressable
          style={[styles.actionButton, actionButtonDisabled && styles.disabledButton]}
          disabled={actionButtonDisabled}
          onPress={() => void onConfirmPickup()}
        >
          <Text style={styles.actionButtonText}>
            {isLoadingLocation
              ? 'Getting location...'
              : isSubmitting
              ? 'Confirming pickup...'
              : 'Picked Up'}
          </Text>
        </Pressable>

        <Text style={styles.footerHint}>
          Pickup confirmation is allowed within {PICKUP_CONFIRM_RADIUS_METERS} meters when location is available.
        </Text>
      </ScrollView>

      {(isLoadingLocation || isSubmitting) && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    gap: 8,
  },
  mapCard: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    height: 220,
  },
  map: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
  },
  subTitle: {
    color: '#334155',
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  metaText: {
    color: '#334155',
    fontSize: 13,
  },
  warningText: {
    color: '#92400E',
    fontSize: 13,
  },
  hintText: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'right',
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
  },
  helperText: {
    color: '#475569',
    fontSize: 13,
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    minHeight: 96,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
    backgroundColor: '#FFFFFF',
  },
  photoActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDF4',
  },
  secondaryButtonText: {
    color: '#166534',
    fontWeight: '700',
  },
  photoRow: {
    gap: 10,
  },
  photoCard: {
    width: 112,
    gap: 6,
  },
  photoPreview: {
    width: 112,
    height: 112,
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
  },
  removePhotoButton: {
    minHeight: 34,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePhotoButtonText: {
    color: '#334155',
    fontWeight: '600',
    fontSize: 12,
  },
  actionButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  disabledButton: {
    backgroundColor: '#94A3B8',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
  },
  footerHint: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(248, 250, 252, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  destinationXMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#DC2626',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  destinationXText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  driverMarkerIcon: {
    fontSize: 20,
  },
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#F8FAFC',
  },
});
