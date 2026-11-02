import { decodePolyline } from '@/lib/map-polyline';
import { AppState } from 'react-native';
import { useEffect, useRef, useState } from 'react';

import { NativePolyline } from '@/components/native-maps';
import { computeDriverRoutes } from '@/lib/api';
import { localizeResponseMessage } from '@/localization/response-message';
import type { AddressedLocation, GeoLocation } from '@/types/trip.types';
import { calculateDistanceMeters } from '@/utils/locationValidation';

const ROUTE_REFRESH_INTERVAL_MS = 15000;
const ROUTE_REFRESH_DISTANCE_METERS = 20;
const ROUTE_CACHE_MS = 5 * 60 * 1000;
// Keep recent routes through map expansion/navigation and brief network outages.
const routeCache = new Map<string, { coordinates: RouteCoordinate[]; savedAt: number }>();
function cachedRoute(key: string) {
  const entry = routeCache.get(key);
  return entry && Date.now() - entry.savedAt < ROUTE_CACHE_MS ? entry.coordinates : undefined;
}

type DriverRoutePolylineProps = {
  origin: GeoLocation | null;
  destination: AddressedLocation | null;
  apikey: string;
  strokeWidth?: number;
  strokeColor: string;
  onError?: (message: string) => void;
  onReady?: (coordinates: RouteCoordinate[]) => void;
};

type RouteCoordinate = {
  latitude: number;
  longitude: number;
};


export function DriverRoutePolyline({
  origin,
  destination,
  strokeWidth = 4,
  strokeColor,
  onError,
  onReady,
}: DriverRoutePolylineProps) {
  const [route, setRoute] = useState<{ destinationKey: string; coordinates: RouteCoordinate[] } | null>(null);
  const latest = useRef({ origin, onError, onReady });
  const isReady = Boolean(origin && destination);
  const latitude = destination?.latitude;
  const longitude = destination?.longitude;
  const destinationKey = `${latitude},${longitude}`;
  const cacheKey = `${origin?.latitude},${origin?.longitude}:${destinationKey}`;

  useEffect(() => {
    latest.current = { origin, onError, onReady };
  }, [origin, onError, onReady]);

  useEffect(() => {
    if (!isReady || latitude === undefined || longitude === undefined) return;

    const controller = new AbortController();
    let inFlight = false;
    let lastSuccessfulOrigin: GeoLocation | null = null;

    const fetchRoute = async (): Promise<void> => {
      const currentOrigin = latest.current.origin;
      if (!currentOrigin || inFlight || controller.signal.aborted) return;
      if (lastSuccessfulOrigin &&
        calculateDistanceMeters(lastSuccessfulOrigin, currentOrigin) < ROUTE_REFRESH_DISTANCE_METERS) return;

      inFlight = true;
      try {
        const data = await computeDriverRoutes(
          currentOrigin, { latitude, longitude }, controller.signal,
        );
        if (controller.signal.aborted) return;

        if (data.status !== 'OK') {
          throw new Error('Directions request failed.');
        }

        const points = data.routes?.[0]?.overview_polyline?.points;
        const coordinates = points ? decodePolyline(points) : [];
        if (coordinates.length < 2) {
          throw new Error('Directions response did not include a route path.');
        }

        const key = `${currentOrigin.latitude},${currentOrigin.longitude}:${destinationKey}`;
        if (routeCache.size >= 30) routeCache.delete(routeCache.keys().next().value!);
        routeCache.set(key, { coordinates, savedAt: Date.now() });
        lastSuccessfulOrigin = currentOrigin;
        setRoute({ destinationKey, coordinates });
        latest.current.onReady?.(coordinates);
      } catch {
        if (controller.signal.aborted) return;

        lastSuccessfulOrigin = null;
        const message = await localizeResponseMessage(
          'Unable to fetch route directions.',
          'Unable to fetch route directions.',
        );
        if (!controller.signal.aborted) latest.current.onError?.(message);
      } finally {
        inFlight = false;
      }
    };

    // GPS and parent renders must not cancel a route request before it finishes.
    // Refresh from the latest position at a bounded rate and retry transient failures.
    void fetchRoute();
    const refreshInterval = setInterval(() => void fetchRoute(), ROUTE_REFRESH_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void fetchRoute();
    });

    return () => {
      clearInterval(refreshInterval);
      subscription.remove();
      controller.abort();
    };
  }, [destinationKey, isReady, latitude, longitude]);

  const coordinates = route?.destinationKey === destinationKey ? route.coordinates : cachedRoute(cacheKey);
  if (!isReady || !NativePolyline || !coordinates) {
    return null;
  }

  return (
    <NativePolyline
      coordinates={coordinates}
      strokeWidth={strokeWidth}
      strokeColor={strokeColor}
    />
  );
}
