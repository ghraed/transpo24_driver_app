import type { DriverNextStep } from '@/types/auth';

export type DriverRoute =
  | '/'
  | '/complete-profile'
  | '/vehicle-documents'
  | '/vehicle-information'
  | '/manage-loads'
  | '/vehicle-load'
  | '/set-availability'
  | '/waiting-approval'
  | '/driver-home';

export function normalizeDriverNextStep(nextStep?: string | null): DriverNextStep {
  switch (nextStep) {
    case 'COMPLETE_PROFILE':
    case 'UPLOAD_DOCUMENTS':
    case 'ADD_VEHICLE_DOCUMENTS':
    case 'SET_AVAILABILITY':
    case 'WAITING_APPROVAL':
    case 'HOME':
      return nextStep;
    default:
      return 'HOME';
  }
}

export function getDriverRouteForNextStep(nextStep: DriverNextStep): DriverRoute {
  switch (nextStep) {
    case 'COMPLETE_PROFILE':
      return '/complete-profile';
    case 'UPLOAD_DOCUMENTS':
      return '/vehicle-documents';
    case 'ADD_VEHICLE_DOCUMENTS':
      return '/manage-loads';
    case 'SET_AVAILABILITY':
      return '/set-availability';
    case 'WAITING_APPROVAL':
      return '/waiting-approval';
    case 'HOME':
      return '/driver-home';
  }
}
