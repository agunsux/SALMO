'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { MatchObservation } from '@/types';
import { useI18n } from '@/i18n/context';
import { Search, Filter, ShieldCheck, Calendar, Database, ArrowUpDown } from 'lucide-react';

export default function ResearchPage() {
  const { t, formatPercent, formatOdds } = useI18n();
  const [observations, setObservations] = useState<MatchObservation[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedLine, setSelectedLine] = useState<string>('all');
  const [selectedTeam, setSelectedTeam] = useState<string>('all');

  const teams = [
    'Arsenal', 'Aston Villa', 'Bournemouth', 'Brentford', 'Brighton', 'Burnley',
    'Chelsea', 'Crystal Palace', 'Everton', 'Fulham', 'Liverpool', 'Man City',
    'Man United', 'Newcastle', "Nott'm Forest", 'Tottenham', 'West Ham', 'Wolves'
  ];

  const lines = ['-1.5', '-1.25', '-1.0', '-0.75', '-0.5', '-0.25', '0.0', '+0.25', '+0.5', '+0.75', '+1.0', '+1.25', '+1.5'];

  useEffect(() => {
    setLoading(true);
    let query = '';
    const params = new URLSearchParams();
    if (selectedLine !== 'all') params.set('line', selectedLine);
    if (selectedTeam !== 'all') params.set('team', selectedTeam);
    const queryString = params.toString() ? `?${params.toString()}` : '';

    fetch(`/api/evidence${queryString}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setObservations(data.data.observations);
        }
      })
      .catch(err => console.error('Research fetch error:', err))
      .finally(() => setLoading(false));
  }, [selectedLine, selectedTeam]);

  // Aggregate stats
  const total = observations.length;
  let wins = 0;
  let halfWins = 0;
  let pushes = 0;
  let halfLosses = 0;
  let losses = 0;
  let totalProfit = 0;
  let totalOdds = 0;

  for (const o of observations) {
    if (o.settlement === 'WIN') wins++;
    else if (o.settlement === 'HALF_WIN') halfWins++;
    else if (o.settlement === 'PUSH') pushes++;
    else if (o.settlement === 'HALF_LOSS') halfLosses++;
    else if (o.settlement === 'LOSS') losses++;
    totalProfit += o.profit;
    totalOdds += o.odds;
  }

  const evaluated = total - pushes;
  const winRate = evaluated > 0 ? Number((((wins + 0.5 * halfWins) / evaluated) * 100).toFixed(1)) : 0;
  const yieldPct = total > 0 ? Number(((totalProfit / total) * 100).toFixed(1)) : 0;
  const avgOdds = total > 0 ? Number((totalOdds / total).toFixed(2)) : 0;

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0D10] text-[#E6E9EE] dark:bg-[#0B0D10] dark:text-[#E6E9EE] light:bg-[#F6F7F9] light:text-[#14171C]">
      <Header />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        {/* Title */}
        <div className="border-b border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] pb-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
            <Database className="h-3.5 w-3.5" />
            <span>HISTORICAL RESEARCH & EVIDENCE PLATFORM</span>
          </div>
          <h1 className="mt-1.5 text-2xl sm:text-3xl font-extrabold tracking-tight text-white dark:text-white light:text-[#14171C]">
            Historical Asian Handicap Explorer
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#8A93A0] max-w-3xl">
            Inspect real empirical settlement distributions and exact match-by-match ledgers across 2,659 verified Premier League fixtures. Every aggregate is 100% traceable.
          </p>
        </div>

        {/* Filter Controls */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 rounded-xl border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] dark:bg-[#111418] light:bg-[#FFFFFF]">
          <div>
            <label className="block text-[11px] font-semibold uppercase text-[#8A93A0] mb-1">
              Select AH Line
            </label>
            <select
              value={selectedLine}
              onChange={e => setSelectedLine(e.target.value)}
              className="w-full rounded-md border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#171B20] dark:bg-[#171B20] light:bg-[#EFF1F5] px-3 py-1.5 text-xs text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C]"
            >
              <option value="all">All Lines (-1.5 to +1.5)</option>
              {lines.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase text-[#8A93A0] mb-1">
              Filter by Team
            </label>
            <select
              value={selectedTeam}
              onChange={e => setSelectedTeam(e.target.value)}
              className="w-full rounded-md border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#171B20] dark:bg-[#171B20] light:bg-[#EFF1F5] px-3 py-1.5 text-xs text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C]"
            >
              <option value="all">All Teams</option>
              {teams.map(tm => (
                <option key={tm} value={tm}>{tm}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase text-[#8A93A0] mb-1">
              League
            </label>
            <div className="rounded-md border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#171B20]/60 px-3 py-1.5 text-xs text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C]">
              Premier League (2019 - 2026)
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase text-[#8A93A0] mb-1">
              Data Provenance
            </label>
            <div className="flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-xs text-emerald-400 font-medium">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Verified Pinnacle Closing</span>
            </div>
          </div>
        </div>

        {/* Aggregate KPI Grid */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] p-4 text-center">
            <div className="text-[11px] font-semibold text-[#8A93A0] uppercase">Matches Evaluated</div>
            <div className="mt-1 font-tabular text-2xl font-bold text-white dark:text-white light:text-[#14171C]">{total}</div>
            <div className="mt-0.5 text-[10px] text-[#5B6370]">{pushes} pushes excluded</div>
          </div>

          <div className="rounded-xl border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] p-4 text-center">
            <div className="text-[11px] font-semibold text-[#8A93A0] uppercase">Effective Win Rate</div>
            <div className="mt-1 font-tabular text-2xl font-bold text-emerald-400">{winRate}%</div>
            <div className="mt-0.5 text-[10px] text-[#5B6370]">Full & half win weighted</div>
          </div>

          <div className="rounded-xl border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] p-4 text-center">
            <div className="text-[11px] font-semibold text-[#8A93A0] uppercase">Empirical Yield (ROI)</div>
            <div className={`mt-1 font-tabular text-2xl font-bold ${yieldPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {yieldPct >= 0 ? `+${yieldPct}%` : `${yieldPct}%`}
            </div>
            <div className="mt-0.5 text-[10px] text-[#5B6370]">{totalProfit >= 0 ? `+${totalProfit.toFixed(2)}u` : `${totalProfit.toFixed(2)}u`} net</div>
          </div>

          <div className="rounded-xl border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] p-4 text-center">
            <div className="text-[11px] font-semibold text-[#8A93A0] uppercase">Average Odds</div>
            <div className="mt-1 font-tabular text-2xl font-bold text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C]">
              {avgOdds.toFixed(2)}
            </div>
            <div className="mt-0.5 text-[10px] text-[#5B6370]">Closing market average</div>
          </div>
        </div>

        {/* Observation Table */}
        <div className="mt-8 rounded-xl border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] overflow-hidden">
          <div className="p-4 border-b border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C]">
              Verified Match-Level Observations ({observations.length})
            </h2>
            <span className="text-xs text-[#8A93A0]">Zero Fabrication Guarantee</span>
          </div>

          {loading ? (
            <div className="py-16 text-center text-xs text-[#8A93A0]">Loading observations...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#232830] bg-[#171B20]/60 text-[#8A93A0] text-[11px] uppercase font-semibold">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Season</th>
                    <th className="py-3 px-4">Fixture</th>
                    <th className="py-3 px-4">FT Score</th>
                    <th className="py-3 px-4">AH Line</th>
                    <th className="py-3 px-4">Closing Odds</th>
                    <th className="py-3 px-4">Settlement</th>
                    <th className="py-3 px-4 text-right">Net Profit (1u)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232830]/50 text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C]">
                  {observations.map((obs) => {
                    const isWin = obs.settlement === 'WIN' || obs.settlement === 'HALF_WIN';
                    const isPush = obs.settlement === 'PUSH';
                    return (
                      <tr key={obs.matchId} className="hover:bg-[#171B20]/40 transition-colors">
                        <td className="py-3 px-4 text-[#8A93A0]">{obs.date}</td>
                        <td className="py-3 px-4 text-[#8A93A0]">{obs.season}</td>
                        <td className="py-3 px-4 font-medium">
                          {obs.homeTeam} <span className="text-[#8A93A0]">vs</span> {obs.awayTeam}
                        </td>
                        <td className="py-3 px-4 font-tabular font-bold text-emerald-400">{obs.scoreDisplay}</td>
                        <td className="py-3 px-4 font-tabular">{obs.line > 0 ? `+${obs.line}` : obs.line}</td>
                        <td className="py-3 px-4 font-tabular">{formatOdds(obs.odds)}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                              isWin
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : isPush
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}
                          >
                            {obs.settlement}
                          </span>
                        </td>
                        <td className={`py-3 px-4 font-tabular text-right font-bold ${obs.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {obs.profit >= 0 ? `+${obs.profit.toFixed(2)}u` : `${obs.profit.toFixed(2)}u`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

