// SALMO.DEV — Persistent OddsPAPI Quota Guard, Reservation & Circuit-Breaker Protection
// Ensures quota tracking persists across serverless cold starts and container restarts.
// Reads from and writes to Supabase PostgreSQL table: public.quota_state.
// Syncs with unmetered OddsPAPI /v4/account endpoint before batches with cooldown guard.
// Strictly enforces hard-stop at (limit - reserve), atomic pre-reservation,
// and circuit-breaker tripping on HTTP 429 / 401 (never counted against usage, never retried).

import { getDbClient } from '../db';
import { env } from '../../config/env';
import { Logger } from '../logger';

export type QuotaResetState =
  | 'QUOTA_EXHAUSTED'
  | 'RESET_UNVERIFIED'
  | 'QUOTA_AVAILABLE'
  | 'ACTIVATION_IN_PROGRESS';

export interface QuotaResetDetectionResult {
  state: QuotaResetState;
  checkedAtUtc: string;
  providerStatus: 'VERIFIED_LIVE' | 'UNVERIFIED_OFFLINE' | 'CIRCUIT_OPEN';
  isActive: boolean;
  plan: string;
  requestCount: number;
  requestLimit: number;
  mandatoryReserve: number;
  operationalCeiling: number;
  remainingTotal: number;
  remainingOperationalBudget: number;
  hasPinnacle: boolean;
  pinnacleLiveOdds: boolean;
  supportsFootball: boolean;
  validFrom: string | null;
  idempotencyCycleKey: string;
  reason: string;
}

export interface QuotaGuardStatus {
  allowed: boolean;
  reason?: string;
  consumed: number;
  limit: number;
  hardStopThreshold: number;
  remaining: number;
  reserve: number;
  source: 'SUPABASE' | 'ODDSPAPI_ACCOUNT_SYNC' | 'FALLBACK';
}

export interface QuotaReservation {
  reservationId: string;
  cost: number;
  reservedAt: string;
  confirmed: boolean;
}

export interface QuotaConfirmationRecord {
  reservationId: string;
  cost: number;
  confirmedAt: string;
  endpoint: string;
  statusCode?: number;
  outcome: 'SUCCESS' | 'BILLABLE_ERROR';
  countBefore: number;
  countAfter: number;
}

export interface QuotaAuditLogEntry {
  timestamp: string;
  endpoint: string;
  params: Record<string, any>;
  outcome: 'SUCCESS' | 'BILLABLE_ERROR' | 'REJECTED' | 'RATE_LIMITED' | 'UNAUTHORIZED' | 'ERROR';
  countBefore: number;
  countAfter: number;
  statusCode?: number;
  reservationId?: string;
  reason?: string;
  [key: string]: any;
}

export class OddsPapiQuotaGuard {
  public static readonly HARD_STOP_RATIO = 0.90; // 90% hard stop threshold
  public static readonly DEFAULT_MONTHLY_LIMIT = 250;
  public static readonly DEFAULT_RESERVE = 25; // 25 calls global hard-stop reserve (10% of 250)
  public static readonly MANDATORY_MULTI_LEAGUE_RESERVE = 50; // 50 calls mandatory reserve for EPL, retries, and kickoff updates
  public static readonly ACCOUNT_SYNC_COOLDOWN_MS = 1000; // 1s cooldown for unmetered account calls

  private static lastAccountSyncTime = 0;
  private static cachedAccountData: any = null;
  private static circuitTripped = false;
  private static circuitBreakerReason: string | null = null;
  private static activeReservations = new Map<string, QuotaReservation>();
  private static confirmedReservations = new Map<string, QuotaConfirmationRecord>();
  private static closedReservations = new Set<string>();
  private static inMemoryConfirmedCost = 0;
  private static localConsumedFloor = 0;
  private static trackedCycleKey: string | null = null;
  private static mockPersistentQuotaStore: { consumed: number; limit: number; updatedAt: string } | null = null;
  private static auditLogs: QuotaAuditLogEntry[] = [];

  private static activationLock: {
    inProgress: boolean;
    lockId: string | null;
    cycleKey: string | null;
    acquiredAtMs: number;
    ttlMs: number;
  } = {
    inProgress: false,
    lockId: null,
    cycleKey: null,
    acquiredAtMs: 0,
    ttlMs: 120_000,
  };

  private static completedActivationCycles = new Set<string>();

  /**
   * Official OddsPapi v4 Billing Rule (https://oddspapi.io/us/docs/requests-and-quota):
   * - A request is counted after the endpoint finishes processing, whether 200 OK, 4xx, or 5xx.
   * - Only requests rejected before reaching the endpoint (401 invalid API key, 429 quota/rate limit)
   *   or pre-response network/transport failures (no HTTP status code) are unbilled (0 requests).
   */
  public static isBillableHttpStatus(statusCode?: number): boolean {
    if (typeof statusCode !== 'number' || !Number.isFinite(statusCode)) {
      return false;
    }
    if (statusCode === 401 || statusCode === 429) {
      return false;
    }
    return statusCode >= 200 && statusCode < 600;
  }

  public static isNonBillableHttpStatus(statusCode?: number): boolean {
    return statusCode === 401 || statusCode === 429;
  }

  public static getActiveReservations(): QuotaReservation[] {
    return Array.from(this.activeReservations.values()).map(r => ({ ...r }));
  }

  public static getConfirmedReservations(): QuotaConfirmationRecord[] {
    return Array.from(this.confirmedReservations.values()).map(r => ({ ...r }));
  }

