import type { DriverNextStep } from '@/types/auth';

export type DriverAppRoute =
  | '/'
  | '/register'
  | '/complete-profile'
  | '/vehicle-documents'
  | '/vehicle-information'
  | '/load-capacity'
  | '/set-availability'
  | '/waiting-approval'
  | '/driver-home'
  | '/receive-requests';

const ONBOARDING_ROUTE_PREFIXES: DriverAppRoute[] = [
  '/complete-profile',
  '/vehicle-documents',
  '/vehicle-information',
  '/load-capacity',
  '/set-availability',
  '/waiting-approval',
  '/driver-home',
  '/receive-requests',
];

export function nextStepToRoute(nextStep: DriverNextStep): DriverAppRoute {
  switch (nextStep) {
    case 'COMPLETE_PROFILE':
      return '/complete-profile';
    case 'ADD_VEHICLE_DOCUMENTS':
    case 'UPLOAD_DOCUMENTS':
      return '/vehicle-documents';
    case 'SET_AVAILABILITY':
      return '/set-availability';
    case 'WAITING_APPROVAL':
      return '/waiting-approval';
    case 'HOME':
      return '/receive-requests';
    default:
      return '/';
  }
}

export function isOnboardingRoute(route: string | null | undefined): route is DriverAppRoute {
  if (!route) return false;
  return ONBOARDING_ROUTE_PREFIXES.some(
    (candidate) => route === candidate || route.startsWith(`${candidate}?`),
  );
}

// Phone verification grants browse access. Registration resumes only when requested.
export function resolveDriverEntryRoute(
  _nextStep: DriverNextStep,
  _savedRoute: string | null | undefined,
): DriverAppRoute {
  return '/receive-requests';
}
