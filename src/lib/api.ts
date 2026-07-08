import { readAccessToken } from './auth-storage';
import { createBackendReachabilityError, getBackendApiBaseUrl } from '@/config/backend';
import type { RegisterPushTokenPayload } from '@/notifications/types';
import type {
  AcceptDriverRequestAlertResponse,
  CreateDriverVehiclePayload,
  DriverAcceptedJobDetailsResponse,
  DriverAcceptedJobsResponse,
  DriverAvailabilityResponse,
  DriverRequestAlertsResponse,
  DriverRequestDetailsResponse,
  DriverAuthResponse,
  DriverDocumentsStatusResponse,
  DriverMeResponse,
  DriverOnboardingResponse,
  DriverPersonalInfoPayload,
  IdentityDocumentKind,
  DriverVehicle,
  IgnoreDriverRequestAlertResponse,
  DriverVehicleDocumentsResponse,
  DriverVehiclesListResponse,
  LocalDocumentAsset,
  LoginPayload,
  LoginResponse,
  RegisterDriverPayload,
  SendDriverPriceOfferPayload,
  SendDriverPriceOfferResponse,
  UpdateDriverAvailabilityPayload,
  UpdateDriverOnlineStatusPayload,
  UpdateDriverProfilePayload,
  VehicleLoadCapacitiesListResponse,
  VehicleLoadCapacity,
  VehicleLoadCapacityPayload,
} from '@/types/auth';

interface ApiErrorResponse {
  message?: string | string[];
}

interface ResetUsersForTestingPayload {
  keepEmail: string;
  role: 'DRIVER';
}

const REQUEST_TIMEOUT_MS = 12000;
const AUTH_REGISTER_TIMEOUT_MS = 30000;

function getApiBaseUrl(): string {
  return getBackendApiBaseUrl();
}

function normalizeErrorMessage(errorData: ApiErrorResponse, fallback: string): string {
  if (Array.isArray(errorData.message)) {
    return normalizeBackendErrorMessage(errorData.message[0] ?? fallback, fallback);
  }
  return normalizeBackendErrorMessage(errorData.message ?? fallback, fallback);
}

function normalizeBackendErrorMessage(message: string, fallback: string): string {
  const normalized = message.trim();
  if (!normalized) return fallback;

  if (/no such customer/i.test(normalized)) {
    return 'Customer payment profile was not found. The payment action could not be completed. Please try again after the customer refreshes their payment method.';
  }

  return normalized;
}

function tryParseJson<T>(rawText: string): T {
  return JSON.parse(rawText) as T;
}

function looksLikeJsonPayload(rawText: string): boolean {
  const normalized = rawText.trim();
  return (
    normalized.startsWith('{') ||
    normalized.startsWith('[') ||
    normalized.startsWith('"') ||
    normalized === 'null' ||
    normalized === 'true' ||
    normalized === 'false' ||
    /^-?\d/.test(normalized)
  );
}

function extractJsonPayloadCandidate(rawText: string): string | null {
  const normalized = rawText.trim();
  if (!normalized) return null;

  const objectStart = normalized.indexOf('{');
  const objectEnd = normalized.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    return normalized.slice(objectStart, objectEnd + 1);
  }

  const arrayStart = normalized.indexOf('[');
  const arrayEnd = normalized.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return normalized.slice(arrayStart, arrayEnd + 1);
  }

  const stringStart = normalized.indexOf('"');
  const stringEnd = normalized.lastIndexOf('"');
  if (stringStart >= 0 && stringEnd > stringStart) {
    return normalized.slice(stringStart, stringEnd + 1);
  }

  return null;
}

function sanitizeMalformedJson(rawText: string): string {
  const sanitized = rawText
    .replace(/^\uFEFF/, '')
    .replace(/^\s*,+\s*/, '')
    .replace(/,\s*,+/g, ',')
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/;\s*$/, '')
    .trim();

  return extractJsonPayloadCandidate(sanitized) ?? sanitized;
}

function parsePossiblyMalformedJson<T>(rawText: string): T {
  try {
    const parsed = tryParseJson<unknown>(rawText);
    if (typeof parsed === 'string' && looksLikeJsonPayload(parsed)) {
      return parsePossiblyMalformedJson<T>(parsed);
    }
    return parsed as T;
  } catch {
    const sanitized = sanitizeMalformedJson(rawText);
    if (sanitized === rawText) {
      throw new Error('JSON_PARSE_FAILED');
    }
    const parsed = tryParseJson<unknown>(sanitized);
    if (typeof parsed === 'string' && looksLikeJsonPayload(parsed)) {
      return parsePossiblyMalformedJson<T>(parsed);
    }
    return parsed as T;
  }
}

