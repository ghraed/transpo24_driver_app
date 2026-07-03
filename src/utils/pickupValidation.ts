import type {
  GeoLocation,
  PickupItemRequest,
  PickupItemResponse,
  TripStatus,
} from '@/types/trip.types';

const PICKUP_CONFIRM_RADIUS_METERS = 150;
const TRIP_ID_MIN_LENGTH = 8;
const TRIP_ID_MAX_LENGTH = 64;

const TRIP_STATUSES: readonly TripStatus[] = [
  'PENDING_REQUEST',
  'DRIVER_OFFER_SENT',
  'OFFER_ACCEPTED',
  'DRIVER_GOING_TO_PICKUP',
  'DRIVER_ARRIVED_PICKUP',
  'ITEM_PICKED_UP',
  'DRIVER_GOING_TO_DROPOFF',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
] as const;

function isRecord(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === 'object' && payload !== null;
}

export function isValidTripId(value: string): boolean {
  const normalized = value.trim();
  return normalized.length >= TRIP_ID_MIN_LENGTH && normalized.length <= TRIP_ID_MAX_LENGTH;
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

export function isValidPickupNotes(value: string): boolean {
  return value.trim().length <= 500;
}

export function isValidUrl(value: string): boolean {
  try {
    const normalized = value.trim();
    if (!normalized) return false;
    const parsed = new URL(normalized);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validatePickupItemRequest(payload: PickupItemRequest): string | null {
  const hasLatitude = typeof payload.latitude === 'number';
  const hasLongitude = typeof payload.longitude === 'number';

  if (hasLatitude !== hasLongitude) {
    return 'Latitude and longitude must be provided together.';
  }

  if (hasLatitude && !isValidLatitude(payload.latitude as number)) {
    return 'Latitude must be between -90 and 90.';
  }

  if (hasLongitude && !isValidLongitude(payload.longitude as number)) {
    return 'Longitude must be between -180 and 180.';
  }

  if (typeof payload.notes === 'string' && !isValidPickupNotes(payload.notes)) {
    return 'Pickup notes must be 500 characters or less.';
  }

  if (
    typeof payload.proofImageUrl === 'string' &&
    payload.proofImageUrl.trim().length > 0 &&
    !isValidUrl(payload.proofImageUrl)
  ) {
    return 'Proof image URL must be a valid URL.';
  }

  if (!payload.proofPhotos?.length && !(payload.proofImageUrl?.trim().length ?? 0)) {
    return 'At least one pickup photo is required.';
  }

  return null;
}

export function validatePickupItemResponse(payload: unknown): PickupItemResponse | null {
  if (!isRecord(payload)) return null;

  const {
    tripId,
    driverId,
    customerId,
    status,
    pickedUpAt,
    pickupNotes,
    pickupProofImageUrl,
    pickupProofPhotos,
    nextStep,
  } = payload;

  if (
    typeof tripId !== 'string' ||
    typeof driverId !== 'string' ||
    typeof customerId !== 'string' ||
    typeof status !== 'string' ||
    typeof pickedUpAt !== 'string' ||
    nextStep !== 'DELIVER_ITEM'
  ) {
    return null;
  }

  if (!TRIP_STATUSES.includes(status as TripStatus)) {
    return null;
  }

  if (pickupNotes !== null && typeof pickupNotes !== 'string') {
    return null;
  }

  if (pickupProofImageUrl !== null && typeof pickupProofImageUrl !== 'string') {
    return null;
  }

  if (!Array.isArray(pickupProofPhotos)) {
    return null;
  }

  const mappedProofPhotos = pickupProofPhotos
    .map((photo) => {
      if (!isRecord(photo)) return null;
      const { id, type, url, mimeType, sizeBytes, sortOrder, createdAt } = photo;
      if (
        typeof id !== 'string' ||
        type !== 'PICKUP' ||
        typeof url !== 'string' ||
        typeof mimeType !== 'string' ||
        typeof sizeBytes !== 'number' ||
        typeof sortOrder !== 'number' ||
        typeof createdAt !== 'string'
      ) {
        return null;
      }

      return {
        id,
        type: 'PICKUP' as const,
        url,
        mimeType,
        sizeBytes,
        sortOrder,
        createdAt,
      };
    })
    .filter((photo): photo is NonNullable<typeof photo> => photo !== null);

  return {
    tripId,
    driverId,
    customerId,
    status: status as TripStatus,
    pickedUpAt,
    pickupNotes: pickupNotes ?? null,
    pickupProofImageUrl: pickupProofImageUrl ?? null,
    pickupProofPhotos: mappedProofPhotos,
    nextStep: 'DELIVER_ITEM',
  };
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

export function canConfirmPickup(driverLocation: GeoLocation, pickupLocation: GeoLocation): boolean {
  if (!isValidGeoLocation(driverLocation) || !isValidGeoLocation(pickupLocation)) {
    return false;
  }

  return calculateDistanceMeters(driverLocation, pickupLocation) <= PICKUP_CONFIRM_RADIUS_METERS;
}

export { PICKUP_CONFIRM_RADIUS_METERS };
