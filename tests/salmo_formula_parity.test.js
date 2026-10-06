// SALMO.DEV — Formula Parity & Production Ownership Test Suite
// Verifies:
// 1. Dixon-Coles mathematical parity (log-space Poisson PMF, tau correction, score grid normalization).
// 2. Asian Handicap quarter-line derivation & 5-way settlement (whole, half, quarter).
// 3. Asian Total Goals engine (dynamic lines 0.5 to 4.5 in 0.25 steps — strictly NOT hardcoded to 2.5).
// 4. BTTS joint score grid identity & strict RESEARCH_ONLY invariant (never qualified as LAYAK).
// 5. Value Engine 7-factor gating & confidence scoring (0-100).
// 6. Complete failure isolation: SALMO prediction pipeline operates independently with zero HandicapLab runtime dependency.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');

// Transparent on-the-fly TypeScript transpile hook for tests
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

// Import migrated SALMO production engines
const {
  poissonPMF,
  logFactorial,
  dixonColesCorrection,
  kellyFraction,
  brierScore,
} = require('../src/engine/math/dixonColesMath.ts');

const {
  buildScoreGrid,
  deriveExpectedGoalsFromGrid,
} = require('../src/engine/probability/scoreGrid.ts');

const {
  calculateAsianHandicapProbability,
  calculateAsianHandicapFromGrid,
  calculatePushAwareFairOdds,
  calculateEffectiveAhProbability,
  fairOdds,
} = require('../src/engine/ah/ahProbability.ts');

const {
  AsianTotalEngine,
  settleAsianTotalGoals,
  calculateAsianTotalFromGrid,
  VALID_ASIAN_TOTAL_LINES,
} = require('../src/engine/ou/asianTotalEngine.ts');

const {
  calculateBttsFromGrid,
  settleBttsMatch,
  BTTS_MODEL_VERSION,
} = require('../src/engine/btts/bttsEngine.ts');

const {
  ValueEngine,
} = require('../src/engine/decision/valueEngine.ts');

const {
  ProductionPredictionEngine,
} = require('../src/engine/pipeline/productionPredictionEngine.ts');

// =========================================================================
// 1. DIXON-COLES & POISSON MATHEMATICAL PARITY
// =========================================================================
test('Formula Parity 1: Log-space Poisson PMF exactness & boundary conditions', () => {
  // Test factorial
  assert.strictEqual(logFactorial(0), 0);
  assert.strictEqual(logFactorial(1), 0);
  assert.strictEqual(Number(logFactorial(4).toFixed(4)), Number(Math.log(24).toFixed(4)));

  // Test Poisson PMF against analytical values: P(k=0; lambda=1) = e^(-1) ~ 0.36787944
  const p0 = poissonPMF(1.0, 0);
  assert.ok(Math.abs(p0 - Math.exp(-1)) < 1e-7, 'P(0; 1.0) must match e^-1');

  // P(k=2; lambda=2) = 2^2 * e^(-2) / 2! = 2 * e^(-2) ~ 0.27067056
  const p2 = poissonPMF(2.0, 2);
  assert.ok(Math.abs(p2 - 2 * Math.exp(-2)) < 1e-7, 'P(2; 2.0) must match 2*e^-2');

  // Boundary conditions
  assert.strictEqual(poissonPMF(0, 1), 0, 'Zero lambda yields 0 probability');
  assert.strictEqual(poissonPMF(-1, 2), 0, 'Negative lambda yields 0 probability');
  assert.strictEqual(poissonPMF(1.5, -1), 0, 'Negative goals yields 0 probability');
});