async function parseError(response: Response, fallback: string): Promise<Error> {
  try {
    const rawText = await response.text();
    if (!rawText) {
      return new Error(fallback);
    }
    try {
      const errorData = parsePossiblyMalformedJson<ApiErrorResponse>(rawText);
      return new Error(normalizeErrorMessage(errorData, fallback));
    } catch {
      return new Error(normalizeBackendErrorMessage(rawText, fallback));
    }
  } catch {
    return new Error(fallback);
  }
}

async function parseJsonResponse<T>(response: Response, fallback: string): Promise<T> {
  const rawText = await response.text();
  if (!rawText) {
    throw new Error(fallback);
  }

  try {
    return parsePossiblyMalformedJson<T>(rawText);
  } catch {
    throw new Error(`${fallback} (received non-JSON response)`);
  }
}

function extractBooleanField(rawText: string, fieldName: string): boolean | null {
  const match = rawText.match(new RegExp(`"${fieldName}"\\s*:\\s*(true|false)`, 'i'));
  if (!match) return null;
  return match[1]?.toLowerCase() === 'true';
}

function extractStringField(rawText: string, fieldName: string): string | null {
  const match = rawText.match(new RegExp(`"${fieldName}"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`, 'i'));
  if (!match?.[1]) return null;

  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return match[1];
  }
}

async function parseStripeConnectAccountResponse(
  response: Response,
  fallback: string,
): Promise<StripeConnectAccountResponse> {
  const rawText = await response.text();
  if (!rawText) {
    throw new Error(fallback);
  }

  try {
    return parsePossiblyMalformedJson<StripeConnectAccountResponse>(rawText);
  } catch {
    const stripeAccountId = extractStringField(rawText, 'stripeAccountId');
    const onboardingUrl = extractStringField(rawText, 'onboardingUrl');
    const detailsSubmitted = extractBooleanField(rawText, 'detailsSubmitted');
    const payoutsEnabled = extractBooleanField(rawText, 'payoutsEnabled');

    if (
      stripeAccountId &&
      onboardingUrl &&
      typeof detailsSubmitted === 'boolean' &&
      typeof payoutsEnabled === 'boolean'
    ) {
      return {
        stripeAccountId,
        onboardingUrl,
        detailsSubmitted,
        payoutsEnabled,
      };
    }

    throw new Error(`${fallback} (received malformed Stripe Connect account payload)`);
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

interface XhrResponsePayload {
  status: number;
  responseText: string;
}

function uploadFormDataWithXhr(
  endpoint: string,
  formData: FormData,
  token?: string,
): Promise<XhrResponsePayload> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint);
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    xhr.onload = () => {
      resolve({
        status: xhr.status,
        responseText: xhr.responseText ?? '',
      });
    };

    xhr.onerror = () => {
      reject(createBackendReachabilityError(endpoint));
    };

    xhr.ontimeout = () => {
      reject(new Error(`Request timed out while uploading to ${endpoint}.`));
    };

    xhr.timeout = REQUEST_TIMEOUT_MS;
    xhr.send(formData);
  });
}

function toNetworkError(endpoint: string, error: unknown): Error {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      error.name === 'AbortError' ||
      message.includes('aborted') ||
      message.includes('canceled') ||
      message.includes('cancelled')
    ) {
      return new Error(`Request timed out while contacting ${endpoint}.`);
    }
    if (
      message.includes('network request failed') ||
      message.includes('failed to fetch') ||
      message.includes('connectexception') ||
      message.includes('connection refused') ||
      message.includes('failed to connect') ||
      message.includes('connection reset') ||
      message.includes('unexpected end of stream') ||
      message.includes('end of stream') ||
      message.includes('eofexception') ||
      message.includes('unable to resolve host') ||
      message.includes('cleartext')
    ) {
      return createBackendReachabilityError(endpoint);
    }
  }
  return error instanceof Error ? error : new Error('Unexpected network error.');
}

type ReactNativeFormDataFile = {
  uri: string;
  name: string;
  type: string;
};

function ensureFileUri(uri: string): string {
  if (uri.startsWith('file://') || uri.startsWith('content://')) {
    return uri;
  }
  return `file://${uri}`;
}

function toFormDataFile(
  asset: LocalDocumentAsset,
  fallbackName: string,
  fallbackMimeType: string,
): ReactNativeFormDataFile {
  return {
    uri: ensureFileUri(asset.uri),
    name: asset.fileName?.trim() || fallbackName,
    type: asset.mimeType?.trim() || fallbackMimeType,
  };
}

function appendFormDataFile(
  formData: FormData,
  fieldName: string,
  file: ReactNativeFormDataFile,
): void {
  formData.append(fieldName, file as unknown as Blob);
}

