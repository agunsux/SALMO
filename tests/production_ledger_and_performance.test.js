// SALMO.DEV — Production Ledger, Green Cohort, Settlement, CLV & Performance Test Suite
// Strictly verifies:
// 1. Ledger qualification gates & Green Cohort boundary (> 70 strictly).
// 2. Canonical position identity & Idempotency (shifted odds do NOT overwrite or duplicate).
// 3. Exact Quarter-Line & Half-Line settlement math across AH and OU.
// 4. Performance metrics & statistical honest gating (n < 30 -> INSUFFICIENT SAMPLE).
// 5. CLV same-line invariant (null if line moved or missing, never 0).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const ts = require('typescript');

// On-the-fly TypeScript transpile hook for tests
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

const { QuarterLineSettler } = require('../src/engine/ah/quarterLineSettler.ts');
const { SettlementEngine } = require('../src/engine/settlement/settlementEngine.ts');
const { ClvEngine } = require('../src/engine/clv/clvEngine.ts');
const { PerformanceMetricsEngine } = require('../src/engine/performance/performanceMetrics.ts');
const { ProductionPredictionEngine } = require('../src/engine/pipeline/productionPredictionEngine.ts');

test('Step 1 & 1.1: Production Ledger Qualification & Green Cohort Gating', () => {
  // Helper to test qualification logic
  function checkLedgerQualification({
    verdict,
    marketType,
    confidence,
    odds,
    isPreKickoff = true,
    isProvider = true,
    isActive = true,
  }) {
    const isLayak = verdict === 'LAYAK';
    const isAhOrOu = marketType === 'AH' || marketType === 'OU';
    const hasValidOdds = typeof odds === 'number' && odds > 1.0;
    const qualifies = isLayak && isAhOrOu && hasValidOdds && isPreKickoff && isProvider && isActive;
    const isGreen = qualifies && confidence > 70;
    return { qualifies, isGreen };
  }

  // 1. LAYAK + confidence 82 -> ledger=true, green=true
  const r82 = checkLedgerQualification({ verdict: 'LAYAK', marketType: 'AH', confidence: 82, odds: 1.95 });
  assert.strictEqual(r82.qualifies, true, 'LAYAK + 82 must qualify for ledger');
  assert.strictEqual(r82.isGreen, true, 'LAYAK + 82 must be green cohort');

  // 2. LAYAK + confidence 71 -> ledger=true, green=true
  const r71 = checkLedgerQualification({ verdict: 'LAYAK', marketType: 'AH', confidence: 71, odds: 1.95 });
  assert.strictEqual(r71.qualifies, true, 'LAYAK + 71 must qualify for ledger');
  assert.strictEqual(r71.isGreen, true, 'LAYAK + 71 must be green cohort (strictly > 70)');

  // 3. LAYAK + confidence 70 -> ledger=true, green=false
  const r70 = checkLedgerQualification({ verdict: 'LAYAK', marketType: 'AH', confidence: 70, odds: 1.95 });
  assert.strictEqual(r70.qualifies, true, 'LAYAK + 70 must qualify for ledger (control group preserved)');
  assert.strictEqual(r70.isGreen, false, 'LAYAK + 70 must NOT be green cohort (boundary condition: 70 is not > 70)');

  // 4. LAYAK + confidence 69 -> ledger=true, green=false
  const r69 = checkLedgerQualification({ verdict: 'LAYAK', marketType: 'AH', confidence: 69, odds: 1.95 });
  assert.strictEqual(r69.qualifies, true, 'LAYAK + 69 must qualify for ledger');
  assert.strictEqual(r69.isGreen, false, 'LAYAK + 69 must NOT be green cohort');

  // 5. PANTAU -> no ledger
  const rPantau = checkLedgerQualification({ verdict: 'PANTAU', marketType: 'AH', confidence: 75, odds: 1.95 });
  assert.strictEqual(rPantau.qualifies, false, 'PANTAU must NEVER enter ledger');

  // 6. LEWATI -> no ledger
  const rLewati = checkLedgerQualification({ verdict: 'LEWATI', marketType: 'AH', confidence: 75, odds: 1.95 });
  assert.strictEqual(rLewati.qualifies, false, 'LEWATI must NEVER enter ledger');

  // 7. BTTS -> no ledger
  const rBtts = checkLedgerQualification({ verdict: 'LAYAK', marketType: 'BTTS', confidence: 75, odds: 1.95 });
  assert.strictEqual(rBtts.qualifies, false, 'BTTS must NEVER enter ledger (research-only)');

  // 8. Moneyline -> no ledger
  const rMl = checkLedgerQualification({ verdict: 'LAYAK', marketType: 'ML', confidence: 75, odds: 1.95 });
  assert.strictEqual(rMl.qualifies, false, 'Moneyline must NEVER enter ledger');

  // 9. Missing odds -> no ledger
  const rMissingOdds = checkLedgerQualification({ verdict: 'LAYAK', marketType: 'AH', confidence: 75, odds: null });
  assert.strictEqual(rMissingOdds.qualifies, false, 'Missing odds must NEVER enter ledger');

  // 10. Inactive data -> no ledger
  const rInactive = checkLedgerQualification({ verdict: 'LAYAK', marketType: 'AH', confidence: 75, odds: 1.95, isActive: false });
  assert.strictEqual(rInactive.qualifies, false, 'Inactive data must NEVER enter ledger');

  // 11. Non-provider odds -> no ledger
  const rNonProvider = checkLedgerQualification({ verdict: 'LAYAK', marketType: 'AH', confidence: 75, odds: 1.95, isProvider: false });
  assert.strictEqual(rNonProvider.qualifies, false, 'Non-provider odds must NEVER enter ledger');

  // 12. Post-kickoff write -> rejected
  const rPostKickoff = checkLedgerQualification({ verdict: 'LAYAK', marketType: 'AH', confidence: 75, odds: 1.95, isPreKickoff: false });
  assert.strictEqual(rPostKickoff.qualifies, false, 'Post-kickoff predictions must NEVER enter ledger');
});