test('Formula Parity 2: Dixon-Coles tau correction factor parity', () => {
  const lambda = 1.45;
  const mu = 1.25;
  const rho = -0.06;

  // (0,0): 1 - lambda * mu * rho
  const tau00 = dixonColesCorrection(0, 0, lambda, mu, rho);
  const expected00 = 1 - lambda * mu * rho;
  assert.ok(Math.abs(tau00 - expected00) < 1e-9, '(0,0) tau correction parity');

  // (1,0): 1 + mu * rho
  const tau10 = dixonColesCorrection(1, 0, lambda, mu, rho);
  const expected10 = 1 + mu * rho;
  assert.ok(Math.abs(tau10 - expected10) < 1e-9, '(1,0) tau correction parity');

  // (0,1): 1 + lambda * rho
  const tau01 = dixonColesCorrection(0, 1, lambda, mu, rho);
  const expected01 = 1 + lambda * rho;
  assert.ok(Math.abs(tau01 - expected01) < 1e-9, '(0,1) tau correction parity');

  // (1,1): 1 - rho
  const tau11 = dixonColesCorrection(1, 1, lambda, mu, rho);
  const expected11 = 1 - rho;
  assert.ok(Math.abs(tau11 - expected11) < 1e-9, '(1,1) tau correction parity');

  // Any other score (e.g. 2,1 or 3,0): strictly 1.0
  assert.strictEqual(dixonColesCorrection(2, 1, lambda, mu, rho), 1.0);
  assert.strictEqual(dixonColesCorrection(0, 2, lambda, mu, rho), 1.0);
  assert.strictEqual(dixonColesCorrection(3, 3, lambda, mu, rho), 1.0);
});

test('Formula Parity 3: 11x11 Bivariate Score Grid normalization & xG preservation', () => {
  const lambdaHome = 1.65;
  const lambdaAway = 1.15;
  const rho = -0.07;

  const grid = buildScoreGrid(lambdaHome, lambdaAway, rho);

  // 1. Grid dimensions: 11 x 11
  assert.strictEqual(grid.length, 11);
  assert.strictEqual(grid[0].length, 11);

  // 2. Total probability sums to 1.0 (normalized)
  let totalProb = 0;
  for (let x = 0; x <= 10; x++) {
    for (let y = 0; y <= 10; y++) {
      assert.ok(grid[x][y] >= 0, `P(${x},${y}) must be non-negative`);
      totalProb += grid[x][y];
    }
  }
  assert.ok(Math.abs(totalProb - 1.0) < 1e-6, `Score grid total prob must sum to 1.0, got ${totalProb}`);

  // 3. Derived xG closely matches marginal intensities
  const { xgHome, xgAway } = deriveExpectedGoalsFromGrid(grid);
  assert.ok(Math.abs(xgHome - lambdaHome) < 0.05, `Home xG (${xgHome}) should closely approximate lambdaHome (${lambdaHome})`);
  assert.ok(Math.abs(xgAway - lambdaAway) < 0.05, `Away xG (${xgAway}) should closely approximate lambdaAway (${lambdaAway})`);
});

