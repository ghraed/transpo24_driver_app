import { computeDriverRoutes } from './api';

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
test('calls the authenticated backend and never includes a Google API key', async () => {
  global.fetch = jest.fn(async () => ({ ok: true, status: 201, text: async () => JSON.stringify({ status: 'ZERO_RESULTS', routes: [] }) }));
  const origin = { latitude: 47, longitude: 8, placeId: 'origin', address: 'Private address' };
  const destination = { latitude: 48, longitude: 9 };
  await computeDriverRoutes(origin, destination, new AbortController().signal, true);
  const [url, options] = global.fetch.mock.calls[0];
  expect(url).toBe('https://api.test/driver/routes/compute');
  expect(options.headers.Authorization).toBe('Bearer test-token');
  expect(JSON.parse(options.body)).toMatchObject({ origin: { latitude: 47, longitude: 8, placeId: 'origin' }, destination, alternatives: true });
  expect(options.body).not.toContain('Private address');
  expect(options.body).not.toContain('apikey');
});
test('propagates cancellation to the backend request', async () => {
  const controller = new AbortController();
  global.fetch = jest.fn(async (_, options) => {
    controller.abort();
    expect(options.signal.aborted).toBe(true);
    throw new Error('aborted');
  });
  await expect(computeDriverRoutes({ latitude: 47, longitude: 8 }, { latitude: 48, longitude: 9 }, controller.signal)).rejects.toThrow('aborted');
});
