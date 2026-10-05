import React from 'react';
import Link from 'next/link';
import { ShieldCheck, Scale, AlertCircle, ArrowUpRight, BookOpen, HelpCircle } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#0B0D10] dark:bg-[#0B0D10] light:bg-[#FFFFFF] mt-16 transition-colors">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Main Grid */}
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4 lg:grid-cols-5">
          {/* Brand Col */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-white dark:text-white light:text-[#14171C]">
                SALMO<span className="text-emerald-500">.</span>
              </span>
              <span className="rounded border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#8A93A0] dark:text-[#8A93A0] light:text-[#5A6270]">
                DECISION INTELLIGENCE
              </span>
            </Link>
            <p className="mt-3 text-xs leading-relaxed text-[#8A93A0] dark:text-[#8A93A0] light:text-[#5A6270] max-w-sm">
              SALMO is a specialized football betting intelligence platform. We evaluate liquid Asian Handicap, Over/Under, and BTTS markets using goal-distribution models, devigged sharp odds, and immutable pre-kickoff ledgers.
            </p>
            <div className="mt-4 flex items-center gap-2 text-xs text-emerald-400 font-medium">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span>Zero Fabrication Policy • Strict Kickoff Gate</span>
            </div>
          </div>

          {/* Markets Col */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C]">
              Core Markets
            </h4>
            <ul className="mt-3 space-y-2 text-xs text-[#8A93A0] dark:text-[#8A93A0] light:text-[#5A6270]">
              <li>
                <Link href="/asian-handicap" className="hover:text-emerald-400 transition-colors">
                  Asian Handicap (AH)
                </Link>
              </li>
              <li>
                <Link href="/over-under" className="hover:text-emerald-400 transition-colors">
                  Over/Under Totals (O/U)
                </Link>
              </li>
              <li>
                <Link href="/btts" className="hover:text-emerald-400 transition-colors">
                  Both Teams To Score (BTTS)
                </Link>
              </li>
              <li>
                <Link href="/daily-picks" className="hover:text-emerald-400 text-emerald-400 font-medium transition-colors flex items-center gap-1">
                  Daily Picks <ArrowUpRight className="h-3 w-3" />
                </Link>
              </li>
              <li>
                <Link href="/matches" className="hover:text-emerald-400 transition-colors">
                  All Matches
                </Link>
              </li>
            </ul>
          </div>

          {/* Education & Resources Col */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C]">
              Resources & SEO
            </h4>
            <ul className="mt-3 space-y-2 text-xs text-[#8A93A0] dark:text-[#8A93A0] light:text-[#5A6270]">
              <li>
                <Link href="/blog" className="hover:text-emerald-400 transition-colors flex items-center gap-1">
                  <BookOpen className="h-3 w-3" /> Blog & Analysis
                </Link>
              </li>
              <li>
                <Link href="/faq" className="hover:text-emerald-400 transition-colors flex items-center gap-1">
                  <HelpCircle className="h-3 w-3" /> Comprehensive FAQ
                </Link>
              </li>
              <li>
                <Link href="/blog/how-to-find-value-bets-football" className="hover:text-emerald-400 transition-colors">
                  Value Betting Guide
                </Link>
              </li>
              <li>
                <Link href="/blog/asian-handicap-betting-explained" className="hover:text-emerald-400 transition-colors">
                  Asian Handicap Guide
                </Link>
              </li>
              <li>
                <Link href="/blog/how-salmo-records-predictions-before-kickoff" className="hover:text-emerald-400 transition-colors">
                  Pre-Kickoff Ledger
                </Link>
              </li>
            </ul>
          </div>

          {/* Architecture & Comparisons Col */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C]">
              Platform & Trust
            </h4>
            <ul className="mt-3 space-y-2 text-xs text-[#8A93A0] dark:text-[#8A93A0] light:text-[#5A6270]">
              <li>
                <Link href="/research" className="hover:text-emerald-400 transition-colors">
                  Research & Validation
                </Link>
              </li>
              <li>
                <Link href="/performance" className="hover:text-emerald-400 transition-colors">
                  Model Calibration & Performance
                </Link>
              </li>
              {process.env.NEXT_PUBLIC_MONETIZATION_ENABLED === 'true' && (
                <li>
                  <Link href="/pricing" className="hover:text-emerald-400 transition-colors">
                    Pricing & Access
                  </Link>
                </li>
              )}
              <li>
                <Link href="/blog/salmo-vs-oddsjam" className="hover:text-emerald-400 transition-colors">
                  SALMO vs. OddsJam
                </Link>
              </li>
              <li>
                <Link href="/blog/salmo-vs-exprysm" className="hover:text-emerald-400 transition-colors">
                  SALMO vs. ExPrysm
                </Link>
              </li>
              <li>
                <Link href="/blog/salmo-vs-rebelbetting" className="hover:text-emerald-400 transition-colors">
                  SALMO vs. RebelBetting
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Responsible Betting / YMYL Disclaimer */}
        <div className="mt-10 rounded-xl border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] dark:bg-[#111418] light:bg-[#F6F7F9] p-4 text-xs text-[#8A93A0] dark:text-[#8A93A0] light:text-[#5A6270]">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C]">
                Responsible Wagering & Analytical Notice:
              </span>
              <p className="leading-relaxed">
                SALMO provides quantitative sports analytics, mathematical model probabilities, and decision-support intelligence for educational and research purposes only. SALMO is NOT a sportsbook or bookmaker, does not accept wagers or handle customer deposits, and does NOT guarantee winning bets or financial returns. Sports wagering involves substantial risk of financial loss and outcomes are subject to irreducible variance. No predictive model eliminates risk. Please gamble responsibly. 18+ only.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom copyright */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] pt-6 text-[11px] text-[#8A93A0] dark:text-[#8A93A0] light:text-[#5A6270]">
          <div>
            © {new Date().getFullYear()} SALMO.DEV. All rights reserved. Fewer But Qualified Picks.
          </div>
          <div className="flex items-center gap-4">
            <Link href="/blog/how-salmo-records-predictions-before-kickoff" className="hover:text-white transition-colors">
              Immutable Ledger
            </Link>
            <span>•</span>
            <Link href="/faq" className="hover:text-white transition-colors">
              FAQ
            </Link>
            <span>•</span>
            <Link href="/sitemap.xml" className="hover:text-white transition-colors">
              Sitemap
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
