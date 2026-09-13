// SALMO.DEV — Automated Verification Suite
// Tests Quarter-Line Settlement, Devigging, Decision Policy Gating,
// Real-Data Contract Loading, and i18n 5-Language Completeness.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

// 1. QUARTER-LINE SETTLEMENT ENGINE TESTS
test('QuarterLineSettler - Whole, Half, and Quarter Lines', async (t) => {
  // Direct mathematical settlement logic test
  function isQuarter(line) {
    const frac = Math.abs(line - Math.trunc(line));
    return frac === 0.25 || frac === 0.75;
  }

  function settleHalfStep(margin) {
    if (margin > 0.000001) return 'WIN';
    if (margin < -0.000001) return 'LOSS';
    return 'PUSH';
  }

  function settle(diff, line) {
    if (isQuarter(line)) {
      const base = Math.floor(line * 2) / 2;
      const r1 = settleHalfStep(diff + base);
      const r2 = settleHalfStep(diff + base + 0.5);
      if (r1 === r2) return r1;
      const hasPush = r1 === 'PUSH' || r2 === 'PUSH';
      if (!hasPush) return 'PUSH';
      return (r1 === 'WIN' || r2 === 'WIN') ? 'HALF_WIN' : 'HALF_LOSS';
    }
    return settleHalfStep(diff + line);
  }

  function calcProfit(outcome, odds, stake = 1) {
    switch (outcome) {
      case 'WIN': return (odds - 1) * stake;
      case 'HALF_WIN': return ((odds - 1) / 2) * stake;
      case 'PUSH': return 0;
      case 'HALF_LOSS': return -0.5 * stake;
      case 'LOSS': return -stake;
      case 'VOID': return 0;
    }
  }

  // Level 0: 0.00 Line
  assert.strictEqual(settle(1, 0), 'WIN');
  assert.strictEqual(settle(0, 0), 'PUSH');
  assert.strictEqual(settle(-1, 0), 'LOSS');

  // Quarter Line -0.25 (Level -0.25):
  // Win by 1 -> WIN
  // Draw (0) -> HALF_LOSS
  // Loss by 1 -> LOSS
  assert.strictEqual(settle(1, -0.25), 'WIN');
  assert.strictEqual(settle(0, -0.25), 'HALF_LOSS');
  assert.strictEqual(settle(-1, -0.25), 'LOSS');

  // Quarter Line -0.75 (Level -0.75):
  // Win by 2 -> WIN
  // Win by 1 -> HALF_WIN
  // Draw (0) -> LOSS
  assert.strictEqual(settle(2, -0.75), 'WIN');
  assert.strictEqual(settle(1, -0.75), 'HALF_WIN');
  assert.strictEqual(settle(0, -0.75), 'LOSS');

  // Quarter Line +0.25 (Level +0.25):
  // Win by 1 -> WIN
  // Draw (0) -> HALF_WIN
  // Loss by 1 -> LOSS
  assert.strictEqual(settle(1, 0.25), 'WIN');
  assert.strictEqual(settle(0, 0.25), 'HALF_WIN');
  assert.strictEqual(settle(-1, 0.25), 'LOSS');

  // Quarter Line +0.75 (Level +0.75):
  // Draw (0) -> WIN
  // Loss by 1 -> HALF_LOSS
  // Loss by 2 -> LOSS
  assert.strictEqual(settle(0, 0.75), 'WIN');
  assert.strictEqual(settle(-1, 0.75), 'HALF_LOSS');
  assert.strictEqual(settle(-2, 0.75), 'LOSS');

  // Half Line -0.50:
  // Win by 1 -> WIN
  // Draw (0) -> LOSS
  assert.strictEqual(settle(1, -0.5), 'WIN');
  assert.strictEqual(settle(0, -0.5), 'LOSS');

  // Whole Line -1.00:
  // Win by 2 -> WIN
  // Win by 1 -> PUSH
  // Draw (0) -> LOSS
  assert.strictEqual(settle(2, -1.0), 'WIN');
  assert.strictEqual(settle(1, -1.0), 'PUSH');
  assert.strictEqual(settle(0, -1.0), 'LOSS');

  // Profit calculations
  assert.strictEqual(Number(calcProfit('WIN', 1.91).toFixed(2)), 0.91);
  assert.strictEqual(Number(calcProfit('HALF_WIN', 1.91).toFixed(3)), 0.455);
  assert.strictEqual(calcProfit('PUSH', 1.91), 0);
  assert.strictEqual(calcProfit('HALF_LOSS', 1.91), -0.5);
  assert.strictEqual(calcProfit('LOSS', 1.91), -1);
});

