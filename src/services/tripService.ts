import { readAccessToken } from '@/lib/auth-storage';
import type {
  DeliverItemRequest,
  DeliverItemResponse,
  PickupItemRequest,
  PickupItemResponse,
  StartDeliveryResponse,
} from '@/types/trip.types';
import {
  validateDeliverItemRequest,
  validateDeliverItemResponse,
  validateStartDeliveryResponse,
} from '@/utils/deliveryValidation';
import {
  isValidTripId,
  validatePickupItemRequest,
  validatePickupItemResponse,
} from '@/utils/pickupValidation';

const REQUEST_TIMEOUT_MS = 12000;

type ApiErrorResponse = {
  message?: string | string[];
};

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
    const rawText = await response.text();
    if (!rawText) {
      return new Error(fallback);
    }

    try {
      const errorData = JSON.parse(rawText) as ApiErrorResponse;
      return new Error(normalizeErrorMessage(errorData, fallback));
    } catch {
      return new Error(rawText);
    }
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

export async function pickupItem(
  tripId: string,
  payload: PickupItemRequest,
): Promise<PickupItemResponse> {
  if (!isValidTripId(tripId)) {
    throw new Error('Invalid trip id.');
  }

  const validationError = validatePickupItemRequest(payload);
  if (validationError) {
    throw new Error(validationError);
  }

  const endpoint = `${getApiBaseUrl()}/driver/trips/${encodeURIComponent(tripId.trim())}/pickup-item`;

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
    throw await parseError(response, 'Failed to confirm pickup item.');
  }

  const rawResponse = (await response.json()) as unknown;
  const validated = validatePickupItemResponse(rawResponse);

  if (!validated) {
    throw new Error('Invalid pickup item response received from backend.');
  }

  return validated;
}

export async function startDelivery(tripId: string): Promise<StartDeliveryResponse> {
  if (!isValidTripId(tripId)) {
    throw new Error('Invalid trip id.');
  }

  const endpoint = `${getApiBaseUrl()}/driver/trips/${encodeURIComponent(tripId.trim())}/start-delivery`;

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
    throw await parseError(response, 'Failed to start delivery.');
  }

  const rawResponse = (await response.json()) as unknown;
  const validated = validateStartDeliveryResponse(rawResponse);

  if (!validated) {
    throw new Error('Invalid start delivery response received from backend.');
  }

  return validated;
}

export async function deliverItem(
  tripId: string,
  payload: DeliverItemRequest,
): Promise<DeliverItemResponse> {
  if (!isValidTripId(tripId)) {
    throw new Error('Invalid trip id.');
  }

  const validationError = validateDeliverItemRequest(payload);
  if (validationError) {
    throw new Error(validationError);
  }

  const endpoint = `${getApiBaseUrl()}/driver/trips/${encodeURIComponent(tripId.trim())}/deliver-item`;

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
    throw await parseError(response, 'Failed to confirm item delivery.');
  }

  const rawResponse = (await response.json()) as unknown;
  const validated = validateDeliverItemResponse(rawResponse);

  if (!validated) {
    throw new Error('Invalid deliver item response received from backend.');
  }

  return validated;
}
