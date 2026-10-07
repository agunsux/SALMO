// SALMO.DEV — OddsPapi Provider Implementation
// Clean, zero-fabrication market odds and multi-league fixture adapter.
// Supports:
// - Bookmaker Benchmark Pair: Pinnacle (Sharp Reference) + Bet365 (Soft Retail Execution)
// - 15-League Canonical Worldwide Fixture Discovery
// - 5-Tournament Batch Ingestion (MAX_TOURNAMENTS_PER_BATCH_REQUEST = 5)
// - Asian Handicap (Quarter Lines), Over/Under, and BTTS
// - Returns explicit DATA_UNAVAILABLE when unconfigured or failing. Zero synthetic fallback.

import { IFixtureProvider, IOddsProvider, LiveFixtureDTO, LiveOddsDTO, ProviderResult, CONSUMED_BOOKMAKERS, ConsumedBookmaker } from './types';
import { CANONICAL_15_LEAGUES, MAX_TOURNAMENTS_PER_BATCH_REQUEST, getLeagueByOpId, getTournamentBatches } from '../../config/multiLeagueRegistry';
import { env } from '../../config/env';
import { Logger } from '../../lib/logger';
import { OddsPapiQuotaGuard } from '../../lib/quota/oddsPapiQuotaGuard';

export class OddsPapiProvider implements IFixtureProvider, IOddsProvider {
  public readonly providerName = 'OddsPapi';
  public static readonly CONSUMED_BOOKMAKERS = CONSUMED_BOOKMAKERS;
  public static readonly MAX_TOURNAMENTS_PER_BATCH_REQUEST = MAX_TOURNAMENTS_PER_BATCH_REQUEST;

  public isConfigured(): boolean {
    return env.providers.oddsPapi.configured;
  }

