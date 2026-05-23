import { readAccessToken } from './auth-storage';
import type {
  DriverAuthResponse,
  DriverMeResponse,
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
