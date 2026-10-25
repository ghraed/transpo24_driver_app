import React from 'react';
import { act, create } from 'react-test-renderer';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { OmwProvider, useOmwTrip } from './context';
import { readOmwTrip, writeOmwTrip } from './storage';
jest.mock('./storage', () => ({ readOmwTrip: jest.fn(), writeOmwTrip: jest.fn() }));
jest.mock('expo-location', () => ({
  Accuracy: { High: 4 }, getForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(), watchPositionAsync: jest.fn(),
}));
const to = { latitude: 34, longitude: 36, address: 'Destination' };
const trip = { from: { ...to, latitude: 33 }, to, via: null, radiusKm: 5,
  route: { id: 'route', coordinates: [{ ...to, latitude: 33 }, to] }, routes: [] };
let state, tree, onLocation;
function Consumer() {
  const value = useOmwTrip();
  React.useEffect(() => { state = value; }, [value]);
  return null;
}
async function mount(id = 'driver-one') {
  await act(async () => { tree = create(<OmwProvider driverId={id}><Consumer /></OmwProvider>); });
}
beforeEach(() => {
  jest.clearAllMocks(); AppState.currentState = 'active';
  readOmwTrip.mockResolvedValue(null); writeOmwTrip.mockResolvedValue(undefined);
  Location.getForegroundPermissionsAsync.mockResolvedValue({ granted: true });
  Location.watchPositionAsync.mockImplementation(async (_, callback) => { onLocation = callback; return { remove: jest.fn() }; });
  Location.getCurrentPositionAsync.mockResolvedValue({ timestamp: Date.now(), coords: { latitude: 33, longitude: 36, accuracy: 10 } });
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; });
test('saves the selected trip and restores it after a full provider remount', async () => {
  await mount();
  await act(async () => state.setTrip(trip));
  expect(writeOmwTrip).toHaveBeenLastCalledWith('driver-one', trip);
  await act(async () => tree.unmount());
  readOmwTrip.mockResolvedValue(trip);
  await mount();
  expect(state.trip).toEqual(trip);
  expect(writeOmwTrip).toHaveBeenCalledTimes(1);
});
test('cancellation removes the saved trip and arrival rejects stale or inaccurate fixes', async () => {
  readOmwTrip.mockResolvedValue(trip); await mount();
  for (const location of [
    { timestamp: Date.now() - 60000, coords: { ...to, accuracy: 10 } },
    { timestamp: Date.now(), coords: { ...to, accuracy: 200 } },
  ]) { await act(async () => onLocation(location)); expect(state.trip).toEqual(trip); }
  await act(async () => onLocation({ timestamp: Date.now(), coords: { ...to, accuracy: 10 } }));
  expect(state.trip).toBeNull();
  expect(writeOmwTrip).toHaveBeenLastCalledWith('driver-one', null);
  await act(async () => state.setTrip(trip));
  await act(async () => state.setTrip(null));
  expect(writeOmwTrip).toHaveBeenLastCalledWith('driver-one', null);
});
test('keeps trips isolated by account and preserves saved data when reading fails', async () => {
  readOmwTrip.mockRejectedValue(new Error('disk unavailable')); await mount('driver-two');
  expect(readOmwTrip).toHaveBeenCalledWith('driver-two');
  expect(writeOmwTrip).not.toHaveBeenCalled();
  expect(state.saveError).toBe(true);
});
