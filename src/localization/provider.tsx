import { getLocales } from 'expo-localization';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { Alert, DevSettings, I18nManager, Platform } from 'react-native';

import i18n, { initializeI18n } from '@/localization/i18n';
import {
  DEFAULT_LANGUAGE,
  getLocaleForLanguage,
  isRTLLanguage,
  resolveSupportedLanguage,
  type AppLanguage,
} from '@/localization/languages';
import { getStoredLanguage, setStoredLanguage } from '@/localization/storage';

type LocalizationContextValue = {
  ready: boolean;
  language: AppLanguage;
  locale: string;
  isRTL: boolean;
  isChangingLanguage: boolean;
  setLanguage: (language: AppLanguage) => Promise<void>;
};

const LocalizationContext = createContext<LocalizationContextValue | null>(null);

function getInitialDeviceLanguage(): AppLanguage {
  const locale = getLocales()[0];
  return resolveSupportedLanguage(locale?.languageTag ?? locale?.languageCode ?? DEFAULT_LANGUAGE);
}

function syncRTL(language: AppLanguage): boolean {
  if (Platform.OS === 'web') {
    return false;
  }

  const nextRTL = isRTLLanguage(language);
  const directionChanged = I18nManager.isRTL !== nextRTL;

  if (directionChanged) {
    I18nManager.allowRTL(nextRTL);
    I18nManager.forceRTL(nextRTL);
  }

  return directionChanged;
}

export function LocalizationProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [isChangingLanguage, setIsChangingLanguage] = useState(false);
  const [language, setLanguageState] = useState<AppLanguage>(DEFAULT_LANGUAGE);

  useEffect(() => {
    let active = true;

    void (async () => {
      await initializeI18n();
      const storedLanguage = await getStoredLanguage();
      const resolvedLanguage = storedLanguage ?? getInitialDeviceLanguage();

      syncRTL(resolvedLanguage);
      await i18n.changeLanguage(resolvedLanguage);

      if (!active) return;
      setLanguageState(resolvedLanguage);
      setReady(true);
    })();

    return () => {
      active = false;
    };
  }, []);

  const setLanguage = useCallback(async (nextLanguage: AppLanguage): Promise<void> => {
    if (nextLanguage === language || isChangingLanguage) {
      return;
    }

    setIsChangingLanguage(true);

    try {
      await setStoredLanguage(nextLanguage);
      const rtlChanged = syncRTL(nextLanguage);
      await i18n.changeLanguage(nextLanguage);
      setLanguageState(nextLanguage);

      if (rtlChanged && Platform.OS !== 'web') {
        Alert.alert(
          i18n.t('Language updated'),
          i18n.t('The app will reload to apply right-to-left layout.'),
        );
        DevSettings.reload();
        return;
      }
    } finally {
      setIsChangingLanguage(false);
    }
  }, [isChangingLanguage, language]);

  const value = useMemo<LocalizationContextValue>(() => ({
    ready,
    language,
    locale: getLocaleForLanguage(language),
    isRTL: isRTLLanguage(language),
    isChangingLanguage,
    setLanguage,
  }), [isChangingLanguage, language, ready, setLanguage]);

  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

export function useAppLanguage(): LocalizationContextValue {
  const context = useContext(LocalizationContext);
  if (!context) {
    throw new Error('useAppLanguage must be used inside LocalizationProvider.');
  }
  return context;
}
