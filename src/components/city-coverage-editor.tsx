import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { NativeMapView, NativeMarker, type MapPressEvent } from '@/components/native-maps';
import { resolvePlaceFromQuery } from '@/lib/places';
import type { DriverCityCoverage } from '@/types/auth';

type Props = { cities: string[]; country?: string | null; pins: DriverCityCoverage[]; radius: string; onChange: (pins: DriverCityCoverage[]) => void };

export function CityCoverageEditor({ cities, country, pins, radius, onChange }: Props) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const searchVersion = useRef(0);
  useEffect(() => () => { searchVersion.current += 1; }, []);
  const MapView = NativeMapView;
  const Marker = NativeMarker;
  const pin = pins.find(p => p.city === editing);
  const update = (city: string, latitude: number, longitude: number) => {
    onChange([...pins.filter(p => p.city !== city), { city, latitude, longitude }]);
  };
  const search = async () => {
    if (!editing || !query.trim()) return;
    const version = ++searchVersion.current;
    const city = editing;
    setBusy(true);
    setError('');
    try {
      const place = await resolvePlaceFromQuery(query);
      if (version === searchVersion.current) update(city, place.latitude, place.longitude);
    } catch {
      if (version === searchVersion.current) setError(t('Unable to find this location. Try a more specific address.'));
    } finally {
      if (version === searchVersion.current) setBusy(false);
    }
  };
  return <View style={styles.section}>
    <Text style={styles.title}>{t('Scheduled pickup coverage')}</Text>
    <Text style={styles.hint}>{t('Each city pin uses your {{radius}} km radius. Search for a location, then tap the map to adjust the pin.', { radius })}</Text>
    {!cities.length && <Text style={styles.error}>{t('Select your cities in your profile before enabling scheduled requests.')}</Text>}
    {cities.map(city => <Pressable key={city} style={styles.row} onPress={() => {
      searchVersion.current += 1;
      setBusy(false); setError(''); setEditing(city); setQuery([city, country].filter(Boolean).join(', '));
    }}>
      <Text style={styles.label}>{city}</Text>
      <Text>{pins.some(p => p.city === city) ? t('Adjust pin') : t('Set pin')}</Text>
    </Pressable>)}
    {editing && <View style={styles.section}>
      <Text style={styles.title}>{editing}</Text>
      <TextInput style={styles.input} value={query} onChangeText={setQuery} placeholder={t('Search coverage address')} onSubmitEditing={() => void search()} />
      <Pressable style={styles.button} disabled={busy} onPress={() => void search()}>
        {busy ? <ActivityIndicator /> : <Text>{t('Find coverage pin')}</Text>}
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {pin && MapView && Marker ? <MapView key={`${editing}:${pin.latitude}:${pin.longitude}`} style={styles.map}
        initialRegion={{ latitude: pin.latitude, longitude: pin.longitude, latitudeDelta: 0.04, longitudeDelta: 0.04 }}
        onPress={(event: MapPressEvent) => update(editing, event.nativeEvent.coordinate.latitude, event.nativeEvent.coordinate.longitude)}>
        <Marker coordinate={pin} title={editing} />
      </MapView> : null}
      {pin && <Text style={styles.hint}>{t('Coverage pin saved in this form. Save availability to apply your changes.')}</Text>}
    </View>}
  </View>;
}
const styles = StyleSheet.create({
  section: { gap: 10, marginVertical: 12 }, title: { fontSize: 16, fontWeight: '700', color: '#172033' },
  hint: { color: '#596579', lineHeight: 20 }, error: { color: '#B42318' },
  row: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, backgroundColor: '#F2F4F7', borderRadius: 12 },
  label: { fontWeight: '600', flex: 1 }, input: { borderWidth: 1, borderColor: '#CBD5E1', padding: 12, borderRadius: 10 },
  button: { padding: 14, backgroundColor: '#FFC515', borderRadius: 12, alignItems: 'center' }, map: { height: 240, borderRadius: 12 },
});
