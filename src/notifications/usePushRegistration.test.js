import React from 'react';
import { act, create } from 'react-test-renderer';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { registerDriverPushNotifications as register } from './registerPushNotifications';
import { usePushRegistration } from './usePushRegistration';
import { isMissingFirebaseConfiguration, PushConfigurationError } from './push-registration-error';

jest.mock('./registerPushNotifications', () => ({ registerDriverPushNotifications: jest.fn() }));
jest.mock('expo-notifications', () => ({ addPushTokenListener: jest.fn() }));
let renderer;
let onState;
let onToken;
let removeState;
let removeToken;
function Harness({ session = 'user-1' }) { usePushRegistration(session); return null; }
beforeEach(() => {
  jest.useFakeTimers();
  register.mockReset().mockResolvedValue('expo-token');
  removeState = jest.fn(); removeToken = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((event, listener) => {
    onState = listener; return { remove: removeState };
  });
  Notifications.addPushTokenListener.mockImplementation(listener => {
    onToken = listener; return { remove: removeToken };
  });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = undefined;
  jest.restoreAllMocks(); jest.useRealTimers();
});
async function mount(session = 'user-1') {
  await act(async () => { renderer = create(<Harness session={session} />); });
}
test('waits for authentication', async () => {
  await mount(null);
  expect(register).not.toHaveBeenCalled();
});
test('distinguishes native Firebase setup failures from temporary registration errors', () => {
  expect(isMissingFirebaseConfiguration(new Error('Default FirebaseApp is not initialized in this process com.transpo24.driver.dev.'))).toBe(true);
  expect(isMissingFirebaseConfiguration(new Error('Unable to get Firebase Messaging instance.'))).toBe(true);
  expect(isMissingFirebaseConfiguration(new Error('Network request failed'))).toBe(false);
});
test('retries temporary failures without requesting permission again', async () => {
  register.mockRejectedValueOnce(new Error('offline'));
  await mount();
  expect(register).toHaveBeenLastCalledWith(true);
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(register).toHaveBeenLastCalledWith(false);
  expect(register).toHaveBeenCalledTimes(2);
});
test('refreshes on foreground and token rotation and removes listeners on logout', async () => {
  await mount();
  await act(async () => { onState('background'); });
  expect(register).toHaveBeenCalledTimes(1);
  await act(async () => { onState('active'); });
  await act(async () => { onToken({ data: 'new-native-token' }); });
  expect(register).toHaveBeenCalledTimes(3);
  expect(register).toHaveBeenLastCalledWith(false);
  await act(async () => { renderer.update(<Harness session={null} />); });
  expect(removeState).toHaveBeenCalled(); expect(removeToken).toHaveBeenCalled();
});
test('cancels pending retries on logout', async () => {
  register.mockRejectedValue(new Error('offline'));
  await mount();
  await act(async () => { renderer.update(<Harness session={null} />); });
  await act(async () => { jest.advanceTimersByTime(60000); });
  expect(register).toHaveBeenCalledTimes(1);
});
test('does not retry missing native Firebase configuration on timers, foreground, or token events', async () => {
  register.mockRejectedValue(new PushConfigurationError());
  await mount();
  await act(async () => { jest.advanceTimersByTime(60000); });
  await act(async () => { onState('active'); onToken({ data: 'token' }); });
  expect(register).toHaveBeenCalledTimes(1);
  expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('npm run android:usb'));
});
