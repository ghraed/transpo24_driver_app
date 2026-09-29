import { beforeEach, expect, jest, test } from '@jest/globals';
import * as SecureStore from 'expo-secure-store';
import { clearDriverOnboardingDrafts, persistAccessToken, readAccessToken, persistTrustedDriverSession, readTrustedDriverSession, persistRememberedCredentials, readRememberedCredentials } from './auth-storage';

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
const get = jest.mocked(SecureStore.getItemAsync);
const set = jest.mocked(SecureStore.setItemAsync);
const del = jest.mocked(SecureStore.deleteItemAsync);
beforeEach(() => { jest.clearAllMocks(); get.mockResolvedValue(null); set.mockResolvedValue(undefined); del.mockResolvedValue(undefined); });

test('access token uses secure storage', async () => {
  await persistAccessToken('secret');
  expect(set).toHaveBeenCalledWith('transpo24.driver.accessToken', 'secret');
  get.mockResolvedValueOnce('secret');
  expect(await readAccessToken()).toBe('secret');
});

test('trusted session round trips and invalid stored data is removed', async () => {
  const session = { accessToken: 'token', phoneNumber: '+9613123456' };
  await persistTrustedDriverSession(session);
  expect(set).toHaveBeenCalledWith('transpo24.driver.trustedSession', JSON.stringify(session));
  get.mockResolvedValueOnce(JSON.stringify(session));
  expect(await readTrustedDriverSession()).toEqual(session);
  get.mockResolvedValueOnce('{broken');
  expect(await readTrustedDriverSession()).toBeNull();
  expect(del).toHaveBeenCalledWith('transpo24.driver.trustedSession');
  get.mockResolvedValueOnce(JSON.stringify({ accessToken: 4, phoneNumber: '123' }));
  expect(await readTrustedDriverSession()).toBeNull();
});

test('remembered credentials require both email and password', async () => {
  await persistRememberedCredentials('driver@example.com', 'secret');
  expect(set).toHaveBeenCalledTimes(2);
  get.mockResolvedValueOnce('driver@example.com').mockResolvedValueOnce(null);
  expect(await readRememberedCredentials()).toBeNull();
  get.mockResolvedValueOnce('driver@example.com').mockResolvedValueOnce('secret');
  expect(await readRememberedCredentials()).toEqual({ email: 'driver@example.com', password: 'secret' });
});

test('clears all onboarding drafts from secure storage', async () => {
  await clearDriverOnboardingDrafts();
  expect(del.mock.calls.map(([key]) => key)).toEqual(expect.arrayContaining([
    'transpo24.driver.onboardingDocumentsStatus',
    'transpo24.driver.onboardingDocumentsDraft',
    'transpo24.driver.vehicleInformationDraft',
    'transpo24.driver.loadCapacityDraft',
  ]));
});