async function appendFormDataAsset(
  formData: FormData,
  fieldName: string,
  asset: LocalDocumentAsset,
  fallbackName: string,
  fallbackMimeType: string,
): Promise<void> {
  const file = toFormDataFile(asset, fallbackName, fallbackMimeType);

  try {
    const fileResponse = await fetchWithTimeout(file.uri, { method: 'GET' });
    if (!fileResponse.ok) {
      throw new Error(`Failed to read local file URI: ${file.uri}`);
    }

    const rawBlob = await fileResponse.blob();
    const typedBlob = rawBlob.type ? rawBlob : rawBlob.slice(0, rawBlob.size, file.type);
    formData.append(fieldName, typedBlob, file.name);
  } catch {
    // Fallback for platforms where local URI -> Blob conversion is unavailable.
    appendFormDataFile(formData, fieldName, file);
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await readAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function toAbsoluteApiUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;

  const baseUrl = getApiBaseUrl();
  return url.startsWith('/') ? `${baseUrl}${url}` : `${baseUrl}/${url}`;
}

function normalizeDriverVehicle(vehicle: DriverVehicle): DriverVehicle {
  return {
    ...vehicle,
    driverId: vehicle.driverId,
    brand: vehicle.brand ?? vehicle.make,
    make: vehicle.make ?? vehicle.brand,
    vehicleType: vehicle.vehicleType,
    vehicleTypeLegacy: vehicle.vehicleTypeLegacy ?? vehicle.vehicleType,
    licensePlateNumber: vehicle.licensePlateNumber ?? vehicle.plateNumber,
    plateNumber: vehicle.plateNumber ?? vehicle.licensePlateNumber,
    frontPhotoUrl: toAbsoluteApiUrl(vehicle.frontPhotoUrl),
    rearPhotoUrl: toAbsoluteApiUrl(vehicle.rearPhotoUrl),
    sidePhotoUrl: toAbsoluteApiUrl(vehicle.sidePhotoUrl),
    licensePlatePhotoUrl: toAbsoluteApiUrl(vehicle.licensePlatePhotoUrl),
    registrationFrontDocumentUrl: toAbsoluteApiUrl(vehicle.registrationFrontDocumentUrl),
    registrationBackDocumentUrl: toAbsoluteApiUrl(vehicle.registrationBackDocumentUrl),
    insuranceDocumentUrl: toAbsoluteApiUrl(vehicle.insuranceDocumentUrl),
    insuranceExpiryDate: vehicle.insuranceExpiryDate ?? null,
    registrationExpiryDate: vehicle.registrationExpiryDate ?? null,
    loadProfileName: vehicle.loadProfileName ?? null,
    dimensionsAreStandard: vehicle.dimensionsAreStandard ?? false,
    allowedCargoTypes: vehicle.allowedCargoTypes ?? [],
    workingSchedule: vehicle.workingSchedule ?? [],
    isDefaultLoadProfile: vehicle.isDefaultLoadProfile ?? false,
    status: vehicle.verificationStatus ?? vehicle.status ?? null,
    verificationStatus: vehicle.verificationStatus ?? vehicle.status ?? null,
    rejectionReason: vehicle.rejectionReason ?? null,
  };
}

function normalizeVehicleLoadCapacity(
  capacity: VehicleLoadCapacity,
): VehicleLoadCapacity {
  return {
    ...capacity,
    name: capacity.name ?? null,
    maxLoadKg: capacity.maxLoadKg ?? null,
    cargoLengthM: capacity.cargoLengthM ?? null,
    cargoWidthM: capacity.cargoWidthM ?? null,
    cargoHeightM: capacity.cargoHeightM ?? null,
    allowedCargoTypes: capacity.allowedCargoTypes ?? [],
    workingSchedule: capacity.workingSchedule ?? [],
    isDefault: Boolean(capacity.isDefault),
  };
}

function normalizeDriverDocumentsStatus(
  status: DriverDocumentsStatusResponse,
): DriverDocumentsStatusResponse {
  return {
    ...status,
    uploadedDocuments: (status.uploadedDocuments ?? []).map((document) => ({
      ...document,
      url: toAbsoluteApiUrl(document.url) ?? document.url,
    })),
  };
}

export async function registerDriver(payload: RegisterDriverPayload): Promise<DriverAuthResponse> {
  const endpoint = `${getApiBaseUrl()}/auth/driver/register`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }, AUTH_REGISTER_TIMEOUT_MS);
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Driver registration failed.');
  }

  return parseJsonResponse<DriverAuthResponse>(
    response,
    'Failed to parse driver registration response.',
  );
}

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  const endpoint = `${getApiBaseUrl()}/auth/login`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Login failed.');
  }

  return parseJsonResponse<LoginResponse>(response, 'Failed to parse login response.');
}

export async function loginDriver(payload: LoginPayload): Promise<LoginResponse> {
  const endpoint = `${getApiBaseUrl()}/auth/driver/login`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Driver login failed.');
  }

  return parseJsonResponse<LoginResponse>(
    response,
    'Failed to parse driver login response.',
  );
}

