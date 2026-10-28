import React from 'react';
import { act, create } from 'react-test-renderer';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { OmwProvider, useOmwTrip } from './context';
import { readOmwTrip, writeOmwTrip } from './storage';
import { dismissOmwArrivalReminder, sendOmwArrivalReminder } from './arrival-notification';
jest.mock('./storage', () => ({ readOmwTrip: jest.fn(), writeOmwTrip: jest.fn() }));
jest.mock('./arrival-notification', () => ({ dismissOmwArrivalReminder: jest.fn(), sendOmwArrivalReminder: jest.fn() }));
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
  sendOmwArrivalReminder.mockResolvedValue('arrival-one'); dismissOmwArrivalReminder.mockResolvedValue(undefined);
  Location.getForegroundPermissionsAsync.mockResolvedValue({ granted: true });
  Location.watchPositionAsync.mockImplementation(async (_, callback) => { onLocation = callback; return { remove: jest.fn() }; });
  Location.getCurrentPositionAsync.mockResolvedValue({ timestamp: Date.now() - 1000, coords: { latitude: 33, longitude: 36, accuracy: 10 } });
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; });
test('saves the selected trip and restores it after a full provider remount', async () => {
  await mount();
  await act(async () => state.setTrip(trip));
  expect(writeOmwTrip).toHaveBeenLastCalledWith('driver-one', expect.objectContaining(trip));
  const saved = state.trip;
  await act(async () => tree.unmount());
  readOmwTrip.mockResolvedValue(saved);
  await mount();
  expect(state.trip).toEqual(saved);
  expect(writeOmwTrip).toHaveBeenCalledTimes(1);
});
test('cancellation removes the saved trip and arrival rejects stale or inaccurate fixes', async () => {
  readOmwTrip.mockResolvedValue(trip); await mount();
  for (const location of [
    { timestamp: Date.now() - 60000, coords: { ...to, accuracy: 10 } },
    { timestamp: Date.now(), coords: { ...to, accuracy: 200 } },
  ]) { await act(async () => onLocation(location)); expect(state.trip).toMatchObject(trip); }
  expect(sendOmwArrivalReminder).not.toHaveBeenCalled();
  await act(async () => onLocation({ timestamp: Date.now(), coords: { ...to, accuracy: 10 } }));
  expect(state.trip).toMatchObject(trip);
  expect(state.trip.arrivalReminderId).toBe('arrival-one');
  expect(writeOmwTrip).not.toHaveBeenCalledWith('driver-one', null);
  await act(async () => state.setTrip(null));
  expect(writeOmwTrip).toHaveBeenLastCalledWith('driver-one', null);
  expect(dismissOmwArrivalReminder).toHaveBeenCalledWith('arrival-one');
});
test('keeps trips isolated by account and preserves saved data when reading fails', async () => {
  readOmwTrip.mockRejectedValue(new Error('disk unavailable')); await mount('driver-two');
  expect(readOmwTrip).toHaveBeenCalledWith('driver-two');
  expect(writeOmwTrip).not.toHaveBeenCalled();
  expect(state.saveError).toBe(true);
});

test('keeps a newly confirmed trip when the first GPS fixes are at its destination', async () => {
  Location.getCurrentPositionAsync.mockResolvedValue({ timestamp: Date.now(), coords: { ...to, accuracy: 10 } });
  await mount();
  await act(async () => state.setTrip(trip));
  await act(async () => onLocation({ timestamp: Date.now(), coords: { ...to, accuracy: 10 } }));
  expect(state.trip).toMatchObject(trip);
  expect(sendOmwArrivalReminder).toHaveBeenCalledTimes(1);
  expect(writeOmwTrip).not.toHaveBeenCalledWith('driver-one', null);
});

