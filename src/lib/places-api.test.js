import { Platform } from 'react-native';
import { requestDriverPlaces } from './api';

jest.mock('@/lib/auth-storage', () => ({ readAccessToken: async () => 'test-token' }));
jest.mock('@/config/backend', () => ({ getBackendApiBaseUrl: () => 'https://api.test' }));
jest.mock('@/localization/response-message', () => ({
  localizeResponseMessage: async message => message,
  getSourceErrorMessage: error => error.message,
}));
jest.mock('@/localization/i18n', () => ({ __esModule: true, default: { t: key => key } }));
jest.mock('@/notifications/assertPushBackend', () => ({ assertPushBackend: jest.fn() }));

const originalFetch = global.fetch;
const originalOS = Platform.OS;
afterEach(() => { global.fetch = originalFetch; Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS }); });
test.each(['ios', 'android'])('%s place requests use the authenticated backend without a Maps key', async os => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  global.fetch = jest.fn(async () => ({ ok: true, status: 201, text: async () => JSON.stringify({ status: 'ZERO_RESULTS', predictions: [] }) }));
  for (const [operation, payload] of [['autocomplete', { input: 'Steinweg Basel' }], ['details', { placeId: 'basel-id' }], ['reverse', { latitude: 47.56, longitude: 7.59 }]]) {
    await requestDriverPlaces(operation, payload);
    const [url, options] = global.fetch.mock.calls.at(-1);
    expect(url).toBe(`https://api.test/driver/places/${operation}`);
    expect(options.headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(options.body)).toEqual({ ...payload, languageCode: 'en' });
    expect(options.signal).toBeDefined();
    expect(options.body).not.toContain('key');
  }
});
test.each([401, 429, 502, 503])('preserves backend place errors with status %s', async status => {
  global.fetch = jest.fn(async () => ({ ok: false, status, text: async () => JSON.stringify({ message: 'Place service unavailable.' }) }));
  await expect(requestDriverPlaces('autocomplete', { input: 'Steinweg' })).rejects.toMatchObject({ status, sourceMessage: 'Place service unavailable.' });
});
