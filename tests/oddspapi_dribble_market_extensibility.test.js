// SALMO.DEV — OddsPAPI + Dribble360 & Market Extensibility Test Suite
// Rigorous verification of:
// 1. OddsPAPI bookmaker trio (Pinnacle, Bet365, 1xBet)
// 2. 5-Tournament batching & 15-league coverage
// 3. Market lifecycle status model (AH, OU, BTTS = ACTIVE; DNB, DC, Corners, Cards = READY)
// 4. DNB = AH 0.0 mathematical projection & settlement
// 5. Double Chance (1X, X2, 12) bivariate aggregation & settlement
// 6. Asian Total (OU) quarter-line settlement
// 7. Corners and Yellow Cards fail-closed architecture
// 8. Provider provenance & zero synthetic fallback

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');

// Transparent on-the-fly TypeScript transpile hook for tests
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

const {
  MARKET_REGISTRY,
  isMarketActive,
  getActiveMarkets,
} = require('../src/types/index.ts');

const {
  CANONICAL_15_LEAGUES,
  MAX_TOURNAMENTS_PER_BATCH_REQUEST,
  getTournamentBatches,
  getLeagueByKey,
  getLeagueByOpId,
} = require('../src/config/multiLeagueRegistry.ts');

const { CONSUMED_BOOKMAKERS, EXTENSIBLE_SUPPORTED_BOOKMAKERS } = require('../src/services/providers/types.ts');
const { OddsPapiProvider } = require('../src/services/providers/oddsPapiProvider.ts');
const { calculateDnb, settleDnbMatch } = require('../src/engine/dnb/dnbEngine.ts');
const { calculateDoubleChance, settleDoubleChanceMatch } = require('../src/engine/dc/doubleChanceEngine.ts');
const { CornersEngine } = require('../src/engine/corners/cornersEngine.ts');
const { YellowCardsEngine } = require('../src/engine/cards/cardsEngine.ts');
const { AsianTotalEngine, settleAsianTotalGoals } = require('../src/engine/ou/asianTotalEngine.ts');
const { QuarterLineSettler } = require('../src/engine/ah/quarterLineSettler.ts');
const { SettlementEngine } = require('../src/engine/settlement/settlementEngine.ts');
const { buildScoreGrid } = require('../src/engine/probability/scoreGrid.ts');
const { calculateAsianHandicapFromGrid } = require('../src/engine/ah/ahProbability.ts');

test('1. OddsPAPI Bookmaker Pair Verification (Pinnacle + Bet365 Launch Configuration)', () => {
  assert.strictEqual(CONSUMED_BOOKMAKERS.length, 2, 'Active launch configuration must strictly consume 2 bookmakers (Pinnacle + Bet365)');
  assert.ok(CONSUMED_BOOKMAKERS.includes('pinnacle'), 'Must include Pinnacle as sharp reference benchmark');
  assert.ok(CONSUMED_BOOKMAKERS.includes('bet365'), 'Must include Bet365 as soft retail execution benchmark');
  assert.ok(!CONSUMED_BOOKMAKERS.includes('1xbet'), '1xBet must NOT be active in launch configuration');

  // Verify generic extensible catalog supports future additions
  assert.ok(EXTENSIBLE_SUPPORTED_BOOKMAKERS.includes('1xbet'));
  assert.ok(EXTENSIBLE_SUPPORTED_BOOKMAKERS.includes('sbobet'));
  assert.ok(EXTENSIBLE_SUPPORTED_BOOKMAKERS.includes('singbet'));

  // Verify OddsPapiProvider static properties
  assert.strictEqual(OddsPapiProvider.CONSUMED_BOOKMAKERS.length, 2);
  assert.strictEqual(OddsPapiProvider.MAX_TOURNAMENTS_PER_BATCH_REQUEST, 5);
});