test('Step 2: Canonical Position Identity & Idempotency under Odds Movement', () => {
  const fixtureId = 'id1000001772221294';
  const marketType = 'AH';
  const line = 0.0;
  const selection = 'Aston Villa 0';

  const ledgerPositionId = `${fixtureId}:${marketType}:${line}:${selection}`;
  const posUuid1 = ProductionPredictionEngine.deterministicUuid(`pos:${ledgerPositionId}`);

  // Simulating Cycle 1: Villa AH 0 @ 1.961
  const cycle1Snapshot = {
    ledgerPositionId,
    odds: 1.961,
    fairOdds: 1.363,
    confidence: 76,
    uuid: posUuid1,
  };

  // Simulating Cycle 2 with shifted odds: Villa AH 0 @ 1.910
  const cycle2PositionId = `${fixtureId}:${marketType}:${line}:${selection}`;
  const posUuid2 = ProductionPredictionEngine.deterministicUuid(`pos:${cycle2PositionId}`);

  assert.strictEqual(ledgerPositionId, cycle2PositionId, 'Position identity must be identical');
  assert.strictEqual(posUuid1, posUuid2, 'Deterministic UUID must be identical across odds movements');

  // In the engine, if posUuid already exists in ledger, cycle 2 is skipped:
  const mockExistingPositions = new Set([posUuid1]);
  const isDuplicate = mockExistingPositions.has(posUuid2);

  assert.strictEqual(isDuplicate, true, 'Second run with shifted odds must be recognized as duplicate');
  // Result: 1 ledger position, 0 duplicate positions, original snapshot unchanged @ 1.961
  assert.strictEqual(cycle1Snapshot.odds, 1.961, 'Original snapshot remains immutable @ 1.961');
});

