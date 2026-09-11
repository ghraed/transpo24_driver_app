import { expect, it, jest } from '@jest/globals';
import { pickChatAttachments } from './request-files';

jest.mock('expo-document-picker', () => { throw new Error('Cannot find native module ExpoDocumentPicker'); });
jest.mock('expo-sharing', () => { throw new Error('Cannot find native module ExpoSharing'); });
jest.mock('expo-file-system/legacy', () => ({}));
jest.mock('@/lib/auth-storage', () => ({ readAccessToken: async () => null }));
jest.mock('@/config/backend', () => ({ getBackendApiBaseUrl: () => 'https://api.test' }));

it('loads chat file helpers without optional native modules and rejects only when picking', async () => {
  await expect(pickChatAttachments()).rejects.toThrow('Cannot find native module ExpoDocumentPicker');
});
