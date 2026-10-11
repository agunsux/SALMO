// SALMO.DEV — Canonical Multi-League Registry
// Single source of truth for the 15 candidate worldwide leagues across Tiers A, B, and C.
// Invariants:
// - Explicit non-boolean lifecycle states: DISCOVERY | SHADOW | ACTIVE | PAUSED | DISABLED
// - Independent capability flags per league (fixture_enabled, odds_enabled, ah_research_enabled,
//   ou_research_enabled, ah_prediction_enabled, ou_prediction_enabled, model_ready, production_pick_enabled)
// - Fail-closed: Zero synthetic fixtures, zero shadow picks promoted to PRODUCTION without meeting thresholds.
// - Supported markets strictly limited to: AH, OU, BTTS.
// - Batch size: MAX_TOURNAMENTS_PER_BATCH_REQUEST = 5 (3 batches for 15 leagues).

export type LeagueTier = 'A' | 'B' | 'C';

export type ProductionStatus = 'DISCOVERY' | 'SHADOW' | 'ACTIVE' | 'PAUSED' | 'DISABLED';

export type LedgerTier = 'PRODUCTION' | 'SHADOW' | 'NONE';

export type MarketKey = 'AH' | 'OU';

export type MarketReadinessState =
  | 'ACTIVE'
  | 'READY_FOR_PRODUCTION'
  | 'BLOCKED_QUOTA'
  | 'BLOCKED_ODDS'
  | 'BLOCKED_MISSING_ODDS'
  | 'BLOCKED_MODEL_VALIDATION'
  | 'BLOCKED_DATA_QUALITY'
  | 'BLOCKED_DATA_INTEGRITY'
  | 'BLOCKED_COLD_START'
  | 'RESEARCH_ONLY'
  | 'PAUSED_MISSING_BASELINE';

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
  ledger_tier: LedgerTier;
  model_version: string;
  fixture_enabled: boolean;
  odds_enabled: boolean;
  ah_research_enabled: boolean;
  ou_research_enabled: boolean;
  ah_prediction_enabled: boolean;
  ou_prediction_enabled: boolean;
  model_ready: boolean;
  production_pick_enabled: boolean;
  validated_markets?: MarketKey[];
  production_enabled_markets?: MarketKey[];
  activation_priority?: number;
  market_readiness?: { AH: MarketReadinessState; OU: MarketReadinessState };
  market_blockers?: { AH: string | null; OU: string | null };
  last_activation_check_at?: string | null;
  activation_reason?: string | null;
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
    ledger_tier: 'PRODUCTION',
    model_version: 'dixon-coles-v1.0',
    fixture_enabled: true,
    odds_enabled: true,
    ah_research_enabled: true,
    ou_research_enabled: true,
    ah_prediction_enabled: true,
    ou_prediction_enabled: true,
    model_ready: true,
    production_pick_enabled: true,
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
    production_status: 'SHADOW',
    ledger_tier: 'SHADOW',
    model_version: 'dixon-coles-esp-laliga-2026-10-11',
    fixture_enabled: true,
    odds_enabled: false,
    ah_research_enabled: true,
    ou_research_enabled: true,
    ah_prediction_enabled: true,
    ou_prediction_enabled: true,
    model_ready: true,
    production_pick_enabled: false,
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
    production_status: 'SHADOW',
    ledger_tier: 'SHADOW',
    model_version: 'dixon-coles-ita-seriea-2026-10-11',
    fixture_enabled: true,
    odds_enabled: false,
    ah_research_enabled: true,
    ou_research_enabled: true,
    ah_prediction_enabled: true,
    ou_prediction_enabled: true,
    model_ready: true,
    production_pick_enabled: false,
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
    production_status: 'SHADOW',
    ledger_tier: 'SHADOW',
    model_version: 'dixon-coles-deu-bundesliga-2026-10-11',
    fixture_enabled: true,
    odds_enabled: false,
    ah_research_enabled: true,
    ou_research_enabled: true,
    ah_prediction_enabled: true,
    ou_prediction_enabled: true,
    model_ready: true,
    production_pick_enabled: false,
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
    production_status: 'SHADOW',
    ledger_tier: 'SHADOW',
    model_version: 'dixon-coles-fra-ligue1-2026-10-11',
    fixture_enabled: true,
    odds_enabled: false,
    ah_research_enabled: true,
    ou_research_enabled: true,
    ah_prediction_enabled: true,
    ou_prediction_enabled: true,
    model_ready: true,
    production_pick_enabled: false,
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
    production_status: 'SHADOW',
    ledger_tier: 'SHADOW',
    model_version: 'dixon-coles-ned-ere-2026-10-11',
    fixture_enabled: true,
    odds_enabled: false,
    ah_research_enabled: true,
    ou_research_enabled: true,
    ah_prediction_enabled: true,
    ou_prediction_enabled: true,
    model_ready: true,
    production_pick_enabled: false,
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
    production_status: 'SHADOW',
    ledger_tier: 'SHADOW',
    model_version: 'dixon-coles-por-primeira-2026-10-11',
    fixture_enabled: true,
    odds_enabled: false,
    ah_research_enabled: true,
    ou_research_enabled: true,
    ah_prediction_enabled: true,
    ou_prediction_enabled: true,
    model_ready: true,
    production_pick_enabled: false,
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
    production_status: 'SHADOW',
    ledger_tier: 'SHADOW',
    model_version: 'dixon-coles-bel-pro-2026-10-11',
    fixture_enabled: true,
    odds_enabled: false,
    ah_research_enabled: true,
    ou_research_enabled: true,
    ah_prediction_enabled: true,
    ou_prediction_enabled: true,
    model_ready: true,
    production_pick_enabled: false,
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
    production_status: 'SHADOW',
    ledger_tier: 'SHADOW',
    model_version: 'dixon-coles-sco-prem-2026-10-11',
    fixture_enabled: true,
    odds_enabled: false,
    ah_research_enabled: true,
    ou_research_enabled: true,
    ah_prediction_enabled: true,
    ou_prediction_enabled: true,
    model_ready: true,
    production_pick_enabled: false,
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
    production_status: 'SHADOW',
    ledger_tier: 'SHADOW',
    model_version: 'dixon-coles-eng-champ-2026-10-11',
    fixture_enabled: true,
    odds_enabled: false,
    ah_research_enabled: true,
    ou_research_enabled: true,
    ah_prediction_enabled: true,
    ou_prediction_enabled: true,
    model_ready: true,
    production_pick_enabled: false,
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
    production_status: 'SHADOW',
    ledger_tier: 'SHADOW',
    model_version: 'dixon-coles-usa-mls-2026-10-11',
    fixture_enabled: true,
    odds_enabled: false,
    ah_research_enabled: true,
    ou_research_enabled: true,
    ah_prediction_enabled: true,
    ou_prediction_enabled: true,
    model_ready: true,
    production_pick_enabled: false,
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
    production_status: 'SHADOW',
    ledger_tier: 'SHADOW',
    model_version: 'dixon-coles-sau-pro-2026-10-11',
    fixture_enabled: true,
    odds_enabled: false,
    ah_research_enabled: true,
    ou_research_enabled: true,
    ah_prediction_enabled: true,
    ou_prediction_enabled: true,
    model_ready: true,
    production_pick_enabled: false,
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
    production_status: 'SHADOW',
    ledger_tier: 'SHADOW',
    model_version: 'dixon-coles-jpn-j1-2026-10-11',
    fixture_enabled: true,
    odds_enabled: false,
    ah_research_enabled: true,
    ou_research_enabled: true,
    ah_prediction_enabled: true,
    ou_prediction_enabled: true,
    model_ready: true,
    production_pick_enabled: false,
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
    production_status: 'SHADOW',
    ledger_tier: 'SHADOW',
    model_version: 'dixon-coles-kor-k1-2026-10-11',
    fixture_enabled: true,
    odds_enabled: false,
    ah_research_enabled: true,
    ou_research_enabled: true,
    ah_prediction_enabled: true,
    ou_prediction_enabled: true,
    model_ready: true,
    production_pick_enabled: false,
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
    production_status: 'PAUSED',
    ledger_tier: 'NONE',
    model_version: 'dixon-coles-idn-l1-uncalibrated',
    fixture_enabled: true,
    odds_enabled: false,
    ah_research_enabled: true,
    ou_research_enabled: true,
    ah_prediction_enabled: false,
    ou_prediction_enabled: false,
    model_ready: false,
    production_pick_enabled: false,
  },
];

