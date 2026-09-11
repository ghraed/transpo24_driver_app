import React from 'react';
import { act, create } from 'react-test-renderer';
import { TestNotificationButton } from './test-notification-button';
import { sendTestNotification } from '@/lib/api';
import { registerDriverPushNotifications as register } from '@/notifications/registerPushNotifications';

jest.mock('@/lib/api', () => ({ sendTestNotification: jest.fn() }));
jest.mock('@/notifications/registerPushNotifications', () => ({ registerDriverPushNotifications: jest.fn() }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: text => text }) }));
let renderer;
beforeEach(() => { register.mockReset().mockResolvedValue('test-token'); sendTestNotification.mockReset().mockResolvedValue(undefined); });
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); });
async function press() {
  await act(async () => { renderer = create(<TestNotificationButton />); });
  await act(async () => { renderer.root.findByProps({ accessibilityRole: 'button' }).props.onPress(); });
}
test('registers this device before requesting a remote test', async () => {
  await press();
  expect(register).toHaveBeenCalled();
  expect(sendTestNotification).toHaveBeenCalledWith('test-token');
  expect(JSON.stringify(renderer.toJSON())).toContain('Test sent. Check for a notification');
});
test('does not send when permission or registration fails', async () => {
  register.mockRejectedValue(new Error('Permission denied'));
  await press();
  expect(sendTestNotification).not.toHaveBeenCalled();
  expect(JSON.stringify(renderer.toJSON())).toContain('Permission denied');
});
test('shows provider errors without reporting success', async () => {
  sendTestNotification.mockRejectedValue(new Error('InvalidCredentials'));
  await press();
  expect(JSON.stringify(renderer.toJSON())).toContain('InvalidCredentials');
  expect(JSON.stringify(renderer.toJSON())).not.toContain('Test sent.');
});
