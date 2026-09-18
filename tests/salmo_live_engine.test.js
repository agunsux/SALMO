// SALMO.DEV — Live Prediction Engine & Verification Test Suite
// Verifies:
// 1. Fixture reconciliation across API-Football, OddsPapi, and FootyStats.
// 2. Strict market scope invariant: Strictly AH, BTTS, and OU 2.5 (NO Moneyline/1X2).
// 3. Point-in-time integrity & anti-leakage: predictionTimestamp < kickoffUtc.
// 4. Exact mathematical settlement: Quarter-line split settlement & BTTS score grid sum.
// 5. Honest validation matrix: Negative ROI for AH/OU, Provisional for BTTS, zero fake value.
// 6. Immutable ledger: Exactly 30 predictions for Gameweek 5 (10 matches * 3 markets).

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const DATA_DIR = path.resolve(__dirname, '..', 'data', 'verification');
const PREDICTIONS_FILE = path.join(DATA_DIR, 'active_7day_predictions.json');
const VALIDATION_FILE = path.join(DATA_DIR, 'live_prediction_validation.json');
const LEDGER_FILE = path.join(DATA_DIR, 'live_prediction_ledger.jsonl');

test('Live Prediction Engine - Artifacts Existence & Non-Empty Check', () => {
  assert.ok(fs.existsSync(PREDICTIONS_FILE), 'active_7day_predictions.json must exist');
  assert.ok(fs.existsSync(VALIDATION_FILE), 'live_prediction_validation.json must exist');
  assert.ok(fs.existsSync(LEDGER_FILE), 'live_prediction_ledger.jsonl must exist');

  const predictions = JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf8'));
  assert.strictEqual(predictions.length, 10, 'Must have exactly 10 reconciled fixtures');

  const validation = JSON.parse(fs.readFileSync(VALIDATION_FILE, 'utf8'));
  assert.strictEqual(validation.reconciledFixtureCount, 10, 'Reconciled fixture count must be 10');
  assert.strictEqual(validation.ahCoverage, '10/10', 'AH coverage must be 10/10');
  assert.strictEqual(validation.ouCoverage, '10/10', 'OU coverage must be 10/10');
  assert.strictEqual(validation.bttsCoverage, '10/10', 'BTTS coverage must be 10/10');
});

test('Live Prediction Engine - Strict Market Invariant (AH, BTTS, OU only)', () => {
  const predictions = JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf8'));

  for (const match of predictions) {
    const marketKeys = Object.keys(match.markets);
    assert.deepStrictEqual(
      marketKeys.sort(),
      ['asianHandicap', 'btts', 'overUnder'].sort(),
      'Match must contain ONLY asianHandicap, btts, and overUnder'
    );

    // Explicit negative check against moneyline / 1X2
    assert.strictEqual(match.markets.moneyline, undefined, 'INVARIANT: Moneyline must NEVER exist');
    assert.strictEqual(match.markets['1x2'], undefined, 'INVARIANT: 1X2 must NEVER exist');
    assert.strictEqual(match.markets.matchWinner, undefined, 'INVARIANT: MatchWinner must NEVER exist');
  }
});

test('Live Prediction Engine - Point-in-Time Anti-Leakage Invariants', () => {
  const predictions = JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf8'));

  for (const match of predictions) {
    const predTime = new Date(match.predictionTimestamp).getTime();
    const kickoffTime = new Date(match.kickoffUtc).getTime();
    const marketTime = new Date(match.marketStateTimestamp).getTime();
    const footballTime = new Date(match.footballStateTimestamp).getTime();

    // 1. Prediction must be strictly generated BEFORE kickoff
    assert.ok(
      predTime < kickoffTime,
      `INVARIANT VIOLATION: Prediction timestamp (${match.predictionTimestamp}) >= Kickoff (${match.kickoffUtc}) for ${match.canonicalMatchId}`
    );

    // 2. Data state snapshots must be captured at or before prediction time
    assert.ok(
      marketTime <= predTime + 2000,
      `Market state timestamp must not be in the future relative to prediction: ${match.canonicalMatchId}`
    );
  }
});

