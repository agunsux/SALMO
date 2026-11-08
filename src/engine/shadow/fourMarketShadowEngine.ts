// SALMO.DEV — Four-Market Shadow Prediction & Validation Engine
// Implements disciplined, quota-aware research and prediction for:
// 1. Asian Handicap (AH) — Core Candidate Prediction (Prioritas 1)
// 2. Moneyline (1X2) — Research & Model Validation (Prioritas 2)
// 3. Over/Under Goals (OU) — Core Candidate Prediction (Prioritas 3)
// 4. BTTS — Research-Only (Prioritas 4)
//
// Strict Product Positioning:
// "Fewer Markets. Better Evidence. Every Prediction Accounted For."

export type MarketType = 'AH' | '1X2' | 'OU' | 'BTTS';
export type MarketRole = 'CORE_CANDIDATE' | 'RESEARCH_ONLY' | 'VALIDATION_PENDING';
export type PredictionStatus = 'QUALIFIED_VALUE_BET' | 'LEWATI' | 'PANTAU' | 'NO_MARKET_DATA' | 'RESEARCH_ONLY';
export type SettlementOutcome = 'WIN' | 'HALF_WIN' | 'PUSH' | 'HALF_LOSS' | 'LOSS' | 'VOID';

export interface ShadowMatchInput {
  canonicalMatchId: string;
  providerFixtureId: number;
  competition: string;
  season: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  homeExpectedGoals: number; // e.g. Dixon-Coles lambda
  awayExpectedGoals: number; // e.g. Dixon-Coles mu
}

export interface ShadowOddsInput {
  market: MarketType;
  selection: string;
  handicapLine?: number;
  totalLine?: number;
  bookmaker: 'Bet365';
  odds: number;
  oppositeOdds?: number; // for 2-way devig
  drawOdds?: number;     // for 3-way devig
  awayOdds?: number;     // for 3-way devig
  capturedAt: string;
  isClosing?: boolean;
}

export interface ShadowPredictionRecord {
  predictionId: string;
  canonicalMatchId: string;
  fixtureId: number;
  competition: string;
  kickoffAt: string;
  market: MarketType;
  marketRole: MarketRole;
  selection: string;
  handicapLine: number | null;
  totalLine: number | null;
  bookmaker: 'Bet365';
  oddsAtSignal: number;
  modelProbability: number;     // 0 - 100%
  fairOdds: number;
  impliedProbability: number;   // 0 - 100%
  devigProbability: number;     // 0 - 100%
  expectedValue: number;        // percentage e.g. +3.5%
  confidence: number;           // 0 - 100 scale
  predictionStatus: PredictionStatus;
  verdict: 'BET' | 'LEWATI' | 'PANTAU' | 'RESEARCH_OBSERVATION';
  reasoning: string;
  closingLine: number | null;
  closingOdds: number | null;
  clvNoVig: number | null;
  clvRawRatio: number | null;
  clvStatus: 'CALCULATED' | 'LINE_MOVED' | 'NO_CLOSING_SNAPSHOT' | 'INVALID_ODDS';
  provider: '5dollar_free';
  providerFixtureId: number;
  capturedAt: string;
  modelVersion: string;
  featureVersion: string;
  // Settlement fields
  homeGoals: number | null;
  awayGoals: number | null;
  settlementStatus: 'PENDING' | 'SETTLED' | 'VOID';
  settlementResult: SettlementOutcome | null;
  profitUnits: number;
  stakeUnits: number;
  settledAt: string | null;
}

export class FourMarketShadowEngine {
  public static readonly MODEL_VERSION = 'salmo-dixon-coles-poisson-v1.2';
  public static readonly FEATURE_VERSION = 'fivedollar-prematch-v1.0';

  /**
   * Poisson probability calculation: P(k; lambda) = (lambda^k * e^-lambda) / k!
   */
  private static poisson(k: number, lambda: number): number {
    let factorial = 1;
    for (let i = 2; i <= k; i++) factorial *= i;
    return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial;
  }

  /**
   * Generate 6x6 score probability matrix from expected goals.
   */
  public static computeScoreGrid(lambdaHome: number, muAway: number): number[][] {
    const grid: number[][] = [];
    for (let h = 0; h <= 6; h++) {
      grid[h] = [];
      for (let a = 0; a <= 6; a++) {
        grid[h][a] = this.poisson(h, lambdaHome) * this.poisson(a, muAway);
      }
    }
    return grid;
  }

