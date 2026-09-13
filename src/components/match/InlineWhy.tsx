'use client';

import React from 'react';
import { MarketView } from '@/types';
import { useI18n } from '@/i18n/context';
import { ShieldCheck, BarChart3, TrendingUp, Hash } from 'lucide-react';

export const InlineWhy: React.FC<{ market: MarketView }> = ({ market }) => {
  const { t, formatPercent, formatOdds, formatEdge } = useI18n();

  if (!market.available) {
    return (
      <div className="mt-3 rounded-lg border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#171B20]/60 dark:bg-[#171B20]/60 light:bg-[#EFF1F5]/60 p-3.5 text-xs text-[#8A93A0]">
        <div className="flex items-center gap-2 font-medium text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C]">
          <span className="h-2 w-2 rounded-full bg-zinc-500" />
          <span>{t.states.oddsUnavailable}</span>
        </div>
        <p className="mt-1">{t.states.oddsUnavailableDesc}</p>
      </div>
    );
  }

  const isPositive = (market.edgePercentagePoints ?? 0) > 0;

  return (
    <div className="mt-3 rounded-lg border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#171B20] dark:bg-[#171B20] light:bg-[#EFF1F5] p-4 text-xs transition-all">
      <div className="flex items-center justify-between border-b border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] pb-2.5 mb-3">
        <span className="font-semibold uppercase tracking-wider text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C]">
          {t.why.title} — {market.marketType.replace('_', ' ')}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
          <ShieldCheck className="h-3.5 w-3.5" />
          {market.validationStage}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Sample */}
        <div className="rounded border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] dark:bg-[#111418] light:bg-[#FFFFFF] p-2.5">
          <div className="flex items-center gap-1 text-[11px] text-[#8A93A0]">
            <Hash className="h-3 w-3" />
            <span>{t.why.sampleSize}</span>
          </div>
          <div className="mt-1 font-tabular text-sm font-semibold text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C]">
            {market.sampleSize} matches
          </div>
          <div className="mt-0.5 text-[10px] text-[#5B6370]">EPL verified closing</div>
        </div>

        {/* Probabilities */}
        <div className="rounded border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] dark:bg-[#111418] light:bg-[#FFFFFF] p-2.5">
          <div className="flex items-center gap-1 text-[11px] text-[#8A93A0]">
            <BarChart3 className="h-3 w-3" />
            <span>{t.why.coverRate}</span>
          </div>
          <div className="mt-1 font-tabular text-sm font-semibold text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C]">
            {formatPercent(market.modelProbabilityPct)}
          </div>
          <div className="mt-0.5 text-[10px] text-[#5B6370]">
            Implied: {formatPercent(market.marketImpliedProbabilityPct)}
          </div>
        </div>

        {/* Net Edge */}
        <div className="rounded border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] dark:bg-[#111418] light:bg-[#FFFFFF] p-2.5">
          <div className="flex items-center gap-1 text-[11px] text-[#8A93A0]">
            <TrendingUp className="h-3 w-3" />
            <span>{t.why.estimatedEdge}</span>
          </div>
          <div className={`mt-1 font-tabular text-sm font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
            {formatEdge(market.edgePercentagePoints)}
          </div>
          <div className="mt-0.5 text-[10px] text-[#5B6370]">
            Price: {formatOdds(market.odds)} ({market.bookmaker})
          </div>
        </div>

        {/* Quality */}
        <div className="rounded border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] dark:bg-[#111418] light:bg-[#FFFFFF] p-2.5">
          <div className="text-[11px] text-[#8A93A0]">{t.why.dataQuality}</div>
          <div className="mt-1 font-tabular text-sm font-semibold text-emerald-400">
            {market.dataQuality}
          </div>
          <div className="mt-0.5 text-[10px] text-[#5B6370]">{market.provenance.datasetVersion}</div>
        </div>
      </div>

      <p className="mt-2.5 text-[11px] text-[#8A93A0] italic border-t border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] pt-2">
        "{market.reason}"
      </p>
    </div>
  );
};
