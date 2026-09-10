import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { Linking, Platform } from 'react-native';
import { PrivacyControls } from './privacy-controls';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (value) => value }) }));
let renderer;
const originalOS = Platform.OS;
beforeEach(() => jest.clearAllMocks());
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = undefined;
  Platform.OS = originalOS;
  jest.restoreAllMocks();
});
async function render() {
  await act(async () => { renderer = create(<PrivacyControls />); });
}
function action(role) {
  return renderer.root.findAll((node) => node.props.accessibilityRole === role && typeof node.props.onPress === 'function')[0];
}
test('does not open settings or contact anyone until the user acts', async () => {
  const settings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  const mail = jest.spyOn(Linking, 'openURL').mockResolvedValue();
  await render();
  expect(settings).not.toHaveBeenCalled();
  expect(mail).not.toHaveBeenCalled();
  await act(async () => action('button').props.onPress());
  expect(settings).toHaveBeenCalledTimes(1);
  expect(mail).not.toHaveBeenCalled();
});
test('offers a readable fallback if the mail app is unavailable', async () => {
  jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('No mail app'));
  await render();
  await act(async () => action('link').props.onPress());
  expect(Linking.openURL).toHaveBeenCalledWith('mailto:privacy@transpo24.ch?subject=Transpo24%20privacy%20request');
  expect(JSON.stringify(renderer.toJSON())).toContain('Open device settings manually');
});
test('uses browser instructions instead of unavailable native settings on web', async () => {
  Platform.OS = 'web';
  const settings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  await render();
  expect(action('button')).toBeUndefined();
  expect(JSON.stringify(renderer.toJSON())).toContain('Use your browser site settings');
  expect(settings).not.toHaveBeenCalled();
});
