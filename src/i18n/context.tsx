'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { LocaleCode, DEFAULT_LOCALE, SUPPORTED_LOCALES, TranslationSchema } from './types';

import en from './locales/en.json';
import es from './locales/es.json';
import pt from './locales/pt.json';
import zh from './locales/zh.json';
import id from './locales/id.json';
import th from './locales/th.json';
import vi from './locales/vi.json';

const translations: Record<LocaleCode, TranslationSchema> = {
  en: en as TranslationSchema,
  es: es as TranslationSchema,
  pt: pt as TranslationSchema,
  zh: zh as TranslationSchema,
  id: id as TranslationSchema,
  th: th as TranslationSchema,
  vi: vi as TranslationSchema,
};

interface I18nContextType {
  locale: LocaleCode;
  setLocale: (code: LocaleCode) => void;
  t: TranslationSchema;
  formatOdds: (val: number | null | undefined) => string;
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
        const navLang = navigator.language.toLowerCase();
        if (navLang.startsWith('es')) setLocaleState('es');
        else if (navLang.startsWith('pt')) setLocaleState('pt');
        else if (navLang.startsWith('zh')) setLocaleState('zh');
        else if (navLang.startsWith('id')) setLocaleState('id');
        else if (navLang.startsWith('th')) setLocaleState('th');
        else if (navLang.startsWith('vi')) setLocaleState('vi');
        else setLocaleState('en');
      }
    } catch {
      // Ignore
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

  const formatOdds = (val: number | null | undefined): string => {
    if (val === null || val === undefined || !Number.isFinite(val) || val <= 1.0) {
      return '—';
    }
    return val.toFixed(2);
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
    return `${prefix}${edge.toFixed(1)}%`;
  };

  const formatDate = (dateIso: string): string => {
    try {
      const d = new Date(dateIso);
      return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : (locale === 'id' ? 'id-ID' : locale), {
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
      return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : (locale === 'id' ? 'id-ID' : locale), {
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
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
};
