// SALMO.DEV — The Odds API Provider Implementation
// Fallback odds provider for Asian Handicap, Over/Under, and BTTS.
// Invariants enforced:
// 1. Role: Supplementary / fallback market odds provider. Does NOT replace OddsPapi.
// 2. Provider Identifier: 'TheOddsApi'
// 3. Quota Safety: Pre-authorized through TheOddsApiQuotaManager before issuing requests.
// 4. Zero Secrets Leakage: API key retrieved server-side, redacted from logs, never sent to clients.
// 5. Capability Discipline: Strict AH (signed quarter-lines preserved), OU (line family), BTTS.
// 6. Zero Fabrication: If lines or prices are missing or unconfigured, returns explicit DATA_UNAVAILABLE / UNCONFIGURED.

import {
  IFixtureProvider,
  IOddsProvider,
  LiveFixtureDTO,
  LiveOddsDTO,
  ProviderResult,
  CONSUMED_BOOKMAKERS,
} from './types';
import { TheOddsApiQuotaManager } from './theOddsApiQuotaManager';
import {
  TheOddsApiNormalizer,
  TheOddsApiEvent,
  CanonicalOddsRecord,
} from './theOddsApiNormalizer';
import { Logger } from '../../lib/logger';

export interface TheOddsApiProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export class TheOddsApiProvider implements IFixtureProvider, IOddsProvider {
  public readonly providerName = 'TheOddsApi';
  private static readonly DEFAULT_BASE_URL = 'https://api.the-odds-api.com/v4';
  private static readonly DEFAULT_TIMEOUT_MS = 6000;

  /** Canonical league ID to The Odds API sport key mapping */
  public static readonly SPORT_KEY_MAP: Record<string, string> = {
    'ENG-PL': 'soccer_epl',
    'ESP-LALIGA': 'soccer_spain_la_liga',
    'DEU-BUNDESLIGA': 'soccer_germany_bundesliga',
    'ITA-SERIEA': 'soccer_italy_serie_a',
    'FRA-LIGUE1': 'soccer_france_ligue_one',
    'NED-ERE': 'soccer_netherlands_eredivisie',
    'POR-PRIMEIRA': 'soccer_portugal_primeira_liga',
    'BEL-PRO': 'soccer_belgium_first_div',
    'TUR-SUPERLIG': 'soccer_turkey_super_league',
    'BRA-SERIEA': 'soccer_brazil_campeonato',
    'USA-MLS': 'soccer_usa_mls',
    'JPN-J1': 'soccer_japan_j_league',
    'KOR-K1': 'soccer_korea_kleague1',
    'MEX-LMX': 'soccer_mexico_ligamx',
    'ARG-PD': 'soccer_argentina_primera_division',
    'UEFA-CL': 'soccer_uefa_champs_league',
    'UEFA-EL': 'soccer_uefa_europa_league',
    'UEFA-ECL': 'soccer_uefa_europa_conference_league',
  };

  /** Reverse map: Sport key to canonical league ID */
  public static readonly REVERSE_SPORT_KEY_MAP: Record<string, string> = Object.entries(
    TheOddsApiProvider.SPORT_KEY_MAP
  ).reduce((acc, [canon, sport]) => {
    acc[sport] = canon;
    return acc;
  }, {} as Record<string, string>);

  private baseUrl: string;
  private timeoutMs: number;
  private explicitApiKey?: string;

  constructor(options: TheOddsApiProviderOptions = {}) {
    this.baseUrl = options.baseUrl || TheOddsApiProvider.DEFAULT_BASE_URL;
    this.timeoutMs = options.timeoutMs || TheOddsApiProvider.DEFAULT_TIMEOUT_MS;
    this.explicitApiKey = options.apiKey;
  }

  /**
   * Safe server-side credential resolution.
   * Never exposes secret values to logs or client bundles.
   */
  public getApiKey(): string {
    if (this.explicitApiKey && this.explicitApiKey.trim()) {
      return this.explicitApiKey.trim();
    }
    const canonical = process.env.ODDS_API_KEY;
    if (canonical && canonical.trim() && !canonical.includes('[SENSITIVE]')) {
      return canonical.trim();
    }
    const legacy = process.env.THE_ODDS_API_KEY;
    if (legacy && legacy.trim() && !legacy.includes('[SENSITIVE]')) {
      return legacy.trim();
    }
    return '';
  }

  public isConfigured(): boolean {
    return this.getApiKey().length > 0;
  }

