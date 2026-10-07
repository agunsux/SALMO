// SALMO.DEV — Double Chance (1X / X2 / 12) Mathematical Engine
// Model Version: DC-jointscore-v1.0.0
//
// ARCHITECTURAL MANDATE:
// Double Chance aggregates outcomes directly from the Dixon-Coles 11x11 bivariate score grid:
// P(1X) = P(Home Win) + P(Draw)
// P(X2) = P(Draw) + P(Away Win)
// P(12) = P(Home Win) + P(Away Win)
//
// ZERO separate forecasting models. Fully derived from joint score distribution.
//
// LIFECYCLE STATUS: READY (Not active in production until explicit activation)

import { buildScoreGrid, SCORE_GRID_MAX_GOALS } from '../probability/scoreGrid';
import { SettlementOutcome } from '../../types/index';

export const DOUBLE_CHANCE_MODEL_VERSION = 'DC-jointscore-v1.0.0' as const;

export type DoubleChanceSelection = '1X' | 'X2' | '12';

export interface DoubleChanceResult {
  modelVersion: typeof DOUBLE_CHANCE_MODEL_VERSION;
  selection: DoubleChanceSelection;
  probabilities: {
    '1X': number;
    'X2': number;
    '12': number;
    pHomeWin: number;
    pDraw: number;
    pAwayWin: number;
  };
  selectionProbability: number;
  fairOdds: number;
  marketStatus: 'READY';
  isDerived: true;
  derivedFrom: 'SCORE_GRID_1X2';
  provenance: {
    homeXG: number;
    awayXG: number;
    rho: number;
  };
}

/**
 * Calculates Double Chance probabilities directly from precomputed Dixon-Coles score grid.
 */
export function calculateDoubleChanceFromGrid(
  grid: number[][],
  selection: DoubleChanceSelection = '1X',
  meta: { homeXG?: number; awayXG?: number; rho?: number } = {}
): DoubleChanceResult {
  let pHomeWin = 0;
  let pDraw = 0;
  let pAwayWin = 0;

  const maxGoals = grid.length - 1;

  for (let x = 0; x <= maxGoals; x++) {
    for (let y = 0; y <= maxGoals; y++) {
      const prob = grid[x][y];
      if (x > y) {
        pHomeWin += prob;
      } else if (x === y) {
        pDraw += prob;
      } else {
        pAwayWin += prob;
      }
    }
  }

  const sum = pHomeWin + pDraw + pAwayWin;
  if (sum > 0 && Math.abs(sum - 1.0) > 1e-6) {
    pHomeWin /= sum;
    pDraw /= sum;
    pAwayWin /= sum;
  }

  const p1X = Number(Math.min(1.0, pHomeWin + pDraw).toFixed(4));
  const pX2 = Number(Math.min(1.0, pDraw + pAwayWin).toFixed(4));
  const p12 = Number(Math.min(1.0, pHomeWin + pAwayWin).toFixed(4));

  const selectionProbability =
    selection === '1X' ? p1X : selection === 'X2' ? pX2 : p12;

  const fairOdds = selectionProbability > 0 ? Number((1 / selectionProbability).toFixed(3)) : Infinity;

  return {
    modelVersion: DOUBLE_CHANCE_MODEL_VERSION,
    selection,
    probabilities: {
      '1X': p1X,
      'X2': pX2,
      '12': p12,
      pHomeWin: Number(pHomeWin.toFixed(4)),
      pDraw: Number(pDraw.toFixed(4)),
      pAwayWin: Number(pAwayWin.toFixed(4)),
    },
    selectionProbability,
    fairOdds,
    marketStatus: 'READY',
    isDerived: true,
    derivedFrom: 'SCORE_GRID_1X2',
    provenance: {
      homeXG: meta.homeXG ?? 0,
      awayXG: meta.awayXG ?? 0,
      rho: meta.rho ?? 0,
    },
  };
}

/**
 * Convenience method to calculate Double Chance from xG and rho.
 */
export function calculateDoubleChance(
  homeXG: number,
  awayXG: number,
  selection: DoubleChanceSelection = '1X',
  rho = -0.06
): DoubleChanceResult {
  const grid = buildScoreGrid(homeXG, awayXG, rho);
  return calculateDoubleChanceFromGrid(grid, selection, { homeXG, awayXG, rho });
}

/**
 * Deterministically settles Double Chance selections against observed final score.
 *
 * Full binary outcome settlement:
 * 1X: Home win -> WIN, Draw -> WIN, Away win -> LOSS
 * X2: Home win -> LOSS, Draw -> WIN, Away win -> WIN
 * 12: Home win -> WIN, Draw -> LOSS, Away win -> WIN
 */
export function settleDoubleChanceMatch(
  selection: DoubleChanceSelection | string,
  homeGoals: number,
  awayGoals: number,
  voided = false
): SettlementOutcome {
  if (voided || homeGoals < 0 || awayGoals < 0) return 'VOID';

  const selUpper = String(selection).toUpperCase().replace(/\s+/g, '');

  const homeWin = homeGoals > awayGoals;
  const draw = homeGoals === awayGoals;
  const awayWin = homeGoals < awayGoals;

  if (selUpper === '1X') {
    return (homeWin || draw) ? 'WIN' : 'LOSS';
  } else if (selUpper === 'X2') {
    return (awayWin || draw) ? 'WIN' : 'LOSS';
  } else if (selUpper === '12') {
    return (homeWin || awayWin) ? 'WIN' : 'LOSS';
  }

  throw new Error(`[DoubleChanceEngine] Unknown Double Chance selection: ${selection}`);
}
