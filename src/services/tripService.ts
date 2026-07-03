import type { LocalDocumentAsset } from '@/types/auth';
import { readAccessToken } from '@/lib/auth-storage';
import type {
  AdditionalExpenseResponse,
  CreateAdditionalExpensePayload,
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

type XhrResponsePayload = {
  status: number;
  responseText: string;
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

function ensureFileUri(uri: string): string {
  if (uri.startsWith('file://') || uri.startsWith('content://')) {
    return uri;
  }
  return `file://${uri}`;
}

function appendAsset(formData: FormData, fieldName: string, asset: LocalDocumentAsset): void {
  formData.append(fieldName, {
    uri: ensureFileUri(asset.uri),
    name: asset.fileName?.trim() || `${fieldName}.jpg`,
    type: asset.mimeType?.trim() || 'image/jpeg',
  } as unknown as Blob);
}

function uploadFormDataWithXhr(
  endpoint: string,
  formData: FormData,
  token?: string,
  method: 'POST' | 'PATCH' = 'POST',
): Promise<XhrResponsePayload> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, endpoint);
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

  const formData = new FormData();
  if (typeof payload.latitude === 'number') {
    formData.append('latitude', String(payload.latitude));
  }
  if (typeof payload.longitude === 'number') {
    formData.append('longitude', String(payload.longitude));
  }
  if (payload.notes?.trim()) {
    formData.append('notes', payload.notes.trim());
  }
  if (payload.proofImageUrl?.trim()) {
    formData.append('proofImageUrl', payload.proofImageUrl.trim());
  }
  payload.proofPhotos?.forEach((photo) => appendAsset(formData, 'photos', photo));

  const token = await readAccessToken();
  let xhrResponse: XhrResponsePayload;
  try {
    xhrResponse = await uploadFormDataWithXhr(endpoint, formData, token ?? undefined, 'PATCH');
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (xhrResponse.status < 200 || xhrResponse.status >= 300) {
    const raw = xhrResponse.responseText?.trim();
    if (!raw) {
      throw new Error('Failed to confirm pickup item.');
    }
    try {
      const errorData = JSON.parse(raw) as ApiErrorResponse;
      throw new Error(normalizeErrorMessage(errorData, 'Failed to confirm pickup item.'));
    } catch {
      throw new Error(raw);
    }
  }

  const rawResponse = JSON.parse(xhrResponse.responseText) as unknown;
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

  const formData = new FormData();
  if (typeof payload.latitude === 'number') {
    formData.append('latitude', String(payload.latitude));
  }
  if (typeof payload.longitude === 'number') {
    formData.append('longitude', String(payload.longitude));
  }
  if (payload.notes?.trim()) {
    formData.append('notes', payload.notes.trim());
  }
  if (payload.proofImageUrl?.trim()) {
    formData.append('proofImageUrl', payload.proofImageUrl.trim());
  }
  payload.proofPhotos?.forEach((photo) => appendAsset(formData, 'photos', photo));

  const token = await readAccessToken();
  let xhrResponse: XhrResponsePayload;
  try {
    xhrResponse = await uploadFormDataWithXhr(endpoint, formData, token ?? undefined, 'PATCH');
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (xhrResponse.status < 200 || xhrResponse.status >= 300) {
    const raw = xhrResponse.responseText?.trim();
    if (!raw) {
      throw new Error('Failed to confirm item delivery.');
    }
    try {
      const errorData = JSON.parse(raw) as ApiErrorResponse;
      throw new Error(normalizeErrorMessage(errorData, 'Failed to confirm item delivery.'));
    } catch {
      throw new Error(raw);
    }
  }

  const rawResponse = JSON.parse(xhrResponse.responseText) as unknown;
  const validated = validateDeliverItemResponse(rawResponse);

  if (!validated) {
    throw new Error('Invalid deliver item response received from backend.');
  }

  return validated;
}

export async function createAdditionalExpense(
  requestId: string,
  payload: CreateAdditionalExpensePayload,
): Promise<AdditionalExpenseResponse> {
  if (!isValidTripId(requestId)) {
    throw new Error('Invalid trip id.');
  }
  if (!(payload.amount > 0)) {
    throw new Error('Expense amount must be greater than 0.');
  }
  if (!payload.reason.trim()) {
    throw new Error('Expense reason is required.');
  }

  const endpoint = `${getApiBaseUrl()}/driver/requests/${encodeURIComponent(requestId.trim())}/additional-charges`;
  const formData = new FormData();
  formData.append('amount', String(payload.amount));
  formData.append('reason', payload.reason.trim());
  if (payload.equipmentType?.trim()) {
    formData.append('equipmentType', payload.equipmentType.trim());
  }
  appendAsset(formData, 'invoice', payload.invoice);

  const token = await readAccessToken();
  let xhrResponse: XhrResponsePayload;
  try {
    xhrResponse = await uploadFormDataWithXhr(endpoint, formData, token ?? undefined, 'POST');
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (xhrResponse.status < 200 || xhrResponse.status >= 300) {
    const raw = xhrResponse.responseText?.trim();
    if (!raw) {
      throw new Error('Failed to submit additional expense.');
    }
    try {
      const errorData = JSON.parse(raw) as ApiErrorResponse;
      throw new Error(normalizeErrorMessage(errorData, 'Failed to submit additional expense.'));
    } catch {
      throw new Error(raw);
    }
  }

  return JSON.parse(xhrResponse.responseText) as AdditionalExpenseResponse;
}
