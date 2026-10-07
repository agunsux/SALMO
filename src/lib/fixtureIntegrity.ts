// SALMO.DEV — Fixture Integrity & Biological Validation Layer
// Hard validation layer preventing impossible matchweek counts, duplicate teams,
// self-play fixtures (home == away), or provider alias corruptions.

import { normalizeTeamKey } from '../engine/features/teamRatings';
import { Logger } from './logger';

export interface RawFixtureCandidate {
  providerFixtureId: string;
  league: string;
  season?: string;
  kickoffTime: string;
  homeTeam: string;
  awayTeam: string;
  venue?: string;
  status?: string;
}

export interface ValidatedFixtureResult<T extends RawFixtureCandidate> {
  validFixtures: T[];
  rejectedCount: number;
  rejections: Array<{
    fixtureId: string;
    reason: string;
  }>;
}

export class FixtureIntegrityGuard {
  /**
   * Resolves canonical league code for ID construction without EPL contamination.
   */
  public static resolveLeaguePrefix(leagueName: string): string {
    const norm = (leagueName || '').toLowerCase().trim();
    if (norm.includes('premier league') || norm === 'epl') return 'EPL';
    if (norm.includes('la liga') || norm.includes('laliga')) return 'LALIGA';
    if (norm.includes('serie a')) return 'SERIEA';
    if (norm.includes('bundesliga')) return 'BUNDESLIGA';
    if (norm.includes('ligue 1')) return 'LIGUE1';
    if (norm.includes('eredivisie')) return 'EREDIVISIE';
    if (norm.includes('primeira')) return 'PRIMEIRA';
    if (norm.includes('pro league')) return 'BELPRO';
    if (norm.includes('premiership')) return 'SCOPREM';
    if (norm.includes('championship')) return 'ENGCHAMP';
    if (norm.includes('mls')) return 'MLS';
    if (norm.includes('saudi')) return 'SAUPRO';
    if (norm.includes('j1') || norm.includes('jleague')) return 'J1';
    if (norm.includes('k league') || norm.includes('k1')) return 'K1';
    if (norm.includes('liga 1') || norm.includes('indonesia')) return 'IDNL1';
    return norm.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'LEAGUE';
  }

  /**
   * Generates clean canonical match ID without EPL-only contamination.
   */
  public static buildCanonicalMatchId(
    league: string,
    season: string | number,
    homeTeam: string,
    awayTeam: string,
    kickoffUtc: string
  ): string {
    const prefix = this.resolveLeaguePrefix(league);
    const h = normalizeTeamKey(homeTeam).toUpperCase();
    const a = normalizeTeamKey(awayTeam).toUpperCase();
    const date = kickoffUtc ? kickoffUtc.slice(0, 10) : '';
    return `${prefix}_${season}_${h}_${a}_${date}`;
  }

  /**
   * Validates a batch of raw fixture candidates against mathematical and domain invariants:
   * 1. Home team != Away team (Zero self-play)
   * 2. Valid kickoff timestamp
   * 3. No duplicate provider fixture IDs
   * 4. No duplicate canonical match IDs
   * 5. No team playing twice on the exact same date
   */
  public static validateFixtureBatch<T extends RawFixtureCandidate>(
    candidates: T[],
    options: { rejectStale?: boolean; nowMs?: number } = {}
  ): ValidatedFixtureResult<T> {
    const validFixtures: T[] = [];
    const rejections: Array<{ fixtureId: string; reason: string }> = [];

    const seenProviderIds = new Set<string>();
    const seenCanonicalIds = new Set<string>();
    const teamDateUsage = new Set<string>();

    const nowMs = options.nowMs ?? Date.now();

    for (const f of candidates) {
      const fId = String(f.providerFixtureId || '');

      // 1. Provider ID presence
      if (!fId) {
        rejections.push({ fixtureId: 'UNKNOWN', reason: 'Missing provider fixture ID' });
        continue;
      }

      // 2. Duplicate provider ID
      if (seenProviderIds.has(fId)) {
        rejections.push({ fixtureId: fId, reason: `Duplicate provider fixture ID: ${fId}` });
        continue;
      }

      // 3. Home vs Away Identity (Self-play guard)
      const homeNorm = normalizeTeamKey(f.homeTeam);
      const awayNorm = normalizeTeamKey(f.awayTeam);
      if (homeNorm === awayNorm || !homeNorm || !awayNorm) {
        rejections.push({ fixtureId: fId, reason: `Invalid team pair: ${f.homeTeam} vs ${f.awayTeam}` });
        continue;
      }

      // 4. Kickoff Validity
      const kickoffMs = new Date(f.kickoffTime).getTime();
      if (isNaN(kickoffMs)) {
        rejections.push({ fixtureId: fId, reason: `Unparseable kickoff time: ${f.kickoffTime}` });
        continue;
      }

      if (options.rejectStale && kickoffMs <= nowMs) {
        rejections.push({ fixtureId: fId, reason: `Stale kickoff in past: ${f.kickoffTime}` });
        continue;
      }

      // 5. Canonical ID deduplication
      const dateStr = f.kickoffTime.slice(0, 10);
      const seasonStr = f.season || '2026';
      const canonicalId = this.buildCanonicalMatchId(f.league, seasonStr, f.homeTeam, f.awayTeam, f.kickoffTime);

      if (seenCanonicalIds.has(canonicalId)) {
        rejections.push({ fixtureId: fId, reason: `Duplicate canonical match ID: ${canonicalId}` });
        continue;
      }

      // 6. Biological Team-Date collision check (Same team playing 2 matches on same date)
      const homeDateKey = `${homeNorm}_${dateStr}`;
      const awayDateKey = `${awayNorm}_${dateStr}`;
      if (teamDateUsage.has(homeDateKey) || teamDateUsage.has(awayDateKey)) {
        rejections.push({
          fixtureId: fId,
          reason: `Impossible match schedule: team already scheduled on date ${dateStr}`,
        });
        continue;
      }

      // Register pass
      seenProviderIds.add(fId);
      seenCanonicalIds.add(canonicalId);
      teamDateUsage.add(homeDateKey);
      teamDateUsage.add(awayDateKey);
      validFixtures.push(f);
    }

    if (rejections.length > 0) {
      Logger.warn(`[FixtureIntegrityGuard] Rejected ${rejections.length} invalid fixtures`, { rejections });
    }

    return {
      validFixtures,
      rejectedCount: rejections.length,
      rejections,
    };
  }
}
