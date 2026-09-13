// SALMO.DEV — Calculation Trace Generator
// Transparent mathematical derivation with zero unexplained magic numbers.

import { CalculationTrace, MarketView } from '../../types/index';

export class TraceGenerator {
  public static generateTrace(market: MarketView): CalculationTrace {
    const odds = market.odds;
    const modelProb = market.modelProbabilityPct;
    const impliedProb = market.marketImpliedProbabilityPct;
    const edge = market.edgePercentagePoints;

    const arithmeticSteps: CalculationTrace['arithmeticSteps'] = [];

    // Step 1: Raw Price Observation
    arithmeticSteps.push({
      step: 1,
      name: 'Market Price Observation',
      formula: 'Decimal closing odds from primary reference bookmaker',
      result: odds ? `${odds.toFixed(2)} (${market.bookmaker || 'Pinnacle'})` : 'ODDS UNAVAILABLE',
      provenance: market.provenance.source,
    });

    // Step 2: Devigging & Implied Probability
    arithmeticSteps.push({
      step: 2,
      name: 'Implied Probability Extraction (Devigging)',
      formula: 'P_implied = (1 / Odds_A) / [(1 / Odds_A) + (1 / Odds_B)]',
      result: impliedProb !== null ? `${impliedProb.toFixed(1)}%` : '—',
      provenance: 'Two-way multiplicative vigorish removal',
    });

    // Step 3: Model / Historical Probability
    arithmeticSteps.push({
      step: 3,
      name: 'Model & Historical Cover Rate',
      formula: 'Cover Frequency = (Full Wins + 0.5 * Half Wins) / Evaluated Matches',
      result: modelProb !== null ? `${modelProb.toFixed(1)}% (N = ${market.sampleSize})` : '—',
      provenance: `${market.provenance.datasetVersion} (${market.provenance.dateRange})`,
    });

    // Step 4: Net Edge Calculation
    arithmeticSteps.push({
      step: 4,
      name: 'Net Edge Derivation',
      formula: 'Edge (pp) = Model Probability (%) - Implied Probability (%)',
      result: edge !== null ? `${edge > 0 ? '+' : ''}${edge.toFixed(1)} percentage points` : '—',
      provenance: 'Salmo Quantitative Valuation Engine',
    });

    // Step 5: Data Quality & Validation Gate
    arithmeticSteps.push({
      step: 5,
      name: 'Data Integrity & Lifecycle Stage',
      formula: 'Gate criteria: Sample >= 20, Real Odds present, Leak-free verification',
      result: `${market.dataQuality} • ${market.validationStage}`,
      provenance: market.provenance.validationStatus,
    });

    // Step 6: Decision Classification
    arithmeticSteps.push({
      step: 6,
      name: 'Policy Status Badge',
      formula: 'GREEN: Edge >= +3.0 pp, N >= 40 | YELLOW: Edge >= +0.5 pp | RED: Edge < 0 | GREY: Incomplete',
      result: `● ${market.badge} — ${market.statusLabel}`,
      provenance: market.reason,
    });

    return {
      market: market.marketType,
      line: market.lineLabel,
      historicalSample: market.sampleSize,
      observedOdds: odds,
      modelProbabilityPct: modelProb,
      impliedProbabilityPct: impliedProb,
      edgePercentagePoints: edge,
      dataQuality: market.dataQuality,
      validationStage: market.validationStage,
      decisionBadge: market.badge,
      arithmeticSteps,
    };
  }
}

