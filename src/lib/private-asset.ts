import { getCurrentAccessToken as token } from './auth-storage';
import { getBackendApiBaseUrl as baseUrl } from '@/config/backend';

/** Never attach credentials to a provider/third-party URL. */
export function privateAssetSource(uri: string): { uri: string; cache?: 'reload'; headers?: Record<string, string> } {
  try {
    const base = new URL(baseUrl());
    const url = new URL(uri, base);
    if (url.origin === base.origin && (url.pathname.startsWith('/uploads/') || /^\/request-files\/[^/]+\/content$/.test(url.pathname))) {
      const credential = token?.();
      return { uri: url.toString(), cache: 'reload' as const, headers: credential ? { Authorization: 'Bearer ' + credential } : {} };
    }
  } catch { /* Local file previews require no API credentials. */ }
  return { uri };
}
