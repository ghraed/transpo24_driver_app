import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { getDocumentAsync } from 'expo-document-picker';
import { openRequestFile, sendChatAttachment } from './request-files';
jest.mock('@/lib/auth-storage', () => ({
  readAccessToken: async () => 'test-token',
}));
jest.mock('@/config/backend', () => ({
  getBackendApiBaseUrl: () => 'https://api.test',
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  downloadAsync: jest.fn(),
  deleteAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));
const originalFetch = global.fetch;
beforeEach(() => {
  jest.clearAllMocks();
});
afterEach(() => {
  global.fetch = originalFetch;
});
it('never sends credentials to a URL supplied by another host', async () => {
  await expect(
    openRequestFile('https://example.com/steal', 'file.pdf'),
  ).rejects.toThrow();
  expect(FileSystem.downloadAsync).not.toHaveBeenCalled();
});
it('downloads with authorization and removes its private cache copy after opening', async () => {
  jest
    .mocked(FileSystem.downloadAsync)
    .mockResolvedValue({
      status: 200,
      uri: 'file:///cache/file.pdf',
      headers: {},
      mimeType: 'application/pdf',
    });
  await openRequestFile('/request-files/file/content', 'file.pdf');
  expect(FileSystem.downloadAsync).toHaveBeenCalledWith(
    'https://api.test/request-files/file/content',
    expect.stringContaining('file:///cache/private-'),
    { headers: { Authorization: 'Bearer test-token' } },
  );
  expect(Sharing.shareAsync).toHaveBeenCalled();
  expect(FileSystem.deleteAsync).toHaveBeenCalled();
});
it('does not open an unauthorized response and still cleans up', async () => {
  jest
    .mocked(FileSystem.downloadAsync)
    .mockResolvedValue({
      status: 403,
      uri: 'file:///cache/file.pdf',
      headers: {},
      mimeType: 'application/json',
    });
  await expect(
    openRequestFile('/request-files/file/content', 'file.pdf'),
  ).rejects.toThrow();
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
  expect(FileSystem.deleteAsync).toHaveBeenCalled();
});
it('does not send anything when picking an attachment is cancelled', async () => {
  jest
    .mocked(getDocumentAsync)
    .mockResolvedValue({ canceled: true, assets: null });
  const fetchMock = jest.fn<typeof fetch>();
  global.fetch = fetchMock;
  expect(await sendChatAttachment('room')).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});
