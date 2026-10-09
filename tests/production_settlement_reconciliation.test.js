// SALMO.DEV — Production Settlement & Reconciliation Regression Test
// Validates:
// 1. live_prediction_ledger.jsonl integrity (30 pre-kickoff positions, strictly PENDING, zero score contamination)
// 2. Exact mathematical invariants on live forward ledger: 0 units staked, 0 profit, N = 0 settled strictly enforces 'INSUFFICIENT SAMPLE'
// 3. SettlementEngine mathematical exactness (QuarterLineSettler, quarter-line split, push semantics)
// 4. Quarantined historical MW5 pilot benchmark verification (N = 20 < 30 strictly enforces INSUFFICIENT SAMPLE)
// 5. BTTS segregation (BTTS in ledger but never public daily pick)
// 6. Provenance and qualification invariants on 10–18 October daily picks

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// On-the-fly TypeScript transpile hook for tests
if (!require.extensions['.ts']) {
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
}

const { SettlementEngine } = require('../src/engine/settlement/settlementEngine.ts');
const { PerformanceMetricsEngine } = require('../src/engine/performance/performanceMetrics.ts');
const { isPublicPickEligible, classifyDailyPicksState } = require('../src/lib/eligibility.ts');

test('1. Production Ledger Integrity: 30 Pre-Kickoff Rows Strictly PENDING Ahead of Kickoff', () => {
  const ledgerPath = path.resolve(__dirname, '..', 'data', 'verification', 'live_prediction_ledger.jsonl');
  assert.strictEqual(fs.existsSync(ledgerPath), true, 'Ledger file must exist');

  const lines = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n').filter(Boolean);
  assert.strictEqual(lines.length, 30, 'Ledger must contain exactly 30 prediction rows (10 matches * 3 markets)');

  const rows = lines.map(line => JSON.parse(line));
  const pendingRows = rows.filter(r => r.settlementStatus === 'PENDING' || r.settlement === 'PENDING');
  assert.strictEqual(pendingRows.length, 30, 'All 30 rows must be strictly PENDING ahead of kickoff');

  // Assert zero score contamination on forward-tracking ledger
  for (const r of rows) {
    assert.strictEqual(r.homeGoals, null, 'homeGoals must be null ahead of kickoff');
    assert.strictEqual(r.awayGoals, null, 'awayGoals must be null ahead of kickoff');
    assert.strictEqual(r.result, null, 'result must be null ahead of kickoff');
    assert.strictEqual(r.profitUnits, 0, 'profitUnits must be 0 for pending positions');
    assert.strictEqual(r.bookmaker, 'pinnacle', 'Must use sharp Pinnacle reference odds');
    assert.ok(r.oddsAtPrediction > 1.0, 'Must have valid real odds at prediction');
  }

  const distinctMatches = new Set(rows.map(r => r.canonicalMatchId));
  assert.strictEqual(distinctMatches.size, 10, 'Must cover exactly 10 distinct fixtures');
});

test('2. Live Financial Accounting Invariants: 0 Settled Units, 0 Net Profit, N = 0 Strictly INSUFFICIENT SAMPLE', () => {
  const ledgerPath = path.resolve(__dirname, '..', 'data', 'verification', 'live_prediction_ledger.jsonl');
  const lines = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n').filter(Boolean);
  const rows = lines.map(line => JSON.parse(line));

  const ahOuRows = rows.filter(r => r.market === 'AH' || r.market === 'OU');
  assert.strictEqual(ahOuRows.length, 20, 'Must contain exactly 20 AH and OU positions');

  // Convert to LedgerPositionSnapshot format
  const snapshots = ahOuRows.map(r => ({
    ledgerPositionId: r.predictionId,
    fixtureId: String(r.providerProvenance?.apiFootballFixtureId || 0),
    marketType: r.market,
    selection: r.selection,
    line: Number(r.line ?? 0),
    stakeUnits: 1.0,
    marketOdds: Number(r.oddsAtPrediction),
    fairOdds: Number(r.fairOdds || r.oddsAtPrediction),
    pWin: r.modelProbability ? r.modelProbability / 100 : 0.5,
    pPush: 0,
    pLoss: 0.5,
    confidence: Number(r.confidence || 0),
    edge: Number(r.edge || 0),
    expectedValuePct: Number(r.EV || 0),
    greenCohort: Number(r.confidence || 0) > 70,
    settlementStatus: r.settlementStatus,
    result: r.result,
    profitUnits: r.profitUnits,
    clvPct: null,
    settledAt: r.settledAt,
    createdAt: r.predictionTimestamp,
  }));

  const report = PerformanceMetricsEngine.generateReport(snapshots);

  // Invariant 1: Total Staked Denominator = 0 (no finished bets)
  assert.strictEqual(report.controlFullCohort.unitsStaked, 0.0, 'Staked units must be 0 for pending cohort');

  // Invariant 2: Net Profit = 0
  assert.strictEqual(report.controlFullCohort.profitUnits, 0.0, 'Net profit must be 0 for pending cohort');

  // Invariant 3: Realized Yield / ROI = null ("No settled bets")
  assert.strictEqual(report.controlFullCohort.roi, null, 'ROI must be null when units staked is 0');
  assert.strictEqual(report.controlFullCohort.displayStatus, 'No settled bets', 'Display status must be "No settled bets"');

  // Invariant 4: Pending count = 20, Settled = 0
  assert.strictEqual(report.controlFullCohort.pending, 20, 'All 20 AH/OU bets must be pending');
  assert.strictEqual(report.controlFullCohort.settled, 0, 'Settled count must be 0');

  // Invariant 5: Sample Size Honesty (N = 0 < 30 strictly enforces INSUFFICIENT SAMPLE)
  assert.strictEqual(report.controlFullCohort.sampleStatus, 'INSUFFICIENT SAMPLE', 'N=0 must be INSUFFICIENT SAMPLE');
  assert.strictEqual(report.headlineGreenCohort.sampleStatus, 'INSUFFICIENT SAMPLE', 'Green cohort must be INSUFFICIENT SAMPLE');
});