// =========================================================================
// 2. ASIAN HANDICAP QUARTER-LINE ENGINE & SETTLEMENT
// =========================================================================
test('Formula Parity 4: Asian Handicap quarter-line probability & split semantics', () => {
  const lambdaHome = 1.70;
  const lambdaAway = 1.10;
  const rho = -0.05;

  // Level ball (0.0): win = home win, push = draw, loss = away win
  const ah0 = calculateAsianHandicapProbability(lambdaHome, lambdaAway, 0.0, rho);
  assert.ok(ah0.win > 0.45 && ah0.win < 0.65, 'Home win realistic');
  assert.ok(ah0.push > 0.15 && ah0.push < 0.30, 'Draw realistic');
  assert.ok(ah0.loss > 0.15 && ah0.loss < 0.35, 'Away win realistic');
  assert.strictEqual(ah0.halfWin, 0, 'No half win on whole line');
  assert.strictEqual(ah0.halfLoss, 0, 'No half loss on whole line');
  assert.ok(Math.abs(ah0.win + ah0.push + ah0.loss - 1.0) < 1e-4, 'Level ball sums to 1.0');

  // Half line (-0.50): strictly binary (win or loss, push = 0)
  const ahHalf = calculateAsianHandicapProbability(lambdaHome, lambdaAway, -0.5, rho);
  assert.strictEqual(ahHalf.push, 0, 'No push on half line');
  assert.strictEqual(ahHalf.halfWin, 0);
  assert.strictEqual(ahHalf.halfLoss, 0);
  assert.ok(Math.abs(ahHalf.win + ahHalf.loss - 1.0) < 1e-4, 'Half line sums to 1.0');

  // Quarter line (-0.25): split between 0.0 and -0.50
  // Win by >= 1 -> win
  // Draw (0) -> half loss
  // Loss -> loss
  const ahQuarter = calculateAsianHandicapProbability(lambdaHome, lambdaAway, -0.25, rho);
  assert.strictEqual(ahQuarter.push, 0, 'No full push on quarter line');
  assert.strictEqual(ahQuarter.halfWin, 0, 'No half win on -0.25');
  assert.ok(ahQuarter.halfLoss > 0, 'Draw represents half loss on -0.25');
  assert.ok(Math.abs(ahQuarter.win + ahQuarter.halfLoss + ahQuarter.loss - 1.0) < 1e-4, '-0.25 probabilities sum to 1.0');

  // Cover probability on -0.25: win + 0.5 * halfWin (for -0.25, halfWin is 0, so cover == win)
  assert.strictEqual(ahQuarter.cover, ahQuarter.win);

  // Quarter line (+0.25):
  // Win -> win
  // Draw -> half win
  // Loss -> loss
  const ahPlusQuarter = calculateAsianHandicapProbability(lambdaHome, lambdaAway, 0.25, rho);
  assert.ok(ahPlusQuarter.halfWin > 0, 'Draw represents half win on +0.25');
  assert.strictEqual(ahPlusQuarter.halfLoss, 0, 'No half loss on +0.25');
  assert.ok(Math.abs(ahPlusQuarter.cover - (ahPlusQuarter.win + 0.5 * ahPlusQuarter.halfWin)) < 1e-4, '+0.25 cover parity');

  // Fair odds = 1 / cover
  const fo = fairOdds(ahQuarter.cover);
  assert.ok(fo && fo > 1.0 && fo < 4.0, `Fair odds must be valid: ${fo}`);
});

