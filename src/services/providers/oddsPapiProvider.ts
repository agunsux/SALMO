// SALMO.DEV — OddsPapi Provider Implementation
// Clean, zero-fabrication market odds and multi-league fixture adapter.
// Supports:
// - Bookmaker Benchmark Pair: Pinnacle (Sharp Reference) + Bet365 (Soft Retail Execution)
// - 15-League Canonical Worldwide Fixture Discovery
// - 5-Tournament Batch Ingestion (MAX_TOURNAMENTS_PER_BATCH_REQUEST = 5)
// - Asian Handicap (Quarter Lines), Over/Under, and BTTS
// - Returns explicit DATA_UNAVAILABLE when unconfigured or failing. Zero synthetic fallback.

import { IFixtureProvider, IOddsProvider, LiveFixtureDTO, LiveOddsDTO, ProviderResult, CONSUMED_BOOKMAKERS, ConsumedBookmaker } from './types';
import {
  CANONICAL_15_LEAGUES,
  MAX_TOURNAMENTS_PER_BATCH_REQUEST,
  getLeagueByOpId,
  getLeagueByKey,
  getLeagueByNameOrSlug,
} from '../../config/multiLeagueRegistry';
import { env } from '../../config/env';
import { Logger } from '../../lib/logger';
import { OddsPapiQuotaGuard } from '../../lib/quota/oddsPapiQuotaGuard';

export interface FixturesRequestParams {
  baseUrl?: string;
  apiKey: string;
  sportId?: number;
  tournamentId?: number;
  participantId?: number;
  from?: string;
  to?: string;
  language?: string;
  statusId?: 0 | 1 | 2 | 3;
  hasOdds?: boolean;
  bookmakers?: string | string[];
}

export interface OddsByTournamentsRequestParams {
  baseUrl?: string;
  apiKey: string;
  tournamentIds: number[];
  bookmakers: string | string[];
  enforceBatchSizeLimit?: boolean;
  maxTournamentsPerBatch?: number;
  language?: string;
  verbosity?: number;
}

export { MAX_TOURNAMENTS_PER_BATCH_REQUEST };
export const FIXTURES_COOLDOWN_MS = 2000; // GET /v4/fixtures cooldown: 2000ms
export const FIXTURES_MAX_SPORT_DATE_WINDOW_DAYS = 10; // sportId with from+to must be < 10 days apart
export const FIXTURES_MAX_UNFILTERED_DATE_WINDOW_HOURS = 48; // from+to alone must be < 48 hours apart
export const ODDS_BY_TOURNAMENTS_COOLDOWN_MS = 1000; // GET /v4/odds-by-tournaments cooldown: 1000ms
export const MAX_BOOKMAKERS_PER_REQUEST = 3; // GET /v4/odds-by-tournaments max bookmakers: 3
export const MAX_BOOKMAKERS_WITH_BETFAIR_EX = 1; // GET /v4/odds-by-tournaments max bookmakers when betfair-ex is used: 1

export class OddsPapiProvider implements IFixtureProvider, IOddsProvider {
  public readonly providerName = 'OddsPapi';
  public static readonly CONSUMED_BOOKMAKERS = CONSUMED_BOOKMAKERS;
  public static readonly MAX_TOURNAMENTS_PER_BATCH_REQUEST = MAX_TOURNAMENTS_PER_BATCH_REQUEST;

  // Official Endpoint Cooldowns & Contract Limits (https://oddspapi.io/us/docs)
  public static readonly FIXTURES_COOLDOWN_MS = FIXTURES_COOLDOWN_MS;
  public static readonly FIXTURES_MAX_SPORT_DATE_WINDOW_DAYS = FIXTURES_MAX_SPORT_DATE_WINDOW_DAYS;
  public static readonly FIXTURES_MAX_UNFILTERED_DATE_WINDOW_HOURS = FIXTURES_MAX_UNFILTERED_DATE_WINDOW_HOURS;
  public static readonly ODDS_BY_TOURNAMENTS_COOLDOWN_MS = ODDS_BY_TOURNAMENTS_COOLDOWN_MS;
  public static readonly MAX_BOOKMAKERS_PER_REQUEST = MAX_BOOKMAKERS_PER_REQUEST;
  public static readonly MAX_BOOKMAKERS_WITH_BETFAIR_EX = MAX_BOOKMAKERS_WITH_BETFAIR_EX;

