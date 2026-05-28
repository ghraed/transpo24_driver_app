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
};

export type CustomerStackParamList = {
  CustomerTrackingScreen: {
    tripId: string;
    pickupLocation: AddressedLocation;
    dropoffLocation: AddressedLocation;
  };
};
