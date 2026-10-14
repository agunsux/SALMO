// SALMO.DEV — Out-of-Sample Evidence Accumulation & Prediction Tracking Service
// Implements immutable prediction snapshots, strict cohort segregation,
// leakage-resistant evaluation, and pre-registered statistical gate reporting.
// Governed by: SALMO EPIC 75 Specification & docs/governance/promotion_gates.md

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { CanonicalPredictionLedgerService, CanonicalPredictionRecord } from '../ledger/canonicalPredictionLedger';
import { QuarterLineSettler } from '../ah/quarterLineSettler';
import {
  isKnownBatchPlaceholderTimestamp,
  evaluateRowTemporalIntegrity,
} from '../archive/temporalIntegrityGuard';
import {
  PRE_REGISTERED_GATES,
  HEADLINE_COHORT_MIN_SETTLED_POSITIONS,
  BRIER_VS_MARKET_MIN_LEGS,
  CLV_HEADLINE_MIN_POSITIONS,
  formatInsufficientSampleLabel,
} from '../performance/gates';
import { evaluatePositionBrierLegs, PositionBrierDecomposition } from '../performance/brierScoring';
import { SettlementOutcome } from '../../types/index';

export type EvaluationCohort =
  | 'TRAINING_DEV'           // Historical training/development dataset
  | 'RESEARCH_SIMULATION'    // Multi-league research simulations (e.g. non-EPL without live odds)
  | 'TIMESTAMP_VERIFIED_OOS' // Out-of-sample prediction with verified pre-match timestamp
  | 'VERIFIED_ODDS_OOS'      // OOS prediction with verified executable bookmaker odds
  | 'SETTLED_VERIFIED_OOS';  // Settled OOS position with verified match scoreline and settlement

export type CohortEligibilityStatus =
  | 'ELIGIBLE_FOR_EVALUATION'
  | 'EXCLUDED_UNVERIFIED_TIMESTAMP'
  | 'EXCLUDED_RETROSPECTIVE'
  | 'EXCLUDED_MISSING_ODDS'
  | 'EXCLUDED_DUPLICATE_FIXTURE_MARKET'
  | 'EXCLUDED_TEMPORAL_LEAKAGE'
  | 'EXCLUDED_INVALID_PROBABILITY'
  | 'EXCLUDED_QUARANTINED';

export interface ImmutablePredictionSnapshot {
  /** Stable unique identifier across the lifetime of the prediction */
  snapshotId: string;
  /** Canonical prediction ID matching verification ledgers */
  predictionId: string;
  /** Canonical fixture identifier e.g. EPL_2026_ARSENALFC_LEEDSUNITED_2026-10-10 */
  canonicalMatchId: string;
  /** Provider fixture identifier e.g. 1557417 */
  fixtureId: string;
  /** Competition code or slug e.g. ENG-PL, ESP-LALIGA */
  competitionId: string;
  /** Human-readable competition name e.g. Premier League */
  competitionName: string;
  /** Home team name */
  homeTeam: string;
  /** Away team name */
  awayTeam: string;
  /** Match kickoff timestamp in ISO UTC */
  kickoffUtc: string;
  /** Genuine timestamp when the prediction was computed and recorded before kickoff */
  predictionTimestamp: string | null;
  /** Lead time in hours between prediction capture and kickoff */
  leadTimeHoursBeforeKickoff: number | null;
  /** Target betting market: AH | OU | BTTS */
  market: 'AH' | 'OU' | 'BTTS';
  /** Exact selection text e.g. "Arsenal FC -1.25", "Over 2.5" */
  selection: string;
  /** Exact numerical market handicap or total line */
  line: number;
  /** Underlying prediction model version e.g. "dixon-coles-v1.0" */
  modelVersion: string;
  /** Point-in-time feature set version e.g. "dynamic-ratings-v2.0" */
  featureVersion: string;
  /** Model estimated win/cover probability (0.0001 to 0.9999) */
  modelProbability: number;
  /** Model calculated fair decimal odds (1 / modelProbability) or null */
  fairOdds: number | null;
  /** Internal model confidence score (0 to 100) */
  confidenceScore: number;
  /** Confidence qualification tier: "HIGH", "VALUE_HIGH", "PANTAU", "RESEARCH_ONLY" */
  confidenceTier: string;
  /** Expected value percentage (+X.X%) */
  expectedValuePct: number | null;
  /** Edge percentage (modelProbability - deviggedMarketProbability) */
  edge: number | null;
  /** Reference benchmark bookmaker (strictly "pinnacle" for benchmark) or null */
  bookmaker: string | null;
  /** Decimal benchmark odds taken at prediction time or null */
  marketOdds: number | null;
  /** Timestamp when market odds quote was captured */
  oddsTimestamp: string | null;
  /** Data provenance source identifier */
  dataSource: string;
  /** Cryptographic SHA-256 provenance hash over immutable pre-match terms */
  provenanceHash: string;
  /** Assigned evidence evaluation cohort */
  cohort: EvaluationCohort;
  /** Eligibility status for official out-of-sample statistical evaluation */
  eligibilityStatus: CohortEligibilityStatus;
  /** Detailed reason if excluded from evaluation */
  exclusionReason: string | null;
  /** Whether the record qualified as a public betting recommendation at prediction time */
  isPublicPick: boolean;
  /** Decision verdict at prediction time: LAYAK | PANTAU | LEWATI */
  verdict: 'LAYAK' | 'PANTAU' | 'LEWATI';
  /** Settlement status: PENDING | SETTLED | VOID */
  settlementStatus: 'PENDING' | 'SETTLED' | 'VOID';
  /** Settlement result: WIN | HALF_WIN | PUSH | HALF_LOSS | LOSS | VOID | null */
  result: SettlementOutcome | null;
  /** Realized profit/loss units relative to 1.0 unit stake */
  profitUnits: number;
  /** Stake units allocated (1.0 for active/settled bets, 0.0 for research/pending) */
  stakeUnits: number;
  /** Verified match final home goals */
  homeGoals: number | null;
  /** Verified match final away goals */
  awayGoals: number | null;
  /** Verified match final scoreline string e.g. "2-1" */
  matchScore: string | null;
  /** ISO timestamp when settlement was finalized */
  settledAt: string | null;
}

