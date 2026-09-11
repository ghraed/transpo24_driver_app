import type { ConfigContext, ExpoConfig } from 'expo/config';
import { AndroidConfig, withAndroidManifest } from 'expo/config-plugins';
import { readFileSync } from 'node:fs';

const IS_DEV = process.env.APP_VARIANT === 'development';

const MAPS_ANDROID_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY?.trim() || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || '';
const MAPS_IOS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY?.trim() || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || '';
const BUILD_PROFILE = process.env.EAS_BUILD_PROFILE?.trim() ?? '';
const IS_LOCAL_DEVELOPMENT_BUILD =
  BUILD_PROFILE === 'development' ||
  (!BUILD_PROFILE && process.env.NODE_ENV !== 'production');
const ANDROID_GOOGLE_SERVICES_FILE =
  process.env.EXPO_PUBLIC_ANDROID_GOOGLE_SERVICES_FILE?.trim() ||
  process.env.EXPO_ANDROID_GOOGLE_SERVICES_FILE?.trim() ||
  './google-services.json';

export default ({ config }: ConfigContext) => {
  const androidPackage = IS_DEV ? 'com.transpo24.driver.dev' : config.android?.package;
  const androidGoogleServicesFile = IS_DEV
    ? process.env.EXPO_ANDROID_DEV_GOOGLE_SERVICES_FILE?.trim() || ''
    : ANDROID_GOOGLE_SERVICES_FILE;
  if (IS_DEV && androidGoogleServicesFile) {
    const services = JSON.parse(readFileSync(androidGoogleServicesFile, 'utf8'));
    if (!services.client?.some((client: { client_info?: { android_client_info?: { package_name?: string } } }) =>
      client.client_info?.android_client_info?.package_name === androidPackage,
    )) {
      throw new Error('Dev Firebase configuration must register com.transpo24.driver.dev.');
    }
  }
  // Validate on the Android build worker, where EAS file variables exist.
  if (process.env.EAS_BUILD_PLATFORM === 'android' && !IS_DEV) {
    const services = JSON.parse(readFileSync(androidGoogleServicesFile, 'utf8'));
    if (!services.client?.some((client: { client_info?: { android_client_info?: { package_name?: string } } }) =>
      client.client_info?.android_client_info?.package_name === androidPackage,
    )) {
      throw new Error(`Firebase configuration must register ${androidPackage} for push notifications.`);
    }
  }
  const existingPlugins = Array.isArray(config.plugins) ? config.plugins : [];
  const pluginsWithoutReactNativeMaps = existingPlugins.filter((plugin) => {
    if (typeof plugin === 'string') {
      return plugin !== 'react-native-maps';
    }

    if (Array.isArray(plugin)) {
      return plugin[0] !== 'react-native-maps';
    }

    return true;
  });

  const expoConfig = {
    ...config,
    ...(IS_DEV ? {
      name: 'Transpo24 Driver Dev',
      scheme: 'transpo24-driver-dev',
      updates: { ...config.updates, enabled: false },
    } : {}),
    ios: {
      ...config.ios,
      config: {
        ...config.ios?.config,
        googleMapsApiKey: MAPS_IOS_KEY,
      },
    },
    android: {
      ...config.android,
      package: androidPackage,
      googleServicesFile: androidGoogleServicesFile || undefined,
      config: {
        ...config.android?.config,
        googleMaps: {
          ...config.android?.config?.googleMaps,
          apiKey: MAPS_ANDROID_KEY,
        },
      },
    },
    plugins: [
      'expo-sharing',
      ...pluginsWithoutReactNativeMaps,
      [
        'react-native-maps',
        {
          androidGoogleMapsApiKey: MAPS_ANDROID_KEY,
          iosGoogleMapsApiKey: MAPS_IOS_KEY,
        },
      ],
    ],
  } as ExpoConfig;

  return withAndroidManifest(expoConfig, (manifestConfig) => {
    // Older generated projects explicitly removed foreground services. Clear
    // those stale merge directives so active-delivery tracking can run.
    const locationPermissions = new Set([
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
      'android.permission.ACCESS_BACKGROUND_LOCATION',
    ]);
    for (const permission of manifestConfig.modResults.manifest['uses-permission'] ?? []) {
      if (locationPermissions.has(permission.$['android:name'])) {
        delete permission.$['tools:node'];
      }
    }
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(
      manifestConfig.modResults,
    );

    // USB/Expo development uses the local HTTP API through adb reverse. Every
    // preview, Play test, and production binary stays HTTPS-only.
    mainApplication.$['android:usesCleartextTraffic'] = IS_LOCAL_DEVELOPMENT_BUILD
      ? 'true'
      : 'false';
    return manifestConfig;
  });
};
