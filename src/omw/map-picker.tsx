import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { NativeMapView, NativeMarker, type MapPressEvent } from '@/components/native-maps';
import { DriverButton, DriverNotice, DriverText } from '@/components/ui/driver-ui';
import { reverseGeocodeCoordinates, type ResolvedPlaceLocation } from '@/lib/places';
import { driverLayout, driverSpace, useDriverColors } from '@/theme/driver-theme';

type Coordinate = { latitude: number; longitude: number };
type SearchProps = {
  value: ResolvedPlaceLocation | null;
  onChange: (place: ResolvedPlaceLocation | null) => void;
  onResolvingChange: (resolving: boolean) => void;
};

export function OmwMapPicker({ initialPlace, initialCenter, renderSearch: SearchField, onConfirm, onClose }: {
  initialPlace: ResolvedPlaceLocation | null;
  initialCenter?: Coordinate | null;
  renderSearch: (props: SearchProps) => ReactNode;
  onConfirm: (place: ResolvedPlaceLocation) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const colors = useDriverColors();
  const [place, setPlace] = useState(initialPlace);
  const [pinBusy, setPinBusy] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [addressUnavailable, setAddressUnavailable] = useState(false);
  const [searchVersion, setSearchVersion] = useState(0);
  const requestVersion = useRef(0);
  const map = useRef<{ animateToRegion: (region: object, duration: number) => void } | null>(null);
  const MapView = NativeMapView;
  const Marker = NativeMarker;
  const center = initialPlace ?? initialCenter;

  useEffect(() => () => { ++requestVersion.current; }, []);

  const close = () => {
    ++requestVersion.current;
    onClose();
  };

  function searchPlace(next: ResolvedPlaceLocation | null) {
    ++requestVersion.current;
    setPinBusy(false);
    setAddressUnavailable(false);
    setPlace(next);
    if (next) {
      Keyboard.dismiss();
      map.current?.animateToRegion({ ...next, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 250);
    }
  }

  async function pickCoordinate({ latitude, longitude }: Coordinate) {
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return;
    const version = ++requestVersion.current;
    Keyboard.dismiss();
    // Remount the search field so an older suggestion/GPS response cannot move this pin.
    setSearchVersion(value => value + 1);
    const fallback = { latitude, longitude, address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`, placeId: '' };
    setPlace(fallback);
    setSearchBusy(false);
    setPinBusy(true);
    setAddressUnavailable(false);
    try {
      const resolved = await reverseGeocodeCoordinates(latitude, longitude);
      if (version !== requestVersion.current) return;
      // Keep the exact chosen point rather than a nearby building's place ID.
      setPlace({ ...fallback, address: resolved?.address.trim() || fallback.address });
      setAddressUnavailable(!resolved?.address.trim());
    } catch {
      if (version === requestVersion.current) setAddressUnavailable(true);
    } finally {
      if (version === requestVersion.current) setPinBusy(false);
    }
  }

  return <Modal visible animationType="slide" onRequestClose={close}>
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.surface }]}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <DriverText variant="title" style={styles.title}>{t('omw.chooseOnMap')}</DriverText>
          <DriverButton label={t('Cancel')} variant="quiet" onPress={close} />
        </View>
        <ScrollView style={styles.search} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.searchContent}>
          <View key={searchVersion}>
            <SearchField value={place} onChange={searchPlace} onResolvingChange={setSearchBusy} />
          </View>
          <DriverText variant="caption" secondary>{t('omw.mapPickHelp')}</DriverText>
        </ScrollView>
        <View style={[styles.map, { backgroundColor: colors.canvas }]}>
          {MapView && Marker ? <MapView ref={map} style={StyleSheet.absoluteFill}
            initialRegion={{ latitude: center?.latitude ?? 48, longitude: center?.longitude ?? 10,
              latitudeDelta: center ? 0.04 : 20, longitudeDelta: center ? 0.04 : 20 }}
            toolbarEnabled={false}
            onPress={(event: MapPressEvent) => void pickCoordinate(event.nativeEvent.coordinate)}>
            {place ? <Marker coordinate={place} draggable pinColor={colors.primary}
              title={t('omw.selectedLocation')}
              onDragStart={() => { ++requestVersion.current; setPinBusy(true); }}
              onDragEnd={(event: MapPressEvent) => void pickCoordinate(event.nativeEvent.coordinate)} /> : null}
          </MapView> : <DriverNotice title={t('omw.mapUnavailable')} />}
        </View>
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <View style={styles.selection}>
            {pinBusy ? <ActivityIndicator color={colors.primary} /> : null}
            <DriverText variant="caption" secondary>{t('omw.selectedLocation')}</DriverText>
          </View>
          <DriverText>{place?.address || t('omw.mapPickHelp')}</DriverText>
          {addressUnavailable ? <DriverText variant="caption" secondary>{t('omw.mapAddressFallback')}</DriverText> : null}
          <DriverButton label={t('omw.useThisLocation')} disabled={!place || searchBusy}
            onPress={() => { if (place && !searchBusy) { ++requestVersion.current; onConfirm(place); } }} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: driverSpace.xl, gap: driverSpace.sm },
  title: { flex: 1 },
  search: { flexGrow: 0, maxHeight: '40%' },
  searchContent: { paddingHorizontal: driverLayout.gutter, paddingBottom: driverSpace.md, gap: driverSpace.sm },
  map: { flex: 1, minHeight: 100 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, padding: driverSpace.lg, gap: driverSpace.sm },
  selection: { flexDirection: 'row', alignItems: 'center', gap: driverSpace.sm },
});
