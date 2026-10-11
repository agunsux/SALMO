// SALMO.DEV — Competition Profile & League Environment Engine
// Provides empirically refitted goal environment parameters for Dixon-Coles model per league.
// EPL uses the locked walk-forward validated baseline; 13 non-EPL leagues use empirical refits
// from 15,298 historical completed matches (2023-2026); Liga 1 Indonesia remains uncalibrated.

export interface LeagueProfile {
  code: string;
  internalLeagueId?: string;
  name: string;
  goalEnvironment: number; // Empirical goals per match
  homeAdvantage: number;   // Empirical home goal share (mu_home / (mu_home + mu_away))
  defaultRho: number;      // Empirical Dixon-Coles low-score correlation parameter
  dispersionRatio?: number | null; // Var(G_total) / Mean(G_total)
  sampleMatches?: number;
  modelVersion?: string;
  seasonCalendar?: 'EUROPEAN_SPLIT_YEAR' | 'CALENDAR_YEAR';
  parameterSource?: 'VALIDATED' | 'EMPIRICAL_REFIT_SHADOW' | 'EPL_TRANSFER_BASELINE';
  isCalibrated?: boolean;
  isAhCalibrated?: boolean;
  isOuCalibrated?: boolean;
}

const EPL_PROFILE: LeagueProfile = {
  code: 'EPL',
  internalLeagueId: 'ENG-PL',
  name: 'Premier League',
  goalEnvironment: 2.65,
  homeAdvantage: 0.55,
  defaultRho: -0.06,
  dispersionRatio: 0.9239,
  sampleMatches: 1329,
  modelVersion: 'dixon-coles-v1.0',
  seasonCalendar: 'EUROPEAN_SPLIT_YEAR',
  parameterSource: 'VALIDATED',
  isCalibrated: true,
  isAhCalibrated: true,
  isOuCalibrated: true,
};

const LALIGA_PROFILE: LeagueProfile = {
  code: 'LALIGA',
  internalLeagueId: 'ESP-LALIGA',
  name: 'La Liga',
  goalEnvironment: 2.6689,
  homeAdvantage: 0.5699,
  defaultRho: -0.04,
  dispersionRatio: 1.0226,
  sampleMatches: 1359,
  modelVersion: 'dixon-coles-esp-laliga-2026-10-11',
  seasonCalendar: 'EUROPEAN_SPLIT_YEAR',
  parameterSource: 'EMPIRICAL_REFIT_SHADOW',
  isCalibrated: true,
  isAhCalibrated: true,
  isOuCalibrated: true,
};

const SERIEA_PROFILE: LeagueProfile = {
  code: 'SERIEA',
  internalLeagueId: 'ITA-SERIEA',
  name: 'Serie A',
  goalEnvironment: 2.5522,
  homeAdvantage: 0.5334,
  defaultRho: 0.04,
  dispersionRatio: 0.9388,
  sampleMatches: 1331,
  modelVersion: 'dixon-coles-ita-seriea-2026-10-11',
  seasonCalendar: 'EUROPEAN_SPLIT_YEAR',
  parameterSource: 'EMPIRICAL_REFIT_SHADOW',
  isCalibrated: true,
  isAhCalibrated: true,
  isOuCalibrated: false,
};

const BUNDESLIGA_PROFILE: LeagueProfile = {
  code: 'BUNDESLIGA',
  internalLeagueId: 'DEU-BUNDESLIGA',
  name: 'Bundesliga',
  goalEnvironment: 3.2111,
  homeAdvantage: 0.5521,
  defaultRho: -0.06,
  dispersionRatio: 0.9782,
  sampleMatches: 1061,
  modelVersion: 'dixon-coles-deu-bundesliga-2026-10-11',
  seasonCalendar: 'EUROPEAN_SPLIT_YEAR',
  parameterSource: 'EMPIRICAL_REFIT_SHADOW',
  isCalibrated: true,
  isAhCalibrated: true,
  isOuCalibrated: true,
};

const LIGUE1_PROFILE: LeagueProfile = {
  code: 'LIGUE1',
  internalLeagueId: 'FRA-LIGUE1',
  name: 'Ligue 1',
  goalEnvironment: 2.8213,
  homeAdvantage: 0.5448,
  defaultRho: -0.03,
  dispersionRatio: 1.0306,
  sampleMatches: 1091,
  modelVersion: 'dixon-coles-fra-ligue1-2026-10-11',
  seasonCalendar: 'EUROPEAN_SPLIT_YEAR',
  parameterSource: 'EMPIRICAL_REFIT_SHADOW',
  isCalibrated: true,
  isAhCalibrated: true,
  isOuCalibrated: true,
};

const EREDIVISIE_PROFILE: LeagueProfile = {
  code: 'EREDIVISIE',
  internalLeagueId: 'NED-ERE',
  name: 'Eredivisie',
  goalEnvironment: 3.1945,
  homeAdvantage: 0.5543,
  defaultRho: -0.11,
  dispersionRatio: 0.9318,
  sampleMatches: 1095,
  modelVersion: 'dixon-coles-ned-ere-2026-10-11',
  seasonCalendar: 'EUROPEAN_SPLIT_YEAR',
  parameterSource: 'EMPIRICAL_REFIT_SHADOW',
  isCalibrated: true,
  isAhCalibrated: true,
  isOuCalibrated: true,
};

