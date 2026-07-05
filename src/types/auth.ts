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
  | 'ADD_VEHICLE_DOCUMENTS'
  | 'UPLOAD_DOCUMENTS'
  | 'SET_AVAILABILITY'
  | 'WAITING_APPROVAL'
  | 'HOME';

export type DriverOnboardingNextStep =
  | 'COMPLETE_PROFILE'
  | 'UPLOAD_DOCUMENTS'
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
  countryCodes?: string[];
  city?: string;
  cities?: string[];
}

export interface UpdateDriverProfilePayload {
  firstName: string;
  lastName: string;
  phone: string;
  countryCode?: string;
  countryCodes?: string[];
  city?: string;
  cities?: string[];
  fullNameOnId?: string;
  idOrResidencyNumber?: string;
  dateOfBirth?: string;
  addressLine1?: string;
  addressLine2?: string;
  postalCode?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  profilePhotoUrl?: string | null;
}

export interface CompleteDriverProfileForm {
  firstName: string;
  lastName: string;
  phone: string;
  countryCode: string;
  city: string;
  fullNameOnId: string;
  idOrResidencyNumber: string;
  dateOfBirth: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  preferredLanguage: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
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
  countryCodes: string[];
  city: string | null;
  cities: string[];
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
  nextStep: DriverOnboardingNextStep;
}

export type VehicleType =
  | 'OPEN_CAR_CARRIER'
  | 'ENCLOSED_CARRIER'
  | 'SMALL_TRUCK'
  | 'MEDIUM_TRUCK'
  | 'PICKUP'
  | 'VAN'
  | 'TOW_TRUCK'
  | 'MOTORCYCLE';

export type VehicleCondition = 'EXCELLENT' | 'GOOD' | 'NEEDS_MAINTENANCE';

export type VehicleCargoType =
  | 'VEHICLE'
  | 'MOTORCYCLE'
  | 'GOODS'
  | 'FURNITURE'
  | 'FRAGILE_GOODS'
  | 'REFRIGERATED_GOODS'
  | 'HEAVY_EQUIPMENT'
  | 'OTHER';

export type VehicleReviewStatus =
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'INACTIVE';

export type DriverDocumentType =
  | 'PERSONAL_SELFIE'
  | 'ID_FRONT'
  | 'ID_BACK'
  | 'DRIVING_LICENSE'
  | 'SELF_IDENTITY_VERIFICATION'
  | 'DRIVER_LICENSE_FRONT'
  | 'DRIVER_LICENSE_BACK'
  | 'IDENTITY_DOCUMENT'
  | 'PASSPORT'
  | 'VEHICLE_REGISTRATION'
  | 'VEHICLE_INSURANCE'
  | 'VEHICLE_PHOTO'
  | 'VEHICLE_FRONT_PHOTO'
  | 'VEHICLE_REAR_PHOTO'
  | 'VEHICLE_SIDE_PHOTO'
  | 'VEHICLE_LICENSE_PLATE_PHOTO'
  | 'VEHICLE_REGISTRATION_FRONT'
  | 'VEHICLE_REGISTRATION_BACK'
  | 'VEHICLE_INSURANCE_DOCUMENT'
  | 'TECHNICAL_INSPECTION'
  | 'PROFILE_PHOTO';

export type IdentityDocumentKind = 'NATIONAL_ID' | 'RESIDENCY_CARD';

 export type DocumentStatus =
  | 'UPLOADED'
  | 'UNDER_REVIEW'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED';

export interface CreateDriverVehiclePayload {
  vehicleType: VehicleType;
  brand: string;
  model: string;
  year: number;
  licensePlateNumber: string;
  condition: VehicleCondition;
  color?: string;
  capacityKg?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  hasTrailer?: boolean;
  insuranceExpiryDate?: string;
  registrationExpiryDate?: string;
}

export type VehicleUploadFile = LocalDocumentAsset;

