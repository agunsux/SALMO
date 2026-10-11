// SALMO.DEV — Multi-League Auto-Unlock & Quota-Reset Activator (Phases B, C, D)
// Orchestrates:
// 1. Non-billable Quota-Reset Detection via /v4/account (Phase B)
// 2. Priority-queued Batch Tournament Odds Ingestion with 50-request Mandatory Reserve (Phase C)
// 3. 10-Step Independent League & Market (AH vs OU) Validation, Smoke Test, Promotion & Fault-Isolated Rollback (Phase D)

import fs from 'fs';
import path from 'path';
import {
  CANONICAL_15_LEAGUES,
  MultiLeagueEntry,
  MarketKey,
  MarketReadinessState,
  ProductionStatus,
  activateLeagueMarkets,
  rollbackLeagueMarkets,
  getPriorityOrderedLeaguesForOdds,
  getTournamentBatches,
  MAX_TOURNAMENTS_PER_BATCH_REQUEST,
} from '../../config/multiLeagueRegistry';
import {
  OddsPapiQuotaGuard,
  QuotaResetDetectionResult,
} from '../../lib/quota/oddsPapiQuotaGuard';
import {
  CANONICAL_MULTI_LEAGUE_RATINGS,
  MULTI_LEAGUE_BACKTEST_SUMMARY,
  MULTI_LEAGUE_PROFILES,
  CANONICAL_EPL_RATINGS,
} from '../features/teamRatings';
import { CompetitionProfileEngine } from '../features/competitionProfile';
import { ProductionPredictionEngine, FixtureInput } from '../pipeline/productionPredictionEngine';
import { OddsPapiProvider } from '../../services/providers/oddsPapiProvider';
import { LiveOddsDTO, LiveFixtureDTO } from '../../services/providers/types';
import { Logger } from '../../lib/logger';

export interface MarketEvaluationDetail {
  market: MarketKey;
  readinessState: MarketReadinessState;
  productionEnabled: boolean;
  modelValidated: boolean;
  brierScore: number | null;
  logLoss: number | null;
  calibrationSlope: number | null;
  liveFixturesWithOddsCount: number;
  smokeTestPassed: boolean;
  qualifyingLayakCount: number;
  pantauCount: number;
  lewatiCount: number;
  blockerReason: string | null;
}

export interface LeagueActivationEvaluation {
  internalLeagueId: string;
  leagueName: string;
  country: string;
  oddspapiTournamentId: number;
  previousStatus: ProductionStatus;
  newStatus: ProductionStatus;
  promotedInThisRun: boolean;
  rolledBackInThisRun: boolean;
  historicalMatchesTotal: number;
  evalSampleSize: number;
  maxHistoricalDate: string | null;
  dispersionRatio: number | null;
  ratedTeamsCount: number;
  coldStartTeamsCount: number;
  discoveredFixturesCount: number;
  markets: {
    AH: MarketEvaluationDetail;
    OU: MarketEvaluationDetail;
    BTTS: {
      market: 'BTTS';
      readinessState: 'RESEARCH_ONLY';
      productionEnabled: false;
      blockerReason: string;
    };
  };
  activationReason: string;
}

export interface AutoActivationRunResult {
  runId: string;
  executedAtUtc: string;
  mode: 'LIVE' | 'SIMULATED_RESET_TEST';
  quotaDetection: QuotaResetDetectionResult;
  billableRequestsMade: number;
  batchesQueried: number[][];
  leaguesPromoted: string[];
  leaguesRolledBack: string[];
  activeLeaguesAfterRun: Array<{
    internalLeagueId: string;
    leagueName: string;
    enabledMarkets: MarketKey[];
  }>;
  shadowLeaguesAfterRun: Array<{
    internalLeagueId: string;
    leagueName: string;
    ahState: MarketReadinessState;
    ouState: MarketReadinessState;
    ahBlocker: string | null;
    ouBlocker: string | null;
  }>;
  pausedLeaguesAfterRun: Array<{
    internalLeagueId: string;
    leagueName: string;
    reason: string;
  }>;
  leagueEvaluations: LeagueActivationEvaluation[];
  evaluatedFixtures: FixtureInput[];
  persistenceSummary?: {
    persistedPicksCount: number;
    persistedLedgerCount: number;
    persistedGreenCount: number;
    duplicateCount: number;
    excludedCount: number;
  };
}

export interface AutoActivationOptions {
  mode?: 'LIVE' | 'SIMULATED_RESET_TEST';
  forceAccountSync?: boolean;
  injectedAccountData?: any;
  injectedFixtures?: Array<Partial<LiveFixtureDTO> & { providerFixtureId: string; homeTeam: string; awayTeam: string; league: string; kickoffTime: string }>;
  injectedOddsByTournamentBatch?: Record<string, LiveOddsDTO[]>;
  simulateSmokeTestFailureForLeagues?: string[];
  persistToDatabase?: boolean;
  writeVerificationArtifact?: boolean;
}

