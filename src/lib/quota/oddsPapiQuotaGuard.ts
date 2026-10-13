// SALMO.DEV — Persistent OddsPAPI Quota Guard, Atomic Reservation & Circuit-Breaker Protection
// Ensures quota tracking persists across serverless cold starts and concurrent instances.
// Coordinates with Supabase PostgreSQL tables: public.quota_state & public.quota_reservations
// via row-locked atomic RPCs:
//   - public.salmo_sync_oddspapi_quota_cycle
//   - public.salmo_reserve_oddspapi_quota
//   - public.salmo_confirm_oddspapi_quota
//   - public.salmo_release_oddspapi_quota
//   - public.salmo_cleanup_stale_oddspapi_reservations
// Syncs with unmetered OddsPAPI /v4/account endpoint before batches with cooldown guard.
// Strictly enforces hard-stop at LEAST(floor(limit * 0.90), limit - reserve), atomic pre-reservation,
// and circuit-breaker tripping on HTTP 429 / 401 (never counted against usage, never retried).

import { getDbClient } from '../db';
import { env } from '../../config/env';
import { Logger } from '../logger';

export type QuotaResetState =
  | 'QUOTA_EXHAUSTED'
  | 'RESET_UNVERIFIED'
  | 'QUOTA_AVAILABLE'
  | 'ACTIVATION_IN_PROGRESS';

export type AtomicQuotaErrorCode =
  | 'QUOTA_EXHAUSTED'
  | 'STALE_SUBSCRIPTION_CYCLE'
  | 'DUPLICATE_IDEMPOTENCY_KEY'
  | 'MISSING_QUOTA_STATE'
  | 'INVALID_STATE_TRANSITION'
  | 'DB_UNREACHABLE_BLOCK'
  | 'INVALID_AMOUNT'
  | 'INVALID_IDEMPOTENCY_KEY'
  | 'INVALID_CYCLE_KEY'
  | 'RESERVATION_NOT_FOUND'
  | 'ALREADY_CONFIRMED'
  | 'ALREADY_RELEASED'
  | 'CIRCUIT_BREAKER_OPEN';

export type ReservationStatus = 'RESERVED' | 'CONFIRMED' | 'RELEASED' | 'ROLLED_BACK';

export type BillingOutcome =
  | 'PENDING'
  | 'SUCCESS_2XX'
  | 'BILLABLE_CLIENT_ERROR'
  | 'BILLABLE_SERVER_ERROR'
  | 'AMBIGUOUS_TRANSPORT_CHARGED'
  | 'FREE_UNMETERED'
  | 'FREE_401_UNAUTHORIZED'
  | 'FREE_429_RATE_LIMITED'
  | 'PRE_REQUEST_ABORT'
  | 'PARTIAL_BATCH_SETTLED'
  | 'STALE_EXPIRED_RELEASED';

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
  errorCode?: AtomicQuotaErrorCode;
  reason?: string;
  consumed: number;
  reserved?: number;
  limit: number;
  hardStopThreshold: number;
  remaining: number;
  reserve: number;
  subscriptionCycleKey?: string | null;
  source: 'SUPABASE' | 'ODDSPAPI_ACCOUNT_SYNC' | 'FALLBACK';
}

export interface QuotaReservation {
  reservationId: string;
  cost: number;
  confirmedAmount?: number;
  releasedAmount?: number;
  idempotencyKey?: string;
  subscriptionCycleKey?: string | null;
  reservedAt: string;
  confirmed: boolean;
  status?: ReservationStatus;
}

export interface QuotaConfirmationRecord {
  reservationId: string;
  cost: number;
  confirmedAt: string;
  endpoint: string;
  statusCode?: number;
  outcome: 'SUCCESS' | 'BILLABLE_ERROR';
  billingOutcome?: BillingOutcome;
  countBefore: number;
  countAfter: number;
}

export interface QuotaAuditLogEntry {
  timestamp: string;
  endpoint: string;
  params: Record<string, any>;
  outcome: 'SUCCESS' | 'BILLABLE_ERROR' | 'REJECTED' | 'RATE_LIMITED' | 'UNAUTHORIZED' | 'ERROR';
  billingOutcome?: BillingOutcome;
  countBefore: number;
  countAfter: number;
  statusCode?: number;
  reservationId?: string;
  idempotencyKey?: string;
  errorCode?: AtomicQuotaErrorCode | string;
  reason?: string;
  [key: string]: any;
}

export interface AtomicQuotaRpcClient {
  rpc(fnName: string, args: Record<string, any>): Promise<{ data: any; error: any }> | { data: any; error: any };
}

export interface QuotaStateRow {
  id: string;
  provider: string;
  quota_type: string;
  period_start: string;
  period_end: string;
  limit_value: number;
  safe_limit: number;
  safety_reserve_pct: number;
  consumed: number;
  reserved: number;
  subscription_cycle_key: string | null;
  mandatory_reserve: number;
  operational_ceiling: number;
  last_account_sync_at: string | null;
  last_provider_request_count: number | null;
  schema_version: string;
  created_at: string;
  updated_at: string;
}

export interface QuotaReservationRow {
  id: string;
  provider: string;
  quota_type: string;
  period_start: string;
  amount: number;
  confirmed_amount: number;
  released_amount: number;
  status: ReservationStatus;
  endpoint: string;
  request_id: string | null;
  idempotency_key: string | null;
  subscription_cycle_key: string | null;
  http_status: number | null;
  billing_outcome: BillingOutcome;
  error_code: string | null;
  metadata: Record<string, any>;
  expires_at: string | null;
  created_at: string;
  resolved_at: string | null;
  updated_at: string;
}

/**
 * Deterministic, mutex-serialized transactional database engine mirroring
 * data/migrations/20261013_atomic_oddspapi_quota_reservation.sql.
 *
 * Enforces:
 * - Row-level FOR UPDATE lock serialization in strict order (public.quota_state FIRST,
 *   public.quota_reservations SECOND).
 * - Non-negative CHECK constraints on consumed, reserved, confirmed_amount, released_amount.
 * - State transition trigger (trg_salmo_quota_res_transition) forbidding CONFIRMED <-> RELEASED.
 * - Unique idempotency key constraint (uq_quota_res_provider_idempotency).
 * - Mandatory reserve (50) and operational ceiling (200) inside the transaction.
 * - Rollback script simulation and re-migration idempotency verification.
 */
export class AtomicOddsPapiQuotaDatabaseEngine implements AtomicQuotaRpcClient {
  private lockQueue: Promise<void> = Promise.resolve();
  private quotaStateRows = new Map<string, QuotaStateRow>();
  private quotaReservationRows = new Map<string, QuotaReservationRow>();
  private rpcEnabled = true;
  private simulatedFailureMode: null | 'DB_UNREACHABLE' | 'TIMEOUT_DURING_RESERVE' | 'CRASH_BEFORE_CONFIRM' = null;
  private lockAcquisitionOrderLog: Array<{ rpc: string; lockOrder: string[] }> = [];
  private seqCounter = 0;

  constructor(initialState?: Partial<QuotaStateRow> | null) {
    if (initialState !== null) {
      this.seedQuotaState(initialState || {});
    }
  }

  public seedQuotaState(partial: Partial<QuotaStateRow>): QuotaStateRow {
    const nowIso = new Date().toISOString();
    const limitValue = partial.limit_value ?? 250;
    const mandatoryReserve = Math.max(partial.mandatory_reserve ?? 50, 25);
    const operationalCeiling =
      partial.operational_ceiling ??
      Math.min(Math.floor(limitValue * 0.90), Math.max(0, limitValue - mandatoryReserve));
    const row: QuotaStateRow = {
      id: partial.id || '00000000-0000-4000-8000-000000011221',
      provider: partial.provider || 'oddspapi',
      quota_type: partial.quota_type || 'MONTHLY',
      period_start: partial.period_start || '2026-10-08T10:19:45.000Z',
      period_end: partial.period_end || '2026-11-07T10:19:45.000Z',
      limit_value: limitValue,
      safe_limit: partial.safe_limit ?? operationalCeiling,
      safety_reserve_pct: partial.safety_reserve_pct ?? Math.round((mandatoryReserve / limitValue) * 100),
      consumed: partial.consumed ?? 0,
      reserved: partial.reserved ?? 0,
      subscription_cycle_key:
        partial.subscription_cycle_key !== undefined
          ? partial.subscription_cycle_key
          : 'sub-oddspapi:2026-10-08T10:19:45+00:00',
      mandatory_reserve: mandatoryReserve,
      operational_ceiling: operationalCeiling,
      last_account_sync_at: partial.last_account_sync_at ?? nowIso,
      last_provider_request_count: partial.last_provider_request_count ?? (partial.consumed ?? 0),
      schema_version: partial.schema_version || 'salmo_p0_atomic_v1',
      created_at: partial.created_at || nowIso,
      updated_at: partial.updated_at || nowIso,
    };
    this.validateQuotaStateConstraints(row);
    this.quotaStateRows.set(row.id, row);
    return { ...row };
  }

  public clearQuotaState(): void {
    this.quotaStateRows.clear();
  }

  public setSimulatedFailureMode(
    mode: null | 'DB_UNREACHABLE' | 'TIMEOUT_DURING_RESERVE' | 'CRASH_BEFORE_CONFIRM'
  ): void {
    this.simulatedFailureMode = mode;
  }

  public setRpcEnabled(enabled: boolean): void {
    this.rpcEnabled = enabled;
  }

  public getQuotaStateSnapshot(): QuotaStateRow | null {
    const row = this.findActiveOddspapiState();
    return row ? { ...row } : null;
  }

  public getAllReservationsSnapshot(): QuotaReservationRow[] {
    return Array.from(this.quotaReservationRows.values()).map(r => JSON.parse(JSON.stringify(r)));
  }

  public getReservationById(id: string): QuotaReservationRow | null {
    const r = this.quotaReservationRows.get(id);
    return r ? JSON.parse(JSON.stringify(r)) : null;
  }

  public getLockAcquisitionOrderLog(): Array<{ rpc: string; lockOrder: string[] }> {
    return [...this.lockAcquisitionOrderLog];
  }

  private nextUuid(): string {
    this.seqCounter += 1;
    const hex = this.seqCounter.toString(16).padStart(12, '0');
    return `00000000-0000-4000-8000-${hex}`;
  }

  private validateQuotaStateConstraints(row: QuotaStateRow): void {
    if (
      row.limit_value < 0 ||
      row.safe_limit < 0 ||
      row.consumed < 0 ||
      row.reserved < 0 ||
      row.mandatory_reserve < 0 ||
      row.operational_ceiling < 0 ||
      row.operational_ceiling > row.limit_value
    ) {
      throw new Error(
        `CHECK_VIOLATION (chk_quota_state_salmo_non_negative): invalid state consumed=${row.consumed}, reserved=${row.reserved}, ceiling=${row.operational_ceiling}, limit=${row.limit_value}`
      );
    }
  }