// ─── Default Market Readiness & Blocker Matrix ────────────────────────────────

const DEFAULT_LEAGUE_READINESS_MAP: Record<
  string,
  {
    validated_markets: MarketKey[];
    production_enabled_markets: MarketKey[];
    activation_priority: number;
    market_readiness: { AH: MarketReadinessState; OU: MarketReadinessState };
    market_blockers: { AH: string | null; OU: string | null };
  }
> = {
  'ENG-PL': {
    validated_markets: ['AH', 'OU'],
    production_enabled_markets: ['AH', 'OU'],
    activation_priority: 1,
    market_readiness: { AH: 'READY_FOR_PRODUCTION', OU: 'READY_FOR_PRODUCTION' },
    market_blockers: { AH: null, OU: null },
  },
  'ESP-LALIGA': {
    validated_markets: ['AH', 'OU'],
    production_enabled_markets: [],
    activation_priority: 2,
    market_readiness: { AH: 'BLOCKED_MISSING_ODDS', OU: 'BLOCKED_MISSING_ODDS' },
    market_blockers: {
      AH: 'BLOCKED_MISSING_ODDS: Awaiting verified live Pinnacle AH odds post quota reset',
      OU: 'BLOCKED_MISSING_ODDS: Awaiting verified live Pinnacle OU odds post quota reset',
    },
  },
  'DEU-BUNDESLIGA': {
    validated_markets: ['AH', 'OU'],
    production_enabled_markets: [],
    activation_priority: 3,
    market_readiness: { AH: 'BLOCKED_MISSING_ODDS', OU: 'BLOCKED_MISSING_ODDS' },
    market_blockers: {
      AH: 'BLOCKED_MISSING_ODDS: Awaiting verified live Pinnacle AH odds post quota reset',
      OU: 'BLOCKED_MISSING_ODDS: Awaiting verified live Pinnacle OU odds post quota reset',
    },
  },
  'FRA-LIGUE1': {
    validated_markets: ['AH', 'OU'],
    production_enabled_markets: [],
    activation_priority: 4,
    market_readiness: { AH: 'BLOCKED_MISSING_ODDS', OU: 'BLOCKED_MISSING_ODDS' },
    market_blockers: {
      AH: 'BLOCKED_MISSING_ODDS: Awaiting verified live Pinnacle AH odds post quota reset',
      OU: 'BLOCKED_MISSING_ODDS: Awaiting verified live Pinnacle OU odds post quota reset',
    },
  },
  'NED-ERE': {
    validated_markets: ['AH', 'OU'],
    production_enabled_markets: [],
    activation_priority: 5,
    market_readiness: { AH: 'BLOCKED_MISSING_ODDS', OU: 'BLOCKED_MISSING_ODDS' },
    market_blockers: {
      AH: 'BLOCKED_MISSING_ODDS: Awaiting verified live Pinnacle AH odds post quota reset',
      OU: 'BLOCKED_MISSING_ODDS: Awaiting verified live Pinnacle OU odds post quota reset',
    },
  },
  'POR-PRIMEIRA': {
    validated_markets: ['AH', 'OU'],
    production_enabled_markets: [],
    activation_priority: 6,
    market_readiness: { AH: 'BLOCKED_MISSING_ODDS', OU: 'BLOCKED_MISSING_ODDS' },
    market_blockers: {
      AH: 'BLOCKED_MISSING_ODDS: Awaiting verified live Pinnacle AH odds post quota reset',
      OU: 'BLOCKED_MISSING_ODDS: Awaiting verified live Pinnacle OU odds post quota reset',
    },
  },
  'ITA-SERIEA': {
    validated_markets: ['AH'],
    production_enabled_markets: [],
    activation_priority: 7,
    market_readiness: { AH: 'BLOCKED_MISSING_ODDS', OU: 'BLOCKED_MODEL_VALIDATION' },
    market_blockers: {
      AH: 'BLOCKED_MISSING_ODDS: Awaiting verified live Pinnacle AH odds post quota reset',
      OU: 'BLOCKED_MODEL_VALIDATION: OU Brier=0.2577 (>0.2500), calibrationSlope=0.1719 (<0.50)',
    },
  },
  'BEL-PRO': {
    validated_markets: ['AH'],
    production_enabled_markets: [],
    activation_priority: 8,
    market_readiness: { AH: 'BLOCKED_MISSING_ODDS', OU: 'BLOCKED_MODEL_VALIDATION' },
    market_blockers: {
      AH: 'BLOCKED_MISSING_ODDS: Awaiting verified live Pinnacle AH odds post quota reset',
      OU: 'BLOCKED_MODEL_VALIDATION: OU Brier=0.2631 (>0.2500), calibrationSlope=0.0206 (<0.50)',
    },
  },
  'SCO-PREM': {
    validated_markets: [],
    production_enabled_markets: [],
    activation_priority: 9,
    market_readiness: { AH: 'RESEARCH_ONLY', OU: 'RESEARCH_ONLY' },
    market_blockers: {
      AH: 'RESEARCH_ONLY: Evaluation sample nEval=210 (<300) and promoted team Falkirk n=5',
      OU: 'RESEARCH_ONLY: Evaluation sample nEval=210 (<300) and promoted team Falkirk n=5',
    },
  },
  'SAU-PRO': {
    validated_markets: [],
    production_enabled_markets: [],
    activation_priority: 10,
    market_readiness: { AH: 'RESEARCH_ONLY', OU: 'BLOCKED_MODEL_VALIDATION' },
    market_blockers: {
      AH: 'RESEARCH_ONLY: 2 newly promoted clubs (Neom, Al Najma) have n=7 matches',
      OU: 'BLOCKED_MODEL_VALIDATION: OU Brier=0.2547 (>0.2500), calibrationSlope=0.1790 (<0.50)',
    },
  },
  'ENG-CHAMP': {
    validated_markets: [],
    production_enabled_markets: [],
    activation_priority: 11,
    market_readiness: { AH: 'BLOCKED_DATA_INTEGRITY', OU: 'BLOCKED_MODEL_VALIDATION' },
    market_blockers: {
      AH: 'BLOCKED_DATA_INTEGRITY: 6 active relegated/promoted clubs have matches_played=0 (COLD_START)',
      OU: 'BLOCKED_MODEL_VALIDATION: OU Brier=0.2534 (>0.2500), calibrationSlope=0.3368 (<0.50) + 6 COLD_START teams',
    },
  },
  'JPN-J1': {
    validated_markets: [],
    production_enabled_markets: [],
    activation_priority: 12,
    market_readiness: { AH: 'BLOCKED_DATA_INTEGRITY', OU: 'BLOCKED_DATA_INTEGRITY' },
    market_blockers: {
      AH: 'BLOCKED_DATA_INTEGRITY: Missing 2026 season matches after 2025-12-06 and 3 promoted teams with matches_played=0',
      OU: 'BLOCKED_DATA_INTEGRITY: Missing 2026 season matches after 2025-12-06 and 3 promoted teams with matches_played=0',
    },
  },
  'KOR-K1': {
    validated_markets: [],
    production_enabled_markets: [],
    activation_priority: 13,
    market_readiness: { AH: 'BLOCKED_DATA_INTEGRITY', OU: 'BLOCKED_MODEL_VALIDATION' },
    market_blockers: {
      AH: 'BLOCKED_DATA_INTEGRITY: 4 active clubs have matches_played=2 (COLD_START) and nEval=208 (<300)',
      OU: 'BLOCKED_MODEL_VALIDATION: OU Brier=0.2547 (>0.2500), calibrationSlope=0.3917 (<0.50) + 4 COLD_START teams',
    },
  },
  'USA-MLS': {
    validated_markets: [],
    production_enabled_markets: [],
    activation_priority: 14,
    market_readiness: { AH: 'BLOCKED_MODEL_VALIDATION', OU: 'BLOCKED_MODEL_VALIDATION' },
    market_blockers: {
      AH: 'BLOCKED_MODEL_VALIDATION: Overdispersion ratio 1.2253 (>1.15), AH Brier=0.2499, calibrationSlope=0.4393 (<0.50)',
      OU: 'BLOCKED_MODEL_VALIDATION: Overdispersion ratio 1.2253 (>1.15), OU calibrationSlope=0.3222 (<0.50)',
    },
  },
  'IDN-L1': {
    validated_markets: [],
    production_enabled_markets: [],
    activation_priority: 99,
    market_readiness: { AH: 'PAUSED_MISSING_BASELINE', OU: 'PAUSED_MISSING_BASELINE' },
    market_blockers: {
      AH: 'PAUSED_MISSING_BASELINE: 0 historical matches (n=0), 0/22 rated teams, no Pinnacle coverage',
      OU: 'PAUSED_MISSING_BASELINE: 0 historical matches (n=0), 0/22 rated teams, no Pinnacle coverage',
    },
  },
};

