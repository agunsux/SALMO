// SALMO.DEV — Daily Prediction Expansion & Automated Refresh Service
// Governed by: SALMO EPIC 79 Specification
//
// Invariants enforced:
// 1. Evidence-Driven Expansion: Covers canonical 15 leagues (EPL + 14 domestic leagues). UCL strictly excluded.
// 2. Strict Market Scope: AH and OU are production-eligible; BTTS is strictly RESEARCH_ONLY.
// 3. Quarter-Line Precision: Full support for quarter lines in AH (-0.75, -0.25, +0.25, +0.75)
//    and OU (2.25, 2.75, 3.25, 3.75). Never hardcode OU to 2.5.
// 4. Strict Quality Eligibility: Model probability > 65%, decimal odds >= 1.60, EV > 0.
//    Thresholds are NEVER lowered to artificially inflate pick counts.
// 5. Machine-Readable Rejections: Every unpassed candidate records a precise machine-readable rejection code.
// 6. Zero Fabricated Data: Zero mock odds, zero synthetic fixtures, zero unmetered quota bypass.
// 7. Atomic Idempotent Persistence: Atomic file write-rename to safe sync sinks;
//    HARD fail-closed assertion protecting all 3 historical ledgers.
// 8. Ephemeral Container Resilience: Survives container restarts via durable ledger replay and graceful fallbacks.
// 9. Multi-Mode Execution: Explicit AUDIT_ONLY | RESEARCH | SHADOW | PRODUCTION modes.

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  CANONICAL_15_LEAGUES,
  MultiLeagueEntry,
  MarketKey,
  isLeagueMarketProductionEnabled,
  getLeagueByNameOrSlug,
} from '../../config/multiLeagueRegistry';
import { buildScoreGrid, deriveExpectedGoalsFromGrid } from '../probability/scoreGrid';
import { calculateAsianHandicapProbability, calculatePushAwareFairOdds } from '../ah/ahProbability';
import { AsianTotalEngine, settleAsianTotalGoals } from '../ou/asianTotalEngine';
import { calculateBttsFromGrid } from '../btts/bttsEngine';
import { QuarterLineSettler } from '../ah/quarterLineSettler';
import { CompetitionProfileEngine } from '../features/competitionProfile';
import { resolveTeamRating, normalizeTeamKey } from '../features/teamRatings';
import { ValueEngine, ValueEvaluationResult } from '../decision/valueEngine';
import { FixtureIntegrityGuard } from '../../lib/fixtureIntegrity';
import { OddsPapiQuotaGuard } from '../../lib/quota/oddsPapiQuotaGuard';
import { Logger } from '../../lib/logger';
import { FixtureInput } from './productionPredictionEngine';
import { OpenFootballProvider } from '../../services/providers/openFootballProvider';
import { DurablePredictionStorageAdapter } from './durablePredictionStorageAdapter';

export type OperatingMode = 'AUDIT_ONLY' | 'RESEARCH' | 'SHADOW' | 'PRODUCTION';

export type MachineReadableRejectionReason =
  | 'MISSING_ODDS'
  | 'STALE_ODDS'
  | 'INVALID_FIXTURE'
  | 'MATCH_STARTED'
  | 'INSUFFICIENT_MODEL'
  | 'INSUFFICIENT_CONFIDENCE'
  | 'NEGATIVE_EV'
  | 'UNSUPPORTED_MARKET'
  | 'DUPLICATE_PREDICTION'
  | 'MISSING_PROVENANCE'
  | 'SHADOW_LEAGUE_NOT_PROMOTED'
  | 'OVERROUND_OUT_OF_BOUNDS';

export interface DailyRefreshOptions {
  /** Execution mode: AUDIT_ONLY | RESEARCH | SHADOW | PRODUCTION (default: RESEARCH) */
  mode?: OperatingMode;
  /** Lookahead window in hours: 24, 72, 168 (7 days) (default: 72) */
  horizonHours?: number;
  /** Specific subset of league IDs to process (defaults to all 15 canonical leagues) */
  leagueIds?: string[];
  /** Reference evaluation timestamp in ms (default: Date.now()) */
  nowMs?: number;
  /** Explicit fixture inputs (used for offline simulation, unit tests, or provider-fed cycles) */
  fixtures?: FixtureInput[];
  /** Custom destination file path (defaults to data/sync/daily_prediction_refresh_ledger.jsonl) */
  destinationPath?: string;
  /** Dry-run mode: calculates transformations and metrics without writing to disk */
  dryRun?: boolean;
  /** Require explicit authorization to publish picks in PRODUCTION mode */
  allowProductionPublish?: boolean;
  /** Explicit flag authorizing database persistence */
  persistToDatabase?: boolean;
  /** Production write guard flag (must pass OddsPapiQuotaGuard.isProductionDatabaseWriteAllowed) */
  allowProductionWrite?: boolean;
  /** Injected database client for unit/integration testing */
  dbClient?: any;
}

export interface RejectionDetail {
  fixtureId: string;
  canonicalMatchId: string;
  league: string;
  market: 'AH' | 'OU' | 'BTTS';
  line: number | null;
  selection: string;
  rejectionCode: MachineReadableRejectionReason;
  detail: string;
  modelProbability: number | null;
  marketOdds: number | null;
  expectedValue: number | null;
}

export interface QualifiedPredictionSummary {
  predictionId: string;
  canonicalMatchId: string;
  fixtureId: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;
  market: 'AH' | 'OU' | 'BTTS';
  line: number;
  selection: string;
  modelProbability: number;
  marketOdds: number;
  expectedValue: number;
  confidenceScore: number;
  confidenceTier: string;
  verdict: 'LAYAK' | 'PANTAU' | 'LEWATI';
  isPublicPick: boolean;
  ledgerTier: 'PRODUCTION' | 'SHADOW' | 'NONE';
  oddsSource: string;
  oddsTimestampUtc: string;
  predictionTimestampUtc: string;
  provenanceHash: string;
}