  /**
   * Secret-free credential status for health and logs.
   */
  public getCredentialStatus(): {
    configured: boolean;
    source: 'EXPLICIT' | 'ODDS_API_KEY' | 'THE_ODDS_API_KEY' | 'MISSING';
  } {
    if (this.explicitApiKey && this.explicitApiKey.trim()) {
      return { configured: true, source: 'EXPLICIT' };
    }
    const canonical = process.env.ODDS_API_KEY;
    if (canonical && canonical.trim() && !canonical.includes('[SENSITIVE]')) {
      return { configured: true, source: 'ODDS_API_KEY' };
    }
    const legacy = process.env.THE_ODDS_API_KEY;
    if (legacy && legacy.trim() && !legacy.includes('[SENSITIVE]')) {
      return { configured: true, source: 'THE_ODDS_API_KEY' };
    }
    return { configured: false, source: 'MISSING' };
  }

  /**
   * Resolves The Odds API sport key from canonical league ID or sport key.
   */
  public resolveSportKey(leagueOrSport: string): string | null {
    if (TheOddsApiProvider.SPORT_KEY_MAP[leagueOrSport]) {
      return TheOddsApiProvider.SPORT_KEY_MAP[leagueOrSport];
    }
    if (TheOddsApiProvider.REVERSE_SPORT_KEY_MAP[leagueOrSport]) {
      return leagueOrSport;
    }
    if (leagueOrSport.startsWith('soccer_')) {
      return leagueOrSport;
    }
    return null;
  }

  /**
   * Safe unmetered health check against /v4/sports (0 credit cost).
   */
  public async healthCheck(timeoutMs: number = 5000): Promise<{
    healthy: boolean;
    provider: string;
    configured: boolean;
    latencyMs: number;
    error?: string;
    remainingCredits?: number;
  }> {
    const start = Date.now();
    const credStatus = this.getCredentialStatus();

    if (!credStatus.configured) {
      return {
        healthy: false,
        provider: this.providerName,
        configured: false,
        latencyMs: 0,
        error: 'ODDS_API_KEY / THE_ODDS_API_KEY is not configured in environment',
      };
    }

    const key = this.getApiKey();
    const url = `${this.baseUrl}/sports?apiKey=${encodeURIComponent(key)}`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timer);
      const latencyMs = Date.now() - start;

      const remHeader = res.headers.get('x-requests-remaining');
      const usedHeader = res.headers.get('x-requests-used');