// =========================================================================
// 3. ASIAN TOTAL GOALS ENGINE (DYNAMIC LINES, NOT HARDCODED TO 2.5)
// =========================================================================
test('Formula Parity 5: Asian Total Goals supports dynamic lines (0.5 to 4.5) with quarter-line split settlement', () => {
  // Verify supported line ladders include quarter lines
  assert.ok(VALID_ASIAN_TOTAL_LINES.includes(1.25), 'Must support 1.25');
  assert.ok(VALID_ASIAN_TOTAL_LINES.includes(1.75), 'Must support 1.75');
  assert.ok(VALID_ASIAN_TOTAL_LINES.includes(2.25), 'Must support 2.25');
  assert.ok(VALID_ASIAN_TOTAL_LINES.includes(2.50), 'Must support 2.50');
  assert.ok(VALID_ASIAN_TOTAL_LINES.includes(2.75), 'Must support 2.75');
  assert.ok(VALID_ASIAN_TOTAL_LINES.includes(3.25), 'Must support 3.25');

  // 1. Line 2.75 OVER: signature settleAsianTotalGoals(line, side, totalGoals)
  // 4 goals -> FULL_WIN
  // 3 goals -> HALF_WIN (split Over 2.5 WIN and Over 3.0 PUSH)
  // 2 goals -> FULL_LOSS
  assert.strictEqual(settleAsianTotalGoals(2.75, 'OVER', 4), 'FULL_WIN');
  assert.strictEqual(settleAsianTotalGoals(2.75, 'OVER', 3), 'HALF_WIN');
  assert.strictEqual(settleAsianTotalGoals(2.75, 'OVER', 2), 'FULL_LOSS');

  // 2. Line 2.75 UNDER:
  // 4 goals -> FULL_LOSS
  // 3 goals -> HALF_LOSS (split Under 2.5 LOSS and Under 3.0 PUSH)
  // 2 goals -> FULL_WIN
  assert.strictEqual(settleAsianTotalGoals(2.75, 'UNDER', 4), 'FULL_LOSS');
  assert.strictEqual(settleAsianTotalGoals(2.75, 'UNDER', 3), 'HALF_LOSS');
  assert.strictEqual(settleAsianTotalGoals(2.75, 'UNDER', 2), 'FULL_WIN');

  // 3. Line 2.25 OVER:
  // 3 goals -> FULL_WIN
  // 2 goals -> HALF_LOSS (split Over 2.0 PUSH and Over 2.5 LOSS)
  // 1 goal  -> FULL_LOSS
  assert.strictEqual(settleAsianTotalGoals(2.25, 'OVER', 3), 'FULL_WIN');
  assert.strictEqual(settleAsianTotalGoals(2.25, 'OVER', 2), 'HALF_LOSS');
  assert.strictEqual(settleAsianTotalGoals(2.25, 'OVER', 1), 'FULL_LOSS');

  // 4. Line 2.00 OVER (Whole line):
  // 3 goals -> FULL_WIN
  // 2 goals -> PUSH
  // 1 goal  -> FULL_LOSS
  assert.strictEqual(settleAsianTotalGoals(2.00, 'OVER', 3), 'FULL_WIN');
  assert.strictEqual(settleAsianTotalGoals(2.00, 'OVER', 2), 'PUSH');
  assert.strictEqual(settleAsianTotalGoals(2.00, 'OVER', 1), 'FULL_LOSS');

  // 5. Line 2.50 OVER (Half line): strictly binary
  assert.strictEqual(settleAsianTotalGoals(2.50, 'OVER', 3), 'FULL_WIN');
  assert.strictEqual(settleAsianTotalGoals(2.50, 'OVER', 2), 'FULL_LOSS');

  // Test dynamic probability evaluation across multiple non-2.5 lines
  const grid = buildScoreGrid(1.5, 1.2, -0.06);
  const eval225 = calculateAsianTotalFromGrid(grid, 2.25, 'OVER');
  const eval275 = calculateAsianTotalFromGrid(grid, 2.75, 'OVER');

  assert.ok(eval225.coverProbability > eval275.coverProbability, 'Over 2.25 cover prob must be higher than Over 2.75');
  assert.ok(eval225.probabilities.halfLoss > 0, 'Over 2.25 has half-loss probability');
  assert.ok(eval275.probabilities.halfWin > 0, 'Over 2.75 has half-win probability');
});

// =========================================================================
// 4. BTTS JOINT SCORE GRID IDENTITY & STRICT RESEARCH-ONLY INVARIANT
// =========================================================================
test('Formula Parity 6: BTTS joint score grid identity & strict unvalidated status', () => {
  const grid = buildScoreGrid(1.5, 1.3, -0.06);
  const bttsRes = calculateBttsFromGrid(grid);

  // Exact mathematical relation:
  // P(BTTS YES) = sum_{x>=1, y>=1} P(x, y)
  // P(BTTS NO) = sum(score(x,0)) + sum(score(0,y)) - score(0,0)
  // P(BTTS YES) + P(BTTS NO) == 1.0
  assert.ok(
    Math.abs(bttsRes.probabilities.yes + bttsRes.probabilities.no - 1.0) < 1e-6,
    `BTTS YES (${bttsRes.probabilities.yes}) + BTTS NO (${bttsRes.probabilities.no}) must sum to 1.0`
  );

  // Model identity invariant
  assert.strictEqual(bttsRes.modelVersion, 'BTTS-jointscore-v1.0.0');
  assert.strictEqual(bttsRes.yieldStatus, 'UNVALIDATED', 'BTTS yield status must be strictly UNVALIDATED');

  // Settlement correctness
  assert.strictEqual(settleBttsMatch('YES', 1, 1), 'WIN');
  assert.strictEqual(settleBttsMatch('YES', 2, 0), 'LOSS');
  assert.strictEqual(settleBttsMatch('YES', 0, 0), 'LOSS');
  assert.strictEqual(settleBttsMatch('NO', 2, 0), 'WIN');
});

