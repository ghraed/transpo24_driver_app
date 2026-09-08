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
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await readToken();
  const response = await fetch(`${baseUrl()}${path}`, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token ?? ''}` },
  });
  if (!response.ok) throw new Error('documents.failed');
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
export async function openRequestFile(path: string, fileName: string) {
  // Never send an access token to an arbitrary URL from a message.
  if (!/^\/request-files\/[a-zA-Z0-9_-]+\/content$/.test(path))
    throw new Error('documents.failed');
  const token = await readToken();
  const headers = { Authorization: `Bearer ${token ?? ''}` };
  const url = `${baseUrl()}${path}`;
  if (Platform.OS === 'web') {
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error('documents.failed');
    const blobUrl = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    return;
  }
  if (!FileSystem.cacheDirectory || !(await Sharing.isAvailableAsync()))
    throw new Error('documents.failed');
  const safeName =
    fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-160) || 'document.pdf';
  const local = `${FileSystem.cacheDirectory}private-${Date.now()}-${safeName}`;
  try {
    const result = await FileSystem.downloadAsync(url, local, { headers });
    if (result.status !== 200) throw new Error('documents.failed');
    await Sharing.shareAsync(result.uri, { dialogTitle: fileName });
  } finally {
    await FileSystem.deleteAsync(local, { idempotent: true }).catch(
      () => undefined,
    );
  }
}
