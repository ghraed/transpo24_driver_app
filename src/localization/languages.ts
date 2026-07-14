export const SUPPORTED_LANGUAGES = ['en', 'ar', 'fr', 'de', 'es'] as const;

export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: AppLanguage = 'en';

export type LanguageConfig = {
  code: AppLanguage;
  label: string;
  nativeLabel: string;
  locale: string;
  isRTL: boolean;
};

export const LANGUAGE_CONFIGS: Record<AppLanguage, LanguageConfig> = {
  en: { code: 'en', label: 'English', nativeLabel: 'English', locale: 'en-US', isRTL: false },
  ar: { code: 'ar', label: 'Arabic', nativeLabel: 'العربية', locale: 'ar', isRTL: true },
  fr: { code: 'fr', label: 'French', nativeLabel: 'Français', locale: 'fr-FR', isRTL: false },
  de: { code: 'de', label: 'German', nativeLabel: 'Deutsch', locale: 'de-DE', isRTL: false },
  es: { code: 'es', label: 'Spanish', nativeLabel: 'Español', locale: 'es-ES', isRTL: false },
};

export function isSupportedLanguage(value: string | null | undefined): value is AppLanguage {
  if (!value) return false;
  return SUPPORTED_LANGUAGES.includes(value as AppLanguage);
}

export function resolveSupportedLanguage(value: string | null | undefined): AppLanguage {
  const normalized = value?.trim().toLowerCase().replace('_', '-') ?? '';
  const baseLanguage = normalized.split('-')[0] ?? '';

  if (isSupportedLanguage(normalized)) {
    return normalized;
  }

  if (isSupportedLanguage(baseLanguage)) {
    return baseLanguage;
  }

  return DEFAULT_LANGUAGE;
}

export function getLocaleForLanguage(language: AppLanguage): string {
  return LANGUAGE_CONFIGS[language].locale;
}

export function isRTLLanguage(language: AppLanguage): boolean {
  return LANGUAGE_CONFIGS[language].isRTL;
}