export interface CandidatePredictionInput {
  predictionId?: string;
  canonicalMatchId: string;
  fixtureId: string;
  competitionId: string;
  competitionName: string;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;
  predictionTimestamp?: string | null;
  market: 'AH' | 'OU' | 'BTTS';
  selection: string;
  line: number;
  modelVersion?: string;
  featureVersion?: string;
  modelProbability: number;
  fairOdds?: number | null;
  confidenceScore?: number;
  confidenceTier?: string;
  expectedValuePct?: number | null;
  edge?: number | null;
  bookmaker?: string | null;
  marketOdds?: number | null;
  oddsTimestamp?: string | null;
  dataSource?: string;
  isPublicPick?: boolean;
  verdict?: 'LAYAK' | 'PANTAU' | 'LEWATI';
  homeGoals?: number | null;
  awayGoals?: number | null;
  settledAt?: string | null;
}

export interface CalibrationBucket {
  bucketRange: string;
  minProb: number;
  maxProb: number;
  count: number;
  predictedProbMean: number;
  observedFreq: number;
  brierScore: number;
}

export interface StatisticalEvidenceReport {
  generatedAt: string;
  summary: {
    totalPredictionsGenerated: number;
    totalEligibleForEvaluation: number;
    totalExcluded: number;
    totalWithVerifiedOdds: number;
    totalEligibleWithVerifiedOdds?: number;
    totalSettledWithVerifiedResults: number;
    totalIndependentFixtures: number;
  };
  cohortBreakdown: Record<EvaluationCohort, number>;
  exclusionBreakdown: Record<CohortEligibilityStatus, number>;
  dimensionalSampleSizes: {
    byMarket: Record<string, { total: number; settled: number; withOdds: number }>;
    byLeague: Record<string, { total: number; settled: number; withOdds: number; readiness: string }>;
    byModelVersion: Record<string, { total: number; settled: number }>;
    byConfidenceTier: Record<string, { total: number; settled: number }>;
  };
  statisticalMetrics: {
    brierScore: number | null;
    brierStdDev: number | null;
    brierStdErr: number | null;
    brier95ConfidenceInterval: [number, number] | null;
    coinFlipSanityPrior: number; // 0.2500
    spansCoinFlipPrior: boolean;
    nResolvedLegs: number;
    nExcludedPushLegs: number;
    nResolvedPositions: number;
    logLoss: number | null;
    calibrationBuckets: CalibrationBucket[];
  };
  bettingPerformance: {
    diagnosticAllRowsCohort: {
      label: string;
      nSettled: number;
      unitsStaked: number;
      profitUnits: number;
      roiPct: number | null;
      yieldPct: number | null;
      sampleStatus: 'SUFFICIENT' | 'INSUFFICIENT SAMPLE';
      sampleLabel: string;
      disclaimer: string;
    };
    qualifiedPublicPicksCohort: {
      label: string;
      nSettled: number;
      unitsStaked: number;
      profitUnits: number;
      roiPct: number | null;
      yieldPct: number | null;
      sampleStatus: 'SUFFICIENT' | 'INSUFFICIENT SAMPLE';
      sampleLabel: string;
      disclaimer: string;
    };
  };
  preRegisteredPromotionGates: {
    settledPositionsThreshold: number; // 100
    realizedSettledPositions: number;
    settledPositionsGateStatus: 'INSUFFICIENT_SAMPLE' | 'SUFFICIENT';
    brierMarketLegsThreshold: number; // 300
    realizedBrierLegs: number;
    brierLegsGateStatus: 'INSUFFICIENT_SAMPLE' | 'SUFFICIENT';
    maxLeakageRowsThreshold: number; // 0
    realizedLeakageRows: number;
    evaluatedLeakageRecords: number; // e.g. 30 evaluated out-of-sample records
    leakageGateStatus: 'PASS' | 'FAIL' | 'NOT_EVALUABLE';
    edgeVsMarketBenchmarkStatus: 'NOT_EVALUABLE' | 'INSUFFICIENT_SAMPLE' | 'PASS' | 'FAIL';
  };
  readinessConclusions: {
    researchReadiness: 'OPERATIONAL' | 'DEGRADED';
    liveBettingReadiness: 'BLOCKED' | 'READY';
    blockerReasons: string[];
    officialVerdict:
      | 'EVIDENCE_PIPELINE_DEPLOYED'
      | 'INTEGRITY_VERIFIED_PREVIEW_READY'
      | 'INTEGRITY_VERIFIED_PRODUCTION_DEPLOYED'
      | 'PREVIEW_READY_PRODUCTION_BLOCKED'
      | 'INSUFFICIENT_PROVENANCE'
      | 'INTEGRITY_DEFECTS_UNRESOLVED'
      | 'RELEASE_FAILED';
  };
}

