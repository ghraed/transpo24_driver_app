import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { registerPushToken } from '@/lib/api';
import type { RegisterPushTokenPayload } from '@/notifications/types';

const ANDROID_CHANNEL_ID = 'transport_jobs';
const DRIVER_APP_CONTEXT = 'DRIVER';

let hasInitializedNotifications = false;

function getProjectId(): string | null {
  const projectIdFromExpoConfig = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof projectIdFromExpoConfig === 'string' && projectIdFromExpoConfig.trim()) {
    return projectIdFromExpoConfig;
  }

  const projectIdFromEasConfig = Constants.easConfig?.projectId;
  if (typeof projectIdFromEasConfig === 'string' && projectIdFromEasConfig.trim()) {
    return projectIdFromEasConfig;
  }

  return null;
}

function assertPushEnvironmentSupported(): void {
  if (Platform.OS === 'android' && Constants.appOwnership === 'expo') {
    throw new Error(
      'Expo Go on Android does not support remote push notifications. Install a development build or release build of the driver app.',
    );
  }
}

function requireProjectId(): string {
  const projectId = getProjectId();
  if (projectId) {
    return projectId;
  }

  throw new Error(
    'Expo push projectId is missing. Add expo.extra.eas.projectId to the driver app config or run the app from an EAS/dev build that provides Constants.easConfig.projectId.',
  );
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Transport Jobs',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#2563EB',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

async function requestNotificationPermissions(): Promise<boolean> {
  const existingPermissions = await Notifications.getPermissionsAsync();
  if (existingPermissions.granted) {
    return true;
  }

  const requestedPermissions = await Notifications.requestPermissionsAsync();
  return requestedPermissions.granted;
}

function resolvePlatform(): RegisterPushTokenPayload['platform'] | null {
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    return Platform.OS;
  }

  return null;
}

export function initializeNotifications(): void {
  if (hasInitializedNotifications) {
    return;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });

  hasInitializedNotifications = true;
  void ensureAndroidChannel().catch((error: unknown) => {
    console.warn('Failed to configure Android notification channel.', error);
  });
}

export async function registerDriverPushNotifications(): Promise<string> {
  initializeNotifications();

  if (!Device.isDevice) {
    throw new Error('Push notification registration requires a physical device.');
  }

  try {
    assertPushEnvironmentSupported();

    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      throw new Error('Notification permission was not granted.');
    }

    const projectId = requireProjectId();
    const pushToken = await Notifications.getExpoPushTokenAsync({ projectId });
    const platform = resolvePlatform();

    if (!platform) {
      throw new Error('Push notification registration is unsupported on this platform.');
    }

    const payload: RegisterPushTokenPayload = {
      token: pushToken.data,
      platform,
      app: DRIVER_APP_CONTEXT,
      deviceName: Constants.deviceName ?? undefined,
    };

    await registerPushToken(payload);
    return pushToken.data;
  } catch (error) {
    console.warn('Failed to register driver push notifications.', error);
    throw (error instanceof Error
      ? error
      : new Error('Failed to register driver push notifications.'));
  }
}