  /**
   * Generate shadow prediction for a match and odds snapshot.
   */
  public static evaluateMatch(
    match: ShadowMatchInput,
    oddsSnapshots: ShadowOddsInput[]
  ): ShadowPredictionRecord[] {
    const grid = this.computeScoreGrid(match.homeExpectedGoals, match.awayExpectedGoals);
    const predictions: ShadowPredictionRecord[] = [];

    for (const odds of oddsSnapshots) {
      const record = this.evaluateSingleMarket(match, odds, grid);
      predictions.push(record);
    }

    return predictions;
  }

  private static evaluateSingleMarket(
    match: ShadowMatchInput,
    odds: ShadowOddsInput,
    grid: number[][]
  ): ShadowPredictionRecord {
    let modelProb = 0;
    let marketRole: MarketRole = 'RESEARCH_ONLY';
    let predictionStatus: PredictionStatus = 'RESEARCH_ONLY';
    let verdict: 'BET' | 'LEWATI' | 'PANTAU' | 'RESEARCH_OBSERVATION' = 'RESEARCH_OBSERVATION';
    let reasoning = '';

    // 1. Compute Model Probability based on Market
    if (odds.market === 'AH') {
      marketRole = 'CORE_CANDIDATE';
      const line = odds.handicapLine ?? 0;
      // Prob that (Home + line) > Away
      let homeCoverProb = 0;
      let pushProb = 0;
      for (let h = 0; h <= 6; h++) {
        for (let a = 0; a <= 6; a++) {
          const diff = h - a + line;
          if (diff > 0) homeCoverProb += grid[h][a];
          else if (diff === 0) pushProb += grid[h][a];
        }
      }
      // Quarter line adjustment
      modelProb = (homeCoverProb + 0.5 * pushProb) * 100;
    } else if (odds.market === 'OU') {
      marketRole = 'CORE_CANDIDATE';
      const line = odds.totalLine ?? 2.5;
      const isOver = odds.selection.toUpperCase().includes('OVER');
      let overProb = 0;
      let pushProb = 0;
      for (let h = 0; h <= 6; h++) {
        for (let a = 0; a <= 6; a++) {
          const tot = h + a;
          if (tot > line) overProb += grid[h][a];
          else if (tot === line) pushProb += grid[h][a];
        }
      }
      modelProb = isOver ? (overProb + 0.5 * pushProb) * 100 : (1 - overProb - 0.5 * pushProb) * 100;
    } else if (odds.market === '1X2') {
      marketRole = 'VALIDATION_PENDING'; // Prioritas 2: Needs independent validation
      let homeProb = 0;
      let drawProb = 0;
      let awayProb = 0;
      for (let h = 0; h <= 6; h++) {
        for (let a = 0; a <= 6; a++) {
          if (h > a) homeProb += grid[h][a];
          else if (h === a) drawProb += grid[h][a];
          else awayProb += grid[h][a];
        }
      }
      const sel = odds.selection.toUpperCase();
      if (sel === 'HOME') modelProb = homeProb * 100;
      else if (sel === 'DRAW') modelProb = drawProb * 100;
      else modelProb = awayProb * 100;
    } else if (odds.market === 'BTTS') {
      marketRole = 'RESEARCH_ONLY'; // Prioritas 4: Strictly research only
      let bttsYesProb = 0;
      for (let h = 1; h <= 6; h++) {
        for (let a = 1; a <= 6; a++) {
          bttsYesProb += grid[h][a];
        }
      }
      const isYes = odds.selection.toUpperCase().includes('YES');
      modelProb = isYes ? bttsYesProb * 100 : (1 - bttsYesProb) * 100;
    }

    modelProb = Number(modelProb.toFixed(2));
    const fairOdds = modelProb > 0 ? Number((100 / modelProb).toFixed(3)) : 999.0;
    const impliedProb = Number(((1 / odds.odds) * 100).toFixed(2));

    // 2. Devigging calculation
    let devigProb = impliedProb;
    if ((odds.market === 'AH' || odds.market === 'OU' || odds.market === 'BTTS') && odds.oppositeOdds) {
      const invSide = 1 / odds.odds;
      const invOther = 1 / odds.oppositeOdds;
      const sum = invSide + invOther;
      if (sum > 0) devigProb = Number(((invSide / sum) * 100).toFixed(2));
    } else if (odds.market === '1X2' && odds.drawOdds && odds.awayOdds) {
      const invH = 1 / odds.odds;
      const invD = 1 / odds.drawOdds;
      const invA = 1 / odds.awayOdds;
      const sum = invH + invD + invA;
      if (sum > 0) devigProb = Number(((invH / sum) * 100).toFixed(2));
    }

    // 3. Expected Value: EV = (modelProb / 100 * odds) - 1
    const ev = Number((((modelProb / 100) * odds.odds - 1) * 100).toFixed(2));

    // 4. Confidence heuristic (sample size, agreement, market efficiency)
    let confidence = 50;
    if (odds.market === 'AH' || odds.market === 'OU') {
      confidence = Math.min(85, Math.max(30, Math.round(50 + (modelProb - devigProb) * 2)));
    } else if (odds.market === '1X2') {
      confidence = Math.min(60, Math.max(20, Math.round(40 + (modelProb - devigProb) * 1.5)));
    } else {
      confidence = 0; // BTTS has 0 confidence until validation
    }

    // 5. Qualification Gate
    if (odds.market === 'BTTS') {
      predictionStatus = 'RESEARCH_ONLY';
      verdict = 'RESEARCH_OBSERVATION';
      reasoning = 'BTTS is strictly RESEARCH_ONLY. Disallowed from actionable signals until historical model validation passes.';
    } else if (odds.market === '1X2') {
      predictionStatus = 'RESEARCH_ONLY';
      verdict = 'RESEARCH_OBSERVATION';
      reasoning = `Moneyline (1X2) model validation pending. EV: ${ev}%, Model: ${modelProb}%, Bet365: ${odds.odds}. Requires independent calibration before promotion.`;
    } else {
      // AH and OU Core Markets
      if (ev >= 2.0 && confidence >= 65) {
        predictionStatus = 'QUALIFIED_VALUE_BET';
        verdict = 'BET';
        reasoning = `Qualified value signal: Model fair ${fairOdds} vs Bet365 ${odds.odds}. Edge: ${(modelProb - devigProb).toFixed(1)}%, EV: +${ev}%, Confidence: ${confidence}/100.`;
      } else if (ev > 0) {
        predictionStatus = 'PANTAU';
        verdict = 'PANTAU';
        reasoning = `Marginal positive EV (+${ev}%), but below 65 confidence threshold (${confidence}/100).`;
      } else {
        predictionStatus = 'LEWATI';
        verdict = 'LEWATI';
        reasoning = `Negative or zero EV (${ev}%). No statistical edge found.`;
      }
    }

    const predictionId = `pred_${match.canonicalMatchId}_${odds.market}_${odds.selection.replace(/\s+/g, '_')}`;

    return {
      predictionId,
      canonicalMatchId: match.canonicalMatchId,
      fixtureId: match.providerFixtureId,
      competition: match.competition,
      kickoffAt: match.kickoffAt,
      market: odds.market,
      marketRole,
      selection: odds.selection,
      handicapLine: odds.handicapLine ?? null,
      totalLine: odds.totalLine ?? null,
      bookmaker: 'Bet365',
      oddsAtSignal: odds.odds,
      modelProbability: modelProb,
      fairOdds,
      impliedProbability: impliedProb,
      devigProbability: devigProb,
      expectedValue: ev,
      confidence,
      predictionStatus,
      verdict,
      reasoning,
      closingLine: null,
      closingOdds: null,
      clvNoVig: null,
      clvRawRatio: null,
      clvStatus: 'NO_CLOSING_SNAPSHOT',
      provider: '5dollar_free',
      providerFixtureId: match.providerFixtureId,
      capturedAt: odds.capturedAt,
      modelVersion: this.MODEL_VERSION,
      featureVersion: this.FEATURE_VERSION,
      homeGoals: null,
      awayGoals: null,
      settlementStatus: 'PENDING',
      settlementResult: null,
      profitUnits: 0,
      stakeUnits: 0,
      settledAt: null,
    };
  }