test('ignores poor fixes and sends one reminder without ending the trip', async () => {
  // Drive callbacks manually to model GPS delivery order independently of polling.
  Location.getCurrentPositionAsync.mockImplementation(() => new Promise(() => {}));
  await mount();
  await act(async () => state.setTrip(trip));
  const now = Date.now();
  for (const location of [
    { timestamp: now - 60000, coords: { ...to, accuracy: 10 } },
    { timestamp: now + 60000, coords: { ...to, accuracy: 10 } },
    { timestamp: now, coords: { ...to, accuracy: 200 } },
    { timestamp: now, coords: { ...to, accuracy: null } },
    { timestamp: now, coords: { ...to, latitude: NaN, accuracy: 10 } },
    { timestamp: now, coords: { ...to, latitude: to.latitude + 0.001, accuracy: 20 } },
  ]) {
    await act(async () => onLocation(location));
    expect(sendOmwArrivalReminder).not.toHaveBeenCalled();
  }
  AppState.currentState = 'background';
  await act(async () => onLocation({ timestamp: now, coords: { ...to, accuracy: 10 } }));
  expect(sendOmwArrivalReminder).not.toHaveBeenCalled();
  AppState.currentState = 'active';
  await act(async () => onLocation({ timestamp: now, coords: { ...to, accuracy: 10 } }));
  await act(async () => onLocation({ timestamp: now, coords: { ...to, accuracy: 10 } }));
  expect(sendOmwArrivalReminder).toHaveBeenCalledTimes(1);
  expect(state.trip).toMatchObject(trip);
});

test('keeps the reminder status when editing a route and resets it for a different journey', async () => {
  await mount();
  await act(async () => state.setTrip(trip));
  await act(async () => onLocation({ timestamp: Date.now(), coords: { ...to, accuracy: 10 } }));
  await act(async () => state.setTrip({ ...trip, radiusKm: 10 }));
  expect(state.trip.arrivalReminderId).toBe('arrival-one');
  Location.getCurrentPositionAsync.mockImplementation(() => new Promise(() => {}));
  await act(async () => state.setTrip({ ...state.trip, to: { ...to, latitude: 35 } }));
  expect(state.trip.arrivalReminderId).toBeUndefined();
  expect(dismissOmwArrivalReminder).toHaveBeenCalledWith('arrival-one');
});

test('does not repeat a delivered reminder after an app restart', async () => {
  readOmwTrip.mockResolvedValue({ ...trip, arrivalReminderId: 'arrival-one' });
  Location.getCurrentPositionAsync.mockResolvedValue({ timestamp: Date.now(), coords: { ...to, accuracy: 10 } });
  await mount();
  expect(state.trip).toMatchObject(trip);
  expect(sendOmwArrivalReminder).not.toHaveBeenCalled();
  expect(writeOmwTrip).not.toHaveBeenCalled();
});

test('retries a failed reminder without losing the saved trip', async () => {
  sendOmwArrivalReminder.mockRejectedValueOnce(new Error('Notification unavailable'));
  await mount(); await act(async () => state.setTrip(trip));
  await act(async () => onLocation({ timestamp: Date.now(), coords: { ...to, accuracy: 10 } }));
  expect(state.trip).toMatchObject(trip);
  expect(state.trip.arrivalReminderId).toBeUndefined();
  await act(async () => onLocation({ timestamp: Date.now(), coords: { ...to, accuracy: 10 } }));
  expect(state.trip.arrivalReminderId).toBe('arrival-one');
});

test('ignores duplicate fixes during notification delivery and cannot restore an ended trip', async () => {
  let deliver;
  sendOmwArrivalReminder.mockImplementationOnce(() => new Promise(resolve => { deliver = resolve; }));
  await mount(); await act(async () => state.setTrip(trip));
  await act(async () => onLocation({ timestamp: Date.now(), coords: { ...to, accuracy: 10 } }));
  const isCurrent = sendOmwArrivalReminder.mock.calls[0][0];
  await act(async () => onLocation({ timestamp: Date.now(), coords: { ...to, accuracy: 10 } }));
  expect(sendOmwArrivalReminder).toHaveBeenCalledTimes(1);
  await act(async () => state.setTrip(null));
  expect(isCurrent()).toBe(false);
  await act(async () => deliver('late-reminder'));
  expect(state.trip).toBeNull();
  expect(dismissOmwArrivalReminder).toHaveBeenCalledWith('late-reminder');
});

test('a reminder completing during a route edit preserves the latest route settings', async () => {
  let deliver;
  sendOmwArrivalReminder.mockImplementationOnce(() => new Promise(resolve => { deliver = resolve; }));
  await mount(); await act(async () => state.setTrip(trip));
  await act(async () => onLocation({ timestamp: Date.now(), coords: { ...to, accuracy: 10 } }));
  await act(async () => state.setTrip({ ...trip, radiusKm: 25 }));
  await act(async () => deliver('arrival-one'));
  expect(state.trip.radiusKm).toBe(25);
  expect(state.trip.arrivalReminderId).toBe('arrival-one');
});
