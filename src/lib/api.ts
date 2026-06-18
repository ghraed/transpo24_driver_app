import { readAccessToken } from './auth-storage';
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

const REQUEST_TIMEOUT_MS = 12000;

function getApiBaseUrl(): string {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  if (!baseUrl) {
    throw new Error('EXPO_PUBLIC_API_URL is missing. Please set it in your environment.');
  }
  return baseUrl;
}

function normalizeErrorMessage(errorData: ApiErrorResponse, fallback: string): string {
  if (Array.isArray(errorData.message)) {
    return errorData.message[0] ?? fallback;
  }
  return errorData.message ?? fallback;
}

function tryParseJson<T>(rawText: string): T {
  return JSON.parse(rawText) as T;
}

function sanitizeMalformedJson(rawText: string): string {
  return rawText
    .replace(/^\uFEFF/, '')
    .replace(/,\s*,+/g, ',')
    .replace(/,\s*([}\]])/g, '$1');
}

function parsePossiblyMalformedJson<T>(rawText: string): T {
  try {
    return tryParseJson<T>(rawText);
  } catch {
    const sanitized = sanitizeMalformedJson(rawText);
    if (sanitized === rawText) {
      throw new Error('JSON_PARSE_FAILED');
    }
    return tryParseJson<T>(sanitized);
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
      return new Error(rawText);
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

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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
      reject(
        new Error(
          `Cannot reach backend at ${endpoint}. Verify EXPO_PUBLIC_API_URL and backend network access. ` +
            'Android emulator: use http://10.0.2.2:3000, iOS simulator: http://localhost:3000, physical device: use your computer LAN IP.',
        ),
      );
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
      message.includes('connectexception')
    ) {
      return new Error(
        `Cannot reach backend at ${endpoint}. Verify EXPO_PUBLIC_API_URL and backend network access. ` +
          'Android emulator: use http://10.0.2.2:3000, iOS simulator: http://localhost:3000, physical device: use your computer LAN IP.',
      );
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
    });
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
