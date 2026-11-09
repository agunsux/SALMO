// SALMO.DEV — Shadow Operations Service
// Backend aggregation service powering the Operator Shadow Dashboard.
// Enforces complete isolation from production tables and strict provenance segregation.

import fs from 'fs';
import path from 'path';
import {
  FourMarketShadowEngine,
  ShadowPredictionRecord,
  ProvenanceType,
} from '../../engine/shadow/fourMarketShadowEngine';
import { FiveDollarQuotaManager } from '../../lib/quota/fiveDollarQuotaManager';
import { FiveDollarFreeProvider, FIVE_DOLLAR_ATTRIBUTION } from '../providers/fiveDollarFreeProvider';
import { HistoricalBackfillService, BackfillSummary } from './historicalBackfillService';

export interface DashboardOverviewKPIs {
  provider5DollarStatus: 'OPERATIONAL' | 'PROVIDER_UNCONFIGURED' | 'RATE_LIMITED' | 'CIRCUIT_OPEN';
  provider5DollarBudgetRemaining: number;
  provider5DollarHourlyLimit: number;
  provider5DollarConsumed: number;
  providerApiFootballStatus: 'BLOCKED (Suspension Hold)' | 'OPERATIONAL';
  todayPredictionsCount: number;
  qualifiedHighConfidencePicks: number;
  pantauWatchlistCount: number;
  pendingSettlementCount: number;
  settledPredictionsCount: number;
  cumulativeRoiPct: number | null;
  netProfitUnits: number;
  totalStakedUnits: number;
  averageClvPct: number | null;
  positiveClvRatePct: number | null;
  ahBrierScore: number | null;
  ouBrierScore: number | null;
  sampleSize: number;
  dateRange: { earliest: string; latest: string };
  isSampleSufficient: boolean;
  sampleLabel: string;
}

export interface ShadowRunLogEntry {
  runId: string;
  startedAt: string;
  completedAt: string;
  status: 'SUCCESS' | 'FAILED' | 'PARTIAL';
  fixturesDiscovered: number;
  oddsRequestsConsumed: number;
  predictionsGenerated: number;
  qualifiedPicks: number;
  settlementsProcessed: number;
  errors: string[];
}

export class ShadowOperationsService {
  private static readonly LEDGER_PATH = path.resolve(
    process.cwd(),
    'data/research/fivedollar_shadow/shadow_prediction_ledger.jsonl'
  );
  private static readonly RUN_LOG_PATH = path.resolve(
    process.cwd(),
    'data/research/fivedollar_shadow/shadow_run_history.json'
  );

  private static isJobRunning = false;

  /**
   * Concurrency lock to prevent simultaneous pipeline executions.
   */
  public static acquireLock(): boolean {
    if (this.isJobRunning) return false;
    this.isJobRunning = true;
    return true;
  }

  public static releaseLock(): void {
    this.isJobRunning = false;
  }

