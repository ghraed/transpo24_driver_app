import { MapRequestMarker } from '@/components/map-request-marker';
import { MapLocationMarker, MapLocationIcon } from '@/components/map-location-marker';
import { useDriverAccess } from '@/hooks/use-driver-access';
import { DriverRegistrationNotice } from '@/components/driver-registration-notice';
import { RequestTypeTabs, type RequestType } from '@/components/request-type-tabs';
import { syncRequestMatchingLocation } from '@/location/request-matching-location';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DriverBottomNav } from '@/components/driver-bottom-nav';
import { DriverIcon } from '@/components/driver-icon';
import { NativeMapView, NativeMarker, isNativeMapRuntimeAvailable } from '@/components/native-maps';
import { getDriverAvailability, getDriverMapRequests, updateDriverOnlineStatus } from '@/lib/api';
import type { DriverAvailabilityResponse, DriverRequestAlertSummary } from '@/types/auth';
import { driverRadius, driverThemes } from '@/theme/driver-theme';

const colors = driverThemes.light;
const MAP_ICON_SIZE = 24;

type Coordinate = { latitude: number; longitude: number };

const DRIVER_LOCATION_REGION_DELTA = 0.02;

const SOFT_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#CDE9CE' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7D927E' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#E9F5E9' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#DDF0DD' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#EFF4EF' }] },
  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#B7DBD5' }] },
];

function hasCoordinate(location: { latitude: number | null; longitude: number | null }): location is Coordinate {
  return typeof location.latitude === 'number' && typeof location.longitude === 'number';
}

function asRegion(coordinate: Coordinate) {
  return {
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    latitudeDelta: DRIVER_LOCATION_REGION_DELTA,
    longitudeDelta: DRIVER_LOCATION_REGION_DELTA,
  };
}

