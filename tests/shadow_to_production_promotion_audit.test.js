// SALMO.DEV — Shadow-to-Production League Promotion & Multi-Line OU Audit Test Suite
// Validates:
// 1. MultiLeagueAutoActivator.evaluateAllShadowLeagues() synchronous read-only PROPOSE_ONLY evaluation (0 SHADOW leagues promoted).
// 2. 14-league historical dataset reconciliation (15,298 unique played matches = 11,280 initial training + 4,018 walk-forward eval; never conflating 4,018 nEval with 15,298 total historical matches).
// 3. Multi-line OU (1.5, 2.0, 2.25, 2.5, 2.75, 3.0, 3.25, 3.5) binary no-push per-leg Brier decomposition and base-rate skew detection on high-scoring leagues (DEU-BUNDESLIGA, NED-ERE).
// 4. H8 binary no-push quarter-line AH Brier replacement in MultiLeagueAutoActivator and evaluateMarketPromotionGates most-restrictive classification across all 7 canonical statuses.
// 5. Immutable SHA-256 preservation of canonical ledgers and ratings artifacts, and cron containment ("crons": []).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const Module = require('module');

const origResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (typeof request === 'string' && request.startsWith('@/')) {
    const mapped = path.join(process.cwd(), 'src', request.slice(2));
    for (const candidate of [mapped, `${mapped}.ts`, `${mapped}.tsx`, path.join(mapped, 'index.ts')]) {
      if (fs.existsSync(candidate)) {
        return origResolveFilename.call(this, candidate, parent, isMain, options);
      }
    }
  }
  return origResolveFilename.call(this, request, parent, isMain, options);
};

if (!require.extensions['.ts']) {
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
    module._compile(compiled.outputText, filename);
  };
}

const {
  SHADOW_PROMOTION_MATRIX_STATUSES,
  OU_EVALUATED_LINES,
  H8_WALKFORWARD_BINARY_NO_PUSH_BY_LEAGUE,
  PRE_REGISTERED_GATES,
  evaluateMarketPromotionGates,
} = require('../src/engine/performance/gates.ts');
const {
  MultiLeagueAutoActivator,
} = require('../src/engine/activation/multiLeagueAutoActivator.ts');
const {
  CANONICAL_15_LEAGUES,
  resetRegistryToDefaultState,
} = require('../src/config/multiLeagueRegistry.ts');
const {
  buildGrid,
  evalSingleOuLineOnGrid,
  evalOuBinaryNoPushLegs,
} = require('../scripts/recompute_h8_walkforward_backtest_readonly.js');

const EXPECTED_HASHES = {
  'data/verification/live_prediction_ledger.jsonl':
    '317fc037a63b811420400ea9de094092ec7d68b119ad6abc57743be12d568527',
  'data/verification/all_leagues_research_ledger.jsonl':
    'eae8f364a5393255d276fca2650056951fb601ba829c1710b26ac673dffb967b',
  'data/artifacts/multi_league_team_ratings_v1.0.json':
    '53466f88ae63f5246f8756f8873f71c472669b0912f09979cfc5e77b82050984',
};

