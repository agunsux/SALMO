'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { MatchCard } from '@/components/match/MatchCard';
import { EvidenceDrawer } from '@/components/evidence/EvidenceDrawer';
import { TraceModal } from '@/components/trace/TraceModal';
import { MatchIntelligence, MarketView } from '@/types';
import { ShieldCheck, Layers } from 'lucide-react';
import { matchesDynamicHorizon, TimeHorizonFilter } from '@/lib/horizon';

export default function AsianHandicapPage() {
  const [matches, setMatches] = useState<MatchIntelligence[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'LOADING' | 'AVAILABLE' | 'DATA_UNAVAILABLE'>('LOADING');
  const [timeHorizon, setTimeHorizon] = useState<TimeHorizonFilter>('7_DAYS');

  const [evidenceMarket, setEvidenceMarket] = useState<MarketView | null>(null);
  const [evidenceTitle, setEvidenceTitle] = useState('');
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  const [traceMarket, setTraceMarket] = useState<MarketView | null>(null);
  const [traceTitle, setTraceTitle] = useState('');
  const [traceOpen, setTraceOpen] = useState(false);

  useEffect(() => {
    fetch('/api/matches?market=AH')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data?.matches) {
          setMatches(data.data.matches);
          setStatus(data.data.matches.length > 0 ? 'AVAILABLE' : 'DATA_UNAVAILABLE');
        } else {
          setStatus('DATA_UNAVAILABLE');
        }
      })
      .catch(err => {
        console.error('Failed to load AH matches:', err);
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

  const filteredMatches = matches.filter(m => matchesDynamicHorizon(m.kickoffIso, timeHorizon));

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0D10] text-[#E6E9EE]">
      <Header />

      <section className="mx-auto w-full max-w-7xl px-4 pt-6 pb-4 sm:px-6">
        <div className="border-b border-[#232830] pb-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
            <Layers className="h-3.5 w-3.5" />
            <span>MARKET SPECIFIC INTELLIGENCE</span>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Asian Handicap (AH)
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#8A93A0]">
            Quarter-line split settlement methodology. Sharp Pinnacle reference quotes vs Dixon-Coles expected outcome.
          </p>

          <div className="mt-3 flex items-center gap-2 text-xs">
            {(
              [
                { id: 'TODAY', label: 'Today' },
                { id: 'TOMORROW', label: 'Tomorrow' },
                { id: 'PLUS_3_DAYS', label: '+3 Days' },
                { id: '7_DAYS', label: '7 Days' },
              ] as const
            ).map(tab => (
              <button
                key={tab.id}
                onClick={() => setTimeHorizon(tab.id)}
                className={`rounded px-2.5 py-1 font-medium transition-colors ${
                  timeHorizon === tab.id
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold'
                    : 'bg-[#171B20] text-[#8A93A0] hover:text-white border border-[#232830]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <p className="mt-4 text-xs font-medium text-[#8A93A0]">Loading Asian Handicap canonical intelligence...</p>
          </div>
        ) : status === 'DATA_UNAVAILABLE' || filteredMatches.length === 0 ? (
          <div className="rounded-xl border border-[#232830] bg-[#111418] p-12 text-center">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#171B20] text-[#8A93A0] mb-3">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-semibold text-[#E6E9EE]">
              {status === 'DATA_UNAVAILABLE' ? 'DATA_UNAVAILABLE' : 'NO_QUALIFIED_PICKS'}
            </h3>
            <p className="mt-1 text-xs text-[#8A93A0] max-w-md mx-auto">
              {status === 'DATA_UNAVAILABLE'
                ? 'Canonical HandicapLab Asian Handicap feed is currently unavailable.'
                : 'No Asian Handicap fixtures match the selected horizon.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filteredMatches.map(match => (
              <MatchCard
                key={match.id}
                match={match}
                marketFilter="AH"
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