const PRIMEIRA_PROFILE: LeagueProfile = {
  code: 'PRIMEIRA',
  internalLeagueId: 'POR-PRIMEIRA',
  name: 'Primeira Liga',
  goalEnvironment: 2.6939,
  homeAdvantage: 0.5486,
  defaultRho: -0.06,
  dispersionRatio: 0.9461,
  sampleMatches: 1088,
  modelVersion: 'dixon-coles-por-primeira-2026-10-11',
  seasonCalendar: 'EUROPEAN_SPLIT_YEAR',
  parameterSource: 'EMPIRICAL_REFIT_SHADOW',
  isCalibrated: true,
  isAhCalibrated: true,
  isOuCalibrated: true,
};

const BELPRO_PROFILE: LeagueProfile = {
  code: 'BELPRO',
  internalLeagueId: 'BEL-PRO',
  name: 'Jupiler Pro League',
  goalEnvironment: 2.8086,
  homeAdvantage: 0.5578,
  defaultRho: -0.06,
  dispersionRatio: 1.0332,
  sampleMatches: 1087,
  modelVersion: 'dixon-coles-bel-pro-2026-10-11',
  seasonCalendar: 'EUROPEAN_SPLIT_YEAR',
  parameterSource: 'EMPIRICAL_REFIT_SHADOW',
  isCalibrated: true,
  isAhCalibrated: true,
  isOuCalibrated: false,
};

const SCOPREM_PROFILE: LeagueProfile = {
  code: 'SCOPREM',
  internalLeagueId: 'SCO-PREM',
  name: 'Scottish Premiership',
  goalEnvironment: 2.8483,
  homeAdvantage: 0.5694,
  defaultRho: -0.01,
  dispersionRatio: 0.9259,
  sampleMatches: 468,
  modelVersion: 'dixon-coles-sco-prem-2026-10-11',
  seasonCalendar: 'EUROPEAN_SPLIT_YEAR',
  parameterSource: 'EMPIRICAL_REFIT_SHADOW',
  isCalibrated: false,
};

const ENGCHAMP_PROFILE: LeagueProfile = {
  code: 'ENGCHAMP',
  internalLeagueId: 'ENG-CHAMP',
  name: 'Championship',
  goalEnvironment: 2.5233,
  homeAdvantage: 0.5599,
  defaultRho: -0.14,
  dispersionRatio: 0.9150,
  sampleMatches: 1114,
  modelVersion: 'dixon-coles-eng-champ-2026-10-11',
  seasonCalendar: 'EUROPEAN_SPLIT_YEAR',
  parameterSource: 'EMPIRICAL_REFIT_SHADOW',
  isCalibrated: false,
};

const MLS_PROFILE: LeagueProfile = {
  code: 'MLS',
  internalLeagueId: 'USA-MLS',
  name: 'Major League Soccer',
  goalEnvironment: 3.1023,
  homeAdvantage: 0.5690,
  defaultRho: -0.02,
  dispersionRatio: 1.2253,
  sampleMatches: 1975,
  modelVersion: 'dixon-coles-usa-mls-2026-10-11',
  seasonCalendar: 'CALENDAR_YEAR',
  parameterSource: 'EMPIRICAL_REFIT_SHADOW',
  isCalibrated: false,
};

const SAUPRO_PROFILE: LeagueProfile = {
  code: 'SAUPRO',
  internalLeagueId: 'SAU-PRO',
  name: 'Saudi Pro League',
  goalEnvironment: 2.9526,
  homeAdvantage: 0.5266,
  defaultRho: -0.14,
  dispersionRatio: 1.0118,
  sampleMatches: 1076,
  modelVersion: 'dixon-coles-sau-pro-2026-10-11',
  seasonCalendar: 'EUROPEAN_SPLIT_YEAR',
  parameterSource: 'EMPIRICAL_REFIT_SHADOW',
  isCalibrated: false,
};

const J1_PROFILE: LeagueProfile = {
  code: 'J1',
  internalLeagueId: 'JPN-J1',
  name: 'J1 League',
  goalEnvironment: 2.5316,
  homeAdvantage: 0.5411,
  defaultRho: 0.04,
  dispersionRatio: 1.1264,
  sampleMatches: 760,
  modelVersion: 'dixon-coles-jpn-j1-2026-10-11',
  seasonCalendar: 'CALENDAR_YEAR',
  parameterSource: 'EMPIRICAL_REFIT_SHADOW',
  isCalibrated: false,
};

const K1_PROFILE: LeagueProfile = {
  code: 'K1',
  internalLeagueId: 'KOR-K1',
  name: 'K League 1',
  goalEnvironment: 2.5862,
  homeAdvantage: 0.5467,
  defaultRho: 0.04,
  dispersionRatio: 1.0121,
  sampleMatches: 464,
  modelVersion: 'dixon-coles-kor-k1-2026-10-11',
  seasonCalendar: 'CALENDAR_YEAR',
  parameterSource: 'EMPIRICAL_REFIT_SHADOW',
  isCalibrated: false,
};

