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

function toFormDataFile(
  asset: LocalDocumentAsset,
  fallbackName: string,
  fallbackMimeType: string,
): ReactNativeFormDataFile {
  return {
    uri: asset.uri,
    name: asset.fileName ?? fallbackName,
    type: asset.mimeType ?? fallbackMimeType,
  };
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

  formData.append(
    'driverLicenseFront',
    toFormDataFile(payload.driverLicenseFront, 'driver-license-front.jpg', 'image/jpeg') as unknown as Blob,
  );
  formData.append(
    'driverLicenseBack',
    toFormDataFile(payload.driverLicenseBack, 'driver-license-back.jpg', 'image/jpeg') as unknown as Blob,
  );
  formData.append(
    'identityDocument',
    toFormDataFile(payload.identityDocument, 'identity-document.jpg', 'image/jpeg') as unknown as Blob,
  );
  formData.append(
    'vehicleRegistration',
    toFormDataFile(payload.vehicleRegistration, 'vehicle-registration.jpg', 'image/jpeg') as unknown as Blob,
  );
  formData.append(
    'vehicleInsurance',
    toFormDataFile(payload.vehicleInsurance, 'vehicle-insurance.jpg', 'image/jpeg') as unknown as Blob,
  );

  payload.vehiclePhotos.forEach((photo, index) => {
    formData.append(
      'vehiclePhotos',
      toFormDataFile(photo, `vehicle-photo-${index + 1}.jpg`, 'image/jpeg') as unknown as Blob,
    );
  });

  const token = await readAccessToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers,
      body: formData,
    });
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to upload driver vehicle documents.');
  }

  return (await response.json()) as DriverVehicleDocumentsResponse;
}
