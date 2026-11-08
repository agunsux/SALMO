// SALMO.DEV — Quota-Aware Orchestration Manager for 5DollarFootballAPI Free Tier
// Strictly enforces free tier rate-limits, hourly budgets, burst ceilings, and request prioritization.
// Zero production interference: Runs as an isolated, self-contained quota engine.

export type RequestPriority = 1 | 2 | 3 | 4 | 5;

export interface QuotaConfig {
  hourlyLimit: number;       // Provider limit: 60 req/hr
  internalHourlyBudget: number; // Internal conservative ceiling: 42 req/hr
  hourlyReserve: number;     // Mandatory reserve: >= 18 req/hr
  burstLimitPerMinute: number; // Provider burst limit: 20 req/min; Internal: 12 req/min
  minSpacingMs: number;      // Mandatory delay between outbound calls (e.g. 3000ms)
}

export interface QuotaSnapshot {
  provider: '5DollarFootballAPI';
  hourlyLimit: number;
  internalBudget: number;
  consumedThisHour: number;
  remainingInBudget: number;
  reserveRemaining: number;
  consumedThisMinute: number;
  circuitBreakerOpen: boolean;
  lastRequestTimestamp: string | null;
  resetAtUtc: string;
}

export interface RequestAuditLogEntry {
  requestId: string;
  endpoint: string;
  priority: RequestPriority;
  status: 'ALLOWED' | 'CACHED' | 'RATE_LIMITED' | 'REJECTED_QUOTA_EXHAUSTED' | 'CIRCUIT_OPEN';
  timestamp: string;
  latencyMs?: number;
  httpStatus?: number;
}

export class FiveDollarQuotaManager {
  private static instance: FiveDollarQuotaManager | null = null;

  private readonly config: QuotaConfig = {
    hourlyLimit: 60,
    internalHourlyBudget: 42,
    hourlyReserve: 18,
    burstLimitPerMinute: 12,
    minSpacingMs: 3000,
  };

  private consumedThisHour = 0;
  private currentHourStart = Date.now();
  private minuteRequestTimestamps: number[] = [];
  private lastRequestTime = 0;
  private circuitBreakerOpen = false;
  private consecutiveErrors = 0;
  private readonly maxConsecutiveErrors = 3;

  private cache = new Map<string, { data: unknown; expiresAt: number }>();
  private auditLog: RequestAuditLogEntry[] = [];

  private constructor(customConfig?: Partial<QuotaConfig>) {
    if (customConfig) {
      this.config = { ...this.config, ...customConfig };
    }
  }

  public static getInstance(config?: Partial<QuotaConfig>): FiveDollarQuotaManager {
    if (!FiveDollarQuotaManager.instance) {
      FiveDollarQuotaManager.instance = new FiveDollarQuotaManager(config);
    }
    return FiveDollarQuotaManager.instance;
  }

  public static resetInstance(): void {
    FiveDollarQuotaManager.instance = null;
  }

  /**
   * Check and reset hourly window if elapsed
   */
  private checkHourWindow(): void {
    const now = Date.now();
    if (now - this.currentHourStart >= 3600000) {
      this.consumedThisHour = 0;
      this.currentHourStart = now;
      this.circuitBreakerOpen = false;
      this.consecutiveErrors = 0;
    }
  }

  /**
   * Clean up minute timestamps older than 60 seconds
   */
  private cleanMinuteWindow(now: number): void {
    this.minuteRequestTimestamps = this.minuteRequestTimestamps.filter(t => now - t < 60000);
  }