  private static lastFixturesCallMs = 0;
  private static lastOddsByTournamentsCallMs = 0;
  private static cooldownHistoryForTest: Array<{ endpoint: '/fixtures' | '/odds-by-tournaments'; waitedMs: number }> = [];
  private static customSleepFnForTest: ((ms: number) => Promise<void>) | null = null;

  public static setSleepFnForTest(fn: ((ms: number) => Promise<void>) | null): void {
    this.customSleepFnForTest = fn;
  }

  public static resetCooldownStateForTest(): void {
    this.lastFixturesCallMs = 0;
    this.lastOddsByTournamentsCallMs = 0;
    this.cooldownHistoryForTest = [];
    this.customSleepFnForTest = null;
  }

  public static getCooldownHistoryForTest(): Array<{ endpoint: '/fixtures' | '/odds-by-tournaments'; waitedMs: number }> {
    return [...this.cooldownHistoryForTest];
  }

  private static async sleep(ms: number): Promise<void> {
    if (ms <= 0) return;
    if (this.customSleepFnForTest) {
      await this.customSleepFnForTest(ms);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  private static async enforceFixturesCooldown(isSubsequentInLoop = false): Promise<number> {
    const now = Date.now();
    let waitMs = 0;
    if (this.lastFixturesCallMs > 0) {
      const elapsed = now - this.lastFixturesCallMs;
      if (elapsed < this.FIXTURES_COOLDOWN_MS) {
        waitMs = this.FIXTURES_COOLDOWN_MS - elapsed;
      }
    } else if (isSubsequentInLoop) {
      waitMs = this.FIXTURES_COOLDOWN_MS;
    }

    if (waitMs > 0) {
      this.cooldownHistoryForTest.push({ endpoint: '/fixtures', waitedMs: waitMs });
      await this.sleep(waitMs);
    }
    this.lastFixturesCallMs = Date.now();
    return waitMs;
  }

  private static async enforceOddsByTournamentsCooldown(isSubsequentInLoop = false): Promise<number> {
    const now = Date.now();
    let waitMs = 0;
    if (this.lastOddsByTournamentsCallMs > 0) {
      const elapsed = now - this.lastOddsByTournamentsCallMs;
      if (elapsed < this.ODDS_BY_TOURNAMENTS_COOLDOWN_MS) {
        waitMs = this.ODDS_BY_TOURNAMENTS_COOLDOWN_MS - elapsed;
      }
    } else if (isSubsequentInLoop) {
      waitMs = this.ODDS_BY_TOURNAMENTS_COOLDOWN_MS;
    }

    if (waitMs > 0) {
      this.cooldownHistoryForTest.push({ endpoint: '/odds-by-tournaments', waitedMs: waitMs });
      await this.sleep(waitMs);
    }
    this.lastOddsByTournamentsCallMs = Date.now();
    return waitMs;
  }

  /**
   * Normalizes and validates bookmakers according to https://oddspapi.io/us/docs/get-odds-by-tournaments:
   * - Required, comma-separated list of bookmaker slugs
   * - Maximum 3 bookmakers per request
   * - Maximum 1 bookmaker per request if 'betfair-ex' is included
   */
  public static normalizeAndValidateBookmakers(bookmakersInput: string | string[]): string[] {
    const rawList = Array.isArray(bookmakersInput)
      ? bookmakersInput
      : typeof bookmakersInput === 'string'
      ? bookmakersInput.split(',')
      : [];

    const normalized = rawList.map(b => String(b).trim().toLowerCase()).filter(Boolean);
    if (normalized.length === 0) {
      throw new Error('INVALID_BOOKMAKERS_PARAM: At least 1 bookmaker slug is required.');
    }
    if (normalized.length > this.MAX_BOOKMAKERS_PER_REQUEST) {
      throw new Error(
        `MAX_BOOKMAKERS_EXCEEDED: GET /v4/odds-by-tournaments allows at most ${this.MAX_BOOKMAKERS_PER_REQUEST} bookmakers per request, got ${normalized.length}.`
      );
    }
    if (normalized.includes('betfair-ex') && normalized.length > this.MAX_BOOKMAKERS_WITH_BETFAIR_EX) {
      throw new Error(
        `BETFAIR_EX_BOOKMAKER_LIMIT: GET /v4/odds-by-tournaments allows at most ${this.MAX_BOOKMAKERS_WITH_BETFAIR_EX} bookmaker when betfair-ex is requested.`
      );
    }
    return normalized;
  }

  /**
   * Builds and validates a canonical GET /v4/fixtures request URL per https://oddspapi.io/us/docs/get-fixtures.
   * - Uses singular `tournamentId` (number) when filtering by league; NEVER emits undocumented `tournaments=`.
   * - Enforces official date-window rules (< 10 days with sportId; < 48 hours without sportId/tournamentId/participantId).
   */
  public static buildFixturesRequestUrl(params: FixturesRequestParams): string {
    const baseUrl = (params.baseUrl || env.providers.oddsPapi.baseUrl || 'https://api.oddspapi.io/v4').replace(/\/+$/, '');
    const apiKey = String(params.apiKey || '').trim();
    if (!apiKey) {
      throw new Error('INVALID_API_KEY: apiKey is required for GET /v4/fixtures.');
    }

    if (params.tournamentId !== undefined) {
      if (typeof params.tournamentId !== 'number' || !Number.isInteger(params.tournamentId) || params.tournamentId <= 0) {
        throw new Error(`INVALID_TOURNAMENT_ID: GET /v4/fixtures requires singular positive integer tournamentId, got ${String(params.tournamentId)}.`);
      }
    }

    if (params.participantId !== undefined) {
      if (typeof params.participantId !== 'number' || !Number.isInteger(params.participantId) || params.participantId <= 0) {
        throw new Error(`INVALID_PARTICIPANT_ID: participantId must be a positive integer.`);
      }
    }

    const hasFrom = params.from !== undefined && params.from !== '';
    const hasTo = params.to !== undefined && params.to !== '';
    let fromMs = 0;
    let toMs = 0;

    if (hasFrom || hasTo) {
      if (!hasFrom || !hasTo) {
        throw new Error('INVALID_DATE_RANGE: Both from and to ISO-8601 timestamps must be provided together.');
      }
      fromMs = Date.parse(params.from!);
      toMs = Date.parse(params.to!);
      if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) {
        throw new Error('INVALID_DATE_RANGE: from and to must be valid ISO-8601 timestamps with from <= to.');
      }
    }

    if (params.sportId !== undefined && params.tournamentId === undefined && params.participantId === undefined) {
      if (!hasFrom || !hasTo) {
        throw new Error(
          'INVALID_FIXTURES_FILTER: sportId must be accompanied by tournamentId, participantId, or from+to (< 10 days apart).'
        );
      }
      const maxWindowMs = this.FIXTURES_MAX_SPORT_DATE_WINDOW_DAYS * 24 * 3600 * 1000;
      if (toMs - fromMs >= maxWindowMs) {
        throw new Error(
          `FIXTURES_DATE_WINDOW_EXCEEDED: GET /v4/fixtures with sportId requires from and to to be < ${this.FIXTURES_MAX_SPORT_DATE_WINDOW_DAYS} days apart.`
        );
      }
    }

    if (params.sportId === undefined && params.tournamentId === undefined && params.participantId === undefined) {
      if (!hasFrom || !hasTo) {
        throw new Error('INVALID_FIXTURES_FILTER: At least tournamentId, participantId, sportId+from+to, or from+to (< 48h) is required.');
      }
      const maxUnfilteredMs = this.FIXTURES_MAX_UNFILTERED_DATE_WINDOW_HOURS * 3600 * 1000;
      if (toMs - fromMs >= maxUnfilteredMs) {
        throw new Error(
          `FIXTURES_UNFILTERED_WINDOW_EXCEEDED: GET /v4/fixtures without sportId/tournamentId/participantId requires from and to to be < ${this.FIXTURES_MAX_UNFILTERED_DATE_WINDOW_HOURS} hours apart.`
        );
      }
    }

    const searchParams: string[] = [];
    if (params.sportId !== undefined) {
      searchParams.push(`sportId=${encodeURIComponent(String(params.sportId))}`);
    }
    if (params.tournamentId !== undefined) {
      searchParams.push(`tournamentId=${encodeURIComponent(String(params.tournamentId))}`);
    }
    if (params.participantId !== undefined) {
      searchParams.push(`participantId=${encodeURIComponent(String(params.participantId))}`);
    }
    if (hasFrom && hasTo) {
      searchParams.push(`from=${encodeURIComponent(params.from!)}`);
      searchParams.push(`to=${encodeURIComponent(params.to!)}`);
    }
    if (params.language) {
      searchParams.push(`language=${encodeURIComponent(params.language)}`);
    }
    if (params.statusId !== undefined) {
      searchParams.push(`statusId=${encodeURIComponent(String(params.statusId))}`);
    }
    if (params.hasOdds !== undefined) {
      searchParams.push(`hasOdds=${encodeURIComponent(String(params.hasOdds))}`);
    }
    if (params.bookmakers !== undefined) {
      const bmList = Array.isArray(params.bookmakers) ? params.bookmakers.join(',') : params.bookmakers;
      if (bmList) {
        searchParams.push(`bookmakers=${encodeURIComponent(bmList)}`);
      }
    }
    searchParams.push(`apiKey=${encodeURIComponent(apiKey)}`);

    return `${baseUrl}/fixtures?${searchParams.join('&')}`;
  }

  /**
   * Builds and validates a canonical GET /v4/odds-by-tournaments request URL per
   * https://oddspapi.io/us/docs/get-odds-by-tournaments.
   *
   * Official Parameter Contract:
   * - `tournamentIds` (string, required): Comma-separated list of numeric tournament IDs.
   * - `bookmakers` (string, required): Comma-separated list of bookmaker slugs (max 3; max 1 if betfair-ex).
   * - `language` (string, optional)
   * - `verbosity` (number, optional)
   * - `apiKey` (string, required)
   *
   * Note on Official Doc Inconsistency:
   * The dedicated endpoint specification (`/us/docs/get-odds-by-tournaments`) defines `bookmakers` (plural, required, max 3),
   * whereas the Quick-Start Overview (`/us/docs` Step 3 curl example) uses `bookmaker=pinnacle` (singular).
   * SALMO follows the dedicated endpoint specification (`tournamentIds` + `bookmakers`) and never emits `tournaments=`.
   */
  public static buildOddsByTournamentsRequestUrl(params: OddsByTournamentsRequestParams): string {
    const baseUrl = (params.baseUrl || env.providers.oddsPapi.baseUrl || 'https://api.oddspapi.io/v4').replace(/\/+$/, '');
    const apiKey = String(params.apiKey || '').trim();
    if (!apiKey) {
      throw new Error('INVALID_API_KEY: apiKey is required for GET /v4/odds-by-tournaments.');
    }

    if (!Array.isArray(params.tournamentIds) || params.tournamentIds.length === 0) {
      throw new Error('INVALID_TOURNAMENT_IDS: tournamentIds must be a non-empty array of positive integers.');
    }

    for (const id of params.tournamentIds) {
      if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
        throw new Error(`INVALID_TOURNAMENT_IDS: Each tournamentId must be a positive integer, got ${String(id)}.`);
      }
    }

    const enforceBatchLimit = params.enforceBatchSizeLimit ?? true;
    const maxBatch = params.maxTournamentsPerBatch ?? this.MAX_TOURNAMENTS_PER_BATCH_REQUEST;
    if (enforceBatchLimit && params.tournamentIds.length > maxBatch) {
      throw new Error(
        `MAX_TOURNAMENTS_PER_BATCH_EXCEEDED: Batch size ${params.tournamentIds.length} exceeds MAX_TOURNAMENTS_PER_BATCH_REQUEST (${maxBatch}).`
      );
    }

    const bookmakersList = this.normalizeAndValidateBookmakers(params.bookmakers);
    const tournamentIdsParam = params.tournamentIds.join(',');
    const bookmakersParam = bookmakersList.join(',');

    const searchParams: string[] = [
      `tournamentIds=${encodeURIComponent(tournamentIdsParam)}`,
      `bookmakers=${encodeURIComponent(bookmakersParam)}`,
    ];

    if (params.language) {
      searchParams.push(`language=${encodeURIComponent(params.language)}`);
    }
    if (params.verbosity !== undefined) {
      searchParams.push(`verbosity=${encodeURIComponent(String(params.verbosity))}`);
    }
    searchParams.push(`apiKey=${encodeURIComponent(apiKey)}`);

    return `${baseUrl}/odds-by-tournaments?${searchParams.join('&')}`;
  }

