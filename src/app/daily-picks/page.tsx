'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ShieldCheck, CheckCircle2, AlertTriangle, XCircle, ArrowUpRight, Filter, Info, Database } from 'lucide-react';
import Link from 'next/link';
import { isPublicPickEligible, classifyDailyPicksState } from '@/lib/eligibility';

interface DailyPickDTO {
  id: string;
  fixtureId: string;
  match: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  kickoffUtc: string;
  marketType: 'ASIAN_HANDICAP' | 'OVER_UNDER' | 'BTTS';
  selection: string;
  modelProbabilityPct: number | null;
  fairOdds: number | null;
  marketOdds: number | null;
  marketBookmaker: string;
  edgePct: number;
  expectedValuePct: number | null;
  confidence: number;
  verdict: 'LAYAK' | 'PANTAU' | 'LEWATI';
  modelVersion?: string | null;
  reasoning: string;
  rejectionReason?: string | null;
  status: string;
}

export default function DailyPicksPage() {
  const [picks, setPicks] = useState<DailyPickDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiStatus, setApiStatus] = useState<'LOADING' | 'AVAILABLE' | 'DATA_UNAVAILABLE' | 'NO_QUALIFIED_PICKS'>('LOADING');
  const [referenceTimeMs, setReferenceTimeMs] = useState<number | null>(null);
  const [missingDataReasons, setMissingDataReasons] = useState<string[]>([]);
  const [providerStatus, setProviderStatus] = useState<Record<string, any> | null>(null);
  const [freshness, setFreshness] = useState<any | null>(null);
  const [upcomingFixturesCount, setUpcomingFixturesCount] = useState<number>(0);

  const [verdictFilter, setVerdictFilter] = useState<'ALL' | 'LAYAK' | 'PANTAU' | 'LEWATI'>('ALL');
  const [marketFilter, setMarketFilter] = useState<'ALL' | 'ASIAN_HANDICAP' | 'OVER_UNDER' | 'BTTS'>('ALL');

  useEffect(() => {
    fetch('/api/daily-picks')
      .then(async res => {
        const dateHeader = res.headers.get('date');
        const headerTimeMs = dateHeader ? new Date(dateHeader).getTime() : null;
        const json = await res.json();
        return { json, headerTimeMs };
      })
      .then(({ json, headerTimeMs }) => {
        if (json.success && json.data) {
          setPicks(json.data);
          if (Array.isArray(json.missingDataReasons)) setMissingDataReasons(json.missingDataReasons);
          if (json.providerStatus) setProviderStatus(json.providerStatus);
          if (json.freshness) setFreshness(json.freshness);
          if (typeof json.upcomingFixturesCount === 'number') setUpcomingFixturesCount(json.upcomingFixturesCount);

          const payloadTime = json.timestampUtc || json.timestamp;
          const refMs = payloadTime
            ? new Date(payloadTime).getTime()
            : (headerTimeMs && !isNaN(headerTimeMs)
                ? headerTimeMs
                : Date.now());
          setReferenceTimeMs(refMs);
          setApiStatus(json.status || (json.data.length > 0 ? 'AVAILABLE' : 'NO_QUALIFIED_PICKS'));
        } else {
          setApiStatus('DATA_UNAVAILABLE');
        }
      })
      .catch(err => {
        console.error('Failed to load daily picks:', err);
        setApiStatus('DATA_UNAVAILABLE');
      })
      .finally(() => setLoading(false));
  }, []);

  const effectiveRefTime = referenceTimeMs ?? 0;
  const classification = classifyDailyPicksState(picks, effectiveRefTime);
  const eligiblePicks = (classification.eligiblePicks as DailyPickDTO[]);
  const currentPicks = (classification.currentPicks as DailyPickDTO[]);

  const filteredPicks = eligiblePicks.filter(p => {
    if (verdictFilter !== 'ALL' && p.verdict !== verdictFilter) return false;
    if (marketFilter !== 'ALL' && p.marketType !== marketFilter) return false;
    return true;
  });

  const layakCount = eligiblePicks.filter(p => p.verdict === 'LAYAK').length;
  const pantauCount = currentPicks.filter(p => p.verdict === 'PANTAU').length;
  const lewatiCount = currentPicks.filter(p => p.verdict === 'LEWATI').length;

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0D10] text-[#E6E9EE]">
      <Header />

      <section className="mx-auto w-full max-w-7xl px-4 pt-6 pb-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-[#232830] pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>CANONICAL PRODUCTION PICKS</span>
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Daily Qualified Picks
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#8A93A0]">
              Strictly vetted recommendations from HandicapLab Q1–Q4 canonical pipeline. Fail-closed: Zero synthetic picks.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-400 font-semibold">
              LAYAK: {layakCount}
            </span>
            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-amber-400 font-medium">
              PANTAU: {pantauCount}
            </span>
            <span className="rounded border border-zinc-700 bg-zinc-800/60 px-2.5 py-1 text-zinc-400">
              LEWATI: {lewatiCount}
            </span>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#232830] bg-[#111418] p-3">
          <div className="flex items-center gap-2 overflow-x-auto text-xs">
            <span className="text-[11px] font-bold uppercase text-[#8A93A0] mr-1 flex items-center gap-1">
              <Filter className="h-3 w-3" /> Verdict:
            </span>
            {(['ALL', 'LAYAK', 'PANTAU', 'LEWATI'] as const).map(v => (
              <button
                key={v}
                onClick={() => setVerdictFilter(v)}
                className={`rounded px-2.5 py-1 font-medium transition-colors ${
                  verdictFilter === v
                    ? v === 'LAYAK'
                      ? 'bg-emerald-500 text-black font-bold'
                      : v === 'PANTAU'
                      ? 'bg-amber-500 text-black font-bold'
                      : 'bg-zinc-200 text-black font-bold'
                    : 'bg-[#171B20] text-[#8A93A0] hover:text-white border border-[#232830]'
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto text-xs">
            <span className="text-[11px] font-bold uppercase text-[#8A93A0] mr-1">Market:</span>
            {[
              { id: 'ALL', label: 'All' },
              { id: 'ASIAN_HANDICAP', label: 'Asian Handicap' },
              { id: 'OVER_UNDER', label: 'Over / Under' },
              { id: 'BTTS', label: 'BTTS' },
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setMarketFilter(m.id as any)}
                className={`rounded px-2.5 py-1 font-medium transition-colors ${
                  marketFilter === m.id
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'bg-[#171B20] text-[#8A93A0] hover:text-white border border-[#232830]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-4 sm:px-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <p className="mt-4 text-xs font-medium text-[#8A93A0]">Loading canonical daily picks...</p>
          </div>
        ) : apiStatus === 'DATA_UNAVAILABLE' ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-12 text-center">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/10 text-rose-400 mb-3">
              <XCircle className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-semibold text-rose-300">DATA_UNAVAILABLE</h3>
            <p className="mt-1 text-xs text-[#8A93A0] max-w-md mx-auto">
              SALMO canonical data service is currently unavailable. As a fail-closed consumer, SALMO does not generate synthetic picks.
            </p>
          </div>
        ) : apiStatus === 'NO_QUALIFIED_PICKS' || classification.state !== 'AVAILABLE' || filteredPicks.length === 0 ? (
          missingDataReasons.length > 0 || (providerStatus && Object.values(providerStatus).some((p: any) => p?.liveIngestion === 'BLOCKED')) ? (
            <div className="rounded-xl border border-amber-500/30 bg-[#161410] p-8 text-center max-w-2xl mx-auto">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-400 mb-3">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider">
                Upstream Data Providers Paused — Actionable Picks Locked
              </h3>
              <p className="mt-2 text-xs text-[#8A93A0] max-w-lg mx-auto">
                SALMO operates strictly fail-closed: zero synthetic or unvetted picks. Actionable daily recommendations remain locked until live sharp market feeds are restored and fresh pre-match odds are verified against the 24-hour SLA.
              </p>

              {/* Provider Telemetry Breakdown */}
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2 text-left">
                <div className="rounded border border-[#232830] bg-[#111418] p-2.5">
                  <div className="text-[10px] uppercase font-bold text-zinc-500">API-Football Pro</div>
                  <div className="text-xs font-semibold text-rose-400 mt-0.5">
                    {providerStatus?.apiFootball?.status || 'AUTH_FAILED'}
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-0.5 truncate" title={providerStatus?.apiFootball?.reason}>
                    {providerStatus?.apiFootball?.reason || 'Account suspended upstream'}
                  </div>
                </div>
                <div className="rounded border border-[#232830] bg-[#111418] p-2.5">
                  <div className="text-[10px] uppercase font-bold text-zinc-500">OddsPapi Sharp Odds</div>
                  <div className="text-xs font-semibold text-amber-400 mt-0.5">
                    {providerStatus?.oddsPapi?.status || 'QUOTA_BLOCKED'}
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-0.5 truncate" title={providerStatus?.oddsPapi?.reason}>
                    {providerStatus?.oddsPapi?.reason || 'Monthly quota exhausted (260/250)'}
                  </div>
                </div>
                <div className="rounded border border-[#232830] bg-[#111418] p-2.5">
                  <div className="text-[10px] uppercase font-bold text-zinc-500">FootyStats Free</div>
                  <div className="text-xs font-semibold text-zinc-400 mt-0.5">
                    {providerStatus?.footyStats?.status || 'AUTH_FAILED'}
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-0.5 truncate" title={providerStatus?.footyStats?.reason}>
                    {providerStatus?.footyStats?.reason || 'Demo key quarantined'}
                  </div>
                </div>
              </div>

              {/* Audit Log Reasons */}
              {missingDataReasons.length > 0 && (
                <div className="mt-4 rounded border border-[#232830] bg-[#0E1013] p-3 text-left">
                  <div className="text-[11px] font-semibold text-zinc-400 mb-1">Audit Log Reasons:</div>
                  <ul className="list-disc list-inside text-[11px] text-zinc-400 space-y-0.5">
                    {missingDataReasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 flex items-center justify-center gap-2 text-xs">
                <Link
                  href="/research"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 underline underline-offset-4"
                >
                  <span>Explore historical walk-forward models in Research</span>
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          ) : classification.state === 'ODDS_NOT_YET_AVAILABLE' ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-12 text-center">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-400 mb-3">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-wider">ODDS NOT YET AVAILABLE</h3>
              <p className="mt-1 text-xs text-[#8A93A0] max-w-md mx-auto">
                Model predictions are generated, but benchmark market odds are not yet posted or synchronized. Picks will qualify once liquid sharp lines open.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-[#232830] bg-[#111418] p-12 text-center">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#171B20] text-[#8A93A0] mb-3">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-semibold text-[#E6E9EE]">No Qualified Picks Today</h3>
              <p className="mt-1 text-xs text-[#8A93A0] max-w-md mx-auto">
                The model analyzed today&apos;s available markets, but no candidate met all qualification criteria.
              </p>
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPicks.map(pick => {
              const isLayak = pick.verdict === 'LAYAK';
              const isPantau = pick.verdict === 'PANTAU';

              return (
                <div
                  key={pick.id}
                  className={`rounded-xl border p-4 flex flex-col justify-between transition-all ${
                    isLayak
                      ? 'border-emerald-500/40 bg-[#111613] hover:border-emerald-500/70 shadow-sm'
                      : isPantau
                      ? 'border-amber-500/30 bg-[#161410] hover:border-amber-500/50'
                      : 'border-[#232830] bg-[#111418] opacity-75'
                  }`}
                >
                  <div>
                    {/* Card Top: Market & Verdict Badge */}
                    <div className="flex items-center justify-between border-b border-[#232830] pb-2.5 mb-3">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#8A93A0]">
                        {pick.marketType.replace('_', ' ')}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          isLayak
                            ? 'bg-emerald-500 text-black'
                            : isPantau
                            ? 'bg-amber-400 text-black'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {pick.verdict}
                      </span>
                    </div>

                    {/* Match & Kickoff */}
                    <div className="text-xs text-[#8A93A0] mb-1">
                      {pick.kickoffUtc ? `${pick.kickoffUtc.split('T')[0]} • ${pick.kickoffUtc.split('T')[1]?.slice(0, 5)} UTC` : ''}
                    </div>
                    <h3 className="text-base font-bold text-white mb-2">
                      {pick.homeTeam} <span className="text-zinc-500 font-normal">vs</span> {pick.awayTeam}
                    </h3>

                    {/* Selection & Reference Line */}
                    <div className="rounded-lg bg-[#171B20] p-2.5 mb-3 border border-[#232830]">
                      <div className="text-[11px] text-[#8A93A0]">Recommended Position</div>
                      <div className="text-sm font-extrabold text-emerald-400 mt-0.5">
                        {pick.selection}
                      </div>
                    </div>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                      <div className="rounded border border-[#232830] bg-[#0E1013] p-2">
                        <span className="block text-[10px] uppercase text-[#8A93A0]">P_model</span>
                        <span className="font-tabular font-bold text-white">
                          {pick.modelProbabilityPct !== null ? `${pick.modelProbabilityPct}%` : 'N/A'}
                        </span>
                      </div>
                      <div className="rounded border border-[#232830] bg-[#0E1013] p-2">
                        <span className="block text-[10px] uppercase text-[#8A93A0]">Fair Odds</span>
                        <span className="font-tabular font-bold text-white">
                          {pick.fairOdds !== null ? pick.fairOdds.toFixed(2) : 'N/A'}
                        </span>
                      </div>
                      <div className="rounded border border-[#232830] bg-[#0E1013] p-2">
                        <span className="block text-[10px] uppercase text-[#8A93A0]">Benchmark Odds</span>
                        <span className="font-tabular font-bold text-emerald-300">
                          {pick.marketOdds !== null ? pick.marketOdds.toFixed(2) : 'N/A'}
                        </span>
                      </div>
                      <div className="rounded border border-[#232830] bg-[#0E1013] p-2">
                        <span className="block text-[10px] uppercase text-[#8A93A0]">Confidence</span>
                        <span className="font-tabular font-bold text-blue-400">
                          {pick.confidence}/100
                        </span>
                      </div>
                    </div>

                    {/* Edge & EV pill */}
                    <div className="flex items-center justify-between text-[11px] text-[#8A93A0] border-t border-[#232830] pt-2 mb-2">
                      <span>Edge: <strong className={pick.edgePct > 0 ? 'text-emerald-400' : 'text-zinc-400'}>{pick.edgePct > 0 ? `+${pick.edgePct}%` : `${pick.edgePct}%`}</strong></span>
                      <span>EV: <strong className={pick.expectedValuePct && pick.expectedValuePct > 0 ? 'text-emerald-400' : 'text-zinc-400'}>{pick.expectedValuePct ? `${pick.expectedValuePct > 0 ? '+' : ''}${pick.expectedValuePct}%` : '0%'}</strong></span>
                    </div>

                    {/* Reasoning */}
                    <p className="text-[11px] text-[#8A93A0] italic border-l-2 border-zinc-700 pl-2 mt-2">
                      {pick.reasoning}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#232830] flex items-center justify-between text-[10px] text-zinc-500">
                    <span>Source: {pick.marketBookmaker || 'Benchmark'}</span>
                    <Link
                      href={`/match/${pick.fixtureId}`}
                      className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                    >
                      <span>Details</span>
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
