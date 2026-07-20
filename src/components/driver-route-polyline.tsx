import { useEffect, useRef, useState } from 'react';

import { NativePolyline } from '@/components/native-maps';
import type { AddressedLocation, GeoLocation } from '@/types/trip.types';

type GoogleDirectionsRoute = {
  overview_polyline?: {
    points?: string;
  };
};

type GoogleDirectionsResponse = {
  status?: string;
  routes?: GoogleDirectionsRoute[];
};

type DriverRoutePolylineProps = {
  origin: GeoLocation | null;
  destination: AddressedLocation | null;
  apikey: string;
  strokeWidth?: number;
  strokeColor: string;
  onError?: (message: string) => void;
};

type RouteCoordinate = {
  latitude: number;
  longitude: number;
};

function decodePolyline(encoded: string): RouteCoordinate[] {
  const coordinates: RouteCoordinate[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    latitude += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    longitude += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;

    coordinates.push({
      latitude: latitude / 1e5,
      longitude: longitude / 1e5,
    });
  }

  return coordinates;
}

function buildDirectionsUrl(origin: GeoLocation, destination: AddressedLocation, apikey: string): string {
  const params = new URLSearchParams({
    origin: `${origin.latitude},${origin.longitude}`,
    destination: `${destination.latitude},${destination.longitude}`,
    key: apikey,
    mode: 'driving',
  });

  return `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`;
}

export function DriverRoutePolyline({
  origin,
  destination,
  apikey,
  strokeWidth = 4,
  strokeColor,
  onError,
}: DriverRoutePolylineProps) {
  const [coordinates, setCoordinates] = useState<RouteCoordinate[]>([]);
  const requestIdRef = useRef(0);
  const isReady = Boolean(origin && destination && apikey.trim());

  useEffect(() => {
    if (!isReady || !origin || !destination) {
      setCoordinates([]);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const controller = new AbortController();

    const fetchRoute = async (): Promise<void> => {
      try {
        const response = await fetch(buildDirectionsUrl(origin, destination, apikey), {
          signal: controller.signal,
        });
        const data = (await response.json()) as GoogleDirectionsResponse;

        if (controller.signal.aborted || requestIdRef.current !== requestId) {
          return;
        }

        if (data.status !== 'OK') {
          setCoordinates([]);
          onError?.(`Directions request failed: ${data.status ?? 'UNKNOWN_ERROR'}`);
          return;
        }

        const points = data.routes?.[0]?.overview_polyline?.points;
        if (!points) {
          setCoordinates([]);
          onError?.('Directions response did not include a route path.');
          return;
        }

        setCoordinates(decodePolyline(points));
      } catch {
        if (controller.signal.aborted) {
          return;
        }

        setCoordinates([]);
        onError?.('Unable to fetch route directions.');
      }
    };

    void fetchRoute();

    return () => {
      controller.abort();
    };
  }, [apikey, destination, isReady, onError, origin]);

  if (!isReady || !NativePolyline || coordinates.length === 0) {
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
