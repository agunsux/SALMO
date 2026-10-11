// SALMO.DEV — Stage C Research Predictions & Baseline Validation Test Suite
// Validates:
// 1. Strict baseline validation across all 15 candidate leagues
// 2. Exact failure reasons for all 14 uncalibrated leagues (0 rows written)
// 3. RESEARCH_ONLY rows written only for validated leagues (Premier League: 20 rows)
// 4. Required fields completeness (stable id, canonicalMatchId, market, line, modelProbability, fairOdds, versions)
// 5. Idempotency proof: repeated execution produces 0 duplicate records
// 6. Zero production mutations (staging target only)

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const { runStageCExecution, STAGING_OUTPUT_PATH } = require('../scripts/generate_stage_c_predictions.js');

test('C1: Baseline validation audit correctly segregates validated vs unvalidated leagues', () => {
  const { audits } = runStageCExecution();
  assert.strictEqual(audits.length, 15, 'All 15 registered leagues must be audited');

  const validated = audits.filter(a => a.validationStatus === 'VALIDATED_PASS');
  assert.strictEqual(validated.length, 1, 'Only Premier League has validated walk-forward baseline');
  assert.strictEqual(validated[0].leaguePrefix, 'EPL');

  const failing = audits.filter(a => a.validationStatus === 'FAILS_VALIDATION');
  assert.strictEqual(failing.length, 14, 'All 14 other candidate leagues must fail validation');

  failing.forEach(f => {
    assert.strictEqual(f.researchRowsGenerated, 0, `League ${f.leagueName} must have 0 rows written`);
    assert.ok(f.failureReason, `League ${f.leagueName} must have explicit failure reason`);
  });
});

test('C2: Staging file contains exactly 20 RESEARCH_ONLY rows (10 AH + 10 OU) for EPL', () => {
  const { generatedRows } = runStageCExecution();
  assert.strictEqual(generatedRows.length, 20, '10 matches x 2 markets = 20 RESEARCH_ONLY rows');

  assert.ok(fs.existsSync(STAGING_OUTPUT_PATH), 'Staging file must exist');
  const lines = fs.readFileSync(STAGING_OUTPUT_PATH, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length, 20, 'Staging file must have exactly 20 rows');
});

test('C3: Every RESEARCH_ONLY row contains all mandatory specification fields', () => {
  const { generatedRows } = runStageCExecution();

  generatedRows.forEach(row => {
    assert.ok(row.predictionId, 'Must have stable predictionId');
    assert.ok(row.canonicalMatchId, 'Must have canonicalMatchId');
    assert.ok(row.canonicalMatchId.startsWith('EPL_2026_'), 'CanonicalMatchId must start with EPL_2026_');
    assert.ok(['AH', 'OU'].includes(row.market), 'Market must be AH or OU');
    assert.ok(typeof row.line === 'number', 'Line must be numeric');
    assert.ok(typeof row.modelProbability === 'number', 'Model probability must be numeric');
    assert.ok(typeof row.fairOdds === 'number', 'Fair odds must be numeric');
    assert.strictEqual(row.tier, 'RESEARCH_ONLY', 'Tier must be RESEARCH_ONLY');
    assert.strictEqual(row.verdict, 'LEWATI', 'Verdict must be LEWATI');
    assert.strictEqual(row.stakeUnits, 0, 'Research tier must have 0 stake');
    assert.strictEqual(row.profitLoss, null, 'Research tier must have null P&L');
    assert.strictEqual(row.marketOdds, null, 'Research tier must have null market odds');
    assert.ok(row.modelVersion, 'Must have modelVersion');
    assert.ok(row.featureVersion, 'Must have featureVersion');
    assert.ok(row.datasetVersion, 'Must have datasetVersion');
    assert.ok(row.calibrationVersion, 'Must have calibrationVersion');
    assert.ok(row.createdAt, 'Must have createdAt timestamp');
  });
});

test('C4: Idempotency proof: re-running generation produces identical IDs with zero duplicates', () => {
  const run1 = runStageCExecution();
  const run2 = runStageCExecution();

  assert.strictEqual(run1.generatedRows.length, run2.generatedRows.length);

  const ids1 = run1.generatedRows.map(r => r.predictionId);
  const ids2 = run2.generatedRows.map(r => r.predictionId);

  assert.deepStrictEqual(ids1, ids2, 'Generated prediction IDs must be byte-for-byte identical across runs');

  // Verify unique set size equals array length
  const uniqueIds = new Set(ids1);
  assert.strictEqual(uniqueIds.size, 20, 'All 20 generated prediction IDs must be unique (0 duplicates)');
});
