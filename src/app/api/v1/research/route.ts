// SALMO.DEV — GET /api/v1/research
// Exposes verifiable model research output from the canonical 15-league research ledger.
// Adheres strictly to: Predictions != picks, all confidence tiers exposed, SHADOW leagues clearly separated from PRODUCTION.

import * as fs from 'fs';
import * as path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { HandicapLabAdapterFactory } from '@/contracts/handicapLabAdapter';
import { CanonicalMatchArchiveService } from '@/engine/archive/canonicalMatchArchiveService';
import { Logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

import { SettlementEngine } from '@/engine/settlement/settlementEngine';

function bootstrapConfidenceInterval(values: number[], iterations = 2000): {
  n: number;
  mean: number;
  stdErr: number;
  ci95Low: number;
  ci95High: number;
} | null {
  if (!values || values.length === 0) return null;
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (n - 1) : 0;
  const stdErr = Math.sqrt(variance / n);
  let seed = 42;
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const means: number[] = [];
  for (let b = 0; b < iterations; b++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += values[Math.floor(nextRand() * n)];
    }
    means.push(sum / n);
  }
  means.sort((a, b) => a - b);
  return {
    n,
    mean: Number(mean.toFixed(4)),
    stdErr: Number(stdErr.toFixed(4)),
    ci95Low: Number(means[Math.floor(0.025 * iterations)].toFixed(4)),
    ci95High: Number(means[Math.floor(0.975 * iterations)].toFixed(4)),
  };
}

function normalizeResearchRow(
  raw: any,
  index: number,
  liveSettledMap: Map<string, any>,
  evidenceFtMap: Map<string, { homeGoals: number; awayGoals: number; matchScore: string }>
) {
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

  const fixtureId = String(raw.fixture_id || raw.fixtureId || `fix_${index}`);
  const id = raw.id || raw.predictionId || `${fixtureId}_${market}_${index}`;

  // Enrich PRODUCTION rows with verified settlement P&L from live_prediction_ledger.jsonl
  const liveSettled =
    ledgerTier === 'PRODUCTION'
      ? liveSettledMap.get(`${fixtureId}_${market}`) ||
        (raw.canonicalMatchId ? liveSettledMap.get(`${raw.canonicalMatchId}_${market}`) : undefined)
      : undefined;

  // Enrich finished non-EPL fixtures with verified API-Football final score (zero OddsPapi needed)
  const evidenceFt = evidenceFtMap.get(fixtureId);

  const settlement =
    liveSettled?.settlementStatus ||
    liveSettled?.settlement ||
    raw.settlement ||
    raw.settlementStatus ||
    raw.status ||
    'PENDING';

  const homeGoals =
    typeof liveSettled?.homeGoals === 'number'
      ? liveSettled.homeGoals
      : typeof raw.homeGoals === 'number'
      ? raw.homeGoals
      : evidenceFt?.homeGoals ?? null;
  const awayGoals =
    typeof liveSettled?.awayGoals === 'number'
      ? liveSettled.awayGoals
      : typeof raw.awayGoals === 'number'
      ? raw.awayGoals
      : evidenceFt?.awayGoals ?? null;

  const matchScore =
    liveSettled?.matchScore ||
    raw.matchScore ||
    evidenceFt?.matchScore ||
    (typeof homeGoals === 'number' && typeof awayGoals === 'number' ? `${homeGoals}-${awayGoals}` : null);

  let scoreOutcome: string | null = liveSettled?.result || raw.result || null;
  if (!scoreOutcome && typeof homeGoals === 'number' && typeof awayGoals === 'number' && (market === 'AH' || market === 'OU') && line !== null) {
    try {
      const settledOutcome = SettlementEngine.settlePosition({
        ledgerPositionId: id,
        marketType: market,
        selection,
        line: Number(line),
        oddsTaken: Number(marketOdds || 2.0),
        homeGoals,
        awayGoals,
        matchStatus: 'FINISHED',
        homeTeam,
        awayTeam,
      });
      scoreOutcome = settledOutcome.result;
    } catch {}
  }

  const result = liveSettled?.result || raw.result || scoreOutcome || null;
  const scoreVerified = typeof homeGoals === 'number' && typeof awayGoals === 'number';

  // Financial P&L is strictly computed ONLY when pick-time odds were recorded (PRODUCTION tier)
  const profitLossUnits =
    ledgerTier === 'PRODUCTION' && settlement === 'SETTLED'
      ? Number(liveSettled?.profitUnits ?? liveSettled?.profitLoss ?? raw.profitLossUnits ?? 0)
      : null;
  const stakeUnits =
    ledgerTier === 'PRODUCTION' && settlement === 'SETTLED'
      ? Number(liveSettled?.stakeUnits ?? 1)
      : 0;
  const settledAt = liveSettled?.settledAt || raw.settledAt || null;

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
    homeGoals,
    awayGoals,
    matchScore,
    scoreVerified,
    scoreOutcome,
    result,
    profitLossUnits,
    stakeUnits,
    settledAt,
  };
}