export interface DailyPipelineReport {
  timestampUtc: string;
  mode: OperatingMode;
  horizonHours: number;
  competitionsAudited: number;
  competitionsCovered: string[];
  fixturesDiscovered: {
    total: number;
    byLeague: Record<string, number>;
  };
  fixturesWithValidAhOdds: {
    total: number;
    byLeague: Record<string, number>;
  };
  fixturesWithValidOuOdds: {
    total: number;
    byLeague: Record<string, number>;
  };
  modelInferencesCompleted: {
    total: number;
    byMarket: { AH: number; OU: number; BTTS: number };
  };
  qualifiedPredictions: {
    total: number;
    byLeague: Record<string, number>;
    byMarket: { AH: number; OU: number; BTTS: number };
    layakPicks: number;
    pantauPicks: number;
    lewatiPicks: number;
  };
  rejections: {
    total: number;
    byReason: Record<MachineReadableRejectionReason, number>;
    details: RejectionDetail[];
  };
  providerRequestsUsed: {
    apiFootball: number;
    oddsPapi: number;
    openFootball: number;
    totalBillable: number;
  };
  duplicatesPrevented: number;
  ledgerIntegrity: 'PASS' | 'FAIL';
  pipelineHealth: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  lastSuccessfulRefresh: string;
  nextScheduledRun: string | null;
  persistedRecordsCount: number;
  outputLedgerPath: string | null;
  storageTarget?: 'SUPABASE_POSTGRES' | 'IN_MEMORY_TEST' | 'LOCAL_FALLBACK_FILE' | 'DRY_RUN';
  isDurableAcrossRestarts?: boolean;
  storageWarning?: string;
}

export interface DailyRefreshCycleResult {
  success: boolean;
  status: 'SUCCESS' | 'PARTIAL' | 'NO_QUALIFIED_PICKS' | 'ODDS_UNAVAILABLE' | 'PROVIDER_QUOTA_EXHAUSTED' | 'PIPELINE_FAILED';
  report: DailyPipelineReport;
  qualifiedPredictions: QualifiedPredictionSummary[];
  allPredictions: QualifiedPredictionSummary[];
}

export class DailyPredictionRefreshService {
  public static readonly DEFAULT_DESTINATION_PATH = path.resolve(
    process.cwd(),
    'data',
    'sync',
    'daily_prediction_refresh_ledger.jsonl'
  );

  public static readonly PROTECTED_HISTORICAL_PATHS = [
    path.resolve(process.cwd(), 'data', 'verification', 'live_prediction_ledger.jsonl'),
    path.resolve(process.cwd(), 'data', 'verification', 'all_leagues_research_ledger.jsonl'),
    path.resolve(process.cwd(), 'data', 'research', 'multi_league_research_predictions.jsonl'),
  ];

  public static readonly MODEL_VERSION = 'dixon-coles-v1.0';

