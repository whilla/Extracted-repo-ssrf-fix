// Translation utilities for NexusAI
import { SupportedLocale, defaultLocale } from './index';

// Translation cache
const translationCache: Record<string, Record<string, any>> = {};

/**
 * Load translations for a locale
 */
export async function loadTranslations(locale: SupportedLocale): Promise<Record<string, any>> {
  if (translationCache[locale]) {
    return translationCache[locale];
  }

  try {
    const module = await import(`./locales/${locale}.json`);
    translationCache[locale] = module.default;
    return module.default;
  } catch {
    // Fallback to default locale
    if (locale !== defaultLocale) {
      return loadTranslations(defaultLocale);
    }
    return {};
  }
}

/**
 * Get a translation by key
 */
export function t(
  translations: Record<string, any>,
  key: string,
  params?: Record<string, string | number>
): string {
  const keys = key.split('.');
  let value: any = translations;

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      // Key not found, return the key itself
      return key;
    }
  }

  if (typeof value !== 'string') {
    return key;
  }

  // Replace parameters
  if (params) {
    return Object.entries(params).reduce(
      (str, [param, replacement]) => str.replace(`{{${param}}}`, String(replacement)),
      value
    );
  }

  return value;
}

/**
 * Create a translation function for a specific locale
 */
export async function createTranslator(locale: SupportedLocale) {
  const translations = await loadTranslations(locale);
  
  return (key: string, params?: Record<string, string | number>) => 
    t(translations, key, params);
}
