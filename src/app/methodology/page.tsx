'use client';

import React from 'react';
import { TerminalLayout } from '@/components/terminal/TerminalLayout';
import { useI18n } from '@/i18n/context';
import {
  BookOpen,
  ShieldCheck,
  Target,
  TrendingUp,
  Percent,
  Layers,
  Scale,
  AlertCircle
} from 'lucide-react';

export default function MethodologyPage() {
  const { t } = useI18n();

  return (
    <TerminalLayout showFilters={false}>
      <div className="space-y-6 max-w-4xl mx-auto text-terminal-textPrimary">
        {/* Banner */}
        <div className="border-b border-terminal-border pb-4">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-terminal-accentEmerald font-semibold">
            <BookOpen className="h-3.5 w-3.5" />
            <span>QUANTITATIVE RESEARCH SPECIFICATION</span>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-terminal-textPrimary">
            Methodology & Mathematical Formulation
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-terminal-textSecondary leading-relaxed">
            Transparent documentation of SALMO's predictive engines, probability calibration, quarter-line discrete settlement, and closing line benchmarking.
          </p>
        </div>

        {/* Section 1: Core 3 Markets Focus */}
        <div className="rounded-xl border border-terminal-border bg-terminal-card p-5 space-y-3">
          <div className="flex items-center gap-2 text-terminal-accentEmerald font-bold text-sm">
            <Target className="h-4 w-4" />
            <h2>1. Strict Specialization: Asian Handicap, Over/Under, & Moneyline</h2>
          </div>
          <p className="text-xs text-terminal-textSecondary leading-relaxed">
            Modern football sports betting markets exhibit starkly different levels of liquidity and efficiency. Secondary proposition markets (such as booking points, cards, throw-ins, and match corners) are characterized by wide spreads, harsh bookmaker limits, and heavy volatility.
          </p>
          <p className="text-xs text-terminal-textSecondary leading-relaxed">
            SALMO restricts its active terminal architecture exclusively to the three primary liquid markets:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div className="rounded-lg border border-terminal-border bg-terminal-panel p-3">
              <div className="font-mono font-bold text-xs text-terminal-textPrimary">Asian Handicap (AH)</div>
              <div className="text-[11px] text-terminal-textMuted mt-1">
                Continuous & quarter lines eliminating the draw bias.
              </div>
            </div>
            <div className="rounded-lg border border-terminal-border bg-terminal-panel p-3">
              <div className="font-mono font-bold text-xs text-terminal-textPrimary">Over / Under (O/U)</div>
              <div className="text-[11px] text-terminal-textMuted mt-1">
                Full-match total goals across 1.5, 2.5, and 3.5 boundaries.
              </div>
            </div>
            <div className="rounded-lg border border-terminal-border bg-terminal-panel p-3">
              <div className="font-mono font-bold text-xs text-terminal-textPrimary">Moneyline (1X2)</div>
              <div className="text-[11px] text-terminal-textMuted mt-1">
                True devigged 3-way match outcome probabilities.
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Goal Distribution & Dixon-Coles Adjustments */}
        <div className="rounded-xl border border-terminal-border bg-terminal-card p-5 space-y-3">
          <div className="flex items-center gap-2 text-terminal-accentEmerald font-bold text-sm">
            <Layers className="h-4 w-4" />
            <h2>2. Bivariate Goal Models & Dixon-Coles Formulation</h2>
          </div>
          <p className="text-xs text-terminal-textSecondary leading-relaxed">
            Match scorelines are modeled using independent Poisson expectations parameterized by attacking and defensive team ratings (&lambda; home and &mu; away), corrected for low-score correlation using Dixon and Coles (1997) parameter &rho;:
          </p>
          <div className="rounded border border-terminal-border bg-terminal-panel p-3 font-mono text-xs text-terminal-textPrimary space-y-1 overflow-x-auto">
            <div>P(0, 0) = (1 - &lambda; &mu; &rho;) &bull; e^(&minus;&lambda;&minus;&mu;)</div>
            <div>P(0, 1) = (1 + &lambda; &rho;) &bull; &mu; &bull; e^(&minus;&lambda;&minus;&mu;)</div>
            <div>P(1, 0) = (1 + &mu; &rho;) &bull; &lambda; &bull; e^(&minus;&lambda;&minus;&mu;)</div>
            <div>P(1, 1) = (1 - &rho;) &bull; &lambda; &mu; &bull; e^(&minus;&lambda;&minus;&mu;)</div>
          </div>
          <p className="text-xs text-terminal-textSecondary leading-relaxed">
            This adjustment prevents the systematic under-estimation of low-scoring draws and 1-0 results common in naive independent Poisson frameworks.
          </p>
        </div>

        {/* Section 3: Quarter-Line Asian Handicap Mathematics */}
        <div className="rounded-xl border border-terminal-border bg-terminal-card p-5 space-y-3">
          <div className="flex items-center gap-2 text-terminal-accentEmerald font-bold text-sm">
            <Scale className="h-4 w-4" />
            <h2>3. Asian Handicap Quarter-Line Settlement & Net-CLV</h2>
          </div>
          <p className="text-xs text-terminal-textSecondary leading-relaxed">
            Quarter-line Asian Handicaps (e.g., -0.25, -0.75, +0.25, +0.75) are divided mathematically into two equal half-stakes across the surrounding adjacent lines (L - 0.25 and L + 0.25).
          </p>
          <p className="text-xs text-terminal-textSecondary leading-relaxed">
            Expected Value (EV) is calculated from the effective win probability (P_win_eff) and effective loss probability (P_lose_eff):
          </p>
          <div className="rounded border border-terminal-border bg-terminal-panel p-3 font-mono text-xs text-terminal-accentEmerald">
            EV = P_win_eff &times; (Decimal_Odds - 1.0) - P_lose_eff &times; 1.0
          </div>
          <p className="text-xs text-terminal-textSecondary leading-relaxed">
            Where half-wins contribute 0.5 to P_win_eff and half-losses contribute 0.5 to P_lose_eff. Full push outcomes return stake and do not alter Net-CLV.
          </p>
        </div>

        {/* Section 4: 18+ Responsible Wagering & Notice */}
        <div className="rounded-xl border border-terminal-accentAmber/40 bg-terminal-panel p-5 space-y-3">
          <div className="flex items-center gap-2 text-terminal-accentAmber font-bold text-sm">
            <AlertCircle className="h-4 w-4" />
            <h2>4. 18+ Responsible Wagering & Regulatory Notice</h2>
          </div>
          <p className="text-xs text-terminal-textSecondary leading-relaxed">
            SALMO is an independent quantitative research software and sports data visualization platform. SALMO does NOT accept bets, does NOT hold player funds, and does NOT operate as a bookmaker or gambling operator.
          </p>
          <p className="text-xs text-terminal-textSecondary leading-relaxed">
            Sports betting involves significant financial risk. Mathematical edge does not eliminate short-term variance or drawdown risk. Never bet funds you cannot afford to lose. If gambling ceases to be fun or causes distress, seek help immediately at BeGambleAware.org or your national helpline.
          </p>
        </div>
      </div>
    </TerminalLayout>
  );
}
