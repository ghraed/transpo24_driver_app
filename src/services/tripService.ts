import { readAccessToken } from '@/lib/auth-storage';
import { createBackendReachabilityError, getBackendApiBaseUrl } from '@/config/backend';
import type {
  AdditionalExpenseResponse,
  CreateAdditionalExpensePayload,
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

type XhrResponsePayload = {
  status: number;
  responseText: string;
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

function uploadFormDataWithXhr(
  endpoint: string,
  method: 'PATCH' | 'POST',
  formData: FormData,
  token?: string,
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
  const file = toFormDataFile(asset, fallbackName, fallbackMimeType);
  appendFormDataFile(formData, fieldName, file);
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

async function uploadMultipartPatch(
  endpoint: string,
  formData: FormData,
): Promise<Response> {
  const token = await readAccessToken();
  const xhrResponse = await uploadFormDataWithXhr(
    endpoint,
    'PATCH',
    formData,
    token ?? undefined,
  );

  return new Response(xhrResponse.responseText, {
    status: xhrResponse.status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

async function uploadMultipartPost(
  endpoint: string,
  formData: FormData,
): Promise<Response> {
  const token = await readAccessToken();
  const xhrResponse = await uploadFormDataWithXhr(
    endpoint,
    'POST',
    formData,
    token ?? undefined,
  );

  return new Response(xhrResponse.responseText, {
    status: xhrResponse.status,
    headers: {
      'Content-Type': 'application/json',
    },
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
      response = await uploadMultipartPatch(endpoint, formData);
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
      response = await uploadMultipartPatch(endpoint, formData);
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

function validateAdditionalExpensePayload(
  payload: CreateAdditionalExpensePayload,
): string | null {
  if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
    return 'Expense amount must be greater than 0.';
  }

  if (!payload.reason.trim()) {
    return 'Expense reason is required.';
  }

  if (!payload.invoicePhoto.uri.trim()) {
    return 'Invoice or receipt photo is required.';
  }

  return null;
}

function parseAdditionalExpenseResponse(payload: unknown): AdditionalExpenseResponse | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const invoice = candidate.invoice;
  const walletDeduction = candidate.walletDeduction;

  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.requestId !== 'string' ||
    typeof candidate.driverId !== 'string' ||
    typeof candidate.customerId !== 'string' ||
    typeof candidate.amount !== 'number' ||
    typeof candidate.currency !== 'string' ||
    typeof candidate.reason !== 'string' ||
    typeof candidate.invoiceUrl !== 'string' ||
    typeof candidate.status !== 'string' ||
    typeof candidate.createdAt !== 'string' ||
    typeof candidate.updatedAt !== 'string' ||
    typeof invoice !== 'object' ||
    invoice === null ||
    typeof walletDeduction !== 'object' ||
    walletDeduction === null
  ) {
    return null;
  }

  const invoiceRecord = invoice as Record<string, unknown>;
  const walletRecord = walletDeduction as Record<string, unknown>;

  if (
    (invoiceRecord.originalFilename !== null &&
      invoiceRecord.originalFilename !== undefined &&
      typeof invoiceRecord.originalFilename !== 'string') ||
    (invoiceRecord.mimeType !== null &&
      invoiceRecord.mimeType !== undefined &&
      typeof invoiceRecord.mimeType !== 'string') ||
    (invoiceRecord.sizeBytes !== null &&
      invoiceRecord.sizeBytes !== undefined &&
      typeof invoiceRecord.sizeBytes !== 'number') ||
    typeof walletRecord.amount !== 'number' ||
    typeof walletRecord.currency !== 'string' ||
    walletRecord.transactionType !== 'ADDITIONAL_CHARGE'
  ) {
    return null;
  }

  return {
    id: candidate.id,
    requestId: candidate.requestId,
    driverId: candidate.driverId,
    customerId: candidate.customerId,
    amount: candidate.amount,
    currency: candidate.currency,
    reason: candidate.reason,
    equipmentType: typeof candidate.equipmentType === 'string' ? candidate.equipmentType : null,
    invoiceUrl: candidate.invoiceUrl,
    invoice: {
      originalFilename:
        typeof invoiceRecord.originalFilename === 'string'
          ? invoiceRecord.originalFilename
          : null,
      mimeType: typeof invoiceRecord.mimeType === 'string' ? invoiceRecord.mimeType : null,
      sizeBytes: typeof invoiceRecord.sizeBytes === 'number' ? invoiceRecord.sizeBytes : null,
    },
    walletDeduction: {
      amount: walletRecord.amount,
      currency: walletRecord.currency,
      transactionType: 'ADDITIONAL_CHARGE',
    },
    status: candidate.status,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };
}

export async function createAdditionalExpense(
  tripId: string,
  payload: CreateAdditionalExpensePayload,
): Promise<AdditionalExpenseResponse> {
  if (!isValidTripId(tripId)) {
    throw new Error('Invalid trip id.');
  }

  const validationError = validateAdditionalExpensePayload(payload);
  if (validationError) {
    throw new Error(validationError);
  }

  const endpoint = `${getApiBaseUrl()}/driver/requests/${encodeURIComponent(tripId.trim())}/additional-charges`;
  const formData = new FormData();
  formData.append('amount', String(payload.amount));
  formData.append('reason', payload.reason.trim());

  if (payload.equipmentType?.trim()) {
    formData.append('equipmentType', payload.equipmentType.trim());
  }

  appendFormDataAsset(formData, 'invoice', payload.invoicePhoto, 'expense-invoice.jpg', 'image/jpeg');

  let response: Response;
  try {
    response = await uploadMultipartPost(endpoint, formData);
  } catch (error) {
    throw toNetworkError(endpoint, error);
  }

  if (!response.ok) {
    throw await parseError(response, 'Failed to submit additional expense.');
  }

  const rawResponse = (await response.json()) as unknown;
  const validated = parseAdditionalExpenseResponse(rawResponse);

  if (!validated) {
    throw new Error('Invalid additional expense response received from backend.');
  }

  return validated;
}