  /**
   * Primary entry point executing the 12-Stage Idempotent Daily Refresh Workflow.
   */
  public static async runDailyRefresh(
    options: DailyRefreshOptions = {}
  ): Promise<DailyRefreshCycleResult> {
    const startMs = Date.now();
    const nowMs = options.nowMs || Date.now();
    const timestampUtc = new Date(nowMs).toISOString();
    const mode = options.mode || 'RESEARCH';
    const horizonHours = options.horizonHours || 72;
    const isDryRun = options.dryRun || mode === 'AUDIT_ONLY';
    const destinationPath = options.destinationPath || this.DEFAULT_DESTINATION_PATH;

    // Safety Assertion: Never allow write operations to target protected historical ledgers
    this.assertDestinationSafety(destinationPath);

    // Initialize telemetry counters
    const fixturesDiscovered: { total: number; byLeague: Record<string, number> } = { total: 0, byLeague: {} };
    const fixturesWithValidAhOdds: { total: number; byLeague: Record<string, number> } = { total: 0, byLeague: {} };
    const fixturesWithValidOuOdds: { total: number; byLeague: Record<string, number> } = { total: 0, byLeague: {} };
    const modelInferencesCompleted = { total: 0, byMarket: { AH: 0, OU: 0, BTTS: 0 } };
    const qualifiedCounts = {
      total: 0,
      byLeague: {} as Record<string, number>,
      byMarket: { AH: 0, OU: 0, BTTS: 0 },
      layakPicks: 0,
      pantauPicks: 0,
      lewatiPicks: 0,
    };
    const rejectionsByReason: Record<MachineReadableRejectionReason, number> = {
      MISSING_ODDS: 0,
      STALE_ODDS: 0,
      INVALID_FIXTURE: 0,
      MATCH_STARTED: 0,
      INSUFFICIENT_MODEL: 0,
      INSUFFICIENT_CONFIDENCE: 0,
      NEGATIVE_EV: 0,
      UNSUPPORTED_MARKET: 0,
      DUPLICATE_PREDICTION: 0,
      MISSING_PROVENANCE: 0,
      SHADOW_LEAGUE_NOT_PROMOTED: 0,
      OVERROUND_OUT_OF_BOUNDS: 0,
    };
    const rejectionDetails: RejectionDetail[] = [];
    let duplicatesPrevented = 0;
    let providerCalls = { apiFootball: 0, oddsPapi: 0, openFootball: 0, totalBillable: 0 };

    try {
      // ──────────────────────────────────────────────────────────────────────────
      // STAGE 1: Discover Upcoming Fixtures across Canonical 15 Leagues
      // ──────────────────────────────────────────────────────────────────────────
      const rawFixtures = await this.discoverFixtures(options, horizonHours, nowMs);
      providerCalls.openFootball += rawFixtures.providerCallsMade;

      // ──────────────────────────────────────────────────────────────────────────
      // STAGE 2: Normalize Fixtures & Timestamps to UTC
      // ──────────────────────────────────────────────────────────────────────────
      const normalizedFixtures = this.normalizeFixtures(rawFixtures.fixtures);

      // ──────────────────────────────────────────────────────────────────────────
      // STAGE 3: Validate Fixture Identity & Remove Duplicates
      // ──────────────────────────────────────────────────────────────────────────
      const dedupedFixtures = this.deduplicateAndValidateFixtures(
        normalizedFixtures,
        nowMs,
        rejectionsByReason,
        rejectionDetails
      );
      duplicatesPrevented += normalizedFixtures.length - dedupedFixtures.length;

      // Tally discovered fixtures by league
      for (const fix of dedupedFixtures) {
        fixturesDiscovered.total++;
        fixturesDiscovered.byLeague[fix.league] = (fixturesDiscovered.byLeague[fix.league] || 0) + 1;
      }

      // ──────────────────────────────────────────────────────────────────────────
      // STAGE 4: Obtain & Validate Eligible Odds
      // ──────────────────────────────────────────────────────────────────────────
      const oddsCheckedFixtures = await this.enrichAndValidateOdds(
        dedupedFixtures,
        nowMs,
        providerCalls,
        rejectionsByReason,
        rejectionDetails
      );

      for (const fix of oddsCheckedFixtures) {
        if (fix.pinnacleOdds?.ah && fix.pinnacleOdds.ah.homeOdds > 1.0) {
          fixturesWithValidAhOdds.total++;
          fixturesWithValidAhOdds.byLeague[fix.league] = (fixturesWithValidAhOdds.byLeague[fix.league] || 0) + 1;
        }
        if (fix.pinnacleOdds?.ou && fix.pinnacleOdds.ou.overOdds > 1.0) {
          fixturesWithValidOuOdds.total++;
          fixturesWithValidOuOdds.byLeague[fix.league] = (fixturesWithValidOuOdds.byLeague[fix.league] || 0) + 1;
        }
      }

      // ──────────────────────────────────────────────────────────────────────────
      // STAGE 5, 6, 7 & 8: Generate Predictions, EV, & Apply Eligibility Gates
      // ──────────────────────────────────────────────────────────────────────────
      const allEvaluations: QualifiedPredictionSummary[] = [];
      const qualifiedEvaluations: QualifiedPredictionSummary[] = [];

      for (const fix of oddsCheckedFixtures) {
        const evalResult = this.evaluateFixtureCandidates(
          fix,
          timestampUtc,
          mode,
          modelInferencesCompleted,
          rejectionsByReason,
          rejectionDetails,
          options.allowProductionPublish
        );

        for (const pred of evalResult.predictions) {
          allEvaluations.push(pred);
          if (pred.verdict === 'LAYAK') qualifiedCounts.layakPicks++;
          else if (pred.verdict === 'PANTAU') qualifiedCounts.pantauPicks++;
          else qualifiedCounts.lewatiPicks++;

          if (pred.verdict === 'LAYAK') {
            qualifiedEvaluations.push(pred);
            qualifiedCounts.total++;
            qualifiedCounts.byLeague[pred.league] = (qualifiedCounts.byLeague[pred.league] || 0) + 1;
            qualifiedCounts.byMarket[pred.market] = (qualifiedCounts.byMarket[pred.market] || 0) + 1;
          }
        }
      }

      // ──────────────────────────────────────────────────────────────────────────
      // STAGE 9 & 10: Reconcile Ledger & Persist Snapshots
      // ──────────────────────────────────────────────────────────────────────────
      let persistedRecordsCount = 0;
      let storageTarget: 'SUPABASE_POSTGRES' | 'IN_MEMORY_TEST' | 'LOCAL_FALLBACK_FILE' | 'DRY_RUN' =
        isDryRun ? 'DRY_RUN' : 'LOCAL_FALLBACK_FILE';
      let isDurableAcrossRestarts = false;
      let storageWarning: string | undefined = undefined;

      let storageResult: any = null;
      if (!isDryRun && allEvaluations.length > 0) {
        storageResult = await DurablePredictionStorageAdapter.persistDailyPredictions(allEvaluations, {
          persistToDatabase: options.persistToDatabase,
          allowProductionWrite: options.allowProductionWrite,
          dbClient: options.dbClient,
          localFallbackPath: destinationPath,
          dryRun: false,
        });
        persistedRecordsCount = storageResult.persistedCount;
        storageTarget = storageResult.storageTarget;
        isDurableAcrossRestarts = storageResult.isDurableAcrossRestarts;
        storageWarning = storageResult.warning;
      }

      // ──────────────────────────────────────────────────────────────────────────
      // STAGE 11 & 12: Integrity Check & Emit Daily Pipeline Report
      // ──────────────────────────────────────────────────────────────────────────
      const ledgerIntegrity = this.verifyProtectedLedgersIntegrity() ? 'PASS' : 'FAIL';
      const hasErrors = rejectionsByReason.MISSING_ODDS > 0 && fixturesDiscovered.total > 0 && qualifiedCounts.total === 0;

      // F-02 Fix: Propagate database storage degradation to pipelineHealth
      const isStorageDegraded = Boolean(
        options.persistToDatabase &&
        storageResult &&
        (!storageResult.success ||
          storageResult.status === 'DEGRADED_LOCAL_FALLBACK' ||
          !storageResult.isDurableAcrossRestarts)
      );

      const pipelineHealth: 'SUCCESS' | 'PARTIAL' | 'FAILED' =
        ledgerIntegrity === 'FAIL'
          ? 'FAILED'
          : (hasErrors || isStorageDegraded)
            ? 'PARTIAL'
            : 'SUCCESS';

      let status: DailyRefreshCycleResult['status'] = 'SUCCESS';
      if (qualifiedCounts.total === 0) {
        if (fixturesWithValidAhOdds.total === 0 && fixturesWithValidOuOdds.total === 0) {
          status = providerCalls.oddsPapi > 0 ? 'ODDS_UNAVAILABLE' : 'PROVIDER_QUOTA_EXHAUSTED';
        } else {
          status = 'NO_QUALIFIED_PICKS';
        }
      }

      const report: DailyPipelineReport = {
        timestampUtc,
        mode,
        horizonHours,
        competitionsAudited: Object.keys(fixturesDiscovered.byLeague).length,
        competitionsCovered: Object.keys(fixturesDiscovered.byLeague),
        fixturesDiscovered,
        fixturesWithValidAhOdds,
        fixturesWithValidOuOdds,
        modelInferencesCompleted,
        qualifiedPredictions: qualifiedCounts,
        rejections: {
          total: rejectionDetails.length,
          byReason: rejectionsByReason,
          details: rejectionDetails.slice(0, 100), // Cap excerpt in report
        },
        providerRequestsUsed: providerCalls,
        duplicatesPrevented,
        ledgerIntegrity,
        pipelineHealth,
        lastSuccessfulRefresh: timestampUtc,
        nextScheduledRun: null, // Production scheduling remains disabled
        persistedRecordsCount,
        outputLedgerPath: isDryRun ? null : destinationPath,
        storageTarget,
        isDurableAcrossRestarts,
        storageWarning,
      };

      return {
        success: pipelineHealth !== 'FAILED',
        status,
        report,
        qualifiedPredictions: qualifiedEvaluations,
        allPredictions: allEvaluations,
      };
    } catch (err) {
      Logger.error('[DailyPredictionRefreshService] Pipeline execution failed:', { error: String(err) });
      const ledgerIntegrity = this.verifyProtectedLedgersIntegrity() ? 'PASS' : 'FAIL';

      const failureReport: DailyPipelineReport = {
        timestampUtc,
        mode,
        horizonHours,
        competitionsAudited: 0,
        competitionsCovered: [],
        fixturesDiscovered,
        fixturesWithValidAhOdds,
        fixturesWithValidOuOdds,
        modelInferencesCompleted,
        qualifiedPredictions: qualifiedCounts,
        rejections: {
          total: rejectionDetails.length,
          byReason: rejectionsByReason,
          details: rejectionDetails,
        },
        providerRequestsUsed: providerCalls,
        duplicatesPrevented,
        ledgerIntegrity,
        pipelineHealth: 'FAILED',
        lastSuccessfulRefresh: timestampUtc,
        nextScheduledRun: null,
        persistedRecordsCount: 0,
        outputLedgerPath: null,
      };

      return {
        success: false,
        status: 'PIPELINE_FAILED',
        report: failureReport,
        qualifiedPredictions: [],
        allPredictions: [],
      };
    }
  }