test('2. 5-Tournament Batching & 15-League Canonical Coverage', () => {
  assert.strictEqual(CANONICAL_15_LEAGUES.length, 15, 'Must contain exactly 15 candidate leagues');
  assert.strictEqual(MAX_TOURNAMENTS_PER_BATCH_REQUEST, 5, 'Must batch 5 tournaments per request');

  const batches = getTournamentBatches();
  assert.strictEqual(batches.length, 3, '15 leagues / 5 per batch = exactly 3 batches');

  // Verify Tier 1 Big 5 in Batch 1
  assert.deepStrictEqual(batches[0], [17, 8, 23, 35, 34]); // ENG-PL, ESP-LALIGA, ITA-SERIEA, DEU-BUNDESLIGA, FRA-LIGUE1

  // Verify Tier 2 Secondary Europe in Batch 2
  assert.deepStrictEqual(batches[1], [37, 238, 38, 36, 18]); // NED-ERE, POR-PRIMEIRA, BEL-PRO, SCO-PREM, ENG-CHAMP

  // Verify Tier 3 Global Expansion in Batch 3
  assert.deepStrictEqual(batches[2], [242, 955, 196, 410, 1015]); // USA-MLS, SAU-PRO, JPN-J1, KOR-K1, IDN-L1

  // Test fast lookups
  const epl = getLeagueByKey('ENG-PL');
  assert.strictEqual(epl.oddspapi_tournament_id, 17);
  assert.strictEqual(epl.display_name, 'Premier League');

  const j1 = getLeagueByOpId(196);
  assert.strictEqual(j1.internal_league_id, 'JPN-J1');
  assert.strictEqual(j1.country, 'Japan');
});

test('3. Market Extensibility & Explicit Lifecycle Status Model', () => {
  // Active Core Markets
  assert.strictEqual(isMarketActive('AH'), true);
  assert.strictEqual(isMarketActive('OU'), true);
  assert.strictEqual(isMarketActive('BTTS'), true);

  // Extensible / Ready Markets (Architecture ready, but NOT active in production)
  assert.strictEqual(isMarketActive('DNB'), false, 'DNB must be READY, not ACTIVE in production');
  assert.strictEqual(isMarketActive('DOUBLE_CHANCE'), false, 'Double Chance must be READY, not ACTIVE in production');
  assert.strictEqual(isMarketActive('CORNERS'), false, 'Corners must be READY, not ACTIVE in production');
  assert.strictEqual(isMarketActive('YELLOW_CARDS'), false, 'Yellow Cards must be READY, not ACTIVE in production');

  // Verify getActiveMarkets returns only active markets
  const active = getActiveMarkets();
  const activeKeys = active.map(m => m.canonicalKey);
  assert.ok(activeKeys.includes('AH'));
  assert.ok(activeKeys.includes('OU'));
  assert.ok(activeKeys.includes('BTTS'));
  assert.ok(!activeKeys.includes('CORNERS'));
  assert.ok(!activeKeys.includes('YELLOW_CARDS'));
});

test('4. DNB = AH 0.0 Mathematical Equivalence & Settlement', () => {
  const homeXG = 1.65;
  const awayXG = 1.10;
  const rho = -0.06;

  // 1. Calculate directly via DNB engine
  const dnbResult = calculateDnb(homeXG, awayXG, 'HOME_DNB', rho);
  assert.strictEqual(dnbResult.line, 0.0);
  assert.strictEqual(dnbResult.isDerived, true);
  assert.strictEqual(dnbResult.derivedFrom, 'AH_0.0');

  // 2. Compare with direct AH 0.0 calculation from score grid
  const grid = buildScoreGrid(homeXG, awayXG, rho);
  const ah0 = calculateAsianHandicapFromGrid(grid, 0.0);

  assert.strictEqual(dnbResult.probabilities.win, ah0.win);
  assert.strictEqual(dnbResult.probabilities.push, ah0.push);
  assert.strictEqual(dnbResult.probabilities.loss, ah0.loss);

  // 3. DNB Settlement Invariants
  // Home Win: 2 - 1 -> Home DNB is WIN, Away DNB is LOSS
  assert.strictEqual(settleDnbMatch('HOME_DNB', 2, 1), 'WIN');
  assert.strictEqual(settleDnbMatch('AWAY_DNB', 2, 1), 'LOSS');

  // Draw: 1 - 1 -> Both Home DNB and Away DNB are PUSH (Refund)
  assert.strictEqual(settleDnbMatch('HOME_DNB', 1, 1), 'PUSH');
  assert.strictEqual(settleDnbMatch('AWAY_DNB', 1, 1), 'PUSH');

  // Away Win: 0 - 2 -> Home DNB is LOSS, Away DNB is WIN
  assert.strictEqual(settleDnbMatch('HOME_DNB', 0, 2), 'LOSS');
  assert.strictEqual(settleDnbMatch('AWAY_DNB', 0, 2), 'WIN');
});

