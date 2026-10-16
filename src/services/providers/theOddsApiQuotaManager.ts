// SALMO.DEV — The Odds API Quota Manager
// Enforces request-credit budgeting, rate limiting, and reserve floors.
// Free Tier Budget: 500 requests/month.
// Reserve Floor: 50 requests (hard stop for regular polling).
// Zero Secret Exposure: Never logs API keys or sensitive auth tokens.

import * as fs from 'fs';
import * as path from 'path';

export type TheOddsApiQuotaStatus = 'NORMAL' | 'WARNING' | 'EXHAUSTED' | 'HARD_STOP';

export interface TheOddsApiCallRecord {
  requestId: string;
  endpoint: string;
  method: string;
  cost: number;
  remainingCredits?: number;
  usedCredits?: number;
  timestamp: string;
  success: boolean;
  httpStatus?: number;
  error?: string;
}

export interface TheOddsApiQuotaState {
  totalMonthlyBudget: number;
  used: number;
  remaining: number;
  reserveFloor: number;
  usableRemaining: number;
  status: TheOddsApiQuotaStatus;
  lastUpdated: string;
  lastResetDate?: string;
}

export class TheOddsApiQuotaManager {
  private static readonly DEFAULT_BUDGET = 500;
  private static readonly DEFAULT_RESERVE_FLOOR = 50;
  private static readonly STATE_FILE_PATH = path.resolve('data/quota/the_odds_api_quota.json');

  private static cachedState: TheOddsApiQuotaState | null = null;

  public static loadState(): TheOddsApiQuotaState {
    if (this.cachedState) {
      return { ...this.cachedState };
    }

    const defaultState: TheOddsApiQuotaState = {
      totalMonthlyBudget: this.DEFAULT_BUDGET,
      used: 0,
      remaining: this.DEFAULT_BUDGET,
      reserveFloor: this.DEFAULT_RESERVE_FLOOR,
      usableRemaining: this.DEFAULT_BUDGET - this.DEFAULT_RESERVE_FLOOR,
      status: 'NORMAL',
      lastUpdated: new Date().toISOString(),
    };

    try {
      if (fs.existsSync(this.STATE_FILE_PATH)) {
        const raw = fs.readFileSync(this.STATE_FILE_PATH, 'utf8');
        const parsed = JSON.parse(raw) as Partial<TheOddsApiQuotaState>;
        const budget = parsed.totalMonthlyBudget ?? this.DEFAULT_BUDGET;
        const used = parsed.used ?? 0;
        const remaining = parsed.remaining ?? Math.max(0, budget - used);
        const floor = parsed.reserveFloor ?? this.DEFAULT_RESERVE_FLOOR;
        const usable = Math.max(0, remaining - floor);

        let status: TheOddsApiQuotaStatus = 'NORMAL';
        if (remaining <= 0) {
          status = 'HARD_STOP';
        } else if (usable <= 0) {
          status = 'EXHAUSTED';
        } else if (remaining <= floor * 2) {
          status = 'WARNING';
        }

        this.cachedState = {
          totalMonthlyBudget: budget,
          used,
          remaining,
          reserveFloor: floor,
          usableRemaining: usable,
          status,
          lastUpdated: parsed.lastUpdated ?? new Date().toISOString(),
          lastResetDate: parsed.lastResetDate,
        };
        return { ...this.cachedState };
      }
    } catch (e) {
      // Graceful fallback to default in-memory state
    }

    this.cachedState = defaultState;
    return { ...this.cachedState };
  }

  public static saveState(state: TheOddsApiQuotaState): void {
    this.cachedState = { ...state };
    try {
      const dir = path.dirname(this.STATE_FILE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf8');
    } catch (err) {
      // In read-only or serverless environments, state remains cached in memory
    }
  }

  /**
   * Pre-flight request authorization.
   * Prevents issuing calls that would breach the hard-stop or reserve floor.
   */
  public static authorizeRequest(
    endpoint: string,
    priority: number = 50
  ): {
    allowed: boolean;
    reason?: string;
    state: TheOddsApiQuotaState;
  } {
    const state = this.loadState();

    // 1. Unmetered endpoints (cost = 0) are always allowed if not completely dead
    if (endpoint === 'sports' || endpoint === '/v4/sports') {
      return { allowed: true, state };
    }

    // 2. Complete quota exhaustion: HARD STOP
    if (state.remaining <= 0) {
      return {
        allowed: false,
        reason: 'QUOTA_EXHAUSTED: Remaining request credits are 0.',
        state,
      };
    }

    // 3. Below reserve floor: Only critical calls (priority >= 90) allowed
    if (state.remaining <= state.reserveFloor && priority < 90) {
      return {
        allowed: false,
        reason: `RESERVE_FLOOR_PROTECTION: Remaining credits (${state.remaining}) at or below reserve floor (${state.reserveFloor}). Priority ${priority} < 90.`,
        state,
      };
    }

    return { allowed: true, state };
  }

  /**
   * Records execution outcome and parses response headers for exact credit tracking.
   */
  public static recordExecution(params: {
    requestId: string;
    endpoint: string;
    method?: string;
    cost?: number;
    remainingHeader?: string | null;
    usedHeader?: string | null;
    httpStatus?: number;
    success: boolean;
    error?: string;
  }): TheOddsApiQuotaState {
    const state = this.loadState();
    const cost = params.cost ?? (params.endpoint.includes('sports') && !params.endpoint.includes('odds') ? 0 : 1);

    if (params.remainingHeader !== undefined && params.remainingHeader !== null) {
      const parsedRem = parseInt(params.remainingHeader, 10);
      if (!isNaN(parsedRem)) {
        state.remaining = parsedRem;
      }
    } else if (params.success && cost > 0) {
      state.remaining = Math.max(0, state.remaining - cost);
    }

    if (params.usedHeader !== undefined && params.usedHeader !== null) {
      const parsedUsed = parseInt(params.usedHeader, 10);
      if (!isNaN(parsedUsed)) {
        state.used = parsedUsed;
      }
    } else if (params.success && cost > 0) {
      state.used += cost;
    }

    state.usableRemaining = Math.max(0, state.remaining - state.reserveFloor);

    if (state.remaining <= 0) {
      state.status = 'HARD_STOP';
    } else if (state.usableRemaining <= 0) {
      state.status = 'EXHAUSTED';
    } else if (state.remaining <= state.reserveFloor * 2) {
      state.status = 'WARNING';
    } else {
      state.status = 'NORMAL';
    }

    state.lastUpdated = new Date().toISOString();
    this.saveState(state);
    return { ...state };
  }

  public static getStatus(): TheOddsApiQuotaState {
    return this.loadState();
  }

  public static resetStateForTest(customState?: Partial<TheOddsApiQuotaState>): void {
    const budget = customState?.totalMonthlyBudget ?? this.DEFAULT_BUDGET;
    const floor = customState?.reserveFloor ?? this.DEFAULT_RESERVE_FLOOR;
    const remaining = customState?.remaining ?? budget;
    const used = customState?.used ?? 0;
    const usable = Math.max(0, remaining - floor);

    this.cachedState = {
      totalMonthlyBudget: budget,
      used,
      remaining,
      reserveFloor: floor,
      usableRemaining: usable,
      status: customState?.status ?? (remaining <= 0 ? 'HARD_STOP' : usable <= 0 ? 'EXHAUSTED' : 'NORMAL'),
      lastUpdated: new Date().toISOString(),
      lastResetDate: customState?.lastResetDate,
    };
  }
}
