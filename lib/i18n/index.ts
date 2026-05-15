// i18n configuration for NexusAI
import { cookies } from 'next/headers';

export const supportedLocales = ['en', 'es', 'fr', 'de', 'pt', 'ja', 'zh', 'ko', 'ar', 'hi'] as const;
export type SupportedLocale = (typeof supportedLocales)[number];
export const defaultLocale: SupportedLocale = 'en';

export interface LocaleConfig {
  code: SupportedLocale;
  name: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
}

export const localeConfigs: Record<SupportedLocale, LocaleConfig> = {
  en: { code: 'en', name: 'English', nativeName: 'English', direction: 'ltr' },
  es: { code: 'es', name: 'Spanish', nativeName: 'Español', direction: 'ltr' },
  fr: { code: 'fr', name: 'French', nativeName: 'Français', direction: 'ltr' },
  de: { code: 'de', name: 'German', nativeName: 'Deutsch', direction: 'ltr' },
  pt: { code: 'pt', name: 'Portuguese', nativeName: 'Português', direction: 'ltr' },
  ja: { code: 'ja', name: 'Japanese', nativeName: '日本語', direction: 'ltr' },
  zh: { code: 'zh', name: 'Chinese', nativeName: '中文', direction: 'ltr' },
  ko: { code: 'ko', name: 'Korean', nativeName: '한국어', direction: 'ltr' },
  ar: { code: 'ar', name: 'Arabic', nativeName: 'العربية', direction: 'rtl' },
  hi: { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', direction: 'ltr' },
};

export async function getLocale(): Promise<SupportedLocale> {
  try {
    const cookieStore = await cookies();
    const localeCookie = cookieStore.get('locale');
    const locale = localeCookie?.value as SupportedLocale | undefined;
    
    if (locale && supportedLocales.includes(locale)) {
      return locale;
    }
  } catch {
    // Cookie access failed, use default
  }
  
  return defaultLocale;
}

export async function setLocale(locale: SupportedLocale): Promise<void> {
  if (!supportedLocales.includes(locale)) {
    throw new Error(`Unsupported locale: ${locale}`);
  }
  
  try {
    const cookieStore = await cookies();
    cookieStore.set('locale', locale, {
      maxAge: 365 * 24 * 60 * 60, // 1 year
      path: '/',
    });
  } catch (error) {
    console.error('Failed to set locale:', error);
  }
}

export function getDirection(locale: SupportedLocale): 'ltr' | 'rtl' {
  return localeConfigs[locale]?.direction || 'ltr';
}
