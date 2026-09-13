'use client';

import React from 'react';
import { Header } from '@/components/layout/Header';
import { Check, ShieldCheck, Zap } from 'lucide-react';
import { useI18n } from '@/i18n/context';

export default function PricingPage() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0D10] text-[#E6E9EE] dark:bg-[#0B0D10] dark:text-[#E6E9EE] light:bg-[#F6F7F9] light:text-[#14171C]">
      <Header />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-12 sm:px-6">
        <div className="text-center max-w-2xl mx-auto border-b border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] pb-8">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1 text-xs font-semibold text-emerald-400">
            <Zap className="h-3.5 w-3.5" />
            <span>TRANSPARENT ENTITLEMENTS</span>
          </div>
          <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-white dark:text-white light:text-[#14171C]">
            Football Intelligence Without the Noise
          </h1>
          <p className="mt-2 text-sm text-[#8A93A0]">
            Free users receive complete access to daily matchday decisions. Upgrade to unlock complete historical ledgers, advanced quarter-line filters, and transparent mathematical traces.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {/* FREE */}
          <div className="rounded-xl border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] p-6 flex flex-col justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-[#8A93A0]">COMMUNITY</div>
              <h3 className="mt-1 text-2xl font-bold text-white dark:text-white light:text-[#14171C]">Free</h3>
              <div className="mt-3 font-tabular text-3xl font-extrabold text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C]">$0</div>
              <p className="mt-2 text-xs text-[#8A93A0]">Essential daily match intelligence for casual football fans.</p>

              <ul className="mt-6 space-y-2.5 text-xs text-[#8A93A0]">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span>Today's matchday decision cards</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span>Main market view (AH, BTTS, O/U)</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span>High-level decision badges & confidence</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span>Zero fabrication verified real odds</span>
                </li>
              </ul>
            </div>

            <button className="mt-8 w-full rounded-md border border-[#232830] bg-[#171B20] py-2 text-xs font-semibold text-[#E6E9EE] hover:bg-[#232830] transition-colors">
              Current Plan
            </button>
          </div>

          {/* PRO */}
          <div className="rounded-xl border border-emerald-500/40 bg-[#171B20] p-6 flex flex-col justify-between relative shadow-lg">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-3 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-black">
              MOST POPULAR
            </div>

            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-400">ANALYST</div>
              <h3 className="mt-1 text-2xl font-bold text-white">Pro</h3>
              <div className="mt-3 font-tabular text-3xl font-extrabold text-white">
                $29<span className="text-xs font-normal text-[#8A93A0]"> / month</span>
              </div>
              <p className="mt-2 text-xs text-[#8A93A0]">Complete access to quarter lines, historical evidence, and drilldown ledgers.</p>

              <ul className="mt-6 space-y-2.5 text-xs text-[#E6E9EE]">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span>Everything in Free</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span>All quarter-line calculations (-1.5 to +1.5)</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span>Inline [WHY?] detailed mathematical breakdown</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span>Full Historical Evidence Drawer & Match Ledger</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span>Historical AH Explorer multi-season filters</span>
                </li>
              </ul>
            </div>

            <button className="mt-8 w-full rounded-md bg-emerald-500 py-2 text-xs font-bold text-black hover:bg-emerald-400 transition-colors shadow-sm">
              Upgrade to Pro
            </button>
          </div>

          {/* ELITE */}
          <div className="rounded-xl border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] p-6 flex flex-col justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-[#8A93A0]">QUANT / INSTITUTIONAL</div>
              <h3 className="mt-1 text-2xl font-bold text-white dark:text-white light:text-[#14171C]">Elite</h3>
              <div className="mt-3 font-tabular text-3xl font-extrabold text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C]">
                $79<span className="text-xs font-normal text-[#8A93A0]"> / month</span>
              </div>
              <p className="mt-2 text-xs text-[#8A93A0]">Full mathematical derivation traces, Kelly criteria, and API data access.</p>

              <ul className="mt-6 space-y-2.5 text-xs text-[#8A93A0]">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span>Everything in Pro</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span>Full [TRACE] Transparent Calculation Audit</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span>Kelly sizing & volatility-adjusted edges</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span>Shadow validation feed & OOS logs</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" />
                  <span>CSV & JSON programmatic data export</span>
                </li>
              </ul>
            </div>

            <button className="mt-8 w-full rounded-md border border-[#232830] bg-[#171B20] py-2 text-xs font-semibold text-[#E6E9EE] hover:bg-[#232830] transition-colors">
              Contact for Enterprise
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
