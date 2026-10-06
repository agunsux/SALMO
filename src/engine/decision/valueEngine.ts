// SALMO.DEV — Canonical Value Engine & Qualification Gate
// Authoritative single source of truth for:
// - Two-way de-vigging against Pinnacle sharp reference
// - Net edge calculation (P_model - P_devig)
// - Settlement-aware Expected Value (EV) for AH, OU, BTTS
// - 4-Factor composite signal robustness score (0 - 100), NOT win rate
// - 7-Factor composite qualification gate for LAYAK / PANTAU / LEWATI
// Migrated from HandicapLab validated quant engine.

export type ValueVerdict = 'LAYAK' | 'PANTAU' | 'LEWATI';

export type ValueValidationStatus =
  | 'VALUE_CANDIDATE'
  | 'PROVISIONAL_EDGE'
  | 'NO_EDGE'
  | 'MARGINAL_EV'
  | 'NEGATIVE_EV'
  | 'INSUFFICIENT_MODEL'
  | 'STALE_ODDS'
  | 'INVALID_MARKET_SPREAD'
  | 'INCOMPLETE_METADATA'
  | 'CIRCULARITY_VIOLATION'
  | 'TEMPORAL_LEAKAGE';

export interface ConfidenceBreakdown {
  sampleSupport: number; // 0 - 35 pts
  freshness: number;     // 0 - 25 pts
  marketSpread: number;  // 0 - 20 pts
  edgeDepth: number;     // 0 - 20 pts
}

export interface ValueEngineSelectionInput {
  selection: string;
  market: 'AH' | 'OU' | 'BTTS';
  line: number | null;
  modelProbability: number; // 0 to 1
  ahBreakdown?: {
    win: number;
    halfWin: number;
    push: number;
    halfLoss: number;
    loss: number;
  };
  pinnacleOdds: {
    sideOdds: number;
    oppositeOdds: number;
  };
  sampleSizeHome: number;
  sampleSizeAway: number;
  oddsTimestampUtc: string;
  predictionTimestampUtc: string;
  kickoffUtc: string;
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  modelStatus: 'FIXTURE_SPECIFIC' | 'INSUFFICIENT_MODEL';
  oddsLeakedToModel?: boolean;
}

export interface ValueEvaluationResult {
  market: 'AH' | 'OU' | 'BTTS';
  selection: string;
  line: number | null;
  modelProbability: number;
  marketProbability: number;
  fairOdds: number;
  marketOdds: number;
  overround: number;
  edge: number;
  expectedValue: number;
  kellyFraction: number;
  confidence: number;
  confidenceBreakdown: ConfidenceBreakdown;
  verdict: ValueVerdict;
  validationStatus: ValueValidationStatus;
  rejectionReason: string | null;
  passedGates: {
    modelValid: boolean;
    oddsFresh: boolean;
    pinnacleReferenceValid: boolean;
    noCircularity: boolean;
    edgeThreshold: boolean;
    evThreshold: boolean;
    dataCompleteness: boolean;
  };
  actionable: boolean;
}

export const WHITELIST_LEAGUES: readonly string[] = [
  'premier league',
  'english premier league',
  'epl',
  'championship',
  'serie a',
  'bundesliga',
  'la liga',
  'ligue 1',
];

export class ValueEngine {
  public static readonly MIN_EDGE_THRESHOLD = 0.020; // +2.0%
  public static readonly MIN_EV_THRESHOLD = 0.020;   // +2.0%
  public static readonly MIN_OVERROUND = 1.005;      // 0.5% margin
  public static readonly MAX_OVERROUND = 1.080;      // 8.0% margin
  public static readonly MAX_ODDS_AGE_MINUTES = 180; // 3 hours
  public static readonly MIN_SAMPLE_SIZE = 3;        // Finished matches per team
  public static readonly KELLY_FRACTION_CAP = 0.050; // 5% max bankroll stake