  /**
   * Verify whether a request with a given priority is permissible under quota rules.
   */
  public canExecute(priority: RequestPriority, cacheKey?: string): {
    allowed: boolean;
    reason?: string;
    cachedData?: unknown;
  } {
    this.checkHourWindow();
    const now = Date.now();
    this.cleanMinuteWindow(now);

    // 1. Check cache first
    if (cacheKey && this.cache.has(cacheKey)) {
      const entry = this.cache.get(cacheKey)!;
      if (now < entry.expiresAt) {
        return { allowed: true, cachedData: entry.data, reason: 'CACHE_HIT' };
      }
      this.cache.delete(cacheKey);
    }

    // 2. Check circuit breaker
    if (this.circuitBreakerOpen) {
      return { allowed: false, reason: 'CIRCUIT_BREAKER_OPEN' };
    }

    // 3. Priority Gating based on remaining internal budget
    // Priority 1 (Fixtures): Allowed up to internalHourlyBudget (42)
    // Priority 2 (AH/OU Odds): Allowed up to internalHourlyBudget (42)
    // Priority 3 (1X2 Odds): Allowed up to 35 req/hr (preserves reserve for P1/P2)
    // Priority 4 (BTTS): Allowed up to 25 req/hr (research-only restriction)
    // Priority 5 (Enrichment): Allowed up to 15 req/hr
    const priorityThresholds: Record<RequestPriority, number> = {
      1: this.config.internalHourlyBudget,
      2: this.config.internalHourlyBudget,
      3: Math.min(35, this.config.internalHourlyBudget),
      4: Math.min(25, this.config.internalHourlyBudget),
      5: Math.min(15, this.config.internalHourlyBudget),
    };

    if (this.consumedThisHour >= priorityThresholds[priority]) {
      return {
        allowed: false,
        reason: `PRIORITY_${priority}_BUDGET_REACHED (${this.consumedThisHour}/${priorityThresholds[priority]})`,
      };
    }

    // 4. Minute burst limit check
    if (this.minuteRequestTimestamps.length >= this.config.burstLimitPerMinute) {
      return {
        allowed: false,
        reason: `BURST_LIMIT_EXCEEDED (${this.minuteRequestTimestamps.length}/${this.config.burstLimitPerMinute} per min)`,
      };
    }

    // 5. Minimum spacing check
    if (now - this.lastRequestTime < this.config.minSpacingMs) {
      return {
        allowed: false,
        reason: `PACING_ENFORCED (Must wait ${this.config.minSpacingMs - (now - this.lastRequestTime)}ms)`,
      };
    }

    return { allowed: true };
  }

  /**
   * Record outbound request consumption.
   */
  public recordRequest(endpoint: string, priority: RequestPriority, cacheKey?: string, responseData?: unknown, ttlMs?: number): void {
    const now = Date.now();
    this.checkHourWindow();
    this.cleanMinuteWindow(now);

    this.consumedThisHour++;
    this.minuteRequestTimestamps.push(now);
    this.lastRequestTime = now;

    if (cacheKey && responseData !== undefined && ttlMs) {
      this.cache.set(cacheKey, {
        data: responseData,
        expiresAt: now + ttlMs,
      });
    }

    this.auditLog.push({
      requestId: `req_${now}_${Math.random().toString(36).substring(2, 7)}`,
      endpoint,
      priority,
      status: 'ALLOWED',
      timestamp: new Date(now).toISOString(),
    });
  }

  /**
   * Update state from actual response headers (X-RateLimit-*).
   */
  public handleResponseHeaders(headers: Record<string, string | number | undefined>): void {
    const remaining = headers['x-ratelimit-remaining'] || headers['X-RateLimit-Remaining'];
    if (remaining !== undefined) {
      const parsedRemaining = Number(remaining);
      if (!isNaN(parsedRemaining) && parsedRemaining <= 5) {
        // High quota pressure: open circuit breaker to preserve critical reserve
        this.circuitBreakerOpen = true;
      }
    }
  }

  /**
   * Handle provider errors to manage circuit breaker and backoff.
   */
  public recordError(httpStatus: number): void {
    if (httpStatus === 429) {
      this.circuitBreakerOpen = true;
      this.consecutiveErrors++;
    } else if (httpStatus >= 500) {
      this.consecutiveErrors++;
      if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
        this.circuitBreakerOpen = true;
      }
    }
  }

  public recordSuccess(): void {
    this.consecutiveErrors = 0;
  }

  public getSnapshot(): QuotaSnapshot {
    this.checkHourWindow();
    const now = Date.now();
    this.cleanMinuteWindow(now);

    return {
      provider: '5DollarFootballAPI',
      hourlyLimit: this.config.hourlyLimit,
      internalBudget: this.config.internalHourlyBudget,
      consumedThisHour: this.consumedThisHour,
      remainingInBudget: Math.max(0, this.config.internalHourlyBudget - this.consumedThisHour),
      reserveRemaining: Math.max(0, this.config.hourlyLimit - this.consumedThisHour),
      consumedThisMinute: this.minuteRequestTimestamps.length,
      circuitBreakerOpen: this.circuitBreakerOpen,
      lastRequestTimestamp: this.lastRequestTime > 0 ? new Date(this.lastRequestTime).toISOString() : null,
      resetAtUtc: new Date(this.currentHourStart + 3600000).toISOString(),
    };
  }

  public getAuditLog(): RequestAuditLogEntry[] {
    return [...this.auditLog];
  }

  public clearCache(): void {
    this.cache.clear();
  }
}
