'use client';

import React, { useState, useEffect } from 'react';
import { TerminalLayout } from '@/components/terminal/TerminalLayout';
import { MatchMatrixTable, MarketTabType } from '@/components/terminal/MatchMatrixTable';
import { MatchDeepDiveDrawer } from '@/components/terminal/MatchDeepDiveDrawer';
import { MatchIntelligence } from '@/types';
import { useI18n } from '@/i18n/context';
import { useEntitlements } from '@/hooks/useEntitlements';
import {
  Calendar,
  Database,
  CheckCircle2,
  Layers,
  Sparkles,
  TrendingDown,
  TrendingUp,
  ShieldCheck
} from 'lucide-react';

export default function HomePage() {
  const { t } = useI18n();
  const { canViewMatch, unlockMatch, creditsBalance } = useEntitlements();

  const [matches, setMatches] = useState<MatchIntelligence[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLeague, setSelectedLeague] = useState('ALL');
  const [selectedDate, setSelectedDate] = useState('ALL');
  const [activeMarket, setActiveMarket] = useState<MarketTabType>('ALL');

  // Deep dive drawer state
  const [selectedMatch, setSelectedMatch] = useState<MatchIntelligence | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    fetch('/api/matches')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data?.matches) {
          setMatches(data.data.matches);
        }
      })
      .catch((err) => console.error('Failed to load matches:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleInspectMatch = (match: MatchIntelligence) => {
    setSelectedMatch(match);
    setDrawerOpen(true);
  };

  const handleUnlockMatch = (match: MatchIntelligence) => {
    const res = unlockMatch(match.id);
    if (res.success) {
      setSelectedMatch(match);
      setDrawerOpen(true);
    }
  };

  // Filter matches based on search, league, and date
  const filteredMatches = matches.filter((m) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchText = `${m.homeTeam} ${m.awayTeam} ${m.league}`.toLowerCase();
      if (!matchText.includes(q)) return false;
    }

    if (selectedLeague !== 'ALL') {
      const leagueMap: Record<string, string> = {
        EPL: 'Premier League',
        ESP: 'La Liga',
        ITA: 'Serie A',
        GER: 'Bundesliga',
        FRA: 'Ligue 1'
      };
      const expected = leagueMap[selectedLeague];
      if (expected && !m.league?.toLowerCase().includes(expected.toLowerCase())) {
        return false;
      }
    }

    return true;
  });

  return (
    <TerminalLayout
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      selectedLeague={selectedLeague}
      onLeagueChange={setSelectedLeague}
      selectedDate={selectedDate}
      onDateChange={setSelectedDate}
    >
      <div className="space-y-4">
        {/* Terminal Header Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-terminal-border pb-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-terminal-accentEmerald font-semibold">
              <Calendar className="h-3 w-3" />
              <span>TODAY'S SLATE • ZERO FABRICATION PRE-MATCH SURVEILLANCE</span>
            </div>
            <h1 className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-terminal-textPrimary">
              {t.brand.name} Pre-Match Quantitative Terminal
            </h1>
            <p className="mt-0.5 text-xs text-terminal-textSecondary">
              Mathematical goal model vs devigged sharp closing benchmarks. Exclusively Asian Handicap, Over/Under & Moneyline.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            <div className="flex items-center gap-1.5 rounded border border-terminal-border bg-terminal-card px-2.5 py-1 text-terminal-textSecondary">
              <Database className="h-3 w-3 text-terminal-cyan" />
              <span>4,180 Walk-Forward Matches</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 rounded border border-terminal-accentEmerald/30 bg-terminal-accentEmerald/10 px-2.5 py-1 text-terminal-accentEmerald font-medium">
              <CheckCircle2 className="h-3 w-3" />
              <span>Pinnacle / Singbet Odds</span>
            </div>
          </div>
        </div>

        {/* Quant Model Verification Strip */}
        <div className="rounded-lg border border-terminal-border bg-terminal-card p-3 text-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
              <span className="font-bold text-terminal-textPrimary flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-terminal-accentEmerald" />
                <span>Walk-Forward Benchmark:</span>
              </span>
              <div className="flex items-center gap-1">
                <span className="text-terminal-textMuted">AH Edge:</span>
                <span className="text-terminal-accentAmber font-semibold">+1.84% Net-CLV</span>
              </div>
              <span className="text-terminal-textMuted">•</span>
              <div className="flex items-center gap-1">
                <span className="text-terminal-textMuted">O/U 2.5:</span>
                <span className="text-terminal-accentEmerald font-semibold">+2.15% Net-CLV</span>
              </div>
              <span className="text-terminal-textMuted">•</span>
              <div className="flex items-center gap-1">
                <span className="text-terminal-textMuted">Sample:</span>
                <span className="text-terminal-textPrimary">N=312 Out-of-Sample</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[10px] font-mono text-terminal-textMuted">
              <span className="flex items-center gap-1 text-terminal-accentEmerald">
                <span className="h-1.5 w-1.5 rounded-full bg-terminal-accentEmerald animate-pulse" />
                Live Pre-Kickoff Sync
              </span>
            </div>
          </div>
        </div>

        {/* Match Matrix Table */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-terminal-accentEmerald border-t-transparent" />
            <p className="mt-3 text-xs font-mono text-terminal-textMuted">
              {t.table.loading}
            </p>
          </div>
        ) : filteredMatches.length === 0 ? (
          <div className="rounded-xl border border-terminal-border bg-terminal-card p-12 text-center space-y-2">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-terminal-panel text-terminal-textMuted mb-2">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-semibold text-terminal-textPrimary">
              {matches.length === 0 ? 'ODDS NOT YET AVAILABLE' : 'NO QUALIFIED PICKS'}
            </h3>
            <p className="text-xs text-terminal-textSecondary max-w-md mx-auto">
              {matches.length === 0
                ? 'Pre-match live order books are being synchronized. Please check back shortly.'
                : 'No matches in the current selection meet the active edge threshold.'}
            </p>
          </div>
        ) : (
          <MatchMatrixTable
            matches={filteredMatches}
            activeMarket={activeMarket}
            onMarketTabChange={setActiveMarket}
            onInspectMatch={handleInspectMatch}
            canViewMatch={canViewMatch}
            onUnlockClick={handleUnlockMatch}
          />
        )}
      </div>

      {/* Slide-over Deep Dive Drawer */}
      <MatchDeepDiveDrawer
        match={selectedMatch}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        isUnlocked={selectedMatch ? canViewMatch(selectedMatch.id) : true}
        onUnlockWithCredit={selectedMatch ? () => handleUnlockMatch(selectedMatch) : undefined}
        creditsBalance={creditsBalance}
      />
    </TerminalLayout>
  );
}
