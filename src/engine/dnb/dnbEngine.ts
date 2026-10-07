// SALMO.DEV — Draw No Bet (DNB) Mathematical Engine
// Model Version: DNB-AH0-v1.0.0
//
// ARCHITECTURAL MANDATE:
// DNB is mathematically identical to Asian Handicap 0.0 (AH 0.0).
// Home DNB = Home AH 0.0
// Away DNB = Away AH 0.0
//
// This module acts as an alias / projection layer over the core Asian Handicap engine.
// ZERO duplicated forecasting models. ZERO duplicated probability distributions.
// Reuses the Dixon-Coles 11x11 bivariate score grid.
//
// LIFECYCLE STATUS: READY (Not active in production until explicit activation)

import {
  calculateAsianHandicapFromGrid,
  calculatePushAwareFairOdds,
  calculateEffectiveAhProbability,
  AsianHandicapProbabilities,
} from '../ah/ahProbability';
import { QuarterLineSettler } from '../ah/quarterLineSettler';
import { SettlementOutcome } from '../../types/index';
import { buildScoreGrid } from '../probability/scoreGrid';

export const DNB_MODEL_VERSION = 'DNB-AH0-v1.0.0' as const;

export type DnbSelection = 'HOME_DNB' | 'AWAY_DNB';

export interface DnbResult {
  modelVersion: typeof DNB_MODEL_VERSION;
  selection: DnbSelection;
  line: 0.0;
  probabilities: {
    win: number;
    push: number;
    loss: number;
    effectiveWinProb: number;
  };
  fairOdds: number;
  marketStatus: 'READY';
  isDerived: true;
  derivedFrom: 'AH_0.0';
  provenance: {
    homeXG: number;
    awayXG: number;
    rho: number;
  };
}

/**
 * Calculates DNB probabilities directly from precomputed Dixon-Coles score grid
 * by projecting the AH 0.0 line.
 */
export function calculateDnbFromGrid(
  grid: number[][],
  selection: DnbSelection = 'HOME_DNB',
  meta: { homeXG?: number; awayXG?: number; rho?: number } = {}
): DnbResult {
  const isHome = selection === 'HOME_DNB';
  // For Away DNB, we transpose the grid (swap home and away probabilities)
  const effectiveGrid = isHome
    ? grid
    : grid[0].map((_, colIndex) => grid.map(row => row[colIndex]));

  // Project AH 0.0
  const ahDecomp: AsianHandicapProbabilities = calculateAsianHandicapFromGrid(effectiveGrid, 0.0);

  const fairOdds = calculatePushAwareFairOdds(ahDecomp);
  const effectiveWinProb = calculateEffectiveAhProbability(ahDecomp);

  return {
    modelVersion: DNB_MODEL_VERSION,
    selection,
    line: 0.0,
    probabilities: {
      win: ahDecomp.win,
      push: ahDecomp.push,
      loss: ahDecomp.loss,
      effectiveWinProb,
    },
    fairOdds,
    marketStatus: 'READY',
    isDerived: true,
    derivedFrom: 'AH_0.0',
    provenance: {
      homeXG: isHome ? (meta.homeXG ?? 0) : (meta.awayXG ?? 0),
      awayXG: isHome ? (meta.awayXG ?? 0) : (meta.homeXG ?? 0),
      rho: meta.rho ?? 0,
    },
  };
}

/**
 * Convenience method to calculate DNB from team ratings xG and rho.
 */
export function calculateDnb(
  homeXG: number,
  awayXG: number,
  selection: DnbSelection = 'HOME_DNB',
  rho = -0.06
): DnbResult {
  const grid = buildScoreGrid(homeXG, awayXG, rho);
  return calculateDnbFromGrid(grid, selection, { homeXG, awayXG, rho });
}

/**
 * Deterministically settles DNB selection against final match goals.
 * Reuses QuarterLineSettler.settle with line 0.0.
 *
 * Outcome:
 * Home win -> WIN (Home DNB) / LOSS (Away DNB)
 * Draw     -> PUSH (Full refund)
 * Away win -> LOSS (Home DNB) / WIN (Away DNB)
 */
export function settleDnbMatch(
  selection: DnbSelection | string,
  homeGoals: number,
  awayGoals: number,
  voided = false
): SettlementOutcome {
  if (voided || homeGoals < 0 || awayGoals < 0) return 'VOID';
  const selStr = String(selection).toUpperCase();
  const isHome = selStr.includes('HOME') || selStr.startsWith('H');
  const side: 'home' | 'away' = isHome ? 'home' : 'away';

  return QuarterLineSettler.settle(side, 0.0, homeGoals, awayGoals, voided);
}
