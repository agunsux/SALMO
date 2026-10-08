'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ExplainPopover } from '@/components/common/ExplainPopover';
import {
  Database,
  Filter,
  Search,
  ShieldCheck,
  AlertTriangle,
  Calendar,
  Layers,
  Activity,
  ArrowRight,
  HelpCircle,
  TrendingUp,
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
  fair_odds: number | null;
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
  const [dataTimestamp, setDataTimestamp] = useState<string>('');
  const [modelVersion, setModelVersion] = useState<string>('poisson_v1_rescue');

  // Filters
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [selectedDate, setSelectedDate] = useState<string>('ALL');
  const [selectedMarket, setSelectedMarket] = useState<string>('ALL');
  const [selectedTier, setSelectedTier] = useState<string>('ALL');
  const [selectedLeague, setSelectedLeague] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    fetch('/api/v1/research')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!isMounted) return;
        if (data.success && Array.isArray(data.predictions)) {
          setPredictions(data.predictions);
          if (data.timestampUtc) setDataTimestamp(data.timestampUtc);
          if (data.modelVersion) setModelVersion(data.modelVersion);
        } else {
          setError('Research is temporarily unavailable. Please try again.');
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('Research fetch error:', err);
        setError('Research is temporarily unavailable. Please try again.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Unique leagues for filter dropdown
  const leagues = useMemo(() => {
    return Array.from(new Set(predictions.map((p) => p.competition))).filter(Boolean).sort();
  }, [predictions]);

  // Unique dates for filter dropdown
  const availableDates = useMemo(() => {
    return Array.from(
      new Set(
        predictions
          .map((p) => (p.kickoff_utc ? p.kickoff_utc.split('T')[0] : ''))
          .filter(Boolean)
      )
    ).sort();
  }, [predictions]);

  // Dynamic calculations from real dataset
  const uniqueFixturesCount = useMemo(() => {
    return new Set(predictions.map((p) => p.fixture_id)).size;
  }, [predictions]);

  const qualifiedPicksCount = useMemo(() => {
    return predictions.filter((p) => p.is_pick).length;
  }, [predictions]);

  const highConfidenceCount = useMemo(() => {
    return predictions.filter(
      (p) => p.confidence_tier === 'HIGH' || p.confidence_tier === 'VALUE_HIGH'
    ).length;
  }, [predictions]);

  const oddsAvailableCount = useMemo(() => {
    return predictions.filter((p) => p.market_odds !== null && p.market_odds > 1.0).length;
  }, [predictions]);

  // Filtered dataset
  const filteredPredictions = useMemo(() => {
    return predictions.filter((p) => {
      // Date filter
      const pDate = p.kickoff_utc ? p.kickoff_utc.split('T')[0] : '';
      if (selectedDate === 'TODAY') {
        if (pDate !== todayStr) return false;
      } else if (selectedDate !== 'ALL') {
        if (pDate !== selectedDate) return false;
      }

      // Market filter
      if (selectedMarket !== 'ALL' && p.market !== selectedMarket) {
        return false;
      }

      // Tier filter
      if (selectedTier !== 'ALL') {
        if (selectedTier === 'RESEARCH_ONLY') {
          if (p.confidence_tier !== 'RESEARCH_ONLY' && p.market !== 'BTTS') return false;
        } else if (selectedTier === 'HIGH') {
          if (p.confidence_tier !== 'VALUE_HIGH' && p.confidence_tier !== 'HIGH') return false;
        } else if (selectedTier === 'MEDIUM') {
          if (p.confidence_tier !== 'WATCH' && p.confidence_tier !== 'MEDIUM') return false;
        } else if (selectedTier === 'LOW') {
          if (
            p.confidence_tier !== 'LOW' &&
            p.confidence_tier !== 'PASS' &&
            p.confidence_tier !== 'UNVERIFIED'
          )
            return false;
        }
      }

      // League filter
      if (selectedLeague !== 'ALL' && p.competition !== selectedLeague) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchStr = `${p.match} ${p.home_team} ${p.away_team} ${p.selection} ${p.competition}`.toLowerCase();
        if (!matchStr.includes(q)) return false;
      }

      return true;
    });
  }, [predictions, selectedDate, todayStr, selectedMarket, selectedTier, selectedLeague, searchQuery]);

  // Counts by market
  const countsByMarket = useMemo(() => {
    const ah = predictions.filter((p) => p.market === 'AH').length;
    const ou = predictions.filter((p) => p.market === 'OU').length;
    const btts = predictions.filter((p) => p.market === 'BTTS').length;
    return { ah, ou, btts, total: predictions.length };
  }, [predictions]);

  return (
    <div className="min-h-screen flex flex-col bg-[#F6F3EE] text-[#14110F]">
      <Header />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 space-y-6">
        {/* Top Header & Positioning Banner */}
        <div className="border-b border-[#E4DED4] pb-6">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-[#3B1515]">
            <Database className="h-3 w-3 text-[#E8664A]" />
            <span>01 / Market Research Workspace • {modelVersion}</span>
          </div>

          <h1 className="mt-2 font-serif text-3xl sm:text-4xl font-bold tracking-tight text-[#14110F]">
            Model Research Output
          </h1>

          <p className="mt-1.5 text-xs sm:text-sm text-[#6B645C] max-w-3xl font-sans leading-relaxed">
            Direct mathematical projection ledger evaluating pre-match permutations across canonical leagues.
            Displays full model probability distributions, line evaluation, and confidence tiers prior to qualification gating.
          </p>

          {/* Institutional Distinction Callout: Research ≠ Pick */}
          <div className="mt-4 rounded-lg border border-[#E4DED4] bg-white p-4 text-xs shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#3B1515] text-white text-[10px] font-mono font-bold">
                !
              </span>
              <div className="space-y-1">
                <div className="font-serif font-bold text-sm text-[#3B1515]">
                  CONFIDENCE ≠ PICK
                </div>
                <p className="text-[#6B645C] font-sans leading-relaxed">
                  CONFIDENCE ≠ PICK: A research record contains mathematical model analysis without being a qualified market pick. Confidence indicates model qualification level, not certainty of outcome. This console displays raw Poisson V1 probability distributions and research confidence tiers (HIGH CONFIDENCE, MEDIUM CONFIDENCE, LOW CONFIDENCE, RESEARCH ONLY). Actionable selections passing strict criteria appear exclusively on{' '}
                  <Link href="/picks" className="font-semibold text-[#3B1515] underline hover:text-[#2A0E0E]">
                    Picks Hub
                  </Link>
                  .
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Degraded Odds Notice if applicable */}
        {!loading && oddsAvailableCount === 0 && predictions.length > 0 && (
          <div className="rounded-lg border border-[#EDE8E0] bg-[#FAF8F5] p-3.5 flex items-start gap-3 text-xs">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-[#B06000]" />
            <div className="text-[#6B645C] font-sans">
              <strong className="text-[#14110F] font-semibold">Market data temporarily unavailable.</strong>{' '}
              Research distributions and historical model projections remain fully accessible. Market prices show <code className="font-mono text-[11px] text-[#14110F]">n/a</code> until the next provider cycle.
            </div>
          </div>
        )}

        {/* Summary Stat Row (Gertix Style, 4 Cells) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Cell 1: Total Research Permutations */}
          <div className="rounded-lg border border-[#E4DED4] bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-[11px] font-mono text-[#6B645C]">
              <span>Research Output</span>
              <ExplainPopover
                title="Total Evaluated Rows"
                source="GET /api/v1/research"
                endpoint="/api/v1/research"
                modelVersion={modelVersion}
                timestamp={dataTimestamp}
                note="Unfiltered probability rows generated by the canonical Poisson V1 engine."
              />
            </div>
            <div className="mt-2 text-2xl font-mono font-bold text-[#14110F] tabular-nums">
              {loading ? '—' : predictions.length}
            </div>
            <div className="mt-1 text-[10px] text-[#9E968D]">
              {loading ? 'Reading ledger...' : `${countsByMarket.ah} AH · ${countsByMarket.ou} O/U · ${countsByMarket.btts} BTTS`}
            </div>
          </div>

          {/* Cell 2: Analyzed Unique Fixtures */}
          <div className="rounded-lg border border-[#E4DED4] bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-[11px] font-mono text-[#6B645C]">
              <span>Analyzed Fixtures</span>
              <ExplainPopover
                title="Unique Fixtures"
                source="Canonical Fixture Discovery"
                endpoint="/api/v1/research"
                modelVersion={modelVersion}
                timestamp={dataTimestamp}
                note="Unique scheduled competitive fixtures evaluated across canonical competitions."
              />
            </div>
            <div className="mt-2 text-2xl font-mono font-bold text-[#14110F] tabular-nums">
              {loading ? '—' : uniqueFixturesCount}
            </div>
            <div className="mt-1 text-[10px] text-[#9E968D]">
              {loading ? 'Reading fixtures...' : `${leagues.length} leagues represented`}
            </div>
          </div>

          {/* Cell 3: High Confidence Tier */}
          <div className="rounded-lg border border-[#E4DED4] bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-[11px] font-mono text-[#6B645C]">
              <span>High Confidence</span>
              <ExplainPopover
                title="High Confidence Signals"
                source="Calibrated Score Grid"
                endpoint="/api/v1/research"
                modelVersion={modelVersion}
                timestamp={dataTimestamp}
                note="Signals achieving strict model calibration threshold."
              />
            </div>
            <div className="mt-2 text-2xl font-mono font-bold text-[#137333] tabular-nums">
              {loading ? '—' : highConfidenceCount}
            </div>
            <div className="mt-1 text-[10px] text-[#9E968D]">
              {loading ? 'Evaluating...' : `${((highConfidenceCount / (predictions.length || 1)) * 100).toFixed(1)}% of research space`}
            </div>
          </div>

          {/* Cell 4: Actionable Picks passing Gate */}
          <div className="rounded-lg border border-[#E4DED4] bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-[11px] font-mono text-[#6B645C]">
              <span>Qualified Picks</span>
              <ExplainPopover
                title="Qualified Market Picks"
                source="ConfidenceGate + ValueEngine"
                endpoint="/api/daily-picks"
                modelVersion="valueEngine-v1.0"
                timestamp={dataTimestamp}
                note="Selections meeting positive edge, EV, and price verification criteria."
              />
            </div>
            <div className="mt-2 text-2xl font-mono font-bold text-[#3B1515] tabular-nums">
              {loading ? '—' : qualifiedPicksCount}
            </div>
            <div className="mt-1 text-[10px] text-[#9E968D]">
              {qualifiedPicksCount > 0 ? 'Passing gate criteria' : 'Qualification gate active'}
            </div>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="rounded-lg border border-[#E4DED4] bg-white p-4 space-y-4 shadow-sm">
          {/* Market selector tabs */}
          <div className="flex flex-wrap items-center gap-2 border-b border-[#EDE8E0] pb-3 text-xs font-mono">
            <button
              onClick={() => setSelectedMarket('ALL')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                selectedMarket === 'ALL'
                  ? 'bg-[#3B1515] text-white font-semibold'
                  : 'bg-[#F6F3EE] text-[#6B645C] hover:text-[#14110F]'
              }`}
            >
              All Markets ({countsByMarket.total})
            </button>
            <button
              onClick={() => setSelectedMarket('AH')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                selectedMarket === 'AH'
                  ? 'bg-[#3B1515] text-white font-semibold'
                  : 'bg-[#F6F3EE] text-[#6B645C] hover:text-[#14110F]'
              }`}
            >
              Asian Handicap ({countsByMarket.ah})
            </button>
            <button
              onClick={() => setSelectedMarket('OU')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                selectedMarket === 'OU'
                  ? 'bg-[#3B1515] text-white font-semibold'
                  : 'bg-[#F6F3EE] text-[#6B645C] hover:text-[#14110F]'
              }`}
            >
              Over / Under ({countsByMarket.ou})
            </button>
            <button
              onClick={() => setSelectedMarket('BTTS')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                selectedMarket === 'BTTS'
                  ? 'bg-[#3B1515] text-white font-semibold'
                  : 'bg-[#F6F3EE] text-[#6B645C] hover:text-[#14110F]'
              }`}
            >
              BTTS [Research Only] ({countsByMarket.btts})
            </button>
          </div>

          {/* Secondary filter inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#9E968D]" />
              <input
                type="text"
                placeholder="Search team, league, selection..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-md border border-[#E4DED4] bg-white pl-9 pr-3 py-1.5 text-xs text-[#14110F] placeholder-[#9E968D] font-mono focus:border-[#3B1515] focus:outline-none focus:ring-1 focus:ring-[#3B1515]"
              />
            </div>

            {/* Date filter */}
            <div>
              <select
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full rounded-md border border-[#E4DED4] bg-white px-3 py-1.5 text-xs text-[#14110F] font-mono focus:border-[#3B1515] focus:outline-none focus:ring-1 focus:ring-[#3B1515]"
              >
                <option value="ALL">All Dates ({predictions.length} rows)</option>
                <option value="TODAY">Today ({todayStr})</option>
                {availableDates.map((d) => (
                  <option key={d} value={d}>
                    {d} ({predictions.filter((p) => p.kickoff_utc?.startsWith(d)).length} rows)
                  </option>
                ))}
              </select>
            </div>

            {/* League filter */}
            <div>
              <select
                value={selectedLeague}
                onChange={(e) => setSelectedLeague(e.target.value)}
                className="w-full rounded-md border border-[#E4DED4] bg-white px-3 py-1.5 text-xs text-[#14110F] font-mono focus:border-[#3B1515] focus:outline-none focus:ring-1 focus:ring-[#3B1515]"
              >
                <option value="ALL">All Leagues ({leagues.length})</option>
                {leagues.map((lg) => (
                  <option key={lg} value={lg}>
                    {lg}
                  </option>
                ))}
              </select>
            </div>

            {/* Confidence Tier */}
            <div>
              <select
                value={selectedTier}
                onChange={(e) => setSelectedTier(e.target.value)}
                className="w-full rounded-md border border-[#E4DED4] bg-white px-3 py-1.5 text-xs text-[#14110F] font-mono focus:border-[#3B1515] focus:outline-none focus:ring-1 focus:ring-[#3B1515]"
              >
                <option value="ALL">All Confidence Tiers</option>
                <option value="HIGH">🟢 HIGH CONFIDENCE</option>
                <option value="MEDIUM">🟡 MEDIUM CONFIDENCE</option>
                <option value="LOW">🔴 LOW CONFIDENCE</option>
                <option value="RESEARCH_ONLY">🟣 RESEARCH ONLY</option>
              </select>
            </div>
          </div>
        </div>

        {/* Results Area */}
        <div className="rounded-lg border border-[#E4DED4] bg-white overflow-hidden shadow-sm">
          {loading ? (
            /* Layout-Preserving Skeleton Loading */
            <div className="p-6 space-y-4">
              <div className="h-4 bg-[#F0ECE4] rounded w-1/3 animate-pulse"></div>
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-10 bg-[#F6F3EE] rounded w-full animate-pulse"></div>
                ))}
              </div>
            </div>
          ) : error ? (
            /* Error State */
            <div className="p-12 text-center text-xs text-[#C5221F] font-sans">
              <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-[#D93025]" />
              <div className="font-semibold">{error}</div>
              <div className="text-[11px] text-[#6B645C] mt-1">
                Please refresh or inspect feed status later.
              </div>
            </div>
          ) : filteredPredictions.length === 0 ? (
            /* Honest Empty State: Never "No data found" */
            <div className="p-12 text-center text-xs font-sans text-[#6B645C] space-y-2">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#F6F3EE] border border-[#E4DED4] text-[#6B645C]">
                <Filter className="h-4 w-4" />
              </div>
              <h3 className="font-serif text-sm font-bold text-[#14110F]">
                {selectedDate !== 'ALL'
                  ? 'No model output for this date'
                  : 'No research results match these filters.'}
              </h3>
              <p className="max-w-md mx-auto text-xs text-[#6B645C] leading-relaxed">
                {selectedDate !== 'ALL'
                  ? 'No model output for this date matching the selected filter criteria. Select another date or view all recorded ledger entries.'
                  : 'Adjust your date, league, or market criteria to view recorded analytical model rows from the active ledger.'}
              </p>
              {selectedDate !== 'ALL' && (
                <button
                  onClick={() => {
                    setSelectedDate('ALL');
                    setSelectedMarket('ALL');
                    setSelectedTier('ALL');
                    setSelectedLeague('ALL');
                    setSearchQuery('');
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#3B1515] text-white text-xs font-mono font-medium hover:bg-[#2A0E0E] transition-colors"
                >
                  Reset all filters ({predictions.length} total)
                </button>
              )}
            </div>
          ) : (
            <>
              {/* DESKTOP TABLE (Hidden on mobile < 768px) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E4DED4] bg-[#FAF8F5] text-[10px] font-mono uppercase tracking-wider text-[#6B645C]">
                      <th className="px-4 py-3">Fixture</th>
                      <th className="px-4 py-3">Kickoff (UTC)</th>
                      <th className="px-3 py-3">Market</th>
                      <th className="px-3 py-3">Line</th>
                      <th className="px-4 py-3">Selection</th>
                      <th className="px-3 py-3 text-right">Probability</th>
                      <th className="px-4 py-3 text-center">Confidence</th>
                      <th className="px-3 py-3 text-right">Market Price</th>
                      <th className="px-3 py-3 text-right">EV</th>
                      <th className="px-4 py-3">Model Version</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EDE8E0] font-mono">
                    {filteredPredictions.map((row) => {
                      const probPct = (row.model_probability * 100).toFixed(1);
                      const kickDate = row.kickoff_utc
                        ? row.kickoff_utc.replace('T', ' ').slice(0, 16)
                        : '—';

                      const isHigh =
                        row.confidence_tier === 'VALUE_HIGH' || row.confidence_tier === 'HIGH';
                      const isMedium =
                        row.confidence_tier === 'WATCH' || row.confidence_tier === 'MEDIUM';
                      const isResearchOnly =
                        row.market === 'BTTS' || row.confidence_tier === 'RESEARCH_ONLY';

                      return (
                        <tr key={row.id} className="hover:bg-[#F6F3EE]/60 transition-colors">
                          <td className="px-4 py-3 font-sans">
                            <div className="font-semibold text-[#14110F]">{row.match}</div>
                            <div className="text-[10px] text-[#9E968D]">{row.competition}</div>
                          </td>
                          <td className="px-4 py-3 text-[#6B645C] text-[11px] whitespace-nowrap">
                            {kickDate}
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                row.market === 'AH'
                                  ? 'bg-[#EAF0F6] text-[#1E4268]'
                                  : row.market === 'OU'
                                  ? 'bg-[#FBF1E6] text-[#8C4A00]'
                                  : 'bg-[#F3E8FD] text-[#681DA8]'
                              }`}
                            >
                              {row.market}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-[#14110F] font-semibold">
                            {row.line !== null
                              ? row.line > 0 && row.market === 'AH'
                                ? `+${row.line}`
                                : row.line
                              : '—'}
                          </td>
                          <td className="px-4 py-3 font-sans font-medium text-[#14110F]">
                            {row.selection}
                          </td>
                          <td className="px-3 py-3 text-right font-bold text-[#14110F] tabular-nums">
                            {probPct}%
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            <span
                              className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${
                                isResearchOnly
                                  ? 'bg-[#F3E8FD] border-[#E1C7FC] text-[#681DA8]'
                                  : isHigh
                                  ? 'bg-[#EAF7EE] border-[#BFE7CA] text-[#137333]'
                                  : isMedium
                                  ? 'bg-[#FEF7E0] border-[#FEE5A5] text-[#B06000]'
                                  : 'bg-[#FCE8E6] border-[#FAD2CF] text-[#C5221F]'
                              }`}
                            >
                              {isResearchOnly
                                ? 'RESEARCH ONLY'
                                : isHigh
                                ? 'HIGH CONFIDENCE'
                                : isMedium
                                ? 'MEDIUM CONFIDENCE'
                                : 'LOW CONFIDENCE'}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-[#6B645C]">
                            {row.market_odds ? (
                              `@${row.market_odds.toFixed(2)}`
                            ) : (
                              <span className="text-[#9E968D] font-sans text-[11px]">n/a</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums">
                            {row.expected_value !== null ? (
                              <span
                                className={
                                  row.expected_value > 0
                                    ? 'text-[#137333] font-semibold'
                                    : 'text-[#C5221F]'
                                }
                              >
                                {row.expected_value > 0 ? '+' : ''}
                                {(row.expected_value * 100).toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-[#9E968D]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-[10px] text-[#9E968D] whitespace-nowrap">
                            {row.model_version}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* MOBILE STACKED CARDS (Displayed on screens < 768px) */}
              <div className="md:hidden divide-y divide-[#EDE8E0]">
                {filteredPredictions.map((row) => {
                  const probPct = (row.model_probability * 100).toFixed(1);
                  const isHigh =
                    row.confidence_tier === 'VALUE_HIGH' || row.confidence_tier === 'HIGH';
                  const isMedium =
                    row.confidence_tier === 'WATCH' || row.confidence_tier === 'MEDIUM';
                  const isResearchOnly =
                    row.market === 'BTTS' || row.confidence_tier === 'RESEARCH_ONLY';

                  return (
                    <div key={row.id} className="p-4 space-y-2.5 bg-white">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-sm text-[#14110F] font-sans">
                            {row.match}
                          </div>
                          <div className="text-[10px] text-[#9E968D] font-mono">
                            {row.competition} • {row.kickoff_utc?.replace('T', ' ').slice(0, 16)} UTC
                          </div>
                        </div>
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[9px] font-mono font-semibold shrink-0 ${
                            isResearchOnly
                              ? 'bg-[#F3E8FD] border-[#E1C7FC] text-[#681DA8]'
                              : isHigh
                              ? 'bg-[#EAF7EE] border-[#BFE7CA] text-[#137333]'
                              : isMedium
                              ? 'bg-[#FEF7E0] border-[#FEE5A5] text-[#B06000]'
                              : 'bg-[#FCE8E6] border-[#FAD2CF] text-[#C5221F]'
                          }`}
                        >
                          {isResearchOnly ? 'RESEARCH' : isHigh ? 'HIGH' : isMedium ? 'MED' : 'LOW'}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 p-2.5 rounded bg-[#F6F3EE] font-mono text-xs">
                        <div>
                          <span className="text-[10px] text-[#6B645C] block">Market / Line</span>
                          <span className="font-semibold text-[#14110F]">
                            {row.market} {row.line !== null ? (row.line > 0 && row.market === 'AH' ? `+${row.line}` : row.line) : ''}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-[#6B645C] block">Probability</span>
                          <span className="font-bold text-[#14110F]">{probPct}%</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-[#6B645C] block">Market Price</span>
                          <span className="text-[#6B645C]">
                            {row.market_odds ? `@${row.market_odds.toFixed(2)}` : 'n/a'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-mono pt-1 text-[#6B645C]">
                        <span>Selection: <strong className="text-[#14110F]">{row.selection}</strong></span>
                        <span>Model: {row.model_version}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Bottom Ledger Note */}
        <div className="text-[11px] font-mono text-[#6B645C] flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E4DED4]">
          <span>
            Displaying {filteredPredictions.length} of {predictions.length} recorded model outputs.
          </span>
          <span>Provenance Authority: Canonical Poisson V1 Rescue Engine</span>
        </div>
      </main>

      <Footer />
    </div>
  );
}
