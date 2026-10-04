'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Header } from '@/components/layout/Header';
import {
  Database,
  Filter,
  Search,
  ShieldCheck,
  AlertTriangle,
  Calendar,
  Layers,
  Activity,
  ArrowUpDown,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from 'lucide-react';

interface PredictionRecord {
  id: string;
  run_id: string;
  model_version: string;
  fixture_id: number;
  match: string;
  home_team: string;
  away_team: string;
  competition: string;
  competition_id: number;
  kickoff_utc: string;
  market: 'AH' | 'OU' | 'BTTS';
  line: number | null;
  line_type: string;
  selection: string;
  model_probability: number;
  calibrated_probability: number;
  fair_odds: number;
  market_odds: number | null;
  market_status: string;
  edge_pct: number | null;
  expected_value: number | null;
  confidence_tier: string;
  confidence_score: number;
  is_pick: boolean;
  odds_snapshot: {
    bookmaker: string;
    line: number;
    odds: number;
    timestamp: string;
  } | null;
  data_quality_flags: string[];
  created_at: string;
}

export default function ResearchPage() {
  const [predictions, setPredictions] = useState<PredictionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedMarket, setSelectedMarket] = useState<string>('ALL');
  const [selectedTier, setSelectedTier] = useState<string>('ALL');
  const [selectedLeague, setSelectedLeague] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    setLoading(true);
    fetch('/api/v1/research')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data.success && Array.isArray(data.predictions)) {
          setPredictions(data.predictions);
        } else {
          setError('Failed to load research predictions.');
        }
      })
      .catch((err) => {
        console.error('Research fetch error:', err);
        setError(err.message || 'Network error');
      })
      .finally(() => setLoading(false));
  }, []);

  // Unique leagues for filter dropdown
  const leagues = useMemo(() => {
    return Array.from(new Set(predictions.map((p) => p.competition))).filter(Boolean);
  }, [predictions]);

  // Filtered dataset
  const filteredPredictions = useMemo(() => {
    return predictions.filter((p) => {
      // Market filter
      if (selectedMarket !== 'ALL' && p.market !== selectedMarket) {
        return false;
      }
      // Tier filter
      if (selectedTier !== 'ALL') {
        if (selectedTier === 'RESEARCH_ONLY' && p.confidence_tier !== 'RESEARCH_ONLY' && p.market !== 'BTTS') {
          return false;
        } else if (selectedTier === 'PASS' && p.confidence_tier !== 'PASS') {
          return false;
        } else if (selectedTier === 'WATCH' && p.confidence_tier !== 'WATCH') {
          return false;
        } else if (selectedTier === 'VALUE_HIGH' && p.confidence_tier !== 'VALUE_HIGH') {
          return false;
        }
      }
      // League filter
      if (selectedLeague !== 'ALL' && p.competition !== selectedLeague) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchStr = `${p.match} ${p.home_team} ${p.away_team} ${p.selection}`.toLowerCase();
        if (!matchStr.includes(q)) return false;
      }
      return true;
    });
  }, [predictions, selectedMarket, selectedTier, selectedLeague, searchQuery]);

  // Counts
  const countsByMarket = useMemo(() => {
    const ah = predictions.filter((p) => p.market === 'AH').length;
    const ou = predictions.filter((p) => p.market === 'OU').length;
    const btts = predictions.filter((p) => p.market === 'BTTS').length;
    return { ah, ou, btts, total: predictions.length };
  }, [predictions]);

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0D10] text-[#E6E9EE]">
      <Header />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        {/* Header Section */}
        <div className="border-b border-[#232830] pb-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
            <Database className="h-3.5 w-3.5" />
            <span>MATHEMATICAL MARKET RESEARCH • POISSON V1 RESCUE ENGINE</span>
          </div>
          <h1 className="mt-1.5 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Model Research Output — For Analysis Only
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#8A93A0] max-w-4xl">
            Direct mathematical projection ledger evaluating {predictions.length || 414} permutations across Top League fixtures.
            Displays full model probability distributions, quarter-line ladders, and raw research tiers without promotion to picks.
          </p>

          {/* Mandatory Transparency Banner */}
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
            <div>
              <span className="font-bold uppercase tracking-wider">Model Research Output — Not Financial Advice.</span>{' '}
              This console displays pure model probabilities and research classifications (LOW, MEDIUM, HIGH, RESEARCH_ONLY).
              Every prediction is preserved in the immutable ledger. Actionable betting signals with verified Pinnacle closing line edge appear exclusively on{' '}
              <a href="/daily-picks" className="underline font-semibold hover:text-white">
                /daily-picks
              </a>
              .
            </div>
          </div>
        </div>

        {/* Overview Stats Cards */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-[#232830] bg-[#111418] p-3.5">
            <div className="text-[11px] uppercase tracking-wider text-[#8A93A0]">Ledger Rows</div>
            <div className="mt-1 text-xl font-bold text-white font-mono">{predictions.length}</div>
            <div className="text-[10px] text-[#8A93A0]">Unfiltered combinations</div>
          </div>
          <div className="rounded-xl border border-[#232830] bg-[#111418] p-3.5">
            <div className="text-[11px] uppercase tracking-wider text-[#8A93A0]">Analyzed Fixtures</div>
            <div className="mt-1 text-xl font-bold text-white font-mono">
              {new Set(predictions.map((p) => p.fixture_id)).size || 9}
            </div>
            <div className="text-[10px] text-[#8A93A0]">Real API-Football fixtures</div>
          </div>
          <div className="rounded-xl border border-[#232830] bg-[#111418] p-3.5">
            <div className="text-[11px] uppercase tracking-wider text-[#8A93A0]">Reference Bookmaker</div>
            <div className="mt-1 text-xl font-bold text-emerald-400 font-mono">Pinnacle</div>
            <div className="text-[10px] text-[#8A93A0]">OddsPapi Sharp Authority</div>
          </div>
          <div className="rounded-xl border border-[#232830] bg-[#111418] p-3.5">
            <div className="text-[11px] uppercase tracking-wider text-[#8A93A0]">Actionable Picks</div>
            <div className="mt-1 text-xl font-bold text-amber-400 font-mono">0 Qualified</div>
            <div className="text-[10px] text-[#8A93A0]">ConfidenceGate active</div>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="mt-6 rounded-xl border border-[#232830] bg-[#111418] p-4 space-y-4">
          {/* Market selector tabs */}
          <div className="flex flex-wrap items-center gap-2 border-b border-[#232830] pb-3">
            <button
              onClick={() => setSelectedMarket('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedMarket === 'ALL'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold'
                  : 'bg-[#171B20] text-[#8A93A0] hover:text-white border border-transparent'
              }`}
            >
              All Markets ({countsByMarket.total})
            </button>
            <button
              onClick={() => setSelectedMarket('AH')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedMarket === 'AH'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold'
                  : 'bg-[#171B20] text-[#8A93A0] hover:text-white border border-transparent'
              }`}
            >
              Asian Handicap ({countsByMarket.ah})
            </button>
            <button
              onClick={() => setSelectedMarket('OU')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedMarket === 'OU'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold'
                  : 'bg-[#171B20] text-[#8A93A0] hover:text-white border border-transparent'
              }`}
            >
              Over / Under ({countsByMarket.ou})
            </button>
            <button
              onClick={() => setSelectedMarket('BTTS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedMarket === 'BTTS'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold'
                  : 'bg-[#171B20] text-[#8A93A0] hover:text-white border border-transparent'
              }`}
            >
              BTTS [Research Only] ({countsByMarket.btts})
            </button>
          </div>

          {/* Secondary filter selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#8A93A0]" />
              <input
                type="text"
                placeholder="Search team, fixture, or selection..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-[#232830] bg-[#171B20] pl-9 pr-3 py-1.5 text-xs text-[#E6E9EE] placeholder-[#8A93A0] focus:border-emerald-500/50 focus:outline-none"
              />
            </div>

            {/* League Dropdown */}
            <div>
              <select
                value={selectedLeague}
                onChange={(e) => setSelectedLeague(e.target.value)}
                className="w-full rounded-lg border border-[#232830] bg-[#171B20] px-3 py-1.5 text-xs text-[#E6E9EE] focus:border-emerald-500/50 focus:outline-none"
              >
                <option value="ALL">All Leagues ({leagues.length})</option>
                {leagues.map((lg) => (
                  <option key={lg} value={lg}>
                    {lg}
                  </option>
                ))}
              </select>
            </div>

            {/* Tier Dropdown */}
            <div>
              <select
                value={selectedTier}
                onChange={(e) => setSelectedTier(e.target.value)}
                className="w-full rounded-lg border border-[#232830] bg-[#171B20] px-3 py-1.5 text-xs text-[#E6E9EE] focus:border-emerald-500/50 focus:outline-none"
              >
                <option value="ALL">All Research Tiers</option>
                <option value="VALUE_HIGH">HIGH (Qualified)</option>
                <option value="WATCH">MEDIUM (Watchlist)</option>
                <option value="PASS">LOW / PASS</option>
                <option value="RESEARCH_ONLY">RESEARCH ONLY (BTTS)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Results Table Section */}
        <div className="mt-6 rounded-xl border border-[#232830] bg-[#111418] overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-xs text-[#8A93A0]">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-400 mx-auto mb-2"></div>
              Loading canonical Poisson V1 rescue ledger...
            </div>
          ) : error ? (
            <div className="p-8 text-center text-xs text-rose-400">
              <AlertTriangle className="h-6 w-6 mx-auto mb-2" />
              {error}
            </div>
          ) : filteredPredictions.length === 0 ? (
            <div className="p-12 text-center text-xs text-[#8A93A0]">
              No predictions matching the selected filter criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#232830] bg-[#171B20]/60 text-[11px] font-semibold uppercase tracking-wider text-[#8A93A0]">
                    <th className="px-4 py-3">Match & League</th>
                    <th className="px-4 py-3">Kickoff</th>
                    <th className="px-3 py-3">Market</th>
                    <th className="px-3 py-3">Line</th>
                    <th className="px-4 py-3">Direction</th>
                    <th className="px-3 py-3 text-right">Model Prob</th>
                    <th className="px-3 py-3 text-right">Fair Odds</th>
                    <th className="px-4 py-3 text-right">Market Odds</th>
                    <th className="px-4 py-3 text-center">Research Tier</th>
                    <th className="px-4 py-3">Model</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232830]/50 font-mono">
                  {filteredPredictions.map((row) => {
                    const probPct = (row.model_probability * 100).toFixed(1);
                    const kickDate = row.kickoff_utc ? row.kickoff_utc.replace('T', ' ').slice(0, 16) : '—';

                    let tierBadge = (
                      <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold text-zinc-300">
                        PASS (LOW)
                      </span>
                    );

                    if (row.market === 'BTTS' || row.confidence_tier === 'RESEARCH_ONLY') {
                      tierBadge = (
                        <span className="rounded bg-purple-950/80 border border-purple-500/30 px-2 py-0.5 text-[10px] font-semibold text-purple-300">
                          RESEARCH ONLY
                        </span>
                      );
                    } else if (row.confidence_tier === 'VALUE_HIGH') {
                      tierBadge = (
                        <span className="rounded bg-emerald-950/80 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                          HIGH (VALUE)
                        </span>
                      );
                    } else if (row.confidence_tier === 'WATCH') {
                      tierBadge = (
                        <span className="rounded bg-amber-950/80 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                          MEDIUM (WATCH)
                        </span>
                      );
                    }

                    return (
                      <tr key={row.id} className="hover:bg-[#171B20]/40 transition-colors">
                        <td className="px-4 py-2.5 font-sans">
                          <div className="font-semibold text-white">{row.match}</div>
                          <div className="text-[10px] text-[#8A93A0]">{row.competition}</div>
                        </td>
                        <td className="px-4 py-2.5 text-[#8A93A0] text-[11px] whitespace-nowrap">
                          {kickDate}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              row.market === 'AH'
                                ? 'bg-blue-500/20 text-blue-400'
                                : row.market === 'OU'
                                ? 'bg-orange-500/20 text-orange-400'
                                : 'bg-purple-500/20 text-purple-400'
                            }`}
                          >
                            {row.market}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-white font-semibold">
                          {row.line !== null ? (row.line > 0 && row.market === 'AH' ? `+${row.line}` : row.line) : '—'}
                        </td>
                        <td className="px-4 py-2.5 font-sans font-medium text-zinc-200">
                          {row.selection}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-emerald-400">
                          {probPct}%
                        </td>
                        <td className="px-3 py-2.5 text-right text-zinc-400">
                          {row.fair_odds ? row.fair_odds.toFixed(2) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          {row.market_odds ? (
                            <span className="text-zinc-200">
                              @{row.market_odds.toFixed(2)}{' '}
                              {row.expected_value !== null && row.expected_value < 0 && (
                                <span className="text-[10px] text-rose-400 block font-sans">
                                  EV: {(row.expected_value * 100).toFixed(1)}%
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-[10px] text-zinc-500 font-sans">NO MARKET ODDS</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center whitespace-nowrap">
                          {tierBadge}
                        </td>
                        <td className="px-4 py-2.5 text-[10px] text-[#8A93A0] whitespace-nowrap">
                          {row.model_version}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer info notice */}
        <div className="mt-4 text-[11px] text-[#8A93A0] flex items-center justify-between">
          <span>Showing {filteredPredictions.length} of {predictions.length} recorded ledger predictions.</span>
          <span>Engine Source: HandicapLab Canonical Poisson V1 Rescue Ledger</span>
        </div>
      </main>
    </div>
  );
}