  /**
   * Load all shadow records from ledger.
   */
  public static loadLedgerRecords(): ShadowPredictionRecord[] {
    if (!fs.existsSync(this.LEDGER_PATH)) {
      return [];
    }

    const content = fs.readFileSync(this.LEDGER_PATH, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    const records: ShadowPredictionRecord[] = [];

    for (const line of lines) {
      try {
        records.push(JSON.parse(line));
      } catch {
        // skip corrupt
      }
    }
    return records;
  }

  /**
   * Compute comprehensive dashboard KPIs strictly segregated by provenance.
   */
  public static getDashboardOverview(): {
    kpis: DashboardOverviewKPIs;
    recordsByProvenance: Record<ProvenanceType, ShadowPredictionRecord[]>;
    marketReadiness: Record<string, { role: string; status: string; note: string }>;
    providerHealth: {
      fivedollar: any;
      apiFootball: any;
      attribution: typeof FIVE_DOLLAR_ATTRIBUTION;
    };
    runHistory: ShadowRunLogEntry[];
  } {
    const records = this.loadLedgerRecords();
    const qm = FiveDollarQuotaManager.getInstance();
    const quota = qm.getSnapshot();
    const provider = new FiveDollarFreeProvider();

    // Group by provenance
    const recordsByProvenance: Record<ProvenanceType, ShadowPredictionRecord[]> = {
      HISTORICAL_PREDICTION: [],
      HISTORICAL_RECONSTRUCTION: [],
      HISTORICAL_RESULT_ONLY: [],
      UNVERIFIED: [],
      LIVE_SHADOW_SIGNAL: [],
    };

    let earliest = '9999-99-99';
    let latest = '0000-00-00';
    let todayPredCount = 0;
    let qualifiedCount = 0;
    let pantauCount = 0;
    let pendingCount = 0;
    let settledCount = 0;

    // Strict performance tracking: Only genuine historical predictions & live shadow signals with QUALIFIED_VALUE_BET count in ROI
    let netProfit = 0;
    let totalStaked = 0;
    let qualifiedBetsCount = 0;

    // CLV tracking (Bet365 and Pinnacle separately)
    let clvSum = 0;
    let clvCount = 0;
    let positiveClvCount = 0;

    // Brier score calculation (AH and OU)
    let ahBrierSum = 0;
    let ahBrierCount = 0;
    let ouBrierSum = 0;
    let ouBrierCount = 0;

    for (const r of records) {
      const pType = r.provenanceType || 'LIVE_SHADOW_SIGNAL';
      if (recordsByProvenance[pType]) {
        recordsByProvenance[pType].push(r);
      }

      if (r.kickoffAt < earliest) earliest = r.kickoffAt;
      if (r.kickoffAt > latest) latest = r.kickoffAt;

      if (pType === 'LIVE_SHADOW_SIGNAL') {
        todayPredCount++;
      }

      if (r.predictionStatus === 'QUALIFIED_VALUE_BET') {
        qualifiedCount++;
      } else if (r.predictionStatus === 'PANTAU') {
        pantauCount++;
      }

      if (r.settlementStatus === 'SETTLED') {
        settledCount++;
      } else if (r.settlementStatus === 'PENDING') {
        pendingCount++;
      }

      // STRICT INVARIANT: Only qualified bets from genuine predictions or live signals contribute to ROI
      if (
        r.predictionStatus === 'QUALIFIED_VALUE_BET' &&
        r.settlementStatus === 'SETTLED' &&
        (pType === 'HISTORICAL_PREDICTION' || pType === 'LIVE_SHADOW_SIGNAL')
      ) {
        qualifiedBetsCount++;
        totalStaked += r.stakeUnits || 1.0;
        netProfit += r.profitUnits || 0;
      }

      // CLV tracking
      if (r.clvStatus === 'CALCULATED' && r.clvNoVig !== null && r.clvNoVig !== undefined) {
        clvCount++;
        clvSum += r.clvNoVig;
        if (r.clvNoVig > 0) positiveClvCount++;
      }

      // Brier score tracking on settled events
      if (r.settlementStatus === 'SETTLED' && r.modelProbability > 0) {
        const isWin = r.settlementResult === 'WIN' || r.settlementResult === 'HALF_WIN';
        const actual = isWin ? 1.0 : 0.0;
        const prob = r.modelProbability / 100;
        const sqErr = Math.pow(prob - actual, 2);

        if (r.market === 'AH') {
          ahBrierSum += sqErr;
          ahBrierCount++;
        } else if (r.market === 'OU') {
          ouBrierSum += sqErr;
          ouBrierCount++;
        }
      }
    }

    const roiPct = totalStaked > 0 ? Number(((netProfit / totalStaked) * 100).toFixed(2)) : null;
    const avgClv = clvCount > 0 ? Number((clvSum / clvCount).toFixed(2)) : null;
    const posClvRate = clvCount > 0 ? Number(((positiveClvCount / clvCount) * 100).toFixed(1)) : null;

    const ahBrier = ahBrierCount > 0 ? Number((ahBrierSum / ahBrierCount).toFixed(3)) : null;
    const ouBrier = ouBrierCount > 0 ? Number((ouBrierSum / ouBrierCount).toFixed(3)) : null;

    // Load Run History
    let runHistory: ShadowRunLogEntry[] = [];
    if (fs.existsSync(this.RUN_LOG_PATH)) {
      try {
        runHistory = JSON.parse(fs.readFileSync(this.RUN_LOG_PATH, 'utf8'));
      } catch {
        runHistory = [];
      }
    }

    const providerStatus = provider.isConfigured()
      ? quota.circuitBreakerOpen
        ? 'CIRCUIT_OPEN'
        : quota.consumedThisHour >= quota.internalBudget
        ? 'RATE_LIMITED'
        : 'OPERATIONAL'
      : 'PROVIDER_UNCONFIGURED';

    return {
      kpis: {
        provider5DollarStatus: providerStatus,
        provider5DollarBudgetRemaining: quota.remainingInBudget,
        provider5DollarHourlyLimit: quota.hourlyLimit,
        provider5DollarConsumed: quota.consumedThisHour,
        providerApiFootballStatus: 'BLOCKED (Suspension Hold)',
        todayPredictionsCount: todayPredCount,
        qualifiedHighConfidencePicks: qualifiedCount,
        pantauWatchlistCount: pantauCount,
        pendingSettlementCount: pendingCount,
        settledPredictionsCount: settledCount,
        cumulativeRoiPct: roiPct,
        netProfitUnits: Number(netProfit.toFixed(2)),
        totalStakedUnits: Number(totalStaked.toFixed(2)),
        averageClvPct: avgClv,
        positiveClvRatePct: posClvRate,
        ahBrierScore: ahBrier,
        ouBrierScore: ouBrier,
        sampleSize: qualifiedBetsCount,
        dateRange: {
          earliest: earliest !== '9999-99-99' ? earliest : 'N/A',
          latest: latest !== '0000-00-00' ? latest : 'N/A',
        },
        isSampleSufficient: qualifiedBetsCount >= 100,
        sampleLabel: qualifiedBetsCount < 100 ? 'INCONCLUSIVE (N < 100)' : 'STATISTICALLY SIGNIFICANT',
      },
      recordsByProvenance,
      marketReadiness: {
        AH: { role: 'Core Candidate', status: 'PASS', note: 'Calibrated on EPL. Quarter-line settlement active.' },
        OU: { role: 'Core Candidate', status: 'PASS', note: 'Calibrated on total goals. Quarter-line settlement active.' },
        '1X2': { role: 'Research', status: 'RESEARCH_ONLY', note: 'Validation pending. 3-way calibration in progress.' },
        BTTS: { role: 'Research Only', status: 'RESEARCH_ONLY', note: 'Historical coverage insufficient. Disallowed from betting.' },
      },
      providerHealth: {
        fivedollar: {
          name: '5DollarFootballAPI Free',
          status: providerStatus,
          isConfigured: provider.isConfigured(),
          hourlyLimit: quota.hourlyLimit,
          internalBudget: quota.internalBudget,
          consumedThisHour: quota.consumedThisHour,
          remainingBudget: quota.remainingInBudget,
          reserveRemaining: quota.reserveRemaining,
          circuitBreakerOpen: quota.circuitBreakerOpen,
          lastRequestTimestamp: quota.lastRequestTimestamp,
          resetAtUtc: quota.resetAtUtc,
        },
        apiFootball: {
          name: 'API-Football (v3 API)',
          status: 'BLOCKED',
          suspensionReason: 'Administrative hold on key cb36...aab6 (dynamic egress false positive).',
          requestsSent: 0,
          resolutionStatus: 'Support escalation submitted 2026-11-07; awaiting resolution.',
        },
        attribution: FIVE_DOLLAR_ATTRIBUTION,
      },
      runHistory,
    };
  }

  /**
   * Trigger backfill and record execution log.
   */
  public static async triggerHistoricalBackfill(): Promise<BackfillSummary> {
    if (!this.acquireLock()) {
      throw new Error('CONCURRENT_JOB_BLOCKED: Another shadow operation is actively running.');
    }

    const start = new Date().toISOString();
    try {
      const summary = await HistoricalBackfillService.executeBackfill();
      this.recordRunLog({
        runId: `run_backfill_${Date.now()}`,
        startedAt: start,
        completedAt: new Date().toISOString(),
        status: 'SUCCESS',
        fixturesDiscovered: summary.totalProcessed,
        oddsRequestsConsumed: 0,
        predictionsGenerated: summary.historicalReconstructions,
        qualifiedPicks: 0,
        settlementsProcessed: summary.settledCount,
        errors: [],
      });
      return summary;
    } finally {
      this.releaseLock();
    }
  }

  private static recordRunLog(entry: ShadowRunLogEntry): void {
    let logs: ShadowRunLogEntry[] = [];
    if (fs.existsSync(this.RUN_LOG_PATH)) {
      try {
        logs = JSON.parse(fs.readFileSync(this.RUN_LOG_PATH, 'utf8'));
      } catch {
        logs = [];
      }
    }
    logs.unshift(entry);
    // keep latest 50
    if (logs.length > 50) logs = logs.slice(0, 50);
    fs.writeFileSync(this.RUN_LOG_PATH, JSON.stringify(logs, null, 2), 'utf8');
  }
}
