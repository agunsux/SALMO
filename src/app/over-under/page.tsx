'use client';

import React, { useState, useEffect } from 'react';
import { TerminalLayout } from '@/components/terminal/TerminalLayout';
import { MatchMatrixTable } from '@/components/terminal/MatchMatrixTable';
import { MatchDeepDiveDrawer } from '@/components/terminal/MatchDeepDiveDrawer';
import { MatchIntelligence } from '@/types';
import { useI18n } from '@/i18n/context';
import { useEntitlements } from '@/hooks/useEntitlements';
import { TrendingUp, Info } from 'lucide-react';

export default function OverUnderPage() {
  const { t } = useI18n();
  const { canViewMatch, unlockMatch, creditsBalance } = useEntitlements();

  const [matches, setMatches] = useState<MatchIntelligence[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLeague, setSelectedLeague] = useState('ALL');
  const [selectedDate, setSelectedDate] = useState('ALL');

  const [selectedMatch, setSelectedMatch] = useState<MatchIntelligence | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    fetch('/api/matches?market=OU')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data?.matches) {
          setMatches(data.data.matches);
        }
      })
      .catch((err) => console.error('Failed to load O/U fixtures:', err))
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

  const filteredMatches = matches.filter((m) => {
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
        <div className="border-b border-terminal-border pb-4">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-terminal-accentEmerald font-semibold">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>MARKET SPECIALIZATION • OVER / UNDER (O/U)</span>
          </div>
          <h1 className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-terminal-textPrimary">
            Over / Under Goal Totals Terminal
          </h1>
          <p className="mt-0.5 text-xs text-terminal-textSecondary max-w-2xl">
            Bivariate Poisson distribution models across 1.5, 2.5, and 3.5 totals lines. Zero noise, high-conviction goal-frequency surveillance.
          </p>
        </div>

        {/* Methodology Callout */}
        <div className="rounded-lg border border-terminal-border bg-terminal-card p-3 text-xs flex items-start gap-2.5">
          <Info className="h-4 w-4 text-terminal-accentCyan shrink-0 mt-0.5" />
          <div className="text-[11px] text-terminal-textSecondary leading-relaxed">
            <span className="font-bold text-terminal-textPrimary mr-1">Poisson Goal Modeling:</span>
            Evaluates total goal probabilities by summing over joint probability grid P(i,j) for all combinations where i + j &lt; Line (Under) and i + j &gt; Line (Over).
          </div>
        </div>

        {/* Matrix Table */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-terminal-accentEmerald border-t-transparent" />
            <p className="mt-3 text-xs font-mono text-terminal-textMuted">
              Loading Over / Under market odds...
            </p>
          </div>
        ) : (
          <MatchMatrixTable
            matches={filteredMatches}
            activeMarket="OU"
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