  /**
   * Discovers upcoming fixtures across canonical worldwide leagues using 5-tournament batching.
   */
  public async getUpcomingFixtures(
    tournamentIdsOrLeagueId?: number[] | string
  ): Promise<ProviderResult<LiveFixtureDTO[]>> {
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
      const from = new Date().toISOString();
      const to = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

      // Resolve tournament IDs to query
      let targetBatches: number[][];
      if (Array.isArray(tournamentIdsOrLeagueId)) {
        targetBatches = [];
        for (let i = 0; i < tournamentIdsOrLeagueId.length; i += MAX_TOURNAMENTS_PER_BATCH_REQUEST) {
          targetBatches.push(tournamentIdsOrLeagueId.slice(i, i + MAX_TOURNAMENTS_PER_BATCH_REQUEST));
        }
      } else {
        // Query canonical 15 leagues in 3 batches of 5
        targetBatches = getTournamentBatches(CANONICAL_15_LEAGUES);
      }

      const allFixtures: LiveFixtureDTO[] = [];
      const seenFixtureIds = new Set<string>();

      // Pre-flight Persistent Quota & 90% Hard-Stop Guard
      const quotaCheck = await OddsPapiQuotaGuard.checkQuota(1);
      if (!quotaCheck.allowed) {
        Logger.warn(`[OddsPapiProvider] Fixture discovery halted by quota guard: ${quotaCheck.reason}`);
        return {
          status: 'RATE_LIMITED',
          provider: this.providerName,
          data: null,
          error: quotaCheck.reason,
          latencyMs: Date.now() - start,
          cached: false,
          timestamp,
        };
      }

      for (const batch of targetBatches) {
        const tournamentsParam = batch.join(',');
        const url = `${baseUrl}/fixtures?sportId=10&tournaments=${encodeURIComponent(tournamentsParam)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&apiKey=${apiKey}`;

        const res = await fetch(url, {
          headers: { 'Accept': 'application/json' },
          next: { revalidate: 300 }, // 5-minute cache
        });

        if (res.status === 429) {
          Logger.warn('[OddsPapiProvider] Rate limit encountered during fixture discovery (429)');
          return {
            status: 'RATE_LIMITED',
            provider: this.providerName,
            data: allFixtures.length > 0 ? allFixtures : null,
            error: 'Rate limit exceeded on OddsPapi subscription tier.',
            latencyMs: Date.now() - start,
            cached: false,
            timestamp,
          };
        }

        if (!res.ok) {
          Logger.warn(`[OddsPapiProvider] Fixture batch fetch returned HTTP ${res.status}`);
          continue;
        }

        const rawList = await res.json();
        if (Array.isArray(rawList)) {
          for (const f of rawList) {
            const fId = String(f.fixtureId || f.id || '');
            if (!fId || seenFixtureIds.has(fId)) continue;
            seenFixtureIds.add(fId);

            const opTournId = Number(f.tournamentId || f.tournament?.id || 0);
            const leagueEntry = getLeagueByOpId(opTournId);
            const leagueName = leagueEntry?.display_name || f.tournamentName || f.tournamentSlug || 'Football';

            allFixtures.push({
              providerFixtureId: fId,
              league: leagueName,
              season: String(f.season || '2026'),
              kickoffTime: f.startTime || f.commenceTime || f.kickoffTime,
              homeTeam: f.participant1Name || f.homeTeam || f.home_team,
              awayTeam: f.participant2Name || f.awayTeam || f.away_team,
              venue: f.venueName || f.venue,
              status: f.status === 'FINISHED' || f.status === 'FT' ? 'FINISHED' : 'SCHEDULED',
              oddspapiTournamentId: opTournId,
            });
          }
        }
      }

      return {
        status: allFixtures.length > 0 ? 'AVAILABLE' : 'DATA_UNAVAILABLE',
        provider: this.providerName,
        data: allFixtures,
        latencyMs: Date.now() - start,
        cached: false,
        timestamp,
      };
    } catch (err) {
      const latencyMs = Date.now() - start;
      Logger.error('[OddsPapiProvider] Fixture discovery failure:', { error: String(err), latencyMs });
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

  public async getFixtureById(id: string): Promise<ProviderResult<LiveFixtureDTO | null>> {
    const timestamp = new Date().toISOString();
    return {
      status: 'DATA_UNAVAILABLE',
      provider: this.providerName,
      data: null,
      error: `Single fixture lookup for ID ${id} is serviced via batch discovery.`,
      latencyMs: 0,
      cached: false,
      timestamp,
    };
  }

  /**
   * Fetches batch tournament odds for a single bookmaker (conforming to OddsPAPI singular bookmaker contract).
   * Up to MAX_TOURNAMENTS_PER_BATCH_REQUEST (5) tournament IDs per call.
   */
  public async getTournamentOdds(
    tournamentIds: number[],
    bookmaker = 'pinnacle'
  ): Promise<ProviderResult<LiveOddsDTO[]>> {
    return this.getBatchTournamentOdds(tournamentIds, bookmaker);
  }

  /**
   * Fetches batch tournament odds for a single bookmaker (conforming to OddsPAPI singular bookmaker contract).
   */
  public async getBatchTournamentOdds(
    tournamentIds: number[],
    bookmaker = 'pinnacle'
  ): Promise<ProviderResult<LiveOddsDTO[]>> {
    const start = Date.now();
    const timestamp = new Date().toISOString();

    if (!this.isConfigured()) {
      return {
        status: 'UNCONFIGURED',
        provider: this.providerName,
        data: null,
        error: 'ODDS_PAPI_KEY is not configured.',
        latencyMs: 0,
        cached: false,
        timestamp,
      };
    }

    try {
      // Pre-flight Persistent Quota & 90% Hard-Stop Guard
      const quotaCheck = await OddsPapiQuotaGuard.checkQuota(1);
      if (!quotaCheck.allowed) {
        Logger.warn(`[OddsPapiProvider] Batch tournament odds halted by quota guard: ${quotaCheck.reason}`);
        return {
          status: 'RATE_LIMITED',
          provider: this.providerName,
          data: null,
          error: quotaCheck.reason,
          latencyMs: Date.now() - start,
          cached: false,
          timestamp,
        };
      }

      const apiKey = env.providers.oddsPapi.apiKey!;
      const baseUrl = env.providers.oddsPapi.baseUrl;
      const tournBatch = tournamentIds.slice(0, MAX_TOURNAMENTS_PER_BATCH_REQUEST).join(',');
      const url = `${baseUrl}/odds-by-tournaments?tournamentIds=${encodeURIComponent(tournBatch)}&tournaments=${encodeURIComponent(tournBatch)}&bookmaker=${encodeURIComponent(bookmaker)}&oddsFormat=decimal&apiKey=${apiKey}`;

      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 60 },
      });