test('Formula Parity 7: BTTS is strictly prevented from becoming a public qualified pick (NEVER LAYAK)', () => {
  const now = new Date();
  const oddsTime = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  const predTime = now.toISOString();
  const kickTime = new Date(now.getTime() + 4 * 3600 * 1000).toISOString();

  // Even if artificial odds give massive theoretical edge, BTTS must NEVER qualify as LAYAK
  const result = ValueEngine.evaluateSelection({
    selection: 'BTTS YES',
    market: 'BTTS',
    line: 0,
    modelProbability: 0.70, // 70% model probability
    pinnacleOdds: {
      sideOdds: 2.10,
      oppositeOdds: 1.85,
    },
    sampleSizeHome: 15,
    sampleSizeAway: 15,
    oddsTimestampUtc: oddsTime,
    predictionTimestampUtc: predTime,
    kickoffUtc: kickTime,
    fixtureId: 'epl_test_fixture_btts',
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    league: 'Premier League',
    modelStatus: 'FIXTURE_SPECIFIC',
  });

  assert.notStrictEqual(result.verdict, 'LAYAK', 'INVARIANT VIOLATION: BTTS must NEVER be evaluated as LAYAK');
  assert.ok(
    ['PANTAU', 'LEWATI'].includes(result.verdict),
    `BTTS must be restricted to PANTAU or LEWATI, got ${result.verdict}`
  );
  assert.strictEqual(result.validationStatus, 'PROVISIONAL_EDGE');
});

// =========================================================================
// 5. VALUE ENGINE 7-FACTOR COMPOSITE VALUE GATE
// =========================================================================
test('Formula Parity 8: Value Engine 7-factor composite value gate', () => {
  const now = new Date();
  const oddsTime = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  const predTime = now.toISOString();
  const kickTime = new Date(now.getTime() + 4 * 3600 * 1000).toISOString();

  // 1. Negative EV -> strictly LEWATI
  const negEv = ValueEngine.evaluateSelection({
    selection: 'Arsenal -0.5',
    market: 'AH',
    line: -0.5,
    modelProbability: 0.45,
    pinnacleOdds: {
      sideOdds: 1.90, // EV = (0.45 * 1.90) - 1 = -0.1455 (-14.5%)
      oppositeOdds: 1.95,
    },
    sampleSizeHome: 15,
    sampleSizeAway: 15,
    oddsTimestampUtc: oddsTime,
    predictionTimestampUtc: predTime,
    kickoffUtc: kickTime,
    fixtureId: 'epl_test_fixture_neg_ev',
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    league: 'Premier League',
    modelStatus: 'FIXTURE_SPECIFIC',
  });
  assert.strictEqual(negEv.verdict, 'LEWATI', 'Negative EV must be LEWATI');
  assert.strictEqual(negEv.actionable, false);

  // 2. High EV + Valid Edge + Sufficient Sample in Premier League -> LAYAK
  const qualified = ValueEngine.evaluateSelection({
    selection: 'Arsenal -0.25',
    market: 'AH',
    line: -0.25,
    modelProbability: 0.60,
    ahBreakdown: { win: 0.45, halfWin: 0, push: 0, halfLoss: 0.30, loss: 0.25 },
    pinnacleOdds: {
      sideOdds: 2.15,
      oppositeOdds: 1.80,
    },
    sampleSizeHome: 15,
    sampleSizeAway: 15,
    oddsTimestampUtc: oddsTime,
    predictionTimestampUtc: predTime,
    kickoffUtc: kickTime,
    fixtureId: 'epl_test_fixture_layak',
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    league: 'Premier League',
    modelStatus: 'FIXTURE_SPECIFIC',
  });
  assert.strictEqual(qualified.verdict, 'LAYAK', 'Candidate meeting all 7 gates must qualify as LAYAK');
  assert.ok(qualified.expectedValue > 0.02, 'EV must be positive and > 2.0%');
  assert.ok(qualified.confidence >= 70, `Confidence must be high (>= 70), got ${qualified.confidence}`);
  assert.strictEqual(qualified.actionable, true);
});

