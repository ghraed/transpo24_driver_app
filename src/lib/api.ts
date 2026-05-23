import type { DriverAuthResponse, LoginPayload, LoginResponse, RegisterDriverPayload } from '@/types/auth';

interface ApiErrorResponse {
  message?: string | string[];
}

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

export async function registerDriver(payload: RegisterDriverPayload): Promise<DriverAuthResponse> {
  const response = await fetch(`${getApiBaseUrl()}/auth/driver/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await parseError(response, 'Driver registration failed.');
  }

  return (await response.json()) as DriverAuthResponse;
}

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  const response = await fetch(`${getApiBaseUrl()}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await parseError(response, 'Login failed.');
  }

  return (await response.json()) as LoginResponse;
}