export interface CreateDriverVehicleForm {
  vehicleType: VehicleType | '';
  brand: string;
  model: string;
  year: string;
  licensePlateNumber: string;
  condition: VehicleCondition | '';
  frontPhoto?: VehicleUploadFile;
  rearPhoto?: VehicleUploadFile;
  sidePhoto?: VehicleUploadFile;
  licensePlatePhoto?: VehicleUploadFile;
  registrationFrontDocument?: VehicleUploadFile;
  registrationBackDocument?: VehicleUploadFile;
  insuranceDocument?: VehicleUploadFile;
  insuranceExpiryDate: string;
  registrationExpiryDate: string;
}

export interface LocalDocumentAsset {
  uri: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  width?: number;
  height?: number;
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
  reviewedAt?: string | null;
  createdAt: string;
}

export interface DriverOnboardingDocument {
  id: string;
  type: DriverDocumentType;
  url: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  rejectionReason: string | null;
  expiresAt: string | null;
  reviewedAt: string | null;
  uploadedAt: string;
}

export interface DriverDocumentsStatusResponse {
  onboardingStatus: DriverStatus;
  identityDocumentKind: IdentityDocumentKind | null;
  requiredDocuments: DriverDocumentType[];
  uploadedDocuments: DriverOnboardingDocument[];
  missingDocuments: DriverDocumentType[];
  missingDocumentLabels: string[];
  canSubmitForReview: boolean;
  submittedForReviewAt: string | null;
  nextStep: DriverNextStep;
}

export interface DriverVehicle {
  id: string;
  driverId: string;
  vehicleType: VehicleType;
  vehicleTypeLegacy?: string;
  brand: string;
  make: string;
  model: string;
  year: number;
  licensePlateNumber: string;
  plateNumber: string;
  condition: VehicleCondition;
  color: string | null;
  loadProfileName?: string | null;
  capacityKg: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  dimensionsAreStandard?: boolean;
  allowedCargoTypes?: VehicleCargoType[];
  workingSchedule?: WorkingDaySchedule[];
  isDefaultLoadProfile?: boolean;
  hasTrailer: boolean;
  frontPhotoUrl: string | null;
  rearPhotoUrl: string | null;
  sidePhotoUrl: string | null;
  licensePlatePhotoUrl: string | null;
  registrationFrontDocumentUrl: string | null;
  registrationBackDocumentUrl: string | null;
  insuranceDocumentUrl: string | null;
  insuranceExpiryDate: string | null;
  registrationExpiryDate: string | null;
  status: VehicleReviewStatus | null;
  verificationStatus?: VehicleReviewStatus | null;
  rejectionReason: string | null;
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

export interface WorkingTimeRange {
  startTime: string;
  endTime: string;
}

export interface WorkingDaySchedule {
  dayOfWeek: DayOfWeek;
  isAvailable: boolean;
  timeRanges: WorkingTimeRange[];
}

export interface VehicleLoadCapacityPayload {
  name?: string;
  maxLoadKg?: number;
  cargoLengthM?: number;
  cargoWidthM?: number;
  cargoHeightM?: number;
  dimensionsAreStandard?: boolean;
  allowedCargoTypes: VehicleCargoType[];
  workingSchedule: WorkingDaySchedule[];
  isDefault?: boolean;
}

export interface VehicleLoadCapacity {
  id: string;
  driverId?: string;
  vehicleId: string;
  name?: string | null;
  vehicleType: VehicleType;
  maxLoadKg?: number | null;
  cargoLengthM?: number | null;
  cargoWidthM?: number | null;
  cargoHeightM?: number | null;
  dimensionsAreStandard: boolean;
  allowedCargoTypes: VehicleCargoType[];
  workingSchedule: WorkingDaySchedule[];
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface VehicleLoadCapacitiesListResponse {
  loadCapacities: VehicleLoadCapacity[];
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
  driver: DriverProfile;
  nextStep: DriverNextStep;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
  driver?: DriverProfile;
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
  | 'ITEM_PICKED_UP'
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
