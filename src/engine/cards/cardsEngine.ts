// SALMO.DEV — Yellow Cards Market Architecture Definition
//
// LIFECYCLE STATUS: READY / INACTIVE (Do NOT activate in production now)
//
// REQUIREMENTS BEFORE PRODUCTION ACTIVATION:
// 1. Dedicated referee discipline rating features
// 2. Team fouling & historical card distributions
// 3. Match intensity & rivalry factor models
// 4. Bookmaker coverage across Pinnacle, Bet365, 1xBet
// 5. Backtested ROI & CLV validation
//
// ZERO GOAL-MODEL FALLBACK. STRICTLY FAIL-CLOSED.

import { MarketDefinition, MARKET_REGISTRY, isMarketActive } from '../../types/index';

export const CARDS_MARKET_DEFINITION: MarketDefinition = MARKET_REGISTRY['YELLOW_CARDS'];

export interface CardMarketRequirements {
  refereeDataAvailable: boolean;
  teamDisciplineMetricsAvailable: boolean;
  bookmakerCoverageVerified: boolean;
  modelValidationPassed: boolean;
  backtestRoiPassed: boolean;
}

export class YellowCardsEngine {
  public static isReady(): boolean {
    return isMarketActive('YELLOW_CARDS');
  }

  public static evaluateCards(): never {
    throw new Error(
      '[YellowCardsEngine] Yellow Cards market is in READY / INACTIVE state. ' +
      'Production activation requires referee discipline features, team card metrics, and dedicated model research.'
    );
  }
}