export function resetRegistryToDefaultState(): void {
  for (const entry of CANONICAL_15_LEAGUES) {
    const def = DEFAULT_LEAGUE_READINESS_MAP[entry.internal_league_id];
    if (entry.internal_league_id === 'ENG-PL') {
      entry.production_status = 'ACTIVE';
      entry.ledger_tier = 'PRODUCTION';
      entry.odds_enabled = true;
      entry.production_pick_enabled = true;
      entry.ou_prediction_enabled = true;
      entry.ah_prediction_enabled = true;
    } else if (entry.internal_league_id === 'IDN-L1') {
      entry.production_status = 'PAUSED';
      entry.ledger_tier = 'NONE';
      entry.odds_enabled = false;
      entry.production_pick_enabled = false;
      entry.ah_prediction_enabled = false;
      entry.ou_prediction_enabled = false;
      entry.model_ready = false;
    } else {
      entry.production_status = 'SHADOW';
      entry.ledger_tier = 'SHADOW';
      entry.odds_enabled = false;
      entry.production_pick_enabled = false;
      entry.ah_prediction_enabled = true;
      entry.ou_prediction_enabled = true;
      entry.model_ready = true;
    }
    if (def) {
      entry.validated_markets = [...def.validated_markets];
      entry.production_enabled_markets = [...def.production_enabled_markets];
      entry.activation_priority = def.activation_priority;
      entry.market_readiness = { ...def.market_readiness };
      entry.market_blockers = { ...def.market_blockers };
    }
    entry.last_activation_check_at = null;
    entry.activation_reason = null;
  }
}

