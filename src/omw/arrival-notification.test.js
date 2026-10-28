import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ensureAndroidChannel, initializeNotifications } from '@/notifications/registerPushNotifications';
import { dismissOmwArrivalReminder, sendOmwArrivalReminder } from './arrival-notification';

jest.mock('expo-notifications', () => ({
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  getPermissionsAsync: jest.fn(), scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(), dismissNotificationAsync: jest.fn(),
}));
jest.mock('@/localization/i18n', () => ({ __esModule: true, default: { t: key => key } }));
jest.mock('@/notifications/registerPushNotifications', () => ({
  ANDROID_CHANNEL_ID: 'transport_jobs', initializeNotifications: jest.fn(), ensureAndroidChannel: jest.fn(),
}));
const originalOS = Platform.OS;
beforeEach(() => {
  jest.resetAllMocks();
  Platform.OS = 'ios';
  Notifications.getPermissionsAsync.mockResolvedValue({ granted: true });
  Notifications.scheduleNotificationAsync.mockResolvedValue('reminder-id');
  ensureAndroidChannel.mockResolvedValue(undefined);
});
afterEach(() => { Platform.OS = originalOS; });

test.each(['ios', 'android'])('sends an immediate local arrival reminder on %s', async os => {
  Platform.OS = os;
  await expect(sendOmwArrivalReminder(() => true)).resolves.toBe('reminder-id');
  expect(initializeNotifications).toHaveBeenCalled();
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
    content: {
      title: 'omw.arrivalReminderTitle', body: 'omw.arrivalReminderBody',
      data: { type: 'OMW_ARRIVAL_REMINDER' }, sound: 'default',
    },
    trigger: os === 'android' ? { channelId: 'transport_jobs' } : null,
  });
});

test('supports provisional iOS notification permission', async () => {
  Notifications.getPermissionsAsync.mockResolvedValue({ granted: false, ios: { status: 3 } });
  await expect(sendOmwArrivalReminder(() => true)).resolves.toBe('reminder-id');
});

test('does not send when permission is denied', async () => {
  Notifications.getPermissionsAsync.mockResolvedValue({ granted: false });
  await expect(sendOmwArrivalReminder(() => true)).resolves.toBeNull();
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});

test('does not send after the trip ends while notification setup is pending', async () => {
  let configure;
  ensureAndroidChannel.mockImplementation(() => new Promise(resolve => { configure = resolve; }));
  let current = true;
  const sending = sendOmwArrivalReminder(() => current);
  await Promise.resolve();
  current = false;
  configure();
  await expect(sending).resolves.toBeNull();
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});

test('removes both pending and delivered reminders when a trip ends', async () => {
  await dismissOmwArrivalReminder('reminder-id');
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('reminder-id');
  expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith('reminder-id');
});
