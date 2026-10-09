// SALMO.DEV — GET /api/v1/performance
// Production Performance & Evidence Metrics Endpoint.
// Returns Green Cohort headline metrics, control cohort metrics, and dimensional breakdowns.
// Strictly enforces sample size gate (n < 30 -> INSUFFICIENT SAMPLE).

import { NextRequest, NextResponse } from 'next/server';
import { PerformanceMetricsEngine, LedgerPositionSnapshot } from '@/engine/performance/performanceMetrics';
import { Logger } from '@/lib/logger';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const start = Date.now();
  const requestId = request.headers.get('x-request-id') || `req_${Date.now()}`;

  try {
    const positions: LedgerPositionSnapshot[] = [];

    // 1. Read from canonical verification ledger
    const ledgerPath = path.resolve(process.cwd(), 'data', 'verification', 'live_prediction_ledger.jsonl');
    if (fs.existsSync(ledgerPath)) {
      try {
        const lines = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const row = JSON.parse(line);
            const mType = (row.marketType || row.market)?.toUpperCase();
            if (mType !== 'AH' && mType !== 'OU') continue;

            positions.push({
              ledgerPositionId: row.ledgerPositionId || row.predictionId,
              fixtureId: row.fixtureId,
              marketType: mType as 'AH' | 'OU',
              selection: row.selection,
              line: Number(row.line ?? 0),
              stakeUnits: 1.0,
              marketOdds: Number(row.marketOdds || row.oddsAtPrediction || 1.95),
              fairOdds: Number(row.fairOdds || 1.90),
              pWin: Number(row.pWin ?? 0.5),
              pPush: Number(row.pPush ?? 0),
              pLoss: Number(row.pLoss ?? 0.5),
              confidence: Number(row.confidence ?? 0),
              edge: Number(row.edge ?? 0),
              expectedValuePct: Number(row.expectedValuePct ?? row.EV ?? 0),
              greenCohort: (row.greenCohort !== undefined) ? Boolean(row.greenCohort) : (Number(row.confidence ?? 0) > 70),
              settlementStatus: row.settlementStatus || (row.settlement === 'SETTLED' ? 'SETTLED' : 'PENDING'),
              result: row.result || null,
              profitUnits: Number(row.profitUnits ?? row.profitLoss ?? 0),
              clvPct: (row.clvPct !== undefined) ? row.clvPct : (row.CLV !== undefined ? row.CLV : null),
              settledAt: row.settledAt || null,
              createdAt: row.createdAt || row.predictionTimestamp,
            });
          } catch {}
        }
      } catch (fErr) {
        Logger.warn('[GET /api/v1/performance] File read warning:', { error: String(fErr) });
      }
    }

    const report = PerformanceMetricsEngine.generateReport(positions);
    const latencyMs = Date.now() - start;

    return NextResponse.json({
      success: true,
      version: 'v1',
      report,
      totalPositionsLoaded: positions.length,
      meta: {
        requestId,
        latencyMs,
      },
    }, { headers: { 'x-request-id': requestId } });
  } catch (error) {
    const latencyMs = Date.now() - start;
    Logger.error('GET /api/v1/performance failed', { requestId, latencyMs, error: String(error) });

    return NextResponse.json({
      success: false,
      error: {
        code: 'PERFORMANCE_UNAVAILABLE',
        message: 'Failed to aggregate performance ledger metrics.',
      },
      meta: {
        requestId,
        latencyMs,
      },
    }, { status: 500, headers: { 'x-request-id': requestId } });
  }
}