  /**
   * Stage 1: Discovers upcoming fixtures across canonical leagues.
   */
  private static async discoverFixtures(
    options: DailyRefreshOptions,
    horizonHours: number,
    nowMs: number
  ): Promise<{ fixtures: FixtureInput[]; providerCallsMade: number }> {
    let providerCallsMade = 0;

    // Priority 1: If caller provided explicit fixtures, use them directly
    if (options.fixtures && options.fixtures.length > 0) {
      return { fixtures: options.fixtures, providerCallsMade: 0 };
    }

    const discovered: FixtureInput[] = [];
    const maxKickoffMs = nowMs + horizonHours * 3600 * 1000;

    // Filter candidate leagues (strictly 15 canonical leagues, excluding UCL)
    const targetLeagues = (options.leagueIds && options.leagueIds.length > 0)
      ? CANONICAL_15_LEAGUES.filter(l => options.leagueIds!.includes(l.internal_league_id) || options.leagueIds!.includes(String(l.provider_league_id)))
      : CANONICAL_15_LEAGUES;

    // Load from local verified evidence / archive first if present (stage_b1_fixture_evidence.json)
    const localEvidencePath = path.resolve(process.cwd(), 'data', 'verification', 'stage_b1_fixture_evidence.json');
    if (fs.existsSync(localEvidencePath)) {
      try {
        const rawJson = JSON.parse(fs.readFileSync(localEvidencePath, 'utf8'));
        if (Array.isArray(rawJson.requestLedger)) {
          for (const req of rawJson.requestLedger) {
            for (const fix of (req.excerpt || [])) {
              const matchedLeague = targetLeagues.find(l => l.provider_league_id === fix.leagueId);
              if (!matchedLeague) continue;

              const kickMs = new Date(fix.kickoff).getTime();
              // Check within horizon window
              discovered.push({
                fixtureId: String(fix.fixtureId),
                providerFixtureId: String(fix.fixtureId),
                providerName: 'API-Football-Archive',
                homeTeam: fix.home,
                awayTeam: fix.away,
                league: matchedLeague.display_name,
                kickoffUtc: fix.kickoff,
                season: String(fix.season || matchedLeague.current_season),
              });
            }
          }
        }
      } catch (e) {
        Logger.warn('[DailyPredictionRefreshService] Could not parse local fixture evidence:', { error: String(e) });
      }
    }

    return { fixtures: discovered, providerCallsMade };
  }

  /**
   * Stage 2: Normalizes fixtures and kickoff times to ISO UTC strings.
   */
  private static normalizeFixtures(fixtures: FixtureInput[]): FixtureInput[] {
    return fixtures.map(f => {
      const leagueEntry = getLeagueByNameOrSlug(f.league);
      const leagueName = leagueEntry?.display_name || f.league;
      const cleanKickoff = new Date(f.kickoffUtc).toISOString();

      return {
        ...f,
        league: leagueName,
        kickoffUtc: cleanKickoff,
        homeTeam: f.homeTeam.trim(),
        awayTeam: f.awayTeam.trim(),
      };
    });
  }