export class MultiLeagueAutoActivator {
  public static readonly BRIER_THRESHOLD = 0.2500;
  public static readonly LOG_LOSS_THRESHOLD = 0.6931;
  public static readonly MIN_CALIBRATION_SLOPE = 0.5000;
  public static readonly MAX_DISPERSION_RATIO = 1.1500;
  public static readonly MIN_EVAL_SAMPLE = 300;

  /**
   * Executes the complete Phase B -> Phase C -> Phase D Auto-Unlock & Activation flow.
   * Strictly non-billable when quota is exhausted or unverified.
   */
  public static async runAutoUnlockCycle(
    options: AutoActivationOptions = {}
  ): Promise<AutoActivationRunResult> {
    const runId = `autounlock_${Date.now()}`;
    const executedAtUtc = new Date().toISOString();
    const mode = options.mode || 'LIVE';

    // ─── PHASE B: Non-Billable Quota-Reset Detection ────────────────────────
    // Require at least 3 operational calls above the 50-request mandatory reserve
    // (1 fixture discovery + 2 priority tournament batches for the 7 validated leagues)
    const quotaDetection = await OddsPapiQuotaGuard.detectQuotaReset(
      3,
      options.forceAccountSync ?? false,
      options.injectedAccountData
    );

    let billableRequestsMade = 0;
    const batchesQueried: number[][] = [];
    const discoveredFixturesByLeague = new Map<string, FixtureInput[]>();
    let lockId: string | undefined;

    // ─── PHASE C: Quota-Aware Priority Batch Odds Ingestion ─────────────────
    if (quotaDetection.state === 'QUOTA_AVAILABLE') {
      const lockRes = OddsPapiQuotaGuard.acquireActivationLock(quotaDetection.idempotencyCycleKey);
      if (!lockRes.acquired) {
        quotaDetection.state = 'ACTIVATION_IN_PROGRESS';
        quotaDetection.reason = lockRes.reason || 'Activation lock already held by another process.';
      } else {
        lockId = lockRes.lockId;
      }
    }

    try {
      if (quotaDetection.state === 'QUOTA_AVAILABLE') {
        const ingestionRes = await this.ingestPriorityFixturesAndOdds(
          quotaDetection,
          options
        );
        billableRequestsMade = ingestionRes.billableRequestsMade;
        batchesQueried.push(...ingestionRes.batchesQueried);
        for (const [lid, fixList] of ingestionRes.fixturesByLeague.entries()) {
          discoveredFixturesByLeague.set(lid, fixList);
        }
      }

      // ─── PHASE D: 10-Step Per-League & Per-Market Independent Evaluation ──
      const leagueEvaluations: LeagueActivationEvaluation[] = [];
      const leaguesPromoted: string[] = [];
      const leaguesRolledBack: string[] = [];
      const allEvaluatedFixtures: FixtureInput[] = [];
      const smokeTestedPredictionsForPersistence: Array<{
        prediction: any;
        evaluations: any;
      }> = [];

      for (const entry of CANONICAL_15_LEAGUES) {
        const lid = entry.internal_league_id;

        // Isolate each league evaluation so a fault in one league never aborts others
        try {
          const evalResult = this.evaluateSingleLeague(
            entry,
            quotaDetection,
            discoveredFixturesByLeague.get(lid) || [],
            options.simulateSmokeTestFailureForLeagues?.includes(lid) || false
          );

          leagueEvaluations.push(evalResult.evaluation);
          allEvaluatedFixtures.push(...evalResult.fixturesUsed);
          smokeTestedPredictionsForPersistence.push(...evalResult.smokeTestOutputs);

          if (evalResult.evaluation.promotedInThisRun) {
            leaguesPromoted.push(lid);
          }
          if (evalResult.evaluation.rolledBackInThisRun) {
            leaguesRolledBack.push(lid);
          }
        } catch (leagueErr) {
          Logger.error(`[MultiLeagueAutoActivator] Fault isolated in league ${lid}:`, { error: String(leagueErr) });
          rollbackLeagueMarkets(lid, `Fault isolated during activation: ${String(leagueErr)}`);
          leaguesRolledBack.push(lid);
        }
      }

      // Optional database persistence for active & newly promoted leagues
      let persistenceSummary: AutoActivationRunResult['persistenceSummary'];
      if (options.persistToDatabase && smokeTestedPredictionsForPersistence.length > 0) {
        const persistRes = await ProductionPredictionEngine.persistPredictionCycle(
          smokeTestedPredictionsForPersistence
        );
        persistenceSummary = {
          persistedPicksCount: persistRes.persistedPicksCount,
          persistedLedgerCount: persistRes.persistedLedgerCount,
          persistedGreenCount: persistRes.persistedGreenCount,
          duplicateCount: persistRes.duplicateCount,
          excludedCount: persistRes.excludedCount,
        };
      }

      const activeLeaguesAfterRun = CANONICAL_15_LEAGUES.filter(l => l.production_status === 'ACTIVE').map(l => ({
        internalLeagueId: l.internal_league_id,
        leagueName: l.league_name,
        enabledMarkets: [...(l.production_enabled_markets || [])],
      }));

      const shadowLeaguesAfterRun = CANONICAL_15_LEAGUES.filter(l => l.production_status === 'SHADOW').map(l => ({
        internalLeagueId: l.internal_league_id,
        leagueName: l.league_name,
        ahState: l.market_readiness?.AH || 'BLOCKED_MODEL_VALIDATION',
        ouState: l.market_readiness?.OU || 'BLOCKED_MODEL_VALIDATION',
        ahBlocker: l.market_blockers?.AH || null,
        ouBlocker: l.market_blockers?.OU || null,
      }));

      const pausedLeaguesAfterRun = CANONICAL_15_LEAGUES.filter(l => l.production_status === 'PAUSED').map(l => ({
        internalLeagueId: l.internal_league_id,
        leagueName: l.league_name,
        reason: l.activation_reason || 'PAUSED_MISSING_BASELINE',
      }));

      const runResult: AutoActivationRunResult = {
        runId,
        executedAtUtc,
        mode,
        quotaDetection,
        billableRequestsMade,
        batchesQueried,
        leaguesPromoted,
        leaguesRolledBack,
        activeLeaguesAfterRun,
        shadowLeaguesAfterRun,
        pausedLeaguesAfterRun,
        leagueEvaluations,
        evaluatedFixtures: allEvaluatedFixtures,
        persistenceSummary,
      };

      if (options.writeVerificationArtifact !== false && mode === 'LIVE') {
        this.writeVerificationStateFile(runResult);
      }

      return runResult;
    } finally {
      if (lockId) {
        OddsPapiQuotaGuard.releaseActivationLock(lockId, true);
      }
    }
  }