// Initialize default readiness state on module load
resetRegistryToDefaultState();

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
  if (s === 'epl' || s === 'eng-pl' || s === 'premier league' || s === 'english premier league') return BY_KEY.get('ENG-PL');
  const direct = BY_NAME.get(s) || BY_SLUG.get(s) || BY_KEY.get(s.toUpperCase());
  if (direct) return direct;
  return CANONICAL_15_LEAGUES.find(
    (l) =>
      l.internal_league_id.toLowerCase() === s ||
      l.league_name.toLowerCase() === s ||
      l.display_name.toLowerCase() === s ||
      l.oddspapi_tournament_slug.toLowerCase() === s ||
      s.includes(l.league_name.toLowerCase()) ||
      l.league_name.toLowerCase().includes(s)
  );
}

/**
 * Checks whether a specific market ('AH' | 'OU') has passed out-of-sample model validation for a league.
 * BTTS is strictly RESEARCH_ONLY (never production-validated).
 */
export function isLeagueMarketValidated(leagueKeyOrName: string, market: 'AH' | 'OU' | 'BTTS'): boolean {
  if (market === 'BTTS') return false;
  const entry = getLeagueByNameOrSlug(leagueKeyOrName);
  if (!entry || !entry.model_ready || entry.production_status === 'PAUSED' || entry.production_status === 'DISABLED') {
    return false;
  }
  return Boolean(entry.validated_markets?.includes(market));
}

