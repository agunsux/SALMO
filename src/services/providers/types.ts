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

export interface LiveFixtureDTO {
  providerFixtureId: string;
  league: string;
  season: string;
  kickoffTime: string;
  homeTeam: string;
  awayTeam: string;
  venue?: string;
  status: 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'POSTPONED';
}

export interface LiveOddsDTO {
  providerFixtureId: string;
  bookmaker: string;
  marketType: 'ASIAN_HANDICAP' | 'OVER_UNDER' | 'BTTS';
  line: number;
  homeOdds: number;
  awayOdds: number;
  capturedAt: string;
}

export interface IFixtureProvider {
  readonly providerName: string;
  isConfigured(): boolean;
  getUpcomingFixtures(leagueId?: string): Promise<ProviderResult<LiveFixtureDTO[]>>;
  getFixtureById(id: string): Promise<ProviderResult<LiveFixtureDTO | null>>;
}

export interface IOddsProvider {
  readonly providerName: string;
  isConfigured(): boolean;
  getMarketOdds(fixtureId: string): Promise<ProviderResult<LiveOddsDTO[]>>;
}

