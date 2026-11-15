// SALMO.DEV — Dedicated API-Football Gateway Types
// Strict typing for request governance, rate limiting, and egress verification.

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface GatewayRequestOptions {
  endpoint: string;
  params?: Record<string, string | number | boolean>;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  skipCache?: boolean;
}

export interface GatewayQuotaStatus {
  dailyUsed: number;
  dailyLimit: number;
  dailyRemaining: number;
  minuteUsed: number;
  minuteLimit: number;
  state: 'OK' | 'EXHAUSTED' | 'RATE_LIMITED' | 'RESERVE_HELD';
  resetsAtUtc: string;
}

export interface GatewayResponse<T = any> {
  success: boolean;
  status: number;
  data: T | null;
  error?: string;
  cached: boolean;
  latencyMs: number;
  egressIp?: string;
  quotaStatus?: GatewayQuotaStatus;
  circuitBreakerState?: CircuitBreakerState;
  timestamp: string;
}

export interface GatewayAuditLedgerEntry {
  id: string;
  timestamp: string;
  method: string;
  endpoint: string;
  normalizedQuery: string;
  httpStatus: number;
  latencyMs: number;
  cached: boolean;
  egressIp: string;
  quotaRemaining: number;
  circuitBreakerState: CircuitBreakerState;
  error?: string;
}

export interface EgressVerificationResult {
  verified: boolean;
  actualIp: string;
  expectedIp: string;
  verifiedVia: string;
  timestamp: string;
  reason?: string;
}

export interface GatewayConfig {
  apiKey?: string;
  baseUrl?: string;
  gatewayToken?: string;
  expectedDedicatedEgressIp?: string;
  enforceDedicatedEgress?: boolean;
  dailyLimit?: number;
  dailyReserveFloor?: number;
  minuteLimit?: number;
  minInterRequestDelayMs?: number;
  cacheTtlSeconds?: number;
  maxRetries?: number;
  circuitBreakerCooldownMs?: number;
  ledgerPath?: string;
}
