import { requestDriverPlaces } from '@/lib/api';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { GOOGLE_MAPS_API_KEY } from '@/config/maps';
import i18n from '@/localization/i18n';
import { localizeResponseMessage } from '@/localization/response-message';

type PlaceOperation = 'autocomplete' | 'details' | 'reverse';
type PlaceInput = { input: string } | { placeId: string } | { latitude: number; longitude: number };

async function requestPlaces(operation: PlaceOperation, input: PlaceInput): Promise<unknown> {
  try {
    return await requestDriverPlaces(operation, input);
  } catch (error) {
    const status = (error as { status?: number } | null)?.status;
    // Keep the existing Android provider usable during a backend rollout or
    // outage. Never fall back for authentication, validation or quota errors.
    // The iOS map-display key is not authorized for Places and must not be used.
    if (Platform.OS !== 'android' || !GOOGLE_MAPS_API_KEY || ![404, 502, 503].includes(status ?? 0)) throw error;
  }
  const params = new URLSearchParams({ key: GOOGLE_MAPS_API_KEY, language: i18n.resolvedLanguage ?? i18n.language ?? 'en' });
  let endpoint: string;
  if (operation === 'autocomplete') {
    endpoint = 'place/autocomplete';
    params.set('input', (input as { input: string }).input);
  } else if (operation === 'details') {
    endpoint = 'place/details';
    params.set('place_id', (input as { placeId: string }).placeId);
    params.set('fields', 'formatted_address,geometry');
  } else {
    endpoint = 'geocode';
    const point = input as { latitude: number; longitude: number };
    params.set('latlng', `${point.latitude},${point.longitude}`);
  }
  const headers: Record<string, string> = Application.applicationId === 'com.transpo24.driver'
    ? { 'X-Android-Package': Application.applicationId, 'X-Android-Cert': '359C7B65774F00084F35199870BBE8A38656ADF4' }
    : {};
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`https://maps.googleapis.com/maps/api/${endpoint}/json?${params}`, {
      headers, signal: controller.signal,
    });
    if (!response.ok) throw await placeResponseError('Places request failed.');
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

type PlacesAutocompleteResponse = {
  predictions?: {
    description: string;
    place_id: string;
  }[];
  status?: string;
  error_message?: string;
};

type PlaceDetailsResponse = {
  result?: {
    formatted_address?: string;
    geometry?: {
      location?: {
        lat: number;
        lng: number;
      };
    };
  };
  status?: string;
  error_message?: string;
};

type GeocodeResponse = {
  results?: {
    formatted_address?: string;
    place_id?: string;
  }[];
  plus_code?: {
    compound_code?: string;
    global_code?: string;
  };
  status?: string;
  error_message?: string;
};

export type PlaceAutocompleteSuggestion = {
  description: string;
  placeId: string;
};

export type ResolvedPlaceLocation = {
  latitude: number;
  longitude: number;
  address: string;
  placeId: string;
};

async function placeResponseError(sourceMessage: string, fallback = sourceMessage): Promise<Error> {
  const localized = await localizeResponseMessage(sourceMessage, fallback);
  return Object.assign(new Error(localized), { sourceMessage });
}

export async function searchPlacesAutocomplete(
  input: string,
): Promise<PlaceAutocompleteSuggestion[]> {
  const query = input.trim();

  if (!query) {
    return [];
  }

  const payload = await requestPlaces('autocomplete', { input: query }) as PlacesAutocompleteResponse;

  if (payload.status && payload.status !== 'OK' && payload.status !== 'ZERO_RESULTS') {
    throw await placeResponseError(
      payload.error_message ?? `Places API returned ${payload.status}.`,
      'Places autocomplete request failed.',
    );
  }

  const predictions = payload.predictions ?? [];

  return predictions.map((prediction) => ({
    description: prediction.description,
    placeId: prediction.place_id,
  }));
}

export async function fetchPlaceDetails(placeId: string): Promise<ResolvedPlaceLocation> {
  const payload = await requestPlaces('details', { placeId }) as PlaceDetailsResponse;

  if (payload.status && payload.status !== 'OK') {
    throw await placeResponseError(
      payload.error_message ?? `Place details returned ${payload.status}.`,
      'Place details request failed.',
    );
  }

  const lat = payload.result?.geometry?.location?.lat;
  const lng = payload.result?.geometry?.location?.lng;

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    throw await placeResponseError('Place details did not return coordinates.');
  }

  return {
    latitude: lat,
    longitude: lng,
    address: payload.result?.formatted_address ?? '',
    placeId,
  };
}

export async function resolvePlaceSuggestion(
  suggestion: PlaceAutocompleteSuggestion,
): Promise<ResolvedPlaceLocation> {
  const place = await fetchPlaceDetails(suggestion.placeId);

  return {
    ...place,
    address: place.address || suggestion.description,
  };
}

export async function resolvePlaceFromQuery(input: string): Promise<ResolvedPlaceLocation> {
  const suggestions = await searchPlacesAutocomplete(input);

  if (suggestions.length === 0) {
    throw await placeResponseError('No matching places found.');
  }

  return resolvePlaceSuggestion(suggestions[0]);
}

export async function reverseGeocodeCoordinates(
  latitude: number,
  longitude: number,
): Promise<ResolvedPlaceLocation | null> {
  const payload = await requestPlaces('reverse', { latitude, longitude }) as GeocodeResponse;

  if (payload.status && payload.status !== 'OK' && payload.status !== 'ZERO_RESULTS') {
    throw await placeResponseError(
      payload.error_message ?? `Reverse geocoding returned ${payload.status}.`,
      'Reverse geocoding request failed.',
    );
  }

  const firstResult = payload.results?.[0];
  const fallbackAddress = payload.plus_code?.compound_code ?? payload.plus_code?.global_code ?? '';
  const address = firstResult?.formatted_address ?? fallbackAddress;

  if (!address) {
    return null;
  }

  return {
    latitude,
    longitude,
    address,
    placeId: firstResult?.place_id ?? '',
  };
}