  /**
   * Phase C: Priority-ordered tournament batch ingestion respecting the 50-request mandatory reserve.
   * Only queries leagues that have at least one model-validated market (EPL + 7 validated non-EPL leagues = 8 tournaments = 2 batches of <=5).
   */
  private static async ingestPriorityFixturesAndOdds(
    quotaDetection: QuotaResetDetectionResult,
    options: AutoActivationOptions
  ): Promise<{
    billableRequestsMade: number;
    batchesQueried: number[][];
    fixturesByLeague: Map<string, FixtureInput[]>;
  }> {
    let billableRequestsMade = 0;
    const batchesQueried: number[][] = [];
    const fixturesByLeague = new Map<string, FixtureInput[]>();

    // Select only leagues with at least 1 validated market, ordered by activation_priority
    const prioritizedValidatedLeagues = getPriorityOrderedLeaguesForOdds().filter(
      l => (l.validated_markets?.length || 0) > 0
    );
    const priorityBatches = getTournamentBatches(prioritizedValidatedLeagues);

    // 1. Discover upcoming fixtures (injected for tests or live via OddsPapiProvider)
    let rawFixtures: Array<Partial<LiveFixtureDTO> & { providerFixtureId: string; homeTeam: string; awayTeam: string; league: string; kickoffTime: string }> = [];
    if (options.injectedFixtures) {
      rawFixtures = options.injectedFixtures;
    } else {
      const guard = await OddsPapiQuotaGuard.checkQuota(
        1,
        OddsPapiQuotaGuard.MANDATORY_MULTI_LEAGUE_RESERVE
      );
      if (!guard.allowed) {
        Logger.warn('[MultiLeagueAutoActivator] Halting fixture discovery due to 50-request reserve guard:', {
          reason: guard.reason,
        });
        return { billableRequestsMade, batchesQueried, fixturesByLeague };
      }
      const oddsPapi = new OddsPapiProvider();
      const fixRes = await oddsPapi.getUpcomingFixtures();
      if (fixRes.status === 'AVAILABLE' && fixRes.data) {
        rawFixtures = fixRes.data;
        billableRequestsMade += 1;
      } else {
        return { billableRequestsMade, batchesQueried, fixturesByLeague };
      }
    }

    // 2. Fetch batch tournament odds for Pinnacle in priority order, checking reserve before each batch
    const oddsByFixtureId = new Map<string, LiveOddsDTO[]>();

    for (const batch of priorityBatches) {
      const batchKey = batch.join(',');
      if (options.injectedOddsByTournamentBatch && options.injectedOddsByTournamentBatch[batchKey]) {
        batchesQueried.push(batch);
        billableRequestsMade += 1;
        for (const o of options.injectedOddsByTournamentBatch[batchKey]) {
          const list = oddsByFixtureId.get(o.providerFixtureId) || [];
          list.push(o);
          oddsByFixtureId.set(o.providerFixtureId, list);
        }
        continue;
      }

      // Check 50-request mandatory reserve before each live batch request
      if (
        billableRequestsMade + 1 > quotaDetection.remainingOperationalBudget ||
        OddsPapiQuotaGuard.isCircuitTripped()
      ) {
        Logger.warn('[MultiLeagueAutoActivator] Stopping batch odds ingestion to preserve 50-request mandatory reserve.', {
          billableRequestsMade,
          remainingOperationalBudget: quotaDetection.remainingOperationalBudget,
          skippedBatch: batch,
        });
        break;
      }

      const guard = await OddsPapiQuotaGuard.checkQuota(
        1,
        OddsPapiQuotaGuard.MANDATORY_MULTI_LEAGUE_RESERVE
      );
      if (!guard.allowed) {
        Logger.warn('[MultiLeagueAutoActivator] Quota guard blocked batch request:', {
          batch,
          reason: guard.reason,
        });
        break;
      }

      const oddsPapi = new OddsPapiProvider();
      const oddsRes = await oddsPapi.getTournamentOdds(batch, 'pinnacle');
      if (oddsRes.status === 'AVAILABLE' && oddsRes.data) {
        batchesQueried.push(batch);
        billableRequestsMade += 1;
        for (const o of oddsRes.data) {
          const list = oddsByFixtureId.get(o.providerFixtureId) || [];
          list.push(o);
          oddsByFixtureId.set(o.providerFixtureId, list);
        }
      } else {
        Logger.warn('[MultiLeagueAutoActivator] Batch tournament odds call failed or returned empty:', {
          batch,
          status: oddsRes.status,
          error: oddsRes.error,
        });
        if (OddsPapiQuotaGuard.isCircuitTripped()) {
          break;
        }
      }
    }

    // 3. Map discovered fixtures + Pinnacle odds by internal_league_id
    for (const f of rawFixtures) {
      const leagueEntry = CANONICAL_15_LEAGUES.find(
        l =>
          l.league_name.toLowerCase() === f.league.toLowerCase() ||
          l.display_name.toLowerCase() === f.league.toLowerCase() ||
          l.internal_league_id.toLowerCase() === f.league.toLowerCase() ||
          (f.league.toLowerCase().includes('belgian') && l.internal_league_id === 'BEL-PRO') ||
          l.oddspapi_tournament_id === Number((f as any).tournamentId)
      );
      if (!leagueEntry) continue;

      const fixtureOdds = oddsByFixtureId.get(f.providerFixtureId) || [];
      let ah: { line: number; homeOdds: number; awayOdds: number; timestampUtc?: string } | undefined;
      let ou: { line: number; overOdds: number; underOdds: number; timestampUtc?: string } | undefined;

      const ahCandidates = fixtureOdds.filter(
        o => (o.marketType === 'ASIAN_HANDICAP' || o.marketType === 'AH') && o.homeOdds > 1.0 && o.awayOdds > 1.0
      );
      if (ahCandidates.length > 0) {
        const mainAh =
          ahCandidates.find(o => o.isMainLine) ||
          ahCandidates.sort((a, b) => Math.abs(a.homeOdds - 1.95) - Math.abs(b.homeOdds - 1.95))[0];
        ah = {
          line: mainAh.line,
          homeOdds: mainAh.homeOdds,
          awayOdds: mainAh.awayOdds,
          timestampUtc: mainAh.capturedAt,
        };
      }

      const ouCandidates = fixtureOdds.filter(
        o => (o.marketType === 'OVER_UNDER' || o.marketType === 'OU') && o.homeOdds > 1.0 && o.awayOdds > 1.0
      );
      if (ouCandidates.length > 0) {
        const mainOu =
          ouCandidates.find(o => o.isMainLine) ||
          ouCandidates.sort((a, b) => Math.abs(a.homeOdds - 1.95) - Math.abs(b.homeOdds - 1.95))[0];
        ou = {
          line: mainOu.line,
          overOdds: mainOu.homeOdds,
          underOdds: mainOu.awayOdds,
          timestampUtc: mainOu.capturedAt,
        };
      }

      const input: FixtureInput = {
        fixtureId: f.providerFixtureId,
        providerFixtureId: f.providerFixtureId,
        providerName: 'OddsPapi',
        sourceType: 'PROVIDER',
        homeTeam: f.homeTeam,
        awayTeam: f.awayTeam,
        league: leagueEntry.league_name,
        kickoffUtc: f.kickoffTime,
        season: f.season || '2026',
        venue: f.venue,
        pinnacleOdds: { ah, ou },
      };

      const existing = fixturesByLeague.get(leagueEntry.internal_league_id) || [];
      existing.push(input);
      fixturesByLeague.set(leagueEntry.internal_league_id, existing);
    }

    return { billableRequestsMade, batchesQueried, fixturesByLeague };
  }

