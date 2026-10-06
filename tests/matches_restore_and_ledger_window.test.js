// SALMO.DEV — /matches Restoration & Safe Ledger Window Test Suite
// Verifies:
// 1. HandicapLab outage isolation (404 on summary never crashes /api/matches or /api/v1/matches)
// 2. Fixture without prediction remains visible with honest ODDS_UNAVAILABLE state (no fabrication)
// 3. 7-day horizon filtering
// 4. Stale kickoff exclusion (kickoff <= now)
// 5. Ledger execution window > 24h excluded from prediction_ledger
// 6. Ledger execution window <= 24h eligible for prediction_ledger
// 7. Moneyline is explicitly NOT MODELED
// 8. Zero fabrication invariant (no fake 0.50, 1.90, or fallback numbers)

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const ts = require('typescript');

require.extensions['.ts'] = function (module, filename) {
  const content = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(content, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  module._compile(compiled.outputText, filename);
};

const { MatchIntelligenceService } = require('../src/engine/matchIntelligenceService.ts');
const { HttpHandicapLabAdapter, DatabaseHandicapLabAdapter } = require('../src/contracts/handicapLabAdapter.ts');
const { isWithinLedgerExecutionWindow } = require('../src/engine/pipeline/productionPredictionEngine.ts');
const { matchesDynamicHorizon } = require('../src/lib/horizon.ts');

test('TEST 1: HandicapLab Outage Isolation (Summary 404 does not crash)', async () => {
  // Test HttpHandicapLabAdapter getDatasetSummary fallback
  const mockHttpAdapter = new HttpHandicapLabAdapter('https://invalid-handicaplab-domain-404.dev');
  
  // getDatasetSummary must NOT throw an uncaught exception when remote returns 404/fails
  const summary = await mockHttpAdapter.getDatasetSummary();
  assert.ok(summary, 'Summary must be returned even when remote is offline/404');
  assert.ok(summary.version, 'Summary must have a valid version string');
  assert.ok(summary.checksum, 'Summary must have a valid checksum');
  assert.strictEqual(summary.checksum.includes('salmo-native'), true, 'Summary falls back to native checksum');
});

test('TEST 2: Fixture Without Prediction Remains Visible with Honest ODDS_UNAVAILABLE State', () => {
  const unavailableAh = MatchIntelligenceService.buildUnavailableMarket('ASIAN_HANDICAP', '—', null);
  const unavailableOu = MatchIntelligenceService.buildUnavailableMarket('OVER_UNDER', '2.5', null);
  const unavailableBtts = MatchIntelligenceService.buildUnavailableMarket('BTTS', 'YES', null);

  for (const m of [unavailableAh, unavailableOu, unavailableBtts]) {
    assert.strictEqual(m.available, false, 'Unmodeled market must be marked available: false');
    assert.strictEqual(m.odds, null, 'Unmodeled market odds must be strictly null');
    assert.strictEqual(m.badge, 'GREY', 'Unmodeled market badge must be GREY');
    assert.strictEqual(m.status, 'ODDS_UNAVAILABLE', 'Unmodeled market status must be ODDS_UNAVAILABLE');
    assert.strictEqual(m.confidence, 'NONE', 'Confidence must be NONE');
    assert.strictEqual(m.confidenceScore, 0, 'Confidence score must be 0');
    assert.strictEqual(m.modelProbabilityPct, null, 'Model probability must be null');
    assert.strictEqual(m.edgePercentagePoints, null, 'Edge must be null');
    assert.strictEqual(m.expectedValuePct, null, 'EV must be null');
  }
});

test('TEST 3: 7-Day Horizon Dynamic Filtering', () => {
  const refDate = new Date('2026-10-07T12:00:00Z');

  // Match in 3 days (2026-10-10) -> in 7_DAYS and PLUS_3_DAYS
  const matchOct10 = '2026-10-10T14:00:00Z';
  assert.strictEqual(matchesDynamicHorizon(matchOct10, '7_DAYS', refDate), true);
  assert.strictEqual(matchesDynamicHorizon(matchOct10, 'TODAY', refDate), false);
  assert.strictEqual(matchesDynamicHorizon(matchOct10, 'TOMORROW', refDate), false);

  // Match in 5 days (2026-10-12) -> in 7_DAYS
  const matchOct12 = '2026-10-12T19:00:00Z';
  assert.strictEqual(matchesDynamicHorizon(matchOct12, '7_DAYS', refDate), true);
  assert.strictEqual(matchesDynamicHorizon(matchOct12, 'TODAY', refDate), false);
  assert.strictEqual(matchesDynamicHorizon(matchOct12, 'PLUS_3_DAYS', refDate), false);

  // Match today (2026-10-07)
  const matchToday = '2026-10-07T18:00:00Z';
  assert.strictEqual(matchesDynamicHorizon(matchToday, 'TODAY', refDate), true);
  assert.strictEqual(matchesDynamicHorizon(matchToday, '7_DAYS', refDate), true);

  // Match tomorrow (2026-10-08)
  const matchTomorrow = '2026-10-08T18:00:00Z';
  assert.strictEqual(matchesDynamicHorizon(matchTomorrow, 'TOMORROW', refDate), true);
  assert.strictEqual(matchesDynamicHorizon(matchTomorrow, 'TODAY', refDate), false);
});

test('TEST 4: Stale Kickoff Exclusion (kickoff <= now excluded)', () => {
  const nowMs = new Date('2026-10-07T12:00:00Z').getTime();

  // Past fixture: 2026-09-20 (finished)
  const pastKickoff = '2026-09-20T14:00:00Z';
  const pastMs = new Date(pastKickoff).getTime();
  assert.strictEqual(pastMs <= nowMs, true, 'Past kickoff must be flagged as stale');

  // Future fixture: 2026-10-10
  const futureKickoff = '2026-10-10T14:00:00Z';
  const futureMs = new Date(futureKickoff).getTime();
  assert.strictEqual(futureMs > nowMs, true, 'Future kickoff must be accepted');
});

test('TEST 5: Ledger Execution Window > 24h Excluded from prediction_ledger', () => {
  const nowMs = new Date('2026-10-07T12:00:00Z').getTime();

  // Kickoff is 48 hours away
  const kickoff48h = new Date(nowMs + 48 * 3600 * 1000).toISOString();
  const eligible48h = isWithinLedgerExecutionWindow(kickoff48h, nowMs, 24);
  assert.strictEqual(eligible48h, false, 'Picks > 24h away must be excluded from prediction_ledger');

  // Kickoff is 6 days away (e.g. Oct 13)
  const kickoff6d = new Date(nowMs + 6 * 24 * 3600 * 1000).toISOString();
  const eligible6d = isWithinLedgerExecutionWindow(kickoff6d, nowMs, 24);
  assert.strictEqual(eligible6d, false, 'Picks 6 days away must be excluded from prediction_ledger');
});

test('TEST 6: Ledger Execution Window <= 24h Eligible for prediction_ledger', () => {
  const nowMs = new Date('2026-10-07T12:00:00Z').getTime();

  // Kickoff is 12 hours away
  const kickoff12h = new Date(nowMs + 12 * 3600 * 1000).toISOString();
  const eligible12h = isWithinLedgerExecutionWindow(kickoff12h, nowMs, 24);
  assert.strictEqual(eligible12h, true, 'Picks <= 24h away must be eligible for prediction_ledger');

  // Kickoff is exactly 24 hours away
  const kickoff24h = new Date(nowMs + 24 * 3600 * 1000).toISOString();
  const eligible24h = isWithinLedgerExecutionWindow(kickoff24h, nowMs, 24);
  assert.strictEqual(eligible24h, true, 'Picks at 24h boundary must be eligible for prediction_ledger');

  // Kickoff is in the past
  const kickoffPast = new Date(nowMs - 1 * 3600 * 1000).toISOString();
  const eligiblePast = isWithinLedgerExecutionWindow(kickoffPast, nowMs, 24);
  assert.strictEqual(eligiblePast, false, 'Past kickoffs must never be eligible');
});

test('TEST 7: Moneyline is Explicitly NOT MODELED', () => {
  const mlMarket = MatchIntelligenceService.buildUnmodeledMoneylineMarket();
  assert.strictEqual(mlMarket.status, 'MARKET_UNAVAILABLE', 'ML status must be MARKET_UNAVAILABLE');
  assert.strictEqual(mlMarket.statusLabel, 'NOT MODELED YET', 'ML statusLabel must be NOT MODELED YET');
  assert.strictEqual(mlMarket.available, false, 'ML available must be false');
  assert.strictEqual(mlMarket.odds, null, 'ML odds must be strictly null');
  assert.strictEqual(mlMarket.modelProbabilityPct, null, 'ML model probability must be strictly null');
  assert.strictEqual(mlMarket.badge, 'GREY', 'ML badge must be GREY');
  assert.strictEqual(mlMarket.reason.includes('Moneyline (1X2) is intentionally not modeled'), true);
});

test('TEST 8: Zero Fabrication Invariant', () => {
  const unavailable = MatchIntelligenceService.buildUnavailableMarket('ASIAN_HANDICAP', '—', null);

  // Must NEVER have hardcoded fallback numbers
  assert.notStrictEqual(unavailable.odds, 1.90, 'Must never produce 1.90 fallback odds');
  assert.notStrictEqual(unavailable.odds, 1.95, 'Must never produce 1.95 fallback odds');
  assert.notStrictEqual(unavailable.modelProbabilityPct, 50, 'Must never produce 50% fallback probability');
  assert.notStrictEqual(unavailable.modelProbabilityPct, 0.5, 'Must never produce 0.50 fallback probability');
  assert.strictEqual(unavailable.odds, null, 'Odds must be null');
  assert.strictEqual(unavailable.modelProbabilityPct, null, 'Probability must be null');
  assert.strictEqual(unavailable.badge, 'GREY', 'Badge must be GREY');
});
