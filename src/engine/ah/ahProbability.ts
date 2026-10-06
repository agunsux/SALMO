// SALMO.DEV — Asian Handicap Probability Engine
// Derives Asian Handicap coverage and 5-way settlement probabilities from score grid.
// Strictly supports whole, half, and quarter lines.
// Migrated from HandicapLab validated engine.

import { buildScoreGrid, SCORE_GRID_MAX_GOALS } from '../probability/scoreGrid';

export interface AsianHandicapProbabilities {
  win: number;
  halfWin: number;
  push: number;
  halfLoss: number;
  loss: number;
  cover: number; // Combined probability equivalent: win + 0.5 * halfWin
}

/**
 * Calculates Asian Handicap probabilities for the home team coverage.
 * Supports lines: -1.5, -1.25, -1.0, -0.75, -0.5, -0.25, 0.0, +0.25, +0.5, +0.75, +1.0, +1.25, +1.5.
 */
export function calculateAsianHandicapProbability(
  homeXG: number,
  awayXG: number,
  handicapLine: number,
  rho: number
): AsianHandicapProbabilities {
  const grid = buildScoreGrid(homeXG, awayXG, rho);
  return calculateAsianHandicapFromGrid(grid, handicapLine);
}

/**
 * Calculates Asian Handicap probabilities directly from an existing score grid.
 */
export function calculateAsianHandicapFromGrid(
  grid: number[][],
  handicapLine: number
): AsianHandicapProbabilities {
  let win = 0;
  let halfWin = 0;
  let push = 0;
  let halfLoss = 0;
  let loss = 0;

  const maxGoals = SCORE_GRID_MAX_GOALS;

  for (let x = 0; x <= maxGoals; x++) {
    for (let y = 0; y <= maxGoals; y++) {
      const prob = grid[x][y];
      const dAdj = (x - y) + handicapLine;

      if (dAdj >= 0.5) {
        win += prob;
      } else if (Math.abs(dAdj - 0.25) < 0.001) {
        halfWin += prob;
      } else if (Math.abs(dAdj) < 0.001) {
        push += prob;
      } else if (Math.abs(dAdj - (-0.25)) < 0.001) {
        halfLoss += prob;
      } else {
        loss += prob;
      }
    }
  }

  const sum = win + halfWin + push + halfLoss + loss;
  if (sum > 0 && Math.abs(sum - 1.0) > 1e-6) {
    win /= sum;
    halfWin /= sum;
    push /= sum;
    halfLoss /= sum;
    loss /= sum;
  }

  return {
    win: Number(win.toFixed(4)),
    halfWin: Number(halfWin.toFixed(4)),
    push: Number(push.toFixed(4)),
    halfLoss: Number(halfLoss.toFixed(4)),
    loss: Number(loss.toFixed(4)),
    cover: Number((win + 0.5 * halfWin).toFixed(4)),
  };
}

/**
 * Push-aware fair odds for Asian Handicap taking push / half-win / half-loss into account:
 * fair_odds = 1 + (loss + 0.5 * halfLoss) / (win + 0.5 * halfWin)
 * For DNB / AH 0: reduces exactly to 1 + p_loss / p_win.
 * For half lines: reduces exactly to 1 / p_win.
 */
export function calculatePushAwareFairOdds(decomp: AsianHandicapProbabilities): number {
  const denom = decomp.win + 0.5 * decomp.halfWin;
  const num = decomp.loss + 0.5 * decomp.halfLoss;
  if (denom <= 0 || !Number.isFinite(denom)) return Infinity;
  return Number((1 + num / denom).toFixed(3));
}

/**
 * Effective break-even conditional win probability for Asian Handicap.
 */
export function calculateEffectiveAhProbability(decomp: AsianHandicapProbabilities): number {
  const denom = (decomp.win + 0.5 * decomp.halfWin) + (decomp.loss + 0.5 * decomp.halfLoss);
  if (denom <= 0) return 0;
  return Number(((decomp.win + 0.5 * decomp.halfWin) / denom).toFixed(4));
}

/**
 * Fair odds derived directly from coverage probability.
 */
export function fairOdds(probability: number): number {
  if (probability <= 0 || !Number.isFinite(probability)) return Infinity;
  return Number((1 / probability).toFixed(3));
}

