import { beforeEach, afterEach, expect, jest, test } from '@jest/globals';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import { io } from 'socket.io-client';
import { getDriverAcceptedJobDetails } from '@/lib/api';
import { readAccessToken } from '@/lib/auth-storage';
import { requestBackgroundLocationPrompt } from '@/location/background-location-prompt';
import {
  BACKGROUND_TRIP_TASK, handleBackgroundLocations, startBackgroundTripTracking,
  stopBackgroundTripTracking, noteForegroundTripLocation,
} from './background-trip-tracking';

jest.mock('@/location/background-location-prompt', () => ({ requestBackgroundLocationPrompt: jest.fn() }));
jest.mock('expo', () => ({ requireOptionalNativeModule: () => ({}) }));
jest.mock('expo-task-manager', () => ({ isAvailableAsync: jest.fn(async () => true), isTaskDefined: () => false, defineTask: jest.fn() }));
jest.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  getForegroundPermissionsAsync: jest.fn(), getBackgroundPermissionsAsync: jest.fn(),
  requestBackgroundPermissionsAsync: jest.fn(), hasStartedLocationUpdatesAsync: jest.fn(),
  startLocationUpdatesAsync: jest.fn(), stopLocationUpdatesAsync: jest.fn(),
}));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('@/lib/api', () => ({ getDriverAcceptedJobDetails: jest.fn(), ApiResponseError: class extends Error {} }));
jest.mock('@/lib/auth-storage', () => ({ readAccessToken: jest.fn() }));
jest.mock('@/config/backend', () => ({ getBackendSocketUrl: () => 'http://socket.test' }));
jest.mock('@/localization/i18n', () => ({ t: text => text }));
jest.mock('socket.io-client', () => ({ io: jest.fn() }));

let store;
let socket;
const initialState = AppState.currentState;
beforeEach(() => {
  jest.clearAllMocks();
  store = new Map();
  SecureStore.getItemAsync.mockImplementation(async key => store.get(key) ?? null);
  SecureStore.setItemAsync.mockImplementation(async (key, value) => { store.set(key, value); });
  SecureStore.deleteItemAsync.mockImplementation(async key => { store.delete(key); });
  readAccessToken.mockResolvedValue('token');
  getDriverAcceptedJobDetails.mockResolvedValue({ requestStatus: 'DRIVER_GOING_TO_DROPOFF' });
  Location.getForegroundPermissionsAsync.mockResolvedValue({ granted: true });
  Location.getBackgroundPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
  Location.hasStartedLocationUpdatesAsync.mockResolvedValue(true);
  Location.startLocationUpdatesAsync.mockResolvedValue();
  Location.stopLocationUpdatesAsync.mockResolvedValue();
  AppState.currentState = 'background';
  const callbacks = {};
  socket = {
    once: jest.fn((name, callback) => { callbacks[name] = callback; }),
    connect: jest.fn(() => callbacks.connect()),
    timeout: jest.fn(() => socket),
    emit: jest.fn((event, payload, callback) => callback(null, { ok: true })),
    removeAllListeners: jest.fn(), disconnect: jest.fn(),
  };
  io.mockReturnValue(socket);
});
afterEach(async () => {
  await stopBackgroundTripTracking();
  AppState.currentState = initialState;
  jest.restoreAllMocks();
});
const point = () => ({ timestamp: Date.now(), coords: { latitude: 47.5, longitude: 7.6, heading: -1, speed: null, accuracy: 10 } });

