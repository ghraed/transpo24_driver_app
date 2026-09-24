import { sendDriverPhoneVerificationCode, verifyDriverPhoneVerificationCode, continueDriverTrustedSession, loginDriver, registerDriver } from './api';
import { fetchMarkets, getSelectedMarket, saveSelectedMarket } from './markets';
import * as SecureStore from 'expo-secure-store';
jest.mock('@/config/backend', () => ({ getBackendApiBaseUrl: () => 'https://api.test', createBackendReachabilityError: () => new Error('offline') }));
jest.mock('@/localization/response-message', () => ({ localizeResponseMessage: async value => value, getSourceErrorMessage: error => error.message }));
jest.mock('@/localization/i18n', () => ({ __esModule: true, default: { t: value => value } }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn() }));
const originalFetch = global.fetch;
beforeEach(() => { jest.clearAllMocks(); global.fetch = jest.fn(async () => ({ ok: true, text: async () => '{}', json: async () => [] })); });
afterEach(() => { global.fetch = originalFetch; });
it.each([
  [sendDriverPhoneVerificationCode, { phoneNumber: '+33123456789' }],
  [verifyDriverPhoneVerificationCode, { phoneNumber: '+33123456789', code: '123456' }],
  [continueDriverTrustedSession, { accessToken: 'trusted' }],
  [loginDriver, { email: 'test@example.com', password: 'test' }],
  [registerDriver, { email: 'test@example.com' }],
])('preserves selected market in each driver auth contract', async (request, payload) => {
  await request({ ...payload, marketCode: 'FR' });
  expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ ...payload, marketCode: 'FR' });
});
it.each(['TENANT_MISMATCH', 'ROUTE_BLOCKED'])('handles %s without displaying the internal reason', async code => {
  global.fetch.mockResolvedValue({ ok: false, status: 403, text: async () => JSON.stringify({ code, message: 'private reason' }) });
  const error = await sendDriverPhoneVerificationCode({ phoneNumber: '+33123456789', marketCode: 'FR' }).catch(error => error);
  expect(error.code).toBe(code);
  expect(error.message).not.toContain('private reason');
  expect(error.message).toContain(code === 'ROUTE_BLOCKED' ? 'currently unavailable' : 'home market');
});
it('fetches public markets without identity credentials and persists a driver-specific selection', async () => {
  const markets = [{ code: 'FR', name: 'France' }];
  global.fetch.mockResolvedValue({ ok: true, json: async () => markets });
  expect(await fetchMarkets()).toEqual(markets);
  expect(global.fetch).toHaveBeenCalledWith('https://api.test/tenants/public');
  await saveSelectedMarket('FR');
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith('transpo24.driver.selectedMarket', 'FR');
  SecureStore.getItemAsync.mockResolvedValue('FR');
  expect(await getSelectedMarket()).toBe('FR');
});
it('rejects a malformed public market response', async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ tenantId: 'foreign' }) });
  await expect(fetchMarkets()).rejects.toThrow('Unable to load markets.');
});
