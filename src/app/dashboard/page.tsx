'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { ExplainPopover } from '@/components/common/ExplainPopover';
import {
  Compass,
  CheckCircle2,
  Bookmark,
  BookOpen,
  LogOut,
  User,
  Settings,
  ShieldCheck,
  TrendingUp,
  AlertCircle,
  Menu,
  X,
  ArrowRight,
  Database,
  Lock,
} from 'lucide-react';

interface ResearchItem {
  id: string;
  match: string;
  competition: string;
  market: string;
  line: number | null;
  selection: string;
  model_probability: number;
  confidence_tier: string;
  expected_value: number | null;
  market_odds: number | null;
  is_pick: boolean;
  kickoff_utc: string;
  model_version: string;
}

interface PerformanceData {
  sampleSize: number;
  hasSufficientSample: boolean;
  winRatePct: number | null;
  yieldPct: number | null;
  maxDrawdownPct: number | null;
  status: string;
  note?: string;
  timestampUtc?: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [researchList, setResearchList] = useState<ResearchItem[]>([]);
  const [qualifiedPicksCount, setQualifiedPicksCount] = useState<number>(0);
  const [performance, setPerformance] = useState<PerformanceData | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [dataTimestamp, setDataTimestamp] = useState<string>(new Date().toISOString());
  const [modelVersion, setModelVersion] = useState<string>('poisson_v1_rescue');

  // Enforce authentication gate: redirect to /login if unauthenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [user, authLoading, router]);

