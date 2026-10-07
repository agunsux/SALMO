// SALMO.DEV — Core Domain & Market Contracts
// Clean contracts representing the Three Core Markets (AH, BTTS, O/U),
// Decisions, Provenance, and Traceability.

export type CoreMarketType = 'ASIAN_HANDICAP' | 'BTTS' | 'OVER_UNDER';

export type MarketType =
  | 'ASIAN_HANDICAP' | 'BTTS' | 'OVER_UNDER'
  | 'AH'
  | 'OU'
  | 'DNB'
  | 'DOUBLE_CHANCE'
  | 'CORNERS'
  | 'YELLOW_CARDS'
  | 'ALT_AH'
  | 'ALT_OU'
  | 'TEAM_TOTALS'
  | '1H_AH'
  | '1H_OU';

export type MarketStatus =
  | 'ACTIVE'
  | 'READY'
  | 'RESEARCH_ONLY'
  | 'DISABLED';

export interface MarketDefinition {
  key: MarketType;
  canonicalKey: 'AH' | 'OU' | 'BTTS' | 'DNB' | 'DOUBLE_CHANCE' | 'CORNERS' | 'YELLOW_CARDS' | 'ALT_AH' | 'ALT_OU' | 'TEAM_TOTALS' | '1H_AH' | '1H_OU';
  displayName: string;
  category: 'CORE' | 'DERIVED' | 'EXPANSION' | 'FUTURE';
  status: MarketStatus;
  period: 'FT' | '1H';
  isDerived: boolean;
  derivedFrom?: MarketType;
  modelEngine: string;
}

export const MARKET_REGISTRY: Record<string, MarketDefinition> = {
  AH: {
    key: 'AH',
    canonicalKey: 'AH',
    displayName: 'Asian Handicap',
    category: 'CORE',
    status: 'ACTIVE',
    period: 'FT',
    isDerived: false,
    modelEngine: 'dixon-coles-v1.0',
  },
  ASIAN_HANDICAP: {
    key: 'ASIAN_HANDICAP',
    canonicalKey: 'AH',
    displayName: 'Asian Handicap',
    category: 'CORE',
    status: 'ACTIVE',
    period: 'FT',
    isDerived: false,
    modelEngine: 'dixon-coles-v1.0',
  },
  OU: {
    key: 'OU',
    canonicalKey: 'OU',
    displayName: 'Over / Under',
    category: 'CORE',
    status: 'ACTIVE',
    period: 'FT',
    isDerived: false,
    modelEngine: 'ASIAN-TOTAL-jointscore-v1.0.0',
  },
  OVER_UNDER: {
    key: 'OVER_UNDER',
    canonicalKey: 'OU',
    displayName: 'Over / Under',
    category: 'CORE',
    status: 'ACTIVE',
    period: 'FT',
    isDerived: false,
    modelEngine: 'ASIAN-TOTAL-jointscore-v1.0.0',
  },
  BTTS: {
    key: 'BTTS',
    canonicalKey: 'BTTS',
    displayName: 'Both Teams To Score',
    category: 'CORE',
    status: 'ACTIVE',
    period: 'FT',
    isDerived: false,
    modelEngine: 'BTTS-jointscore-v1.0.0',
  },
  DNB: {
    key: 'DNB',
    canonicalKey: 'DNB',
    displayName: 'Draw No Bet (AH 0.0)',
    category: 'DERIVED',
    status: 'READY',
    period: 'FT',
    isDerived: true,
    derivedFrom: 'AH',
    modelEngine: 'dixon-coles-v1.0 (AH 0.0 Alias)',
  },
  DOUBLE_CHANCE: {
    key: 'DOUBLE_CHANCE',
    canonicalKey: 'DOUBLE_CHANCE',
    displayName: 'Double Chance (1X, X2, 12)',
    category: 'DERIVED',
    status: 'READY',
    period: 'FT',
    isDerived: true,
    derivedFrom: 'AH',
    modelEngine: 'Bivariate Score Matrix Outcome Aggregation',
  },
  CORNERS: {
    key: 'CORNERS',
    canonicalKey: 'CORNERS',
    displayName: 'Corner Markets',
    category: 'EXPANSION',
    status: 'READY',
    period: 'FT',
    isDerived: false,
    modelEngine: 'UNVALIDATED_FUTURE_MODEL',
  },
  YELLOW_CARDS: {
    key: 'YELLOW_CARDS',
    canonicalKey: 'YELLOW_CARDS',
    displayName: 'Yellow Card Markets',
    category: 'EXPANSION',
    status: 'READY',
    period: 'FT',
    isDerived: false,
    modelEngine: 'UNVALIDATED_FUTURE_MODEL',
  },
  ALT_AH: {
    key: 'ALT_AH',
    canonicalKey: 'ALT_AH',
    displayName: 'Alternate Asian Handicap',
    category: 'EXPANSION',
    status: 'READY',
    period: 'FT',
    isDerived: true,
    derivedFrom: 'AH',
    modelEngine: 'dixon-coles-v1.0',
  },
  ALT_OU: {
    key: 'ALT_OU',
    canonicalKey: 'ALT_OU',
    displayName: 'Alternate Over / Under',
    category: 'EXPANSION',
    status: 'READY',
    period: 'FT',
    isDerived: true,
    derivedFrom: 'OU',
    modelEngine: 'ASIAN-TOTAL-jointscore-v1.0.0',
  },
  TEAM_TOTALS: {
    key: 'TEAM_TOTALS',
    canonicalKey: 'TEAM_TOTALS',
    displayName: 'Team Total Goals',
    category: 'EXPANSION',
    status: 'READY',
    period: 'FT',
    isDerived: false,
    modelEngine: 'Single-Team Marginal Poisson',
  },
  '1H_AH': {
    key: '1H_AH',
    canonicalKey: '1H_AH',
    displayName: '1st Half Asian Handicap',
    category: 'EXPANSION',
    status: 'READY',
    period: '1H',
    isDerived: false,
    modelEngine: '1H-Dixon-Coles',
  },
  '1H_OU': {
    key: '1H_OU',
    canonicalKey: '1H_OU',
    displayName: '1st Half Over / Under',
    category: 'EXPANSION',
    status: 'READY',
    period: '1H',
    isDerived: false,
    modelEngine: '1H-Total-Goals',
  },
};