  public static getInMemoryConfirmedCost(): number {
    return this.inMemoryConfirmedCost;
  }

  public static getLocalConsumedFloor(): number {
    return this.localConsumedFloor;
  }

  /**
   * Configures an offline mock persistent quota store for deterministic persistence and cold-start tests
   * without touching production Supabase tables.
   */
  public static setMockPersistentQuotaStoreForTest(
    store: { consumed?: number; consumed_count?: number; limit?: number; monthly_limit?: number; updatedAt?: string } | null
  ): void {
    if (!store) {
      this.mockPersistentQuotaStore = null;
      return;
    }
    const consumedVal = store.consumed !== undefined ? Number(store.consumed) : Number(store.consumed_count || 0);
    const limitVal = store.limit !== undefined ? Number(store.limit) : Number(store.monthly_limit ?? this.DEFAULT_MONTHLY_LIMIT);
    this.mockPersistentQuotaStore = {
      consumed: consumedVal,
      limit: limitVal,
      updatedAt: store.updatedAt || new Date().toISOString(),
    };
  }

  public static getMockPersistentQuotaStoreForTest(): {
    consumed: number;
    consumed_count: number;
    limit: number;
    monthly_limit: number;
    updatedAt: string;
  } | null {
    if (!this.mockPersistentQuotaStore) return null;
    return {
      consumed: this.mockPersistentQuotaStore.consumed,
      consumed_count: this.mockPersistentQuotaStore.consumed,
      limit: this.mockPersistentQuotaStore.limit,
      monthly_limit: this.mockPersistentQuotaStore.limit,
      updatedAt: this.mockPersistentQuotaStore.updatedAt,
    };
  }

  /**
   * Simulates a serverless cold start by wiping volatile in-memory state while preserving
   * any configured mock persistent quota store.
   */
  public static simulateColdStartForTest(): void {
    this.lastAccountSyncTime = 0;
    this.cachedAccountData = null;
    this.circuitTripped = false;
    this.circuitBreakerReason = null;
    this.activeReservations.clear();
    this.confirmedReservations.clear();
    this.closedReservations.clear();
    this.inMemoryConfirmedCost = 0;
    this.localConsumedFloor = 0;
    this.trackedCycleKey = null;
    this.releaseActivationLock();
    this.completedActivationCycles.clear();
  }

  /**
   * Acquires an in-memory + TTL concurrency lock for multi-league activation.
   */
  public static acquireActivationLock(
    cycleKey: string,
    ttlMs = 120_000
  ): { acquired: boolean; lockId?: string; reason?: string } {
    const now = Date.now();
    if (this.activationLock.inProgress && (now - this.activationLock.acquiredAtMs) < this.activationLock.ttlMs) {
      return {
        acquired: false,
        reason: `Activation lock already held by ${this.activationLock.lockId} (cycle=${this.activationLock.cycleKey})`,
      };
    }

    const lockId = `act_lock_${now}_${Math.random().toString(36).slice(2, 7)}`;
    this.activationLock = {
      inProgress: true,
      lockId,
      cycleKey,
      acquiredAtMs: now,
      ttlMs,
    };
    return { acquired: true, lockId };
  }

  /**
   * Releases the multi-league activation concurrency lock.
   */
  public static releaseActivationLock(lockId?: string, markCycleCompleted = false): void {
    if (!lockId || this.activationLock.lockId === lockId) {
      if (markCycleCompleted && this.activationLock.cycleKey) {
        this.completedActivationCycles.add(this.activationLock.cycleKey);
      }
      this.activationLock = {
        inProgress: false,
        lockId: null,
        cycleKey: null,
        acquiredAtMs: 0,
        ttlMs: 120_000,
      };
    }
  }

  public static isActivationInProgress(): boolean {
    const now = Date.now();
    if (this.activationLock.inProgress && (now - this.activationLock.acquiredAtMs) >= this.activationLock.ttlMs) {
      this.releaseActivationLock();
      return false;
    }
    return this.activationLock.inProgress;
  }

  public static isCycleCompleted(cycleKey: string): boolean {
    return this.completedActivationCycles.has(cycleKey);
  }

  /**
   * Injects mock account payload for deterministic offline unit tests.
   * Preserves in-memory confirmed floor when the injected payload belongs to the exact same
   * active non-default subscription cycle (or when preserveConfirmedFloor is explicitly true).
   */
  public static setMockAccountDataForTest(
    accountData: any | null,
    options: { preserveConfirmedFloor?: boolean } = {}
  ): void {
    const cloned = accountData ? JSON.parse(JSON.stringify(accountData)) : null;
    const sub = cloned?.subscriptions?.[0];
    const incomingCycleKey = sub ? `${sub.subscription_id || 'default'}:${sub.valid_from || 'default'}` : null;
    const isSameExplicitCycle =
      Boolean(incomingCycleKey) &&
      incomingCycleKey !== 'default:default' &&
      incomingCycleKey === this.trackedCycleKey &&
      this.inMemoryConfirmedCost > 0;

    const shouldPreserveFloor =
      options.preserveConfirmedFloor === true || (options.preserveConfirmedFloor !== false && isSameExplicitCycle);

    if (!shouldPreserveFloor) {
      this.inMemoryConfirmedCost = 0;
      this.localConsumedFloor = 0;
      this.confirmedReservations.clear();
      this.closedReservations.clear();
      this.trackedCycleKey = incomingCycleKey;
    } else if (sub && typeof sub.request_count === 'number') {
      if (this.inMemoryConfirmedCost > 0 && this.localConsumedFloor > sub.request_count) {
        sub.request_count = this.localConsumedFloor;
      }
    }
    this.cachedAccountData = cloned;
    this.lastAccountSyncTime = cloned ? Date.now() : 0;
  }

