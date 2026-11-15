// SALMO.DEV — Dedicated API-Football Gateway Client
// Communicates exclusively with the authoritative dedicated egress gateway.
// Zero direct calls to api-sports.io from Vercel or local clients.

import { GatewayResponse } from './types';
import { Logger } from '../../lib/logger';

export interface GatewayClientConfig {
  gatewayUrl?: string;
  gatewayToken?: string;
  timeoutMs?: number;
}

export class ApiFootballGatewayClient {
  private gatewayUrl: string;
  private gatewayToken: string;
  private timeoutMs: number;
  private fetchFn: typeof fetch = globalThis.fetch;

  constructor(config: GatewayClientConfig = {}, customFetch?: typeof fetch) {
    this.gatewayUrl = (config.gatewayUrl || process.env.API_FOOTBALL_GATEWAY_URL || '').replace(/\/$/, '');
    this.gatewayToken = config.gatewayToken || process.env.API_FOOTBALL_GATEWAY_TOKEN || '';
    this.timeoutMs = config.timeoutMs || 10000;
    if (customFetch) {
      this.fetchFn = customFetch;
    }
  }

  public isConfigured(): boolean {
    return Boolean(this.gatewayUrl && this.gatewayUrl.length > 0);
  }

  public async get<T = any>(
    endpoint: string,
    params?: Record<string, string | number | boolean>
  ): Promise<GatewayResponse<T>> {
    const timestamp = new Date().toISOString();
    const start = Date.now();

    if (!this.isConfigured()) {
      return {
        success: false,
        status: 503,
        data: null,
        error: 'API_FOOTBALL_GATEWAY_URL is not configured. Direct API-Sports calls are prohibited.',
        cached: false,
        latencyMs: 0,
        timestamp,
      };
    }

    try {
      const normEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      const queryParams = new URLSearchParams();
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          if (v !== undefined && v !== null) {
            queryParams.append(k, String(v));
          }
        }
      }
      const qs = queryParams.toString();
      const targetUrl = `${this.gatewayUrl}/api/gateway${normEndpoint}${qs ? `?${qs}` : ''}`;

      const res = await this.fetchFn(targetUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.gatewayToken}`,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      const latencyMs = Date.now() - start;
      const json = await res.json();

      return {
        ...json,
        latencyMs,
        timestamp,
      };
    } catch (err) {
      const latencyMs = Date.now() - start;
      Logger.warn('[ApiFootballGatewayClient] Request failed:', { endpoint, error: String(err), latencyMs });
      return {
        success: false,
        status: 500,
        data: null,
        error: `Gateway connection error: ${String(err)}`,
        cached: false,
        latencyMs,
        timestamp,
      };
    }
  }
}
