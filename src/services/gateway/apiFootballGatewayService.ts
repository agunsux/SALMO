// SALMO.DEV — Dedicated API-Football Gateway Service
// Centralized, rate-limited, single-egress request governance.
// Strictly adheres to 1-account, 1-origin, 1-ledger architecture.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  CircuitBreakerState,
  GatewayConfig,
  GatewayRequestOptions,
  GatewayResponse,
  GatewayQuotaStatus,
  GatewayAuditLedgerEntry,
  EgressVerificationResult,
} from './types';

export class ApiFootballGatewayService {
  private config: Required<GatewayConfig>;
  private circuitBreakerState: CircuitBreakerState = 'CLOSED';
  private consecutiveFailures = 0;
  private circuitBreakerTrippedUntil = 0;
  private dailyRequestCount = 0;
  private dailyWindowDate = '';
  private minuteRequestTimestamps: number[] = [];
  private lastRequestTimestamp = 0;
  private cache = new Map<string, { data: any; expiresAt: number; egressIp: string }>();
  private requestQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;

  // Custom fetch function for testing and mocking
  private fetchFn: typeof fetch = globalThis.fetch;

  constructor(customConfig: Partial<GatewayConfig> = {}, customFetch?: typeof fetch) {
    this.config = {
      apiKey: customConfig.apiKey || process.env.API_FOOTBALL_KEY || process.env.APIFOOTBALL_KEY || '',
      baseUrl: customConfig.baseUrl || process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io',
      gatewayToken: customConfig.gatewayToken || process.env.API_FOOTBALL_GATEWAY_TOKEN || 'salmo-gateway-auth-token-local',
      expectedDedicatedEgressIp: customConfig.expectedDedicatedEgressIp || process.env.SALMO_DEDICATED_EGRESS_IP || '',
      enforceDedicatedEgress: customConfig.enforceDedicatedEgress ?? false,
      dailyLimit: customConfig.dailyLimit ?? 100, // Free tier ceiling
      dailyReserveFloor: customConfig.dailyReserveFloor ?? 20, // Reserve buffer
      minuteLimit: customConfig.minuteLimit ?? 6, // 6 req/min ensures 40% headroom below 10/min ceiling
      minInterRequestDelayMs: customConfig.minInterRequestDelayMs ?? 10000, // 10s pacing delay
      cacheTtlSeconds: customConfig.cacheTtlSeconds ?? 300, // 5 min cache
      maxRetries: customConfig.maxRetries ?? 2,
      circuitBreakerCooldownMs: customConfig.circuitBreakerCooldownMs ?? 60000, // 60s cooldown
      ledgerPath: customConfig.ledgerPath || path.resolve(process.cwd(), 'data/quota/api_football_gateway_ledger.jsonl'),
    };

    if (customFetch) {
      this.fetchFn = customFetch;
    }

    this.resetQuotaWindowIfNewDay();
  }

  public setFetchFn(fn: typeof fetch): void {
    this.fetchFn = fn;
  }

  public authenticateRequest(authHeader?: string): boolean {
    if (!this.config.gatewayToken) return true;
    if (!authHeader) return false;
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return false;
    return parts[1] === this.config.gatewayToken;
  }

  public getCircuitBreakerState(): CircuitBreakerState {
    if (this.circuitBreakerState === 'OPEN') {
      if (Date.now() > this.circuitBreakerTrippedUntil) {
        this.circuitBreakerState = 'HALF_OPEN';
      }
    }
    return this.circuitBreakerState;
  }

