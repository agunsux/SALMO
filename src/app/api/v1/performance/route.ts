// SALMO.DEV — GET /api/v1/performance
// Production Performance & Evidence Metrics Endpoint.
// Returns Green Cohort headline metrics, control cohort metrics, settled position audit trail, and dimensional breakdowns.
// Strictly enforces pre-registered sample size gate (HEADLINE_COHORT_MIN_SETTLED_POSITIONS = 100 -> INSUFFICIENT SAMPLE).

import { NextRequest, NextResponse } from 'next/server';
import {
  PerformanceMetricsEngine,
  LedgerPositionSnapshot,
  isQualifiedPublicPickCohort,
  DIAGNOSTIC_ALL_ROWS_COHORT_LABEL,
  QUALIFIED_PUBLIC_PICKS_COHORT_LABEL,
} from '@/engine/performance/performanceMetrics';
import {
  PRE_REGISTERED_GATES,
  REFERENCE_BENCHMARK_BOOKMAKER,
  isValidBenchmarkBookmaker,
} from '@/engine/performance/gates';
import { evaluatePositionBrierLegs } from '@/engine/performance/brierScoring';
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

    // Build fixture metadata lookup from all_leagues_research_ledger.jsonl so homeTeam/awayTeam/kickoffUtc are resolved for Brier score grid
    const fixtureMetaMap = new Map<string, { homeTeam: string; awayTeam: string; kickoffUtc: string; league: string }>();
    const allLeaguesPath = path.resolve(process.cwd(), 'data', 'verification', 'all_leagues_research_ledger.jsonl');
    if (fs.existsSync(allLeaguesPath)) {
      try {
        const metaLines = fs.readFileSync(allLeaguesPath, 'utf8').trim().split('\n').filter(Boolean);
        for (const ml of metaLines) {
          const parsed = JSON.parse(ml);
          const fId = String(parsed.fixtureId || parsed.fixture_id || '');
          if (fId && parsed.homeTeam && parsed.awayTeam) {
            fixtureMetaMap.set(fId, {
              homeTeam: parsed.homeTeam,
              awayTeam: parsed.awayTeam,
              kickoffUtc: parsed.kickoffUtc || parsed.kickoff_utc || '',
              league: parsed.league || parsed.competition || 'Premier League',
            });
          }
        }
      } catch {}
    }

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

            const fixtureId = String(row.fixtureId || row.providerProvenance?.apiFootballFixtureId || '');
            const meta = fixtureMetaMap.get(fixtureId);
            const homeTeam = row.homeTeam || meta?.homeTeam || 'Unknown Home';
            const awayTeam = row.awayTeam || meta?.awayTeam || 'Unknown Away';
            const kickoffUtc = row.kickoffUtc || meta?.kickoffUtc || '';
            const league = row.league || meta?.league || 'Premier League';

            const isSettled = row.settlementStatus === 'SETTLED' || row.settlement === 'SETTLED';
            const isQualifiedPick = isQualifiedPublicPickCohort({
              is_pick: row.is_pick,
              isPick: row.isPick,
              isDailyPick: row.isDailyPick,
              verdict: row.verdict ?? null,
            });

            const pWinFallback = Number(row.pWin ?? (row.modelProbability ? row.modelProbability / 100 : 0.5));
            const hasVerifiedGoals = isSettled && typeof row.homeGoals === 'number' && typeof row.awayGoals === 'number';

            const brierDecomposition = hasVerifiedGoals
              ? evaluatePositionBrierLegs({
                  positionId: row.ledgerPositionId || row.predictionId,
                  fixtureId,
                  league,
                  homeTeam,
                  awayTeam,
                  marketType: mType as 'AH' | 'OU',
                  selection: row.selection,
                  line: Number(row.line ?? 0),
                  homeGoals: row.homeGoals,
                  awayGoals: row.awayGoals,
                  fallbackModelProbDecimal: pWinFallback,
                })
              : null;

            const rawBookmaker = row.bookmaker || REFERENCE_BENCHMARK_BOOKMAKER;
            const validClvBookmaker = isValidBenchmarkBookmaker(rawBookmaker);
            const rawClv = row.clvPct !== undefined ? row.clvPct : row.CLV !== undefined ? row.CLV : null;

            const snap: LedgerPositionSnapshot = {
              ledgerPositionId: row.ledgerPositionId || row.predictionId,
              fixtureId,
              marketType: mType as 'AH' | 'OU',
              selection: row.selection,
              line: Number(row.line ?? 0),
              stakeUnits: 1.0,
              marketOdds: Number(row.marketOdds || row.oddsAtPrediction || 1.95),
              fairOdds: Number(row.fairOdds || 1.90),
              pWin: pWinFallback,
              pPush: Number(row.pPush ?? 0),
              pLoss: Number(row.pLoss ?? 0.5),
              confidence: Number(row.confidence ?? 0),
              edge: Number(row.edge ?? 0),
              expectedValuePct: Number(row.expectedValuePct ?? row.EV ?? 0),
              greenCohort: isQualifiedPick,
              is_pick: Boolean(row.is_pick || row.isPick || row.isDailyPick),
              verdict: row.verdict || 'LEWATI',
              settlementStatus: isSettled ? 'SETTLED' : 'PENDING',
              result: row.result || null,
              profitUnits: Number(row.profitUnits ?? row.profitLoss ?? 0),
              clvPct: validClvBookmaker ? rawClv : null,
              clvBookmaker: validClvBookmaker ? REFERENCE_BENCHMARK_BOOKMAKER : null,
              brierDecomposition,
              brierLegs: brierDecomposition?.legs || [],
              settledAt: row.settledAt || null,
              createdAt: row.createdAt || row.predictionTimestamp,
            };
            positions.push(snap);

            if (isSettled) {
              settledPositions.push({
                predictionId: snap.ledgerPositionId,
                canonicalMatchId: row.canonicalMatchId || snap.fixtureId,
                fixtureId: snap.fixtureId,
                league,
                homeTeam,
                awayTeam,
                kickoffUtc,
                market: mType,
                line: snap.line,
                selection: snap.selection,
                oddsAtPrediction: snap.marketOdds,
                fairOdds: snap.fairOdds,
                modelProbability: row.modelProbability ?? Number((snap.pWin * 100).toFixed(1)),
                edge: snap.edge,
                confidence: snap.confidence,
                is_pick: snap.is_pick,
                verdict: row.verdict || 'LEWATI',
                greenCohort: snap.greenCohort,
                cohortClassification: snap.greenCohort
                  ? QUALIFIED_PUBLIC_PICKS_COHORT_LABEL
                  : DIAGNOSTIC_ALL_ROWS_COHORT_LABEL,
                matchScore: row.matchScore || `${row.homeGoals ?? 0}-${row.awayGoals ?? 0}`,
                homeGoals: row.homeGoals ?? null,
                awayGoals: row.awayGoals ?? null,
                result: snap.result,
                profitUnits: snap.profitUnits,
                stakeUnits: snap.stakeUnits,
                brierPositionMean: brierDecomposition?.positionBrierMean ?? null,
                brierLegs: brierDecomposition?.legs || [],
                settledAt: snap.settledAt,
                bookmaker: row.bookmaker || REFERENCE_BENCHMARK_BOOKMAKER,
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
            is_pick: false,
            verdict: 'LEWATI',
            settlementStatus: 'SETTLED',
            result: sr.outcome,
            profitUnits: Number(sr.profit_units ?? 0),
            clvPct: null,
            clvBookmaker: REFERENCE_BENCHMARK_BOOKMAKER,
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
      registeredGates: PRE_REGISTERED_GATES,
      cohortLabels: {
        publicPicksCohort: QUALIFIED_PUBLIC_PICKS_COHORT_LABEL,
        allRowsDiagnosticCohort: DIAGNOSTIC_ALL_ROWS_COHORT_LABEL,
      },
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