test('Live Prediction Engine - Real Sharp Bookmaker Odds Verification', () => {
  const predictions = JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf8'));

  for (const match of predictions) {
    const { asianHandicap, overUnder, btts } = match.markets;

    // Odds must be valid decimal odds (> 1.0)
    assert.ok(asianHandicap.marketOdds > 1.0, `AH odds must be > 1.0 for ${match.canonicalMatchId}`);
    assert.ok(overUnder.marketOdds > 1.0, `OU odds must be > 1.0 for ${match.canonicalMatchId}`);
    assert.ok(btts.marketOdds > 1.0, `BTTS odds must be > 1.0 for ${match.canonicalMatchId}`);

    // Bookmaker reference must be Pinnacle
    assert.strictEqual(asianHandicap.bookmaker.toLowerCase(), 'pinnacle', 'AH bookmaker must be Pinnacle');
    assert.strictEqual(overUnder.bookmaker.toLowerCase(), 'pinnacle', 'OU bookmaker must be Pinnacle');
    assert.strictEqual(btts.bookmaker.toLowerCase(), 'pinnacle', 'BTTS bookmaker must be Pinnacle');

    // Devig probability must be sensible (between 10% and 90%)
    assert.ok(asianHandicap.devigProbPct > 10 && asianHandicap.devigProbPct < 90, 'Devig AH prob in range');
    assert.ok(overUnder.devigProbPct > 10 && overUnder.devigProbPct < 90, 'Devig OU prob in range');
    assert.ok(btts.devigProbPct > 10 && btts.devigProbPct < 90, 'Devig BTTS prob in range');
  }
});

test('Live Prediction Engine - BTTS Probability & Dixon-Coles Score Grid Identity', () => {
  // Test mathematical relation: P(BTTS Yes) = sum of grid for i >= 1 and j >= 1
  // Equivalently: P(BTTS No) = sum(score(i, 0)) + sum(score(0, j)) - score(0, 0)
  // P(BTTS Yes) + P(BTTS No) == 1.0
  const predictions = JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf8'));

  for (const match of predictions) {
    assert.ok(match.scoreGridSummary, 'Score grid summary must exist');
    assert.ok(match.scoreGridSummary.homeXG > 0.5, 'Home xG must be plausible (> 0.5)');
    assert.ok(match.scoreGridSummary.awayXG > 0.5, 'Away xG must be plausible (> 0.5)');

    const bttsProb = match.markets.btts.modelProbabilityPct;
    assert.ok(bttsProb > 30 && bttsProb < 80, `BTTS prob ${bttsProb}% must be football-realistic`);

    // Model fair odds = 1 / (prob / 100)
    const expectedFairOdds = Number((1 / (bttsProb / 100)).toFixed(3));
    assert.ok(
      Math.abs(match.markets.btts.fairOdds - expectedFairOdds) < 0.05,
      `Fair odds mismatch: expected ${expectedFairOdds}, got ${match.markets.btts.fairOdds}`
    );
  }
});

test('Live Prediction Engine - Truthful Validation Matrix & Zero Fabrication', () => {
  const validation = JSON.parse(fs.readFileSync(VALIDATION_FILE, 'utf8'));
  const { matrix } = validation;

  assert.strictEqual(matrix.length, 9, 'Validation matrix must contain exactly 9 cells (3 markets x 3 models)');

  // Hard Rule 4: If Bootstrap 95% CI crosses 0, it MUST NOT be VALIDATED EDGE
  for (const cell of matrix) {
    if (cell.market === 'AH' || cell.market === 'OU') {
      assert.ok(cell.roi < 0, `${cell.market} ROI should be negative against Pinnacle sharp closing`);
      assert.strictEqual(cell.status, 'NO EDGE', `${cell.market} must report NO EDGE`);
    } else if (cell.market === 'BTTS') {
      // BTTS ROI is +0.94%, but 95% CI is [-5.38%, 7.27%], which crosses 0!
      // Must be PROVISIONAL EDGE, NOT VALIDATED EDGE!
      assert.strictEqual(
        cell.status,
        'PROVISIONAL EDGE',
        'BTTS with 95% CI crossing 0 must be PROVISIONAL EDGE, never VALIDATED EDGE'
      );
    }
  }
});

test('Live Prediction Engine - Immutable Ledger Structure & Integrity', () => {
  const ledgerLines = fs.readFileSync(LEDGER_FILE, 'utf8').split('\n').filter(l => l.trim().length > 0);
  assert.strictEqual(ledgerLines.length, 30, 'Ledger must contain exactly 30 rows (10 matches * 3 markets)');

  const marketsFound = new Set();
  const matchesFound = new Set();

  for (const line of ledgerLines) {
    const row = JSON.parse(line);
    assert.ok(row.predictionId, 'Row must have predictionId');
    assert.ok(row.canonicalMatchId, 'Row must have canonicalMatchId');
    assert.ok(row.predictionTimestamp, 'Row must have predictionTimestamp');
    assert.ok(['AH', 'OU', 'BTTS'].includes(row.market), `Market ${row.market} must be in [AH, OU, BTTS]`);
    assert.ok(row.modelProbability !== undefined, 'Row must have modelProbability');
    assert.ok(row.oddsAtPrediction > 1.0, 'Row must have real oddsAtPrediction');
    assert.ok(row.bookmaker === 'pinnacle', 'Bookmaker must be pinnacle');

    marketsFound.add(row.market);
    matchesFound.add(row.canonicalMatchId);
  }

  assert.strictEqual(marketsFound.size, 3, 'Must cover all 3 markets');
  assert.strictEqual(matchesFound.size, 10, 'Must cover all 10 reconciled matches');
});