      if (res.status === 429) {
        return {
          status: 'RATE_LIMITED',
          provider: this.providerName,
          data: null,
          error: `Rate limit on OddsPapi for bookmaker ${bookmaker}.`,
          latencyMs: Date.now() - start,
          cached: false,
          timestamp,
        };
      }

      if (!res.ok) {
        return {
          status: 'DATA_UNAVAILABLE',
          provider: this.providerName,
          data: null,
          error: `OddsPapi /odds-by-tournaments returned HTTP ${res.status}`,
          latencyMs: Date.now() - start,
          cached: false,
          timestamp,
        };
      }

      const json = await res.json();
      const oddsList: LiveOddsDTO[] = this.parseOddsApiResponse(json, bookmaker, timestamp);

      return {
        status: 'AVAILABLE',
        provider: this.providerName,
        data: oddsList,
        latencyMs: Date.now() - start,
        cached: false,
        timestamp,
      };
    } catch (err) {
      return {
        status: 'DATA_UNAVAILABLE',
        provider: this.providerName,
        data: null,
        error: `Batch tournament odds failure: ${String(err)}`,
        latencyMs: Date.now() - start,
        cached: false,
        timestamp,
      };
    }
  }

  /**
   * Retrieves market odds for a single fixture across target bookmaker pair (Pinnacle, Bet365).
   */
  public async getMarketOdds(
    fixtureId: string,
    bookmakers: string[] = ['pinnacle', 'bet365']
  ): Promise<ProviderResult<LiveOddsDTO[]>> {
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

      const odds: LiveOddsDTO[] = [];

      // Query target bookmakers sequentially with rate-limit respect
      for (const b of bookmakers) {
        const bookSlug = b.toLowerCase().trim();
        const url = `${baseUrl}/odds?fixtureId=${encodeURIComponent(fixtureId)}&bookmaker=${encodeURIComponent(bookSlug)}&apiKey=${apiKey}`;

        const res = await fetch(url, {
          headers: { 'Accept': 'application/json' },
          next: { revalidate: 60 },
        });

        if (res.status === 429) {
          Logger.warn(`[OddsPapiProvider] Rate limit encountered on ${bookSlug} (429)`);
          if (odds.length > 0) break; // Return what we have gathered so far
          return {
            status: 'RATE_LIMITED',
            provider: this.providerName,
            data: null,
            error: 'Rate limit exceeded on OddsPapi subscription tier.',
            latencyMs: Date.now() - start,
            cached: false,
            timestamp,
          };
        }

        if (!res.ok) {
          continue;
        }

        const json = await res.json();
        const parsedOdds = this.parseOddsApiResponse(json, bookSlug, timestamp, fixtureId);
        odds.push(...parsedOdds);
      }

      return {
        status: odds.length > 0 ? 'AVAILABLE' : 'DATA_UNAVAILABLE',
        provider: this.providerName,
        data: odds,
        latencyMs: Date.now() - start,
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

  /**
   * Internal helper to parse market odds from OddsPAPI v4 response.
   */
  private parseOddsApiResponse(
    json: any,
    bookmakerSlug: string,
    defaultTimestamp: string,
    explicitFixtureId?: string
  ): LiveOddsDTO[] {
    const odds: LiveOddsDTO[] = [];
    if (!json) return odds;

    const bookmakerName =
      bookmakerSlug === 'pinnacle'
        ? 'Pinnacle'
        : bookmakerSlug === 'bet365'
        ? 'Bet365'
        : bookmakerSlug === '1xbet'
        ? '1xBet'
        : bookmakerSlug.toUpperCase();

    // 1. OddsPapi v4 schema: bookmakerOdds[bookmakerSlug].markets or array of matches
    const fixtureList = Array.isArray(json) ? json : [json];

    for (const item of fixtureList) {
      const fId = explicitFixtureId || String(item.fixtureId || item.id || '');
      const bmData = item.bookmakerOdds?.[bookmakerSlug] || item.bookmakerOdds?.[bookmakerSlug.toLowerCase()] || {};
      const markets = bmData.markets || item.markets || {};

      for (const mId of Object.keys(markets)) {
        const marketObj = markets[mId];
        const mIdStr = marketObj.bookmakerMarketId || '';
        if (marketObj.marketActive === false) continue;

        // A. Spreads (Asian Handicap)
        if (mIdStr.endsWith('/spreads') || mIdStr.includes('spread')) {
          const outcomes = Object.values(marketObj.outcomes || {}) as any[];
          let homeOutcome: any = null;
          let awayOutcome: any = null;
          for (const out of outcomes) {
            const player0 = out.players?.['0'];
            if (!player0 || player0.active === false) continue;
            const outcomeId = player0.bookmakerOutcomeId || '';
            if (outcomeId.endsWith('/home') || outcomeId.includes('home')) homeOutcome = player0;
            if (outcomeId.endsWith('/away') || outcomeId.includes('away')) awayOutcome = player0;
          }
          const isMainLine = mIdStr.startsWith('line/') && mIdStr.includes('/0/');
          if (homeOutcome && awayOutcome) {
            const lineStr = (homeOutcome.bookmakerOutcomeId || '').split('/')[0];
            const line = parseFloat(lineStr);
            if (!isNaN(line)) {
              odds.push({
                providerFixtureId: fId,
                bookmaker: bookmakerName,
                marketType: 'ASIAN_HANDICAP',
                line,
                homeOdds: Number(homeOutcome.price),
                awayOdds: Number(awayOutcome.price),
                capturedAt: homeOutcome.changedAt || defaultTimestamp,
                isMainLine,
              });
            }
          }
        }

        // B. Totals (Over / Under)
        if (mIdStr.endsWith('/totals') || mIdStr.includes('total')) {
          const outcomes = Object.values(marketObj.outcomes || {}) as any[];
          let overOutcome: any = null;
          let underOutcome: any = null;
          for (const out of outcomes) {
            const player0 = out.players?.['0'];
            if (!player0 || player0.active === false) continue;
            const outcomeId = player0.bookmakerOutcomeId || '';
            if (outcomeId.endsWith('/over') || outcomeId.includes('over')) overOutcome = player0;
            if (outcomeId.endsWith('/under') || outcomeId.includes('under')) underOutcome = player0;
          }
          const isMainLine = mIdStr.startsWith('line/') && mIdStr.includes('/0/');
          if (overOutcome && underOutcome) {
            const lineStr = (overOutcome.bookmakerOutcomeId || '').split('/')[0];
            const line = parseFloat(lineStr);
            if (!isNaN(line)) {
              odds.push({
                providerFixtureId: fId,
                bookmaker: bookmakerName,
                marketType: 'OVER_UNDER',
                line,
                homeOdds: Number(overOutcome.price),
                awayOdds: Number(underOutcome.price),
                capturedAt: overOutcome.changedAt || defaultTimestamp,
                isMainLine,
              });
            }
          }
        }

        // C. BTTS (Both Teams To Score)
        if (mIdStr.endsWith('/btts') || mIdStr.includes('btts')) {
          const outcomes = Object.values(marketObj.outcomes || {}) as any[];
          let yesOutcome: any = null;
          let noOutcome: any = null;
          for (const out of outcomes) {
            const player0 = out.players?.['0'];
            if (!player0 || player0.active === false) continue;
            const outcomeId = (player0.bookmakerOutcomeId || '').toLowerCase();
            if (outcomeId.endsWith('/yes') || outcomeId.includes('yes')) yesOutcome = player0;
            if (outcomeId.endsWith('/no') || outcomeId.includes('no')) noOutcome = player0;
          }
          if (yesOutcome && noOutcome) {
            odds.push({
              providerFixtureId: fId,
              bookmaker: bookmakerName,
              marketType: 'BTTS',
              line: 0,
              homeOdds: Number(yesOutcome.price),
              awayOdds: Number(noOutcome.price),
              capturedAt: yesOutcome.changedAt || defaultTimestamp,
              isMainLine: true,
            });
          }
        }
      }

      // 2. Legacy rawOdds array fallback
      if (odds.length === 0 && Array.isArray(item.odds)) {
        for (const o of item.odds) {
          odds.push({
            providerFixtureId: fId,
            bookmaker: o.bookmaker || bookmakerName,
            marketType: o.marketType,
            line: Number(o.line),
            homeOdds: Number(o.homeOdds),
            awayOdds: Number(o.awayOdds),
            capturedAt: o.updatedAt || defaultTimestamp,
          });
        }
      }
    }

    return odds;
  }
}
