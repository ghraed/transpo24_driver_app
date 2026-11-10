import { DriverRegistrationNotice } from '@/components/driver-registration-notice';
import { MapLocationIcon, MapLocationMarker } from '@/components/map-location-marker';
import { MapRequestMarker } from '@/components/map-request-marker';
import { NavigationCameraToggle } from '@/components/navigation-camera-toggle';
import { useDriverAccess } from '@/hooks/use-driver-access';
import { useNavigationCamera, type NavigationLocation } from '@/hooks/use-navigation-camera';
import { syncRequestMatchingLocation } from '@/location/request-matching-location';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { DRIVER_BOTTOM_NAV_HEIGHT, DriverBottomNav } from '@/components/driver-bottom-nav';
import { DriverIcon } from '@/components/driver-icon';
import { NativeMapView, NativeMarker, isNativeMapRuntimeAvailable } from '@/components/native-maps';
import { getBackendApiBaseUrl } from '@/config/backend';
import { isLocalBackendUrl } from '@/config/environment';
import { getDriverAvailability, getDriverMapRequests, updateDriverOnlineStatus } from '@/lib/api';
import { driverRadius, driverThemes } from '@/theme/driver-theme';
import type { DriverAvailabilityResponse, DriverRequestAlertSummary } from '@/types/auth';

const colors = driverThemes.light;
const MAP_ICON_SIZE = 24;

type Coordinate = { latitude: number; longitude: number };

const DRIVER_LOCATION_REGION_DELTA = 0.02;
const COUNTRY_OVERVIEW_REGION_DELTA = 5;