test('P1.1: Reconciled 14-league historical dataset totals 15,298 unique played matches (11,280 initial training + 4,018 walk-forward eval)', () => {
  const ratings = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'data/artifacts/multi_league_team_ratings_v1.0.json'), 'utf8')
  );
  const manifest = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'data/verification/shadow_to_production_promotion_manifest.json'), 'utf8')
  );

  const coveredLeagues = ratings.provenance.leaguesCovered;
  assert.strictEqual(coveredLeagues.length, 14, 'Exactly 14 leagues have verified historical matches (IDN-L1 has 0)');

  let totalUniquePlayed = 0;
  let totalTrainInitial = 0;
  let totalEval = 0;

  for (const lid of coveredLeagues) {
    const prof = ratings.leagueProfiles[lid];
    const bt = ratings.backtestSummary[lid];
    assert.ok(prof && prof.sampleMatches > 0, `Missing leagueProfile for ${lid}`);
    assert.ok(bt && bt.nEval > 0, `Missing backtestSummary for ${lid}`);
    assert.strictEqual(
      bt.nTrainInitial + bt.nEval,
      prof.sampleMatches,
      `nTrainInitial + nEval must equal sampleMatches for ${lid}`
    );

    totalUniquePlayed += prof.sampleMatches;
    totalTrainInitial += bt.nTrainInitial;
    totalEval += bt.nEval;
  }

  assert.strictEqual(totalUniquePlayed, 15298, 'Total unique played historical matches across 14 leagues must be 15,298');
  assert.strictEqual(totalTrainInitial, 11280, 'Total initial training matches before walk-forward window must be 11,280');
  assert.strictEqual(totalEval, 4018, 'Total out-of-sample walk-forward evaluated matches must be 4,018');

  assert.strictEqual(
    manifest.reconciledDatasetTotals14CoveredLeagues.totalUniquePlayedHistoricalMatches,
    15298
  );
  assert.strictEqual(
    manifest.reconciledDatasetTotals14CoveredLeagues.totalInitialTrainingMatchesBeforeWalkForwardWindow,
    11280
  );
  assert.strictEqual(
    manifest.reconciledDatasetTotals14CoveredLeagues.totalOutOfSampleWalkForwardEvalMatches,
    4018
  );
});

test('P2.1: Multi-line OU binary no-push per-leg evaluation covers all 8 lines (1.5, 2.0, 2.25, 2.5, 2.75, 3.0, 3.25, 3.5) and excludes whole-goal push legs', () => {
  assert.deepStrictEqual(OU_EVALUATED_LINES, [1.5, 2.0, 2.25, 2.5, 2.75, 3.0, 3.25, 3.5]);

  const grid = buildGrid(1.65, 1.35, -0.06);

  // Whole-goal line OU 2.0 on a 1-1 draw (total = 2 goals) must push and be excluded
  const legsOu20Push = evalOuBinaryNoPushLegs(grid, 2.0, 1, 1);
  assert.strictEqual(legsOu20Push.length, 1);
  assert.strictEqual(legsOu20Push[0].excludedPush, true);
  assert.strictEqual(legsOu20Push[0].binaryOutcome, null);

  // Quarter-goal line OU 2.25 on a 1-1 draw (total = 2 goals):
  // Leg 1 (2.0) pushes and is excluded; Leg 2 (2.5) loses (Y=0) and is scored against pCondNoPush(2.5)
  const legsOu225HalfLoss = evalOuBinaryNoPushLegs(grid, 2.25, 1, 1);
  assert.strictEqual(legsOu225HalfLoss.length, 2);
  assert.strictEqual(legsOu225HalfLoss[0].legLine, 2.0);
  assert.strictEqual(legsOu225HalfLoss[0].excludedPush, true);
  assert.strictEqual(legsOu225HalfLoss[1].legLine, 2.5);
  assert.strictEqual(legsOu225HalfLoss[1].excludedPush, false);
  assert.strictEqual(legsOu225HalfLoss[1].binaryOutcome, 0);

  const g25 = evalSingleOuLineOnGrid(grid, 2.5);
  assert.ok(Math.abs(legsOu225HalfLoss[1].pLegNoPush - g25.pCondNoPush) < 1e-12);

  // Verify DEU-BUNDESLIGA and NED-ERE multi-line OU telemetry exposes 3.0/3.25 balanced line CI95 overlap with 0.2500
  const deuH8 = H8_WALKFORWARD_BINARY_NO_PUSH_BY_LEAGUE['DEU-BUNDESLIGA'];
  const nedH8 = H8_WALKFORWARD_BINARY_NO_PUSH_BY_LEAGUE['NED-ERE'];
  assert.ok(deuH8.ouByLineBrier['2.5'].ci95[1] < 0.25, 'DEU-BUNDESLIGA fixed OU 2.5 CI95 upper < 0.25');
  assert.ok(deuH8.ouByLineBrier['3'].ci95[1] >= 0.25, 'DEU-BUNDESLIGA balanced OU 3.0 CI95 upper >= 0.25');
  assert.ok(deuH8.ouBalancedQuarterBinaryNoPushCi95[1] >= 0.25, 'DEU-BUNDESLIGA dynamic balanced OU CI95 upper >= 0.25');
  assert.ok(nedH8.ouByLineBrier['2.5'].ci95[1] < 0.25, 'NED-ERE fixed OU 2.5 CI95 upper < 0.25');
  assert.ok(nedH8.ouByLineBrier['3'].ci95[1] >= 0.25, 'NED-ERE balanced OU 3.0 CI95 upper >= 0.25');
  assert.ok(nedH8.ouBalancedQuarterBinaryNoPushCi95[1] >= 0.25, 'NED-ERE dynamic balanced OU CI95 upper >= 0.25');
});

