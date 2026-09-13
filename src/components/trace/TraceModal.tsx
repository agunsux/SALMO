'use client';

import React from 'react';
import { MarketView } from '@/types';
import { TraceGenerator } from '@/engine/trace/traceGenerator';
import { useI18n } from '@/i18n/context';
import { X, Calculator, ShieldCheck, ArrowRight } from 'lucide-react';

interface TraceModalProps {
  market: MarketView | null;
  matchTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

export const TraceModal: React.FC<TraceModalProps> = ({
  market,
  matchTitle,
  isOpen,
  onClose,
}) => {
  const { t } = useI18n();

  if (!isOpen || !market) return null;

  const trace = TraceGenerator.generateTrace(market);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="relative w-full max-w-2xl rounded-xl border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] dark:bg-[#111418] light:bg-[#FFFFFF] p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] pb-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
                <Calculator className="h-4 w-4" />
                <span>{t.trace.title}</span>
              </div>
              <h2 className="mt-1 text-lg font-bold text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C]">
                {matchTitle} — {market.marketType.replace('_', ' ')} ({market.lineLabel})
              </h2>
              <p className="mt-0.5 text-xs text-[#8A93A0]">
                {t.trace.subtitle}
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-[#8A93A0] hover:bg-[#232830] hover:text-white transition-colors"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Quick Metrics Banner */}
          <div className="mt-5 grid grid-cols-3 gap-3 rounded-lg border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#171B20] dark:bg-[#171B20] light:bg-[#EFF1F5] p-3 text-center">
            <div>
              <div className="text-[10px] text-[#8A93A0] uppercase font-medium">Model Prob</div>
              <div className="font-tabular text-sm font-bold text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C] mt-0.5">
                {trace.modelProbabilityPct !== null ? `${trace.modelProbabilityPct.toFixed(1)}%` : '—'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-[#8A93A0] uppercase font-medium">Implied Prob</div>
              <div className="font-tabular text-sm font-bold text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C] mt-0.5">
                {trace.impliedProbabilityPct !== null ? `${trace.impliedProbabilityPct.toFixed(1)}%` : '—'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-[#8A93A0] uppercase font-medium">Calculated Edge</div>
              <div className={`font-tabular text-sm font-bold mt-0.5 ${(trace.edgePercentagePoints ?? 0) > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {trace.edgePercentagePoints !== null ? `${trace.edgePercentagePoints > 0 ? '+' : ''}${trace.edgePercentagePoints.toFixed(1)} pp` : '—'}
              </div>
            </div>
          </div>

          {/* Step-by-Step Derivation */}
          <div className="mt-6 space-y-3.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8A93A0]">
              Derivation Steps (Zero Magic Numbers)
            </h3>

            {trace.arithmeticSteps.map((step) => (
              <div
                key={step.step}
                className="rounded-lg border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#171B20]/50 p-3.5 text-xs transition-colors hover:border-[#384150]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#232830] text-[10px] font-bold text-[#E6E9EE]">
                      {step.step}
                    </span>
                    <span className="font-semibold text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C]">
                      {step.name}
                    </span>
                  </div>
                  <span className="font-tabular font-bold text-emerald-400">
                    {step.result}
                  </span>
                </div>

                <div className="mt-2 text-[11px] text-[#8A93A0] font-mono bg-[#111418] rounded px-2 py-1 border border-[#232830]/60">
                  {step.formula}
                </div>

                <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-[#5B6370]">
                  <ArrowRight className="h-3 w-3 text-[#8A93A0]" />
                  <span>Origin: {step.provenance}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Validation Badge */}
          <div className="mt-6 flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-400">
            <div className="flex items-center gap-2 font-medium">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span>Gate Status: {trace.validationStage}</span>
            </div>
            <span className="text-[11px] text-[#8A93A0]">Provenance Verified</span>
          </div>
        </div>
      </div>
    </>
  );
};
