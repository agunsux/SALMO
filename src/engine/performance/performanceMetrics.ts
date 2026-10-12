// SALMO.DEV — Production Performance & Evidence Metrics Engine
// Implements strict settlement accounting, qualified public pick cohort isolation,
// binary no-push per-leg Brier scoring, and statistical sample size thresholds (n < 30 labeled INSUFFICIENT SAMPLE).
// Invariants:
// 1. Headline cohort (greenCohort): strictly rows with is_pick === true AND verdict === 'LAYAK' (no confidence > 70 fallback).
// 2. All-rows flat-stake diagnostic cohort: explicitly labeled MODEL_ALL_ROWS_DIAGNOSTIC (NOT PUBLIC PICKS).
// 3. Units staked: WIN, LOSS, PUSH, HALF_WIN, HALF_LOSS count 1.0 unit. PENDING and VOID count 0.
// 4. Profit: WIN (odds - 1), LOSS (-1), PUSH (0), HALF_WIN ((odds-1)/2), HALF_LOSS (-0.5), VOID (0).
// 5. ROI: (profit_units / units_staked) * 100. If units_staked === 0 -> ROI = null ("No settled bets").
// 6. Brier: binary no-push scoring per leg; quarter-lines decomposed into two half-stake legs, push legs excluded.
// 7. Never conflate predicted EV with realized ROI.
// 8. Average CLV computed strictly over non-null observations.

import { SettlementOutcome } from '../../types/index';
import { SettlementStatus } from '../settlement/settlementEngine';
import { BrierLegEvaluation, PositionBrierDecomposition } from './brierScoring';

export const DIAGNOSTIC_ALL_ROWS_COHORT_LABEL = 'MODEL_ALL_ROWS_DIAGNOSTIC (NOT PUBLIC PICKS)' as const;
export const QUALIFIED_PUBLIC_PICKS_COHORT_LABEL = 'QUALIFIED_PUBLIC_PICKS' as const;

export interface LedgerPositionSnapshot {
  ledgerPositionId: string;
  fixtureId: string;
  marketType: 'AH' | 'OU';
  selection: string;
  line: number;
  stakeUnits: number; // 1.0
  marketOdds: number;
  fairOdds: number;
  pWin: number;
  pPush: number;
  pLoss: number;
  confidence: number; // 0 - 100
  edge: number;
  expectedValuePct: number;
  greenCohort: boolean; // strictly is_pick === true && verdict === 'LAYAK'
  is_pick?: boolean;
  isPick?: boolean;
  isDailyPick?: boolean;
  verdict?: string | null;
  settlementStatus: SettlementStatus;
  result: SettlementOutcome | null;
  profitUnits: number;
  clvPct: number | null; // null if moved or missing
  brierDecomposition?: PositionBrierDecomposition | null;
  brierLegs?: BrierLegEvaluation[];
  settledAt?: string | null;
  createdAt?: string;
}

/**
 * Evaluates whether a row qualifies for the public pick cohort (greenCohort).
 * Hotfix H8 Rule 2: Removes the `confidence > 70` fallback; strictly requires `is_pick === true` and `verdict === 'LAYAK'`.
 */
export function isQualifiedPublicPickCohort(row: {
  is_pick?: boolean;
  isPick?: boolean;
  isDailyPick?: boolean;
  verdict?: string | null;
  greenCohort?: boolean;
}): boolean {
  if (
    row.is_pick !== undefined ||
    row.isPick !== undefined ||
    row.isDailyPick !== undefined ||
    row.verdict !== undefined
  ) {
    const isPick = row.is_pick === true || row.isPick === true || row.isDailyPick === true;
    const isLayak = String(row.verdict || '').toUpperCase() === 'LAYAK';
    return isPick && isLayak;
  }
  return row.greenCohort === true;
}

export interface MetricSummary {
  cohortLabel?: string;
  n: number;
  sampleStatus: 'SUFFICIENT' | 'INSUFFICIENT SAMPLE';
  unitsStaked: number;
  profitUnits: number;
  roi: number | null; // Percentage e.g. 5.2%, or null if unitsStaked === 0
  yield: number | null;
  displayStatus: string;
  wins: number;
  losses: number;
  pushes: number;
  halfWins: number;
  halfLosses: number;
  voids: number;
  pending: number;
  settled: number;
  avgPredictedEvPct: number | null;
  avgConfidence: number | null;
  avgClvPct: number | null;
  nClv: number;
  brierScore?: number | null;
  brierStakeWeighted?: number | null;
  nBrierLegsTotal?: number;
  nBrierLegsResolved?: number;
  nBrierLegsExcludedPush?: number;
}

