'use client';

import React, { useState } from 'react';
import {
  Target,
  TrendingUp,
  Percent,
  Lock,
  ChevronRight,
  ShieldCheck,
  Zap,
  Clock,
  Sparkles
} from 'lucide-react';
import { MatchIntelligence } from '@/types';
import { useI18n } from '@/i18n/context';
import { useOddsFormat } from '@/components/terminal/OddsFormatContext';
import { computeDixonColesGrid } from '@/components/terminal/quantMath';

export type MarketTabType = 'ALL' | 'AH' | 'OU' | '1X2';
export type PresetFilterType = 'ALL' | 'VALUE_ONLY' | 'HIGH_AH_COVER' | 'HIGH_OU25' | 'TOP_5';

interface MatchMatrixTableProps {
  matches: MatchIntelligence[];
  activeMarket?: MarketTabType;
  onMarketTabChange?: (tab: MarketTabType) => void;
  onInspectMatch: (match: MatchIntelligence) => void;
  canViewMatch: (matchId: string) => boolean;
  onUnlockClick?: (match: MatchIntelligence) => void;
}

export const MatchMatrixTable: React.FC<MatchMatrixTableProps> = ({
  matches,
  activeMarket = 'ALL',
  onMarketTabChange,
  onInspectMatch,
  canViewMatch,
  onUnlockClick
}) => {
  const { t } = useI18n();
  const { formatOddsValue } = useOddsFormat();
  const [filterPreset, setFilterPreset] = useState<PresetFilterType>('ALL');

  // Filter matches based on preset
  const filteredMatches = matches.filter((m) => {
    const ah = m.markets?.asianHandicap;
    const ou = m.markets?.overUnder;

    if (filterPreset === 'VALUE_ONLY') {
      const hasValue = (ah?.expectedValuePct ?? 0) >= 2.0 || (ou?.expectedValuePct ?? 0) >= 2.0;
      if (!hasValue) return false;
    }

    if (filterPreset === 'HIGH_AH_COVER') {
      const cover = ah?.settlementDistribution?.winPct ?? (ah?.modelProbabilityPct ?? 0);
      if (cover < 65) return false;
    }

    if (filterPreset === 'HIGH_OU25') {
      const cover = ou?.settlementDistribution?.winPct ?? (ou?.modelProbabilityPct ?? 0);
      if (cover < 65) return false;
    }

    if (filterPreset === 'TOP_5') {
      const topLeagues = ['Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1'];
      if (!topLeagues.some(tl => m.league?.toLowerCase().includes(tl.toLowerCase()))) {
        return false;
      }
    }

    return true;
  });

  return (
    <div className="space-y-3">
      {/* Table Controls Strip: Market Tabs + Quick Filter Presets */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-terminal-border">
        {/* Market Filter Tabs */}
        {onMarketTabChange && (
          <div className="flex items-center gap-1 rounded-lg border border-terminal-border bg-terminal-panel p-1">
            <button
              onClick={() => onMarketTabChange('ALL')}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                activeMarket === 'ALL'
                  ? 'bg-terminal-elevated text-terminal-accentEmerald shadow-xs'
                  : 'text-terminal-textMuted hover:text-terminal-textPrimary'
              }`}
            >
              All Markets
            </button>
            <button
              onClick={() => onMarketTabChange('AH')}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                activeMarket === 'AH'
                  ? 'bg-terminal-elevated text-terminal-accentEmerald shadow-xs'
                  : 'text-terminal-textMuted hover:text-terminal-textPrimary'
              }`}
            >
              <Target className="h-3 w-3" />
              <span>{t.markets.asianHandicap}</span>
            </button>
            <button
              onClick={() => onMarketTabChange('OU')}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                activeMarket === 'OU'
                  ? 'bg-terminal-elevated text-terminal-accentEmerald shadow-xs'
                  : 'text-terminal-textMuted hover:text-terminal-textPrimary'
              }`}
            >
              <TrendingUp className="h-3 w-3" />
              <span>{t.markets.overUnder}</span>
            </button>
            <button
              onClick={() => onMarketTabChange('1X2')}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                activeMarket === '1X2'
                  ? 'bg-terminal-elevated text-terminal-accentEmerald shadow-xs'
                  : 'text-terminal-textMuted hover:text-terminal-textPrimary'
              }`}
            >
              <Percent className="h-3 w-3" />
              <span>{t.markets.moneyline}</span>
            </button>
          </div>
        )}

        {/* Quick Filter Pill Presets */}
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <button
            onClick={() => setFilterPreset('ALL')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
              filterPreset === 'ALL'
                ? 'border-terminal-accentEmerald bg-terminal-accentEmerald/15 text-terminal-accentEmerald font-semibold'
                : 'border-terminal-border bg-terminal-panel text-terminal-textMuted hover:text-terminal-textPrimary'
            }`}
          >
            {t.filters.allMatches} ({matches.length})
          </button>
          <button
            onClick={() => setFilterPreset('VALUE_ONLY')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
              filterPreset === 'VALUE_ONLY'
                ? 'border-terminal-accentEmerald bg-terminal-accentEmerald/15 text-terminal-accentEmerald font-semibold'
                : 'border-terminal-border bg-terminal-panel text-terminal-textMuted hover:text-terminal-textPrimary'
            }`}
          >
            +EV &ge; 2%
          </button>
          <button
            onClick={() => setFilterPreset('HIGH_AH_COVER')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
              filterPreset === 'HIGH_AH_COVER'
                ? 'border-terminal-accentEmerald bg-terminal-accentEmerald/15 text-terminal-accentEmerald font-semibold'
                : 'border-terminal-border bg-terminal-panel text-terminal-textMuted hover:text-terminal-textPrimary'
            }`}
          >
            AH Cover &ge; 65%
          </button>
          <button
            onClick={() => setFilterPreset('HIGH_OU25')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
              filterPreset === 'HIGH_OU25'
                ? 'border-terminal-accentEmerald bg-terminal-accentEmerald/15 text-terminal-accentEmerald font-semibold'
                : 'border-terminal-border bg-terminal-panel text-terminal-textMuted hover:text-terminal-textPrimary'
            }`}
          >
            O/U 2.5 &ge; 65%
          </button>
          <button
            onClick={() => setFilterPreset('TOP_5')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
              filterPreset === 'TOP_5'
                ? 'border-terminal-accentEmerald bg-terminal-accentEmerald/15 text-terminal-accentEmerald font-semibold'
                : 'border-terminal-border bg-terminal-panel text-terminal-textMuted hover:text-terminal-textPrimary'
            }`}
          >
            Top 5 Leagues
          </button>
        </div>
      </div>

      {/* High-Density OddsJam-Style Matrix Table */}
      <div className="rounded-lg border border-terminal-border bg-terminal-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-terminal-border bg-terminal-panel text-[11px] font-mono text-terminal-textSecondary uppercase tracking-wider select-none">
                <th className="py-2.5 px-3 font-semibold">{t.table.kickoff}</th>
                <th className="py-2.5 px-3 font-semibold">{t.table.matchup}</th>
                <th className="py-2.5 px-3 font-semibold">{t.table.marketLineBest}</th>
                <th className="py-2.5 px-3 font-semibold">{t.table.fairOdds}</th>
                <th className="py-2.5 px-3 font-semibold">{t.table.edgeHitRate}</th>
                <th className="py-2.5 px-3 font-semibold">{t.table.xgProjection}</th>
                <th className="py-2.5 px-3 font-semibold text-right">{t.table.action}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-terminal-border">
              {filteredMatches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-terminal-textMuted">
                    <p className="text-xs">{t.table.emptyState}</p>
                  </td>
                </tr>
              ) : (
                filteredMatches.map((m) => {
                  const allowed = canViewMatch(m.id);
                  const ah = m.markets?.asianHandicap;
                  const ou = m.markets?.overUnder;
                  const homeXg = m.scoreGridSummary?.homeXG ?? 1.45;
                  const awayXg = m.scoreGridSummary?.awayXG ?? 1.15;
                  const rho = m.scoreGridSummary?.rho ?? -0.06;

                  // Evaluate 1X2 Devigged probabilities
                  const gridData = computeDixonColesGrid(homeXg, awayXg, rho);
                  const fairOddsHome = gridData.homeProb > 0 ? (1 / gridData.homeProb).toFixed(2) : '—';
                  const fairOddsDraw = gridData.drawProb > 0 ? (1 / gridData.drawProb).toFixed(2) : '—';
                  const fairOddsAway = gridData.awayProb > 0 ? (1 / gridData.awayProb).toFixed(2) : '—';

                  // Determine display values based on active market
                  let displayLine = '—';
                  let marketOddsStr = '—';
                  let fairOddsStr = '—';
                  let evVal: number | null = null;
                  let coverRateVal: number | null = null;
                  let badgeSignal: 'EMERALD' | 'AMBER' | 'SLATE' = 'SLATE';

                  if (activeMarket === 'AH' || (activeMarket === 'ALL' && ah?.odds)) {
                    displayLine = `${ah?.lineLabel || 'AH 0.0'}`;
                    marketOddsStr = formatOddsValue(ah?.odds);
                    fairOddsStr = formatOddsValue(ah?.fairOdds);
                    evVal = ah?.expectedValuePct ?? null;
                    coverRateVal = ah?.settlementDistribution?.winPct ?? ah?.modelProbabilityPct ?? null;
                  } else if (activeMarket === 'OU' || (activeMarket === 'ALL' && ou?.odds)) {
                    displayLine = `${ou?.lineLabel || 'O/U 2.5'}`;
                    marketOddsStr = formatOddsValue(ou?.odds);
                    fairOddsStr = formatOddsValue(ou?.fairOdds);
                    evVal = ou?.expectedValuePct ?? null;
                    coverRateVal = ou?.settlementDistribution?.winPct ?? ou?.modelProbabilityPct ?? null;
                  } else if (activeMarket === '1X2') {
                    displayLine = '1X2';
                    marketOddsStr = `H: ${formatOddsValue(ah?.odds || 2.10)}`;
                    fairOddsStr = `H: ${formatOddsValue(Number(fairOddsHome))}`;
                    evVal = 1.8;
                    coverRateVal = Math.round(gridData.homeProb * 100);
                  }

                  // Classify BettingStats Signal Badge
                  const evNum = evVal ?? 0;
                  const coverNum = coverRateVal ?? 0;
                  if (evNum >= 2.0 || coverNum >= 65) {
                    badgeSignal = 'EMERALD';
                  } else if (evNum >= 0.0 || (coverNum >= 50 && coverNum < 65)) {
                    badgeSignal = 'AMBER';
                  } else {
                    badgeSignal = 'SLATE';
                  }

                  // Total xG ratio for progress bar
                  const totalXg = homeXg + awayXg;
                  const homePct = Math.round((homeXg / (totalXg || 1)) * 100);

                  return (
                    <tr
                      key={m.id}
                      onClick={() => {
                        if (allowed) onInspectMatch(m);
                        else if (onUnlockClick) onUnlockClick(m);
                      }}
                      className="hover:bg-terminal-elevated/40 transition-colors cursor-pointer group"
                    >
                      {/* Col 1: Kick-off & League */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-mono text-[11px] font-semibold text-terminal-textPrimary flex items-center gap-1">
                            <Clock className="h-3 w-3 text-terminal-textMuted" />
                            {m.kickoffDisplay || m.kickoffIso?.split('T')[1]?.substring(0, 5) || '19:45'}
                          </span>
                          <span className="text-[10px] text-terminal-textMuted truncate max-w-[130px]">
                            {m.league || 'Premier League'}
                          </span>
                        </div>
                      </td>

                      {/* Col 2: Matchup */}
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col">
                          <span className="font-semibold text-terminal-textPrimary group-hover:text-terminal-accentEmerald transition-colors">
                            {m.homeTeam}
                          </span>
                          <span className="text-terminal-textSecondary text-[11px]">
                            {m.awayTeam}
                          </span>
                        </div>
                      </td>

                      {/* Col 3: Line & Best Odds */}
                      <td className="py-2.5 px-3 whitespace-nowrap font-mono">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-terminal-textPrimary text-[11px]">
                            {displayLine}
                          </span>
                          <span className="text-[10px] text-terminal-textMuted">@</span>
                          <span className="font-tabular font-bold text-terminal-textPrimary bg-terminal-panel px-1.5 py-0.5 rounded border border-terminal-border">
                            {marketOddsStr}
                          </span>
                        </div>
                      </td>

                      {/* Col 4: Fair Odds (No-Vig) */}
                      <td className="py-2.5 px-3 whitespace-nowrap font-mono">
                        <span className="font-tabular font-medium text-terminal-textSecondary">
                          {fairOddsStr}
                        </span>
                      </td>

                      {/* Col 5: Edge (+EV) / Cover Badge */}
                      <td className="py-2.5 px-3 whitespace-nowrap font-mono">
                        <div className="flex items-center gap-1.5">
                          {badgeSignal === 'EMERALD' && (
                            <span className="inline-flex items-center gap-1 rounded bg-terminal-accentEmerald/15 border border-terminal-accentEmerald/40 px-2 py-0.5 text-[10px] font-bold text-terminal-accentEmerald">
                              <Sparkles className="h-2.5 w-2.5" />
                              <span>{evVal !== null ? `+${evVal.toFixed(1)}% EV` : 'STRONG'}</span>
                              <span className="text-terminal-accentEmerald/80 font-normal">
                                ({coverRateVal ? `${coverRateVal}%` : '65%+'})
                              </span>
                            </span>
                          )}

                          {badgeSignal === 'AMBER' && (
                            <span className="inline-flex items-center gap-1 rounded bg-terminal-accentAmber/15 border border-terminal-accentAmber/40 px-2 py-0.5 text-[10px] font-bold text-terminal-accentAmber">
                              <span>{evVal !== null ? `+${evVal.toFixed(1)}% EV` : 'LEAN'}</span>
                              <span className="text-terminal-accentAmber/80 font-normal">
                                ({coverRateVal ? `${coverRateVal}%` : '50%'})
                              </span>
                            </span>
                          )}

                          {badgeSignal === 'SLATE' && (
                            <span className="inline-flex items-center gap-1 rounded bg-terminal-panel border border-terminal-border px-2 py-0.5 text-[10px] font-medium text-terminal-textMuted">
                              <span>{evVal !== null ? `${evVal.toFixed(1)}% EV` : 'PASS'}</span>
                              <span className="text-terminal-textMuted">
                                ({coverRateVal ? `${coverRateVal}%` : '<50%'})
                              </span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Col 6: xG Projection Mini-Bar */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex flex-col gap-1 w-24">
                          <div className="flex justify-between text-[10px] font-mono font-medium text-terminal-textSecondary">
                            <span>{homeXg.toFixed(2)}</span>
                            <span>{awayXg.toFixed(2)}</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-terminal-panel overflow-hidden flex">
                            <div
                              style={{ width: `${homePct}%` }}
                              className="bg-terminal-accentEmerald h-full"
                            />
                            <div
                              style={{ width: `${100 - homePct}%` }}
                              className="bg-terminal-textMuted/40 h-full"
                            />
                          </div>
                        </div>
                      </td>

                      {/* Col 7: Action (Inspect or Unlock) */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        {allowed ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onInspectMatch(m);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-terminal-panel hover:bg-terminal-elevated border border-terminal-border text-[11px] font-medium text-terminal-textPrimary group-hover:border-terminal-accentEmerald/40 transition-colors"
                          >
                            <span>{t.table.inspect}</span>
                            <ChevronRight className="h-3 w-3 text-terminal-textMuted group-hover:text-terminal-accentEmerald" />
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onUnlockClick) onUnlockClick(m);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-terminal-accentAmber/20 hover:bg-terminal-accentAmber/30 border border-terminal-accentAmber/40 text-[11px] font-bold text-terminal-accentAmber transition-colors"
                          >
                            <Lock className="h-3 w-3" />
                            <span>{t.table.unlock}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
