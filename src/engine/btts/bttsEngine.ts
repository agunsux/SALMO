// SALMO.DEV — Both Teams To Score (BTTS) Mathematical Engine
// Model Version: BTTS-jointscore-v1.0.0
// Derives BTTS probabilities from the Dixon-Coles bivariate score distribution.
//
// NON-NEGOTIABLE INVARIANT:
// BTTS remains strictly UNVALIDATED / RESEARCH_ONLY in production.
// It must NEVER be automatically promoted to a public qualified LAYAK pick.
// Migrated from HandicapLab validated research engine.

import { buildScoreGrid, SCORE_GRID_MAX_GOALS } from '../probability/scoreGrid';

export const BTTS_MODEL_VERSION = 'BTTS-jointscore-v1.0.0' as const;

export type BttsSelection = 'YES' | 'NO';
export type BttsOutcome = 'WIN' | 'LOSS';

export interface BttsProbabilities {
  yes: number;
  no: number;
}

export interface BttsEngineResult {
  modelVersion: typeof BTTS_MODEL_VERSION;
  probabilities: BttsProbabilities;
  pHomeZero: number;
  pAwayZero: number;
  pBothZero: number;
  fairOdds: {
    yes: number;
    no: number;
  };
  yieldStatus: 'UNVALIDATED';
  calibrationStatus: 'UNVALIDATED';
  provenance: {
    homeXG: number;
    awayXG: number;
    rho: number;
    gridSum: number;
  };
}

/**
 * Calculates BTTS probabilities directly from precomputed bivariate joint score grid.
 * Inclusion-Exclusion formula:
 * P(Yes) = 1 - P(Home = 0) - P(Away = 0) + P(Home = 0, Away = 0)
 */
export function calculateBttsFromGrid(
  grid: number[][],
  meta: { homeXG?: number; awayXG?: number; rho?: number } = {}
): BttsEngineResult {
  const maxGoals = grid.length - 1;
  let gridSum = 0;
  let pHomeZero = 0;
  let pAwayZero = 0;

  for (let x = 0; x <= maxGoals; x++) {
    for (let y = 0; y <= maxGoals; y++) {
      const prob = grid[x][y];
      gridSum += prob;
      if (x === 0) pHomeZero += prob;
      if (y === 0) pAwayZero += prob;
    }
  }

  const pBothZero = grid[0][0];

  let pYes = 1.0 - pHomeZero - pAwayZero + pBothZero;
  pYes = Math.max(0.0, Math.min(1.0, pYes));
  const pNo = Math.max(0.0, Math.min(1.0, 1.0 - pYes));

  const fairOddsYes = pYes > 0 ? Number((1 / pYes).toFixed(3)) : Infinity;
  const fairOddsNo = pNo > 0 ? Number((1 / pNo).toFixed(3)) : Infinity;

  return {
    modelVersion: BTTS_MODEL_VERSION,
    probabilities: {
      yes: Number(pYes.toFixed(4)),
      no: Number(pNo.toFixed(4)),
    },
    pHomeZero: Number(pHomeZero.toFixed(4)),
    pAwayZero: Number(pAwayZero.toFixed(4)),
    pBothZero: Number(pBothZero.toFixed(4)),
    fairOdds: {
      yes: fairOddsYes,
      no: fairOddsNo,
    },
    yieldStatus: 'UNVALIDATED',
    calibrationStatus: 'UNVALIDATED',
    provenance: {
      homeXG: meta.homeXG ?? 0,
      awayXG: meta.awayXG ?? 0,
      rho: meta.rho ?? 0,
      gridSum: Number(gridSum.toFixed(4)),
    },
  };
}

/**
 * Convenience method to calculate BTTS from xGs and rho.
 */
export function calculateBtts(
  homeXG: number,
  awayXG: number,
  rho = -0.06
): BttsEngineResult {
  const grid = buildScoreGrid(homeXG, awayXG, rho);
  return calculateBttsFromGrid(grid, { homeXG, awayXG, rho });
}

/**
 * Deterministically settles BTTS outcome given final goals.
 */
export function settleBttsMatch(
  selection: BttsSelection,
  homeGoals: number,
  awayGoals: number
): BttsOutcome {
  if (homeGoals < 0 || awayGoals < 0) {
    throw new Error(`[BttsEngine] Invalid goals for settlement: ${homeGoals}-${awayGoals}`);
  }
  const bothScored = homeGoals >= 1 && awayGoals >= 1;
  const isYesSelection = selection === 'YES';
  return (bothScored === isYesSelection) ? 'WIN' : 'LOSS';
}
