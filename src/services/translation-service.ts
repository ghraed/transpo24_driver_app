import { getBackendApiBaseUrl } from '@/config/backend';
import { readAccessToken } from '@/lib/auth-storage';
import { DEFAULT_LANGUAGE, type AppLanguage } from '@/localization/languages';
import { getCachedTranslation, setCachedTranslation } from '@/localization/storage';

export interface TranslateTextRequest {
  text: string;
  targetLanguage: AppLanguage;
  sourceLanguage?: AppLanguage;
  context?: string;
}

export interface TranslateBatchItem {
  key: string;
  text: string;
  context?: string;
}

export interface TranslateBatchRequest {
  items: TranslateBatchItem[];
  targetLanguage: AppLanguage;
  sourceLanguage?: AppLanguage;
}

type TranslationResultMap = Record<string, string>;

function buildCacheKey(sourceLanguage: AppLanguage, targetLanguage: AppLanguage, text: string): string {
  return `${sourceLanguage}:${targetLanguage}:${text.trim()}`;
}

async function getHeaders(): Promise<HeadersInit> {
  const token = await readAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${getBackendApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Translation request failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
}

function readSingleTranslation(raw: unknown, fallback: string): string {
  if (typeof raw === 'string' && raw.trim()) {
    return raw;
  }

  if (raw && typeof raw === 'object') {
    const data = raw as Record<string, unknown>;
    const translated = data.translatedText ?? data.translation;
    if (typeof translated === 'string' && translated.trim()) {
      return translated;
    }
  }

  return fallback;
}

export async function translateDynamicText({
  text,
  targetLanguage,
  sourceLanguage = DEFAULT_LANGUAGE,
}: TranslateTextRequest): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed || targetLanguage === sourceLanguage) {
    return text;
  }

  const cacheKey = buildCacheKey(sourceLanguage, targetLanguage, trimmed);
  const cached = await getCachedTranslation(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const response = await postJson<unknown>('/translations', {
      text: trimmed,
      sourceLanguage,
      targetLanguage,
    });
    const translated = readSingleTranslation(response, text);
    if (translated.trim()) {
      await setCachedTranslation(cacheKey, translated);
    }
    return translated;
  } catch (error) {
    console.warn('Driver dynamic translation failed, falling back to original text.', error);
    return text;
  }
}

export async function translateDynamicBatch({
  items,
  targetLanguage,
  sourceLanguage = DEFAULT_LANGUAGE,
}: TranslateBatchRequest): Promise<TranslationResultMap> {
  if (!items.length || targetLanguage === sourceLanguage) {
    return Object.fromEntries(items.map((item) => [item.key, item.text])) as TranslationResultMap;
  }

  const results = Object.fromEntries(items.map((item) => [item.key, item.text])) as TranslationResultMap;
  const missingItems: TranslateBatchItem[] = [];

  for (const item of items) {
    const cached = await getCachedTranslation(buildCacheKey(sourceLanguage, targetLanguage, item.text));
    if (cached) {
      results[item.key] = cached;
    } else {
      missingItems.push(item);
    }
  }

  if (!missingItems.length) {
    return results;
  }

  try {
    const response = await postJson<{
      translations?: { originalText?: string; translatedText?: string; translation?: string }[];
      items?: { originalText?: string; translatedText?: string; translation?: string }[];
    }>('/translations/batch', {
      texts: missingItems.map((item) => item.text),
      sourceLanguage,
      targetLanguage,
    });

    const entries = response.translations ?? response.items ?? [];
    const pendingByText = new Map<string, string[]>();

    for (const item of missingItems) {
      const existingKeys = pendingByText.get(item.text) ?? [];
      existingKeys.push(item.key);
      pendingByText.set(item.text, existingKeys);
    }

    for (const entry of entries) {
      const translated = entry.translatedText ?? entry.translation;
      const originalText = entry.originalText;
      if (!originalText?.trim()) continue;
      if (!translated?.trim()) continue;

      const keys = pendingByText.get(originalText) ?? [];
      for (const key of keys) {
        results[key] = translated;
      }

      await setCachedTranslation(buildCacheKey(sourceLanguage, targetLanguage, originalText), translated);
    }

    return results;
  } catch (error) {
    console.warn('Driver dynamic translation batch failed, falling back to original texts.', error);
    return results;
  }
}
