'use client';

import React, { useState } from 'react';
import { MatchIntelligence, MarketView, MarketType } from '@/types';
import { useI18n } from '@/i18n/context';
import { InlineWhy } from './InlineWhy';
import { Calendar, ChevronDown, ChevronUp, FileText, Calculator } from 'lucide-react';

interface MatchCardProps {
  match: MatchIntelligence;
  onOpenEvidence: (market: MarketView, matchTitle: string) => void;
  onOpenTrace: (market: MarketView, matchTitle: string) => void;
}

export const MatchCard: React.FC<MatchCardProps> = ({
  match,
  onOpenEvidence,
  onOpenTrace,
}) => {
  const { t, formatOdds, formatPercent, formatEdge } = useI18n();
  const [expandedMarket, setExpandedMarket] = useState<MarketType | null>(null);

  const toggleWhy = (m: MarketType) => {
    setExpandedMarket(prev => (prev === m ? null : m));
  };

  const matchTitle = `${match.homeTeam} vs ${match.awayTeam}`;

  const renderBadge = (market: MarketView) => {
    if (!market.available) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-zinc-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#8A93A0]">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
          {t.decisions.grey}
        </span>
      );
    }

    switch (market.badge) {
      case 'GREEN':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {t.decisions.green} · {market.status === 'VALUE' ? t.decisions.greenLabel : market.statusLabel}
          </span>
        );
      case 'YELLOW':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            {t.decisions.yellow} · {t.decisions.yellowLabel}
          </span>
        );
      case 'RED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-400">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            {t.decisions.red} · {t.decisions.redLabel}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#232830] bg-zinc-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#8A93A0]">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
            {t.decisions.grey}
          </span>
        );
    }
  };

  const renderConfidence = (market: MarketView) => {
    if (!market.available || market.confidence === 'NONE') {
      return <span className="text-[11px] text-[#5B6370]">{t.confidence.none}</span>;
    }
    const color =
      market.confidence === 'HIGH'
        ? 'text-emerald-400 font-semibold'
        : market.confidence === 'MEDIUM'
        ? 'text-[#E6E9EE] font-medium'
        : 'text-[#8A93A0]';

    return (
      <span className={`text-[11px] font-tabular ${color}`}>
        {market.confidence === 'HIGH' ? t.confidence.high : market.confidence === 'MEDIUM' ? t.confidence.medium : t.confidence.low}
        <span className="text-[10px] text-[#5B6370] ml-1">({market.confidenceScore}%)</span>
      </span>
    );
  };

  const marketList: Array<{ type: MarketType; title: string; view: MarketView }> = [
    { type: 'ASIAN_HANDICAP', title: t.markets.asianHandicap, view: match.markets.asianHandicap },
    { type: 'BTTS', title: t.markets.btts, view: match.markets.btts },
    { type: 'OVER_UNDER', title: t.markets.overUnder, view: match.markets.overUnder },
  ];

  return (
    <div className="rounded-xl border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] dark:bg-[#111418] light:bg-[#FFFFFF] p-4 sm:p-5 transition-all hover:border-[#333A46] shadow-sm">
      {/* Card Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] pb-3.5 mb-4 gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-[#171B20] dark:bg-[#171B20] light:bg-[#EFF1F5] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#8A93A0]">
              {match.league}
            </span>
            <span className="flex items-center gap-1 text-xs text-[#8A93A0]">
              <Calendar className="h-3 w-3" />
              <span>{match.kickoffDisplay}</span>
            </span>
          </div>

          <h3 className="mt-1.5 text-base sm:text-lg font-bold tracking-tight text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C]">
            <span>{match.homeTeam}</span>
            <span className="text-[#8A93A0] font-normal mx-2">vs</span>
            <span>{match.awayTeam}</span>
          </h3>
        </div>

        <div className="text-left sm:text-right text-xs text-[#8A93A0]">
          {match.venue && <span className="block text-[11px] text-[#5B6370]">{match.venue}</span>}
          <span className="inline-block mt-0.5 rounded px-1.5 py-0.5 bg-emerald-500/5 text-emerald-400 font-medium text-[10px]">
            {match.isUpcoming ? 'PRE-MATCH INTEL' : 'REAL CLOSING ODDS'}
          </span>
        </div>
      </div>

      {/* The Three-Market Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4">
        {marketList.map(({ type, title, view }) => {
          const isExpanded = expandedMarket === type;

          return (
            <div
              key={type}
              className={`flex flex-col justify-between rounded-lg border p-3.5 transition-all ${
                isExpanded
                  ? 'border-emerald-500/40 bg-[#171B20] dark:bg-[#171B20] light:bg-[#EFF1F5]'
                  : 'border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] dark:bg-[#111418] light:bg-[#FFFFFF] hover:border-[#384150]'
              }`}
            >
              <div>
                {/* Market Title & Badge */}
                <div className="flex items-center justify-between gap-1 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#8A93A0]">
                    {title}
                  </span>
                  {renderBadge(view)}
                </div>

                {/* Line & Odds */}
                <div className="flex items-baseline justify-between mt-1">
                  <span className="font-tabular text-sm font-bold text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C]">
                    {view.lineLabel}
                  </span>
                  <span className="font-tabular text-sm font-semibold text-emerald-400">
                    {view.odds ? `@ ${formatOdds(view.odds)}` : '—'}
                  </span>
                </div>

                {/* Confidence & Edge teaser */}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#232830]/60 dark:border-[#232830]/60 light:border-[#DCE0E7]">
                  <div>{renderConfidence(view)}</div>
                  {view.edgePercentagePoints !== null && (
                    <span className="font-tabular text-xs font-bold text-emerald-400">
                      {formatEdge(view.edgePercentagePoints)}
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons: Why, Evidence, Trace */}
              <div className="mt-3.5 flex items-center justify-between border-t border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] pt-2.5">
                <button
                  onClick={() => toggleWhy(type)}
                  className="flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  <span>{isExpanded ? t.actions.collapse : t.actions.why}</span>
                  {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>

                <div className="flex items-center gap-2 text-xs">
                  <button
                    onClick={() => onOpenEvidence(view, matchTitle)}
                    className="flex items-center gap-1 text-[#8A93A0] hover:text-white dark:hover:text-white light:hover:text-[#14171C] transition-colors"
                    title="View Evidence & Ledger"
                  >
                    <FileText className="h-3 w-3" />
                    <span>{t.actions.evidence}</span>
                  </button>

                  <button
                    onClick={() => onOpenTrace(view, matchTitle)}
                    className="flex items-center gap-1 text-[#8A93A0] hover:text-white dark:hover:text-white light:hover:text-[#14171C] transition-colors"
                    title="Open Calculation Trace"
                  >
                    <Calculator className="h-3 w-3" />
                    <span>{t.actions.trace}</span>
                  </button>
                </div>
              </div>

              {/* Inline Why Expansion */}
              {isExpanded && <InlineWhy market={view} />}
            </div>
          );
        })}
      </div>
    </div>
  );
};