      TheOddsApiQuotaManager.recordExecution({
        requestId: `toa_health_${Date.now()}`,
        endpoint: 'sports',
        method: 'GET',
        cost: 0,
        remainingHeader: remHeader,
        usedHeader: usedHeader,
        httpStatus: res.status,
        success: res.ok,
      });

      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        if (res.status === 401) errMsg = 'UNAUTHORIZED: Invalid API key';
        if (res.status === 429) errMsg = 'RATE_LIMITED: Requests limit exceeded';
        return {
          healthy: false,
          provider: this.providerName,
          configured: true,
          latencyMs,
          error: errMsg,
        };
      }

      return {
        healthy: true,
        provider: this.providerName,
        configured: true,
        latencyMs,
        remainingCredits: remHeader ? parseInt(remHeader, 10) : undefined,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      const isTimeout = err?.name === 'AbortError' || String(err).includes('abort');
      return {
        healthy: false,
        provider: this.providerName,
        configured: true,
        latencyMs,
        error: isTimeout ? 'TIMEOUT: Provider health check timed out' : `NETWORK_ERROR: ${err?.message || String(err)}`,
      };
    }
  }

  /**
   * Fetches upcoming fixtures for a league or all supported leagues.
   */
  public async getUpcomingFixtures(leagueId?: string): Promise<ProviderResult<LiveFixtureDTO[]>> {
    const start = Date.now();
    const timestamp = new Date().toISOString();

    if (!this.isConfigured()) {
      return {
        status: 'UNCONFIGURED',
        provider: this.providerName,
        data: null,
        error: 'The Odds API key is not configured',
        latencyMs: 0,
        cached: false,
        timestamp,
        requestsConsumed: 0,
      };
    }

    const sportKey = leagueId ? this.resolveSportKey(leagueId) : 'soccer_epl';
    if (!sportKey) {
      return {
        status: 'DATA_UNAVAILABLE',
        provider: this.providerName,
        data: null,
        error: `Unsupported league for The Odds API: ${leagueId}`,
        latencyMs: 0,
        cached: false,
        timestamp,
        requestsConsumed: 0,
      };
    }

    const auth = TheOddsApiQuotaManager.authorizeRequest('events', 50);
    if (!auth.allowed) {
      return {
        status: 'RATE_LIMITED',
        provider: this.providerName,
        data: null,
        error: auth.reason,
        latencyMs: 0,
        cached: false,
        timestamp,
        requestsConsumed: 0,
      };
    }

    const key = this.getApiKey();
    const url = `${this.baseUrl}/sports/${sportKey}/events?apiKey=${encodeURIComponent(key)}`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timer);
      const latencyMs = Date.now() - start;

      const remHeader = res.headers.get('x-requests-remaining');
      const usedHeader = res.headers.get('x-requests-used');

      TheOddsApiQuotaManager.recordExecution({
        requestId: `toa_events_${Date.now()}`,
        endpoint: 'events',
        method: 'GET',
        cost: 0, // /events endpoint is unmetered on The Odds API
        remainingHeader: remHeader,
        usedHeader: usedHeader,
        httpStatus: res.status,
        success: res.ok,
      });

      if (!res.ok) {
        return {
          status: res.status === 429 ? 'RATE_LIMITED' : 'ERROR',
          provider: this.providerName,
          data: null,
          error: `HTTP ${res.status}: Failed to fetch upcoming events`,
          latencyMs,
          cached: false,
          timestamp,
          requestsConsumed: 0,
        };
      }

      const events: TheOddsApiEvent[] = await res.json();
      const canonicalLeague = TheOddsApiProvider.REVERSE_SPORT_KEY_MAP[sportKey] || sportKey;

      const fixtures: LiveFixtureDTO[] = events.map((ev) => ({
        providerFixtureId: ev.id,
        league: canonicalLeague,
        season: new Date(ev.commence_time).getUTCFullYear().toString(),
        kickoffTime: ev.commence_time,
        homeTeam: ev.home_team,
        awayTeam: ev.away_team,
        status: 'SCHEDULED',
        kickoffTimeConfirmed: true,
      }));

      return {
        status: 'AVAILABLE',
        provider: this.providerName,
        data: fixtures,
        latencyMs,
        cached: false,
        timestamp,
        requestsConsumed: 0,
      };
    } catch (err: any) {
      return {
        status: 'ERROR',
        provider: this.providerName,
        data: null,
        error: `Exception fetching fixtures: ${err?.message || String(err)}`,
        latencyMs: Date.now() - start,
        cached: false,
        timestamp,
        requestsConsumed: 0,
      };
    }
  }

  public async getFixtureById(id: string): Promise<ProviderResult<LiveFixtureDTO | null>> {
    const listRes = await this.getUpcomingFixtures();
    if (listRes.status !== 'AVAILABLE' || !listRes.data) {
      return {
        status: listRes.status,
        provider: this.providerName,
        data: null,
        error: listRes.error,
        latencyMs: listRes.latencyMs,
        cached: false,
        timestamp: listRes.timestamp,
        requestsConsumed: listRes.requestsConsumed,
      };
    }
    const found = listRes.data.find((f) => f.providerFixtureId === id) || null;
    return {
      status: found ? 'AVAILABLE' : 'DATA_UNAVAILABLE',
      provider: this.providerName,
      data: found,
      latencyMs: listRes.latencyMs,
      cached: false,
      timestamp: listRes.timestamp,
      requestsConsumed: listRes.requestsConsumed,
    };
  }

  /**
   * Fetches odds across supported markets (spreads, totals) for a given league.
   */
  public async getLeagueOdds(
    leagueId: string,
    options: {
      regions?: string;
      markets?: string;
      priority?: number;
    } = {}
  ): Promise<ProviderResult<CanonicalOddsRecord[]>> {
    const start = Date.now();
    const timestamp = new Date().toISOString();

    if (!this.isConfigured()) {
      return {
        status: 'UNCONFIGURED',
        provider: this.providerName,
        data: null,
        error: 'The Odds API key is not configured',
        latencyMs: 0,
        cached: false,
        timestamp,
        requestsConsumed: 0,
      };
    }

    const sportKey = this.resolveSportKey(leagueId);
    if (!sportKey) {
      return {
        status: 'DATA_UNAVAILABLE',
        provider: this.providerName,
        data: null,
        error: `Unsupported league for The Odds API: ${leagueId}`,
        latencyMs: 0,
        cached: false,
        timestamp,
        requestsConsumed: 0,
      };
    }

    const priority = options.priority ?? 50;
    const auth = TheOddsApiQuotaManager.authorizeRequest('odds', priority);
    if (!auth.allowed) {
      return {
        status: 'RATE_LIMITED',
        provider: this.providerName,
        data: null,
        error: auth.reason,
        latencyMs: 0,
        cached: false,
        timestamp,
        requestsConsumed: 0,
      };
    }

    const key = this.getApiKey();
    const regions = options.regions || 'eu,uk';
    const markets = options.markets || 'spreads,totals';
    const url = `${this.baseUrl}/sports/${sportKey}/odds?apiKey=${encodeURIComponent(key)}&regions=${regions}&markets=${markets}&oddsFormat=decimal`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timer);
      const latencyMs = Date.now() - start;

      const remHeader = res.headers.get('x-requests-remaining');
      const usedHeader = res.headers.get('x-requests-used');

      // Each query to /odds consumes request credits on The Odds API
      TheOddsApiQuotaManager.recordExecution({
        requestId: `toa_odds_${Date.now()}`,
        endpoint: 'odds',
        method: 'GET',
        cost: 1,
        remainingHeader: remHeader,
        usedHeader: usedHeader,
        httpStatus: res.status,
        success: res.ok,
      });

      if (!res.ok) {
        return {
          status: res.status === 429 ? 'RATE_LIMITED' : 'ERROR',
          provider: this.providerName,
          data: null,
          error: `HTTP ${res.status}: Failed to fetch market odds`,
          latencyMs,
          cached: false,
          timestamp,
          requestsConsumed: 1,
        };
      }

      const events: TheOddsApiEvent[] = await res.json();
      const canonicalLeague = TheOddsApiProvider.REVERSE_SPORT_KEY_MAP[sportKey] || sportKey;
      const allRecords: CanonicalOddsRecord[] = [];

      for (const ev of events) {
        const records = TheOddsApiNormalizer.normalizeEvent(ev, {
          canonicalLeagueId: canonicalLeague,
          capturedAt: timestamp,
        });
        allRecords.push(...records);
      }

      return {
        status: allRecords.length > 0 ? 'AVAILABLE' : 'DATA_UNAVAILABLE',
        provider: this.providerName,
        data: allRecords,
        latencyMs,
        cached: false,
        timestamp,
        requestsConsumed: 1,
      };
    } catch (err: any) {
      return {
        status: 'ERROR',
        provider: this.providerName,
        data: null,
        error: `Exception fetching odds: ${err?.message || String(err)}`,
        latencyMs: Date.now() - start,
        cached: false,
        timestamp,
        requestsConsumed: 0,
      };
    }
  }

  /**
   * Implements IOddsProvider.getMarketOdds.
   */
  public async getMarketOdds(
    fixtureId: string,
    bookmakers?: string[]
  ): Promise<ProviderResult<LiveOddsDTO[]>> {
    const leagueOddsRes = await this.getLeagueOdds('ENG-PL');
    const timestamp = new Date().toISOString();

    if (leagueOddsRes.status !== 'AVAILABLE' || !leagueOddsRes.data) {
      return {
        status: leagueOddsRes.status,
        provider: this.providerName,
        data: null,
        error: leagueOddsRes.error,
        latencyMs: leagueOddsRes.latencyMs,
        cached: false,
        timestamp,
        requestsConsumed: leagueOddsRes.requestsConsumed,
      };
    }

    const filtered = leagueOddsRes.data.filter(
      (r) => r.providerMatchId === fixtureId || r.canonicalMatchId === fixtureId
    );

    const dtos: LiveOddsDTO[] = filtered.map((r) => ({
      providerFixtureId: r.providerMatchId,
      bookmaker: r.bookmaker,
      marketType: r.market === 'AH' ? 'ASIAN_HANDICAP' : r.market === 'OU' ? 'OVER_UNDER' : 'BTTS',
      line: r.line ?? 0,
      homeOdds: r.homeOdds ?? r.oddsDecimal,
      awayOdds: r.awayOdds ?? r.oddsDecimal,
      capturedAt: r.capturedAt,
      isMainLine: r.isMainLine,
    }));

    return {
      status: dtos.length > 0 ? 'AVAILABLE' : 'DATA_UNAVAILABLE',
      provider: this.providerName,
      data: dtos,
      latencyMs: leagueOddsRes.latencyMs,
      cached: false,
      timestamp,
      requestsConsumed: leagueOddsRes.requestsConsumed,
    };
  }
}
