import * as SecureStore from 'expo-secure-store';

import { type AppLanguage, isSupportedLanguage } from '@/localization/languages';

const LANGUAGE_STORAGE_KEY = 'transpo24.driver.language';
const TRANSLATION_CACHE_STORAGE_KEY = 'transpo24.driver.translationCache';

type TranslationCache = Record<string, string>;

let translationCache: TranslationCache | null = null;

export async function getStoredLanguage(): Promise<AppLanguage | null> {
  try {
    const value = await SecureStore.getItemAsync(LANGUAGE_STORAGE_KEY);
    return isSupportedLanguage(value) ? value : null;
  } catch (error) {
    console.warn('Failed to restore driver language preference.', error);
    return null;
  }
}

export async function setStoredLanguage(language: AppLanguage): Promise<void> {
  try {
    await SecureStore.setItemAsync(LANGUAGE_STORAGE_KEY, language);
  } catch (error) {
    console.warn('Failed to persist driver language preference.', error);
  }
}

async function loadTranslationCache(): Promise<TranslationCache> {
  if (translationCache) {
    return translationCache;
  }

  try {
    const raw = await SecureStore.getItemAsync(TRANSLATION_CACHE_STORAGE_KEY);
    translationCache = raw ? (JSON.parse(raw) as TranslationCache) : {};
  } catch (error) {
    console.warn('Failed to restore driver translation cache.', error);
    translationCache = {};
  }

  return translationCache;
}

async function persistTranslationCache(cache: TranslationCache): Promise<void> {
  try {
    await SecureStore.setItemAsync(TRANSLATION_CACHE_STORAGE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.warn('Failed to persist driver translation cache.', error);
  }
}

export async function getCachedTranslation(key: string): Promise<string | null> {
  const cache = await loadTranslationCache();
  return cache[key] ?? null;
}

export async function setCachedTranslation(key: string, value: string): Promise<void> {
  const cache = await loadTranslationCache();
  cache[key] = value;
  await persistTranslationCache(cache);
}