export async function GET(request: NextRequest) {
  const start = Date.now();
  const requestId = request.headers.get('x-request-id') || `req_${Date.now()}`;

  try {
    let rawPredictions: any[] = [];
    let syncRes: any = null;

    // Load live_prediction_ledger.jsonl for exact settled EPL P&L enrichment
    const liveSettledMap = new Map<string, any>();
    const liveLedgerPath = path.resolve(process.cwd(), 'data', 'verification', 'live_prediction_ledger.jsonl');
    if (fs.existsSync(liveLedgerPath)) {
      try {
        const lines = fs.readFileSync(liveLedgerPath, 'utf8').trim().split('\n').filter(Boolean);
        for (const l of lines) {
          const parsed = JSON.parse(l);
          const apiId = parsed.providerProvenance?.apiFootballFixtureId || parsed.fixtureId;
          if (apiId && parsed.market) {
            liveSettledMap.set(`${apiId}_${parsed.market}`, parsed);
          }
          if (parsed.canonicalMatchId && parsed.market) {
            liveSettledMap.set(`${parsed.canonicalMatchId}_${parsed.market}`, parsed);
          }
        }
      } catch {}
    }

    // Load stage_b1_fixture_evidence.json for verified API-Football FT scores across all 15 leagues
    const evidenceFtMap = new Map<string, { homeGoals: number; awayGoals: number; matchScore: string }>();
    const evidencePath = path.resolve(process.cwd(), 'data', 'verification', 'stage_b1_fixture_evidence.json');
    if (fs.existsSync(evidencePath)) {
      try {
        const ev = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
        for (const lr of ev.leagueResults || []) {
          for (const f of lr.fixtures || []) {
            if (
              f.fixture?.status?.short === 'FT' &&
              typeof f.goals?.home === 'number' &&
              typeof f.goals?.away === 'number'
            ) {
              evidenceFtMap.set(String(f.fixture.id), {
                homeGoals: f.goals.home,
                awayGoals: f.goals.away,
                matchScore: `${f.goals.home}-${f.goals.away}`,
              });
            }
          }
        }
      } catch {}
    }

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

    // 2. Fallback to durable Supabase forecast_archive or adapter if local verification ledger was not found
    if (rawPredictions.length === 0) {
      try {
        const { getDbClient } = await import('@/lib/db');
        const sb = getDbClient();
        const { data: faRows } = await sb.from('forecast_archive').select('*').limit(500);
        if (faRows && faRows.length > 0) {
          rawPredictions = faRows.map((r: any) => ({
            id: r.id,
            fixtureId: r.fixture_id,
            league: r.league,
            competition: r.league,
            market: r.market === 'ASIAN_HANDICAP' ? 'AH' : 'OU',
            selection: r.selection,
            model_probability: Number(r.probability),
            fair_odds: r.model_fair_odds ? Number(r.model_fair_odds) : null,
            market_odds: r.bookmaker_odds ? Number(r.bookmaker_odds) : null,
            prob_edge: r.prob_edge ? Number(r.prob_edge) : null,
            expected_value: r.expected_value ? Number(r.expected_value) : null,
            verdict: r.recommendation || 'LEWATI',
            confidence: Number(r.confidence || 0),
            model_version: r.model_version,
            ledgerTier: r.league === 'Premier League' ? 'PRODUCTION' : r.league === 'Liga 1' ? 'NONE' : 'SHADOW',
          }));
        }
      } catch {}
    }

    if (rawPredictions.length === 0) {
      try {
        const adapter = HandicapLabAdapterFactory.getAdapter();
        syncRes = await adapter.getSalmoSync?.({ modelVersion: 'poisson_v1_rescue', view: 'all' });
        rawPredictions = syncRes?.predictions || [];
      } catch (adapterErr) {
        Logger.warn('Upstream adapter getSalmoSync failed:', { error: String(adapterErr) });
      }
    }

    const predictions = rawPredictions.map((row, idx) =>
      normalizeResearchRow(row, idx, liveSettledMap, evidenceFtMap)
    );

    const searchParams = request.nextUrl?.searchParams;
    const tierParam = (searchParams?.get('tier') || 'ALL').toUpperCase();
    const leagueParam = searchParams?.get('league') || 'ALL';
    const marketParam = (searchParams?.get('market') || 'ALL').toUpperCase();
    const settlementParam = (searchParams?.get('settlement') || 'ALL').toUpperCase();
    const searchParam = (searchParams?.get('search') || '').trim().toLowerCase();
    const dateFromParam = searchParams?.get('dateFrom') || '';
    const dateToParam = searchParams?.get('dateTo') || '';
    const pageParam = searchParams?.get('page');
    const pageSizeParam = searchParams?.get('pageSize');

    const productionRows = predictions.filter((p: any) => p.ledgerTier === 'PRODUCTION');
    const shadowRows = predictions.filter((p: any) => p.ledgerTier === 'SHADOW');
    const unsupportedRows = predictions.filter((p: any) => p.ledgerTier === 'NONE');

    const settledRows = productionRows.filter((p: any) => p.settlement === 'SETTLED');
    const settledCount = settledRows.length;
    const pendingCount = productionRows.filter((p: any) => p.settlement !== 'SETTLED').length;
    const dailyPicksCount = productionRows.filter((p: any) => p.is_pick).length;

    const netProfitUnits = Number(
      settledRows.reduce((acc: number, r: any) => acc + Number(r.profitLossUnits || 0), 0).toFixed(3)
    );
    const totalStakedUnits = Number(
      settledRows.reduce((acc: number, r: any) => acc + Number(r.stakeUnits || 1), 0).toFixed(2)
    );

    const settlementSummary = {
      settledCount,
      pendingCount,
      winsCount: settledRows.filter((r: any) => r.result === 'WIN').length,
      halfWinsCount: settledRows.filter((r: any) => r.result === 'HALF_WIN').length,
      pushesCount: settledRows.filter((r: any) => r.result === 'PUSH').length,
      halfLossesCount: settledRows.filter((r: any) => r.result === 'HALF_LOSS').length,
      lossesCount: settledRows.filter((r: any) => r.result === 'LOSS').length,
      totalStakedUnits,
      netProfitUnits,
    };

    // Build per-league Metric Computability Matrix (Stage 1 Audit contract)
    const outcomeValueMap: Record<string, number> = {
      WIN: 1.0,
      HALF_WIN: 0.75,
      PUSH: 0.5,
      HALF_LOSS: 0.25,
      LOSS: 0.0,
    };
    const byLeagueMap = new Map<string, any>();
    for (const p of predictions) {
      const lg = p.competition || p.league || 'Unknown';
      if (!byLeagueMap.has(lg)) {
        byLeagueMap.set(lg, {
          league: lg,
          tier: p.ledgerTier,
          informative: Boolean(p.informative ?? (p.ledgerTier !== 'NONE')),
          nPredictions: 0,
          nWithPickOdds: 0,
          nExcludedMissingOdds: 0,
          oddsProvider: null as string | null,
          oddsTimestampSample: null as string | null,
          nWithClosingSnapshot: 0,
          nWithVerifiedFinalScore: 0,
          nSettledWithOdds: 0,
          nScoreResolvedWithoutOdds: 0,
          _profits: [] as number[],
          _brierErrors: [] as number[],
        });
      }
      const entry = byLeagueMap.get(lg)!;
      entry.nPredictions++;
      const hasPickOdds = typeof p.market_odds === 'number' && p.market_odds > 1.0;
      if (hasPickOdds) {
        entry.nWithPickOdds++;
        entry.oddsProvider = p.bookmaker || 'PINNACLE';
        entry.oddsTimestampSample = p.createdAt || p.predictionTimestamp || null;
      } else {
        entry.nExcludedMissingOdds++;
      }
      if (p.closingOdds !== null && p.closingOdds !== undefined) {
        entry.nWithClosingSnapshot++;
      }
      if (p.scoreVerified) {
        entry.nWithVerifiedFinalScore++;
        const y = p.scoreOutcome ? outcomeValueMap[p.scoreOutcome] : undefined;
        if (entry.informative && typeof y === 'number' && typeof p.model_probability === 'number') {
          entry._brierErrors.push(Math.pow(p.model_probability - y, 2));
        }
        if (hasPickOdds && typeof p.profitLossUnits === 'number') {
          entry.nSettledWithOdds++;
          entry._profits.push(p.profitLossUnits);
        } else {
          entry.nScoreResolvedWithoutOdds++;
        }
      }
    }

    const metricComputabilityMatrix = Array.from(byLeagueMap.values()).map(entry => {
      const yieldCi = bootstrapConfidenceInterval(entry._profits);
      const brierCi = bootstrapConfidenceInterval(entry._brierErrors);
      return {
        league: entry.league,
        tier: entry.tier,
        informative: entry.informative,
        nPredictions: entry.nPredictions,
        nWithPickOdds: entry.nWithPickOdds,
        nExcludedMissingOdds: entry.nExcludedMissingOdds,
        oddsProvider: entry.oddsProvider,
        oddsTimestampSample: entry.oddsTimestampSample,
        nWithClosingSnapshot: entry.nWithClosingSnapshot,
        nWithVerifiedFinalScore: entry.nWithVerifiedFinalScore,
        nSettledWithOdds: entry.nSettledWithOdds,
        nScoreResolvedWithoutOdds: entry.nScoreResolvedWithoutOdds,
        computableNow: {
          roi: entry.nSettledWithOdds > 0,
          yield: entry.nSettledWithOdds > 0,
          clv: entry.nWithClosingSnapshot > 0,
          brier: entry.informative && entry._brierErrors.length > 0,
        },
        bootstrap95CI: {
          yield: yieldCi,
          brier: brierCi,
          clv: null,
        },
      };
    });

    let filteredPredictions = predictions;
    if (tierParam === 'PRODUCTION') filteredPredictions = productionRows;
    else if (tierParam === 'SHADOW') filteredPredictions = shadowRows;
    else if (tierParam === 'NONE') filteredPredictions = unsupportedRows;

    if (leagueParam && leagueParam !== 'ALL') {
      const q = leagueParam.toLowerCase();
      filteredPredictions = filteredPredictions.filter(
        (p: any) => (p.competition || p.league || '').toLowerCase() === q
      );
    }

    if (marketParam && marketParam !== 'ALL') {
      filteredPredictions = filteredPredictions.filter(
        (p: any) => (p.market || '').toUpperCase() === marketParam
      );
    }

    if (settlementParam === 'SETTLED') {
      filteredPredictions = filteredPredictions.filter((p: any) => p.settlement === 'SETTLED' || p.scoreVerified);
    } else if (settlementParam === 'PENDING') {
      filteredPredictions = filteredPredictions.filter((p: any) => p.settlement !== 'SETTLED' && !p.scoreVerified);
    }

    if (searchParam) {
      filteredPredictions = filteredPredictions.filter((p: any) => {
        const hay = `${p.match} ${p.home_team} ${p.away_team} ${p.competition} ${p.selection}`.toLowerCase();
        return hay.includes(searchParam);
      });
    }

    if (dateFromParam) {
      filteredPredictions = filteredPredictions.filter(
        (p: any) => (p.kickoff_utc || '').slice(0, 10) >= dateFromParam.slice(0, 10)
      );
    }
    if (dateToParam) {
      filteredPredictions = filteredPredictions.filter(
        (p: any) => (p.kickoff_utc || '').slice(0, 10) <= dateToParam.slice(0, 10)
      );
    }

    const totalFiltered = filteredPredictions.length;
    let outputPredictions = filteredPredictions;
    let pagination: any = null;

    if (pageParam || pageSizeParam) {
      const page = Math.max(1, Number(pageParam || 1));
      const pageSize = Math.min(500, Math.max(1, Number(pageSizeParam || 50)));
      const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
      const safePage = Math.min(page, totalPages);
      const offset = (safePage - 1) * pageSize;
      outputPredictions = filteredPredictions.slice(offset, offset + pageSize);
      pagination = {
        page: safePage,
        pageSize,
        totalFiltered,
        totalPages,
      };
    }

    const counts = {
      totalArchived: predictions.length,
      productionRows: productionRows.length,
      shadowRows: shadowRows.length,
      unsupportedRows: unsupportedRows.length,
      dailyPicks: dailyPicksCount,
      settled: settledCount,
      pending: pendingCount,
      verifiedFinalScoresCount: predictions.filter((p: any) => p.scoreVerified).length,
      byLedgerTier: {
        PRODUCTION: productionRows.length,
        SHADOW: shadowRows.length,
        NONE: unsupportedRows.length,
      },
    };
    const dataState = predictions.length > 0 ? 'REAL' : (syncRes?.dataState || 'NO_QUALIFIED_PICKS');
    const observability = await CanonicalMatchArchiveService.getPipelineObservabilityState();

    const latencyMs = Date.now() - start;
    Logger.info('GET /api/v1/research success', { requestId, totalPredictions: outputPredictions.length, tier: tierParam, latencyMs });

    return NextResponse.json({
      success: true,
      version: 'v1',
      modelVersion: 'dixon-coles-multi-league-v2.1',
      tierFilter: tierParam,
      dataState,
      counts,
      settlementSummary,
      metricComputabilityMatrix,
      observability,
      pagination,
      predictions: outputPredictions,
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
