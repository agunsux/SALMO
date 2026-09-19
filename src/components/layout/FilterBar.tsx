'use client';

import React from 'react';
import { useI18n } from '@/i18n/context';

export type MarketFilter = 'ALL' | 'AH' | 'BTTS' | 'OU';
export type QualityFilter = 'ALL' | 'VALUE_ONLY' | 'HIGH_CONFIDENCE';
export type TimeHorizonFilter = '7_DAYS' | 'TODAY' | 'TOMORROW' | 'PLUS_3_DAYS' | 'WEEKEND';

interface FilterBarProps {
  timeHorizonFilter?: TimeHorizonFilter;
  onTimeHorizonFilterChange?: (filter: TimeHorizonFilter) => void;
  marketFilter: MarketFilter;
  onMarketFilterChange: (filter: MarketFilter) => void;
  qualityFilter: QualityFilter;
  onQualityFilterChange: (filter: QualityFilter) => void;
  matchCount: number;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  timeHorizonFilter = '7_DAYS',
  onTimeHorizonFilterChange,
  marketFilter,
  onMarketFilterChange,
  qualityFilter,
  onQualityFilterChange,
  matchCount,
}) => {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-3 border-y border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418]/60 dark:bg-[#111418]/60 light:bg-[#EFF1F5]/60 px-4 py-3 sm:px-6">
      {/* Time Horizon Selector Tabs */}
      {onTimeHorizonFilterChange && (
        <div className="flex items-center gap-2 border-b border-[#232830]/50 pb-2.5 overflow-x-auto text-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#8A93A0] mr-1">Horizon:</span>
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
              onClick={() => onTimeHorizonFilterChange(tab.id)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                timeHorizonFilter === tab.id
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 font-semibold'
                  : 'bg-[#171B20] text-[#8A93A0] hover:text-white border border-[#232830]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Market Selector Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => onMarketFilterChange('ALL')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
              marketFilter === 'ALL'
                ? 'bg-emerald-500 text-black shadow-sm font-bold'
                : 'bg-[#171B20] dark:bg-[#171B20] light:bg-[#FFFFFF] text-[#8A93A0] hover:text-white dark:hover:text-white light:hover:text-[#14171C] border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7]'
            }`}
          >
            {t.filters.allMarkets}
          </button>

        <button
          onClick={() => onMarketFilterChange('AH')}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
            marketFilter === 'AH'
              ? 'bg-emerald-500 text-black shadow-sm font-bold'
              : 'bg-[#171B20] dark:bg-[#171B20] light:bg-[#FFFFFF] text-[#8A93A0] hover:text-white dark:hover:text-white light:hover:text-[#14171C] border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7]'
          }`}
        >
          {t.filters.ah}
        </button>

        <button
          onClick={() => onMarketFilterChange('BTTS')}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
            marketFilter === 'BTTS'
              ? 'bg-emerald-500 text-black shadow-sm font-bold'
              : 'bg-[#171B20] dark:bg-[#171B20] light:bg-[#FFFFFF] text-[#8A93A0] hover:text-white dark:hover:text-white light:hover:text-[#14171C] border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7]'
          }`}
        >
          {t.filters.btts}
        </button>

        <button
          onClick={() => onMarketFilterChange('OU')}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
            marketFilter === 'OU'
              ? 'bg-emerald-500 text-black shadow-sm font-bold'
              : 'bg-[#171B20] dark:bg-[#171B20] light:bg-[#FFFFFF] text-[#8A93A0] hover:text-white dark:hover:text-white light:hover:text-[#14171C] border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7]'
          }`}
        >
          {t.filters.ou}
        </button>
      </div>

      {/* Quality Filters & Match Count */}
      <div className="flex items-center justify-between sm:justify-end gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onQualityFilterChange(qualityFilter === 'VALUE_ONLY' ? 'ALL' : 'VALUE_ONLY')}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
              qualityFilter === 'VALUE_ONLY'
                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400 font-bold'
                : 'border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#171B20] dark:bg-[#171B20] light:bg-[#FFFFFF] text-[#8A93A0] hover:text-white'
            }`}
          >
            {t.filters.valueOnly}
          </button>

          <button
            onClick={() => onQualityFilterChange(qualityFilter === 'HIGH_CONFIDENCE' ? 'ALL' : 'HIGH_CONFIDENCE')}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
              qualityFilter === 'HIGH_CONFIDENCE'
                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400 font-bold'
                : 'border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#171B20] dark:bg-[#171B20] light:bg-[#FFFFFF] text-[#8A93A0] hover:text-white'
            }`}
          >
            {t.filters.highConfidence}
          </button>
        </div>

        <span className="text-[#8A93A0] font-tabular">
          <strong className="text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C]">{matchCount}</strong> matches
        </span>
      </div>
      </div>
    </div>
  );
};

