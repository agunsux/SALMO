// SALMO.DEV — Binary No-Push Per-Leg Brier Scoring Engine (Hotfix H8)
// Replaces non-standard fractional outcome coding (HALF_WIN=0.75, PUSH=0.5, HALF_LOSS=0.25).
// Rules:
// 1. Half-lines (.5) and integer lines (.0) have 1 leg (stakeWeight = 1.0).
// 2. Quarter-lines (.25, .75) decompose into two half-stake legs: [line - 0.25, line + 0.25] (stakeWeight = 0.5 each).
// 3. Each leg is scored against its own conditional non-push win probability from the 11x11 Dixon-Coles score grid:
//    pLeg = pWin / (pWin + pLoss) (which equals pWin identically on all .5 half-lines).
// 4. Push legs (actual margin == 0) are strictly EXCLUDED from Brier scoring (never coded as 0.5).

import { buildScoreGrid, SCORE_GRID_MAX_GOALS } from '../probability/scoreGrid';
import { CompetitionProfileEngine } from '../features/competitionProfile';
import { resolveTeamRating } from '../features/teamRatings';
import { QuarterLineSettler } from '../ah/quarterLineSettler';

export interface BrierLegEvaluation {
  legIndex: number;
  legLine: number;
  stakeWeight: number; // 1.0 for single-line bet, 0.5 for each half-leg of a quarter-line bet
  pWinRaw: number;
  pPushRaw: number;
  pLossRaw: number;
  pLegNoPush: number; // Conditional non-push win probability pWin / (pWin + pLoss) from score grid
  legOutcome: 'WIN' | 'LOSS' | 'PUSH';
  excludedPush: boolean;
  binaryOutcome: 0 | 1 | null; // null when excludedPush === true
  brierSqError: number | null; // (pLegNoPush - binaryOutcome)^2, null when excludedPush === true
}

export interface PositionBrierDecomposition {
  positionId?: string;
  fixtureId?: string;
  market: 'AH' | 'OU';
  line: number;
  isQuarterLine: boolean;
  legs: BrierLegEvaluation[];
  nTotalLegs: number;
  nResolvedLegs: number;
  nExcludedPushLegs: number;
  totalLegCount: number;
  resolvedLegCount: number;
  excludedPushLegCount: number;
  resolvedStakeWeight: number;
  positionBrierMean: number | null; // Mean over resolved legs of this position (null if all legs pushed)
  positionBrierStakeWeightedMean: number | null;
}

export interface EvaluatePositionBrierInput {
  positionId?: string;
  fixtureId?: string;
  market?: 'AH' | 'OU' | string;
  marketType?: 'AH' | 'OU' | string;
  line: number;
  selection: string;
  homeTeam?: string;
  awayTeam?: string;
  league?: string;
  homeGoals: number;
  awayGoals: number;
  scoreGrid?: number[][];
  lambdaHome?: number;
  lambdaAway?: number;
  rho?: number;
  fallbackProbability?: number | null;
  fallbackModelProbDecimal?: number | null;
}

/**
 * Resolves the 11x11 Dixon-Coles score grid for a fixture from explicit lambdas or team ratings.
 */
export function resolveFixtureScoreGrid(params: {
  homeTeam?: string;
  awayTeam?: string;
  league?: string;
  lambdaHome?: number;
  lambdaAway?: number;
  rho?: number;
}): { grid: number[][]; lambdaHome: number; lambdaAway: number; rho: number } {
  if (
    typeof params.lambdaHome === 'number' &&
    params.lambdaHome > 0 &&
    typeof params.lambdaAway === 'number' &&
    params.lambdaAway > 0
  ) {
    const rho = typeof params.rho === 'number' ? params.rho : -0.06;
    return {
      grid: buildScoreGrid(params.lambdaHome, params.lambdaAway, rho),
      lambdaHome: params.lambdaHome,
      lambdaAway: params.lambdaAway,
      rho,
    };
  }

  const leagueName = params.league || 'Premier League';
  const profile = CompetitionProfileEngine.getProfileForLeague(leagueName);
  const homeRating = params.homeTeam
    ? resolveTeamRating(params.homeTeam, undefined, false, leagueName)
    : null;
  const awayRating = params.awayTeam
    ? resolveTeamRating(params.awayTeam, undefined, false, leagueName)
    : null;

  const leagueAvgGoals = profile.goalEnvironment || 2.65;
  const homeAdv = profile.homeAdvantage || 0.55;
  const homeBase = leagueAvgGoals * homeAdv;
  const awayBase = leagueAvgGoals * (1 - homeAdv);
  const rho = typeof params.rho === 'number' ? params.rho : (profile.defaultRho ?? -0.06);

  let lambdaHome: number;
  let lambdaAway: number;

  if (profile.code === 'EPL' && (!homeRating || !awayRating)) {
    lambdaHome = 1.35;
    lambdaAway = 1.20;
  } else {
    const hAtt = homeRating?.attack_strength ?? 1.0;
    const hDef = homeRating?.defense_strength ?? 1.0;
    const aAtt = awayRating?.attack_strength ?? 1.0;
    const aDef = awayRating?.defense_strength ?? 1.0;
    lambdaHome = Number(Math.max(0.20, hAtt * aDef * homeBase).toFixed(4));
    lambdaAway = Number(Math.max(0.20, aAtt * hDef * awayBase).toFixed(4));
  }

  return {
    grid: buildScoreGrid(lambdaHome, lambdaAway, rho),
    lambdaHome,
    lambdaAway,
    rho,
  };
}