test('P3.1: evaluateMarketPromotionGates enforces all 8 canonical statuses (including UNTESTED_VS_MARKET) and selects the most restrictive applicable status', () => {
  assert.strictEqual(SHADOW_PROMOTION_MATRIX_STATUSES.length, 8);
  assert.ok(SHADOW_PROMOTION_MATRIX_STATUSES.includes('UNTESTED_VS_MARKET'));

  // 1. Data integrity failure overrides model validation and missing odds
  const dataIntRes = evaluateMarketPromotionGates({
    leagueId: 'SCO-PREM',
    market: 'AH',
    historicalMatchesTotal: 468,
    evalSampleSize: 210,
    maxHistoricalDate: '2026-05-25',
    ratedTeamsCount: 18,
    coldStartTeamsCount: 4,
    unratedTeamsCount: 2,
    chronologicalWalkForwardVerified: true,
    dispersionRatio: 1.01,
    primaryBrier: 0.2403,
    primaryBrierCi95: [0.2297, 0.2503],
    beatsConstant05At95Ci: false,
    logLoss: 0.674,
    calibrationSlope: 1.26,
    isMarketCalibrated: false,
    pinnacleBenchmarkAvailable: false,
    pinnacleBenchmarkMatchedFixtures: 0,
    liveFixturesWithOddsCount: 0,
    quotaAvailable: false,
    smokeTestPassed: false,
  });
  assert.strictEqual(dataIntRes.primaryStatus, 'BLOCKED_DATA_INTEGRITY');
  assert.strictEqual(dataIntRes.shadowValidationEligibility, 'BLOCKED_DATA_INTEGRITY');
  assert.ok(dataIntRes.failingGates.some(g => g.startsWith('DATA_INTEGRITY_')));
  assert.ok(dataIntRes.failingGates.some(g => g.startsWith('INSUFFICIENT_WALK_FORWARD_SAMPLE')));

  // 2. Model validation failure overrides missing odds when data integrity & sample size pass
  const modelValRes = evaluateMarketPromotionGates({
    leagueId: 'ESP-LALIGA',
    market: 'AH',
    historicalMatchesTotal: 1359,
    evalSampleSize: 300,
    maxHistoricalDate: '2026-09-20',
    ratedTeamsCount: 29,
    coldStartTeamsCount: 3,
    unratedTeamsCount: 0,
    chronologicalWalkForwardVerified: true,
    dispersionRatio: 0.9963,
    primaryBrier: 0.2452,
    primaryBrierCi95: [0.2366, 0.2551],
    beatsConstant05At95Ci: false,
    logLoss: 0.6834,
    calibrationSlope: 0.9224,
    isMarketCalibrated: true,
    pinnacleBenchmarkAvailable: false,
    pinnacleBenchmarkMatchedFixtures: 0,
    liveFixturesWithOddsCount: 0,
    quotaAvailable: false,
    smokeTestPassed: false,
  });
  assert.strictEqual(modelValRes.primaryStatus, 'BLOCKED_MODEL_VALIDATION');
  assert.strictEqual(modelValRes.shadowValidationEligibility, 'BLOCKED_MODEL_VALIDATION');

  // 3. Statistical pass (< 0.25 sanity floor) without paired Pinnacle market test resolves to primaryStatus = BLOCKED_MISSING_ODDS and shadowValidationEligibility = UNTESTED_VS_MARKET
  const shadowUntestedRes = evaluateMarketPromotionGates({
    leagueId: 'BEL-PRO',
    market: 'AH',
    historicalMatchesTotal: 1087,
    evalSampleSize: 300,
    maxHistoricalDate: '2026-09-20',
    ratedTeamsCount: 24,
    coldStartTeamsCount: 4,
    unratedTeamsCount: 0,
    chronologicalWalkForwardVerified: true,
    dispersionRatio: 1.0332,
    primaryBrier: 0.2366,
    primaryBrierCi95: [0.2278, 0.2456],
    beatsConstant05At95Ci: true,
    logLoss: 0.6661,
    calibrationSlope: 1.3849,
    isMarketCalibrated: true,
    pinnacleBenchmarkAvailable: false,
    pinnacleBenchmarkMatchedFixtures: 0,
    liveFixturesWithOddsCount: 0,
    quotaAvailable: false,
    smokeTestPassed: false,
  });
  assert.strictEqual(shadowUntestedRes.primaryStatus, 'BLOCKED_MISSING_ODDS');
  assert.strictEqual(shadowUntestedRes.shadowValidationEligibility, 'UNTESTED_VS_MARKET');
  assert.strictEqual(shadowUntestedRes.allPreRegisteredPromotionGatesPass, false);

  // 4. Only when paired Pinnacle market test exists (n >= 300 identical legs, pairedBrierDiffCi95Upper < 0, pairedLogLossDiffCi95Upper < 0) does shadowValidationEligibility become ELIGIBLE_FOR_SHADOW_VALIDATION
  const shadowEligWithMarketTest = evaluateMarketPromotionGates({
    leagueId: 'BEL-PRO',
    market: 'AH',
    historicalMatchesTotal: 1087,
    evalSampleSize: 300,
    maxHistoricalDate: '2026-09-20',
    ratedTeamsCount: 24,
    coldStartTeamsCount: 4,
    unratedTeamsCount: 0,
    chronologicalWalkForwardVerified: true,
    dispersionRatio: 1.0332,
    primaryBrier: 0.2366,
    primaryBrierCi95: [0.2278, 0.2456],
    beatsConstant05At95Ci: true,
    logLoss: 0.6661,
    calibrationSlope: 1.3849,
    isMarketCalibrated: true,
    pinnacleBenchmarkAvailable: true,
    pinnacleBenchmarkMatchedFixtures: 300,
    pinnacleModelBrierOnMatched: 0.221,
    pinnacleMarketBrierOnMatched: 0.228,
    pairedBrierDiffCi95Upper: -0.002,
    pairedLogLossDiffCi95Upper: -0.004,
    liveFixturesWithOddsCount: 0,
    quotaAvailable: false,
    smokeTestPassed: false,
  });
  assert.strictEqual(shadowEligWithMarketTest.primaryStatus, 'BLOCKED_MISSING_ODDS');
  assert.strictEqual(shadowEligWithMarketTest.shadowValidationEligibility, 'ELIGIBLE_FOR_SHADOW_VALIDATION');
});

