import i18n, { initializeI18n } from '@/localization/i18n';
import { DEFAULT_LANGUAGE, resolveSupportedLanguage } from '@/localization/languages';
import { translateDynamicText } from '@/services/translation-service';

export interface SourceMessageError extends Error {
  sourceMessage: string;
}

export function getSourceErrorMessage(error: unknown, fallback = ''): string {
  if (error && typeof error === 'object' && 'sourceMessage' in error) {
    const sourceMessage = (error as { sourceMessage?: unknown }).sourceMessage;
    if (typeof sourceMessage === 'string' && sourceMessage.trim()) {
      return sourceMessage;
    }
  }

  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export async function localizeResponseMessage(message: string, fallback: string): Promise<string> {
  await initializeI18n();

  const sourceMessage = message.trim() || fallback;
  const language = resolveSupportedLanguage(i18n.resolvedLanguage ?? i18n.language ?? DEFAULT_LANGUAGE);
  const catalogTranslation = i18n.t(sourceMessage, { defaultValue: sourceMessage });

  if (language === DEFAULT_LANGUAGE || catalogTranslation !== sourceMessage) {
    return catalogTranslation;
  }

  return translateDynamicText({
    text: sourceMessage,
    sourceLanguage: DEFAULT_LANGUAGE,
    targetLanguage: language,
    context: 'API response or validation error shown to a driver',
  });
}

