import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { I18nManager } from 'react-native';
import { LocalizationProvider, useAppLanguage } from './provider';
import { reloadAppAsync } from 'expo';
import { setStoredLanguage } from './storage';
let mockStoredLanguage = 'en';
jest.mock('expo', () => ({ reloadAppAsync: jest.fn(async () => {}) }));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en' }] }));
jest.mock('./storage', () => ({ getStoredLanguage: async () => mockStoredLanguage, setStoredLanguage: jest.fn(async () => {}) }));
jest.mock('./i18n', () => ({ __esModule: true, default: { changeLanguage: async () => {}, t: (key: string) => key }, initializeI18n: async () => {} }));
let value: ReturnType<typeof useAppLanguage>;
let tree: ReactTestRenderer;
function Probe() {
  const language = useAppLanguage();
  React.useEffect(() => { value = language; }, [language]);
  return null;
}
beforeEach(() => { jest.clearAllMocks(); mockStoredLanguage = 'en'; I18nManager.isRTL = false; jest.spyOn(I18nManager, 'allowRTL').mockImplementation(() => {}); jest.spyOn(I18nManager, 'forceRTL').mockImplementation(() => {}); });
afterEach(async () => { await act(async () => tree?.unmount()); jest.restoreAllMocks(); });
test('normal language change persists Arabic, updates native direction and reloads a release app', async () => {
  await act(async () => { tree = create(<LocalizationProvider><Probe /></LocalizationProvider>); });
  await act(async () => { await value.setLanguage('ar'); });
  expect(setStoredLanguage).toHaveBeenCalledWith('ar');
  expect(I18nManager.allowRTL).toHaveBeenCalledWith(true);
  expect(I18nManager.forceRTL).toHaveBeenCalledWith(true);
  expect(reloadAppAsync).toHaveBeenCalledTimes(1);
  expect(value.isRTL).toBe(true);
});
test('startup with saved Arabic and stale native direction reloads before rendering children', async () => {
  mockStoredLanguage = 'ar';
  await act(async () => { tree = create(<LocalizationProvider><Probe /></LocalizationProvider>); });
  expect(reloadAppAsync).toHaveBeenCalledTimes(1);
  expect(value.ready).toBe(false);
});
test('returning to a left-to-right language also reloads; same-direction changes do not', async () => {
  I18nManager.isRTL = true; mockStoredLanguage = 'ar';
  await act(async () => { tree = create(<LocalizationProvider><Probe /></LocalizationProvider>); });
  expect(reloadAppAsync).not.toHaveBeenCalled();
  await act(async () => { await value.setLanguage('en'); });
  expect(I18nManager.forceRTL).toHaveBeenCalledWith(false);
  expect(reloadAppAsync).toHaveBeenCalledTimes(1);
});

test('changing between left-to-right languages needs no native reload', async () => {
  await act(async () => { tree = create(<LocalizationProvider><Probe /></LocalizationProvider>); });
  await act(async () => { await value.setLanguage('de'); });
  expect(value.language).toBe('de');
  expect(reloadAppAsync).not.toHaveBeenCalled();
});