export async function getDriverMe(): Promise<DriverMeResponse> {
  const endpoint = `${getApiBaseUrl()}/driver/me`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'GET',
      headers: await getAuthHeaders(),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to load driver profile.');
  }

  return parseJsonResponse<DriverMeResponse>(response, 'Failed to parse driver profile response.');
}

export async function registerPushToken(payload: RegisterPushTokenPayload): Promise<void> {
  const endpoint = `${getApiBaseUrl()}/push-tokens`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to register push token.');
  }
}

export async function getDriverOnboardingStatus(): Promise<DriverOnboardingResponse> {
  const endpoint = `${getApiBaseUrl()}/driver/profile/onboarding`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'GET',
      headers: await getAuthHeaders(),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to load driver onboarding status.');
  }

  return parseJsonResponse<DriverOnboardingResponse>(
    response,
    'Failed to parse driver onboarding status response.',
  );
}

export async function updateDriverPersonalInfo(
  payload: DriverPersonalInfoPayload,
): Promise<DriverOnboardingResponse> {
  const endpoint = `${getApiBaseUrl()}/driver/profile/onboarding/personal-info`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to update driver personal info.');
  }

  return parseJsonResponse<DriverOnboardingResponse>(
    response,
    'Failed to parse driver personal info response.',
  );
}

export async function updateDriverProfile(
  payload: UpdateDriverProfilePayload,
): Promise<DriverMeResponse> {
  const endpoint = `${getApiBaseUrl()}/driver/me/profile`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'PATCH',
      headers: await getAuthHeaders(),
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to update driver profile.');
  }

  return parseJsonResponse<DriverMeResponse>(response, 'Failed to parse profile update response.');
}

export async function getDriverVehicles(): Promise<DriverVehicle[]> {
  const endpoint = `${getApiBaseUrl()}/driver/me/vehicles`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'GET',
      headers: await getAuthHeaders(),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to load driver vehicles.');
  }

  const data = await parseJsonResponse<DriverVehiclesListResponse>(
    response,
    'Failed to parse vehicles response.',
  );
  return (data.vehicles ?? []).map((item) => ({
    ...normalizeDriverVehicle(item.vehicle),
    documents: item.documents,
  }));
}

export async function getDriverVehicle(vehicleId: string): Promise<DriverVehicle> {
  const endpoint = `${getApiBaseUrl()}/driver/me/vehicles/${vehicleId}`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'GET',
      headers: await getAuthHeaders(),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to load driver vehicle.');
  }

  const data = await parseJsonResponse<DriverVehicleDocumentsResponse>(
    response,
    'Failed to parse driver vehicle response.',
  );
  return normalizeDriverVehicle(data.vehicle);
}

export async function createDriverVehicle(
  payload: CreateDriverVehiclePayload,
): Promise<DriverVehicle> {
  const endpoint = `${getApiBaseUrl()}/driver/me/vehicles`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to create driver vehicle.');
  }

  const data = await parseJsonResponse<DriverVehicleDocumentsResponse>(
    response,
    'Failed to parse create vehicle response.',
  );
  return normalizeDriverVehicle(data.vehicle);
}

export async function updateDriverVehicle(
  vehicleId: string,
  payload: Partial<CreateDriverVehiclePayload>,
): Promise<DriverVehicle> {
  const endpoint = `${getApiBaseUrl()}/driver/me/vehicles/${vehicleId}`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'PATCH',
      headers: await getAuthHeaders(),
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to update driver vehicle.');
  }

  const data = await parseJsonResponse<DriverVehicleDocumentsResponse>(
    response,
    'Failed to parse update vehicle response.',
  );
  return normalizeDriverVehicle(data.vehicle);
}

export async function deleteDriverVehicle(vehicleId: string): Promise<DriverVehicle> {
  const endpoint = `${getApiBaseUrl()}/driver/me/vehicles/${vehicleId}`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'DELETE',
      headers: await getAuthHeaders(),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to deactivate driver vehicle.');
  }

  const data = await parseJsonResponse<DriverVehicleDocumentsResponse>(
    response,
    'Failed to parse deactivate vehicle response.',
  );
  return normalizeDriverVehicle(data.vehicle);
}

export async function activateDriverVehicle(vehicleId: string): Promise<DriverVehicle> {
  const endpoint = `${getApiBaseUrl()}/driver/me/vehicles/${vehicleId}/activate`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'PATCH',
      headers: await getAuthHeaders(),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to activate driver vehicle.');
  }

  const data = await parseJsonResponse<DriverVehicleDocumentsResponse>(
    response,
    'Failed to parse activate vehicle response.',
  );
  return normalizeDriverVehicle(data.vehicle);
}

