export type UserRole = "CUSTOMER" | "DRIVER" | "ADMIN";

export type TripStatus =
  | "PENDING_REQUEST"
  | "DRIVER_OFFER_SENT"
  | "OFFER_ACCEPTED"
  | "DRIVER_GOING_TO_PICKUP"
  | "DRIVER_ARRIVED_PICKUP"
  | "ITEM_PICKED_UP"
  | "DRIVER_GOING_TO_DROPOFF"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED";

export type GeoLocation = {
  latitude: number;
  longitude: number;
};

export type AddressedLocation = GeoLocation & {
  address?: string | null;
};

export type OfferAcceptedPayload = {
  tripId: string;
  driverId: string;
  customerId: string;
  pickupLocation: AddressedLocation;
  dropoffLocation: AddressedLocation;
  status: TripStatus;
};

export type DriverLocationUpdatePayload = {
  tripId: string;
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
};

export type DriverLocationUpdatedPayload = {
  tripId: string;
  driverId: string;
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  accuracy: number | null;
  recordedAt: string;
};

export type DriverArrivedPickupPayload = {
  tripId: string;
  latitude: number;
  longitude: number;
};

export type DriverArrivedPickupConfirmedPayload = {
  tripId: string;
  driverId: string;
  status: TripStatus;
  arrivedAt: string;
};

export type TripStatusUpdatedPayload = {
  tripId: string;
  status: TripStatus;
  updatedAt: string;
};
