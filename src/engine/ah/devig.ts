// SALMO.DEV — Devigging & Implied Probability Engine
// Removes bookmaker vigorish from two-way markets (AH, BTTS, O/U) to obtain true market probabilities.

export interface DevigResult {
  impliedProbA: number; // 0 to 1
  impliedProbB: number; // 0 to 1
  overround: number;    // e.g. 1.045 for 4.5% vigorish
}

export class DevigEngine {
  /**
   * Two-way multiplicative devigging.
   */
  public static devigTwoWay(oddsA: number, oddsB?: number | null): DevigResult {
    if (!oddsA || oddsA <= 1 || !Number.isFinite(oddsA)) {
      return { impliedProbA: 0, impliedProbB: 0, overround: 1 };
    }

    if (!oddsB || oddsB <= 1 || !Number.isFinite(oddsB)) {
      // Single-sided raw inverse if opposite price is not published
      const raw = 1 / oddsA;
      return {
        impliedProbA: Math.min(Math.max(raw, 0), 1),
        impliedProbB: Math.min(Math.max(1 - raw, 0), 1),
        overround: 1,
      };
    }

    const rawA = 1 / oddsA;
    const rawB = 1 / oddsB;
    const sum = rawA + rawB;

    if (sum <= 0) {
      return { impliedProbA: 0, impliedProbB: 0, overround: 1 };
    }

    return {
      impliedProbA: Number((rawA / sum).toFixed(4)),
      impliedProbB: Number((rawB / sum).toFixed(4)),
      overround: Number(sum.toFixed(4)),
    };
  }

  /**
   * Calculates net edge in percentage points.
   * e.g. Model = 56.5%, Implied = 52.4% -> Edge = +4.1 pp
   */
  public static calculateEdgePercentagePoints(
    modelProbPct: number,
    impliedProbPct: number
  ): number {
    return Number((modelProbPct - impliedProbPct).toFixed(1));
  }
}

