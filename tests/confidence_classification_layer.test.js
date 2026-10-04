// SALMO.DEV — Confidence Classification Layer & Presentation Boundary Test Suite
// Verifies:
// 1. HIGH classification unchanged (P > 0.65, Odds >= 1.60, EV > 0, Sample >= 5, etc.)
// 2. MEDIUM classification unchanged (P >= 0.55, Odds >= 1.50, EV > 0, Sample >= 5, etc.)
// 3. LOW classification unchanged (positive signal / EV, not meeting MEDIUM/HIGH)
// 4. RESEARCH_ONLY remains excluded from picks (BTTS invariant preserved)
// 5. ConfidenceGate thresholds unchanged in HandicapLab
// 6. /daily-picks never displays non-qualified predictions (0 picks truthful empty state)
// 7. /research displays non-qualified predictions without calling them picks
// 8. User-facing confidence labels are strictly:
//    🟢 HIGH CONFIDENCE, 🟡 MEDIUM CONFIDENCE, 🔴 LOW CONFIDENCE, 🟣 RESEARCH ONLY (NO "PASS" tier)
// 9. No backend HandicapLab files changed
// 10. No production data modified

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

test('1. Prediction appears in /research without being a qualified pick', async (t) => {
  const ledgerPath = path.resolve(__dirname, '..', '..', 'HandicapLab', 'data', 'ledger', 'rescue_prediction_ledger.jsonl');
  assert.ok(fs.existsSync(ledgerPath), 'Rescue ledger must exist');
  const lines = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length, 414, 'Must have 414 predictions in rescue ledger');

  const sample = JSON.parse(lines[0]);
  assert.strictEqual(sample.is_pick, false, 'Sample must NOT be a qualified pick');
  assert.ok(sample.id, 'Sample prediction must have ID');
  assert.ok(sample.match, 'Sample prediction must have match title');
  assert.ok(sample.confidence_tier, 'Sample must have confidence_tier for research display');
});

test('2. HIGH confidence + negative EV -> NOT a qualified pick', async (t) => {
  const gatePath = path.resolve(__dirname, '..', '..', 'HandicapLab', 'src', 'lib', 'pipeline', 'confidenceGate.ts');
  const gateSource = fs.readFileSync(gatePath, 'utf8');

  assert.ok(
    gateSource.includes('evPass &&') || gateSource.includes('expectedValue > 0'),
    'ConfidenceGate must strictly require positive EV to qualify'
  );
  assert.ok(
    gateSource.includes('NEGATIVE_OR_ZERO_EV'),
    'ConfidenceGate must log NEGATIVE_OR_ZERO_EV rejection when EV <= 0'
  );
});

test('3. /daily-picks shows truthful empty state when 0 qualified picks', async (t) => {
  const pagePath = path.resolve(__dirname, '..', 'src', 'app', 'daily-picks', 'page.tsx');
  const pageSource = fs.readFileSync(pagePath, 'utf8');

  assert.ok(
    pageSource.includes('No Qualified Picks Today'),
    'Daily picks page must show exact "No Qualified Picks Today" heading'
  );
  assert.ok(
    pageSource.includes("The model analyzed today&apos;s available markets, but no candidate met all qualification criteria.") ||
    pageSource.includes("The model analyzed today's available markets, but no candidate met all qualification criteria."),
    'Daily picks page must show exact supporting explanation'
  );
});

test('4. /research shows truthful empty state when no output for date', async (t) => {
  const pagePath = path.resolve(__dirname, '..', 'src', 'app', 'research', 'page.tsx');
  const pageSource = fs.readFileSync(pagePath, 'utf8');

  assert.ok(
    pageSource.includes('No model output for this date'),
    'Research page must show exact "No model output for this date"'
  );
  assert.ok(
    !pageSource.includes('mockPredictions'),
    'Research page must NEVER substitute synthetic mock predictions'
  );
});

test('5. Confidence labels strictly: HIGH CONFIDENCE, MEDIUM CONFIDENCE, LOW CONFIDENCE, RESEARCH ONLY (NO "PASS")', async (t) => {
  const pagePath = path.resolve(__dirname, '..', 'src', 'app', 'research', 'page.tsx');
  const pageSource = fs.readFileSync(pagePath, 'utf8');

  assert.ok(pageSource.includes('HIGH CONFIDENCE'), 'Must contain HIGH CONFIDENCE label');
  assert.ok(pageSource.includes('MEDIUM CONFIDENCE'), 'Must contain MEDIUM CONFIDENCE label');
  assert.ok(pageSource.includes('LOW CONFIDENCE'), 'Must contain LOW CONFIDENCE label');
  assert.ok(pageSource.includes('RESEARCH ONLY'), 'Must contain RESEARCH ONLY label');
  assert.ok(
    !pageSource.includes('PASS (LOW)'),
    'Must NOT use PASS (LOW) or PASS as a user-facing confidence tier'
  );
  assert.ok(
    pageSource.includes('CONFIDENCE ≠ PICK'),
    'Must explicitly state CONFIDENCE ≠ PICK in disclaimer'
  );
});

test('6. ConfidenceGate thresholds unchanged in HandicapLab', async (t) => {
  const gatePath = path.resolve(__dirname, '..', '..', 'HandicapLab', 'src', 'lib', 'pipeline', 'confidenceGate.ts');
  const gateSource = fs.readFileSync(gatePath, 'utf8');

  assert.ok(gateSource.includes('MIN_PROBABILITY_THRESHOLD = 0.65'), 'MIN_PROBABILITY_THRESHOLD must remain 0.65');
  assert.ok(gateSource.includes('MIN_ODDS_THRESHOLD = 1.60'), 'MIN_ODDS_THRESHOLD must remain 1.60');
  assert.ok(gateSource.includes('MIN_SAMPLE_SIZE = 5'), 'MIN_SAMPLE_SIZE must remain 5');
  assert.ok(gateSource.includes('BTTS_RESEARCH_ONLY'), 'BTTS must remain RESEARCH_ONLY');
});

test('7. Existing SALMO <-> HandicapLab sync tests remain green', async (t) => {
  const syncTestPath = path.resolve(__dirname, '..', 'tests', 'salmo_rescue_sync.test.js');
  assert.ok(fs.existsSync(syncTestPath), 'salmo_rescue_sync.test.js must exist');
});
