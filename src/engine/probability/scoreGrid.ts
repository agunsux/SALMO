// SALMO.DEV — Dixon-Coles Bivariate Score Grid Engine
// Computes joint probability distribution P(Home = x, Away = y) for scores 0..10.
// Migrated from HandicapLab validated engine.

import { poissonPMF, dixonColesCorrection } from '../math/dixonColesMath';

export const SCORE_GRID_MAX_GOALS = 10;

/**
 * Builds normalized 11x11 score grid (0..10 goals) using Dixon-Coles joint distribution.
 * Normalized to sum exactly to 1.0.
 */
export function buildScoreGrid(
  homeXG: number,
  awayXG: number,
  rho: number
): number[][] {
  const maxGoals = SCORE_GRID_MAX_GOALS;
  const grid: number[][] = Array.from({ length: maxGoals + 1 }, () =>
    new Array<number>(maxGoals + 1).fill(0)
  );

  let totalSum = 0;

  for (let x = 0; x <= maxGoals; x++) {
    const pHome = poissonPMF(homeXG, x);
    for (let y = 0; y <= maxGoals; y++) {
      const pAway = poissonPMF(awayXG, y);
      const correction = dixonColesCorrection(x, y, homeXG, awayXG, rho);
      const prob = pHome * pAway * correction;
      grid[x][y] = prob;
      totalSum += prob;
    }
  }

  // Normalize grid to sum to 1.0 to handle truncation past 10 goals
  if (totalSum > 0) {
    for (let x = 0; x <= maxGoals; x++) {
      for (let y = 0; y <= maxGoals; y++) {
        grid[x][y] /= totalSum;
      }
    }
  }

  return grid;
}

/**
 * Derives expected goals from the score grid.
 */
export function deriveExpectedGoalsFromGrid(grid: number[][]): {
  xgHome: number;
  xgAway: number;
  expectedTotalGoals: number;
} {
  let xgHome = 0;
  let xgAway = 0;
  for (let x = 0; x <= SCORE_GRID_MAX_GOALS; x++) {
    for (let y = 0; y <= SCORE_GRID_MAX_GOALS; y++) {
      const p = grid[x][y];
      xgHome += x * p;
      xgAway += y * p;
    }
  }
  return {
    xgHome: Number(xgHome.toFixed(4)),
    xgAway: Number(xgAway.toFixed(4)),
    expectedTotalGoals: Number((xgHome + xgAway).toFixed(4)),
  };
}
