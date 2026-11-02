import type { NavigationLocation } from '@/hooks/use-navigation-camera';

const MAX_AGE_MS = 60_000;
let latest: { tripId: string; location: NavigationLocation; recordedAt: number } | undefined;

/** Display continuity across trip screens; never substitute another trip's GPS. */
export function rememberTripLocation(tripId: string, location: NavigationLocation): void {
  if (!tripId || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude) ||
      Math.abs(location.latitude) > 90 || Math.abs(location.longitude) > 180) return;
  latest = { tripId, location: { ...location }, recordedAt: Date.now() };
}

export function getRecentTripLocation(tripId: string): NavigationLocation | null {
  if (!latest || latest.tripId !== tripId || Date.now() - latest.recordedAt > MAX_AGE_MS) return null;
  return { ...latest.location };
}