test('starts only during the existing moving trip statuses', async () => {
  getDriverAcceptedJobDetails.mockResolvedValue({ requestStatus: 'ACCEPTED' });
  expect(await startBackgroundTripTracking('trip')).toBe(false);
  expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
});
test('sends the latest background point using the existing customer update event', async () => {
  await startBackgroundTripTracking('trip');
  await handleBackgroundLocations([{ ...point(), timestamp: Date.now() - 180000 }, point()]);
  expect(socket.emit).toHaveBeenCalledWith('driverLocationUpdate', { tripId: 'trip', latitude: 47.5, longitude: 7.6, accuracy: 10 }, expect.any(Function));
  expect(socket.disconnect).toHaveBeenCalled();
});
test('stops on completion before sending any location', async () => {
  await startBackgroundTripTracking('trip');
  getDriverAcceptedJobDetails.mockResolvedValue({ requestStatus: 'DELIVERED' });
  await handleBackgroundLocations([point()]);
  expect(io).not.toHaveBeenCalled();
  expect(Location.stopLocationUpdatesAsync).toHaveBeenCalledWith(BACKGROUND_TRIP_TASK);
  expect(store.get('transpo24.driver.backgroundTrip')).toBeUndefined();
});
test('does not send stale or invalid coordinates', async () => {
  await startBackgroundTripTracking('trip');
  await handleBackgroundLocations([{ ...point(), timestamp: Date.now() - 180000 }]);
  await handleBackgroundLocations([{ ...point(), coords: { latitude: 999, longitude: 7 } }]);
  expect(io).not.toHaveBeenCalled();
});
test('keeps foreground tracking independent and covers other screens', async () => {
  await startBackgroundTripTracking('trip');
  AppState.currentState = 'active';
  noteForegroundTripLocation('trip');
  await handleBackgroundLocations([point()]);
  expect(io).not.toHaveBeenCalled();
  noteForegroundTripLocation('other-trip');
  await handleBackgroundLocations([point()]);
  expect(io).toHaveBeenCalledTimes(1);
});
test('does not start when the user leaves during permission handling', async () => {
  expect(await startBackgroundTripTracking('trip', () => false)).toBe(false);
  expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
});
test('does not repeatedly prompt after a refusal on the same trip', async () => {
  Location.getBackgroundPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
  requestBackgroundLocationPrompt.mockResolvedValue({ continue: false, dontShowAgain: false });
  expect(await startBackgroundTripTracking('trip')).toBe(false);
  expect(await startBackgroundTripTracking('trip')).toBe(false);
  expect(requestBackgroundLocationPrompt).toHaveBeenCalledTimes(1);
  expect(Location.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
  expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
});
test('a late completion for another trip does not stop the current trip', async () => {
  await startBackgroundTripTracking('trip');
  await stopBackgroundTripTracking('old-trip');
  expect(Location.stopLocationUpdatesAsync).not.toHaveBeenCalled();
  expect(store.get('transpo24.driver.backgroundTrip')).toBe('trip');
});
test('logout clears tracking and prevents later callbacks from sending', async () => {
  await startBackgroundTripTracking('trip');
  await stopBackgroundTripTracking();
  readAccessToken.mockResolvedValue(null);
  await handleBackgroundLocations([point()]);
  expect(io).not.toHaveBeenCalled();
});

test('remembers do not show again with Not now across trips without requesting system permission', async () => {
  Location.getBackgroundPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
  requestBackgroundLocationPrompt.mockResolvedValue({ continue: false, dontShowAgain: true });
  expect(await startBackgroundTripTracking('first-trip')).toBe(false);
  await stopBackgroundTripTracking();
  expect(store.get('transpo24.driver.backgroundTripPromptChoice')).toBe('decline');
  expect(await startBackgroundTripTracking('second-trip')).toBe(false);
  expect(requestBackgroundLocationPrompt).toHaveBeenCalledTimes(1);
  expect(Location.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
});
test('remembers do not show again with Continue but still requires system permission', async () => {
  Location.getBackgroundPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
  Location.requestBackgroundPermissionsAsync.mockResolvedValue({ granted: false });
  requestBackgroundLocationPrompt.mockResolvedValue({ continue: true, dontShowAgain: true });
  expect(await startBackgroundTripTracking('first-trip')).toBe(false);
  await stopBackgroundTripTracking();
  expect(store.get('transpo24.driver.backgroundTripPromptChoice')).toBe('continue');
  expect(await startBackgroundTripTracking('second-trip')).toBe(false);
  expect(requestBackgroundLocationPrompt).toHaveBeenCalledTimes(1);
  expect(Location.requestBackgroundPermissionsAsync).toHaveBeenCalledTimes(2);
  expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
});
test('shows the explanation on later trips if the checkbox is unchecked', async () => {
  Location.getBackgroundPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
  requestBackgroundLocationPrompt.mockResolvedValue({ continue: false, dontShowAgain: false });
  await startBackgroundTripTracking('first-trip');
  await startBackgroundTripTracking('second-trip');
  expect(requestBackgroundLocationPrompt).toHaveBeenCalledTimes(2);
  expect(store.has('transpo24.driver.backgroundTripPromptChoice')).toBe(false);
});
test('uses the preference already on disk without needing an earlier popup in this session', async () => {
  store.set('transpo24.driver.backgroundTripPromptChoice', 'decline');
  Location.getBackgroundPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
  expect(await startBackgroundTripTracking('new-trip')).toBe(false);
  expect(requestBackgroundLocationPrompt).not.toHaveBeenCalled();
});
