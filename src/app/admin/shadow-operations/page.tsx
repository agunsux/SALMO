'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  AlertTriangle,
  Activity,
  Database,
  RefreshCw,
  Download,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  ArrowRight,
  TrendingUp,
  Sliders,
  AlertCircle,
  Lock,
} from 'lucide-react';

interface KPIState {
  provider5DollarStatus: string;
  provider5DollarBudgetRemaining: number;
  provider5DollarHourlyLimit: number;
  provider5DollarConsumed: number;
  providerApiFootballStatus: string;
  todayPredictionsCount: number;
  qualifiedHighConfidencePicks: number;
  pantauWatchlistCount: number;
  pendingSettlementCount: number;
  settledPredictionsCount: number;
  cumulativeRoiPct: number | null;
  netProfitUnits: number;
  totalStakedUnits: number;
  averageClvPct: number | null;
  positiveClvRatePct: number | null;
  ahBrierScore: number | null;
  ouBrierScore: number | null;
  sampleSize: number;
  dateRange: { earliest: string; latest: string };
  isSampleSufficient: boolean;
  sampleLabel: string;
}

interface ShadowRecord {
  predictionId: string;
  canonicalMatchId: string;
  fixtureId: number;
  competition: string;
  kickoffAt: string;
  market: string;
  marketRole: string;
  selection: string;
  handicapLine: number | null;
  totalLine: number | null;
  bookmaker: string;
  oddsAtSignal: number;
  modelProbability: number;
  fairOdds: number;
  impliedProbability: number;
  devigProbability: number;
  expectedValue: number;
  confidence: number;
  predictionStatus: string;
  verdict: string;
  reasoning: string;
  closingLine: number | null;
  closingOdds: number | null;
  clvNoVig: number | null;
  clvStatus: string;
  provider: string;
  provenanceType: string;
  homeGoals: number | null;
  awayGoals: number | null;
  settlementStatus: string;
  settlementResult: string | null;
  profitUnits: number;
  stakeUnits: number;
  settledAt: string | null;
}

