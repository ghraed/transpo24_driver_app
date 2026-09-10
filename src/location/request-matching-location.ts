import * as Location from 'expo-location';
import { AppState } from 'react-native';
import { readAccessToken } from '@/lib/auth-storage';
import { getDriverAvailability, updateDriverMatchingLocation } from '@/lib/api';

let pending: Promise<void> | null = null;

// Share a single foreground fix between the map, Jobs and the app heartbeat.
export function syncRequestMatchingLocation(): Promise<void> {
  if (pending) return pending;
  pending = sync().finally(() => { pending = null; });
  return pending;
}
async function sync(): Promise<void> {
  if (AppState.currentState !== 'active') return;
  const accessToken = await readAccessToken();
  if (!accessToken) return;
  const availability = await getDriverAvailability();
  if (!availability.isOnline) return;
  const permission = await Location.getForegroundPermissionsAsync();
  if (!permission.granted || !(await Location.hasServicesEnabledAsync())) {
    await updateDriverMatchingLocation(null, accessToken);
    return;
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let location: Location.LocationObject | null = null;
  try {
    location = await Location.getLastKnownPositionAsync({ maxAge: 30_000, requiredAccuracy: 200 });
    if (!location) {
      location = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>(resolve => { timeout = setTimeout(() => resolve(null), 6000); }),
      ]);
    }
  } catch {
    location = null;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  if (AppState.currentState !== 'active') return;
  const age = location ? Date.now() - location.timestamp : Infinity;
  await updateDriverMatchingLocation(location && age >= 0 && age <= 120_000 && location.coords.accuracy != null && location.coords.accuracy <= 200 ? {
    latitude: location.coords.latitude, longitude: location.coords.longitude, recordedAt: location.timestamp,
  } : null, accessToken);
}