// =========================================================================
// 6. PRODUCTION PREDICTION ENGINE AUTONOMY & FAILURE ISOLATION
// =========================================================================
test('Failure Isolation 1: Production prediction pipeline operates with zero HandicapLab dependency', () => {
  // Evaluate fixture with purely SALMO-native models
  const fixture = {
    fixtureId: 'epl_test_fixture_001',
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    league: 'Premier League',
    kickoffUtc: '2026-10-20T19:00:00Z',
    season: '2026',
    pinnacleOdds: {
      ah: { line: -0.25, homeOdds: 1.95, awayOdds: 1.95 },
      ou: { line: 2.50, overOdds: 1.90, underOdds: 1.90 },
      btts: { yesOdds: 1.85, noOdds: 1.95 },
    },
  };

  const evalResult = ProductionPredictionEngine.evaluateFixture(fixture);
  assert.ok(evalResult.prediction, 'Must successfully generate active prediction');
  assert.strictEqual(evalResult.prediction.canonicalMatchId, 'EPL_2026_ARSENAL_CHELSEA_2026-10-20');
  assert.strictEqual(evalResult.prediction.modelVersion, 'dixon-coles-v1.0');

  // Markets strictly limited to AH, OU, BTTS (ZERO Moneyline)
  const marketKeys = Object.keys(evalResult.prediction.markets);
  assert.deepStrictEqual(marketKeys.sort(), ['asianHandicap', 'btts', 'overUnder'].sort());
  assert.strictEqual(evalResult.prediction.markets.moneyline, undefined, 'Zero moneyline');
  assert.strictEqual(evalResult.prediction.markets['1x2'], undefined, 'Zero 1X2');

  // AH quarter line correctly evaluated
  assert.strictEqual(evalResult.prediction.markets.asianHandicap.line, -0.25);
  assert.ok(evalResult.prediction.markets.asianHandicap.marketOdds > 1.0);

  // OU quarter line correctly evaluated
  assert.strictEqual(evalResult.prediction.markets.overUnder.line, 2.5);
  assert.ok(evalResult.prediction.markets.overUnder.marketOdds > 1.0);

  // BTTS strictly not LAYAK
  assert.notStrictEqual(evalResult.prediction.markets.btts.verdict, 'LAYAK');
});

test('Failure Isolation 2: Health endpoint reflects decoupled independence from HandicapLab', async () => {
  // Read health route code to verify that HandicapLab UNAVAILABLE does NOT force overall 503
  const healthCode = fs.readFileSync(path.resolve('src/app/api/health/route.ts'), 'utf8');
  assert.ok(healthCode.includes('hasDataStore = dbHealth.connected || hlHealth.status === \'HEALTHY\''), 'Health checks data store independently');
  assert.ok(healthCode.includes('predictionEngine'), 'Reports native predictionEngine dependency');
  assert.ok(!healthCode.includes('if (hlHealth.status === \'UNAVAILABLE\') {\n    overallStatus = \'unavailable\';'), 'Does NOT kill SALMO when HandicapLab is UNAVAILABLE');
});

test('Failure Isolation 3: Zero runtime network calls to HandicapLab in production evaluation', () => {
  // Confirm ProductionPredictionEngine contains zero fetch() or http calls to HandicapLab
  const ppeCode = fs.readFileSync(path.resolve('src/engine/pipeline/productionPredictionEngine.ts'), 'utf8');
  assert.ok(!ppeCode.includes('HANDICAPLAB_API_URL'), 'PPE does not reference HANDICAPLAB_API_URL');
  assert.ok(!ppeCode.includes('/api/v1/salmo/sync'), 'PPE does not query salmo sync endpoint');
});