/**
 * Checks whether a specific market ('AH' | 'OU') is currently enabled for production pick qualification.
 * Requires the league to be ACTIVE, production_pick_enabled = true, and the specific market included in production_enabled_markets.
 */
export function isLeagueMarketProductionEnabled(leagueKeyOrName: string, market: 'AH' | 'OU' | 'BTTS'): boolean {
  if (market === 'BTTS') return false;
  const entry = getLeagueByNameOrSlug(leagueKeyOrName);
  if (!entry) return false;
  if (entry.production_status !== 'ACTIVE' || !entry.production_pick_enabled || entry.ledger_tier !== 'PRODUCTION') {
    return false;
  }
  return Boolean(entry.production_enabled_markets?.includes(market));
}

/**
 * Returns the explicit blocker reason for a league and market, or null if READY_FOR_PRODUCTION.
 */
export function getLeagueMarketBlocker(leagueKeyOrName: string, market: 'AH' | 'OU' | 'BTTS'): string | null {
  if (market === 'BTTS') return 'RESEARCH_ONLY: BTTS market is restricted to research only';
  const entry = getLeagueByNameOrSlug(leagueKeyOrName);
  if (!entry) return `UNKNOWN_LEAGUE: League '${leagueKeyOrName}' is not registered in CANONICAL_15_LEAGUES`;
  return entry.market_blockers?.[market] || null;
}