export function isMarketActive(marketKey: string): boolean {
  const def = MARKET_REGISTRY[marketKey];
  return def ? def.status === 'ACTIVE' : false;
}

export function getActiveMarkets(): MarketDefinition[] {
  const seen = new Set<string>();
  const active: MarketDefinition[] = [];
  for (const def of Object.values(MARKET_REGISTRY)) {
    if (def.status === 'ACTIVE' && !seen.has(def.canonicalKey)) {
      seen.add(def.canonicalKey);
      active.push(def);
    }
  }
  return active;
}

export interface CanonicalMarket {
  provider: string;
  provider_market_id: string;
  provider_fixture_id: string;
  bookmaker: string;
  market_type: MarketType;
  period: 'FT' | '1H';
  line?: number;
  selection: string;
  odds: number;
  timestamp: string;
  observed_at?: string;
}

export type DecisionBadge = 'GREEN' | 'YELLOW' | 'RED' | 'GREY';

export type DecisionStatus =
  | 'VALUE'
  | 'MARGINAL'
  | 'NO_VALUE'
  | 'INSUFFICIENT_DATA'
  | 'ODDS_UNAVAILABLE'
  | 'MARKET_UNAVAILABLE';

export type ConfidenceTier = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export type LifecycleStage =
  | 'DISCOVERY'
  | 'VALIDATED'
  | 'OOS_PASS'
  | 'WALK_FORWARD_PASS'
  | 'UNVERIFIED'
  | 'LIVE_SHADOW'
  | 'LIVE_SETTLED'
  | 'HISTORICAL'
  | 'LIVE'
  | 'UNAVAILABLE';

export type SettlementOutcome =
  | 'WIN'
  | 'HALF_WIN'
  | 'PUSH'
  | 'HALF_LOSS'
  | 'LOSS'
  | 'VOID';

