import * as Location from 'expo-location';
import { reverseGeocodeCoordinates, type ResolvedPlaceLocation } from '@/lib/places';

// The caller must obtain foreground location permission before resolving an address.
export async function resolveOmwCurrentAddress(latitude: number, longitude: number): Promise<ResolvedPlaceLocation | null> {
  try {
    const place = await reverseGeocodeCoordinates(latitude, longitude);
    if (place?.address.trim()) return { ...place, latitude, longitude, placeId: '' };
  } catch {
    // Match the client address fields when Google's geocoder is unavailable.
  }
  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    for (const result of results) {
      const street = [result.streetNumber, result.street].filter(Boolean).join(' ');
      const locality = [result.postalCode, result.city ?? result.district].filter(Boolean).join(' ');
      const parts = [street || result.name, locality, result.region, result.country]
        .map(part => part?.trim()).filter((part): part is string => Boolean(part));
      const address = result.formattedAddress?.trim() || [...new Set(parts)].join(', ');
      if (address) return { latitude, longitude, address, placeId: '' };
    }
  } catch {
    // Keep manual search available if neither provider can resolve the address.
  }
  return null;
}