/**
 * Idempotently activates only the validated & verified markets for a league after all gates pass.
 * Never activates IDN-L1 while model_ready is false, and never activates an unvalidated market.
 */
export function activateLeagueMarkets(
  internalLeagueId: string,
  marketsToEnable: MarketKey[],
  reason: string,
  timestampIso = new Date().toISOString()
): MultiLeagueEntry | null {
  const entry = getLeagueByKey(internalLeagueId);
  if (!entry) return null;
  if (entry.production_status === 'PAUSED' || !entry.model_ready) {
    return entry;
  }

  // Filter strictly to markets that have passed model validation
  const allowedMarkets = marketsToEnable.filter((m) => entry.validated_markets?.includes(m));
  if (allowedMarkets.length === 0) {
    return entry;
  }

  entry.production_enabled_markets = Array.from(new Set(allowedMarkets));
  entry.production_status = 'ACTIVE';
  entry.ledger_tier = 'PRODUCTION';
  entry.odds_enabled = true;
  entry.production_pick_enabled = true;
  entry.last_activation_check_at = timestampIso;
  entry.activation_reason = reason;

  if (!entry.market_readiness) {
    entry.market_readiness = { AH: 'BLOCKED_MISSING_ODDS', OU: 'BLOCKED_MISSING_ODDS' };
  }
  if (!entry.market_blockers) {
    entry.market_blockers = { AH: null, OU: null };
  }

  for (const m of ['AH', 'OU'] as MarketKey[]) {
    if (entry.production_enabled_markets.includes(m)) {
      entry.market_readiness[m] = 'READY_FOR_PRODUCTION';
      entry.market_blockers[m] = null;
    }
  }

  return entry;
}

/**
 * Idempotently rolls back a non-EPL league to SHADOW if smoke test or post-activation verification fails.
 * Never rolls back ENG-PL.
 */