  /**
   * Two-way multiplicative margin removal (de-vigging).
   */
  public static devigTwoWay(
    odds1: number,
    odds2: number
  ): {
    pA: number;
    pB: number;
    overround: number;
    valid: boolean;
    reason: string | null;
  } {
    if (
      !odds1 ||
      !odds2 ||
      isNaN(odds1) ||
      isNaN(odds2) ||
      odds1 <= 1.01 ||
      odds2 <= 1.01
    ) {
      return {
        pA: 0.5,
        pB: 0.5,
        overround: 1.0,
        valid: false,
        reason: 'Market odds <= 1.01 or invalid',
      };
    }

    const q1 = 1 / odds1;
    const q2 = 1 / odds2;
    const overround = q1 + q2;

    if (overround < this.MIN_OVERROUND || overround > this.MAX_OVERROUND) {
      return {
        pA: Number((q1 / overround).toFixed(4)),
        pB: Number((q2 / overround).toFixed(4)),
        overround: Number(overround.toFixed(4)),
        valid: false,
        reason: `Overround ${overround.toFixed(4)} outside sharp bounds [${this.MIN_OVERROUND}, ${this.MAX_OVERROUND}]`,
      };
    }

    return {
      pA: Number((q1 / overround).toFixed(4)),
      pB: Number((q2 / overround).toFixed(4)),
      overround: Number(overround.toFixed(4)),
      valid: true,
      reason: null,
    };
  }

  /**
   * Settlement-aware Expected Value for Asian Handicap.
   * EV = win * (O - 1) + halfWin * 0.5 * (O - 1) + push * 0 - halfLoss * 0.5 - loss * 1.0
   */
  public static calculateAhExpectedValue(
    odds: number,
    breakdown: {
      win: number;
      halfWin: number;
      push: number;
      halfLoss: number;
      loss: number;
    }
  ): number {
    if (odds <= 1.0) return 0;
    const b = odds - 1.0;
    return (
      breakdown.win * b +
      breakdown.halfWin * 0.5 * b -
      breakdown.halfLoss * 0.5 -
      breakdown.loss * 1.0
    );
  }

  /**
   * 4-Factor composite Confidence Score (0 - 100).
   * STRICTLY decoupled from win probability.
   */
  public static calculateConfidence(params: {
    sampleSizeHome: number;
    sampleSizeAway: number;
    ageMinutes: number;
    overround: number;
    edge: number;
    isSufficient: boolean;
  }): { score: number; breakdown: ConfidenceBreakdown } {
    if (!params.isSufficient) {
      const minSample = Math.min(params.sampleSizeHome, params.sampleSizeAway);
      const sampleSupport = Math.min(7, Math.max(0, Math.round((minSample / 10) * 35)));
      return {
        score: sampleSupport,
        breakdown: { sampleSupport, freshness: 0, marketSpread: 0, edgeDepth: 0 },
      };
    }

    // 1. Sample Support (0 - 35 pts)
    const minSample = Math.min(params.sampleSizeHome, params.sampleSizeAway);
    let sampleSupport = 0;
    if (minSample >= 10) {
      sampleSupport = 35;
    } else if (minSample >= 3) {
      sampleSupport = Math.round((minSample / 10) * 35);
    }

    // 2. Odds Freshness (0 - 25 pts)
    let freshness = 0;
    if (params.ageMinutes <= 5) {
      freshness = 25;
    } else if (params.ageMinutes <= this.MAX_ODDS_AGE_MINUTES) {
      freshness = Math.round(25 * (1 - params.ageMinutes / this.MAX_ODDS_AGE_MINUTES));
    }

    // 3. Market Spread Tightness (0 - 20 pts)
    let marketSpread = 0;
    if (params.overround <= 1.030) {
      marketSpread = 20;
    } else if (params.overround <= this.MAX_OVERROUND) {
      marketSpread = Math.round(
        20 * (1 - (params.overround - 1.030) / (this.MAX_OVERROUND - 1.030))
      );
    }

    // 4. Edge Depth (0 - 20 pts)
    let edgeDepth = 0;
    if (params.edge > 0) {
      edgeDepth = Math.min(20, Math.max(0, Math.round((params.edge / 0.06) * 20)));
    }

    const total = Math.max(0, Math.min(100, sampleSupport + freshness + marketSpread + edgeDepth));

    return {
      score: total,
      breakdown: {
        sampleSupport,
        freshness,
        marketSpread,
        edgeDepth,
      },
    };
  }

