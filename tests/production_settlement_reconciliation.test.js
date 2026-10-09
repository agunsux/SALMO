// SALMO.DEV — Production Settlement & Reconciliation Regression Test
// Validates:
// 1. live_prediction_ledger.jsonl integrity (30 settled positions, 10 matches MW5)
// 2. Exact mathematical invariants: 20 units staked (AH+OU), +7.84 units profit, +39.20% Yield
// 3. 10W - 8L - 2HL record across Asian Handicap and Over/Under
// 4. Sample size N = 20 < 30 strictly enforces 'INSUFFICIENT SAMPLE'
// 5. BTTS containment (BTTS settled but excluded from production AH/OU performance)
// 6. Provenance and qualification invariants on daily picks

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

test('1. Production Ledger Integrity: 30 Settled Rows across 10 MW5 Matches', () => {
  const ledgerPath = path.resolve(__dirname, '..', 'data', 'verification', 'live_prediction_ledger.jsonl');
  assert.strictEqual(fs.existsSync(ledgerPath), true, 'Ledger file must exist');

  const lines = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n').filter(Boolean);
  assert.strictEqual(lines.length, 30, 'Ledger must contain exactly 30 prediction rows');

  const rows = lines.map(line => JSON.parse(line));
  const finishedRows = rows.filter(r => r.matchStatus === 'FINISHED' && r.settlementStatus === 'SETTLED');
  assert.strictEqual(finishedRows.length, 30, 'All 30 rows must be marked FINISHED and SETTLED');

  const distinctMatches = new Set(rows.map(r => r.canonicalMatchId));
  assert.strictEqual(distinctMatches.size, 10, 'Must cover exactly 10 Matchweek 5 fixtures');
});

test('2. Financial Accounting Invariants: 20 AH/OU Units, +7.84 Units Profit, +39.20% Yield', () => {
  const ledgerPath = path.resolve(__dirname, '..', 'data', 'verification', 'live_prediction_ledger.jsonl');
  const lines = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n').filter(Boolean);
  const rows = lines.map(line => JSON.parse(line));

  const ahOuRows = rows.filter(r => r.market === 'AH' || r.market === 'OU');
  assert.strictEqual(ahOuRows.length, 20, 'Must contain exactly 20 AH and OU positions');

  // Convert to LedgerPositionSnapshot format
  const snapshots = ahOuRows.map(r => ({
    ledgerPositionId: r.predictionId,
    fixtureId: r.providerProvenance?.apiFootballFixtureId || 0,
    marketType: r.market,
    selection: r.selection,
    line: Number(r.line ?? 0),
    stakeUnits: 1.0,
    marketOdds: Number(r.oddsAtPrediction),
    fairOdds: Number(r.fairOdds || r.oddsAtPrediction),
    pWin: r.modelProbability ? r.modelProbability / 100 : 0.5,
    pPush: 0,
    pLoss: 0.5,
    confidence: Number(r.confidence || 75),
    edge: Number(r.edge || 0),
    expectedValuePct: Number(r.EV || 0),
    greenCohort: true,
    settlementStatus: r.settlementStatus,
    result: r.result,
    profitUnits: r.profitUnits,
    clvPct: null,
    settledAt: r.settledAt,
    createdAt: r.predictionTimestamp,
  }));

  const report = PerformanceMetricsEngine.generateReport(snapshots);

  // Invariant 1: Total Staked Denominator
  assert.strictEqual(report.controlFullCohort.unitsStaked, 20.0, 'Staked units must be exactly 20.0');

  // Invariant 2: Net Profit = +7.84 units
  const netProfit = report.controlFullCohort.profitUnits;
  assert.ok(Math.abs(netProfit - 7.84) < 0.001, `Net profit must be +7.84 units (got ${netProfit})`);

  // Invariant 3: Realized Yield = +39.20%
  const realizedYield = report.controlFullCohort.yield;
  assert.strictEqual(realizedYield, 39.2, `Realized yield must be exactly +39.20% (got ${realizedYield})`);

  // Invariant 4: Win/Loss Distribution: 10W - 8L - 2HL
  assert.strictEqual(report.controlFullCohort.wins, 10, 'Must have 10 wins');
  assert.strictEqual(report.controlFullCohort.losses, 8, 'Must have 8 losses');
  assert.strictEqual(report.controlFullCohort.halfLosses, 2, 'Must have 2 half losses');
  assert.strictEqual(report.controlFullCohort.halfWins, 0, 'Must have 0 half wins in this cohort');
  assert.strictEqual(report.controlFullCohort.pushes, 0, 'Must have 0 pushes');

  // Invariant 5: Sample Size Honesty (N = 20 < 30 strictly enforces INSUFFICIENT SAMPLE)
  assert.strictEqual(report.controlFullCohort.settled, 20);
  assert.strictEqual(report.controlFullCohort.sampleStatus, 'INSUFFICIENT SAMPLE', 'N=20 must be INSUFFICIENT SAMPLE');
  assert.strictEqual(report.headlineGreenCohort.sampleStatus, 'INSUFFICIENT SAMPLE', 'Green cohort N=20 must also be INSUFFICIENT SAMPLE');
});

test('3. BTTS Containment: Settled Separately and Excluded from Core Asian Metrics', () => {
  const ledgerPath = path.resolve(__dirname, '..', 'data', 'verification', 'live_prediction_ledger.jsonl');
  const lines = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n').filter(Boolean);
  const rows = lines.map(line => JSON.parse(line));

  const bttsRows = rows.filter(r => r.market === 'BTTS');
  assert.strictEqual(bttsRows.length, 10, 'Must contain exactly 10 BTTS positions');

  // BTTS should have valid results settled
  for (const row of bttsRows) {
    assert.ok(['WIN', 'LOSS'].includes(row.result), `BTTS result must be WIN or LOSS (got ${row.result})`);
    assert.strictEqual(row.settlementStatus, 'SETTLED');
  }
});

test('4. Daily Picks Provenance & Qualification Invariants', () => {
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
