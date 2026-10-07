// SALMO.DEV — Live Provider Boundary Interfaces
// Strictly prevents synthetic fixture or odds fabrication.
// Missing or failing provider calls must yield explicit DATA_UNAVAILABLE.

export type ProviderDataStatus =
  | 'AVAILABLE'
  | 'DATA_UNAVAILABLE'
  | 'UNCONFIGURED'
  | 'RATE_LIMITED'
  | 'ERROR';

export interface ProviderResult<T> {
  status: ProviderDataStatus;
  provider: string;
  data: T | null;
  error?: string;
  latencyMs: number;
  cached: boolean;
  timestamp: string;
}

export const CONSUMED_BOOKMAKERS = [
  'pinnacle',
  'bet365',
] as const;

export const EXTENSIBLE_SUPPORTED_BOOKMAKERS = [
  'pinnacle',
  'bet365',
  '1xbet',
  'sbobet',
  'singbet',
] as const;

export type ConsumedBookmaker = typeof CONSUMED_BOOKMAKERS[number];

export interface LiveFixtureDTO {
  providerFixtureId: string;
  league: string;
  season: string;
  kickoffTime: string;
  homeTeam: string;
  awayTeam: string;
  venue?: string;
  status: 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'POSTPONED';
  oddspapiTournamentId?: number;
}

export interface LiveOddsDTO {
  providerFixtureId: string;
  bookmaker: string;
  marketType: 'ASIAN_HANDICAP' | 'OVER_UNDER' | 'BTTS' | 'AH' | 'OU' | 'DNB' | 'DOUBLE_CHANCE' | string;
  line: number;
  homeOdds: number;
  awayOdds: number;
  drawOdds?: number;
  capturedAt: string;
  isMainLine?: boolean;
}

export interface IFixtureProvider {
  readonly providerName: string;
  isConfigured(): boolean;
  getUpcomingFixtures(leagueIdOrTournamentIds?: string | number[]): Promise<ProviderResult<LiveFixtureDTO[]>>;
  getFixtureById(id: string): Promise<ProviderResult<LiveFixtureDTO | null>>;
}

export interface IOddsProvider {
  readonly providerName: string;
  isConfigured(): boolean;
  getMarketOdds(fixtureId: string, bookmakers?: string[]): Promise<ProviderResult<LiveOddsDTO[]>>;
  getTournamentOdds?(tournamentIds: number[], bookmaker?: string): Promise<ProviderResult<LiveOddsDTO[]>>;
  getBatchTournamentOdds?(tournamentIds: number[], bookmaker?: string): Promise<ProviderResult<LiveOddsDTO[]>>;
}

