// SALMO.DEV — Asian Total Goals Engine (Over / Under)
// Model Version: ASIAN-TOTAL-jointscore-v1.0.0
// Dynamically supports:
// - Whole lines: 1.0, 2.0, 3.0, 4.0
// - Half lines: 0.5, 1.5, 2.5, 3.5, 4.5
// - Quarter lines: 0.75, 1.25, 1.75, 2.25, 2.75, 3.25, 3.75
// DO NOT hardcode 2.5 as the OU model line.
// Migrated from HandicapLab validated engine.

import { buildScoreGrid, SCORE_GRID_MAX_GOALS } from '../probability/scoreGrid';

export const ASIAN_TOTAL_MODEL_VERSION = 'ASIAN-TOTAL-jointscore-v1.0.0' as const;

export type AsianTotalSide = 'OVER' | 'UNDER';

export type AsianTotalSettlementOutcome =
  | 'FULL_WIN'
  | 'HALF_WIN'
  | 'PUSH'
  | 'HALF_LOSS'
  | 'FULL_LOSS';

export const VALID_ASIAN_TOTAL_LINES = [
  0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 2.75,
  3.0, 3.25, 3.5, 3.75, 4.0, 4.25, 4.5
] as const;

export interface AsianTotalSettlementProbabilities {
  fullWin: number;
  halfWin: number;
  push: number;
  halfLoss: number;
  fullLoss: number;
}

export interface AsianTotalResult {
  modelVersion: typeof ASIAN_TOTAL_MODEL_VERSION;
  line: number;
  side: AsianTotalSide;
  probabilities: AsianTotalSettlementProbabilities;
  binaryWinProbability: number;
  coverProbability: number;
  fairOdds: {
    binary: number;
    cover: number;
  };
  totalGoalsDistribution: number[];
  provenance: {
    homeXG: number;
    awayXG: number;
    rho: number;
  };
}

/**
 * Normalizes side string to 'OVER' | 'UNDER'.
 */
export function normalizeAsianSide(side: string): AsianTotalSide {
  const s = String(side).trim().toUpperCase();
  if (s !== 'OVER' && s !== 'UNDER') {
    throw new Error(`[AsianTotalEngine] Invalid side '${side}'. Must be 'OVER' or 'UNDER'.`);
  }
  return s as AsianTotalSide;
}

/**
 * Derives 1D total goals distribution P(T = t) for t = 0..20 from 2D joint score grid.
 */
export function deriveTotalGoalsDistribution(grid: number[][]): number[] {
  const maxGoals = grid.length - 1;
  const maxTotal = maxGoals * 2;
  const dist: number[] = new Array(maxTotal + 1).fill(0);

  let gridSum = 0;
  for (let x = 0; x <= maxGoals; x++) {
    for (let y = 0; y <= maxGoals; y++) {
      const prob = grid[x][y];
      gridSum += prob;
      dist[x + y] += prob;
    }
  }

  const distSum = dist.reduce((acc, p) => acc + p, 0);
  if (distSum > 0) {
    for (let i = 0; i <= maxTotal; i++) {
      dist[i] /= distSum;
    }
  }

  return dist;
}

/**
 * Deterministically settles an Asian Total Goals selection against observed total match goals.
 */
export function settleAsianTotalGoals(
  line: number,
  side: AsianTotalSide | string,
  totalGoals: number
): AsianTotalSettlementOutcome {
  const normalizedSide = normalizeAsianSide(side);
  if (totalGoals < 0 || !Number.isInteger(totalGoals) || !Number.isFinite(totalGoals)) {
    throw new Error(`[AsianTotalEngine] Invalid total goals for settlement: ${totalGoals}`);
  }

  const isOver = normalizedSide === 'OVER';
  const frac = Math.round((line - Math.floor(line)) * 100) / 100;

  // 1. Whole line (e.g. 2.0, 3.0, 4.0)
  if (frac === 0.0) {
    if (totalGoals === line) return 'PUSH';
    if (isOver) {
      return totalGoals > line ? 'FULL_WIN' : 'FULL_LOSS';
    } else {
      return totalGoals < line ? 'FULL_WIN' : 'FULL_LOSS';
    }
  }

  // 2. Half line (e.g. 0.5, 1.5, 2.5, 3.5)
  if (frac === 0.5) {
    if (isOver) {
      return totalGoals > line ? 'FULL_WIN' : 'FULL_LOSS';
    } else {
      return totalGoals < line ? 'FULL_WIN' : 'FULL_LOSS';
    }
  }

  // 3. Quarter line .25 (e.g. 1.25, 2.25, 3.25)
  // Split between whole line (line - 0.25) and half line (line + 0.25)
  if (frac === 0.25) {
    const wholeLine = line - 0.25;
    if (isOver) {
      if (totalGoals >= line + 0.75) return 'FULL_WIN';
      if (totalGoals === wholeLine) return 'HALF_LOSS'; // whole line pushes, half line loses
      return 'FULL_LOSS';
    } else {
      if (totalGoals <= line - 1.25) return 'FULL_WIN';
      if (totalGoals === wholeLine) return 'HALF_WIN'; // whole line pushes, half line wins
      return 'FULL_LOSS';
    }
  }

  // 4. Quarter line .75 (e.g. 0.75, 1.75, 2.75, 3.75)
  // Split between half line (line - 0.25) and whole line (line + 0.25)
  if (frac === 0.75) {
    const wholeLine = line + 0.25;
    if (isOver) {
      if (totalGoals >= line + 1.25) return 'FULL_WIN';
      if (totalGoals === wholeLine) return 'HALF_WIN'; // half line wins, whole line pushes
      return 'FULL_LOSS';
    } else {
      if (totalGoals <= line - 0.75) return 'FULL_WIN';
      if (totalGoals === wholeLine) return 'HALF_LOSS'; // half line loses, whole line pushes
      return 'FULL_LOSS';
    }
  }

  throw new Error(`[AsianTotalEngine] Unsupported quarter line step: ${line}`);
}

