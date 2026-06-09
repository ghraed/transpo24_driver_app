export type UserRole = 'CUSTOMER' | 'DRIVER' | 'COUNTRY_PARTNER' | 'MASTER_ADMIN';

export type DriverStatus =
  | 'PENDING_PROFILE'
  | 'PENDING_DOCUMENTS'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'SUSPENDED'
  | 'REJECTED';

export type DriverNextStep =
  | 'COMPLETE_PROFILE'
  | 'UPLOAD_DOCUMENTS'
  | 'ADD_VEHICLE_DOCUMENTS'
  | 'SET_AVAILABILITY'
  | 'WAITING_APPROVAL'
  | 'HOME';

export type DayOfWeek =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';

export type PreferredLanguage = 'en' | 'ar' | 'de' | 'fr' | 'it';

export interface RegisterDriverPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  countryCode?: string;
  city?: string;
}

export interface UpdateDriverProfilePayload {
  firstName: string;
  lastName: string;
  phone: string;
  countryCode?: string;
  city?: string;
  dateOfBirth?: string;
  addressLine1?: string;
  addressLine2?: string;
  postalCode?: string;
  preferredLanguage?: PreferredLanguage;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  profilePhotoUrl?: string | null;
}

export interface DriverCoverageAreaSelection {
  coverageCity?: string;
  coverageAreas?: string[];
}

export interface DriverPersonalInfoForm {
  fullNameOnId: string;
  dateOfBirth: string;
  idOrResidencyNumber: string;
  coverageCity: string;
  coverageAreasInput: string;
}

export interface DriverPersonalInfoPayload {
  fullNameOnId: string;
  dateOfBirth: string;
  idOrResidencyNumber: string;
  coverageCity?: string;
  coverageAreas?: string[];
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  name?: string;
}