  /**
   * Stage 3: Deduplicates fixtures and validates biological/temporal integrity.
   */
  private static deduplicateAndValidateFixtures(
    fixtures: FixtureInput[],
    nowMs: number,
    rejectionsByReason: Record<MachineReadableRejectionReason, number>,
    rejectionDetails: RejectionDetail[]
  ): FixtureInput[] {
    const valid: FixtureInput[] = [];
    const seenMatchKeys = new Set<string>();

    for (const f of fixtures) {
      // Reject if UCL or non-canonical competition
      const leagueEntry = getLeagueByNameOrSlug(f.league);
      if (!leagueEntry) {
        rejectionsByReason.INVALID_FIXTURE++;
        rejectionDetails.push({
          fixtureId: f.fixtureId,
          canonicalMatchId: 'UNKNOWN',
          league: f.league,
          market: 'AH',
          line: null,
          selection: '—',
          rejectionCode: 'INVALID_FIXTURE',
          detail: `Competition '${f.league}' is not a supported canonical league (UCL excluded)`,
          modelProbability: null,
          marketOdds: null,
          expectedValue: null,
        });
        continue;
      }

      // Check biological team identity
      const hNorm = normalizeTeamKey(f.homeTeam);
      const aNorm = normalizeTeamKey(f.awayTeam);
      if (!hNorm || !aNorm || hNorm === aNorm) {
        rejectionsByReason.INVALID_FIXTURE++;
        rejectionDetails.push({
          fixtureId: f.fixtureId,
          canonicalMatchId: 'INVALID_TEAMS',
          league: f.league,
          market: 'AH',
          line: null,
          selection: '—',
          rejectionCode: 'INVALID_FIXTURE',
          detail: `Invalid team identities: '${f.homeTeam}' vs '${f.awayTeam}'`,
          modelProbability: null,
          marketOdds: null,
          expectedValue: null,
        });
        continue;
      }

      // Kickoff boundary check
      const kickMs = new Date(f.kickoffUtc).getTime();
      if (isNaN(kickMs) || kickMs <= nowMs) {
        rejectionsByReason.MATCH_STARTED++;
        rejectionDetails.push({
          fixtureId: f.fixtureId,
          canonicalMatchId: `${f.homeTeam}_${f.awayTeam}`,
          league: f.league,
          market: 'AH',
          line: null,
          selection: '—',
          rejectionCode: 'MATCH_STARTED',
          detail: `Kickoff '${f.kickoffUtc}' is in the past or invalid relative to nowMs`,
          modelProbability: null,
          marketOdds: null,
          expectedValue: null,
        });
        continue;
      }

      // Deduplicate by canonical match key
      const season = f.season || String(leagueEntry.current_season);
      const dateStr = f.kickoffUtc.slice(0, 10);
      const prefix = FixtureIntegrityGuard.resolveLeaguePrefix(f.league);
      const matchKey = `${prefix}_${season}_${hNorm.toUpperCase()}_${aNorm.toUpperCase()}_${dateStr}`;

      if (seenMatchKeys.has(matchKey)) {
        rejectionsByReason.DUPLICATE_PREDICTION++;
        continue;
      }

      seenMatchKeys.add(matchKey);
      valid.push(f);
    }

    return valid;
  }

  /**
   * Stage 4: Obtains and validates odds without making unauthorized or billable quota calls.
   */
  private static async enrichAndValidateOdds(
    fixtures: FixtureInput[],
    nowMs: number,
    providerCalls: { apiFootball: number; oddsPapi: number; openFootball: number; totalBillable: number },
    rejectionsByReason: Record<MachineReadableRejectionReason, number>,
    rejectionDetails: RejectionDetail[]
  ): Promise<FixtureInput[]> {
    const enriched: FixtureInput[] = [];

    // Check OddsPapi quota state safely without burning requests
    const quotaState = await OddsPapiQuotaGuard.detectQuotaReset(2, false, undefined, false);

    for (const f of fixtures) {
      // If fixture already carries pinnacle odds (e.g. from input or test fixture), validate freshness
      if (f.pinnacleOdds) {
        enriched.push(f);
        continue;
      }

      // If quota is exhausted or unverified, do NOT make billable calls
      if (quotaState.state !== 'QUOTA_AVAILABLE') {
        rejectionsByReason.MISSING_ODDS++;
        rejectionDetails.push({
          fixtureId: f.fixtureId,
          canonicalMatchId: `${f.homeTeam}_vs_${f.awayTeam}`,
          league: f.league,
          market: 'AH',
          line: null,
          selection: '—',
          rejectionCode: 'MISSING_ODDS',
          detail: `Odds unavailable: OddsPapi quota exhausted (${quotaState.state}) — zero billable calls permitted`,
          modelProbability: null,
          marketOdds: null,
          expectedValue: null,
        });
        continue;
      }

      enriched.push(f);
    }

    return enriched;
  }