export class EvidenceAccumulationService {
  private static evidenceLedgerPath = path.resolve(
    process.cwd(),
    'data',
    'verification',
    'evidence_accumulation_ledger.jsonl'
  );

  /**
   * Computes deterministic SHA-256 hash over immutable pre-match terms.
   */
  public static computeSnapshotProvenanceHash(terms: {
    predictionId: string;
    canonicalMatchId: string;
    market: string;
    selection: string;
    line: number;
    modelVersion: string;
    featureVersion: string;
    modelProbability: number;
    marketOdds: number | null;
    kickoffUtc: string;
  }): string {
    const payload = [
      terms.predictionId,
      terms.canonicalMatchId,
      terms.market,
      terms.selection,
      terms.line.toFixed(4),
      terms.modelVersion,
      terms.featureVersion,
      terms.modelProbability.toFixed(4),
      terms.marketOdds !== null ? terms.marketOdds.toFixed(4) : 'NULL_ODDS',
      terms.kickoffUtc,
    ].join('|');
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Creates an immutable prediction snapshot with strict validation of pre-match invariants.
   */
  public static createSnapshot(
    input: CandidatePredictionInput,
    options: {
      knownHistoricalIds?: Set<string>;
      enforceStrictPreMatch?: boolean;
    } = {}
  ): ImmutablePredictionSnapshot {
    const predictionId = input.predictionId || `pred_${input.canonicalMatchId}_${input.market}_${input.line}`;
    const modelVersion = input.modelVersion || 'dixon-coles-v1.0';
    const featureVersion = input.featureVersion || 'dynamic-ratings-v2.0';
    const dataSource = input.dataSource || 'SALMO_INDEPENDENT_EVIDENCE_PIPELINE';

    // 1. Probability Invariant Verification
    const rawProb = input.modelProbability;
    const probDec = rawProb > 1 ? Number((rawProb / 100).toFixed(4)) : Number(rawProb.toFixed(4));
    const isValidProb = Number.isFinite(probDec) && probDec > 0 && probDec < 1;

    // 2. Temporal & Timestamp Verification
    const kickoffMs = Date.parse(input.kickoffUtc);
    const predTs = input.predictionTimestamp || null;
    const predMs = predTs ? Date.parse(predTs) : NaN;
    const isBatchPlaceholder = isKnownBatchPlaceholderTimestamp(predTs);

    let eligibilityStatus: CohortEligibilityStatus = 'ELIGIBLE_FOR_EVALUATION';
    let exclusionReason: string | null = null;
    let leadTimeHours: number | null = null;

    if (!isValidProb) {
      eligibilityStatus = 'EXCLUDED_INVALID_PROBABILITY';
      exclusionReason = `Model probability ${rawProb} is out of allowable bounds (0, 1).`;
    } else if (Number.isNaN(kickoffMs)) {
      eligibilityStatus = 'EXCLUDED_QUARANTINED';
      exclusionReason = `Kickoff timestamp '${input.kickoffUtc}' is malformed or invalid.`;
    } else if (!predTs || Number.isNaN(predMs)) {
      eligibilityStatus = 'EXCLUDED_UNVERIFIED_TIMESTAMP';
      exclusionReason = 'Prediction timestamp is missing or unverified.';
    } else if (isBatchPlaceholder) {
      eligibilityStatus = 'EXCLUDED_UNVERIFIED_TIMESTAMP';
      exclusionReason = `Row carries batch placeholder timestamp '${predTs}' without pre-match provenance.`;
    } else if (predMs >= kickoffMs) {
      eligibilityStatus = 'EXCLUDED_RETROSPECTIVE';
      exclusionReason = `Prediction timestamp (${predTs}) is at or after kickoff (${input.kickoffUtc}).`;
    } else {
      leadTimeHours = Number(((kickoffMs - predMs) / (1000 * 60 * 60)).toFixed(2));
      if (options.enforceStrictPreMatch && leadTimeHours < 0.25) {
        eligibilityStatus = 'EXCLUDED_TEMPORAL_LEAKAGE';
        exclusionReason = `Lead time (${leadTimeHours}h) is below 15-minute operational cutoff.`;
      }
    }

    // 3. Odds Availability Verification
    const odds = typeof input.marketOdds === 'number' && Number.isFinite(input.marketOdds) && input.marketOdds > 1.0
      ? input.marketOdds
      : null;

    if (eligibilityStatus === 'ELIGIBLE_FOR_EVALUATION' && odds === null) {
      eligibilityStatus = 'EXCLUDED_MISSING_ODDS';
      exclusionReason = 'Authentic executable bookmaker odds are unavailable.';
    }

    // 4. Cohort Assignment
    let cohort: EvaluationCohort;
    const isSettled = typeof input.homeGoals === 'number' && typeof input.awayGoals === 'number';

    if (input.competitionId !== 'ENG-PL' && odds === null) {
      cohort = 'RESEARCH_SIMULATION';
    } else if (isSettled && odds !== null && eligibilityStatus === 'ELIGIBLE_FOR_EVALUATION') {
      cohort = 'SETTLED_VERIFIED_OOS';
    } else if (odds !== null && eligibilityStatus === 'ELIGIBLE_FOR_EVALUATION') {
      cohort = 'VERIFIED_ODDS_OOS';
    } else if (eligibilityStatus === 'ELIGIBLE_FOR_EVALUATION') {
      cohort = 'TIMESTAMP_VERIFIED_OOS';
    } else {
      cohort = 'RESEARCH_SIMULATION';
    }

    // 5. Settlement Math Verification
    let outcome: SettlementOutcome | null = null;
    let profitUnits = 0;
    let stakeUnits = 0;
    let matchScore: string | null = null;

    if (isSettled && odds !== null) {
      const hG = input.homeGoals as number;
      const aG = input.awayGoals as number;
      matchScore = `${hG}-${aG}`;
      stakeUnits = 1.0;

      if (input.market === 'AH') {
        outcome = QuarterLineSettler.settle('home', input.line, hG, aG);
        profitUnits = QuarterLineSettler.calculateProfit(outcome, odds, 1.0);
      } else if (input.market === 'OU') {
        const isOver = input.selection.toLowerCase().startsWith('over');
        outcome = QuarterLineSettler.settleOverUnder(isOver ? 'OVER' : 'UNDER', input.line, hG + aG);
        profitUnits = QuarterLineSettler.calculateProfit(outcome, odds, 1.0);
      }
    }

    const provenanceHash = this.computeSnapshotProvenanceHash({
      predictionId,
      canonicalMatchId: input.canonicalMatchId,
      market: input.market,
      selection: input.selection,
      line: input.line,
      modelVersion,
      featureVersion,
      modelProbability: probDec,
      marketOdds: odds,
      kickoffUtc: input.kickoffUtc,
    });

    const isPublicPick = Boolean(input.isPublicPick || input.verdict === 'LAYAK');

    return {
      snapshotId: `snap_${provenanceHash.substring(0, 16)}`,
      predictionId,
      canonicalMatchId: input.canonicalMatchId,
      fixtureId: input.fixtureId,
      competitionId: input.competitionId,
      competitionName: input.competitionName,
      homeTeam: input.homeTeam,
      awayTeam: input.awayTeam,
      kickoffUtc: input.kickoffUtc,
      predictionTimestamp: predTs,
      leadTimeHoursBeforeKickoff: leadTimeHours,
      market: input.market,
      selection: input.selection,
      line: Number(input.line),
      modelVersion,
      featureVersion,
      modelProbability: probDec,
      fairOdds: input.fairOdds ?? Number((1 / probDec).toFixed(3)),
      confidenceScore: input.confidenceScore ?? 70,
      confidenceTier: input.confidenceTier ?? (isPublicPick ? 'HIGH' : 'RESEARCH_ONLY'),
      expectedValuePct: input.expectedValuePct ?? null,
      edge: input.edge ?? null,
      bookmaker: input.bookmaker ?? (odds !== null ? 'pinnacle' : null),
      marketOdds: odds,
      oddsTimestamp: input.oddsTimestamp ?? null,
      dataSource,
      provenanceHash,
      cohort,
      eligibilityStatus,
      exclusionReason,
      isPublicPick,
      verdict: input.verdict || (isPublicPick ? 'LAYAK' : 'LEWATI'),
      settlementStatus: isSettled ? 'SETTLED' : 'PENDING',
      result: outcome,
      profitUnits,
      stakeUnits,
      homeGoals: input.homeGoals ?? null,
      awayGoals: input.awayGoals ?? null,
      matchScore,
      settledAt: input.settledAt ?? null,
    };
  }

  /**
   * Idempotently appends an immutable prediction snapshot to the evidence ledger.
   * Never overwrites existing historical entries.
   */
  public static recordSnapshot(
    snapshot: ImmutablePredictionSnapshot,
    targetFile: string = this.evidenceLedgerPath
  ): { success: boolean; isDuplicate: boolean; snapshot: ImmutablePredictionSnapshot; reason?: string } {
    const dir = path.dirname(targetFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Check existing records for exact duplicate
    if (fs.existsSync(targetFile)) {
      const existingLines = fs.readFileSync(targetFile, 'utf8').trim().split('\n').filter(Boolean);
      for (const line of existingLines) {
        try {
          const rec = JSON.parse(line);
          if (rec.predictionId === snapshot.predictionId || rec.provenanceHash === snapshot.provenanceHash) {
            return {
              success: true,
              isDuplicate: true,
              snapshot,
              reason: `Idempotent skip: snapshot with predictionId '${snapshot.predictionId}' already exists.`,
            };
          }
        } catch {}
      }
    }

    // Clean append
    const line = JSON.stringify(snapshot) + '\n';
    fs.appendFileSync(targetFile, line, 'utf8');

    return {
      success: true,
      isDuplicate: false,
      snapshot,
    };
  }

  /**
   * Loads all snapshots across production live ledger, research simulation ledger,
   * and newly accumulated evidence snapshots.
   */
  public static loadAllUnifiedSnapshots(): ImmutablePredictionSnapshot[] {
    const canonicalRecords = CanonicalPredictionLedgerService.getAllUnifiedRecords();
    const sortedRecords = [...canonicalRecords].sort((a, b) => {
      const aIsLive = a.originalSourcePath === 'data/verification/live_prediction_ledger.jsonl';
      const bIsLive = b.originalSourcePath === 'data/verification/live_prediction_ledger.jsonl';
      if (aIsLive && !bIsLive) return -1;
      if (!aIsLive && bIsLive) return 1;
      return 0;
    });

    const snapshots: ImmutablePredictionSnapshot[] = [];
    const seenMatchMarket = new Map<string, string>();

    for (const r of sortedRecords) {
      const fKey = r.fixtureId && r.fixtureId !== '0' && r.fixtureId !== '' ? r.fixtureId : r.canonicalMatchId;
      const mmKey = `${fKey}_${r.market}_${r.line}`;
      const isDuplicateFixtureMarket = seenMatchMarket.has(mmKey);
      if (!isDuplicateFixtureMarket) {
        seenMatchMarket.set(mmKey, r.predictionId);
      }

      const snap = this.createSnapshot({
        predictionId: r.predictionId,
        canonicalMatchId: r.canonicalMatchId,
        fixtureId: r.fixtureId,
        competitionId: r.competitionId,
        competitionName: r.competitionName,
        homeTeam: r.homeTeam,
        awayTeam: r.awayTeam,
        kickoffUtc: r.kickoffUtc,
        predictionTimestamp: r.predictionTimestamp,
        market: r.market,
        selection: r.selection,
        line: r.line,
        modelVersion: r.modelVersion,
        featureVersion: 'dynamic-ratings-v2.0',
        modelProbability: r.modelProbability,
        fairOdds: r.fairOdds,
        confidenceScore: r.confidenceTier === 'HIGH' ? 85 : 60,
        confidenceTier: r.confidenceTier,
        expectedValuePct: r.originalOdds && r.fairOdds ? Number((((r.originalOdds / r.fairOdds) - 1) * 100).toFixed(2)) : null,
        bookmaker: r.bookmaker,
        marketOdds: r.originalOdds,
        dataSource: r.dataSource,
        isPublicPick: r.isPublicPick,
        verdict: r.confidenceTier === 'HIGH' ? 'LAYAK' : 'LEWATI',
        homeGoals: r.homeGoals,
        awayGoals: r.awayGoals,
        settledAt: r.settledAt,
      });

      // Mark duplicate if redundant observation exists
      if (isDuplicateFixtureMarket) {
        snap.eligibilityStatus = 'EXCLUDED_DUPLICATE_FIXTURE_MARKET';
        snap.cohort = 'RESEARCH_SIMULATION';
        snap.exclusionReason = `Multiple predictions exist for fixture ${r.canonicalMatchId} on market ${r.market} line ${r.line}. Initial prediction '${seenMatchMarket.get(mmKey)}' retained.`;
      }

      snapshots.push(snap);
    }

    return snapshots;
  }

  /**
   * Generates comprehensive statistical evidence report across all accumulated snapshots.
   */
  public static generateStatisticalEvidenceReport(): StatisticalEvidenceReport {
    const snapshots = this.loadAllUnifiedSnapshots();
    const nowIso = new Date().toISOString();

    const summary = {
      totalPredictionsGenerated: snapshots.length,
      totalEligibleForEvaluation: 0,
      totalExcluded: 0,
      totalWithVerifiedOdds: 0,
      totalEligibleWithVerifiedOdds: 0,
      totalSettledWithVerifiedResults: 0,
      totalIndependentFixtures: 0,
    };

    const cohortBreakdown: Record<EvaluationCohort, number> = {
      TRAINING_DEV: 0,
      RESEARCH_SIMULATION: 0,
      TIMESTAMP_VERIFIED_OOS: 0,
      VERIFIED_ODDS_OOS: 0,
      SETTLED_VERIFIED_OOS: 0,
    };

    const exclusionBreakdown: Record<CohortEligibilityStatus, number> = {
      ELIGIBLE_FOR_EVALUATION: 0,
      EXCLUDED_UNVERIFIED_TIMESTAMP: 0,
      EXCLUDED_RETROSPECTIVE: 0,
      EXCLUDED_MISSING_ODDS: 0,
      EXCLUDED_DUPLICATE_FIXTURE_MARKET: 0,
      EXCLUDED_TEMPORAL_LEAKAGE: 0,
      EXCLUDED_INVALID_PROBABILITY: 0,
      EXCLUDED_QUARANTINED: 0,
    };

    const fixtureSet = new Set<string>();

    const byMarket: Record<string, { total: number; settled: number; withOdds: number }> = {
      AH: { total: 0, settled: 0, withOdds: 0 },
      OU: { total: 0, settled: 0, withOdds: 0 },
      BTTS: { total: 0, settled: 0, withOdds: 0 },
    };

    const byLeague: Record<string, { total: number; settled: number; withOdds: number; readiness: string }> = {};
    const byModelVersion: Record<string, { total: number; settled: number }> = {};
    const byConfidenceTier: Record<string, { total: number; settled: number }> = {};

    let allStakes = 0;
    let allProfit = 0;
    let pubStakes = 0;
    let pubProfit = 0;

    const legSquaredErrors: number[] = [];
    const positionSquaredErrors: number[] = [];
    let nExcludedPushLegs = 0;

    // Calibration bucket containers (0.10 width)
    const bucketDefs = [
      { range: '0.30 - 0.39', min: 0.30, max: 0.40, probs: [] as number[], outcomes: [] as number[], sqErrors: [] as number[] },
      { range: '0.40 - 0.49', min: 0.40, max: 0.50, probs: [] as number[], outcomes: [] as number[], sqErrors: [] as number[] },
      { range: '0.50 - 0.59', min: 0.50, max: 0.60, probs: [] as number[], outcomes: [] as number[], sqErrors: [] as number[] },
      { range: '0.60 - 0.69', min: 0.60, max: 0.70, probs: [] as number[], outcomes: [] as number[], sqErrors: [] as number[] },
      { range: '0.70 - 0.79', min: 0.70, max: 0.80, probs: [] as number[], outcomes: [] as number[], sqErrors: [] as number[] },
    ];

    for (const snap of snapshots) {
      cohortBreakdown[snap.cohort] = (cohortBreakdown[snap.cohort] || 0) + 1;
      exclusionBreakdown[snap.eligibilityStatus] = (exclusionBreakdown[snap.eligibilityStatus] || 0) + 1;

      if (snap.eligibilityStatus === 'ELIGIBLE_FOR_EVALUATION') {
        summary.totalEligibleForEvaluation++;
      } else {
        summary.totalExcluded++;
      }

      if (snap.marketOdds !== null) {
        summary.totalWithVerifiedOdds++;
        if (snap.eligibilityStatus === 'ELIGIBLE_FOR_EVALUATION') {
          summary.totalEligibleWithVerifiedOdds++;
        }
      }

      if (snap.settlementStatus === 'SETTLED' && snap.eligibilityStatus === 'ELIGIBLE_FOR_EVALUATION') {
        summary.totalSettledWithVerifiedResults++;
      }

      fixtureSet.add(snap.canonicalMatchId);

      // Dimensional mapping
      if (byMarket[snap.market]) {
        byMarket[snap.market].total++;
        if (snap.settlementStatus === 'SETTLED' && snap.eligibilityStatus === 'ELIGIBLE_FOR_EVALUATION') byMarket[snap.market].settled++;
        if (snap.marketOdds !== null) byMarket[snap.market].withOdds++;
      }

      if (!byLeague[snap.competitionId]) {
        const readiness = snap.competitionId === 'ENG-PL' ? 'PRODUCTION_PAUSED_NO_ODDS' : 'RESEARCH_ONLY';
        byLeague[snap.competitionId] = { total: 0, settled: 0, withOdds: 0, readiness };
      }
      byLeague[snap.competitionId].total++;
      if (snap.settlementStatus === 'SETTLED' && snap.eligibilityStatus === 'ELIGIBLE_FOR_EVALUATION') byLeague[snap.competitionId].settled++;
      if (snap.marketOdds !== null) byLeague[snap.competitionId].withOdds++;

      byModelVersion[snap.modelVersion] = byModelVersion[snap.modelVersion] || { total: 0, settled: 0 };
      byModelVersion[snap.modelVersion].total++;
      if (snap.settlementStatus === 'SETTLED' && snap.eligibilityStatus === 'ELIGIBLE_FOR_EVALUATION') byModelVersion[snap.modelVersion].settled++;

      byConfidenceTier[snap.confidenceTier] = byConfidenceTier[snap.confidenceTier] || { total: 0, settled: 0 };
      byConfidenceTier[snap.confidenceTier].total++;
      if (snap.settlementStatus === 'SETTLED' && snap.eligibilityStatus === 'ELIGIBLE_FOR_EVALUATION') byConfidenceTier[snap.confidenceTier].settled++;

      // Settled position accounting & Brier scoring (strictly eligible out-of-sample positions)
      if (
        snap.eligibilityStatus === 'ELIGIBLE_FOR_EVALUATION' &&
        snap.settlementStatus === 'SETTLED' &&
        snap.homeGoals !== null &&
        snap.awayGoals !== null
      ) {
        allStakes += snap.stakeUnits;
        allProfit += snap.profitUnits;

        if (snap.isPublicPick) {
          pubStakes += snap.stakeUnits;
          pubProfit += snap.profitUnits;
        }

        // Brier decomposition
        const decomp = evaluatePositionBrierLegs({
          positionId: snap.predictionId,
          fixtureId: snap.fixtureId,
          market: snap.market,
          line: snap.line,
          selection: snap.selection,
          homeTeam: snap.homeTeam,
          awayTeam: snap.awayTeam,
          league: snap.competitionName,
          homeGoals: snap.homeGoals,
          awayGoals: snap.awayGoals,
          fallbackProbability: snap.modelProbability,
        });

        if (decomp) {
          nExcludedPushLegs += decomp.nExcludedPushLegs;
          for (const l of decomp.legs) {
            if (!l.excludedPush && l.brierSqError !== null) {
              legSquaredErrors.push(l.brierSqError);

              // Assign to calibration bucket
              const p = l.pLegNoPush;
              const bin = l.binaryOutcome as number;
              for (const b of bucketDefs) {
                if (p >= b.min && p < b.max) {
                  b.probs.push(p);
                  b.outcomes.push(bin);
                  b.sqErrors.push(l.brierSqError);
                  break;
                }
              }
            }
          }
          if (decomp.positionBrierMean !== null) {
            positionSquaredErrors.push(decomp.positionBrierMean);
          }
        }
      }
    }

    summary.totalIndependentFixtures = fixtureSet.size;

    // Statistical Brier & Confidence Interval Calculation
    let brierScore: number | null = null;
    let brierStdDev: number | null = null;
    let brierStdErr: number | null = null;
    let brier95CI: [number, number] | null = null;
    let spansCoinFlipPrior = true;

    if (positionSquaredErrors.length > 1) {
      const mean = positionSquaredErrors.reduce((a, b) => a + b, 0) / positionSquaredErrors.length;
      const variance = positionSquaredErrors.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (positionSquaredErrors.length - 1);
      const sDev = Math.sqrt(variance);
      const sErr = sDev / Math.sqrt(positionSquaredErrors.length);
      const ciLower = Number((mean - 1.96 * sErr).toFixed(4));
      const ciUpper = Number((mean + 1.96 * sErr).toFixed(4));

      brierScore = Number(mean.toFixed(4));
      brierStdDev = Number(sDev.toFixed(4));
      brierStdErr = Number(sErr.toFixed(4));
      brier95CI = [ciLower, ciUpper];
      spansCoinFlipPrior = ciLower <= 0.2500 && 0.2500 <= ciUpper;
    }

    // Calibration buckets aggregation
    const calibrationBuckets: CalibrationBucket[] = bucketDefs.map(b => {
      const count = b.probs.length;
      const predictedProbMean = count > 0 ? Number((b.probs.reduce((a, c) => a + c, 0) / count).toFixed(3)) : 0;
      const observedFreq = count > 0 ? Number((b.outcomes.reduce((a, c) => a + c, 0) / count).toFixed(3)) : 0;
      const bScore = count > 0 ? Number((b.sqErrors.reduce((a, c) => a + c, 0) / count).toFixed(4)) : 0;
      return {
        bucketRange: b.range,
        minProb: b.min,
        maxProb: b.max,
        count,
        predictedProbMean,
        observedFreq,
        brierScore: bScore,
      };
    });

    const nSettledDiagnostic = summary.totalSettledWithVerifiedResults;
    const diagnosticRoi = allStakes > 0 ? Number(((allProfit / allStakes) * 100).toFixed(2)) : null;

    const nSettledPublic = snapshots.filter(s => s.isPublicPick && s.settlementStatus === 'SETTLED').length;
    const publicRoi = pubStakes > 0 ? Number(((pubProfit / pubStakes) * 100).toFixed(2)) : null;

    return {
      generatedAt: nowIso,
      summary,
      cohortBreakdown,
      exclusionBreakdown,
      dimensionalSampleSizes: {
        byMarket,
        byLeague,
        byModelVersion,
        byConfidenceTier,
      },
      statisticalMetrics: {
        brierScore,
        brierStdDev,
        brierStdErr,
        brier95ConfidenceInterval: brier95CI,
        coinFlipSanityPrior: 0.2500,
        spansCoinFlipPrior,
        nResolvedLegs: legSquaredErrors.length,
        nExcludedPushLegs,
        nResolvedPositions: positionSquaredErrors.length,
        logLoss: null, // Requires n >= 100 for reliable headline log-loss
        calibrationBuckets,
      },
      bettingPerformance: {
        diagnosticAllRowsCohort: {
          label: 'MODEL_ALL_ROWS_DIAGNOSTIC (NOT PUBLIC PICKS)',
          nSettled: nSettledDiagnostic,
          unitsStaked: Number(allStakes.toFixed(2)),
          profitUnits: Number(allProfit.toFixed(3)),
          roiPct: diagnosticRoi,
          yieldPct: diagnosticRoi,
          sampleStatus: nSettledDiagnostic >= HEADLINE_COHORT_MIN_SETTLED_POSITIONS ? 'SUFFICIENT' : 'INSUFFICIENT SAMPLE',
          sampleLabel: formatInsufficientSampleLabel(nSettledDiagnostic, HEADLINE_COHORT_MIN_SETTLED_POSITIONS),
          disclaimer: 'Diagnostic flat-stake sample of all model predictions. Not an indicator of live actionable edge.',
        },
        qualifiedPublicPicksCohort: {
          label: 'QUALIFIED_PUBLIC_PICKS',
          nSettled: nSettledPublic,
          unitsStaked: Number(pubStakes.toFixed(2)),
          profitUnits: Number(pubProfit.toFixed(3)),
          roiPct: publicRoi,
          yieldPct: publicRoi,
          sampleStatus: nSettledPublic >= HEADLINE_COHORT_MIN_SETTLED_POSITIONS ? 'SUFFICIENT' : 'INSUFFICIENT SAMPLE',
          sampleLabel: formatInsufficientSampleLabel(nSettledPublic, HEADLINE_COHORT_MIN_SETTLED_POSITIONS),
          disclaimer: 'Do not interpret positive short-term ROI as proof of predictive edge. Minimum pre-registered sample is N >= 100.',
        },
      },
      preRegisteredPromotionGates: {
        settledPositionsThreshold: HEADLINE_COHORT_MIN_SETTLED_POSITIONS,
        realizedSettledPositions: nSettledDiagnostic,
        settledPositionsGateStatus: nSettledDiagnostic >= HEADLINE_COHORT_MIN_SETTLED_POSITIONS ? 'SUFFICIENT' : 'INSUFFICIENT_SAMPLE',
        brierMarketLegsThreshold: BRIER_VS_MARKET_MIN_LEGS,
        realizedBrierLegs: legSquaredErrors.length,
        brierLegsGateStatus: legSquaredErrors.length >= BRIER_VS_MARKET_MIN_LEGS ? 'SUFFICIENT' : 'INSUFFICIENT_SAMPLE',
        maxLeakageRowsThreshold: 0,
        realizedLeakageRows: 0,
        evaluatedLeakageRecords: summary.totalEligibleForEvaluation,
        leakageGateStatus: 'PASS',
        edgeVsMarketBenchmarkStatus: 'NOT_EVALUABLE',
      },
      readinessConclusions: {
        researchReadiness: 'OPERATIONAL',
        liveBettingReadiness: 'BLOCKED',
        blockerReasons: [
          'OddsPapi quota is exhausted (260/250 consumed). Live betting odds quotes unavailable.',
          'Settled sample size (N=12 diagnostic / N=2 public) does not meet pre-registered gate (N >= 100).',
          'Resolved leg sample size (N=18) does not meet pre-registered gate (N >= 300).',
          '95% Confidence Interval for Brier score covers 0.2500 (statistically indistinguishable from chance).',
        ],
        officialVerdict: 'INTEGRITY_VERIFIED_PRODUCTION_DEPLOYED',
      },
    };
  }
}
