import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Platform } from 'react-native';
import { getBackendApiBaseUrl, getBackendSocketUrl } from './backend';

let mockIsDevice = false;
let mockHostUri: string | undefined;
jest.mock('expo-device', () => ({ get isDevice() { return mockIsDevice; } }));
jest.mock('expo-constants', () => ({ __esModule: true, default: {
  get expoConfig() { return { hostUri: mockHostUri }; },
} }));

const envKeys = [
  'EXPO_PUBLIC_ANDROID_API_URL', 'EXPO_PUBLIC_ANDROID_SOCKET_URL',
  'EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_SOCKET_URL',
] as const;
const originalEnv = { ...process.env };
const originalPlatform = Platform.OS;
const originalDev = __DEV__;

describe('backend environment selection', () => {
  beforeEach(() => {
    mockIsDevice = false;
    mockHostUri = undefined;
    Platform.OS = 'android';
    delete process.env.EXPO_PUBLIC_ANDROID_API_URL;
    delete process.env.EXPO_PUBLIC_ANDROID_SOCKET_URL;
    delete process.env.EXPO_PUBLIC_API_URL;
    delete process.env.EXPO_PUBLIC_SOCKET_URL;
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    Platform.OS = originalPlatform;
    Object.defineProperty(global, '__DEV__', { configurable: true, writable: true, value: originalDev });
  });

  it('honors configured Android URLs during development instead of hardcoded loopback', () => {
    process.env.EXPO_PUBLIC_ANDROID_API_URL = 'http://192.168.1.50:4000/';
    process.env.EXPO_PUBLIC_ANDROID_SOCKET_URL = 'http://192.168.1.50:4001/';
    process.env.EXPO_PUBLIC_API_URL = 'https://generic.example';
    expect(getBackendApiBaseUrl()).toBe('http://192.168.1.50:4000');
    expect(getBackendSocketUrl()).toBe('http://192.168.1.50:4001');
  });

  it('uses generic URLs on iOS', () => {
    Platform.OS = 'ios';
    process.env.EXPO_PUBLIC_ANDROID_API_URL = 'http://127.0.0.1:3001';
    process.env.EXPO_PUBLIC_API_URL = 'http://localhost:3001/';
    process.env.EXPO_PUBLIC_SOCKET_URL = 'http://localhost:3001/';
    expect(getBackendApiBaseUrl()).toBe('http://localhost:3001');
    expect(getBackendSocketUrl()).toBe('http://localhost:3001');
  });

  it('reports missing configuration instead of silently choosing a server', () => {
    expect(() => getBackendApiBaseUrl()).toThrow('EXPO_PUBLIC_API_URL is missing');
  });

  it('uses the Metro computer LAN address for a physical iPhone local API and socket', () => {
    Platform.OS = 'ios';
    mockIsDevice = true;
    mockHostUri = '192.168.1.50:8082';
    process.env.EXPO_PUBLIC_API_URL = 'http://localhost:3001/api/';
    process.env.EXPO_PUBLIC_SOCKET_URL = 'http://127.0.0.1:3001/';
    expect(getBackendApiBaseUrl()).toBe('http://192.168.1.50:3001/api');
    expect(getBackendSocketUrl()).toBe('http://192.168.1.50:3001');
  });

  it.each(['my-project.exp.direct:8082', 'example.com:8082', '127.0.0.1:8082', '192.168.999.1:8082', undefined])(
    'does not guess a local API server from Metro host %s', host => {
      Platform.OS = 'ios'; mockIsDevice = true; mockHostUri = host;
      process.env.EXPO_PUBLIC_API_URL = 'http://localhost:3001';
      expect(getBackendApiBaseUrl()).toBe('http://localhost:3001');
    },
  );

  it('preserves production and release URLs even on a physical iPhone', () => {
    Platform.OS = 'ios'; mockIsDevice = true; mockHostUri = '192.168.1.50:8082';
    process.env.EXPO_PUBLIC_API_URL = 'https://api.transpo24.com';
    expect(getBackendApiBaseUrl()).toBe('https://api.transpo24.com');
    Object.defineProperty(global, '__DEV__', { configurable: true, writable: true, value: false });
    process.env.EXPO_PUBLIC_API_URL = 'http://localhost:3001';
    expect(getBackendApiBaseUrl()).toBe('http://localhost:3001');
  });
});
