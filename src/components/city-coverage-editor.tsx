import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { NativeMapView, NativeMarker, type MapPressEvent } from '@/components/native-maps';
import { resolvePlaceFromQuery, resolvePlaceSuggestion, reverseGeocodeCoordinates, searchPlacesAutocomplete, type PlaceAutocompleteSuggestion } from '@/lib/places';
import type { DriverCityCoverage } from '@/types/auth';

type Props = { cities: string[]; country?: string | null; pins: DriverCityCoverage[]; radius: string; onChange: (pins: DriverCityCoverage[]) => void };

export function CityCoverageEditor({ cities, country, pins, radius, onChange }: Props) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<'search' | 'location' | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceAutocompleteSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState('');
  const searchVersion = useRef(0);
  useEffect(() => () => { searchVersion.current += 1; }, []);
  useEffect(() => {
    if (!editing || !isTyping || query.trim().length < 2) return;
    const version = searchVersion.current;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchPlacesAutocomplete(query);
        if (cancelled || version !== searchVersion.current) return;
        setSuggestions(results);
        setSearchMessage(t(results.length ? 'Choose a suggested address.' : 'No matching places found.'));
      } catch {
        if (!cancelled && version === searchVersion.current) {
          setSearchMessage(t('Places search failed. Please try again.'));
        }
      } finally {
        if (!cancelled && version === searchVersion.current) setIsSearching(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [editing, isTyping, query, t]);
  const MapView = NativeMapView;
  const Marker = NativeMarker;
  const pin = pins.find(p => p.city === editing);
  const update = (city: string, latitude: number, longitude: number) => {
    onChange([...pins.filter(p => p.city !== city), { city, latitude, longitude }]);
  };
  const resetSearch = () => {
    searchVersion.current += 1;
    setBusy(null);
    setSuggestions([]);
    setIsSearching(false);
    setSearchMessage('');
    setError('');
    setIsTyping(false);
    return searchVersion.current;
  };
  const search = async (suggestion?: PlaceAutocompleteSuggestion) => {
    if (!editing || !query.trim()) return;
    const version = resetSearch();
    const city = editing;
    setBusy('search');
    Keyboard.dismiss();
    try {
      const place = suggestion ? await resolvePlaceSuggestion(suggestion) : await resolvePlaceFromQuery(query);
      if (version !== searchVersion.current) return;
      update(city, place.latitude, place.longitude);
      setQuery(place.address);
    } catch {
      if (version === searchVersion.current) setError(t('Unable to find this location. Try a more specific address.'));
    } finally {
      if (version === searchVersion.current) setBusy(null);
    }
  };
  const loadCurrentLocation = async () => {
    if (!editing) return;
    const city = editing;
    const version = resetSearch();
    setBusy('location');
    Keyboard.dismiss();
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (version !== searchVersion.current) return;
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setError(t('Location permission denied. You can still select a location on the map.'));
        return;
      }
      const enabled = await Location.hasServicesEnabledAsync();
      if (version !== searchVersion.current) return;
      if (!enabled) {
        setError(t('Location services are off. Turn GPS on to use your current location, or select a location on the map.'));
        return;
      }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      if (version !== searchVersion.current) return;
      const { latitude, longitude } = location.coords;
      update(city, latitude, longitude);
      setQuery(t('Current location'));
      // An address lookup failure must not discard a valid GPS pin.
      const place = await reverseGeocodeCoordinates(latitude, longitude).catch(() => null);
      if (version === searchVersion.current && place?.address) setQuery(place.address);
    } catch {
      if (version === searchVersion.current) setError(t('Unable to access current location. You can still select a location manually.'));
    } finally {
      if (version === searchVersion.current) setBusy(null);
    }
  };
  return <View style={styles.section}>
    <Text style={styles.title}>{t('Scheduled pickup coverage')}</Text>
    <Text style={styles.hint}>{t('Each city pin uses your {{radius}} km radius. Search for a location, then tap the map to adjust the pin.', { radius })}</Text>
    {!cities.length && <Text style={styles.error}>{t('Select your cities in your profile before enabling scheduled requests.')}</Text>}
    {cities.map(city => <Pressable key={city} accessibilityRole="button" accessibilityLabel={city} style={styles.row} onPress={() => {
      resetSearch(); setEditing(city); setQuery([city, country].filter(Boolean).join(', '));
    }}>
      <Text style={styles.label}>{city}</Text>
      <Text>{pins.some(p => p.city === city) ? t('Adjust pin') : t('Set pin')}</Text>
    </Pressable>)}
    {editing && <View style={styles.section}>
      <Text style={styles.title}>{editing}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={t('Use Current Location')} style={styles.locationButton} disabled={busy !== null} onPress={() => void loadCurrentLocation()}>
        {busy === 'location' ? <><ActivityIndicator /><Text>{t('Getting your location...')}</Text></> : <Text>{t('Use Current Location')}</Text>}
      </Pressable>
      <TextInput style={styles.input} value={query} onChangeText={value => {
        resetSearch(); setQuery(value); setIsTyping(true);
      }} accessibilityLabel={t('Search coverage address')} placeholder={t('Search coverage address')} returnKeyType="search" autoCorrect={false} onSubmitEditing={() => void search()} />
      {isSearching ? <ActivityIndicator /> : null}
      {suggestions.length ? <View style={styles.suggestions}>
        {suggestions.map(suggestion => <Pressable key={suggestion.placeId} accessibilityRole="button" accessibilityLabel={suggestion.description} style={styles.suggestion} onPress={() => void search(suggestion)}>
          <Text style={styles.suggestionText}>{suggestion.description}</Text>
        </Pressable>)}
      </View> : null}
      {searchMessage ? <Text style={styles.hint}>{searchMessage}</Text> : null}
      <Pressable accessibilityRole="button" style={styles.button} disabled={busy !== null || !query.trim()} onPress={() => void search()}>
        {busy === 'search' ? <ActivityIndicator /> : <Text>{t('Find coverage pin')}</Text>}
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {pin && MapView && Marker ? <MapView key={`${editing}:${pin.latitude}:${pin.longitude}`} style={styles.map}
        initialRegion={{ latitude: pin.latitude, longitude: pin.longitude, latitudeDelta: 0.04, longitudeDelta: 0.04 }}
        onPress={(event: MapPressEvent) => {
          resetSearch();
          const { latitude, longitude } = event.nativeEvent.coordinate;
          update(editing, latitude, longitude);
          setQuery(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        }}>
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
  locationButton: { padding: 14, backgroundColor: '#F2F4F7', borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  suggestions: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, overflow: 'hidden' },
  suggestion: { padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#CBD5E1', backgroundColor: '#FFFFFF' },
  suggestionText: { color: '#172033', lineHeight: 20 },
});
