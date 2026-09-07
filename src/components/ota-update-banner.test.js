import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React from 'react';
import { act, create } from 'react-test-renderer';
import * as Updates from 'expo-updates';
import { OtaUpdateBanner } from './ota-update-banner';

jest.mock('expo-updates', () => ({
  isEnabled: true,
  useUpdates: jest.fn(),
  reloadAsync: jest.fn(),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (text, values) => text.replace('{{percent}}', values?.percent) }),
}));

let renderer;
let state;
const originalDev = global.__DEV__;
beforeEach(() => {
  global.__DEV__ = false;
  state = { currentlyRunning: { isEmbeddedLaunch: true }, isChecking: false,
    isDownloading: false, isUpdatePending: false };
  Updates.useUpdates.mockImplementation(() => state);
  Updates.reloadAsync.mockReset();
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = undefined;
  global.__DEV__ = originalDev;
});
async function render() {
  await act(async () => { renderer = create(<OtaUpdateBanner />); });
}
const output = () => JSON.stringify(renderer.toJSON());

test('shows actual download progress without claiming it is applied', async () => {
  state.isDownloading = true;
  state.downloadProgress = 0.42;
  await render();
  expect(output()).toContain('42%');
  expect(output()).not.toContain('Update applied');
});

test('waits for the user before restarting and handles reload failure', async () => {
  state.isUpdatePending = true;
  Updates.reloadAsync.mockRejectedValue(new Error('reload failed'));
  await render();
  expect(Updates.reloadAsync).not.toHaveBeenCalled();
  expect(output()).not.toContain('Update applied');
  await act(async () => { renderer.root.findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')[0].props.onPress(); });
  expect(Updates.reloadAsync).toHaveBeenCalledTimes(1);
  expect(output()).toContain('Could not restart');
});

test('confirms a running downloaded update and allows dismissal', async () => {
  state.currentlyRunning = { isEmbeddedLaunch: false, updateId: 'downloaded-id' };
  await render();
  expect(output()).toContain('Update applied');
  await act(async () => { renderer.root.findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')[0].props.onPress(); });
  expect(renderer.toJSON()).toBeNull();
});

test('does not claim success after an emergency fallback', async () => {
  state.currentlyRunning = { isEmbeddedLaunch: false, updateId: 'older-id', isEmergencyLaunch: true };
  await render();
  expect(output()).toContain('Update could not start');
  expect(output()).not.toContain('Update applied');
});

test('stays hidden in development', async () => {
  global.__DEV__ = true;
  state.isDownloading = true;
  await render();
  expect(renderer.toJSON()).toBeNull();
});
