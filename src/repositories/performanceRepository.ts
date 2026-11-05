// src/repositories/performanceRepository.ts
// SALMO.DEV — Authoritative Performance Analytics Repository
// Computes verified production performance metrics directly from immutable decisions and settlement records.

import { PoolClient } from 'pg';
import { executeQuery } from './dbClient';

export interface PerformanceFilter {
  marketType?: 'AH' | 'OU' | 'ALL';
  competitionId?: number;
  modelVersion?: string;
  startDate?: string;
  endDate?: string;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW' | 'ALL';
  sourceType?: 'PROVIDER' | 'BACKFILL' | 'SIMULATION' | 'SYNTHETIC' | 'ALL';
  includeSimulations?: boolean;
}

export interface MetricBreakdown {
  totalDecisions: number;
  settledDecisions: number;
  pendingDecisions: number;
  wins: number;
  halfWins: number;
  pushes: number;
  halfLosses: number;
  losses: number;
  voids: number;
  totalStakeUnits: number;
  totalReturnsUnits: number;
  netProfitUnits: number;
  roiPct: number | null;
  winRatePct: number | null;
  avgOdds: number | null;
  avgExpectedValuePct: number | null;
  brierScore: number | null;
  logLoss: number | null;
  maxDrawdownUnits: number;
}

export interface FullPerformanceReport {
  timestampUtc: string;
  headline: MetricBreakdown;
  byMarket: {
    ah: MetricBreakdown;
    ou: MetricBreakdown;
  };
  byCompetition: Record<string, MetricBreakdown>;
  auditTrail: Array<{
    ledgerId: string;
    doiId: string;
    market: string;
    selection: string;
    line: number;
    odds: number;
    evPct: number;
    modelProb: number;
    result: string;
    profitUnits: number;
    settledAt: string;
  }>;
}

