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
  | 'SET_AVAILABILITY'
  | 'WAITING_APPROVAL'
  | 'HOME';

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

export interface CompleteDriverProfileForm {
  firstName: string;
  lastName: string;
  phone: string;
  countryCode: string;
  city: string;
  dateOfBirth: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  preferredLanguage: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
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
  dateOfBirth: string | null;
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
