import { Platform } from 'react-native';

export const GOOGLE_MAPS_API_KEY =
  Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY
    : process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY;

export const HAS_GOOGLE_MAPS_API_KEY = Boolean(
  GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY.trim().length > 0,
);
