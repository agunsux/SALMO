'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/i18n/context';
import { useTheme } from '@/theme/context';
import { SUPPORTED_LOCALES, LocaleCode } from '@/i18n/types';
import { Globe, Sun, Moon, ShieldCheck, User } from 'lucide-react';

export const Header: React.FC = () => {
  const { locale, setLocale, t } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const [langMenuOpen, setLangMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#232830] bg-[#0B0D10]/95 backdrop-blur supports-[backdrop-filter]:bg-[#0B0D10]/80 transition-colors dark:border-[#232830] dark:bg-[#0B0D10]/95 light:border-[#DCE0E7] light:bg-[#FFFFFF]/95">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Brand & North Star */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="text-xl font-bold tracking-tight text-white dark:text-white light:text-[#14171C]">
              SALMO<span className="text-emerald-500">.</span>
            </span>
            <span className="hidden sm:inline-block rounded border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#8A93A0] dark:text-[#8A93A0] light:text-[#5A6270]">
              INTELLIGENCE
            </span>
          </Link>

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-4 text-xs font-medium text-[#8A93A0] dark:text-[#8A93A0] light:text-[#5A6270]">
            <Link href="/matches" className="hover:text-white dark:hover:text-white light:hover:text-[#14171C] transition-colors">
              Matches
            </Link>
            <Link href="/daily-picks" className="text-emerald-400 font-semibold hover:text-emerald-300 transition-colors">
              Daily Picks
            </Link>
            <Link href="/asian-handicap" className="hover:text-white dark:hover:text-white light:hover:text-[#14171C] transition-colors">
              AH
            </Link>
            <Link href="/over-under" className="hover:text-white dark:hover:text-white light:hover:text-[#14171C] transition-colors">
              Over/Under
            </Link>
            <Link href="/btts" className="hover:text-white dark:hover:text-white light:hover:text-[#14171C] transition-colors">
              BTTS
            </Link>
            <Link href="/research" className="hover:text-white dark:hover:text-white light:hover:text-[#14171C] transition-colors">
              Research
            </Link>
          </nav>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-3">
          {/* Zero fabrication pill */}
          <div className="hidden lg:flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            <span>{t.header.zeroFabrication}</span>
          </div>

          {/* Language selector */}
          <div className="relative">
            <button
              onClick={() => setLangMenuOpen(!langMenuOpen)}
              className="flex items-center gap-1.5 rounded-md border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] dark:bg-[#111418] light:bg-[#EFF1F5] px-2.5 py-1 text-xs font-semibold text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C] hover:border-[#384150] transition-colors"
              aria-label="Select Language"
            >
              <Globe className="h-3.5 w-3.5 text-[#8A93A0]" />
              <span className="uppercase">{locale}</span>
            </button>

            {langMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setLangMenuOpen(false)}
                />
                <div className="absolute right-0 mt-1.5 z-50 w-44 rounded-lg border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#171B20] dark:bg-[#171B20] light:bg-[#FFFFFF] p-1 shadow-xl">
                  {SUPPORTED_LOCALES.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => {
                        setLocale(l.code);
                        setLangMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-xs text-left transition-colors ${
                        locale === l.code
                          ? 'bg-emerald-500/10 text-emerald-400 font-semibold'
                          : 'text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C] hover:bg-[#232830] dark:hover:bg-[#232830] light:hover:bg-[#EFF1F5]'
                      }`}
                    >
                      <span>{l.nativeName}</span>
                      <span className="text-[10px] uppercase text-[#8A93A0]">{l.code}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] dark:bg-[#111418] light:bg-[#EFF1F5] text-[#8A93A0] hover:text-white dark:hover:text-white light:hover:text-[#14171C] transition-colors"
            aria-label="Toggle Theme"
          >
            {theme === 'dark' ? (
              <Sun className="h-3.5 w-3.5 text-amber-400" />
            ) : (
              <Moon className="h-3.5 w-3.5 text-slate-700" />
            )}
          </button>

          {/* Account */}
          <button
            className="hidden sm:flex items-center gap-1.5 rounded-md border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] dark:bg-[#111418] light:bg-[#EFF1F5] px-2.5 py-1 text-xs font-medium text-[#8A93A0] hover:text-white transition-colors"
          >
            <User className="h-3.5 w-3.5" />
            <span>{t.nav.account}</span>
          </button>
        </div>
      </div>
    </header>
  );
};