  /**
   * Settle a shadow prediction record deterministically with official final score.
   */
  public static settleRecord(
    record: ShadowPredictionRecord,
    homeGoals: number,
    awayGoals: number
  ): ShadowPredictionRecord {
    const updated = { ...record };
    updated.homeGoals = homeGoals;
    updated.awayGoals = awayGoals;
    updated.settlementStatus = 'SETTLED';
    updated.settledAt = new Date().toISOString();

    const h = homeGoals;
    const a = awayGoals;
    let outcome: SettlementOutcome = 'LOSS';

    if (record.market === 'AH') {
      const line = record.handicapLine ?? 0;
      const isAway = record.selection.toLowerCase().includes('away');
      const sideGoals = isAway ? a : h;
      const oppGoals = isAway ? h : a;
      const effectiveDiff = sideGoals - oppGoals + line;

      if (effectiveDiff > 0.25) outcome = 'WIN';
      else if (effectiveDiff === 0.25) outcome = 'HALF_WIN';
      else if (effectiveDiff === 0) outcome = 'PUSH';
      else if (effectiveDiff === -0.25) outcome = 'HALF_LOSS';
      else outcome = 'LOSS';
    } else if (record.market === 'OU') {
      const line = record.totalLine ?? 2.5;
      const isOver = record.selection.toUpperCase().includes('OVER');
      const tot = h + a;
      const diff = isOver ? tot - line : line - tot;

      if (diff > 0.25) outcome = 'WIN';
      else if (diff === 0.25) outcome = 'HALF_WIN';
      else if (diff === 0) outcome = 'PUSH';
      else if (diff === -0.25) outcome = 'HALF_LOSS';
      else outcome = 'LOSS';
    } else if (record.market === '1X2') {
      const sel = record.selection.toUpperCase();
      if (h > a && sel === 'HOME') outcome = 'WIN';
      else if (h === a && sel === 'DRAW') outcome = 'WIN';
      else if (h < a && sel === 'AWAY') outcome = 'WIN';
      else outcome = 'LOSS';
    } else if (record.market === 'BTTS') {
      const isYes = record.selection.toUpperCase().includes('YES');
      const bothScored = h > 0 && a > 0;
      if ((isYes && bothScored) || (!isYes && !bothScored)) outcome = 'WIN';
      else outcome = 'LOSS';
    }

    updated.settlementResult = outcome;

    // Stake accounting: Only QUALIFIED bets receive stake accounting; Research-only stays 0 stake
    if (record.predictionStatus === 'QUALIFIED_VALUE_BET') {
      updated.stakeUnits = 1.0;
      if (outcome === 'WIN') updated.profitUnits = Number((record.oddsAtSignal - 1).toFixed(4));
      else if (outcome === 'HALF_WIN') updated.profitUnits = Number(((record.oddsAtSignal - 1) / 2).toFixed(4));
      else if (outcome === 'PUSH') updated.profitUnits = 0.0;
      else if (outcome === 'HALF_LOSS') updated.profitUnits = -0.5;
      else if (outcome === 'LOSS') updated.profitUnits = -1.0;
      else updated.profitUnits = 0.0;
    } else {
      updated.stakeUnits = 0.0;
      updated.profitUnits = 0.0;
    }

    return updated;
  }

