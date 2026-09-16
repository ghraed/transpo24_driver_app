import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React from 'react';
import { act, create } from 'react-test-renderer';
import * as Notifications from 'expo-notifications';
import { useNotificationNavigation } from './useNotificationNavigation';

const mockPush = jest.fn();
const mockRouter = { push: mockPush };
let mockNavigationState;
let mockPathname;
let mockResponse;
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useRootNavigationState: () => mockNavigationState,
  usePathname: () => mockPathname,
}));
jest.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'default',
  useLastNotificationResponse: () => mockResponse,
  clearLastNotificationResponse: jest.fn(() => { mockResponse = null; }),
}));

function Probe({ ready }) {
  useNotificationNavigation(ready);
  return null;
}
function response(data = { type: 'NEW_TRANSPORT_REQUEST', requestId: 'job1' }, identifier = 'tap1') {
  return { actionIdentifier: 'default', notification: { request: { identifier, content: { data } } } };
}
let renderer;
async function render(ready = true) {
  await act(async () => {
    if (renderer) renderer.update(<Probe ready={ready} />);
    else renderer = create(<Probe ready={ready} />);
  });
}
beforeEach(() => {
  jest.clearAllMocks();
  mockNavigationState = { key: 'root' };
  mockPathname = '/home';
  mockResponse = response();
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
});
test('retains a cold-start tap until session and navigator are ready', async () => {
  mockNavigationState = undefined;
  await render(false);
  await render(true);
  expect(mockPush).not.toHaveBeenCalled();
  expect(Notifications.clearLastNotificationResponse).not.toHaveBeenCalled();
  mockNavigationState = { key: 'root' };
  await render();
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/review-request-details', params: { requestId: 'job1' } });
  expect(Notifications.clearLastNotificationResponse).toHaveBeenCalledTimes(1);
});
test.each(['/', '/register', '/verify-phone', '/complete-profile'])('waits for the redirect from %s', async pathname => {
  mockPathname = pathname;
  await render();
  expect(mockPush).not.toHaveBeenCalled();
  mockPathname = '/home';
  await render();
  expect(mockPush).toHaveBeenCalledTimes(1);
});
test('handles a tap received after mounting and ignores duplicate delivery', async () => {
  mockResponse = null;
  await render();
  mockResponse = response();
  await render();
  mockResponse = response();
  await render();
  expect(mockPush).toHaveBeenCalledTimes(1);
  mockResponse = response(undefined, 'tap2');
  await render();
  expect(mockPush).toHaveBeenCalledTimes(2);
});
test.each([{ type: 'TEST_NOTIFICATION' }, {}, { type: 'CHAT_MESSAGE' }])('opens home when there is no usable destination: %j', async data => {
  mockResponse = response(data);
  await render();
  expect(mockPush).toHaveBeenCalledWith('/driver-home');
});
test('does not navigate for a non-opening action', async () => {
  mockResponse.actionIdentifier = 'dismiss';
  await render();
  expect(mockPush).not.toHaveBeenCalled();
});
test('does not replay a consumed tap after remounting', async () => {
  await render();
  await act(async () => renderer.unmount());
  renderer = null;
  await render();
  expect(mockPush).toHaveBeenCalledTimes(1);
});