test('3. Settlement Engine Mathematical Correctness (QuarterLineSettler & Financial Accounting)', () => {
  // Test Case A: Asian Handicap -0.25 Win (Home 3-0 Away)
  const settlementA = SettlementEngine.settlePosition({
    ledgerPositionId: 'test_ah_win',
    marketType: 'AH',
    selection: 'Home -0.25',
    line: -0.25,
    oddsTaken: 2.00,
    homeGoals: 3,
    awayGoals: 0,
    matchStatus: 'FINISHED',
    homeTeam: 'Home',
    awayTeam: 'Away',
  });
  assert.strictEqual(settlementA.result, 'WIN');
  assert.strictEqual(settlementA.profitUnits, 1.00);

  // Test Case B: Asian Handicap -0.25 Half Loss (Home 1-1 Away)
  const settlementB = SettlementEngine.settlePosition({
    ledgerPositionId: 'test_ah_half_loss',
    marketType: 'AH',
    selection: 'Home -0.25',
    line: -0.25,
    oddsTaken: 2.00,
    homeGoals: 1,
    awayGoals: 1,
    matchStatus: 'FINISHED',
    homeTeam: 'Home',
    awayTeam: 'Away',
  });
  assert.strictEqual(settlementB.result, 'HALF_LOSS');
  assert.strictEqual(settlementB.profitUnits, -0.50);

  // Test Case C: Over/Under 2.75 Half Win (Over 2.75, Score 2-1 = 3 goals)
  const settlementC = SettlementEngine.settlePosition({
    ledgerPositionId: 'test_ou_half_win',
    marketType: 'OU',
    selection: 'Over 2.75',
    line: 2.75,
    oddsTaken: 2.00,
    homeGoals: 2,
    awayGoals: 1,
    matchStatus: 'FINISHED',
    homeTeam: 'Home',
    awayTeam: 'Away',
  });
  assert.strictEqual(settlementC.result, 'HALF_WIN');
  assert.strictEqual(settlementC.profitUnits, 0.50);

  // Test Case D: Push (AH 0 line on draw)
  const settlementD = SettlementEngine.settlePosition({
    ledgerPositionId: 'test_ah_push',
    marketType: 'AH',
    selection: 'Home 0',
    line: 0,
    oddsTaken: 1.95,
    homeGoals: 1,
    awayGoals: 1,
    matchStatus: 'FINISHED',
    homeTeam: 'Home',
    awayTeam: 'Away',
  });
  assert.strictEqual(settlementD.result, 'PUSH');
  assert.strictEqual(settlementD.profitUnits, 0.0);
});