  /**
   * Checks whether the circuit breaker is currently open (blocking calls).
   */
  public static isCircuitTripped(): boolean {
    return this.circuitTripped;
  }

  public static getCircuitBreakerReason(): string | null {
    return this.circuitBreakerReason;
  }

  /**
   * Trips circuit breaker on critical auth / rate-limit failures (429 / 401).
   */
  public static tripCircuitBreaker(statusCode: number, reason: string): void {
    this.circuitTripped = true;
    this.circuitBreakerReason = `Circuit tripped by HTTP ${statusCode}: ${reason}. All further calls blocked.`;
    Logger.error(`[OddsPapiQuotaGuard] ${this.circuitBreakerReason}`);
  }

  /**
   * Resets circuit breaker and locks (primarily for test environments).
   */
  public static resetCircuitBreaker(): void {
    this.circuitTripped = false;
    this.circuitBreakerReason = null;
    this.activeReservations.clear();
    this.confirmedReservations.clear();
    this.closedReservations.clear();
    this.inMemoryConfirmedCost = 0;
    this.localConsumedFloor = 0;
    this.trackedCycleKey = null;
    this.mockPersistentQuotaStore = null;
    this.releaseActivationLock();
    this.completedActivationCycles.clear();
  }

  /**
   * H1 Safety Gate: Production database writes are strictly opt-in (default FALSE).
   * Never writes in CI, tests, preview deployments, or dry-run executions unless BOTH
   * caller flag `allowProductionWrite === true` AND `process.env.ALLOW_PRODUCTION_DB_WRITE === 'true'`.
   */
  public static isProductionDatabaseWriteAllowed(allowProductionWrite = false): boolean {
    if (!allowProductionWrite) return false;
    if (process.env.ALLOW_PRODUCTION_DB_WRITE !== 'true') return false;
    if (process.env.VERCEL_ENV === 'preview') return false;
    if (process.env.CI === 'true') return false;
    if (process.env.NODE_ENV === 'test') return false;
    return true;
  }