export function rollbackLeagueMarkets(
  internalLeagueId: string,
  reason: string,
  timestampIso = new Date().toISOString()
): MultiLeagueEntry | null {
  if (internalLeagueId === 'ENG-PL') return getLeagueByKey('ENG-PL') || null;
  const entry = getLeagueByKey(internalLeagueId);
  if (!entry) return null;

  const def = DEFAULT_LEAGUE_READINESS_MAP[internalLeagueId];
  entry.production_enabled_markets = [];
  entry.production_status = entry.internal_league_id === 'IDN-L1' ? 'PAUSED' : 'SHADOW';
  entry.ledger_tier = entry.internal_league_id === 'IDN-L1' ? 'NONE' : 'SHADOW';
  entry.odds_enabled = false;
  entry.production_pick_enabled = false;
  entry.last_activation_check_at = timestampIso;
  entry.activation_reason = `ROLLBACK: ${reason}`;

  if (def) {
    entry.market_readiness = { ...def.market_readiness };
    entry.market_blockers = {
      AH: def.market_blockers.AH || reason,
      OU: def.market_blockers.OU || reason,
    };
  }
  return entry;
}

/**
 * Deterministic priority queue of leagues for quota-aware odds ingestion.
 * Orders strictly by activation_priority (1 = ENG-PL, 2..6 = AH+OU validated, 7..8 = AH-only validated, etc.)
 * and excludes PAUSED or non-Pinnacle leagues.
 */
export function getPriorityOrderedLeaguesForOdds(onlyValidatedCohorts = false): MultiLeagueEntry[] {
  return CANONICAL_15_LEAGUES.filter((l) => {
    if (l.production_status === 'PAUSED' || l.production_status === 'DISABLED' || !l.pinnacle_availability) {
      return false;
    }
    if (onlyValidatedCohorts) {
      return (l.validated_markets?.length || 0) > 0;
    }
    return true;
  }).sort((a, b) => (a.activation_priority ?? 99) - (b.activation_priority ?? 99));
}

/**
 * Returns leagues enabled for fixture discovery and research pipeline execution.
 */
export function getPipelineEnabledLeagues(): MultiLeagueEntry[] {
  return CANONICAL_15_LEAGUES.filter((l) => l.fixture_enabled && l.production_status !== 'DISABLED');
}

/**
 * Returns leagues enabled for model probability generation (ACTIVE + SHADOW with model_ready = true).
 */
export function getPredictionReadyLeagues(): MultiLeagueEntry[] {
  return CANONICAL_15_LEAGUES.filter(
    (l) => l.model_ready && (l.ah_prediction_enabled || l.ou_prediction_enabled)
  );
}

/**
 * Returns leagues eligible for PRODUCTION daily picks (strictly ACTIVE with production_pick_enabled = true).
 */
export function getProductionPickLeagues(): MultiLeagueEntry[] {
  return CANONICAL_15_LEAGUES.filter(
    (l) => l.production_status === 'ACTIVE' && l.production_pick_enabled && l.ledger_tier === 'PRODUCTION'
  );
}

/**
 * Returns leagues operating in SHADOW research mode (model_ready = true, ledger_tier = SHADOW, production_pick_enabled = false).
 */
export function getShadowResearchLeagues(): MultiLeagueEntry[] {
  return CANONICAL_15_LEAGUES.filter(
    (l) => l.production_status === 'SHADOW' && l.ledger_tier === 'SHADOW' && !l.production_pick_enabled
  );
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

export const ODDSPAPI_TOURNAMENT_MAP_VERSION = 'v1.0.0-multi-league';

/**
 * Versioned OddsPapi Tournament ID <-> Canonical League Mapping
 */
export const ODDSPAPI_TOURNAMENT_LEAGUE_MAP: Record<number, { internal_league_id: string; league_name: string; tier: LeagueTier }> = Object.fromEntries(
  CANONICAL_15_LEAGUES.map((l) => [l.oddspapi_tournament_id, {
    internal_league_id: l.internal_league_id,
    league_name: l.league_name,
    tier: l.tier,
  }])
);

/**
 * Returns all 15 configured tournament IDs for single-batch querying.
 */
export function getAllConfiguredOddsPapiTournamentIds(): number[] {
  return CANONICAL_15_LEAGUES.map((l) => l.oddspapi_tournament_id);
}