  private validateReservationConstraints(
    oldRow: QuotaReservationRow | null,
    newRow: QuotaReservationRow
  ): void {
    if (
      newRow.amount <= 0 ||
      newRow.confirmed_amount < 0 ||
      newRow.released_amount < 0 ||
      newRow.confirmed_amount + newRow.released_amount > newRow.amount
    ) {
      throw new Error(
        `CHECK_VIOLATION (chk_quota_res_salmo_amounts): amount=${newRow.amount}, confirmed=${newRow.confirmed_amount}, released=${newRow.released_amount}`
      );
    }

    if (!['RESERVED', 'CONFIRMED', 'RELEASED', 'ROLLED_BACK'].includes(newRow.status)) {
      throw new Error(`CHECK_VIOLATION (chk_quota_res_salmo_status): invalid status ${newRow.status}`);
    }

    if (oldRow && this.rpcEnabled) {
      if (oldRow.status === 'CONFIRMED' && newRow.status !== 'CONFIRMED') {
        throw new Error(
          `INVALID_STATE_TRANSITION: reservation ${oldRow.id} cannot transition from CONFIRMED to ${newRow.status}`
        );
      }
      if (
        (oldRow.status === 'RELEASED' || oldRow.status === 'ROLLED_BACK') &&
        newRow.status !== 'RELEASED' &&
        newRow.status !== 'ROLLED_BACK'
      ) {
        throw new Error(
          `INVALID_STATE_TRANSITION: reservation ${oldRow.id} cannot transition from ${oldRow.status} to ${newRow.status}`
        );
      }
      if (newRow.confirmed_amount < oldRow.confirmed_amount) {
        throw new Error(
          `INVALID_STATE_TRANSITION: confirmed_amount cannot decrease (${oldRow.confirmed_amount} -> ${newRow.confirmed_amount})`
        );
      }
      if (newRow.released_amount < oldRow.released_amount) {
        throw new Error(
          `INVALID_STATE_TRANSITION: released_amount cannot decrease (${oldRow.released_amount} -> ${newRow.released_amount})`
        );
      }
    }
  }

  /**
   * Executes a database transaction under a serialized row-level FOR UPDATE mutex.
   */
  private async withRowLockTransaction<T>(fn: () => Promise<T> | T): Promise<T> {
    let releaseLock!: () => void;
    const nextLock = new Promise<void>(resolve => {
      releaseLock = resolve;
    });
    const prevLock = this.lockQueue;
    this.lockQueue = prevLock.then(() => nextLock);
    await prevLock;
    try {
      return await fn();
    } finally {
      releaseLock();
    }
  }

  private findActiveOddspapiState(preferredCycleKey?: string | null): QuotaStateRow | null {
    const rows = Array.from(this.quotaStateRows.values()).filter(
      r => r.provider === 'oddspapi' && r.quota_type === 'MONTHLY'
    );
    if (rows.length === 0) return null;
    rows.sort((a, b) => {
      const aMatch = preferredCycleKey && a.subscription_cycle_key === preferredCycleKey ? 0 : 1;
      const bMatch = preferredCycleKey && b.subscription_cycle_key === preferredCycleKey ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return b.period_start.localeCompare(a.period_start) || b.updated_at.localeCompare(a.updated_at);
    });
    return rows[0];
  }

  /**
   * Simulates executing data/migrations/20261013_atomic_oddspapi_quota_reservation_rollback.sql
   */
  public async executeRollbackMigration(): Promise<{
    ok: boolean;
    drainedReservations: number;
    unitsReturned: number;
    schemaVersion: string;
  }> {
    return this.withRowLockTransaction(() => {
      let drainedReservations = 0;
      let unitsReturned = 0;
      const nowIso = new Date().toISOString();

      for (const res of this.quotaReservationRows.values()) {
        if (res.provider === 'oddspapi' && res.status === 'RESERVED') {
          const unsettled = Math.max(0, res.amount - res.confirmed_amount - res.released_amount);
          res.released_amount += unsettled;
          res.status = res.confirmed_amount > 0 ? 'CONFIRMED' : 'ROLLED_BACK';
          res.billing_outcome = res.confirmed_amount > 0 ? 'PARTIAL_BATCH_SETTLED' : 'PRE_REQUEST_ABORT';
          res.error_code = res.error_code || 'ROLLED_BACK_BY_MIGRATION_REVERT';
          res.resolved_at = res.resolved_at || nowIso;
          res.updated_at = nowIso;

          const state = this.findActiveOddspapiState(res.subscription_cycle_key);
          if (state && unsettled > 0) {
            state.reserved = Math.max(0, state.reserved - unsettled);
            state.updated_at = nowIso;
            this.validateQuotaStateConstraints(state);
          }
          drainedReservations += 1;
          unitsReturned += unsettled;
        }
      }

      const state = this.findActiveOddspapiState();
      if (state) {
        state.schema_version = 'rolled_back_to_v4_compat';
        state.updated_at = nowIso;
      }
      this.rpcEnabled = false;

      return {
        ok: true,
        drainedReservations,
        unitsReturned,
        schemaVersion: state?.schema_version || 'rolled_back_to_v4_compat',
      };
    });
  }

  /**
   * Simulates re-applying data/migrations/20261013_atomic_oddspapi_quota_reservation.sql
   */
  public async executeForwardMigration(): Promise<{ ok: boolean; schemaVersion: string }> {
    return this.withRowLockTransaction(() => {
      const nowIso = new Date().toISOString();
      for (const state of this.quotaStateRows.values()) {
        if (state.provider === 'oddspapi') {
          const reserve = Math.max(state.mandatory_reserve || 50, 50);
          const ceiling = Math.min(Math.floor(state.limit_value * 0.90), Math.max(0, state.limit_value - reserve));
          state.mandatory_reserve = reserve;
          state.operational_ceiling = ceiling;
          state.safe_limit = ceiling;
          state.safety_reserve_pct = state.limit_value > 0 ? Math.round((reserve / state.limit_value) * 100) : 20;
          state.subscription_cycle_key =
            state.subscription_cycle_key || `LEGACY_PERIOD:${state.period_start}`;
          state.schema_version = 'salmo_p0_atomic_v1';
          state.updated_at = nowIso;
          this.validateQuotaStateConstraints(state);
        }
      }
      this.rpcEnabled = true;
      return { ok: true, schemaVersion: 'salmo_p0_atomic_v1' };
    });
  }

  public async rpc(fnName: string, args: Record<string, any>): Promise<{ data: any; error: any }> {
    if (this.simulatedFailureMode === 'DB_UNREACHABLE') {
      return {
        data: null,
        error: {
          code: 'PGRST000',
          message: 'Database connection unreachable or timed out',
        },
      };
    }

    if (this.simulatedFailureMode === 'TIMEOUT_DURING_RESERVE' && fnName === 'salmo_reserve_oddspapi_quota') {
      return {
        data: null,
        error: {
          code: '57014',
          message: 'canceling statement due to statement timeout during salmo_reserve_oddspapi_quota',
        },
      };
    }

    if (!this.rpcEnabled) {
      return {
        data: null,
        error: {
          code: 'PGRST202',
          message: `Could not find the function public.${fnName} in the schema cache (rolled back)`,
        },
      };
    }

    try {
      const data = await this.withRowLockTransaction(() => {
        switch (fnName) {
          case 'salmo_sync_oddspapi_quota_cycle':
            return this.execSyncCycle(args);
          case 'salmo_reserve_oddspapi_quota':
            return this.execReserve(args);
          case 'salmo_confirm_oddspapi_quota':
            return this.execConfirm(args);
          case 'salmo_release_oddspapi_quota':
            return this.execRelease(args);
          case 'salmo_cleanup_stale_oddspapi_reservations':
            return this.execCleanupStale(args);
          default:
            throw new Error(`Unknown RPC function: ${fnName}`);
        }
      });
      return { data, error: null };
    } catch (err: any) {
      return {
        data: null,
        error: {
          code: 'P0001',
          message: String(err?.message || err),
        },
      };
    }
  }

  private execSyncCycle(args: Record<string, any>): any {
    const cycleKey = typeof args.p_subscription_cycle_key === 'string' ? args.p_subscription_cycle_key.trim() : '';
    const providerCount = args.p_provider_count;
    const providerLimit = args.p_provider_limit ?? 250;
    const mandatoryReserve = args.p_mandatory_reserve ?? 50;

    if (!cycleKey) {
      return {
        ok: false,
        error_code: 'INVALID_CYCLE_KEY',
        reason: 'p_subscription_cycle_key must be a non-empty string.',
      };
    }

    if (
      typeof providerCount !== 'number' ||
      providerCount < 0 ||
      typeof providerLimit !== 'number' ||
      providerLimit <= 0 ||
      typeof mandatoryReserve !== 'number' ||
      mandatoryReserve < 0
    ) {
      return {
        ok: false,
        error_code: 'INVALID_AMOUNT',
        reason: 'Provider count, limit, and reserve must be valid non-negative integers.',
      };
    }

    this.lockAcquisitionOrderLog.push({
      rpc: 'salmo_sync_oddspapi_quota_cycle',
      lockOrder: ['public.quota_state'],
    });

    const effectiveReserve = Math.max(mandatoryReserve, 25);
    const operationalCeiling = Math.min(
      Math.floor(providerLimit * 0.90),
      Math.max(0, providerLimit - effectiveReserve)
    );
    const reservePct = Math.min(100, Math.max(0, Math.round((effectiveReserve / providerLimit) * 100)));
    const nowIso = new Date().toISOString();
    const periodStart = args.p_period_start || nowIso;
    const periodEnd = args.p_period_end || new Date(Date.now() + 30 * 86400 * 1000).toISOString();

    let state = this.findActiveOddspapiState(cycleKey);
    let cycleRollover = false;

    if (!state) {
      state = this.seedQuotaState({
        period_start: periodStart,
        period_end: periodEnd,
        limit_value: providerLimit,
        safe_limit: operationalCeiling,
        safety_reserve_pct: reservePct,
        consumed: providerCount,
        reserved: 0,
        subscription_cycle_key: cycleKey,
        mandatory_reserve: effectiveReserve,
        operational_ceiling: operationalCeiling,
        last_account_sync_at: nowIso,
        last_provider_request_count: providerCount,
      });
    } else if (
      !state.subscription_cycle_key ||
      state.subscription_cycle_key.startsWith('LEGACY_PERIOD:') ||
      state.subscription_cycle_key === cycleKey
    ) {
      // Same cycle: monotonic protection — never lower consumed on stale provider snapshot
      state.subscription_cycle_key = cycleKey;
      state.consumed = Math.max(state.consumed, providerCount);
      state.limit_value = providerLimit;
      state.mandatory_reserve = effectiveReserve;
      state.operational_ceiling = operationalCeiling;
      state.safe_limit = operationalCeiling;
      state.safety_reserve_pct = reservePct;
      state.last_account_sync_at = nowIso;
      state.last_provider_request_count = providerCount;
      state.updated_at = nowIso;
      this.validateQuotaStateConstraints(state);
    } else {
      // Genuine new subscription cycle rollover
      cycleRollover = true;
      state.subscription_cycle_key = cycleKey;
      state.period_start = periodStart;
      state.period_end = periodEnd;
      state.consumed = providerCount;
      state.reserved = 0;
      state.limit_value = providerLimit;
      state.mandatory_reserve = effectiveReserve;
      state.operational_ceiling = operationalCeiling;
      state.safe_limit = operationalCeiling;
      state.safety_reserve_pct = reservePct;
      state.last_account_sync_at = nowIso;
      state.last_provider_request_count = providerCount;
      state.updated_at = nowIso;
      this.validateQuotaStateConstraints(state);
    }

    return {
      ok: true,
      error_code: null,
      cycle_rollover: cycleRollover,
      state: {
        subscription_cycle_key: state.subscription_cycle_key,
        consumed: state.consumed,
        reserved: state.reserved,
        limit_value: state.limit_value,
        mandatory_reserve: state.mandatory_reserve,
        operational_ceiling: state.operational_ceiling,
        operational_remaining: Math.max(0, state.operational_ceiling - state.consumed - state.reserved),
      },
    };
  }

