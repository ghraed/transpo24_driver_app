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

export interface RegisterDriverPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  countryCode?: string;
  city?: string;
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
  firstName: string;
  lastName: string;
  phone: string;
  countryCode: string | null;
  city: string | null;
  status: DriverStatus;
  isProfileCompleted: boolean;
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
