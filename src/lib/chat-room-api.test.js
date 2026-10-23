import { ApiResponseError, getDriverChatRoomByTransportRequestId } from './api';

jest.mock('@/lib/auth-storage', () => ({ readAccessToken: async () => 'test-token' }));
jest.mock('@/config/backend', () => ({ getBackendApiBaseUrl: () => 'https://api.test' }));
jest.mock('@/localization/response-message', () => ({
  localizeResponseMessage: async message => message,
  getSourceErrorMessage: error => error.message,
}));
jest.mock('@/localization/i18n', () => ({ __esModule: true, default: { t: key => key } }));
jest.mock('@/notifications/assertPushBackend', () => ({ assertPushBackend: jest.fn() }));

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

test.each([403, 500])('retains HTTP %s and error code on a chat-room failure', async status => {
  global.fetch = jest.fn(async () => ({
    ok: false, status,
    text: async () => JSON.stringify({ message: 'Chat temporarily unavailable.', code: 'CHAT_TEST' }),
  }));
  await expect(getDriverChatRoomByTransportRequestId('request-1')).rejects.toMatchObject({
    name: 'ApiResponseError', status, code: 'CHAT_TEST', sourceMessage: 'Chat temporarily unavailable.',
  });
});

test('keeps the status when the error response body is empty', async () => {
  global.fetch = jest.fn(async () => ({ ok: false, status: 503, text: async () => '' }));
  try {
    await getDriverChatRoomByTransportRequestId('request-1');
    throw new Error('Expected request to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiResponseError);
    expect(error.status).toBe(503);
  }
});

 test('preserves chat unlock time and server time for the countdown', async () => {
  global.fetch = jest.fn(async () => ({
    ok: false, status: 403,
    text: async () => JSON.stringify({ message: 'Chat pending.', code: 'CHAT_PAYMENT_WINDOW', availableAt: '2026-10-23T12:10:00Z', serverTime: '2026-10-23T12:08:00Z' }),
  }));
  await expect(getDriverChatRoomByTransportRequestId('request-1')).rejects.toMatchObject({
    availableAt: '2026-10-23T12:10:00Z', serverTime: '2026-10-23T12:08:00Z',
  });
});