  private getApiKey(): string | undefined {
    const key =
      env.providers.oddsPapi.apiKey ||
      process.env.ODDS_PAPI_KEY ||
      process.env.ODDSPAPI_KEY ||
      process.env.ODDSPAPI_API_KEY;
    return key && key.trim().length > 0 ? key.trim() : undefined;
  }

  public isConfigured(): boolean {
    return Boolean(this.getApiKey());
  }

  /**
   * Discovers upcoming fixtures using official GET /v4/fixtures contract:
   * - Uses singular `tournamentId` parameter (never undocumented `tournaments=`).
   * - Enforces documented 2000ms cooldown between consecutive /v4/fixtures requests.
   * - Confirms quota on HTTP 200 AND billable 4xx/5xx responses; releases only unbilled 401/429 or pre-response transport errors.
   */
  public async getUpcomingFixtures(
    tournamentIdsOrLeagueId?: number[] | number | string
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
        requestsConsumed: 0,
      };
    }

    if (OddsPapiQuotaGuard.isCircuitTripped()) {
      return {
        status: 'RATE_LIMITED',
        provider: this.providerName,
        data: null,
        error: OddsPapiQuotaGuard.getCircuitBreakerReason() || 'Circuit breaker is open.',
        latencyMs: 0,
        cached: false,
        timestamp,
        requestsConsumed: 0,
      };
    }

    // Resolve target tournament IDs
    let targetTournamentIds: number[];
    if (typeof tournamentIdsOrLeagueId === 'number') {
      targetTournamentIds = [tournamentIdsOrLeagueId];
    } else if (Array.isArray(tournamentIdsOrLeagueId)) {
      targetTournamentIds = [...tournamentIdsOrLeagueId];
    } else if (typeof tournamentIdsOrLeagueId === 'string' && tournamentIdsOrLeagueId.trim().length > 0) {
      const matched = getLeagueByKey(tournamentIdsOrLeagueId) || getLeagueByNameOrSlug(tournamentIdsOrLeagueId);
      targetTournamentIds = matched
        ? [matched.oddspapi_tournament_id]
        : CANONICAL_15_LEAGUES.map(l => l.oddspapi_tournament_id);
    } else {
      targetTournamentIds = CANONICAL_15_LEAGUES.map(l => l.oddspapi_tournament_id);
    }

    if (targetTournamentIds.length === 0) {
      return {
        status: 'DATA_UNAVAILABLE',
        provider: this.providerName,
        data: [],
        error: 'No tournament IDs provided for fixture discovery.',
        latencyMs: 0,
        cached: false,
        timestamp,
        requestsConsumed: 0,
      };
    }

    const apiKey = this.getApiKey()!;
    const baseUrl = env.providers.oddsPapi.baseUrl;
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    // Validate all request URLs offline before reserving quota or touching the network
    let requestUrls: Array<{ tournamentId: number; url: string }>;
    try {
      requestUrls = targetTournamentIds.map(tournamentId => ({
        tournamentId,
        url: OddsPapiProvider.buildFixturesRequestUrl({
          baseUrl,
          apiKey,
          sportId: 10,
          tournamentId,
          from,
          to,
        }),
      }));
    } catch (validationErr) {
      return {
        status: 'DATA_UNAVAILABLE',
        provider: this.providerName,
        data: null,
        error: String(validationErr),
        latencyMs: Date.now() - start,
        cached: false,
        timestamp,
        requestsConsumed: 0,
      };
    }

    // Pre-flight Persistent Quota & 90% Hard-Stop Guard: Reserve total request count upfront
    const batchReservation = await OddsPapiQuotaGuard.reserveQuota(requestUrls.length);
    if (!batchReservation.allowed) {
      Logger.warn(`[OddsPapiProvider] Fixture discovery halted by quota guard: ${batchReservation.reason}`);
      return {
        status: 'RATE_LIMITED',
        provider: this.providerName,
        data: null,
        error: batchReservation.reason,
        latencyMs: Date.now() - start,
        cached: false,
        timestamp,
        requestsConsumed: 0,
      };
    }

    const allFixtures: LiveFixtureDTO[] = [];
    const seenFixtureIds = new Set<string>();
    const reservationId = batchReservation.reservationId!;
    const allowProdWrite = OddsPapiQuotaGuard.isProductionDatabaseWriteAllowed(
      process.env.ALLOW_PRODUCTION_DB_WRITE === 'true'
    );
    let billableRequestsConsumed = 0;

    for (let i = 0; i < requestUrls.length; i++) {
      const { tournamentId, url } = requestUrls[i];

      // Enforce official 2000ms cooldown on GET /v4/fixtures
      await OddsPapiProvider.enforceFixturesCooldown(i > 0);

      let res: Response;
      try {
        res = await fetch(url, {
          headers: { Accept: 'application/json' },
          next: { revalidate: 300 },
        });
      } catch (err) {
        // Pre-response transport error: release remaining unexecuted reservation units
        OddsPapiQuotaGuard.releaseQuota(reservationId, {
          endpoint: '/fixtures',
          params: { tournamentId },
          error: String(err),
        });
        const latencyMs = Date.now() - start;
        Logger.error('[OddsPapiProvider] Fixture discovery network failure:', { error: String(err), latencyMs });
        return {
          status: 'DATA_UNAVAILABLE',
          provider: this.providerName,
          data: null,
          error: `Network failure connecting to OddsPapi: ${String(err)}`,
          latencyMs,
          cached: false,
          timestamp,
          requestsConsumed: billableRequestsConsumed,
        };
      }

      // Non-billable pre-endpoint rejection (429 / 401): release remaining unconfirmed units and trip circuit breaker
      if (res.status === 429 || res.status === 401) {
        OddsPapiQuotaGuard.releaseQuota(reservationId, {
          endpoint: '/fixtures',
          params: { tournamentId },
          statusCode: res.status,
          error: `HTTP ${res.status}`,
        });
        Logger.warn(`[OddsPapiProvider] HTTP ${res.status} encountered during fixture discovery`);
        return {
          status: res.status === 429 ? 'RATE_LIMITED' : 'UNCONFIGURED',
          provider: this.providerName,
          data: allFixtures.length > 0 ? allFixtures : null,
          error: res.status === 429 ? 'Rate limit exceeded on OddsPapi subscription tier.' : 'Unauthorized OddsPapi API key.',
          latencyMs: Date.now() - start,
          cached: false,
          timestamp,
          requestsConsumed: billableRequestsConsumed,
        };
      }

      // Billable 4xx / 5xx endpoint error: per /us/docs/requests-and-quota, counts as 1 billable request
      if (!res.ok) {
        billableRequestsConsumed += 1;
        await OddsPapiQuotaGuard.confirmQuota(
          reservationId,
          {
            endpoint: '/fixtures',
            params: { tournamentId },
            statusCode: res.status,
            outcome: 'BILLABLE_ERROR',
            consumedCost: 1,
            error: `HTTP ${res.status}`,
          },
          allowProdWrite
        );
        Logger.warn(`[OddsPapiProvider] Fixture fetch for tournamentId=${tournamentId} returned billable HTTP ${res.status}`);
        continue;
      }

      // Billable 200 OK: confirm 1 consumed unit immediately
      billableRequestsConsumed += 1;
      await OddsPapiQuotaGuard.confirmQuota(
        reservationId,
        {
          endpoint: '/fixtures',
          params: { tournamentId },
          statusCode: res.status,
          outcome: 'SUCCESS',
          consumedCost: 1,
        },
        allowProdWrite
      );

      try {
        const rawList = await res.json();
        if (Array.isArray(rawList)) {
          for (const f of rawList) {
            const fId = String(f.fixtureId || f.id || '');
            if (!fId || seenFixtureIds.has(fId)) continue;
            seenFixtureIds.add(fId);

            const opTournId = Number(f.tournamentId || f.tournament?.id || tournamentId || 0);
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
      } catch (parseErr) {
        Logger.warn('[OddsPapiProvider] Failed to parse fixture response JSON after HTTP 200:', { error: String(parseErr) });
      }
    }

    return {
      status: allFixtures.length > 0 ? 'AVAILABLE' : 'DATA_UNAVAILABLE',
      provider: this.providerName,
      data: allFixtures,
      latencyMs: Date.now() - start,
      cached: false,
      timestamp,
      requestsConsumed: billableRequestsConsumed,
    };
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
      requestsConsumed: 0,
    };
  }

  /**
   * Fetches batch tournament odds conforming to GET /v4/odds-by-tournaments contract.
   * Up to MAX_TOURNAMENTS_PER_BATCH_REQUEST (5) tournament IDs per batch call, and up to 3 bookmakers.
   */
  public async getTournamentOdds(
    tournamentIds: number[],
    bookmakers: string | string[] = 'pinnacle'
  ): Promise<ProviderResult<LiveOddsDTO[]>> {
    return this.getBatchTournamentOdds(tournamentIds, bookmakers);
  }

  /**
   * Single-batch ingestion for all configured tournaments in ONE request.
   * Conforms to GET /v4/odds-by-tournaments (`tournamentIds` + `bookmakers`).
   */
  public async getSingleBatchTournamentOdds(
    allTournamentIds: number[],
    bookmakers: string | string[] = 'pinnacle'
  ): Promise<ProviderResult<LiveOddsDTO[]>> {
    return this.executeOddsByTournamentsRequest(allTournamentIds, bookmakers, {
      enforceBatchSizeLimit: false,
      endpointLabel: 'odds-by-tournaments',
    });
  }

  /**
   * Fetches batch tournament odds (enforcing MAX_TOURNAMENTS_PER_BATCH_REQUEST = 5 per batch and max 3 bookmakers).
   */
  public async getBatchTournamentOdds(
    tournamentIds: number[],
    bookmakers: string | string[] = 'pinnacle'
  ): Promise<ProviderResult<LiveOddsDTO[]>> {
    return this.executeOddsByTournamentsRequest(tournamentIds, bookmakers, {
      enforceBatchSizeLimit: true,
      endpointLabel: 'odds-by-tournaments',
    });
  }

  private async executeOddsByTournamentsRequest(
    tournamentIds: number[],
    bookmakers: string | string[],
    options: { enforceBatchSizeLimit: boolean; endpointLabel: string }
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
        requestsConsumed: 0,
      };
    }

    if (OddsPapiQuotaGuard.isCircuitTripped()) {
      return {
        status: 'RATE_LIMITED',
        provider: this.providerName,
        data: null,
        error: OddsPapiQuotaGuard.getCircuitBreakerReason() || 'Circuit breaker is open.',
        latencyMs: 0,
        cached: false,
        timestamp,
        requestsConsumed: 0,
      };
    }

    const apiKey = this.getApiKey()!;
    const baseUrl = env.providers.oddsPapi.baseUrl;

    // Validate contract and build URL BEFORE reserving quota or touching the network
    let url: string;
    let normalizedBookmakers: string[];
    try {
      normalizedBookmakers = OddsPapiProvider.normalizeAndValidateBookmakers(bookmakers);
      url = OddsPapiProvider.buildOddsByTournamentsRequestUrl({
        baseUrl,
        apiKey,
        tournamentIds,
        bookmakers: normalizedBookmakers,
        enforceBatchSizeLimit: options.enforceBatchSizeLimit,
      });
    } catch (contractErr) {
      return {
        status: 'DATA_UNAVAILABLE',
        provider: this.providerName,
        data: null,
        error: String(contractErr),
        latencyMs: Date.now() - start,
        cached: false,
        timestamp,
        requestsConsumed: 0,
      };
    }

    const reservation = await OddsPapiQuotaGuard.reserveQuota(1);
    if (!reservation.allowed) {
      Logger.warn(`[OddsPapiProvider] Tournament odds halted by quota guard: ${reservation.reason}`);
      return {
        status: 'RATE_LIMITED',
        provider: this.providerName,
        data: null,
        error: reservation.reason,
        latencyMs: Date.now() - start,
        cached: false,
        timestamp,
        requestsConsumed: 0,
      };
    }

    const reservationId = reservation.reservationId!;
    const auditParams = { tournamentIds, bookmakers: normalizedBookmakers.join(',') };
    const allowProdWrite = OddsPapiQuotaGuard.isProductionDatabaseWriteAllowed(
      process.env.ALLOW_PRODUCTION_DB_WRITE === 'true'
    );
    let quotaSettled = false;
    let billableRequestConsumed = 0;

    try {
      // Enforce official 1000ms cooldown on GET /v4/odds-by-tournaments
      await OddsPapiProvider.enforceOddsByTournamentsCooldown();

      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        next: { revalidate: 60 },
      });

      // Documented non-billable pre-endpoint rejection (429 / 401)
      if (res.status === 429 || res.status === 401) {
        quotaSettled = true;
        const errBody = await res.text().catch(() => '');
        OddsPapiQuotaGuard.releaseQuota(reservationId, {
          endpoint: options.endpointLabel,
          params: auditParams,
          statusCode: res.status,
          error: `HTTP ${res.status}`,
        });
        OddsPapiQuotaGuard.tripCircuitBreaker(
          res.status,
          `OddsPapi ${options.endpointLabel} returned ${res.status}: ${errBody.slice(0, 120)}`
        );
        return {
          status: res.status === 429 ? 'RATE_LIMITED' : 'UNCONFIGURED',
          provider: this.providerName,
          data: null,
          error: `OddsPapi returned HTTP ${res.status}`,
          latencyMs: Date.now() - start,
          cached: false,
          timestamp,
          requestsConsumed: 0,
        };
      }

      // Billable 4xx / 5xx endpoint error: per /us/docs/requests-and-quota, counts as 1 billable request
      if (!res.ok) {
        quotaSettled = true;
        billableRequestConsumed = 1;
        await OddsPapiQuotaGuard.confirmQuota(
          reservationId,
          {
            endpoint: options.endpointLabel,
            params: auditParams,
            statusCode: res.status,
            outcome: 'BILLABLE_ERROR',
            error: `HTTP ${res.status}`,
          },
          allowProdWrite
        );
        return {
          status: 'DATA_UNAVAILABLE',
          provider: this.providerName,
          data: null,
          error: `OddsPapi /odds-by-tournaments returned HTTP ${res.status}`,
          latencyMs: Date.now() - start,
          cached: false,
          timestamp,
          requestsConsumed: 1,
        };
      }

      // Billable 200 OK
      quotaSettled = true;
      billableRequestConsumed = 1;
      await OddsPapiQuotaGuard.confirmQuota(
        reservationId,
        {
          endpoint: options.endpointLabel,
          params: auditParams,
          statusCode: res.status,
          outcome: 'SUCCESS',
        },
        allowProdWrite
      );

      const json = await res.json();
      const oddsList: LiveOddsDTO[] = [];
      for (const bmSlug of normalizedBookmakers) {
        oddsList.push(...this.parseOddsApiResponse(json, bmSlug, timestamp));
      }

      return {
        status: 'AVAILABLE',
        provider: this.providerName,
        data: oddsList,
        latencyMs: Date.now() - start,
        cached: false,
        timestamp,
        requestsConsumed: 1,
      };
    } catch (err) {
      if (!quotaSettled) {
        OddsPapiQuotaGuard.releaseQuota(reservationId, {
          endpoint: options.endpointLabel,
          params: auditParams,
          error: String(err),
        });
      }
      return {
        status: 'DATA_UNAVAILABLE',
        provider: this.providerName,
        data: null,
        error: `Tournament odds failure: ${String(err)}`,
        latencyMs: Date.now() - start,
        cached: false,
        timestamp,
        requestsConsumed: billableRequestConsumed,
      };
    }
  }

  /**
   * Per-fixture /odds endpoint is blocked to prevent billable quota exhaustion.
   * Odds are ingested strictly via single-batch /odds-by-tournaments.
   */
  public async getMarketOdds(
    fixtureId: string,
    bookmakers: string[] = ['pinnacle', 'bet365']
  ): Promise<ProviderResult<LiveOddsDTO[]>> {
    const timestamp = new Date().toISOString();
    return {
      status: 'DATA_UNAVAILABLE',
      provider: this.providerName,
      data: null,
      error: 'Per-fixture /odds endpoint is disabled to prevent quota exhaustion. Fixtures are ingested via API-Football and odds via single-batch /odds-by-tournaments.',
      latencyMs: 0,
      cached: false,
      timestamp,
    };
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
          const isMainLine =
            typeof homeOutcome?.mainLine === 'boolean'
              ? homeOutcome.mainLine
              : mIdStr.startsWith('line/') && mIdStr.includes('/0/');
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
          const isMainLine =
            typeof overOutcome?.mainLine === 'boolean'
              ? overOutcome.mainLine
              : mIdStr.startsWith('line/') && mIdStr.includes('/0/');
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