export interface MarketView {
  marketType: MarketType;
  lineLabel: string;        // e.g. "-0.75", "YES", "OVER 2.5"
  numericLine?: number;     // e.g. -0.75, 2.5
  selection: string;        // e.g. "home", "yes", "over"
  available: boolean;
  odds: number | null;      // e.g. 1.91 (decimal odds, null if unavailable)
  fairOdds?: number | null; // model fair odds (1 / prob)
  oppositeOdds?: number | null;
  bookmaker: string | null; // e.g. "Pinnacle"
  oddsCapturedAt?: string;  // timestamp of market quote capture
  badge: DecisionBadge;
  status: DecisionStatus;
  statusLabel: string;
  confidence: ConfidenceTier;
  confidenceScore: number;  // 0 - 100
  modelProbabilityPct: number | null;      // e.g. 56.5%
  marketImpliedProbabilityPct: number | null; // e.g. 52.4%
  devigProbabilityPct?: number | null;    // devigged market probability
  edgePercentagePoints: number | null;     // e.g. +4.1 pp
  expectedValuePct: number | null;         // e.g. +3.8%
  sampleSize: number;
  dataQuality: 'PASS' | 'WARN' | 'FAIL' | 'NONE';
  validationStage: LifecycleStage;
  settlementDistribution?: {
    winPct: number;
    halfWinPct: number;
    pushPct: number;
    halfLossPct: number;
    lossPct: number;
  };
  reason: string;
  verdict?: 'LAYAK' | 'PANTAU' | 'LEWATI';
  rejectionReason?: string | null;
  bestAvailableOdds?: number | null;
  bestBookmaker?: string | null;
  provenance: DecisionProvenance;
}

export interface DecisionProvenance {
  source: string;
  datasetVersion: string;
  dateRange: string;
  league: string;
  market: string;
  line: string;
  sampleSize: number;
  settlementMethodology: string;
  validationStatus: string;
  lastUpdate: string;
  checksum?: string;
}

export interface CalculationTrace {
  market: string;
  line: string;
  historicalSample: number;
  observedOdds: number | null;
  modelProbabilityPct: number | null;
  impliedProbabilityPct: number | null;
  edgePercentagePoints: number | null;
  dataQuality: string;
  validationStage: string;
  decisionBadge: DecisionBadge;
  arithmeticSteps: Array<{
    step: number;
    name: string;
    formula: string;
    result: string;
    provenance: string;
  }>;
}

export interface MatchIntelligence {
  id: string;
  fixtureId: string;
  canonicalMatchId?: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  season?: string;
  kickoffIso: string;
  kickoffDisplay: string;
  venue?: string;
  isUpcoming: boolean;
  horizon?: string;
  predictionTimestamp?: string;
  footballStateTimestamp?: string;
  marketStateTimestamp?: string;
  scoreGridSummary?: {
    homeXG: number;
    awayXG: number;
    rho: number;
  };
  markets: {
    asianHandicap: MarketView;
    btts: MarketView;
    overUnder: MarketView;
  };
}

export interface ActivePredictionMarket {
  market: 'AH' | 'OU' | 'BTTS';
  selection: string;
  line: number;
  modelProbabilityPct: number;
  fairOdds: number | null;
  marketOdds: number;
  marketImpliedProbPct: number;
  devigProbPct: number;
  edgePct: number;
  expectedValuePct: number | null;
  signalState: string;
  bookmaker: string;
  oddsCapturedAt: string;
  confidence?: number;
  verdict?: 'LAYAK' | 'PANTAU' | 'LEWATI';
  rejectionReason?: string | null;
  bestAvailableOdds?: number;
  bestBookmaker?: string;
}

export interface ActiveMatchPrediction {
  canonicalMatchId: string;
  fixtureId: string;
  oddsPapiFixtureId: string;
  kickoffUtc: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  season: string;
  venue: string;
  predictionTimestamp: string;
  footballStateTimestamp: string;
  footystatsStateTimestamp: string;
  marketStateTimestamp: string;
  horizon: string;
  modelVersion: string;
  featureVersion: string;
  markets: {
    asianHandicap: ActivePredictionMarket;
    overUnder: ActivePredictionMarket;
    btts: ActivePredictionMarket;
  };
  sourceType?: 'PROVIDER' | 'SYNTHETIC_FALLBACK';
  providerName?: string;
  scoreGridSummary: {
    homeXG: number;
    awayXG: number;
    rho: number;
  };
}

export interface LiveValidationSummary {
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  fixtureCount: number;
  reconciledFixtureCount: number;
  ahCoverage: string;
  ouCoverage: string;
  bttsCoverage: string;
  predictionCount: number;
  dataCompleteness: string;
  providerStatus: {
    apiFootball: string;
    oddsPapi: string;
    footyStats: string;
  };
  modelVersion: string;
  validationStatus: string;
  matrix: Array<{
    market: 'AH' | 'BTTS' | 'OU';
    model: string;
    fixtures: number;
    signals: number;
    roi: number;
    ci95: string;
    clv: number;
    calibration: number;
    status: string;
  }>;
}

export interface MatchObservation {
  matchId: string;
  date: string;
  season: string;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  scoreDisplay: string;
  line: number;
  odds: number;
  settlement: SettlementOutcome;
  profit: number; // profit for 1 unit stake
}