export async function approveDriverVehicleForTesting(vehicleId: string): Promise<DriverVehicle> {
  const endpoint = `${getApiBaseUrl()}/driver/me/vehicles/${vehicleId}/testing/approve`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'PATCH',
      headers: await getAuthHeaders(),
      body: JSON.stringify({}),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to approve vehicle in testing mode.');
  }

  const vehicles = await getDriverVehicles();
  const updatedVehicle = vehicles.find((vehicle) => vehicle.id === vehicleId);
  if (!updatedVehicle) {
    throw new Error('Vehicle approval request succeeded, but the updated vehicle was not found.');
  }
  return updatedVehicle;
}

export interface ApproveDriverVehicleDebugResponse {
  ok: boolean;
  status: number;
  rawBody: string;
}

export async function approveDriverVehicleForTestingDebug(
  vehicleId: string,
): Promise<ApproveDriverVehicleDebugResponse> {
  const endpoint = `${getApiBaseUrl()}/driver/me/vehicles/${vehicleId}/testing/approve`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'PATCH',
      headers: await getAuthHeaders(),
      body: JSON.stringify({}),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  const rawBody = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    rawBody,
  };
}

export async function getVehicleLoadCapacity(vehicleId: string): Promise<VehicleLoadCapacity> {
  const endpoint = `${getApiBaseUrl()}/driver/me/vehicles/${vehicleId}/load-capacity`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'GET',
      headers: await getAuthHeaders(),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to load vehicle load capacity.');
  }

  const data = await parseJsonResponse<VehicleLoadCapacity>(
    response,
    'Failed to parse vehicle load capacity response.',
  );
  return normalizeVehicleLoadCapacity(data);
}

export async function saveVehicleLoadCapacity(
  vehicleId: string,
  payload: VehicleLoadCapacityPayload,
): Promise<VehicleLoadCapacity> {
  const endpoint = `${getApiBaseUrl()}/driver/me/vehicles/${vehicleId}/load-capacity`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to save vehicle load capacity.');
  }

  const data = await parseJsonResponse<VehicleLoadCapacity>(
    response,
    'Failed to parse vehicle load capacity save response.',
  );
  return normalizeVehicleLoadCapacity(data);
}

export async function getMyLoadCapacities(): Promise<VehicleLoadCapacity[]> {
  const endpoint = `${getApiBaseUrl()}/driver/me/load-capacities`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'GET',
      headers: await getAuthHeaders(),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to load vehicle load capacities.');
  }

  const data = await parseJsonResponse<VehicleLoadCapacitiesListResponse>(
    response,
    'Failed to parse vehicle load capacities response.',
  );
  return (data.loadCapacities ?? []).map(normalizeVehicleLoadCapacity);
}

export async function setDefaultLoadCapacity(vehicleId: string): Promise<VehicleLoadCapacity> {
  const endpoint = `${getApiBaseUrl()}/driver/me/vehicles/${vehicleId}/load-capacity/set-default`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({}),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to set default load capacity.');
  }

  const data = await parseJsonResponse<VehicleLoadCapacity>(
    response,
    'Failed to parse default load capacity response.',
  );
  return normalizeVehicleLoadCapacity(data);
}

