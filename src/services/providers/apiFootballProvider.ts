// SALMO.DEV — API-Football Provider Implementation
// Clean, rate-limit aware provider adapter routed through dedicated egress gateway.
// Zero direct calls to api-sports.io from Vercel Serverless.
// Strictly disabled until official account reactivation and dedicated egress gateway deployment.

import { IFixtureProvider, LiveFixtureDTO, ProviderResult } from './types';
import { Logger } from '../../lib/logger';
import { ApiFootballGatewayClient } from '../gateway/apiFootballGatewayClient';

export interface ApiFootballProviderOptions {
  gatewayClient?: ApiFootballGatewayClient;
  operationalTransitionAuthorized?: boolean;
}

export class ApiFootballProvider implements IFixtureProvider {
  public readonly providerName = 'API-Football';
  private gatewayClient: ApiFootballGatewayClient;
  private operationalTransitionAuthorized: boolean;

  constructor(options: ApiFootballProviderOptions = {}) {
    // Fail-closed invariant: in production, operational transition is FALSE by default.
    // An environment variable alone cannot enable live requests.
    // Live activation requires explicit programmatic authorization and a verified dedicated gateway.
    this.operationalTransitionAuthorized = options.operationalTransitionAuthorized ?? false;
    this.gatewayClient = options.gatewayClient || new ApiFootballGatewayClient({
      gatewayUrl: process.env.API_FOOTBALL_GATEWAY_URL,
      gatewayToken: process.env.API_FOOTBALL_GATEWAY_TOKEN,
    });
  }

  public isConfigured(): boolean {
    // Strictly disabled in production until explicit reactivation is verified AND gateway is configured
    if (!this.operationalTransitionAuthorized) {
      return false;
    }
    return this.gatewayClient.isConfigured();
  }

  public async getUpcomingFixtures(leagueId = '39'): Promise<ProviderResult<LiveFixtureDTO[]>> {
    const start = Date.now();
    const timestamp = new Date().toISOString();

    if (!this.operationalTransitionAuthorized) {
      return {
        status: 'UNCONFIGURED',
        provider: this.providerName,
        data: null,
        error: 'API-Football provider is disabled pending official account reactivation and dedicated egress verification.',
        latencyMs: 0,
        cached: false,
        timestamp,
      };
    }

    if (!this.gatewayClient.isConfigured()) {
      return {
        status: 'UNCONFIGURED',
        provider: this.providerName,
        data: null,
        error: 'API_FOOTBALL_GATEWAY_URL is not configured. Direct API-Sports calls are prohibited.',
        latencyMs: 0,
        cached: false,
        timestamp,
      };
    }

    try {
      const res = await this.gatewayClient.get('/fixtures', {
        league: leagueId,
        next: 10,
      });

      const latencyMs = Date.now() - start;

      if (res.status === 429) {
        Logger.warn('[ApiFootballProvider] Rate limit encountered on Gateway (429)', { latencyMs });
        return {
          status: 'RATE_LIMITED',
          provider: this.providerName,
          data: null,
          error: res.error || 'Rate limit exceeded on API-Football tier.',
          latencyMs,
          cached: false,
          timestamp,
        };
      }

      if (!res.success || !res.data) {
        Logger.error('[ApiFootballProvider] Gateway Error:', { status: res.status, error: res.error, latencyMs });
        return {
          status: 'DATA_UNAVAILABLE',
          provider: this.providerName,
          data: null,
          error: res.error || `API-Football gateway returned HTTP ${res.status}`,
          latencyMs,
          cached: false,
          timestamp,
        };
      }

      const rawFixtures = res.data.response || [];

      // Preserve canonical fixture normalization
      const fixtures: LiveFixtureDTO[] = rawFixtures.map((f: any) => ({
        providerFixtureId: String(f.fixture.id),
        league: f.league.name,
        season: String(f.league.season),
        kickoffTime: f.fixture.date,
        homeTeam: f.teams.home.name,
        awayTeam: f.teams.away.name,
        venue: f.fixture.venue?.name,
        status: f.fixture.status?.short === 'FT' ? 'FINISHED' : 'SCHEDULED',
      }));

      return {
        status: 'AVAILABLE',
        provider: this.providerName,
        data: fixtures,
        latencyMs,
        cached: res.cached,
        timestamp,
      };
    } catch (err) {
      const latencyMs = Date.now() - start;
      Logger.error('[ApiFootballProvider] Network failure contacting gateway:', { error: String(err), latencyMs });
      return {
        status: 'DATA_UNAVAILABLE',
        provider: this.providerName,
        data: null,
        error: `Network failure connecting to API-Football gateway: ${String(err)}`,
        latencyMs,
        cached: false,
        timestamp,
      };
    }
  }

  public async getFixtureById(id: string): Promise<ProviderResult<LiveFixtureDTO | null>> {
    const timestamp = new Date().toISOString();
    if (!this.isConfigured()) {
      return {
        status: 'UNCONFIGURED',
        provider: this.providerName,
        data: null,
        error: 'API-Football provider is disabled pending official account reactivation and dedicated egress verification.',
        latencyMs: 0,
        cached: false,
        timestamp,
      };
    }

    return {
      status: 'DATA_UNAVAILABLE',
      provider: this.providerName,
      data: null,
      error: `Live fixture lookup for ID ${id} requires active ingestion pipeline.`,
      latencyMs: 0,
      cached: false,
      timestamp,
    };
  }
}