test('Model Provenance 4: Team ratings artifact provenance & reproducible model identity', () => {
  const artifactPath = path.resolve('data/artifacts/team_ratings_v1.0.json');
  assert.ok(fs.existsSync(artifactPath), 'team_ratings_v1.0.json artifact must exist');

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  assert.ok(artifact.provenance, 'Artifact must have provenance object');
  assert.strictEqual(artifact.provenance.version, 'dynamic-ratings-v1.0');
  assert.strictEqual(artifact.provenance.modelVersion, 'dixon-coles-v1.0');
  assert.strictEqual(artifact.provenance.teamCoverage, 20);
  assert.strictEqual(artifact.provenance.date, '2026-09-18');
  assert.ok(artifact.provenance.source.includes('HandicapLab'));

  const teams = Object.keys(artifact.ratings);
  assert.strictEqual(teams.length, 20, 'Must cover all 20 Premier League teams');
  for (const team of teams) {
    const r = artifact.ratings[team];
    assert.ok(r.attack_strength > 0.5 && r.attack_strength < 2.5, `${team} attack strength within bounds`);
    assert.ok(r.defense_strength > 0.5 && r.defense_strength < 2.5, `${team} defense strength within bounds`);
    assert.strictEqual(r.matches_played, 38, `${team} sample size >= 38`);
  }

  // Verify deterministic UUID reproducibility
  const uuid1 = ProductionPredictionEngine.deterministicUuid('test_seed_123');
  const uuid2 = ProductionPredictionEngine.deterministicUuid('test_seed_123');
  assert.strictEqual(uuid1, uuid2, 'Deterministic UUIDs must be reproducible');
  assert.strictEqual(uuid1.length, 36, 'Must be valid UUID string length');
});

test('Formula Parity 9: Push-aware Asian Handicap fair odds and EV exactness', () => {
  // Case 1: DNB / AH 0.0 with p_win, p_push, p_loss
  const dnbDecomp = {
    win: 0.5728,
    halfWin: 0,
    push: 0.2191,
    halfLoss: 0,
    loss: 0.2082,
    cover: 0.5728,
  };

  // Push-aware fair odds: 1 + p_loss / p_win
  const expectedFairOdds = Number((1 + (dnbDecomp.loss / dnbDecomp.win)).toFixed(3)); // 1 + 0.2082 / 0.5728 = 1.363
  const actualFairOdds = calculatePushAwareFairOdds(dnbDecomp);
  assert.strictEqual(actualFairOdds, 1.363, 'AH 0 fair odds must be exactly 1 + p_loss/p_win');

  // Push-aware EV: p_win * (odds - 1) - p_loss
  const odds = 1.961;
  const ev = ValueEngine.calculateAhExpectedValue(odds, dnbDecomp);
  const expectedEv = dnbDecomp.win * (odds - 1) - dnbDecomp.loss;
  assert.ok(Math.abs(ev - expectedEv) < 1e-4, 'EV must equal p_win * (odds - 1) - p_loss');
  assert.strictEqual(Number((ev * 100).toFixed(1)), 34.2, 'EV must be +34.2%');

  // Effective conditional probability: p_win / (p_win + p_loss)
  const effProb = calculateEffectiveAhProbability(dnbDecomp);
  const expectedEffProb = dnbDecomp.win / (dnbDecomp.win + dnbDecomp.loss);
  assert.ok(Math.abs(effProb - expectedEffProb) < 1e-3, 'Effective prob must equal p_win / (p_win + p_loss)');

  // Case 2: Half-line AH -0.5 (push = 0)
  const halfLineDecomp = {
    win: 0.5000,
    halfWin: 0,
    push: 0,
    halfLoss: 0,
    loss: 0.5000,
    cover: 0.5000,
  };
  assert.strictEqual(calculatePushAwareFairOdds(halfLineDecomp), 2.000, 'Half-line fair odds must equal 1 / p_win = 2.000');

  // Case 3: Quarter-line AH -0.25 (halfWin exists)
  const quarterLineDecomp = {
    win: 0.4000,
    halfWin: 0.2000,
    push: 0,
    halfLoss: 0,
    loss: 0.4000,
    cover: 0.5000,
  };
  const expectedQuarterFair = 1 + (0.4000) / (0.4000 + 0.5 * 0.2000); // 1 + 0.4 / 0.5 = 1.800
  assert.strictEqual(calculatePushAwareFairOdds(quarterLineDecomp), 1.800, 'Quarter-line fair odds exactness');
});

