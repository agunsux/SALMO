'use client';

import React, { useEffect, useState } from 'react';
import { MarketView, MatchObservation } from '@/types';
import { useI18n } from '@/i18n/context';
import { X, ShieldCheck, Database, Calendar } from 'lucide-react';

interface EvidenceDrawerProps {
  market: MarketView | null;
  matchTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

export const EvidenceDrawer: React.FC<EvidenceDrawerProps> = ({
  market,
  matchTitle,
  isOpen,
  onClose,
}) => {
  const { t, formatPercent, formatOdds } = useI18n();
  const [observations, setObservations] = useState<MatchObservation[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && market) {
      setLoading(true);
      const lineQuery = market.numericLine !== undefined ? `line=${market.numericLine}` : '';
      fetch(`/api/evidence?${lineQuery}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setObservations(data.data.observations);
          }
        })
        .catch(err => console.error('Evidence fetch error:', err))
        .finally(() => setLoading(false));
    }
  }, [isOpen, market]);

  if (!isOpen || !market) return null;

  const dist = market.settlementDistribution;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] dark:bg-[#111418] light:bg-[#FFFFFF] p-6 shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] pb-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>{t.evidence.title}</span>
            </div>
            <h2 className="mt-1 text-lg font-bold text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C]">
              {matchTitle} — {market.marketType.replace('_', ' ')} ({market.lineLabel})
            </h2>
            <p className="mt-0.5 text-xs text-[#8A93A0]">
              {t.evidence.subtitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-[#8A93A0] hover:bg-[#232830] hover:text-white transition-colors"
            aria-label="Close drawer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Settlement Distribution */}
        {dist && (
          <div className="mt-5 rounded-lg border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#171B20] dark:bg-[#171B20] light:bg-[#EFF1F5] p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8A93A0]">
              {t.evidence.distribution} (N = {market.sampleSize})
            </h3>

            {/* Distribution Bar */}
            <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-[#232830]">
              <div style={{ width: `${dist.winPct}%` }} className="bg-emerald-500" title={`Win: ${dist.winPct}%`} />
              <div style={{ width: `${dist.halfWinPct}%` }} className="bg-emerald-400/70" title={`Half Win: ${dist.halfWinPct}%`} />
              <div style={{ width: `${dist.pushPct}%` }} className="bg-amber-400" title={`Push: ${dist.pushPct}%`} />
              <div style={{ width: `${dist.halfLossPct}%` }} className="bg-rose-400/70" title={`Half Loss: ${dist.halfLossPct}%`} />
              <div style={{ width: `${dist.lossPct}%` }} className="bg-rose-500" title={`Loss: ${dist.lossPct}%`} />
            </div>

            {/* Breakdown Grid */}
            <div className="mt-3.5 grid grid-cols-5 gap-2 text-center text-xs">
              <div className="rounded bg-[#111418] dark:bg-[#111418] light:bg-[#FFFFFF] p-2 border border-[#232830]">
                <div className="text-[10px] text-[#8A93A0]">{t.evidence.win}</div>
                <div className="font-tabular font-bold text-emerald-400 mt-0.5">{formatPercent(dist.winPct)}</div>
              </div>
              <div className="rounded bg-[#111418] dark:bg-[#111418] light:bg-[#FFFFFF] p-2 border border-[#232830]">
                <div className="text-[10px] text-[#8A93A0]">{t.evidence.halfWin}</div>
                <div className="font-tabular font-semibold text-emerald-300 mt-0.5">{formatPercent(dist.halfWinPct)}</div>
              </div>
              <div className="rounded bg-[#111418] dark:bg-[#111418] light:bg-[#FFFFFF] p-2 border border-[#232830]">
                <div className="text-[10px] text-[#8A93A0]">{t.evidence.push}</div>
                <div className="font-tabular font-semibold text-amber-400 mt-0.5">{formatPercent(dist.pushPct)}</div>
              </div>
              <div className="rounded bg-[#111418] dark:bg-[#111418] light:bg-[#FFFFFF] p-2 border border-[#232830]">
                <div className="text-[10px] text-[#8A93A0]">{t.evidence.halfLoss}</div>
                <div className="font-tabular font-semibold text-rose-300 mt-0.5">{formatPercent(dist.halfLossPct)}</div>
              </div>
              <div className="rounded bg-[#111418] dark:bg-[#111418] light:bg-[#FFFFFF] p-2 border border-[#232830]">
                <div className="text-[10px] text-[#8A93A0]">{t.evidence.loss}</div>
                <div className="font-tabular font-bold text-rose-500 mt-0.5">{formatPercent(dist.lossPct)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Provenance Metadata */}
        <div className="mt-4 rounded-lg border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#171B20]/60 p-3 text-xs text-[#8A93A0]">
          <div className="flex items-center gap-2 font-medium text-[#E6E9EE]">
            <Database className="h-3.5 w-3.5 text-blue-400" />
            <span>Dataset Provenance</span>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-y-1 text-[11px]">
            <div>Source: <span className="text-[#E6E9EE]">{market.provenance.source}</span></div>
            <div>Version: <span className="text-[#E6E9EE]">{market.provenance.datasetVersion}</span></div>
            <div>Coverage: <span className="text-[#E6E9EE]">{market.provenance.dateRange}</span></div>
            <div>Validation: <span className="text-emerald-400 font-medium">{market.provenance.validationStatus}</span></div>
          </div>
        </div>

        {/* Match Observation Ledger */}
        <div className="mt-5 flex-1">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8A93A0]">
              {t.evidence.matchLedger} ({observations.length} recent shown)
            </h3>
            <span className="text-[11px] text-[#5B6370]">Real Match Records</span>
          </div>

          {loading ? (
            <div className="py-8 text-center text-xs text-[#8A93A0]">Loading verified observations...</div>
          ) : (
            <div className="space-y-2">
              {observations.map((obs) => {
                const isWin = obs.settlement === 'WIN' || obs.settlement === 'HALF_WIN';
                const isPush = obs.settlement === 'PUSH';
                return (
                  <div
                    key={obs.matchId}
                    className="flex items-center justify-between rounded-md border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#171B20]/40 p-2.5 text-xs hover:border-[#384150] transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2 font-medium text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C]">
                        <span>{obs.homeTeam} vs {obs.awayTeam}</span>
                        <span className="font-tabular text-emerald-400 font-semibold">{obs.scoreDisplay}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[#8A93A0]">
                        <Calendar className="h-3 w-3" />
                        <span>{obs.date}</span>
                        <span>•</span>
                        <span>Odds: {formatOdds(obs.odds)}</span>
                        <span>•</span>
                        <span>Line: {obs.line > 0 ? `+${obs.line}` : obs.line}</span>
                      </div>
                    </div>

                    <div className="text-right">
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
                      <div className={`mt-0.5 font-tabular text-[11px] font-bold ${obs.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {obs.profit >= 0 ? `+${obs.profit.toFixed(2)}u` : `${obs.profit.toFixed(2)}u`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

