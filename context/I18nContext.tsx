'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { SupportedLocale, defaultLocale, getDirection } from '@/lib/i18n';
import { loadTranslations, t as translate } from '@/lib/i18n/translator';

interface I18nContextType {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  direction: 'ltr' | 'rtl';
  translations: Record<string, any>;
}

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children, initialLocale = defaultLocale }: { children: ReactNode; initialLocale?: SupportedLocale }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(initialLocale);
  const [translations, setTranslations] = useState<Record<string, any>>({});

  useEffect(() => {
    loadTranslations(locale).then(setTranslations);
    
    // Set document direction
    document.documentElement.dir = getDirection(locale);
    document.documentElement.lang = locale;
    
    // Store locale preference
    document.cookie = `locale=${locale};path=/;max-age=31536000`;
  }, [locale]);

  const setLocale = (newLocale: SupportedLocale) => {
    setLocaleState(newLocale);
  };

  const t = (key: string, params?: Record<string, string | number>) => {
    return translate(translations, key, params);
  };

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, direction: getDirection(locale), translations }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