  /**
   * Phase D: 10-Step Independent Evaluation & Controlled Smoke Test for a single league.
   */
  public static evaluateSingleLeague(
    entry: MultiLeagueEntry,
    quotaDetection: QuotaResetDetectionResult,
    liveFixtures: FixtureInput[],
    simulateSmokeTestFailure = false
  ): {
    evaluation: LeagueActivationEvaluation;
    fixturesUsed: FixtureInput[];
    smokeTestOutputs: Array<{ prediction: any; evaluations: any }>;
  } {
    const lid = entry.internal_league_id;
    const previousStatus = entry.production_status;

    // ─── STEP 1: Check PAUSED / Missing Baseline (IDN-L1) ───────────────────
    if (lid === 'IDN-L1' || entry.production_status === 'PAUSED') {
      const pauseReason = 'PAUSED: 0 verified historical matches and 0 team ratings for Indonesia Liga 1.';
      entry.market_readiness = {
        AH: 'PAUSED_MISSING_BASELINE',
        OU: 'PAUSED_MISSING_BASELINE',
      };
      entry.market_blockers = {
        AH: pauseReason,
        OU: pauseReason,
      };
      entry.last_activation_check_at = new Date().toISOString();

      return {
        evaluation: {
          internalLeagueId: lid,
          leagueName: entry.league_name,
          country: entry.country,
          oddspapiTournamentId: entry.oddspapi_tournament_id,
          previousStatus,
          newStatus: 'PAUSED',
          promotedInThisRun: false,
          rolledBackInThisRun: false,
          historicalMatchesTotal: 0,
          evalSampleSize: 0,
          maxHistoricalDate: null,
          dispersionRatio: null,
          ratedTeamsCount: 0,
          coldStartTeamsCount: 0,
          discoveredFixturesCount: 0,
          markets: {
            AH: {
              market: 'AH',
              readinessState: 'PAUSED_MISSING_BASELINE',
              productionEnabled: false,
              modelValidated: false,
              brierScore: null,
              logLoss: null,
              calibrationSlope: null,
              liveFixturesWithOddsCount: 0,
              smokeTestPassed: false,
              qualifyingLayakCount: 0,
              pantauCount: 0,
              lewatiCount: 0,
              blockerReason: pauseReason,
            },
            OU: {
              market: 'OU',
              readinessState: 'PAUSED_MISSING_BASELINE',
              productionEnabled: false,
              modelValidated: false,
              brierScore: null,
              logLoss: null,
              calibrationSlope: null,
              liveFixturesWithOddsCount: 0,
              smokeTestPassed: false,
              qualifyingLayakCount: 0,
              pantauCount: 0,
              lewatiCount: 0,
              blockerReason: pauseReason,
            },
            BTTS: {
              market: 'BTTS',
              readinessState: 'RESEARCH_ONLY',
              productionEnabled: false,
              blockerReason: 'BTTS is strictly RESEARCH_ONLY across all leagues.',
            },
          },
          activationReason: pauseReason,
        },
        fixturesUsed: [],
        smokeTestOutputs: [],
      };
    }

    // ─── STEP 2 & 3: Historical Dataset & Team Ratings / Cold-Start Audit ───
    const isEpl = lid === 'ENG-PL';
    const ratingsMap = isEpl
      ? CANONICAL_EPL_RATINGS
      : (CANONICAL_MULTI_LEAGUE_RATINGS[lid] || {});
    const ratingList = Object.values(ratingsMap);
    const ratedTeamsCount = ratingList.length;
    const coldStartTeamsCount = ratingList.filter(r => r.cold_start || r.matches_played < 10).length;
    const unratedTeamsCount = ratingList.filter(r => r.matches_played <= 2).length;

    const leagueProf = MULTI_LEAGUE_PROFILES[lid];
    const backtest = MULTI_LEAGUE_BACKTEST_SUMMARY[lid];

    const historicalMatchesTotal = Number(leagueProf?.sampleMatches ?? (isEpl ? 1329 : 0));
    const evalSampleSize = Number(backtest?.nEval ?? (isEpl ? 300 : 0));
    const maxHistoricalDate: string | null = leagueProf?.maxDate || null;
    const dispersionRatio: number | null = leagueProf?.dispersionRatio ?? null;

    // Check data-quality & cold-start blockers before model validation
    let leagueDataBlockerState: MarketReadinessState | null = null;
    let leagueDataBlockerReason: string | null = null;

    if (!isEpl) {
      if (lid === 'SCO-PREM' || lid === 'ENG-CHAMP') {
        leagueDataBlockerState = 'BLOCKED_DATA_QUALITY';
        leagueDataBlockerReason = `Data quality blocker: missing current autumn 2026/2027 season match coverage (maxHistoricalDate=${maxHistoricalDate}, nEval=${evalSampleSize}, coldStartTeams=${coldStartTeamsCount}).`;
      } else if (lid === 'JPN-J1' || lid === 'KOR-K1') {
        leagueDataBlockerState = 'BLOCKED_COLD_START';
        leagueDataBlockerReason = `Cold-start & season coverage blocker: ${coldStartTeamsCount}/${ratedTeamsCount} teams have < 10 historical matches and ${unratedTeamsCount} teams have <= 2 matches (maxHistoricalDate=${maxHistoricalDate}, nEval=${evalSampleSize}).`;
      } else if (evalSampleSize < this.MIN_EVAL_SAMPLE || (maxHistoricalDate && maxHistoricalDate < '2026-08-01')) {
        leagueDataBlockerState = 'BLOCKED_DATA_QUALITY';
        leagueDataBlockerReason = `Data quality blocker: out-of-sample evaluation size nEval=${evalSampleSize} (< ${this.MIN_EVAL_SAMPLE}) or stale maxHistoricalDate=${maxHistoricalDate}.`;
      }
    }

    // ─── STEP 4 & 5: Independent Per-Market Walk-Forward Model Validation ───
    const ahBrier: number | null = backtest?.ahHomeMinus05?.brier ?? null;
    const ahLogLoss: number | null = backtest?.ahHomeMinus05?.logLoss ?? null;
    const ahSlope: number | null = backtest?.ahHomeMinus05?.calibrationSlope ?? null;

    const ouBrier: number | null = backtest?.ou25?.brier ?? null;
    const ouLogLoss: number | null = backtest?.ou25?.logLoss ?? null;
    const ouSlope: number | null = backtest?.ou25?.calibrationSlope ?? null;

    const dispersionOk = dispersionRatio !== null && dispersionRatio <= this.MAX_DISPERSION_RATIO;

    const ahMetricsPass =
      dispersionOk &&
      ahBrier !== null &&
      ahLogLoss !== null &&
      ahSlope !== null &&
      ahBrier < this.BRIER_THRESHOLD &&
      ahLogLoss < this.LOG_LOSS_THRESHOLD &&
      ahSlope >= this.MIN_CALIBRATION_SLOPE &&
      CompetitionProfileEngine.isMarketCalibrated(entry.league_name, 'AH');

    const ouMetricsPass =
      dispersionOk &&
      ouBrier !== null &&
      ouLogLoss !== null &&
      ouSlope !== null &&
      ouBrier < this.BRIER_THRESHOLD &&
      ouLogLoss < this.LOG_LOSS_THRESHOLD &&
      ouSlope >= this.MIN_CALIBRATION_SLOPE &&
      CompetitionProfileEngine.isMarketCalibrated(entry.league_name, 'OU');

    const ahModelValidated = isEpl || (!leagueDataBlockerState && ahMetricsPass);
    const ouModelValidated = isEpl || (!leagueDataBlockerState && ouMetricsPass);

    const buildMarketBlockReason = (
      market: MarketKey,
      brier: number | null,
      logLoss: number | null,
      slope: number | null
    ): { state: MarketReadinessState; reason: string } => {
      if (leagueDataBlockerState && leagueDataBlockerReason) {
        return { state: leagueDataBlockerState, reason: leagueDataBlockerReason };
      }
      return {
        state: 'BLOCKED_MODEL_VALIDATION',
        reason: `${market} failed walk-forward validation thresholds (Brier=${brier ?? 'N/A'} [max ${this.BRIER_THRESHOLD}], LogLoss=${logLoss ?? 'N/A'} [max ${this.LOG_LOSS_THRESHOLD}], calibrationSlope=${slope ?? 'N/A'} [min ${this.MIN_CALIBRATION_SLOPE}], dispersion=${dispersionRatio ?? 'N/A'}).`,
      };
    };

    // ─── STEP 6, 7, 8: Live Odds Verification & Controlled Smoke Test ───────
    const ahFixturesWithOdds = liveFixtures.filter(
      f => f.pinnacleOdds?.ah && f.pinnacleOdds.ah.homeOdds > 1.0 && f.pinnacleOdds.ah.awayOdds > 1.0
    );
    const ouFixturesWithOdds = liveFixtures.filter(
      f => f.pinnacleOdds?.ou && f.pinnacleOdds.ou.overOdds > 1.0 && f.pinnacleOdds.ou.underOdds > 1.0
    );

    const smokeTestOutputs: Array<{ prediction: any; evaluations: any }> = [];
    let ahSmokePassed = false;
    let ouSmokePassed = false;
    let ahLayak = 0;
    let ahPantau = 0;
    let ahLewati = 0;
    let ouLayak = 0;
    let ouPantau = 0;
    let ouLewati = 0;

    // Candidate markets that passed model validation AND have live Pinnacle odds
    const candidateMarketsToPromote: MarketKey[] = [];
    if (ahModelValidated && ahFixturesWithOdds.length > 0) candidateMarketsToPromote.push('AH');
    if (ouModelValidated && ouFixturesWithOdds.length > 0) candidateMarketsToPromote.push('OU');

    let promotedInThisRun = false;
    let rolledBackInThisRun = false;

    if (isEpl) {
      // EPL is already ACTIVE in production
      for (const f of liveFixtures) {
        const res = ProductionPredictionEngine.evaluateFixture(f);
        smokeTestOutputs.push(res);
      }
      ahSmokePassed = true;
      ouSmokePassed = true;
    } else if (candidateMarketsToPromote.length > 0 && quotaDetection.state === 'QUOTA_AVAILABLE') {
      // Provisionally enable candidate markets so ValueEngine Gate 7 evaluates them as production-ready
      activateLeagueMarkets(
        lid,
        candidateMarketsToPromote,
        `Provisional activation for controlled smoke test (${candidateMarketsToPromote.join(' + ')})`
      );

      try {
        if (simulateSmokeTestFailure) {
          throw new Error(`Simulated smoke test failure for ${lid}`);
        }

        const ahFairOddsSet = new Set<number>();
        const ouFairOddsSet = new Set<number>();

        for (const f of liveFixtures) {
          const evalOut = ProductionPredictionEngine.evaluateFixture(f);
          smokeTestOutputs.push(evalOut);

          const ahM = evalOut.prediction.markets.asianHandicap;
          const ouM = evalOut.prediction.markets.overUnder;
          const bttsM = evalOut.prediction.markets.btts;

          // Verify BTTS is strictly gated as LEWATI
          if (bttsM.verdict !== 'LEWATI') {
            throw new Error(`Smoke test invariant violation: BTTS verdict was ${bttsM.verdict} instead of LEWATI`);
          }

          if (candidateMarketsToPromote.includes('AH') && f.pinnacleOdds?.ah) {
            if (
              ahM.fairOdds === null ||
              !Number.isFinite(ahM.fairOdds) ||
              ahM.fairOdds <= 1.0 ||
              ahM.expectedValuePct === null ||
              !Number.isFinite(ahM.expectedValuePct)
            ) {
              throw new Error(`Invalid AH calculation on fixture ${f.fixtureId}`);
            }
            ahFairOddsSet.add(ahM.fairOdds);
            if (ahM.verdict === 'LAYAK') ahLayak++;
            else if (ahM.verdict === 'PANTAU') ahPantau++;
            else ahLewati++;
          }

          if (candidateMarketsToPromote.includes('OU') && f.pinnacleOdds?.ou) {
            if (
              ouM.fairOdds === null ||
              !Number.isFinite(ouM.fairOdds) ||
              ouM.fairOdds <= 1.0 ||
              ouM.expectedValuePct === null ||
              !Number.isFinite(ouM.expectedValuePct)
            ) {
              throw new Error(`Invalid OU calculation on fixture ${f.fixtureId}`);
            }
            ouFairOddsSet.add(ouM.fairOdds);
            if (ouM.verdict === 'LAYAK') ouLayak++;
            else if (ouM.verdict === 'PANTAU') ouPantau++;
            else ouLewati++;
          } else if (!ouModelValidated && f.pinnacleOdds?.ou) {
            // Uncalibrated OU market (e.g. Serie A or Belgian Pro League) MUST be rejected with LEWATI
            if (ouM.verdict !== 'LEWATI') {
              throw new Error(`Uncalibrated OU market in ${lid} was not rejected (verdict=${ouM.verdict})`);
            }
          }
        }

        // Verify non-degenerate variance when >= 2 fixtures exist
        if (candidateMarketsToPromote.includes('AH') && ahFixturesWithOdds.length >= 2 && ahFairOddsSet.size < 2) {
          throw new Error(`Degenerate AH probabilities detected across ${ahFixturesWithOdds.length} fixtures in ${lid}`);
        }
        if (candidateMarketsToPromote.includes('OU') && ouFixturesWithOdds.length >= 2 && ouFairOddsSet.size < 2) {
          throw new Error(`Degenerate OU probabilities detected across ${ouFixturesWithOdds.length} fixtures in ${lid}`);
        }

        ahSmokePassed = candidateMarketsToPromote.includes('AH');
        ouSmokePassed = candidateMarketsToPromote.includes('OU');

        const verifiedMarkets: MarketKey[] = [];
        if (ahSmokePassed) verifiedMarkets.push('AH');
        if (ouSmokePassed) verifiedMarkets.push('OU');

        activateLeagueMarkets(
          lid,
          verifiedMarkets,
          `Auto-unlocked ${verifiedMarkets.join(' + ')} after verified quota reset (${quotaDetection.requestCount}/${quotaDetection.requestLimit}) and passing 10-step smoke test.`
        );
        promotedInThisRun = previousStatus === 'SHADOW' && verifiedMarkets.length > 0;
      } catch (smokeErr) {
        Logger.warn(`[MultiLeagueAutoActivator] Smoke test failed for ${lid}; rolling back to SHADOW:`, {
          error: String(smokeErr),
        });
        rollbackLeagueMarkets(lid, `Rolled back to SHADOW after smoke test failure: ${String(smokeErr)}`);
        rolledBackInThisRun = true;
        ahSmokePassed = false;
        ouSmokePassed = false;
        smokeTestOutputs.length = 0;
      }
    }

    // ─── STEP 9 & 10: Finalize Market Readiness States & Blocker Reasons ────
    const resolveFinalMarketDetail = (
      market: MarketKey,
      modelValidated: boolean,
      brier: number | null,
      logLoss: number | null,
      slope: number | null,
      fixturesWithOddsCount: number,
      smokePassed: boolean,
      layakCount: number,
      pantauCount: number,
      lewatiCount: number
    ): MarketEvaluationDetail => {
      if (isEpl) {
        return {
          market,
          readinessState: 'ACTIVE',
          productionEnabled: true,
          modelValidated: true,
          brierScore: brier,
          logLoss,
          calibrationSlope: slope,
          liveFixturesWithOddsCount: fixturesWithOddsCount,
          smokeTestPassed: true,
          qualifyingLayakCount: layakCount,
          pantauCount,
          lewatiCount,
          blockerReason: null,
        };
      }

      if (!modelValidated) {
        const blk = buildMarketBlockReason(market, brier, logLoss, slope);
        entry.market_readiness![market] = blk.state;
        entry.market_blockers![market] = blk.reason;
        return {
          market,
          readinessState: blk.state,
          productionEnabled: false,
          modelValidated: false,
          brierScore: brier,
          logLoss,
          calibrationSlope: slope,
          liveFixturesWithOddsCount: fixturesWithOddsCount,
          smokeTestPassed: false,
          qualifyingLayakCount: 0,
          pantauCount: 0,
          lewatiCount: 0,
          blockerReason: blk.reason,
        };
      }

      if (rolledBackInThisRun) {
        const reason = entry.activation_reason || `Smoke test failed for ${lid} ${market}.`;
        entry.market_readiness![market] = 'BLOCKED_ODDS';
        entry.market_blockers![market] = reason;
        return {
          market,
          readinessState: 'BLOCKED_ODDS',
          productionEnabled: false,
          modelValidated: true,
          brierScore: brier,
          logLoss,
          calibrationSlope: slope,
          liveFixturesWithOddsCount: fixturesWithOddsCount,
          smokeTestPassed: false,
          qualifyingLayakCount: 0,
          pantauCount: 0,
          lewatiCount: 0,
          blockerReason: reason,
        };
      }

      if (smokePassed && entry.production_enabled_markets?.includes(market)) {
        entry.market_readiness![market] = 'ACTIVE';
        entry.market_blockers![market] = null;
        return {
          market,
          readinessState: 'ACTIVE',
          productionEnabled: true,
          modelValidated: true,
          brierScore: brier,
          logLoss,
          calibrationSlope: slope,
          liveFixturesWithOddsCount: fixturesWithOddsCount,
          smokeTestPassed: true,
          qualifyingLayakCount: layakCount,
          pantauCount,
          lewatiCount,
          blockerReason: null,
        };
      }

      if (quotaDetection.state !== 'QUOTA_AVAILABLE') {
        const qReason = `OddsPAPI quota gate closed (${quotaDetection.state}): ${quotaDetection.reason}`;
        entry.market_readiness![market] = 'BLOCKED_QUOTA';
        entry.market_blockers![market] = qReason;
        return {
          market,
          readinessState: 'BLOCKED_QUOTA',
          productionEnabled: false,
          modelValidated: true,
          brierScore: brier,
          logLoss,
          calibrationSlope: slope,
          liveFixturesWithOddsCount: 0,
          smokeTestPassed: false,
          qualifyingLayakCount: 0,
          pantauCount: 0,
          lewatiCount: 0,
          blockerReason: qReason,
        };
      }

      const oddsReason = `Model validated for ${market}, but 0 live Pinnacle ${market} odds were returned in current window.`;
      entry.market_readiness![market] = 'BLOCKED_ODDS';
      entry.market_blockers![market] = oddsReason;
      return {
        market,
        readinessState: 'BLOCKED_ODDS',
        productionEnabled: false,
        modelValidated: true,
        brierScore: brier,
        logLoss,
        calibrationSlope: slope,
        liveFixturesWithOddsCount: 0,
        smokeTestPassed: false,
        qualifyingLayakCount: 0,
        pantauCount: 0,
        lewatiCount: 0,
        blockerReason: oddsReason,
      };
    };

    const ahDetail = resolveFinalMarketDetail(
      'AH',
      ahModelValidated,
      ahBrier,
      ahLogLoss,
      ahSlope,
      ahFixturesWithOdds.length,
      ahSmokePassed,
      ahLayak,
      ahPantau,
      ahLewati
    );

    const ouDetail = resolveFinalMarketDetail(
      'OU',
      ouModelValidated,
      ouBrier,
      ouLogLoss,
      ouSlope,
      ouFixturesWithOdds.length,
      ouSmokePassed,
      ouLayak,
      ouPantau,
      ouLewati
    );

    entry.last_activation_check_at = new Date().toISOString();

    return {
      evaluation: {
        internalLeagueId: lid,
        leagueName: entry.league_name,
        country: entry.country,
        oddspapiTournamentId: entry.oddspapi_tournament_id,
        previousStatus,
        newStatus: entry.production_status,
        promotedInThisRun,
        rolledBackInThisRun,
        historicalMatchesTotal,
        evalSampleSize,
        maxHistoricalDate,
        dispersionRatio,
        ratedTeamsCount,
        coldStartTeamsCount,
        discoveredFixturesCount: liveFixtures.length,
        markets: {
          AH: ahDetail,
          OU: ouDetail,
          BTTS: {
            market: 'BTTS',
            readinessState: 'RESEARCH_ONLY',
            productionEnabled: false,
            blockerReason: 'BTTS is strictly RESEARCH_ONLY across all leagues.',
          },
        },
        activationReason: entry.activation_reason || ahDetail.blockerReason || ouDetail.blockerReason || 'Evaluated',
      },
      fixturesUsed: liveFixtures,
      smokeTestOutputs,
    };
  }

  /**
   * Writes the latest activation state & telemetry to data/verification/multi_league_activation_state.json
   */
  public static writeVerificationStateFile(result: AutoActivationRunResult): void {
    try {
      const targetDir = path.resolve(process.cwd(), 'data', 'verification');
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      const targetPath = path.join(targetDir, 'multi_league_activation_state.json');
      fs.writeFileSync(targetPath, JSON.stringify(result, null, 2), 'utf8');
    } catch (err) {
      Logger.warn('[MultiLeagueAutoActivator] Could not write verification state file:', { error: String(err) });
    }
  }
}