export interface FullPerformanceReport {
  headlineGreenCohort: MetricSummary;
  greenCohortHeadline?: MetricSummary;
  controlFullCohort: MetricSummary;
  modelAllRowsDiagnostic?: MetricSummary;
  breakdowns: {
    byMarket: {
      AH: MetricSummary;
      OU: MetricSummary;
    };
    byConfidence: {
      '71-79': MetricSummary;
      '80-89': MetricSummary;
      '90+': MetricSummary;
    };
    byEv: {
      '0-2.99%': MetricSummary;
      '3-4.99%': MetricSummary;
      '5-9.99%': MetricSummary;
      '10%+': MetricSummary;
    };
    byOdds: {
      '< 1.80': MetricSummary;
      '1.80-1.99': MetricSummary;
      '2.00-2.19': MetricSummary;
      '2.20+': MetricSummary;
    };
  };
  generatedAt: string;
}

export class PerformanceMetricsEngine {
  public static readonly MIN_SAMPLE_SIZE = 30;

  /**
   * Aggregate metrics for an arbitrary list of positions.
   */
  public static aggregateMetrics(
    positions: LedgerPositionSnapshot[],
    cohortLabel?: string
  ): MetricSummary {
    const seenPositionIds = new Set<string>();
    const uniquePositions: LedgerPositionSnapshot[] = [];
    for (const pos of positions) {
      if (pos.ledgerPositionId) {
        if (seenPositionIds.has(pos.ledgerPositionId)) continue;
        seenPositionIds.add(pos.ledgerPositionId);
      }
      uniquePositions.push(pos);
    }

    let unitsStaked = 0;
    let profitUnits = 0;
    let wins = 0;
    let losses = 0;
    let pushes = 0;
    let halfWins = 0;
    let halfLosses = 0;
    let voids = 0;
    let pending = 0;
    let settled = 0;

    let totalEv = 0;
    let totalConf = 0;
    let totalClv = 0;
    let nClv = 0;

    let nBrierLegsTotal = 0;
    let nBrierLegsResolved = 0;
    let nBrierLegsExcludedPush = 0;
    let brierLegSqErrorSum = 0;
    let brierWeightedSqErrorSum = 0;
    let brierWeightSum = 0;

    for (const pos of uniquePositions) {
      totalEv += pos.expectedValuePct;
      totalConf += pos.confidence;

      if (pos.clvPct !== null && pos.clvPct !== undefined && Number.isFinite(pos.clvPct)) {
        totalClv += pos.clvPct;
        nClv++;
      }

      if (pos.settlementStatus === 'PENDING') {
        pending++;
        continue;
      }

      if (pos.settlementStatus === 'VOID' || pos.result === 'VOID') {
        voids++;
        continue; // VOID excluded from denominator stakes and profit
      }

      // Settled bets
      settled++;
      unitsStaked += 1.0;
      profitUnits += pos.profitUnits;

      const legs = pos.brierDecomposition?.legs || pos.brierLegs || [];
      const seenLegKeys = new Set<string>();
      for (const leg of legs) {
        const legKey = `${leg.legIndex ?? 0}_${Number(leg.legLine ?? 0).toFixed(2)}`;
        if (seenLegKeys.has(legKey)) continue;
        seenLegKeys.add(legKey);

        nBrierLegsTotal++;
        if (
          leg.excludedPush ||
          leg.brierSqError === null ||
          !Number.isFinite(leg.brierSqError) ||
          !Number.isFinite(leg.pLegNoPush) ||
          leg.pLegNoPush <= 0 ||
          leg.pLegNoPush >= 1
        ) {
          nBrierLegsExcludedPush++;
        } else {
          nBrierLegsResolved++;
          brierLegSqErrorSum += leg.brierSqError;
          brierWeightedSqErrorSum += leg.stakeWeight * leg.brierSqError;
          brierWeightSum += leg.stakeWeight;
        }
      }

      switch (pos.result) {
        case 'WIN':
          wins++;
          break;
        case 'LOSS':
          losses++;
          break;
        case 'PUSH':
          pushes++;
          break;
        case 'HALF_WIN':
          halfWins++;
          break;
        case 'HALF_LOSS':
          halfLosses++;
          break;
      }
    }

    const n = settled;
    const sampleStatus: 'SUFFICIENT' | 'INSUFFICIENT SAMPLE' =
      n >= this.MIN_SAMPLE_SIZE ? 'SUFFICIENT' : 'INSUFFICIENT SAMPLE';

    let roi: number | null = null;
    let displayStatus = 'No settled bets';

    if (unitsStaked > 0) {
      roi = Number(((profitUnits / unitsStaked) * 100).toFixed(2));
      displayStatus = `${roi >= 0 ? '+' : ''}${roi.toFixed(2)}% ROI`;
    }

    const avgPredictedEvPct =
      uniquePositions.length > 0 ? Number((totalEv / uniquePositions.length).toFixed(2)) : null;
    const avgConfidence =
      uniquePositions.length > 0 ? Number((totalConf / uniquePositions.length).toFixed(1)) : null;
    const avgClvPct = nClv > 0 ? Number((totalClv / nClv).toFixed(2)) : null;

    const brierScore =
      nBrierLegsResolved > 0 ? Number((brierLegSqErrorSum / nBrierLegsResolved).toFixed(4)) : null;
    const brierStakeWeighted =
      brierWeightSum > 0 ? Number((brierWeightedSqErrorSum / brierWeightSum).toFixed(4)) : null;

    return {
      ...(cohortLabel ? { cohortLabel } : {}),
      n,
      sampleStatus,
      unitsStaked: Number(unitsStaked.toFixed(2)),
      profitUnits: Number(profitUnits.toFixed(4)),
      roi,
      yield: roi, // With 1-unit stakes, yield is identical to ROI
      displayStatus,
      wins,
      losses,
      pushes,
      halfWins,
      halfLosses,
      voids,
      pending,
      settled,
      avgPredictedEvPct,
      avgConfidence,
      avgClvPct,
      nClv,
      brierScore,
      brierStakeWeighted,
      nBrierLegsTotal,
      nBrierLegsResolved,
      nBrierLegsExcludedPush,
    };
  }