export async function uploadDriverVehicleDocuments(
  vehicleId: string,
  payload: {
    frontPhoto?: LocalDocumentAsset;
    rearPhoto?: LocalDocumentAsset;
    sidePhoto?: LocalDocumentAsset;
    licensePlatePhoto?: LocalDocumentAsset;
    registrationFrontDocument?: LocalDocumentAsset;
    registrationBackDocument?: LocalDocumentAsset;
    insuranceDocument?: LocalDocumentAsset;
    insuranceExpiryDate?: string;
    registrationExpiryDate?: string;
  },
): Promise<DriverVehicleDocumentsResponse> {
  const endpoint = `${getApiBaseUrl()}/driver/me/vehicles/${vehicleId}/documents`;
  const formData = new FormData();

  if (payload.frontPhoto) {
    await appendFormDataAsset(
      formData,
      'frontPhoto',
      payload.frontPhoto,
      'vehicle-front-photo.jpg',
      'image/jpeg',
    );
  }
  if (payload.rearPhoto) {
    await appendFormDataAsset(
      formData,
      'rearPhoto',
      payload.rearPhoto,
      'vehicle-rear-photo.jpg',
      'image/jpeg',
    );
  }
  if (payload.sidePhoto) {
    await appendFormDataAsset(
      formData,
      'sidePhoto',
      payload.sidePhoto,
      'vehicle-side-photo.jpg',
      'image/jpeg',
    );
  }
  if (payload.licensePlatePhoto) {
    await appendFormDataAsset(
      formData,
      'licensePlatePhoto',
      payload.licensePlatePhoto,
      'vehicle-license-plate-photo.jpg',
      'image/jpeg',
    );
  }
  if (payload.registrationFrontDocument) {
    await appendFormDataAsset(
      formData,
      'registrationFrontDocument',
      payload.registrationFrontDocument,
      'vehicle-registration-front.jpg',
      'image/jpeg',
    );
  }
  if (payload.registrationBackDocument) {
    await appendFormDataAsset(
      formData,
      'registrationBackDocument',
      payload.registrationBackDocument,
      'vehicle-registration-back.jpg',
      'image/jpeg',
    );
  }
  if (payload.insuranceDocument) {
    await appendFormDataAsset(
      formData,
      'insuranceDocument',
      payload.insuranceDocument,
      'vehicle-insurance-document.jpg',
      'image/jpeg',
    );
  }
  if (payload.insuranceExpiryDate) {
    formData.append('insuranceExpiryDate', payload.insuranceExpiryDate);
  }
  if (payload.registrationExpiryDate) {
    formData.append('registrationExpiryDate', payload.registrationExpiryDate);
  }

  const token = await readAccessToken();

  let xhrResponse: XhrResponsePayload;
  try {
    xhrResponse = await uploadFormDataWithXhr(endpoint, formData, token ?? undefined);
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (xhrResponse.status < 200 || xhrResponse.status >= 300) {
    const raw = xhrResponse.responseText?.trim();
    if (!raw) {
      throw new Error('Failed to upload driver vehicle documents.');
    }
    try {
      const errorData = JSON.parse(raw) as ApiErrorResponse;
      throw new Error(
        normalizeErrorMessage(errorData, 'Failed to upload driver vehicle documents.'),
      );
    } catch {
      throw new Error(raw);
    }
  }

  const successRaw = xhrResponse.responseText?.trim();
  if (!successRaw) {
    throw new Error('Invalid upload response from server.');
  }
  try {
    return JSON.parse(successRaw) as DriverVehicleDocumentsResponse;
  } catch {
    throw new Error(`Invalid upload response from server: ${successRaw}`);
  }
}

export async function getDriverDocumentsStatus(): Promise<DriverDocumentsStatusResponse> {
  const endpoint = `${getApiBaseUrl()}/driver/onboarding/documents`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'GET',
      headers: await getAuthHeaders(),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to load driver documents status.');
  }

  const data = await parseJsonResponse<DriverDocumentsStatusResponse>(
    response,
    'Failed to parse driver documents status response.',
  );
  return normalizeDriverDocumentsStatus(data);
}

export async function uploadDriverDocument(payload: {
  documentType: 'PERSONAL_SELFIE' | 'ID_FRONT' | 'ID_BACK' | 'DRIVING_LICENSE' | 'SELF_IDENTITY_VERIFICATION';
  file: LocalDocumentAsset;
  expiryDate?: string;
  idDocumentKind?: IdentityDocumentKind;
}): Promise<DriverDocumentsStatusResponse> {
  const endpoint = `${getApiBaseUrl()}/driver/onboarding/documents`;
  const formData = new FormData();

  switch (payload.documentType) {
    case 'PERSONAL_SELFIE':
      await appendFormDataAsset(formData, 'personalSelfie', payload.file, 'personal-selfie.jpg', 'image/jpeg');
      break;
    case 'ID_FRONT':
      await appendFormDataAsset(formData, 'idFront', payload.file, 'id-front.jpg', 'image/jpeg');
      if (payload.expiryDate) formData.append('idExpiryDate', payload.expiryDate);
      if (payload.idDocumentKind) formData.append('idDocumentKind', payload.idDocumentKind);
      break;
    case 'ID_BACK':
      await appendFormDataAsset(formData, 'idBack', payload.file, 'id-back.jpg', 'image/jpeg');
      if (payload.expiryDate) formData.append('idExpiryDate', payload.expiryDate);
      if (payload.idDocumentKind) formData.append('idDocumentKind', payload.idDocumentKind);
      break;
    case 'DRIVING_LICENSE':
      await appendFormDataAsset(formData, 'drivingLicense', payload.file, 'driving-license.jpg', 'image/jpeg');
      if (payload.expiryDate) formData.append('drivingLicenseExpiryDate', payload.expiryDate);
      break;
    case 'SELF_IDENTITY_VERIFICATION':
      await appendFormDataAsset(
        formData,
        'selfIdentityVerification',
        payload.file,
        'self-identity-verification.jpg',
        'image/jpeg',
      );
      break;
  }

  const token = await readAccessToken();

  let xhrResponse: XhrResponsePayload;
  try {
    xhrResponse = await uploadFormDataWithXhr(endpoint, formData, token ?? undefined);
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (xhrResponse.status < 200 || xhrResponse.status >= 300) {
    const raw = xhrResponse.responseText?.trim();
    if (!raw) {
      throw new Error('Failed to upload driver document.');
    }
    try {
      const errorData = JSON.parse(raw) as ApiErrorResponse;
      throw new Error(normalizeErrorMessage(errorData, 'Failed to upload driver document.'));
    } catch {
      throw new Error(raw);
    }
  }

  const successRaw = xhrResponse.responseText?.trim();
  if (!successRaw) {
    throw new Error('Invalid upload response from server.');
  }

  try {
    return normalizeDriverDocumentsStatus(
      JSON.parse(successRaw) as DriverDocumentsStatusResponse,
    );
  } catch {
    throw new Error(`Invalid upload response from server: ${successRaw}`);
  }
}

export async function submitDriverDocumentsForReview(): Promise<DriverDocumentsStatusResponse> {
  const endpoint = `${getApiBaseUrl()}/driver/onboarding/submit-review`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({}),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to submit driver documents for review.');
  }

  const data = await parseJsonResponse<DriverDocumentsStatusResponse>(
    response,
    'Failed to parse submit review response.',
  );
  return normalizeDriverDocumentsStatus(data);
}

