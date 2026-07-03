import type {
  DriverRequestAlertStatus,
  LocalDocumentAsset,
  RequestStatus,
  VehicleCondition,
} from './auth';

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
  acceptedOfferId?: string;
  driverId: string;
  customerId: string;
  agreedPrice?: number;
  currency?: string;
  pickupLocation: AddressedLocation;
  dropoffLocation: AddressedLocation;
  status: TripStatus;
};

export type RequestNewPayload = {
  alertId: string;
  requestId: string;
  alertStatus: DriverRequestAlertStatus;
  requestStatus: RequestStatus;
  service: {
    id: string;
    key: string;
    nameEn: string;
    nameAr: string;
    icon: string | null;
  } | null;
  pickup: {
    latitude: number | null;
    longitude: number | null;
    address: string | null;
  };
  dropoff: {
    latitude: number | null;
    longitude: number | null;
    address: string | null;
  };
  schedule: {
    isImmediate: boolean;
    scheduledPickupAt: string | null;
  };
  item: {
    title: string | null;
    type: string | null;
    description: string | null;
  };
  vehicleDetails: {
    condition: VehicleCondition | null;
    conditionNotes: string | null;
  } | null;
  distanceKm: number | null;
  createdAt: string;
  submittedAt: string | null;
};

export type OfferRejectedPayload = {
  requestId: string;
  offerId: string;
  driverId: string;
  status: string;
  rejectedAt: string;
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

export type RequestProofPhotoType = 'PICKUP' | 'DELIVERY';

export type RequestProofPhotoResponse = {
  id: string;
  type: RequestProofPhotoType;
  url: string;
  mimeType: string;
  sizeBytes: number;
  sortOrder: number;
  createdAt: string;
};

export type PickupItemRequest = {
  latitude?: number;
  longitude?: number;
  notes?: string;
  proofImageUrl?: string;
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
  pickupProofPhotos: RequestProofPhotoResponse[];
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
  pickupProofPhotos: RequestProofPhotoResponse[];
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
  deliveryProofPhotos: RequestProofPhotoResponse[];
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
  deliveryProofPhotos: RequestProofPhotoResponse[];
};

export type AdditionalExpenseFormValues = {
  amount: string;
  reason: string;
  equipmentType: string;
  invoice: LocalDocumentAsset | null;
};

export type CreateAdditionalExpensePayload = {
  amount: number;
  reason: string;
  equipmentType?: string;
  invoice: LocalDocumentAsset;
};

export type AdditionalExpenseResponse = {
  id: string;
  requestId: string;
  driverId: string;
  customerId: string;
  amount: number;
  currency: string;
  reason: string;
  equipmentType: string | null;
  invoiceUrl: string;
  invoice: {
    originalFilename: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
  };
  walletDeduction: {
    amount: number;
    currency: string;
    transactionType: 'ADDITIONAL_CHARGE';
  };
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type DriverPayoutSummary = {
  message: string;
  availableAt: string | null;
};
