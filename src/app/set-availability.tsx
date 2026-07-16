import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
} from '@/lib/api';
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  isNativeMapRuntimeAvailable,
  MapPressEvent,
  NativeMapView,
  NativeMarker,
  PROVIDER_GOOGLE,
  Region,
} from '@/components/native-maps';
import { getBackendApiBaseUrl } from '@/config/backend';
import { HAS_GOOGLE_MAPS_API_KEY } from '@/config/maps';
import { useAuth } from '@/context/auth-context';
import {
  clearLastOnboardingRoute,
  persistLastOnboardingRoute,
} from '@/lib/auth-storage';
import {
  reverseGeocodeCoordinates,
  resolvePlaceFromQuery,
  resolvePlaceSuggestion,
  searchPlacesAutocomplete,
  type PlaceAutocompleteSuggestion,
} from '@/lib/places';
import { nextStepToRoute } from '@/lib/onboarding-route';
import i18n from '@/localization/i18n';
import type {
  DayOfWeek,
  DriverAvailabilityForm,
  DriverAvailabilityFormDay,
  UpdateDriverAvailabilityPayload,
} from '@/types/auth';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_LABELS: Record<DayOfWeek, string> = {
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
  SATURDAY: 'Saturday',
  SUNDAY: 'Sunday',
};

