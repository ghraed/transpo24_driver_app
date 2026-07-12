import { Platform } from 'react-native';

const PLACEHOLDER_HOSTS = new Set([
  'ip',
  'your-ip',
  'your_ip',
  'example.com',
  '0.0.0.0',
]);

export interface BackendConnectionTarget {
  label: string;
  url: string;
  note?: string;
}

const BACKEND_CONNECTION_TARGETS: readonly BackendConnectionTarget[] = [
  {
    label: 'Android USB device',
    url: 'http://127.0.0.1:3001',
    note: 'use adb reverse',
  },
  {
    label: 'Android emulator',
    url: 'http://10.0.2.2:3001',
  },
  {
    label: 'iOS simulator',
    url: 'http://localhost:3001',
  },
  {
    label: 'Physical device over Wi-Fi',
    url: 'your computer LAN IP',
  },
] as const;

function normalizeHttpUrl(rawValue: string): string {
  const trimmed = rawValue.trim();
  return /^https?:\/\//i.test(trimmed) || !/^[a-z0-9.-]+:\d+($|\/)/i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
}

function formatBackendConnectionTargets(): string {
  return BACKEND_CONNECTION_TARGETS.map((target) =>
    `${target.label}: ${target.url}${target.note ? ` (${target.note})` : ''}`,
  ).join(', ');
}

export function createBackendReachabilityError(endpoint: string, envName = 'EXPO_PUBLIC_API_URL'): Error {
  return new Error(
    `Cannot reach backend at ${endpoint}. Verify ${envName} and backend network access. ${formatBackendConnectionTargets()}.`,
  );
}

function parseHttpUrl(envName: string, rawValue: string): URL {
  const candidate = normalizeHttpUrl(rawValue);
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(
      `${envName}="${rawValue}" is invalid. Use a full backend URL such as http://127.0.0.1:3001 or http://192.168.1.10:3001.`,
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `${envName} must start with http:// or https://. Received "${rawValue}".`,
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  const allowsAndroidUsbLoopback =
    __DEV__ && Platform.OS === 'android' && (hostname === 'localhost' || hostname === '127.0.0.1');

  if (!parsed.hostname || (PLACEHOLDER_HOSTS.has(hostname) && !allowsAndroidUsbLoopback)) {
    throw new Error(
      `${envName}="${rawValue}" is not a usable backend host. ` +
        `${formatBackendConnectionTargets()}.`,
    );
  }

  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  return parsed;
}

function readBackendEnvValue(baseName: 'API_URL' | 'SOCKET_URL'): string | undefined {
  if (__DEV__ && Platform.OS === 'android') {
    const androidOverride = process.env[`EXPO_PUBLIC_ANDROID_${baseName}`]?.trim();
    if (androidOverride) {
      return androidOverride;
    }
  }

  return process.env[`EXPO_PUBLIC_${baseName}`]?.trim();
}

function resolveBackendUrl(envName: string, rawValue: string | undefined): string {
  if (!rawValue?.trim()) {
    throw new Error(`${envName} is missing. Please set it in your environment.`);
  }

  return parseHttpUrl(envName, rawValue).toString().replace(/\/$/, '');
}

export function getBackendApiBaseUrl(): string {
  return resolveBackendUrl('EXPO_PUBLIC_API_URL', readBackendEnvValue('API_URL'));
}

export function getBackendSocketUrl(): string {
  return resolveBackendUrl('EXPO_PUBLIC_SOCKET_URL', readBackendEnvValue('SOCKET_URL'));
}

export function resolveBackendAssetUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed || /^(https?:|file:|content:|data:)/i.test(trimmed)) {
    return trimmed;
  }

  const baseUrl = getBackendApiBaseUrl();
  return `${baseUrl}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}
