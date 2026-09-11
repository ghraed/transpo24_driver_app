/* eslint-disable @typescript-eslint/no-require-imports -- Reload env configuration inside each isolated module registry. */
import { afterEach, expect, it, jest } from '@jest/globals';
import { Platform } from 'react-native';

const originalOS = Platform.OS;
const originalEnv = { ...process.env };
afterEach(() => { Platform.OS = originalOS; process.env = { ...originalEnv }; });

it.each(['android', 'ios'] as const)('uses the generic key when the %s key is absent or blank', os => {
  Platform.OS = os;
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = ' generic ';
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY = ' ';
  delete process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY;
  jest.isolateModules(() => {
    require('react-native').Platform.OS = os;
    const maps = require('./maps');
    expect(maps.GOOGLE_MAPS_API_KEY).toBe('generic');
    expect(maps.HAS_GOOGLE_MAPS_API_KEY).toBe(true);
  });
});
it.each(['android', 'ios'] as const)('prefers the %s platform key', os => {
  Platform.OS = os;
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = 'generic';
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY = 'android';
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY = 'ios';
  jest.isolateModules(() => {
    require('react-native').Platform.OS = os; expect(require('./maps').GOOGLE_MAPS_API_KEY).toBe(os); });
});
