// SALMO.DEV — Canonical Multi-League Registry
// Single source of truth for the 15 candidate worldwide leagues across Tiers A, B, and C.
// Invariants:
// - Explicit non-boolean lifecycle states: DISCOVERY | SHADOW | ACTIVE | PAUSED | DISABLED
// - Fail-closed: Zero synthetic fixtures.
// - Supported markets strictly limited to: AH, OU, BTTS.
// - Batch size: MAX_TOURNAMENTS_PER_BATCH_REQUEST = 5 (3 batches for 15 leagues).

export type LeagueTier = 'A' | 'B' | 'C';

export type ProductionStatus = 'DISCOVERY' | 'SHADOW' | 'ACTIVE' | 'PAUSED' | 'DISABLED';

export interface MultiLeagueEntry {
  internal_league_id: string; // e.g. 'ENG-PL'
  provider_league_id: number; // API-Football ID (for historical reference)
  country: string;
  league_name: string;
  display_name: string;
  tier: LeagueTier;
  timezone: string;
  current_season: number;
  oddspapi_tournament_id: number;
  oddspapi_tournament_slug: string;
  pinnacle_availability: boolean;
  supported_ah_availability: boolean;
  supported_ou_availability: boolean;
  supported_btts_inputs: boolean;
  production_status: ProductionStatus;
}

export const MAX_TOURNAMENTS_PER_BATCH_REQUEST = 5;