  private execReserve(args: Record<string, any>): any {
    const amount = args.p_amount;
    const endpoint = args.p_endpoint || 'unknown';
    const idempotencyKey = typeof args.p_idempotency_key === 'string' ? args.p_idempotency_key.trim() : '';
    const callerCycleKey =
      typeof args.p_subscription_cycle_key === 'string' && args.p_subscription_cycle_key.trim() !== ''
        ? args.p_subscription_cycle_key.trim()
        : null;
    const mandatoryReserveArg = args.p_mandatory_reserve ?? 50;
    const hardStopRatio = Number(args.p_hard_stop_ratio ?? 0.90);
    const ttlSeconds = Math.max(Number(args.p_ttl_seconds ?? 600), 30);

    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
      return {
        ok: false,
        error_code: 'INVALID_AMOUNT',
        reason: `INVALID_AMOUNT: reservation amount must be a positive integer, got ${String(amount)}.`,
      };
    }

    if (!idempotencyKey) {
      return {
        ok: false,
        error_code: 'INVALID_IDEMPOTENCY_KEY',
        reason: 'INVALID_IDEMPOTENCY_KEY: non-empty deterministic p_idempotency_key is required.',
      };
    }

    // Lock #1: public.quota_state FIRST, Lock #2: public.quota_reservations SECOND
    this.lockAcquisitionOrderLog.push({
      rpc: 'salmo_reserve_oddspapi_quota',
      lockOrder: ['public.quota_state', 'public.quota_reservations'],
    });

    const state = this.findActiveOddspapiState(callerCycleKey);
    if (!state) {
      return {
        ok: false,
        error_code: 'MISSING_QUOTA_STATE',
        reason: 'MISSING_QUOTA_STATE: no public.quota_state row exists for oddspapi; failing closed.',
      };
    }

    // Subscription cycle integrity check
    if (
      callerCycleKey &&
      state.subscription_cycle_key &&
      !state.subscription_cycle_key.startsWith('LEGACY_PERIOD:') &&
      state.subscription_cycle_key !== callerCycleKey
    ) {
      return {
        ok: false,
        error_code: 'STALE_SUBSCRIPTION_CYCLE',
        reason: `STALE_SUBSCRIPTION_CYCLE: caller cycle ${callerCycleKey} does not match active quota_state cycle ${state.subscription_cycle_key}.`,
        active_subscription_cycle_key: state.subscription_cycle_key,
      };
    }

    // Idempotency check under lock
    const existing = Array.from(this.quotaReservationRows.values()).find(
      r => r.provider === 'oddspapi' && (r.idempotency_key === idempotencyKey || r.request_id === idempotencyKey)
    );
    if (existing) {
      return {
        ok: existing.status === 'RESERVED' || existing.status === 'CONFIRMED',
        idempotent_replay: true,
        error_code: 'DUPLICATE_IDEMPOTENCY_KEY',
        reason: `Idempotent replay for key ${idempotencyKey} (existing status=${existing.status}).`,
        reservation_id: existing.id,
        status: existing.status,
        amount: existing.amount,
        confirmed_amount: existing.confirmed_amount,
        released_amount: existing.released_amount,
        consumed: state.consumed,
        reserved: state.reserved,
        limit_value: state.limit_value,
        operational_ceiling: state.operational_ceiling,
      };
    }

    // Compute operational ceiling inside transaction
    const effectiveReserve = Math.max(state.mandatory_reserve ?? 50, mandatoryReserveArg, 25);
    const ratioCeiling = Math.floor(state.limit_value * hardStopRatio);
    const reserveCeiling = Math.max(0, state.limit_value - effectiveReserve);
    const operationalCeiling = Math.min(ratioCeiling, reserveCeiling);
    const committed = state.consumed + state.reserved;
    const operationalRemaining = Math.max(0, operationalCeiling - committed);

    if (committed + amount > operationalCeiling) {
      return {
        ok: false,
        error_code: 'QUOTA_EXHAUSTED',
        reason: `QUOTA_EXHAUSTED: requested ${amount} unit(s) exceeds operational remaining ${operationalRemaining} (consumed=${state.consumed}, reserved=${state.reserved}, operational_ceiling=${operationalCeiling}, limit_value=${state.limit_value}, mandatory_reserve=${effectiveReserve}).`,
        consumed: state.consumed,
        reserved: state.reserved,
        limit_value: state.limit_value,
        operational_ceiling: operationalCeiling,
        mandatory_reserve: effectiveReserve,
        operational_remaining: operationalRemaining,
      };
    }

    const nowIso = new Date().toISOString();
    const effectiveCycleKey =
      callerCycleKey || state.subscription_cycle_key || `LEGACY_PERIOD:${state.period_start}`;

    state.reserved += amount;
    state.mandatory_reserve = effectiveReserve;
    state.operational_ceiling = operationalCeiling;
    state.safe_limit = operationalCeiling;
    state.subscription_cycle_key = effectiveCycleKey;
    state.updated_at = nowIso;
    this.validateQuotaStateConstraints(state);

    const reservationId = this.nextUuid();
    const resRow: QuotaReservationRow = {
      id: reservationId,
      provider: 'oddspapi',
      quota_type: state.quota_type,
      period_start: state.period_start,
      amount,
      confirmed_amount: 0,
      released_amount: 0,
      status: 'RESERVED',
      endpoint,
      request_id: idempotencyKey,
      idempotency_key: idempotencyKey,
      subscription_cycle_key: effectiveCycleKey,
      http_status: null,
      billing_outcome: 'PENDING',
      error_code: null,
      metadata: args.p_metadata ? JSON.parse(JSON.stringify(args.p_metadata)) : {},
      expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      created_at: nowIso,
      resolved_at: null,
      updated_at: nowIso,
    };
    this.validateReservationConstraints(null, resRow);
    this.quotaReservationRows.set(reservationId, resRow);

