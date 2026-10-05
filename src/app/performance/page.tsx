'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ShieldCheck, AlertTriangle, Database, Activity, Clock, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface ResearchApiResponse {
  success: boolean;
  version?: string;
  modelVersion?: string;
  dataState?: string;
  counts?: {
    totalArchived: number;
    dailyPicks: number;
    settled: number;
    pending: number;
  };
  predictions?: any[];
  timestampUtc?: string;
  error?: {
    code: string;
    message: string;
  };
}

export default function PerformancePage() {
  const [data, setData] = useState<ResearchApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v1/research')
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((json: ResearchApiResponse) => {
        setData(json);
      })
      .catch(err => {
        console.error('Failed to load research data for performance:', err);
        setError(err.message || 'Data unavailable');
      })
      .finally(() => setLoading(false));
  }, []);

  const settledCount = data?.counts?.settled ?? 0;
  const pendingCount = data?.counts?.pending ?? 0;
  const totalArchived = data?.counts?.totalArchived ?? 0;
  const modelVersion = data?.modelVersion ?? 'poisson_v1_rescue';

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0D10] text-[#E6E9EE]">
      <Header />

      <section className="mx-auto w-full max-w-7xl px-4 pt-6 pb-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-[#232830] pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-purple-400">
              <Activity className="h-3.5 w-3.5" />
              <span>EMPIRICAL PERFORMANCE AUDIT • DATASET: RESEARCH</span>
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Model Performance & Track Record
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#8A93A0]">
              Audited settlement record from immutable pre-kickoff ledgers. Zero synthetic calculations.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-purple-300 font-medium">
              DATASET: RESEARCH
            </span>
            <span className="rounded border border-zinc-700 bg-zinc-800/60 px-2.5 py-1 text-zinc-400">
              MODEL: {modelVersion}
            </span>
          </div>
        </div>
      </section>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <p className="mt-4 text-xs font-medium text-[#8A93A0]">Loading research performance ledger...</p>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-12 text-center">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/10 text-rose-400 mb-3">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-semibold text-rose-300">DATA_UNAVAILABLE</h3>
            <p className="mt-1 text-xs text-[#8A93A0] max-w-md mx-auto">
              Authoritative research ledger is temporarily unreachable. SALMO strictly refuses to fabricate fallback metrics.
            </p>
          </div>
        ) : settledCount < 30 ? (
          /* Minimum sample size rule: Zero frontend CLV or ROI calculation when sample < 30 */
          <div className="space-y-6">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-12 text-center">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-400 mb-4">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-amber-300 tracking-tight">
                INSUFFICIENT SAMPLE
              </h2>
              <p className="mt-2 text-sm text-[#8A93A0] max-w-md mx-auto">
                Track record is still being established.
              </p>

              <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto text-left">
                <div className="rounded-lg border border-[#232830] bg-[#111418] p-3">
                  <span className="block text-[10px] uppercase text-[#8A93A0]">Dataset Tier</span>
                  <span className="font-bold text-purple-400 text-sm">RESEARCH</span>
                </div>
                <div className="rounded-lg border border-[#232830] bg-[#111418] p-3">
                  <span className="block text-[10px] uppercase text-[#8A93A0]">Settled Samples</span>
                  <span className="font-tabular font-bold text-white text-sm">{settledCount} <span className="text-zinc-500 text-xs font-normal">/ 30 min</span></span>
                </div>
                <div className="rounded-lg border border-[#232830] bg-[#111418] p-3">
                  <span className="block text-[10px] uppercase text-[#8A93A0]">Pending Settlement</span>
                  <span className="font-tabular font-bold text-amber-400 text-sm">{pendingCount}</span>
                </div>
                <div className="rounded-lg border border-[#232830] bg-[#111418] p-3">
                  <span className="block text-[10px] uppercase text-[#8A93A0]">Total Ingested</span>
                  <span className="font-tabular font-bold text-white text-sm">{totalArchived}</span>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-[#232830] max-w-md mx-auto">
                <p className="text-xs text-[#8A93A0] mb-4">
                  Per research invariants, closing line value (CLV) and model calibration curves require a minimum sample of 30 independently settled fixtures before public reporting.
                </p>
                <Link
                  href="/research"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  <span>Inspect Pre-Kickoff Research Ledger</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-[#232830] bg-[#111418] p-8">
            <h3 className="text-sm font-semibold text-white">Settled Ledger Summary</h3>
            <p className="mt-1 text-xs text-[#8A93A0]">
              Sample size of {settledCount} meets qualification threshold.
            </p>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
