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
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { DRIVER_BOTTOM_NAV_HEIGHT, DriverBottomNav } from '@/components/driver-bottom-nav';
import { DriverIcon } from '@/components/driver-icon';
import { NativeMapView, NativeMarker, isNativeMapRuntimeAvailable } from '@/components/native-maps';
import { getBackendApiBaseUrl } from '@/config/backend';
import { getCountryBounds, type CountryBounds } from '@/config/country-bounds';
import { useAuth } from '@/context/auth-context';
import { isLocalBackendUrl } from '@/config/environment';
import { getDriverAvailability, getDriverMapRequests, updateDriverOnlineStatus } from '@/lib/api';
import { readAccessToken } from '@/lib/auth-storage';
import { normalizeCountryCode } from '@/lib/country-currency';
import { connectSocket, onRequestDeleted, onRequestNew } from '@/services/socketService';
import { driverRadius, driverThemes } from '@/theme/driver-theme';
import type { DriverAvailabilityResponse, DriverRequestAlertSummary } from '@/types/auth';

const colors = driverThemes.light;
const MAP_ICON_SIZE = 24;

type Coordinate = { latitude: number; longitude: number };

const DRIVER_LOCATION_REGION_DELTA = 0.02;
const FALLBACK_OVERVIEW_REGION_DELTA = 5;

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

function asCountryRegion(bounds: CountryBounds) {
  const longitudeSpan = (bounds.northeast.longitude - bounds.southwest.longitude + 360) % 360;
  const longitude = ((bounds.southwest.longitude + longitudeSpan / 2 + 540) % 360) - 180;
  return {
    latitude: (bounds.northeast.latitude + bounds.southwest.latitude) / 2,
    longitude,
    latitudeDelta: Math.max((bounds.northeast.latitude - bounds.southwest.latitude) * 1.25, 0.01),
    longitudeDelta: Math.max(longitudeSpan * 1.25, 0.01),
  };
}

