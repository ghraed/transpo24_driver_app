import * as SecureStore from 'expo-secure-store';

import {
  clearCompleteProfileDraft,
  persistCompleteProfileDraft,
  readCompleteProfileDraft,
} from './auth-storage';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

it('does not let a pending profile draft write restore data after cleanup', async () => {
  let releaseWrite;
  let storedValue = null;
  SecureStore.setItemAsync.mockImplementation((_key, value) => new Promise(resolve => {
    releaseWrite = () => { storedValue = value; resolve(); };
  }));
  SecureStore.deleteItemAsync.mockImplementation(async () => { storedValue = null; });
  SecureStore.getItemAsync.mockImplementation(async () => storedValue);

  const write = persistCompleteProfileDraft('{"nickname":"Pending"}');
  const clear = clearCompleteProfileDraft();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(releaseWrite).toBeDefined();
  releaseWrite();
  await Promise.all([write, clear]);

  expect(await readCompleteProfileDraft()).toBeNull();
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('transpo24.driver.completeProfileDraft');
});
