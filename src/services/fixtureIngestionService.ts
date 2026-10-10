// SALMO.DEV — Canonical Fixture Ingestion & Entity Resolution Engine
// Integrates multi-source feeds (OpenFootball, TheSportsDB, API-Football)
// Enforces deterministic deduplication, conflict detection, and durable persistence to Supabase.
// Zero fake odds, zero fake predictions.

import { LiveFixtureDTO } from './providers/types';
import { OpenFootballProvider } from './providers/openFootballProvider';
import { FixtureIntegrityGuard } from '../lib/fixtureIntegrity';
import { normalizeTeamKey } from '../engine/features/teamRatings';
import { getDbClient } from '../lib/db';
import { Logger } from '../lib/logger';
import crypto from 'crypto';

export interface RawObservation {
  source: string;
  sourceFixtureId: string;
  league: string;
  season: string;
  homeTeam: string;
  awayTeam: string;
  kickoffTime: string;
  kickoffTimeConfirmed?: boolean;
  venue?: string;
  status: string;
  retrievedAt: string;
  crossIds?: Record<string, string | number>;
}

export interface CanonicalFixtureRecord {
  id: string; // Deterministic UUID or existing DB ID
  canonicalMatchId: string;
  league: string;
  season: string;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;
  kickoffTimeConfirmed: boolean;
  venue?: string;
  status: 'upcoming' | 'finished' | 'live' | 'postponed';
  sourceType: 'PROVIDER';
  dataStatus: 'ACTIVE';
  observations: RawObservation[];
  conflicts: Array<{
    type: 'KICKOFF_TIME_MISMATCH' | 'TEAM_NAME_DISCREPANCY' | 'STATUS_DISCREPANCY';
    detail: string;
    sources: string[];
    timestamp: string;
  }>;
}

export interface IngestionRunReport {
  timestamp: string;
  sourcesQueried: string[];
  totalObservations: number;
  canonicalFixturesCount: number;
  duplicatesCollapsed: number;
  conflictsDetected: number;
  rejectedCount: number;
  rejections: Array<{ fixtureId: string; reason: string }>;
  persistedCount: number;
  storageTarget: 'SUPABASE' | 'IN_MEMORY';
}

export class FixtureIngestionService {
  private openFootball = new OpenFootballProvider();

  public static generateDeterministicUuid(seed: string): string {
    const hash = crypto.createHash('md5').update(`SALMO_FIXTURE_${seed}`).digest('hex');
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  }

  /**
   * Performs multi-source ingestion for candidate leagues.
   */
  public async ingestLeagues(leagueIds: string[] = ['39']): Promise<IngestionRunReport> {
    const timestamp = new Date().toISOString();
    const rawObservations: RawObservation[] = [];
    const sourcesQueried: string[] = ['OpenFootball'];

    // 1. Fetch from OpenFootball
    for (const lid of leagueIds) {
      try {
        const res = await this.openFootball.getUpcomingFixtures(lid);
        if (res.status === 'AVAILABLE' && res.data) {
          for (const f of res.data) {
            rawObservations.push({
              source: 'OpenFootball',
              sourceFixtureId: f.providerFixtureId,
              league: f.league,
              season: f.season,
              homeTeam: f.homeTeam,
              awayTeam: f.awayTeam,
              kickoffTime: f.kickoffTime,
              kickoffTimeConfirmed: f.kickoffTimeConfirmed ?? false,
              venue: f.venue,
              status: f.status,
              retrievedAt: timestamp,
            });
          }
        }
      } catch (err) {
        Logger.warn('[FixtureIngestionService] OpenFootball fetch failed for league:', { lid, error: String(err) });
      }
    }

    return this.processAndPersistObservations(rawObservations, sourcesQueried);
  }

