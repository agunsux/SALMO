'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Calendar,
  Target,
  TrendingUp,
  Percent,
  Zap,
  ShieldCheck,
  CreditCard,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Globe,
  Coins,
  X
} from 'lucide-react';
import { useI18n } from '@/i18n/context';
import { useTheme } from '@/theme/context';
import { useEntitlements } from '@/hooks/useEntitlements';
import { SUPPORTED_LOCALES, LocaleCode } from '@/i18n/types';

interface TerminalSidebarProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const TerminalSidebar: React.FC<TerminalSidebarProps> = ({
  mobileOpen = false,
  onCloseMobile
}) => {
  const pathname = usePathname();
  const { t, locale, setLocale } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const { isPro, isWeekendPassActive, creditsBalance, remainingFreeToday, isMonetizationActive } = useEntitlements();

  const [collapsed, setCollapsed] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);

  const navItems = [
    {
      group: 'MARKETS',
      items: [
        { label: t.nav.todaySlate, href: '/', icon: Calendar },
        { label: t.nav.asianHandicap, href: '/asian-handicap', icon: Target },
        { label: t.nav.overUnder, href: '/over-under', icon: TrendingUp },
        { label: t.nav.moneyline, href: '/moneyline', icon: Percent },
      ]
    },
    {
      group: 'ANALYTICS & AUDIT',
      items: [
        { label: t.nav.valueScanner, href: '/scanner', icon: Zap },
        { label: t.nav.publicLedger, href: '/ledger', icon: ShieldCheck },
      ]
    },
    {
      group: 'ACCOUNT & SYSTEM',
      items: [
        { label: t.nav.pricing, href: '/pricing', icon: CreditCard },
        { label: t.nav.methodology, href: '/methodology', icon: BookOpen },
      ]
    }
  ];

  const renderNavLinks = (isMobile = false) => (
    <div className="space-y-6">
      {navItems.map((group, gIdx) => (
        <div key={gIdx} className="space-y-1">
          {(!collapsed || isMobile) && (
            <div className="px-3 text-[10px] font-bold tracking-wider uppercase text-terminal-textMuted select-none">
              {group.group}
            </div>
          )}
          <nav className="space-y-0.5">
            {group.items.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => isMobile && onCloseMobile && onCloseMobile()}
                  title={collapsed && !isMobile ? item.label : undefined}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-xs font-medium transition-all group ${
                    isActive
                      ? 'bg-terminal-elevated text-terminal-accentEmerald font-semibold shadow-sm border-l-2 border-terminal-accentEmerald'
                      : 'text-terminal-textSecondary hover:bg-terminal-elevated/60 hover:text-terminal-textPrimary'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 transition-colors ${
                      isActive
                        ? 'text-terminal-accentEmerald'
                        : 'text-terminal-textMuted group-hover:text-terminal-textPrimary'
                    }`}
                  />
                  {(!collapsed || isMobile) && (
                    <span className="truncate">{item.label}</span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      ))}
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside
        className={`hidden md:flex flex-col justify-between shrink-0 h-screen sticky top-0 border-r border-terminal-border bg-terminal-card transition-all duration-200 z-30 ${
          collapsed ? 'w-[72px]' : 'w-60'
        }`}
      >
        {/* Top Brand Header */}
        <div>
          <div className="flex h-14 items-center justify-between border-b border-terminal-border px-3.5">
            <Link href="/" className="flex items-center gap-2 overflow-hidden">
              <div className="h-7 w-7 rounded bg-terminal-accentEmerald flex items-center justify-center font-mono font-bold text-black text-sm shrink-0">
                S
              </div>
              {!collapsed && (
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold tracking-wider text-terminal-textPrimary text-sm font-mono">
                      SALMO
                    </span>
                    <span className="rounded bg-terminal-accentEmerald/20 border border-terminal-accentEmerald/40 px-1 py-0.2 text-[9px] font-bold text-terminal-accentEmerald">
                      QUANT
                    </span>
                  </div>
                  <span className="text-[10px] text-terminal-textMuted truncate">
                    Pre-Match Terminal
                  </span>
                </div>
              )}
            </Link>

            <button
              onClick={() => setCollapsed(!collapsed)}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="p-1 rounded text-terminal-textMuted hover:text-terminal-textPrimary hover:bg-terminal-elevated transition-colors"
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>

          {/* Navigation Links List */}
          <div className="p-3 overflow-y-auto max-h-[calc(100vh-180px)]">
            {renderNavLinks(false)}
          </div>
        </div>

        {/* Bottom Utility & Account Status Area */}
        <div className="border-t border-terminal-border p-3 space-y-2 bg-terminal-card">
          {/* User Quota / Entitlement Indicator */}
          {!collapsed ? (
            <div className="rounded border border-terminal-border bg-terminal-panel p-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-terminal-textSecondary">
                  {isPro ? 'PRO SUBSCRIBER' : isWeekendPassActive ? 'WEEKEND PASS' : 'SCOUT (FREE)'}
                </span>
                <span className="h-2 w-2 rounded-full bg-terminal-accentEmerald animate-pulse" />
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-terminal-textMuted">
                <span className="flex items-center gap-1">
                  <Coins className="h-3 w-3 text-terminal-accentAmber" />
                  <span>Credits:</span>
                </span>
                <span className="font-tabular font-bold text-terminal-textPrimary">
                  {creditsBalance}
                </span>
              </div>
              {!isPro && !isWeekendPassActive && isMonetizationActive && (
                <div className="mt-0.5 text-[10px] text-terminal-textMuted">
                  Free left today: <span className="font-tabular text-terminal-accentEmerald">{remainingFreeToday}</span>/3
                </div>
              )}
            </div>
          ) : (
            <div className="flex justify-center" title={`Credits: ${creditsBalance}`}>
              <Coins className="h-4 w-4 text-terminal-accentAmber" />
            </div>
          )}

          {/* Quick Controls: Theme Toggle & Language Selector */}
          <div className={`flex items-center ${collapsed ? 'flex-col gap-2' : 'justify-between'} pt-1`}>
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              title={`Switch to ${theme === 'dark' ? 'Bright' : 'Dark'} mode`}
              className="p-1.5 rounded text-terminal-textMuted hover:text-terminal-textPrimary hover:bg-terminal-elevated transition-colors"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* Language Selector Dropdown */}
            <div className="relative">
              <button
                onClick={() => setLangMenuOpen(!langMenuOpen)}
                className="flex items-center gap-1 px-1.5 py-1 rounded text-xs font-mono text-terminal-textMuted hover:text-terminal-textPrimary hover:bg-terminal-elevated transition-colors"
                title="Change language"
              >
                <Globe className="h-3.5 w-3.5" />
                {!collapsed && <span className="uppercase text-[11px]">{locale}</span>}
              </button>

              {langMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setLangMenuOpen(false)} />
                  <div className="absolute bottom-8 left-0 z-50 w-44 rounded-md border border-terminal-border bg-terminal-elevated p-1 shadow-xl font-sans text-xs">
                    <div className="px-2 py-1 text-[10px] font-semibold text-terminal-textMuted uppercase border-b border-terminal-border/50 mb-1">
                      Language
                    </div>
                    {SUPPORTED_LOCALES.map((l) => (
                      <button
                        key={l.code}
                        onClick={() => {
                          setLocale(l.code as LocaleCode);
                          setLangMenuOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left transition-colors ${
                          locale === l.code
                            ? 'bg-terminal-accentEmerald/20 font-bold text-terminal-accentEmerald'
                            : 'text-terminal-textSecondary hover:bg-terminal-panel hover:text-terminal-textPrimary'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <span>{l.flag}</span>
                          <span>{l.nativeName}</span>
                        </span>
                        <span className="text-[10px] uppercase font-mono text-terminal-textMuted">
                          {l.code}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onCloseMobile}
          />
          <div className="relative w-72 max-w-[85vw] h-full bg-terminal-card border-r border-terminal-border flex flex-col justify-between p-4 z-10 shadow-2xl">
            <div>
              <div className="flex items-center justify-between border-b border-terminal-border pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded bg-terminal-accentEmerald flex items-center justify-center font-mono font-bold text-black text-xs">
                    S
                  </div>
                  <span className="font-extrabold tracking-wider text-terminal-textPrimary font-mono">
                    SALMO TERMINAL
                  </span>
                </div>
                <button
                  onClick={onCloseMobile}
                  className="p-1 rounded text-terminal-textMuted hover:text-terminal-textPrimary"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {renderNavLinks(true)}
            </div>

            <div className="border-t border-terminal-border pt-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-terminal-textMuted">Theme</span>
                <button
                  onClick={toggleTheme}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-terminal-panel text-terminal-textPrimary text-xs"
                >
                  {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                  <span className="capitalize">{theme}</span>
                </button>
              </div>

              <div className="grid grid-cols-4 gap-1 pt-1">
                {SUPPORTED_LOCALES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => {
                      setLocale(l.code as LocaleCode);
                      if (onCloseMobile) onCloseMobile();
                    }}
                    className={`py-1 rounded text-center text-xs font-mono uppercase ${
                      locale === l.code
                        ? 'bg-terminal-accentEmerald text-black font-bold'
                        : 'bg-terminal-panel text-terminal-textMuted hover:text-terminal-textPrimary'
                    }`}
                  >
                    {l.code}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Sticky Bottom Nav Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-terminal-card/95 backdrop-blur border-t border-terminal-border flex items-center justify-around px-2">
        <Link
          href="/"
          className={`flex flex-col items-center justify-center py-1 px-2 text-[10px] font-medium transition-colors ${
            pathname === '/' ? 'text-terminal-accentEmerald font-bold' : 'text-terminal-textMuted'
          }`}
        >
          <Calendar className="h-4 w-4 mb-0.5" />
          <span>{t.markets.home || 'Slate'}</span>
        </Link>

        <Link
          href="/asian-handicap"
          className={`flex flex-col items-center justify-center py-1 px-2 text-[10px] font-medium transition-colors ${
            pathname === '/asian-handicap' ? 'text-terminal-accentEmerald font-bold' : 'text-terminal-textMuted'
          }`}
        >
          <Target className="h-4 w-4 mb-0.5" />
          <span>{t.markets.ahShort || 'AH'}</span>
        </Link>

        <Link
          href="/over-under"
          className={`flex flex-col items-center justify-center py-1 px-2 text-[10px] font-medium transition-colors ${
            pathname === '/over-under' ? 'text-terminal-accentEmerald font-bold' : 'text-terminal-textMuted'
          }`}
        >
          <TrendingUp className="h-4 w-4 mb-0.5" />
          <span>{t.markets.ouShort || 'O/U'}</span>
        </Link>

        <Link
          href="/moneyline"
          className={`flex flex-col items-center justify-center py-1 px-2 text-[10px] font-medium transition-colors ${
            pathname === '/moneyline' ? 'text-terminal-accentEmerald font-bold' : 'text-terminal-textMuted'
          }`}
        >
          <Percent className="h-4 w-4 mb-0.5" />
          <span>{t.markets.mlShort || '1X2'}</span>
        </Link>

        <Link
          href="/scanner"
          className={`flex flex-col items-center justify-center py-1 px-2 text-[10px] font-medium transition-colors ${
            pathname === '/scanner' ? 'text-terminal-accentEmerald font-bold' : 'text-terminal-textMuted'
          }`}
        >
          <Zap className="h-4 w-4 mb-0.5" />
          <span>+EV</span>
        </Link>
      </nav>
    </>
  );
};
