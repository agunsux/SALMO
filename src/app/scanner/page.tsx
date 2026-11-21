'use client';

import React, { useState, useEffect } from 'react';
import { TerminalLayout } from '@/components/terminal/TerminalLayout';
import { MatchMatrixTable } from '@/components/terminal/MatchMatrixTable';
import { MatchDeepDiveDrawer } from '@/components/terminal/MatchDeepDiveDrawer';
import { MatchIntelligence } from '@/types';
import { useI18n } from '@/i18n/context';
import { useEntitlements } from '@/hooks/useEntitlements';
import { Zap, Sparkles, Filter, ShieldCheck } from 'lucide-react';

export default function ValueScannerPage() {
  const { t } = useI18n();
  const { canViewMatch, unlockMatch, creditsBalance } = useEntitlements();

  const [matches, setMatches] = useState<MatchIntelligence[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLeague, setSelectedLeague] = useState('ALL');
  const [selectedDate, setSelectedDate] = useState('ALL');
  const [minEvPct, setMinEvPct] = useState<number>(2.0);

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
      .catch((err) => console.error('Failed to load scanner matches:', err))
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

  // Filter for +EV opportunities
  const valueMatches = matches.filter((m) => {
    const ahEv = m.markets?.asianHandicap?.expectedValuePct ?? 0;
    const ouEv = m.markets?.overUnder?.expectedValuePct ?? 0;
    const maxEv = Math.max(ahEv, ouEv);

    if (maxEv < minEvPct) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchText = `${m.homeTeam} ${m.awayTeam} ${m.league}`.toLowerCase();
      if (!matchText.includes(q)) return false;
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
        {/* Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-terminal-border pb-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-terminal-accentEmerald font-semibold">
              <Zap className="h-3.5 w-3.5" />
              <span>ALGORITHMIC VALUE SCANNER • POSITIVE EXPECTATION (+EV)</span>
            </div>
            <h1 className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-terminal-textPrimary">
              +EV Pre-Match Scanner
            </h1>
            <p className="mt-0.5 text-xs text-terminal-textSecondary">
              Real-time discrepancy detection between soft bookmakers and devigged sharp benchmark prices.
            </p>
          </div>

          {/* Min EV Filter Buttons */}
          <div className="flex items-center gap-1.5 rounded-lg border border-terminal-border bg-terminal-card p-1 text-xs font-mono">
            <span className="text-[10px] text-terminal-textMuted px-2">Min EV:</span>
            {[1.0, 2.0, 3.0, 5.0].map((val) => (
              <button
                key={val}
                onClick={() => setMinEvPct(val)}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                  minEvPct === val
                    ? 'bg-terminal-accentEmerald text-black shadow-xs'
                    : 'text-terminal-textMuted hover:text-terminal-textPrimary hover:bg-terminal-panel'
                }`}
              >
                &ge; +{val}%
              </button>
            ))}
          </div>
        </div>

        {/* Status Callout */}
        <div className="rounded-lg border border-terminal-accentEmerald/20 bg-terminal-accentEmerald/5 p-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-terminal-accentEmerald" />
            <span className="text-terminal-textPrimary font-medium">
              Found <strong className="text-terminal-accentEmerald font-mono">{valueMatches.length}</strong> fixtures meeting or exceeding +{minEvPct}% EV threshold.
            </span>
          </div>
          <span className="text-[10px] font-mono text-terminal-textMuted hidden sm:inline">
            Updated in live session
          </span>
        </div>

        {/* Matrix Table */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-terminal-accentEmerald border-t-transparent" />
            <p className="mt-3 text-xs font-mono text-terminal-textMuted">
              Scanning order books across Asian Handicap & Over/Under...
            </p>
          </div>
        ) : (
          <MatchMatrixTable
            matches={valueMatches}
            activeMarket="ALL"
            onInspectMatch={handleInspectMatch}
            canViewMatch={canViewMatch}
            onUnlockClick={handleUnlockMatch}
          />
        )}
      </div>

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
