// SALMO.DEV — OddsPapi Provider Implementation
// Clean, zero-fabrication market odds adapter.
// Returns explicit DATA_UNAVAILABLE when unconfigured or failing.

import { IOddsProvider, LiveOddsDTO, ProviderResult } from './types';
import { env } from '../../config/env';
import { Logger } from '../../lib/logger';

export class OddsPapiProvider implements IOddsProvider {
  public readonly providerName = 'OddsPapi';

  public isConfigured(): boolean {
    return env.providers.oddsPapi.configured;
  }

  public async getMarketOdds(fixtureId: string): Promise<ProviderResult<LiveOddsDTO[]>> {
    const start = Date.now();
    const timestamp = new Date().toISOString();

    if (!this.isConfigured()) {
      return {
        status: 'UNCONFIGURED',
        provider: this.providerName,
        data: null,
        error: 'ODDS_PAPI_KEY is not configured in environment.',
        latencyMs: 0,
        cached: false,
        timestamp,
      };
    }

    try {
      const apiKey = env.providers.oddsPapi.apiKey!;
      const baseUrl = env.providers.oddsPapi.baseUrl;
      const url = `${baseUrl}/fixtures/${fixtureId}/odds`;

      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
        },
        next: { revalidate: 60 }, // 1-minute odds cache
      });

      const latencyMs = Date.now() - start;

      if (res.status === 429) {
        Logger.warn('[OddsPapiProvider] Rate limit encountered (429)', { latencyMs });
        return {
          status: 'RATE_LIMITED',
          provider: this.providerName,
          data: null,
          error: 'Rate limit exceeded on OddsPapi subscription tier.',
          latencyMs,
          cached: false,
          timestamp,
        };
      }

      if (!res.ok) {
        Logger.error('[OddsPapiProvider] HTTP Error:', { status: res.status, latencyMs });
        return {
          status: 'DATA_UNAVAILABLE',
          provider: this.providerName,
          data: null,
          error: `OddsPapi returned HTTP ${res.status}`,
          latencyMs,
          cached: false,
          timestamp,
        };
      }

      const json = await res.json();
      const rawOdds = json.odds || [];

      const odds: LiveOddsDTO[] = rawOdds.map((o: any) => ({
        providerFixtureId: fixtureId,
        bookmaker: o.bookmaker,
        marketType: o.marketType,
        line: Number(o.line),
        homeOdds: Number(o.homeOdds),
        awayOdds: Number(o.awayOdds),
        capturedAt: o.updatedAt || timestamp,
      }));

      return {
        status: 'AVAILABLE',
        provider: this.providerName,
        data: odds,
        latencyMs,
        cached: false,
        timestamp,
      };
    } catch (err) {
      const latencyMs = Date.now() - start;
      Logger.error('[OddsPapiProvider] Network failure:', { error: String(err), latencyMs });
      return {
        status: 'DATA_UNAVAILABLE',
        provider: this.providerName,
        data: null,
        error: `Network failure connecting to OddsPapi: ${String(err)}`,
        latencyMs,
        cached: false,
        timestamp,
      };
    }
  }
}

