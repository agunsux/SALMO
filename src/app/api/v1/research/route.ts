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
    const syncRes = await adapter.getSalmoSync?.({ modelVersion: 'poisson_v1_rescue', view: 'all' });

    const predictions = syncRes?.predictions || [];
    const counts = syncRes?.counts || { totalArchived: predictions.length, dailyPicks: 0, settled: 0, pending: predictions.length };
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
