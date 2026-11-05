// src/repositories/oddsSnapshotRepository.ts
// SALMO.DEV — Immutable Odds Snapshot Repository
// Authoritative data access layer for market quotes & point-in-time odds captures.

import { PoolClient } from 'pg';
import { executeQuery } from './dbClient';
import { Logger } from '../lib/logger';

export interface MarketSnapshotEntity {
  id: string;
  match_id: string;
  market_type: string;
  line_label: string;
  numeric_line: number;
  bookmaker: string;
  home_odds: number;
  away_odds: number;
  overround?: number | null;
  source_provider: string;
  captured_at: string;
}

export class OddsSnapshotRepository {
  /**
   * Captures an immutable point-in-time odds snapshot.
   * Throws if odds <= 1.0 or if parameters are invalid.
   */
  public static async captureSnapshot(
    snapshot: {
      matchId: string;
      marketType: 'AH' | 'OU' | 'BTTS' | 'ASIAN_HANDICAP' | 'OVER_UNDER';
      lineLabel: string;
      numericLine: number;
      bookmaker?: string;
      homeOdds: number;
      awayOdds: number;
      overround?: number;
      sourceProvider?: string;
      capturedAt?: string;
    },
    client?: PoolClient
  ): Promise<MarketSnapshotEntity> {
    if (snapshot.homeOdds <= 1.0 || snapshot.awayOdds <= 1.0) {
      throw new Error(`Invalid odds: homeOdds=${snapshot.homeOdds}, awayOdds=${snapshot.awayOdds} must be strictly > 1.0`);
    }

    const bookmaker = snapshot.bookmaker || 'pinnacle';
    const sourceProvider = snapshot.sourceProvider || 'PINNACLE';
    const capturedAt = snapshot.capturedAt || new Date().toISOString();

    const overround =
      snapshot.overround ??
      Number(((1 / snapshot.homeOdds + 1 / snapshot.awayOdds) - 1).toFixed(4));

    const sql = `
      INSERT INTO public.market_snapshots (
        id, match_id, market_type, line_label, numeric_line,
        bookmaker, home_odds, away_odds, overround, source_provider, captured_at
      ) VALUES (
        gen_random_uuid(), $1::uuid, $2, $3, $4,
        $5, $6, $7, $8, $9, $10
      )
      RETURNING *;
    `;

    const res = await executeQuery<MarketSnapshotEntity>(
      sql,
      [
        snapshot.matchId,
        snapshot.marketType,
        snapshot.lineLabel,
        snapshot.numericLine,
        bookmaker,
        snapshot.homeOdds,
        snapshot.awayOdds,
        overround,
        sourceProvider,
        capturedAt,
      ],
      client
    );

    return res.rows[0];
  }

  public static async getLatestSnapshot(
    matchId: string,
    marketType: string,
    client?: PoolClient
  ): Promise<MarketSnapshotEntity | null> {
    const res = await executeQuery<MarketSnapshotEntity>(
      `SELECT * FROM public.market_snapshots
       WHERE match_id = $1::uuid AND market_type = $2
       ORDER BY captured_at DESC
       LIMIT 1;`,
      [matchId, marketType],
      client
    );
    return res.rows[0] || null;
  }

  /**
   * Validates whether an odds snapshot is fresh (within maxAgeMinutes of reference time).
   */
  public static isSnapshotFresh(
    snapshot: MarketSnapshotEntity,
    maxAgeMinutes = 360, // 6 hours
    referenceTimeMs = Date.now()
  ): boolean {
    const capturedMs = new Date(snapshot.captured_at).getTime();
    if (!Number.isFinite(capturedMs)) return false;
    const ageMs = referenceTimeMs - capturedMs;
    return ageMs >= 0 && ageMs <= maxAgeMinutes * 60 * 1000;
  }
}
