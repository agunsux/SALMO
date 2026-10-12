// SALMO.DEV — GET /api/v1/performance
// Production Performance & Evidence Metrics Endpoint.
// Returns Green Cohort headline metrics, control cohort metrics, settled position audit trail, and dimensional breakdowns.
// Strictly enforces sample size gate (n < 30 -> INSUFFICIENT SAMPLE).

import { NextRequest, NextResponse } from 'next/server';
import { PerformanceMetricsEngine, LedgerPositionSnapshot } from '@/engine/performance/performanceMetrics';
import { CanonicalMatchArchiveService } from '@/engine/archive/canonicalMatchArchiveService';
import { Logger } from '@/lib/logger';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const start = Date.now();
  const requestId = request.headers.get('x-request-id') || `req_${Date.now()}`;

  try {
    const positions: LedgerPositionSnapshot[] = [];
    const settledPositions: any[] = [];

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

            const isSettled = row.settlementStatus === 'SETTLED' || row.settlement === 'SETTLED';
            const snap: LedgerPositionSnapshot = {
              ledgerPositionId: row.ledgerPositionId || row.predictionId,
              fixtureId: String(row.fixtureId || row.providerProvenance?.apiFootballFixtureId || ''),
              marketType: mType as 'AH' | 'OU',
              selection: row.selection,
              line: Number(row.line ?? 0),
              stakeUnits: 1.0,
              marketOdds: Number(row.marketOdds || row.oddsAtPrediction || 1.95),
              fairOdds: Number(row.fairOdds || 1.90),
              pWin: Number(row.pWin ?? (row.modelProbability ? row.modelProbability / 100 : 0.5)),
              pPush: Number(row.pPush ?? 0),
              pLoss: Number(row.pLoss ?? 0.5),
              confidence: Number(row.confidence ?? 0),
              edge: Number(row.edge ?? 0),
              expectedValuePct: Number(row.expectedValuePct ?? row.EV ?? 0),
              greenCohort: (row.greenCohort !== undefined) ? Boolean(row.greenCohort) : (Number(row.confidence ?? 0) > 70),
              settlementStatus: isSettled ? 'SETTLED' : 'PENDING',
              result: row.result || null,
              profitUnits: Number(row.profitUnits ?? row.profitLoss ?? 0),
              clvPct: (row.clvPct !== undefined) ? row.clvPct : (row.CLV !== undefined ? row.CLV : null),
              settledAt: row.settledAt || null,
              createdAt: row.createdAt || row.predictionTimestamp,
            };
            positions.push(snap);

            if (isSettled) {
              settledPositions.push({
                predictionId: snap.ledgerPositionId,
                canonicalMatchId: row.canonicalMatchId || snap.fixtureId,
                fixtureId: snap.fixtureId,
                league: row.league || 'Premier League',
                homeTeam: row.homeTeam,
                awayTeam: row.awayTeam,
                kickoffUtc: row.kickoffUtc,
                market: mType,
                line: snap.line,
                selection: snap.selection,
                oddsAtPrediction: snap.marketOdds,
                fairOdds: snap.fairOdds,
                modelProbability: row.modelProbability ?? Number((snap.pWin * 100).toFixed(1)),
                edge: snap.edge,
                confidence: snap.confidence,
                verdict: row.verdict || (snap.greenCohort ? 'LAYAK' : 'LEWATI'),
                matchScore: row.matchScore || `${row.homeGoals ?? 0}-${row.awayGoals ?? 0}`,
                homeGoals: row.homeGoals ?? null,
                awayGoals: row.awayGoals ?? null,
                result: snap.result,
                profitUnits: snap.profitUnits,
                stakeUnits: snap.stakeUnits,
                settledAt: snap.settledAt,
                bookmaker: row.bookmaker || 'pinnacle',
              });
            }
          } catch {}
        }
      } catch (fErr) {
        Logger.warn('[GET /api/v1/performance] File read warning:', { error: String(fErr) });
      }
    }

    // 2. Durable Supabase fallback if local file was absent
    if (positions.length === 0) {
      try {
        const { getDbClient } = await import('@/lib/db');
        const sb = getDbClient();
        const { data: srRows } = await sb.from('settlement_results').select('*');
        for (const sr of srRows || []) {
          const mType = sr.market_type === 'asian_handicap' ? 'AH' : 'OU';
          positions.push({
            ledgerPositionId: sr.id,
            fixtureId: sr.fixture_id,
            marketType: mType,
            selection: sr.selection,
            line: Number(sr.line ?? 0),
            stakeUnits: 1.0,
            marketOdds: Number(sr.odds ?? 1.95),
            fairOdds: Number(sr.odds ?? 1.95),
            pWin: 0.5,
            pPush: 0,
            pLoss: 0.5,
            confidence: 70,
            edge: 0,
            expectedValuePct: 0,
            greenCohort: false,
            settlementStatus: 'SETTLED',
            result: sr.outcome,
            profitUnits: Number(sr.profit_units ?? 0),
            clvPct: null,
            settledAt: sr.settled_at,
            createdAt: sr.created_at,
          });
        }
      } catch {}
    }

    const report = PerformanceMetricsEngine.generateReport(positions);
    const observability = await CanonicalMatchArchiveService.getPipelineObservabilityState();
    const latencyMs = Date.now() - start;

    return NextResponse.json({
      success: true,
      version: 'v1',
      report,
      settledPositions,
      observability,
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
