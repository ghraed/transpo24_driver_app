import type {
  DriverArrivedPickupConfirmedPayload,
  DriverLocationUpdatedPayload,
  GeoLocation,
  OfferAcceptedPayload,
  OfferRejectedPayload,
  RequestNewPayload,
} from '@/types/trip.types';
import type { VehicleCondition } from '@/types/auth';

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

function isVehicleCondition(value: unknown): value is VehicleCondition {
  return (
    value === 'RUNNING' ||
    value === 'NEEDS_JUMP_START' ||
    value === 'NEEDS_WINCH' ||
    value === 'NEEDS_CRANE' ||
    value === 'MISSING_WHEELS'
  );
}

export function validateOfferAcceptedPayload(payload: unknown): OfferAcceptedPayload | null {
  if (!isRecord(payload)) return null;
  const {
    tripId,
    acceptedOfferId,
    driverId,
    customerId,
    agreedPrice,
    currency,
    pickupLocation,
    dropoffLocation,
    status,
  } = payload;

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
    acceptedOfferId: typeof acceptedOfferId === 'string' ? acceptedOfferId : undefined,
    driverId,
    customerId,
    agreedPrice: typeof agreedPrice === 'number' ? agreedPrice : undefined,
    currency: typeof currency === 'string' ? currency : undefined,
    pickupLocation: pickup,
    dropoffLocation: dropoff,
    status: status as OfferAcceptedPayload['status'],
  };
}

export function validateRequestNewPayload(payload: unknown): RequestNewPayload | null {
  if (!isRecord(payload)) return null;

  const {
    alertId,
    requestId,
    alertStatus,
    requestStatus,
    service,
    pickup,
    dropoff,
    schedule,
    item,
    vehicleDetails,
    distanceKm,
    createdAt,
    submittedAt,
  } = payload;

  if (
    typeof alertId !== 'string' ||
    typeof requestId !== 'string' ||
    typeof alertStatus !== 'string' ||
    typeof requestStatus !== 'string' ||
    !isRecord(pickup) ||
    !isRecord(dropoff) ||
    !isRecord(schedule) ||
    !isRecord(item) ||
    typeof createdAt !== 'string'
  ) {
    return null;
  }

  const pickupLocation = {
    latitude: typeof pickup.latitude === 'number' ? pickup.latitude : null,
    longitude: typeof pickup.longitude === 'number' ? pickup.longitude : null,
    address:
      typeof pickup.address === 'string' || pickup.address === null
        ? pickup.address
        : null,
  };

  const dropoffLocation = {
    latitude: typeof dropoff.latitude === 'number' ? dropoff.latitude : null,
    longitude: typeof dropoff.longitude === 'number' ? dropoff.longitude : null,
    address:
      typeof dropoff.address === 'string' || dropoff.address === null
        ? dropoff.address
        : null,
  };

  return {
    alertId,
    requestId,
    alertStatus: alertStatus as RequestNewPayload['alertStatus'],
    requestStatus: requestStatus as RequestNewPayload['requestStatus'],
    service:
      isRecord(service) &&
      typeof service.id === 'string' &&
      typeof service.key === 'string' &&
      typeof service.nameEn === 'string' &&
      typeof service.nameAr === 'string'
        ? {
            id: service.id,
            key: service.key,
            nameEn: service.nameEn,
            nameAr: service.nameAr,
            icon: typeof service.icon === 'string' || service.icon === null ? service.icon : null,
          }
        : null,
    pickup: pickupLocation,
    dropoff: dropoffLocation,
    schedule: {
      isImmediate: Boolean(schedule.isImmediate),
      scheduledPickupAt:
        typeof schedule.scheduledPickupAt === 'string' || schedule.scheduledPickupAt === null
          ? schedule.scheduledPickupAt
          : null,
    },
    item: {
      title: typeof item.title === 'string' || item.title === null ? item.title : null,
      type: typeof item.type === 'string' || item.type === null ? item.type : null,
      description:
        typeof item.description === 'string' || item.description === null
          ? item.description
          : null,
    },
    vehicleDetails:
      isRecord(vehicleDetails)
        ? {
            condition: isVehicleCondition(vehicleDetails.condition)
              ? vehicleDetails.condition
              : null,
            conditionNotes:
              typeof vehicleDetails.conditionNotes === 'string' ||
              vehicleDetails.conditionNotes === null
                ? vehicleDetails.conditionNotes
                : null,
          }
        : null,
    distanceKm: typeof distanceKm === 'number' ? distanceKm : null,
    createdAt,
    submittedAt:
      typeof submittedAt === 'string' || submittedAt === null ? submittedAt : null,
  };
}

export function validateOfferRejectedPayload(payload: unknown): OfferRejectedPayload | null {
  if (!isRecord(payload)) return null;
  const { requestId, offerId, driverId, status, rejectedAt } = payload;

  if (
    typeof requestId !== 'string' ||
    typeof offerId !== 'string' ||
    typeof driverId !== 'string' ||
    typeof status !== 'string' ||
    typeof rejectedAt !== 'string'
  ) {
    return null;
  }

  return {
    requestId,
    offerId,
    driverId,
    status,
    rejectedAt,
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
