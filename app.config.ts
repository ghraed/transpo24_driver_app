import type { ConfigContext } from 'expo/config';

const MAPS_ANDROID_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY ?? '';
const MAPS_IOS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY ?? '';

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

  return {
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
  };
};
