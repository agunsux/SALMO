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
import {
  evaluateRowTemporalIntegrity,
  isKnownBatchPlaceholderTimestamp,
} from '@/engine/archive/temporalIntegrityGuard';
import { evaluatePositionBrierLegs } from '@/engine/performance/brierScoring';
import {
  isQualifiedPublicPickCohort,
  DIAGNOSTIC_ALL_ROWS_COHORT_LABEL,
  QUALIFIED_PUBLIC_PICKS_COHORT_LABEL,
} from '@/engine/performance/performanceMetrics';
import {
  PRE_REGISTERED_GATES,
  REFERENCE_BENCHMARK_BOOKMAKER,
  GATE_STATUS_NOT_COMPUTABLE_YET,
  CLV_HEADLINE_MIN_POSITIONS,
  HEADLINE_COHORT_MIN_SETTLED_POSITIONS,
  isValidBenchmarkBookmaker,
  formatInsufficientSampleLabel,
} from '@/engine/performance/gates';

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
  evidenceFtMap: Map<string, { homeGoals: number; awayGoals: number; matchScore: string }>,
  evidenceGeneratedAt: string | null = null
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

  const fixtureId = String(raw.fixture_id || raw.fixtureId || `fix_${index}`);
  const id = raw.id || raw.predictionId || `${fixtureId}_${market}_${index}`;

  // Enrich PRODUCTION rows with verified pre-match provenance & settlement P&L from live_prediction_ledger.jsonl
  // Authoritative rule (Phase 1D): live_prediction_ledger.jsonl (recorded 2026-10-06T21:36Z before kickoff) is the
  // canonical immutable pre-match record for the 20 EPL PRODUCTION rows.
  const liveSettled =
    ledgerTier === 'PRODUCTION'
      ? liveSettledMap.get(`${fixtureId}_${market}`) ||
        (raw.canonicalMatchId ? liveSettledMap.get(`${raw.canonicalMatchId}_${market}`) : undefined)
      : undefined;

  const regeneratedProbPct =
    typeof raw.modelProbability === 'number'
      ? raw.modelProbability
      : typeof raw.model_probability === 'number'
      ? raw.model_probability <= 1
        ? Number((raw.model_probability * 100).toFixed(1))
        : raw.model_probability
      : null;

  const authoritativeProbSource =
    typeof liveSettled?.modelProbability === 'number'
      ? liveSettled.modelProbability
      : raw.model_probability ?? raw.modelProbability ?? null;

  // Normalize model_probability to 0..1 decimal for UI while preserving modelProbability (0..100) for API consumers
  const modelProbabilityDecimal =
    typeof authoritativeProbSource === 'number'
      ? authoritativeProbSource > 1
        ? Number((authoritativeProbSource / 100).toFixed(4))
        : Number(authoritativeProbSource.toFixed(4))
      : 0;
  const modelProbabilityPct =
    typeof liveSettled?.modelProbability === 'number'
      ? liveSettled.modelProbability
      : regeneratedProbPct;

  const fairOdds = liveSettled?.fairOdds ?? raw.fair_odds ?? raw.fairOdds ?? null;
  const marketOdds = liveSettled?.oddsAtPrediction ?? liveSettled?.marketOdds ?? raw.market_odds ?? raw.marketOdds ?? null;

  const rawEv = liveSettled?.EV ?? raw.expected_value ?? raw.expectedValue ?? null;
  const expectedValueDecimal =
    typeof rawEv === 'number'
      ? Math.abs(rawEv) > 1
        ? Number((rawEv / 100).toFixed(4))
        : Number(rawEv.toFixed(4))
      : null;

  const edgePct = liveSettled?.edge ?? raw.edge_pct ?? raw.edge ?? null;
  const confidenceScore = Number(liveSettled?.confidence ?? raw.confidence_score ?? raw.confidence ?? 0);

  const ledgerDiscrepancyAudit = liveSettled
    ? {
        authoritativeLedger: 'live_prediction_ledger.jsonl',
        authoritativePredictionTimestamp: liveSettled.predictionTimestamp || null,
        authoritativeModelProbabilityPct: liveSettled.modelProbability ?? null,
        regeneratedResearchLedgerProbabilityPct: regeneratedProbPct,
        hasRegeneratedDiscrepancy:
          typeof liveSettled.modelProbability === 'number' &&
          typeof regeneratedProbPct === 'number' &&
          liveSettled.modelProbability !== regeneratedProbPct,
        discrepancyRootCause:
          typeof liveSettled.modelProbability === 'number' &&
          typeof regeneratedProbPct === 'number' &&
          liveSettled.modelProbability !== regeneratedProbPct
            ? '2026-10-06 pre-match snapshot used CANONICAL_EPL_RATINGS (1.35/1.20 fallback for club absent from 20-club baseline); 2026-10-11 research export used multi_league_team_ratings_v1.0.json'
            : null,
      }
    : null;

  let confidenceTier = raw.confidence_tier || '';
  if (!confidenceTier || liveSettled) {
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

  // Evaluate strict temporal integrity & provenance (Hotfix H7 P1)
  // Never assume created_at / createdAt is a genuine prediction timestamp unless verified by canonical ledger provenance.
  const explicitPredTs =
    liveSettled?.predictionTimestamp ||
    liveSettled?.publishedAt ||
    raw.predictionTimestamp ||
    raw.prediction_timestamp ||
    raw.publishedAt ||
    raw.published_at ||
    (ledgerTier === 'PRODUCTION' && raw.createdAt && !isKnownBatchPlaceholderTimestamp(raw.createdAt)
      ? raw.createdAt
      : null);

  const verifiedSourceTs =
    liveSettled?.marketStateTimestamp ||
    raw.sourceDataTimestamp ||
    raw.source_data_timestamp ||
    evidenceGeneratedAt ||
    null;

  const hasVerifiedPreMatchProvenance = Boolean(
    explicitPredTs && !isKnownBatchPlaceholderTimestamp(explicitPredTs) && raw.hasVerifiedPreMatchProvenance !== false
  );

  const temporalEval = evaluateRowTemporalIntegrity(
    {
      ...raw,
      kickoffUtc,
    },
    {
      verifiedPredictionTimestamp: explicitPredTs,
      verifiedSourceDataTimestamp: verifiedSourceTs,
      hasVerifiedPreMatchProvenance,
      batchCommitTimestampUtc: '2026-10-11T18:56:38Z',
    }
  );

  const eligibleForPreMatchMetrics = temporalEval.eligibleForPreMatchMetrics;

  // Strictly enforce Hotfix H8 Rule 2: public pick cohort requires is_pick === true && verdict === 'LAYAK'
  const isPick =
    eligibleForPreMatchMetrics &&
    ledgerTier === 'PRODUCTION' &&
    isQualifiedPublicPickCohort({
      is_pick: raw.is_pick,
      isPick: raw.isPick,
      isDailyPick: raw.isDailyPick,
      verdict: raw.verdict ?? null,
    });

  // Enrich finished fixtures with verified API-Football final score (zero OddsPapi needed)
  const evidenceFt = evidenceFtMap.get(fixtureId);

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

  const archiveScoreVerified = typeof homeGoals === 'number' && typeof awayGoals === 'number';
  // Pre-match score verification requires BOTH verified final score AND strict pre-match temporal eligibility
  const scoreVerified = eligibleForPreMatchMetrics && archiveScoreVerified;

  let rawScoreOutcome: string | null = liveSettled?.result || raw.result || null;
  if (
    !rawScoreOutcome &&
    archiveScoreVerified &&
    (market === 'AH' || market === 'OU') &&
    line !== null
  ) {
    try {
      const settledOutcome = SettlementEngine.settlePosition({
        ledgerPositionId: id,
        marketType: market,
        selection,
        line: Number(line),
        oddsTaken: Number(marketOdds || 2.0),
        homeGoals: homeGoals as number,
        awayGoals: awayGoals as number,
        matchStatus: 'FINISHED',
        homeTeam,
        awayTeam,
      });
      rawScoreOutcome = settledOutcome.result;
    } catch {}
  }

  const rawSettlement =
    liveSettled?.settlementStatus ||
    liveSettled?.settlement ||
    raw.settlement ||
    raw.settlementStatus ||
    raw.status ||
    'PENDING';

  const settlement = eligibleForPreMatchMetrics
    ? rawSettlement
    : temporalEval.temporalEligibilityStatus === 'RETROSPECTIVE_EXCLUDED'
    ? 'EXCLUDED_RETROSPECTIVE'
    : 'EXCLUDED_UNVERIFIED_TIMESTAMP';

  // Only pre-match eligible predictions may expose settled result/outcome for performance metrics
  const scoreOutcome = eligibleForPreMatchMetrics ? rawScoreOutcome : null;
  const result = eligibleForPreMatchMetrics ? (liveSettled?.result || raw.result || rawScoreOutcome || null) : null;

  // Evaluate binary no-push per-leg Brier decomposition (Hotfix H8 Rule 1)
  const brierDecomposition =
    scoreVerified && (market === 'AH' || market === 'OU') && line !== null
      ? evaluatePositionBrierLegs({
          positionId: id,
          fixtureId,
          league: competition,
          homeTeam,
          awayTeam,
          marketType: market,
          selection,
          line: Number(line),
          homeGoals: homeGoals as number,
          awayGoals: awayGoals as number,
          fallbackModelProbDecimal:
            modelProbabilityDecimal > 0 && modelProbabilityDecimal < 1
              ? modelProbabilityDecimal
              : null,
        })
      : null;

  // Financial P&L is strictly computed ONLY when pick-time odds were recorded AND row is pre-match eligible (PRODUCTION tier)
  const profitLossUnits =
    eligibleForPreMatchMetrics && ledgerTier === 'PRODUCTION' && settlement === 'SETTLED'
      ? Number(liveSettled?.profitUnits ?? liveSettled?.profitLoss ?? raw.profitLossUnits ?? 0)
      : null;
  const stakeUnits =
    eligibleForPreMatchMetrics && ledgerTier === 'PRODUCTION' && settlement === 'SETTLED'
      ? Number(liveSettled?.stakeUnits ?? 1)
      : 0;
  const settledAt = eligibleForPreMatchMetrics ? (liveSettled?.settledAt || raw.settledAt || null) : null;

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
    // 4 separated timestamps (Hotfix H7 P1)
    predictionTimestamp: temporalEval.predictionTimestamp,
    prediction_timestamp: temporalEval.predictionTimestamp,
    sourceDataTimestamp: temporalEval.sourceDataTimestamp,
    source_data_timestamp: temporalEval.sourceDataTimestamp,
    archiveCreatedAt: temporalEval.archiveCreatedAt,
    archive_created_at: temporalEval.archiveCreatedAt,
    // Temporal integrity classification
    temporalEligibilityStatus: temporalEval.temporalEligibilityStatus,
    eligibleForPreMatchMetrics: temporalEval.eligibleForPreMatchMetrics,
    temporalExclusionReason: temporalEval.temporalExclusionReason,
    leadTimeHoursBeforeKickoff: temporalEval.leadTimeHoursBeforeKickoff,
    isBatchPlaceholderTimestamp: temporalEval.isBatchPlaceholderTimestamp,
    provenanceVerified: temporalEval.provenanceVerified,
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
    expectedValue: liveSettled?.EV ?? raw.expectedValue ?? expectedValueDecimal,
    confidence_tier: confidenceTier,
    confidence_score: confidenceScore,
    confidence: confidenceScore,
    model_version: raw.model_version || raw.modelVersion || 'dixon-coles-v2.1',
    modelVersion: raw.modelVersion || raw.model_version || 'dixon-coles-v2.1',
    is_pick: isPick,
    cohortClassification: isPick
      ? QUALIFIED_PUBLIC_PICKS_COHORT_LABEL
      : DIAGNOSTIC_ALL_ROWS_COHORT_LABEL,
    ledgerTier,
    ledgerDiscrepancyAudit,
    settlement,
    homeGoals,
    awayGoals,
    matchScore,
    archiveScoreVerified,
    rawScoreOutcome,
    scoreVerified,
    scoreOutcome,
    result,
    brierDecomposition,
    brierLegs: brierDecomposition?.legs || [],
    brierPositionMean: brierDecomposition?.positionBrierMean ?? null,
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
    let evidenceGeneratedAt: string | null = null;
    const evidencePath = path.resolve(process.cwd(), 'data', 'verification', 'stage_b1_fixture_evidence.json');
    if (fs.existsSync(evidencePath)) {
      try {
        const ev = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
        evidenceGeneratedAt = ev.generatedAt || null;
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
            created_at: r.created_at,
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
      normalizeResearchRow(row, idx, liveSettledMap, evidenceFtMap, evidenceGeneratedAt)
    );

    const searchParams =
      request.nextUrl?.searchParams || (request.url ? new URL(request.url).searchParams : undefined);
    const tierParam = (searchParams?.get('tier') || 'ALL').toUpperCase();
    const leagueParam = searchParams?.get('league') || 'ALL';
    const marketParam = (searchParams?.get('market') || 'ALL').toUpperCase();
    const settlementParam = (searchParams?.get('settlement') || 'ALL').toUpperCase();
    const temporalStatusParam = (searchParams?.get('temporalStatus') || 'ALL').toUpperCase();
    const searchParam = (searchParams?.get('search') || '').trim().toLowerCase();
    const dateFromParam = searchParams?.get('dateFrom') || '';
    const dateToParam = searchParams?.get('dateTo') || '';
    const pageParam = searchParams?.get('page');
    const pageSizeParam = searchParams?.get('pageSize');

    const productionRows = predictions.filter((p: any) => p.ledgerTier === 'PRODUCTION');
    const shadowRows = predictions.filter((p: any) => p.ledgerTier === 'SHADOW');
    const unsupportedRows = predictions.filter((p: any) => p.ledgerTier === 'NONE');

    // Pre-match settlement metrics strictly require eligibleForPreMatchMetrics === true
    const eligiblePreMatchRows = predictions.filter((p: any) => p.eligibleForPreMatchMetrics === true);
    const confirmedRetrospectiveRows = predictions.filter(
      (p: any) => p.temporalEligibilityStatus === 'RETROSPECTIVE_EXCLUDED'
    );
    const unverifiedProvenanceRows = predictions.filter(
      (p: any) => p.temporalEligibilityStatus === 'UNVERIFIED_TIMESTAMP_PROVENANCE'
    );
    const missingOrInvalidTimestampRows = predictions.filter(
      (p: any) =>
        p.temporalEligibilityStatus === 'MISSING_PREDICTION_TIMESTAMP' ||
        p.temporalEligibilityStatus === 'INVALID_PREDICTION_TIMESTAMP' ||
        p.temporalEligibilityStatus === 'INVALID_KICKOFF_TIMESTAMP'
    );

    const settledRows = eligiblePreMatchRows.filter(
      (p: any) => p.ledgerTier === 'PRODUCTION' && p.settlement === 'SETTLED'
    );
    const settledCount = settledRows.length;
    const pendingCount = eligiblePreMatchRows.filter(
      (p: any) => p.ledgerTier === 'PRODUCTION' && p.settlement !== 'SETTLED'
    ).length;
    const dailyPicksCount = eligiblePreMatchRows.filter((p: any) => p.is_pick).length;

    const netProfitUnits = Number(
      settledRows.reduce((acc: number, r: any) => acc + Number(r.profitLossUnits || 0), 0).toFixed(3)
    );
    const totalStakedUnits = Number(
      settledRows.reduce((acc: number, r: any) => acc + Number(r.stakeUnits || 1), 0).toFixed(2)
    );

    const settlementSummary = {
      cohortLabel: DIAGNOSTIC_ALL_ROWS_COHORT_LABEL,
      settledCount,
      minSampleRequired: HEADLINE_COHORT_MIN_SETTLED_POSITIONS,
      insufficientSampleLabel:
        settledCount < HEADLINE_COHORT_MIN_SETTLED_POSITIONS
          ? formatInsufficientSampleLabel(settledCount, HEADLINE_COHORT_MIN_SETTLED_POSITIONS)
          : null,
      pendingCount,
      winsCount: settledRows.filter((r: any) => r.result === 'WIN').length,
      halfWinsCount: settledRows.filter((r: any) => r.result === 'HALF_WIN').length,
      pushesCount: settledRows.filter((r: any) => r.result === 'PUSH').length,
      halfLossesCount: settledRows.filter((r: any) => r.result === 'HALF_LOSS').length,
      lossesCount: settledRows.filter((r: any) => r.result === 'LOSS').length,
      totalStakedUnits,
      netProfitUnits,
    };

    const temporalEligibilitySummary = {
      totalInspected: predictions.length,
      validPreMatchCount: eligiblePreMatchRows.length,
      confirmedRetrospectiveCount: confirmedRetrospectiveRows.length,
      unverifiedProvenanceCount: unverifiedProvenanceRows.length,
      missingOrInvalidTimestampCount: missingOrInvalidTimestampRows.length,
      eligibleWithVerifiedOutcomeCount: eligiblePreMatchRows.filter((p: any) => p.scoreVerified).length,
      excludedRetrospectiveWithScoreCount: predictions.filter(
        (p: any) => !p.eligibleForPreMatchMetrics && p.archiveScoreVerified
      ).length,
    };

    // Build per-league Metric Computability Matrix (Hotfix H7 P1 + Hotfix H8 P1: strictly over eligibleForPreMatchMetrics rows, binary no-push per-leg Brier)
    const byLeagueMap = new Map<string, any>();
    for (const p of predictions) {
      const lg = p.competition || p.league || 'Unknown';
      if (!byLeagueMap.has(lg)) {
        byLeagueMap.set(lg, {
          league: lg,
          tier: p.ledgerTier,
          informative: Boolean(p.informative ?? (p.ledgerTier !== 'NONE')),
          nPredictions: 0,
          nEligiblePreMatch: 0,
          nConfirmedRetrospectiveExcluded: 0,
          nUnverifiedTimestampExcluded: 0,
          nOtherTemporalExcluded: 0,
          nArchiveScorePresentExcluded: 0,
          nWithPickOdds: 0,
          nExcludedMissingOdds: 0,
          oddsProvider: null as string | null,
          oddsTimestampSample: null as string | null,
          nWithClosingSnapshot: 0,
          nWithVerifiedFinalScore: 0,
          nSettledWithOdds: 0,
          nScoreResolvedWithoutOdds: 0,
          nBrierLegsTotal: 0,
          nBrierLegsResolved: 0,
          nBrierLegsExcludedPush: 0,
          _profits: [] as number[],
          _brierLegErrors: [] as number[],
          _brierWeightedSum: 0,
          _brierWeightSum: 0,
        });
      }
      const entry = byLeagueMap.get(lg)!;
      entry.nPredictions++;

      if (!p.eligibleForPreMatchMetrics) {
        if (p.temporalEligibilityStatus === 'RETROSPECTIVE_EXCLUDED') {
          entry.nConfirmedRetrospectiveExcluded++;
        } else if (p.temporalEligibilityStatus === 'UNVERIFIED_TIMESTAMP_PROVENANCE') {
          entry.nUnverifiedTimestampExcluded++;
        } else {
          entry.nOtherTemporalExcluded++;
        }
        if (p.archiveScoreVerified) {
          entry.nArchiveScorePresentExcluded++;
        }
        continue;
      }

      entry.nEligiblePreMatch++;
      const rawBookmaker = p.bookmaker || REFERENCE_BENCHMARK_BOOKMAKER;
      const isPinnacleBenchmark = isValidBenchmarkBookmaker(rawBookmaker);
      const hasPickOdds = typeof p.market_odds === 'number' && p.market_odds > 1.0 && isPinnacleBenchmark;
      if (hasPickOdds) {
        entry.nWithPickOdds++;
        entry.oddsProvider = REFERENCE_BENCHMARK_BOOKMAKER.toUpperCase();
        entry.oddsTimestampSample = p.predictionTimestamp || null;
      } else {
        entry.nExcludedMissingOdds++;
      }
      if (p.closingOdds !== null && p.closingOdds !== undefined && isPinnacleBenchmark) {
        entry.nWithClosingSnapshot++;
      }
      if (p.scoreVerified) {
        entry.nWithVerifiedFinalScore++;
        if (entry.informative && Array.isArray(p.brierLegs)) {
          for (const leg of p.brierLegs) {
            entry.nBrierLegsTotal++;
            if (leg.excludedPush || leg.brierSqError === null || !Number.isFinite(leg.brierSqError)) {
              entry.nBrierLegsExcludedPush++;
            } else {
              entry.nBrierLegsResolved++;
              entry._brierLegErrors.push(leg.brierSqError);
              entry._brierWeightedSum += leg.stakeWeight * leg.brierSqError;
              entry._brierWeightSum += leg.stakeWeight;
            }
          }
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
      const brierCi = bootstrapConfidenceInterval(entry._brierLegErrors);
      const brierStakeWeighted =
        entry._brierWeightSum > 0
          ? Number((entry._brierWeightedSum / entry._brierWeightSum).toFixed(4))
          : null;
      return {
        league: entry.league,
        tier: entry.tier,
        informative: entry.informative,
        yieldCohortLabel: DIAGNOSTIC_ALL_ROWS_COHORT_LABEL,
        brierScoringMethod: 'BINARY_NO_PUSH_PER_LEG',
        referenceBenchmarkBookmaker: REFERENCE_BENCHMARK_BOOKMAKER,
        nPredictions: entry.nPredictions,
        nEligiblePreMatch: entry.nEligiblePreMatch,
        nConfirmedRetrospectiveExcluded: entry.nConfirmedRetrospectiveExcluded,
        nUnverifiedTimestampExcluded: entry.nUnverifiedTimestampExcluded,
        nOtherTemporalExcluded: entry.nOtherTemporalExcluded,
        nArchiveScorePresentExcluded: entry.nArchiveScorePresentExcluded,
        nWithPickOdds: entry.nWithPickOdds,
        nExcludedMissingOdds: entry.nExcludedMissingOdds,
        oddsProvider: entry.oddsProvider,
        oddsTimestampSample: entry.oddsTimestampSample,
        nWithClosingSnapshot: entry.nWithClosingSnapshot,
        nWithVerifiedFinalScore: entry.nWithVerifiedFinalScore,
        nSettledWithOdds: entry.nSettledWithOdds,
        nScoreResolvedWithoutOdds: entry.nScoreResolvedWithoutOdds,
        nBrierLegsTotal: entry.nBrierLegsTotal,
        nBrierLegsResolved: entry.nBrierLegsResolved,
        nBrierLegsExcludedPush: entry.nBrierLegsExcludedPush,
        brierStakeWeighted,
        clvGateStatus:
          entry.nWithClosingSnapshot === 0
            ? GATE_STATUS_NOT_COMPUTABLE_YET
            : entry.nWithClosingSnapshot < CLV_HEADLINE_MIN_POSITIONS
            ? 'INSUFFICIENT_SAMPLE'
            : 'COMPUTABLE',
        clvInsufficientSampleLabel:
          entry.nWithClosingSnapshot < CLV_HEADLINE_MIN_POSITIONS
            ? formatInsufficientSampleLabel(entry.nWithClosingSnapshot, CLV_HEADLINE_MIN_POSITIONS)
            : null,
        marketBaselineStatus: GATE_STATUS_NOT_COMPUTABLE_YET,
        marketBaselineBrier: null,
        brierDiffVsMarket: null,
        brierDiffVsMarketCi95Upper: null,
        computableNow: {
          roi: entry.nSettledWithOdds > 0,
          yield: entry.nSettledWithOdds > 0,
          clv: entry.nWithClosingSnapshot > 0,
          brier: entry.informative && entry._brierLegErrors.length > 0,
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

    if (temporalStatusParam && temporalStatusParam !== 'ALL') {
      if (temporalStatusParam === 'EXCLUDED_ALL') {
        filteredPredictions = filteredPredictions.filter((p: any) => !p.eligibleForPreMatchMetrics);
      } else {
        filteredPredictions = filteredPredictions.filter(
          (p: any) => p.temporalEligibilityStatus === temporalStatusParam
        );
      }
    }

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
      filteredPredictions = filteredPredictions.filter(
        (p: any) => p.eligibleForPreMatchMetrics && (p.settlement === 'SETTLED' || p.scoreVerified)
      );
    } else if (settlementParam === 'PENDING') {
      filteredPredictions = filteredPredictions.filter(
        (p: any) => p.eligibleForPreMatchMetrics && p.settlement !== 'SETTLED' && !p.scoreVerified
      );
    } else if (settlementParam === 'EXCLUDED') {
      filteredPredictions = filteredPredictions.filter((p: any) => !p.eligibleForPreMatchMetrics);
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
      validPreMatch: temporalEligibilitySummary.validPreMatchCount,
      confirmedRetrospectiveExcluded: temporalEligibilitySummary.confirmedRetrospectiveCount,
      unverifiedTimestampExcluded: temporalEligibilitySummary.unverifiedProvenanceCount,
      productionRows: productionRows.length,
      shadowRows: shadowRows.length,
      unsupportedRows: unsupportedRows.length,
      dailyPicks: dailyPicksCount,
      settled: settledCount,
      pending: pendingCount,
      verifiedFinalScoresCount: temporalEligibilitySummary.eligibleWithVerifiedOutcomeCount,
      excludedRetrospectiveWithScoreCount: temporalEligibilitySummary.excludedRetrospectiveWithScoreCount,
      byLedgerTier: {
        PRODUCTION: productionRows.length,
        SHADOW: shadowRows.length,
        NONE: unsupportedRows.length,
      },
      byTemporalStatus: {
        VALID_PRE_MATCH: temporalEligibilitySummary.validPreMatchCount,
        RETROSPECTIVE_EXCLUDED: temporalEligibilitySummary.confirmedRetrospectiveCount,
        UNVERIFIED_TIMESTAMP_PROVENANCE: temporalEligibilitySummary.unverifiedProvenanceCount,
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
      registeredGates: PRE_REGISTERED_GATES,
      tierFilter: tierParam,
      dataState,
      counts,
      temporalEligibilitySummary,
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
