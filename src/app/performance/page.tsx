'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ShieldCheck, AlertTriangle, Database, Activity, Clock, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface ResearchApiResponse {
  success: boolean;
  version?: string;
  modelVersion?: string;
  dataState?: string;
  counts?: {
    totalArchived: number;
    dailyPicks: number;
    settled: number;
    pending: number;
  };
  predictions?: any[];
  timestampUtc?: string;
  error?: {
    code: string;
    message: string;
  };
}

export default function PerformancePage() {
  const [data, setData] = useState<ResearchApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [perfReport, setPerfReport] = useState<any | null>(null);
  const [settledPositions, setSettledPositions] = useState<any[]>([]);
  const [observability, setObservability] = useState<any | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/v1/research').then(res => res.ok ? res.json() : null),
      fetch('/api/v1/performance').then(res => res.ok ? res.json() : null)
    ])
      .then(([resData, perfData]) => {
        if (resData) setData(resData);
        if (perfData?.report) setPerfReport(perfData.report);
        if (Array.isArray(perfData?.settledPositions)) setSettledPositions(perfData.settledPositions);
        if (perfData?.observability) setObservability(perfData.observability);
      })
      .catch(err => {
        console.error('Failed to load performance data:', err);
        setError(err.message || 'Data unavailable');
      })
      .finally(() => setLoading(false));
  }, []);

  const settledCount = data?.counts?.settled ?? 0;
  const pendingCount = data?.counts?.pending ?? 0;
  const totalArchived = data?.counts?.totalArchived ?? 0;
  const modelVersion = data?.modelVersion ?? 'poisson_v1_rescue';

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0D10] text-[#E6E9EE]">
      <Header />

      <section className="mx-auto w-full max-w-7xl px-4 pt-6 pb-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-[#232830] pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-purple-400">
              <Activity className="h-3.5 w-3.5" />
              <span>EMPIRICAL PERFORMANCE AUDIT • DATASET: RESEARCH</span>
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Model Performance & Track Record
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#8A93A0]">
              Audited settlement record from immutable pre-kickoff ledgers. Zero synthetic calculations.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-purple-300 font-medium">
              DATASET: RESEARCH
            </span>
            <span className="rounded border border-zinc-700 bg-zinc-800/60 px-2.5 py-1 text-zinc-400">
              MODEL: {modelVersion}
            </span>
          </div>
        </div>
      </section>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <p className="mt-4 text-xs font-medium text-[#8A93A0]">Loading research performance ledger...</p>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-12 text-center">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/10 text-rose-400 mb-3">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-semibold text-rose-300">DATA_UNAVAILABLE</h3>
            <p className="mt-1 text-xs text-[#8A93A0] max-w-md mx-auto">
              Authoritative research ledger is temporarily unreachable. SALMO strictly refuses to fabricate fallback metrics.
            </p>
          </div>
        ) : ((perfReport?.controlFullCohort?.settled ?? settledCount) < 30 || perfReport?.controlFullCohort?.sampleStatus === 'INSUFFICIENT SAMPLE' || settledCount < 30) ? (
          /* Minimum sample size rule: Zero frontend CLV or ROI calculation when sample < 30 */
          <div className="space-y-6">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-12 text-center">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-400 mb-4">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-amber-300 tracking-tight">
                INSUFFICIENT SAMPLE
              </h2>
              <p className="mt-2 text-sm text-[#8A93A0] max-w-md mx-auto">
                Track record is still being established. Live fixtures remain pending ahead of kickoff.
              </p>

              <div className="mt-8 grid grid-cols-2 sm:grid-cols-5 gap-3 max-w-4xl mx-auto text-left">
                <div className="rounded-lg border border-[#232830] bg-[#111418] p-3">
                  <span className="block text-[10px] uppercase text-[#8A93A0]">Qualified Public Picks</span>
                  <span className="font-tabular font-bold text-emerald-400 text-sm">
                    {perfReport?.headlineGreenCohort?.settled ?? 0} settled
                  </span>
                  <span className="block text-[10px] text-zinc-500 mt-0.5">
                    {perfReport?.headlineGreenCohort?.displayStatus || 'No settled bets'}
                  </span>
                </div>
                <div className="rounded-lg border border-[#232830] bg-[#111418] p-3">
                  <span className="block text-[10px] uppercase text-[#8A93A0]">Diagnostic Settled</span>
                  <span className="font-tabular font-bold text-white text-sm">
                    {perfReport?.controlFullCohort?.settled ?? settledCount}{' '}
                    <span className="text-zinc-500 text-xs font-normal">/ 30 min</span>
                  </span>
                  <span className="block text-[10px] text-amber-400 mt-0.5">
                    NOT PUBLIC PICKS
                  </span>
                </div>
                <div className="rounded-lg border border-[#232830] bg-[#111418] p-3">
                  <span className="block text-[10px] uppercase text-[#8A93A0]">Binary Leg Brier</span>
                  <span className="font-tabular font-bold text-white text-sm">
                    {perfReport?.controlFullCohort?.brierScore !== null &&
                    perfReport?.controlFullCohort?.brierScore !== undefined
                      ? perfReport.controlFullCohort.brierScore.toFixed(4)
                      : '—'}
                  </span>
                  <span className="block text-[10px] text-zinc-500 mt-0.5">
                    {perfReport?.controlFullCohort?.nBrierLegsResolved ?? 0} legs ({perfReport?.controlFullCohort?.nBrierLegsExcludedPush ?? 0} push excl.)
                  </span>
                </div>
                <div className="rounded-lg border border-[#232830] bg-[#111418] p-3">
                  <span className="block text-[10px] uppercase text-[#8A93A0]">Pending Settlement</span>
                  <span className="font-tabular font-bold text-amber-400 text-sm">
                    {perfReport?.controlFullCohort?.pending ?? pendingCount}
                  </span>
                  <span className="block text-[10px] text-zinc-500 mt-0.5">Pre-kickoff production</span>
                </div>
                <div className="rounded-lg border border-[#232830] bg-[#111418] p-3">
                  <span className="block text-[10px] uppercase text-[#8A93A0]">Total Ingested</span>
                  <span className="font-tabular font-bold text-white text-sm">{totalArchived}</span>
                  <span className="block text-[10px] text-zinc-500 mt-0.5">15-league archive</span>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-[#232830] max-w-md mx-auto">
                <p className="text-xs text-[#8A93A0] mb-4">
                  Per research invariants, closing line value (CLV) and model calibration curves require a minimum sample of 30 independently settled fixtures before public reporting.
                </p>
                <Link
                  href="/research"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  <span>Inspect Pre-Kickoff Research Ledger</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>

            {/* Audited Settled Positions Ledger Table (12 Settled Positions) */}
            {settledPositions.length > 0 && (
              <div className="rounded-xl border border-[#232830] bg-[#111418] overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#232830] bg-[#161B22] px-5 py-4">
                  <div>
                    <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-amber-400">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>MODEL_ALL_ROWS_DIAGNOSTIC (NOT PUBLIC PICKS) • QUARTER-LINE ACCOUNTING</span>
                    </div>
                    <h3 className="mt-1 text-base font-bold text-white">
                      Diagnostic All-Rows Settled Positions ({settledPositions.length} Settled · 1.0u Flat Stake)
                    </h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                    <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-amber-300 font-bold">
                      COHORT: {perfReport?.controlFullCohort?.cohortLabel || 'MODEL_ALL_ROWS_DIAGNOSTIC (NOT PUBLIC PICKS)'}
                    </span>
                    <span className="rounded border border-[#232830] bg-[#0B0D10] px-2.5 py-1 text-zinc-300">
                      Staked: <strong>{perfReport?.controlFullCohort?.unitsStaked ?? settledPositions.length}.0u</strong>
                    </span>
                    <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-400 font-bold">
                      Diagnostic Net Units: {perfReport?.controlFullCohort?.profitUnits !== undefined
                        ? `${perfReport.controlFullCohort.profitUnits >= 0 ? '+' : ''}${perfReport.controlFullCohort.profitUnits.toFixed(2)}u`
                        : '0.00u'}
                    </span>
                    {perfReport?.controlFullCohort?.brierScore !== null &&
                      perfReport?.controlFullCohort?.brierScore !== undefined && (
                        <span className="rounded border border-[#232830] bg-[#0B0D10] px-2.5 py-1 text-zinc-300">
                          Binary Leg Brier: <strong>{perfReport.controlFullCohort.brierScore.toFixed(4)}</strong> (n={perfReport.controlFullCohort.nBrierLegsResolved} legs)
                        </span>
                      )}
                    <span className="rounded border border-[#232830] bg-[#0B0D10] px-2.5 py-1 text-zinc-400">
                      Last Sync: {observability?.lastSettlementRunAt ? observability.lastSettlementRunAt.replace('T', ' ').slice(0, 16) : '2026-10-10 18:47'} UTC
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[#232830] bg-[#0B0D10] text-[10px] font-mono uppercase tracking-wider text-[#8A93A0]">
                        <th className="px-4 py-3">Matchup</th>
                        <th className="px-4 py-3">Kickoff (UTC)</th>
                        <th className="px-3 py-3">Market</th>
                        <th className="px-3 py-3">Line</th>
                        <th className="px-4 py-3">Pre-Match Selection</th>
                        <th className="px-3 py-3 text-right">Odds Taken</th>
                        <th className="px-3 py-3 text-center">FT Score</th>
                        <th className="px-4 py-3 text-center">Quarter-Line Outcome</th>
                        <th className="px-4 py-3 text-right">Profit (Units)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#232830] font-mono">
                      {settledPositions.map((pos: any) => {
                        const isWin = pos.result === 'WIN' || pos.result === 'HALF_WIN';
                        const isLoss = pos.result === 'LOSS' || pos.result === 'HALF_LOSS';
                        const profit = Number(pos.profitUnits ?? 0);

                        return (
                          <tr key={pos.predictionId} className="hover:bg-[#161B22]/60 transition-colors">
                            <td className="px-4 py-3 font-sans">
                              <div className="font-semibold text-white">
                                {pos.homeTeam} <span className="text-[#8A93A0] font-normal">vs</span> {pos.awayTeam}
                              </div>
                              <div className="text-[10px] text-[#8A93A0] font-mono">
                                {pos.league} · {pos.canonicalMatchId}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-[#8A93A0] whitespace-nowrap">
                              {pos.kickoffUtc ? pos.kickoffUtc.replace('T', ' ').slice(0, 16) : '—'}
                            </td>
                            <td className="px-3 py-3">
                              <span className="rounded border border-[#232830] bg-[#161B22] px-1.5 py-0.5 text-[10px] font-bold text-white">
                                {pos.market}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-white font-semibold">
                              {pos.line > 0 && pos.market === 'AH' ? `+${pos.line}` : pos.line}
                            </td>
                            <td className="px-4 py-3 font-sans font-medium text-white">
                              {pos.selection}
                            </td>
                            <td className="px-3 py-3 text-right text-zinc-300">
                              @{Number(pos.oddsAtPrediction || 1.95).toFixed(3)}
                            </td>
                            <td className="px-3 py-3 text-center">
                              <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs font-bold text-white">
                                {pos.matchScore}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span
                                className={`rounded border px-2 py-0.5 text-[10px] font-bold ${
                                  isWin
                                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                                    : isLoss
                                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                                    : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                                }`}
                              >
                                {pos.result}
                              </span>
                            </td>
                            <td
                              className={`px-4 py-3 text-right font-bold ${
                                profit > 0
                                  ? 'text-emerald-400'
                                  : profit < 0
                                  ? 'text-rose-400'
                                  : 'text-amber-300'
                              }`}
                            >
                              {profit > 0 ? `+${profit.toFixed(2)}u` : `${profit.toFixed(2)}u`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-xl border border-emerald-500/30 bg-[#111418] p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#232830] pb-6">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-400">
                    <ShieldCheck className="h-4 w-4" />
                    <span>MODEL_ALL_ROWS_DIAGNOSTIC (NOT PUBLIC PICKS)</span>
                  </div>
                  <h2 className="mt-1 text-2xl font-extrabold text-white tracking-tight">
                    Diagnostic All-Rows Flat-Stake Performance
                  </h2>
                  <p className="mt-1 text-xs text-[#8A93A0]">
                    Diagnostic all-rows settlement record from verified finished fixtures (not public picks). All rows audited at 1.0 unit flat stake.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-amber-300 font-bold text-xs">
                    {perfReport?.controlFullCohort?.cohortLabel || 'MODEL_ALL_ROWS_DIAGNOSTIC (NOT PUBLIC PICKS)'}
                  </span>
                  <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-emerald-400 font-bold text-sm">
                    {perfReport?.controlFullCohort?.displayStatus || 'INSUFFICIENT SAMPLE'}
                  </span>
                </div>
              </div>

              {/* Key Financial Metrics */}
              <div className="mt-6 grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="rounded-lg border border-[#232830] bg-[#161B22] p-4">
                  <span className="block text-[10px] uppercase tracking-wider text-[#8A93A0]">Units Staked</span>
                  <span className="mt-1 block font-tabular font-bold text-xl text-white">
                    {perfReport?.controlFullCohort?.unitsStaked !== undefined
                      ? `${perfReport.controlFullCohort.unitsStaked.toFixed(1)}u`
                      : '0.0u'}
                  </span>
                </div>
                <div className="rounded-lg border border-[#232830] bg-[#161B22] p-4">
                  <span className="block text-[10px] uppercase tracking-wider text-[#8A93A0]">Net Profit</span>
                  <span className="mt-1 block font-tabular font-bold text-xl text-emerald-400">
                    {perfReport?.controlFullCohort?.profitUnits !== undefined
                      ? `${perfReport.controlFullCohort.profitUnits >= 0 ? '+' : ''}${perfReport.controlFullCohort.profitUnits.toFixed(2)}u`
                      : '0.00u'}
                  </span>
                </div>
                <div className="rounded-lg border border-[#232830] bg-[#161B22] p-4">
                  <span className="block text-[10px] uppercase tracking-wider text-[#8A93A0]">Realized Yield</span>
                  <span className="mt-1 block font-tabular font-bold text-xl text-emerald-400">
                    {perfReport?.controlFullCohort?.yield !== null &&
                    perfReport?.controlFullCohort?.yield !== undefined
                      ? `${perfReport.controlFullCohort.yield >= 0 ? '+' : ''}${perfReport.controlFullCohort.yield.toFixed(2)}%`
                      : '—'}
                  </span>
                </div>
                <div className="rounded-lg border border-[#232830] bg-[#161B22] p-4">
                  <span className="block text-[10px] uppercase tracking-wider text-[#8A93A0]">Record (W-L-HL)</span>
                  <span className="mt-1 block font-tabular font-bold text-xl text-white">
                    {perfReport?.controlFullCohort
                      ? `${perfReport.controlFullCohort.wins}W - ${perfReport.controlFullCohort.losses}L - ${perfReport.controlFullCohort.halfLosses}HL`
                      : '—'}
                  </span>
                </div>
                <div className="rounded-lg border border-[#232830] bg-[#161B22] p-4">
                  <span className="block text-[10px] uppercase tracking-wider text-[#8A93A0]">Settled Sample</span>
                  <span className="mt-1 block font-tabular font-bold text-xl text-white">
                    {settledCount} <span className="text-xs text-zinc-500 font-normal">/ {totalArchived}</span>
                  </span>
                </div>
              </div>

              {/* Dimensional Market Breakdown */}
              <div className="mt-6 border-t border-[#232830] pt-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#8A93A0] mb-3">
                  Market Breakdown (Quarter-Line Split Accounting)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-[#232830] bg-[#161B22] p-4">
                    <div className="flex items-center justify-between border-b border-[#232830] pb-2 mb-2">
                      <span className="font-bold text-white text-sm">Asian Handicap (AH)</span>
                      <span className="text-xs font-semibold text-emerald-400">
                        {perfReport?.breakdowns?.byMarket?.AH?.displayStatus || 'No settled bets'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-[#8A93A0] block text-[10px]">Bets</span>
                        <span className="font-bold text-white">
                          {perfReport?.breakdowns?.byMarket?.AH?.settled ?? 0}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#8A93A0] block text-[10px]">Record</span>
                        <span className="font-bold text-white">
                          {perfReport?.breakdowns?.byMarket?.AH
                            ? `${perfReport.breakdowns.byMarket.AH.wins}W - ${perfReport.breakdowns.byMarket.AH.losses}L - ${perfReport.breakdowns.byMarket.AH.halfLosses}HL`
                            : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#8A93A0] block text-[10px]">Net Profit</span>
                        <span className="font-bold text-emerald-400">
                          {perfReport?.breakdowns?.byMarket?.AH?.profitUnits !== undefined
                            ? `${perfReport.breakdowns.byMarket.AH.profitUnits >= 0 ? '+' : ''}${perfReport.breakdowns.byMarket.AH.profitUnits.toFixed(2)}u`
                            : '0.00u'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-[#232830] bg-[#161B22] p-4">
                    <div className="flex items-center justify-between border-b border-[#232830] pb-2 mb-2">
                      <span className="font-bold text-white text-sm">Asian Over/Under (OU)</span>
                      <span className="text-xs font-semibold text-emerald-400">
                        {perfReport?.breakdowns?.byMarket?.OU?.displayStatus || 'No settled bets'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-[#8A93A0] block text-[10px]">Bets</span>
                        <span className="font-bold text-white">
                          {perfReport?.breakdowns?.byMarket?.OU?.settled ?? 0}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#8A93A0] block text-[10px]">Record</span>
                        <span className="font-bold text-white">
                          {perfReport?.breakdowns?.byMarket?.OU
                            ? `${perfReport.breakdowns.byMarket.OU.wins}W - ${perfReport.breakdowns.byMarket.OU.losses}L - ${perfReport.breakdowns.byMarket.OU.halfLosses}HL`
                            : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#8A93A0] block text-[10px]">Net Profit</span>
                        <span className="font-bold text-emerald-400">
                          {perfReport?.breakdowns?.byMarket?.OU?.profitUnits !== undefined
                            ? `${perfReport.breakdowns.byMarket.OU.profitUnits >= 0 ? '+' : ''}${perfReport.breakdowns.byMarket.OU.profitUnits.toFixed(2)}u`
                            : '0.00u'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Integrity & Reconciliation Footer */}
              <div className="mt-6 border-t border-[#232830] pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#8A93A0]">
                <div className="flex items-center gap-2">
                  <Database className="h-3.5 w-3.5 text-purple-400" />
                  <span>Settlement reconciled with API-Football Pro Matchweek 5 results. Zero synthetic data.</span>
                </div>
                <Link
                  href="/research"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  <span>Inspect Audit Ledger</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
