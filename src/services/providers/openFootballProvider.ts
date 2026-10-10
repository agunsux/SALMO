// SALMO.DEV — OpenFootball Fixture Provider
// Connects to open public domain football fixtures (openfootball/football.json on GitHub)
// License: Creative Commons Public Domain Dedication (CC0 1.0 Universal) — 100% Free & Legal Reuse
// Zero API Key required.

import { IFixtureProvider, LiveFixtureDTO, ProviderResult } from './types';
import { Logger } from '../../lib/logger';
import { normalizeTeamKey } from '../../engine/features/teamRatings';

export interface OpenFootballMatch {
  round?: string;
  date: string;
  time?: string;
  team1: string;
  team2: string;
  score?: {
    ht?: [number, number];
    ft?: [number, number];
  };
}

export interface OpenFootballPayload {
  name: string;
  matches: OpenFootballMatch[];
}

export const OPENFOOTBALL_LEAGUE_MAP: Record<string, { fileCode: string; leagueName: string; country: string }> = {
  '39': { fileCode: 'en.1', leagueName: 'Premier League', country: 'England' },
  '40': { fileCode: 'en.2', leagueName: 'Championship', country: 'England' },
  '78': { fileCode: 'de.1', leagueName: 'Bundesliga', country: 'Germany' },
  '140': { fileCode: 'es.1', leagueName: 'La Liga', country: 'Spain' },
  '61': { fileCode: 'fr.1', leagueName: 'Ligue 1', country: 'France' },
  '135': { fileCode: 'it.1', leagueName: 'Serie A', country: 'Italy' },
  '88': { fileCode: 'nl.1', leagueName: 'Eredivisie', country: 'Netherlands' },
  '94': { fileCode: 'pt.1', leagueName: 'Primeira Liga', country: 'Portugal' },
};

export class OpenFootballProvider implements IFixtureProvider {
  public readonly providerName = 'OpenFootball';
  private baseUrl: string;
  private cache: Map<string, { data: LiveFixtureDTO[]; expiresAt: number }> = new Map();
  private cacheTtlMs = 15 * 60 * 1000; // 15 minutes

  constructor(customBaseUrl?: string) {
    this.baseUrl = customBaseUrl || 'https://raw.githubusercontent.com/openfootball/football.json/master';
  }

  public isConfigured(): boolean {
    return true; // Completely free, no API key required
  }

  public async getUpcomingFixtures(leagueIdOrCode: string = '39', season: string = '2026-27'): Promise<ProviderResult<LiveFixtureDTO[]>> {
    const start = Date.now();
    const timestamp = new Date().toISOString();
    const mapping = OPENFOOTBALL_LEAGUE_MAP[leagueIdOrCode] || {
      fileCode: leagueIdOrCode.includes('.') ? leagueIdOrCode : 'en.1',
      leagueName: 'Premier League',
      country: 'England',
    };

    const cacheKey = `${season}_${mapping.fileCode}`;
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

    const url = `${this.baseUrl}/${season}/${mapping.fileCode}.json`;

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
        Logger.warn(`[OpenFootballProvider] Upstream returned HTTP ${status} for ${url}`);
        return {
          status: 'DATA_UNAVAILABLE',
          provider: this.providerName,
          data: null,
          error: `OpenFootball returned HTTP ${status} for ${mapping.fileCode}`,
          latencyMs: Date.now() - start,
          cached: false,
          timestamp,
        };
      }

      const payload: OpenFootballPayload = await response.json();
      if (!payload || !Array.isArray(payload.matches)) {
        return {
          status: 'ERROR',
          provider: this.providerName,
          data: null,
          error: 'Malformed JSON payload from OpenFootball',
          latencyMs: Date.now() - start,
          cached: false,
          timestamp,
        };
      }

      const fixtures: LiveFixtureDTO[] = [];
      const nowMs = Date.now();

      for (const m of payload.matches) {
        if (!m.date || !m.team1 || !m.team2) continue;

        const hasExplicitTime = Boolean(m.time && m.time.trim().length > 0);
        const timeStr = hasExplicitTime ? m.time!.trim() : '15:00';
        const isoKickoff = `${m.date}T${timeStr.length === 5 ? timeStr + ':00' : timeStr}Z`;
        const kickMs = new Date(isoKickoff).getTime();
        if (isNaN(kickMs)) continue;

        const isFinished = Boolean(m.score?.ft);
        const status = isFinished ? 'FINISHED' : 'SCHEDULED';

        const homeNorm = normalizeTeamKey(m.team1).toUpperCase();
        const awayNorm = normalizeTeamKey(m.team2).toUpperCase();
        const roundSlug = (m.round || 'R').replace(/[^a-zA-Z0-9]/g, '');
        const providerFixtureId = `OF_${season.replace('-', '')}_${mapping.fileCode}_${roundSlug}_${homeNorm}_${awayNorm}`;

        fixtures.push({
          providerFixtureId,
          league: mapping.leagueName,
          season: season.split('-')[0] || '2026',
          kickoffTime: isoKickoff,
          kickoffTimeConfirmed: hasExplicitTime,
          homeTeam: m.team1.replace(/\s+(FC|AFC|CF)$/i, '').trim(),
          awayTeam: m.team2.replace(/\s+(FC|AFC|CF)$/i, '').trim(),
          venue: undefined,
          status,
        });
      }

      // Sort upcoming matches chronologically
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
      Logger.error('[OpenFootballProvider] Network or parse failure:', { error: String(err) });
      return {
        status: 'DATA_UNAVAILABLE',
        provider: this.providerName,
        data: null,
        error: `Failed to fetch OpenFootball schedule: ${String(err)}`,
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
      error: 'Single fixture lookup not supported by bulk OpenFootball adapter',
      latencyMs: 0,
      cached: false,
      timestamp,
    };
  }
}