test('4. Quarantined Historical MW5 Pilot Verification (Audited Archive Isolated from Live Ledger)', () => {
  const archivePath = path.resolve(__dirname, '..', 'data', 'verification', 'quarantined_mw5_pilot_ledger.jsonl');
  assert.strictEqual(fs.existsSync(archivePath), true, 'Archived pilot ledger must exist');

  const lines = fs.readFileSync(archivePath, 'utf8').trim().split('\n').filter(Boolean);
  assert.strictEqual(lines.length, 30, 'Archived pilot must contain 30 historical records');

  const rows = lines.map(l => JSON.parse(l));
  const ahOuRows = rows.filter(r => r.market === 'AH' || r.market === 'OU');
  assert.strictEqual(ahOuRows.length, 20, 'Archived pilot contains 20 AH/OU positions');

  // Verify that an N=20 cohort strictly evaluates to INSUFFICIENT SAMPLE
  const snapshots = ahOuRows.map(r => ({
    ledgerPositionId: r.predictionId,
    fixtureId: String(r.providerProvenance?.apiFootballFixtureId || 0),
    marketType: r.market,
    selection: r.selection,
    line: Number(r.line ?? 0),
    stakeUnits: 1.0,
    marketOdds: Number(r.oddsAtPrediction),
    fairOdds: Number(r.fairOdds || r.oddsAtPrediction),
    pWin: 0.5,
    pPush: 0,
    pLoss: 0.5,
    confidence: Number(r.confidence || 0),
    edge: Number(r.edge || 0),
    expectedValuePct: 0,
    greenCohort: false,
    settlementStatus: r.settlementStatus,
    result: r.result,
    profitUnits: r.profitUnits,
    clvPct: null,
    settledAt: r.settledAt,
    createdAt: r.predictionTimestamp,
  }));

  const report = PerformanceMetricsEngine.generateReport(snapshots);
  assert.strictEqual(report.controlFullCohort.settled, 20);
  assert.strictEqual(report.controlFullCohort.sampleStatus, 'INSUFFICIENT SAMPLE', 'Historical MW5 sample N=20 must be flagged as INSUFFICIENT SAMPLE');
});

test('5. BTTS Segregation: Preserved in Ledger but Never Public Qualified Pick', () => {
  const ledgerPath = path.resolve(__dirname, '..', 'data', 'verification', 'live_prediction_ledger.jsonl');
  const lines = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n').filter(Boolean);
  const rows = lines.map(line => JSON.parse(line));

  const bttsRows = rows.filter(r => r.market === 'BTTS');
  assert.strictEqual(bttsRows.length, 10, 'Must contain exactly 10 BTTS positions');

  // BTTS should never have verdict LAYAK in public picks
  for (const row of bttsRows) {
    assert.notStrictEqual(row.verdict, 'LAYAK', 'BTTS must never be qualified as LAYAK public pick');
  }
});

test('6. Daily Picks Provenance & Qualification Invariants (10–18 October)', () => {
  const futureKickoff = '2026-10-15T15:00:00.000Z';
  const nowMs = new Date('2026-10-09T12:00:00.000Z').getTime();

  // A. Candidate with modelVersion in property
  const pickA = {
    fixtureId: 5001,
    homeTeam: 'Aston Villa',
    awayTeam: 'Brentford',
    market: 'AH',
    verdict: 'LAYAK',
    modelVersion: 'dixon-coles-v1.0',
    kickoffUtc: futureKickoff,
    marketOdds: 1.961,
  };
  assert.strictEqual(isPublicPickEligible(pickA, nowMs), true, 'Pick with modelVersion must be eligible');

  // B. Candidate with provenance in reasoning text
  const pickB = {
    fixtureId: 5002,
    homeTeam: 'Aston Villa',
    awayTeam: 'Brentford',
    market: 'OU',
    verdict: 'LAYAK',
    reasoning: 'Model fair 1.88 vs Pinnacle 1.93. Edge: 2.7%, EV: 2.3%, Confidence: 71/100. Model: dixon-coles-v1.0.',
    kickoffUtc: futureKickoff,
    marketOdds: 1.925,
  };
  assert.strictEqual(isPublicPickEligible(pickB, nowMs), true, 'Pick with Model: in reasoning must be eligible');

  // C. Candidate without provenance must be rejected
  const pickC = {
    fixtureId: 5003,
    homeTeam: 'Chelsea',
    awayTeam: 'Arsenal',
    market: 'AH',
    verdict: 'LAYAK',
    reasoning: 'Good pick without model tag.',
    kickoffUtc: futureKickoff,
    marketOdds: 1.95,
  };
  assert.strictEqual(isPublicPickEligible(pickC, nowMs), false, 'Pick without provenance must be rejected');

  // D. Upcoming candidates classify as AVAILABLE when eligible picks exist
  const stateResult = classifyDailyPicksState([pickA, pickB], nowMs);
  assert.strictEqual(stateResult.state, 'AVAILABLE');
  assert.strictEqual(stateResult.eligiblePicks.length, 2);
});