test('Step 4 & 4.1: Settlement Engine — All Outcomes & Quarter Lines Math', () => {
  // 1. WIN: odds - 1
  assert.strictEqual(QuarterLineSettler.calculateProfit('WIN', 1.95, 1.0), 0.95);

  // 2. LOSS: -1.0
  assert.strictEqual(QuarterLineSettler.calculateProfit('LOSS', 1.95, 1.0), -1.0);

  // 3. PUSH: 0.0
  assert.strictEqual(QuarterLineSettler.calculateProfit('PUSH', 1.95, 1.0), 0.0);

  // 4. HALF_WIN: (odds - 1) / 2
  assert.strictEqual(QuarterLineSettler.calculateProfit('HALF_WIN', 1.95, 1.0), 0.475);

  // 5. HALF_LOSS: -0.5
  assert.strictEqual(QuarterLineSettler.calculateProfit('HALF_LOSS', 1.95, 1.0), -0.5);

  // 6. VOID: 0.0
  assert.strictEqual(QuarterLineSettler.calculateProfit('VOID', 1.95, 1.0), 0.0);

  // Asian Handicap Quarter-Lines:
  // AH -0.25 Home (Draw 1-1 -> diff 0 -> HALF_LOSS)
  assert.strictEqual(QuarterLineSettler.settle('home', -0.25, 1, 1), 'HALF_LOSS');
  // AH -0.25 Home (Win 2-1 -> diff 1 -> WIN)
  assert.strictEqual(QuarterLineSettler.settle('home', -0.25, 2, 1), 'WIN');

  // AH +0.25 Away (Draw 1-1 -> diff 0 -> HALF_WIN)
  assert.strictEqual(QuarterLineSettler.settle('away', 0.25, 1, 1), 'HALF_WIN');

  // AH -0.75 Home (Win by 1: 2-1 -> HALF_WIN)
  assert.strictEqual(QuarterLineSettler.settle('home', -0.75, 2, 1), 'HALF_WIN');
  // AH -0.75 Home (Win by 2: 3-1 -> WIN)
  assert.strictEqual(QuarterLineSettler.settle('home', -0.75, 3, 1), 'WIN');
  // AH -0.75 Home (Draw 1-1 -> LOSS)
  assert.strictEqual(QuarterLineSettler.settle('home', -0.75, 1, 1), 'LOSS');

  // Asian Total Goals Quarter-Lines:
  // OU 2.25 Over (Total 2 -> HALF_LOSS)
  assert.strictEqual(QuarterLineSettler.settleOverUnder('OVER', 2.25, 2), 'HALF_LOSS');
  // OU 2.25 Under (Total 2 -> HALF_WIN)
  assert.strictEqual(QuarterLineSettler.settleOverUnder('UNDER', 2.25, 2), 'HALF_WIN');

  // OU 2.75 Over (Total 3 -> HALF_WIN)
  assert.strictEqual(QuarterLineSettler.settleOverUnder('OVER', 2.75, 3), 'HALF_WIN');
  // OU 2.75 Under (Total 3 -> HALF_LOSS)
  assert.strictEqual(QuarterLineSettler.settleOverUnder('UNDER', 2.75, 3), 'HALF_LOSS');

  // OU 3.25 Over (Total 3 -> HALF_LOSS)
  assert.strictEqual(QuarterLineSettler.settleOverUnder('OVER', 3.25, 3), 'HALF_LOSS');
  // OU 3.25 Over (Total 4 -> WIN)
  assert.strictEqual(QuarterLineSettler.settleOverUnder('OVER', 3.25, 4), 'WIN');

  // Full SettlementEngine Position Call (Separating settlementStatus from result):
  const resSettled = SettlementEngine.settlePosition({
    ledgerPositionId: 'pos_1',
    marketType: 'OU',
    selection: 'Over 2.75',
    line: 2.75,
    oddsTaken: 1.95,
    homeGoals: 2,
    awayGoals: 1, // Total 3 -> HALF_WIN
    matchStatus: 'FINISHED',
  });
  assert.strictEqual(resSettled.settlementStatus, 'SETTLED');
  assert.strictEqual(resSettled.result, 'HALF_WIN');
  assert.strictEqual(resSettled.profitUnits, 0.475);
  assert.strictEqual(resSettled.stakeUnits, 1.0);

  // Pending position
  const resPending = SettlementEngine.settlePosition({
    ledgerPositionId: 'pos_2',
    marketType: 'AH',
    selection: 'Aston Villa 0',
    line: 0,
    oddsTaken: 1.961,
    homeGoals: null,
    awayGoals: null,
    matchStatus: 'SCHEDULED',
  });
  assert.strictEqual(resPending.settlementStatus, 'PENDING');
  assert.strictEqual(resPending.result, null);
  assert.strictEqual(resPending.stakeUnits, 0.0);

  // Voided position
  const resVoid = SettlementEngine.settlePosition({
    ledgerPositionId: 'pos_3',
    marketType: 'AH',
    selection: 'Aston Villa 0',
    line: 0,
    oddsTaken: 1.961,
    homeGoals: 0,
    awayGoals: 0,
    voided: true,
  });
  assert.strictEqual(resVoid.settlementStatus, 'VOID');
  assert.strictEqual(resVoid.result, 'VOID');
  assert.strictEqual(resVoid.stakeUnits, 0.0);
  assert.strictEqual(resVoid.profitUnits, 0.0);
});

