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
   * Settle Over/Under outcome for a given selection ('OVER' | 'UNDER'), line, and total score.
   * @param selection 'OVER' or 'UNDER' (case-insensitive)
   * @param line Over/Under line (e.g. 2.25, 2.5, 2.75, 3.0)
   * @param totalGoals Total goals scored in the match
   * @param voided Whether the match was voided/abandoned
   */
  public static settleOverUnder(
    selection: 'OVER' | 'UNDER' | 'over' | 'under',
    line: number,
    totalGoals: number,
    voided = false
  ): SettlementOutcome {
    if (voided || totalGoals < 0) return 'VOID';

    const isOver = selection.toUpperCase() === 'OVER';

    if (this.isQuarterLine(line)) {
      const line1 = line - 0.25;
      const line2 = line + 0.25;

      const r1 = this.settleOverUnderSingle(isOver, line1, totalGoals);
      const r2 = this.settleOverUnderSingle(isOver, line2, totalGoals);

      if (r1 === r2) return r1;
      const hasPush = r1 === 'PUSH' || r2 === 'PUSH';
      if (!hasPush) return 'PUSH';
      return (r1 === 'WIN' || r2 === 'WIN') ? 'HALF_WIN' : 'HALF_LOSS';
    }

    return this.settleOverUnderSingle(isOver, line, totalGoals);
  }

  private static settleOverUnderSingle(isOver: boolean, line: number, totalGoals: number): SettlementOutcome {
    const diff = totalGoals - line;
    if (Math.abs(diff) < 0.000001) return 'PUSH';
    if (isOver) {
      return diff > 0 ? 'WIN' : 'LOSS';
    } else {
      return diff < 0 ? 'WIN' : 'LOSS';
    }
  }

  /**
   * Calculates profit for 1 unit stake based on outcome and decimal odds.
   */
  public static calculateProfit(outcome: SettlementOutcome, decimalOdds: number, stake = 1): number {
    switch (outcome) {
      case 'WIN': return Number(((decimalOdds - 1) * stake).toFixed(4));
      case 'HALF_WIN': return Number((((decimalOdds - 1) / 2) * stake).toFixed(4));
      case 'PUSH': return 0;
      case 'HALF_LOSS': return Number((-0.5 * stake).toFixed(4));
      case 'LOSS': return Number((-stake).toFixed(4));
      case 'VOID': return 0;
      default: return 0;
    }
  }
}

