import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { DriverIcon, DriverText } from '@/components/ui/driver-ui';
import { resolveOmwCurrentAddress } from './current-location';
import { searchPlacesAutocomplete, resolvePlaceSuggestion, type PlaceAutocompleteSuggestion, type ResolvedPlaceLocation } from '@/lib/places';
import { driverComponents, driverRadius, driverSpace, driverType, useDriverColors } from '@/theme/driver-theme';

export function OmwPlaceField({ label, value, onChange, disabled, onResolvingChange }: {
  label: string;
  value: ResolvedPlaceLocation | null;
  onChange: (place: ResolvedPlaceLocation | null) => void;
  disabled?: boolean;
  onResolvingChange?: (resolving: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const colors = useDriverColors();
  const [query, setQuery] = useState(value?.address ?? '');
  const [suggestions, setSuggestions] = useState<PlaceAutocompleteSuggestion[]>([]);
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState<'place' | 'location' | null>(null);
  const [error, setError] = useState('');
  const version = useRef(0);
  const resolutionVersion = useRef(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    ++version.current; ++resolutionVersion.current;
    if (blurTimer.current) clearTimeout(blurTimer.current);
  }, []);
  useEffect(() => {
    onResolvingChange?.(resolving !== null);
    return () => onResolvingChange?.(false);
  }, [resolving, onResolvingChange]);

  useEffect(() => {
    const request = ++version.current;
    let active = true;
    if (!focused || value || query.trim().length < 3) return;
    const timer = setTimeout(() => {
      setBusy(true);
      void searchPlacesAutocomplete(query).then(results => {
        if (!active || request !== version.current) return;
        setSuggestions(results.slice(0, 5));
        setError(results.length ? '' : t('omw.noPlaces'));
      }).catch(() => {
        if (active && request === version.current) setError(t('omw.placeError'));
      }).finally(() => { if (active && request === version.current) setBusy(false); });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [focused, query, value, t]);

  async function select(suggestion: PlaceAutocompleteSuggestion) {
    ++version.current;
    const request = ++resolutionVersion.current;
    setResolving('place');
    setBusy(true);
    setError('');
    setSuggestions([]);
    try {
      const place = await resolvePlaceSuggestion(suggestion);
      if (request !== resolutionVersion.current) return;
      setQuery(place.address);
      onChange(place);
      setFocused(false);
    } catch {
      if (request === resolutionVersion.current) setError(t('omw.placeError'));
    } finally {
      if (request === resolutionVersion.current) { setBusy(false); setResolving(null); }
    }
  }

  async function locate() {
    if (disabled || resolving === 'location') return;
    ++version.current;
    const request = ++resolutionVersion.current;
    setResolving('location'); setBusy(false); setSuggestions([]); setFocused(false); setError('');
    Keyboard.dismiss();
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (request !== resolutionVersion.current) return;
      if (!permission.granted) { setError(t('omw.locationPermission')); return; }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      if (request !== resolutionVersion.current) return;
      const place = await resolveOmwCurrentAddress(position.coords.latitude, position.coords.longitude);
      if (request !== resolutionVersion.current) return;
      if (!place) throw new Error('Address unavailable');
      setQuery(place.address);
      onChange(place);
      setFocused(false);
    } catch {
      if (request === resolutionVersion.current) setError(t('omw.locationUnavailable'));
    } finally {
      if (request === resolutionVersion.current) setResolving(null);
    }
  }

  return <View style={styles.field}>
    <DriverText variant="label">{label}</DriverText>
    <View style={[styles.inputRow, { borderColor: value ? colors.primary : colors.border, backgroundColor: colors.surface,
      flexDirection: i18n.dir() === 'rtl' ? 'row-reverse' : 'row' }]}>
      <TextInput
        accessibilityLabel={label}
        placeholder={t('omw.searchPlace')}
        placeholderTextColor={colors.textSecondary}
        value={query}
        editable={!disabled}
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setFocused(true);
        }}
        onBlur={() => {
          // Allow a suggestion's press to finish before hiding it on web.
          blurTimer.current = setTimeout(() => { setBusy(false); setFocused(false); }, 150);
        }}
        onChangeText={text => {
          ++version.current; ++resolutionVersion.current;
          setQuery(text); setSuggestions([]); setError(''); setBusy(false); setResolving(null); onChange(null);
        }}
        autoCorrect={false}
        style={[styles.input, { color: colors.text, textAlign: i18n.dir() === 'rtl' ? 'right' : 'left' }]}
      />
      <Pressable accessibilityRole="button"
        accessibilityLabel={t('omw.useCurrentLocation', { field: label })}
        accessibilityState={{ disabled: Boolean(disabled || resolving === 'location'), busy: resolving === 'location' }}
        disabled={disabled || resolving === 'location'} onPress={() => void locate()}
        style={({ pressed }) => [styles.locationButton, { opacity: disabled ? 0.4 : pressed ? 0.65 : 1 }]}>
        {resolving === 'location' ? <ActivityIndicator color={colors.primary} /> : <DriverIcon
          name={{ ios: 'location.viewfinder', android: 'my_location', web: 'my_location' }} color={colors.success} size={22} />}
      </Pressable>
      {busy ? <ActivityIndicator color={colors.primary} style={styles.searchSpinner} /> : null}
    </View>
    {focused && !disabled ? suggestions.map(suggestion => <Pressable
      key={suggestion.placeId}
      accessibilityRole="button"
      onPress={() => void select(suggestion)}
      style={({ pressed }) => [styles.suggestion, { backgroundColor: pressed ? colors.primarySoft : colors.surfaceSubtle }]}
    ><DriverText>{suggestion.description}</DriverText></Pressable>) : null}
    {error ? <DriverText variant="caption" style={{ color: colors.danger }} accessibilityLiveRegion="polite">{error}</DriverText> : null}
  </View>;
}

const styles = StyleSheet.create({
  field: { gap: driverSpace.sm },
  inputRow: { alignItems: 'center', borderWidth: 1, borderRadius: driverRadius.md },
  input: { ...driverType.body, flex: 1, minWidth: 0, minHeight: driverComponents.input.minHeight,
    padding: driverSpace.lg },
  locationButton: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  searchSpinner: { marginHorizontal: driverSpace.sm },
  suggestion: { minHeight: 48, padding: driverSpace.md, borderRadius: driverRadius.sm, justifyContent: 'center' },
});
