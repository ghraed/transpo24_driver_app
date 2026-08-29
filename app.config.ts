import type { ConfigContext } from 'expo/config';
import { AndroidConfig, withAndroidManifest } from 'expo/config-plugins';
import type { ExpoConfig } from 'expo/config';

const MAPS_ANDROID_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY ?? '';
const MAPS_IOS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY ?? '';
const BUILD_PROFILE = process.env.EAS_BUILD_PROFILE?.trim() ?? '';
const IS_LOCAL_DEVELOPMENT_BUILD =
  BUILD_PROFILE === 'development' ||
  (!BUILD_PROFILE && process.env.NODE_ENV !== 'production');
const ANDROID_GOOGLE_SERVICES_FILE =
  process.env.EXPO_PUBLIC_ANDROID_GOOGLE_SERVICES_FILE?.trim() ||
  process.env.EXPO_ANDROID_GOOGLE_SERVICES_FILE?.trim() ||
  './google-services.json';

export default ({ config }: ConfigContext) => {
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
    ios: {
      ...config.ios,
      config: {
        ...config.ios?.config,
        googleMapsApiKey: MAPS_IOS_KEY,
      },
    },
    android: {
      ...config.android,
      ...(ANDROID_GOOGLE_SERVICES_FILE
        ? { googleServicesFile: ANDROID_GOOGLE_SERVICES_FILE }
        : {}),
      config: {
        ...config.android?.config,
        googleMaps: {
          ...config.android?.config?.googleMaps,
          apiKey: MAPS_ANDROID_KEY,
        },
      },
    },
    plugins: [
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