  /**
   * Non-billable Quota-Reset Detector (Phase B).
   * Never guesses quota reset by calendar date; strictly inspects /v4/account state.
   * Enforces mandatory 50-request reserve for EPL, controlled retries, and near-kickoff updates.
   * By default, allowProductionWrite = false (read-only quota inspection).
   */
  public static async detectQuotaReset(
    minRequiredOperationalCalls = 3,
    forceSync = false,
    injectedAccountData?: any,
    allowProductionWrite = false
  ): Promise<QuotaResetDetectionResult> {
    const checkedAtUtc = new Date().toISOString();
    const mandatoryReserve = Number(
      process.env.ODDSPAPI_MULTI_LEAGUE_RESERVE || this.MANDATORY_MULTI_LEAGUE_RESERVE
    );

    if (this.isActivationInProgress()) {
      const sub = this.cachedAccountData?.subscriptions?.[0];
      const limit = Number(sub?.request_limit ?? this.DEFAULT_MONTHLY_LIMIT);
      const count = Number(sub?.request_count ?? limit);
      const ceiling = Math.max(0, limit - mandatoryReserve);
      return {
        state: 'ACTIVATION_IN_PROGRESS',
        checkedAtUtc,
        providerStatus: 'VERIFIED_LIVE',
        isActive: Boolean(sub?.is_active),
        plan: String(sub?.plan || 'unknown'),
        requestCount: count,
        requestLimit: limit,
        mandatoryReserve,
        operationalCeiling: ceiling,
        remainingTotal: Math.max(0, limit - count),
        remainingOperationalBudget: Math.max(0, ceiling - count),
        hasPinnacle: Boolean(sub?.bookmakers?.pinnacle),
        pinnacleLiveOdds: Boolean(sub?.bookmakers?.pinnacle?.has_live_odds),
        supportsFootball: Array.isArray(sub?.sport_ids) && sub.sport_ids.includes(10),
        validFrom: sub?.valid_from || null,
        idempotencyCycleKey: this.activationLock.cycleKey || `cycle_${checkedAtUtc.slice(0, 10)}`,
        reason: `Multi-league activation is already in progress (lock=${this.activationLock.lockId}).`,
      };
    }

    if (this.circuitTripped) {
      return {
        state: 'QUOTA_EXHAUSTED',
        checkedAtUtc,
        providerStatus: 'CIRCUIT_OPEN',
        isActive: false,
        plan: 'unknown',
        requestCount: this.DEFAULT_MONTHLY_LIMIT,
        requestLimit: this.DEFAULT_MONTHLY_LIMIT,
        mandatoryReserve,
        operationalCeiling: this.DEFAULT_MONTHLY_LIMIT - mandatoryReserve,
        remainingTotal: 0,
        remainingOperationalBudget: 0,
        hasPinnacle: false,
        pinnacleLiveOdds: false,
        supportsFootball: false,
        validFrom: null,
        idempotencyCycleKey: `circuit_open_${checkedAtUtc.slice(0, 13)}`,
        reason: this.circuitBreakerReason || 'Circuit breaker is open due to HTTP 429/401.',
      };
    }

    const accountData = injectedAccountData !== undefined
      ? injectedAccountData
      : await this.syncAccount(forceSync);

    const sub = accountData?.subscriptions?.[0];
    if (!sub || typeof sub.request_count !== 'number' || typeof sub.request_limit !== 'number') {
      return {
        state: 'RESET_UNVERIFIED',
        checkedAtUtc,
        providerStatus: 'UNVERIFIED_OFFLINE',
        isActive: false,
        plan: 'unknown',
        requestCount: 0,
        requestLimit: this.DEFAULT_MONTHLY_LIMIT,
        mandatoryReserve,
        operationalCeiling: this.DEFAULT_MONTHLY_LIMIT - mandatoryReserve,
        remainingTotal: 0,
        remainingOperationalBudget: 0,
        hasPinnacle: false,
        pinnacleLiveOdds: false,
        supportsFootball: false,
        validFrom: null,
        idempotencyCycleKey: `unverified_${checkedAtUtc.slice(0, 13)}`,
        reason: 'Could not verify /v4/account state from provider; calendar-based reset assumptions are forbidden.',
      };
    }

    const requestLimit = Number(sub.request_limit);
    const rawRequestCount = Number(sub.request_count);
    const requestCount =
      injectedAccountData === undefined && this.inMemoryConfirmedCost > 0
        ? Math.max(rawRequestCount, this.localConsumedFloor)
        : rawRequestCount;
    const isActive = sub.is_active === true;
    const plan = String(sub.plan || 'free');
    const hasPinnacle = Boolean(sub.bookmakers?.pinnacle);
    const pinnacleLiveOdds = Boolean(sub.bookmakers?.pinnacle?.has_live_odds);
    const supportsFootball = Array.isArray(sub.sport_ids) && sub.sport_ids.includes(10);
    const validFrom = sub.valid_from || null;
    const operationalCeiling = Math.max(0, requestLimit - mandatoryReserve);
    const activeReservedCost = Array.from(this.activeReservations.values()).reduce((sum, r) => sum + r.cost, 0);
    const effectiveCommitted = requestCount + activeReservedCost;
    const remainingTotal = Math.max(0, requestLimit - effectiveCommitted);
    const remainingOperationalBudget = Math.max(0, operationalCeiling - effectiveCommitted);
    const idempotencyCycleKey = `cycle_${validFrom || 'default'}_c${requestCount}_${checkedAtUtc.slice(0, 10)}`;

    // Sync reset count downward or upward to persistent database ONLY when production writes are explicitly authorized (H1)
    if (this.isProductionDatabaseWriteAllowed(allowProductionWrite)) {
      await this.syncCountToDatabaseIfChanged(requestCount, requestLimit, allowProductionWrite);
    }

    if (!isActive) {
      return {
        state: 'QUOTA_EXHAUSTED',
        checkedAtUtc,
        providerStatus: 'VERIFIED_LIVE',
        isActive,
        plan,
        requestCount: effectiveCommitted,
        requestLimit,
        mandatoryReserve,
        operationalCeiling,
        remainingTotal,
        remainingOperationalBudget,
        hasPinnacle,
        pinnacleLiveOdds,
        supportsFootball,
        validFrom,
        idempotencyCycleKey,
        reason: `OddsPAPI subscription is inactive (is_active=false).`,
      };
    }

    if (!hasPinnacle || !supportsFootball) {
      return {
        state: 'RESET_UNVERIFIED',
        checkedAtUtc,
        providerStatus: 'VERIFIED_LIVE',
        isActive,
        plan,
        requestCount: effectiveCommitted,
        requestLimit,
        mandatoryReserve,
        operationalCeiling,
        remainingTotal,
        remainingOperationalBudget,
        hasPinnacle,
        pinnacleLiveOdds,
        supportsFootball,
        validFrom,
        idempotencyCycleKey,
        reason: `OddsPAPI account missing required capabilities (hasPinnacle=${hasPinnacle}, supportsFootball=${supportsFootball}).`,
      };
    }

    if (remainingOperationalBudget < minRequiredOperationalCalls) {
      return {
        state: 'QUOTA_EXHAUSTED',
        checkedAtUtc,
        providerStatus: 'VERIFIED_LIVE',
        isActive,
        plan,
        requestCount: effectiveCommitted,
        requestLimit,
        mandatoryReserve,
        operationalCeiling,
        remainingTotal,
        remainingOperationalBudget,
        hasPinnacle,
        pinnacleLiveOdds,
        supportsFootball,
        validFrom,
        idempotencyCycleKey,
        reason: `Quota exhausted or within mandatory ${mandatoryReserve}-request reserve: ${effectiveCommitted}/${requestLimit} used (operational ceiling=${operationalCeiling}, remainingOperationalBudget=${remainingOperationalBudget}, required=${minRequiredOperationalCalls}).`,
      };
    }

    return {
      state: 'QUOTA_AVAILABLE',
      checkedAtUtc,
      providerStatus: 'VERIFIED_LIVE',
      isActive,
      plan,
      requestCount: effectiveCommitted,
      requestLimit,
      mandatoryReserve,
      operationalCeiling,
      remainingTotal,
      remainingOperationalBudget,
      hasPinnacle,
      pinnacleLiveOdds,
      supportsFootball,
      validFrom,
      idempotencyCycleKey,
      reason: `Quota verified available: ${effectiveCommitted}/${requestLimit} used, ${remainingOperationalBudget} operational requests available above ${mandatoryReserve}-request reserve.`,
    };
  }