export function resolveAhSideFromSelection(
  selection: string,
  homeTeam?: string,
  awayTeam?: string
): 'home' | 'away' {
  const sel = String(selection || '').toLowerCase().trim();
  if (sel.startsWith('away') || sel.includes(' away ')) return 'away';
  if (sel.startsWith('home') || sel.includes(' home ')) return 'home';
  if (awayTeam && sel.includes(awayTeam.toLowerCase())) return 'away';
  if (homeTeam && sel.includes(homeTeam.toLowerCase())) return 'home';
  if (awayTeam) {
    const awayFirst = awayTeam.toLowerCase().split(/\s+/)[0];
    if (awayFirst && awayFirst.length >= 3 && sel.startsWith(awayFirst)) return 'away';
  }
  return 'home';
}

export function resolveOuSideFromSelection(selection: string): 'OVER' | 'UNDER' {
  const sel = String(selection || '').toUpperCase();
  return sel.includes('UNDER') ? 'UNDER' : 'OVER';
}

/**
 * Evaluates a single leg on the 11x11 score grid and settles it against (homeGoals, awayGoals).
 */
export function evaluateSingleLegOnGrid(params: {
  grid: number[][];
  market: 'AH' | 'OU';
  legLine: number;
  legIndex: number;
  stakeWeight: number;
  ahSide?: 'home' | 'away';
  ouSide?: 'OVER' | 'UNDER';
  homeGoals: number;
  awayGoals: number;
  fallbackProbability?: number | null;
}): BrierLegEvaluation {
  const { grid, market, legLine, legIndex, stakeWeight, homeGoals, awayGoals } = params;
  const maxGoals = Math.min(SCORE_GRID_MAX_GOALS, grid.length - 1);

  let pWinRaw = 0;
  let pPushRaw = 0;
  let pLossRaw = 0;

  if (market === 'AH') {
    const side = params.ahSide || 'home';
    for (let x = 0; x <= maxGoals; x++) {
      for (let y = 0; y <= maxGoals; y++) {
        const prob = grid[x]?.[y] ?? 0;
        const margin = (side === 'home' ? x - y : y - x) + legLine;
        if (margin > 1e-6) pWinRaw += prob;
        else if (Math.abs(margin) <= 1e-6) pPushRaw += prob;
        else pLossRaw += prob;
      }
    }
  } else {
    const side = params.ouSide || 'OVER';
    for (let x = 0; x <= maxGoals; x++) {
      for (let y = 0; y <= maxGoals; y++) {
        const prob = grid[x]?.[y] ?? 0;
        const tot = x + y;
        const margin = side === 'OVER' ? tot - legLine : legLine - tot;
        if (margin > 1e-6) pWinRaw += prob;
        else if (Math.abs(margin) <= 1e-6) pPushRaw += prob;
        else pLossRaw += prob;
      }
    }
  }

  const nonPushMass = pWinRaw + pLossRaw;
  let pLegNoPush =
    nonPushMass > 1e-9
      ? pWinRaw / nonPushMass
      : typeof params.fallbackProbability === 'number' && params.fallbackProbability > 0
      ? params.fallbackProbability > 1
        ? params.fallbackProbability / 100
        : params.fallbackProbability
      : 0.5;

  pLegNoPush = Number(Math.max(0.0001, Math.min(0.9999, pLegNoPush)).toFixed(4));

  // Settle actual outcome of this single non-quarter leg
  let actualMargin: number;
  if (market === 'AH') {
    const side = params.ahSide || 'home';
    actualMargin = (side === 'home' ? homeGoals - awayGoals : awayGoals - homeGoals) + legLine;
  } else {
    const side = params.ouSide || 'OVER';
    const tot = homeGoals + awayGoals;
    actualMargin = side === 'OVER' ? tot - legLine : legLine - tot;
  }

  let legOutcome: 'WIN' | 'LOSS' | 'PUSH';
  if (Math.abs(actualMargin) <= 1e-6) {
    legOutcome = 'PUSH';
  } else if (actualMargin > 1e-6) {
    legOutcome = 'WIN';
  } else {
    legOutcome = 'LOSS';
  }

  if (legOutcome === 'PUSH') {
    return {
      legIndex,
      legLine: Number(legLine.toFixed(2)),
      stakeWeight,
      pWinRaw: Number(pWinRaw.toFixed(4)),
      pPushRaw: Number(pPushRaw.toFixed(4)),
      pLossRaw: Number(pLossRaw.toFixed(4)),
      pLegNoPush,
      legOutcome: 'PUSH',
      excludedPush: true,
      binaryOutcome: null,
      brierSqError: null,
    };
  }

  const binaryOutcome: 0 | 1 = legOutcome === 'WIN' ? 1 : 0;
  const brierSqError = Number(Math.pow(pLegNoPush - binaryOutcome, 2).toFixed(6));

  return {
    legIndex,
    legLine: Number(legLine.toFixed(2)),
    stakeWeight,
    pWinRaw: Number(pWinRaw.toFixed(4)),
    pPushRaw: Number(pPushRaw.toFixed(4)),
    pLossRaw: Number(pLossRaw.toFixed(4)),
    pLegNoPush,
    legOutcome,
    excludedPush: false,
    binaryOutcome,
    brierSqError,
  };
}

