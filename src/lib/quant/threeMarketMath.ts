/**
 * HandicapLab / SALMO — Exact 3-Market Mathematical Engine
 * Strict quant implementation for:
 * 1. Exact Poisson Scoreline Matrix (0..8 goals) from (lambda_H, lambda_A)
 * 2. Exact Expected Value (with Push & 50/50 Quarter-Handicap Splitting)
 * 3. 2-way Power De-Vig & 3-way Multiplicative / Shin's De-Vig + Overround %
 * 4. Exact Bidirectional Odds Format Converters (Decimal, American, Hong Kong, Malay)
 */

export type OddsFormat = 'decimal' | 'american' | 'hongkong' | 'malay';

export interface ScorelineMatrix {
  grid: number[][]; // [homeGoals][awayGoals] (0..8)
  totalSum: number;
  probHome: number;
  probDraw: number;
  probAway: number;
  ouProbs: {
    over15: number;
    under15: number;
    over25: number;
    under25: number;
    over35: number;
    under35: number;
  };
  ahProbs: Record<string, { win: number; push: number; lose: number }>;
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  let res = 1;
  for (let i = 2; i <= n; i++) res *= i;
  return res;
}

function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

/**
 * 1. Exact Poisson Scoreline Matrix (0..8 goals) from (lambda_H, lambda_A)
 */
export function computeScorelineMatrix(
  lambdaH: number = 1.45,
  lambdaA: number = 1.15,
  maxGoals: number = 8
): ScorelineMatrix {
  const lH = Math.max(0.1, lambdaH);
  const lA = Math.max(0.1, lambdaA);
  const size = maxGoals + 1; // 0..8 is 9x9

  const grid: number[][] = Array.from({ length: size }, () => Array(size).fill(0));
  let probHome = 0;
  let probDraw = 0;
  let probAway = 0;

  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const p = poissonPmf(i, lH) * poissonPmf(j, lA);
      grid[i][j] = p;
      if (i > j) probHome += p;
      else if (i === j) probDraw += p;
      else probAway += p;
    }
  }

  // Normalize grid so sum is exactly 1.0
  const totalSum = probHome + probDraw + probAway;
  if (totalSum > 0) {
    probHome /= totalSum;
    probDraw /= totalSum;
    probAway /= totalSum;
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        grid[i][j] /= totalSum;
      }
    }
  }

  // Over / Under probabilities
  let over15 = 0;
  let over25 = 0;
  let over35 = 0;

  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const tot = i + j;
      const p = grid[i][j];
      if (tot > 1.5) over15 += p;
      if (tot > 2.5) over25 += p;
      if (tot > 3.5) over35 += p;
    }
  }

  // AH lines: evaluate discrete score difference distribution
  // line h means Home handicap line. Outcome = (homeGoals - awayGoals) + h
  const ahLines = [-1.5, -1.25, -1.0, -0.75, -0.5, -0.25, 0.0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5];
  const ahProbs: Record<string, { win: number; push: number; lose: number }> = {};

  for (const h of ahLines) {
    let win = 0;
    let push = 0;
    let lose = 0;

    // Check if whole/half vs quarter line
    const isQuarter = Math.abs(h % 0.5) === 0.25;
    if (!isQuarter) {
      for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
          const diff = i - j + h;
          const p = grid[i][j];
          if (diff > 0) win += p;
          else if (diff === 0) push += p;
          else lose += p;
        }
      }
    } else {
      // 50/50 split of adjacent lines (h - 0.25 and h + 0.25)
      const hLower = h - 0.25;
      const hUpper = h + 0.25;
      let w1 = 0, p1 = 0, l1 = 0;
      let w2 = 0, p2 = 0, l2 = 0;

      for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
          const p = grid[i][j];
          const diff1 = i - j + hLower;
          if (diff1 > 0) w1 += p;
          else if (diff1 === 0) p1 += p;
          else l1 += p;

          const diff2 = i - j + hUpper;
          if (diff2 > 0) w2 += p;
          else if (diff2 === 0) p2 += p;
          else l2 += p;
        }
      }

      win = 0.5 * (w1 + w2);
      push = 0.5 * (p1 + p2);
      lose = 0.5 * (l1 + l2);
    }

    ahProbs[h.toFixed(2)] = { win, push, lose };
  }

  return {
    grid,
    totalSum: 1.0,
    probHome,
    probDraw,
    probAway,
    ouProbs: {
      over15,
      under15: 1.0 - over15,
      over25,
      under25: 1.0 - over25,
      over35,
      under35: 1.0 - over35,
    },
    ahProbs,
  };
}

/**
 * 2. Exact Expected Value (with Push & 50/50 Quarter-Handicap Splitting)
 * Whole/half line L: EV = P_win * (Odds - 1) - P_lose
 * Quarter/split line h: EV(h, Odds) = 0.5 * EV(h - 0.25, Odds) + 0.5 * EV(h + 0.25, Odds)
 */
export function calculateExactEV(
  odds: number,
  probWin: number,
  probLose: number
): number {
  if (odds <= 1.0) return -1.0;
  // Push returns 0 units (stake returned)
  return probWin * (odds - 1.0) - probLose * 1.0;
}