export default function DriverMapScreen() {
  const router = useRouter();
  const { canInteract, continueRegistration } = useDriverAccess();
  const { t } = useTranslation();
  const MapView = NativeMapView;
  const MapMarker = NativeMarker;
  const mapRef = useRef<any>(null);
  const loadVersion = useRef(0);
  const locationVersion = useRef(0);
  const [requestType, setRequestType] = useState<RequestType>('immediate');
  const [availability, setAvailability] = useState<DriverAvailabilityResponse | null>(null);
  const [alerts, setAlerts] = useState<DriverRequestAlertSummary[]>([]);
  const [driverLocation, setDriverLocation] = useState<Coordinate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLocating, setIsLocating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');

  const centerOnDriver = useCallback((coordinate: Coordinate, duration = 350) => {
    setDriverLocation(coordinate);
    if (requestType === 'immediate') mapRef.current?.animateToRegion?.(asRegion(coordinate), duration);
  }, [requestType]);

  const loadMap = useCallback(async () => {
    const version = ++loadVersion.current;
    setIsLoading(true);
    if (canInteract) await syncRequestMatchingLocation().catch(() => undefined);
    const [availabilityResult, alertsResult] = await Promise.allSettled([
      getDriverAvailability(),
      getDriverMapRequests(),
    ]);
    if (version !== loadVersion.current) return;
    if (availabilityResult.status === 'fulfilled') setAvailability(availabilityResult.value);
    if (alertsResult.status === 'fulfilled') {
      setAlerts(alertsResult.value.alerts ?? []);
    }
    setIsLoading(false);
  }, [canInteract]);

  const startLocationTracking = useCallback(async (watch = true): Promise<(() => void) | undefined> => {
    const version = locationVersion.current;
    setIsLocating(true);
    setLocationMessage('');

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (version !== locationVersion.current) return undefined;
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setLocationMessage(t('Location permission is needed to center the map on you.'));
        return undefined;
      }

      const lastKnownLocation = await Location.getLastKnownPositionAsync({
        maxAge: 60_000,
        requiredAccuracy: 200,
      });
      if (version !== locationVersion.current) return undefined;
      if (lastKnownLocation) {
        centerOnDriver(lastKnownLocation.coords);
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      if (version !== locationVersion.current) return undefined;
      centerOnDriver(currentLocation.coords);
      void loadMap();
      if (!watch) return undefined;

      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 10,
          timeInterval: 5_000,
        },
        (location) => { if (version === locationVersion.current) centerOnDriver(location.coords); },
        () => { if (version === locationVersion.current) setLocationMessage(t('Unable to update your current location.')); },
      );

      return () => subscription.remove();
    } catch {
      if (version !== locationVersion.current) return undefined;
      setLocationMessage(t('Unable to get your current location. Check that location services are enabled.'));
      return undefined;
    } finally {
      if (version === locationVersion.current) setIsLocating(false);
    }
  }, [centerOnDriver, loadMap, t]);

  useFocusEffect(
    useCallback(() => {
      void loadMap();
      const timer = setInterval(() => void loadMap(), 20_000);
      let isFocused = true;
      let stopLocationTracking: (() => void) | undefined;
      void startLocationTracking().then((stop) => {
        if (isFocused) {
          stopLocationTracking = stop;
        } else {
          stop?.();
        }
      });

      return () => {
        isFocused = false;
        ++loadVersion.current;
        ++locationVersion.current;
        clearInterval(timer);
        stopLocationTracking?.();
      };
    }, [loadMap, startLocationTracking]),
  );

  const toggleOnline = async () => {
    if (!canInteract) { await continueRegistration(); return; }
    if (!availability || isUpdating) return;
    setIsUpdating(true);
    try {
      const next = await updateDriverOnlineStatus({ isOnline: !availability.isOnline });
      setAvailability(next);
      void loadMap();
    } catch (error) {
      setLocationMessage(error instanceof Error ? error.message : t('Unable to update availability.'));
    } finally {
      setIsUpdating(false);
    }
  };

  const initialRegion = driverLocation ? asRegion(driverLocation) : alerts.find(alert => hasCoordinate(alert.pickup))?.pickup;
  const mapRegion = initialRegion && hasCoordinate(initialRegion) ? asRegion(initialRegion) : undefined;

  // Browse every open request independently of notification eligibility.
  const jobMarkers = alerts.filter(
    (alert) => alert.schedule.isImmediate === (requestType === 'immediate') && hasCoordinate(alert.pickup),
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <DriverRegistrationNotice />
      <StatusBar style="dark" />

      <View style={styles.mapArea}>
        {isNativeMapRuntimeAvailable && !mapRegion ? (
          <View style={styles.mapFallback}>
            {isLoading || isLocating ? <ActivityIndicator size="large" color="#087FFF" /> : null}
          </View>
        ) : isNativeMapRuntimeAvailable && MapView && MapMarker ? (
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            initialRegion={mapRegion}
            onMapReady={() => {
              if (mapRegion) mapRef.current?.animateToRegion?.(mapRegion, 0);
            }}
            customMapStyle={SOFT_MAP_STYLE}
            showsCompass={false}
            showsMyLocationButton={false}
            toolbarEnabled={false}
          >
            {jobMarkers.map((alert) => (
              <React.Fragment key={alert.alertId}>
                {hasCoordinate(alert.pickup) ? (
                  <MapRequestMarker
                    serviceKey={alert.service?.key}
                    itemType={alert.item?.type}
                    coordinate={alert.pickup}
                    title={t('Pickup')}
                    onPress={() => router.push({ pathname: '/review-request-details', params: { requestId: alert.requestId } })}
                  />
                ) : null}
              </React.Fragment>
            ))}
            {driverLocation ? (
              <MapLocationMarker
                kind="driver"
                coordinate={driverLocation}
                title={t('Your current location')}
              />
            ) : null}
          </MapView>
        ) : (
          <View style={styles.mapFallback}>
            {Array.from({ length: 10 }, (_, index) => <View key={`v-${index}`} style={[styles.gridVertical, { left: `${index * 12}%` }]} />)}
            {Array.from({ length: 12 }, (_, index) => <View key={`h-${index}`} style={[styles.gridHorizontal, { top: `${index * 9}%` }]} />)}
            <View style={[styles.fakeRoad, styles.fakeRoadVertical]} />
            <View style={[styles.fakeRoad, styles.fakeRoadHorizontal]} />
            {driverLocation ? (
              <MapLocationIcon kind="driver" />
            ) : null}
          </View>
        )}

        <View style={styles.topOverlay} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Profile')}
            style={({ pressed }) => [styles.roundButton, pressed && styles.iconButtonPressed]}
            onPress={() => router.push('/driver-profile')}
          >
            <DriverIcon name="profile-circle" size={MAP_ICON_SIZE} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>{t('Available Jobs')}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Jobs')}
            style={({ pressed }) => [styles.roundButton, pressed && styles.iconButtonPressed]}
            onPress={() => router.push('/receive-requests')}
          >
            <DriverIcon name="sliders" size={MAP_ICON_SIZE} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.coverageOverlay}>
          <RequestTypeTabs value={requestType} counts={{
            immediate: alerts.filter(alert => alert.schedule.isImmediate && hasCoordinate(alert.pickup)).length,
            scheduled: alerts.filter(alert => !alert.schedule.isImmediate && hasCoordinate(alert.pickup)).length,
          }} onChange={(type) => {
            setRequestType(type);
            if (driverLocation) mapRef.current?.animateToRegion?.(asRegion(driverLocation), 350);
          }} />
          <Text style={{ color: colors.text, backgroundColor: colors.surface, padding: 10, borderRadius: 10, fontSize: 12, textAlign: 'center' }}>{t('Map shows all open requests. Radius applies to notifications only.')}</Text>
        </View>

        <Pressable
          style={[styles.onlinePill, availability && !availability.isOnline && styles.offlinePill]}
          disabled={!availability || isUpdating}
          onPress={() => void toggleOnline()}
        >
          {isUpdating || isLoading ? (
            <ActivityIndicator size="small" color="#222222" />
          ) : (
            <View style={[styles.onlineDot, !availability?.isOnline && styles.offlineDot]} />
          )}
          <Text style={styles.onlineText}>{availability?.isOnline ? t('Online') : t('Offline')}</Text>
        </Pressable>

        {locationMessage ? <Text style={styles.locationMessage}>{locationMessage}</Text> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Center map on my current location')}
          accessibilityState={{ busy: isLocating }}
          style={({ pressed }) => [styles.locationButton, pressed && styles.iconButtonPressed]}
          onPress={() => void startLocationTracking(false)}
        >
          {isLocating ? (
            <ActivityIndicator size="small" color={colors.success} />
          ) : (
            <DriverIcon name="locate" size={MAP_ICON_SIZE} color={colors.success} />
          )}
        </Pressable>
      </View>

      <DriverBottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8F9' },
  mapArea: { flex: 1, marginBottom: 76, overflow: 'hidden', backgroundColor: '#CDE9CE' },
  coverageOverlay: { position: 'absolute', top: 138, left: 22, right: 22 },
  topOverlay: {
    position: 'absolute', top: 0, right: 0, left: 0, height: 94, paddingHorizontal: 28,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  roundButton: {
    width: 52, height: 52, borderRadius: driverRadius.md, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    shadowColor: colors.shadow, shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  title: { color: '#181818', fontSize: 23, fontWeight: '800' },
  onlinePill: {
    position: 'absolute', top: 76, alignSelf: 'center', minWidth: 146, height: 58, paddingHorizontal: 25,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, borderRadius: 29,
    backgroundColor: '#FFC515', shadowColor: '#1B1B1B', shadowOpacity: 0.12, shadowRadius: 10,
    shadowOffset: { width: 0, height: 7 }, elevation: 5,
  },
  offlinePill: { backgroundColor: '#FFFFFF' },
  onlineDot: { width: 15, height: 15, borderRadius: 8, backgroundColor: '#54A84F' },
  offlineDot: { backgroundColor: '#9CA6B5' },
  onlineText: { color: '#111111', fontSize: 19, fontWeight: '800' },
  locationMessage: {
    position: 'absolute', right: 22, bottom: 98, left: 22, paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 14, color: '#707A8C', fontSize: 13, textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.94)',
  },
  locationButton: {
    position: 'absolute', right: 29, bottom: 25, width: 52, height: 52, borderRadius: driverRadius.md,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, shadowColor: colors.shadow,
    shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  iconButtonPressed: { backgroundColor: colors.primarySoft, opacity: 0.8 },
  mapFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#CDE9CE' },
  gridVertical: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.45)' },
  gridHorizontal: { position: 'absolute', right: 0, left: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.45)' },
  fakeRoad: { position: 'absolute', backgroundColor: '#FFFFFF' },
  fakeRoadVertical: { top: 0, bottom: 0, left: '40%', width: 24 },
  fakeRoadHorizontal: { top: '56%', right: 0, left: 0, height: 19 },
});
