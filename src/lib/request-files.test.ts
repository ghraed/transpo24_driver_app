import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { getDocumentAsync } from 'expo-document-picker';
import {
  openRequestFile,
  sendChatAttachment,
  uploadRequestDocument,
} from './request-files';
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
const { default: NativeFormData } = jest.requireActual<{ default: typeof FormData }>('react-native/Libraries/Network/FormData');
const originalFetch = global.fetch;
const originalFormData = global.FormData;
beforeEach(() => {
  global.FormData = NativeFormData as unknown as typeof FormData;
  jest.clearAllMocks();
});
afterEach(() => {
  global.fetch = originalFetch;
  global.FormData = originalFormData;
});
it('never sends credentials to a URL supplied by another host', async () => {
  await expect(
    openRequestFile('https://example.com/steal', 'file.pdf'),
  ).rejects.toThrow();
  expect(FileSystem.downloadAsync).not.toHaveBeenCalled();
});
it('downloads with authorization and removes its private cache copy after opening', async () => {
  jest.mocked(FileSystem.downloadAsync).mockResolvedValue({
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
  jest.mocked(FileSystem.downloadAsync).mockResolvedValue({
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

const originalXhr = global.XMLHttpRequest;
afterEach(() => {
  global.XMLHttpRequest = originalXhr;
});
function mockNativeUpload(status = 201, event = 'load') {
  const xhr = {
    status,
    responseText: JSON.stringify({ id: 'message', type: 'FILE' }),
    timeout: 0,
    onload: () => {},
    onerror: () => {},
    ontimeout: () => {},
    onabort: () => {},
    open: jest.fn(),
    setRequestHeader: jest.fn(),
    send: jest.fn((_form: FormData) => {
      queueMicrotask(() => {
        if (event === 'error') xhr.onerror();
        else if (event === 'timeout') xhr.ontimeout();
        else if (event === 'abort') xhr.onabort();
        else xhr.onload();
      });
    }),
  };
  global.XMLHttpRequest = jest.fn(
    () => xhr,
  ) as unknown as typeof XMLHttpRequest;
  return xhr;
}
function pickImage(mimeType = 'image/png', name = 'image.png') {
  jest
    .mocked(getDocumentAsync)
    .mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: `file:///cache/${name}`,
          name,
          mimeType,
          size: 385846,
          lastModified: 0,
        },
      ],
    });
}
it.each([
  ['image/png', 'image.png'],
  ['image/jpeg', 'image.jpg'],
  ['application/pdf', 'document.pdf'],
])(
  'uploads %s native URI parts without Expo fetch serialization',
  async (mime, name) => {
    pickImage(mime, name);
    const xhr = mockNativeUpload();
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('Unsupported FormDataPart implementation'));
    global.fetch = fetchMock;
    expect(await sendChatAttachment('room')).toMatchObject({ type: 'FILE' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(xhr.open).toHaveBeenCalledWith(
      'POST',
      'https://api.test/chat/rooms/room/attachments',
    );
    expect(xhr.setRequestHeader).toHaveBeenCalledWith(
      'Authorization',
      'Bearer test-token',
    );
    expect(xhr.setRequestHeader).not.toHaveBeenCalledWith(
      'Content-Type',
      expect.anything(),
    );
    expect(xhr.send.mock.calls[0][0].getAll('file')).toEqual([
      { uri: `file:///cache/${name}`, name, type: mime },
    ]);
    expect(xhr.timeout).toBe(60000);
  },
);
it('includes the official document type when using the native upload transport', async () => {
  pickImage();
  const xhr = mockNativeUpload();
  await uploadRequestDocument('request', 'INSURANCE');
  expect(xhr.open).toHaveBeenCalledWith(
    'POST',
    'https://api.test/request-files/request/request',
  );
  expect(xhr.send.mock.calls[0][0].getAll('documentType')).toEqual([
    'INSURANCE',
  ]);
});
it.each(['error', 'timeout', 'abort'])(
  'rejects a native upload %s instead of reporting success',
  async (event) => {
    pickImage();
    mockNativeUpload(0, event);
    await expect(sendChatAttachment('room')).rejects.toThrow(
      'documents.failed',
    );
  },
);
it('reports an oversized upload rejected by the server', async () => {
  pickImage();
  mockNativeUpload(413);
  await expect(sendChatAttachment('room')).rejects.toThrow(
    'documents.tooLarge',
  );
});