export function calculateQuarterLineEV(
  odds: number,
  h: number,
  scoreMatrix: ScorelineMatrix
): number {
  const isQuarter = Math.abs(h % 0.5) === 0.25;
  if (!isQuarter) {
    const key = h.toFixed(2);
    const p = scoreMatrix.ahProbs[key] || { win: 0, push: 0, lose: 0 };
    return calculateExactEV(odds, p.win, p.lose);
  }

  const hLower = (h - 0.25).toFixed(2);
  const hUpper = (h + 0.25).toFixed(2);

  const pLower = scoreMatrix.ahProbs[hLower] || { win: 0, push: 0, lose: 0 };
  const pUpper = scoreMatrix.ahProbs[hUpper] || { win: 0, push: 0, lose: 0 };

  const evLower = calculateExactEV(odds, pLower.win, pLower.lose);
  const evUpper = calculateExactEV(odds, pUpper.win, pUpper.lose);

  return 0.5 * evLower + 0.5 * evUpper;
}

/**
 * 3. De-Vigging & Overround
 * - 2-way Power Method: (1/O1)^k + (1/O2)^k = 1
 * - 3-way Multiplicative De-vig: sum = 1/O1 + 1/O2 + 1/O3, overround = (sum - 1)*100
 */
export function devigPower2Way(
  odds1: number,
  odds2: number
): { p1: number; p2: number; k: number; overround: number } {
  if (odds1 <= 1.0 || odds2 <= 1.0) {
    return { p1: 0.5, p2: 0.5, k: 1.0, overround: 0.0 };
  }

  const inv1 = 1.0 / odds1;
  const inv2 = 1.0 / odds2;
  const sumInv = inv1 + inv2;
  const overround = (sumInv - 1.0) * 100.0;

  // Solve (inv1)^k + (inv2)^k = 1 via 1D Newton-Raphson / bisection
  let k = 1.0;
  for (let iter = 0; iter < 20; iter++) {
    const f = Math.pow(inv1, k) + Math.pow(inv2, k) - 1.0;
    if (Math.abs(f) < 1e-8) break;
    const df = Math.pow(inv1, k) * Math.log(inv1) + Math.pow(inv2, k) * Math.log(inv2);
    if (Math.abs(df) < 1e-12) break;
    k = k - f / df;
  }

  const p1 = Math.pow(inv1, k);
  const p2 = Math.pow(inv2, k);
  const norm = p1 + p2;

  return {
    p1: p1 / norm,
    p2: p2 / norm,
    k,
    overround,
  };
}

export function devigMultiplicative3Way(
  oddsHome: number,
  oddsDraw: number,
  oddsAway: number
): { pHome: number; pDraw: number; pAway: number; overround: number } {
  if (oddsHome <= 1.0 || oddsDraw <= 1.0 || oddsAway <= 1.0) {
    return { pHome: 0.333, pDraw: 0.334, pAway: 0.333, overround: 0.0 };
  }

  const invH = 1.0 / oddsHome;
  const invD = 1.0 / oddsDraw;
  const invA = 1.0 / oddsAway;
  const sumInv = invH + invD + invA;
  const overround = (sumInv - 1.0) * 100.0;

  return {
    pHome: invH / sumInv,
    pDraw: invD / sumInv,
    pAway: invA / sumInv,
    overround,
  };
}

/**
 * 4. Odds Format Converters: Bidirectional Decimal, American, Hong Kong, Malay
 */
export function convertOdds(
  decimalOdds: number,
  targetFormat: OddsFormat
): string {
  if (!decimalOdds || isNaN(decimalOdds) || decimalOdds <= 1.0) {
    return targetFormat === 'american' ? '+100' : '1.00';
  }

  switch (targetFormat) {
    case 'decimal':
      return decimalOdds.toFixed(2);

    case 'american': {
      if (decimalOdds >= 2.0) {
        const val = Math.round((decimalOdds - 1.0) * 100);
        return `+${val}`;
      } else {
        const val = Math.round(-100 / (decimalOdds - 1.0));
        return `${val}`;
      }
    }

    case 'hongkong': {
      const hk = decimalOdds - 1.0;
      return hk.toFixed(2);
    }

    case 'malay': {
      const net = decimalOdds - 1.0;
      if (net <= 1.0) {
        return net.toFixed(2);
      } else {
        const my = -1.0 / net;
        return my.toFixed(2);
      }
    }

    default:
      return decimalOdds.toFixed(2);
  }
}

export function parseOddsToDecimal(oddsStr: string, fromFormat: OddsFormat): number {
  const val = parseFloat(oddsStr);
  if (isNaN(val)) return 2.0;

  switch (fromFormat) {
    case 'decimal':
      return Math.max(1.01, val);

    case 'american': {
      if (val > 0) {
        return 1.0 + val / 100.0;
      } else {
        return 1.0 + 100.0 / Math.abs(val);
      }
    }

    case 'hongkong':
      return Math.max(1.01, val + 1.0);

    case 'malay': {
      if (val > 0) {
        return 1.0 + val;
      } else {
        return 1.0 + 1.0 / Math.abs(val);
      }
    }

    default:
      return Math.max(1.01, val);
  }
}
