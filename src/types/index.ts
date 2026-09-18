// SALMO.DEV — Core Domain & Market Contracts
// Clean contracts representing the Three Core Markets (AH, BTTS, O/U),
// Decisions, Provenance, and Traceability.

export type MarketType = 'ASIAN_HANDICAP' | 'BTTS' | 'OVER_UNDER';

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
