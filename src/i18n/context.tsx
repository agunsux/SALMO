'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { LocaleCode, DEFAULT_LOCALE, SUPPORTED_LOCALES, TranslationDictionary } from './types';
import { translations } from './translations';

interface I18nContextType {
  locale: LocaleCode;
  setLocale: (code: LocaleCode) => void;
  t: TranslationDictionary;
  formatOdds: (odds: number | null | undefined) => string;
  formatPercent: (val: number | null | undefined, digits?: number) => string;
  formatEdge: (edge: number | null | undefined) => string;
  formatDate: (dateIso: string) => string;
  formatTime: (dateIso: string) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<LocaleCode>(DEFAULT_LOCALE);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('salmo_locale') as LocaleCode;
      if (saved && SUPPORTED_LOCALES.some(l => l.code === saved)) {
        setLocaleState(saved);
      } else {
        // Check browser language
        const navLang = navigator.language;
        const match = SUPPORTED_LOCALES.find(l => 
          navLang.startsWith(l.code) || l.code.startsWith(navLang.split('-')[0])
        );
        if (match) setLocaleState(match.code);
      }
    } catch {
      // Ignore localStorage errors (e.g. incognito)
    }
  }, []);

  const setLocale = (code: LocaleCode) => {
    setLocaleState(code);
    try {
      localStorage.setItem('salmo_locale', code);
    } catch {
      // Ignore
    }
  };

  const t = translations[locale] || translations[DEFAULT_LOCALE];

  const formatOdds = (odds: number | null | undefined): string => {
    if (odds === null || odds === undefined || !Number.isFinite(odds)) {
      return '—';
    }
    return new Intl.NumberFormat(locale === 'pt-BR' ? 'pt-BR' : 'en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(odds);
  };

  const formatPercent = (val: number | null | undefined, digits = 1): string => {
    if (val === null || val === undefined || !Number.isFinite(val)) {
      return '—';
    }
    return `${val.toFixed(digits)}%`;
  };

  const formatEdge = (edge: number | null | undefined): string => {
    if (edge === null || edge === undefined || !Number.isFinite(edge)) {
      return '—';
    }
    const prefix = edge > 0 ? '+' : '';
    return `${prefix}${edge.toFixed(1)} pp`;
  };

  const formatDate = (dateIso: string): string => {
    try {
      const d = new Date(dateIso);
      return new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }).format(d);
    } catch {
      return dateIso;
    }
  };

  const formatTime = (dateIso: string): string => {
    try {
      const d = new Date(dateIso);
      return new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(d);
    } catch {
      return '';
    }
  };

  return (
    <I18nContext.Provider
      value={{
        locale,
        setLocale,
        t,
        formatOdds,
        formatPercent,
        formatEdge,
        formatDate,
        formatTime,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return ctx;
};
