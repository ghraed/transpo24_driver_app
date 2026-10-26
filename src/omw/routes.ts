import { computeDriverRoutes } from '@/lib/api';
import { decodePolyline } from '@/lib/map-polyline';
import type { ResolvedPlaceLocation } from '@/lib/places';

export type OmwRoute = {
  id: string;
  summary: string;
  distanceMeters: number;
  durationSeconds: number;
  coordinates: { latitude: number; longitude: number }[];
};

type DirectionsRoute = {
  summary?: string;
  overview_polyline?: { points?: string };
  legs?: { distance?: { value?: number }; duration?: { value?: number } }[];
};

// Keep the provider's main alternatives, even when they share road names.
export function mainRoutes(routes: DirectionsRoute[]): OmwRoute[] {
  const seenPaths = new Set<string>();
  const result: OmwRoute[] = [];
  for (const route of routes) {
    const points = route.overview_polyline?.points;
    const summary = route.summary?.trim() ?? '';
    const legs = route.legs ?? [];
    if (!points || seenPaths.has(points) || !legs.length) continue;
    if (legs.some(leg => !Number.isFinite(leg.distance?.value) || !Number.isFinite(leg.duration?.value)
      || leg.distance!.value! <= 0 || leg.duration!.value! <= 0)) continue;
    const coordinates = decodePolyline(points);
    if (coordinates.length < 2) continue;
    seenPaths.add(points);
    result.push({
      id: points,
      summary,
      distanceMeters: legs.reduce((total, leg) => total + leg.distance!.value!, 0),
      durationSeconds: legs.reduce((total, leg) => total + leg.duration!.value!, 0),
      coordinates,
    });
    if (result.length === 3) break;
  }
  return result;
}

export async function findOmwRoutes(from: ResolvedPlaceLocation, to: ResolvedPlaceLocation, signal: AbortSignal, via?: ResolvedPlaceLocation | null): Promise<OmwRoute[]> {
  // Directions alternatives are unavailable with waypoints. Combine the main
  // alternatives for each side of the via place instead of silently ignoring it.
  if (via) {
    const [before, after] = await Promise.all([
      findOmwRoutes(from, via, signal), findOmwRoutes(via, to, signal),
    ]);
    return before.flatMap(first => after.map(second => ({
      id: `${first.id}|${second.id}`,
      summary: [...new Set([first.summary, second.summary].filter(Boolean))].join(' / '),
      distanceMeters: first.distanceMeters + second.distanceMeters,
      durationSeconds: first.durationSeconds + second.durationSeconds,
      coordinates: [...first.coordinates, ...second.coordinates],
    }))).sort((a, b) => a.durationSeconds - b.durationSeconds).slice(0, 3);
  }
  const data = await computeDriverRoutes(from, to, signal, true);
  if (data.status === 'ZERO_RESULTS') return [];
  if (data.status !== 'OK') throw new Error('Routes unavailable');
  return mainRoutes(data.routes ?? []);
}
