import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { DEFAULT_LANGUAGE } from '@/localization/languages';
import ar from '@/localization/locales/ar.json';
import de from '@/localization/locales/de.json';
import en from '@/localization/locales/en.json';
import es from '@/localization/locales/es.json';
import fr from '@/localization/locales/fr.json';

const resources = {
  en: { translation: en },
  ar: { translation: ar },
  fr: { translation: fr },
  de: { translation: de },
  es: { translation: es },
} as const;

const i18n = createInstance();
let initializePromise: Promise<typeof i18n> | undefined;

export function initializeI18n(): Promise<typeof i18n> {
  if (i18n.isInitialized) {
    return Promise.resolve(i18n);
  }

  if (!initializePromise) {
    initializePromise = i18n
      .use(initReactI18next)
      .init({
        resources,
        lng: DEFAULT_LANGUAGE,
        fallbackLng: DEFAULT_LANGUAGE,
        supportedLngs: Object.keys(resources),
        defaultNS: 'translation',
        interpolation: {
          escapeValue: false,
        },
        returnNull: false,
        compatibilityJSON: 'v4',
        react: {
          useSuspense: false,
        },
      })
      .then(() => i18n);
  }

  return initializePromise;
}

void initializeI18n();

export default i18n;
