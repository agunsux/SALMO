'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldCheck, AlertCircle, Scale, BookOpen, HelpCircle } from 'lucide-react';
import { useI18n } from '@/i18n/context';

export const TerminalFooter: React.FC = () => {
  const { t } = useI18n();

  return (
    <footer className="border-t border-terminal-border bg-terminal-card mt-16 transition-colors text-xs">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4 lg:grid-cols-5">
          {/* Brand Col */}
          <div className="lg:col-span-2 space-y-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="font-mono font-extrabold text-lg tracking-wider text-terminal-textPrimary">
                SALMO<span className="text-terminal-accentEmerald">.</span>
              </span>
              <span className="rounded bg-terminal-accentEmerald/15 border border-terminal-accentEmerald/30 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-terminal-accentEmerald">
                QUANT TERMINAL
              </span>
            </Link>
            <p className="text-terminal-textSecondary leading-relaxed max-w-sm text-[11px]">
              High-signal pre-match football analytics terminal. Surveillance across Asian Handicap, Over/Under, and Moneyline with devigged market benchmark odds and transparent walk-forward ledgers.
            </p>
            <div className="flex items-center gap-2 text-terminal-accentEmerald font-medium text-[11px]">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>Zero Fabrication • Strict Pre-Kickoff Invariants</span>
            </div>
          </div>

          {/* Core Markets */}
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-terminal-textPrimary mb-3">
              Core Markets
            </h4>
            <ul className="space-y-2 text-terminal-textSecondary text-[11px]">
              <li>
                <Link href="/asian-handicap" className="hover:text-terminal-accentEmerald transition-colors">
                  Asian Handicap (AH)
                </Link>
              </li>
              <li>
                <Link href="/over-under" className="hover:text-terminal-accentEmerald transition-colors">
                  Over / Under (O/U)
                </Link>
              </li>
              <li>
                <Link href="/moneyline" className="hover:text-terminal-accentEmerald transition-colors">
                  Moneyline (1X2)
                </Link>
              </li>
              <li>
                <Link href="/scanner" className="hover:text-terminal-accentEmerald transition-colors text-terminal-accentEmerald font-semibold">
                  +EV Value Scanner
                </Link>
              </li>
            </ul>
          </div>

          {/* Intelligence & Audit */}
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-terminal-textPrimary mb-3">
              Proof & Audit
            </h4>
            <ul className="space-y-2 text-terminal-textSecondary text-[11px]">
              <li>
                <Link href="/ledger" className="hover:text-terminal-accentEmerald transition-colors">
                  Public Ledger
                </Link>
              </li>
              <li>
                <Link href="/methodology" className="hover:text-terminal-accentEmerald transition-colors">
                  Methodology & Math
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="hover:text-terminal-accentEmerald transition-colors">
                  Pricing & Non-Expiring Credits
                </Link>
              </li>
              <li>
                <Link href="/faq" className="hover:text-terminal-accentEmerald transition-colors">
                  Terminal FAQ
                </Link>
              </li>
            </ul>
          </div>

          {/* Compliance & Safety */}
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-terminal-textPrimary mb-3">
              Compliance & Safety
            </h4>
            <div className="space-y-2 text-[11px] text-terminal-textMuted leading-relaxed">
              <div className="flex items-center gap-1.5 text-terminal-textSecondary font-semibold">
                <span className="rounded bg-terminal-panel px-1.5 py-0.5 border border-terminal-border text-terminal-accentAmber text-[10px]">
                  18+
                </span>
                <span>Adults Only</span>
              </div>
              <p>
                Strictly for analytical & entertainment purposes. No bets accepted. Play responsibly.
              </p>
            </div>
          </div>
        </div>

        {/* 18+ Responsible Wagering Banner */}
        <div className="mt-8 rounded-lg border border-terminal-border bg-terminal-panel p-3.5 text-terminal-textMuted text-[11px] leading-relaxed">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-terminal-accentAmber shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-terminal-textPrimary mr-1">
                {t.compliance?.disclaimer18 || '18+ Responsible Wagering & Quantitative Disclaimer:'}
              </span>
              <span>
                {t.compliance?.nonGamblingNotice || 'SALMO is a sports analytics and data visualization terminal. We are NOT a bookmaker, do not accept bets, and do not handle user deposits. Past performance does not guarantee future results. All bets involve risk of loss. Please bet responsibly.'}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-6 pt-4 border-t border-terminal-border flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] text-terminal-textMuted">
          <div>
            © {new Date().getFullYear()} SALMO.DEV Quant Terminal. All rights reserved.
          </div>
          <div className="flex items-center gap-4">
            <Link href="/methodology" className="hover:text-terminal-textPrimary transition-colors">
              Terms & Methodology
            </Link>
            <span>•</span>
            <Link href="/ledger" className="hover:text-terminal-textPrimary transition-colors">
              Pre-Kickoff Records
            </Link>
            <span>•</span>
            <Link href="/pricing" className="hover:text-terminal-textPrimary transition-colors">
              Passes & Billing
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
