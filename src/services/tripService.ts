import { readAccessToken } from '@/lib/auth-storage';
import { createBackendReachabilityError, getBackendApiBaseUrl } from '@/config/backend';
import type {
  DeliverItemRequest,
  DeliverItemResponse,
  PickupItemRequest,
  PickupItemResponse,
  StartDeliveryResponse,
} from '@/types/trip.types';
import type { LocalDocumentAsset } from '@/types/auth';
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

type ReactNativeFormDataFile = {
  uri: string;
  name: string;
  type: string;
};

function getApiBaseUrl(): string {
  return getBackendApiBaseUrl();
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

function appendFormDataAsset(
  formData: FormData,
  fieldName: string,
  asset: LocalDocumentAsset,
  fallbackName: string,
  fallbackMimeType: string,
): void {
  appendFormDataFile(
    formData,
    fieldName,
    toFormDataFile(asset, fallbackName, fallbackMimeType),
  );
}

function appendFormDataAssets(
  formData: FormData,
  fieldName: string,
  assets: LocalDocumentAsset[],
  fallbackBaseName: string,
  fallbackMimeType: string,
): void {
  for (const [index, asset] of assets.entries()) {
    appendFormDataAsset(
      formData,
      fieldName,
      asset,
      `${fallbackBaseName}-${index + 1}.jpg`,
      fallbackMimeType,
    );
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

async function getMultipartAuthHeaders(): Promise<Record<string, string>> {
  const token = await readAccessToken();
  const headers: Record<string, string> = {};

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
  const proofPhotos = payload.proofPhotos?.length
    ? payload.proofPhotos
    : payload.proofPhoto
    ? [payload.proofPhoto]
    : [];

  let response: Response;
  try {
    if (proofPhotos.length > 0) {
      const formData = new FormData();
      if (payload.notes?.trim()) formData.append('notes', payload.notes.trim());
      if (payload.proofImageUrl?.trim()) formData.append('proofImageUrl', payload.proofImageUrl.trim());
      appendFormDataAssets(formData, 'photos', proofPhotos, 'pickup-proof', 'image/jpeg');
      response = await fetchWithTimeout(endpoint, {
        method: 'PATCH',
        headers: await getMultipartAuthHeaders(),
        body: formData,
      });
    } else {
      response = await fetchWithTimeout(endpoint, {
        method: 'PATCH',
        headers: await getAuthHeaders(),
        body: JSON.stringify(payload),
      });
    }
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
  const proofPhotos = payload.proofPhotos?.length
    ? payload.proofPhotos
    : payload.proofPhoto
    ? [payload.proofPhoto]
    : [];

  let response: Response;
  try {
    if (proofPhotos.length > 0) {
      const formData = new FormData();
      if (payload.notes?.trim()) formData.append('notes', payload.notes.trim());
      if (payload.proofImageUrl?.trim()) formData.append('proofImageUrl', payload.proofImageUrl.trim());
      appendFormDataAssets(formData, 'photos', proofPhotos, 'delivery-proof', 'image/jpeg');
      response = await fetchWithTimeout(endpoint, {
        method: 'PATCH',
        headers: await getMultipartAuthHeaders(),
        body: formData,
      });
    } else {
      response = await fetchWithTimeout(endpoint, {
        method: 'PATCH',
        headers: await getAuthHeaders(),
        body: JSON.stringify(payload),
      });
    }
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
