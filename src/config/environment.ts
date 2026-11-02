export const PRODUCTION_API_URL = 'https://api.transpo24.com';

/** Shared by the visible Local banner and the trip confirmation policy. */
export function isLocalBackendUrl(apiUrl: string): boolean {
  return apiUrl !== PRODUCTION_API_URL;
}
