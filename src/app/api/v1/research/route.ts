// SALMO.DEV — GET /api/v1/research
// Exposes verifiable model research output directly from the Poisson V1 rescue ledger.
// Adheres strictly to: Predictions != picks, all confidence tiers exposed, no picks implication.

import { NextRequest, NextResponse } from 'next/server';
import { HandicapLabAdapterFactory } from '@/contracts/handicapLabAdapter';
import { Logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const start = Date.now();
  const requestId = request.headers.get('x-request-id') || `req_${Date.now()}`;

  try {
    const adapter = HandicapLabAdapterFactory.getAdapter();
    let syncRes: any = null;
    try {
      syncRes = await adapter.getSalmoSync?.({ modelVersion: 'poisson_v1_rescue', view: 'all' });
    } catch (adapterErr) {
      Logger.warn('Upstream adapter getSalmoSync failed, checking local SALMO verification ledger:', { error: String(adapterErr) });
    }

    let predictions = syncRes?.predictions || [];

    // Autonomous SALMO fallback: if upstream returned no predictions, read local verification ledger
    if (predictions.length === 0) {
      const fs = await import('fs');
      const path = await import('path');
      const candidatePaths = [
        path.resolve(process.cwd(), 'data', 'verification', 'live_prediction_ledger.jsonl'),
        path.resolve(process.cwd(), '..', 'HandicapLab', 'data', 'ledger', 'rescue_prediction_ledger.jsonl'),
      ];

      for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
          try {
            const lines = fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean);
            predictions = lines.map((l: string) => JSON.parse(l));
            if (predictions.length > 0) break;
          } catch {}
        }
      }
    }

    const settledCount = predictions.filter((p: any) => p.settlement === 'SETTLED' || p.settlementStatus === 'SETTLED' || p.status === 'SETTLED').length;
    const pendingCount = predictions.filter((p: any) => p.settlement === 'PENDING' || p.settlementStatus === 'PENDING' || p.status === 'PENDING' || (!p.settlement && !p.settlementStatus)).length;
    const dailyPicksCount = predictions.filter((p: any) => p.verdict === 'LAYAK' || p.isDailyPick).length;

    const counts = syncRes?.counts || {
      totalArchived: predictions.length,
      dailyPicks: dailyPicksCount,
      settled: settledCount,
      pending: pendingCount,
    };
    const dataState = syncRes?.dataState || (predictions.length > 0 ? 'REAL' : 'NO_QUALIFIED_PICKS');

    const latencyMs = Date.now() - start;
    Logger.info('GET /api/v1/research success', { requestId, totalPredictions: predictions.length, latencyMs });

    return NextResponse.json({
      success: true,
      version: 'v1',
      modelVersion: 'poisson_v1_rescue',
      dataState,
      counts,
      predictions,
      timestampUtc: syncRes?.timestampUtc || new Date().toISOString(),
      meta: {
        requestId,
        latencyMs,
      },
    }, { headers: { 'x-request-id': requestId } });
  } catch (error) {
    const latencyMs = Date.now() - start;
    Logger.error('GET /api/v1/research failed', { requestId, latencyMs, error: String(error) });

    return NextResponse.json({
      success: false,
      version: 'v1',
      predictions: [],
      error: {
        code: 'DATA_UNAVAILABLE',
        message: 'Rescue research predictions currently unavailable.',
      },
      meta: {
        requestId,
        latencyMs,
      },
    }, { status: 503, headers: { 'x-request-id': requestId } });
  }
}
