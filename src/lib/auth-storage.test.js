import * as SecureStore from 'expo-secure-store';

import {
  clearCompleteProfileDraft,
  persistCompleteProfileDraft,
  readCompleteProfileDraft,
  persistVehicleInformationDraft, readVehicleInformationDraft, clearVehicleInformationDraft,
  persistLoadCapacityDraft, readLoadCapacityDraft, clearLoadCapacityDraft,
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

it('isolates vehicle and capacity drafts by vehicle and clears only the requested vehicle', async () => {
  const storage = new Map();
  SecureStore.setItemAsync.mockImplementation(async (key, value) => { storage.set(key, value); });
  SecureStore.getItemAsync.mockImplementation(async key => storage.get(key) ?? null);
  SecureStore.deleteItemAsync.mockImplementation(async key => { storage.delete(key); });

  await persistVehicleInformationDraft('new', 'unsaved');
  await persistVehicleInformationDraft('vehicle-1', 'one');
  await persistVehicleInformationDraft('vehicle-2', 'two');
  await persistLoadCapacityDraft('vehicle-1', 'capacity-one');
  await persistLoadCapacityDraft('vehicle-2', 'capacity-two');

  expect(await readVehicleInformationDraft('vehicle-1')).toBe('one');
  expect(await readVehicleInformationDraft('vehicle-2')).toBe('two');
  expect(await readVehicleInformationDraft('new')).toBe('unsaved');
  expect(await readLoadCapacityDraft('vehicle-2')).toBe('capacity-two');
  await clearVehicleInformationDraft('vehicle-1');
  await clearLoadCapacityDraft('vehicle-1');
  expect(await readVehicleInformationDraft('vehicle-1')).toBeNull();
  expect(await readVehicleInformationDraft('vehicle-2')).toBe('two');
  expect(await readLoadCapacityDraft('vehicle-1')).toBeNull();
  expect(await readLoadCapacityDraft('vehicle-2')).toBe('capacity-two');

  storage.set('transpo24.driver.vehicleInformationDraft', 'old unscoped draft');
  storage.set('transpo24.driver.loadCapacityDraft', 'old unscoped draft');
  await clearVehicleInformationDraft();
  await clearLoadCapacityDraft();
  expect(await readVehicleInformationDraft('vehicle-2')).toBeNull();
  expect(await readLoadCapacityDraft('vehicle-2')).toBeNull();
  expect(storage.has('transpo24.driver.vehicleInformationDraft')).toBe(false);
  expect(storage.has('transpo24.driver.loadCapacityDraft')).toBe(false);
});
