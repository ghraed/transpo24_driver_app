import { MapLocationMarker, MAP_COLORS } from '@/components/map-location-marker';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Modal, Pressable, StyleSheet, useAnimatedValue, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { NativeMapView, NativeMarker, PROVIDER_GOOGLE } from './native-maps';
import { DriverRoutePolyline } from './driver-route-polyline';
import { GOOGLE_MAPS_API_KEY } from '@/config/maps';
import { DriverCard, DriverIcon, DriverText } from './ui/driver-ui';
import { TripRouteCard } from './ui/trip-ui';
import { driverRadius, driverSpace, useDriverColors } from '@/theme/driver-theme';

type Stop = { latitude: number | null; longitude: number | null };
type Props = { pickup: Stop; dropoff: Stop; pickupAddress: string; dropoffAddress: string; distance: string | null };

function hasCoordinates(stop: Stop): stop is { latitude: number; longitude: number } {
  return typeof stop.latitude === 'number' && Number.isFinite(stop.latitude) && Math.abs(stop.latitude) <= 90
    && typeof stop.longitude === 'number' && Number.isFinite(stop.longitude) && Math.abs(stop.longitude) <= 180;
}

function RouteMap({ pickup, dropoff, pickupAddress, dropoffAddress }: Props) {
  const { t } = useTranslation();
  const map = useRef<{ fitToCoordinates: (coordinates: Stop[], options: object) => void } | null>(null);
  const routeCoordinates = useRef<Stop[]>([]);
  const onRouteReady = useCallback((coordinates: { latitude: number; longitude: number }[]) => {
    routeCoordinates.current = coordinates;
    map.current?.fitToCoordinates(coordinates, {
      edgePadding: { top: 48, right: 48, bottom: 64, left: 48 }, animated: false,
    });
  }, []);
  const stops = [pickup, dropoff].filter(hasCoordinates);
  if (!NativeMapView || !NativeMarker) {
    return <View style={styles.fallback}><DriverText secondary>{t('Map preview is unavailable on this platform.')}</DriverText></View>;
  }
  if (!stops.length) {
    return <View style={styles.fallback}><DriverText secondary>{t('Location unavailable')}</DriverText></View>;
  }
  const fitMap = () => map.current?.fitToCoordinates(routeCoordinates.current.length ? routeCoordinates.current : stops, {
    edgePadding: { top: 48, right: 48, bottom: 64, left: 48 }, animated: false,
  });
  return (
    <NativeMapView
      ref={map}
      style={StyleSheet.absoluteFill}
      provider={PROVIDER_GOOGLE}
      initialRegion={{ ...stops[0], latitudeDelta: 0.05, longitudeDelta: 0.05 }}
      onMapReady={fitMap}
      onLayout={fitMap}
      toolbarEnabled={false}
      showsUserLocation={false}
    >
      {hasCoordinates(pickup) ? (
        <MapLocationMarker kind="pickup" coordinate={pickup} title={t('Pickup')} description={pickupAddress} />
      ) : null}
      {hasCoordinates(dropoff) ? (
        <MapLocationMarker kind="dropoff" coordinate={dropoff} title={t('Dropoff')} description={dropoffAddress} />
      ) : null}
      {hasCoordinates(pickup) && hasCoordinates(dropoff) ? (
        <DriverRoutePolyline
          origin={pickup}
          destination={dropoff}
          apikey={GOOGLE_MAPS_API_KEY}
          strokeColor={MAP_COLORS.route}
          strokeWidth={5}
          onReady={onRouteReady}
        />
      ) : null}
    </NativeMapView>
  );
}

export function RequestRouteCard(props: Props) {
  const { t } = useTranslation();
  const colors = useDriverColors();
  const [open, setOpen] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const rotation = useAnimatedValue(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduceMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { active = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    const animation = Animated.timing(rotation, { toValue: open ? 1 : 0, duration: reduceMotion ? 0 : 180, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [open, reduceMotion, rotation]);
  return (
    <DriverCard>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(value => !value)}
        style={({ pressed }) => [styles.header, { opacity: pressed ? 0.65 : 1 }]}
      >
        <View style={styles.copy}>
          <TripRouteCard pickup={props.pickupAddress} dropoff={props.dropoffAddress} style={styles.route} />
          {props.distance ? <DriverText variant="caption" secondary>{t('Distance')}: {props.distance}</DriverText> : null}
        </View>
        <Animated.View accessible={false} style={{ transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
          <DriverIcon name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }} />
        </Animated.View>
      </Pressable>
      {open ? (
        <View style={[styles.preview, { backgroundColor: colors.surfaceSubtle }]}>
          {!fullScreen ? <RouteMap {...props} /> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={t('pickupUi.expandMap')} onPress={() => setFullScreen(true)}
            style={({ pressed }) => [styles.expand, { backgroundColor: colors.surface, opacity: pressed ? 0.65 : 1 }]}>
            <DriverIcon name={{ ios: 'arrow.up.left.and.arrow.down.right', android: 'fullscreen', web: 'fullscreen' }} color={colors.text} size={24} />
          </Pressable>
        </View>
      ) : null}
      <Modal visible={fullScreen} animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={() => setFullScreen(false)}>
        <SafeAreaView style={[styles.fullScreen, { backgroundColor: colors.surface }]}>
          <View style={styles.modalHeader}>
            <DriverText variant="section" style={styles.copy}>{t('Pickup')} / {t('Dropoff')}</DriverText>
            <Pressable accessibilityRole="button" accessibilityLabel={t('pickupUi.closeMap')} onPress={() => setFullScreen(false)}
              style={({ pressed }) => [styles.close, { opacity: pressed ? 0.65 : 1 }]}>
              <DriverIcon name={{ ios: 'xmark', android: 'close', web: 'close' }} color={colors.text} size={24} />
            </Pressable>
          </View>
          <View style={styles.fullScreen}>{fullScreen ? <RouteMap {...props} /> : null}</View>
        </SafeAreaView>
      </Modal>
    </DriverCard>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: driverSpace.md, minHeight: 48 },
  copy: { flex: 1, gap: driverSpace.sm },
  route: { padding: 0, borderWidth: 0, borderRadius: 0 },
  preview: { height: 240, borderRadius: driverRadius.md, overflow: 'hidden' },
  fallback: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: driverSpace.xl, paddingBottom: 64 },
  expand: { position: 'absolute', right: driverSpace.md, bottom: driverSpace.md, width: 48, height: 48, borderRadius: driverRadius.sm, alignItems: 'center', justifyContent: 'center', elevation: 3 },
  fullScreen: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: driverSpace.xl, gap: driverSpace.md },
  close: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
