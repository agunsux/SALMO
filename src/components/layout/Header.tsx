'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthContext';
import { useI18n } from '@/i18n/context';
import { useTheme } from '@/theme/context';
import { SUPPORTED_LOCALES } from '@/i18n/types';
import { Globe, Sun, Moon, ShieldCheck, User, LogOut, Menu, X, ArrowRight } from 'lucide-react';

export const Header: React.FC = () => {
  const { user, signOut } = useAuth();
  const { locale, setLocale, t } = useI18n();
  const { theme, toggleTheme } = useTheme();

  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#E4DED4] bg-[#F6F3EE]/95 backdrop-blur supports-[backdrop-filter]:bg-[#F6F3EE]/85 transition-colors">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Brand Wordmark & Tagline */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-1.5 group">
            <span className="font-serif text-2xl font-bold tracking-tight text-[#14110F] group-hover:text-[#3B1515] transition-colors">
              SALMO
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-[#E8664A] -mb-2"></span>
          </Link>

          {/* Institutional Numbered Nav */}
          <nav className="hidden md:flex items-center gap-5 text-xs font-mono text-[#6B645C]">
            <Link
              href="/research"
              className="hover:text-[#14110F] transition-colors flex items-center gap-1"
            >
              <span className="text-[#9E968D]">01</span>
              <span>Research</span>
            </Link>

            <Link
              href="/picks"
              className="hover:text-[#14110F] transition-colors flex items-center gap-1"
            >
              <span className="text-[#9E968D]">02</span>
              <span>Picks</span>
            </Link>

            <Link
              href="/matches"
              className="hover:text-[#14110F] transition-colors flex items-center gap-1"
            >
              <span className="text-[#9E968D]">03</span>
              <span>Matches</span>
            </Link>

            <Link
              href="/performance"
              className="hover:text-[#14110F] transition-colors flex items-center gap-1"
            >
              <span className="text-[#9E968D]">04</span>
              <span>Ledger</span>
            </Link>

            <Link
              href="/blog"
              className="hover:text-[#14110F] transition-colors flex items-center gap-1"
            >
              <span className="text-[#9E968D]">05</span>
              <span>Blog</span>
            </Link>

            <Link
              href="/faq"
              className="hover:text-[#14110F] transition-colors flex items-center gap-1"
            >
              <span className="text-[#9E968D]">06</span>
              <span>FAQ</span>
            </Link>
          </nav>
        </div>

        {/* Right Actions & Controls */}
        <div className="flex items-center gap-3">
          {/* Zero fabrication pill */}
          <div className="hidden lg:flex items-center gap-1.5 rounded-full border border-[#BFE7CA] bg-[#EAF7EE] px-2.5 py-0.5 text-[11px] font-mono text-[#137333]">
            <ShieldCheck className="h-3 w-3 text-[#1E8E3E]" />
            <span>Zero fabrication</span>
          </div>

          {/* Language selector */}
          <div className="relative">
            <button
              onClick={() => setLangMenuOpen(!langMenuOpen)}
              className="flex items-center gap-1.5 rounded-md border border-[#E4DED4] bg-white px-2 py-1 text-xs font-mono text-[#14110F] hover:border-[#3B1515] transition-colors"
              aria-label="Select Language"
            >
              <Globe className="h-3 w-3 text-[#6B645C]" />
              <span className="uppercase">{locale}</span>
            </button>

            {langMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setLangMenuOpen(false)} />
                <div className="absolute right-0 mt-1.5 z-50 w-40 rounded-md border border-[#E4DED4] bg-white p-1 shadow-md font-sans text-xs">
                  {SUPPORTED_LOCALES.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => {
                        setLocale(l.code);
                        setLangMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left transition-colors ${
                        locale === l.code
                          ? 'bg-[#F6F3EE] font-semibold text-[#3B1515]'
                          : 'text-[#14110F] hover:bg-[#F6F3EE]'
                      }`}
                    >
                      <span>{l.nativeName}</span>
                      <span className="text-[10px] uppercase font-mono text-[#6B645C]">{l.code}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Authentication Actions */}
          {user ? (
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard"
                className="hidden sm:inline-flex items-center gap-1.5 rounded-md bg-[#3B1515] px-3 py-1.5 text-xs font-mono font-medium text-white hover:bg-[#2A0E0E] transition-colors"
              >
                <User className="h-3 w-3" />
                <span>Dashboard</span>
              </Link>
              <button
                onClick={() => signOut()}
                aria-label="Sign out"
                className="p-1.5 rounded-md border border-[#E4DED4] bg-white text-[#6B645C] hover:text-[#C5221F] hover:border-[#FAD2CF] transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="hidden sm:inline-block text-xs font-mono font-semibold text-[#14110F] hover:text-[#3B1515] px-2 py-1 transition-colors"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center gap-1.5 rounded-md bg-[#3B1515] px-3 py-1.5 text-xs font-mono font-semibold text-white hover:bg-[#2A0E0E] transition-colors shadow-sm"
              >
                <span>Create account</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )}

          {/* Mobile hamburger menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            className="md:hidden p-1.5 rounded-md border border-[#E4DED4] bg-white text-[#14110F]"
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-[#E4DED4] bg-white p-4 space-y-3 font-mono text-xs">
          <Link
            href="/research"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-1 text-[#14110F] hover:text-[#3B1515]"
          >
            01 Research
          </Link>
          <Link
            href="/picks"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-1 text-[#14110F] hover:text-[#3B1515]"
          >
            02 Picks
          </Link>
          <Link
            href="/matches"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-1 text-[#14110F] hover:text-[#3B1515]"
          >
            03 Matches
          </Link>
          <Link
            href="/performance"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-1 text-[#14110F] hover:text-[#3B1515]"
          >
            04 Ledger
          </Link>
          <Link
            href="/blog"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-1 text-[#14110F] hover:text-[#3B1515]"
          >
            05 Blog
          </Link>
          <Link
            href="/faq"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-1 text-[#14110F] hover:text-[#3B1515]"
          >
            06 FAQ
          </Link>
          <div className="pt-3 border-t border-[#EDE8E0] flex items-center justify-between">
            {user ? (
              <div className="flex items-center justify-between w-full">
                <Link
                  href="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="font-semibold text-[#3B1515]"
                >
                  Dashboard ({user.email?.split('@')[0]})
                </Link>
                <button onClick={() => signOut()} className="text-[#C5221F]">
                  Sign out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 w-full justify-between">
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="font-semibold text-[#14110F]"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-md bg-[#3B1515] px-3 py-1.5 text-white font-semibold"
                >
                  Create account
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
