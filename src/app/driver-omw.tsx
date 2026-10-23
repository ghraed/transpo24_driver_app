import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Redirect, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { DriverBottomNav, DRIVER_BOTTOM_NAV_HEIGHT } from '@/components/driver-bottom-nav';
import { NativeMapView, NativeMarker, NativePolyline, isNativeMapRuntimeAvailable } from '@/components/native-maps';
import { MapLocationMarker } from '@/components/map-location-marker';
import { DriverButton, DriverCard, DriverNotice, DriverStatus, DriverText } from '@/components/ui/driver-ui';
import { TripRouteCard } from '@/components/ui/trip-ui';
import { useAuth } from '@/context/auth-context';
import type { ResolvedPlaceLocation } from '@/lib/places';
import { OmwRouteRequests } from '@/omw/route-requests';
import { useOmwTrip } from '@/omw/context';
import { OmwPlaceField } from '@/omw/place-field';
import { findOmwRoutes, type OmwRoute } from '@/omw/routes';
import { driverLayout, driverRadius, driverSpace, useDriverColors } from '@/theme/driver-theme';

export default function DriverOmwScreen() {
  const { t, i18n } = useTranslation();
  const colors = useDriverColors();
  const insets = useSafeAreaInsets();
  const { accessToken } = useAuth();
  const { trip, setTrip, saveError, retrySave } = useOmwTrip();
  const [from, setFrom] = useState<ResolvedPlaceLocation | null>(trip?.from ?? null);
  const [to, setTo] = useState<ResolvedPlaceLocation | null>(trip?.to ?? null);
  const [via, setVia] = useState<ResolvedPlaceLocation | null>(trip?.via ?? null);
  const [showVia, setShowVia] = useState(Boolean(trip?.via));
  const [radiusKm, setRadiusKm] = useState(trip?.radiusKm ?? 5);
  const [radiusText, setRadiusText] = useState(String(trip?.radiusKm ?? 5));
  const radiusValid = Number(radiusText.replace(',', '.')) >= 1 && Number(radiusText.replace(',', '.')) <= 50 && Number.isFinite(Number(radiusText.replace(',', '.')));
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

  // Arrival can finish the trip while another tab is open or this screen is mounted.
  const previousTrip = useRef(trip);
  useEffect(() => {
    if (!previousTrip.current && trip) {
      setFrom(trip.from); setTo(trip.to); setVia(trip.via); setShowVia(Boolean(trip.via));
      setRoutes(trip.routes); setSelected(trip.route); setConfirmed(true);
      setRadiusKm(trip.radiusKm); setRadiusText(String(trip.radiusKm));
    }
    if (previousTrip.current && !trip) {
      cancelRequest(); setFrom(null); setTo(null); setVia(null); setShowVia(false);
      setRoutes([]); setSelected(null); setConfirmed(false); setBusy(false); setError('');
      setFormVersion(value => value + 1);
    }
    previousTrip.current = trip;
  }, [trip]);

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
    if (confirmed && from && to) setTrip({ from, to, via, radiusKm, route, routes });
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


  return <SafeAreaView style={[styles.screen, { backgroundColor: colors.canvas }]} edges={['top']}>
    <StatusBar style="dark" />
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content,
        { paddingBottom: driverSpace.xl + (keyboardVisible ? 0 : DRIVER_BOTTOM_NAV_HEIGHT + insets.bottom) }]}>
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

        {saveError ? <DriverNotice title={t('omw.saveError')} tone="danger"
          action={<DriverButton label={t('omw.refreshRequests')} variant="quiet" onPress={retrySave} />} /> : null}
        {error ? <DriverNotice title={error} tone="danger" /> : null}
        {selected && from && to ? <>
          <OmwRouteRequests route={selected} radiusKm={radiusKm} enabled={radiusValid}>
          {(requestMarkers) => isNativeMapRuntimeAvailable && MapView && Polyline ? <View style={[styles.map, { borderColor: colors.border }]}>
            <MapView key={selected.id} ref={map} style={StyleSheet.absoluteFill} onMapReady={fitRoutes}
              initialRegion={{ ...from, latitudeDelta: 0.1, longitudeDelta: 0.1 }} toolbarEnabled={false}>
              {/* Base paths are always gray. A single separate overlay marks the choice.
                  Recreate the native map on selection to clear stale Android overlays. */}
              {routes.map(route => (
                <Polyline key={`alternative-${route.id}`} coordinates={route.coordinates}
                  strokeWidth={4} strokeColor={colors.textSecondary} zIndex={1}
                  tappable={!isResolving} onPress={(event: { stopPropagation?: () => void }) => { event?.stopPropagation?.(); selectRoute(route); }} />
              ))}
              <Polyline key="selected-route" coordinates={selected.coordinates}
                strokeWidth={6} strokeColor={colors.primary} zIndex={2} tappable={false} />
              {radiusValid ? requestMarkers : null}
              <MapLocationMarker coordinate={from} kind="pickup" title={t('omw.from')} />
              <MapLocationMarker coordinate={to} kind="dropoff" title={t('omw.to')} />
              {via && Marker ? <Marker coordinate={via} title={t('omw.via')} description={via.address} pinColor={colors.info} /> : null}
            </MapView>
          </View> : <DriverNotice title={t('omw.mapUnavailable')} />}
          </OmwRouteRequests>
          <DriverText variant="section">{t(confirmed ? 'omw.currentRoute' : 'omw.chooseRoute')}</DriverText>
          <DriverText secondary variant="caption">{t(routes.length === 1 ? 'omw.oneRoute' : 'omw.mainRoutes')}</DriverText>
          <DriverText accessibilityLiveRegion="polite">{selected.summary ? `${selected.summary} · ${metrics(selected)}` : metrics(selected)}</DriverText>
          <DriverCard>
            <DriverText variant="section">{t('omw.radius')}</DriverText>
            <DriverText variant="caption" secondary>{t('omw.radiusHelp')}</DriverText>
            <TextInput accessibilityLabel={t('omw.radius')} keyboardType="decimal-pad" value={radiusText}
              onChangeText={text => {
                setRadiusText(text);
                const value = Number(text.replace(',', '.'));
                if (Number.isFinite(value) && value >= 1 && value <= 50) {
                  setRadiusKm(value);
                  if (confirmed && trip) setTrip({ ...trip, radiusKm: value });
                }
              }} style={[styles.radiusInput, { color: colors.text, borderColor: radiusValid ? colors.border : colors.danger }]} />
            {!radiusValid ? <DriverText variant="caption" style={{ color: colors.danger }}>{t('omw.radiusError')}</DriverText> : null}
            <View style={styles.radiusOptions}>
              {[1, 5, 10, 25, 50].map(value => <Pressable key={value} accessibilityRole="radio"
                accessibilityLabel={t('omw.radiusValue', { distance: value })}
                accessibilityState={{ checked: radiusKm === value }}
                onPress={() => { setRadiusKm(value); setRadiusText(String(value)); if (confirmed && trip) setTrip({ ...trip, radiusKm: value }); }}
                style={({ pressed }) => [styles.radiusOption, { borderColor: radiusKm === value ? colors.primary : colors.border,
                  backgroundColor: radiusKm === value ? colors.primarySoft : colors.surface, opacity: pressed ? 0.7 : 1 }]}>
                <DriverText variant="label">{t('omw.radiusValue', { distance: value })}</DriverText>
              </Pressable>)}
            </View>
          </DriverCard>
        </> : null}
        <View style={styles.tripActions}>
          {confirmed ? <DriverButton label={t('omw.editTrip')} variant="secondary" onPress={() => {
            setConfirmed(false); setError('');
          }} /> : selected ? <DriverButton label={t('omw.useRoute')} disabled={isResolving || !radiusValid} onPress={() => {
            if (!from || !to || isResolving || !radiusValid) return;
            setTrip({ from, to, via, radiusKm, route: selected, routes }); setConfirmed(true);
          }} /> : <DriverText variant="caption" secondary>{t('omw.selectPlaces')}</DriverText>}
          {trip ? <DriverButton label={t('omw.clearTrip')} variant="quiet" onPress={() => {
            cancelRequest(); setTrip(null); setFrom(null); setTo(null); setRoutes([]); setFormVersion(value => value + 1);
            setVia(null); setShowVia(false); setResolvingVia(false);
            setSelected(null); setConfirmed(false); setError(''); setBusy(false);
          }} /> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    {!keyboardVisible ? <DriverBottomNav /> : null}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { width: '100%', maxWidth: driverLayout.maxWidth, alignSelf: 'center', padding: driverLayout.gutter, gap: driverSpace.lg },
  heading: { gap: driverSpace.sm },
  map: { height: 240, borderWidth: 1, borderRadius: driverRadius.lg, overflow: 'hidden' },
  radiusInput: { minHeight: 52, borderWidth: 1, borderRadius: driverRadius.md, padding: driverSpace.lg, fontSize: 16 },
  radiusOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: driverSpace.sm },
  radiusOption: { minHeight: 48, paddingHorizontal: driverSpace.lg, justifyContent: 'center', borderWidth: 1, borderRadius: driverRadius.md },
  tripActions: { gap: driverSpace.xs },
});