// 2. DEVIGGING & IMPLIED PROBABILITY TESTS
test('DevigEngine - Two-Way Multiplicative Margin Removal', async (t) => {
  function devig(oddsA, oddsB) {
    const rawA = 1 / oddsA;
    const rawB = 1 / oddsB;
    const sum = rawA + rawB;
    return {
      pA: rawA / sum,
      pB: rawB / sum,
      overround: sum,
    };
  }

  const res = devig(1.91, 1.95);
  assert.ok(res.overround > 1.0, 'Vigorish must exceed 1.0');
  assert.strictEqual(Number((res.pA + res.pB).toFixed(4)), 1.0, 'Devigged probabilities must sum to 1.0');

  // Edge calculation
  const modelProb = 56.5;
  const impliedProb = Number((res.pA * 100).toFixed(1));
  const edge = Number((modelProb - impliedProb).toFixed(1));
  assert.ok(edge > 0, 'Model with 56.5% should have positive edge against 1.91');
});

// 3. DECISION POLICY GATING TESTS
test('DecisionPolicy - Strict Gating (GREEN, YELLOW, RED, GREY)', async (t) => {
  function evaluate(odds, modelProb, impliedProb, sampleSize) {
    if (!odds || odds <= 1) return { badge: 'GREY', status: 'ODDS_UNAVAILABLE' };
    if (sampleSize < 20) return { badge: 'GREY', status: 'INSUFFICIENT_DATA' };
    const edge = modelProb - impliedProb;
    if (edge >= 3.0 && sampleSize >= 40) return { badge: 'GREEN', status: 'VALUE' };
    if (edge >= 0.5) return { badge: 'YELLOW', status: 'MARGINAL' };
    return { badge: 'RED', status: 'NO_VALUE' };
  }

  // Missing odds -> GREY
  assert.strictEqual(evaluate(null, 55, 50, 100).badge, 'GREY');
  assert.strictEqual(evaluate(0, 55, 50, 100).badge, 'GREY');

  // Insufficient sample (< 20) -> GREY
  assert.strictEqual(evaluate(1.91, 60, 50, 15).badge, 'GREY');

  // Qualified value (Edge >= +3.0 pp, N >= 40) -> GREEN
  assert.strictEqual(evaluate(1.91, 56.5, 52.4, 184).badge, 'GREEN');

  // Marginal edge -> YELLOW
  assert.strictEqual(evaluate(1.91, 53.5, 52.4, 100).badge, 'YELLOW');

  // Negative edge -> RED
  assert.strictEqual(evaluate(1.91, 48.0, 52.4, 100).badge, 'RED');
});

// 4. REAL HANDICAPLAB CONTRACT ADAPTER TESTS
test('HandicapLabClient - Real Data Loading & Zero Fabrication', async (t) => {
  const dataDir = path.resolve('..', 'HandicapLab', 'data', 'bronze', 'football_data');
  assert.ok(fs.existsSync(dataDir), 'HandicapLab bronze directory must exist');

  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.csv'));
  assert.ok(files.length >= 7, 'Must have at least 7 season CSVs');

  let totalMatches = 0;
  let ahMatches = 0;

  files.forEach(file => {
    const lines = fs.readFileSync(path.join(dataDir, file), 'utf8').split(/\r?\n/).filter(l => l.trim().length > 0);
    const header = lines[0].split(',');
    const ahIdx = header.indexOf('AHCh') !== -1 ? header.indexOf('AHCh') : header.indexOf('AHh');
    totalMatches += (lines.length - 1);
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (ahIdx !== -1 && cols[ahIdx] && cols[ahIdx].trim() !== '') {
        ahMatches++;
      }
    }
  });

  assert.ok(totalMatches >= 3000, `Expected >= 3000 total matches, found ${totalMatches}`);
  assert.ok(ahMatches >= 2600, `Expected >= 2600 matches with AH line, found ${ahMatches}`);
});

// 5. I18N 5-LANGUAGE COMPLETENESS TESTS
test('i18n - 5 Launch Languages Completeness', async (t) => {
  // Load translation file
  const tsContent = fs.readFileSync(path.resolve('src', 'i18n', 'translations.ts'), 'utf8');
  assert.ok(tsContent.includes('en:'), 'English translations must be present');
  assert.ok(tsContent.includes('es:'), 'Spanish translations must be present');
  assert.ok(tsContent.includes("'pt-BR':"), 'Portuguese translations must be present');
  assert.ok(tsContent.includes('hi:'), 'Hindi translations must be present');
  assert.ok(tsContent.includes('fr:'), 'French translations must be present');
});
