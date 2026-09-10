import { beforeEach, afterEach, expect, jest, test } from '@jest/globals';
import { readAccessToken } from '@/lib/auth-storage';
import * as Location from 'expo-location';
import { AppState } from 'react-native';
import { getDriverAvailability, updateDriverMatchingLocation } from '@/lib/api';
import { syncRequestMatchingLocation } from './request-matching-location';

jest.mock('@/lib/auth-storage', () => ({ readAccessToken: jest.fn() }));
jest.mock('expo-location', () => ({ Accuracy: { Balanced: 3 }, getForegroundPermissionsAsync: jest.fn(), hasServicesEnabledAsync: jest.fn(), getLastKnownPositionAsync: jest.fn(), getCurrentPositionAsync: jest.fn() }));
jest.mock('@/lib/api', () => ({ getDriverAvailability: jest.fn(), updateDriverMatchingLocation: jest.fn() }));
const initialState = AppState.currentState;
const fix = () => ({ timestamp: Date.now(), coords: { latitude: 47.38, longitude: 8.54, accuracy: 10 } });
beforeEach(() => {
  jest.clearAllMocks();
  AppState.currentState = 'active';
  readAccessToken.mockResolvedValue('driver-token');
  getDriverAvailability.mockResolvedValue({ isOnline: true });
  updateDriverMatchingLocation.mockResolvedValue();
  Location.getForegroundPermissionsAsync.mockResolvedValue({ granted: true });
  Location.hasServicesEnabledAsync.mockResolvedValue(true);
  Location.getLastKnownPositionAsync.mockResolvedValue(fix());
});
afterEach(() => { AppState.currentState = initialState; jest.useRealTimers(); });
test('publishes a recent fix without changing the saved base', async () => {
  const location = fix(); Location.getLastKnownPositionAsync.mockResolvedValue(location);
  await syncRequestMatchingLocation();
  expect(updateDriverMatchingLocation).toHaveBeenCalledWith({ latitude: 47.38, longitude: 8.54, recordedAt: location.timestamp }, 'driver-token');
});
test('does not collect location while offline or in the background', async () => {
  getDriverAvailability.mockResolvedValue({ isOnline: false });
  await syncRequestMatchingLocation();
  expect(Location.getForegroundPermissionsAsync).not.toHaveBeenCalled();
  AppState.currentState = 'background';
  getDriverAvailability.mockClear();
  await syncRequestMatchingLocation();
  expect(getDriverAvailability).not.toHaveBeenCalled();
});
test.each(['permission', 'services'])('clears the live reference when %s is unavailable', async failure => {
  if (failure === 'permission') Location.getForegroundPermissionsAsync.mockResolvedValue({ granted: false });
  else Location.hasServicesEnabledAsync.mockResolvedValue(false);
  await syncRequestMatchingLocation();
  expect(updateDriverMatchingLocation).toHaveBeenCalledWith(null, 'driver-token');
});
test.each(['stale', 'inaccurate', 'future'])('does not publish a %s fix', async kind => {
  const location = fix();
  if (kind === 'stale') location.timestamp -= 121000;
  if (kind === 'future') location.timestamp += 30000;
  if (kind === 'inaccurate') location.coords.accuracy = 300;
  Location.getLastKnownPositionAsync.mockResolvedValue(location);
  await syncRequestMatchingLocation();
  expect(updateDriverMatchingLocation).toHaveBeenCalledWith(null, 'driver-token');
});
test('uses a fresh reading if no recent cached fix is available', async () => {
  Location.getLastKnownPositionAsync.mockResolvedValue(null);
  Location.getCurrentPositionAsync.mockResolvedValue(fix());
  await syncRequestMatchingLocation();
  expect(Location.getCurrentPositionAsync).toHaveBeenCalled();
  expect(updateDriverMatchingLocation).toHaveBeenCalledWith(expect.objectContaining({ latitude: 47.38 }), 'driver-token');
});
test('falls back after GPS timeout and does not publish a late result', async () => {
  jest.useFakeTimers();
  Location.getLastKnownPositionAsync.mockResolvedValue(null);
  let resolve;
  Location.getCurrentPositionAsync.mockImplementation(() => new Promise(r => { resolve = r; }));
  const work = syncRequestMatchingLocation();
  await jest.advanceTimersByTimeAsync(6001);
  await work;
  expect(updateDriverMatchingLocation).toHaveBeenCalledWith(null, 'driver-token');
  resolve(fix());
  await Promise.resolve();
  expect(updateDriverMatchingLocation).toHaveBeenCalledTimes(1);
});
test('shares simultaneous refreshes from the map, Jobs and heartbeat', async () => {
  await Promise.all([syncRequestMatchingLocation(), syncRequestMatchingLocation(), syncRequestMatchingLocation()]);
  expect(updateDriverMatchingLocation).toHaveBeenCalledTimes(1);
});

test('does not collect location after logout', async () => {
  readAccessToken.mockResolvedValue(null);
  await syncRequestMatchingLocation();
  expect(getDriverAvailability).not.toHaveBeenCalled();
  expect(updateDriverMatchingLocation).not.toHaveBeenCalled();
});