  /**
   * Apply Bet365 Closing Line Value (CLV) to a prediction record.
   */
  public static applyClosingOdds(
    record: ShadowPredictionRecord,
    closingLine: number | null,
    closingOdds: number,
    closingOppositeOdds?: number
  ): ShadowPredictionRecord {
    const updated = { ...record };
    updated.closingLine = closingLine;
    updated.closingOdds = closingOdds;

    // Same-line invariant
    const targetLine = record.handicapLine ?? record.totalLine ?? null;
    if (targetLine !== null && closingLine !== null && Math.abs(targetLine - closingLine) > 0.0001) {
      updated.clvStatus = 'LINE_MOVED';
      updated.clvNoVig = null;
      updated.clvRawRatio = null;
      return updated;
    }

    // 1. Raw price ratio: odds_signal / odds_closing - 1
    updated.clvRawRatio = Number(((record.oddsAtSignal / closingOdds - 1) * 100).toFixed(2));

    // 2. Multiplicative no-vig CLV
    if (closingOppositeOdds && closingOppositeOdds > 1.0) {
      const invSide = 1 / closingOdds;
      const invOther = 1 / closingOppositeOdds;
      const overround = invSide + invOther;
      if (overround > 0) {
        const closingNovigProb = invSide / overround;
        const clv = record.oddsAtSignal * closingNovigProb - 1;
        updated.clvNoVig = Number((clv * 100).toFixed(2));
        updated.clvStatus = 'CALCULATED';
      }
    } else {
      updated.clvStatus = 'CALCULATED';
      updated.clvNoVig = updated.clvRawRatio; // Fallback to raw when opposite missing
    }

    return updated;
  }
}
