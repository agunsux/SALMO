'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { MatchCard } from '@/components/match/MatchCard';
import { EvidenceDrawer } from '@/components/evidence/EvidenceDrawer';
import { TraceModal } from '@/components/trace/TraceModal';
import { MatchIntelligence, MarketView } from '@/types';
import { ArrowLeft, Calendar, ShieldCheck, Database, Layers, CheckCircle2, XCircle } from 'lucide-react';
import Link from 'next/link';

export default function MatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [match, setMatch] = useState<MatchIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'LOADING' | 'FOUND' | 'NOT_FOUND' | 'DATA_UNAVAILABLE'>('LOADING');

  const [evidenceMarket, setEvidenceMarket] = useState<MarketView | null>(null);
  const [evidenceTitle, setEvidenceTitle] = useState('');
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  const [traceMarket, setTraceMarket] = useState<MarketView | null>(null);
  const [traceTitle, setTraceTitle] = useState('');
  const [traceOpen, setTraceOpen] = useState(false);

  useEffect(() => {
    if (!id) return;

    fetch('/api/matches')
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.data?.matches)) {
          const found = data.data.matches.find(
            (m: MatchIntelligence) =>
              m.id === id ||
              m.fixtureId === id ||
              m.canonicalMatchId === id ||
              m.id.toLowerCase() === id.toLowerCase()
          );

          if (found) {
            setMatch(found);
            setStatus('FOUND');
          } else {
            setStatus('NOT_FOUND');
          }
        } else {
          setStatus('DATA_UNAVAILABLE');
        }
      })
      .catch(err => {
        console.error('Error fetching match detail:', err);
        setStatus('DATA_UNAVAILABLE');
      })
      .finally(() => setLoading(false));
  }, [id]);

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

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0D10] text-[#E6E9EE]">
      <Header />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
        <Link
          href="/matches"
          className="inline-flex items-center gap-1.5 text-xs text-[#8A93A0] hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Matches</span>
        </Link>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <p className="mt-4 text-xs font-medium text-[#8A93A0]">Loading match intelligence...</p>
          </div>
        ) : status === 'DATA_UNAVAILABLE' ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-12 text-center">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/10 text-rose-400 mb-3">
              <XCircle className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-semibold text-rose-300">DATA_UNAVAILABLE</h3>
            <p className="mt-1 text-xs text-[#8A93A0] max-w-md mx-auto">
              Canonical HandicapLab data is currently unavailable. No synthetic match details are fabricated.
            </p>
          </div>
        ) : !match || status === 'NOT_FOUND' ? (
          <div className="rounded-xl border border-[#232830] bg-[#111418] p-12 text-center">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#171B20] text-[#8A93A0] mb-3">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-semibold text-[#E6E9EE]">MATCH NOT FOUND</h3>
            <p className="mt-1 text-xs text-[#8A93A0] max-w-md mx-auto">
              No active canonical match was found with ID: <span className="font-mono text-zinc-300">{id}</span>.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Match Header Card */}
            <div className="rounded-xl border border-[#232830] bg-[#111418] p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#8A93A0] border-b border-[#232830] pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="font-semibold text-white">{match.league}</span>
                  <span>•</span>
                  <span>{match.kickoffDisplay}</span>
                </div>
                {match.venue && <span className="text-[11px] text-zinc-500">{match.venue}</span>}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
                    {match.homeTeam} <span className="text-zinc-500 font-normal">vs</span> {match.awayTeam}
                  </h1>
                  <p className="mt-1 text-xs text-[#8A93A0]">
                    Fixture ID: <span className="font-mono text-zinc-400">{match.fixtureId}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="rounded border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Pinnacle Sharp Validated</span>
                  </div>
                </div>
              </div>

              {/* Dixon-Coles Score Grid / Model Stats */}
              {match.scoreGridSummary && (
                <div className="mt-6 pt-4 border-t border-[#232830] grid grid-cols-3 gap-3 text-center">
                  <div className="rounded bg-[#171B20] p-2.5 border border-[#232830]">
                    <span className="text-[10px] uppercase text-[#8A93A0] block">Home Expected Goals (xG)</span>
                    <span className="font-tabular font-extrabold text-emerald-400 text-base">
                      {match.scoreGridSummary.homeXG.toFixed(2)}
                    </span>
                  </div>
                  <div className="rounded bg-[#171B20] p-2.5 border border-[#232830]">
                    <span className="text-[10px] uppercase text-[#8A93A0] block">Away Expected Goals (xG)</span>
                    <span className="font-tabular font-extrabold text-emerald-400 text-base">
                      {match.scoreGridSummary.awayXG.toFixed(2)}
                    </span>
                  </div>
                  <div className="rounded bg-[#171B20] p-2.5 border border-[#232830]">
                    <span className="text-[10px] uppercase text-[#8A93A0] block">Low-Score Correlation (Rho)</span>
                    <span className="font-tabular font-extrabold text-blue-400 text-base">
                      {match.scoreGridSummary.rho.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* MatchCard containing the 3 markets */}
            <MatchCard
              match={match}
              marketFilter="ALL"
              onOpenEvidence={handleOpenEvidence}
              onOpenTrace={handleOpenTrace}
            />
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
