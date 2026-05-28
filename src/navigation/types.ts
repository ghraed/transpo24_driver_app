import type { AddressedLocation } from '@/types/trip.types';

export type DriverStackParamList = {
  GoToPickupScreen: {
    tripId: string;
    pickupLocation: AddressedLocation;
    dropoffLocation: AddressedLocation;
  };
  PickupItemScreen: {
    tripId: string;
    pickupLocation: AddressedLocation;
    dropoffLocation: AddressedLocation;
  };
  DeliverItemScreen: {
    tripId: string;
    pickupLocation: AddressedLocation;
    dropoffLocation: AddressedLocation;
  };
  DriverTripCompletedScreen: {
    tripId: string;
    deliveredAt: string;
  };
};

export type CustomerStackParamList = {
  CustomerTrackingScreen: {
    tripId: string;
    pickupLocation: AddressedLocation;
    dropoffLocation: AddressedLocation;
  };
};
