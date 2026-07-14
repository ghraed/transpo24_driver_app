import i18n from '@/localization/i18n';
import {
  DEFAULT_LANGUAGE,
  getLocaleForLanguage,
  isSupportedLanguage,
  type AppLanguage,
} from '@/localization/languages';

function getActiveLanguage(): AppLanguage {
  const candidate = i18n.language?.split('-')[0] ?? DEFAULT_LANGUAGE;
  return isSupportedLanguage(candidate) ? candidate : DEFAULT_LANGUAGE;
}

function getActiveLocale(): string {
  return getLocaleForLanguage(getActiveLanguage());
}

export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return typeof value === 'string' ? value : 'N/A';
  }

  return new Intl.DateTimeFormat(getActiveLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

export function formatTime(value: string | number | Date | null | undefined): string {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return typeof value === 'string' ? value : 'N/A';
  }

  return new Intl.DateTimeFormat(getActiveLocale(), {
    timeStyle: 'short',
  }).format(parsed);
}

export function formatCurrency(amount: number, currency: string | null | undefined): string {
  const code = currency?.trim() || 'USD';

  try {
    return new Intl.NumberFormat(getActiveLocale(), {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${code}`;
  }
}

export function formatDistanceKm(distanceKm: number | null | undefined): string {
  if (typeof distanceKm !== 'number' || Number.isNaN(distanceKm)) {
    return 'N/A';
  }

  return `${new Intl.NumberFormat(getActiveLocale(), {
    maximumFractionDigits: 1,
  }).format(distanceKm)} km`;
}

export function formatWeightKg(weightKg: number | null | undefined): string {
  if (typeof weightKg !== 'number' || Number.isNaN(weightKg)) {
    return 'N/A';
  }

  return `${new Intl.NumberFormat(getActiveLocale(), {
    maximumFractionDigits: 1,
  }).format(weightKg)} kg`;
}

export function formatDimensionCm(valueCm: number | null | undefined): string {
  if (typeof valueCm !== 'number' || Number.isNaN(valueCm)) {
    return 'N/A';
  }

  return `${new Intl.NumberFormat(getActiveLocale(), {
    maximumFractionDigits: 1,
  }).format(valueCm)} cm`;
}