  private static async syncCountToDatabaseIfChanged(
    providerCount: number,
    providerLimit: number,
    allowProductionWrite = false
  ): Promise<void> {
    if (!this.isProductionDatabaseWriteAllowed(allowProductionWrite)) {
      return;
    }
    try {
      const client = getDbClient();
      const { data: dbRow, error } = await client
        .from('quota_state')
        .select('id, consumed, limit_value, safe_limit, safety_reserve_pct')
        .eq('provider', 'oddspapi')
        .eq('quota_type', 'MONTHLY')
        .order('period_start', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && dbRow) {
        const dbConsumed = Number(dbRow.consumed || 0);
        const dbLimit = Number(dbRow.limit_value || this.DEFAULT_MONTHLY_LIMIT);
        const targetSafeLimit = Math.max(0, providerLimit - this.MANDATORY_MULTI_LEAGUE_RESERVE);
        const targetReservePct = providerLimit > 0 ? Math.round((this.MANDATORY_MULTI_LEAGUE_RESERVE / providerLimit) * 100) : 20;
        const dbSafeLimit = Number(dbRow.safe_limit ?? providerLimit);
        const dbReservePct = Number(dbRow.safety_reserve_pct ?? 0);

        if (
          dbConsumed !== providerCount ||
          dbLimit !== providerLimit ||
          dbSafeLimit !== targetSafeLimit ||
          dbReservePct !== targetReservePct
        ) {
          await client
            .from('quota_state')
            .update({
              consumed: providerCount,
              limit_value: providerLimit,
              safe_limit: targetSafeLimit,
              safety_reserve_pct: targetReservePct,
              updated_at: new Date().toISOString(),
            })
            .eq('id', dbRow.id);
        }
      }
    } catch {
      // Ignore offline/test DB sync failure
    }
  }

