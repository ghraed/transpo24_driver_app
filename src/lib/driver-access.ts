import type { DriverProfile } from '@/types/auth';
import { nextStepToRoute } from './onboarding-route';

export function canDriverInteract(driver: Pick<DriverProfile, 'status' | 'isProfileCompleted'> | null | undefined): boolean {
  return driver?.status === 'APPROVED' && driver.isProfileCompleted;
}

export function registrationRoute(driver: Pick<DriverProfile, 'status' | 'isProfileCompleted'> | null | undefined) {
  if (!driver?.isProfileCompleted || driver.status === 'PENDING_PROFILE') return nextStepToRoute('COMPLETE_PROFILE');
  if (driver.status === 'PENDING_DOCUMENTS') return nextStepToRoute('UPLOAD_DOCUMENTS');
  return nextStepToRoute('WAITING_APPROVAL');
}

const CLIENT_INTERACTION_ROUTES = new Set([
  '/review-request-details', '/send-price-offer', '/offer-waiting-response',
  '/chat', '/accepted-jobs', '/accepted-job-details', '/go-to-pickup',
  '/pickup-item', '/deliver-item', '/trip-expenses', '/driver-trip-completed', '/socket-debug',
]);

export function requiresDriverApproval(pathname: string): boolean {
  return CLIENT_INTERACTION_ROUTES.has(pathname);
}
