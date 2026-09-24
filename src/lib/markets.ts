import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { getBackendApiBaseUrl } from '@/config/backend';

export type PublicMarket = {
  id: string; code: string; countryCode: string; name: string;
  defaultCurrency: string; timezone: string; defaultLocale: string | null;
};
const KEY = 'transpo24.driver.selectedMarket';
export async function getSelectedMarket(): Promise<string | null> {
  return Platform.OS === 'web' ? globalThis.localStorage?.getItem(KEY) ?? null : SecureStore.getItemAsync(KEY);
}
export async function saveSelectedMarket(code: string): Promise<void> {
  if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, code);
  else await SecureStore.setItemAsync(KEY, code);
}
export async function fetchMarkets(): Promise<PublicMarket[]> {
  const response = await fetch(`${getBackendApiBaseUrl()}/tenants/public`);
  if (!response.ok) throw new Error('Unable to load markets.');
  const data: unknown = await response.json();
  if (!Array.isArray(data) || !data.every((market) => market && typeof market.code === 'string' && typeof market.name === 'string')) {
    throw new Error('Unable to load markets.');
  }
  return data as PublicMarket[];
}
