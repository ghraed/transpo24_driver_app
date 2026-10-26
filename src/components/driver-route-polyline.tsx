import { decodePolyline } from '@/lib/map-polyline';
import { useEffect, useRef, useState } from 'react';

import { NativePolyline } from '@/components/native-maps';
import { computeDriverRoutes } from '@/lib/api';
import { localizeResponseMessage } from '@/localization/response-message';
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
  const [coordinates, setCoordinates] = useState<RouteCoordinate[]>([]);
  const requestIdRef = useRef(0);
  const isReady = Boolean(origin && destination);

  useEffect(() => {
    if (!isReady || !origin || !destination) {
      const resetTimeout = setTimeout(() => {
        setCoordinates([]);
      }, 0);
      return () => {
        clearTimeout(resetTimeout);
      };
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const controller = new AbortController();

    const fetchRoute = async (): Promise<void> => {
      try {
        const data: GoogleDirectionsResponse = await computeDriverRoutes(origin, destination, controller.signal);

        if (controller.signal.aborted || requestIdRef.current !== requestId) {
          return;
        }

        if (data.status !== 'OK') {
          setCoordinates([]);
          onError?.(await localizeResponseMessage(
            `Directions request failed: ${data.status ?? 'UNKNOWN_ERROR'}`,
            'Directions request failed.',
          ));
          return;
        }

        const points = data.routes?.[0]?.overview_polyline?.points;
        if (!points) {
          setCoordinates([]);
          onError?.(await localizeResponseMessage(
            'Directions response did not include a route path.',
            'Directions response did not include a route path.',
          ));
          return;
        }

        const routeCoordinates = decodePolyline(points);
        setCoordinates(routeCoordinates);
        onReady?.(routeCoordinates);
      } catch {
        if (controller.signal.aborted) {
          return;
        }

        setCoordinates([]);
        onError?.(await localizeResponseMessage(
          'Unable to fetch route directions.',
          'Unable to fetch route directions.',
        ));
      }
    };

    void fetchRoute();

    return () => {
      controller.abort();
    };
  }, [destination, isReady, onError, onReady, origin]);

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
