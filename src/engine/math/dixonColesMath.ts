// SALMO.DEV — Pure Mathematical Core for Dixon-Coles & Poisson Models
// Numerically stable log-space calculations avoiding float overflow.
// Migrated from HandicapLab validated quant engine.

/**
 * Calculates the natural logarithm of the factorial of n.
 * Iterative approach, safe for football scorelines (k <= 100).
 */
export function logFactorial(n: number): number {
  if (n < 0) return -Infinity;
  let sum = 0;
  for (let i = 2; i <= n; i++) {
    sum += Math.log(i);
  }
  return sum;
}

/**
 * Calculates Poisson Probability Mass Function: P(X = k)
 * Numerically safe log-space implementation.
 */
export function poissonPMF(lambda: number, k: number): number {
  if (lambda <= 0 || k < 0 || !Number.isInteger(k)) {
    return 0;
  }
  // P(k; lambda) = exp( k * ln(lambda) - lambda - ln(k!) )
  const logP = k * Math.log(lambda) - lambda - logFactorial(k);
  return Math.exp(logP);
}

/**
 * Calculates Poisson Cumulative Distribution Function: P(X <= k)
 */
export function poissonCDF(lambda: number, k: number): number {
  if (lambda <= 0 || k < 0) {
    return 0;
  }
  const limit = Math.floor(k);
  let sum = 0;
  for (let i = 0; i <= limit; i++) {
    sum += poissonPMF(lambda, i);
  }
  return Math.min(1.0, sum);
}

/**
 * Dixon-Coles dependency correction factor for low-scoring matches.
 * Corrects for the correlation of goals at scorelines (0,0), (1,0), (0,1), and (1,1).
 * tau(x, y, lambda, mu, rho)
 */
export function dixonColesCorrection(
  x: number,
  y: number,
  lambda: number,
  mu: number,
  rho: number
): number {
  if (x < 0 || y < 0 || !Number.isInteger(x) || !Number.isInteger(y)) {
    return 1.0;
  }

  if (x === 0 && y === 0) {
    return 1.0 - rho * lambda * mu;
  }
  if (x === 1 && y === 0) {
    return 1.0 + rho * mu;
  }
  if (x === 0 && y === 1) {
    return 1.0 + rho * lambda;
  }
  if (x === 1 && y === 1) {
    return 1.0 - rho;
  }

  return 1.0;
}

/**
 * Calculates Kelly Criterion staking fraction.
 */
export function kellyFraction(
  probability: number,
  odds: number,
  fraction = 0.25
): number {
  if (probability <= 0 || probability > 1 || odds <= 1 || fraction <= 0) {
    return 0;
  }
  const edge = probability * odds - 1;
  if (edge <= 0) {
    return 0;
  }
  const rawKelly = probability - (1.0 - probability) / (odds - 1.0);
  return Math.max(0, rawKelly * fraction);
}

/**
 * Brier Score for probability forecast calibration measurement.
 */
export function brierScore(outcomes: number[], probabilities: number[]): number {
  if (outcomes.length !== probabilities.length || outcomes.length === 0) {
    throw new Error('Arrays must be non-empty and of equal length.');
  }
  let sumSquaredDiffs = 0;
  for (let i = 0; i < outcomes.length; i++) {
    const p = probabilities[i];
    const o = outcomes[i];
    sumSquaredDiffs += Math.pow(p - o, 2);
  }
  return sumSquaredDiffs / outcomes.length;
}