export async function getDriverAvailability(): Promise<DriverAvailabilityResponse> {
  const endpoint = `${getApiBaseUrl()}/driver/me/availability`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'GET',
      headers: await getAuthHeaders(),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to load driver availability.');
  }

  return parseJsonResponse<DriverAvailabilityResponse>(
    response,
    'Failed to parse availability response.',
  );
}

export async function updateDriverAvailability(
  payload: UpdateDriverAvailabilityPayload,
): Promise<DriverAvailabilityResponse> {
  const endpoint = `${getApiBaseUrl()}/driver/me/availability`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'PUT',
      headers: await getAuthHeaders(),
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to save driver availability.');
  }

  return parseJsonResponse<DriverAvailabilityResponse>(
    response,
    'Failed to parse availability update response.',
  );
}

export async function updateDriverOnlineStatus(
  payload: UpdateDriverOnlineStatusPayload,
): Promise<DriverAvailabilityResponse> {
  const endpoint = `${getApiBaseUrl()}/driver/me/availability/online-status`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'PATCH',
      headers: await getAuthHeaders(),
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to update online status.');
  }

  return parseJsonResponse<DriverAvailabilityResponse>(
    response,
    'Failed to parse online status response.',
  );
}

export async function approveDriverForTesting(): Promise<DriverMeResponse> {
  const endpoint = `${getApiBaseUrl()}/driver/me/testing/approve`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'PATCH',
      headers: await getAuthHeaders(),
      body: JSON.stringify({}),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to approve driver in testing mode.');
  }

  try {
    return await parseJsonResponse<DriverMeResponse>(
      response,
      'Failed to parse testing approval response.',
    );
  } catch {
    return getDriverMe();
  }
}

export interface ApproveDriverDebugResponse {
  ok: boolean;
  status: number;
  rawBody: string;
}

export interface ResetUsersForTestingResponse {
  deletedUsers: number;
  keptEmail: string;
}

export interface SendCustomerTestNotificationResponse {
  success: true;
  email: string;
  customerId: string;
}

export async function approveDriverForTestingDebug(): Promise<ApproveDriverDebugResponse> {
  const endpoint = `${getApiBaseUrl()}/driver/me/testing/approve`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'PATCH',
      headers: await getAuthHeaders(),
      body: JSON.stringify({}),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  const rawBody = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    rawBody,
  };
}

export async function sendCustomerTestNotification(
  email: string,
): Promise<SendCustomerTestNotificationResponse> {
  const endpoint = `${getApiBaseUrl()}/driver/me/testing/send-customer-notification`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ email }),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to send customer test notification.');
  }

  return parseJsonResponse<SendCustomerTestNotificationResponse>(
    response,
    'Failed to parse customer test notification response.',
  );
}

export async function resetUsersForTesting(): Promise<ResetUsersForTestingResponse> {
  const endpoint = `${getApiBaseUrl()}/auth/testing/reset-drivers`;
  const payload: ResetUsersForTestingPayload = {
    keepEmail: 'driver@test.com',
    role: 'DRIVER',
  };
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to reset users for testing.');
  }

  const data = await parseJsonResponse<
    ResetUsersForTestingResponse | { deletedDrivers: number; keptEmail: string }
  >(response, 'Failed to parse reset users response.');

  if ('deletedUsers' in data) {
    return data;
  }

  return {
    deletedUsers: data.deletedDrivers,
    keptEmail: data.keptEmail,
  };
}

export async function getDriverRequestAlerts(): Promise<DriverRequestAlertsResponse> {
  const endpoint = `${getApiBaseUrl()}/driver/requests/alerts`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'GET',
      headers: await getAuthHeaders(),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to load request alerts.');
  }

  return parseJsonResponse<DriverRequestAlertsResponse>(
    response,
    'Failed to parse request alerts response.',
  );
}

