import type { LocalDocumentAsset, SupportedOfferCurrency } from './auth';

export type UserRole = "CUSTOMER" | "DRIVER" | "ADMIN";

export type TripStatus =
  | "PENDING_REQUEST"
  | "DRIVER_OFFER_SENT"
  | "OFFER_ACCEPTED"
  | "DRIVER_GOING_TO_PICKUP"
  | "DRIVER_ARRIVED_PICKUP"
  | "ITEM_PICKED_UP"
  | "PICKUP_IN_PROGRESS"
  | "IN_TRANSIT"
  | "DRIVER_GOING_TO_DROPOFF"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED";

export type RequestExecutionStatus =
  | "DRIVER_GOING_TO_PICKUP"
  | "DRIVER_ARRIVED_PICKUP"
  | "ITEM_PICKED_UP"
  | "PICKUP_IN_PROGRESS"
  | "IN_TRANSIT"
  | "DRIVER_GOING_TO_DROPOFF"
  | "DELIVERED";

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

export type PickupItemRequest = {
  latitude?: number;
  longitude?: number;
  notes?: string;
  proofImageUrl?: string;
  proofPhoto?: LocalDocumentAsset;
  proofPhotos?: LocalDocumentAsset[];
};

export type PickupItemResponse = {
  tripId: string;
  driverId: string;
  customerId: string;
  status: TripStatus;
  pickedUpAt: string;
  pickupNotes: string | null;
  pickupProofImageUrl: string | null;
  nextStep: "DELIVER_ITEM";
};

export type ItemPickedUpPayload = {
  tripId: string;
  driverId: string;
  customerId: string;
  status: "ITEM_PICKED_UP";
  pickedUpAt: string;
  pickupNotes: string | null;
  pickupProofImageUrl: string | null;
};

export type StartDeliveryResponse = {
  tripId: string;
  driverId: string;
  customerId: string;
  status: "DRIVER_GOING_TO_DROPOFF";
  dropoffLocation: AddressedLocation;
  startedAt: string;
  nextStep: "GO_TO_DROPOFF";
};

export type DeliverItemRequest = {
  latitude?: number;
  longitude?: number;
  notes?: string;
  proofImageUrl?: string;
  proofPhoto?: LocalDocumentAsset;
  proofPhotos?: LocalDocumentAsset[];
};

export type DeliverItemResponse = {
  tripId: string;
  driverId: string;
  customerId: string;
  status: "DELIVERED";
  deliveredAt: string;
  deliveryNotes: string | null;
  deliveryProofImageUrl: string | null;
  nextStep: "VIEW_EARNINGS_AND_RATINGS";
};

export type ItemDeliveredPayload = {
  tripId: string;
  driverId: string;
  customerId: string;
  status: "DELIVERED";
  deliveredAt: string;
  deliveryNotes: string | null;
  deliveryProofImageUrl: string | null;
};

export type RequestProofPhotoResponse = {
  id: string;
  type: "PICKUP" | "DELIVERY";
  url: string;
  mimeType: string;
  sizeBytes: number;
  sortOrder: number;
  createdAt: string;
};

export type AdditionalExpenseFormValues = {
  amount: string;
  currency: SupportedOfferCurrency;
  reason: string;
  equipmentType: string;
  invoicePhoto: LocalDocumentAsset | null;
};

export type CreateAdditionalExpensePayload = {
  amount: number;
  currency: SupportedOfferCurrency;
  reason: string;
  equipmentType?: string;
  invoicePhoto: LocalDocumentAsset;
};

export type AdditionalExpenseResponse = {
  id: string;
  requestId: string;
  driverId: string;
  customerId: string;
  amount: number;
  appFeeAmount: number;
  totalChargeAmount: number;
  currency: string;
  reason: string;
  equipmentType: string | null;
  invoiceUrl: string;
  invoice: {
    originalFilename: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
  };
  approval: {
    approvedAt: string | null;
    approvedByCustomerId: string | null;
    confirmationLocale: string | null;
    confirmationText: string | null;
  };
  payment: {
    stripePaymentIntentId: string | null;
    stripeChargeId: string | null;
    savedPaymentMethod: {
      id: string;
      brand: string | null;
      last4: string | null;
      expMonth: number | null;
      expYear: number | null;
    } | null;
    failureReason: string | null;
  };
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type DriverPayoutSummary = {
  releaseAt: string;
  message: string;
};
