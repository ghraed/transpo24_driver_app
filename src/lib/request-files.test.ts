import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { Platform } from 'react-native';
import { viewDocument } from '@react-native-documents/viewer';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { getDocumentAsync } from 'expo-document-picker';
import {
  openRequestFile,
  downloadRequestFile,
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
  readDirectoryAsync: jest.fn(async () => []),
  readAsStringAsync: jest.fn(async () => 'encoded-file'),
  EncodingType: { Base64: 'base64' },
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: jest.fn(async () => ({ granted: true, directoryUri: 'content://folder' })),
    createFileAsync: jest.fn(async () => 'content://folder/file.pdf'),
    writeAsStringAsync: jest.fn(async () => undefined),
    deleteAsync: jest.fn(async () => undefined),
  },
  downloadAsync: jest.fn(),
  deleteAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));
jest.mock('@react-native-documents/viewer', () => ({
  viewDocument: jest.fn(async () => null),
}));
const originalOS = Platform.OS;
const { default: NativeFormData } = jest.requireActual<{ default: typeof FormData }>('react-native/Libraries/Network/FormData');
const originalFetch = global.fetch;
const originalFormData = global.FormData;
beforeEach(() => {
  global.FormData = NativeFormData as unknown as typeof FormData;
  jest.clearAllMocks();
});
afterEach(() => {
  Platform.OS = originalOS;
  global.fetch = originalFetch;
  global.FormData = originalFormData;
});
it('never sends credentials to a URL supplied by another host', async () => {
  await expect(
    openRequestFile('https://example.com/steal', 'file.pdf'),
  ).rejects.toThrow();
  expect(FileSystem.downloadAsync).not.toHaveBeenCalled();
});
it('opens an authenticated attachment in a viewer and keeps it readable after launch', async () => {
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
  expect(viewDocument).toHaveBeenCalledWith({
    uri: 'file:///cache/file.pdf', mimeType: 'application/pdf', headerTitle: 'file.pdf', grantPermissions: 'read',
  });
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
  expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
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

it('cleans up a failed viewer launch without opening the share menu', async () => {
  jest.mocked(viewDocument).mockRejectedValueOnce(new Error('No viewer'));
  jest.mocked(FileSystem.downloadAsync).mockResolvedValue({ status: 200, uri: 'file:///cache/file.pdf', headers: {}, mimeType: 'application/pdf' });
  await expect(openRequestFile('/request-files/file/content', 'file.pdf')).rejects.toThrow('documents.openFailed');
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
  expect(FileSystem.deleteAsync).toHaveBeenCalled();
});
it('saves an Android attachment to the folder the driver chooses', async () => {
  Platform.OS = 'android';
  jest.mocked(FileSystem.downloadAsync).mockResolvedValue({ status: 200, uri: 'file:///cache/file.pdf', headers: {}, mimeType: 'application/pdf' });
  expect(await downloadRequestFile('/request-files/file/content', 'file.pdf')).toBe(true);
  expect(FileSystem.StorageAccessFramework.createFileAsync).toHaveBeenCalledWith('content://folder', 'file', 'application/pdf');
  expect(FileSystem.StorageAccessFramework.writeAsStringAsync).toHaveBeenCalledWith('content://folder/file.pdf', 'encoded-file', { encoding: 'base64' });
  expect(viewDocument).not.toHaveBeenCalled();
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
  expect(FileSystem.deleteAsync).toHaveBeenCalled();
});
it('does not save or report success when the folder picker is cancelled', async () => {
  Platform.OS = 'android';
  jest.mocked(FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync).mockResolvedValueOnce({ granted: false });
  expect(await downloadRequestFile('/request-files/file/content', 'file.pdf')).toBe(false);
  expect(FileSystem.StorageAccessFramework.createFileAsync).not.toHaveBeenCalled();
  expect(FileSystem.deleteAsync).toHaveBeenCalled();
});
it('offers the iOS export sheet only for an explicit download', async () => {
  Platform.OS = 'ios';
  await downloadRequestFile('/request-files/file/content', 'file.pdf');
  expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/file.pdf', { dialogTitle: 'file.pdf', mimeType: 'application/pdf' });
  expect(viewDocument).not.toHaveBeenCalled();
  expect(FileSystem.deleteAsync).toHaveBeenCalled();
});
it('rejects untrusted download URLs before contacting them', async () => {
  await expect(downloadRequestFile('https://example.com/file', 'file.pdf')).rejects.toThrow();
  expect(FileSystem.downloadAsync).not.toHaveBeenCalled();
});

it('removes a partial saved file when writing fails', async () => {
  Platform.OS = 'android';
  jest.mocked(FileSystem.StorageAccessFramework.writeAsStringAsync).mockRejectedValueOnce(new Error('Disk full'));
  await expect(downloadRequestFile('/request-files/file/content', 'file.pdf')).rejects.toThrow('Disk full');
  expect(FileSystem.StorageAccessFramework.deleteAsync).toHaveBeenCalledWith('content://folder/file.pdf', { idempotent: true });
  expect(FileSystem.deleteAsync).toHaveBeenCalled();
});
it('prunes old previews while leaving recent and unrelated cache files alone', async () => {
  jest.mocked(FileSystem.readDirectoryAsync).mockResolvedValueOnce([
    `private-${Date.now() - 48 * 60 * 60 * 1000}-old.pdf`,
    `private-${Date.now()}-recent.pdf`,
    'unrelated.pdf',
  ]);
  await openRequestFile('/request-files/file/content', 'file.pdf');
  expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(1);
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(expect.stringContaining('-old.pdf'), { idempotent: true });
});