  /**
   * Build complete performance report including Green Cohort isolation and breakdowns.
   */
  public static generateReport(allPositions: LedgerPositionSnapshot[]): FullPerformanceReport {
    const greenPositions = allPositions.filter(p => isQualifiedPublicPickCohort(p));

    const headlineGreenCohort = this.aggregateMetrics(
      greenPositions,
      QUALIFIED_PUBLIC_PICKS_COHORT_LABEL
    );
    const controlFullCohort = this.aggregateMetrics(
      allPositions,
      DIAGNOSTIC_ALL_ROWS_COHORT_LABEL
    );

    // Breakdowns on green cohort (headline universe), fallback to allPositions if green cohort empty
    const targetCohort = greenPositions.length > 0 ? greenPositions : allPositions;

    const byMarket = {
      AH: this.aggregateMetrics(targetCohort.filter(p => p.marketType === 'AH')),
      OU: this.aggregateMetrics(targetCohort.filter(p => p.marketType === 'OU')),
    };

    const byConfidence = {
      '71-79': this.aggregateMetrics(targetCohort.filter(p => p.confidence >= 71 && p.confidence <= 79)),
      '80-89': this.aggregateMetrics(targetCohort.filter(p => p.confidence >= 80 && p.confidence <= 89)),
      '90+': this.aggregateMetrics(targetCohort.filter(p => p.confidence >= 90)),
    };

    const byEv = {
      '0-2.99%': this.aggregateMetrics(targetCohort.filter(p => p.expectedValuePct >= 0 && p.expectedValuePct < 3.0)),
      '3-4.99%': this.aggregateMetrics(targetCohort.filter(p => p.expectedValuePct >= 3.0 && p.expectedValuePct < 5.0)),
      '5-9.99%': this.aggregateMetrics(targetCohort.filter(p => p.expectedValuePct >= 5.0 && p.expectedValuePct < 10.0)),
      '10%+': this.aggregateMetrics(targetCohort.filter(p => p.expectedValuePct >= 10.0)),
    };

    const byOdds = {
      '< 1.80': this.aggregateMetrics(targetCohort.filter(p => p.marketOdds < 1.80)),
      '1.80-1.99': this.aggregateMetrics(targetCohort.filter(p => p.marketOdds >= 1.80 && p.marketOdds < 2.00)),
      '2.00-2.19': this.aggregateMetrics(targetCohort.filter(p => p.marketOdds >= 2.00 && p.marketOdds < 2.20)),
      '2.20+': this.aggregateMetrics(targetCohort.filter(p => p.marketOdds >= 2.20)),
    };

    return {
      headlineGreenCohort,
      greenCohortHeadline: headlineGreenCohort,
      controlFullCohort,
      modelAllRowsDiagnostic: controlFullCohort,
      breakdowns: {
        byMarket,
        byConfidence,
        byEv,
        byOdds,
      },
      generatedAt: new Date().toISOString(),
    };
  }
}