export const CANONICAL_15_LEAGUES: MultiLeagueEntry[] = [
  // ─── TIER A — PRIMARY (Verified European Big 5) ───────────────────────────
  {
    internal_league_id: 'ENG-PL',
    provider_league_id: 39,
    country: 'England',
    league_name: 'Premier League',
    display_name: 'Premier League',
    tier: 'A',
    timezone: 'Europe/London',
    current_season: 2026,
    oddspapi_tournament_id: 17,
    oddspapi_tournament_slug: 'premier-league',
    pinnacle_availability: true,
    supported_ah_availability: true,
    supported_ou_availability: true,
    supported_btts_inputs: true,
    production_status: 'ACTIVE',
  },
  {
    internal_league_id: 'ESP-LALIGA',
    provider_league_id: 140,
    country: 'Spain',
    league_name: 'La Liga',
    display_name: 'La Liga',
    tier: 'A',
    timezone: 'Europe/Madrid',
    current_season: 2026,
    oddspapi_tournament_id: 8,
    oddspapi_tournament_slug: 'laliga',
    pinnacle_availability: true,
    supported_ah_availability: true,
    supported_ou_availability: true,
    supported_btts_inputs: true,
    production_status: 'ACTIVE',
  },
  {
    internal_league_id: 'ITA-SERIEA',
    provider_league_id: 135,
    country: 'Italy',
    league_name: 'Serie A',
    display_name: 'Serie A',
    tier: 'A',
    timezone: 'Europe/Rome',
    current_season: 2026,
    oddspapi_tournament_id: 23,
    oddspapi_tournament_slug: 'serie-a',
    pinnacle_availability: true,
    supported_ah_availability: true,
    supported_ou_availability: true,
    supported_btts_inputs: true,
    production_status: 'ACTIVE',
  },
  {
    internal_league_id: 'DEU-BUNDESLIGA',
    provider_league_id: 78,
    country: 'Germany',
    league_name: 'Bundesliga',
    display_name: 'Bundesliga',
    tier: 'A',
    timezone: 'Europe/Berlin',
    current_season: 2026,
    oddspapi_tournament_id: 35,
    oddspapi_tournament_slug: 'bundesliga',
    pinnacle_availability: true,
    supported_ah_availability: true,
    supported_ou_availability: true,
    supported_btts_inputs: true,
    production_status: 'ACTIVE',
  },
  {
    internal_league_id: 'FRA-LIGUE1',
    provider_league_id: 61,
    country: 'France',
    league_name: 'Ligue 1',
    display_name: 'Ligue 1',
    tier: 'A',
    timezone: 'Europe/Paris',
    current_season: 2026,
    oddspapi_tournament_id: 34,
    oddspapi_tournament_slug: 'ligue-1',
    pinnacle_availability: true,
    supported_ah_availability: true,
    supported_ou_availability: true,
    supported_btts_inputs: true,
    production_status: 'ACTIVE',
  },

  // ─── TIER B — SECONDARY EUROPE ───────────────────────────────────────────
  {
    internal_league_id: 'NED-ERE',
    provider_league_id: 88,
    country: 'Netherlands',
    league_name: 'Eredivisie',
    display_name: 'Eredivisie',
    tier: 'B',
    timezone: 'Europe/Amsterdam',
    current_season: 2026,
    oddspapi_tournament_id: 37,
    oddspapi_tournament_slug: 'eredivisie',
    pinnacle_availability: true,
    supported_ah_availability: true,
    supported_ou_availability: true,
    supported_btts_inputs: true,
    production_status: 'ACTIVE',
  },
  {
    internal_league_id: 'POR-PRIMEIRA',
    provider_league_id: 94,
    country: 'Portugal',
    league_name: 'Primeira Liga',
    display_name: 'Primeira Liga',
    tier: 'B',
    timezone: 'Europe/Lisbon',
    current_season: 2026,
    oddspapi_tournament_id: 238,
    oddspapi_tournament_slug: 'liga-portugal',
    pinnacle_availability: true,
    supported_ah_availability: true,
    supported_ou_availability: true,
    supported_btts_inputs: true,
    production_status: 'ACTIVE',
  },
  {
    internal_league_id: 'BEL-PRO',
    provider_league_id: 144,
    country: 'Belgium',
    league_name: 'Jupiler Pro League',
    display_name: 'Jupiler Pro League',
    tier: 'B',
    timezone: 'Europe/Brussels',
    current_season: 2026,
    oddspapi_tournament_id: 38,
    oddspapi_tournament_slug: 'pro-league',
    pinnacle_availability: true,
    supported_ah_availability: true,
    supported_ou_availability: true,
    supported_btts_inputs: true,
    production_status: 'ACTIVE',
  },
  {
    internal_league_id: 'SCO-PREM',
    provider_league_id: 179,
    country: 'Scotland',
    league_name: 'Premiership',
    display_name: 'Scottish Premiership',
    tier: 'B',
    timezone: 'Europe/London',
    current_season: 2026,
    oddspapi_tournament_id: 36,
    oddspapi_tournament_slug: 'premiership',
    pinnacle_availability: true,
    supported_ah_availability: true,
    supported_ou_availability: true,
    supported_btts_inputs: true,
    production_status: 'ACTIVE',
  },
  {
    internal_league_id: 'ENG-CHAMP',
    provider_league_id: 40,
    country: 'England',
    league_name: 'Championship',
    display_name: 'Championship',
    tier: 'B',
    timezone: 'Europe/London',
    current_season: 2026,
    oddspapi_tournament_id: 18,
    oddspapi_tournament_slug: 'championship',
    pinnacle_availability: true,
    supported_ah_availability: true,
    supported_ou_availability: true,
    supported_btts_inputs: true,
    production_status: 'ACTIVE',
  },

  // ─── TIER C — GLOBAL EXPANSION ───────────────────────────────────────────
  {
    internal_league_id: 'USA-MLS',
    provider_league_id: 253,
    country: 'USA',
    league_name: 'Major League Soccer',
    display_name: 'MLS',
    tier: 'C',
    timezone: 'America/New_York',
    current_season: 2026,
    oddspapi_tournament_id: 242,
    oddspapi_tournament_slug: 'mls',
    pinnacle_availability: true,
    supported_ah_availability: true,
    supported_ou_availability: true,
    supported_btts_inputs: true,
    production_status: 'ACTIVE',
  },
  {
    internal_league_id: 'SAU-PRO',
    provider_league_id: 307,
    country: 'Saudi Arabia',
    league_name: 'Pro League',
    display_name: 'Saudi Pro League',
    tier: 'C',
    timezone: 'Asia/Riyadh',
    current_season: 2026,
    oddspapi_tournament_id: 955,
    oddspapi_tournament_slug: 'saudi-pro-league',
    pinnacle_availability: true,
    supported_ah_availability: true,
    supported_ou_availability: true,
    supported_btts_inputs: true,
    production_status: 'ACTIVE',
  },
  {
    internal_league_id: 'JPN-J1',
    provider_league_id: 98,
    country: 'Japan',
    league_name: 'J1 League',
    display_name: 'J1 League',
    tier: 'C',
    timezone: 'Asia/Tokyo',
    current_season: 2027,
    oddspapi_tournament_id: 196,
    oddspapi_tournament_slug: 'jleague',
    pinnacle_availability: true,
    supported_ah_availability: true,
    supported_ou_availability: true,
    supported_btts_inputs: true,
    production_status: 'ACTIVE',
  },
  {
    internal_league_id: 'KOR-K1',
    provider_league_id: 292,
    country: 'South Korea',
    league_name: 'K League 1',
    display_name: 'K League 1',
    tier: 'C',
    timezone: 'Asia/Seoul',
    current_season: 2026,
    oddspapi_tournament_id: 410,
    oddspapi_tournament_slug: 'k-league-1',
    pinnacle_availability: true,
    supported_ah_availability: true,
    supported_ou_availability: true,
    supported_btts_inputs: true,
    production_status: 'ACTIVE',
  },
  {
    internal_league_id: 'IDN-L1',
    provider_league_id: 274,
    country: 'Indonesia',
    league_name: 'Liga 1',
    display_name: 'Liga 1 Indonesia',
    tier: 'C',
    timezone: 'Asia/Jakarta',
    current_season: 2026,
    oddspapi_tournament_id: 1015,
    oddspapi_tournament_slug: 'liga-1',
    pinnacle_availability: false,
    supported_ah_availability: false,
    supported_ou_availability: false,
    supported_btts_inputs: false,
    production_status: 'ACTIVE',
  },
];

