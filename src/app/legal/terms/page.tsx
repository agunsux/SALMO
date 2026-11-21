'use client';

import React from 'react';
import { TerminalLayout } from '@/components/terminal/TerminalLayout';
import { ShieldCheck, Scale, AlertTriangle, FileText } from 'lucide-react';

export default function TermsOfServicePage() {
  return (
    <TerminalLayout showFilters={false}>
      <div className="space-y-6 max-w-4xl mx-auto text-terminal-textPrimary">
        {/* Header */}
        <div className="border-b border-terminal-border pb-4">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-terminal-accentEmerald font-semibold">
            <Scale className="h-3.5 w-3.5" />
            <span>LEGAL & COMPLIANCE AGREEMENT</span>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-terminal-textPrimary">
            Terms of Service
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-terminal-textSecondary leading-relaxed">
            Last Updated: November 2026. Governing terms for HandicapLab & SALMO statistical analytics platform.
          </p>
        </div>

        {/* 18+ Mandatory Age Gate */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <div className="font-bold text-amber-300 uppercase tracking-wide">
              Mandatory 18+ Requirement
            </div>
            <p className="text-terminal-textSecondary leading-relaxed">
              You must be at least 18 years of age (or the legal age of majority in your jurisdiction) to access or use HandicapLab. If you are under 18, you are strictly prohibited from using this platform.
            </p>
          </div>
        </div>

        {/* Section 1: Non-Gambling Tool Declaration */}
        <div className="rounded-xl border border-terminal-border bg-terminal-card p-5 space-y-3">
          <div className="flex items-center gap-2 text-terminal-accentEmerald font-bold text-sm">
            <ShieldCheck className="h-4 w-4" />
            <h2>1. Statistical Analytics Platform (Non-Gambling Operator)</h2>
          </div>
          <p className="text-xs text-terminal-textSecondary leading-relaxed">
            HandicapLab / SALMO is strictly a software database and predictive statistical research tool. We are NOT a sportsbook, gambling operator, casino, bookmaker, or wagering agent. We do not accept, broker, place, or facilitate bets, wagers, deposits, or gambling transactions.
          </p>
          <p className="text-xs text-terminal-textSecondary leading-relaxed">
            All data, odds comparisons, fair prices, expected values (+EV), and Poisson scoreline distributions are provided solely for statistical education, quantitative research, and informational entertainment purposes.
          </p>
        </div>

        {/* Section 2: Zero Guarantee Disclaimer */}
        <div className="rounded-xl border border-terminal-border bg-terminal-card p-5 space-y-3">
          <div className="flex items-center gap-2 text-terminal-textPrimary font-bold text-sm">
            <FileText className="h-4 w-4 text-terminal-accentCyan" />
            <h2>2. No Guarantees, Financial Advice, or Investment Solicitation</h2>
          </div>
          <p className="text-xs text-terminal-textSecondary leading-relaxed">
            Past performance, historical Net-CLV, and model cover rates are not indicative of future results. Sports outcomes are inherently stochastic. We make zero warranties or guarantees regarding the accuracy, completeness, or profitability of any model signal. You assume 100% of the risk for any decisions made based on this information.
          </p>
        </div>

        {/* Section 3: Subscriptions & Credit Packs */}
        <div className="rounded-xl border border-terminal-border bg-terminal-card p-5 space-y-3">
          <div className="flex items-center gap-2 text-terminal-textPrimary font-bold text-sm">
            <FileText className="h-4 w-4 text-terminal-accentEmerald" />
            <h2>3. Billing, Non-Expiring Credits, & Cancellation</h2>
          </div>
          <p className="text-xs text-terminal-textSecondary leading-relaxed">
            - **Match Credit Packs (Starter / Grinder):** Match credits never expire and permanently unlock deep-dive access to selected fixtures. Match credits are non-refundable once purchased.
          </p>
          <p className="text-xs text-terminal-textSecondary leading-relaxed">
            - **Weekend Passes (72 Hours):** One-time, non-subscription passes providing full terminal access for 72 consecutive hours from activation.
          </p>
          <p className="text-xs text-terminal-textSecondary leading-relaxed">
            - **Pro Subscriptions (Monthly / Annual):** Recurring subscriptions that can be cancelled at any time before renewal via account settings or checkout provider.
          </p>
        </div>
      </div>
    </TerminalLayout>
  );
}