    return {
      ok: true,
      idempotent_replay: false,
      error_code: null,
      reservation_id: reservationId,
      status: 'RESERVED',
      amount,
      consumed: state.consumed,
      reserved: state.reserved,
      limit_value: state.limit_value,
      operational_ceiling: state.operational_ceiling,
      mandatory_reserve: state.mandatory_reserve,
      operational_remaining: Math.max(0, state.operational_ceiling - state.consumed - state.reserved),
      subscription_cycle_key: effectiveCycleKey,
    };
  }

  private execConfirm(args: Record<string, any>): any {
    const reservationId = args.p_reservation_id;
    if (!reservationId) {
      return {
        ok: false,
        error_code: 'RESERVATION_NOT_FOUND',
        reason: 'p_reservation_id is required.',
      };
    }

    const res = this.quotaReservationRows.get(reservationId);
    if (!res) {
      return {
        ok: false,
        error_code: 'RESERVATION_NOT_FOUND',
        reason: `RESERVATION_NOT_FOUND: reservation ${reservationId} does not exist.`,
      };
    }

    // Lock #1: public.quota_state FIRST, Lock #2: public.quota_reservations SECOND
    this.lockAcquisitionOrderLog.push({
      rpc: 'salmo_confirm_oddspapi_quota',
      lockOrder: ['public.quota_state', 'public.quota_reservations'],
    });

    const state = this.findActiveOddspapiState(res.subscription_cycle_key);
    if (!state) {
      return {
        ok: false,
        error_code: 'MISSING_QUOTA_STATE',
        reason: 'MISSING_QUOTA_STATE: parent quota_state row not found.',
      };
    }

    if (res.status === 'RELEASED' || res.status === 'ROLLED_BACK') {
      return {
        ok: false,
        error_code: 'INVALID_STATE_TRANSITION',
        reason: `INVALID_STATE_TRANSITION: cannot confirm reservation ${reservationId} in terminal status ${res.status}.`,
        status: res.status,
        consumed: state.consumed,
        reserved: state.reserved,
      };
    }

    if (res.status === 'CONFIRMED') {
      return {
        ok: true,
        idempotent_replay: true,
        error_code: 'ALREADY_CONFIRMED',
        reservation_id: res.id,
        status: res.status,
        confirmed_amount: res.confirmed_amount,
        released_amount: res.released_amount,
        consumed: state.consumed,
        reserved: state.reserved,
      };
    }

    const stepKey = typeof args.p_step_key === 'string' && args.p_step_key.trim() !== '' ? args.p_step_key.trim() : null;
    const settledSteps: string[] = Array.isArray(res.metadata?.settled_steps) ? [...res.metadata.settled_steps] : [];
    if (stepKey && settledSteps.includes(stepKey)) {
      return {
        ok: true,
        idempotent_replay: true,
        error_code: 'ALREADY_CONFIRMED',
        reservation_id: res.id,
        status: res.status,
        confirmed_amount: res.confirmed_amount,
        released_amount: res.released_amount,
        consumed: state.consumed,
        reserved: state.reserved,
      };
    }

    const unsettled = res.amount - res.confirmed_amount - res.released_amount;
    const incConfirmed = args.p_confirmed_amount !== null && args.p_confirmed_amount !== undefined
      ? Number(args.p_confirmed_amount)
      : unsettled;
    const incReleased = args.p_released_amount !== null && args.p_released_amount !== undefined
      ? Number(args.p_released_amount)
      : 0;
    const totalDelta = incConfirmed + incReleased;

    if (
      !Number.isInteger(incConfirmed) ||
      !Number.isInteger(incReleased) ||
      incConfirmed < 0 ||
      incReleased < 0 ||
      totalDelta <= 0 ||
      totalDelta > unsettled
    ) {
      return {
        ok: false,
        error_code: 'INVALID_AMOUNT',
        reason: `INVALID_AMOUNT: cannot settle confirmed=${incConfirmed} + released=${incReleased} against unsettled=${unsettled} (total amount=${res.amount}).`,
      };
    }

    const newConfirmed = res.confirmed_amount + incConfirmed;
    const newReleased = res.released_amount + incReleased;
    const isFullySettled = newConfirmed + newReleased === res.amount;
    const nextStatus: ReservationStatus = isFullySettled
      ? newConfirmed > 0
        ? 'CONFIRMED'
        : 'RELEASED'
      : 'RESERVED';

    const httpStatus = args.p_http_status ?? 200;
    let nextOutcome: BillingOutcome;
    if (isFullySettled && newConfirmed > 0 && newReleased > 0) {
      nextOutcome = 'PARTIAL_BATCH_SETTLED';
    } else if (typeof httpStatus === 'number' && httpStatus >= 500) {
      nextOutcome = (args.p_billing_outcome && args.p_billing_outcome !== 'SUCCESS_2XX')
        ? args.p_billing_outcome
        : 'BILLABLE_SERVER_ERROR';
    } else if (typeof httpStatus === 'number' && httpStatus >= 400) {
      nextOutcome = (args.p_billing_outcome && args.p_billing_outcome !== 'SUCCESS_2XX')
        ? args.p_billing_outcome
        : 'BILLABLE_CLIENT_ERROR';
    } else {
      nextOutcome = args.p_billing_outcome || 'SUCCESS_2XX';
    }

    if (stepKey) {
      settledSteps.push(stepKey);
    }

    const nowIso = new Date().toISOString();
    const updatedRes: QuotaReservationRow = {
      ...res,
      confirmed_amount: newConfirmed,
      released_amount: newReleased,
      status: nextStatus,
      http_status: httpStatus ?? res.http_status,
      billing_outcome: nextOutcome,
      error_code: args.p_error_code ?? res.error_code,
      metadata: { ...res.metadata, settled_steps: settledSteps },
      resolved_at: isFullySettled ? nowIso : res.resolved_at,
      updated_at: nowIso,
    };

    this.validateReservationConstraints(res, updatedRes);
    this.quotaReservationRows.set(res.id, updatedRes);

    state.consumed += incConfirmed;
    state.reserved = Math.max(0, state.reserved - totalDelta);
    state.updated_at = nowIso;
    this.validateQuotaStateConstraints(state);

    return {
      ok: true,
      idempotent_replay: false,
      error_code: null,
      reservation_id: updatedRes.id,
      status: updatedRes.status,
      amount: updatedRes.amount,
      confirmed_amount: updatedRes.confirmed_amount,
      released_amount: updatedRes.released_amount,
      billing_outcome: updatedRes.billing_outcome,
      consumed: state.consumed,
      reserved: state.reserved,
      limit_value: state.limit_value,
      operational_ceiling: state.operational_ceiling,
      operational_remaining: Math.max(0, state.operational_ceiling - state.consumed - state.reserved),
    };
  }

  private execRelease(args: Record<string, any>): any {
    const reservationId = args.p_reservation_id;
    if (!reservationId) {
      return {
        ok: false,
        error_code: 'RESERVATION_NOT_FOUND',
        reason: 'p_reservation_id is required.',
      };
    }

    const httpStatus = args.p_http_status ?? null;
    const isAmbiguousTransport = Boolean(args.p_is_ambiguous_transport);

    // Official Billing Safety Guard inside SQL:
    // Billable HTTP statuses (200, 4xx/5xx except 401/429) and ambiguous post-dispatch
    // transport failures MUST be confirmed rather than released as free.
    if (
      isAmbiguousTransport ||
      (typeof httpStatus === 'number' && httpStatus >= 200 && httpStatus < 600 && httpStatus !== 401 && httpStatus !== 429)
    ) {
      const confirmRes = this.execConfirm({
        p_reservation_id: reservationId,
        p_confirmed_amount: args.p_released_amount ?? null,
        p_released_amount: 0,
        p_http_status: httpStatus,
        p_billing_outcome: isAmbiguousTransport
          ? 'AMBIGUOUS_TRANSPORT_CHARGED'
          : httpStatus >= 500
          ? 'BILLABLE_SERVER_ERROR'
          : 'BILLABLE_CLIENT_ERROR',
        p_step_key: args.p_step_key ?? null,
        p_error_code: args.p_error_code || 'BILLABLE_RELEASE_REFUSED',
      });
      return {
        ...confirmRes,
        converted_to_billable_confirm: true,
      };
    }

    const res = this.quotaReservationRows.get(reservationId);
    if (!res) {
      return {
        ok: false,
        error_code: 'RESERVATION_NOT_FOUND',
        reason: `RESERVATION_NOT_FOUND: reservation ${reservationId} does not exist.`,
      };
    }

    // Lock #1: public.quota_state FIRST, Lock #2: public.quota_reservations SECOND
    this.lockAcquisitionOrderLog.push({
      rpc: 'salmo_release_oddspapi_quota',
      lockOrder: ['public.quota_state', 'public.quota_reservations'],
    });

    const state = this.findActiveOddspapiState(res.subscription_cycle_key);
    if (!state) {
      return {
        ok: false,
        error_code: 'MISSING_QUOTA_STATE',
        reason: 'MISSING_QUOTA_STATE: parent quota_state row not found.',
      };
    }

    if (res.status === 'CONFIRMED') {
      return {
        ok: false,
        error_code: 'INVALID_STATE_TRANSITION',
        reason: `INVALID_STATE_TRANSITION: cannot release reservation ${reservationId} because it is already CONFIRMED.`,
        status: res.status,
        consumed: state.consumed,
        reserved: state.reserved,
      };
    }

    if (res.status === 'RELEASED' || res.status === 'ROLLED_BACK') {
      return {
        ok: true,
        idempotent_replay: true,
        converted_to_billable_confirm: false,
        error_code: 'ALREADY_RELEASED',
        reservation_id: res.id,
        status: res.status,
        confirmed_amount: res.confirmed_amount,
        released_amount: res.released_amount,
        consumed: state.consumed,
        reserved: state.reserved,
      };
    }

    const stepKey = typeof args.p_step_key === 'string' && args.p_step_key.trim() !== '' ? args.p_step_key.trim() : null;
    const settledSteps: string[] = Array.isArray(res.metadata?.settled_steps) ? [...res.metadata.settled_steps] : [];
    if (stepKey && settledSteps.includes(stepKey)) {
      return {
        ok: true,
        idempotent_replay: true,
        converted_to_billable_confirm: false,
        error_code: 'ALREADY_RELEASED',
        reservation_id: res.id,
        status: res.status,
        confirmed_amount: res.confirmed_amount,
        released_amount: res.released_amount,
        consumed: state.consumed,
        reserved: state.reserved,
      };
    }

    const unsettled = res.amount - res.confirmed_amount - res.released_amount;
    const incReleased =
      args.p_released_amount !== null && args.p_released_amount !== undefined
        ? Number(args.p_released_amount)
        : unsettled;

    if (!Number.isInteger(incReleased) || incReleased <= 0 || incReleased > unsettled) {
      return {
        ok: false,
        error_code: 'INVALID_AMOUNT',
        reason: `INVALID_AMOUNT: cannot release ${incReleased} unit(s) when unsettled=${unsettled}.`,
      };
    }

    const newReleased = res.released_amount + incReleased;
    const isFullySettled = res.confirmed_amount + newReleased === res.amount;
    const nextStatus: ReservationStatus = isFullySettled
      ? res.confirmed_amount > 0
        ? 'CONFIRMED'
        : 'RELEASED'
      : 'RESERVED';

    let nextOutcome: BillingOutcome;
    if (isFullySettled && res.confirmed_amount > 0) {
      nextOutcome = 'PARTIAL_BATCH_SETTLED';
    } else if (httpStatus === 401) {
      nextOutcome = 'FREE_401_UNAUTHORIZED';
    } else if (httpStatus === 429) {
      nextOutcome = 'FREE_429_RATE_LIMITED';
    } else {
      nextOutcome = args.p_billing_outcome || 'PRE_REQUEST_ABORT';
    }

    if (stepKey) {
      settledSteps.push(stepKey);
    }

    const nowIso = new Date().toISOString();
    const updatedRes: QuotaReservationRow = {
      ...res,
      released_amount: newReleased,
      status: nextStatus,
      http_status: httpStatus ?? res.http_status,
      billing_outcome: nextOutcome,
      error_code: args.p_error_code ?? res.error_code,
      metadata: { ...res.metadata, settled_steps: settledSteps },
      resolved_at: isFullySettled ? nowIso : res.resolved_at,
      updated_at: nowIso,
    };

    this.validateReservationConstraints(res, updatedRes);
    this.quotaReservationRows.set(res.id, updatedRes);

    state.reserved = Math.max(0, state.reserved - incReleased);
    state.updated_at = nowIso;
    this.validateQuotaStateConstraints(state);

    return {
      ok: true,
      idempotent_replay: false,
      converted_to_billable_confirm: false,
      error_code: null,
      reservation_id: updatedRes.id,
      status: updatedRes.status,
      amount: updatedRes.amount,
      confirmed_amount: updatedRes.confirmed_amount,
      released_amount: updatedRes.released_amount,
      billing_outcome: updatedRes.billing_outcome,
      consumed: state.consumed,
      reserved: state.reserved,
      limit_value: state.limit_value,
      operational_ceiling: state.operational_ceiling,
      operational_remaining: Math.max(0, state.operational_ceiling - state.consumed - state.reserved),
    };
  }

  private execCleanupStale(args: Record<string, any>): any {
    const staleSeconds = Math.max(Number(args.p_stale_seconds ?? 600), 0);

    // Lock #1: public.quota_state FIRST, Lock #2: public.quota_reservations SECOND
    this.lockAcquisitionOrderLog.push({
      rpc: 'salmo_cleanup_stale_oddspapi_reservations',
      lockOrder: ['public.quota_state', 'public.quota_reservations'],
    });

    const state = this.findActiveOddspapiState();
    if (!state) {
      return { ok: true, rows_recovered: 0, units_recovered: 0 };
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    let rowsRecovered = 0;
    let unitsRecovered = 0;

    for (const res of this.quotaReservationRows.values()) {
      if (res.provider !== 'oddspapi' || res.status !== 'RESERVED') continue;
      const expiredByTtl = res.expires_at ? Date.parse(res.expires_at) < nowMs : false;
      const expiredByAge = Date.parse(res.created_at) <= nowMs - staleSeconds * 1000;
      if (!expiredByTtl && !expiredByAge) continue;

      const unsettled = Math.max(0, res.amount - res.confirmed_amount - res.released_amount);
      const updatedRes: QuotaReservationRow = {
        ...res,
        released_amount: res.released_amount + unsettled,
        status: res.confirmed_amount > 0 ? 'CONFIRMED' : 'RELEASED',
        billing_outcome: res.confirmed_amount > 0 ? 'PARTIAL_BATCH_SETTLED' : 'STALE_EXPIRED_RELEASED',
        error_code: 'STALE_RESERVATION_EXPIRED',
        resolved_at: nowIso,
        updated_at: nowIso,
      };
      this.validateReservationConstraints(res, updatedRes);
      this.quotaReservationRows.set(res.id, updatedRes);

      rowsRecovered += 1;
      unitsRecovered += unsettled;
    }

    if (unitsRecovered > 0) {
      state.reserved = Math.max(0, state.reserved - unitsRecovered);
      state.updated_at = nowIso;
      this.validateQuotaStateConstraints(state);
    }

    return {
      ok: true,
      rows_recovered: rowsRecovered,
      units_recovered: unitsRecovered,
      consumed: state.consumed,
      reserved: state.reserved,
    };
  }
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
  private static confirmedTerminalIds = new Set<string>();
  private static releasedTerminalIds = new Set<string>();
  private static idempotencyReservationMap = new Map<string, string>();
  private static inMemoryConfirmedCost = 0;
  private static localConsumedFloor = 0;
  private static trackedCycleKey: string | null = null;
  private static mockPersistentQuotaStore: { consumed: number; limit: number; updatedAt: string } | null = null;
  private static atomicRpcClientForTest: AtomicQuotaRpcClient | null = null;
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
   *   or pre-request aborts before transport are unbilled (0 requests).
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

  /**
   * Worst-case billing safety classification for ambiguous transport failures after request dispatch:
   * - If a request was aborted BEFORE transport (e.g. `preRequestAbort: true`, `transportDispatched: false`,
   *   or explicit `'before HTTP response'` / `'ENOTFOUND'` / `'ECONNREFUSED'`), it is unbilled.
   * - If a request timed out or dropped AFTER dispatch where it is uncertain whether the provider
   *   processed the request (e.g. `ETIMEDOUT`, `AbortError`, `UND_ERR_HEADERS_TIMEOUT`, `socket hang up`,
   *   `timed out`, `after dispatch`, or `ambiguousTransport: true`), fail closed on quota safety by
   *   confirming/charging the unit rather than releasing it as free.
   */
  public static isAmbiguousPostDispatchFailure(details: {
    statusCode?: number;
    error?: string;
    ambiguousTransport?: boolean;
    transportDispatched?: boolean;
    preRequestAbort?: boolean;
  }): boolean {
    if (details.preRequestAbort === true || details.transportDispatched === false) {
      return false;
    }
    if (typeof details.statusCode === 'number' && Number.isFinite(details.statusCode)) {
      return false;
    }
    if (details.ambiguousTransport === true) {
      return true;
    }
    const errText = String(details.error || '');
    if (!errText) {
      return false;
    }
    if (/\b(before HTTP response|before request|pre-request|pre_request_abort|ENOTFOUND|ECONNREFUSED|EHOSTUNREACH|EAI_AGAIN)\b/i.test(errText)) {
      return false;
    }
    if (/\b(timeout|timed out|ETIMEDOUT|ESOCKETTIMEDOUT|UND_ERR_HEADERS_TIMEOUT|UND_ERR_BODY_TIMEOUT|AbortError|after dispatch|ambiguous|socket hang up|read ECONNRESET)\b/i.test(errText)) {
      return true;
    }
    return details.transportDispatched === true;
  }

  public static setAtomicRpcClientForTest(client: AtomicQuotaRpcClient | null): void {
    this.atomicRpcClientForTest = client;
  }

  public static getAtomicRpcClientForTest(): AtomicQuotaRpcClient | null {
    return this.atomicRpcClientForTest;
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
   * any configured mock persistent quota store or atomic RPC database engine.
   */
  public static simulateColdStartForTest(): void {
    this.lastAccountSyncTime = 0;
    this.cachedAccountData = null;
    this.circuitTripped = false;
    this.circuitBreakerReason = null;
    this.activeReservations.clear();
    this.confirmedReservations.clear();
    this.closedReservations.clear();
    this.confirmedTerminalIds.clear();
    this.releasedTerminalIds.clear();
    this.idempotencyReservationMap.clear();
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
      this.confirmedTerminalIds.clear();
      this.releasedTerminalIds.clear();
      this.idempotencyReservationMap.clear();
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
    this.confirmedTerminalIds.clear();
    this.releasedTerminalIds.clear();
    this.idempotencyReservationMap.clear();
    this.inMemoryConfirmedCost = 0;
    this.localConsumedFloor = 0;
    this.trackedCycleKey = null;
    this.mockPersistentQuotaStore = null;
    this.atomicRpcClientForTest = null;
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

  private static resolveActiveRpcClient(allowProductionWrite = false): AtomicQuotaRpcClient | null {
    if (this.atomicRpcClientForTest) {
      return this.atomicRpcClientForTest;
    }
    if (this.isProductionDatabaseWriteAllowed(allowProductionWrite)) {
      try {
        return getDbClient() as unknown as AtomicQuotaRpcClient;
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Synchronizes /v4/account subscription cycle and request_count atomically via
   * public.salmo_sync_oddspapi_quota_cycle RPC.
   */
  public static async syncQuotaCycleAtomic(
    params: {
      subscriptionCycleKey: string;
      providerCount: number;
      providerLimit?: number;
      mandatoryReserve?: number;
      periodStart?: string;
      periodEnd?: string;
    },
    allowProductionWrite = false
  ): Promise<{
    ok: boolean;
    errorCode?: AtomicQuotaErrorCode;
    cycleRollover?: boolean;
    state?: any;
    reason?: string;
  }> {
    const rpcClient = this.resolveActiveRpcClient(allowProductionWrite);
    if (!rpcClient) {
      return {
        ok: false,
        errorCode: 'DB_UNREACHABLE_BLOCK',
        reason: 'DB_UNREACHABLE_BLOCK: No active atomic RPC client configured or production writes disabled.',
      };
    }

    try {
      const { data, error } = await rpcClient.rpc('salmo_sync_oddspapi_quota_cycle', {
        p_subscription_cycle_key: params.subscriptionCycleKey,
        p_provider_count: params.providerCount,
        p_provider_limit: params.providerLimit ?? this.DEFAULT_MONTHLY_LIMIT,
        p_mandatory_reserve: params.mandatoryReserve ?? this.MANDATORY_MULTI_LEAGUE_RESERVE,
        p_period_start: params.periodStart ?? null,
        p_period_end: params.periodEnd ?? null,
      });

      if (error || !data) {
        return {
          ok: false,
          errorCode: 'DB_UNREACHABLE_BLOCK',
          reason: `DB_UNREACHABLE_BLOCK: salmo_sync_oddspapi_quota_cycle failed: ${error?.message || 'null response'}`,
        };
      }

      if (!data.ok) {
        return {
          ok: false,
          errorCode: data.error_code || 'INVALID_AMOUNT',
          reason: data.reason,
        };
      }

      if (data.cycle_rollover) {
        this.inMemoryConfirmedCost = 0;
        this.localConsumedFloor = Number(data.state?.consumed ?? params.providerCount);
        this.trackedCycleKey = params.subscriptionCycleKey;
      } else {
        this.trackedCycleKey = params.subscriptionCycleKey;
        this.localConsumedFloor = Math.max(this.localConsumedFloor, Number(data.state?.consumed ?? params.providerCount));
      }

      return {
        ok: true,
        cycleRollover: Boolean(data.cycle_rollover),
        state: data.state,
      };
    } catch (err) {
      return {
        ok: false,
        errorCode: 'DB_UNREACHABLE_BLOCK',
        reason: `DB_UNREACHABLE_BLOCK: exception calling salmo_sync_oddspapi_quota_cycle: ${String(err)}`,
      };
    }
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
    const cycleKey = `${sub.subscription_id || 'oddspapi'}:${validFrom || 'default'}`;
    const operationalCeiling = Math.max(0, requestLimit - mandatoryReserve);
    const activeReservedCost = Array.from(this.activeReservations.values()).reduce((sum, r) => sum + r.cost, 0);
    const effectiveCommitted = requestCount + activeReservedCost;
    const remainingTotal = Math.max(0, requestLimit - effectiveCommitted);
    const remainingOperationalBudget = Math.max(0, operationalCeiling - effectiveCommitted);
    const idempotencyCycleKey = `cycle_${validFrom || 'default'}_c${requestCount}_${checkedAtUtc.slice(0, 10)}`;

    // Sync reset count via atomic RPC ONLY when production writes or test RPC client are explicitly authorized
    if (this.atomicRpcClientForTest || this.isProductionDatabaseWriteAllowed(allowProductionWrite)) {
      await this.syncQuotaCycleAtomic(
        {
          subscriptionCycleKey: cycleKey,
          providerCount: requestCount,
          providerLimit: requestLimit,
          mandatoryReserve,
          periodStart: validFrom || undefined,
        },
        allowProductionWrite
      );
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
            this.inMemoryConfirmedCost = 0;
            this.localConsumedFloor = Number(sub.request_count);
            this.confirmedReservations.clear();
            this.closedReservations.clear();
            this.confirmedTerminalIds.clear();
            this.releasedTerminalIds.clear();
            this.idempotencyReservationMap.clear();
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
   * Persists state in Supabase public.quota_state via atomic RPC ONLY when allowProductionWrite is authorized.
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
        errorCode: 'CIRCUIT_BREAKER_OPEN',
        reason: this.circuitBreakerReason || 'Circuit breaker is open due to previous 429/401 response.',
        consumed: Math.max(this.localConsumedFloor, this.cachedAccountData?.subscriptions?.[0]?.request_count || 0),
        limit: this.DEFAULT_MONTHLY_LIMIT,
        hardStopThreshold: this.DEFAULT_MONTHLY_LIMIT - reserve,
        remaining: 0,
        reserve,
        source: 'FALLBACK',
      };
    }

    if (typeof requiredCost !== 'number' || !Number.isFinite(requiredCost) || requiredCost <= 0) {
      return {
        allowed: false,
        errorCode: 'INVALID_AMOUNT',
        reason: `INVALID_AMOUNT: requiredCost must be a positive number, got ${String(requiredCost)}.`,
        consumed: this.localConsumedFloor,
        limit: this.DEFAULT_MONTHLY_LIMIT,
        hardStopThreshold: this.DEFAULT_MONTHLY_LIMIT - reserve,
        remaining: 0,
        reserve,
        source: 'FALLBACK',
      };
    }

    let consumed = 0;
    let dbReserved = 0;
    let limit = this.DEFAULT_MONTHLY_LIMIT;
    let source: QuotaGuardStatus['source'] = 'SUPABASE';
    let subscriptionCycleKey: string | null = this.trackedCycleKey;

    let dbVerified = false;
    let accountVerified = false;

    // 1. Read persistent quota from atomic test engine, mock store, or Supabase
    if (this.atomicRpcClientForTest instanceof AtomicOddsPapiQuotaDatabaseEngine) {
      const snap = this.atomicRpcClientForTest.getQuotaStateSnapshot();
      if (snap) {
        limit = Number(snap.limit_value || this.DEFAULT_MONTHLY_LIMIT);
        consumed = Number(snap.consumed || 0);
        dbReserved = Number(snap.reserved || 0);
        subscriptionCycleKey = snap.subscription_cycle_key;
        dbVerified = true;
        source = 'SUPABASE';
      }
    } else if (this.mockPersistentQuotaStore) {
      limit = Number(this.mockPersistentQuotaStore.limit || this.DEFAULT_MONTHLY_LIMIT);
      consumed = Number(this.mockPersistentQuotaStore.consumed || 0);
      dbVerified = true;
      source = 'SUPABASE';
    } else {
      try {
        const client = getDbClient();
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
            limit = Number(dbRow.limit_value || this.DEFAULT_MONTHLY_LIMIT);
            consumed = Number(dbRow.consumed || 0);
            dbReserved = Number(dbRow.reserved || 0);
            subscriptionCycleKey = dbRow.subscription_cycle_key ?? null;
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
      const incomingCycleKey = `${sub.subscription_id || 'default'}:${sub.valid_from || 'default'}`;

      if (!dbVerified) {
        consumed = providerCount;
        limit = providerLimit;
        subscriptionCycleKey = incomingCycleKey;
        source = 'ODDSPAPI_ACCOUNT_SYNC';
      } else if (providerCount !== consumed || providerLimit !== limit) {
        consumed = Math.max(consumed, providerCount);
        limit = providerLimit;
        if (providerCount >= consumed) {
          source = 'ODDSPAPI_ACCOUNT_SYNC';
        }

        if (this.isProductionDatabaseWriteAllowed(allowProductionWrite)) {
          await this.syncQuotaCycleAtomic(
            {
              subscriptionCycleKey: incomingCycleKey,
              providerCount: consumed,
              providerLimit,
              mandatoryReserve: reserve,
              periodStart: sub.valid_from || undefined,
            },
            allowProductionWrite
          );
        }
      }
    }

    // Fail closed if neither DB nor unmetered account could be verified
    if (!dbVerified && !accountVerified) {
      const reason = 'DB_UNREACHABLE_BLOCK: Neither persistent quota_state nor /v4/account could be verified; failing closed (hard-stop threshold enforced; consumed unavailable).';
      Logger.warn(`[OddsPapiQuotaGuard] ${reason}`);
      return {
        allowed: false,
        errorCode: 'DB_UNREACHABLE_BLOCK',
        reason,
        consumed: limit,
        limit,
        hardStopThreshold: limit - reserve,
        remaining: 0,
        reserve,
        source: 'FALLBACK',
      };
    }

    // 3. Enforce in-memory monotonic confirmation floor
    if (this.inMemoryConfirmedCost > 0 && this.localConsumedFloor > consumed) {
      consumed = this.localConsumedFloor;
    }

    const hardStopThreshold = Math.min(
      Math.floor(limit * this.HARD_STOP_RATIO),
      Math.max(0, limit - reserve)
    );
    const localActiveReservedCost = Array.from(this.activeReservations.values()).reduce((sum, r) => sum + r.cost, 0);
    const effectiveReserved = Math.max(dbReserved, localActiveReservedCost);
    const totalCommitted = consumed + effectiveReserved;
    const remaining = Math.max(0, limit - totalCommitted);

    if (totalCommitted >= hardStopThreshold || (totalCommitted + requiredCost) > hardStopThreshold) {
      const reason = `OddsPAPI persistent quota hard-stop: ${totalCommitted}/${limit} consumed (exceeds hard-stop threshold of ${hardStopThreshold}; reserve=${reserve}).`;
      Logger.warn(`[OddsPapiQuotaGuard] ${reason}`);
      return {
        allowed: false,
        errorCode: 'QUOTA_EXHAUSTED',
        reason,
        consumed: totalCommitted,
        reserved: effectiveReserved,
        limit,
        hardStopThreshold,
        remaining,
        reserve,
        subscriptionCycleKey,
        source,
      };
    }

    return {
      allowed: true,
      consumed: totalCommitted,
      reserved: effectiveReserved,
      limit,
      hardStopThreshold,
      remaining,
      reserve,
      subscriptionCycleKey,
      source,
    };
  }

  /**
   * Reserves quota units atomically before executing a paid request.
   * When an atomic RPC client is active (production write enabled or test RPC engine configured),
   * delegates directly to `public.salmo_reserve_oddspapi_quota` under row-level FOR UPDATE lock
   * and fails closed (`DB_UNREACHABLE_BLOCK`) if the RPC fails.
   */
  public static async reserveQuota(
    cost = 1,
    options?: {
      endpoint?: string;
      idempotencyKey?: string;
      subscriptionCycleKey?: string;
      mandatoryReserve?: number;
      metadata?: Record<string, any>;
      allowProductionWrite?: boolean;
    }
  ): Promise<{
    allowed: boolean;
    reservationId?: string;
    errorCode?: AtomicQuotaErrorCode;
    idempotentReplay?: boolean;
    status?: ReservationStatus;
    reason?: string;
    state?: any;
  }> {
    if (this.circuitTripped) {
      return {
        allowed: false,
        errorCode: 'CIRCUIT_BREAKER_OPEN',
        reason: this.circuitBreakerReason || 'Circuit breaker is open due to previous 429/401 response.',
      };
    }

    if (typeof cost !== 'number' || !Number.isInteger(cost) || cost <= 0) {
      return {
        allowed: false,
        errorCode: 'INVALID_AMOUNT',
        reason: `INVALID_AMOUNT: reservation cost must be a positive integer, got ${String(cost)}.`,
      };
    }

    const rpcClient = this.resolveActiveRpcClient(options?.allowProductionWrite);
    if (rpcClient) {
      const idempotencyKey =
        options?.idempotencyKey !== undefined
          ? options.idempotencyKey
          : `res_key_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      try {
        const { data, error } = await rpcClient.rpc('salmo_reserve_oddspapi_quota', {
          p_amount: cost,
          p_endpoint: options?.endpoint || 'oddspapi',
          p_idempotency_key: idempotencyKey,
          p_subscription_cycle_key: options?.subscriptionCycleKey ?? this.trackedCycleKey ?? null,
          p_mandatory_reserve:
            options?.mandatoryReserve ??
            Number(process.env.ODDSPAPI_MULTI_LEAGUE_RESERVE || this.MANDATORY_MULTI_LEAGUE_RESERVE),
          p_hard_stop_ratio: this.HARD_STOP_RATIO,
          p_ttl_seconds: 600,
          p_metadata: options?.metadata || {},
        });

        if (error || !data) {
          const reason = `DB_UNREACHABLE_BLOCK: Atomic quota reservation RPC salmo_reserve_oddspapi_quota failed (${error?.message || 'null response'}); failing closed.`;
          Logger.error(`[OddsPapiQuotaGuard] ${reason}`);
          return {
            allowed: false,
            errorCode: 'DB_UNREACHABLE_BLOCK',
            reason,
          };
        }

        if (!data.ok) {
          const errCode: AtomicQuotaErrorCode = data.error_code || 'QUOTA_EXHAUSTED';
          const reason = data.reason || `Atomic quota reservation rejected (${errCode}).`;
          Logger.warn(`[OddsPapiQuotaGuard] ${reason}`);
          return {
            allowed: false,
            reservationId: data.reservation_id ? String(data.reservation_id) : undefined,
            errorCode: errCode,
            idempotentReplay: Boolean(data.idempotent_replay),
            status: data.status,
            reason,
            state: data,
          };
        }

        const reservationId = String(data.reservation_id);
        if (data.status === 'RESERVED') {
          this.activeReservations.set(reservationId, {
            reservationId,
            cost: Number(data.amount ?? cost),
            confirmedAmount: Number(data.confirmed_amount ?? 0),
            releasedAmount: Number(data.released_amount ?? 0),
            idempotencyKey,
            subscriptionCycleKey: data.subscription_cycle_key ?? null,
            reservedAt: new Date().toISOString(),
            confirmed: false,
            status: 'RESERVED',
          });
        }

        return {
          allowed: true,
          reservationId,
          errorCode: data.error_code || undefined,
          idempotentReplay: Boolean(data.idempotent_replay),
          status: data.status || 'RESERVED',
          state: data,
        };
      } catch (rpcErr) {
        const reason = `DB_UNREACHABLE_BLOCK: Exception during atomic reservation RPC: ${String(rpcErr)}; failing closed.`;
        Logger.error(`[OddsPapiQuotaGuard] ${reason}`);
        return {
          allowed: false,
          errorCode: 'DB_UNREACHABLE_BLOCK',
          reason,
        };
      }
    }

    // Offline / non-RPC fallback path (for unit tests without an injected atomic RPC client)
    if (options?.idempotencyKey !== undefined) {
      const trimmedKey = options.idempotencyKey.trim();
      if (!trimmedKey) {
        return {
          allowed: false,
          errorCode: 'INVALID_IDEMPOTENCY_KEY',
          reason: 'INVALID_IDEMPOTENCY_KEY: non-empty deterministic idempotencyKey is required.',
        };
      }
      const existingResId = this.idempotencyReservationMap.get(trimmedKey);
      if (existingResId) {
        const isReleased = this.releasedTerminalIds.has(existingResId);
        return {
          allowed: !isReleased,
          reservationId: existingResId,
          errorCode: 'DUPLICATE_IDEMPOTENCY_KEY',
          idempotentReplay: true,
          status: this.confirmedTerminalIds.has(existingResId)
            ? 'CONFIRMED'
            : isReleased
            ? 'RELEASED'
            : 'RESERVED',
          reason: `Idempotent replay for key ${trimmedKey}.`,
        };
      }
    }

    if (
      options?.subscriptionCycleKey &&
      this.trackedCycleKey &&
      this.trackedCycleKey !== 'default:default' &&
      options.subscriptionCycleKey !== this.trackedCycleKey
    ) {
      return {
        allowed: false,
        errorCode: 'STALE_SUBSCRIPTION_CYCLE',
        reason: `STALE_SUBSCRIPTION_CYCLE: caller cycle ${options.subscriptionCycleKey} does not match tracked cycle ${this.trackedCycleKey}.`,
      };
    }

    const status = await this.checkQuota(cost, options?.mandatoryReserve, false);
    if (!status.allowed) {
      return {
        allowed: false,
        errorCode: status.errorCode || 'QUOTA_EXHAUSTED',
        reason: status.reason,
      };
    }

    const reservationId = `res_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.activeReservations.set(reservationId, {
      reservationId,
      cost,
      confirmedAmount: 0,
      releasedAmount: 0,
      idempotencyKey: options?.idempotencyKey,
      subscriptionCycleKey: options?.subscriptionCycleKey ?? this.trackedCycleKey,
      reservedAt: new Date().toISOString(),
      confirmed: false,
      status: 'RESERVED',
    });
    if (options?.idempotencyKey) {
      this.idempotencyReservationMap.set(options.idempotencyKey.trim(), reservationId);
    }

    return { allowed: true, reservationId, status: 'RESERVED' };
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
      billingOutcome?: BillingOutcome;
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
      billingOutcome: details.billingOutcome,
      countBefore,
      countAfter,
    });

    return { countBefore, countAfter, outcome: auditOutcome };
  }

  /**
   * Confirms billable quota usage after a request reaches a billable endpoint (HTTP 200, billable 4xx/5xx,
   * or ambiguous post-dispatch transport error).
   * Supports partial reservation confirmation via `details.consumedCost` and `details.releasedCost`.
   * Rejects illegal transition `RELEASED -> CONFIRMED` (`INVALID_STATE_TRANSITION`).
   * Idempotent: duplicate confirmations of an already-CONFIRMED reservationId return `ALREADY_CONFIRMED`.
   */
  public static async confirmQuota(
    reservationId: string,
    details: {
      endpoint: string;
      params: Record<string, any>;
      statusCode?: number;
      outcome?: QuotaAuditLogEntry['outcome'];
      billingOutcome?: BillingOutcome;
      error?: string;
      consumedCost?: number;
      releasedCost?: number;
      stepKey?: string;
      countBefore?: number;
      countAfter?: number;
    },
    allowProductionWrite = false
  ): Promise<{
    ok: boolean;
    errorCode?: AtomicQuotaErrorCode;
    idempotentReplay?: boolean;
    status?: ReservationStatus;
    confirmedAmount?: number;
    releasedAmount?: number;
    consumed?: number;
    reserved?: number;
    reason?: string;
  }> {
    const rpcClient = this.resolveActiveRpcClient(allowProductionWrite);
    if (rpcClient) {
      const reservation = this.activeReservations.get(reservationId);
      const confirmedAmountArg =
        typeof details.consumedCost === 'number' ? details.consumedCost : null;
      const releasedAmountArg =
        typeof details.releasedCost === 'number' ? details.releasedCost : 0;

      try {
        const { data, error } = await rpcClient.rpc('salmo_confirm_oddspapi_quota', {
          p_reservation_id: reservationId,
          p_confirmed_amount: confirmedAmountArg,
          p_released_amount: releasedAmountArg,
          p_http_status: details.statusCode ?? 200,
          p_billing_outcome:
            details.billingOutcome ||
            (details.outcome === 'BILLABLE_ERROR' || (typeof details.statusCode === 'number' && details.statusCode >= 400)
              ? details.statusCode && details.statusCode >= 500
                ? 'BILLABLE_SERVER_ERROR'
                : 'BILLABLE_CLIENT_ERROR'
              : 'SUCCESS_2XX'),
          p_step_key: details.stepKey ?? null,
          p_error_code: details.error ?? null,
        });

        if (error || !data) {
          // Even if DB RPC failed during confirm, commit in-memory floor so local instance never undercounts
          const fallbackCost = confirmedAmountArg ?? (reservation?.cost ?? 1);
          if (fallbackCost > 0) {
            this.commitInMemoryUsage(reservationId, fallbackCost, details);
          }
          return {
            ok: false,
            errorCode: 'DB_UNREACHABLE_BLOCK',
            reason: `DB_UNREACHABLE_BLOCK: salmo_confirm_oddspapi_quota failed (${error?.message || 'null response'}).`,
          };
        }

        if (!data.ok) {
          return {
            ok: false,
            errorCode: data.error_code || 'INVALID_STATE_TRANSITION',
            status: data.status,
            consumed: data.consumed,
            reserved: data.reserved,
            reason: data.reason,
          };
        }

        if (data.idempotent_replay) {
          Logger.warn(`[OddsPapiQuotaGuard] Idempotent confirmQuota replay for reservationId=${reservationId}`);
          return {
            ok: true,
            idempotentReplay: true,
            errorCode: data.error_code || 'ALREADY_CONFIRMED',
            status: data.status,
            confirmedAmount: data.confirmed_amount,
            releasedAmount: data.released_amount,
            consumed: data.consumed,
            reserved: data.reserved,
          };
        }

        const deltaConfirmed = confirmedAmountArg ?? (reservation?.cost ?? Number(data.confirmed_amount ?? 1));
        const deltaReleased = releasedAmountArg;

        if (reservation) {
          const totalSettledNow = deltaConfirmed + deltaReleased;
          if (totalSettledNow < reservation.cost && data.status === 'RESERVED') {
            reservation.cost -= totalSettledNow;
            reservation.confirmedAmount = Number(data.confirmed_amount ?? 0);
            reservation.releasedAmount = Number(data.released_amount ?? 0);
          } else {
            this.activeReservations.delete(reservationId);
            this.closedReservations.add(reservationId);
            if (data.status === 'CONFIRMED') {
              this.confirmedTerminalIds.add(reservationId);
            } else if (data.status === 'RELEASED') {
              this.releasedTerminalIds.add(reservationId);
            }
          }
        } else {
          this.closedReservations.add(reservationId);
          if (data.status === 'CONFIRMED') {
            this.confirmedTerminalIds.add(reservationId);
          }
        }

        if (deltaConfirmed > 0) {
          const countAfter = Number(data.consumed ?? (this.localConsumedFloor + deltaConfirmed));
          const countBefore = Math.max(0, countAfter - deltaConfirmed);
          const { outcome } = this.commitInMemoryUsage(reservationId, deltaConfirmed, {
            ...details,
            countBefore,
            countAfter,
            billingOutcome: data.billing_outcome,
          });
          this.logAudit({
            timestamp: new Date().toISOString(),
            endpoint: details.endpoint,
            params: details.params,
            outcome,
            billingOutcome: data.billing_outcome,
            countBefore,
            countAfter,
            statusCode: details.statusCode ?? 200,
            reservationId,
            reason: details.error,
          });
        }

        return {
          ok: true,
          idempotentReplay: false,
          status: data.status,
          confirmedAmount: Number(data.confirmed_amount ?? deltaConfirmed),
          releasedAmount: Number(data.released_amount ?? deltaReleased),
          consumed: Number(data.consumed ?? this.localConsumedFloor),
          reserved: Number(data.reserved ?? 0),
        };
      } catch (rpcErr) {
        return {
          ok: false,
          errorCode: 'DB_UNREACHABLE_BLOCK',
          reason: `DB_UNREACHABLE_BLOCK: exception in confirmQuota RPC: ${String(rpcErr)}`,
        };
      }
    }

    // Offline / non-RPC state machine path
    if (this.releasedTerminalIds.has(reservationId)) {
      const reason = `INVALID_STATE_TRANSITION: cannot confirm reservation ${reservationId} because it is already RELEASED.`;
      Logger.warn(`[OddsPapiQuotaGuard] ${reason}`);
      return {
        ok: false,
        errorCode: 'INVALID_STATE_TRANSITION',
        status: 'RELEASED',
        reason,
      };
    }

    if (this.confirmedTerminalIds.has(reservationId) || this.closedReservations.has(reservationId)) {
      Logger.warn(`[OddsPapiQuotaGuard] Duplicate confirmQuota ignored for already-closed reservationId=${reservationId}`);
      return {
        ok: true,
        idempotentReplay: true,
        errorCode: 'ALREADY_CONFIRMED',
        status: 'CONFIRMED',
        consumed: this.localConsumedFloor,
      };
    }

    const reservation = this.activeReservations.get(reservationId);
    const cost =
      typeof details.consumedCost === 'number'
        ? Math.max(0, reservation ? Math.min(reservation.cost, details.consumedCost) : details.consumedCost)
        : (reservation?.cost ?? 1);
    const releasedCost =
      typeof details.releasedCost === 'number'
        ? Math.max(0, reservation ? Math.min(reservation.cost - cost, details.releasedCost) : 0)
        : 0;
    const totalSettled = cost + releasedCost;

    if (reservation) {
      reservation.confirmedAmount = (reservation.confirmedAmount || 0) + cost;
      reservation.releasedAmount = (reservation.releasedAmount || 0) + releasedCost;
      if (totalSettled < reservation.cost) {
        reservation.cost -= totalSettled;
      } else {
        this.activeReservations.delete(reservationId);
        this.closedReservations.add(reservationId);
        if ((reservation.confirmedAmount || 0) > 0) {
          this.confirmedTerminalIds.add(reservationId);
        } else {
          this.releasedTerminalIds.add(reservationId);
        }
      }
    } else {
      this.closedReservations.add(reservationId);
      this.confirmedTerminalIds.add(reservationId);
    }

    if (cost <= 0) {
      return {
        ok: true,
        idempotentReplay: false,
        status: this.confirmedTerminalIds.has(reservationId) ? 'CONFIRMED' : 'RELEASED',
        confirmedAmount: 0,
        releasedAmount: releasedCost,
        consumed: this.localConsumedFloor,
      };
    }

    const { countBefore, countAfter, outcome } = this.commitInMemoryUsage(reservationId, cost, details);
    await this.recordUsage(cost, allowProductionWrite, countAfter);

    this.logAudit({
      timestamp: new Date().toISOString(),
      endpoint: details.endpoint,
      params: details.params,
      outcome,
      billingOutcome: details.billingOutcome,
      countBefore,
      countAfter,
      statusCode: details.statusCode ?? 200,
      reservationId,
      reason: details.error,
    });

    return {
      ok: true,
      idempotentReplay: false,
      status: this.activeReservations.has(reservationId) ? 'RESERVED' : 'CONFIRMED',
      confirmedAmount: cost,
      releasedAmount: releasedCost,
      consumed: countAfter,
    };
  }

  /**
   * Settles a batch reservation atomically in a single call with explicit confirmed and released units
   * (`confirmedCost + releasedCost === totalReserved`).
   */
  public static async settleBatchQuota(
    reservationId: string,
    settlement: {
      endpoint: string;
      params: Record<string, any>;
      confirmedCost: number;
      releasedCost: number;
      statusCode?: number;
      error?: string;
    },
    allowProductionWrite = false
  ) {
    if (settlement.confirmedCost > 0) {
      return this.confirmQuota(
        reservationId,
        {
          endpoint: settlement.endpoint,
          params: settlement.params,
          statusCode: settlement.statusCode ?? 200,
          consumedCost: settlement.confirmedCost,
          releasedCost: settlement.releasedCost,
          billingOutcome: settlement.releasedCost > 0 ? 'PARTIAL_BATCH_SETTLED' : 'SUCCESS_2XX',
          error: settlement.error,
        },
        allowProductionWrite
      );
    }
    return this.releaseQuotaAsync(
      reservationId,
      {
        endpoint: settlement.endpoint,
        params: settlement.params,
        statusCode: settlement.statusCode,
        consumedCost: settlement.releasedCost,
        preRequestAbort: settlement.statusCode !== 401 && settlement.statusCode !== 429,
        error: settlement.error,
      },
      allowProductionWrite
    );
  }

  /**
   * Async wrapper around releaseQuota that awaits the atomic RPC (`salmo_release_oddspapi_quota`)
   * when an atomic RPC client is active.
   */
  public static async releaseQuotaAsync(
    reservationId: string,
    details: {
      endpoint: string;
      params: Record<string, any>;
      statusCode?: number;
      error?: string;
      consumedCost?: number;
      ambiguousTransport?: boolean;
      transportDispatched?: boolean;
      preRequestAbort?: boolean;
      stepKey?: string;
    },
    allowProductionWrite = false
  ): Promise<{
    ok: boolean;
    errorCode?: AtomicQuotaErrorCode;
    idempotentReplay?: boolean;
    convertedToBillableConfirm?: boolean;
    status?: ReservationStatus;
    confirmedAmount?: number;
    releasedAmount?: number;
    consumed?: number;
    reserved?: number;
    reason?: string;
  }> {
    const rpcClient = this.resolveActiveRpcClient(allowProductionWrite);
    const isAmbiguous = this.isAmbiguousPostDispatchFailure(details);

    if (rpcClient) {
      try {
        const { data, error } = await rpcClient.rpc('salmo_release_oddspapi_quota', {
          p_reservation_id: reservationId,
          p_released_amount: details.consumedCost ?? null,
          p_http_status: details.statusCode ?? null,
          p_is_ambiguous_transport: isAmbiguous,
          p_billing_outcome:
            details.statusCode === 401
              ? 'FREE_401_UNAUTHORIZED'
              : details.statusCode === 429
              ? 'FREE_429_RATE_LIMITED'
              : 'PRE_REQUEST_ABORT',
          p_error_code: details.error ?? null,
          p_step_key: details.stepKey ?? null,
        });

        if (error || !data) {
          return {
            ok: false,
            errorCode: 'DB_UNREACHABLE_BLOCK',
            reason: `DB_UNREACHABLE_BLOCK: salmo_release_oddspapi_quota failed (${error?.message || 'null response'}).`,
          };
        }

        if (!data.ok) {
          return {
            ok: false,
            errorCode: data.error_code || 'INVALID_STATE_TRANSITION',
            status: data.status,
            consumed: data.consumed,
            reserved: data.reserved,
            reason: data.reason,
          };
        }

        if (data.converted_to_billable_confirm) {
          const reservation = this.activeReservations.get(reservationId);
          const cost = details.consumedCost ?? (reservation?.cost ?? 1);
          if (data.status !== 'RESERVED') {
            this.activeReservations.delete(reservationId);
            this.closedReservations.add(reservationId);
            this.confirmedTerminalIds.add(reservationId);
          } else if (reservation) {
            reservation.cost = Math.max(0, reservation.cost - cost);
          }
          const countAfter = Number(data.consumed ?? (this.localConsumedFloor + cost));
          const countBefore = Math.max(0, countAfter - cost);
          this.commitInMemoryUsage(reservationId, cost, {
            ...details,
            outcome: 'BILLABLE_ERROR',
            billingOutcome: data.billing_outcome,
            countBefore,
            countAfter,
          });
          this.logAudit({
            timestamp: new Date().toISOString(),
            endpoint: details.endpoint,
            params: details.params,
            outcome: 'BILLABLE_ERROR',
            billingOutcome: data.billing_outcome,
            countBefore,
            countAfter,
            statusCode: details.statusCode,
            reservationId,
            reason: details.error || 'Billable status or ambiguous post-dispatch failure charged per official rules',
          });
          return {
            ok: true,
            idempotentReplay: Boolean(data.idempotent_replay),
            convertedToBillableConfirm: true,
            status: data.status,
            confirmedAmount: Number(data.confirmed_amount ?? cost),
            releasedAmount: Number(data.released_amount ?? 0),
            consumed: countAfter,
            reserved: Number(data.reserved ?? 0),
          };
        }

        if (data.status !== 'RESERVED') {
          this.activeReservations.delete(reservationId);
          this.closedReservations.add(reservationId);
          if (data.status === 'CONFIRMED') {
            this.confirmedTerminalIds.add(reservationId);
          } else {
            this.releasedTerminalIds.add(reservationId);
          }
        }

        if (details.statusCode === 429 || details.statusCode === 401) {
          this.tripCircuitBreaker(
            details.statusCode,
            details.error || (details.statusCode === 429 ? 'Rate limit exceeded' : 'Unauthorized')
          );
        }

        return {
          ok: true,
          idempotentReplay: Boolean(data.idempotent_replay),
          convertedToBillableConfirm: false,
          errorCode: data.error_code || undefined,
          status: data.status,
          confirmedAmount: Number(data.confirmed_amount ?? 0),
          releasedAmount: Number(data.released_amount ?? 0),
          consumed: Number(data.consumed ?? this.localConsumedFloor),
          reserved: Number(data.reserved ?? 0),
        };
      } catch (rpcErr) {
        return {
          ok: false,
          errorCode: 'DB_UNREACHABLE_BLOCK',
          reason: `DB_UNREACHABLE_BLOCK: exception in releaseQuotaAsync RPC: ${String(rpcErr)}`,
        };
      }
    }

    return this.releaseQuota(reservationId, details);
  }

  /**
   * Releases reserved quota ONLY for documented non-billable failures:
   * - HTTP 429 (quota/rate limit) and HTTP 401 (unauthorized API key), which are rejected before reaching the endpoint.
   * - Confirmed pre-request / pre-response network aborts (where the request never reached the endpoint).
   *
   * CRITICAL BILLING RULE (https://oddspapi.io/us/docs/requests-and-quota):
   * 1. If called with a billable HTTP status code (e.g. 200, 400, 403, 404, 422, 500, 502, 503),
   *    the request reached the endpoint and IS billed by OddsPapi.
   * 2. If called with an ambiguous post-dispatch transport error (e.g. timeout after dispatch),
   *    worst-case quota safety requires charging the unit rather than releasing it as free.
   * 3. Rejects illegal state transition `CONFIRMED -> RELEASED` (`INVALID_STATE_TRANSITION`).
   */
  public static releaseQuota(
    reservationId: string,
    details: {
      endpoint: string;
      params: Record<string, any>;
      statusCode?: number;
      error?: string;
      consumedCost?: number;
      ambiguousTransport?: boolean;
      transportDispatched?: boolean;
      preRequestAbort?: boolean;
      stepKey?: string;
    }
  ): {
    ok: boolean;
    errorCode?: AtomicQuotaErrorCode;
    idempotentReplay?: boolean;
    convertedToBillableConfirm?: boolean;
    status?: ReservationStatus;
    reason?: string;
  } {
    // Reject illegal transition CONFIRMED -> RELEASED
    if (this.confirmedTerminalIds.has(reservationId)) {
      const reason = `INVALID_STATE_TRANSITION: cannot release reservation ${reservationId} because it is already CONFIRMED.`;
      Logger.warn(`[OddsPapiQuotaGuard] ${reason}`);
      return {
        ok: false,
        errorCode: 'INVALID_STATE_TRANSITION',
        status: 'CONFIRMED',
        reason,
      };
    }

    // Idempotent replay if already RELEASED
    if (this.releasedTerminalIds.has(reservationId) || this.closedReservations.has(reservationId)) {
      Logger.warn(`[OddsPapiQuotaGuard] Duplicate releaseQuota ignored for already-closed reservationId=${reservationId}`);
      return {
        ok: true,
        idempotentReplay: true,
        errorCode: 'ALREADY_RELEASED',
        status: 'RELEASED',
      };
    }

    const reservation = this.activeReservations.get(reservationId);
    const isBillableStatus = this.isBillableHttpStatus(details.statusCode);
    const isAmbiguousTransport = this.isAmbiguousPostDispatchFailure(details);

    // Guard against releasing a billable 4xx/5xx HTTP response or ambiguous post-dispatch timeout as free
    if (isBillableStatus || isAmbiguousTransport) {
      const cost =
        typeof details.consumedCost === 'number'
          ? Math.max(1, reservation ? Math.min(reservation.cost, details.consumedCost) : details.consumedCost)
          : (reservation?.cost ?? 1);

      if (reservation) {
        reservation.confirmedAmount = (reservation.confirmedAmount || 0) + cost;
        if (cost < reservation.cost) {
          reservation.cost -= cost;
        } else {
          this.activeReservations.delete(reservationId);
          this.closedReservations.add(reservationId);
          this.confirmedTerminalIds.add(reservationId);
        }
      } else {
        this.closedReservations.add(reservationId);
        this.confirmedTerminalIds.add(reservationId);
      }

      const billingOutcome: BillingOutcome = isAmbiguousTransport
        ? 'AMBIGUOUS_TRANSPORT_CHARGED'
        : details.statusCode && details.statusCode >= 500
        ? 'BILLABLE_SERVER_ERROR'
        : 'BILLABLE_CLIENT_ERROR';

      const { countBefore, countAfter } = this.commitInMemoryUsage(reservationId, cost, {
        ...details,
        outcome: 'BILLABLE_ERROR',
        billingOutcome,
      });

      if (this.mockPersistentQuotaStore) {
        this.mockPersistentQuotaStore.consumed = Math.max(this.mockPersistentQuotaStore.consumed + cost, countAfter);
        this.mockPersistentQuotaStore.updatedAt = new Date().toISOString();
      }

      if (this.atomicRpcClientForTest) {
        void this.atomicRpcClientForTest.rpc('salmo_release_oddspapi_quota', {
          p_reservation_id: reservationId,
          p_released_amount: cost,
          p_http_status: details.statusCode ?? null,
          p_is_ambiguous_transport: isAmbiguousTransport,
          p_error_code: details.error ?? null,
          p_step_key: details.stepKey ?? null,
        });
      }

      this.logAudit({
        timestamp: new Date().toISOString(),
        endpoint: details.endpoint,
        params: details.params,
        outcome: 'BILLABLE_ERROR',
        billingOutcome,
        countBefore,
        countAfter,
        statusCode: details.statusCode,
        reservationId,
        reason:
          details.error ||
          (isAmbiguousTransport
            ? 'Ambiguous post-dispatch transport error charged for worst-case quota safety'
            : `Billable HTTP ${details.statusCode} response accounted against quota per official billing rules`),
      });

      return {
        ok: true,
        idempotentReplay: false,
        convertedToBillableConfirm: true,
        status: this.activeReservations.has(reservationId) ? 'RESERVED' : 'CONFIRMED',
      };
    }

    const releaseUnits =
      typeof details.consumedCost === 'number' && reservation
        ? Math.max(1, Math.min(reservation.cost, details.consumedCost))
        : (reservation?.cost ?? 1);

    if (reservation) {
      reservation.releasedAmount = (reservation.releasedAmount || 0) + releaseUnits;
      if (releaseUnits < reservation.cost) {
        reservation.cost -= releaseUnits;
      } else {
        this.activeReservations.delete(reservationId);
        this.closedReservations.add(reservationId);
        if ((reservation.confirmedAmount || 0) > 0) {
          this.confirmedTerminalIds.add(reservationId);
        } else {
          this.releasedTerminalIds.add(reservationId);
        }
      }
    } else {
      this.closedReservations.add(reservationId);
      this.releasedTerminalIds.add(reservationId);
    }

    if (this.atomicRpcClientForTest) {
      void this.atomicRpcClientForTest.rpc('salmo_release_oddspapi_quota', {
        p_reservation_id: reservationId,
        p_released_amount: releaseUnits,
        p_http_status: details.statusCode ?? null,
        p_is_ambiguous_transport: false,
        p_billing_outcome:
          details.statusCode === 401
            ? 'FREE_401_UNAUTHORIZED'
            : details.statusCode === 429
            ? 'FREE_429_RATE_LIMITED'
            : 'PRE_REQUEST_ABORT',
        p_error_code: details.error ?? null,
        p_step_key: details.stepKey ?? null,
      });
    }

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
      billingOutcome: is429
        ? 'FREE_429_RATE_LIMITED'
        : is401
        ? 'FREE_401_UNAUTHORIZED'
        : 'PRE_REQUEST_ABORT',
      countBefore: count,
      countAfter: count, // Non-billable failure: count is NOT incremented
      statusCode: details.statusCode,
      reservationId,
      reason: details.error,
    });

    return {
      ok: true,
      idempotentReplay: false,
      convertedToBillableConfirm: false,
      status: this.activeReservations.has(reservationId)
        ? 'RESERVED'
        : this.confirmedTerminalIds.has(reservationId)
        ? 'CONFIRMED'
        : 'RELEASED',
    };
  }

  /**
   * Recovers expired RESERVED rows via `salmo_cleanup_stale_oddspapi_reservations`.
   */
  public static async cleanupStaleReservationsAtomic(
    staleSeconds = 600,
    allowProductionWrite = false
  ): Promise<{ ok: boolean; rowsRecovered: number; unitsRecovered: number; errorCode?: AtomicQuotaErrorCode }> {
    const rpcClient = this.resolveActiveRpcClient(allowProductionWrite);
    if (!rpcClient) {
      return { ok: false, rowsRecovered: 0, unitsRecovered: 0, errorCode: 'DB_UNREACHABLE_BLOCK' };
    }
    const { data, error } = await rpcClient.rpc('salmo_cleanup_stale_oddspapi_reservations', {
      p_stale_seconds: staleSeconds,
    });
    if (error || !data) {
      return { ok: false, rowsRecovered: 0, unitsRecovered: 0, errorCode: 'DB_UNREACHABLE_BLOCK' };
    }
    return {
      ok: Boolean(data.ok),
      rowsRecovered: Number(data.rows_recovered ?? 0),
      unitsRecovered: Number(data.units_recovered ?? 0),
    };
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
   * Records billable quota usage to mock persistent store (in offline tests).
   * In production, atomic confirmation is handled directly by `salmo_confirm_oddspapi_quota` RPC.
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
      errorCode: 'DB_UNREACHABLE_BLOCK',
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
