'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Search,
  SlidersHorizontal,
  Menu,
  ShieldCheck,
  Zap,
  Globe,
  ChevronDown
} from 'lucide-react';
import { useI18n } from '@/i18n/context';
import { useOddsFormat, OddsFormat } from '@/components/terminal/OddsFormatContext';
import { useEntitlements } from '@/hooks/useEntitlements';

interface TopUtilityBarProps {
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  selectedLeague?: string;
  onLeagueChange?: (league: string) => void;
  selectedDate?: string;
  onDateChange?: (date: string) => void;
  onToggleMobileMenu?: () => void;
  showFilters?: boolean;
}

export const LEAGUES = [
  { id: 'ALL', name: 'All Competitions' },
  { id: 'EPL', name: 'Premier League' },
  { id: 'ESP', name: 'La Liga' },
  { id: 'ITA', name: 'Serie A' },
  { id: 'GER', name: 'Bundesliga' },
  { id: 'FRA', name: 'Ligue 1' }
];

export const DATE_PRESETS = [
  { id: 'ALL', label: 'All Dates' },
  { id: 'TODAY', label: 'Today' },
  { id: 'TOMORROW', label: 'Tomorrow' },
  { id: 'WEEKEND', label: 'Weekend' }
];

const ODDS_FORMATS: { id: OddsFormat; label: string; short: string }[] = [
  { id: 'decimal', label: 'Decimal', short: 'DEC' },
  { id: 'american', label: 'American', short: 'AMER' },
  { id: 'hongKong', label: 'Hong Kong', short: 'HK' },
  { id: 'malay', label: 'Malay', short: 'MY' }
];

export const TopUtilityBar: React.FC<TopUtilityBarProps> = ({
  searchQuery = '',
  onSearchChange,
  selectedLeague = 'ALL',
  onLeagueChange,
  selectedDate = 'ALL',
  onDateChange,
  onToggleMobileMenu,
  showFilters = true
}) => {
  const { t } = useI18n();
  const { oddsFormat, setOddsFormat } = useOddsFormat();
  const { isPro } = useEntitlements();

  const [oddsMenuOpen, setOddsMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 h-14 border-b border-terminal-border bg-terminal-card/95 backdrop-blur px-3 sm:px-6 flex items-center justify-between gap-3">
      {/* Left Area: Mobile Menu Button + Search Input */}
      <div className="flex items-center gap-3 flex-1 max-w-xl">
        <button
          onClick={onToggleMobileMenu}
          className="md:hidden p-1.5 rounded text-terminal-textMuted hover:text-terminal-textPrimary hover:bg-terminal-elevated"
          aria-label="Open Navigation Menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {showFilters && onSearchChange && (
          <div className="relative w-full max-w-xs sm:max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-terminal-textMuted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t.filters.searchPlaceholder || 'Search team, league, or fixture...'}
              className="w-full h-8 pl-8 pr-3 text-xs rounded border border-terminal-border bg-terminal-panel text-terminal-textPrimary placeholder-terminal-textMuted focus:outline-none focus:border-terminal-accentEmerald transition-colors"
            />
          </div>
        )}

        {/* Desktop Quick League Filter */}
        {showFilters && onLeagueChange && (
          <div className="hidden lg:flex items-center gap-1">
            {LEAGUES.map((l) => (
              <button
                key={l.id}
                onClick={() => onLeagueChange(l.id)}
                className={`px-2 py-1 text-[11px] rounded font-medium transition-colors ${
                  selectedLeague === l.id
                    ? 'bg-terminal-elevated text-terminal-accentEmerald font-bold border border-terminal-accentEmerald/30'
                    : 'text-terminal-textMuted hover:text-terminal-textPrimary hover:bg-terminal-panel'
                }`}
              >
                {l.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right Controls: Odds Format Selector & Upgrade Link */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Zero Fabrication Trust Badge */}
        <div className="hidden xl:flex items-center gap-1.5 px-2 py-0.5 rounded border border-terminal-accentEmerald/30 bg-terminal-accentEmerald/10 text-[10px] font-mono text-terminal-accentEmerald">
          <ShieldCheck className="h-3 w-3" />
          <span>ZERO FABRICATION</span>
        </div>

        {/* Date Filter Pills */}
        {showFilters && onDateChange && (
          <div className="hidden sm:flex items-center rounded border border-terminal-border bg-terminal-panel p-0.5 text-xs">
            {DATE_PRESETS.map((d) => (
              <button
                key={d.id}
                onClick={() => onDateChange(d.id)}
                className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                  selectedDate === d.id
                    ? 'bg-terminal-card text-terminal-textPrimary font-semibold shadow-xs'
                    : 'text-terminal-textMuted hover:text-terminal-textPrimary'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        )}

        {/* Odds Format Switcher Dropdown */}
        <div className="relative">
          <button
            onClick={() => setOddsMenuOpen(!oddsMenuOpen)}
            className="flex items-center gap-1 px-2 py-1 rounded border border-terminal-border bg-terminal-panel text-xs font-mono text-terminal-textPrimary hover:bg-terminal-elevated transition-colors"
            title="Odds format"
          >
            <span className="text-[10px] text-terminal-textMuted">ODDS:</span>
            <span className="font-bold text-terminal-accentEmerald uppercase">
              {ODDS_FORMATS.find((f) => f.id === oddsFormat)?.short || 'DEC'}
            </span>
            <ChevronDown className="h-3 w-3 text-terminal-textMuted ml-0.5" />
          </button>

          {oddsMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOddsMenuOpen(false)} />
              <div className="absolute right-0 mt-1 z-50 w-36 rounded-md border border-terminal-border bg-terminal-elevated p-1 shadow-xl font-sans text-xs">
                <div className="px-2 py-1 text-[10px] font-semibold text-terminal-textMuted uppercase border-b border-terminal-border/50 mb-1">
                  Format
                </div>
                {ODDS_FORMATS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      setOddsFormat(f.id);
                      setOddsMenuOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded px-2.5 py-1 text-left transition-colors ${
                      oddsFormat === f.id
                        ? 'bg-terminal-accentEmerald/20 font-bold text-terminal-accentEmerald'
                        : 'text-terminal-textSecondary hover:bg-terminal-panel hover:text-terminal-textPrimary'
                    }`}
                  >
                    <span>{f.label}</span>
                    <span className="font-mono text-[10px] text-terminal-textMuted">{f.short}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Pro / Pricing CTA Button */}
        {!isPro && (
          <Link
            href="/pricing"
            className="hidden sm:inline-flex items-center gap-1 rounded bg-terminal-accentEmerald px-2.5 py-1 text-xs font-bold text-black hover:bg-terminal-accentEmerald/90 transition-colors shadow-xs"
          >
            <Zap className="h-3 w-3 fill-black" />
            <span>PRO</span>
          </Link>
        )}
      </div>
    </header>
  );
};
