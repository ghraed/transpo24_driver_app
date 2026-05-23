import { readAccessToken } from './auth-storage';
import type {
  CreateDriverVehiclePayload,
  DriverAuthResponse,
  DriverMeResponse,
  DriverVehicle,
  DriverVehicleDocumentsResponse,
  DriverVehiclesListResponse,
  LocalDocumentAsset,
  LoginPayload,
  LoginResponse,
  RegisterDriverPayload,
  UpdateDriverProfilePayload,
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

async function parseError(response: Response, fallback: string): Promise<Error> {
  try {
    const errorData = (await response.json()) as ApiErrorResponse;
    return new Error(normalizeErrorMessage(errorData, fallback));
  } catch {
    return new Error(fallback);
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

type ReactNativeFormDataPart = string | ReactNativeFormDataFile;

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
  formData.append(fieldName, file as unknown as ReactNativeFormDataPart);
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

  return (await response.json()) as DriverAuthResponse;
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

  return (await response.json()) as LoginResponse;
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

  return (await response.json()) as DriverMeResponse;
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

  return (await response.json()) as DriverMeResponse;
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

  const data = (await response.json()) as DriverVehiclesListResponse;
  return (data.vehicles ?? []).map((item) => ({
    ...item.vehicle,
    documents: item.documents,
  }));
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

  const data = (await response.json()) as DriverVehicleDocumentsResponse;
  return data.vehicle;
}

export async function uploadDriverVehicleDocuments(
  vehicleId: string,
  payload: {
    driverLicenseFront: LocalDocumentAsset;
    driverLicenseBack: LocalDocumentAsset;
    identityDocument: LocalDocumentAsset;
    vehicleRegistration: LocalDocumentAsset;
    vehicleInsurance: LocalDocumentAsset;
    vehiclePhotos: LocalDocumentAsset[];
  },
): Promise<DriverVehicleDocumentsResponse> {
  const endpoint = `${getApiBaseUrl()}/driver/me/vehicles/${vehicleId}/documents`;
  const formData = new FormData();

  await appendFormDataAsset(
    formData,
    'driverLicenseFront',
    payload.driverLicenseFront,
    'driver-license-front.jpg',
    'image/jpeg',
  );
  await appendFormDataAsset(
    formData,
    'driverLicenseBack',
    payload.driverLicenseBack,
    'driver-license-back.jpg',
    'image/jpeg',
  );
  await appendFormDataAsset(
    formData,
    'identityDocument',
    payload.identityDocument,
    'identity-document.jpg',
    'image/jpeg',
  );
  await appendFormDataAsset(
    formData,
    'vehicleRegistration',
    payload.vehicleRegistration,
    'vehicle-registration.jpg',
    'image/jpeg',
  );
  await appendFormDataAsset(
    formData,
    'vehicleInsurance',
    payload.vehicleInsurance,
    'vehicle-insurance.jpg',
    'image/jpeg',
  );

  for (const [index, photo] of payload.vehiclePhotos.entries()) {
    await appendFormDataAsset(
      formData,
      'vehiclePhotos',
      photo,
      `vehicle-photo-${index + 1}.jpg`,
      'image/jpeg',
    );
  }

  const token = await readAccessToken();

  let xhrResponse: XhrResponsePayload;
  try {
    xhrResponse = await uploadFormDataWithXhr(endpoint, formData, token);
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (xhrResponse.status < 200 || xhrResponse.status >= 300) {
    try {
      const errorData = JSON.parse(xhrResponse.responseText) as ApiErrorResponse;
      throw new Error(normalizeErrorMessage(errorData, 'Failed to upload driver vehicle documents.'));
    } catch {
      throw new Error('Failed to upload driver vehicle documents.');
    }
  }

  try {
    return JSON.parse(xhrResponse.responseText) as DriverVehicleDocumentsResponse;
  } catch {
    throw new Error('Invalid upload response from server.');
  }
}
