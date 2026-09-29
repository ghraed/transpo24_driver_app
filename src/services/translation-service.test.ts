import { beforeEach, expect, jest, test } from '@jest/globals';
import { translateDynamicText, translateDynamicBatch } from './translation-service';
import { getCachedTranslation, setCachedTranslation } from '@/localization/storage';

jest.mock('@/config/backend', () => ({ getBackendApiBaseUrl: () => 'https://api.example.test' }));
jest.mock('@/lib/auth-storage', () => ({ readAccessToken: jest.fn<() => Promise<string>>().mockResolvedValue('token') }));
jest.mock('@/localization/storage', () => ({ getCachedTranslation: jest.fn(), setCachedTranslation: jest.fn() }));
jest.mock('@/localization/i18n', () => ({ __esModule: true, default: { language: 'en' } }));
const cached = jest.mocked(getCachedTranslation);
const save = jest.mocked(setCachedTranslation);
const fetchMock = jest.fn<typeof fetch>();
beforeEach(() => { jest.clearAllMocks(); cached.mockResolvedValue(null); save.mockResolvedValue(undefined); global.fetch = fetchMock as typeof fetch; });

test('same-language and empty text skip the network', async () => {
  expect(await translateDynamicText({ text: ' Hello ', targetLanguage: 'en' })).toBe(' Hello ');
  expect(await translateDynamicText({ text: ' ', targetLanguage: 'fr' })).toBe(' ');
  expect(fetchMock).not.toHaveBeenCalled();
});

test('single translation uses cache before network and caches successful response', async () => {
  cached.mockResolvedValueOnce('Bonjour');
  expect(await translateDynamicText({ text: ' Hello ', targetLanguage: 'fr' })).toBe('Bonjour');
  expect(fetchMock).not.toHaveBeenCalled();
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ translatedText: 'Bonjour' }) } as Response);
  expect(await translateDynamicText({ text: 'Hello', targetLanguage: 'fr' })).toBe('Bonjour');
  expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/translations', expect.objectContaining({
    method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer token' }),
    body: JSON.stringify({ text: 'Hello', sourceLanguage: 'en', targetLanguage: 'fr' }),
  }));
  expect(save).toHaveBeenCalledWith('en:fr:Hello', 'Bonjour');
});

test('translation request failure returns source text', async () => {
  fetchMock.mockRejectedValueOnce(new Error('offline'));
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  try { expect(await translateDynamicText({ text: 'Hello', targetLanguage: 'fr' })).toBe('Hello'); }
  finally { warn.mockRestore(); }
});

test('batch maps repeated source text to every key while preserving missing results', async () => {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ translations: [{ originalText: 'Hello', translatedText: 'Bonjour' }] }) } as Response);
  const result = await translateDynamicBatch({ targetLanguage: 'fr', items: [
    { key: 'a', text: 'Hello' }, { key: 'b', text: 'Hello' }, { key: 'c', text: 'Goodbye' },
  ] });
  expect(result).toEqual({ a: 'Bonjour', b: 'Bonjour', c: 'Goodbye' });
  expect(save).toHaveBeenCalledWith('en:fr:Hello', 'Bonjour');
});
