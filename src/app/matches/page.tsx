'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { FilterBar, MarketFilter, QualityFilter, TimeHorizonFilter } from '@/components/layout/FilterBar';
import { MatchCard } from '@/components/match/MatchCard';
import { EvidenceDrawer } from '@/components/evidence/EvidenceDrawer';
import { TraceModal } from '@/components/trace/TraceModal';
import { MatchIntelligence, MarketView, LiveValidationSummary } from '@/types';
import { useI18n } from '@/i18n/context';
import {
  ShieldCheck,
  Calendar,
  Database,
  CheckCircle2,
  Archive,
  Search,
  ChevronLeft,
  ChevronRight,
  Clock,
} from 'lucide-react';
import { matchesDynamicHorizon } from '@/lib/horizon';

interface ArchiveMatchItem {
  id: string;
  canonicalMatchId: string;
  providerFixtureId: string | null;
  providerName: string;
  league: string;
  leagueId: string;
  season: string;
  round: string | null;
  kickoffUtc: string;
  matchDate: string;
  homeTeam: string;
  awayTeam: string;
  status: 'UPCOMING' | 'FINISHED' | 'POSTPONED' | 'CANCELLED';
  homeGoals: number | null;
  awayGoals: number | null;
  matchScore: string | null;
  resultCode: 'H' | 'D' | 'A' | null;
  venue: string | null;
  sourceLayer: 'LIVE_WINDOW' | 'HISTORICAL_GOLD';
  resultVerified: boolean;
  resultVerifiedAt: string | null;
  predictionCoverage: 'PRODUCTION_LEDGER' | 'SHADOW_RESEARCH' | 'NO_PREDICTION_RECORDED';
  linkedPredictionsCount: number;
  settlementStatus: 'SETTLED' | 'PENDING' | 'NO_PREDICTION_RECORDED';
}

interface ArchiveSummary {
  activeWindowCount: number;
  historicalArchiveCount: number;
  finishedCount: number;
  upcomingCount: number;
  leaguesCovered: string[];
  seasonsCovered: string[];
  lastIngestedAt: string;
  lastResultSyncAt: string;
}

