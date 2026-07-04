import type {
  DriverArrivedPickupConfirmedPayload,
  DriverLocationUpdatedPayload,
  GeoLocation,
  OfferAcceptedPayload,
} from '@/types/trip.types';

const PICKUP_ARRIVAL_RADIUS_METERS = 100;

export function isPositiveIntegerString(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

export function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

export function isValidGeoLocation(location: GeoLocation): boolean {
  return isValidLatitude(location.latitude) && isValidLongitude(location.longitude);
}

export function validateTripId(tripId: string): string | null {
  const normalized = tripId.trim();
  return normalized.length > 0 ? normalized : null;
}

export function calculateDistanceMeters(origin: GeoLocation, destination: GeoLocation): number {
  const earthRadiusMeters = 6371000;
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

  const lat1 = toRadians(origin.latitude);
  const lat2 = toRadians(destination.latitude);
  const deltaLat = toRadians(destination.latitude - origin.latitude);
  const deltaLon = toRadians(destination.longitude - origin.longitude);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

export function canMarkArrived(driverLocation: GeoLocation, pickupLocation: GeoLocation): boolean {
  return calculateDistanceMeters(driverLocation, pickupLocation) <= PICKUP_ARRIVAL_RADIUS_METERS;
}

function isRecord(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === 'object' && payload !== null;
}

export function validateOfferAcceptedPayload(payload: unknown): OfferAcceptedPayload | null {
  if (!isRecord(payload)) return null;
  const { tripId, driverId, customerId, pickupLocation, dropoffLocation, status } = payload;

  if (
    typeof tripId !== 'string' ||
    typeof driverId !== 'string' ||
    typeof customerId !== 'string' ||
    typeof status !== 'string' ||
    !isRecord(pickupLocation) ||
    !isRecord(dropoffLocation)
  ) {
    return null;
  }

  const pickupLatitude = pickupLocation.latitude;
  const pickupLongitude = pickupLocation.longitude;
  const dropoffLatitude = dropoffLocation.latitude;
  const dropoffLongitude = dropoffLocation.longitude;

  if (
    typeof pickupLatitude !== 'number' ||
    typeof pickupLongitude !== 'number' ||
    typeof dropoffLatitude !== 'number' ||
    typeof dropoffLongitude !== 'number'
  ) {
    return null;
  }

  const pickup = {
    latitude: pickupLatitude,
    longitude: pickupLongitude,
    address:
      typeof pickupLocation.address === 'string' || pickupLocation.address === null
        ? pickupLocation.address
        : null,
  };

  const dropoff = {
    latitude: dropoffLatitude,
    longitude: dropoffLongitude,
    address:
      typeof dropoffLocation.address === 'string' || dropoffLocation.address === null
        ? dropoffLocation.address
        : null,
  };

  if (!isValidGeoLocation({ latitude: pickup.latitude, longitude: pickup.longitude })) return null;
  if (!isValidGeoLocation({ latitude: dropoff.latitude, longitude: dropoff.longitude })) return null;

  return {
    tripId,
    driverId,
    customerId,
    pickupLocation: pickup,
    dropoffLocation: dropoff,
    status: status as OfferAcceptedPayload['status'],
  };
}

export function validateDriverLocationUpdatedPayload(
  payload: unknown,
): DriverLocationUpdatedPayload | null {
  if (!isRecord(payload)) return null;

  const { tripId, driverId, latitude, longitude, heading, speed, accuracy, recordedAt } = payload;

  if (
    typeof tripId !== 'string' ||
    typeof driverId !== 'string' ||
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    typeof recordedAt !== 'string'
  ) {
    return null;
  }

  if (!isValidGeoLocation({ latitude, longitude })) return null;

  return {
    tripId,
    driverId,
    latitude,
    longitude,
    heading: typeof heading === 'number' ? heading : null,
    speed: typeof speed === 'number' ? speed : null,
    accuracy: typeof accuracy === 'number' ? accuracy : null,
    recordedAt,
  };
}

export function validateDriverArrivedPickupConfirmedPayload(
  payload: unknown,
): DriverArrivedPickupConfirmedPayload | null {
  if (!isRecord(payload)) return null;
  const { tripId, driverId, status, arrivedAt } = payload;

  if (
    typeof tripId !== 'string' ||
    typeof driverId !== 'string' ||
    typeof status !== 'string' ||
    typeof arrivedAt !== 'string'
  ) {
    return null;
  }

  return {
    tripId,
    driverId,
    status: status as DriverArrivedPickupConfirmedPayload['status'],
    arrivedAt,
  };
}