export default function DriverMapScreen() {
  const router = useRouter();
  const { driver } = useAuth();
  const profileCountryCode = normalizeCountryCode(driver?.countryCode ?? driver?.countryCodes?.[0]);
  const insets = useSafeAreaInsets();
  const { canInteract, continueRegistration } = useDriverAccess();
  const { t } = useTranslation();
  const MapView = NativeMapView;
  const MapMarker = NativeMarker;
  const mapRef = useRef<any>(null);
  const loadVersion = useRef(0);
  const closedRequestIds = useRef(new Set<string>());
  const locationVersion = useRef(0);
  const locationServicesUnavailable = useRef(false);
  const locationRestoredToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countryBounds = useRef<{ code: string; bounds: CountryBounds } | null>(null);
  const requestedCountryCode = useRef<string | null>(null);
  const mapReady = useRef(false);
  const mapFocused = useRef(false);
  const mapSize = useRef({ width: 0, height: 0 });
  const userMovedMap = useRef(false);
  const appliedCountryCode = useRef<string | null>(null);
  const [availability, setAvailability] = useState<DriverAvailabilityResponse | null>(null);
  const [alerts, setAlerts] = useState<DriverRequestAlertSummary[]>([]);
  const [driverLocation, setDriverLocation] = useState<NavigationLocation | null>(null);
  const [countryOverviewRegion, setCountryOverviewRegion] = useState<ReturnType<typeof asCountryRegion> | null>(null);
  const [mapFocusVersion, setMapFocusVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLocating, setIsLocating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const [showLocationRestoredToast, setShowLocationRestoredToast] = useState(false);

  const { isNavigationView, isNavigationEnabled, toggleNavigationView, followDriver } = useNavigationCamera(mapRef, driverLocation);

  const centerOnDriver = useCallback((coordinate: NavigationLocation, explicit = false) => {
    setDriverLocation(coordinate);
    if (explicit && !isNavigationEnabled()) {
      userMovedMap.current = true;
      mapRef.current?.animateToRegion?.(asRegion(coordinate), 350);
    }
  }, [isNavigationEnabled]);

  const fitCountry = useCallback(() => {
    const selected = countryBounds.current;
    const { width, height } = mapSize.current;
    if (!selected || !mapReady.current || !mapFocused.current || !width || !height ||
      userMovedMap.current || appliedCountryCode.current === selected.code || isNavigationEnabled()) return;
    mapRef.current?.fitToCoordinates?.([selected.bounds.southwest, selected.bounds.northeast], {
      edgePadding: {
        top: Math.round(height * 0.1), bottom: Math.round(height * 0.1),
        left: Math.round(width * 0.1), right: Math.round(width * 0.1),
      },
      animated: true,
    });
    appliedCountryCode.current = selected.code;
  }, [isNavigationEnabled]);

  const loadCountryBounds = useCallback((code: string | null) => {
    if (!code || requestedCountryCode.current === code) return;
    requestedCountryCode.current = code;
    const bounds = getCountryBounds(code);
    if (!bounds) return;
    countryBounds.current = { code, bounds };
    setCountryOverviewRegion(asCountryRegion(bounds));
    fitCountry();
  }, [fitCountry]);

  const locateCountry = useCallback((coordinate: Coordinate) => {
    void Location.reverseGeocodeAsync(coordinate).then((addresses) => {
      loadCountryBounds(normalizeCountryCode(addresses[0]?.isoCountryCode) ?? profileCountryCode);
    }).catch(() => loadCountryBounds(profileCountryCode));
  }, [loadCountryBounds, profileCountryCode]);

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
      setAlerts((alertsResult.value.alerts ?? []).filter((alert) => !closedRequestIds.current.has(alert.requestId)));
    }
    setIsLoading(false);
  }, [canInteract]);

  const startLocationTracking = useCallback(async (watch = true, recovering = false): Promise<(() => void) | undefined> => {
    const version = locationVersion.current;
    setIsLocating(true);
    setLocationMessage('');

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (version !== locationVersion.current) return undefined;
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        loadCountryBounds(profileCountryCode);
        locationServicesUnavailable.current = false;
        setLocationMessage(t('Location permission is needed to center the map on you.'));
        return undefined;
      }

      if (!(await Location.hasServicesEnabledAsync())) {
        if (version !== locationVersion.current) return undefined;
        loadCountryBounds(profileCountryCode);
        locationServicesUnavailable.current = true;
        setLocationMessage(t('Unable to get your current location. Check that location services are enabled.'));
        return undefined;
      }
      if (version !== locationVersion.current) return undefined;
      locationServicesUnavailable.current = false;

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
      if (watch) locateCountry(currentLocation.coords);
      if (recovering) {
        setShowLocationRestoredToast(true);
        if (locationRestoredToastTimer.current) clearTimeout(locationRestoredToastTimer.current);
        locationRestoredToastTimer.current = setTimeout(() => {
          setShowLocationRestoredToast(false);
          locationRestoredToastTimer.current = null;
        }, 3_000);
      }
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
      locationServicesUnavailable.current = await Location.hasServicesEnabledAsync().then(enabled => !enabled).catch(() => false);
      if (version !== locationVersion.current) return undefined;
      loadCountryBounds(profileCountryCode);
      setLocationMessage(t('Unable to get your current location. Check that location services are enabled.'));
      return undefined;
    } finally {
      if (version === locationVersion.current) setIsLocating(false);
    }
  }, [centerOnDriver, loadCountryBounds, loadMap, locateCountry, profileCountryCode, t]);

  useFocusEffect(
    useCallback(() => {
      mapFocused.current = true;
      fitCountry();
      // Android can discard a native marker image while its map screen is covered.
      // Recreate the car marker when returning from request details so it is drawn again.
      setMapFocusVersion((version) => version + 1);
      void loadMap();
      const timer = setInterval(() => void loadMap(), 20_000);
      let isFocused = true;
      let stopLocationTracking: (() => void) | undefined;
      let trackingInProgress = false;
      const beginTracking = (recovering = false) => {
        if (!isFocused || trackingInProgress || stopLocationTracking) return;
        trackingInProgress = true;
        void startLocationTracking(true, recovering).then((stop) => {
          if (isFocused) stopLocationTracking = stop;
          else stop?.();
        }).finally(() => { trackingInProgress = false; });
      };
      const retryWhenServicesReturn = (justBecameActive = false) => {
        if (!isFocused || !locationServicesUnavailable.current || trackingInProgress || (!justBecameActive && AppState.currentState !== 'active')) return;
        trackingInProgress = true;
        let shouldRestart = false;
        void Location.hasServicesEnabledAsync().then((enabled) => {
          shouldRestart = isFocused && enabled;
        }).catch(() => { /* Try again at the next check. */ }).finally(() => {
          trackingInProgress = false;
          if (shouldRestart) beginTracking(true);
        });
      };
      const appStateSubscription = AppState.addEventListener('change', state => {
        if (state === 'active') retryWhenServicesReturn(true);
      });
      const locationRetryTimer = setInterval(() => retryWhenServicesReturn(), 5_000);
      let unsubscribeNew: (() => void) | undefined;
      let unsubscribeDeleted: (() => void) | undefined;
      void readAccessToken().then((token) => {
        if (!isFocused || !token || !canInteract) return;
        connectSocket(token);
        unsubscribeNew = onRequestNew(() => void loadMap());
        unsubscribeDeleted = onRequestDeleted(({ requestId }) => {
          closedRequestIds.current.add(requestId);
          setAlerts((current) => current.filter((alert) => alert.requestId !== requestId));
        });
      }).catch(() => { /* Polling refreshes the map when realtime is unavailable. */ });
      beginTracking();

      return () => {
        isFocused = false;
        ++loadVersion.current;
        ++locationVersion.current;
        locationServicesUnavailable.current = false;
        mapFocused.current = false;
        if (locationRestoredToastTimer.current) clearTimeout(locationRestoredToastTimer.current);
        locationRestoredToastTimer.current = null;
        setShowLocationRestoredToast(false);
        clearInterval(timer);
        clearInterval(locationRetryTimer);
        appStateSubscription.remove();
        unsubscribeNew?.();
        unsubscribeDeleted?.();
        stopLocationTracking?.();
      };
    }, [canInteract, fitCountry, loadMap, startLocationTracking]),
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

  const baseLocation = availability && hasCoordinate({ latitude: availability.baseLatitude, longitude: availability.baseLongitude })
    ? { latitude: availability.baseLatitude, longitude: availability.baseLongitude } : null;
  const initialRegion = driverLocation ?? baseLocation ?? alerts.find(alert => hasCoordinate(alert.pickup))?.pickup;
  const mapRegion = countryOverviewRegion ?? (initialRegion && hasCoordinate(initialRegion)
    ? asRegion(initialRegion, FALLBACK_OVERVIEW_REGION_DELTA) : undefined);

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
            onLayout={(event: LayoutChangeEvent) => {
              mapSize.current = event.nativeEvent.layout;
              fitCountry();
            }}
            onMapReady={() => {
              mapReady.current = true;
              if (isNavigationEnabled()) followDriver(0);
              else fitCountry();
            }}
            onPanDrag={() => { userMovedMap.current = true; }}
            onRegionChangeComplete={(_region: unknown, details?: { isGesture?: boolean }) => {
              if (details?.isGesture) userMovedMap.current = true;
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
                key={`driver-${mapFocusVersion}`}
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

        {showLocationRestoredToast ? (
          <View style={styles.locationRestoredToast} accessibilityRole="alert">
            <Text style={styles.locationRestoredToastText}>{t('Location is back on.')}</Text>
          </View>
        ) : null}

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
  locationRestoredToast: {
    position: 'absolute', top: 16, alignSelf: 'center', zIndex: 2,
    maxWidth: '90%', paddingHorizontal: 16, paddingVertical: 10, borderRadius: driverRadius.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.success,
    shadowColor: colors.shadow, shadowOpacity: 0.12, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  locationRestoredToastText: { color: colors.success, fontSize: 14, fontWeight: '600', textAlign: 'center' },
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
