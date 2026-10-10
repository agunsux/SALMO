// SALMO.DEV — TheSportsDB Fixture Provider
// Connects to community sports fixture feed (thesportsdb.com)
// Free public access via community tier key '3'. Zero paid subscription required for testing & evaluation.
// Cross-references API-Football fixture IDs directly via idAPIfootball.

import { IFixtureProvider, LiveFixtureDTO, ProviderResult } from './types';
import { Logger } from '../../lib/logger';
import { normalizeTeamKey } from '../../engine/features/teamRatings';

export interface TheSportsDbEvent {
  idEvent: string;
  idAPIfootball?: string;
  strEvent: string;
  strLeague: string;
  strSeason: string;
  strHomeTeam: string;
  strAwayTeam: string;
  strTimestamp?: string;
  dateEvent?: string;
  strTime?: string;
  strVenue?: string;
  strPostponed?: string;
  intRound?: string;
}

export interface TheSportsDbResponse {
  events: TheSportsDbEvent[] | null;
}

export const THESPORTSDB_LEAGUE_MAP: Record<string, { tsdbId: string; leagueName: string }> = {
  '39': { tsdbId: '4328', leagueName: 'Premier League' },
  '40': { tsdbId: '4329', leagueName: 'Championship' },
  '78': { tsdbId: '4331', leagueName: 'Bundesliga' },
  '140': { tsdbId: '4335', leagueName: 'La Liga' },
  '61': { tsdbId: '4334', leagueName: 'Ligue 1' },
  '135': { tsdbId: '4332', leagueName: 'Serie A' },
  '88': { tsdbId: '4337', leagueName: 'Eredivisie' },
  '94': { tsdbId: '4344', leagueName: 'Primeira Liga' },
  '253': { tsdbId: '4346', leagueName: 'Major League Soccer' },
  '98': { tsdbId: '4399', leagueName: 'J1 League' },
};

export class TheSportsDbProvider implements IFixtureProvider {
  public readonly providerName = 'TheSportsDB';
  private baseUrl: string;
  private cache: Map<string, { data: LiveFixtureDTO[]; expiresAt: number }> = new Map();
  private cacheTtlMs = 10 * 60 * 1000; // 10 minutes

  constructor(customBaseUrl?: string) {
    this.baseUrl = customBaseUrl || 'https://www.thesportsdb.com/api/v1/json/3';
  }

  public isConfigured(): boolean {
    return process.env.ENABLE_THESPORTSDB === 'true';
  }

  public async getUpcomingFixtures(leagueIdOrTsdbId: string = '39'): Promise<ProviderResult<LiveFixtureDTO[]>> {
    const start = Date.now();
    const timestamp = new Date().toISOString();

    if (!this.isConfigured()) {
      return {
        status: 'UNCONFIGURED',
        provider: this.providerName,
        data: null,
        error: 'TheSportsDB provider is disabled by default. Set ENABLE_THESPORTSDB=true to enable.',
        latencyMs: 0,
        cached: false,
        timestamp,
      };
    }

    const mapping = THESPORTSDB_LEAGUE_MAP[leagueIdOrTsdbId] || {
      tsdbId: leagueIdOrTsdbId.length === 4 ? leagueIdOrTsdbId : '4328',
      leagueName: 'Premier League',
    };

    const cacheKey = `tsdb_next_${mapping.tsdbId}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        status: 'AVAILABLE',
        provider: this.providerName,
        data: cached.data,
        latencyMs: Date.now() - start,
        cached: true,
        timestamp,
      };
    }

    const url = `${this.baseUrl}/eventsnextleague.php?id=${mapping.tsdbId}`;

    try {
      let response: Response | null = null;
      let attempts = 0;
      const maxAttempts = 2;

      while (attempts < maxAttempts) {
        attempts++;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000);
          response = await fetch(url, {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' },
          });
          clearTimeout(timeoutId);
          if (response.ok) break;
        } catch (fetchErr) {
          if (attempts >= maxAttempts) throw fetchErr;
          await new Promise((r) => setTimeout(r, 400 * attempts));
        }
      }

      if (!response || !response.ok) {
        const status = response ? response.status : 503;
        Logger.warn(`[TheSportsDbProvider] Upstream returned HTTP ${status} for ${url}`);
        return {
          status: 'DATA_UNAVAILABLE',
          provider: this.providerName,
          data: null,
          error: `TheSportsDB returned HTTP ${status}`,
          latencyMs: Date.now() - start,
          cached: false,
          timestamp,
        };
      }

      const payload: TheSportsDbResponse = await response.json();
      const events = payload.events || [];

      const fixtures: LiveFixtureDTO[] = [];

      for (const ev of events) {
        if (!ev.strHomeTeam || !ev.strAwayTeam) continue;

        let kickoffIso = ev.strTimestamp;
        if (!kickoffIso && ev.dateEvent) {
          const time = ev.strTime || '15:00:00';
          kickoffIso = `${ev.dateEvent}T${time}Z`;
        }
        if (!kickoffIso) continue;

        const kickMs = new Date(kickoffIso).getTime();
        if (isNaN(kickMs)) continue;

        const isPostponed = ev.strPostponed === 'yes';
        const status = isPostponed ? 'POSTPONED' : 'SCHEDULED';

        const hasExplicitTime = Boolean(ev.strTimestamp || (ev.dateEvent && ev.strTime));

        fixtures.push({
          providerFixtureId: `TSDB_${ev.idEvent}`,
          league: mapping.leagueName,
          season: ev.strSeason ? ev.strSeason.split('-')[0] : '2026',
          kickoffTime: kickoffIso,
          kickoffTimeConfirmed: hasExplicitTime,
          homeTeam: ev.strHomeTeam.trim(),
          awayTeam: ev.strAwayTeam.trim(),
          venue: ev.strVenue || undefined,
          status,
          oddspapiTournamentId: ev.idAPIfootball ? Number(ev.idAPIfootball) : undefined,
        });
      }

      fixtures.sort((a, b) => new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime());

      this.cache.set(cacheKey, {
        data: fixtures,
        expiresAt: Date.now() + this.cacheTtlMs,
      });

      return {
        status: 'AVAILABLE',
        provider: this.providerName,
        data: fixtures,
        latencyMs: Date.now() - start,
        cached: false,
        timestamp,
      };
    } catch (err) {
      Logger.error('[TheSportsDbProvider] Network failure:', { error: String(err) });
      return {
        status: 'DATA_UNAVAILABLE',
        provider: this.providerName,
        data: null,
        error: `Failed to fetch TheSportsDB fixtures: ${String(err)}`,
        latencyMs: Date.now() - start,
        cached: false,
        timestamp,
      };
    }
  }

  public async getFixtureById(id: string): Promise<ProviderResult<LiveFixtureDTO | null>> {
    const timestamp = new Date().toISOString();
    return {
      status: 'AVAILABLE',
      provider: this.providerName,
      data: null,
      error: 'Single fixture lookup not implemented on community tier',
      latencyMs: 0,
      cached: false,
      timestamp,
    };
  }
}
