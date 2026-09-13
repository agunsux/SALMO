// SALMO.DEV — Versioned API Contracts (v1)
// Formal DTO specifications for /api/v1/* endpoints.
// Strictly enforces null / explicit unavailable states. Zero fabrication.

import { DecisionBadge, DecisionStatus, ConfidenceTier, LifecycleStage } from './index';
import { CanonicalProvenanceDTO } from './provenance';

export interface ApiResponseEnvelope<T> {
  success: boolean;
  version: 'v1';
  data: T | null;
  error?: {
    code: string;
    message: string;
    category: 'CLIENT_ERROR' | 'DATA_UNAVAILABLE' | 'CONFIGURATION_ERROR' | 'INTERNAL_ERROR';
  };
  meta: {
    requestId: string;
    timestamp: string;
    latencyMs: number;
  };
}

export interface MarketIntelligenceV1DTO {
  marketType: 'ASIAN_HANDICAP' | 'OVER_UNDER' | 'BTTS';
  lineLabel: string;
  numericLine: number | null;
  selection: string;
  available: boolean;
  odds: number | null;
  bookmaker: string | null;
  badge: DecisionBadge;
  status: DecisionStatus;
  statusLabel: string;
  confidence: ConfidenceTier;
  modelProbabilityPct: number | null;
  marketImpliedProbabilityPct: number | null;
  edgePercentagePoints: number | null;
  expectedValuePct: number | null;
  sampleSize: number;
  dataQuality: 'PASS' | 'WARN' | 'FAIL' | 'NONE';
  validationStage: LifecycleStage;
  reason: string;
  provenance: CanonicalProvenanceDTO;
}

export interface MatchIntelligenceV1DTO {
  id: string;
  canonicalMatchId: string;
  league: string;
  season: string;
  date: string;
  kickoffTime: string;
  homeTeam: string;
  awayTeam: string;
  venue?: string;
  isUpcoming: boolean;
  markets: {
    asianHandicap: MarketIntelligenceV1DTO;
    btts: MarketIntelligenceV1DTO;
    overUnder: MarketIntelligenceV1DTO;
  };
  provenance: CanonicalProvenanceDTO;
}

export interface MatchesListV1Response {
  matches: MatchIntelligenceV1DTO[];
  totalMatches: number;
  datasetSummary: {
    version: string;
    verifiedMatchCount: number;
    seasons: string[];
    lastUpdate: string;
    checksum: string;
  };
}

export interface EvidenceObservationV1DTO {
  matchId: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  line: number;
  homeGoals: number;
  awayGoals: number;
  goalDifference: number;
  settlement: string;
  odds: number | null;
  bookmaker: string | null;
}

export interface EvidenceDetailV1DTO {
  marketId: string;
  matchTitle: string;
  lineLabel: string;
  sampleSize: number;
  settlementBreakdown: {
    winPct: number | null;
    halfWinPct: number | null;
    pushPct: number | null;
    halfLossPct: number | null;
    lossPct: number | null;
  };
  observations: EvidenceObservationV1DTO[];
  provenance: CanonicalProvenanceDTO;
}

export interface ResearchParameterV1DTO {
  totalMatchesAnalyzed: number;
  seasonsCovered: string[];
  linesAnalyzed: Array<{
    line: number;
    sampleSize: number;
    homeWinPct: number;
    pushPct: number;
    awayWinPct: number;
  }>;
  validationSummary: {
    stage: LifecycleStage;
    status: string;
    verifiedFolds: number;
  };
}