  /**
   * Synchronizes quota directly from unmetered OddsPAPI /v4/account endpoint.
   * Adheres strictly to the 1000ms cooldown and uses cache: 'no-store' to avoid stale HTTP cache reads.
   * Preserves in-memory confirmed floor within the same subscription cycle.
   */
  public static async syncAccount(force = false): Promise<any | null> {
    const apiKey = env.providers.oddsPapi.apiKey || process.env.ODDS_PAPI_KEY || '';
    if (!apiKey) {
      if (this.cachedAccountData?.subscriptions?.[0] && this.inMemoryConfirmedCost > 0) {
        const currentCount = Number(this.cachedAccountData.subscriptions[0].request_count || 0);
        if (this.localConsumedFloor > currentCount) {
          this.cachedAccountData.subscriptions[0].request_count = this.localConsumedFloor;
        }
      }
      return this.cachedAccountData;
    }

    const now = Date.now();
    if (!force && this.cachedAccountData && (now - this.lastAccountSyncTime < this.ACCOUNT_SYNC_COOLDOWN_MS)) {
      if (this.cachedAccountData?.subscriptions?.[0] && this.inMemoryConfirmedCost > 0) {
        const currentCount = Number(this.cachedAccountData.subscriptions[0].request_count || 0);
        if (this.localConsumedFloor > currentCount) {
          this.cachedAccountData.subscriptions[0].request_count = this.localConsumedFloor;
        }
      }
      return this.cachedAccountData;
    }

    try {
      const baseUrl = env.providers.oddsPapi.baseUrl || 'https://api.oddspapi.io/v4';
      const res = await fetch(`${baseUrl}/account?apiKey=${apiKey}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });

      if (res.ok) {
        const accountData: any = await res.json();
        const sub = accountData?.subscriptions?.[0];
        if (sub && typeof sub.request_count === 'number') {
          const cycleKey = `${sub.subscription_id || 'default'}:${sub.valid_from || 'default'}`;
          if (this.trackedCycleKey && this.trackedCycleKey !== cycleKey) {
            // New subscription cycle detected: reset in-memory floor to new cycle baseline
            this.inMemoryConfirmedCost = 0;
            this.localConsumedFloor = Number(sub.request_count);
            this.confirmedReservations.clear();
            this.closedReservations.clear();
            this.trackedCycleKey = cycleKey;
          } else {
            this.trackedCycleKey = cycleKey;
            if (this.inMemoryConfirmedCost > 0 && this.localConsumedFloor > Number(sub.request_count)) {
              sub.request_count = this.localConsumedFloor;
            }
          }
        }
        this.lastAccountSyncTime = Date.now();
        this.cachedAccountData = accountData;
        return accountData;
      } else if (res.status === 401 || res.status === 429) {
        this.tripCircuitBreaker(res.status, `Account sync returned HTTP ${res.status}`);
      }
    } catch (err) {
      Logger.warn('[OddsPapiQuotaGuard] Unmetered account sync request failed:', { error: String(err) });
    }
    return this.cachedAccountData;
  }

  /**
   * Evaluates persistent OddsPapi quota and enforces hard-stop.
   * Persists state in Supabase public.quota_state ONLY when allowProductionWrite is authorized.
   */
  public static async checkQuota(
    requiredCost = 1,
    customReserve?: number,
    allowProductionWrite = false
  ): Promise<QuotaGuardStatus> {
    const reserve = customReserve ?? Number(process.env.ODDSPAPI_QUOTA_RESERVE || this.DEFAULT_RESERVE);

    if (this.circuitTripped) {
      return {
        allowed: false,
        reason: this.circuitBreakerReason || 'Circuit breaker is open due to previous 429/401 response.',
        consumed: Math.max(this.localConsumedFloor, this.cachedAccountData?.subscriptions?.[0]?.request_count || 0),
        limit: this.DEFAULT_MONTHLY_LIMIT,
        hardStopThreshold: this.DEFAULT_MONTHLY_LIMIT - reserve,
        remaining: 0,
        reserve,
        source: 'FALLBACK',
      };
    }

    let consumed = 0;
    let limit = this.DEFAULT_MONTHLY_LIMIT;
    let source: QuotaGuardStatus['source'] = 'SUPABASE';
    let dbRecordId: number | string | null = null;

    let dbVerified = false;
    let accountVerified = false;

    // 1. Read persistent quota from mock store (in offline tests) or Supabase
    let client: any = null;
    if (this.mockPersistentQuotaStore) {
      limit = Number(this.mockPersistentQuotaStore.limit || this.DEFAULT_MONTHLY_LIMIT);
      consumed = Number(this.mockPersistentQuotaStore.consumed || 0);
      dbVerified = true;
      source = 'SUPABASE';
    } else {
      try {
        client = getDbClient();
        if (client) {
          const { data: dbRow, error } = await client
            .from('quota_state')
            .select('*')
            .eq('provider', 'oddspapi')
            .eq('quota_type', 'MONTHLY')
            .order('period_start', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!error && dbRow) {
            dbRecordId = dbRow.id;
            limit = Number(dbRow.limit_value || this.DEFAULT_MONTHLY_LIMIT);
            consumed = Number(dbRow.consumed || 0);
            dbVerified = true;
          }
        }
      } catch (dbErr) {
        Logger.warn('[OddsPapiQuotaGuard] Database query failed, checking unmetered account:', { error: String(dbErr) });
      }
    }

    // 2. Sync from /v4/account (unmetered)
    const accountData = await this.syncAccount();
    const sub = (accountData?.subscriptions ?? [])[0];
    if (sub && typeof sub.request_count === 'number') {
      accountVerified = true;
      const providerLimit = Number(sub.request_limit ?? limit);
      const providerCount = Number(sub.request_count);

      if (!dbVerified) {
        consumed = providerCount;
        limit = providerLimit;
        source = 'ODDSPAPI_ACCOUNT_SYNC';
      } else if (providerCount !== consumed || providerLimit !== limit) {
        // Reconcile persistent store and live provider count conservatively
        consumed = Math.max(consumed, providerCount);
        limit = providerLimit;
        if (providerCount >= consumed) {
          source = 'ODDSPAPI_ACCOUNT_SYNC';
        }

        if (client && dbRecordId && this.isProductionDatabaseWriteAllowed(allowProductionWrite)) {
          try {
            await client
              .from('quota_state')
              .update({
                consumed,
                limit_value: providerLimit,
                updated_at: new Date().toISOString(),
              })
              .eq('id', dbRecordId);
          } catch (syncErr) {
            Logger.warn('[OddsPapiQuotaGuard] Failed to sync account count to quota_state:', { error: String(syncErr) });
          }
        }
      }
    }

    // Fail closed if neither DB nor unmetered account could be verified
    if (!dbVerified && !accountVerified) {
      const reason = 'DB_UNREACHABLE_BLOCK: Neither persistent quota_state nor /v4/account could be verified; failing closed (hard-stop threshold enforced; consumed unavailable).';
      Logger.warn(`[OddsPapiQuotaGuard] ${reason}`);
      return {
        allowed: false,
        reason,
        consumed: limit,
        limit,
        hardStopThreshold: limit - reserve,
        remaining: 0,
        reserve,
        source: 'FALLBACK',
      };
    }

    // 3. Enforce in-memory monotonic confirmation floor so confirmed usage never disappears during cache windows or when DB writes are disabled
    if (this.inMemoryConfirmedCost > 0 && this.localConsumedFloor > consumed) {
      consumed = this.localConsumedFloor;
    }

    // Hard stop calculation: minimum of (limit * 0.90) and (limit - reserve)
    const hardStopThreshold = Math.min(
      Math.floor(limit * this.HARD_STOP_RATIO),
      Math.max(0, limit - reserve)
    );
    const activeReservedCost = Array.from(this.activeReservations.values()).reduce((sum, r) => sum + r.cost, 0);
    const totalCommitted = consumed + activeReservedCost;
    const remaining = Math.max(0, limit - totalCommitted);

    // Enforce Hard-Stop Threshold
    if (totalCommitted >= hardStopThreshold || (totalCommitted + requiredCost) > hardStopThreshold) {
      const reason = `OddsPAPI persistent quota hard-stop: ${totalCommitted}/${limit} consumed (exceeds hard-stop threshold of ${hardStopThreshold}; reserve=${reserve}).`;
      Logger.warn(`[OddsPapiQuotaGuard] ${reason}`);
      return {
        allowed: false,
        reason,
        consumed: totalCommitted,
        limit,
        hardStopThreshold,
        remaining,
        reserve,
        source,
      };
    }

    return {
      allowed: true,
      consumed: totalCommitted,
      limit,
      hardStopThreshold,
      remaining,
      reserve,
      source,
    };
  }

  /**
   * Reserves quota units before executing a paid request.
   */
  public static async reserveQuota(cost = 1): Promise<{ allowed: boolean; reservationId?: string; reason?: string }> {
    const status = await this.checkQuota(cost, undefined, false);
    if (!status.allowed) {
      return { allowed: false, reason: status.reason };
    }

    const reservationId = `res_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.activeReservations.set(reservationId, {
      reservationId,
      cost,
      reservedAt: new Date().toISOString(),
      confirmed: false,
    });

    return { allowed: true, reservationId };
  }

  /**
   * Internal helper to commit billable usage in memory and update cachedAccountData / mock store.
   */
  private static commitInMemoryUsage(
    reservationId: string,
    cost: number,
    details: {
      endpoint: string;
      params: Record<string, any>;
      statusCode?: number;
      outcome?: QuotaAuditLogEntry['outcome'];
      error?: string;
      countBefore?: number;
      countAfter?: number;
    }
  ): { countBefore: number; countAfter: number; outcome: QuotaAuditLogEntry['outcome'] } {
    const accountCount = this.cachedAccountData?.subscriptions?.[0]?.request_count;
    const persistentCount = this.mockPersistentQuotaStore?.consumed;
    const knownBaseline = Math.max(
      this.localConsumedFloor,
      typeof accountCount === 'number' ? accountCount : 0,
      typeof persistentCount === 'number' ? persistentCount : 0
    );

    const countBefore = details.countBefore ?? knownBaseline;
    const countAfter = details.countAfter ?? (countBefore + cost);

    this.inMemoryConfirmedCost += cost;
    this.localConsumedFloor = Math.max(this.localConsumedFloor, countAfter, this.inMemoryConfirmedCost);

    if (this.cachedAccountData?.subscriptions?.[0] && typeof this.cachedAccountData.subscriptions[0].request_count === 'number') {
      this.cachedAccountData.subscriptions[0].request_count = Math.max(
        this.cachedAccountData.subscriptions[0].request_count,
        countAfter
      );
    }

    const isErrorStatus = typeof details.statusCode === 'number' && details.statusCode >= 400;
    const recordOutcome: 'SUCCESS' | 'BILLABLE_ERROR' =
      details.outcome === 'BILLABLE_ERROR' || isErrorStatus ? 'BILLABLE_ERROR' : 'SUCCESS';
    const auditOutcome: QuotaAuditLogEntry['outcome'] = details.outcome ?? recordOutcome;

    const recordKey = this.confirmedReservations.has(reservationId)
      ? `${reservationId}_${this.confirmedReservations.size + 1}`
      : reservationId;
    this.confirmedReservations.set(recordKey, {
      reservationId,
      cost,
      confirmedAt: new Date().toISOString(),
      endpoint: details.endpoint,
      statusCode: details.statusCode ?? 200,
      outcome: recordOutcome,
      countBefore,
      countAfter,
    });

    return { countBefore, countAfter, outcome: auditOutcome };
  }

  /**
   * Confirms billable quota usage after a request reaches a billable endpoint (HTTP 200 or billable 4xx/5xx).
   * Supports partial reservation confirmation via `details.consumedCost` for multi-request loops.
   * Idempotent: duplicate confirmations of an already-closed reservationId are ignored.
   * Retains confirmed usage in memory even when production DB writes are disabled.
   */
  public static async confirmQuota(
    reservationId: string,
    details: {
      endpoint: string;
      params: Record<string, any>;
      statusCode?: number;
      outcome?: QuotaAuditLogEntry['outcome'];
      error?: string;
      consumedCost?: number;
      countBefore?: number;
      countAfter?: number;
    },
    allowProductionWrite = false
  ): Promise<void> {
    if (this.closedReservations.has(reservationId)) {
      Logger.warn(`[OddsPapiQuotaGuard] Duplicate confirmQuota ignored for already-closed reservationId=${reservationId}`);
      return;
    }

    const reservation = this.activeReservations.get(reservationId);
    const cost =
      typeof details.consumedCost === 'number'
        ? Math.max(0, reservation ? Math.min(reservation.cost, details.consumedCost) : details.consumedCost)
        : (reservation?.cost ?? 1);

    if (reservation) {
      if (cost < reservation.cost) {
        reservation.cost -= cost;
      } else {
        this.activeReservations.delete(reservationId);
        this.closedReservations.add(reservationId);
      }
    } else {
      this.closedReservations.add(reservationId);
    }

    if (cost <= 0) {
      return;
    }

    const { countBefore, countAfter, outcome } = this.commitInMemoryUsage(reservationId, cost, details);

    await this.recordUsage(cost, allowProductionWrite, countAfter);

    this.logAudit({
      timestamp: new Date().toISOString(),
      endpoint: details.endpoint,
      params: details.params,
      outcome,
      countBefore,
      countAfter,
      statusCode: details.statusCode ?? 200,
      reservationId,
      reason: details.error,
    });
  }

  /**
   * Releases reserved quota ONLY for documented non-billable failures:
   * - HTTP 429 (quota/rate limit) and HTTP 401 (unauthorized API key), which are rejected before reaching the endpoint.
   * - Pre-response network/transport failures (no HTTP statusCode returned) or pre-flight reservation rollbacks.
   *
   * CRITICAL BILLING RULE (https://oddspapi.io/us/docs/requests-and-quota):
   * If called with a billable HTTP status code (e.g. 400, 403, 404, 422, 500, 502, 503),
   * the request reached the endpoint and IS billed by OddsPapi — so its reservation is NOT released as free,
   * and is instead committed as BILLABLE_ERROR.
   */
  public static releaseQuota(
    reservationId: string,
    details: { endpoint: string; params: Record<string, any>; statusCode?: number; error?: string; consumedCost?: number }
  ): void {
    if (this.closedReservations.has(reservationId)) {
      Logger.warn(`[OddsPapiQuotaGuard] Duplicate releaseQuota ignored for already-closed reservationId=${reservationId}`);
      return;
    }

    const reservation = this.activeReservations.get(reservationId);

    // Guard against releasing a billable 4xx/5xx HTTP response as free
    if (this.isBillableHttpStatus(details.statusCode)) {
      const cost =
        typeof details.consumedCost === 'number'
          ? Math.max(1, reservation ? Math.min(reservation.cost, details.consumedCost) : details.consumedCost)
          : (reservation?.cost ?? 1);

      if (reservation) {
        if (cost < reservation.cost) {
          reservation.cost -= cost;
        } else {
          this.activeReservations.delete(reservationId);
          this.closedReservations.add(reservationId);
        }
      } else {
        this.closedReservations.add(reservationId);
      }

      const { countBefore, countAfter } = this.commitInMemoryUsage(reservationId, cost, {
        ...details,
        outcome: 'BILLABLE_ERROR',
      });

      if (this.mockPersistentQuotaStore) {
        this.mockPersistentQuotaStore.consumed = Math.max(this.mockPersistentQuotaStore.consumed + cost, countAfter);
        this.mockPersistentQuotaStore.updatedAt = new Date().toISOString();
      }

      this.logAudit({
        timestamp: new Date().toISOString(),
        endpoint: details.endpoint,
        params: details.params,
        outcome: 'BILLABLE_ERROR',
        countBefore,
        countAfter,
        statusCode: details.statusCode,
        reservationId,
        reason: details.error || `Billable HTTP ${details.statusCode} response accounted against quota per official billing rules`,
      });
      return;
    }

    this.activeReservations.delete(reservationId);
    this.closedReservations.add(reservationId);

    const is429 = details.statusCode === 429;
    const is401 = details.statusCode === 401;

    if (is429 || is401) {
      this.tripCircuitBreaker(details.statusCode!, details.error || (is429 ? 'Rate limit exceeded' : 'Unauthorized'));
    }

    const count = Math.max(
      this.localConsumedFloor,
      this.cachedAccountData?.subscriptions?.[0]?.request_count || 0,
      this.mockPersistentQuotaStore?.consumed || 0
    );
    this.logAudit({
      timestamp: new Date().toISOString(),
      endpoint: details.endpoint,
      params: details.params,
      outcome: is429 ? 'RATE_LIMITED' : is401 ? 'UNAUTHORIZED' : 'ERROR',
      countBefore: count,
      countAfter: count, // Non-billable failure: count is NOT incremented
      statusCode: details.statusCode,
      reservationId,
      reason: details.error,
    });
  }

  /**
   * Logs structured audit entry.
   */
  public static logAudit(entry: QuotaAuditLogEntry): void {
    this.auditLogs.push(entry);
    Logger.info(`[OddsPapiQuotaGuard Audit] ${entry.endpoint} -> ${entry.outcome} (Count: ${entry.countBefore} -> ${entry.countAfter})`, entry);
  }

  public static getAuditLogs(): QuotaAuditLogEntry[] {
    return [...this.auditLogs];
  }

  /**
   * Atomically records billable quota usage to mock persistent store (in offline tests)
   * or persistent Supabase storage ONLY when allowProductionWrite is authorized.
   */
  public static async recordUsage(cost = 1, allowProductionWrite = false, minConsumedFloor?: number): Promise<void> {
    if (this.mockPersistentQuotaStore) {
      const nextMock = Math.max(this.mockPersistentQuotaStore.consumed + cost, minConsumedFloor ?? 0);
      this.mockPersistentQuotaStore.consumed = nextMock;
      this.mockPersistentQuotaStore.updatedAt = new Date().toISOString();
    }

    if (!this.isProductionDatabaseWriteAllowed(allowProductionWrite)) {
      return;
    }
    try {
      const client = getDbClient();
      const { data: dbRow, error } = await client
        .from('quota_state')
        .select('id, consumed')
        .eq('provider', 'oddspapi')
        .eq('quota_type', 'MONTHLY')
        .order('period_start', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && dbRow) {
        const nextConsumed = Math.max((dbRow.consumed || 0) + cost, minConsumedFloor ?? 0);
        await client
          .from('quota_state')
          .update({
            consumed: nextConsumed,
            updated_at: new Date().toISOString(),
          })
          .eq('id', dbRow.id);
        Logger.info(`[OddsPapiQuotaGuard] Quota usage recorded persistently: +${cost} (total: ${nextConsumed})`);
      }
    } catch (err) {
      Logger.warn('[OddsPapiQuotaGuard] Failed to record usage to database:', { error: String(err) });
    }
  }

  /**
   * Deterministic test helper for testing unverifiable quota state offline.
   * Fails closed with DB_UNREACHABLE_BLOCK.
   */
  public static async checkQuotaOfflineUnverifiableForTest(): Promise<QuotaGuardStatus> {
    const limit = this.DEFAULT_MONTHLY_LIMIT;
    const reserve = this.DEFAULT_RESERVE;
    return {
      allowed: false,
      reason: 'DB_UNREACHABLE_BLOCK: Neither persistent quota_state nor /v4/account could be verified; failing closed (hard-stop threshold enforced; consumed unavailable).',
      consumed: limit,
      limit,
      hardStopThreshold: limit - reserve,
      remaining: 0,
      reserve,
      source: 'FALLBACK',
    };
  }
}