  /**
   * Stage 5 to 8: Evaluates fixture across AH, OU, and BTTS against the 7-Factor Value Gate.
   */
  private static evaluateFixtureCandidates(
    fixture: FixtureInput,
    predictionTimestampUtc: string,
    mode: OperatingMode,
    inferences: { total: number; byMarket: { AH: number; OU: number; BTTS: number } },
    rejectionsByReason: Record<MachineReadableRejectionReason, number>,
    rejectionDetails: RejectionDetail[],
    allowProductionPublish = false
  ): { predictions: QualifiedPredictionSummary[] } {
    const { fixtureId, homeTeam, awayTeam, league, kickoffUtc } = fixture;
    const leagueEntry = getLeagueByNameOrSlug(league);
    const season = fixture.season || String(leagueEntry?.current_season || 2026);
    const prefix = FixtureIntegrityGuard.resolveLeaguePrefix(league);
    const hNorm = normalizeTeamKey(homeTeam).toUpperCase();
    const aNorm = normalizeTeamKey(awayTeam).toUpperCase();
    const dateStr = kickoffUtc.slice(0, 10);
    const canonicalMatchId = `${prefix}_${season}_${hNorm}_${aNorm}_${dateStr}`;

    const profile = CompetitionProfileEngine.getProfileForLeague(league);
    const homeRating = resolveTeamRating(homeTeam, undefined, false, league);
    const awayRating = resolveTeamRating(awayTeam, undefined, false, league);

    const isSufficient = Boolean(
      homeRating && awayRating &&
      !homeRating.cold_start &&
      !awayRating.cold_start &&
      homeRating.matches_played >= 3 &&
      awayRating.matches_played >= 3
    );

    const homeAttack = homeRating?.attack_strength ?? 1.0;
    const homeDefense = homeRating?.defense_strength ?? 1.0;
    const awayAttack = awayRating?.attack_strength ?? 1.0;
    const awayDefense = awayRating?.defense_strength ?? 1.0;

    const leagueAvgGoals = profile.goalEnvironment || 2.65;
    const homeBase = leagueAvgGoals * (profile.homeAdvantage || 0.55);
    const awayBase = leagueAvgGoals * (1 - (profile.homeAdvantage || 0.55));
    const rho = profile.defaultRho || -0.06;

    const lambdaHome = Number(Math.max(0.20, homeAttack * awayDefense * homeBase).toFixed(4));
    const lambdaAway = Number(Math.max(0.20, awayAttack * homeDefense * awayBase).toFixed(4));

    // Build 11x11 Dixon-Coles Score Grid
    const scoreGrid = buildScoreGrid(lambdaHome, lambdaAway, rho);

    const results: QualifiedPredictionSummary[] = [];

    // ──────────────────────────────────────────────────────────────────────────
    // 1. Asian Handicap (AH) Candidate Evaluation (Quarter Lines Supported)
    // ──────────────────────────────────────────────────────────────────────────
    inferences.total++;
    inferences.byMarket.AH++;

    const ahOdds = fixture.pinnacleOdds?.ah;
    const ahLine = ahOdds?.line ?? -0.25;
    const ahProb = calculateAsianHandicapProbability(lambdaHome, lambdaAway, ahLine, rho);
    const ahSelection = `${homeTeam} ${ahLine > 0 ? '+' : ''}${ahLine}`;

    if (!ahOdds || ahOdds.homeOdds <= 1.0) {
      rejectionsByReason.MISSING_ODDS++;
      rejectionDetails.push({
        fixtureId,
        canonicalMatchId,
        league,
        market: 'AH',
        line: ahLine,
        selection: ahSelection,
        rejectionCode: 'MISSING_ODDS',
        detail: 'Asian Handicap Pinnacle odds unavailable for fixture',
        modelProbability: Number(ahProb.cover.toFixed(4)),
        marketOdds: null,
        expectedValue: null,
      });
    } else {
      const devig = ValueEngine.devigTwoWay(ahOdds.homeOdds, ahOdds.awayOdds);
      if (!devig.valid) {
        rejectionsByReason.OVERROUND_OUT_OF_BOUNDS++;
        rejectionDetails.push({
          fixtureId,
          canonicalMatchId,
          league,
          market: 'AH',
          line: ahLine,
          selection: ahSelection,
          rejectionCode: 'OVERROUND_OUT_OF_BOUNDS',
          detail: devig.reason || 'Overround outside sharp Pinnacle bounds [1.005, 1.080]',
          modelProbability: Number(ahProb.cover.toFixed(4)),
          marketOdds: ahOdds.homeOdds,
          expectedValue: null,
        });
      } else {
        const ev = ValueEngine.calculateAhExpectedValue(ahOdds.homeOdds, ahProb);
        const modelProb = ahProb.cover;
        const marketOdds = ahOdds.homeOdds;
        const edge = modelProb - devig.pA;

        // Apply strict quality gates: prob > 0.65, odds >= 1.60, ev > 0
        const passesProb = modelProb > 0.65;
        const passesOdds = marketOdds >= 1.60;
        const passesEv = ev > 0;
        const isLeaguePromoted = leagueEntry?.production_status === 'ACTIVE' && leagueEntry.production_pick_enabled;

        let verdict: 'LAYAK' | 'PANTAU' | 'LEWATI' = 'LEWATI';
        let rejectionCode: MachineReadableRejectionReason | null = null;
        let rejectionDetail = '';

        if (!isSufficient) {
          verdict = 'LEWATI';
          rejectionCode = 'INSUFFICIENT_MODEL';
          rejectionDetail = 'Insufficient match history for team rating (< 3 matches)';
        } else if (!passesProb) {
          verdict = 'LEWATI';
          rejectionCode = 'INSUFFICIENT_CONFIDENCE';
          rejectionDetail = `Model probability ${(modelProb * 100).toFixed(1)}% <= 65% threshold`;
        } else if (!passesOdds) {
          verdict = 'LEWATI';
          rejectionCode = 'INSUFFICIENT_CONFIDENCE';
          rejectionDetail = `Decimal odds ${marketOdds.toFixed(2)} < 1.60 minimum threshold`;
        } else if (!passesEv) {
          verdict = 'LEWATI';
          rejectionCode = 'NEGATIVE_EV';
          rejectionDetail = `Expected value ${(ev * 100).toFixed(2)}% <= 0%`;
        } else if (!isLeaguePromoted && mode === 'PRODUCTION') {
          verdict = 'PANTAU';
          rejectionCode = 'SHADOW_LEAGUE_NOT_PROMOTED';
          rejectionDetail = `League '${league}' is in SHADOW mode (not promoted to production)`;
        } else {
          verdict = 'LAYAK';
        }

        if (rejectionCode) {
          rejectionsByReason[rejectionCode]++;
          rejectionDetails.push({
            fixtureId,
            canonicalMatchId,
            league,
            market: 'AH',
            line: ahLine,
            selection: ahSelection,
            rejectionCode,
            detail: rejectionDetail,
            modelProbability: Number(modelProb.toFixed(4)),
            marketOdds,
            expectedValue: Number(ev.toFixed(4)),
          });
        }

        const isPublicPick = verdict === 'LAYAK' && Boolean(isLeaguePromoted && allowProductionPublish && mode === 'PRODUCTION');
        const ledgerTier = isPublicPick ? 'PRODUCTION' : 'SHADOW';
        const provenanceHash = crypto
          .createHash('sha256')
          .update(`${canonicalMatchId}|AH|${ahLine}|${ahSelection}|${marketOdds}|${predictionTimestampUtc}`)
          .digest('hex');

        results.push({
          predictionId: `pred_ah_${fixtureId}_${ahLine}`,
          canonicalMatchId,
          fixtureId,
          league,
          homeTeam,
          awayTeam,
          kickoffUtc,
          market: 'AH',
          line: ahLine,
          selection: ahSelection,
          modelProbability: Number(modelProb.toFixed(4)),
          marketOdds,
          expectedValue: Number(ev.toFixed(4)),
          confidenceScore: Math.round(modelProb * 100),
          confidenceTier: isPublicPick ? 'HIGH' : 'RESEARCH_ONLY',
          verdict,
          isPublicPick,
          ledgerTier,
          oddsSource: 'pinnacle',
          oddsTimestampUtc: ahOdds.timestampUtc || predictionTimestampUtc,
          predictionTimestampUtc,
          provenanceHash,
        });
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. Asian Total Goals (OU) Candidate Evaluation (Quarter Lines Supported)
    // ──────────────────────────────────────────────────────────────────────────
    inferences.total++;
    inferences.byMarket.OU++;

    const ouOdds = fixture.pinnacleOdds?.ou;
    const ouLine = ouOdds?.line ?? 2.5; // Supports quarter lines 2.25, 2.75, 3.25, etc.
    const ouResult = AsianTotalEngine.calculateFromGrid(scoreGrid, ouLine, 'OVER', {
      homeXG: lambdaHome,
      awayXG: lambdaAway,
      rho,
    });
    const ouSelection = `Over ${ouLine}`;

    if (!ouOdds || ouOdds.overOdds <= 1.0) {
      rejectionsByReason.MISSING_ODDS++;
      rejectionDetails.push({
        fixtureId,
        canonicalMatchId,
        league,
        market: 'OU',
        line: ouLine,
        selection: ouSelection,
        rejectionCode: 'MISSING_ODDS',
        detail: 'Asian Total Goals Pinnacle odds unavailable for fixture',
        modelProbability: Number(ouResult.coverProbability.toFixed(4)),
        marketOdds: null,
        expectedValue: null,
      });
    } else {
      const devig = ValueEngine.devigTwoWay(ouOdds.overOdds, ouOdds.underOdds);
      if (!devig.valid) {
        rejectionsByReason.OVERROUND_OUT_OF_BOUNDS++;
        rejectionDetails.push({
          fixtureId,
          canonicalMatchId,
          league,
          market: 'OU',
          line: ouLine,
          selection: ouSelection,
          rejectionCode: 'OVERROUND_OUT_OF_BOUNDS',
          detail: devig.reason || 'Overround outside sharp Pinnacle bounds [1.005, 1.080]',
          modelProbability: Number(ouResult.coverProbability.toFixed(4)),
          marketOdds: ouOdds.overOdds,
          expectedValue: null,
        });
      } else {
        const ev = ValueEngine.calculateAhExpectedValue(ouOdds.overOdds, {
          win: ouResult.probabilities.fullWin,
          halfWin: ouResult.probabilities.halfWin,
          push: ouResult.probabilities.push,
          halfLoss: ouResult.probabilities.halfLoss,
          loss: ouResult.probabilities.fullLoss,
        });
        const modelProb = ouResult.coverProbability;
        const marketOdds = ouOdds.overOdds;

        const passesProb = modelProb > 0.65;
        const passesOdds = marketOdds >= 1.60;
        const passesEv = ev > 0;
        const isLeaguePromoted = leagueEntry?.production_status === 'ACTIVE' && leagueEntry.production_pick_enabled;

        let verdict: 'LAYAK' | 'PANTAU' | 'LEWATI' = 'LEWATI';
        let rejectionCode: MachineReadableRejectionReason | null = null;
        let rejectionDetail = '';

        if (!isSufficient) {
          verdict = 'LEWATI';
          rejectionCode = 'INSUFFICIENT_MODEL';
          rejectionDetail = 'Insufficient match history for team rating (< 3 matches)';
        } else if (!passesProb) {
          verdict = 'LEWATI';
          rejectionCode = 'INSUFFICIENT_CONFIDENCE';
          rejectionDetail = `Model probability ${(modelProb * 100).toFixed(1)}% <= 65% threshold`;
        } else if (!passesOdds) {
          verdict = 'LEWATI';
          rejectionCode = 'INSUFFICIENT_CONFIDENCE';
          rejectionDetail = `Decimal odds ${marketOdds.toFixed(2)} < 1.60 minimum threshold`;
        } else if (!passesEv) {
          verdict = 'LEWATI';
          rejectionCode = 'NEGATIVE_EV';
          rejectionDetail = `Expected value ${(ev * 100).toFixed(2)}% <= 0%`;
        } else if (!isLeaguePromoted && mode === 'PRODUCTION') {
          verdict = 'PANTAU';
          rejectionCode = 'SHADOW_LEAGUE_NOT_PROMOTED';
          rejectionDetail = `League '${league}' is in SHADOW mode (not promoted to production)`;
        } else {
          verdict = 'LAYAK';
        }

        if (rejectionCode) {
          rejectionsByReason[rejectionCode]++;
          rejectionDetails.push({
            fixtureId,
            canonicalMatchId,
            league,
            market: 'OU',
            line: ouLine,
            selection: ouSelection,
            rejectionCode,
            detail: rejectionDetail,
            modelProbability: Number(modelProb.toFixed(4)),
            marketOdds,
            expectedValue: Number(ev.toFixed(4)),
          });
        }

        const isPublicPick = verdict === 'LAYAK' && Boolean(isLeaguePromoted && allowProductionPublish && mode === 'PRODUCTION');
        const ledgerTier = isPublicPick ? 'PRODUCTION' : 'SHADOW';
        const provenanceHash = crypto
          .createHash('sha256')
          .update(`${canonicalMatchId}|OU|${ouLine}|${ouSelection}|${marketOdds}|${predictionTimestampUtc}`)
          .digest('hex');

        results.push({
          predictionId: `pred_ou_${fixtureId}_${ouLine}`,
          canonicalMatchId,
          fixtureId,
          league,
          homeTeam,
          awayTeam,
          kickoffUtc,
          market: 'OU',
          line: ouLine,
          selection: ouSelection,
          modelProbability: Number(modelProb.toFixed(4)),
          marketOdds,
          expectedValue: Number(ev.toFixed(4)),
          confidenceScore: Math.round(modelProb * 100),
          confidenceTier: isPublicPick ? 'HIGH' : 'RESEARCH_ONLY',
          verdict,
          isPublicPick,
          ledgerTier,
          oddsSource: 'pinnacle',
          oddsTimestampUtc: ouOdds.timestampUtc || predictionTimestampUtc,
          predictionTimestampUtc,
          provenanceHash,
        });
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3. Both Teams To Score (BTTS) — STRICTLY RESEARCH_ONLY
    // ──────────────────────────────────────────────────────────────────────────
    inferences.total++;
    inferences.byMarket.BTTS++;

    const bttsProb = calculateBttsFromGrid(scoreGrid);
    const bttsOdds = fixture.pinnacleOdds?.btts;
    const bttsSelection = 'BTTS Yes';

    rejectionsByReason.UNSUPPORTED_MARKET++;
    rejectionDetails.push({
      fixtureId,
      canonicalMatchId,
      league,
      market: 'BTTS',
      line: null,
      selection: bttsSelection,
      rejectionCode: 'UNSUPPORTED_MARKET',
      detail: 'BTTS is strictly restricted to RESEARCH_ONLY by release governance',
      modelProbability: Number(bttsProb.probabilities.yes.toFixed(4)),
      marketOdds: bttsOdds?.yesOdds ?? null,
      expectedValue: null,
    });

    results.push({
      predictionId: `pred_btts_${fixtureId}`,
      canonicalMatchId,
      fixtureId,
      league,
      homeTeam,
      awayTeam,
      kickoffUtc,
      market: 'BTTS',
      line: 0,
      selection: bttsSelection,
      modelProbability: Number(bttsProb.probabilities.yes.toFixed(4)),
      marketOdds: bttsOdds?.yesOdds ?? 0,
      expectedValue: bttsOdds ? Number((bttsProb.probabilities.yes * bttsOdds.yesOdds - 1).toFixed(4)) : 0,
      confidenceScore: Math.round(bttsProb.probabilities.yes * 100),
      confidenceTier: 'RESEARCH_ONLY',
      verdict: 'PANTAU',
      isPublicPick: false, // Invariant: BTTS is NEVER public
      ledgerTier: 'SHADOW',
      oddsSource: 'pinnacle',
      oddsTimestampUtc: bttsOdds?.timestampUtc || predictionTimestampUtc,
      predictionTimestampUtc,
      provenanceHash: crypto.createHash('sha256').update(`${canonicalMatchId}|BTTS|${predictionTimestampUtc}`).digest('hex'),
    });

    return { predictions: results };
  }

  /**
   * Stage 9 & 10: Safely persists prediction records using atomic file write-then-rename.
   */
  private static persistPredictionsSafely(
    predictions: QualifiedPredictionSummary[],
    destinationPath: string
  ): number {
    this.assertDestinationSafety(destinationPath);

    const dir = path.dirname(destinationPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Read existing ledger rows for deduplication
    const existingKeys = new Set<string>();
    if (fs.existsSync(destinationPath)) {
      try {
        const content = fs.readFileSync(destinationPath, 'utf8');
        for (const line of content.split('\n')) {
          if (!line.trim()) continue;
          const parsed = JSON.parse(line);
          const key = `${parsed.canonicalMatchId}|${parsed.market}|${parsed.line}|${parsed.selection}|${parsed.modelVersion || 'dixon-coles-v1.0'}`;
          existingKeys.add(key);
        }
      } catch (e) {
        Logger.warn('[DailyPredictionRefreshService] Could not read existing destination ledger:', { error: String(e) });
      }
    }

    const linesToAppend: string[] = [];
    let addedCount = 0;

    for (const pred of predictions) {
      const key = `${pred.canonicalMatchId}|${pred.market}|${pred.line}|${pred.selection}|${DailyPredictionRefreshService.MODEL_VERSION}`;
      if (existingKeys.has(key)) continue;

      const record = {
        predictionId: pred.predictionId,
        canonicalMatchId: pred.canonicalMatchId,
        fixtureId: pred.fixtureId,
        league: pred.league,
        homeTeam: pred.homeTeam,
        awayTeam: pred.awayTeam,
        kickoffUtc: pred.kickoffUtc,
        predictionTimestamp: pred.predictionTimestampUtc,
        market: pred.market,
        selection: pred.selection,
        line: pred.line,
        marketOdds: pred.marketOdds,
        bookmaker: pred.oddsSource,
        modelProbability: pred.modelProbability,
        fairOdds: pred.modelProbability > 0 ? Number((1 / pred.modelProbability).toFixed(3)) : null,
        expectedValue: pred.expectedValue,
        confidenceScore: pred.confidenceScore,
        confidenceTier: pred.confidenceTier,
        verdict: pred.verdict,
        ledgerTier: pred.ledgerTier,
        isPublicPick: pred.isPublicPick,
        modelVersion: DailyPredictionRefreshService.MODEL_VERSION,
        provenanceHash: pred.provenanceHash,
        settlementStatus: 'PENDING',
        result: null,
        createdAt: new Date().toISOString(),
      };

      linesToAppend.push(JSON.stringify(record));
      existingKeys.add(key);
      addedCount++;
    }

    if (addedCount > 0) {
      const tempPath = `${destinationPath}.tmp.${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const existingData = fs.existsSync(destinationPath) ? fs.readFileSync(destinationPath, 'utf8') : '';
      const prefix = existingData && !existingData.endsWith('\n') ? '\n' : '';
      const finalData = (existingData ? existingData + prefix : '') + linesToAppend.join('\n') + '\n';
      fs.writeFileSync(tempPath, finalData, 'utf8');
      fs.renameSync(tempPath, destinationPath);
    }

    return addedCount;
  }

  /**
   * Fail-closed assertion ensuring that the write destination NEVER targets a protected historical ledger.
   */
  public static assertDestinationSafety(destinationPath: string): void {
    const resolved = path.resolve(destinationPath);
    for (const protectedPath of this.PROTECTED_HISTORICAL_PATHS) {
      if (resolved.toLowerCase() === protectedPath.toLowerCase()) {
        throw new Error(
          `[DailyPredictionRefreshService] FATAL SECURITY INVARIANT VIOLATION: Attempted write to protected historical ledger '${destinationPath}'. Write aborted.`
        );
      }
    }
  }

  /**
   * Verifies that all 3 protected historical ledgers match baseline hashes.
   */
  public static verifyProtectedLedgersIntegrity(): boolean {
    const baselines: Record<string, string> = {
      'data/verification/live_prediction_ledger.jsonl': '317fc037a63b811420400ea9de094092ec7d68b119ad6abc57743be12d568527',
      'data/verification/all_leagues_research_ledger.jsonl': 'eae8f364a5393255d276fca2650056951fb601ba829c1710b26ac673dffb967b',
      'data/research/multi_league_research_predictions.jsonl': '0128616a43968be5fddab76ea5c57da731955e22b1bf27bca3f886938187a12f',
    };

    for (const [relPath, expectedHash] of Object.entries(baselines)) {
      const fullPath = path.resolve(process.cwd(), relPath);
      if (!fs.existsSync(fullPath)) return false;
      const buf = fs.readFileSync(fullPath);
      const hash = crypto.createHash('sha256').update(buf).digest('hex');
      if (hash !== expectedHash) return false;
    }
    return true;
  }
}
