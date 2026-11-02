import { getBackendApiBaseUrl } from './backend';
import { isLocalBackendUrl } from './environment';

export function getTripConfirmationRadiusMeters(): number {
  try {
    return isLocalBackendUrl(getBackendApiBaseUrl()) ? 2000 : 100;
  } catch {
    // Missing/invalid configuration must never enable the wider local radius.
    return 100;
  }
}

export const TRIP_CONFIRMATION_RADIUS_METERS = getTripConfirmationRadiusMeters();