/**
 * Decomposes an AH or OU position into 1 leg (half/whole line) or 2 half-stake legs (quarter line),
 * scores each leg against its own probability from the score grid, and excludes push legs.
 */
export function evaluatePositionBrierLegs(
  input: EvaluatePositionBrierInput
): PositionBrierDecomposition | null {
  const mktUpper = String(input.market || input.marketType || '').toUpperCase();
  const market: 'AH' | 'OU' | null =
    mktUpper === 'AH' || mktUpper === 'ASIAN_HANDICAP'
      ? 'AH'
      : mktUpper === 'OU' || mktUpper === 'OVER_UNDER'
      ? 'OU'
      : null;

  if (!market || typeof input.line !== 'number' || !Number.isFinite(input.line)) {
    return null;
  }
  if (
    typeof input.homeGoals !== 'number' ||
    typeof input.awayGoals !== 'number' ||
    !Number.isFinite(input.homeGoals) ||
    !Number.isFinite(input.awayGoals)
  ) {
    return null;
  }

  const grid =
    input.scoreGrid ||
    resolveFixtureScoreGrid({
      homeTeam: input.homeTeam,
      awayTeam: input.awayTeam,
      league: input.league,
      lambdaHome: input.lambdaHome,
      lambdaAway: input.lambdaAway,
      rho: input.rho,
    }).grid;

  const line = Number(input.line);
  const isQuarter = QuarterLineSettler.isQuarterLine(line);
  const legLines = isQuarter ? [line - 0.25, line + 0.25] : [line];
  const stakeWeight = isQuarter ? 0.5 : 1.0;

  const ahSide = market === 'AH' ? resolveAhSideFromSelection(input.selection, input.homeTeam, input.awayTeam) : undefined;
  const ouSide = market === 'OU' ? resolveOuSideFromSelection(input.selection) : undefined;
  const fallbackProb = input.fallbackProbability ?? input.fallbackModelProbDecimal ?? null;

  const legs: BrierLegEvaluation[] = legLines.map((legLine, idx) =>
    evaluateSingleLegOnGrid({
      grid,
      market,
      legLine,
      legIndex: idx + 1,
      stakeWeight,
      ahSide,
      ouSide,
      homeGoals: input.homeGoals,
      awayGoals: input.awayGoals,
      fallbackProbability: fallbackProb,
    })
  );

  const resolvedLegs = legs.filter(l => !l.excludedPush && l.brierSqError !== null);
  const excludedPushLegs = legs.filter(l => l.excludedPush);
  const resolvedStakeWeight = Number(
    resolvedLegs.reduce((acc, l) => acc + l.stakeWeight, 0).toFixed(2)
  );

  const positionBrierMean =
    resolvedLegs.length > 0
      ? Number(
          (
            resolvedLegs.reduce((acc, l) => acc + (l.brierSqError as number), 0) /
            resolvedLegs.length
          ).toFixed(6)
        )
      : null;

  const positionBrierStakeWeightedMean =
    resolvedStakeWeight > 0
      ? Number(
          (
            resolvedLegs.reduce((acc, l) => acc + l.stakeWeight * (l.brierSqError as number), 0) /
            resolvedStakeWeight
          ).toFixed(6)
        )
      : null;

  return {
    positionId: input.positionId,
    fixtureId: input.fixtureId,
    market,
    line,
    isQuarterLine: isQuarter,
    legs,
    nTotalLegs: legs.length,
    nResolvedLegs: resolvedLegs.length,
    nExcludedPushLegs: excludedPushLegs.length,
    totalLegCount: legs.length,
    resolvedLegCount: resolvedLegs.length,
    excludedPushLegCount: excludedPushLegs.length,
    resolvedStakeWeight,
    positionBrierMean,
    positionBrierStakeWeightedMean,
  };
}