const SOFT_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#CDE9CE' }] },
  { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#9DB8A0' }, { weight: 1 }] },
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

function asRegion(coordinate: Coordinate, delta = DRIVER_LOCATION_REGION_DELTA) {
  return {
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    latitudeDelta: delta,
    longitudeDelta: delta,
  };
}

export default function DriverMapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { canInteract, continueRegistration } = useDriverAccess();
  const { t } = useTranslation();
  const MapView = NativeMapView;
  const MapMarker = NativeMarker;
  const mapRef = useRef<any>(null);
  const loadVersion = useRef(0);
  const locationVersion = useRef(0);
  const hasCenteredOverview = useRef(false);
  const [availability, setAvailability] = useState<DriverAvailabilityResponse | null>(null);
  const [alerts, setAlerts] = useState<DriverRequestAlertSummary[]>([]);
  const [driverLocation, setDriverLocation] = useState<NavigationLocation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLocating, setIsLocating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');

  const { isNavigationView, isNavigationEnabled, toggleNavigationView, followDriver } = useNavigationCamera(mapRef, driverLocation);

  const centerOnDriver = useCallback((coordinate: NavigationLocation, explicit = false) => {
    setDriverLocation(coordinate);
    if (!isNavigationEnabled() && (explicit || !hasCenteredOverview.current)) {
      mapRef.current?.animateToRegion?.(asRegion(coordinate, explicit ? DRIVER_LOCATION_REGION_DELTA : COUNTRY_OVERVIEW_REGION_DELTA), 350);
      hasCenteredOverview.current = true;
    }
  }, [isNavigationEnabled]);

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
        centerOnDriver(lastKnownLocation.coords, !watch);
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      if (version !== locationVersion.current) return undefined;
      centerOnDriver(currentLocation.coords, !watch);
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
        hasCenteredOverview.current = false;
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

  const initialRegion = driverLocation ?? alerts.find(alert => hasCoordinate(alert.pickup))?.pickup;
  const mapRegion = initialRegion && hasCoordinate(initialRegion) ? asRegion(initialRegion, COUNTRY_OVERVIEW_REGION_DELTA) : undefined;

  // Browse every open request independently of notification eligibility.
  const jobMarkers = alerts.filter((alert) => hasCoordinate(alert.pickup));

  return (
    <SafeAreaView style={styles.screen} edges={isLocalBackendUrl(getBackendApiBaseUrl()) ? [] : ['top']}>
      <DriverRegistrationNotice />
      <StatusBar style="dark" />

      <View style={styles.jobNav}>
        {([
          { label: 'Immediate', icon: 'immediate', onPress: () => router.push({ pathname: '/receive-requests', params: { requestType: 'immediate' } }) },
          { label: 'Scheduled', icon: 'calendar', onPress: () => router.push({ pathname: '/receive-requests', params: { requestType: 'scheduled' } }) },
          { label: 'Pending', icon: 'clock', onPress: () => router.push('/pending-requests') },
          { label: 'Accepted', icon: 'check', onPress: () => router.push('/accepted-jobs') },
        ] as const).map((item) => (
          <Pressable key={item.label} accessibilityRole="button" accessibilityLabel={t(item.label)} onPress={item.onPress}
            style={({ pressed }) => [styles.jobNavItem, pressed && styles.iconButtonPressed]}>
            <DriverIcon name={item.icon} size={20} color={colors.text} />
            <Text style={styles.jobNavLabel}>{t(item.label)}</Text>
          </Pressable>
        ))}
      </View>

      <View style={[styles.mapArea, { marginBottom: DRIVER_BOTTOM_NAV_HEIGHT + insets.bottom }]}>
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
              if (isNavigationEnabled()) followDriver(0);
              else if (mapRegion) mapRef.current?.animateToRegion?.(mapRegion, 0);
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

        <Pressable
          accessibilityRole="switch"
          accessibilityLabel={t(availability?.isOnline ? 'Online' : 'Offline')}
          accessibilityState={{ checked: !!availability?.isOnline, disabled: !availability || isUpdating, busy: isUpdating }}
          style={({ pressed }) => [styles.onlineButton, pressed && styles.iconButtonPressed]}
          disabled={!availability || isUpdating}
          onPress={() => void toggleOnline()}
        >
          {isUpdating || isLoading ? (
            <ActivityIndicator size="small" color={colors.success} />
          ) : (
            <DriverIcon name="power" size={MAP_ICON_SIZE} color={availability?.isOnline ? colors.success : colors.text} />
          )}
          {availability?.isOnline ? <View style={styles.onlineDot} /> : null}
        </Pressable>

        {locationMessage ? <Text style={styles.locationMessage}>{locationMessage}</Text> : null}

        {isNativeMapRuntimeAvailable ? (
          <NavigationCameraToggle
            active={isNavigationView}
            disabled={!driverLocation}
            onPress={toggleNavigationView}
            style={styles.navigationButton}
          />
        ) : null}

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
  jobNav: { flexDirection: 'row', backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  jobNavItem: { flex: 1, minHeight: 52, paddingVertical: 3, paddingHorizontal: 2, alignItems: 'center', justifyContent: 'center', gap: 2 },
  jobNavLabel: { color: colors.text, fontSize: 11, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  mapArea: { flex: 1, overflow: 'hidden', backgroundColor: '#CDE9CE' },
  onlineButton: {
    position: 'absolute', left: 29, bottom: 25, width: 52, height: 52, borderRadius: driverRadius.md,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, shadowColor: colors.shadow,
    shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  onlineDot: { position: 'absolute', right: 7, bottom: 7, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  locationMessage: {
    position: 'absolute', right: 22, bottom: 153, left: 22, paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 14, color: '#707A8C', fontSize: 13, textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.94)',
  },
  locationButton: {
    position: 'absolute', right: 29, bottom: 25, width: 52, height: 52, borderRadius: driverRadius.md,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, shadowColor: colors.shadow,
    shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  navigationButton: { position: 'absolute', right: 29, bottom: 89, width: 52, height: 52 },
  iconButtonPressed: { backgroundColor: colors.primarySoft, opacity: 0.8 },
  mapFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#CDE9CE' },
  gridVertical: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.45)' },
  gridHorizontal: { position: 'absolute', right: 0, left: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.45)' },
  fakeRoad: { position: 'absolute', backgroundColor: '#FFFFFF' },
  fakeRoadVertical: { top: 0, bottom: 0, left: '40%', width: 24 },
  fakeRoadHorizontal: { top: '56%', right: 0, left: 0, height: 19 },
});
