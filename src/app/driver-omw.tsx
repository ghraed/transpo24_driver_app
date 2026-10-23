import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Redirect, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { DriverBottomNav, DRIVER_BOTTOM_NAV_HEIGHT } from '@/components/driver-bottom-nav';
import { NativeMapView, NativeMarker, NativePolyline, isNativeMapRuntimeAvailable } from '@/components/native-maps';
import { MapLocationMarker } from '@/components/map-location-marker';
import { DriverButton, DriverCard, DriverIcon, DriverNotice, DriverStatus, DriverText } from '@/components/ui/driver-ui';
import { TripRouteCard } from '@/components/ui/trip-ui';
import { useAuth } from '@/context/auth-context';
import type { ResolvedPlaceLocation } from '@/lib/places';
import { useOmwTrip } from '@/omw/context';
import { OmwPlaceField } from '@/omw/place-field';
import { findOmwRoutes, type OmwRoute } from '@/omw/routes';
import { driverLayout, driverRadius, driverSpace, useDriverColors } from '@/theme/driver-theme';

export default function DriverOmwScreen() {
  const { t, i18n } = useTranslation();
  const colors = useDriverColors();
  const insets = useSafeAreaInsets();
  const { accessToken } = useAuth();
  const { trip, setTrip } = useOmwTrip();
  const [from, setFrom] = useState<ResolvedPlaceLocation | null>(trip?.from ?? null);
  const [to, setTo] = useState<ResolvedPlaceLocation | null>(trip?.to ?? null);
  const [via, setVia] = useState<ResolvedPlaceLocation | null>(trip?.via ?? null);
  const [showVia, setShowVia] = useState(Boolean(trip?.via));
  const [routes, setRoutes] = useState<OmwRoute[]>(trip?.routes ?? []);
  const [selected, setSelected] = useState<OmwRoute | null>(trip?.route ?? null);
  const [confirmed, setConfirmed] = useState(Boolean(trip));
  const [busy, setBusy] = useState(false);
  const [resolvingFrom, setResolvingFrom] = useState(false);
  const [resolvingTo, setResolvingTo] = useState(false);
  const [resolvingVia, setResolvingVia] = useState(false);
  const isResolving = resolvingFrom || resolvingTo || resolvingVia;
  const [error, setError] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const map = useRef<{ fitToCoordinates: (coordinates: OmwRoute['coordinates'], options: object) => void } | null>(null);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); cancelRequest(); };
  }, []);
  useFocusEffect(React.useCallback(() => () => { cancelRequest(); }, []));

  function cancelRequest() {
    const pending = controller.current;
    controller.current = null;
    pending?.abort();
  }

  const fitRoutes = React.useCallback(() => {
    if (routes.length) map.current?.fitToCoordinates(routes.flatMap(route => route.coordinates), {
      edgePadding: { top: 40, right: 40, bottom: 40, left: 40 }, animated: false,
    });
  }, [routes]);
  useEffect(() => { fitRoutes(); }, [fitRoutes]);

  function selectRoute(route: OmwRoute) {
    if (isResolving || route.id === selected?.id) return;
    setSelected(route);
    // Replace the confirmed choice immediately; never retain an older active route.
    if (confirmed && from && to) setTrip({ from, to, via, route, routes });
  }

  function changeEndpoint(which: 'from' | 'to' | 'via', place: ResolvedPlaceLocation | null) {
    cancelRequest();
    setBusy(false); setRoutes([]); setSelected(null); setError('');
    if (which === 'from') setFrom(place); else if (which === 'to') setTo(place); else setVia(place);
  }

  async function findRoutes() {
    if (!from || !to || busy || isResolving || (showVia && !via)) return;
    Keyboard.dismiss();
    if ((from.placeId && from.placeId === to.placeId)
      || (from.latitude === to.latitude && from.longitude === to.longitude)) {
      setError(t('omw.samePlace')); return;
    }
    cancelRequest();
    const request = new AbortController();
    controller.current = request;
    const timeout = setTimeout(() => request.abort(), 20000);
    setBusy(true); setError(''); setRoutes([]); setSelected(null);
    try {
      const result = await findOmwRoutes(from, to, request.signal, via);
      if (request.signal.aborted) return;
      setRoutes(result); setSelected(result[0] ?? null);
      if (!result.length) setError(t('omw.noRoutes'));
    } catch {
      if (controller.current === request) setError(t('omw.routeError'));
    } finally {
      clearTimeout(timeout);
      if (controller.current === request) {
        if (request.signal.aborted) setError(t('omw.routeError'));
        setBusy(false);
      }
    }
  }

  if (!accessToken) return <Redirect href="/" />;
  const MapView = NativeMapView;
  const Polyline = NativePolyline;
  const Marker = NativeMarker;
  const locale = i18n.resolvedLanguage ?? 'en';
  const metrics = (route: OmwRoute) => t('omw.metrics', {
    distance: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(route.distanceMeters / 1000),
    minutes: new Intl.NumberFormat(locale).format(Math.ceil(route.durationSeconds / 60)),
  });
  const routeTitle = (route: OmwRoute, index: number) => route.summary
    ? t('omw.routeVia', { number: index + 1, road: route.summary })
    : t('omw.routeNumber', { number: index + 1 });

  return <SafeAreaView style={[styles.screen, { backgroundColor: colors.canvas }]} edges={['top']}>
    <StatusBar style="dark" />
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content,
        { paddingBottom: driverSpace.xl }]}>
        <View style={styles.heading}>
          <DriverText variant="display">{t('OMW')}</DriverText>
          <DriverText secondary>{t('omw.subtitle')}</DriverText>
        </View>
        {confirmed && trip ? <>
          <DriverStatus label={t('omw.currentRoute')} tone="success" />
          <TripRouteCard pickup={trip.from.address} dropoff={trip.to.address}
            pickupLabel={t('omw.from')} dropoffLabel={t('omw.to')} />
          {trip.via ? <DriverCard>
            <DriverText variant="caption" secondary>{t('omw.via')}</DriverText>
            <DriverText>{trip.via.address}</DriverText>
          </DriverCard> : null}
        </> : <DriverCard key={formVersion}>
          <OmwPlaceField label={t('omw.from')} value={from} onChange={place => changeEndpoint('from', place)} disabled={busy} onResolvingChange={setResolvingFrom} />
          {showVia ? <>
            <OmwPlaceField label={t('omw.via')} value={via} onChange={place => changeEndpoint('via', place)} disabled={busy} onResolvingChange={setResolvingVia} />
            <DriverText secondary variant="caption">{t('omw.viaHelp')}</DriverText>
            <DriverButton label={t('omw.removeVia')} variant="quiet" disabled={busy} onPress={() => {
              changeEndpoint('via', null); setShowVia(false); setResolvingVia(false);
            }} />
          </> : <DriverButton label={t('omw.addVia')} variant="quiet" disabled={busy} onPress={() => {
            changeEndpoint('via', null); setShowVia(true);
          }} />}
          <OmwPlaceField label={t('omw.to')} value={to} onChange={place => changeEndpoint('to', place)} disabled={busy} onResolvingChange={setResolvingTo} />
          <DriverButton label={t('omw.findRoutes')} onPress={() => void findRoutes()} disabled={!from || !to || isResolving || (showVia && !via)} loading={busy}
            variant={routes.length ? 'secondary' : 'primary'} />
        </DriverCard>}

        {error ? <DriverNotice title={error} tone="danger" /> : null}
        {selected && from && to ? <>
          {isNativeMapRuntimeAvailable && MapView && Polyline ? <View style={[styles.map, { borderColor: colors.border }]}>
            <MapView key={selected.id} ref={map} style={StyleSheet.absoluteFill} onMapReady={fitRoutes}
              initialRegion={{ ...from, latitudeDelta: 0.1, longitudeDelta: 0.1 }} toolbarEnabled={false}>
              {/* Base paths are always gray. A single separate overlay marks the choice.
                  Recreate the native map on selection to clear stale Android overlays. */}
              {routes.map(route => (
                <Polyline key={`alternative-${route.id}`} coordinates={route.coordinates}
                  strokeWidth={4} strokeColor={colors.textSecondary} zIndex={1}
                  tappable={!isResolving} onPress={() => selectRoute(route)} />
              ))}
              <Polyline key="selected-route" coordinates={selected.coordinates}
                strokeWidth={6} strokeColor={colors.primary} zIndex={2} tappable={false} />
              <MapLocationMarker coordinate={from} kind="pickup" title={t('omw.from')} />
              <MapLocationMarker coordinate={to} kind="dropoff" title={t('omw.to')} />
              {via && Marker ? <Marker coordinate={via} title={t('omw.via')} description={via.address} pinColor={colors.info} /> : null}
            </MapView>
          </View> : <DriverNotice title={t('omw.mapUnavailable')} />}
          <DriverText variant="section">{t(confirmed ? 'omw.currentRoute' : 'omw.chooseRoute')}</DriverText>
          <DriverText secondary variant="caption">{t(routes.length === 1 ? 'omw.oneRoute' : 'omw.mainRoutes')}</DriverText>
          <View accessibilityRole="radiogroup" accessibilityLabel={t('omw.chooseRoute')} style={styles.routeOptions}>
          {routes.map((route, index) => <Pressable key={route.id}
            accessibilityRole="radio" accessibilityLabel={`${routeTitle(route, index)}, ${metrics(route)}`}
            accessibilityState={{ checked: route.id === selected.id, selected: route.id === selected.id, disabled: isResolving }}
            disabled={isResolving} onPress={() => selectRoute(route)}
            style={({ pressed }) => [styles.route, { backgroundColor: route.id === selected.id ? colors.primarySoft : colors.surface,
              borderColor: route.id === selected.id ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}>
            <View style={styles.routeCopy}>
              <DriverText variant="section">{routeTitle(route, index)}</DriverText>
              <DriverText secondary>{metrics(route)}</DriverText>
              {route.id === selected.id ? <DriverText variant="caption" style={{ color: colors.success }}>{t('omw.selected')}</DriverText> : null}
            </View>
            <DriverIcon name={route.id === selected.id
              ? { ios: 'checkmark.circle.fill', android: 'radio_button_checked', web: 'radio_button_checked' }
              : { ios: 'circle', android: 'radio_button_unchecked', web: 'radio_button_unchecked' }}
              color={route.id === selected.id ? colors.success : colors.textSecondary} />
          </Pressable>)}
          </View>
        </> : null}
      </ScrollView>
      <View style={[styles.footer, { backgroundColor: colors.surface, borderColor: colors.border,
        marginBottom: keyboardVisible ? 0 : DRIVER_BOTTOM_NAV_HEIGHT + insets.bottom }]}>
        <View style={styles.footerContent}>
          {confirmed ? <DriverButton label={t('omw.editTrip')} variant="secondary" onPress={() => {
            setConfirmed(false); setError('');
          }} /> : selected ? <DriverButton label={t('omw.useRoute')} disabled={isResolving} onPress={() => {
            if (!from || !to || isResolving) return;
            setTrip({ from, to, via, route: selected, routes }); setConfirmed(true);
          }} /> : <DriverText variant="caption" secondary>{t('omw.selectPlaces')}</DriverText>}
          {trip ? <DriverButton label={t('omw.clearTrip')} variant="quiet" onPress={() => {
            cancelRequest(); setTrip(null); setFrom(null); setTo(null); setRoutes([]); setFormVersion(value => value + 1);
            setVia(null); setShowVia(false); setResolvingVia(false);
            setSelected(null); setConfirmed(false); setError(''); setBusy(false);
          }} /> : null}
        </View>
      </View>
    </KeyboardAvoidingView>
    {!keyboardVisible ? <DriverBottomNav /> : null}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { width: '100%', maxWidth: driverLayout.maxWidth, alignSelf: 'center', padding: driverLayout.gutter, gap: driverSpace.lg },
  heading: { gap: driverSpace.sm },
  map: { height: 240, borderWidth: 1, borderRadius: driverRadius.lg, overflow: 'hidden' },
  route: { flexDirection: 'row', alignItems: 'center', gap: driverSpace.md, borderWidth: 2,
    borderRadius: driverRadius.md, padding: driverSpace.lg, minHeight: 72 },
  routeCopy: { flex: 1, gap: driverSpace.xs },
  routeOptions: { gap: driverSpace.lg },
  footer: { borderTopWidth: 1, paddingHorizontal: driverLayout.gutter, paddingVertical: driverSpace.md },
  footerContent: { width: '100%', maxWidth: driverLayout.maxWidth, alignSelf: 'center', gap: driverSpace.xs },
});