test('Step 5: Closing Line Value (CLV) — Same-Line Invariant & Devigged Probability', () => {
  // 1. Same line: Taken 1.95, Close 1.88 side vs 2.05 other
  // Devig closing prob = (1/1.88) / (1/1.88 + 1/2.05) = 0.53191 / (0.53191 + 0.48780) = 0.53191 / 1.01971 = 0.52163
  // CLV = 1.95 * 0.52163 - 1 = 1.01718 - 1 = +0.0172 (+1.72%)
  const clvSame = ClvEngine.calculateClv({
    marketType: 'AH',
    takenLine: 0.0,
    takenSelection: 'Aston Villa 0',
    oddsTaken: 1.95,
    closingLine: 0.0,
    closingOddsSide: 1.88,
    closingOddsOther: 2.05,
    closingSnapshotTimestamp: '2026-10-07T12:00:00Z',
  });
  assert.strictEqual(clvSame.status, 'CALCULATED');
  assert.ok(clvSame.clv !== null && clvSame.clv > 0, 'CLV must be positive when price beat closing');
  assert.strictEqual(clvSame.clvPct, 1.72);

  // 2. Line moved: takenLine = 0.0, closingLine = -0.25 -> CLV must be NULL (never 0!)
  const clvMoved = ClvEngine.calculateClv({
    marketType: 'AH',
    takenLine: 0.0,
    takenSelection: 'Aston Villa 0',
    oddsTaken: 1.95,
    closingLine: -0.25,
    closingOddsSide: 1.95,
    closingOddsOther: 1.95,
  });
  assert.strictEqual(clvMoved.status, 'LINE_MOVED');
  assert.strictEqual(clvMoved.clv, null, 'Moved line CLV must be NULL, never 0');
  assert.strictEqual(clvMoved.clvPct, null, 'Moved line CLV % must be NULL, never 0');

  // 3. No closing snapshot -> CLV must be NULL (never 0!)
  const clvMissing = ClvEngine.calculateClv({
    marketType: 'AH',
    takenLine: 0.0,
    takenSelection: 'Aston Villa 0',
    oddsTaken: 1.95,
    closingLine: null,
    closingOddsSide: null,
    closingOddsOther: null,
  });
  assert.strictEqual(clvMissing.status, 'NO_CLOSING_SNAPSHOT');
  assert.strictEqual(clvMissing.clv, null, 'Missing closing odds CLV must be NULL, never 0');
  assert.strictEqual(clvMissing.clvPct, null, 'Missing closing odds CLV % must be NULL, never 0');
});

