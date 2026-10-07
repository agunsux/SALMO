// SALMO.DEV — Corners Market Architecture Definition
//
// LIFECYCLE STATUS: READY / INACTIVE (Do NOT activate in production now)
//
// REQUIREMENTS BEFORE PRODUCTION ACTIVATION:
// 1. Verified OddsPAPI corner line market availability
// 2. Verified bookmaker coverage across Pinnacle, Bet365, 1xBet
// 3. Historical corner data depth and distribution modeling
// 4. Corner-specific negative binomial / bivariate Poisson model validation (do NOT reuse goal Poisson)
// 5. Backtested ROI & CLV validation
//
// ZERO GOAL-MODEL FALLBACK. STRICTLY FAIL-CLOSED.

import { MarketDefinition, MARKET_REGISTRY, isMarketActive } from '../../types/index';

export const CORNERS_MARKET_DEFINITION: MarketDefinition = MARKET_REGISTRY['CORNERS'];

export interface CornerMarketRequirements {
  oddsPapiAvailable: boolean;
  bookmakerCoverageVerified: boolean;
  historicalSampleCount: number;
  modelValidationPassed: boolean;
  backtestRoiPassed: boolean;
}

export class CornersEngine {
  public static isReady(): boolean {
    return isMarketActive('CORNERS');
  }

  public static evaluateCorners(): never {
    throw new Error(
      '[CornersEngine] Corners market is in READY / INACTIVE state. ' +
      'Production activation requires verified corner data depth, corner-specific model validation, and licensing confirmation.'
    );
  }
}
