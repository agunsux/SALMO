// SALMO.DEV — Closing Line Value (CLV) Engine
// Secondary validation signal comparing taken odds against closing snapshot.
// Invariants:
// 1. Same-line only: takenLine === closingLine. If line moved, CLV is null (never 0).
// 2. Exact devigged closing no-vig probability: p_novig = (1 / odds_side) / sum_inverse_odds.
// 3. Formula: CLV = odds_taken * closing_novig_prob - 1.

export interface ClosingSnapshotInput {
  marketType: 'AH' | 'OU';
  takenLine: number;
  takenSelection: string;
  oddsTaken: number;
  closingLine: number | null;
  closingOddsSide: number | null;
  closingOddsOther: number | null;
  closingSnapshotTimestamp?: string;
}

export interface ClvCalculationResult {
  clv: number | null;           // Decimal (e.g. 0.035 for +3.5%), or null if unavailable / line moved
  clvPct: number | null;        // Percentage (e.g. 3.5 for +3.5%), or null
  closingNovigProb: number | null;
  status: 'CALCULATED' | 'LINE_MOVED' | 'NO_CLOSING_SNAPSHOT' | 'INVALID_ODDS';
  reason?: string;
  timestamp?: string;
}

export class ClvEngine {
  /**
   * Calculate CLV under strict same-line invariant.
   */
  public static calculateClv(input: ClosingSnapshotInput): ClvCalculationResult {
    // 1. Check if closing snapshot is present
    if (
      input.closingLine === null ||
      input.closingLine === undefined ||
      input.closingOddsSide === null ||
      input.closingOddsSide === undefined ||
      input.closingOddsSide <= 1.0
    ) {
      return {
        clv: null,
        clvPct: null,
        closingNovigProb: null,
        status: 'NO_CLOSING_SNAPSHOT',
        reason: 'No closing odds snapshot available',
      };
    }

    // 2. Strict same-line check: takenLine must equal closingLine
    const lineDiff = Math.abs(input.takenLine - input.closingLine);
    if (lineDiff > 0.0001) {
      return {
        clv: null,
        clvPct: null,
        closingNovigProb: null,
        status: 'LINE_MOVED',
        reason: `Line moved from ${input.takenLine} to ${input.closingLine}; cross-line CLV prohibited`,
      };
    }

    // 3. Multiplicative Devig for 2-way market (AH / OU)
    if (
      input.closingOddsOther === null ||
      input.closingOddsOther === undefined ||
      input.closingOddsOther <= 1.0
    ) {
      // If opposite odds missing, cannot cleanly devig without bookmaker margin assumption
      return {
        clv: null,
        clvPct: null,
        closingNovigProb: null,
        status: 'INVALID_ODDS',
        reason: 'Opposite side closing odds missing for 2-way devig',
      };
    }

    const invSide = 1 / input.closingOddsSide;
    const invOther = 1 / input.closingOddsOther;
    const overround = invSide + invOther;

    if (overround <= 0 || !Number.isFinite(overround)) {
      return {
        clv: null,
        clvPct: null,
        closingNovigProb: null,
        status: 'INVALID_ODDS',
        reason: 'Invalid overround in closing odds',
      };
    }

    const closingNovigProb = invSide / overround;

    // 4. CLV = odds_taken * closing_novig_prob - 1
    const clv = input.oddsTaken * closingNovigProb - 1;
    const clvRounded = Number(clv.toFixed(4));
    const clvPctRounded = Number((clv * 100).toFixed(2));

    return {
      clv: clvRounded,
      clvPct: clvPctRounded,
      closingNovigProb: Number(closingNovigProb.toFixed(4)),
      status: 'CALCULATED',
      timestamp: input.closingSnapshotTimestamp || new Date().toISOString(),
    };
  }
}
