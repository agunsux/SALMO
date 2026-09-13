// SALMO.DEV — Quarter-Line Settlement Engine
// Full quarter-line split resolution without binary reduction.
// Strictly supports: WIN, HALF_WIN, PUSH, HALF_LOSS, LOSS, VOID

import { SettlementOutcome } from '../../types/index';

export class QuarterLineSettler {
  public static isQuarterLine(line: number): boolean {
    const frac = Math.abs(line - Math.trunc(line));
    return frac === 0.25 || frac === 0.75;
  }

  private static settleHalfStep(margin: number): SettlementOutcome {
    if (margin > 0.000001) return 'WIN';
    if (margin < -0.000001) return 'LOSS';
    return 'PUSH';
  }

  /**
   * Settle Asian Handicap outcome for a given side, line, and scores.
   * @param side 'home' or 'away'
   * @param line Asian handicap line (e.g. -0.75 for Chelsea -0.75)
   * @param homeGoals Final home team goals
   * @param awayGoals Final away team goals
   */
  public static settle(
    side: 'home' | 'away',
    line: number,
    homeGoals: number,
    awayGoals: number,
    voided = false
  ): SettlementOutcome {
    if (voided || homeGoals < 0 || awayGoals < 0) return 'VOID';

    const diff = side === 'home' ? homeGoals - awayGoals : awayGoals - homeGoals;

    if (this.isQuarterLine(line)) {
      const base = Math.floor(line * 2) / 2;
      const r1 = this.settleHalfStep(diff + base);
      const r2 = this.settleHalfStep(diff + base + 0.5);

      if (r1 === r2) return r1;
      const hasPush = r1 === 'PUSH' || r2 === 'PUSH';
      if (!hasPush) return 'PUSH';
      return (r1 === 'WIN' || r2 === 'WIN') ? 'HALF_WIN' : 'HALF_LOSS';
    }

    return this.settleHalfStep(diff + line);
  }

  /**
   * Calculates profit for 1 unit stake based on outcome and decimal odds.
   */
  public static calculateProfit(outcome: SettlementOutcome, decimalOdds: number, stake = 1): number {
    switch (outcome) {
      case 'WIN': return (decimalOdds - 1) * stake;
      case 'HALF_WIN': return ((decimalOdds - 1) / 2) * stake;
      case 'PUSH': return 0;
      case 'HALF_LOSS': return -0.5 * stake;
      case 'LOSS': return -stake;
      case 'VOID': return 0;
    }
  }
}