/**
 * Calculates generic Asian Total Goals probabilities from a precomputed score grid.
 */
export function calculateAsianTotalFromGrid(
  grid: number[][],
  line: number,
  sideInput: AsianTotalSide | string,
  meta: { homeXG?: number; awayXG?: number; rho?: number } = {}
): AsianTotalResult {
  const side = normalizeAsianSide(sideInput);
  const totalGoalsDist = deriveTotalGoalsDistribution(grid);

  let fullWin = 0;
  let halfWin = 0;
  let push = 0;
  let halfLoss = 0;
  let fullLoss = 0;

  for (let t = 0; t < totalGoalsDist.length; t++) {
    const pt = totalGoalsDist[t];
    if (pt <= 0) continue;

    const outcome = settleAsianTotalGoals(line, side, t);
    switch (outcome) {
      case 'FULL_WIN':
        fullWin += pt;
        break;
      case 'HALF_WIN':
        halfWin += pt;
        break;
      case 'PUSH':
        push += pt;
        break;
      case 'HALF_LOSS':
        halfLoss += pt;
        break;
      case 'FULL_LOSS':
        fullLoss += pt;
        break;
    }
  }

  const sumProbs = fullWin + halfWin + push + halfLoss + fullLoss;
  const normFullWin = sumProbs > 0 ? fullWin / sumProbs : 0;
  const normHalfWin = sumProbs > 0 ? halfWin / sumProbs : 0;
  const normPush = sumProbs > 0 ? push / sumProbs : 0;
  const normHalfLoss = sumProbs > 0 ? halfLoss / sumProbs : 0;
  const normFullLoss = sumProbs > 0 ? fullLoss / sumProbs : 0;

  const binaryWinProbability = Number(normFullWin.toFixed(4));
  const coverProbability = Number((normFullWin + 0.5 * normHalfWin).toFixed(4));

  const fairOddsBinary = binaryWinProbability > 0 ? Number((1 / binaryWinProbability).toFixed(3)) : Infinity;
  const fairOddsCover = coverProbability > 0 ? Number((1 / coverProbability).toFixed(3)) : Infinity;

  return {
    modelVersion: ASIAN_TOTAL_MODEL_VERSION,
    line,
    side,
    probabilities: {
      fullWin: Number(normFullWin.toFixed(4)),
      halfWin: Number(normHalfWin.toFixed(4)),
      push: Number(normPush.toFixed(4)),
      halfLoss: Number(normHalfLoss.toFixed(4)),
      fullLoss: Number(normFullLoss.toFixed(4)),
    },
    binaryWinProbability,
    coverProbability,
    fairOdds: {
      binary: fairOddsBinary,
      cover: fairOddsCover,
    },
    totalGoalsDistribution: totalGoalsDist,
    provenance: {
      homeXG: meta.homeXG ?? 0,
      awayXG: meta.awayXG ?? 0,
      rho: meta.rho ?? 0,
    },
  };
}

/**
 * Asian Total Goals Engine class providing static calculation methods.
 */
export class AsianTotalEngine {
  public static readonly MODEL_VERSION = ASIAN_TOTAL_MODEL_VERSION;

  public static totalGoals(
    line: number,
    side: AsianTotalSide | string,
    homeXG: number,
    awayXG: number,
    rho = -0.06
  ): AsianTotalResult {
    const grid = buildScoreGrid(homeXG, awayXG, rho);
    return calculateAsianTotalFromGrid(grid, line, side, { homeXG, awayXG, rho });
  }

  public static calculateFromGrid(
    grid: number[][],
    line: number,
    side: AsianTotalSide | string,
    meta: { homeXG?: number; awayXG?: number; rho?: number } = {}
  ): AsianTotalResult {
    return calculateAsianTotalFromGrid(grid, line, side, meta);
  }
}