export interface DriverProfile {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  phone: string;
  countryCode: string | null;
  city: string | null;
  coverageAreas: string[];
  fullNameOnId: string | null;
  dateOfBirth: string | null;
  idOrResidencyNumberMasked: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  preferredLanguage: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  profilePhotoUrl: string | null;
  status: DriverStatus;
  isProfileCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DriverMeResponse {
  user: AuthUser;
  driver: DriverProfile;
  nextStep: DriverNextStep;
}

export interface DriverOnboardingResponse {
  driverId: string;
  fullNameOnId: string | null;
  dateOfBirth: string | null;
  coverageCity: string | null;
  coverageAreas: string[];
  idOrResidencyNumberMasked: string | null;
  onboardingStatus: DriverStatus;
  isPersonalInfoCompleted: boolean;
  nextStep: DriverNextStep;
}

export type VehicleType =
  | 'CAR_CARRIER'
  | 'FLATBED_TRUCK'
  | 'TOW_TRUCK'
  | 'VAN'
  | 'BOX_TRUCK'
  | 'PICKUP_TRUCK'
  | 'MOTORCYCLE_TRAILER'
  | 'FURNITURE_TRUCK'
  | 'OTHER';

export type DriverDocumentType =
  | 'DRIVER_LICENSE_FRONT'
  | 'DRIVER_LICENSE_BACK'
  | 'IDENTITY_DOCUMENT'
  | 'PASSPORT'
  | 'VEHICLE_REGISTRATION'
  | 'VEHICLE_INSURANCE'
  | 'VEHICLE_PHOTO'
  | 'TECHNICAL_INSPECTION'
  | 'PROFILE_PHOTO';

export type DocumentStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

export interface CreateDriverVehiclePayload {
  vehicleType: VehicleType;
  make: string;
  model: string;
  year: number;
  plateNumber: string;
  color?: string;
  capacityKg?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  hasTrailer: boolean;
}

export interface DriverVehicleForm {
  vehicleType: VehicleType | '';
  make: string;
  model: string;
  year: string;
  plateNumber: string;
  color: string;
  capacityKg: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  hasTrailer: boolean;
}

export interface LocalDocumentAsset {
  uri: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  width?: number;
  height?: number;
}

export interface DriverDocumentsForm {
  driverLicenseFront?: LocalDocumentAsset;
  driverLicenseBack?: LocalDocumentAsset;
  identityDocument?: LocalDocumentAsset;
  vehicleRegistration?: LocalDocumentAsset;
  vehicleInsurance?: LocalDocumentAsset;
  vehiclePhotos: LocalDocumentAsset[];
}

export interface DriverDocument {
  id: string;
  vehicleId: string | null;
  type: DriverDocumentType;
  url: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  rejectionReason: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface DriverVehicle {
  id: string;
  vehicleType: VehicleType;
  make: string;
  model: string;
  year: number;
  plateNumber: string;
  color: string | null;
  capacityKg: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  hasTrailer: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  documents?: DriverDocument[];
}

export interface DriverVehicleDocumentsResponse {
  vehicle: DriverVehicle;
  documents: DriverDocument[];
  nextStep: DriverNextStep;
}

export interface DriverAvailabilityDay {
  dayOfWeek: DayOfWeek;
  isAvailable: boolean;
  startTime: string | null;
  endTime: string | null;
}

export interface DriverAvailabilityFormDay {
  dayOfWeek: DayOfWeek;
  label: string;
  isAvailable: boolean;
  startTime: string;
  endTime: string;
}

export interface UpdateDriverAvailabilityPayload {
  timezone: string;
  isOnline: boolean;
  serviceRadiusKm: number;
  baseLatitude?: number;
  baseLongitude?: number;
  baseAddress?: string;
  acceptsImmediateRequests: boolean;
  acceptsScheduledRequests: boolean;
  weeklySchedule: {
    dayOfWeek: DayOfWeek;
    isAvailable: boolean;
    startTime?: string;
    endTime?: string;
  }[];
}

export interface UpdateDriverOnlineStatusPayload {
  isOnline: boolean;
}

export interface DriverAvailabilityResponse {
  id: string | null;
  driverId: string;
  timezone: string;
  isOnline: boolean;
  serviceRadiusKm: number;
  baseLatitude: number | null;
  baseLongitude: number | null;
  baseAddress: string | null;
  acceptsImmediateRequests: boolean;
  acceptsScheduledRequests: boolean;
  weeklySchedule: DriverAvailabilityDay[];
  nextStep: DriverNextStep;
  driverStatus: DriverStatus;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DriverAvailabilityForm {
  timezone: string;
  isOnline: boolean;
  serviceRadiusKm: string;
  baseLatitude: string;
  baseLongitude: string;
  baseAddress: string;
  acceptsImmediateRequests: boolean;
  acceptsScheduledRequests: boolean;
  weeklySchedule: DriverAvailabilityFormDay[];
}

export interface DriverVehiclesListResponse {
  driverStatus: DriverStatus;
  nextStep: DriverNextStep;
  vehicles: {
    vehicle: DriverVehicle;
    documents: DriverDocument[];
  }[];
}

export interface DriverAuthResponse {
  accessToken: string;
  user: AuthUser;
  driver: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    countryCode: string | null;
    city: string | null;
    status: DriverStatus;
    isProfileCompleted: boolean;
  };
  nextStep: DriverNextStep;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
  driver?: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    countryCode: string | null;
    city: string | null;
    status: DriverStatus;
    isProfileCompleted: boolean;
  };
  nextStep?: DriverNextStep;
}

export type DriverRequestAlertStatus =
  | 'NEW'
  | 'SEEN'
  | 'ACCEPTED'
  | 'IGNORED'
  | 'EXPIRED';

export type RequestStatus =
  | 'DRAFT'
  | 'PENDING_QUOTES'
  | 'QUOTED'
  | 'ACCEPTED'
  | 'DRIVER_ASSIGNED'
  | 'DRIVER_GOING_TO_PICKUP'
  | 'DRIVER_ARRIVED_PICKUP'
  | 'PICKUP_IN_PROGRESS'
  | 'IN_TRANSIT'
  | 'DRIVER_GOING_TO_DROPOFF'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface RequestLocationSummary {
  latitude: number | null;
  longitude: number | null;
  address: string | null;
}

export interface RequestServiceSummary {
  id: string;
  key: string;
  nameEn: string;
  nameAr: string;
  icon: string | null;
}

export type VehicleCondition =
  | 'RUNNING'
  | 'NEEDS_JUMP_START'
  | 'NEEDS_WINCH'
  | 'NEEDS_CRANE'
  | 'MISSING_WHEELS';

export interface RequestVehicleDetailsSummary {
  condition: VehicleCondition | null;
  conditionNotes: string | null;
}

export interface RequestScheduleSummary {
  isImmediate: boolean;
  scheduledPickupAt: string | null;
}

export interface RequestItemSummary {
  title: string | null;
  type: string | null;
  description: string | null;
}

export interface DriverRequestAlertSummary {
  alertId: string;
  requestId: string;
  alertStatus: DriverRequestAlertStatus;
  requestStatus: RequestStatus;
  service: RequestServiceSummary | null;
  pickup: RequestLocationSummary;
  dropoff: RequestLocationSummary;
  schedule: RequestScheduleSummary;
  item: RequestItemSummary;
  vehicleDetails: RequestVehicleDetailsSummary | null;
  distanceKm: number | null;
  createdAt: string;
  submittedAt: string | null;
}

export interface DriverRequestAlertsResponse {
  alerts: DriverRequestAlertSummary[];
}

export interface RequestPhoto {
  id: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  sortOrder: number;
  createdAt: string;
}

export interface DriverRequestDetailsResponse extends DriverRequestAlertSummary {
  customer: {
    firstName: string | null;
    rating: number | null;
  } | null;
  itemDetails: {
    title: string | null;
    description: string | null;
    type: string | null;
    brand: string | null;
    model: string | null;
    year: number | null;
    condition: string | null;
    weightKg: number | null;
    dimensions: {
      lengthCm: number | null;
      widthCm: number | null;
      heightCm: number | null;
    };
    requiresLoadingHelp: boolean;
    loadingWorkersCount: number | null;
    specialInstructions: string | null;
  };
  photos: RequestPhoto[];
}

export interface AcceptDriverRequestAlertResponse {
  alertId: string;
  requestId: string;
  alertStatus: 'ACCEPTED';
  nextStep: 'SEND_PRICE_OFFER';
}

export interface IgnoreDriverRequestAlertResponse {
  alertId: string;
  requestId: string;
  alertStatus: 'IGNORED';
}

export type DriverOfferStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED';

export type SendOfferNextStep = 'WAIT_FOR_CUSTOMER_RESPONSE';

export type SupportedOfferCurrency = 'CHF' | 'EUR' | 'AED' | 'SAR' | 'QAR' | 'USD';

export interface SendDriverPriceOfferPayload {
  price: number;
  currency: SupportedOfferCurrency;
  estimatedPickupAt?: string;
  estimatedDeliveryAt?: string;
  estimatedDurationMinutes?: number;
  message?: string;
}

export interface DriverOffer {
  id: string;
  requestId: string;
  driverId: string;
  alertId?: string | null;
  price: number;
  currency: string;
  estimatedPickupAt: string | null;
  estimatedDeliveryAt: string | null;
  estimatedDurationMinutes: number | null;
  message: string | null;
  status: DriverOfferStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SendDriverPriceOfferResponse {
  offer: DriverOffer;
  request: {
    id: string;
    status: string;
  };
  nextStep: SendOfferNextStep;
}

export interface AcceptedOffer extends DriverOffer {
  status: 'ACCEPTED';
  acceptedAt: string | null;
}

export interface DriverAcceptedJobSummary {
  requestId: string;
  requestStatus: RequestStatus;
  acceptedAt: string | null;
  service: RequestServiceSummary | null;
  pickup: RequestLocationSummary;
  dropoff: RequestLocationSummary;
  schedule: RequestScheduleSummary;
  item: {
    title: string | null;
    type: string | null;
    description: string | null;
  };
  vehicleDetails: RequestVehicleDetailsSummary | null;
  acceptedOffer: AcceptedOffer;
  nextStep: 'GO_TO_PICKUP';
}

export interface DriverAcceptedJobDetailsResponse extends DriverAcceptedJobSummary {
  customer: {
    firstName: string | null;
    phone: string | null;
    rating: number | null;
  } | null;
  itemDetails: {
    title: string | null;
    description: string | null;
    type: string | null;
    brand: string | null;
    model: string | null;
    year: number | null;
    condition: string | null;
    weightKg: number | null;
    dimensions: {
      lengthCm: number | null;
      widthCm: number | null;
      heightCm: number | null;
    };
    requiresLoadingHelp: boolean;
    loadingWorkersCount: number | null;
    specialInstructions: string | null;
  };
  photos: RequestPhoto[];
}

export interface DriverAcceptedJobsResponse {
  jobs: DriverAcceptedJobSummary[];
}
