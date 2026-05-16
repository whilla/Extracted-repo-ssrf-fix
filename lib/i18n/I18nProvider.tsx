'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { SupportedLocale, defaultLocale, supportedLocales, getDirection } from './index';
import { loadTranslations, t } from './translator';

interface I18nContextType {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  translations: Record<string, any>;
  t: (key: string, params?: Record<string, string | number>) => string;
  direction: 'ltr' | 'rtl';
  supportedLocales: readonly SupportedLocale[];
}

const I18nContext = createContext<I18nContextType | null>(null);

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}

interface I18nProviderProps {
  children: ReactNode;
  initialLocale?: SupportedLocale;
}

export function I18nProvider({ children, initialLocale }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<SupportedLocale>(initialLocale || defaultLocale);
  const [translations, setTranslations] = useState<Record<string, any>>({});
  const [direction, setDirection] = useState<'ltr' | 'rtl'>('ltr');

  const changeLocale = useCallback(async (newLocale: SupportedLocale) => {
    if (!supportedLocales.includes(newLocale)) return;
    setLocaleState(newLocale);
    setDirection(getDirection(newLocale));
    const trans = await loadTranslations(newLocale);
    setTranslations(trans);
    try {
      document.cookie = `locale=${newLocale};path=/;max-age=31536000`;
      document.documentElement.dir = getDirection(newLocale);
      document.documentElement.lang = newLocale;
    } catch {
      // Cookie access failed
    }
  }, []);

  useEffect(() => {
    void changeLocale(locale);
  }, []);

  const translate = useCallback(
    (key: string, params?: Record<string, string | number>) => t(translations, key, params),
    [translations]
  );

  return (
    <I18nContext.Provider
      value={{
        locale,
        setLocale: changeLocale,
        translations,
        t: translate,
        direction,
        supportedLocales,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}