  /**
   * Deterministically processes raw observations, performs entity resolution,
   * detects conflicts, collapses duplicates, and persists canonical fixtures.
   */
  public async processAndPersistObservations(
    observations: RawObservation[],
    sourcesQueried: string[] = ['MANUAL_FEED']
  ): Promise<IngestionRunReport> {
    const timestamp = new Date().toISOString();

    // 1. Validate biological integrity
    const candidates = observations.map(obs => ({
      providerFixtureId: `${obs.source}_${obs.sourceFixtureId}`,
      league: obs.league,
      season: obs.season,
      kickoffTime: obs.kickoffTime,
      homeTeam: obs.homeTeam,
      awayTeam: obs.awayTeam,
      venue: obs.venue,
      status: obs.status,
    }));

    const valResult = FixtureIntegrityGuard.validateFixtureBatch(candidates, { rejectStale: false });

    // 2. Entity Resolution & Merging across sources
    const canonicalMap = new Map<string, CanonicalFixtureRecord>();
    let conflictsCount = 0;

    for (const obs of observations) {
      const homeNorm = normalizeTeamKey(obs.homeTeam).toUpperCase();
      const awayNorm = normalizeTeamKey(obs.awayTeam).toUpperCase();
      if (!homeNorm || !awayNorm || homeNorm === awayNorm) continue;

      const dateStr = obs.kickoffTime.slice(0, 10);
      const prefix = FixtureIntegrityGuard.resolveLeaguePrefix(obs.league);
      const seasonStr = obs.season || '2026';

      // Primary entity matching key: prefix + season + homeNorm + awayNorm + date
      const entityKey = `${prefix}_${seasonStr}_${homeNorm}_${awayNorm}_${dateStr}`;

      // Cross-provider ID matching key (if apiFootballId exists)
      const apiFbKey = obs.crossIds?.apiFootballId ? `APIFB_${obs.crossIds.apiFootballId}` : null;

      let matchedRecord: CanonicalFixtureRecord | undefined;

      if (canonicalMap.has(entityKey)) {
        matchedRecord = canonicalMap.get(entityKey);
      } else if (apiFbKey && canonicalMap.has(apiFbKey)) {
        matchedRecord = canonicalMap.get(apiFbKey);
      } else {
        // Look for proximity match (+- 24 hours) for rescheduled matches or timezone offsets
        const obsMs = new Date(obs.kickoffTime).getTime();
        for (const record of canonicalMap.values()) {
          const recHomeNorm = normalizeTeamKey(record.homeTeam).toUpperCase();
          const recAwayNorm = normalizeTeamKey(record.awayTeam).toUpperCase();
          const recPrefix = FixtureIntegrityGuard.resolveLeaguePrefix(record.league);

          if (recPrefix === prefix && recHomeNorm === homeNorm && recAwayNorm === awayNorm) {
            const recMs = new Date(record.kickoffUtc).getTime();
            if (Math.abs(obsMs - recMs) <= 36 * 3600 * 1000) {
              matchedRecord = record;
              break;
            }
          }
        }
      }

      if (matchedRecord) {
        // MERGE: Already observed from another source
        matchedRecord.observations.push(obs);

        // Upgrade unconfirmed kickoff time if confirmed time arrives
        if (obs.kickoffTimeConfirmed && !matchedRecord.kickoffTimeConfirmed) {
          matchedRecord.kickoffUtc = obs.kickoffTime;
          matchedRecord.kickoffTimeConfirmed = true;
        }

        // Check for Kickoff Conflict (> 2 hours discrepancy)
        const t1 = new Date(matchedRecord.kickoffUtc).getTime();
        const t2 = new Date(obs.kickoffTime).getTime();
        const diffHours = Math.abs(t1 - t2) / (1000 * 60 * 60);

        if (diffHours > 2) {
          conflictsCount++;
          matchedRecord.conflicts.push({
            type: 'KICKOFF_TIME_MISMATCH',
            detail: `Kickoff time difference of ${diffHours.toFixed(1)}h between ${matchedRecord.observations[0].source} (${matchedRecord.kickoffUtc}) and ${obs.source} (${obs.kickoffTime})`,
            sources: [matchedRecord.observations[0].source, obs.source],
            timestamp,
          });

          // Source Priority Policy: Prefer explicit kickoff time over default 15:00:00
          if (matchedRecord.kickoffUtc.includes('15:00:00') && !obs.kickoffTime.includes('15:00:00')) {
            matchedRecord.kickoffUtc = obs.kickoffTime;
          }
        }

        // Venue enrichment
        if (!matchedRecord.venue && obs.venue) {
          matchedRecord.venue = obs.venue;
        }
      } else {
        // NEW CANONICAL RECORD
        const canonicalId = FixtureIntegrityGuard.buildCanonicalMatchId(
          obs.league,
          seasonStr,
          obs.homeTeam,
          obs.awayTeam,
          obs.kickoffTime
        );

        const uuid = FixtureIngestionService.generateDeterministicUuid(canonicalId);

        let status: 'upcoming' | 'finished' | 'live' | 'postponed' = 'upcoming';
        if (obs.status === 'FINISHED' || obs.status === 'FT') status = 'finished';
        else if (obs.status === 'POSTPONED') status = 'postponed';
        else if (obs.status === 'LIVE' || obs.status === '1H' || obs.status === '2H') status = 'live';

        const record: CanonicalFixtureRecord = {
          id: uuid,
          canonicalMatchId: canonicalId,
          league: obs.league,
          season: seasonStr,
          homeTeam: obs.homeTeam,
          awayTeam: obs.awayTeam,
          kickoffUtc: obs.kickoffTime,
          kickoffTimeConfirmed: obs.kickoffTimeConfirmed ?? false,
          venue: obs.venue,
          status,
          sourceType: 'PROVIDER',
          dataStatus: 'ACTIVE',
          observations: [obs],
          conflicts: [],
        };

        canonicalMap.set(entityKey, record);
        if (apiFbKey) canonicalMap.set(apiFbKey, record);
      }
    }

    const canonicalRecords = Array.from(new Set(canonicalMap.values()));
    const duplicatesCollapsed = observations.length - canonicalRecords.length;

    // 3. Persist to Supabase matches table
    let persistedCount = 0;
    let storageTarget: 'SUPABASE' | 'IN_MEMORY' = 'IN_MEMORY';

    try {
      const sb = getDbClient();
      if (sb && canonicalRecords.length > 0) {
        const rowsToUpsert = canonicalRecords.map(r => ({
          id: r.id,
          home_team: r.homeTeam,
          away_team: r.awayTeam,
          league: r.league,
          kickoff: r.kickoffUtc,
          status: r.status,
          home_goals: null,
          away_goals: null,
          source_type: r.sourceType,
          data_status: r.dataStatus,
          pipeline_state: 'CREATED',
          pipeline_mode: 'LIVE',
          pipeline_metadata: {
            canonicalMatchId: r.canonicalMatchId,
            kickoffTimeConfirmed: r.kickoffTimeConfirmed,
            observationsCount: r.observations.length,
            sources: r.observations.map(o => o.source),
            conflicts: r.conflicts,
            lastIngestedAt: timestamp,
          },
          updated_at: timestamp,
        }));

        const { error } = await sb.from('matches').upsert(rowsToUpsert, { onConflict: 'id' });
        if (!error) {
          persistedCount = rowsToUpsert.length;
          storageTarget = 'SUPABASE';
          Logger.info(`[FixtureIngestionService] Persisted ${persistedCount} canonical fixtures to Supabase.`);
        } else {
          Logger.warn('[FixtureIngestionService] Supabase upsert error:', { error: error.message });
        }
      }
    } catch (dbErr) {
      Logger.warn('[FixtureIngestionService] Could not persist to database:', { error: String(dbErr) });
    }

    return {
      timestamp,
      sourcesQueried,
      totalObservations: observations.length,
      canonicalFixturesCount: canonicalRecords.length,
      duplicatesCollapsed,
      conflictsDetected: conflictsCount,
      rejectedCount: valResult.rejectedCount,
      rejections: valResult.rejections,
      persistedCount,
      storageTarget,
    };
  }
}
