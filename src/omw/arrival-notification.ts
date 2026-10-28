import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import i18n from '@/localization/i18n';
import { ANDROID_CHANNEL_ID, ensureAndroidChannel, initializeNotifications } from '@/notifications/registerPushNotifications';

export async function sendOmwArrivalReminder(isCurrent: () => boolean): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && permission.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL) return null;
  initializeNotifications();
  await ensureAndroidChannel();
  if (!isCurrent()) return null;
  return Notifications.scheduleNotificationAsync({
    content: {
      title: i18n.t('omw.arrivalReminderTitle'),
      body: i18n.t('omw.arrivalReminderBody'),
      data: { type: 'OMW_ARRIVAL_REMINDER' },
      sound: 'default',
    },
    trigger: Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : null,
  });
}

export async function dismissOmwArrivalReminder(identifier: string): Promise<void> {
  await Promise.allSettled([
    Notifications.cancelScheduledNotificationAsync(identifier),
    Notifications.dismissNotificationAsync(identifier),
  ]);
}
