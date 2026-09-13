'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { FilterBar, MarketFilter, QualityFilter } from '@/components/layout/FilterBar';
import { MatchCard } from '@/components/match/MatchCard';
import { EvidenceDrawer } from '@/components/evidence/EvidenceDrawer';
import { TraceModal } from '@/components/trace/TraceModal';
import { MatchIntelligence, MarketView } from '@/types';
import { useI18n } from '@/i18n/context';
import { ShieldCheck, Database, Calendar } from 'lucide-react';

export default function HomePage() {
  const { t } = useI18n();
  const [matches, setMatches] = useState<MatchIntelligence[]>([]);
  const [loading, setLoading] = useState(true);

  const [marketFilter, setMarketFilter] = useState<MarketFilter>('ALL');
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>('ALL');

  // Evidence Drawer state
  const [evidenceMarket, setEvidenceMarket] = useState<MarketView | null>(null);
  const [evidenceTitle, setEvidenceTitle] = useState('');
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  // Calculation Trace state
  const [traceMarket, setTraceMarket] = useState<MarketView | null>(null);
  const [traceTitle, setTraceTitle] = useState('');
  const [traceOpen, setTraceOpen] = useState(false);

  useEffect(() => {
    fetch('/api/matches')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setMatches(data.data.matches);
        }
      })
      .catch(err => console.error('Failed to load matches:', err))
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

  // Filter matches based on active criteria
  const filteredMatches = matches.filter(m => {
    if (qualityFilter === 'VALUE_ONLY') {
      const hasValue =
        m.markets.asianHandicap.badge === 'GREEN' ||
        m.markets.btts.badge === 'GREEN' ||
        m.markets.overUnder.badge === 'GREEN';
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

      {/* Hero Title Section */}
      <section className="mx-auto w-full max-w-7xl px-4 pt-6 pb-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
              <Calendar className="h-3.5 w-3.5" />
              <span>{t.header.premierLeague} • MATCHDAY INTELLIGENCE</span>
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-white dark:text-white light:text-[#14171C]">
              {t.header.title}
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#8A93A0]">
              {t.header.subtitle}
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs text-[#8A93A0]">
            <div className="flex items-center gap-1.5 rounded border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] dark:bg-[#111418] light:bg-[#EFF1F5] px-2.5 py-1">
              <Database className="h-3.5 w-3.5 text-blue-400" />
              <span>2,659 Verified Real Matches</span>
            </div>
          </div>
        </div>
      </section>

      {/* Filter Bar */}
      <FilterBar
        marketFilter={marketFilter}
        onMarketFilterChange={setMarketFilter}
        qualityFilter={qualityFilter}
        onQualityFilterChange={setQualityFilter}
        matchCount={filteredMatches.length}
      />

      {/* Main Workspace Feed */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <p className="mt-4 text-xs font-medium text-[#8A93A0]">
              Loading verified market intelligence...
            </p>
          </div>
        ) : filteredMatches.length === 0 ? (
          <div className="rounded-xl border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] p-12 text-center">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#171B20] text-[#8A93A0] mb-3">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-semibold text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C]">
              {t.states.noFixtures}
            </h3>
            <p className="mt-1 text-xs text-[#8A93A0] max-w-md mx-auto">
              Try switching your filter to "ALL MARKETS" or reset quality filters to see all available matchday assessments.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredMatches.map(match => (
              <MatchCard
                key={match.id}
                match={match}
                onOpenEvidence={handleOpenEvidence}
                onOpenTrace={handleOpenTrace}
              />
            ))}
          </div>
        )}
      </main>

      {/* Evidence Drawer */}
      <EvidenceDrawer
        market={evidenceMarket}
        matchTitle={evidenceTitle}
        isOpen={evidenceOpen}
        onClose={() => setEvidenceOpen(false)}
      />

      {/* Calculation Trace Modal */}
      <TraceModal
        market={traceMarket}
        matchTitle={traceTitle}
        isOpen={traceOpen}
        onClose={() => setTraceOpen(false)}
      />

      {/* Global Minimal Footer */}
      <footer className="border-t border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#0B0D10] dark:bg-[#0B0D10] light:bg-[#FFFFFF] py-6 px-4 sm:px-6 mt-12 transition-colors">
        <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#8A93A0]">
          <div>
            <span className="font-bold text-white dark:text-white light:text-[#14171C]">SALMO.DEV</span>
            <span className="mx-2">•</span>
            <span>{t.brand.tagline}</span>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span>{t.brand.subtitle}</span>
            <span>•</span>
            <span className="text-emerald-400 font-medium">Zero Fabrication Policy</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