const IDNL1_PROFILE: LeagueProfile = {
  code: 'IDNL1',
  internalLeagueId: 'IDN-L1',
  name: 'Liga 1',
  goalEnvironment: 2.65,
  homeAdvantage: 0.57,
  defaultRho: -0.05,
  dispersionRatio: null,
  sampleMatches: 0,
  modelVersion: 'dixon-coles-idn-l1-uncalibrated',
  seasonCalendar: 'EUROPEAN_SPLIT_YEAR',
  parameterSource: 'EPL_TRANSFER_BASELINE',
  isCalibrated: false,
};

export const LEAGUE_PROFILES: Record<string, LeagueProfile> = {
  // Tier A — European Big 5
  'EPL': EPL_PROFILE,
  'PREMIER LEAGUE': EPL_PROFILE,
  'ENG-PL': EPL_PROFILE,
  'LA LIGA': LALIGA_PROFILE,
  'LALIGA': LALIGA_PROFILE,
  'ESP-LALIGA': LALIGA_PROFILE,
  'SERIE A': SERIEA_PROFILE,
  'SERIEA': SERIEA_PROFILE,
  'ITA-SERIEA': SERIEA_PROFILE,
  'BUNDESLIGA': BUNDESLIGA_PROFILE,
  'DEU-BUNDESLIGA': BUNDESLIGA_PROFILE,
  'LIGUE 1': LIGUE1_PROFILE,
  'LIGUE1': LIGUE1_PROFILE,
  'FRA-LIGUE1': LIGUE1_PROFILE,

  // Tier B — Secondary Europe
  'EREDIVISIE': EREDIVISIE_PROFILE,
  'NED-ERE': EREDIVISIE_PROFILE,
  'NLD-EREDIVISIE': EREDIVISIE_PROFILE,
  'PRIMEIRA LIGA': PRIMEIRA_PROFILE,
  'PRIMEIRA': PRIMEIRA_PROFILE,
  'POR-PRIMEIRA': PRIMEIRA_PROFILE,
  'PRT-PRIMEIRA': PRIMEIRA_PROFILE,
  'JUPILER PRO LEAGUE': BELPRO_PROFILE,
  'BELPRO': BELPRO_PROFILE,
  'BEL-PRO': BELPRO_PROFILE,
  'PREMIERSHIP': SCOPREM_PROFILE,
  'SCOTTISH PREMIERSHIP': SCOPREM_PROFILE,
  'SCOPREM': SCOPREM_PROFILE,
  'SCO-PREM': SCOPREM_PROFILE,
  'CHAMPIONSHIP': ENGCHAMP_PROFILE,
  'ENGCHAMP': ENGCHAMP_PROFILE,
  'ENG-CHAMP': ENGCHAMP_PROFILE,

  // Tier C — Global Expansion
  'MAJOR LEAGUE SOCCER': MLS_PROFILE,
  'MLS': MLS_PROFILE,
  'USA-MLS': MLS_PROFILE,
  'PRO LEAGUE': SAUPRO_PROFILE,
  'SAUDI PRO LEAGUE': SAUPRO_PROFILE,
  'SAUPRO': SAUPRO_PROFILE,
  'SAU-PRO': SAUPRO_PROFILE,
  'J1 LEAGUE': J1_PROFILE,
  'J1': J1_PROFILE,
  'JPN-J1': J1_PROFILE,
  'K LEAGUE 1': K1_PROFILE,
  'K1': K1_PROFILE,
  'KOR-K1': K1_PROFILE,
  'LIGA 1': IDNL1_PROFILE,
  'LIGA 1 INDONESIA': IDNL1_PROFILE,
  'IDNL1': IDNL1_PROFILE,
  'IDN-L1': IDNL1_PROFILE,
};

export class CompetitionProfileEngine {
  public static getProfileForLeague(leagueName: string): LeagueProfile {
    const key = (leagueName || '').toUpperCase().trim();
    if (LEAGUE_PROFILES[key]) return LEAGUE_PROFILES[key];

    for (const [k, prof] of Object.entries(LEAGUE_PROFILES)) {
      if (key === k || key.includes(k) || prof.name.toUpperCase().includes(key) || prof.code === key) {
        return prof;
      }
    }
    return {
      ...EPL_PROFILE,
      parameterSource: 'EPL_TRANSFER_BASELINE',
      isCalibrated: false,
      isAhCalibrated: false,
      isOuCalibrated: false,
    };
  }

  public static isMarketCalibrated(leagueName: string, market: 'AH' | 'OU' | 'BTTS'): boolean {
    if (market === 'BTTS') return false;
    const profile = this.getProfileForLeague(leagueName);
    if (!profile.isCalibrated) return false;
    if (market === 'AH') return Boolean(profile.isAhCalibrated ?? profile.isCalibrated);
    if (market === 'OU') return Boolean(profile.isOuCalibrated ?? profile.isCalibrated);
    return false;
  }
}
