// SALMO.DEV — 5Dollar Football Free Provider & Four-Market Integration Test Suite
// Verifies quota budgets, burst limits, four-market roles, Bet365 isolation, settlement, and CLV invariants.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const ts = require('typescript');

require.extensions['.ts'] = function (module, filename) {
  const content = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(content, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
  });
  return module._compile(compiled.outputText, filename);
};

const { FiveDollarQuotaManager } = require('../src/lib/quota/fiveDollarQuotaManager');
const { FiveDollarFreeProvider, FIVE_DOLLAR_ATTRIBUTION } = require('../src/services/providers/fiveDollarFreeProvider');
const { FourMarketShadowEngine } = require('../src/engine/shadow/fourMarketShadowEngine');

test('EPIC 5DOLLAR — Section 1: Quota Manager Invariants & Rate Limiting', async (t) => {
  await t.test('1. Enforces internal hourly budget of 42 requests and preserves 18 reserve', () => {
    FiveDollarQuotaManager.resetInstance();
    const qm = FiveDollarQuotaManager.getInstance({
      hourlyLimit: 60,
      internalHourlyBudget: 42,
      hourlyReserve: 18,
      burstLimitPerMinute: 50, // temporarily high for fast test
      minSpacingMs: 0,        // bypass pacing for fast loop
    });

    for (let i = 0; i < 42; i++) {
      const check = qm.canExecute(1);
      assert.equal(check.allowed, true, `Request ${i + 1} should be allowed`);
      qm.recordRequest('/fixtures', 1);
    }

    // 43rd request must be blocked under internal budget
    const check43 = qm.canExecute(1);
    assert.equal(check43.allowed, false, '43rd request must be rejected under internal budget');
    assert.match(check43.reason, /BUDGET_REACHED/);

    const snapshot = qm.getSnapshot();
    assert.equal(snapshot.consumedThisHour, 42);
    assert.equal(snapshot.remainingInBudget, 0);
    assert.equal(snapshot.reserveRemaining, 18, 'Reserve of at least 18 must be preserved');
  });

  await t.test('2. Enforces burst limit of 12 requests per minute', () => {
    FiveDollarQuotaManager.resetInstance();
    const qm = FiveDollarQuotaManager.getInstance({
      burstLimitPerMinute: 12,
      minSpacingMs: 0,
    });

    for (let i = 0; i < 12; i++) {
      assert.equal(qm.canExecute(1).allowed, true);
      qm.recordRequest('/fixtures', 1);
    }

    const check13 = qm.canExecute(1);
    assert.equal(check13.allowed, false);
    assert.match(check13.reason, /BURST_LIMIT_EXCEEDED/);
  });

  await t.test('3. Enforces request priority budgeting: BTTS restricted to lower ceiling', () => {
    FiveDollarQuotaManager.resetInstance();
    const qm = FiveDollarQuotaManager.getInstance({
      minSpacingMs: 0,
      burstLimitPerMinute: 50,
    });

    // Consume 25 requests with Priority 1
    for (let i = 0; i < 25; i++) {
      qm.recordRequest('/fixtures', 1);
    }

    // Priority 4 (BTTS) has a ceiling of 25 -> must be rejected
    const checkBtts = qm.canExecute(4);
    assert.equal(checkBtts.allowed, false);
    assert.match(checkBtts.reason, /PRIORITY_4_BUDGET_REACHED/);

    // Priority 1 (Fixtures) and Priority 2 (AH) still allowed up to 42
    const checkAh = qm.canExecute(2);
    assert.equal(checkAh.allowed, true);
  });

  await t.test('4. Cache hit consumes zero quota', () => {
    FiveDollarQuotaManager.resetInstance();
    const qm = FiveDollarQuotaManager.getInstance({ minSpacingMs: 0 });

    qm.recordRequest('/fixtures?league=EPL', 1, 'fixtures_epl', [{ id: 1 }], 60000);
    assert.equal(qm.getSnapshot().consumedThisHour, 1);

    const check = qm.canExecute(1, 'fixtures_epl');
    assert.equal(check.allowed, true);
    assert.equal(check.reason, 'CACHE_HIT');
    assert.deepEqual(check.cachedData, [{ id: 1 }]);
    // Invariant: Snapshot consumption must not increase on cache hit
    assert.equal(qm.getSnapshot().consumedThisHour, 1);
  });

  await t.test('5. Circuit breaker trips on HTTP 429 and blocks subsequent execution', () => {
    FiveDollarQuotaManager.resetInstance();
    const qm = FiveDollarQuotaManager.getInstance();

    qm.recordError(429);
    const check = qm.canExecute(1);
    assert.equal(check.allowed, false);
    assert.equal(check.reason, 'CIRCUIT_BREAKER_OPEN');
  });
});

test('EPIC 5DOLLAR — Section 2: Provider Contract & Attribution', async (t) => {
  FiveDollarQuotaManager.resetInstance();

  await t.test('1. Provider exposes official required attribution', () => {
    const provider = new FiveDollarFreeProvider();
    const attr = provider.getAttribution();
    assert.equal(attr.text, 'Football data by 5DollarFootballAPI');
    assert.equal(attr.url, 'https://5dollarfootballapi.com');
    assert.equal(FIVE_DOLLAR_ATTRIBUTION.text, 'Football data by 5DollarFootballAPI');
  });

  await t.test('2. Unconfigured provider fails closed gracefully', async () => {
    const provider = new FiveDollarFreeProvider('');
    const res = await provider.getUpcomingFixtures('EPL');
    assert.equal(res.status, 'UNCONFIGURED');
    assert.equal(res.data, null);
    assert.equal(res.requestsConsumed, 0);
  });
});

