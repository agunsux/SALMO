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
      const url = `${baseUrl}/odds?fixtureId=${fixtureId}&bookmaker=pinnacle&apiKey=${apiKey}`;

      const res = await fetch(url, {
        headers: {
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
      const odds: LiveOddsDTO[] = [];

      // 1. OddsPapi v4 schema: bookmakerOdds.pinnacle.markets
      const markets = json.bookmakerOdds?.pinnacle?.markets || {};
      for (const mId of Object.keys(markets)) {
        const marketObj = markets[mId];
        const mIdStr = marketObj.bookmakerMarketId || '';
        if (!marketObj.marketActive) continue;

        // Spreads (Asian Handicap)
        if (mIdStr.endsWith('/spreads')) {
          const outcomes = Object.values(marketObj.outcomes || {}) as any[];
          let homeOutcome: any = null;
          let awayOutcome: any = null;
          for (const out of outcomes) {
            const player0 = out.players?.['0'];
            if (!player0 || !player0.active) continue;
            const outcomeId = player0.bookmakerOutcomeId || '';
            if (outcomeId.endsWith('/home')) homeOutcome = player0;
            if (outcomeId.endsWith('/away')) awayOutcome = player0;
          }
          const isMainLine = mIdStr.startsWith('line/') && mIdStr.includes('/0/');
          if (homeOutcome && awayOutcome) {
            const lineStr = (homeOutcome.bookmakerOutcomeId || '').split('/')[0];
            const line = parseFloat(lineStr);
            if (!isNaN(line)) {
              odds.push({
                providerFixtureId: fixtureId,
                bookmaker: 'Pinnacle',
                marketType: 'ASIAN_HANDICAP',
                line,
                homeOdds: Number(homeOutcome.price),
                awayOdds: Number(awayOutcome.price),
                capturedAt: homeOutcome.changedAt || timestamp,
                isMainLine,
              });
            }
          }
        }

        // Totals (Over / Under)
        if (mIdStr.endsWith('/totals')) {
          const outcomes = Object.values(marketObj.outcomes || {}) as any[];
          let overOutcome: any = null;
          let underOutcome: any = null;
          for (const out of outcomes) {
            const player0 = out.players?.['0'];
            if (!player0 || !player0.active) continue;
            const outcomeId = player0.bookmakerOutcomeId || '';
            if (outcomeId.endsWith('/over')) overOutcome = player0;
            if (outcomeId.endsWith('/under')) underOutcome = player0;
          }
          const isMainLine = mIdStr.startsWith('line/') && mIdStr.includes('/0/');
          if (overOutcome && underOutcome) {
            const lineStr = (overOutcome.bookmakerOutcomeId || '').split('/')[0];
            const line = parseFloat(lineStr);
            if (!isNaN(line)) {
              odds.push({
                providerFixtureId: fixtureId,
                bookmaker: 'Pinnacle',
                marketType: 'OVER_UNDER',
                line,
                homeOdds: Number(overOutcome.price),
                awayOdds: Number(underOutcome.price),
                capturedAt: overOutcome.changedAt || timestamp,
                isMainLine,
              });
            }
          }
        }
      }

      // 2. Fallback to legacy rawOdds array if present
      if (odds.length === 0 && Array.isArray(json.odds)) {
        for (const o of json.odds) {
          odds.push({
            providerFixtureId: fixtureId,
            bookmaker: o.bookmaker,
            marketType: o.marketType,
            line: Number(o.line),
            homeOdds: Number(o.homeOdds),
            awayOdds: Number(o.awayOdds),
            capturedAt: o.updatedAt || timestamp,
          });
        }
      }

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