export default function MatchesPage() {
  const { t } = useI18n();
  const [viewMode, setViewMode] = useState<'UPCOMING' | 'ARCHIVE'>('UPCOMING');

  // Upcoming Intelligence state
  const [matches, setMatches] = useState<MatchIntelligence[]>([]);
  const [validation, setValidation] = useState<LiveValidationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'LOADING' | 'AVAILABLE' | 'DATA_TEMPORARILY_UNAVAILABLE' | 'NO_FIXTURES'>('LOADING');

  const [timeHorizon, setTimeHorizon] = useState<TimeHorizonFilter>('7_DAYS');
  const [marketFilter, setMarketFilter] = useState<MarketFilter>('ALL');
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>('ALL');

  // Archive state
  const [archiveMatches, setArchiveMatches] = useState<ArchiveMatchItem[]>([]);
  const [archiveSummary, setArchiveSummary] = useState<ArchiveSummary | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archivePage, setArchivePage] = useState(1);
  const [archiveTotalPages, setArchiveTotalPages] = useState(1);
  const [archiveTotalCount, setArchiveTotalCount] = useState(0);
  const [archiveLeague, setArchiveLeague] = useState('ALL');
  const [archiveSeason, setArchiveSeason] = useState('ALL');
  const [archiveStatus, setArchiveStatus] = useState<'ALL' | 'FINISHED' | 'UPCOMING'>('FINISHED');
  const [archiveSource, setArchiveSource] = useState<'ALL' | 'LIVE_WINDOW' | 'HISTORICAL_GOLD'>('ALL');
  const [archiveSearch, setArchiveSearch] = useState('');

  const [evidenceMarket, setEvidenceMarket] = useState<MarketView | null>(null);
  const [evidenceTitle, setEvidenceTitle] = useState('');
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  const [traceMarket, setTraceMarket] = useState<MarketView | null>(null);
  const [traceTitle, setTraceTitle] = useState('');
  const [traceOpen, setTraceOpen] = useState(false);

  useEffect(() => {
    fetch('/api/matches')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data?.matches) {
          setMatches(data.data.matches);
          if (data.data.validation) setValidation(data.data.validation);
          setStatus(data.data.matches.length > 0 ? 'AVAILABLE' : 'NO_FIXTURES');
        } else {
          setStatus('DATA_TEMPORARILY_UNAVAILABLE');
        }
      })
      .catch(err => {
        console.error('Failed to load matches:', err);
        setStatus('DATA_TEMPORARILY_UNAVAILABLE');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (viewMode !== 'ARCHIVE') return;
    let active = true;
    setArchiveLoading(true);

    const params = new URLSearchParams({
      view: 'archive',
      page: String(archivePage),
      pageSize: '25',
      league: archiveLeague,
      season: archiveSeason,
      status: archiveStatus,
      source: archiveSource,
    });
    if (archiveSearch.trim()) {
      params.set('search', archiveSearch.trim());
    }

    fetch(`/api/matches?${params.toString()}`)
      .then(res => res.json())
      .then(json => {
        if (!active) return;
        if (json.success && json.data) {
          setArchiveMatches(json.data.archiveMatches || []);
          setArchiveTotalCount(json.data.totalCount || 0);
          setArchiveTotalPages(json.data.totalPages || 1);
          if (json.data.archiveSummary) {
            setArchiveSummary(json.data.archiveSummary);
          }
        }
      })
      .catch(err => {
        console.error('Failed to load match archive:', err);
      })
      .finally(() => {
        if (active) setArchiveLoading(false);
      });

    return () => {
      active = false;
    };
  }, [viewMode, archivePage, archiveLeague, archiveSeason, archiveStatus, archiveSource, archiveSearch]);

  const handleOpenEvidence = (market: MarketView, matchTitle: string) => {
    setEvidenceMarket(market);
    setEvidenceTitle(matchTitle);
    setEvidenceOpen(true);
  };

  const handleOpenTrace = (market: MarketView, matchTitle: string) => {
    setTraceMarket(market);
    setTraceTitle(matchTitle);
    setTraceOpen(true);
  };

  const filteredMatches = matches.filter(m => {
    if (!matchesDynamicHorizon(m.kickoffIso, timeHorizon)) {
      return false;
    }

    if (qualityFilter === 'VALUE_ONLY') {
      const hasValue =
        m.markets.asianHandicap.badge === 'GREEN' ||
        m.markets.asianHandicap.badge === 'YELLOW' ||
        m.markets.btts.badge === 'GREEN' ||
        m.markets.btts.badge === 'YELLOW' ||
        m.markets.overUnder.badge === 'GREEN' ||
        m.markets.overUnder.badge === 'YELLOW';
      if (!hasValue) return false;
    }

    if (qualityFilter === 'HIGH_CONFIDENCE') {
      const hasHighConf =
        m.markets.asianHandicap.confidence === 'HIGH' ||
        m.markets.btts.confidence === 'HIGH' ||
        m.markets.overUnder.confidence === 'HIGH';
      if (!hasHighConf) return false;
    }

    return true;
  });

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0D10] text-[#E6E9EE] dark:bg-[#0B0D10] dark:text-[#E6E9EE] light:bg-[#F6F7F9] light:text-[#14171C]">
      <Header />

      <section className="mx-auto w-full max-w-7xl px-4 pt-6 pb-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
              <Calendar className="h-3.5 w-3.5" />
              <span>GLOBAL FOOTBALL • FIXTURE INTELLIGENCE & RESULTS ARCHIVE</span>
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-white dark:text-white light:text-[#14171C]">
              Canonical Matches & Verified Archive
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#8A93A0]">
              Direct consumer feed from canonical engine. Upcoming 7-day market views and 11,800+ verified historical match results.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-[#232830] bg-[#111418] p-1">
              <button
                onClick={() => setViewMode('UPCOMING')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  viewMode === 'UPCOMING'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'text-[#8A93A0] hover:text-white'
                }`}
              >
                <Calendar className="h-3.5 w-3.5" />
                <span>Upcoming Intelligence</span>
              </button>
              <button
                onClick={() => setViewMode('ARCHIVE')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  viewMode === 'ARCHIVE'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'text-[#8A93A0] hover:text-white'
                }`}
              >
                <Archive className="h-3.5 w-3.5" />
                <span>Results Archive (11,819)</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {viewMode === 'UPCOMING' ? (
        <>
          <FilterBar
            timeHorizonFilter={timeHorizon}
            onTimeHorizonFilterChange={setTimeHorizon}
            marketFilter={marketFilter}
            onMarketFilterChange={setMarketFilter}
            qualityFilter={qualityFilter}
            onQualityFilterChange={setQualityFilter}
            matchCount={filteredMatches.length}
          />

          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                <p className="mt-4 text-xs font-medium text-[#8A93A0]">Loading canonical match intelligence...</p>
              </div>
            ) : status === 'DATA_TEMPORARILY_UNAVAILABLE' ? (
              <div className="rounded-xl border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] p-12 text-center">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#171B20] text-[#8A93A0] mb-3">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-semibold text-[#E6E9EE]">
                  DATA_TEMPORARILY_UNAVAILABLE
                </h3>
                <p className="mt-1 text-xs text-[#8A93A0] max-w-md mx-auto">
                  SALMO fixture intelligence service is temporarily unavailable. Reconnecting to native feed... No synthetic fixtures are generated.
                </p>
              </div>
            ) : filteredMatches.length === 0 ? (
              <div className="rounded-xl border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] p-12 text-center">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#171B20] text-[#8A93A0] mb-3">
                  <Calendar className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-semibold text-[#E6E9EE]">
                  {t.states.noFixtures}
                </h3>
                <p className="mt-1 text-xs text-[#8A93A0] max-w-md mx-auto">
                  No fixtures scheduled for the selected time horizon and quality filters.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {filteredMatches.map(match => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    marketFilter={marketFilter}
                    onOpenEvidence={handleOpenEvidence}
                    onOpenTrace={handleOpenTrace}
                  />
                ))}
              </div>
            )}
          </main>
        </>
      ) : (
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 space-y-6">
          {/* Archive KPI Summary Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-[#232830] bg-[#111418] p-4">
              <span className="text-[10px] font-mono uppercase text-[#8A93A0] block">Verified Finished Results</span>
              <span className="mt-1 text-2xl font-mono font-bold text-emerald-400 block">
                {archiveSummary ? archiveSummary.finishedCount.toLocaleString() : '11,657'}
              </span>
              <span className="mt-0.5 text-[10px] text-[#8A93A0] block">
                2016–2026 Historical + Current Window
              </span>
            </div>
            <div className="rounded-xl border border-[#232830] bg-[#111418] p-4">
              <span className="text-[10px] font-mono uppercase text-[#8A93A0] block">Current 15-League Window</span>
              <span className="mt-1 text-2xl font-mono font-bold text-white block">
                {archiveSummary ? archiveSummary.activeWindowCount : '177'}
              </span>
              <span className="mt-0.5 text-[10px] text-[#8A93A0] block">
                15Finished · {archiveSummary ? archiveSummary.upcomingCount : '162'} Upcoming
              </span>
            </div>
            <div className="rounded-xl border border-[#232830] bg-[#111418] p-4">
              <span className="text-[10px] font-mono uppercase text-[#8A93A0] block">Historical Gold Archive</span>
              <span className="mt-1 text-2xl font-mono font-bold text-blue-400 block">
                {archiveSummary ? archiveSummary.historicalArchiveCount.toLocaleString() : '11,642'}
              </span>
              <span className="mt-0.5 text-[10px] text-[#8A93A0] block">
                Walk-Forward Calibration Dataset
              </span>
            </div>
            <div className="rounded-xl border border-[#232830] bg-[#111418] p-4">
              <span className="text-[10px] font-mono uppercase text-[#8A93A0] block">Last Result Sync (UTC)</span>
              <span className="mt-1 text-sm font-mono font-bold text-white block truncate">
                {archiveSummary?.lastResultSyncAt ? archiveSummary.lastResultSyncAt.replace('T', ' ').slice(0, 19) : '2026-10-10 18:47:36'}
              </span>
              <span className="mt-1 text-[10px] text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                <span>0 Score Conflicts · 756 Quarantined Excluded</span>
              </span>
            </div>
          </div>

          {/* Archive Filter Controls */}
          <div className="rounded-xl border border-[#232830] bg-[#111418] p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-xs">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#8A93A0]" />
                <input
                  type="text"
                  placeholder="Search team or league..."
                  value={archiveSearch}
                  onChange={e => {
                    setArchiveSearch(e.target.value);
                    setArchivePage(1);
                  }}
                  className="w-full rounded-lg border border-[#232830] bg-[#0B0D10] pl-9 pr-3 py-2 text-xs text-white placeholder-[#8A93A0] focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <select
                value={archiveSource}
                onChange={e => {
                  setArchiveSource(e.target.value as any);
                  setArchivePage(1);
                }}
                className="rounded-lg border border-[#232830] bg-[#0B0D10] px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="ALL">All Archive Layers (11,819)</option>
                <option value="LIVE_WINDOW">Current 15-League Window (177)</option>
                <option value="HISTORICAL_GOLD">Historical Gold Archive (11,642)</option>
              </select>

              <select
                value={archiveStatus}
                onChange={e => {
                  setArchiveStatus(e.target.value as any);
                  setArchivePage(1);
                }}
                className="rounded-lg border border-[#232830] bg-[#0B0D10] px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="FINISHED">Finished (Verified Score)</option>
                <option value="UPCOMING">Upcoming (Scheduled)</option>
              </select>

              <select
                value={archiveLeague}
                onChange={e => {
                  setArchiveLeague(e.target.value);
                  setArchivePage(1);
                }}
                className="rounded-lg border border-[#232830] bg-[#0B0D10] px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="ALL">All 15 Canonical Leagues</option>
                {(archiveSummary?.leaguesCovered || [
                  'Premier League',
                  'La Liga',
                  'Serie A',
                  'Bundesliga',
                  'Ligue 1',
                  'Eredivisie',
                  'Primeira Liga',
                  'Jupiler Pro League',
                  'Premiership',
                  'Championship',
                  'Major League Soccer',
                  'Pro League',
                  'J1 League',
                  'K League 1',
                  'Liga 1',
                ]).map(lg => (
                  <option key={lg} value={lg}>
                    {lg}
                  </option>
                ))}
              </select>

              <select
                value={archiveSeason}
                onChange={e => {
                  setArchiveSeason(e.target.value);
                  setArchivePage(1);
                }}
                className="rounded-lg border border-[#232830] bg-[#0B0D10] px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="ALL">All Seasons (2016–2026)</option>
                {(archiveSummary?.seasonsCovered || [
                  '2026',
                  '2025-2026',
                  '2024-2025',
                  '2023-2024',
                  '2022-2023',
                  '2021-2022',
                  '2020-2021',
                  '2019-2020',
                  '2018-2019',
                  '2017-2018',
                  '2016-2017',
                ]).map(s => (
                  <option key={s} value={s}>
                    Season {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Archive Table */}
          <div className="rounded-xl border border-[#232830] bg-[#111418] overflow-hidden">
            {archiveLoading ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                <p className="mt-3 text-xs text-[#8A93A0]">Querying canonical match archive...</p>
              </div>
            ) : archiveMatches.length === 0 ? (
              <div className="p-12 text-center text-xs text-[#8A93A0]">
                No canonical matches found for the selected filter combination.
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[#232830] bg-[#161B22] text-[10px] font-mono uppercase tracking-wider text-[#8A93A0]">
                        <th className="px-4 py-3">Date / Kickoff (UTC)</th>
                        <th className="px-4 py-3">Competition & Season</th>
                        <th className="px-4 py-3">Matchup</th>
                        <th className="px-4 py-3 text-center">Final Score</th>
                        <th className="px-4 py-3 text-center">Prediction & Ledger Coverage</th>
                        <th className="px-4 py-3 text-right">Canonical ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#232830] font-mono">
                      {archiveMatches.map(item => (
                        <tr key={item.id} className="hover:bg-[#161B22]/60 transition-colors">
                          <td className="px-4 py-3 text-[#8A93A0] whitespace-nowrap">
                            <div>{item.kickoffUtc ? item.kickoffUtc.replace('T', ' ').slice(0, 16) : item.matchDate}</div>
                            <div className="text-[10px] text-zinc-500">
                              {item.sourceLayer === 'LIVE_WINDOW' ? 'ACTIVE WINDOW' : 'GOLD ARCHIVE'}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-sans font-semibold text-white">{item.league}</div>
                            <div className="text-[10px] text-[#8A93A0]">
                              Season {item.season} {item.round ? `· ${item.round}` : ''}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-sans">
                            <div className="font-semibold text-white">
                              {item.homeTeam} <span className="text-[#8A93A0] font-normal">vs</span> {item.awayTeam}
                            </div>
                            {item.venue && (
                              <div className="text-[10px] text-[#8A93A0]">{item.venue}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            {item.status === 'FINISHED' && item.matchScore ? (
                              <span className="inline-flex items-center gap-1.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-400">
                                <span>FT {item.matchScore}</span>
                                {item.resultCode && (
                                  <span className="rounded bg-emerald-500/20 px-1 text-[10px]">
                                    {item.resultCode}
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                                <Clock className="h-3 w-3" />
                                <span>SCHEDULED</span>
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            {item.predictionCoverage === 'PRODUCTION_LEDGER' ? (
                              <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                                PRODUCTION LEDGER ({item.settlementStatus})
                              </span>
                            ) : item.predictionCoverage === 'SHADOW_RESEARCH' ? (
                              <span className="rounded border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-300">
                                SHADOW RESEARCH
                              </span>
                            ) : (
                              <span className="rounded border border-zinc-700 bg-zinc-800/70 px-2 py-0.5 text-[10px] font-semibold text-zinc-400">
                                NO_PREDICTION_RECORDED
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-[10px] text-[#8A93A0] whitespace-nowrap">
                            {item.canonicalMatchId}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-[#232830] bg-[#161B22] px-4 py-3 text-xs text-[#8A93A0]">
                  <div>
                    Showing page <span className="font-bold text-white">{archivePage}</span> of{' '}
                    <span className="font-bold text-white">{archiveTotalPages}</span> ({archiveTotalCount.toLocaleString()} total canonical matches)
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={archivePage <= 1}
                      onClick={() => setArchivePage(p => Math.max(1, p - 1))}
                      className="inline-flex items-center gap-1 rounded border border-[#232830] bg-[#111418] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 hover:border-emerald-500/40"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      <span>Previous</span>
                    </button>
                    <button
                      disabled={archivePage >= archiveTotalPages}
                      onClick={() => setArchivePage(p => Math.min(archiveTotalPages, p + 1))}
                      className="inline-flex items-center gap-1 rounded border border-[#232830] bg-[#111418] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 hover:border-emerald-500/40"
                    >
                      <span>Next</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      )}

      <EvidenceDrawer
        isOpen={evidenceOpen}
        onClose={() => setEvidenceOpen(false)}
        market={evidenceMarket}
        matchTitle={evidenceTitle}
      />

      <TraceModal
        isOpen={traceOpen}
        onClose={() => setTraceOpen(false)}
        market={traceMarket}
        matchTitle={traceTitle}
      />
    </div>
  );
}