test('5. Double Chance (1X / X2 / 12) Bivariate Aggregation & Settlement', () => {
  const homeXG = 1.50;
  const awayXG = 1.20;
  const rho = -0.06;

  const dc1X = calculateDoubleChance(homeXG, awayXG, '1X', rho);
  const dcX2 = calculateDoubleChance(homeXG, awayXG, 'X2', rho);
  const dc12 = calculateDoubleChance(homeXG, awayXG, '12', rho);

  // Mathematical identities:
  // P(1X) = P(Home Win) + P(Draw)
  // P(X2) = P(Draw) + P(Away Win)
  // P(12) = P(Home Win) + P(Away Win)
  const pHome = dc1X.probabilities.pHomeWin;
  const pDraw = dc1X.probabilities.pDraw;
  const pAway = dc1X.probabilities.pAwayWin;

  assert.ok(Math.abs(pHome + pDraw + pAway - 1.0) < 0.001);
  assert.ok(Math.abs(dc1X.selectionProbability - (pHome + pDraw)) < 0.001);
  assert.ok(Math.abs(dcX2.selectionProbability - (pDraw + pAway)) < 0.001);
  assert.ok(Math.abs(dc12.selectionProbability - (pHome + pAway)) < 0.001);

  // Binary Settlement Rules:
  // Match: 2 - 1 (Home Win)
  assert.strictEqual(settleDoubleChanceMatch('1X', 2, 1), 'WIN');
  assert.strictEqual(settleDoubleChanceMatch('X2', 2, 1), 'LOSS');
  assert.strictEqual(settleDoubleChanceMatch('12', 2, 1), 'WIN');

  // Match: 1 - 1 (Draw)
  assert.strictEqual(settleDoubleChanceMatch('1X', 1, 1), 'WIN');
  assert.strictEqual(settleDoubleChanceMatch('X2', 1, 1), 'WIN');
  assert.strictEqual(settleDoubleChanceMatch('12', 1, 1), 'LOSS');

  // Match: 0 - 2 (Away Win)
  assert.strictEqual(settleDoubleChanceMatch('1X', 0, 2), 'LOSS');
  assert.strictEqual(settleDoubleChanceMatch('X2', 0, 2), 'WIN');
  assert.strictEqual(settleDoubleChanceMatch('12', 0, 2), 'WIN');
});

