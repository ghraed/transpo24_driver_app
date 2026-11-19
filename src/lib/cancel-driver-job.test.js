import { cancelDriverJob } from './api';

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

test('cancels the assigned job through the authenticated driver endpoint', async () => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    text: async () => JSON.stringify({ requestStatus: 'CANCELLED', refundedAmount: 105, currency: 'CHF' }),
  }));
  await expect(cancelDriverJob('job/1')).resolves.toMatchObject({ requestStatus: 'CANCELLED', refundedAmount: 105 });
  const [url, options] = global.fetch.mock.calls[0];
  expect(url).toBe('https://api.test/driver/jobs/job%2F1/cancel');
  expect(options.method).toBe('POST');
  expect(options.headers.Authorization).toBe('Bearer test-token');
});
