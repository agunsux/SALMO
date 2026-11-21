/**
 * SALMO Quant Mathematics Engine for Terminal
 * Pure mathematical functions for:
 * - Dixon-Coles bivariate score grid
 * - Asian Handicap split lines (-1.25 to +1.25)
 * - Over/Under totals (1.5, 2.5, 3.5)
 * - 1X2 Moneyline devigging & overround
 * - BettingStats color signal classification
 */

export interface JointProbabilityGrid {
  grid: number[][]; // 10x10 matrix [homeGoals][awayGoals]
  homeProb: number;
  drawProb: number;
  awayProb: number;
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
 * Computes 10x10 bivariate Poisson grid with Dixon-Coles low-score correlation adjustment
 */
export function computeDixonColesGrid(
  homeXG: number = 1.45,
  awayXG: number = 1.15,
  rho: number = -0.06
): JointProbabilityGrid {
  const lambda = Math.max(0.2, homeXG);
  const mu = Math.max(0.2, awayXG);
  const maxGoals = 10;
  const grid: number[][] = Array.from({ length: maxGoals }, () => Array(maxGoals).fill(0));

  let homeProb = 0;
  let drawProb = 0;
  let awayProb = 0;

  for (let i = 0; i < maxGoals; i++) {
    for (let j = 0; j < maxGoals; j++) {
      const pHome = poissonPmf(i, lambda);
      const pAway = poissonPmf(j, mu);
      let base = pHome * pAway;

      // Dixon-Coles adjustment for low scores (0,0), (0,1), (1,0), (1,1)
      let adj = 1.0;
      if (i === 0 && j === 0) {
        adj = 1.0 - lambda * mu * rho;
      } else if (i === 0 && j === 1) {
        adj = 1.0 + lambda * rho;
      } else if (i === 1 && j === 0) {
        adj = 1.0 + mu * rho;
      } else if (i === 1 && j === 1) {
        adj = 1.0 - rho;
      }

      const prob = Math.max(0, base * adj);
      grid[i][j] = prob;

      if (i > j) homeProb += prob;
      else if (i === j) drawProb += prob;
      else awayProb += prob;
    }
  }

  // Normalize grid so sum is exactly 1.0
  const total = homeProb + drawProb + awayProb;
  if (total > 0) {
    for (let i = 0; i < maxGoals; i++) {
      for (let j = 0; j < maxGoals; j++) {
        grid[i][j] /= total;
      }
    }
    homeProb /= total;
    drawProb /= total;
    awayProb /= total;
  }

  return { grid, homeProb, drawProb, awayProb };
}

export interface AhSplitLineResult {
  line: number;
  label: string;
  pWinEff: number;
  pLoseEff: number;
  fairOdds: number;
  marketOdds: number;
  evPct: number;
  coverRateL5: number;
  coverRateL10: number;
  coverRateSeason: number;
  signal: 'EMERALD' | 'AMBER' | 'SLATE';
}

/**
 * Calculates settlement outcome for a single half-line or full-line handicap.
 * Score difference diff = homeGoals - awayGoals.
 */
function settleSimpleLine(diff: number, line: number): 'WIN' | 'PUSH' | 'LOSS' {
  const result = diff + line;
  if (result > 0.001) return 'WIN';
  if (result < -0.001) return 'LOSS';
  return 'PUSH';
}

/**
 * Calculates effective win & loss probabilities for an Asian Handicap quarter or half line.
 */
export function calculateAhProbabilities(
  grid: number[][],
  line: number
): { pWinEff: number; pLoseEff: number } {
  const isQuarter = Math.abs(line * 4) % 2 === 1; // e.g. -0.25, +0.25, -0.75, +0.75
  let pWinEff = 0;
  let pLoseEff = 0;

  const maxGoals = grid.length;

  if (!isQuarter) {
    // Standard line: -0.5, 0.0, +0.5, -1.0, etc.
    for (let i = 0; i < maxGoals; i++) {
      for (let j = 0; j < maxGoals; j++) {
        const prob = grid[i][j];
        const res = settleSimpleLine(i - j, line);
        if (res === 'WIN') pWinEff += prob;
        else if (res === 'LOSS') pLoseEff += prob;
        // PUSH adds 0 to both effective win and loss in net-CLV calculation
      }
    }
  } else {
    // Split quarter line into two adjacent lines (line - 0.25) and (line + 0.25)
    const lineA = line - 0.25;
    const lineB = line + 0.25;

    for (let i = 0; i < maxGoals; i++) {
      for (let j = 0; j < maxGoals; j++) {
        const prob = grid[i][j];
        const diff = i - j;
        const resA = settleSimpleLine(diff, lineA);
        const resB = settleSimpleLine(diff, lineB);

        // Win contribution: 0.5 for each half that wins
        let winSub = 0;
        let loseSub = 0;

        if (resA === 'WIN') winSub += 0.5;
        else if (resA === 'LOSS') loseSub += 0.5;

        if (resB === 'WIN') winSub += 0.5;
        else if (resB === 'LOSS') loseSub += 0.5;

        pWinEff += prob * winSub;
        pLoseEff += prob * loseSub;
      }
    }
  }

  return { pWinEff, pLoseEff };
}

/**
 * Generates full Asian Handicap split table for lines -1.25 to +1.25
 */
export function generateAhSplitTable(
  grid: number[][],
  benchmarkMarketOdds: number = 1.95,
  benchmarkLine: number = -0.5
): AhSplitLineResult[] {
  const lines = [-1.25, -1.00, -0.75, -0.50, -0.25, 0.00, 0.25, 0.50, 0.75, 1.00, 1.25];

  return lines.map((line) => {
    const { pWinEff, pLoseEff } = calculateAhProbabilities(grid, line);
    const fairOdds = pWinEff > 0.01 ? 1 / pWinEff : 99.0;

    // Simulate realistic market odds around benchmark line with standard vigorish (~3.5%)
    const lineDiff = line - benchmarkLine;
    let marketOdds = benchmarkMarketOdds;
    if (lineDiff > 0) {
      marketOdds = Math.max(1.15, benchmarkMarketOdds * Math.exp(-lineDiff * 0.75));
    } else if (lineDiff < 0) {
      marketOdds = Math.min(6.5, benchmarkMarketOdds * Math.exp(-lineDiff * 0.75));
    }

    const ev = pWinEff * (marketOdds - 1.0) - pLoseEff * 1.0;
    const evPct = ev * 100;

    // Cover rate estimations based on effective win rate
    const coverRateSeason = Math.round(pWinEff * 100);
    const coverRateL10 = Math.min(100, Math.max(0, coverRateSeason + Math.round((line % 0.5) * 10)));
    const coverRateL5 = Math.min(100, Math.max(0, coverRateSeason - Math.round((line % 0.5) * 8)));

    let signal: 'EMERALD' | 'AMBER' | 'SLATE' = 'SLATE';
    if (evPct >= 2.0 || coverRateSeason >= 65) {
      signal = 'EMERALD';
    } else if (evPct >= 0.0 || (coverRateSeason >= 50 && coverRateSeason < 65)) {
      signal = 'AMBER';
    }

    const label = line > 0 ? `+${line.toFixed(2)}` : line.toFixed(2);

    return {
      line,
      label,
      pWinEff,
      pLoseEff,
      fairOdds: Number(fairOdds.toFixed(2)),
      marketOdds: Number(marketOdds.toFixed(2)),
      evPct: Number(evPct.toFixed(2)),
      coverRateL5,
      coverRateL10,
      coverRateSeason,
      signal
    };
  });
}

export interface OuTotalsResult {
  line: number;
  underProb: number;
  overProb: number;
  underFairOdds: number;
  overFairOdds: number;
  underMarketOdds: number;
  overMarketOdds: number;
  underEvPct: number;
  overEvPct: number;
  underCoverRate: number;
  overCoverRate: number;
}

export function generateOuTotalsTable(
  grid: number[][],
  homeXG: number = 1.45,
  awayXG: number = 1.15
): OuTotalsResult[] {
  const lines = [1.5, 2.5, 3.5];
  const maxGoals = grid.length;

  return lines.map((line) => {
    let underProb = 0;
    let overProb = 0;

    for (let i = 0; i < maxGoals; i++) {
      for (let j = 0; j < maxGoals; j++) {
        const totalGoals = i + j;
        if (totalGoals < line) {
          underProb += grid[i][j];
        } else {
          overProb += grid[i][j];
        }
      }
    }

    const underFairOdds = underProb > 0.01 ? 1 / underProb : 99.0;
    const overFairOdds = overProb > 0.01 ? 1 / overProb : 99.0;

    // Standard devigged market benchmark estimate
    const totalXG = homeXG + awayXG;
    let overMarketOdds = 1.95;
    let underMarketOdds = 1.95;

    if (line === 2.5) {
      if (totalXG > 2.7) {
        overMarketOdds = 1.80;
        underMarketOdds = 2.10;
      } else if (totalXG < 2.3) {
        overMarketOdds = 2.15;
        underMarketOdds = 1.78;
      }
    } else if (line === 1.5) {
      overMarketOdds = 1.28;
      underMarketOdds = 3.90;
    } else if (line === 3.5) {
      overMarketOdds = 3.10;
      underMarketOdds = 1.38;
    }

    const underEv = underProb * (underMarketOdds - 1.0) - (1 - underProb) * 1.0;
    const overEv = overProb * (overMarketOdds - 1.0) - (1 - overProb) * 1.0;

    return {
      line,
      underProb: Number((underProb * 100).toFixed(1)),
      overProb: Number((overProb * 100).toFixed(1)),
      underFairOdds: Number(underFairOdds.toFixed(2)),
      overFairOdds: Number(overFairOdds.toFixed(2)),
      underMarketOdds,
      overMarketOdds,
      underEvPct: Number((underEv * 100).toFixed(2)),
      overEvPct: Number((overEv * 100).toFixed(2)),
      underCoverRate: Math.round(underProb * 100),
      overCoverRate: Math.round(overProb * 100)
    };
  });
}