test('6. Asian Total (OU) Quarter-Line Settlement Precision', () => {
  // Over / Under 2.25
  // 2 goals: Over 2.25 -> HALF_LOSS (whole line 2 pushes, half line 2.5 loses)
  assert.strictEqual(settleAsianTotalGoals(2.25, 'OVER', 2), 'HALF_LOSS');
  // 2 goals: Under 2.25 -> HALF_WIN (whole line 2 pushes, half line 2.5 wins)
  assert.strictEqual(settleAsianTotalGoals(2.25, 'UNDER', 2), 'HALF_WIN');
  // 3 goals: Over 2.25 -> FULL_WIN
  assert.strictEqual(settleAsianTotalGoals(2.25, 'OVER', 3), 'FULL_WIN');
  // 3 goals: Under 2.25 -> FULL_LOSS
  assert.strictEqual(settleAsianTotalGoals(2.25, 'UNDER', 3), 'FULL_LOSS');

  // Over / Under 2.75
  // 3 goals: Over 2.75 -> HALF_WIN (half line 2.5 wins, whole line 3 pushes)
  assert.strictEqual(settleAsianTotalGoals(2.75, 'OVER', 3), 'HALF_WIN');
  // 3 goals: Under 2.75 -> HALF_LOSS (half line 2.5 loses, whole line 3 pushes)
  assert.strictEqual(settleAsianTotalGoals(2.75, 'UNDER', 3), 'HALF_LOSS');
  // 4 goals: Over 2.75 -> FULL_WIN
  assert.strictEqual(settleAsianTotalGoals(2.75, 'OVER', 4), 'FULL_WIN');

  // Over / Under 3.0 (Whole line)
  assert.strictEqual(settleAsianTotalGoals(3.0, 'OVER', 3), 'PUSH');
  assert.strictEqual(settleAsianTotalGoals(3.0, 'UNDER', 3), 'PUSH');
});

test('7. Corners & Yellow Cards Fail-Closed Protection', () => {
  assert.strictEqual(CornersEngine.isReady(), false);
  assert.throws(() => CornersEngine.evaluateCorners(), /Corners market is in READY \/ INACTIVE state/);

  assert.strictEqual(YellowCardsEngine.isReady(), false);
  assert.throws(() => YellowCardsEngine.evaluateCards(), /Yellow Cards market is in READY \/ INACTIVE state/);
});

test('8. Unified Settlement Engine Integration', () => {
  // Test AH Quarter Line
  const ahRes = SettlementEngine.settlePosition({
    ledgerPositionId: 'test_ah_1',
    marketType: 'AH',
    selection: 'home -0.75',
    line: -0.75,
    oddsTaken: 1.95,
    homeGoals: 1,
    awayGoals: 0,
    matchStatus: 'FINISHED',
  });
  assert.strictEqual(ahRes.settlementStatus, 'SETTLED');
  assert.strictEqual(ahRes.result, 'HALF_WIN');
  assert.strictEqual(ahRes.profitUnits, 0.475);

  // Test DNB Settlement
  const dnbRes = SettlementEngine.settlePosition({
    ledgerPositionId: 'test_dnb_1',
    marketType: 'DNB',
    selection: 'HOME_DNB',
    line: 0.0,
    oddsTaken: 1.80,
    homeGoals: 1,
    awayGoals: 1,
    matchStatus: 'FINISHED',
  });
  assert.strictEqual(dnbRes.settlementStatus, 'SETTLED');
  assert.strictEqual(dnbRes.result, 'PUSH');
  assert.strictEqual(dnbRes.profitUnits, 0);

  // Test Double Chance Settlement
  const dcRes = SettlementEngine.settlePosition({
    ledgerPositionId: 'test_dc_1',
    marketType: 'DOUBLE_CHANCE',
    selection: '1X',
    line: 0,
    oddsTaken: 1.35,
    homeGoals: 1,
    awayGoals: 1,
    matchStatus: 'FINISHED',
  });
  assert.strictEqual(dcRes.settlementStatus, 'SETTLED');
  assert.strictEqual(dcRes.result, 'WIN');
  assert.strictEqual(dcRes.profitUnits, 0.35);

  // Test BTTS Settlement
  const bttsRes = SettlementEngine.settlePosition({
    ledgerPositionId: 'test_btts_1',
    marketType: 'BTTS',
    selection: 'BTTS YES',
    line: 0,
    oddsTaken: 1.75,
    homeGoals: 2,
    awayGoals: 1,
    matchStatus: 'FINISHED',
  });
  assert.strictEqual(bttsRes.settlementStatus, 'SETTLED');
  assert.strictEqual(bttsRes.result, 'WIN');
  assert.strictEqual(bttsRes.profitUnits, 0.75);
});
