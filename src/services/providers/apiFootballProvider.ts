// SALMO.DEV — API-Football Provider Implementation
// Clean, rate-limit aware provider adapter. Zero fixture fabrication.

import { IFixtureProvider, LiveFixtureDTO, ProviderResult } from './types';
import { env } from '../../config/env';
import { Logger } from '../../lib/logger';

export class ApiFootballProvider implements IFixtureProvider {
  public readonly providerName = 'API-Football';

  public isConfigured(): boolean {
    return env.providers.apiFootball.configured;
  }

  public async getUpcomingFixtures(leagueId = '39'): Promise<ProviderResult<LiveFixtureDTO[]>> {
    const start = Date.now();
    const timestamp = new Date().toISOString();

    if (!this.isConfigured()) {
      return {
        status: 'UNCONFIGURED',
        provider: this.providerName,
        data: null,
        error: 'API_FOOTBALL_KEY is not configured in environment.',
        latencyMs: 0,
        cached: false,
        timestamp,
      };
    }

    try {
      const apiKey = env.providers.apiFootball.apiKey!;
      const baseUrl = env.providers.apiFootball.baseUrl;
      const url = `${baseUrl}/fixtures?league=${leagueId}&next=10`;

      const res = await fetch(url, {
        headers: {
          'x-apisports-key': apiKey,
          'Accept': 'application/json',
        },
        next: { revalidate: 300 }, // 5-minute cache
      });

      const latencyMs = Date.now() - start;

      if (res.status === 429) {
        Logger.warn('[ApiFootballProvider] Rate limit encountered (429)', { latencyMs });
        return {
          status: 'RATE_LIMITED',
          provider: this.providerName,
          data: null,
          error: 'Rate limit exceeded on API-Football tier.',
          latencyMs,
          cached: false,
          timestamp,
        };
      }

      if (!res.ok) {
        Logger.error('[ApiFootballProvider] HTTP Error:', { status: res.status, latencyMs });
        return {
          status: 'DATA_UNAVAILABLE',
          provider: this.providerName,
          data: null,
          error: `API-Football returned HTTP ${res.status}`,
          latencyMs,
          cached: false,
          timestamp,
        };
      }

      const json = await res.json();
      const rawFixtures = json.response || [];

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
        cached: false,
        timestamp,
      };
    } catch (err) {
      const latencyMs = Date.now() - start;
      Logger.error('[ApiFootballProvider] Network failure:', { error: String(err), latencyMs });
      return {
        status: 'DATA_UNAVAILABLE',
        provider: this.providerName,
        data: null,
        error: `Network failure connecting to API-Football: ${String(err)}`,
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
        error: 'API_FOOTBALL_KEY is not configured.',
        latencyMs: 0,
        cached: false,
        timestamp,
      };
    }

    // Unimplemented live lookup - safe DATA_UNAVAILABLE return
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

