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
  proposedForHumanReview: boolean;
  brierScore: number | null;
  brierCi95: [number, number] | null;
  beatsConstant05At95Ci: boolean;
  ahFixedMinus05Brier?: number | null;
  ahBalancedQuarterBrier?: number | null;
  logLoss: number | null;
  calibrationSlope: number | null;
  pinnacleBenchmarkAvailable: boolean;
  pinnacleBenchmarkMatchedFixtures: number;
  chronologicalWalkForwardVerified: boolean;
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
  promotionMode: 'PROPOSE_ONLY' | 'MANUAL_APPROVED_PROMOTION';
  explicitHumanApprovalGranted: boolean;
  promotedInThisRun: boolean;
  proposedInThisRun: boolean;
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
  promotionMode: 'PROPOSE_ONLY' | 'MANUAL_APPROVED_PROMOTION';
  explicitHumanApprovalGranted: boolean;
  productionWriteAllowed: boolean;
  quotaDetection: QuotaResetDetectionResult;
  billableRequestsMade: number;
  batchesQueried: number[][];
  leaguesPromoted: string[];
  leaguesProposedForReview: Array<{
    internalLeagueId: string;
    leagueName: string;
    proposedMarkets: MarketKey[];
  }>;
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
  injectedBacktestOverride?: Record<string, any>;
  simulateSmokeTestFailureForLeagues?: string[];
  /**
   * H2 Safety Gate: Defaults to false (PROPOSE_ONLY mode).
   * Even when true, requires process.env.ALLOW_MANUAL_LEAGUE_PROMOTION === 'true'
   * AND all 5 mandatory per-market statistical & benchmark proofs.
   */
  explicitHumanApproval?: boolean;
  /**
   * H1 Safety Gate: Both persistToDatabase and allowProductionWrite default to false.
   * Requires process.env.ALLOW_PRODUCTION_DB_WRITE === 'true' and is blocked in CI, test, and preview.
   */
  persistToDatabase?: boolean;
  allowProductionWrite?: boolean;
  writeVerificationArtifact?: boolean;
}

export class MultiLeagueAutoActivator {
  public static readonly BRIER_THRESHOLD = 0.2500;
  public static readonly LOG_LOSS_THRESHOLD = 0.6931;
  public static readonly MIN_CALIBRATION_SLOPE = 0.5000;
  public static readonly MAX_DISPERSION_RATIO = 1.1500;
  public static readonly MIN_EVAL_SAMPLE = 300;

  /**
   * H2 Safety Gate: Checks whether manual human approval for league promotion is active.
   * Quota reset alone NEVER authorizes promotion.
   */
  public static isManualPromotionAuthorized(explicitHumanApproval = false): boolean {
    if (!explicitHumanApproval) return false;
    if (process.env.ALLOW_MANUAL_LEAGUE_PROMOTION !== 'true') return false;
    if (process.env.VERCEL_ENV === 'preview') return false;
    return true;
  }

