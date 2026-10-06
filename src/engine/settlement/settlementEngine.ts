// SALMO.DEV — Production Settlement Engine
// Full Quarter-Line & Half-Line Settlement Resolution.
// Strictly supports: WIN, HALF_WIN, PUSH, HALF_LOSS, LOSS, VOID.
// Immutable 1.0 unit stake settlement accounting.

import { SettlementOutcome } from '../../types/index';
import { QuarterLineSettler } from '../ah/quarterLineSettler';

export type SettlementStatus = 'PENDING' | 'SETTLED' | 'VOID';

export interface SettlementInput {
  ledgerPositionId: string;
  marketType: 'AH' | 'OU';
  selection: string; // e.g. "Aston Villa 0", "home", "away", "OVER 2.75", "under"
  line: number;      // e.g. 0, -0.25, -0.75, 2.25, 2.75, 3.0
  oddsTaken: number;
  homeGoals: number | null;
  awayGoals: number | null;
  matchStatus?: 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'POSTPONED' | 'CANCELLED';
  voided?: boolean;
}

export interface SettlementResult {
  ledgerPositionId: string;
  settlementStatus: SettlementStatus;
  result: SettlementOutcome | null;
  profitUnits: number;
  stakeUnits: number; // 1.0 for settled/pushed bets, 0.0 for pending/void
  settledAt: string | null;
  reason?: string;
}

export class SettlementEngine {
  /**
   * Settle a position given match outcome scores.
   */
  public static settlePosition(input: SettlementInput): SettlementResult {
    // 1. Pending checks
    if (
      input.matchStatus === 'SCHEDULED' ||
      input.matchStatus === 'LIVE' ||
      input.homeGoals === null ||
      input.awayGoals === null
    ) {
      return {
        ledgerPositionId: input.ledgerPositionId,
        settlementStatus: 'PENDING',
        result: null,
        profitUnits: 0,
        stakeUnits: 0,
        settledAt: null,
        reason: 'Match has not concluded or score unavailable',
      };
    }

    // 2. Void / Cancellation checks
    if (
      input.voided ||
      input.matchStatus === 'POSTPONED' ||
      input.matchStatus === 'CANCELLED' ||
      input.homeGoals < 0 ||
      input.awayGoals < 0
    ) {
      return {
        ledgerPositionId: input.ledgerPositionId,
        settlementStatus: 'VOID',
        result: 'VOID',
        profitUnits: 0,
        stakeUnits: 0, // VOID bets do not count in stakes
        settledAt: new Date().toISOString(),
        reason: 'Match voided, abandoned, or postponed',
      };
    }

    const hGoals = input.homeGoals;
    const aGoals = input.awayGoals;
    let outcome: SettlementOutcome;

    if (input.marketType === 'AH') {
      // Determine side from selection
      const sel = input.selection.toLowerCase();
      // If selection indicates away team or 'away', treat as away
      const isAway = sel.includes('away') || sel.startsWith('away');
      const side: 'home' | 'away' = isAway ? 'away' : 'home';

      outcome = QuarterLineSettler.settle(side, input.line, hGoals, aGoals, false);
    } else if (input.marketType === 'OU') {
      const sel = input.selection.toUpperCase();
      const isOver = sel.includes('OVER');
      const totalGoals = hGoals + aGoals;

      outcome = QuarterLineSettler.settleOverUnder(
        isOver ? 'OVER' : 'UNDER',
        input.line,
        totalGoals,
        false
      );
    } else {
      return {
        ledgerPositionId: input.ledgerPositionId,
        settlementStatus: 'VOID',
        result: 'VOID',
        profitUnits: 0,
        stakeUnits: 0,
        settledAt: new Date().toISOString(),
        reason: `Unsupported market type for production settlement: ${input.marketType}`,
      };
    }

    const profit = QuarterLineSettler.calculateProfit(outcome, input.oddsTaken, 1.0);

    return {
      ledgerPositionId: input.ledgerPositionId,
      settlementStatus: 'SETTLED',
      result: outcome,
      profitUnits: profit,
      stakeUnits: 1.0, // Settled bets (win, loss, push, half_win, half_loss) count in stakes
      settledAt: new Date().toISOString(),
    };
  }
}
