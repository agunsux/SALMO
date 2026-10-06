// SALMO.DEV — Production Performance & Evidence Metrics Engine
// Implements strict settlement accounting, green cohort headline isolation,
// and statistical sample size thresholds (n < 30 labeled INSUFFICIENT SAMPLE).
// Invariants:
// 1. Headline cohort: green_cohort = true (confidence > 70).
// 2. Units staked: WIN, LOSS, PUSH, HALF_WIN, HALF_LOSS count 1.0 unit. PENDING and VOID count 0.
// 3. Profit: WIN (odds - 1), LOSS (-1), PUSH (0), HALF_WIN ((odds-1)/2), HALF_LOSS (-0.5), VOID (0).
// 4. ROI: (profit_units / units_staked) * 100. If units_staked === 0 -> ROI = null ("No settled bets").
// 5. Never conflate predicted EV with realized ROI.
// 6. Average CLV computed strictly over non-null observations.

import { SettlementOutcome } from '../../types/index';
import { SettlementStatus } from '../settlement/settlementEngine';

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
  greenCohort: boolean; // confidence > 70
  settlementStatus: SettlementStatus;
  result: SettlementOutcome | null;
  profitUnits: number;
  clvPct: number | null; // null if moved or missing
  settledAt?: string | null;
  createdAt?: string;
}

export interface MetricSummary {
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
}

export interface FullPerformanceReport {
  headlineGreenCohort: MetricSummary;
  controlFullCohort: MetricSummary;
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
  public static aggregateMetrics(positions: LedgerPositionSnapshot[]): MetricSummary {
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

    for (const pos of positions) {
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
      positions.length > 0 ? Number((totalEv / positions.length).toFixed(2)) : null;
    const avgConfidence =
      positions.length > 0 ? Number((totalConf / positions.length).toFixed(1)) : null;
    const avgClvPct = nClv > 0 ? Number((totalClv / nClv).toFixed(2)) : null;

    return {
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
    };
  }

  /**
   * Build complete performance report including Green Cohort isolation and breakdowns.
   */
  public static generateReport(allPositions: LedgerPositionSnapshot[]): FullPerformanceReport {
    const greenPositions = allPositions.filter(p => p.greenCohort === true);

    const headlineGreenCohort = this.aggregateMetrics(greenPositions);
    const controlFullCohort = this.aggregateMetrics(allPositions);

    // Breakdowns on green cohort (headline universe)
    const targetCohort = greenPositions;

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
      controlFullCohort,
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