  /**
   * Executes the Phase B -> Phase C -> Phase D Multi-League Evaluation & Proposal flow.
   * H1: Database persistence defaults to FALSE and requires ALLOW_PRODUCTION_DB_WRITE === 'true'.
   * H2: Runs in PROPOSE_ONLY mode by default; quota reset NEVER promotes any league or market to ACTIVE.
   */
  public static async runAutoUnlockCycle(
    options: AutoActivationOptions = {}
  ): Promise<AutoActivationRunResult> {
    const runId = `autounlock_${Date.now()}`;
    const executedAtUtc = new Date().toISOString();
    const mode = options.mode || 'LIVE';

    const requestedWrite = Boolean(options.persistToDatabase && options.allowProductionWrite);
    const productionWriteAllowed = OddsPapiQuotaGuard.isProductionDatabaseWriteAllowed(requestedWrite);
    const explicitHumanApprovalGranted = this.isManualPromotionAuthorized(Boolean(options.explicitHumanApproval));
    const promotionMode: 'PROPOSE_ONLY' | 'MANUAL_APPROVED_PROMOTION' = explicitHumanApprovalGranted
      ? 'MANUAL_APPROVED_PROMOTION'
      : 'PROPOSE_ONLY';

    // ─── PHASE B: Non-Billable Quota-Reset Detection (Read-Only by Default) ──
    const quotaDetection = await OddsPapiQuotaGuard.detectQuotaReset(
      3,
      options.forceAccountSync ?? false,
      options.injectedAccountData,
      productionWriteAllowed
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
      const leaguesProposedForReview: Array<{
        internalLeagueId: string;
        leagueName: string;
        proposedMarkets: MarketKey[];
      }> = [];
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
            options.simulateSmokeTestFailureForLeagues?.includes(lid) || false,
            explicitHumanApprovalGranted,
            options.injectedBacktestOverride?.[lid]
          );

          leagueEvaluations.push(evalResult.evaluation);
          allEvaluatedFixtures.push(...evalResult.fixturesUsed);
          smokeTestedPredictionsForPersistence.push(...evalResult.smokeTestOutputs);

          if (evalResult.evaluation.promotedInThisRun) {
            leaguesPromoted.push(lid);
          }
          if (evalResult.evaluation.proposedInThisRun) {
            const proposedMarkets: MarketKey[] = [];
            if (evalResult.evaluation.markets.AH.proposedForHumanReview) proposedMarkets.push('AH');
            if (evalResult.evaluation.markets.OU.proposedForHumanReview) proposedMarkets.push('OU');
            if (proposedMarkets.length > 0) {
              leaguesProposedForReview.push({
                internalLeagueId: lid,
                leagueName: entry.league_name,
                proposedMarkets,
              });
            }
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

      // H1: Database persistence is strictly blocked unless productionWriteAllowed is true
      let persistenceSummary: AutoActivationRunResult['persistenceSummary'];
      if (productionWriteAllowed && smokeTestedPredictionsForPersistence.length > 0) {
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
        promotionMode,
        explicitHumanApprovalGranted,
        productionWriteAllowed,
        quotaDetection,
        billableRequestsMade,
        batchesQueried,
        leaguesPromoted,
        leaguesProposedForReview,
        leaguesRolledBack,
        activeLeaguesAfterRun,
        shadowLeaguesAfterRun,
        pausedLeaguesAfterRun,
        leagueEvaluations,
        evaluatedFixtures: allEvaluatedFixtures,
        persistenceSummary,
      };

      if (options.writeVerificationArtifact === true) {
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
   * Queries top-priority Pinnacle-supported leagues (EPL + top 7 Tier A/B shadow leagues = 8 tournaments = 2 batches of <=5).
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

    // Select priority cohort (activation_priority <= 8: ENG-PL + 7 primary European leagues = 8 tournaments = 2 batches of <=5)
    const prioritizedCohort = getPriorityOrderedLeaguesForOdds().filter(
      l => (l.activation_priority ?? 99) <= 8
    );
    const priorityBatches = getTournamentBatches(prioritizedCohort);

    // 1. Discover upcoming fixtures (injected for tests or live via OddsPapiProvider)
    let rawFixtures: Array<Partial<LiveFixtureDTO> & { providerFixtureId: string; homeTeam: string; awayTeam: string; league: string; kickoffTime: string }> = [];
    if (options.injectedFixtures) {
      rawFixtures = options.injectedFixtures;
    } else {
      const guard = await OddsPapiQuotaGuard.checkQuota(
        1,
        OddsPapiQuotaGuard.MANDATORY_MULTI_LEAGUE_RESERVE,
        false
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
        OddsPapiQuotaGuard.MANDATORY_MULTI_LEAGUE_RESERVE,
        false
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
   * H2: Defaults to PROPOSE_ONLY mode. Never promotes any non-EPL league to ACTIVE unless
   * explicitHumanApprovalGranted === true AND all 5 mandatory statistical & benchmark proofs pass.
   */
  public static evaluateSingleLeague(
    entry: MultiLeagueEntry,
    quotaDetection: QuotaResetDetectionResult,
    liveFixtures: FixtureInput[],
    simulateSmokeTestFailure = false,
    explicitHumanApprovalGranted = false,
    backtestOverride?: any
  ): {
    evaluation: LeagueActivationEvaluation;
    fixturesUsed: FixtureInput[];
    smokeTestOutputs: Array<{ prediction: any; evaluations: any }>;
  } {
    const lid = entry.internal_league_id;
    const previousStatus = entry.production_status;
    const promotionMode: 'PROPOSE_ONLY' | 'MANUAL_APPROVED_PROMOTION' = explicitHumanApprovalGranted
      ? 'MANUAL_APPROVED_PROMOTION'
      : 'PROPOSE_ONLY';

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
          promotionMode,
          explicitHumanApprovalGranted,
          promotedInThisRun: false,
          proposedInThisRun: false,
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
              proposedForHumanReview: false,
              brierScore: null,
              brierCi95: null,
              beatsConstant05At95Ci: false,
              logLoss: null,
              calibrationSlope: null,
              pinnacleBenchmarkAvailable: false,
              pinnacleBenchmarkMatchedFixtures: 0,
              chronologicalWalkForwardVerified: false,
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
              proposedForHumanReview: false,
              brierScore: null,
              brierCi95: null,
              beatsConstant05At95Ci: false,
              logLoss: null,
              calibrationSlope: null,
              pinnacleBenchmarkAvailable: false,
              pinnacleBenchmarkMatchedFixtures: 0,
              chronologicalWalkForwardVerified: false,
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
    const backtest = backtestOverride || MULTI_LEAGUE_BACKTEST_SUMMARY[lid];

    const historicalMatchesTotal = Number(leagueProf?.sampleMatches ?? (isEpl ? 1329 : 0));
    const evalSampleSize = Number(backtest?.nEval ?? (isEpl ? 300 : 0));
    const maxHistoricalDate: string | null = leagueProf?.maxDate || null;
    const dispersionRatio: number | null = leagueProf?.dispersionRatio ?? null;
    const chronologicalWalkForwardVerified = Boolean(backtest?.chronologicalWalkForwardVerified ?? true);
    const pinnacleBenchmarkAvailable = Boolean(backtest?.pinnacleBenchmark?.available ?? isEpl);
    const pinnacleBenchmarkMatchedFixtures = Number(backtest?.pinnacleBenchmark?.matchedFixtures ?? (isEpl ? 80 : 0));

    // Check data-quality & cold-start blockers before model validation (Proof 1 & Proof 5)
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
      } else if (coldStartTeamsCount > ratedTeamsCount * 0.25 || unratedTeamsCount > 0) {
        leagueDataBlockerState = 'BLOCKED_COLD_START';
        leagueDataBlockerReason = `Cold-start blocker: ${coldStartTeamsCount}/${ratedTeamsCount} active teams have < 10 historical matches (${unratedTeamsCount} with <= 2 matches).`;
      }
    }

    // ─── STEP 4 & 5: Independent Per-Market 5-Proof Walk-Forward Validation ─
    // H4: Use ahBalancedHalfLine (binary Y in {0,1}, constant-0.5 Brier = 0.2500) as the authoritative AH target
    const ahHalfMetric = backtest?.ahBalancedHalfLine || backtest?.ahHomeMinus05;
    const ahBrier: number | null = ahHalfMetric?.brier ?? null;
    const ahBrierCi95: [number, number] | null = ahHalfMetric?.brierCi95 ?? null;
    const ahBeats05Ci95 = Boolean(ahHalfMetric?.beatsConstant05At95Ci ?? false);
    const ahLogLoss: number | null = ahHalfMetric?.logLoss ?? null;
    const ahSlope: number | null = ahHalfMetric?.calibrationSlope ?? null;
    const ahFixedMinus05Brier: number | null = backtest?.ahHomeMinus05?.brier ?? null;
    const ahBalancedQuarterBrier: number | null = backtest?.ahBalancedQuarterLine?.brier ?? null;

    const ouBrier: number | null = backtest?.ou25?.brier ?? null;
    const ouBrierCi95: [number, number] | null = backtest?.ou25?.brierCi95 ?? null;
    const ouBeats05Ci95 = Boolean(backtest?.ou25?.beatsConstant05At95Ci ?? false);
    const ouLogLoss: number | null = backtest?.ou25?.logLoss ?? null;
    const ouSlope: number | null = backtest?.ou25?.calibrationSlope ?? null;

    const dispersionOk = dispersionRatio !== null && dispersionRatio <= this.MAX_DISPERSION_RATIO;

    // Proof 1..3 + Proof 5 (Statistical & Data Integrity proofs before Pinnacle benchmark)
    const ahStatisticalPass =
      evalSampleSize >= this.MIN_EVAL_SAMPLE &&
      chronologicalWalkForwardVerified &&
      !leagueDataBlockerState &&
      dispersionOk &&
      ahBrier !== null &&
      ahLogLoss !== null &&
      ahSlope !== null &&
      ahBrier < this.BRIER_THRESHOLD &&
      ahBeats05Ci95 &&
      ahLogLoss < this.LOG_LOSS_THRESHOLD &&
      ahSlope >= this.MIN_CALIBRATION_SLOPE &&
      CompetitionProfileEngine.isMarketCalibrated(entry.league_name, 'AH');

    const ouStatisticalPass =
      evalSampleSize >= this.MIN_EVAL_SAMPLE &&
      chronologicalWalkForwardVerified &&
      !leagueDataBlockerState &&
      dispersionOk &&
      ouBrier !== null &&
      ouLogLoss !== null &&
      ouSlope !== null &&
      ouBrier < this.BRIER_THRESHOLD &&
      ouBeats05Ci95 &&
      ouLogLoss < this.LOG_LOSS_THRESHOLD &&
      ouSlope >= this.MIN_CALIBRATION_SLOPE &&
      CompetitionProfileEngine.isMarketCalibrated(entry.league_name, 'OU');

    // Proof 4: Historical Pinnacle no-vig benchmark on the same matches
    const ahAll5ProofsPass = isEpl || (ahStatisticalPass && pinnacleBenchmarkAvailable && pinnacleBenchmarkMatchedFixtures > 0);
    const ouAll5ProofsPass = isEpl || (ouStatisticalPass && pinnacleBenchmarkAvailable && pinnacleBenchmarkMatchedFixtures > 0);

    // Keep entry.validated_markets synchronized with the 5-proof validation state
    if (!isEpl) {
      const nextValidated: MarketKey[] = [];
      if (ahAll5ProofsPass) nextValidated.push('AH');
      if (ouAll5ProofsPass) nextValidated.push('OU');
      entry.validated_markets = nextValidated;
    }

    const buildMarketBlockReason = (
      market: MarketKey,
      statisticalPass: boolean,
      brier: number | null,
      ci95: [number, number] | null,
      beats05Ci: boolean,
      logLoss: number | null,
      slope: number | null
    ): { state: MarketReadinessState; reason: string } => {
      if (leagueDataBlockerState && leagueDataBlockerReason) {
        return { state: leagueDataBlockerState, reason: leagueDataBlockerReason };
      }
      if (!statisticalPass) {
        const ciStr = ci95 ? `[${ci95[0]}, ${ci95[1]}]` : 'N/A';
        return {
          state: 'BLOCKED_MODEL_VALIDATION',
          reason: `NOT_APPROVED_FOR_PRODUCTION: ${market} failed walk-forward statistical gate (Brier=${brier ?? 'N/A'}, 95% CI=${ciStr}, beats0.25At95Ci=${beats05Ci}, LogLoss=${logLoss ?? 'N/A'}, slope=${slope ?? 'N/A'}, dispersion=${dispersionRatio ?? 'N/A'}).`,
        };
      }
      if (!pinnacleBenchmarkAvailable || pinnacleBenchmarkMatchedFixtures === 0) {
        return {
          state: 'BLOCKED_PINNACLE_BENCHMARK',
          reason: `NOT_APPROVED_FOR_PRODUCTION: ${market} passed statistical walk-forward (Brier=${brier}, 95% CI=[${ci95?.join(', ')}]), but has 0 matched historical Pinnacle no-vig benchmark fixtures in local archives.`,
        };
      }
      return {
        state: 'BLOCKED_HUMAN_APPROVAL',
        reason: `PROPOSED_FOR_REVIEW: ${market} passed all 5 statistical & Pinnacle benchmark proofs; awaiting explicit human approval for production promotion.`,
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

    // Candidate markets that passed all 5 proofs AND have live Pinnacle odds
    const candidateMarketsPassingAll5Proofs: MarketKey[] = [];
    if (ahAll5ProofsPass && ahFixturesWithOdds.length > 0) candidateMarketsPassingAll5Proofs.push('AH');
    if (ouAll5ProofsPass && ouFixturesWithOdds.length > 0) candidateMarketsPassingAll5Proofs.push('OU');

    let promotedInThisRun = false;
    let proposedInThisRun = false;
    let rolledBackInThisRun = false;

    if (isEpl) {
      // EPL is already ACTIVE in production
      for (const f of liveFixtures) {
        const res = ProductionPredictionEngine.evaluateFixture(f);
        smokeTestOutputs.push(res);
      }
      ahSmokePassed = true;
      ouSmokePassed = true;
    } else if (candidateMarketsPassingAll5Proofs.length > 0 && quotaDetection.state === 'QUOTA_AVAILABLE') {
      if (!explicitHumanApprovalGranted) {
        // H2 PROPOSE-ONLY MODE: Run non-mutating smoke check in SHADOW mode and emit proposal, NEVER promote to ACTIVE
        for (const f of liveFixtures) {
          const evalOut = ProductionPredictionEngine.evaluateFixture(f);
          const bttsM = evalOut.prediction.markets.btts;
          if (bttsM.verdict !== 'LEWATI') {
            throw new Error(`Smoke test invariant violation: BTTS verdict was ${bttsM.verdict} instead of LEWATI`);
          }
        }
        ahSmokePassed = candidateMarketsPassingAll5Proofs.includes('AH');
        ouSmokePassed = candidateMarketsPassingAll5Proofs.includes('OU');
        proposedInThisRun = true;
        promotedInThisRun = false;
      } else {
        // MANUAL_APPROVED_PROMOTION MODE (Requires explicitHumanApproval === true + ALLOW_MANUAL_LEAGUE_PROMOTION === 'true')
        activateLeagueMarkets(
          lid,
          candidateMarketsPassingAll5Proofs,
          `Provisional activation for manually approved smoke test (${candidateMarketsPassingAll5Proofs.join(' + ')})`,
          new Date().toISOString(),
          true
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

            if (bttsM.verdict !== 'LEWATI') {
              throw new Error(`Smoke test invariant violation: BTTS verdict was ${bttsM.verdict} instead of LEWATI`);
            }

            if (candidateMarketsPassingAll5Proofs.includes('AH') && f.pinnacleOdds?.ah) {
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

            if (candidateMarketsPassingAll5Proofs.includes('OU') && f.pinnacleOdds?.ou) {
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
            } else if (!ouAll5ProofsPass && f.pinnacleOdds?.ou) {
              if (ouM.verdict !== 'LEWATI') {
                throw new Error(`Uncalibrated OU market in ${lid} was not rejected (verdict=${ouM.verdict})`);
              }
            }
          }

          if (candidateMarketsPassingAll5Proofs.includes('AH') && ahFixturesWithOdds.length >= 2 && ahFairOddsSet.size < 2) {
            throw new Error(`Degenerate AH probabilities detected across ${ahFixturesWithOdds.length} fixtures in ${lid}`);
          }
          if (candidateMarketsPassingAll5Proofs.includes('OU') && ouFixturesWithOdds.length >= 2 && ouFairOddsSet.size < 2) {
            throw new Error(`Degenerate OU probabilities detected across ${ouFixturesWithOdds.length} fixtures in ${lid}`);
          }

          ahSmokePassed = candidateMarketsPassingAll5Proofs.includes('AH');
          ouSmokePassed = candidateMarketsPassingAll5Proofs.includes('OU');

          const verifiedMarkets: MarketKey[] = [];
          if (ahSmokePassed) verifiedMarkets.push('AH');
          if (ouSmokePassed) verifiedMarkets.push('OU');

          activateLeagueMarkets(
            lid,
            verifiedMarkets,
            `Manually approved promotion of ${verifiedMarkets.join(' + ')} after verified quota (${quotaDetection.requestCount}/${quotaDetection.requestLimit}), 5-proof validation, and 10-step smoke test.`,
            new Date().toISOString(),
            true
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
    }

    // ─── STEP 9 & 10: Finalize Market Readiness States & Blocker Reasons ────
    const resolveFinalMarketDetail = (
      market: MarketKey,
      statisticalPass: boolean,
      all5ProofsPass: boolean,
      brier: number | null,
      ci95: [number, number] | null,
      beats05Ci: boolean,
      logLoss: number | null,
      slope: number | null,
      fixturesWithOddsCount: number,
      smokePassed: boolean,
      layakCount: number,
      pantauCount: number,
      lewatiCount: number
    ): MarketEvaluationDetail => {
      const extraAhFields = market === 'AH'
        ? {
            ahFixedMinus05Brier,
            ahBalancedQuarterBrier,
          }
        : {};

      if (isEpl) {
        return {
          market,
          readinessState: 'ACTIVE',
          productionEnabled: true,
          modelValidated: true,
          proposedForHumanReview: false,
          brierScore: brier,
          brierCi95: ci95,
          beatsConstant05At95Ci: beats05Ci,
          ...extraAhFields,
          logLoss,
          calibrationSlope: slope,
          pinnacleBenchmarkAvailable,
          pinnacleBenchmarkMatchedFixtures,
          chronologicalWalkForwardVerified,
          liveFixturesWithOddsCount: fixturesWithOddsCount,
          smokeTestPassed: true,
          qualifyingLayakCount: layakCount,
          pantauCount,
          lewatiCount,
          blockerReason: null,
        };
      }

      if (!all5ProofsPass) {
        const blk = buildMarketBlockReason(market, statisticalPass, brier, ci95, beats05Ci, logLoss, slope);
        entry.market_readiness![market] = blk.state;
        entry.market_blockers![market] = blk.reason;
        return {
          market,
          readinessState: blk.state,
          productionEnabled: false,
          modelValidated: false,
          proposedForHumanReview: false,
          brierScore: brier,
          brierCi95: ci95,
          beatsConstant05At95Ci: beats05Ci,
          ...extraAhFields,
          logLoss,
          calibrationSlope: slope,
          pinnacleBenchmarkAvailable,
          pinnacleBenchmarkMatchedFixtures,
          chronologicalWalkForwardVerified,
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
          proposedForHumanReview: false,
          brierScore: brier,
          brierCi95: ci95,
          beatsConstant05At95Ci: beats05Ci,
          ...extraAhFields,
          logLoss,
          calibrationSlope: slope,
          pinnacleBenchmarkAvailable,
          pinnacleBenchmarkMatchedFixtures,
          chronologicalWalkForwardVerified,
          liveFixturesWithOddsCount: fixturesWithOddsCount,
          smokeTestPassed: false,
          qualifyingLayakCount: 0,
          pantauCount: 0,
          lewatiCount: 0,
          blockerReason: reason,
        };
      }

      if (explicitHumanApprovalGranted && smokePassed && entry.production_enabled_markets?.includes(market)) {
        entry.market_readiness![market] = 'ACTIVE';
        entry.market_blockers![market] = null;
        return {
          market,
          readinessState: 'ACTIVE',
          productionEnabled: true,
          modelValidated: true,
          proposedForHumanReview: false,
          brierScore: brier,
          brierCi95: ci95,
          beatsConstant05At95Ci: beats05Ci,
          ...extraAhFields,
          logLoss,
          calibrationSlope: slope,
          pinnacleBenchmarkAvailable,
          pinnacleBenchmarkMatchedFixtures,
          chronologicalWalkForwardVerified,
          liveFixturesWithOddsCount: fixturesWithOddsCount,
          smokeTestPassed: true,
          qualifyingLayakCount: layakCount,
          pantauCount,
          lewatiCount,
          blockerReason: null,
        };
      }

      if (!explicitHumanApprovalGranted && smokePassed) {
        const propReason = `PROPOSED_FOR_REVIEW: ${lid} ${market} passed all 5 proofs and live odds smoke check, but automatic promotion is disabled (PROPOSE_ONLY mode). Explicit human approval required.`;
        entry.market_readiness![market] = 'PROPOSED_FOR_REVIEW';
        entry.market_blockers![market] = propReason;
        return {
          market,
          readinessState: 'PROPOSED_FOR_REVIEW',
          productionEnabled: false,
          modelValidated: true,
          proposedForHumanReview: true,
          brierScore: brier,
          brierCi95: ci95,
          beatsConstant05At95Ci: beats05Ci,
          ...extraAhFields,
          logLoss,
          calibrationSlope: slope,
          pinnacleBenchmarkAvailable,
          pinnacleBenchmarkMatchedFixtures,
          chronologicalWalkForwardVerified,
          liveFixturesWithOddsCount: fixturesWithOddsCount,
          smokeTestPassed: true,
          qualifyingLayakCount: 0,
          pantauCount: 0,
          lewatiCount: 0,
          blockerReason: propReason,
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
          proposedForHumanReview: false,
          brierScore: brier,
          brierCi95: ci95,
          beatsConstant05At95Ci: beats05Ci,
          ...extraAhFields,
          logLoss,
          calibrationSlope: slope,
          pinnacleBenchmarkAvailable,
          pinnacleBenchmarkMatchedFixtures,
          chronologicalWalkForwardVerified,
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
        proposedForHumanReview: false,
        brierScore: brier,
        brierCi95: ci95,
        beatsConstant05At95Ci: beats05Ci,
        ...extraAhFields,
        logLoss,
        calibrationSlope: slope,
        pinnacleBenchmarkAvailable,
        pinnacleBenchmarkMatchedFixtures,
        chronologicalWalkForwardVerified,
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
      ahStatisticalPass,
      ahAll5ProofsPass,
      ahBrier,
      ahBrierCi95,
      ahBeats05Ci95,
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
      ouStatisticalPass,
      ouAll5ProofsPass,
      ouBrier,
      ouBrierCi95,
      ouBeats05Ci95,
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
        promotionMode,
        explicitHumanApprovalGranted,
        promotedInThisRun,
        proposedInThisRun,
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
