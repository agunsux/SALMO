'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { FilterBar, MarketFilter, QualityFilter, TimeHorizonFilter } from '@/components/layout/FilterBar';
import { MatchCard } from '@/components/match/MatchCard';
import { EvidenceDrawer } from '@/components/evidence/EvidenceDrawer';
import { TraceModal } from '@/components/trace/TraceModal';
import { MatchIntelligence, MarketView, LiveValidationSummary } from '@/types';
import { useI18n } from '@/i18n/context';
import { ShieldCheck, Calendar, Database, CheckCircle2 } from 'lucide-react';
import { matchesDynamicHorizon } from '@/lib/horizon';

export default function MatchesPage() {
  const { t } = useI18n();
  const [matches, setMatches] = useState<MatchIntelligence[]>([]);
  const [validation, setValidation] = useState<LiveValidationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'LOADING' | 'AVAILABLE' | 'DATA_UNAVAILABLE'>('LOADING');

  const [timeHorizon, setTimeHorizon] = useState<TimeHorizonFilter>('7_DAYS');
  const [marketFilter, setMarketFilter] = useState<MarketFilter>('ALL');
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>('ALL');

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
          setStatus(data.data.matches.length > 0 ? 'AVAILABLE' : 'DATA_UNAVAILABLE');
        } else {
          setStatus('DATA_UNAVAILABLE');
        }
      })
      .catch(err => {
        console.error('Failed to load matches:', err);
        setStatus('DATA_UNAVAILABLE');
      })
      .finally(() => setLoading(false));
  }, []);

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
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
              <Calendar className="h-3.5 w-3.5" />
              <span>PREMIER LEAGUE • FIXTURE INTELLIGENCE</span>
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-white dark:text-white light:text-[#14171C]">
              Canonical Matches & Market Views
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#8A93A0]">
              Direct consumer feed from HandicapLab canonical engine. Real Pinnacle lines, Dixon-Coles model probabilities.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-[#8A93A0]">
            <div className="flex items-center gap-1.5 rounded border border-[#232830] bg-[#111418] px-2.5 py-1">
              <Database className="h-3.5 w-3.5 text-blue-400" />
              <span>HandicapLab Pipeline</span>
            </div>
            <div className="flex items-center gap-1.5 rounded border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Fail-Closed Verified</span>
            </div>
          </div>
        </div>
      </section>

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
        ) : status === 'DATA_UNAVAILABLE' || filteredMatches.length === 0 ? (
          <div className="rounded-xl border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] p-12 text-center">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#171B20] text-[#8A93A0] mb-3">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-semibold text-[#E6E9EE]">
              {status === 'DATA_UNAVAILABLE' ? 'DATA_UNAVAILABLE' : t.states.noFixtures}
            </h3>
            <p className="mt-1 text-xs text-[#8A93A0] max-w-md mx-auto">
              {status === 'DATA_UNAVAILABLE'
                ? 'Canonical HandicapLab data is currently unavailable. No synthetic fixtures are generated.'
                : 'No fixtures match the selected horizon and quality filters.'}
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