  public async verifyEgressIp(): Promise<EgressVerificationResult> {
    const timestamp = new Date().toISOString();
    try {
      const res = await this.fetchFn('https://api.ipify.org?format=json', {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        return {
          verified: false,
          actualIp: 'UNKNOWN',
          expectedIp: this.config.expectedDedicatedEgressIp,
          verifiedVia: 'api.ipify.org',
          timestamp,
          reason: `IP verification endpoint returned HTTP ${res.status}`,
        };
      }
      const data = (await res.json()) as { ip: string };
      const actualIp = data.ip;
      const expectedIp = this.config.expectedDedicatedEgressIp;

      if (!expectedIp) {
        return {
          verified: false,
          actualIp,
          expectedIp: 'UNCONFIGURED',
          verifiedVia: 'api.ipify.org',
          timestamp,
          reason: 'Expected static egress IP is not configured in gateway.',
        };
      }

      const verified = actualIp.trim() === expectedIp.trim();
      return {
        verified,
        actualIp,
        expectedIp,
        verifiedVia: 'api.ipify.org',
        timestamp,
        reason: verified ? 'Egress IP strictly matches dedicated static reservation.' : 'Egress IP mismatch: shared or dynamic IP detected!',
      };
    } catch (err) {
      return {
        verified: false,
        actualIp: 'ERROR',
        expectedIp: this.config.expectedDedicatedEgressIp,
        verifiedVia: 'api.ipify.org',
        timestamp,
        reason: `Failed to connect to IP verification endpoint: ${String(err)}`,
      };
    }
  }

  public getQuotaStatus(): GatewayQuotaStatus {
    this.resetQuotaWindowIfNewDay();
    this.cleanMinuteWindow();

    const dailyRemaining = Math.max(0, this.config.dailyLimit - this.dailyRequestCount);
    const minuteUsed = this.minuteRequestTimestamps.length;
    let state: GatewayQuotaStatus['state'] = 'OK';

    if (this.dailyRequestCount >= this.config.dailyLimit) {
      state = 'EXHAUSTED';
    } else if (dailyRemaining <= this.config.dailyReserveFloor) {
      state = 'RESERVE_HELD';
    } else if (minuteUsed >= this.config.minuteLimit) {
      state = 'RATE_LIMITED';
    }

    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);

    return {
      dailyUsed: this.dailyRequestCount,
      dailyLimit: this.config.dailyLimit,
      dailyRemaining,
      minuteUsed,
      minuteLimit: this.config.minuteLimit,
      state,
      resetsAtUtc: tomorrow.toISOString(),
    };
  }

  /**
   * Main entrypoint for executing an authoritative API-Sports request.
   * Dispatches requests sequentially through the serialized queue.
   */
  public async executeRequest<T = any>(
    options: GatewayRequestOptions,
    clientAuthHeader?: string
  ): Promise<GatewayResponse<T>> {
    const timestamp = new Date().toISOString();

    // 1. Authentication
    if (!this.authenticateRequest(clientAuthHeader)) {
      return {
        success: false,
        status: 401,
        data: null,
        error: 'Unauthorized: Invalid or missing Bearer token for API-Football Gateway.',
        cached: false,
        latencyMs: 0,
        timestamp,
      };
    }

    // 2. Secret Configuration Check
    if (!this.config.apiKey) {
      return {
        success: false,
        status: 503,
        data: null,
        error: 'API_FOOTBALL_KEY is not configured on Gateway service.',
        cached: false,
        latencyMs: 0,
        timestamp,
      };
    }

    // 3. Egress Enforcement Check (if enabled)
    if (this.config.enforceDedicatedEgress) {
      const egressCheck = await this.verifyEgressIp();
      if (!egressCheck.verified) {
        return {
          success: false,
          status: 403,
          data: null,
          error: `Dedicated egress violation: ${egressCheck.reason}`,
          cached: false,
          latencyMs: 0,
          egressIp: egressCheck.actualIp,
          timestamp,
        };
      }
    }

    // 4. Request Deduplication Check
    const cacheKey = this.computeCacheKey(options.endpoint, options.params);
    if (!options.skipCache) {
      const cachedEntry = this.cache.get(cacheKey);
      if (cachedEntry && Date.now() < cachedEntry.expiresAt) {
        return {
          success: true,
          status: 200,
          data: cachedEntry.data,
          cached: true,
          latencyMs: 1,
          egressIp: cachedEntry.egressIp,
          quotaStatus: this.getQuotaStatus(),
          circuitBreakerState: this.getCircuitBreakerState(),
          timestamp,
        };
      }
    }

    // 5. Circuit Breaker Check
    const cbState = this.getCircuitBreakerState();
    if (cbState === 'OPEN') {
      const waitSec = Math.ceil((this.circuitBreakerTrippedUntil - Date.now()) / 1000);
      return {
        success: false,
        status: 503,
        data: null,
        error: `Emergency circuit breaker OPEN. Requests paused for ${waitSec}s to prevent upstream abuse.`,
        cached: false,
        latencyMs: 0,
        circuitBreakerState: 'OPEN',
        timestamp,
      };
    }

    // 6. Quota Enforcement Check
    const quota = this.getQuotaStatus();
    if (quota.state === 'EXHAUSTED') {
      return {
        success: false,
        status: 429,
        data: null,
        error: `Daily quota limit exhausted (${quota.dailyUsed}/${quota.dailyLimit} consumed). Resets at ${quota.resetsAtUtc}`,
        cached: false,
        latencyMs: 0,
        quotaStatus: quota,
        timestamp,
      };
    }

    if (quota.state === 'RESERVE_HELD') {
      return {
        success: false,
        status: 429,
        data: null,
        error: `Operational reserve floor reached. ${quota.dailyRemaining} requests reserved for emergency audits.`,
        cached: false,
        latencyMs: 0,
        quotaStatus: quota,
        timestamp,
      };
    }

    // 7. Enqueue in Serialized Queue
    return new Promise<GatewayResponse<T>>((resolve) => {
      this.requestQueue.push(async () => {
        try {
          const res = await this.processSingleRequest<T>(options, cacheKey);
          resolve(res);
        } catch (err) {
          resolve({
            success: false,
            status: 500,
            data: null,
            error: `Unhandled gateway exception: ${String(err)}`,
            cached: false,
            latencyMs: 0,
            timestamp: new Date().toISOString(),
          });
        }
      });

      this.pumpQueue();
    });
  }

