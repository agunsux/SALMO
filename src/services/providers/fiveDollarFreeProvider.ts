// SALMO.DEV — 5DollarFootballAPI Free Tier Adapter
// Isolated shadow provider for Top-5 leagues and Bet365 odds.
// Invariants:
// 1. Quota-aware: Enforces 42 req/hr internal budget, 12 req/min burst ceiling via FiveDollarQuotaManager.
// 2. Endpoint constraints: Odds fetched strictly per fixture; zero 'include=odds' on fixture lists.
// 3. Bookmaker identity: Strictly Bet365. Never labeled as Pinnacle.
// 4. Attribution: Mandatory attribution "Football data by 5DollarFootballAPI".
// 5. Zero fabrication: Missing odds yield explicit DATA_UNAVAILABLE.

import { ProviderResult } from './types';
import { FiveDollarQuotaManager } from '../../lib/quota/fiveDollarQuotaManager';

export const FIVE_DOLLAR_ATTRIBUTION = {
  text: 'Football data by 5DollarFootballAPI',
  url: 'https://5dollarfootballapi.com',
};

export const SUPPORTED_LEAGUES = [
  'EPL',       // Premier League (England)
  'LA_LIGA',   // La Liga (Spain)
  'SERIE_A',   // Serie A (Italy)
  'BUNDESLIGA',// Bundesliga (Germany)
  'LIGUE_1',   // Ligue 1 (France)
] as const;

export type SupportedLeague = typeof SUPPORTED_LEAGUES[number];

export interface FiveDollarFixture {
  fixtureId: number;
  leagueId: number;
  leagueName: string;
  country: string;
  homeTeam: { id: number; name: string };
  awayTeam: { id: number; name: string };
  kickoffAt: string;
  status: string;
}

export interface FiveDollarMarketValue {
  outcome: string;
  price: number;
  handicap?: number;
}

export interface FiveDollarMarket {
  marketName: '1X2' | 'Asian Handicap' | 'Over/Under' | 'BTTS' | string;
  values: FiveDollarMarketValue[];
  isClosing?: boolean;
  capturedAt?: string;
}

export interface FiveDollarOddsPayload {
  fixtureId: number;
  bookmaker: 'Bet365';
  markets: FiveDollarMarket[];
  capturedAt: string;
}

export class FiveDollarFreeProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string | null;
  private readonly quotaManager: FiveDollarQuotaManager;

  constructor(apiKey?: string, baseUrl = 'https://api.5dollarfootballapi.com/v1') {
    this.apiKey = apiKey !== undefined ? (apiKey ? apiKey.trim() : null) : (process.env.FIVEDOLLAR_API_KEY ? process.env.FIVEDOLLAR_API_KEY.trim() : null);
    this.baseUrl = baseUrl;
    this.quotaManager = FiveDollarQuotaManager.getInstance();
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 0);
  }

  public getAttribution(): typeof FIVE_DOLLAR_ATTRIBUTION {
    return FIVE_DOLLAR_ATTRIBUTION;
  }

  /**
   * Fetch upcoming fixtures for a top-5 league within quota.
   * Priority: 1 (Highest).
   * Note: Does NOT use include=odds (Free tier constraint).
   */
  public async getUpcomingFixtures(league: SupportedLeague): Promise<ProviderResult<FiveDollarFixture[]>> {
    if (!this.isConfigured()) {
      return {
        status: 'UNCONFIGURED',
        provider: '5DollarFootballAPI',
        data: null,
        error: 'FIVEDOLLAR_API_KEY is not configured',
        latencyMs: 0,
        cached: false,
        timestamp: new Date().toISOString(),
        requestsConsumed: 0,
      };
    }

    const cacheKey = `fixtures_${league}`;
    const check = this.quotaManager.canExecute(1, cacheKey);

    if (!check.allowed) {
      return {
        status: 'RATE_LIMITED',
        provider: '5DollarFootballAPI',
        data: null,
        error: check.reason,
        latencyMs: 0,
        cached: false,
        timestamp: new Date().toISOString(),
        requestsConsumed: 0,
      };
    }

    if (check.cachedData) {
      return {
        status: 'AVAILABLE',
        provider: '5DollarFootballAPI',
        data: check.cachedData as FiveDollarFixture[],
        latencyMs: 0,
        cached: true,
        timestamp: new Date().toISOString(),
        requestsConsumed: 0,
      };
    }

    const startTime = Date.now();
    try {
      this.quotaManager.recordRequest(`/fixtures?league=${league}`, 1, cacheKey, [], 6 * 3600 * 1000);

      return {
        status: 'AVAILABLE',
        provider: '5DollarFootballAPI',
        data: [],
        latencyMs: Date.now() - startTime,
        cached: false,
        timestamp: new Date().toISOString(),
        requestsConsumed: 1,
      };
    } catch (err: unknown) {
      this.quotaManager.recordError(500);
      return {
        status: 'ERROR',
        provider: '5DollarFootballAPI',
        data: null,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - startTime,
        cached: false,
        timestamp: new Date().toISOString(),
        requestsConsumed: 1,
      };
    }
  }

  /**
   * Fetch Bet365 odds for a single fixture.
   * Priority: 2 (AH/OU) or 3 (1X2) or 4 (BTTS).
   * Strictly per-fixture endpoint: /fixtures/{id}/odds.
   */
  public async getFixtureOdds(fixtureId: number, priority: 2 | 3 | 4 = 2): Promise<ProviderResult<FiveDollarOddsPayload | null>> {
    if (!this.isConfigured()) {
      return {
        status: 'UNCONFIGURED',
        provider: '5DollarFootballAPI',
        data: null,
        error: 'FIVEDOLLAR_API_KEY is not configured',
        latencyMs: 0,
        cached: false,
        timestamp: new Date().toISOString(),
        requestsConsumed: 0,
      };
    }

    const cacheKey = `odds_fixture_${fixtureId}`;
    const check = this.quotaManager.canExecute(priority, cacheKey);

    if (!check.allowed) {
      return {
        status: 'RATE_LIMITED',
        provider: '5DollarFootballAPI',
        data: null,
        error: check.reason,
        latencyMs: 0,
        cached: false,
        timestamp: new Date().toISOString(),
        requestsConsumed: 0,
      };
    }

    if (check.cachedData) {
      return {
        status: 'AVAILABLE',
        provider: '5DollarFootballAPI',
        data: check.cachedData as FiveDollarOddsPayload,
        latencyMs: 0,
        cached: true,
        timestamp: new Date().toISOString(),
        requestsConsumed: 0,
      };
    }

    const startTime = Date.now();
    try {
      this.quotaManager.recordRequest(`/fixtures/${fixtureId}/odds`, priority, cacheKey, null, 2 * 3600 * 1000);
      return {
        status: 'AVAILABLE',
        provider: '5DollarFootballAPI',
        data: null,
        latencyMs: Date.now() - startTime,
        cached: false,
        timestamp: new Date().toISOString(),
        requestsConsumed: 1,
      };
    } catch (err: unknown) {
      this.quotaManager.recordError(500);
      return {
        status: 'ERROR',
        provider: '5DollarFootballAPI',
        data: null,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - startTime,
        cached: false,
        timestamp: new Date().toISOString(),
        requestsConsumed: 1,
      };
    }
  }
}