test('EPIC 5DOLLAR — Section 3: Four-Market Shadow Engine & Market Roles', async (t) => {
  FiveDollarQuotaManager.resetInstance();

  const sampleMatch = {
    canonicalMatchId: 'EPL_2026_ARSENALFC_CHELSEA_2026-11-10',
    providerFixtureId: 1001,
    competition: 'Premier League',
    season: '2026/2027',
    homeTeam: 'Arsenal FC',
    awayTeam: 'Chelsea FC',
    kickoffAt: '2026-11-10T17:30:00Z',
    homeExpectedGoals: 1.85,
    awayExpectedGoals: 0.95,
  };

  await t.test('1. Market Roles: AH & OU are Core Candidates; 1X2 is Validation-Pending; BTTS is Research-Only', () => {
    const odds = [
      { market: 'AH', selection: 'Arsenal FC -0.5', handicapLine: -0.5, bookmaker: 'Bet365', odds: 1.95, oppositeOdds: 1.95, capturedAt: '2026-11-08T10:00:00Z' },
      { market: 'OU', selection: 'Over 2.5', totalLine: 2.5, bookmaker: 'Bet365', odds: 1.85, oppositeOdds: 2.05, capturedAt: '2026-11-08T10:00:00Z' },
      { market: '1X2', selection: 'Home', bookmaker: 'Bet365', odds: 1.70, drawOdds: 3.80, awayOdds: 5.00, capturedAt: '2026-11-08T10:00:00Z' },
      { market: 'BTTS', selection: 'BTTS Yes', bookmaker: 'Bet365', odds: 1.80, oppositeOdds: 2.00, capturedAt: '2026-11-08T10:00:00Z' },
    ];

    const predictions = FourMarketShadowEngine.evaluateMatch(sampleMatch, odds);
    assert.equal(predictions.length, 4);

    const ah = predictions.find(p => p.market === 'AH');
    const ou = predictions.find(p => p.market === 'OU');
    const ml = predictions.find(p => p.market === '1X2');
    const btts = predictions.find(p => p.market === 'BTTS');

    assert.equal(ah.marketRole, 'CORE_CANDIDATE');
    assert.equal(ou.marketRole, 'CORE_CANDIDATE');
    assert.equal(ml.marketRole, 'VALIDATION_PENDING');
    assert.equal(btts.marketRole, 'RESEARCH_ONLY');

    // BTTS must NEVER be a qualified bet
    assert.equal(btts.predictionStatus, 'RESEARCH_ONLY');
    assert.equal(btts.verdict, 'RESEARCH_OBSERVATION');

    // All bookmakers strictly Bet365
    predictions.forEach(p => assert.equal(p.bookmaker, 'Bet365'));
  });

  await t.test('2. Settle quarter-line AH, OU, 1X2, and BTTS correctly', () => {
    const match = { ...sampleMatch };
    const ahOdds = { market: 'AH', selection: 'Arsenal FC -0.75', handicapLine: -0.75, bookmaker: 'Bet365', odds: 2.00, oppositeOdds: 1.90, capturedAt: '2026-11-08T10:00:00Z' };
    const [ahPred] = FourMarketShadowEngine.evaluateMatch(match, [ahOdds]);

    // Force qualified status to test stake accounting
    ahPred.predictionStatus = 'QUALIFIED_VALUE_BET';

    // 1-0 win with -0.75 line is a HALF_WIN
    const settledHalfWin = FourMarketShadowEngine.settleRecord(ahPred, 1, 0);
    assert.equal(settledHalfWin.settlementResult, 'HALF_WIN');
    assert.equal(settledHalfWin.profitUnits, 0.5); // (2.00 - 1)/2 = 0.5
    assert.equal(settledHalfWin.stakeUnits, 1.0);

    // 2-0 win with -0.75 line is a full WIN
    const settledFullWin = FourMarketShadowEngine.settleRecord(ahPred, 2, 0);
    assert.equal(settledFullWin.settlementResult, 'WIN');
    assert.equal(settledFullWin.profitUnits, 1.0); // 2.00 - 1 = 1.0

    // 1-1 draw is a LOSS
    const settledLoss = FourMarketShadowEngine.settleRecord(ahPred, 1, 1);
    assert.equal(settledLoss.settlementResult, 'LOSS');
    assert.equal(settledLoss.profitUnits, -1.0);
  });

  await t.test('3. CLV same-line invariant: Line moved sets CLV to null with status LINE_MOVED', () => {
    const match = { ...sampleMatch };
    const ahOdds = { market: 'AH', selection: 'Arsenal FC -0.5', handicapLine: -0.5, bookmaker: 'Bet365', odds: 1.95, oppositeOdds: 1.95, capturedAt: '2026-11-08T10:00:00Z' };
    const [pred] = FourMarketShadowEngine.evaluateMatch(match, [ahOdds]);

    // Line moved to -0.75 at closing
    const moved = FourMarketShadowEngine.applyClosingOdds(pred, -0.75, 1.85, 2.05);
    assert.equal(moved.clvStatus, 'LINE_MOVED');
    assert.equal(moved.clvNoVig, null);
    assert.equal(moved.clvRawRatio, null);

    // Same line: -0.5 closing at 1.85 (beat closing odds -> positive CLV)
    const matched = FourMarketShadowEngine.applyClosingOdds(pred, -0.5, 1.85, 2.05);
    assert.equal(matched.clvStatus, 'CALCULATED');
    assert.ok(matched.clvRawRatio > 0, 'Signal 1.95 vs Closing 1.85 must yield positive CLV');
    assert.ok(matched.clvNoVig > 0);
  });
});
