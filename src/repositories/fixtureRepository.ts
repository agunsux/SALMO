// src/repositories/fixtureRepository.ts
// SALMO.DEV — Canonical Fixture Repository
// Authoritative data access layer for canonical matches archive.

import { PoolClient } from 'pg';
import { executeQuery } from './dbClient';
import { Logger } from '../lib/logger';

export interface CanonicalFixtureEntity {
  id: string;
  canonical_match_id: string;
  league: string;
  season: string;
  kickoff: string;
  kickoff_time?: string;
  home_team: string;
  away_team: string;
  venue?: string;
  status: 'upcoming' | 'finished' | 'live' | 'postponed';
  home_goals?: number | null;
  away_goals?: number | null;
  data_status: 'ACTIVE' | 'QUARANTINED' | 'SHADOW';
  source_type: 'PROVIDER' | 'SYNTHETIC_FALLBACK';
  pipeline_metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export class FixtureRepository {
  /**
   * Inserts or updates a canonical fixture idempotently.
   */
  public static async saveFixture(
    fixture: {
      id?: string;
      canonicalMatchId: string;
      league: string;
      season: string;
      kickoff: string;
      homeTeam: string;
      awayTeam: string;
      venue?: string;
      status?: 'upcoming' | 'finished' | 'live' | 'postponed';
      homeGoals?: number | null;
      awayGoals?: number | null;
      dataStatus?: 'ACTIVE' | 'QUARANTINED' | 'SHADOW';
      sourceType?: 'PROVIDER' | 'SYNTHETIC_FALLBACK';
      metadata?: Record<string, any>;
    },
    client?: PoolClient
  ): Promise<CanonicalFixtureEntity> {
    const status = fixture.status || 'upcoming';
    const dataStatus = fixture.dataStatus || 'ACTIVE';
    const sourceType = fixture.sourceType || 'PROVIDER';
    const metadata = fixture.metadata || {};

    const sql = `
      INSERT INTO public.matches (
        id, canonical_match_id, league, season, kickoff, kickoff_time,
        home_team, away_team, venue, status, home_goals, away_goals,
        data_status, source_type, pipeline_metadata, updated_at
      ) VALUES (
        COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $5,
        $6, $7, $8, $9, $10, $11,
        $12, $13, $14, NOW()
      )
      ON CONFLICT (canonical_match_id) DO UPDATE SET
        kickoff = EXCLUDED.kickoff,
        kickoff_time = EXCLUDED.kickoff_time,
        venue = COALESCE(EXCLUDED.venue, public.matches.venue),
        status = EXCLUDED.status,
        home_goals = COALESCE(EXCLUDED.home_goals, public.matches.home_goals),
        away_goals = COALESCE(EXCLUDED.away_goals, public.matches.away_goals),
        pipeline_metadata = public.matches.pipeline_metadata || EXCLUDED.pipeline_metadata,
        updated_at = NOW()
      RETURNING *;
    `;

    const res = await executeQuery<CanonicalFixtureEntity>(
      sql,
      [
        fixture.id || null,
        fixture.canonicalMatchId,
        fixture.league,
        fixture.season,
        fixture.kickoff,
        fixture.homeTeam,
        fixture.awayTeam,
        fixture.venue || null,
        status,
        fixture.homeGoals ?? null,
        fixture.awayGoals ?? null,
        dataStatus,
        sourceType,
        JSON.stringify(metadata),
      ],
      client
    );

    return res.rows[0];
  }

  public static async getFixtureById(id: string, client?: PoolClient): Promise<CanonicalFixtureEntity | null> {
    const res = await executeQuery<CanonicalFixtureEntity>(
      'SELECT * FROM public.matches WHERE id = $1::uuid LIMIT 1;',
      [id],
      client
    );
    return res.rows[0] || null;
  }

  public static async getFixtureByCanonicalId(canonicalId: string, client?: PoolClient): Promise<CanonicalFixtureEntity | null> {
    const res = await executeQuery<CanonicalFixtureEntity>(
      'SELECT * FROM public.matches WHERE canonical_match_id = $1 LIMIT 1;',
      [canonicalId],
      client
    );
    return res.rows[0] || null;
  }

  public static async updateFixtureScoreAndStatus(
    id: string,
    status: 'upcoming' | 'finished' | 'live' | 'postponed',
    homeGoals: number | null,
    awayGoals: number | null,
    client?: PoolClient
  ): Promise<CanonicalFixtureEntity | null> {
    const res = await executeQuery<CanonicalFixtureEntity>(
      `UPDATE public.matches
       SET status = $2, home_goals = $3, away_goals = $4, updated_at = NOW()
       WHERE id = $1::uuid
       RETURNING *;`,
      [id, status, homeGoals, awayGoals],
      client
    );
    return res.rows[0] || null;
  }

  public static async getUpcomingFixtures(
    horizonHours = 336, // 14 days default
    client?: PoolClient
  ): Promise<CanonicalFixtureEntity[]> {
    const res = await executeQuery<CanonicalFixtureEntity>(
      `SELECT * FROM public.matches
       WHERE status = 'upcoming'
         AND kickoff >= NOW()
         AND kickoff <= NOW() + ($1 || ' hours')::interval
         AND data_status = 'ACTIVE'
       ORDER BY kickoff ASC;`,
      [horizonHours],
      client
    );
    return res.rows;
  }
}