  // Load real analytical data from existing endpoints
  useEffect(() => {
    let isMounted = true;
    setLoadingData(true);

    Promise.all([
      // 1. Fetch research predictions
      fetch('/api/v1/research')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      // 2. Fetch daily picks
      fetch('/api/daily-picks')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      // 3. Fetch performance metrics
      fetch('/api/v1/performance')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([researchRes, picksRes, perfRes]) => {
      if (!isMounted) return;

      if (researchRes?.success && Array.isArray(researchRes.predictions)) {
        setResearchList(researchRes.predictions);
        if (researchRes.timestampUtc) setDataTimestamp(researchRes.timestampUtc);
        if (researchRes.modelVersion) setModelVersion(researchRes.modelVersion);
      }

      if (picksRes?.success && Array.isArray(picksRes.data)) {
        const qualified = picksRes.data.filter((p: any) => p.verdict === 'LAYAK');
        setQualifiedPicksCount(qualified.length);
      }

      if (perfRes?.success && perfRes.report) {
        const headline = perfRes.report.greenCohortHeadline || {};
        const sample = headline.totalPositions || 0;
        setPerformance({
          sampleSize: sample,
          hasSufficientSample: headline.hasSufficientSample || false,
          winRatePct: headline.winRatePct !== undefined ? headline.winRatePct : null,
          yieldPct: headline.yieldPct !== undefined ? headline.yieldPct : null,
          maxDrawdownPct: headline.maxDrawdownPct !== undefined ? headline.maxDrawdownPct : null,
          status: headline.status || 'INSUFFICIENT_SAMPLE',
          note: headline.note,
          timestampUtc: perfRes.timestampUtc,
        });
      }

      setLoadingData(false);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  // Time-aware greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  // Compute counts from real data
  const highConfidenceCount = useMemo(() => {
    return researchList.filter(
      (r) => r.confidence_tier === 'HIGH' || r.confidence_tier === 'VALUE_HIGH'
    ).length;
  }, [researchList]);

  const uniqueMatchesCount = useMemo(() => {
    return new Set(researchList.map((r) => r.match)).size;
  }, [researchList]);

  // Preview rows (max 6)
  const recentResearchPreview = useMemo(() => {
    return researchList.slice(0, 6);
  }, [researchList]);

  if (authLoading || (!user && authLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F6F3EE] text-[#14110F]">
        <div className="text-center font-mono text-xs text-[#6B645C] space-y-2">
          <div className="h-6 w-6 rounded-full border-2 border-[#3B1515] border-t-transparent animate-spin mx-auto"></div>
          <div>Verifying session authority...</div>
        </div>
      </div>
    );
  }

  // If user is null and not loading, auth gate redirecting
  if (!user) {
    return null;
  }

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  return (
    <div className="min-h-screen flex bg-[#F6F3EE] text-[#14110F]">
      {/* ======================================================== */}
      {/* DESKTOP SIDEBAR (Authenticated Product Hierarchy)        */}
      {/* ======================================================== */}
      <aside className="hidden lg:flex w-64 flex-col justify-between border-r border-[#E4DED4] bg-white p-5 shrink-0">
        <div className="space-y-6">
          {/* Brand Wordmark */}
          <div className="flex items-center justify-between pb-4 border-b border-[#EDE8E0]">
            <Link href="/" className="inline-flex items-center gap-1.5 group">
              <span className="font-serif text-2xl font-bold tracking-tight text-[#14110F] group-hover:text-[#3B1515] transition-colors">
                SALMO
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-[#E8664A] -mb-2"></span>
            </Link>
            <span className="rounded border border-[#E4DED4] px-1.5 py-0.5 text-[9px] font-mono uppercase text-[#6B645C]">
              Workspace
            </span>
          </div>

          {/* Navigation Items */}
          <nav className="space-y-1 text-xs font-mono">
            <Link
              href="/dashboard"
              className="flex items-center justify-between rounded-md bg-[#3B1515] text-white px-3 py-2 font-medium transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Compass className="h-3.5 w-3.5 text-[#E8664A]" />
                <span>00 Overview</span>
              </div>
            </Link>

            <Link
              href="/research"
              className="flex items-center justify-between rounded-md text-[#6B645C] hover:text-[#14110F] hover:bg-[#F6F3EE] px-3 py-2 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Database className="h-3.5 w-3.5" />
                <span>01 Research</span>
              </div>
              <span className="text-[10px] text-[#9E968D]">{researchList.length || '—'}</span>
            </Link>

            <Link
              href="/picks"
              className="flex items-center justify-between rounded-md text-[#6B645C] hover:text-[#14110F] hover:bg-[#F6F3EE] px-3 py-2 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>02 Picks</span>
              </div>
              <span className="text-[10px] text-[#9E968D]">
                {qualifiedPicksCount > 0 ? qualifiedPicksCount : '0'}
              </span>
            </Link>

            <div className="flex items-center justify-between rounded-md text-[#9E968D] px-3 py-2 cursor-not-allowed">
              <div className="flex items-center gap-2.5">
                <Bookmark className="h-3.5 w-3.5" />
                <span>03 Watchlist</span>
              </div>
              <span className="text-[9px] uppercase tracking-wider bg-[#F0ECE4] text-[#6B645C] px-1 rounded">
                Future
              </span>
            </div>

            <Link
              href="/performance"
              className="flex items-center justify-between rounded-md text-[#6B645C] hover:text-[#14110F] hover:bg-[#F6F3EE] px-3 py-2 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <BookOpen className="h-3.5 w-3.5" />
                <span>04 Ledger</span>
              </div>
            </Link>
          </nav>
        </div>

        {/* User Account & Bottom Actions */}
        <div className="border-t border-[#EDE8E0] pt-4 space-y-3">
          <div className="rounded-md bg-[#F6F3EE] p-2.5">
            <div className="flex items-center gap-2 text-xs">
              <div className="h-6 w-6 rounded-full bg-[#3B1515] text-white flex items-center justify-center font-mono text-[10px]">
                {user.email ? user.email.slice(0, 2).toUpperCase() : 'AN'}
              </div>
              <div className="flex-1 truncate font-mono text-[11px] text-[#14110F]">
                {user.email}
              </div>
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-[#6B645C]">
              <span>Plan: Research Free</span>
              <span className="text-[#137333] font-semibold">Active</span>
            </div>
          </div>

          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-[#6B645C] hover:text-[#C5221F] hover:bg-[#FCE8E6] transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* ======================================================== */}
      {/* MAIN CONTENT AREA                                         */}
      {/* ======================================================== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between border-b border-[#E4DED4] bg-white px-4 py-3">
          <Link href="/" className="inline-flex items-center gap-1.5">
            <span className="font-serif text-xl font-bold tracking-tight text-[#14110F]">
              SALMO
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-[#E8664A] -mb-1"></span>
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle navigation"
              className="p-1.5 rounded-md border border-[#E4DED4] text-[#14110F]"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </header>

        {/* Mobile Drawer Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-b border-[#E4DED4] bg-white p-4 space-y-3 font-mono text-xs">
            <Link
              href="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className="block font-semibold text-[#3B1515]"
            >
              00 Overview
            </Link>
            <Link
              href="/research"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-[#6B645C]"
            >
              01 Research ({researchList.length})
            </Link>
            <Link
              href="/picks"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-[#6B645C]"
            >
              02 Picks ({qualifiedPicksCount})
            </Link>
            <Link
              href="/performance"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-[#6B645C]"
            >
              04 Ledger
            </Link>
            <div className="pt-2 border-t border-[#EDE8E0] flex items-center justify-between text-[#6B645C]">
              <span className="truncate">{user.email}</span>
              <button onClick={handleSignOut} className="text-[#C5221F] font-semibold">
                Sign out
              </button>
            </div>
          </div>
        )}

        {/* Ticker / Top Status Strip */}
        <div className="border-b border-[#E4DED4] bg-[#F0ECE4]/60 px-4 sm:px-8 py-1.5 text-[11px] font-mono text-[#6B645C] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[#137333]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#1E8E3E] animate-pulse"></span>
              <span>FEED OPERATIONAL</span>
            </span>
            <span className="hidden sm:inline text-[#D0C9BD]">|</span>
            <span className="hidden sm:inline">Engine: {modelVersion}</span>
            <span className="hidden sm:inline text-[#D0C9BD]">|</span>
            <span className="hidden md:inline">Coverage: Asian Handicap + Over/Under</span>
          </div>
          <div className="text-[10px] text-[#9E968D]">
            Last Sync: {dataTimestamp.replace('T', ' ').slice(0, 16)} UTC
          </div>
        </div>

        {/* Main Workspace Body */}
        <main className="flex-1 p-4 sm:p-8 max-w-6xl mx-auto w-full space-y-6">
          {/* Welcome Header */}
          <div className="border-b border-[#E4DED4] pb-5">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#6B645C]">
              {greeting}, {user.email?.split('@')[0]}
            </span>
            <h1 className="mt-1 font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#14110F]">
              Your Football Market Intelligence
            </h1>
            <p className="mt-1 text-xs text-[#6B645C] max-w-2xl font-sans">
              Autonomous mathematical model projections across Asian Handicap and Goal Totals. Strictly pre-kickoff, zero inplay noise, and explicit confidence gating.
            </p>
          </div>

          {/* 4 Summary Stat Cards (Gertix Style) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Card 1: Research permutations */}
            <div className="rounded-lg border border-[#E4DED4] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#6B645C]">
                <span>Research Output</span>
                <ExplainPopover
                  title="Research Permutations"
                  source="GET /api/v1/research"
                  endpoint="/api/v1/research"
                  modelVersion={modelVersion}
                  timestamp={dataTimestamp}
                  note="Evaluated pre-match probability combinations across canonical leagues."
                />
              </div>
              <div className="mt-2 text-2xl font-mono font-bold text-[#14110F] tabular-nums">
                {loadingData ? '—' : researchList.length}
              </div>
              <div className="mt-1 text-[10px] text-[#9E968D]">
                {loadingData ? 'Loading...' : `${uniqueMatchesCount} unique fixtures`}
              </div>
            </div>

            {/* Card 2: Qualified Picks */}
            <div className="rounded-lg border border-[#E4DED4] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#6B645C]">
                <span>Qualified Picks</span>
                <ExplainPopover
                  title="Qualified Market Picks"
                  source="GET /api/daily-picks"
                  endpoint="/api/daily-picks"
                  modelVersion="valueEngine-v1.0"
                  timestamp={dataTimestamp}
                  note="Selections meeting 7-factor composite value and positive EV gates."
                />
              </div>
              <div className="mt-2 text-2xl font-mono font-bold text-[#14110F] tabular-nums">
                {loadingData ? '—' : qualifiedPicksCount}
              </div>
              <div className="mt-1 text-[10px] text-[#9E968D]">
                {qualifiedPicksCount > 0 ? 'Passing ValueGate' : 'Strict qualification active'}
              </div>
            </div>

            {/* Card 3: High Confidence Signals */}
            <div className="rounded-lg border border-[#E4DED4] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#6B645C]">
                <span>High Confidence</span>
                <ExplainPopover
                  title="High Confidence Signals"
                  source="GET /api/v1/research"
                  endpoint="/api/v1/research"
                  modelVersion={modelVersion}
                  timestamp={dataTimestamp}
                  note="Model calibrated probability meeting high-tier qualification."
                />
              </div>
              <div className="mt-2 text-2xl font-mono font-bold text-[#137333] tabular-nums">
                {loadingData ? '—' : highConfidenceCount}
              </div>
              <div className="mt-1 text-[10px] text-[#9E968D]">
                {highConfidenceCount > 0 ? '🟢 Tier signals' : 'Evaluating signals'}
              </div>
            </div>

            {/* Card 4: Model Authority */}
            <div className="rounded-lg border border-[#E4DED4] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#6B645C]">
                <span>Reference Authority</span>
                <ExplainPopover
                  title="Odds & Model Authority"
                  source="OddsPapi / Pinnacle"
                  endpoint="Unmetered /v4/account"
                  note="Benchmark sharp bookmaker reference with devigged true pricing."
                />
              </div>
              <div className="mt-2 text-xl font-mono font-bold text-[#3B1515]">Pinnacle</div>
              <div className="mt-1 text-[10px] text-[#9E968D]">Zero synthetic odds</div>
            </div>
          </div>

          {/* Qualified Picks Module or Honest State */}
          <section className="rounded-lg border border-[#E4DED4] bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-[#EDE8E0] pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#6B645C]">
                  02 / Qualified Picks
                </span>
                <h2 className="font-serif text-lg font-bold text-[#14110F]">
                  Actionable Market Selections
                </h2>
              </div>
              <Link
                href="/picks"
                className="inline-flex items-center gap-1 text-xs font-mono text-[#3B1515] hover:text-[#2A0E0E] font-semibold"
              >
                <span>View Picks Hub</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {loadingData ? (
              <div className="p-8 text-center text-xs font-mono text-[#6B645C]">
                Loading qualified market recommendations...
              </div>
            ) : qualifiedPicksCount === 0 ? (
              <div className="rounded-md border border-[#EDE8E0] bg-[#F6F3EE] p-5 text-center space-y-2">
                <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white border border-[#E4DED4] text-[#6B645C]">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <h3 className="font-serif text-sm font-bold text-[#14110F]">
                  No qualified market picks right now.
                </h3>
                <p className="text-xs text-[#6B645C] max-w-lg mx-auto font-sans leading-relaxed">
                  SALMO only publishes a pick when model probability, market odds, and expected value meet the qualification criteria. Mathematical research remains active below.
                </p>
              </div>
            ) : (
              <div className="text-xs font-mono text-[#137333]">
                {qualifiedPicksCount} qualified picks currently active. Access full details on the Picks hub.
              </div>
            )}
          </section>

          {/* Today's Research Preview */}
          <section className="rounded-lg border border-[#E4DED4] bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-[#EDE8E0] pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#6B645C]">
                  01 / Research Output
                </span>
                <h2 className="font-serif text-lg font-bold text-[#14110F]">
                  Today's Model Analysis
                </h2>
                <p className="text-xs text-[#6B645C] font-sans">
                  Research is not a pick. Projections evaluate underlying match dynamics and distributions.
                </p>
              </div>
              <Link
                href="/research"
                className="inline-flex items-center gap-1 text-xs font-mono text-[#3B1515] hover:text-[#2A0E0E] font-semibold"
              >
                <span>View all research ({researchList.length})</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {loadingData ? (
              <div className="p-8 text-center text-xs font-mono text-[#6B645C]">
                Loading research permutations...
              </div>
            ) : researchList.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#6B645C] font-sans">
                Market data temporarily unavailable. Research and historical analysis remain available.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#EDE8E0] text-[10px] font-mono uppercase tracking-wider text-[#6B645C]">
                      <th className="py-2.5 px-3">Fixture</th>
                      <th className="py-2.5 px-2">Market</th>
                      <th className="py-2.5 px-2">Line</th>
                      <th className="py-2.5 px-3">Selection</th>
                      <th className="py-2.5 px-2 text-right">Probability</th>
                      <th className="py-2.5 px-3 text-center">Confidence</th>
                      <th className="py-2.5 px-2 text-right">Market Price</th>
                      <th className="py-2.5 px-2 text-right">EV</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EDE8E0] font-mono">
                    {recentResearchPreview.map((row) => {
                      const prob = (row.model_probability * 100).toFixed(1);
                      const isHigh = row.confidence_tier === 'HIGH' || row.confidence_tier === 'VALUE_HIGH';
                      const isMedium = row.confidence_tier === 'MEDIUM' || row.confidence_tier === 'WATCH';

                      return (
                        <tr key={row.id} className="hover:bg-[#F6F3EE]/50 transition-colors">
                          <td className="py-2.5 px-3 font-sans">
                            <div className="font-medium text-[#14110F]">{row.match}</div>
                            <div className="text-[10px] text-[#9E968D]">{row.competition}</div>
                          </td>
                          <td className="py-2.5 px-2 font-mono">
                            <span className="rounded bg-[#F0ECE4] px-1.5 py-0.5 text-[10px] font-semibold text-[#14110F]">
                              {row.market}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-[#14110F] font-semibold">
                            {row.line !== null ? (row.line > 0 && row.market === 'AH' ? `+${row.line}` : row.line) : '—'}
                          </td>
                          <td className="py-2.5 px-3 font-sans text-[#14110F]">
                            {row.selection}
                          </td>
                          <td className="py-2.5 px-2 text-right font-bold text-[#14110F] tabular-nums">
                            {prob}%
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                row.market === 'BTTS'
                                  ? 'bg-[#F3E8FD] text-[#681DA8]'
                                  : isHigh
                                  ? 'bg-[#EAF7EE] text-[#137333]'
                                  : isMedium
                                  ? 'bg-[#FEF7E0] text-[#B06000]'
                                  : 'bg-[#FCE8E6] text-[#C5221F]'
                              }`}
                            >
                              {row.market === 'BTTS'
                                ? 'RESEARCH ONLY'
                                : isHigh
                                ? 'HIGH'
                                : isMedium
                                ? 'MEDIUM'
                                : 'LOW'}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-right text-[#6B645C] tabular-nums">
                            {row.market_odds ? `@${row.market_odds.toFixed(2)}` : 'n/a'}
                          </td>
                          <td className="py-2.5 px-2 text-right tabular-nums">
                            {row.expected_value !== null ? (
                              <span className={row.expected_value > 0 ? 'text-[#137333] font-semibold' : 'text-[#C5221F]'}>
                                {row.expected_value > 0 ? '+' : ''}{(row.expected_value * 100).toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-[#9E968D]">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Performance & Track Record (Constitutional Honesty Rule) */}
          <section className="rounded-lg border border-[#E4DED4] bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-[#EDE8E0] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#6B645C]">
                  03 / Performance Ledger
                </span>
                <span className="rounded bg-[#EEF2F6] border border-[#D0DBE5] px-1.5 py-0.5 text-[9px] font-mono font-semibold text-[#2D5B88]">
                  BACKTEST / PAPER TRADING
                </span>
              </div>
              <Link
                href="/performance"
                className="text-xs font-mono text-[#3B1515] hover:underline font-semibold"
              >
                Inspect Ledger →
              </Link>
            </div>

            {/* Honesty Gate Check */}
            {performance && !performance.hasSufficientSample ? (
              <div className="rounded-md border border-[#EDE8E0] bg-[#F6F3EE] p-4 text-xs font-mono space-y-1">
                <div className="font-semibold text-[#14110F] flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#B06000]"></span>
                  <span>Building track record.</span>
                </div>
                <div className="text-[#6B645C] font-sans">
                  {performance.sampleSize} positions logged in verification ledger. Minimum threshold of 30 settled positions required before publishing aggregate win rate and yield metrics.
                </div>
              </div>
            ) : performance ? (
              <div className="grid grid-cols-3 gap-3 font-mono text-center">
                <div className="p-3 bg-[#F6F3EE] rounded border border-[#EDE8E0]">
                  <div className="text-[10px] text-[#6B645C]">Win Rate</div>
                  <div className="text-lg font-bold text-[#14110F]">
                    {performance.winRatePct !== null ? `${performance.winRatePct}%` : '—'}
                  </div>
                </div>
                <div className="p-3 bg-[#F6F3EE] rounded border border-[#EDE8E0]">
                  <div className="text-[10px] text-[#6B645C]">Yield</div>
                  <div className="text-lg font-bold text-[#137333]">
                    {performance.yieldPct !== null ? `${performance.yieldPct}%` : '—'}
                  </div>
                </div>
                <div className="p-3 bg-[#F6F3EE] rounded border border-[#EDE8E0]">
                  <div className="text-[10px] text-[#6B645C]">Positions</div>
                  <div className="text-lg font-bold text-[#14110F]">
                    {performance.sampleSize}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-[#6B645C] font-mono">
                Building track record.
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
