import { GOOGLE_MAPS_API_KEY } from '@/config/maps';
import i18n from '@/localization/i18n';
import { localizeResponseMessage } from '@/localization/response-message';

const PLACES_AUTOCOMPLETE_ENDPOINT =
  'https://maps.googleapis.com/maps/api/place/autocomplete/json';
const PLACE_DETAILS_ENDPOINT = 'https://maps.googleapis.com/maps/api/place/details/json';
const GEOCODE_ENDPOINT = 'https://maps.googleapis.com/maps/api/geocode/json';

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

  if (!GOOGLE_MAPS_API_KEY) {
    throw await placeResponseError('Google Maps API key is missing.');
  }

  const params = new URLSearchParams({
    input: query,
    key: GOOGLE_MAPS_API_KEY,
    language: i18n.resolvedLanguage ?? i18n.language ?? 'en',
  });

  const response = await fetch(`${PLACES_AUTOCOMPLETE_ENDPOINT}?${params.toString()}`);
  const payload = (await response.json()) as PlacesAutocompleteResponse;

  if (!response.ok) {
    throw await placeResponseError(
      payload.error_message ?? 'Places autocomplete request failed.',
      'Places autocomplete request failed.',
    );
  }

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
  if (!GOOGLE_MAPS_API_KEY) {
    throw await placeResponseError('Google Maps API key is missing.');
  }

  const params = new URLSearchParams({
    place_id: placeId,
    fields: 'formatted_address,geometry',
    key: GOOGLE_MAPS_API_KEY,
    language: i18n.resolvedLanguage ?? i18n.language ?? 'en',
  });

  const response = await fetch(`${PLACE_DETAILS_ENDPOINT}?${params.toString()}`);
  const payload = (await response.json()) as PlaceDetailsResponse;

  if (!response.ok) {
    throw await placeResponseError(
      payload.error_message ?? 'Place details request failed.',
      'Place details request failed.',
    );
  }

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
  if (!GOOGLE_MAPS_API_KEY) {
    throw await placeResponseError('Google Maps API key is missing.');
  }

  const params = new URLSearchParams({
    latlng: `${latitude},${longitude}`,
    key: GOOGLE_MAPS_API_KEY,
    language: i18n.resolvedLanguage ?? i18n.language ?? 'en',
  });

  const response = await fetch(`${GEOCODE_ENDPOINT}?${params.toString()}`);
  const payload = (await response.json()) as GeocodeResponse;

  if (!response.ok) {
    throw await placeResponseError(
      payload.error_message ?? 'Reverse geocoding request failed.',
      'Reverse geocoding request failed.',
    );
  }

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
