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
  | '/driver-home';

const ONBOARDING_ROUTE_PREFIXES: DriverAppRoute[] = [
  '/complete-profile',
  '/vehicle-documents',
  '/vehicle-information',
  '/load-capacity',
  '/set-availability',
  '/waiting-approval',
  '/driver-home',
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
      return '/driver-home';
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

export function resolveDriverEntryRoute(
  nextStep: DriverNextStep,
  savedRoute: string | null | undefined,
): DriverAppRoute | string {
  if (!savedRoute || !isOnboardingRoute(savedRoute)) {
    return nextStepToRoute(nextStep);
  }

  switch (nextStep) {
    case 'COMPLETE_PROFILE':
      return '/complete-profile';
    case 'ADD_VEHICLE_DOCUMENTS':
    case 'UPLOAD_DOCUMENTS':
      if (
        savedRoute === '/vehicle-documents' ||
        savedRoute.startsWith('/vehicle-documents?') ||
        savedRoute === '/vehicle-information' ||
        savedRoute.startsWith('/vehicle-information?') ||
        savedRoute === '/load-capacity' ||
        savedRoute.startsWith('/load-capacity?')
      ) {
        return savedRoute;
      }
      return '/vehicle-documents';
    case 'SET_AVAILABILITY':
      if (savedRoute === '/set-availability' || savedRoute.startsWith('/set-availability?')) {
        return savedRoute;
      }
      return '/set-availability';
    case 'WAITING_APPROVAL':
      return '/waiting-approval';
    case 'HOME':
      return '/driver-home';
    default:
      return '/';
  }
}