// ─── Fast Lookups ─────────────────────────────────────────────────────────────

const BY_KEY = new Map(CANONICAL_15_LEAGUES.map((l) => [l.internal_league_id, l]));
const BY_OP_ID = new Map(CANONICAL_15_LEAGUES.map((l) => [l.oddspapi_tournament_id, l]));
const BY_NAME = new Map(CANONICAL_15_LEAGUES.map((l) => [l.league_name.toLowerCase(), l]));
const BY_SLUG = new Map(CANONICAL_15_LEAGUES.map((l) => [l.oddspapi_tournament_slug.toLowerCase(), l]));

export function getLeagueByKey(key: string): MultiLeagueEntry | undefined {
  return BY_KEY.get(key);
}

export function getLeagueByOpId(id: number): MultiLeagueEntry | undefined {
  return BY_OP_ID.get(id);
}

export function getLeagueByNameOrSlug(nameOrSlug: string): MultiLeagueEntry | undefined {
  if (!nameOrSlug) return undefined;
  const s = nameOrSlug.toLowerCase().trim();
  return BY_NAME.get(s) || BY_SLUG.get(s);
}

/**
 * Returns batches of tournament IDs chunked by MAX_TOURNAMENTS_PER_BATCH_REQUEST (5).
 */
export function getTournamentBatches(leagues: MultiLeagueEntry[] = CANONICAL_15_LEAGUES): number[][] {
  const tournamentIds = leagues
    .filter((l) => l.oddspapi_tournament_id > 0)
    .map((l) => l.oddspapi_tournament_id);

  const batches: number[][] = [];
  for (let i = 0; i < tournamentIds.length; i += MAX_TOURNAMENTS_PER_BATCH_REQUEST) {
    batches.push(tournamentIds.slice(i, i + MAX_TOURNAMENTS_PER_BATCH_REQUEST));
  }
  return batches;
}