export async function getDriverRequestDetails(
  requestId: string,
): Promise<DriverRequestDetailsResponse> {
  const endpoint = `${getApiBaseUrl()}/driver/requests/${requestId}`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'GET',
      headers: await getAuthHeaders(),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to load request details.');
  }

  return parseJsonResponse<DriverRequestDetailsResponse>(
    response,
    'Failed to parse request details response.',
  );
}

export async function acceptDriverRequestAlert(
  requestId: string,
): Promise<AcceptDriverRequestAlertResponse> {
  const endpoint = `${getApiBaseUrl()}/driver/requests/${requestId}/accept-alert`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({}),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to accept request alert.');
  }

  return parseJsonResponse<AcceptDriverRequestAlertResponse>(
    response,
    'Failed to parse accept alert response.',
  );
}

export async function ignoreDriverRequestAlert(
  requestId: string,
): Promise<IgnoreDriverRequestAlertResponse> {
  const endpoint = `${getApiBaseUrl()}/driver/requests/${requestId}/ignore-alert`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({}),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to ignore request alert.');
  }

  return parseJsonResponse<IgnoreDriverRequestAlertResponse>(
    response,
    'Failed to parse ignore alert response.',
  );
}

export async function sendDriverPriceOffer(
  requestId: string,
  payload: SendDriverPriceOfferPayload,
): Promise<SendDriverPriceOfferResponse> {
  const endpoint = `${getApiBaseUrl()}/driver/requests/${requestId}/offers`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to send price offer.');
  }

  return parseJsonResponse<SendDriverPriceOfferResponse>(
    response,
    'Failed to parse send price offer response.',
  );
}

export async function getDriverAcceptedJobs(): Promise<DriverAcceptedJobsResponse> {
  const endpoint = `${getApiBaseUrl()}/driver/jobs/accepted`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'GET',
      headers: await getAuthHeaders(),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to load accepted jobs.');
  }

  const jobs = await parseJsonResponse<DriverAcceptedJobsResponse['jobs']>(
    response,
    'Failed to parse accepted jobs response.',
  );
  return { jobs };
}

export async function getDriverAcceptedJobDetails(
  requestId: string,
): Promise<DriverAcceptedJobDetailsResponse> {
  const endpoint = `${getApiBaseUrl()}/driver/jobs/${requestId}`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'GET',
      headers: await getAuthHeaders(),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to load accepted job details.');
  }

  return parseJsonResponse<DriverAcceptedJobDetailsResponse>(
    response,
    'Failed to parse accepted job details response.',
  );
}

export interface StripeConnectStatusResponse {
  stripeAccountId: string | null;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
  accountStatus: string | null;
}

export interface StripeConnectAccountResponse {
  stripeAccountId: string;
  onboardingUrl: string;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
}

export interface StripeConnectSyncResponse {
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
  accountStatus: string;
}

export async function getStripeConnectStatus(): Promise<StripeConnectStatusResponse> {
  const endpoint = `${getApiBaseUrl()}/driver/me/stripe-connect/status`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'GET',
      headers: await getAuthHeaders(),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to load Stripe Connect status.');
  }

  return parseJsonResponse<StripeConnectStatusResponse>(
    response,
    'Failed to parse Stripe Connect status response.',
  );
}

export async function createStripeConnectAccount(): Promise<StripeConnectAccountResponse> {
  const endpoint = `${getApiBaseUrl()}/driver/me/stripe-connect/account`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: await getAuthHeaders(),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to create Stripe Connect account.');
  }

  return parseStripeConnectAccountResponse(
    response,
    'Failed to parse Stripe Connect account response.',
  );
}

export async function syncStripeConnectAccount(): Promise<StripeConnectSyncResponse> {
  const endpoint = `${getApiBaseUrl()}/driver/me/stripe-connect/sync`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: await getAuthHeaders(),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to sync Stripe Connect account.');
  }

  return parseJsonResponse<StripeConnectSyncResponse>(
    response,
    'Failed to parse Stripe Connect sync response.',
  );
}

export async function getStripeConnectDashboardLink(): Promise<{ url: string }> {
  const endpoint = `${getApiBaseUrl()}/driver/me/stripe-connect/dashboard-link`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'GET',
      headers: await getAuthHeaders(),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to load Stripe dashboard link.');
  }

  return parseJsonResponse<{ url: string }>(
    response,
    'Failed to parse Stripe dashboard link response.',
  );
}

export interface RetryTransferResponse {
  transferred: boolean;
  stripeTransferId: string | null;
  reason: string | null;
}

export async function retryTransferForTrip(tripId: string): Promise<RetryTransferResponse> {
  const endpoint = `${getApiBaseUrl()}/driver/me/stripe-connect/retry-transfer/${tripId}`;
  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: await getAuthHeaders(),
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to retry transfer.');
  }

  return parseJsonResponse<RetryTransferResponse>(
    response,
    'Failed to parse retry transfer response.',
  );
}