export class PerformanceRepository {
  /**
   * Calculates comprehensive performance analytics directly from PostgreSQL.
   */
  public static async calculatePerformance(
    filter: PerformanceFilter = {},
    client?: PoolClient
  ): Promise<FullPerformanceReport> {
    const conditions: string[] = ["data_status = 'ACTIVE'"];
    const params: any[] = [];
    let idx = 1;

    // Strict population separation: Never mix synthetic or local simulations into production aggregates
    if (!filter.includeSimulations && filter.sourceType !== 'SIMULATION' && filter.sourceType !== 'ALL') {
      conditions.push("source_type NOT IN ('SYNTHETIC', 'SIMULATION')");
    } else if (filter.sourceType && filter.sourceType !== 'ALL') {
      conditions.push(`source_type = $${idx++}`);
      params.push(filter.sourceType);
    }

    if (filter.marketType && filter.marketType !== 'ALL') {
      conditions.push(`market = $${idx++}`);
      params.push(filter.marketType);
    }

    if (filter.competitionId) {
      conditions.push(`competition_id = $${idx++}`);
      params.push(filter.competitionId);
    }

    if (filter.modelVersion) {
      conditions.push(`model_version = $${idx++}`);
      params.push(filter.modelVersion);
    }

    if (filter.startDate) {
      conditions.push(`kickoff_utc >= $${idx++}`);
      params.push(filter.startDate);
    }

    if (filter.endDate) {
      conditions.push(`kickoff_utc <= $${idx++}`);
      params.push(filter.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        id, doi_id, market, selection, line, odds_at_prediction,
        model_probability, expected_value_pct, confidence,
        result_status, roi, profit_loss, settled_at, kickoff_utc, competition_id
      FROM public.prediction_ledger
      ${whereClause}
      ORDER BY kickoff_utc ASC;
    `;

    const res = await executeQuery(sql, params, client);
    const rows = res.rows;

    const headline = this.computeBreakdown(rows);
    const ahRows = rows.filter(r => r.market === 'AH' || r.market === 'ASIAN_HANDICAP');
    const ouRows = rows.filter(r => r.market === 'OU' || r.market === 'OVER_UNDER');

    const byCompetition: Record<string, MetricBreakdown> = {};
    const compGroups = new Map<number, any[]>();
    for (const r of rows) {
      const cId = r.competition_id || 39;
      if (!compGroups.has(cId)) compGroups.set(cId, []);
      compGroups.get(cId)!.push(r);
    }
    for (const [cId, cRows] of compGroups.entries()) {
      const compLabel = cId === 39 ? 'EPL' : cId === 2 ? 'UCL' : `Comp_${cId}`;
      byCompetition[compLabel] = this.computeBreakdown(cRows);
    }

    const auditTrail = rows
      .filter(r => r.result_status && r.result_status !== 'pending')
      .map(r => ({
        ledgerId: r.id,
        doiId: r.doi_id,
        market: r.market,
        selection: r.selection,
        line: Number(r.line),
        odds: Number(r.odds_at_prediction),
        evPct: Number(r.expected_value_pct || 0),
        modelProb: Number(r.model_probability),
        result: r.result_status,
        profitUnits: Number(r.roi ?? r.profit_loss ?? 0),
        settledAt: r.settled_at || '',
      }));

    return {
      timestampUtc: new Date().toISOString(),
      headline,
      byMarket: {
        ah: this.computeBreakdown(ahRows),
        ou: this.computeBreakdown(ouRows),
      },
      byCompetition,
      auditTrail,
    };
  }

  private static computeBreakdown(rows: any[]): MetricBreakdown {
    let totalDecisions = rows.length;
    let settledDecisions = 0;
    let pendingDecisions = 0;
    let wins = 0;
    let halfWins = 0;
    let pushes = 0;
    let halfLosses = 0;
    let losses = 0;
    let voids = 0;
    let totalStakeUnits = 0;
    let totalReturnsUnits = 0;
    let netProfitUnits = 0;
    let sumOdds = 0;
    let sumEv = 0;
    let brierSum = 0;
    let brierCount = 0;
    let logLossSum = 0;
    let logLossCount = 0;

    let runningBalance = 0;
    let peakBalance = 0;
    let maxDrawdown = 0;

    for (const r of rows) {
      const odds = Number(r.odds_at_prediction || 0);
      const ev = Number(r.expected_value_pct || 0);
      const pModel = Number(r.model_probability || 0.5);
      const res = r.result_status;

      if (odds > 0) sumOdds += odds;
      sumEv += ev;

      if (!res || res === 'pending') {
        pendingDecisions++;
        continue;
      }

      settledDecisions++;
      const profit = Number(r.roi ?? r.profit_loss ?? 0);

      if (res === 'VOID') {
        voids++;
        // Void returns 0 stake units
      } else {
        totalStakeUnits += 1.0;
        netProfitUnits += profit;
        totalReturnsUnits += (1.0 + profit);

        runningBalance += profit;
        if (runningBalance > peakBalance) {
          peakBalance = runningBalance;
        }
        const currentDrawdown = peakBalance - runningBalance;
        if (currentDrawdown > maxDrawdown) {
          maxDrawdown = currentDrawdown;
        }

        let actualOutcomeNumeric = 0;
        if (res === 'WIN') {
          wins++;
          actualOutcomeNumeric = 1;
        } else if (res === 'HALF_WIN') {
          halfWins++;
          actualOutcomeNumeric = 0.75;
        } else if (res === 'PUSH') {
          pushes++;
          actualOutcomeNumeric = 0.5;
        } else if (res === 'HALF_LOSS') {
          halfLosses++;
          actualOutcomeNumeric = 0.25;
        } else if (res === 'LOSS') {
          losses++;
          actualOutcomeNumeric = 0;
        }

        // Brier & Log Loss calibration metrics (strictly non-push binary evaluations)
        if (res !== 'PUSH') {
          const isWin = (res === 'WIN' || res === 'HALF_WIN') ? 1 : 0;
          brierSum += Math.pow(pModel - isWin, 2);
          brierCount++;

          const eps = 1e-6;
          const clampedP = Math.max(eps, Math.min(1 - eps, pModel));
          logLossSum += isWin === 1 ? -Math.log(clampedP) : -Math.log(1 - clampedP);
          logLossCount++;
        }
      }
    }

    const roiPct = totalStakeUnits > 0
      ? Number(((netProfitUnits / totalStakeUnits) * 100).toFixed(2))
      : null;

    const winRatePct = settledDecisions - voids > 0
      ? Number((((wins + 0.5 * halfWins) / (settledDecisions - voids)) * 100).toFixed(2))
      : null;

    return {
      totalDecisions,
      settledDecisions,
      pendingDecisions,
      wins,
      halfWins,
      pushes,
      halfLosses,
      losses,
      voids,
      totalStakeUnits: Number(totalStakeUnits.toFixed(2)),
      totalReturnsUnits: Number(totalReturnsUnits.toFixed(4)),
      netProfitUnits: Number(netProfitUnits.toFixed(4)),
      roiPct,
      winRatePct,
      avgOdds: totalDecisions > 0 ? Number((sumOdds / totalDecisions).toFixed(2)) : null,
      avgExpectedValuePct: totalDecisions > 0 ? Number((sumEv / totalDecisions).toFixed(2)) : null,
      brierScore: brierCount > 0 ? Number((brierSum / brierCount).toFixed(4)) : null,
      logLoss: logLossCount > 0 ? Number((logLossSum / logLossCount).toFixed(4)) : null,
      maxDrawdownUnits: Number(maxDrawdown.toFixed(2)),
    };
  }
}
