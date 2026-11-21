const test = require('node:test');
const assert = require('node:assert/strict');

test('Exact Poisson Scoreline Matrix Sum ≈ 1.0', async () => {
  const { computeScorelineMatrix } = await import('../../src/lib/quant/threeMarketMath.ts');
  const matrix = computeScorelineMatrix(1.5, 1.2, 8);
  assert.ok(Math.abs(matrix.totalSum - 1.0) < 1e-6, 'Matrix totalSum must be 1.0');

  const pSum = matrix.probHome + matrix.probDraw + matrix.probAway;
  assert.ok(Math.abs(pSum - 1.0) < 1e-6, 'Sum of 1X2 probabilities must equal 1.0');

  // Verify O/U 2.5 probabilities sum to 1.0
  const ouSum = matrix.ouProbs.over25 + matrix.ouProbs.under25;
  assert.ok(Math.abs(ouSum - 1.0) < 1e-6, 'Over 2.5 + Under 2.5 must equal 1.0');
});

test('Exact Expected Value Sign: market_odds > fair_odds => EV > 0', async () => {
  const { calculateExactEV } = await import('../../src/lib/quant/threeMarketMath.ts');
  const probWin = 0.50;
  const probLose = 0.50;

  // When bookmaker offers 2.10 (higher than fair odds 2.0)
  const evPositive = calculateExactEV(2.10, probWin, probLose);
  assert.ok(evPositive > 0, `Expected positive EV, got ${evPositive}`);

  // When bookmaker offers 1.90 (lower than fair odds 2.0)
  const evNegative = calculateExactEV(1.90, probWin, probLose);
  assert.ok(evNegative < 0, `Expected negative EV, got ${evNegative}`);

  // Fair market odds yields 0 EV
  const evZero = calculateExactEV(2.0, probWin, probLose);
  assert.ok(Math.abs(evZero) < 1e-6, `Expected zero EV, got ${evZero}`);
});

test('Quarter-Line Exact 50/50 Splitting for -0.25 and -0.75', async () => {
  const { computeScorelineMatrix, calculateQuarterLineEV } = await import('../../src/lib/quant/threeMarketMath.ts');
  const matrix = computeScorelineMatrix(1.6, 1.1, 8);

  // -0.25 is split 50/50 between 0.0 (scratch) and -0.5
  const evMinus025 = calculateQuarterLineEV(1.95, -0.25, matrix);
  const ev00 = calculateQuarterLineEV(1.95, 0.0, matrix);
  const evMinus050 = calculateQuarterLineEV(1.95, -0.50, matrix);
  const expectedSplit = 0.5 * ev00 + 0.5 * evMinus050;
  assert.ok(
    Math.abs(evMinus025 - expectedSplit) < 1e-6,
    `-0.25 EV (${evMinus025}) must equal 0.5*EV(0) + 0.5*EV(-0.5) (${expectedSplit})`
  );

  // -0.75 is split 50/50 between -0.5 and -1.0
  const evMinus075 = calculateQuarterLineEV(1.95, -0.75, matrix);
  const evMinus100 = calculateQuarterLineEV(1.95, -1.0, matrix);
  const expectedSplit75 = 0.5 * evMinus050 + 0.5 * evMinus100;
  assert.ok(
    Math.abs(evMinus075 - expectedSplit75) < 1e-6,
    `-0.75 EV (${evMinus075}) must equal 0.5*EV(-0.5) + 0.5*EV(-1.0) (${expectedSplit75})`
  );
});

test('2-Way Power De-Vig Sums to Exactly 1.0', async () => {
  const { devigPower2Way } = await import('../../src/lib/quant/threeMarketMath.ts');
  const odds1 = 1.95;
  const odds2 = 1.90;
  const devigged = devigPower2Way(odds1, odds2);

  assert.ok(
    Math.abs(devigged.p1 + devigged.p2 - 1.0) < 1e-6,
    'Devigged probabilities must sum to 1.0'
  );
  assert.ok(devigged.overround > 0, 'Overround must be positive for vigged lines');
});

test('3-Way Multiplicative De-Vig Sums to Exactly 1.0', async () => {
  const { devigMultiplicative3Way } = await import('../../src/lib/quant/threeMarketMath.ts');
  const devigged = devigMultiplicative3Way(2.15, 3.40, 3.50);
  const sum = devigged.pHome + devigged.pDraw + devigged.pAway;
  assert.ok(Math.abs(sum - 1.0) < 1e-6, '3-way devigged sum must equal 1.0');
  assert.ok(devigged.overround > 0, 'Overround must be positive');
});

test('Bidirectional Odds Format Conversion Parity', async () => {
  const { convertOdds, parseOddsToDecimal } = await import('../../src/lib/quant/threeMarketMath.ts');
  const testDecimals = [1.50, 1.95, 2.00, 2.50, 3.25, 5.00];

  for (const dec of testDecimals) {
    // American
    const usStr = convertOdds(dec, 'american');
    const decFromUs = parseOddsToDecimal(usStr, 'american');
    assert.ok(
      Math.abs(dec - decFromUs) < 0.05,
      `American conversion parity failed for ${dec} -> ${usStr} -> ${decFromUs}`
    );

    // Hong Kong
    const hkStr = convertOdds(dec, 'hongkong');
    const decFromHk = parseOddsToDecimal(hkStr, 'hongkong');
    assert.ok(
      Math.abs(dec - decFromHk) < 0.01,
      `Hong Kong conversion parity failed for ${dec} -> ${hkStr} -> ${decFromHk}`
    );

    // Malay (allowing for 2-decimal string rounding)
    const myStr = convertOdds(dec, 'malay');
    const decFromMy = parseOddsToDecimal(myStr, 'malay');
    assert.ok(
      Math.abs(dec - decFromMy) < 0.05,
      `Malay conversion parity failed for ${dec} -> ${myStr} -> ${decFromMy}`
    );
  }
});
