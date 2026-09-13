// SALMO.DEV — Decision Policy & Confidence Engine
// Strictly enforces separation of Probability, Value, and Decision.
// Never uses default 50% probabilities or synthetic confidence.

import { DecisionBadge, DecisionStatus, ConfidenceTier } from '../../types';

export interface DecisionEvaluationInput {
  odds: number | null | undefined;
  oppositeOdds?: number | null;
  modelProbPct: number | null | undefined;
  impliedProbPct: number | null | undefined;
  sampleSize: number;
  dataQuality?: 'PASS' | 'WARN' | 'FAIL' | 'NONE';
  validationStage?: string;
}

export interface DecisionEvaluationOutput {
  badge: DecisionBadge;
  status: DecisionStatus;
  statusLabel: string;
  confidence: ConfidenceTier;
  confidenceScore: number;
  edgePercentagePoints: number | null;
  expectedValuePct: number | null;
  reason: string;
}

export class DecisionPolicy {
  /**
   * Evaluates market value and generates functional status badges.
   */
  public static evaluate(input: DecisionEvaluationInput): DecisionEvaluationOutput {
    const {
      odds,
      modelProbPct,
      impliedProbPct,
      sampleSize,
      dataQuality = 'PASS',
    } = input;

    // Gate 0: Odds availability
    if (!odds || odds <= 1 || !Number.isFinite(odds)) {
      return {
        badge: 'GREY',
        status: 'ODDS_UNAVAILABLE',
        statusLabel: 'ODDS UNAVAILABLE',
        confidence: 'NONE',
        confidenceScore: 0,
        edgePercentagePoints: null,
        expectedValuePct: null,
        reason: 'Real bookmaker market odds are not currently available for this line.',
      };
    }

    // Gate 1: Model probability availability
    if (modelProbPct === null || modelProbPct === undefined || !Number.isFinite(modelProbPct)) {
      return {
        badge: 'GREY',
        status: 'INSUFFICIENT_DATA',
        statusLabel: 'INSUFFICIENT DATA',
        confidence: 'NONE',
        confidenceScore: 0,
        edgePercentagePoints: null,
        expectedValuePct: null,
        reason: 'Model probability cannot be derived due to incomplete match parameters.',
      };
    }

    // Gate 2: Statistical sample threshold
    if (sampleSize < 20) {
      return {
        badge: 'GREY',
        status: 'INSUFFICIENT_DATA',
        statusLabel: 'INSUFFICIENT EVIDENCE',
        confidence: 'LOW',
        confidenceScore: Math.min(sampleSize * 2, 40),
        edgePercentagePoints: null,
        expectedValuePct: null,
        reason: `Historical sample (${sampleSize} matches) is below minimum statistical threshold (20).`,
      };
    }

    const implied = impliedProbPct ?? Number(((1 / odds) * 100).toFixed(1));
    const edge = Number((modelProbPct - implied).toFixed(1));

    // Expected value calculation
    const ev = Number((((modelProbPct / 100) * odds - 1) * 100).toFixed(1));

    // Compute independent confidence score (0 - 100)
    let confScore = 40;
    if (sampleSize >= 150) confScore += 30;
    else if (sampleSize >= 75) confScore += 20;
    else if (sampleSize >= 40) confScore += 10;

    if (dataQuality === 'PASS') confScore += 15;
    if (odds >= 1.70 && odds <= 2.20) confScore += 15; // standard liquid band

    confScore = Math.min(Math.max(confScore, 0), 95);

    let confidenceTier: ConfidenceTier = 'MEDIUM';
    if (confScore >= 75) confidenceTier = 'HIGH';
    else if (confScore >= 50) confidenceTier = 'MEDIUM';
    else if (confScore >= 25) confidenceTier = 'LOW';
    else confidenceTier = 'NONE';

    // Decision gating
    // GREEN: Edge >= +3.0 pp AND sampleSize >= 40 AND odds available
    if (edge >= 3.0 && sampleSize >= 40 && confScore >= 70) {
      return {
        badge: 'GREEN',
        status: 'VALUE',
        statusLabel: 'VALUE CONFIRMED',
        confidence: confidenceTier,
        confidenceScore: confScore,
        edgePercentagePoints: edge,
        expectedValuePct: ev,
        reason: `Positive edge (+${edge} pp) supported by robust historical sample (${sampleSize} matches).`,
      };
    }

    // YELLOW: Marginal positive edge (+0.5 to +3.0 pp) or moderate uncertainty
    if (edge >= 0.5) {
      return {
        badge: 'YELLOW',
        status: 'MARGINAL',
        statusLabel: 'MARGINAL VALUE',
        confidence: confidenceTier,
        confidenceScore: confScore,
        edgePercentagePoints: edge,
        expectedValuePct: ev,
        reason: `Marginal edge (+${edge} pp) detected with moderate historical variance.`,
      };
    }

    // RED: Negative edge or unfavorable conditions
    return {
      badge: 'RED',
      status: 'NO_VALUE',
      statusLabel: 'NO VALUE',
      confidence: confidenceTier,
      confidenceScore: confScore,
      edgePercentagePoints: edge,
      expectedValuePct: ev,
      reason: `Negative edge (${edge} pp). Available price does not offer mathematical value.`,
    };
  }
}