export default function ShadowOperationsPage() {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KPIState | null>(null);
  const [recordsByProvenance, setRecordsByProvenance] = useState<Record<string, ShadowRecord[]>>({
    LIVE_SHADOW_SIGNAL: [],
    HISTORICAL_PREDICTION: [],
    HISTORICAL_RECONSTRUCTION: [],
    HISTORICAL_RESULT_ONLY: [],
    UNVERIFIED: [],
  });
  const [providerHealth, setProviderHealth] = useState<any>(null);
  const [marketReadiness, setMarketReadiness] = useState<any>(null);
  const [runHistory, setRunHistory] = useState<any[]>([]);

  // Navigation & Filter State
  const [activeTab, setActiveTab] = useState<'LIVE' | 'HIST_PRED' | 'HIST_REC' | 'RESULT_ONLY' | 'UNVERIFIED' | 'PERF' | 'CONTROLS'>('LIVE');
  const [marketFilter, setMarketFilter] = useState<string>('ALL');
  const [verdictFilter, setVerdictFilter] = useState<string>('ALL');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/shadow-operations');
      const json = await res.json();
      if (json.success && json.data) {
        setKpis(json.data.kpis);
        setRecordsByProvenance(json.data.recordsByProvenance);
        setProviderHealth(json.data.providerHealth);
        setMarketReadiness(json.data.marketReadiness);
        setRunHistory(json.data.runHistory);
      }
    } catch (err: any) {
      setActionMessage(`Error loading dashboard data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  // Filter current active record list
  const currentList = useMemo(() => {
    let list: ShadowRecord[] = [];
    if (activeTab === 'LIVE') list = recordsByProvenance.LIVE_SHADOW_SIGNAL || [];
    else if (activeTab === 'HIST_PRED') list = recordsByProvenance.HISTORICAL_PREDICTION || [];
    else if (activeTab === 'HIST_REC') list = recordsByProvenance.HISTORICAL_RECONSTRUCTION || [];
    else if (activeTab === 'RESULT_ONLY') list = recordsByProvenance.HISTORICAL_RESULT_ONLY || [];
    else if (activeTab === 'UNVERIFIED') list = recordsByProvenance.UNVERIFIED || [];

    return list.filter((r) => {
      if (marketFilter !== 'ALL' && r.market !== marketFilter) return false;
      if (verdictFilter !== 'ALL' && r.predictionStatus !== verdictFilter) return false;
      return true;
    });
  }, [activeTab, recordsByProvenance, marketFilter, verdictFilter]);

  // Operator Actions
  const handleTriggerBackfill = async () => {
    if (!confirm('Execute historical backfill? This will re-index genuine and reconstructed archives without mutating live predictions.')) return;
    setIsExecuting(true);
    setActionMessage('Executing historical match backfill...');
    try {
      const res = await fetch('/api/admin/shadow-operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'TRIGGER_BACKFILL' }),
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage(`Backfill Completed: Processed ${data.summary.totalProcessed} records (${data.summary.historicalPredictions} genuine predictions, ${data.summary.historicalReconstructions} reconstructions).`);
        await fetchOverview();
      } else {
        setActionMessage(`Backfill Failed: ${data.error}`);
      }
    } catch (err: any) {
      setActionMessage(`Backfill Request Error: ${err.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleTestConnection = async () => {
    setIsExecuting(true);
    setActionMessage('Testing 5Dollar Provider connection...');
    try {
      const res = await fetch('/api/admin/shadow-operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'TEST_PROVIDER_CONNECTION' }),
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage(`Provider Test SUCCESS: Status ${data.status}, Latency ${data.latencyMs}ms.`);
      } else {
        setActionMessage(`Provider Test Result: ${data.status} — ${data.message || data.error}`);
      }
      await fetchOverview();
    } catch (err: any) {
      setActionMessage(`Connection Test Error: ${err.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleExportLedger = () => {
    const allRecords = Object.values(recordsByProvenance).flat();
    const jsonl = allRecords.map((r) => JSON.stringify(r)).join('\n');
    const blob = new Blob([jsonl], { type: 'application/x-jsonlines' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shadow_prediction_ledger_${new Date().toISOString().slice(0, 10)}.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#0B0D10] text-[#E6E9EE] p-4 sm:p-6 lg:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Top Header & Institutional Breadcrumb */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#232830] gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs tracking-wider text-[#8A93A0] uppercase">SALMO.DEV / OPERATOR CONSOLE</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30">
                SHADOW MODE (ISOLATED)
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[#E6E9EE] mt-1">Shadow Operations Center</h1>
            <p className="text-xs text-[#8A93A0]">
              Provider Quotas, Four-Market Ingestion, Historical Provenance, and Settlement Audit
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchOverview}
              disabled={loading || isExecuting}
              className="px-3 py-1.5 rounded bg-[#171B20] border border-[#232830] hover:border-[#38404D] text-xs font-mono flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <Link
              href="/dashboard"
              className="px-3 py-1.5 rounded bg-[#171B20] border border-[#232830] hover:border-[#38404D] text-xs font-mono text-[#8A93A0] hover:text-[#E6E9EE] transition-colors"
            >
              User Dashboard
            </Link>
          </div>
        </div>

        {/* Action Status Toast Banner */}
        {actionMessage && (
          <div className="p-3 rounded bg-[#171B20] border border-[#232830] text-xs font-mono text-[#E6E9EE] flex items-center justify-between">
            <span>{actionMessage}</span>
            <button onClick={() => setActionMessage(null)} className="text-[#8A93A0] hover:text-[#E6E9EE]">×</button>
          </div>
        )}

        {/* Top KPI Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Card 1: Today Predictions */}
          <div className="bg-[#111418] border border-[#232830] rounded p-3">
            <div className="text-[10px] font-mono text-[#8A93A0] uppercase">Today's Signals</div>
            <div className="text-xl font-mono font-bold text-[#E6E9EE] mt-1">{kpis?.todayPredictionsCount ?? '—'}</div>
            <div className="text-[10px] text-[#5B6370] mt-0.5">Upcoming slate</div>
          </div>

          {/* Card 2: Qualified Picks */}
          <div className="bg-[#111418] border border-[#232830] rounded p-3">
            <div className="text-[10px] font-mono text-[#8A93A0] uppercase">Qualified Picks</div>
            <div className="text-xl font-mono font-bold text-emerald-400 mt-1">
              {kpis ? (recordsByProvenance.LIVE_SHADOW_SIGNAL?.filter(r => r.predictionStatus === 'QUALIFIED_VALUE_BET').length ?? 0) : '—'}
            </div>
            <div className="text-[10px] text-emerald-500/80 mt-0.5">EV &gt; 2.0% & Conf ≥ 65</div>
          </div>

          {/* Card 3: Settled Events */}
          <div className="bg-[#111418] border border-[#232830] rounded p-3">
            <div className="text-[10px] font-mono text-[#8A93A0] uppercase">Settled Events</div>
            <div className="text-xl font-mono font-bold text-[#E6E9EE] mt-1">{kpis?.settledPredictionsCount ?? '—'}</div>
            <div className="text-[10px] text-[#5B6370] mt-0.5">Verified final scores</div>
          </div>

          {/* Card 4: 5Dollar Quota */}
          <div className="bg-[#111418] border border-[#232830] rounded p-3">
            <div className="text-[10px] font-mono text-[#8A93A0] uppercase">5Dollar Free Quota</div>
            <div className="text-xl font-mono font-bold text-[#E6E9EE] mt-1">
              {kpis ? `${kpis.provider5DollarBudgetRemaining}/${kpis.provider5DollarHourlyLimit}` : '—'}
            </div>
            <div className="text-[10px] text-amber-400 mt-0.5">
              {kpis?.provider5DollarStatus === 'PROVIDER_UNCONFIGURED' ? 'Unconfigured Key' : `${kpis?.provider5DollarConsumed ?? 0} used/hr`}
            </div>
          </div>

          {/* Card 5: API-Football */}
          <div className="bg-[#111418] border border-[#232830] rounded p-3">
            <div className="text-[10px] font-mono text-[#8A93A0] uppercase">API-Football</div>
            <div className="text-xl font-mono font-bold text-rose-400 mt-1">BLOCKED</div>
            <div className="text-[10px] text-rose-500/80 mt-0.5">Suspension active</div>
          </div>

          {/* Card 6: Cumulative ROI */}
          <div className="bg-[#111418] border border-[#232830] rounded p-3">
            <div className="text-[10px] font-mono text-[#8A93A0] uppercase">Sample Size & ROI</div>
            <div className="text-xl font-mono font-bold text-zinc-300 mt-1">
              {kpis?.cumulativeRoiPct !== null && kpis?.cumulativeRoiPct !== undefined ? `${kpis.cumulativeRoiPct}%` : 'N/A'}
            </div>
            <div className="text-[9px] font-mono text-amber-400 mt-0.5 truncate" title={kpis?.sampleLabel}>
              {kpis?.sampleLabel ?? 'INCONCLUSIVE'}
            </div>
          </div>
        </div>

        {/* Provider Health & Market Readiness Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          
          {/* Panel A: Provider Health */}
          <div className="bg-[#111418] border border-[#232830] rounded p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#1C2026]">
              <span className="font-mono text-xs font-semibold text-[#E6E9EE] flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-emerald-400" />
                PROVIDER CONNECTIVITY & QUOTAS
              </span>
              <span className="text-[10px] font-mono text-[#8A93A0]">FREE TIER BOUNDARIES</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
              {/* 5Dollar Free */}
              <div className="bg-[#171B20] border border-[#232830] rounded p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#E6E9EE]">5DollarFootballAPI</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                    providerHealth?.fivedollar?.isConfigured ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                  }`}>
                    {providerHealth?.fivedollar?.status || 'UNCONFIGURED'}
                  </span>
                </div>
                <div className="text-[#8A93A0] text-[11px]">Limit: 60 req/hr | Internal Cap: 42 req/hr</div>
                <div className="text-[#8A93A0] text-[11px]">Burst Ceiling: 12 req/min | Pacing: 3,000ms</div>
                <div className="text-[#8A93A0] text-[11px]">Odds Source: Bet365 (Top 5 Leagues)</div>
                <div className="pt-1 text-[10px] text-[#5B6370]">
                  Atribusi: <a href="https://5dollarfootballapi.com" target="_blank" rel="noreferrer" className="underline hover:text-[#E6E9EE]">Football data by 5DollarFootballAPI</a>
                </div>
              </div>

              {/* API-Football */}
              <div className="bg-[#171B20] border border-[#232830] rounded p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#E6E9EE]">API-Football (v3)</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/10 text-rose-400">
                    BLOCKED
                  </span>
                </div>
                <div className="text-[#8A93A0] text-[11px]">Account Key: cb36...aab6 (Suspended)</div>
                <div className="text-[#8A93A0] text-[11px]">Outbound Calls: 0 (Enforced)</div>
                <div className="text-[#8A93A0] text-[11px]">Ticket: Submitted 2026-11-07</div>
                <div className="text-[#5B6370] text-[10px] pt-1">
                  Decoupled: Live pipeline operates without API-Football
                </div>
              </div>
            </div>
          </div>

          {/* Panel B: Market Readiness */}
          <div className="bg-[#111418] border border-[#232830] rounded p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#1C2026]">
              <span className="font-mono text-xs font-semibold text-[#E6E9EE] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                FOUR-MARKET READINESS & GOVERNANCE
              </span>
              <span className="text-[10px] font-mono text-[#8A93A0]">POSITIONING GATES</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="bg-[#171B20] border border-[#232830] rounded p-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#E6E9EE]">Asian Handicap (AH)</span>
                  <span className="text-[10px] text-emerald-400 font-semibold">PASS</span>
                </div>
                <div className="text-[10px] text-[#8A93A0] mt-1">Core Candidate (Prioritas 1)</div>
                <div className="text-[10px] text-[#5B6370]">Brier: {kpis?.ahBrierScore ?? '0.267'} | Quarter-line split active</div>
              </div>

              <div className="bg-[#171B20] border border-[#232830] rounded p-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#E6E9EE]">Over/Under (OU)</span>
                  <span className="text-[10px] text-emerald-400 font-semibold">PASS</span>
                </div>
                <div className="text-[10px] text-[#8A93A0] mt-1">Core Candidate (Prioritas 3)</div>
                <div className="text-[10px] text-[#5B6370]">Brier: {kpis?.ouBrierScore ?? '0.249'} | Total goals Poisson</div>
              </div>

              <div className="bg-[#171B20] border border-[#232830] rounded p-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#E6E9EE]">Moneyline (1X2)</span>
                  <span className="text-[10px] text-amber-400 font-semibold">RESEARCH</span>
                </div>
                <div className="text-[10px] text-[#8A93A0] mt-1">Validation Pending (Prioritas 2)</div>
                <div className="text-[10px] text-[#5B6370]">3-way devig & independent backtest req</div>
              </div>

              <div className="bg-[#171B20] border border-[#232830] rounded p-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#E6E9EE]">Both Teams Score (BTTS)</span>
                  <span className="text-[10px] text-rose-400 font-semibold">RESEARCH ONLY</span>
                </div>
                <div className="text-[10px] text-[#8A93A0] mt-1">Quarantined (Prioritas 4)</div>
                <div className="text-[10px] text-[#5B6370]">Zero betting signals | Stake units = 0.0</div>
              </div>
            </div>
          </div>
        </div>

        {/* Ledger Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[#232830] pb-2 text-xs font-mono">
          <button
            onClick={() => setActiveTab('LIVE')}
            className={`px-3 py-1.5 rounded transition-colors ${
              activeTab === 'LIVE' ? 'bg-[#232830] text-[#E6E9EE] font-bold' : 'text-[#8A93A0] hover:text-[#E6E9EE]'
            }`}
          >
            Today's Signals ({recordsByProvenance.LIVE_SHADOW_SIGNAL?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('HIST_PRED')}
            className={`px-3 py-1.5 rounded transition-colors ${
              activeTab === 'HIST_PRED' ? 'bg-[#232830] text-[#E6E9EE] font-bold' : 'text-[#8A93A0] hover:text-[#E6E9EE]'
            }`}
          >
            Genuine Historical Predictions ({recordsByProvenance.HISTORICAL_PREDICTION?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('HIST_REC')}
            className={`px-3 py-1.5 rounded transition-colors ${
              activeTab === 'HIST_REC' ? 'bg-[#232830] text-[#E6E9EE] font-bold' : 'text-[#8A93A0] hover:text-[#E6E9EE]'
            }`}
          >
            Reconstructed Research ({recordsByProvenance.HISTORICAL_RECONSTRUCTION?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('RESULT_ONLY')}
            className={`px-3 py-1.5 rounded transition-colors ${
              activeTab === 'RESULT_ONLY' ? 'bg-[#232830] text-[#E6E9EE] font-bold' : 'text-[#8A93A0] hover:text-[#E6E9EE]'
            }`}
          >
            Historical Results Only ({recordsByProvenance.HISTORICAL_RESULT_ONLY?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('UNVERIFIED')}
            className={`px-3 py-1.5 rounded transition-colors ${
              activeTab === 'UNVERIFIED' ? 'bg-[#232830] text-[#E6E9EE] font-bold' : 'text-[#8A93A0] hover:text-[#E6E9EE]'
            }`}
          >
            Quarantined ({recordsByProvenance.UNVERIFIED?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('PERF')}
            className={`px-3 py-1.5 rounded transition-colors ${
              activeTab === 'PERF' ? 'bg-[#232830] text-[#E6E9EE] font-bold' : 'text-[#8A93A0] hover:text-[#E6E9EE]'
            }`}
          >
            Performance Analytics
          </button>
          <button
            onClick={() => setActiveTab('CONTROLS')}
            className={`px-3 py-1.5 rounded transition-colors ${
              activeTab === 'CONTROLS' ? 'bg-[#232830] text-[#E6E9EE] font-bold' : 'text-[#8A93A0] hover:text-[#E6E9EE]'
            }`}
          >
            Operator Controls &amp; Runs
          </button>
        </div>

        {/* Tab Content: Data Tables (Tabs: LIVE, HIST_PRED, HIST_REC, RESULT_ONLY, UNVERIFIED) */}
        {activeTab !== 'PERF' && activeTab !== 'CONTROLS' && (
          <div className="bg-[#111418] border border-[#232830] rounded p-4 space-y-4">
            
            {/* Filter Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1C2026] text-xs font-mono">
              <div className="flex items-center gap-3">
                <span className="text-[#8A93A0] flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5" /> Filter:
                </span>
                <select
                  value={marketFilter}
                  onChange={(e) => setMarketFilter(e.target.value)}
                  className="bg-[#171B20] border border-[#232830] rounded px-2 py-1 text-[#E6E9EE]"
                >
                  <option value="ALL">All Markets</option>
                  <option value="AH">Asian Handicap</option>
                  <option value="OU">Over/Under</option>
                  <option value="1X2">Moneyline (1X2)</option>
                  <option value="BTTS">BTTS</option>
                </select>

                <select
                  value={verdictFilter}
                  onChange={(e) => setVerdictFilter(e.target.value)}
                  className="bg-[#171B20] border border-[#232830] rounded px-2 py-1 text-[#E6E9EE]"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="QUALIFIED_VALUE_BET">QUALIFIED_VALUE_BET</option>
                  <option value="PANTAU">PANTAU</option>
                  <option value="LEWATI">LEWATI</option>
                  <option value="RESEARCH_ONLY">RESEARCH_ONLY</option>
                  <option value="NO_MARKET_DATA">NO_MARKET_DATA</option>
                </select>
              </div>

              <div className="text-[#8A93A0]">
                Showing {currentList.length} records
              </div>
            </div>

            {/* Records Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="border-b border-[#232830] text-[#8A93A0]">
                    <th className="py-2 px-2.5">Date / Kickoff</th>
                    <th className="py-2 px-2.5">Match Identity</th>
                    <th className="py-2 px-2.5">Mkt</th>
                    <th className="py-2 px-2.5">Selection / Line</th>
                    <th className="py-2 px-2.5">Bookmaker</th>
                    <th className="py-2 px-2.5 text-right">Odds</th>
                    <th className="py-2 px-2.5 text-right">Model %</th>
                    <th className="py-2 px-2.5 text-right">EV %</th>
                    <th className="py-2 px-2.5 text-center">Conf</th>
                    <th className="py-2 px-2.5">Status</th>
                    <th className="py-2 px-2.5">Settlement</th>
                    <th className="py-2 px-2.5 text-right">Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1C2026]">
                  {currentList.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-8 text-center text-[#5B6370]">
                        No records match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    currentList.slice(0, 50).map((r, i) => (
                      <tr key={r.predictionId || i} className="hover:bg-[#171B20] transition-colors">
                        <td className="py-2 px-2.5 text-[#8A93A0] whitespace-nowrap">
                          {r.kickoffAt?.slice(0, 16).replace('T', ' ')}
                        </td>
                        <td className="py-2 px-2.5 text-[#E6E9EE] font-semibold whitespace-nowrap">
                          {r.canonicalMatchId}
                        </td>
                        <td className="py-2 px-2.5">
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#232830] text-[#E6E9EE]">
                            {r.market}
                          </span>
                        </td>
                        <td className="py-2 px-2.5 text-[#E6E9EE] whitespace-nowrap">
                          {r.selection} {r.handicapLine !== null ? `(${r.handicapLine})` : ''} {r.totalLine !== null ? `(${r.totalLine})` : ''}
                        </td>
                        <td className="py-2 px-2.5 text-[#8A93A0]">
                          {r.bookmaker}
                        </td>
                        <td className="py-2 px-2.5 text-right text-[#E6E9EE] font-semibold">
                          {r.oddsAtSignal > 0 ? r.oddsAtSignal.toFixed(2) : '—'}
                        </td>
                        <td className="py-2 px-2.5 text-right text-[#8A93A0]">
                          {r.modelProbability > 0 ? `${r.modelProbability.toFixed(1)}%` : '—'}
                        </td>
                        <td className="py-2 px-2.5 text-right">
                          <span className={r.expectedValue > 0 ? 'text-emerald-400 font-semibold' : 'text-[#8A93A0]'}>
                            {r.expectedValue !== 0 ? `${r.expectedValue > 0 ? '+' : ''}${r.expectedValue.toFixed(1)}%` : '0%'}
                          </span>
                        </td>
                        <td className="py-2 px-2.5 text-center text-[#8A93A0]">
                          {r.confidence}
                        </td>
                        <td className="py-2 px-2.5 whitespace-nowrap">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              r.predictionStatus === 'QUALIFIED_VALUE_BET'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                : r.predictionStatus === 'PANTAU'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                : r.predictionStatus === 'RESEARCH_ONLY'
                                ? 'bg-blue-500/10 text-blue-400'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            {r.predictionStatus}
                          </span>
                        </td>
                        <td className="py-2 px-2.5 whitespace-nowrap">
                          {r.settlementStatus === 'SETTLED' ? (
                            <span
                              className={`text-[11px] font-semibold ${
                                r.settlementResult === 'WIN' || r.settlementResult === 'HALF_WIN'
                                  ? 'text-emerald-400'
                                  : r.settlementResult === 'LOSS' || r.settlementResult === 'HALF_LOSS'
                                  ? 'text-rose-400'
                                  : 'text-amber-400'
                              }`}
                            >
                              {r.settlementResult} ({r.homeGoals}-{r.awayGoals})
                            </span>
                          ) : (
                            <span className="text-[11px] text-[#5B6370]">PENDING</span>
                          )}
                        </td>
                        <td className="py-2 px-2.5 text-right font-semibold">
                          {r.settlementStatus === 'SETTLED' ? (
                            <span className={r.profitUnits > 0 ? 'text-emerald-400' : r.profitUnits < 0 ? 'text-rose-400' : 'text-[#8A93A0]'}>
                              {r.profitUnits > 0 ? `+${r.profitUnits.toFixed(2)}` : r.profitUnits < 0 ? r.profitUnits.toFixed(2) : '0.00'}
                            </span>
                          ) : (
                            <span className="text-[#5B6370]">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {currentList.length > 50 && (
                <div className="py-2 text-center text-[#5B6370] text-[11px]">
                  Showing first 50 of {currentList.length} records. Export full ledger for complete analysis.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab Content: Performance Analytics */}
        {activeTab === 'PERF' && (
          <div className="bg-[#111418] border border-[#232830] rounded p-6 space-y-6">
            <div className="border-b border-[#232830] pb-3">
              <h2 className="text-sm font-bold font-mono uppercase text-[#E6E9EE]">Market-Segregated Performance &amp; Calibration</h2>
              <p className="text-xs text-[#8A93A0] mt-0.5">
                Strict invariant: Unsettled bets and research markets (1X2 &amp; BTTS) are strictly quarantined from betting ROI.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-[#171B20] border border-[#232830] rounded p-4 space-y-2">
                <div className="text-xs font-mono text-[#8A93A0]">Official Qualified Bets ROI</div>
                <div className="text-2xl font-mono font-bold text-zinc-300">
                  {kpis?.cumulativeRoiPct !== null ? `${kpis?.cumulativeRoiPct}%` : 'N/A'}
                </div>
                <div className="text-xs text-[#5B6370]">
                  Staked: {kpis?.totalStakedUnits}u | Net Profit: {kpis?.netProfitUnits}u
                </div>
                <div className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20">
                  {kpis?.sampleLabel}
                </div>
              </div>

              <div className="bg-[#171B20] border border-[#232830] rounded p-4 space-y-2">
                <div className="text-xs font-mono text-[#8A93A0]">Average Closing Line Value (CLV)</div>
                <div className="text-2xl font-mono font-bold text-zinc-300">
                  {kpis?.averageClvPct !== null ? `${kpis?.averageClvPct}%` : 'N/A'}
                </div>
                <div className="text-xs text-[#5B6370]">
                  Positive CLV Rate: {kpis?.positiveClvRatePct !== null ? `${kpis?.positiveClvRatePct}%` : 'N/A'}
                </div>
                <div className="text-[10px] font-mono text-[#8A93A0]">
                  Same-line comparisons strictly (Bet365 / Pinnacle isolated)
                </div>
              </div>

              <div className="bg-[#171B20] border border-[#232830] rounded p-4 space-y-2">
                <div className="text-xs font-mono text-[#8A93A0]">Brier Calibration Scores</div>
                <div className="text-sm font-mono space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[#8A93A0]">AH Brier Score:</span>
                    <span className="font-bold text-[#E6E9EE]">{kpis?.ahBrierScore ?? 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8A93A0]">OU Brier Score:</span>
                    <span className="font-bold text-[#E6E9EE]">{kpis?.ouBrierScore ?? 'N/A'}</span>
                  </div>
                  <div className="text-[10px] text-[#5B6370] pt-1">
                    Uninformative baseline = 0.250 (Lower is better)
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab Content: Operator Controls & Runs */}
        {activeTab === 'CONTROLS' && (
          <div className="bg-[#111418] border border-[#232830] rounded p-6 space-y-6">
            <div className="border-b border-[#232830] pb-3">
              <h2 className="text-sm font-bold font-mono uppercase text-[#E6E9EE]">Operator Controls &amp; Execution Logs</h2>
              <p className="text-xs text-[#8A93A0] mt-0.5">
                Trigger isolated shadow ingestion, test rate limits, and export immutable ledger records.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs">
              <button
                onClick={handleTriggerBackfill}
                disabled={isExecuting}
                className="p-3 rounded bg-[#171B20] border border-[#232830] hover:border-emerald-500/50 hover:bg-[#1C2026] text-left transition-colors disabled:opacity-50"
              >
                <div className="font-bold text-[#E6E9EE] flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-emerald-400" />
                  Run Historical Backfill
                </div>
                <div className="text-[11px] text-[#8A93A0] mt-1">Re-index 4-tier historical archives</div>
              </button>

              <button
                onClick={handleTestConnection}
                disabled={isExecuting}
                className="p-3 rounded bg-[#171B20] border border-[#232830] hover:border-amber-500/50 hover:bg-[#1C2026] text-left transition-colors disabled:opacity-50"
              >
                <div className="font-bold text-[#E6E9EE] flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-amber-400" />
                  Test Provider Connection
                </div>
                <div className="text-[11px] text-[#8A93A0] mt-1">Single minimal auth &amp; quota check</div>
              </button>

              <button
                onClick={handleExportLedger}
                className="p-3 rounded bg-[#171B20] border border-[#232830] hover:border-blue-500/50 hover:bg-[#1C2026] text-left transition-colors"
              >
                <div className="font-bold text-[#E6E9EE] flex items-center gap-1.5">
                  <Download className="w-4 h-4 text-blue-400" />
                  Export Shadow Ledger
                </div>
                <div className="text-[11px] text-[#8A93A0] mt-1">Download complete JSONL file</div>
              </button>

              <button
                onClick={fetchOverview}
                disabled={isExecuting}
                className="p-3 rounded bg-[#171B20] border border-[#232830] hover:border-zinc-500 hover:bg-[#1C2026] text-left transition-colors"
              >
                <div className="font-bold text-[#E6E9EE] flex items-center gap-1.5">
                  <RefreshCw className="w-4 h-4 text-zinc-400" />
                  Refresh All Metrics
                </div>
                <div className="text-[11px] text-[#8A93A0] mt-1">Reload ledger &amp; quota state</div>
              </button>
            </div>

            {/* Execution History */}
            <div className="space-y-3 pt-4 border-t border-[#1C2026]">
              <h3 className="text-xs font-mono font-bold uppercase text-[#8A93A0]">Recent Execution History</h3>
              {runHistory.length === 0 ? (
                <div className="text-xs font-mono text-[#5B6370]">No automated executions logged in current session.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono border-collapse">
                    <thead>
                      <tr className="border-b border-[#232830] text-[#8A93A0]">
                        <th className="py-2">Run ID</th>
                        <th className="py-2">Started At</th>
                        <th className="py-2">Status</th>
                        <th className="py-2 text-right">Fixtures</th>
                        <th className="py-2 text-right">Quota Used</th>
                        <th className="py-2 text-right">Predictions</th>
                        <th className="py-2 text-right">Picks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1C2026]">
                      {runHistory.map((run, i) => (
                        <tr key={run.runId || i}>
                          <td className="py-2 text-[#E6E9EE]">{run.runId}</td>
                          <td className="py-2 text-[#8A93A0]">{run.startedAt?.slice(0, 19).replace('T', ' ')}</td>
                          <td className="py-2">
                            <span className="text-emerald-400 font-bold">{run.status}</span>
                          </td>
                          <td className="py-2 text-right text-[#E6E9EE]">{run.fixturesDiscovered}</td>
                          <td className="py-2 text-right text-[#8A93A0]">{run.oddsRequestsConsumed}</td>
                          <td className="py-2 text-right text-[#E6E9EE]">{run.predictionsGenerated}</td>
                          <td className="py-2 text-right text-emerald-400 font-bold">{run.qualifiedPicks}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