test('P4.1: MultiLeagueAutoActivator.evaluateAllShadowLeagues() uses H8 binary no-push quarter-line Brier and promotes 0 SHADOW leagues', () => {
  resetRegistryToDefaultState();
  const report = MultiLeagueAutoActivator.evaluateAllShadowLeagues();

  assert.strictEqual(report.promotionMode, 'PROPOSE_ONLY');
  assert.strictEqual(report.totalLeaguesInRegistry, 15);
  assert.strictEqual(report.totalShadowEvaluated, 13);
  assert.deepStrictEqual(report.newlyUnlocked, [], 'Zero SHADOW leagues may be unlocked');
  assert.strictEqual(report.remainedShadow.length, 13, 'All 13 SHADOW leagues must remain SHADOW');

  for (const d of report.decisions) {
    assert.strictEqual(d.finalDecision, 'REMAIN_SHADOW', `${d.leagueCode} must remain SHADOW`);
    assert.strictEqual(d.newStatus, 'SHADOW');

    // Verify H8 binary no-push quarter-line Brier is exposed (around 0.2429-0.2495, never old fractional 0.2002-0.2178)
    const h8Expected = H8_WALKFORWARD_BINARY_NO_PUSH_BY_LEAGUE[d.leagueCode];
    assert.ok(h8Expected, `Missing H8 entry for ${d.leagueCode}`);
    assert.strictEqual(
      d.marketEvaluations.AH.ahBalancedQuarterBinaryNoPushBrier,
      h8Expected.ahBalancedQuarterBinaryNoPushBrier,
      `AH quarter binary no-push Brier mismatch for ${d.leagueCode}`
    );
    assert.ok(
      d.marketEvaluations.AH.ahBalancedQuarterBinaryNoPushBrier >= 0.24,
      `AH quarter binary no-push Brier for ${d.leagueCode} must reflect H8 binary scoring (>= 0.2400)`
    );
    assert.strictEqual(
      d.marketEvaluations.OU.ouEvaluatedLines.length,
      8,
      `OU must expose all 8 evaluated lines for ${d.leagueCode}`
    );
  }

  // Verify the 3 AH markets and 2 OU markets that passed the < 0.25 sanity floor without a paired Pinnacle market test emit UNTESTED_VS_MARKET (not ELIGIBLE_FOR_SHADOW_VALIDATION)
  const byCode = Object.fromEntries(report.decisions.map(d => [d.leagueCode, d]));
  for (const lid of ['BEL-PRO', 'ITA-SERIEA', 'NED-ERE']) {
    assert.strictEqual(byCode[lid].marketEvaluations.AH.promotionMatrixStatus, 'BLOCKED_MISSING_ODDS');
    assert.strictEqual(
      byCode[lid].marketEvaluations.AH.shadowValidationEligibility,
      'UNTESTED_VS_MARKET'
    );
  }
  for (const lid of ['DEU-BUNDESLIGA', 'NED-ERE']) {
    assert.strictEqual(byCode[lid].marketEvaluations.OU.promotionMatrixStatus, 'BLOCKED_MISSING_ODDS');
    assert.strictEqual(
      byCode[lid].marketEvaluations.OU.shadowValidationEligibility,
      'UNTESTED_VS_MARKET'
    );
  }
  for (const lid of ['ESP-LALIGA', 'DEU-BUNDESLIGA', 'FRA-LIGUE1', 'POR-PRIMEIRA', 'USA-MLS', 'SAU-PRO']) {
    assert.strictEqual(byCode[lid].marketEvaluations.AH.promotionMatrixStatus, 'BLOCKED_MODEL_VALIDATION');
  }
  for (const lid of ['SCO-PREM', 'ENG-CHAMP', 'JPN-J1', 'KOR-K1']) {
    assert.strictEqual(byCode[lid].marketEvaluations.AH.promotionMatrixStatus, 'BLOCKED_DATA_INTEGRITY');
    assert.strictEqual(byCode[lid].marketEvaluations.OU.promotionMatrixStatus, 'BLOCKED_DATA_INTEGRITY');
  }
});

test('P5.1: Immutable SHA-256 verification of historical ledgers, canonical ratings artifact, and vercel.json cron containment', () => {
  for (const [relPath, expectedHash] of Object.entries(EXPECTED_HASHES)) {
    const absPath = path.join(process.cwd(), relPath);
    const bytes = fs.readFileSync(absPath);
    const actualHash = crypto.createHash('sha256').update(bytes).digest('hex');
    assert.strictEqual(
      actualHash,
      expectedHash,
      `Immutable artifact ${relPath} SHA-256 hash changed! Expected ${expectedHash}, got ${actualHash}`
    );
  }

  const vercelJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8'));
  assert.deepStrictEqual(vercelJson.crons, [], 'vercel.json crons must remain empty []');
});
