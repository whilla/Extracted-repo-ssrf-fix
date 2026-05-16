'use client';

import { useState, useRef, useEffect } from 'react';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { localeConfigs, SupportedLocale } from '@/lib/i18n';
import { ChevronDown, Globe } from 'lucide-react';

export function LanguageSwitcher() {
  const { locale, setLocale, supportedLocales } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (code: SupportedLocale) => {
    setLocale(code);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-border bg-background/50 hover:bg-muted/50 transition-colors"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <Globe className="w-4 h-4" />
        <span>{localeConfigs[locale].nativeName}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-48 rounded-lg border border-border bg-popover shadow-lg z-50 overflow-hidden"
          role="listbox"
        >
          {supportedLocales.map((code) => {
            const config = localeConfigs[code];
            const isActive = code === locale;
            return (
              <button
                key={code}
                onClick={() => handleSelect(code)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-muted/50'
                }`}
                role="option"
                aria-selected={isActive}
              >
                <span className="flex-1">{config.nativeName}</span>
                <span className="text-xs text-muted-foreground">{config.name}</span>
                {isActive && (
                  <span className="w-2 h-2 rounded-full bg-[var(--nexus-cyan)]" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
