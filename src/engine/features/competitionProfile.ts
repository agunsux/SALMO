// SALMO.DEV — Competition Profile & League Environment Engine
// Provides baseline goal environment parameters for Dixon-Coles model.
// Migrated from HandicapLab validated engine.

export interface LeagueProfile {
  code: string;
  name: string;
  goalEnvironment: number; // e.g. 2.65 goals per match
  homeAdvantage: number;   // e.g. 0.55 (55% home goal share)
  defaultRho: number;      // e.g. -0.06
}

export const LEAGUE_PROFILES: Record<string, LeagueProfile> = {
  'EPL': {
    code: 'EPL',
    name: 'Premier League',
    goalEnvironment: 2.65,
    homeAdvantage: 0.55,
    defaultRho: -0.06,
  },
  'PREMIER LEAGUE': {
    code: 'EPL',
    name: 'Premier League',
    goalEnvironment: 2.65,
    homeAdvantage: 0.55,
    defaultRho: -0.06,
  },
  'CHAMPIONSHIP': {
    code: 'CHAMPIONSHIP',
    name: 'Championship',
    goalEnvironment: 2.55,
    homeAdvantage: 0.54,
    defaultRho: -0.05,
  },
  'SERIE A': {
    code: 'SERIE_A',
    name: 'Serie A',
    goalEnvironment: 2.60,
    homeAdvantage: 0.54,
    defaultRho: -0.06,
  },
  'BUNDESLIGA': {
    code: 'BUNDESLIGA',
    name: 'Bundesliga',
    goalEnvironment: 3.10,
    homeAdvantage: 0.53,
    defaultRho: -0.05,
  },
  'LA LIGA': {
    code: 'LA_LIGA',
    name: 'La Liga',
    goalEnvironment: 2.50,
    homeAdvantage: 0.55,
    defaultRho: -0.06,
  },
};

export class CompetitionProfileEngine {
  public static getProfileForLeague(leagueName: string): LeagueProfile {
    const key = (leagueName || '').toUpperCase().trim();
    for (const [k, prof] of Object.entries(LEAGUE_PROFILES)) {
      if (key === k || key.includes(k) || prof.name.toUpperCase().includes(key)) {
        return prof;
      }
    }
    // Default fallback to Premier League baseline
    return LEAGUE_PROFILES['EPL'];
  }
}