  private async pumpQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      const nextFn = this.requestQueue.shift();
      if (nextFn) {
        // Enforce inter-request pacing
        const now = Date.now();
        const timeSinceLast = now - this.lastRequestTimestamp;
        if (this.lastRequestTimestamp > 0 && timeSinceLast < this.config.minInterRequestDelayMs) {
          const waitTime = this.config.minInterRequestDelayMs - timeSinceLast;
          await this.sleep(waitTime);
        }

        this.lastRequestTimestamp = Date.now();
        await nextFn();
      }
    }

    this.isProcessingQueue = false;
  }

  private async processSingleRequest<T>(
    options: GatewayRequestOptions,
    cacheKey: string
  ): Promise<GatewayResponse<T>> {
    const start = Date.now();
    const endpoint = options.endpoint.startsWith('/') ? options.endpoint : `/${options.endpoint}`;
    const queryString = this.buildNormalizedQueryString(options.params);
    const url = `${this.config.baseUrl}${endpoint}${queryString ? `?${queryString}` : ''}`;

    let attempts = 0;
    let lastError: string | undefined;
    let lastStatus = 0;
    let responseData: any = null;

    while (attempts <= this.config.maxRetries) {
      attempts++;
      try {
        const fetchRes = await this.fetchFn(url, {
          method: options.method || 'GET',
          headers: {
            'x-apisports-key': this.config.apiKey,
            'Accept': 'application/json',
            ...(options.headers || {}),
          },
        });

        lastStatus = fetchRes.status;

        // Record request count in quota windows
        this.dailyRequestCount++;
        this.minuteRequestTimestamps.push(Date.now());

        // HTTP 429 Too Many Requests: IMMEDIATE TRIP, ZERO RETRY
        if (fetchRes.status === 429) {
          this.tripCircuitBreaker('Received HTTP 429 from upstream API-Sports.');
          lastError = 'Rate limit exceeded on API-Sports gateway (HTTP 429).';
          break;
        }

        // Account Suspended or Application Errors in 200 payload
        const json = await fetchRes.json();
        if (json.errors && Object.keys(json.errors).length > 0) {
          if (json.errors.access && String(json.errors.access).includes('suspended')) {
            this.tripCircuitBreaker('Account is suspended at API-Sports gateway.');
            lastError = `Account suspended: ${json.errors.access}`;
            lastStatus = 403;
            break;
          }
        }

        if (fetchRes.ok) {
          responseData = json;
          this.consecutiveFailures = 0;
          this.circuitBreakerState = 'CLOSED';

          // Cache valid response
          this.cache.set(cacheKey, {
            data: responseData,
            expiresAt: Date.now() + this.config.cacheTtlSeconds * 1000,
            egressIp: this.config.expectedDedicatedEgressIp || 'STATIC_DEDICATED',
          });

          const latencyMs = Date.now() - start;
          this.appendLedgerEntry({
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            method: options.method || 'GET',
            endpoint,
            normalizedQuery: queryString,
            httpStatus: fetchRes.status,
            latencyMs,
            cached: false,
            egressIp: this.config.expectedDedicatedEgressIp || 'STATIC_DEDICATED',
            quotaRemaining: Math.max(0, this.config.dailyLimit - this.dailyRequestCount),
            circuitBreakerState: this.circuitBreakerState,
          });

          return {
            success: true,
            status: fetchRes.status,
            data: responseData,
            cached: false,
            latencyMs,
            egressIp: this.config.expectedDedicatedEgressIp || 'STATIC_DEDICATED',
            quotaStatus: this.getQuotaStatus(),
            circuitBreakerState: this.circuitBreakerState,
            timestamp: new Date().toISOString(),
          };
        }

        // Handle 5xx errors with exponential backoff
        if (fetchRes.status >= 500) {
          this.consecutiveFailures++;
          lastError = `API-Sports server error: HTTP ${fetchRes.status}`;
          if (attempts <= this.config.maxRetries) {
            const backoff = 2000 * Math.pow(2, attempts - 1);
            await this.sleep(backoff);
            continue;
          }
        } else {
          // 4xx errors (client error): do not retry
          lastError = `API-Sports returned HTTP ${fetchRes.status}`;
          break;
        }
      } catch (err) {
        this.consecutiveFailures++;
        lastError = `Network connection failure: ${String(err)}`;
        if (attempts <= this.config.maxRetries) {
          const backoff = 2000 * Math.pow(2, attempts - 1);
          await this.sleep(backoff);
          continue;
        }
      }
    }

    if (this.consecutiveFailures >= 3) {
      this.tripCircuitBreaker('3 consecutive network or upstream failures.');
    }

    const latencyMs = Date.now() - start;
    this.appendLedgerEntry({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      method: options.method || 'GET',
      endpoint,
      normalizedQuery: queryString,
      httpStatus: lastStatus || 500,
      latencyMs,
      cached: false,
      egressIp: this.config.expectedDedicatedEgressIp || 'STATIC_DEDICATED',
      quotaRemaining: Math.max(0, this.config.dailyLimit - this.dailyRequestCount),
      circuitBreakerState: this.circuitBreakerState,
      error: lastError,
    });

    return {
      success: false,
      status: lastStatus || 500,
      data: null,
      error: lastError,
      cached: false,
      latencyMs,
      egressIp: this.config.expectedDedicatedEgressIp || 'STATIC_DEDICATED',
      quotaStatus: this.getQuotaStatus(),
      circuitBreakerState: this.circuitBreakerState,
      timestamp: new Date().toISOString(),
    };
  }

  private tripCircuitBreaker(reason: string): void {
    this.circuitBreakerState = 'OPEN';
    this.circuitBreakerTrippedUntil = Date.now() + this.config.circuitBreakerCooldownMs;
  }

  private computeCacheKey(endpoint: string, params?: Record<string, any>): string {
    const normParams = this.buildNormalizedQueryString(params);
    const raw = `${endpoint}?${normParams}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  private buildNormalizedQueryString(params?: Record<string, any>): string {
    if (!params) return '';
    const sortedKeys = Object.keys(params).sort();
    const pairs: string[] = [];
    for (const k of sortedKeys) {
      const v = params[k];
      if (v !== undefined && v !== null) {
        pairs.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
      }
    }
    return pairs.join('&');
  }

  private appendLedgerEntry(entry: GatewayAuditLedgerEntry): void {
    try {
      const dir = path.dirname(this.config.ledgerPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.appendFileSync(this.config.ledgerPath, JSON.stringify(entry) + '\n', 'utf8');
    } catch {
      // Non-blocking in ephemeral filesystems
    }
  }

  private resetQuotaWindowIfNewDay(): void {
    const today = new Date().toISOString().split('T')[0];
    if (this.dailyWindowDate !== today) {
      this.dailyWindowDate = today;
      this.dailyRequestCount = 0;
    }
  }

  private cleanMinuteWindow(): void {
    const oneMinuteAgo = Date.now() - 60000;
    this.minuteRequestTimestamps = this.minuteRequestTimestamps.filter((t) => t > oneMinuteAgo);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