  /**
   * Evaluates a single market selection against the 7-Factor Composite Value Gate.
   */
  public static evaluateSelection(input: ValueEngineSelectionInput): ValueEvaluationResult {
    const tOdds = new Date(input.oddsTimestampUtc).getTime();
    const tPred = new Date(input.predictionTimestampUtc).getTime();
    const tKick = new Date(input.kickoffUtc).getTime();

    const ageMinutes = (tPred - tOdds) / (60 * 1000);

    // GATE 1: MODEL_VALID
    const minSample = Math.min(input.sampleSizeHome, input.sampleSizeAway);
    const modelValid =
      input.modelStatus === 'FIXTURE_SPECIFIC' && minSample >= this.MIN_SAMPLE_SIZE;

    // GATE 2: ODDS_FRESH
    const noFutureLeakage = tOdds <= tPred && tPred < tKick;
    const oddsFresh = noFutureLeakage && ageMinutes >= 0 && ageMinutes <= this.MAX_ODDS_AGE_MINUTES;

    // GATE 3: PINNACLE_REFERENCE_VALID
    const devig = this.devigTwoWay(
      input.pinnacleOdds.sideOdds,
      input.pinnacleOdds.oppositeOdds
    );
    const pinnacleReferenceValid = devig.valid;

    // GATE 4: NO_CIRCULARITY
    const noCircularity = !input.oddsLeakedToModel;

    // GATE 5: EDGE_THRESHOLD
    const marketProb = devig.pA;
    const rawEdge = input.modelProbability - marketProb;
    const edge = modelValid ? Number(rawEdge.toFixed(4)) : 0;
    const edgeThreshold = modelValid && edge >= this.MIN_EDGE_THRESHOLD;

    // GATE 6: EV_THRESHOLD (Settlement-Aware)
    let rawEv = 0;
    if (input.market === 'AH' && input.ahBreakdown) {
      rawEv = this.calculateAhExpectedValue(input.pinnacleOdds.sideOdds, input.ahBreakdown);
    } else {
      rawEv = input.modelProbability * input.pinnacleOdds.sideOdds - 1.0;
    }

    const expectedValue = modelValid ? Number(rawEv.toFixed(4)) : 0;
    const evThreshold = modelValid && expectedValue >= this.MIN_EV_THRESHOLD;

    // GATE 7: DATA_COMPLETENESS
    const leagueLower = (input.league || '').toLowerCase().trim();
    const isWhitelistedLeague =
      WHITELIST_LEAGUES.some((l) => leagueLower.includes(l)) ||
      leagueLower.startsWith('epl') ||
      leagueLower.startsWith('premier');

    const hasTeamIdentity =
      Boolean(input.homeTeam) &&
      Boolean(input.awayTeam) &&
      input.homeTeam.trim() !== '' &&
      input.awayTeam.trim() !== '';

    const hasValidFixtureId =
      Boolean(input.fixtureId) &&
      input.fixtureId.trim() !== '' &&
      !input.fixtureId.toLowerCase().startsWith('mock-') &&
      !input.fixtureId.toLowerCase().startsWith('synth-') &&
      !input.fixtureId.toLowerCase().startsWith('fake-');

    const dataCompleteness =
      isWhitelistedLeague && hasTeamIdentity && hasValidFixtureId;

    // CONFIDENCE SCORE
    const { score: confidence, breakdown: confidenceBreakdown } = this.calculateConfidence({
      sampleSizeHome: input.sampleSizeHome,
      sampleSizeAway: input.sampleSizeAway,
      ageMinutes: Math.max(0, ageMinutes),
      overround: devig.overround,
      edge,
      isSufficient: modelValid,
    });

    // KELLY FRACTION
    let kellyFraction = 0;
    if (modelValid && edgeThreshold && evThreshold && input.pinnacleOdds.sideOdds > 1.0) {
      const b = input.pinnacleOdds.sideOdds - 1.0;
      const fullKelly = expectedValue / b;
      const quarterKelly = 0.25 * fullKelly;
      kellyFraction = Number(
        Math.min(this.KELLY_FRACTION_CAP, Math.max(0, quarterKelly)).toFixed(4)
      );
    }

    // BTTS INVARIANT: BTTS remains research-only and must NEVER be LAYAK
    const isBtts = input.market === 'BTTS';

    const allGatesPassed =
      modelValid &&
      oddsFresh &&
      pinnacleReferenceValid &&
      noCircularity &&
      edgeThreshold &&
      evThreshold &&
      dataCompleteness &&
      !isBtts;

    const passedGates = {
      modelValid,
      oddsFresh,
      pinnacleReferenceValid,
      noCircularity,
      edgeThreshold,
      evThreshold,
      dataCompleteness,
    };

    let verdict: ValueVerdict = 'LEWATI';
    let validationStatus: ValueValidationStatus = 'NO_EDGE';
    let rejectionReason: string | null = null;
    let actionable = false;

    if (allGatesPassed) {
      verdict = 'LAYAK';
      validationStatus = 'VALUE_CANDIDATE';
      actionable = true;
      rejectionReason = null;
    } else {
      actionable = false;
      if (isBtts) {
        verdict = edge > 0 ? 'PANTAU' : 'LEWATI';
        validationStatus = 'PROVISIONAL_EDGE';
        rejectionReason = 'BTTS model is calibrated for research only (UNVALIDATED).';
      } else if (!modelValid) {
        verdict = 'LEWATI';
        validationStatus = 'INSUFFICIENT_MODEL';
        rejectionReason = `INSUFFICIENT_MODEL: Sample size < ${this.MIN_SAMPLE_SIZE}`;
      } else if (!noFutureLeakage) {
        verdict = 'LEWATI';
        validationStatus = 'TEMPORAL_LEAKAGE';
        rejectionReason = `TEMPORAL_LEAKAGE: Prediction timestamp violates boundary`;
      } else if (!oddsFresh) {
        verdict = 'LEWATI';
        validationStatus = 'STALE_ODDS';
        rejectionReason = `STALE_ODDS: Odds age ${ageMinutes.toFixed(1)}m exceeds threshold`;
      } else if (!pinnacleReferenceValid) {
        verdict = 'LEWATI';
        validationStatus = 'INVALID_MARKET_SPREAD';
        rejectionReason = `INVALID_MARKET_SPREAD: ${devig.reason || 'Overround out of bounds'}`;
      } else if (!noCircularity) {
        verdict = 'LEWATI';
        validationStatus = 'CIRCULARITY_VIOLATION';
        rejectionReason = 'CIRCULARITY_VIOLATION: Market odds detected in model intensity layer';
      } else if (!dataCompleteness) {
        verdict = 'LEWATI';
        validationStatus = 'INCOMPLETE_METADATA';
        rejectionReason = `INCOMPLETE_METADATA: League '${input.league}' not whitelisted or invalid entity identifier`;
      } else if (!edgeThreshold) {
        verdict = edge > 0 ? 'PANTAU' : 'LEWATI';
        validationStatus = 'NO_EDGE';
        rejectionReason = edge <= 0
          ? `NEGATIVE_OR_ZERO_EDGE: Edge ${(edge * 100).toFixed(2)}% <= 0%`
          : `EDGE_BELOW_THRESHOLD: Edge ${(edge * 100).toFixed(2)}% < ${(this.MIN_EDGE_THRESHOLD * 100).toFixed(1)}%`;
      } else if (!evThreshold) {
        verdict = expectedValue > 0 ? 'PANTAU' : 'LEWATI';
        validationStatus = expectedValue <= 0 ? 'NEGATIVE_EV' : 'MARGINAL_EV';
        rejectionReason = expectedValue <= 0
          ? `NEGATIVE_EV: EV ${(expectedValue * 100).toFixed(2)}% <= 0%`
          : `MARGINAL_EV: EV ${(expectedValue * 100).toFixed(2)}% < ${(this.MIN_EV_THRESHOLD * 100).toFixed(1)}%`;
      }
    }

    const fairOdds = input.modelProbability > 0 ? Number((1 / input.modelProbability).toFixed(3)) : 999.0;

    return {
      market: input.market,
      selection: input.selection,
      line: input.line,
      modelProbability: Number(input.modelProbability.toFixed(4)),
      marketProbability: Number(marketProb.toFixed(4)),
      fairOdds,
      marketOdds: Number(input.pinnacleOdds.sideOdds.toFixed(3)),
      overround: devig.overround,
      edge,
      expectedValue,
      kellyFraction,
      confidence,
      confidenceBreakdown,
      verdict,
      validationStatus,
      rejectionReason,
      passedGates,
      actionable,
    };
  }
}
