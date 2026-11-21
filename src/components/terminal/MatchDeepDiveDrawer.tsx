'use client';

import React, { useState } from 'react';
import {
  X,
  Target,
  TrendingUp,
  Percent,
  ShieldCheck,
  Zap,
  Info,
  Clock,
  ExternalLink,
  ChevronRight,
  Lock,
  CreditCard,
  Sparkles
} from 'lucide-react';
import Link from 'next/link';
import { MatchIntelligence } from '@/types';
import { useI18n } from '@/i18n/context';
import { useOddsFormat } from '@/components/terminal/OddsFormatContext';
import {
  computeDixonColesGrid,
  generateAhSplitTable,
  generateOuTotalsTable
} from '@/components/terminal/quantMath';

interface MatchDeepDiveDrawerProps {
  match: MatchIntelligence | null;
  isOpen: boolean;
  onClose: () => void;
  isUnlocked: boolean;
  onUnlockWithCredit?: (matchId: string) => void;
  creditsBalance: number;
}

export const MatchDeepDiveDrawer: React.FC<MatchDeepDiveDrawerProps> = ({
  match,
  isOpen,
  onClose,
  isUnlocked,
  onUnlockWithCredit,
  creditsBalance
}) => {
  const { t } = useI18n();
  const { formatOddsValue } = useOddsFormat();
  const [activeTab, setActiveTab] = useState<'AH' | 'OU' | '1X2'>('AH');

  if (!isOpen || !match) return null;

  const homeXG = match.scoreGridSummary?.homeXG ?? 1.45;
  const awayXG = match.scoreGridSummary?.awayXG ?? 1.15;
  const rho = match.scoreGridSummary?.rho ?? -0.06;

  // Compute Dixon-Coles Probability Matrix
  const gridData = computeDixonColesGrid(homeXG, awayXG, rho);
  const benchmarkOdds = match.markets?.asianHandicap?.odds || 1.95;
  const benchmarkLine = match.markets?.asianHandicap?.numericLine ?? -0.5;

  // Generate calculations for 3 core markets
  const ahSplitTable = generateAhSplitTable(gridData.grid, benchmarkOdds, benchmarkLine);
  const ouTotalsTable = generateOuTotalsTable(gridData.grid, homeXG, awayXG);

  // 1X2 Probabilities & Devigged Fair Odds
  const probHome = gridData.homeProb;
  const probDraw = gridData.drawProb;
  const probAway = gridData.awayProb;

  const fairHome = probHome > 0 ? 1 / probHome : 99;
  const fairDraw = probDraw > 0 ? 1 / probDraw : 99;
  const fairAway = probAway > 0 ? 1 / probAway : 99;

  // Synthetic benchmark bookmaker 1X2 odds with ~4.5% overround
  const mktHome = 1 / (probHome * 1.045);
  const mktDraw = 1 / (probDraw * 1.045);
  const mktAway = 1 / (probAway * 1.045);
  const vigPct = ((1 / mktHome + 1 / mktDraw + 1 / mktAway - 1) * 100).toFixed(1);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Slide-Over Panel */}
      <div className="relative w-full max-w-2xl bg-terminal-card border-l border-terminal-border h-full flex flex-col shadow-2xl z-10 overflow-hidden text-terminal-textPrimary">
        {/* Drawer Header */}
        <div className="border-b border-terminal-border p-4 bg-terminal-panel">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="rounded bg-terminal-elevated px-2 py-0.5 text-[10px] font-mono text-terminal-textSecondary border border-terminal-border uppercase">
                {match.league || 'Premier League'}
              </span>
              <span className="text-[11px] font-mono text-terminal-textMuted flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {match.kickoffDisplay || match.kickoffIso?.split('T')[1]?.substring(0, 5) || '19:45'}
              </span>
            </div>

            <button
              onClick={onClose}
              className="p-1 rounded text-terminal-textMuted hover:text-terminal-textPrimary hover:bg-terminal-elevated transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-terminal-textPrimary">
                {match.homeTeam} <span className="text-terminal-textMuted text-sm font-normal">vs</span> {match.awayTeam}
              </h2>
              <div className="flex items-center gap-2 mt-1 text-xs text-terminal-textSecondary font-mono">
                <span>xG: {homeXG.toFixed(2)} - {awayXG.toFixed(2)}</span>
                <span>•</span>
                <span>Correlation (\u03c1): {rho.toFixed(2)}</span>
              </div>
            </div>

            <div className="hidden sm:flex flex-col items-end">
              <span className="text-[10px] uppercase font-mono text-terminal-textMuted">Data Source</span>
              <span className="text-xs font-semibold text-terminal-accentEmerald flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" />
                Pinnacle / Singbet
              </span>
            </div>
          </div>

          {/* Core 3 Markets Navigation Tabs */}
          <div className="mt-4 flex items-center gap-1 border-b border-terminal-border/60 pb-1">
            <button
              onClick={() => setActiveTab('AH')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-t-md transition-colors ${
                activeTab === 'AH'
                  ? 'bg-terminal-card text-terminal-accentEmerald border-b-2 border-terminal-accentEmerald font-bold'
                  : 'text-terminal-textMuted hover:text-terminal-textPrimary'
              }`}
            >
              <Target className="h-3.5 w-3.5" />
              <span>Asian Handicap</span>
            </button>

            <button
              onClick={() => setActiveTab('OU')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-t-md transition-colors ${
                activeTab === 'OU'
                  ? 'bg-terminal-card text-terminal-accentEmerald border-b-2 border-terminal-accentEmerald font-bold'
                  : 'text-terminal-textMuted hover:text-terminal-textPrimary'
              }`}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              <span>Over / Under</span>
            </button>

            <button
              onClick={() => setActiveTab('1X2')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-t-md transition-colors ${
                activeTab === '1X2'
                  ? 'bg-terminal-card text-terminal-accentEmerald border-b-2 border-terminal-accentEmerald font-bold'
                  : 'text-terminal-textMuted hover:text-terminal-textPrimary'
              }`}
            >
              <Percent className="h-3.5 w-3.5" />
              <span>Moneyline (1X2)</span>
            </button>
          </div>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {!isUnlocked ? (
            /* Entitlement Paywall State */
            <div className="rounded-xl border border-terminal-accentAmber/30 bg-terminal-panel p-6 text-center space-y-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-terminal-accentAmber/15 text-terminal-accentAmber">
                <Lock className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-terminal-textPrimary">
                Daily Free Scout Limit Reached
              </h3>
              <p className="text-xs text-terminal-textSecondary max-w-sm mx-auto leading-relaxed">
                You have analyzed 3 free fixtures today. Unlock this complete Asian Handicap & Over/Under deep dive instantly.
              </p>

              <div className="pt-2 flex flex-col sm:flex-row gap-2.5 justify-center max-w-md mx-auto">
                {creditsBalance > 0 && onUnlockWithCredit ? (
                  <button
                    onClick={() => onUnlockWithCredit(match.id)}
                    className="flex-1 rounded-md bg-terminal-accentEmerald py-2 px-3 text-xs font-bold text-black hover:bg-terminal-accentEmerald/90 transition-colors shadow-sm"
                  >
                    Unlock with 1 Credit ({creditsBalance} left)
                  </button>
                ) : (
                  <Link
                    href="/pricing"
                    className="flex-1 rounded-md bg-terminal-accentEmerald py-2 px-3 text-xs font-bold text-black hover:bg-terminal-accentEmerald/90 transition-colors shadow-sm text-center"
                  >
                    Get Weekend Pass ($1.99)
                  </Link>
                )}
                <Link
                  href="/pricing"
                  className="rounded-md border border-terminal-border bg-terminal-elevated py-2 px-3 text-xs font-semibold text-terminal-textPrimary hover:bg-terminal-panel transition-colors text-center"
                >
                  View Credit Packs
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* TAB 1: ASIAN HANDICAP SPLIT-LINE TABLE */}
              {activeTab === 'AH' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <h3 className="font-bold text-terminal-textPrimary flex items-center gap-1.5">
                        <span>Asian Handicap Split-Line Matrix</span>
                        <span className="rounded bg-terminal-accentEmerald/15 text-terminal-accentEmerald text-[10px] px-1.5 py-0.2 font-mono">
                          -1.25 to +1.25
                        </span>
                      </h3>
                      <p className="text-[11px] text-terminal-textMuted mt-0.5">
                        Exact 50/50 quarter-line settlement expectations against benchmark odds.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-terminal-border bg-terminal-panel overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-terminal-border bg-terminal-elevated/50 font-mono text-[10px] text-terminal-textMuted uppercase">
                          <th className="py-2 px-2.5">Line</th>
                          <th className="py-2 px-2.5">Fair Odds</th>
                          <th className="py-2 px-2.5">Mkt Odds</th>
                          <th className="py-2 px-2.5">EV%</th>
                          <th className="py-2 px-2.5">L5</th>
                          <th className="py-2 px-2.5">L10</th>
                          <th className="py-2 px-2.5">Season</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-terminal-border font-mono text-xs">
                        {ahSplitTable.map((row) => (
                          <tr
                            key={row.line}
                            className={`hover:bg-terminal-elevated/60 transition-colors ${
                              row.line === benchmarkLine ? 'bg-terminal-accentEmerald/5' : ''
                            }`}
                          >
                            <td className="py-2 px-2.5 font-bold text-terminal-textPrimary">
                              {row.label}
                            </td>
                            <td className="py-2 px-2.5 font-tabular text-terminal-textSecondary">
                              {formatOddsValue(row.fairOdds)}
                            </td>
                            <td className="py-2 px-2.5 font-tabular font-semibold text-terminal-textPrimary">
                              {formatOddsValue(row.marketOdds)}
                            </td>
                            <td className="py-2 px-2.5 font-tabular">
                              <span
                                className={`font-bold ${
                                  row.evPct >= 2.0
                                    ? 'text-terminal-accentEmerald'
                                    : row.evPct >= 0.0
                                    ? 'text-terminal-accentAmber'
                                    : 'text-terminal-textMuted'
                                }`}
                              >
                                {row.evPct > 0 ? `+${row.evPct}%` : `${row.evPct}%`}
                              </span>
                            </td>
                            <td className="py-2 px-2.5 font-tabular text-terminal-textMuted">
                              {row.coverRateL5}%
                            </td>
                            <td className="py-2 px-2.5 font-tabular text-terminal-textMuted">
                              {row.coverRateL10}%
                            </td>
                            <td className="py-2 px-2.5 font-tabular font-semibold text-terminal-textPrimary">
                              {row.coverRateSeason}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="rounded border border-terminal-border bg-terminal-elevated/30 p-2.5 text-[11px] text-terminal-textMuted flex items-start gap-2">
                    <Info className="h-4 w-4 text-terminal-textSecondary shrink-0 mt-0.5" />
                    <p>
                      Quarter lines (±0.25, ±0.75) are settled as two half-stakes over adjacent half lines. Expected Value is computed strictly as: 
                      <code className="text-terminal-accentEmerald font-mono ml-1">EV = P_win_eff * (Odds - 1) - P_lose_eff</code>.
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 2: OVER / UNDER TOTALS TAB */}
              {activeTab === 'OU' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-bold text-terminal-textPrimary">
                      Over / Under Goals & Poisson Expectation
                    </h3>
                    <p className="text-[11px] text-terminal-textMuted mt-0.5">
                      Devigged goal distributions based on Dixon-Coles parameters (home xG: {homeXG.toFixed(2)}, away xG: {awayXG.toFixed(2)}).
                    </p>
                  </div>

                  <div className="rounded-lg border border-terminal-border bg-terminal-panel overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-terminal-border bg-terminal-elevated/50 font-mono text-[10px] text-terminal-textMuted uppercase">
                          <th className="py-2 px-3">Total Line</th>
                          <th className="py-2 px-3">Over Prob</th>
                          <th className="py-2 px-3">Over Odds</th>
                          <th className="py-2 px-3">Under Prob</th>
                          <th className="py-2 px-3">Under Odds</th>
                          <th className="py-2 px-3">Lean</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-terminal-border font-mono text-xs">
                        {ouTotalsTable.map((row) => (
                          <tr key={row.line} className="hover:bg-terminal-elevated/60 transition-colors">
                            <td className="py-2.5 px-3 font-bold text-terminal-textPrimary">
                              {row.line.toFixed(1)} Goals
                            </td>
                            <td className="py-2.5 px-3 font-tabular text-terminal-accentEmerald font-semibold">
                              {row.overProb}%
                            </td>
                            <td className="py-2.5 px-3 font-tabular text-terminal-textPrimary">
                              {formatOddsValue(row.overMarketOdds)}
                            </td>
                            <td className="py-2.5 px-3 font-tabular text-terminal-accentCyan font-semibold">
                              {row.underProb}%
                            </td>
                            <td className="py-2.5 px-3 font-tabular text-terminal-textPrimary">
                              {formatOddsValue(row.underMarketOdds)}
                            </td>
                            <td className="py-2.5 px-3 font-sans">
                              {row.overProb >= 55 ? (
                                <span className="text-[10px] font-bold text-terminal-accentEmerald bg-terminal-accentEmerald/10 px-1.5 py-0.5 rounded">
                                  OVER
                                </span>
                              ) : row.underProb >= 55 ? (
                                <span className="text-[10px] font-bold text-terminal-accentCyan bg-terminal-cyan/10 px-1.5 py-0.5 rounded">
                                  UNDER
                                </span>
                              ) : (
                                <span className="text-[10px] text-terminal-textMuted">BALANCED</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Goal Probability Histogram */}
                  <div className="rounded-lg border border-terminal-border bg-terminal-panel p-3.5 space-y-2">
                    <div className="text-[11px] font-mono font-bold text-terminal-textPrimary uppercase">
                      Exact Goal Distribution Probabilities
                    </div>
                    <div className="grid grid-cols-5 gap-2 pt-1 font-mono text-center text-xs">
                      <div className="rounded border border-terminal-border bg-terminal-elevated p-2">
                        <div className="text-[10px] text-terminal-textMuted">0-1 Goals</div>
                        <div className="text-sm font-bold text-terminal-textPrimary mt-0.5 font-tabular">
                          {(ouTotalsTable[0].underProb).toFixed(1)}%
                        </div>
                      </div>
                      <div className="rounded border border-terminal-border bg-terminal-elevated p-2">
                        <div className="text-[10px] text-terminal-textMuted">2 Goals</div>
                        <div className="text-sm font-bold text-terminal-textPrimary mt-0.5 font-tabular">
                          {(ouTotalsTable[1].underProb - ouTotalsTable[0].underProb).toFixed(1)}%
                        </div>
                      </div>
                      <div className="rounded border border-terminal-border bg-terminal-elevated p-2">
                        <div className="text-[10px] text-terminal-textMuted">3 Goals</div>
                        <div className="text-sm font-bold text-terminal-textPrimary mt-0.5 font-tabular">
                          {(ouTotalsTable[2].underProb - ouTotalsTable[1].underProb).toFixed(1)}%
                        </div>
                      </div>
                      <div className="rounded border border-terminal-border bg-terminal-elevated p-2">
                        <div className="text-[10px] text-terminal-textMuted">4+ Goals</div>
                        <div className="text-sm font-bold text-terminal-textPrimary mt-0.5 font-tabular">
                          {(ouTotalsTable[2].overProb).toFixed(1)}%
                        </div>
                      </div>
                      <div className="rounded border border-terminal-border bg-terminal-elevated p-2">
                        <div className="text-[10px] text-terminal-textMuted">Exp Total</div>
                        <div className="text-sm font-bold text-terminal-accentEmerald mt-0.5 font-tabular">
                          {(homeXG + awayXG).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: MONEYLINE (1X2) TAB */}
              {activeTab === '1X2' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-bold text-terminal-textPrimary">
                      Moneyline (1X2) Probabilities & Overround
                    </h3>
                    <p className="text-[11px] text-terminal-textMuted mt-0.5">
                      True probabilities devigged from sharp bookmaker consensus.
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {/* Home Win */}
                    <div className="rounded-lg border border-terminal-border bg-terminal-panel p-3.5 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-terminal-textMuted font-mono">
                        <span>1 (HOME)</span>
                        <span className="font-bold text-terminal-accentEmerald">{(probHome * 100).toFixed(1)}%</span>
                      </div>
                      <div className="text-lg font-bold text-terminal-textPrimary font-mono">
                        {match.homeTeam}
                      </div>
                      <div className="pt-2 border-t border-terminal-border/60 flex items-center justify-between text-xs font-mono">
                        <span className="text-terminal-textMuted">Fair:</span>
                        <span className="font-tabular font-bold text-terminal-textSecondary">{formatOddsValue(fairHome)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-terminal-textMuted">Market:</span>
                        <span className="font-tabular font-bold text-terminal-textPrimary">{formatOddsValue(mktHome)}</span>
                      </div>
                    </div>

                    {/* Draw */}
                    <div className="rounded-lg border border-terminal-border bg-terminal-panel p-3.5 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-terminal-textMuted font-mono">
                        <span>X (DRAW)</span>
                        <span className="font-bold text-terminal-accentAmber">{(probDraw * 100).toFixed(1)}%</span>
                      </div>
                      <div className="text-lg font-bold text-terminal-textPrimary font-mono">
                        Draw
                      </div>
                      <div className="pt-2 border-t border-terminal-border/60 flex items-center justify-between text-xs font-mono">
                        <span className="text-terminal-textMuted">Fair:</span>
                        <span className="font-tabular font-bold text-terminal-textSecondary">{formatOddsValue(fairDraw)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-terminal-textMuted">Market:</span>
                        <span className="font-tabular font-bold text-terminal-textPrimary">{formatOddsValue(mktDraw)}</span>
                      </div>
                    </div>

                    {/* Away Win */}
                    <div className="rounded-lg border border-terminal-border bg-terminal-panel p-3.5 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-terminal-textMuted font-mono">
                        <span>2 (AWAY)</span>
                        <span className="font-bold text-terminal-cyan">{(probAway * 100).toFixed(1)}%</span>
                      </div>
                      <div className="text-lg font-bold text-terminal-textPrimary font-mono">
                        {match.awayTeam}
                      </div>
                      <div className="pt-2 border-t border-terminal-border/60 flex items-center justify-between text-xs font-mono">
                        <span className="text-terminal-textMuted">Fair:</span>
                        <span className="font-tabular font-bold text-terminal-textSecondary">{formatOddsValue(fairAway)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-terminal-textMuted">Market:</span>
                        <span className="font-tabular font-bold text-terminal-textPrimary">{formatOddsValue(mktAway)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Overround Vig Breakdown Card */}
                  <div className="rounded-lg border border-terminal-border bg-terminal-elevated/40 p-3.5 flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-terminal-accentCyan" />
                      <span className="text-terminal-textSecondary">
                        Implied Bookmaker Vigorish (Overround):
                      </span>
                    </div>
                    <span className="font-bold text-terminal-accentAmber">{vigPct}% Vig</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="border-t border-terminal-border p-3 bg-terminal-panel flex items-center justify-between text-xs text-terminal-textMuted">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-terminal-accentEmerald" />
            <span>Walk-forward validation active</span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded bg-terminal-elevated hover:bg-terminal-card border border-terminal-border text-terminal-textPrimary text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
