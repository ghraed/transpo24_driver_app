import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import type { ChatMessage } from '@/types/chat';
import { readAccessToken as readToken } from '@/lib/auth-storage';
import { getBackendApiBaseUrl as baseUrl } from '@/config/backend';
export const DOCUMENT_TYPES = [
  'PICKUP_AUTHORIZATION',
  'INSURANCE',
  'PURCHASE_PROOF',
  'OTHER',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export type RequestFile = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  documentType: DocumentType;
  createdAt: string;
};
export type DocumentsState = {
  files: RequestFile[];
  canUpload: boolean;
  shouldPrompt: boolean;
};
const TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
type FileResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

function uploadNativeFile(
  url: string,
  form: FormData,
  token: string | null,
): Promise<FileResponse> {
  // Expo 56 fetch cannot serialize React Native's { uri, name, type } parts.
  // XMLHttpRequest streams those local files through the native networking layer.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.timeout = 60000;
    xhr.onload = () =>
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        json: async () => JSON.parse(xhr.responseText),
      });
    xhr.onerror =
      xhr.ontimeout =
      xhr.onabort =
        () => reject(new Error('documents.failed'));
    // Let the native transport set Content-Type together with its multipart boundary.
    xhr.send(form);
  });
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await readToken();
  const url = `${baseUrl()}${path}`;
  const response =
    Platform.OS !== 'web' && options.body instanceof FormData
      ? await uploadNativeFile(url, options.body, token)
      : await fetch(url, {
          ...options,
          headers: {
            ...options.headers,
            Authorization: `Bearer ${token ?? ''}`,
          },
        });
  if (!response.ok)
    throw new Error(
      response.status === 413 ? 'documents.tooLarge' : 'documents.failed',
    );
  return response.json() as Promise<T>;
}
export const listRequestDocuments = (id: string) =>
  request<DocumentsState>(`/request-files/request/${encodeURIComponent(id)}`);
export const acknowledgeDocuments = (id: string) =>
  request(`/request-files/request/${encodeURIComponent(id)}/acknowledge`, {
    method: 'POST',
  });
async function pickFile() {
  const result = await DocumentPicker.getDocumentAsync({
    type: TYPES,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const file = result.assets[0];
  if (file.size !== undefined && file.size > 10 * 1024 * 1024)
    throw new Error('documents.tooLarge');
  const form = new FormData();
  if (Platform.OS === 'web' && file.file)
    form.append('file', file.file, file.name);
  else
    form.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.mimeType ?? 'application/octet-stream',
    } as unknown as Blob);
  return form;
}
export async function uploadRequestDocument(id: string, type: DocumentType) {
  const form = await pickFile();
  if (!form) return null;
  form.append('documentType', type);
  return request<RequestFile>(
    `/request-files/request/${encodeURIComponent(id)}`,
    { method: 'POST', body: form },
  );
}
export async function sendChatAttachment(roomId: string) {
  const form = await pickFile();
  if (!form) return null;
  return request<ChatMessage>(
    `/chat/rooms/${encodeURIComponent(roomId)}/attachments`,
    { method: 'POST', body: form },
  );
}
function fileUrl(path: string) {
  // Never send an access token to an arbitrary URL from a message.
  if (!/^\/request-files\/[a-zA-Z0-9_-]+\/content$/.test(path))
    throw new Error('documents.failed');
  return `${baseUrl()}${path}`;
}

async function loadNativeFile(path: string, fileName: string) {
  const url = fileUrl(path);
  if (!FileSystem.cacheDirectory) throw new Error('documents.failed');
  // Native viewers resolve as soon as they launch. Keep their files available,
  // and prune abandoned previews on a later attachment operation.
  const entries = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory);
  await Promise.all(entries.filter((name) => {
    const match = /^private-(\d+)-/.exec(name);
    return match && Date.now() - Number(match[1]) > 24 * 60 * 60 * 1000;
  }).map((name) => FileSystem.deleteAsync(`${FileSystem.cacheDirectory}${name}`, { idempotent: true }).catch(() => undefined)));
  const token = await readToken();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-160) || 'document.pdf';
  const local = `${FileSystem.cacheDirectory}private-${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`;
  const cleanup = () => FileSystem.deleteAsync(local, { idempotent: true }).catch(() => undefined);
  try {
    const result = await FileSystem.downloadAsync(url, local, {
      headers: { Authorization: `Bearer ${token ?? ''}` },
    });
    if (result.status !== 200) throw new Error('documents.failed');
    const mimeType = result.mimeType?.split(';')[0].trim() ||
      (safeName.toLowerCase().endsWith('.pdf') ? 'application/pdf' :
        /\.jpe?g$/i.test(safeName) ? 'image/jpeg' :
          /\.png$/i.test(safeName) ? 'image/png' : 'application/octet-stream');
    return { uri: result.uri, safeName, mimeType, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

export async function loadRequestImagePreview(path: string, fileName: string) {
  if (Platform.OS !== 'web') return loadNativeFile(path, fileName);
  const url = fileUrl(path);
  const token = await readToken();
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token ?? ''}` } });
  if (!response.ok) throw new Error('documents.failed');
  const uri = URL.createObjectURL(await response.blob());
  return { uri, cleanup: () => URL.revokeObjectURL(uri) };
}

async function openWebFile(path: string, fileName: string, download: boolean) {
  const url = fileUrl(path);
  // Open synchronously before fetching so browsers do not block the preview popup.
  const preview = download ? null : window.open('about:blank', '_blank');
  if (!download && !preview) throw new Error('documents.failed');
  if (preview) preview.opener = null;
  try {
    const token = await readToken();
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token ?? ''}` } });
    if (!response.ok) throw new Error('documents.failed');
    const blobUrl = URL.createObjectURL(await response.blob());
    if (preview) preview.location.href = blobUrl;
    else {
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      link.click();
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  } catch (error) {
    preview?.close();
    throw error;
  }
}

export async function openRequestFile(path: string, fileName: string) {
  if (Platform.OS === 'web') return openWebFile(path, fileName, false);
  const file = await loadNativeFile(path, fileName);
  try {
    // Load only on native platforms; the web bundle has no native viewer module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { viewDocument } = require('@react-native-documents/viewer') as typeof import('@react-native-documents/viewer');
    await viewDocument({
      uri: file.uri,
      mimeType: file.mimeType,
      headerTitle: fileName,
      grantPermissions: 'read',
    });
  } catch {
    await file.cleanup();
    throw new Error('documents.openFailed');
  }
}

export async function downloadRequestFile(path: string, fileName: string) {
  if (Platform.OS === 'web') {
    await openWebFile(path, fileName, true);
    return true;
  }
  const file = await loadNativeFile(path, fileName);
  try {
    if (Platform.OS === 'android') {
      const saf = FileSystem.StorageAccessFramework;
      const permission = await saf.requestDirectoryPermissionsAsync();
      if (!permission.granted) return false;
      const target = await saf.createFileAsync(
        permission.directoryUri, file.safeName.replace(/\.[^.]+$/, ''), file.mimeType,
      );
      try {
        const contents = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
        await saf.writeAsStringAsync(target, contents, { encoding: FileSystem.EncodingType.Base64 });
      } catch (error) {
        await saf.deleteAsync(target, { idempotent: true }).catch(() => undefined);
        throw error;
      }
      return true;
    }
    if (!(await Sharing.isAvailableAsync())) throw new Error('documents.failed');
    // iOS exposes Save to Files through its system export sheet.
    await Sharing.shareAsync(file.uri, { dialogTitle: fileName, mimeType: file.mimeType });
    return false;
  } finally {
    await file.cleanup();
  }
}
