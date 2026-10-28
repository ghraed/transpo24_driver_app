import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import type { OmwTrip } from './context';

function key(driverId: string) { return `omw-trip-${encodeURIComponent(driverId)}.json`; }
export async function readOmwTrip(driverId: string): Promise<OmwTrip | null> {
  const file = Platform.OS === 'web' ? null : new File(Paths.document, key(driverId));
  const raw = file ? (file.exists ? await file.text() : null) : localStorage.getItem(key(driverId));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    const point = (p: any) => p && Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90
      && Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180;
    const place = (p: any) => point(p) && typeof p.address === 'string';
    const route = (r: any) => r && typeof r.id === 'string' && Array.isArray(r.coordinates)
      && r.coordinates.length >= 2 && r.coordinates.every(point);
    if (!place(value.from) || !place(value.to) || (value.via && !place(value.via))
      || !route(value.route) || !Array.isArray(value.routes) || !value.routes.every(route)
      || (value.arrivalReminderId != null && (typeof value.arrivalReminderId !== 'string' || !value.arrivalReminderId.trim()))
      || !Number.isFinite(value.radiusKm) || value.radiusKm < 1 || value.radiusKm > 50) return null;
    return value;
  } catch { return null; }
}
export async function writeOmwTrip(driverId: string, trip: OmwTrip | null): Promise<void> {
  if (Platform.OS === 'web') {
    if (trip) localStorage.setItem(key(driverId), JSON.stringify(trip));
    else localStorage.removeItem(key(driverId));
    return;
  }
  const file = new File(Paths.document, key(driverId));
  if (trip) { if (!file.exists) file.create(); file.write(JSON.stringify(trip)); }
  else if (file.exists) file.delete();
}