const ORDERED_DAYS: DayOfWeek[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

const DEFAULT_MAP_REGION: Region = {
  latitude: 33.8938,
  longitude: 35.5018,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

type SelectedBaseLocation = {
  latitude: number;
  longitude: number;
  address?: string;
  placeId?: string;
  source?: 'device' | 'manual' | 'search';
};

function parseNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toMinutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function detectDefaultTimezone(countryCode?: string | null): string {
  if (countryCode?.toUpperCase() === 'CH') {
    return 'Europe/Zurich';
  }

  const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return deviceTimezone || 'UTC';
}

function formatAddressFromReverseGeocode(
  reverseGeocodeResult: Location.LocationGeocodedAddress | undefined,
): string {
  return [
    reverseGeocodeResult?.name,
    reverseGeocodeResult?.street,
    reverseGeocodeResult?.city,
    reverseGeocodeResult?.region,
  ]
    .filter(Boolean)
    .join(', ');
}

function buildRegion(latitude?: number, longitude?: number): Region {
  if (typeof latitude === 'number' && typeof longitude === 'number') {
    return {
      latitude,
      longitude,
      latitudeDelta: 0.03,
      longitudeDelta: 0.03,
    };
  }

  return DEFAULT_MAP_REGION;
}

function createDefaultWeeklySchedule(): DriverAvailabilityFormDay[] {
  return ORDERED_DAYS.map((day) => {
    const weekday = day !== 'SATURDAY' && day !== 'SUNDAY';
    return {
      dayOfWeek: day,
      label: i18n.t(DAY_LABELS[day]),
      isAvailable: weekday,
      startTime: weekday ? '08:00' : '',
      endTime: weekday ? '18:00' : '',
    };
  });
}

export default function SetAvailabilityScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const {
    driver,
    refreshDriverAvailability,
    saveDriverAvailability,
    signOut,
  } = useAuth();

  const [form, setForm] = useState<DriverAvailabilityForm>({
    timezone: detectDefaultTimezone(driver?.countryCode),
    isOnline: false,
    serviceRadiusKm: '30',
    baseLatitude: '',
    baseLongitude: '',
    baseAddress: '',
    acceptsImmediateRequests: true,
    acceptsScheduledRequests: true,
    weeklySchedule: createDefaultWeeklySchedule(),
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isGettingLocation, setIsGettingLocation] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>('');
  const [submitError, setSubmitError] = useState<string>('');
  const [submitSuccess, setSubmitSuccess] = useState<string>('');
  const [selectedLocation, setSelectedLocation] = useState<SelectedBaseLocation | null>(null);
  const [addressQuery, setAddressQuery] = useState<string>('');
  const [mapRegion, setMapRegion] = useState<Region>(DEFAULT_MAP_REGION);
  const [locationMessage, setLocationMessage] = useState<string>('');
  const [isLocationServicesDisabled, setIsLocationServicesDisabled] = useState<boolean>(false);
  const [searchMessage, setSearchMessage] = useState<string>('');
  const [isSearchingPlaces, setIsSearchingPlaces] = useState<boolean>(false);
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceAutocompleteSuggestion[]>([]);
  const suppressAutocompleteRef = useRef<boolean>(false);
  const mapRef = useRef<any>(null);
  const apiBaseUrl = (() => {
    try {
      return getBackendApiBaseUrl();
    } catch (error) {
      return error instanceof Error ? error.message : '(EXPO_PUBLIC_API_URL not set)';
    }
  })();

  useEffect(() => {
    void persistLastOnboardingRoute('/set-availability');
  }, []);

  const applyAvailability = useCallback((response: Awaited<ReturnType<typeof refreshDriverAvailability>>): void => {
    setForm({
      timezone: response.timezone || detectDefaultTimezone(driver?.countryCode),
      isOnline: response.isOnline,
      serviceRadiusKm: String(response.serviceRadiusKm ?? 30),
      baseLatitude: response.baseLatitude !== null ? String(response.baseLatitude) : '',
      baseLongitude: response.baseLongitude !== null ? String(response.baseLongitude) : '',
      baseAddress: response.baseAddress ?? '',
      acceptsImmediateRequests: response.acceptsImmediateRequests,
      acceptsScheduledRequests: response.acceptsScheduledRequests,
      weeklySchedule: ORDERED_DAYS.map((day) => {
        const found = response.weeklySchedule.find((entry) => entry.dayOfWeek === day);
        return {
          dayOfWeek: day,
          label: i18n.t(DAY_LABELS[day]),
          isAvailable: found?.isAvailable ?? false,
          startTime: found?.startTime ?? '',
          endTime: found?.endTime ?? '',
        };
      }),
    });
    setAddressQuery(response.baseAddress ?? '');
    setMapRegion(buildRegion(response.baseLatitude ?? undefined, response.baseLongitude ?? undefined));
    setSelectedLocation(
      response.baseLatitude !== null && response.baseLongitude !== null
        ? {
            latitude: response.baseLatitude,
            longitude: response.baseLongitude,
            address: response.baseAddress ?? undefined,
          }
        : null,
    );
  }, [driver?.countryCode, refreshDriverAvailability]);

  const loadAvailability = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setLoadError('');

    try {
      const response = await refreshDriverAvailability();
      applyAvailability(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('Failed to load availability.');
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }, [applyAvailability, refreshDriverAvailability, t]);

  useEffect(() => {
    void loadAvailability();
  }, [loadAvailability]);

  const fieldErrors = useMemo(() => {
    const errors: Record<string, string> = {};

    if (!form.timezone.trim()) {
      errors.timezone = t('Timezone is required.');
    }

    const radius = parseNumber(form.serviceRadiusKm);
    if (radius === undefined) {
      errors.serviceRadiusKm = t('Service radius is required and must be numeric.');
    } else if (radius < 1 || radius > 500) {
      errors.serviceRadiusKm = t('Service radius must be between 1 and 500 km.');
    }

    const latitude = parseNumber(form.baseLatitude);
    const longitude = parseNumber(form.baseLongitude);

    if ((latitude === undefined) !== (longitude === undefined)) {
      errors.baseLocation = t('Base latitude and longitude must be provided together.');
    }

    if (latitude !== undefined && (latitude < -90 || latitude > 90)) {
      errors.baseLatitude = t('Base latitude must be between -90 and 90.');
    }

    if (longitude !== undefined && (longitude < -180 || longitude > 180)) {
      errors.baseLongitude = t('Base longitude must be between -180 and 180.');
    }

    if (!form.acceptsImmediateRequests && !form.acceptsScheduledRequests) {
      errors.requestPreferences = t('Enable at least one request preference.');
    }

    if (form.weeklySchedule.length !== 7) {
      errors.weeklySchedule = t('Weekly schedule must contain exactly 7 days.');
    }

    const uniqueDays = new Set(form.weeklySchedule.map((day) => day.dayOfWeek));
    if (uniqueDays.size !== 7) {
      errors.weeklySchedule = t('Each day must appear once in weekly schedule.');
    }

    let availableDayCount = 0;

    form.weeklySchedule.forEach((day) => {
      if (!day.isAvailable) {
        return;
      }

      availableDayCount += 1;

      if (!day.startTime.trim()) {
        errors[`startTime-${day.dayOfWeek}`] = t('{{day}}: start time is required.', { day: day.label });
      } else if (!TIME_REGEX.test(day.startTime.trim())) {
        errors[`startTime-${day.dayOfWeek}`] = t('{{day}}: start time must be HH:mm.', { day: day.label });
      }

      if (!day.endTime.trim()) {
        errors[`endTime-${day.dayOfWeek}`] = t('{{day}}: end time is required.', { day: day.label });
      } else if (!TIME_REGEX.test(day.endTime.trim())) {
        errors[`endTime-${day.dayOfWeek}`] = t('{{day}}: end time must be HH:mm.', { day: day.label });
      }

      if (
        TIME_REGEX.test(day.startTime.trim()) &&
        TIME_REGEX.test(day.endTime.trim()) &&
        toMinutes(day.endTime.trim()) <= toMinutes(day.startTime.trim())
      ) {
        errors[`endTime-${day.dayOfWeek}`] = t('{{day}}: end time must be after start time.', { day: day.label });
      }
    });

    if (availableDayCount === 0) {
      errors.availableDays = t('At least one day must be available.');
    }

    return errors;
  }, [form, t]);

  const isFormValid = Object.keys(fieldErrors).length === 0;

  const onChange = <K extends keyof DriverAvailabilityForm>(
    key: K,
    value: DriverAvailabilityForm[K],
  ): void => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onScheduleChange = (
    dayOfWeek: DayOfWeek,
    patch: Partial<DriverAvailabilityFormDay>,
  ): void => {
    setForm((prev) => ({
      ...prev,
      weeklySchedule: prev.weeklySchedule.map((entry) =>
        entry.dayOfWeek === dayOfWeek ? { ...entry, ...patch } : entry,
      ),
    }));
  };

  const applySelectedLocation = useCallback((location: SelectedBaseLocation | null): void => {
    setSelectedLocation(location);
    setForm((prev) => ({
      ...prev,
      baseLatitude: location ? String(location.latitude) : '',
      baseLongitude: location ? String(location.longitude) : '',
      baseAddress: location?.address ?? '',
    }));
  }, []);

  const resolveSelectionAddress = useCallback(
    async (latitude: number, longitude: number): Promise<{ address?: string; placeId?: string }> => {
      try {
        const resolved = await reverseGeocodeCoordinates(latitude, longitude);
        if (resolved?.address) {
          return {
            address: resolved.address,
            placeId: resolved.placeId || undefined,
          };
        }
      } catch {
        // Keep expo-location reverse geocoding as a fallback.
      }

      try {
        const reverse = await Location.reverseGeocodeAsync({ latitude, longitude });
        const formattedAddress = formatAddressFromReverseGeocode(reverse[0]);
        return formattedAddress ? { address: formattedAddress } : {};
      } catch {
        return {};
      }
    },
    [],
  );

  const applyCurrentLocation = useCallback(
    async (location: Location.LocationObject) => {
      const nextRegion: Region = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.03,
        longitudeDelta: 0.03,
      };

      setMapRegion(nextRegion);
      setLocationMessage('');
      setSubmitError('');
      setIsLocationServicesDisabled(false);
      const resolved = await resolveSelectionAddress(
        location.coords.latitude,
        location.coords.longitude,
      );

      const nextLocation: SelectedBaseLocation = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        address: resolved.address || t('Current location'),
        placeId: resolved.placeId,
        source: 'device',
      };
      mapRef.current?.animateToRegion?.(nextRegion, 350);
      suppressAutocompleteRef.current = true;
      setAddressQuery(nextLocation.address ?? '');
      applySelectedLocation(nextLocation);
    },
    [applySelectedLocation, resolveSelectionAddress, t],
  );

  const loadCurrentLocation = useCallback(async (requestPermission: boolean) => {
    setIsGettingLocation(true);

    try {
      const permission = requestPermission
        ? await Location.requestForegroundPermissionsAsync()
        : await Location.getForegroundPermissionsAsync();

      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setIsLocationServicesDisabled(false);
        setLocationMessage(t('Location permission denied. You can still select a location on the map.'));
        return;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setIsLocationServicesDisabled(true);
        setLocationMessage(
          t('Location services are off. Turn GPS on to use your current location, or select a location on the map.'),
        );
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
        mayShowUserSettingsDialog: true,
        timeInterval: 1000,
        distanceInterval: 1,
      });

      await applyCurrentLocation(current);
    } catch {
      setIsLocationServicesDisabled(false);
      setLocationMessage(t('Unable to access current location. You can still select a location manually.'));
    } finally {
      setIsGettingLocation(false);
    }
  }, [applyCurrentLocation, t]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadCurrentLocation(true);
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadCurrentLocation]);

  useEffect(() => {
    if (!isLocationServicesDisabled) {
      return;
    }

    const intervalId = setInterval(() => {
      void loadCurrentLocation(false);
    }, 2500);

    return () => clearInterval(intervalId);
  }, [isLocationServicesDisabled, loadCurrentLocation]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void loadCurrentLocation(false);
      }
    });

    return () => subscription.remove();
  }, [loadCurrentLocation]);

  const applyBaseLocationSelection = useCallback(
    async (
      latitude: number,
      longitude: number,
      address?: string,
      placeId?: string,
      source?: SelectedBaseLocation['source'],
    ): Promise<void> => {
      let resolvedAddress = address?.trim() || '';
      let resolvedPlaceId = placeId;

      if (!resolvedAddress) {
        const resolved = await resolveSelectionAddress(latitude, longitude);
        resolvedAddress = resolved.address ?? '';
        resolvedPlaceId = resolved.placeId ?? placeId;
      }

      const nextLocation: SelectedBaseLocation = {
        latitude,
        longitude,
        address: resolvedAddress || undefined,
        placeId: resolvedPlaceId,
        source,
      };

      suppressAutocompleteRef.current = true;
      setAddressQuery(nextLocation.address ?? '');
      const nextRegion = buildRegion(latitude, longitude);
      setMapRegion(nextRegion);
      mapRef.current?.animateToRegion?.(nextRegion, 350);
      applySelectedLocation(nextLocation);
      setPlaceSuggestions([]);
      setSearchMessage(
        nextLocation.address
          ? t('Pinned: {{address}}', { address: nextLocation.address })
          : t('Selected base location.'),
      );
    },
    [applySelectedLocation, resolveSelectionAddress, t],
  );

  useEffect(() => {
    if (suppressAutocompleteRef.current) {
      suppressAutocompleteRef.current = false;
      return;
    }

    const query = addressQuery.trim();

    if (!query) return;

    if (!HAS_GOOGLE_MAPS_API_KEY) {
      return;
    }

    let isCancelled = false;
    const timeoutId = setTimeout(() => {
      const loadSuggestions = async (): Promise<void> => {
        setIsSearchingPlaces(true);
        try {
          const suggestions = await searchPlacesAutocomplete(query);
          if (isCancelled) return;
          setPlaceSuggestions(suggestions);
          setSearchMessage(
            suggestions.length === 0
              ? t('No matching places found.')
              : t('Choose a suggested address.'),
          );
        } catch (error) {
          if (isCancelled) return;
          setPlaceSuggestions([]);
          setSearchMessage(
            error instanceof Error ? error.message : t('Places search failed. Please try again.'),
          );
        } finally {
          if (!isCancelled) {
            setIsSearchingPlaces(false);
          }
        }
      };

      void loadSuggestions();
    }, 250);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [addressQuery, t]);

  const onSuggestionPress = useCallback(async (suggestion: PlaceAutocompleteSuggestion) => {
    setIsSearchingPlaces(true);
    setSearchMessage('');

    try {
      const place = await resolvePlaceSuggestion(suggestion);
      await applyBaseLocationSelection(
        place.latitude,
        place.longitude,
        place.address,
        place.placeId,
        'search',
      );
    } catch (error) {
      setSearchMessage(
        error instanceof Error ? error.message : t('Places search failed. Please try again.'),
      );
    } finally {
      setIsSearchingPlaces(false);
    }
  }, [applyBaseLocationSelection, t]);

  const onSearchSubmit = useCallback(async () => {
    const query = addressQuery.trim();

    if (!query) {
      setSearchMessage(t('Type an address first to search places.'));
      return;
    }

    if (!HAS_GOOGLE_MAPS_API_KEY) {
      setSearchMessage(t('Google Places key is missing. Check your map environment configuration.'));
      return;
    }

    setIsSearchingPlaces(true);
    setSearchMessage('');

    try {
      if (placeSuggestions.length > 0) {
        const place = await resolvePlaceSuggestion(placeSuggestions[0]);
        await applyBaseLocationSelection(
          place.latitude,
          place.longitude,
          place.address,
          place.placeId,
          'search',
        );
        return;
      }

      const place = await resolvePlaceFromQuery(query);
      await applyBaseLocationSelection(
        place.latitude,
        place.longitude,
        place.address,
        place.placeId,
        'search',
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('Places search failed. Please try again.');
      setSearchMessage(message);
    } finally {
      setIsSearchingPlaces(false);
    }
  }, [addressQuery, applyBaseLocationSelection, placeSuggestions, t]);

  const onMapPress = useCallback((event: MapPressEvent) => {
    const coordinates = event.nativeEvent.coordinate;
    void applyBaseLocationSelection(
      coordinates.latitude,
      coordinates.longitude,
      undefined,
      undefined,
      'manual',
    );
    setSubmitError('');
  }, [applyBaseLocationSelection]);

  const onUseCurrentLocation = async (): Promise<void> => {
    setSubmitError('');
    setSubmitSuccess('');
    await loadCurrentLocation(true);
  };

  const onContinue = async (): Promise<void> => {
    if (!isFormValid || isSaving) {
      return;
    }

    setSubmitError('');
    setSubmitSuccess('');
    setIsSaving(true);

    const radiusValue = Number(form.serviceRadiusKm.trim());
    const latitude = parseNumber(form.baseLatitude);
    const longitude = parseNumber(form.baseLongitude);

    const payload: UpdateDriverAvailabilityPayload = {
      timezone: form.timezone.trim(),
      isOnline: form.isOnline,
      serviceRadiusKm: radiusValue,
      baseLatitude: latitude,
      baseLongitude: longitude,
      baseAddress: form.baseAddress.trim() || undefined,
      acceptsImmediateRequests: form.acceptsImmediateRequests,
      acceptsScheduledRequests: form.acceptsScheduledRequests,
      weeklySchedule: form.weeklySchedule.map((day) => ({
        dayOfWeek: day.dayOfWeek,
        isAvailable: day.isAvailable,
        startTime: day.isAvailable ? day.startTime.trim() : undefined,
        endTime: day.isAvailable ? day.endTime.trim() : undefined,
      })),
    };

    try {
      const response = await saveDriverAvailability(payload);
      setSubmitSuccess(
        t('Availability saved. Online: {{online}} | Radius: {{radius}} km', {
          online: response.isOnline ? t('YES') : t('NO'),
          radius: response.serviceRadiusKm,
        }),
      );

      if (response.nextStep === 'SET_AVAILABILITY') {
        setSubmitError(t('Please complete all required availability fields.'));
        return;
      }

      if (response.nextStep === 'HOME') {
        await clearLastOnboardingRoute();
      }

      router.replace(nextStepToRoute(response.nextStep));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('Failed to save availability.');
      const normalized = message.toLowerCase();

      if (
        normalized.includes('invalid or expired token') ||
        normalized.includes('authorization') ||
        normalized.includes('unauthorized')
      ) {
        await signOut();
        router.replace('/');
        return;
      }

      if (normalized.includes('profile must be completed')) {
        setSubmitError(t('Profile is incomplete. Redirecting to Complete Profile...'));
        setTimeout(() => {
          router.replace('/complete-profile');
        }, 700);
        return;
      }

      if (normalized.includes('vehicle') || normalized.includes('documents')) {
        setSubmitSuccess(t('Continuing to approval despite backend document prerequisite.'));
        setSubmitError('');
        router.replace('/waiting-approval');
        return;
      }

      setSubmitError(message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1D4ED8" />
        <Text style={styles.loadingText}>{t('Loading availability...')}</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>{loadError}</Text>
        <Pressable style={styles.retryButton} onPress={() => void loadAvailability()}>
          <Text style={styles.retryButtonText}>{t('Retry')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.replace('/vehicle-documents')}>
            <Text style={styles.backButtonText}>{t('Back')}</Text>
          </Pressable>
          <Text style={styles.progress}>{t('Step 3 of 3: Availability')}</Text>
          <Text style={styles.title}>{t('Set Your Availability')}</Text>
          <Text style={styles.subtitle}>
            {t('Choose when and where you can receive transport requests.')}
          </Text>
          <Text style={styles.helper}>
            {t('Your availability helps us match you with transport requests at the right time and place.')}
          </Text>
          <Text style={styles.endpointText}>{t('Backend')}: {apiBaseUrl}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('Service Area')}</Text>

          <Text style={styles.fieldLabel}>{t('Timezone *')}</Text>
          <TextInput
            style={styles.input}
            value={form.timezone}
            onChangeText={(value) => onChange('timezone', value)}
            placeholder="Europe/Zurich"
            autoCapitalize="none"
          />
          {fieldErrors.timezone ? <Text style={styles.errorText}>{fieldErrors.timezone}</Text> : null}

          <Text style={styles.fieldLabel}>{t('Service radius (km) *')}</Text>
          <TextInput
            style={styles.input}
            value={form.serviceRadiusKm}
            onChangeText={(value) => onChange('serviceRadiusKm', value)}
            placeholder="30"
            keyboardType="number-pad"
          />
          {fieldErrors.serviceRadiusKm ? <Text style={styles.errorText}>{fieldErrors.serviceRadiusKm}</Text> : null}

          <Text style={styles.fieldLabel}>{t('Base address')}</Text>
          <View style={styles.searchContainer}>
            <TextInput
              value={addressQuery}
              onChangeText={(value) => {
                setAddressQuery(value);
                setSubmitError('');
                setPlaceSuggestions([]);
                setSearchMessage('');
              }}
              onSubmitEditing={() => void onSearchSubmit()}
              placeholder={t('Search base address')}
              placeholderTextColor="#98A2B3"
              style={styles.searchInput}
              returnKeyType="search"
            />
            <Text style={styles.searchHint}>
              {HAS_GOOGLE_MAPS_API_KEY
                ? t('Google Places API key is configured.')
                : t('Google Places API key is not configured yet.')}
            </Text>
            <Text style={styles.searchHint}>
              {t('Start typing and tap a suggestion to pin the base location.')}
            </Text>
            {placeSuggestions.length > 0 ? (
              <View style={styles.suggestionsList}>
                {placeSuggestions.map((suggestion) => (
                  <Pressable
                    key={suggestion.placeId}
                    style={styles.suggestionItem}
                    onPress={() => void onSuggestionPress(suggestion)}
                  >
                    <Text style={styles.suggestionText}>{suggestion.description}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Pressable
              style={[styles.locationButton, isGettingLocation && styles.locationButtonDisabled]}
              onPress={() => void onUseCurrentLocation()}
              disabled={isGettingLocation}
            >
              {isGettingLocation ? (
                <ActivityIndicator size="small" color="#1A73E8" />
              ) : (
                <Text style={styles.locationButtonText}>{t('Use Current Location')}</Text>
              )}
            </Pressable>
            {isSearchingPlaces ? (
              <ActivityIndicator style={styles.searchSpinner} size="small" color="#1A73E8" />
            ) : null}
            {searchMessage ? <Text style={styles.searchHint}>{searchMessage}</Text> : null}
          </View>

          <View style={styles.mapContainer}>
            {isNativeMapRuntimeAvailable && NativeMapView && NativeMarker ? (
              <NativeMapView
                ref={mapRef}
                provider={PROVIDER_GOOGLE}
                style={styles.map}
                initialRegion={mapRegion}
                region={mapRegion}
                onRegionChangeComplete={setMapRegion}
                onPress={onMapPress}
              >
                {selectedLocation ? (
                  <NativeMarker
                    coordinate={{
                      latitude: selectedLocation.latitude,
                      longitude: selectedLocation.longitude,
                    }}
                    title={t('Base location')}
                    description={selectedLocation.address ?? t('Selected location')}
                  />
                ) : null}
              </NativeMapView>
            ) : (
              <View style={styles.mapFallback}>
                <Text style={styles.mapFallbackTitle}>{t('Map preview is not available on web.')}</Text>
                <Text style={styles.mapFallbackText}>
                  {t('Search for an address above to pin the base location, or open the app on iOS or Android for full map selection.')}
                </Text>
              </View>
            )}

            {isGettingLocation ? (
              <View style={styles.mapOverlay}>
                <ActivityIndicator size="small" color="#1A73E8" />
                <Text style={styles.mapOverlayText}>{t('Getting your location...')}</Text>
              </View>
            ) : null}
          </View>

          {locationMessage ? <Text style={styles.infoMessage}>{locationMessage}</Text> : null}

          <View style={styles.bottomCard}>
            <Text style={styles.bottomTitle}>
              {selectedLocation?.address?.trim()
                  ? selectedLocation.address
                  : selectedLocation
                  ? t('Selected location')
                  : t('Tap on the map or search for an address.')}
            </Text>
            {selectedLocation ? (
              <Text style={styles.bottomDetails}>
                {t('Lat')}: {selectedLocation.latitude.toFixed(6)}  |  {t('Lng')}: {selectedLocation.longitude.toFixed(6)}
              </Text>
            ) : null}
          </View>

          <View style={styles.row}>
            <View style={styles.halfWidth}>
              <Text style={styles.fieldLabel}>{t('Base latitude')}</Text>
              <TextInput
                style={styles.input}
                value={form.baseLatitude}
                onChangeText={(value) => onChange('baseLatitude', value)}
                placeholder="47.3769"
                keyboardType="decimal-pad"
              />
              {fieldErrors.baseLatitude ? <Text style={styles.errorText}>{fieldErrors.baseLatitude}</Text> : null}
            </View>
            <View style={styles.halfWidth}>
              <Text style={styles.fieldLabel}>{t('Base longitude')}</Text>
              <TextInput
                style={styles.input}
                value={form.baseLongitude}
                onChangeText={(value) => onChange('baseLongitude', value)}
                placeholder="8.5417"
                keyboardType="decimal-pad"
              />
              {fieldErrors.baseLongitude ? <Text style={styles.errorText}>{fieldErrors.baseLongitude}</Text> : null}
            </View>
          </View>
          {fieldErrors.baseLocation ? <Text style={styles.errorText}>{fieldErrors.baseLocation}</Text> : null}

        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('Request Preferences')}</Text>

          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>{t('Accept immediate requests')}</Text>
            <Switch
              value={form.acceptsImmediateRequests}
              onValueChange={(value) => onChange('acceptsImmediateRequests', value)}
            />
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>{t('Accept scheduled requests')}</Text>
            <Switch
              value={form.acceptsScheduledRequests}
              onValueChange={(value) => onChange('acceptsScheduledRequests', value)}
            />
          </View>

          {fieldErrors.requestPreferences ? (
            <Text style={styles.errorText}>{fieldErrors.requestPreferences}</Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('Weekly Schedule')}</Text>

          {form.weeklySchedule.map((day) => {
            const startKey = `startTime-${day.dayOfWeek}`;
            const endKey = `endTime-${day.dayOfWeek}`;

            return (
              <View key={day.dayOfWeek} style={styles.dayCard}>
                <View style={styles.switchRow}>
                  <Text style={styles.dayTitle}>{day.label}</Text>
                  <Switch
                    value={day.isAvailable}
                    onValueChange={(value) =>
                      onScheduleChange(day.dayOfWeek, {
                        isAvailable: value,
                        startTime: value ? day.startTime || '08:00' : '',
                        endTime: value ? day.endTime || '18:00' : '',
                      })
                    }
                  />
                </View>

                {day.isAvailable ? (
                  <View style={styles.row}>
                    <View style={styles.halfWidth}>
                      <Text style={styles.fieldLabel}>{t('Start (HH:mm)')}</Text>
                      <TextInput
                        style={styles.input}
                        value={day.startTime}
                        onChangeText={(value) => onScheduleChange(day.dayOfWeek, { startTime: value })}
                        placeholder="08:00"
                        autoCapitalize="none"
                      />
                      {fieldErrors[startKey] ? <Text style={styles.errorText}>{fieldErrors[startKey]}</Text> : null}
                    </View>
                    <View style={styles.halfWidth}>
                      <Text style={styles.fieldLabel}>{t('End (HH:mm)')}</Text>
                      <TextInput
                        style={styles.input}
                        value={day.endTime}
                        onChangeText={(value) => onScheduleChange(day.dayOfWeek, { endTime: value })}
                        placeholder="18:00"
                        autoCapitalize="none"
                      />
                      {fieldErrors[endKey] ? <Text style={styles.errorText}>{fieldErrors[endKey]}</Text> : null}
                    </View>
                  </View>
                ) : (
                  <Text style={styles.helper}>{t('Unavailable')}</Text>
                )}
              </View>
            );
          })}

          {fieldErrors.availableDays ? <Text style={styles.errorText}>{fieldErrors.availableDays}</Text> : null}
          {fieldErrors.weeklySchedule ? <Text style={styles.errorText}>{fieldErrors.weeklySchedule}</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('Online Status')}</Text>
          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>{t('Go Online')}</Text>
            <Switch value={form.isOnline} onValueChange={(value) => onChange('isOnline', value)} />
          </View>
          <Text style={styles.helper}>
            {t('You can save availability now. Going online may be enabled after account approval.')}
          </Text>
        </View>

        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
        {submitSuccess ? <Text style={styles.successText}>{submitSuccess}</Text> : null}

        <Pressable
          style={[styles.primaryButton, (!isFormValid || isSaving) && styles.primaryButtonDisabled]}
          onPress={() => void onContinue()}
          disabled={!isFormValid || isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>{t('Save & Continue')}</Text>
          )}
        </Pressable>

        {isSaving ? <Text style={styles.statusText}>{t('Saving availability...')}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    padding: 20,
    gap: 10,
  },
  loadingText: {
    color: '#475569',
  },
  content: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 30,
    gap: 12,
  },
  header: {
    gap: 4,
    marginBottom: 4,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingRight: 12,
  },
  backButtonText: {
    color: '#1D4ED8',
    fontWeight: '700',
    fontSize: 14,
  },
  progress: {
    color: '#1D4ED8',
    fontWeight: '700',
    fontSize: 13,
  },
  title: {
    fontSize: 27,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    color: '#475569',
    fontSize: 14,
  },
  helper: {
    color: '#64748B',
    fontSize: 13,
  },
  endpointText: {
    color: '#0369A1',
    fontSize: 12,
    marginTop: 2,
  },
  section: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  fieldLabel: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
  },
  searchContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E7EC',
    borderRadius: 12,
    padding: 10,
  },
  searchInput: {
    height: 44,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#101828',
    backgroundColor: '#FFFFFF',
  },
  searchHint: {
    marginTop: 6,
    fontSize: 12,
    color: '#667085',
  },
  searchSpinner: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  suggestionsList: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#EAECF0',
  },
  suggestionText: {
    fontSize: 14,
    color: '#101828',
  },
  locationButton: {
    marginTop: 10,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationButtonDisabled: {
    opacity: 0.7,
  },
  locationButtonText: {
    color: '#1D4ED8',
    fontSize: 14,
    fontWeight: '700',
  },
  mapContainer: {
    height: 280,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E4E7EC',
    backgroundColor: '#FFFFFF',
  },
  map: {
    flex: 1,
  },
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#EEF2F7',
    gap: 8,
  },
  mapFallbackTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  mapFallbackText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#475467',
    textAlign: 'center',
  },
  mapOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mapOverlayText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '500',
  },
  infoMessage: {
    marginTop: 8,
    color: '#B54708',
    fontSize: 13,
  },
  bottomCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    padding: 12,
  },
  bottomTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  bottomDetails: {
    marginTop: 4,
    color: '#475467',
    fontSize: 13,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 12,
  },
  successText: {
    color: '#15803D',
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  halfWidth: {
    flex: 1,
    gap: 4,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  dayTitle: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 14,
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 10,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  testingApproveButton: {
    marginTop: 6,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  testingApproveButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  workflowNoteTitle: {
    marginTop: 6,
    color: '#7F1D1D',
    fontWeight: '700',
    fontSize: 12,
  },
  workflowNoteText: {
    color: '#991B1B',
    fontSize: 12,
    lineHeight: 18,
  },
  debugBox: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    padding: 8,
    gap: 4,
  },
  debugTitle: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 12,
  },
  debugText: {
    color: '#334155',
    fontSize: 12,
  },
  statusText: {
    textAlign: 'center',
    color: '#475569',
    fontSize: 12,
  },
  retryButton: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
