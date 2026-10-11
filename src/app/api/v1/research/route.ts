// SALMO.DEV — GET /api/v1/research
// Exposes verifiable model research output from the canonical 15-league research ledger.
// Adheres strictly to: Predictions != picks, all confidence tiers exposed, SHADOW leagues clearly separated from PRODUCTION.

import * as fs from 'fs';
import * as path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { HandicapLabAdapterFactory } from '@/contracts/handicapLabAdapter';
import { Logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

function normalizeResearchRow(raw: any, index: number) {
  const ledgerTier: 'PRODUCTION' | 'SHADOW' | 'NONE' =
    raw.ledgerTier || (raw.league === 'Premier League' || raw.competition === 'Premier League' ? 'PRODUCTION' : 'SHADOW');

  const homeTeam = raw.home_team || raw.homeTeam || 'Unknown Home';
  const awayTeam = raw.away_team || raw.awayTeam || 'Unknown Away';
  const match = raw.match || `${homeTeam} vs ${awayTeam}`;
  const competition = raw.competition || raw.league || 'Premier League';
  const kickoffUtc = raw.kickoff_utc || raw.kickoffUtc || '';
  const market: 'AH' | 'OU' | 'BTTS' = raw.market || raw.market_type || 'AH';
  const line = raw.line !== undefined ? raw.line : null;
  const selection = raw.selection || raw.prediction || '—';

  // Normalize model_probability to 0..1 decimal for UI while preserving modelProbability (0..100) for API consumers
  const rawProb = raw.model_probability ?? raw.modelProbability ?? null;
  const modelProbabilityDecimal =
    typeof rawProb === 'number'
      ? rawProb > 1
        ? Number((rawProb / 100).toFixed(4))
        : Number(rawProb.toFixed(4))
      : 0;
  const modelProbabilityPct =
    typeof raw.modelProbability === 'number'
      ? raw.modelProbability
      : typeof rawProb === 'number'
      ? rawProb <= 1
        ? Number((rawProb * 100).toFixed(1))
        : rawProb
      : null;

  const fairOdds = raw.fair_odds ?? raw.fairOdds ?? null;
  const marketOdds = raw.market_odds ?? raw.marketOdds ?? null;

  const rawEv = raw.expected_value ?? raw.expectedValue ?? null;
  const expectedValueDecimal =
    typeof rawEv === 'number'
      ? Math.abs(rawEv) > 1
        ? Number((rawEv / 100).toFixed(4))
        : Number(rawEv.toFixed(4))
      : null;

  const edgePct = raw.edge_pct ?? raw.edge ?? null;
  const confidenceScore = Number(raw.confidence_score ?? raw.confidence ?? 0);

  let confidenceTier = raw.confidence_tier || '';
  if (!confidenceTier) {
    if (market === 'BTTS' || ledgerTier !== 'PRODUCTION') {
      confidenceTier = 'RESEARCH_ONLY';
    } else if (confidenceScore >= 70) {
      confidenceTier = 'HIGH';
    } else if (confidenceScore >= 50) {
      confidenceTier = 'MEDIUM';
    } else {
      confidenceTier = 'LOW';
    }
  }

  // Strictly enforce that SHADOW / NONE rows are never marked as production picks
  const isPick =
    ledgerTier === 'PRODUCTION' &&
    Boolean(raw.is_pick || raw.isDailyPick || raw.verdict === 'LAYAK');

  const settlement = raw.settlement || raw.settlementStatus || raw.status || 'PENDING';
  const fixtureId = raw.fixture_id || raw.fixtureId || `fix_${index}`;
  const id = raw.id || raw.predictionId || `${fixtureId}_${market}_${index}`;

  return {
    ...raw,
    id,
    predictionId: raw.predictionId || id,
    fixture_id: fixtureId,
    fixtureId,
    match,
    home_team: homeTeam,
    homeTeam,
    away_team: awayTeam,
    awayTeam,
    competition,
    league: competition,
    kickoff_utc: kickoffUtc,
    kickoffUtc,
    market,
    line,
    selection,
    model_probability: modelProbabilityDecimal,
    modelProbability: modelProbabilityPct,
    calibrated_probability: modelProbabilityDecimal,
    fair_odds: fairOdds,
    fairOdds,
    market_odds: marketOdds,
    marketOdds,
    edge_pct: edgePct,
    expected_value: expectedValueDecimal,
    expectedValue: raw.expectedValue ?? expectedValueDecimal,
    confidence_tier: confidenceTier,
    confidence_score: confidenceScore,
    confidence: confidenceScore,
    model_version: raw.model_version || raw.modelVersion || 'dixon-coles-v2.1',
    modelVersion: raw.modelVersion || raw.model_version || 'dixon-coles-v2.1',
    is_pick: isPick,
    ledgerTier,
    settlement,
    matchScore: raw.matchScore || null,
    result: raw.result || null,
    profitLossUnits: raw.profitLossUnits ?? null,
    settledAt: raw.settledAt || null,
  };
}

export async function GET(request: NextRequest) {
  const start = Date.now();
  const requestId = request.headers.get('x-request-id') || `req_${Date.now()}`;

  try {
    let rawPredictions: any[] = [];
    let syncRes: any = null;

    // 1. Primary Canonical Multi-League Research Ledger (336 rows across 15 leagues + settled EPL matches)
    // Direct static path resolution so @vercel/nft bundles the file into the serverless function
    const allLeaguesLedgerPath = path.resolve(process.cwd(), 'data', 'verification', 'all_leagues_research_ledger.jsonl');
    if (fs.existsSync(allLeaguesLedgerPath)) {
      try {
        const lines = fs.readFileSync(allLeaguesLedgerPath, 'utf8').trim().split('\n').filter(Boolean);
        rawPredictions = lines.map((l: string) => JSON.parse(l));
      } catch {}
    }

    if (rawPredictions.length === 0) {
      const stagingLedgerPath = path.resolve(process.cwd(), 'data', 'verification', 'staging_research_only_ledger.jsonl');
      if (fs.existsSync(stagingLedgerPath)) {
        try {
          const lines = fs.readFileSync(stagingLedgerPath, 'utf8').trim().split('\n').filter(Boolean);
          rawPredictions = lines.map((l: string) => JSON.parse(l));
        } catch {}
      }
    }

    // 2. Fallback to adapter if local verification ledger was not found
    if (rawPredictions.length === 0) {
      try {
        const adapter = HandicapLabAdapterFactory.getAdapter();
        syncRes = await adapter.getSalmoSync?.({ modelVersion: 'poisson_v1_rescue', view: 'all' });
        rawPredictions = syncRes?.predictions || [];
      } catch (adapterErr) {
        Logger.warn('Upstream adapter getSalmoSync failed:', { error: String(adapterErr) });
      }
    }

    const predictions = rawPredictions.map((row, idx) => normalizeResearchRow(row, idx));

    const tierParam = (request.nextUrl?.searchParams?.get('tier') || 'ALL').toUpperCase();

    const productionRows = predictions.filter((p: any) => p.ledgerTier === 'PRODUCTION');
    const shadowRows = predictions.filter((p: any) => p.ledgerTier === 'SHADOW');
    const unsupportedRows = predictions.filter((p: any) => p.ledgerTier === 'NONE');

    const settledCount = productionRows.filter((p: any) => p.settlement === 'SETTLED').length;
    const pendingCount = productionRows.filter((p: any) => p.settlement !== 'SETTLED').length;
    const dailyPicksCount = productionRows.filter((p: any) => p.is_pick).length;

    const filteredPredictions =
      tierParam === 'PRODUCTION' ? productionRows :
      tierParam === 'SHADOW' ? shadowRows :
      tierParam === 'NONE' ? unsupportedRows :
      predictions;

    const counts = {
      totalArchived: predictions.length,
      productionRows: productionRows.length,
      shadowRows: shadowRows.length,
      unsupportedRows: unsupportedRows.length,
      dailyPicks: dailyPicksCount,
      settled: settledCount,
      pending: pendingCount,
      byLedgerTier: {
        PRODUCTION: productionRows.length,
        SHADOW: shadowRows.length,
        NONE: unsupportedRows.length,
      },
    };
    const dataState = predictions.length > 0 ? 'REAL' : (syncRes?.dataState || 'NO_QUALIFIED_PICKS');

    const latencyMs = Date.now() - start;
    Logger.info('GET /api/v1/research success', { requestId, totalPredictions: filteredPredictions.length, tier: tierParam, latencyMs });

    return NextResponse.json({
      success: true,
      version: 'v1',
      modelVersion: 'dixon-coles-multi-league-v2.1',
      tierFilter: tierParam,
      dataState,
      counts,
      predictions: filteredPredictions,
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