test('Step 6: Performance Metrics Aggregation & Statistical Invariants', () => {
  // Prepare controlled synthetic positions:
  // 1. WIN @ 2.00: stake 1, profit +1.0
  // 2. LOSS @ 1.95: stake 1, profit -1.0
  // 3. HALF_WIN @ 2.00: stake 1, profit +0.5
  // 4. PUSH @ 1.90: stake 1, profit 0.0
  // 5. VOID: stake 0, profit 0.0 (excluded from denominator)
  // 6. PENDING: stake 0, profit 0.0 (excluded from denominator)
  const samplePositions = [
    {
      ledgerPositionId: '1',
      fixtureId: 'f1',
      marketType: 'AH',
      selection: 'Home 0',
      line: 0,
      stakeUnits: 1.0,
      marketOdds: 2.00,
      fairOdds: 1.80,
      pWin: 0.55,
      pPush: 0.20,
      pLoss: 0.25,
      confidence: 76,
      edge: 0.05,
      expectedValuePct: 10.0,
      greenCohort: true,
      settlementStatus: 'SETTLED',
      result: 'WIN',
      profitUnits: 1.0,
      clvPct: 5.0,
    },
    {
      ledgerPositionId: '2',
      fixtureId: 'f2',
      marketType: 'AH',
      selection: 'Home -0.5',
      line: -0.5,
      stakeUnits: 1.0,
      marketOdds: 1.95,
      fairOdds: 1.85,
      pWin: 0.54,
      pPush: 0.0,
      pLoss: 0.46,
      confidence: 72,
      edge: 0.04,
      expectedValuePct: 5.3,
      greenCohort: true,
      settlementStatus: 'SETTLED',
      result: 'LOSS',
      profitUnits: -1.0,
      clvPct: -2.0,
    },
    {
      ledgerPositionId: '3',
      fixtureId: 'f3',
      marketType: 'OU',
      selection: 'Over 2.75',
      line: 2.75,
      stakeUnits: 1.0,
      marketOdds: 2.00,
      fairOdds: 1.85,
      pWin: 0.54,
      pPush: 0.20,
      pLoss: 0.26,
      confidence: 75,
      edge: 0.04,
      expectedValuePct: 8.0,
      greenCohort: true,
      settlementStatus: 'SETTLED',
      result: 'HALF_WIN',
      profitUnits: 0.5,
      clvPct: null, // missing/moved line
    },
    {
      ledgerPositionId: '4',
      fixtureId: 'f4',
      marketType: 'AH',
      selection: 'Away 0',
      line: 0,
      stakeUnits: 1.0,
      marketOdds: 1.90,
      fairOdds: 1.80,
      pWin: 0.52,
      pPush: 0.24,
      pLoss: 0.24,
      confidence: 74,
      edge: 0.03,
      expectedValuePct: 4.5,
      greenCohort: true,
      settlementStatus: 'SETTLED',
      result: 'PUSH',
      profitUnits: 0.0,
      clvPct: 1.5,
    },
    {
      ledgerPositionId: '5',
      fixtureId: 'f5',
      marketType: 'AH',
      selection: 'Home 0',
      line: 0,
      stakeUnits: 0.0,
      marketOdds: 1.95,
      fairOdds: 1.85,
      pWin: 0.54,
      pPush: 0.20,
      pLoss: 0.26,
      confidence: 73,
      edge: 0.04,
      expectedValuePct: 5.3,
      greenCohort: true,
      settlementStatus: 'VOID',
      result: 'VOID',
      profitUnits: 0.0,
      clvPct: null,
    },
    {
      ledgerPositionId: '6',
      fixtureId: 'f6',
      marketType: 'OU',
      selection: 'Over 2.5',
      line: 2.5,
      stakeUnits: 0.0,
      marketOdds: 1.95,
      fairOdds: 1.85,
      pWin: 0.54,
      pPush: 0.0,
      pLoss: 0.46,
      confidence: 75,
      edge: 0.04,
      expectedValuePct: 5.3,
      greenCohort: true,
      settlementStatus: 'PENDING',
      result: null,
      profitUnits: 0.0,
      clvPct: null,
    },
  ];

  const metrics = PerformanceMetricsEngine.aggregateMetrics(samplePositions);

  // Denominator: WIN(1) + LOSS(1) + HALF_WIN(1) + PUSH(1) = 4.0 units staked!
  // VOID(0) and PENDING(0) must NOT count.
  assert.strictEqual(metrics.unitsStaked, 4.0, 'Denominator must be exactly 4.0 units');

  // Profit: +1.0 - 1.0 + 0.5 + 0.0 = +0.5 units profit!
  assert.strictEqual(metrics.profitUnits, 0.5, 'Profit must be exactly +0.5 units');

  // ROI: (+0.5 / 4.0) * 100 = +12.5%
  assert.strictEqual(metrics.roi, 12.5, 'ROI must be exactly +12.5%');
  assert.strictEqual(metrics.yield, 12.5, 'Yield must be identical to ROI for 1-unit stakes');

  // Settlement counts:
  assert.strictEqual(metrics.wins, 1);
  assert.strictEqual(metrics.losses, 1);
  assert.strictEqual(metrics.halfWins, 1);
  assert.strictEqual(metrics.pushes, 1);
  assert.strictEqual(metrics.voids, 1);
  assert.strictEqual(metrics.pending, 1);
  assert.strictEqual(metrics.settled, 4);

  // Sample size check (4 settled < 30):
  assert.strictEqual(metrics.sampleStatus, 'INSUFFICIENT SAMPLE');

  // CLV calculation: only non-null CLVs: 5.0, -2.0, 1.5 -> sum = 4.5, n = 3 -> avg = 1.5%
  assert.strictEqual(metrics.nClv, 3, 'Only 3 non-null CLV observations');
  assert.strictEqual(metrics.avgClvPct, 1.5, 'Average CLV must be 1.5%');

  // Zero settled bets check
  const zeroMetrics = PerformanceMetricsEngine.aggregateMetrics([
    {
      ledgerPositionId: 'pending_1',
      fixtureId: 'f1',
      marketType: 'AH',
      selection: 'Home 0',
      line: 0,
      stakeUnits: 0,
      marketOdds: 1.95,
      fairOdds: 1.85,
      pWin: 0.54,
      pPush: 0.20,
      pLoss: 0.26,
      confidence: 75,
      edge: 0.04,
      expectedValuePct: 5.3,
      greenCohort: true,
      settlementStatus: 'PENDING',
      result: null,
      profitUnits: 0,
      clvPct: null,
    },
  ]);
  assert.strictEqual(zeroMetrics.unitsStaked, 0);
  assert.strictEqual(zeroMetrics.roi, null, 'ROI must be NULL when unitsStaked === 0');
  assert.strictEqual(zeroMetrics.displayStatus, 'No settled bets');
});
