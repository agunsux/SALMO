// SALMO.DEV — Hotfix H8 Regression Test Suite: Metric Integrity
// Strictly validates all 5 mandatory deliverables of Hotfix H8:
// 1. Binary no-push per-leg Brier scoring (quarter-lines decomposed into two half-stake legs, each scored against its own leg probability from the 11x11 Dixon-Coles score grid; push legs excluded; applied in /api/v1/research and /api/v1/performance).
// 2. Green cohort strict gating (`is_pick === true && verdict === 'LAYAK'`, removing `confidence > 70` fallback) and `MODEL_ALL_ROWS_DIAGNOSTIC (NOT PUBLIC PICKS)` labeling.
// 3. Read-only 15-league walk-forward backtest Brier recompute (SHA-256 immutability of `multi_league_team_ratings_v1.0.json`, 11 promotion-gate flips, and strict chronological proof `max(t_train) < t_eval` across all 4,018 evaluated matches).
// 4. Root-cause verification of the 4-fixture EPL probability mismatch between `live_prediction_ledger.jsonl` and `all_leagues_research_ledger.jsonl` (without mutating either ledger).
// 5. Incident log entries (`INC-H8-01` and `INC-H8-02` in `docs/INCIDENT_LOG_H8.md`).

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
  evaluatePositionBrierLegs,
  resolveFixtureScoreGrid,
} = require('../src/engine/performance/brierScoring.ts');
const {
  PerformanceMetricsEngine,
  isQualifiedPublicPickCohort,
  DIAGNOSTIC_ALL_ROWS_COHORT_LABEL,
  QUALIFIED_PUBLIC_PICKS_COHORT_LABEL,
} = require('../src/engine/performance/performanceMetrics.ts');
const { CANONICAL_EPL_RATINGS } = require('../src/engine/features/teamRatings.ts');
const { GET: getResearch } = require('../src/app/api/v1/research/route.ts');
const { GET: getPerformance } = require('../src/app/api/v1/performance/route.ts');
const {
  runReadOnlyH8BacktestRecompute,
} = require('../scripts/recompute_h8_walkforward_backtest_readonly.js');

// ─── DELIVERABLE 1: BINARY NO-PUSH PER-LEG BRIER SCORING ─────────────────────

test('H8.1: Quarter-line AH and OU positions decompose into two half-stake legs, each scored with its own 11x11 grid conditional non-push win probability, and push legs are excluded', () => {
  // Case A: Arsenal -1.25 vs Leeds (FT 2-1, margin +1)
  // Leg 1: -1.5 (margin +1 - 1.5 = -0.5 -> LOSS, binaryOutcome = 0)
  // Leg 2: -1.0 (margin +1 - 1.0 = 0.0 -> PUSH, excludedPush = true, binaryOutcome = null, brierSqError = null)
  const arsenalAh = evaluatePositionBrierLegs({
    positionId: 'test_arsenal_ah',
    fixtureId: '1557417',
    league: 'Premier League',
    homeTeam: 'Arsenal',
    awayTeam: 'Leeds',
    marketType: 'AH',
    selection: 'Arsenal -1.25',
    line: -1.25,
    homeGoals: 2,
    awayGoals: 1,
  });

  assert.strictEqual(arsenalAh.isQuarterLine, true);
  assert.strictEqual(arsenalAh.legs.length, 2);
  assert.strictEqual(arsenalAh.resolvedLegCount, 1, 'Only 1 leg resolves; -1.0 leg pushes and must be excluded');
  assert.strictEqual(arsenalAh.excludedPushLegCount, 1, 'Leg -1.0 must be excluded as push');

  const legMinus15 = arsenalAh.legs.find(l => l.legLine === -1.5);
  const legMinus10 = arsenalAh.legs.find(l => l.legLine === -1.0);
  assert.ok(legMinus15 && legMinus10);
  assert.strictEqual(legMinus15.stakeWeight, 0.5);
  assert.strictEqual(legMinus15.excludedPush, false);
  assert.strictEqual(legMinus15.binaryOutcome, 0);
  assert.strictEqual(legMinus15.pLegNoPush, 0.3273);
  assert.strictEqual(legMinus15.brierSqError, Number(Math.pow(0.3273, 2).toFixed(6)));

  assert.strictEqual(legMinus10.stakeWeight, 0.5);
  assert.strictEqual(legMinus10.excludedPush, true);
  assert.strictEqual(legMinus10.pLegNoPush, 0.4376);
  assert.strictEqual(legMinus10.binaryOutcome, null);
  assert.strictEqual(legMinus10.brierSqError, null);
  // Verify distinct leg probabilities from the 11x11 grid
  assert.notStrictEqual(legMinus15.pLegNoPush, legMinus10.pLegNoPush, 'Each leg must have its own distinct probability from the 11x11 grid');

  // Case B: Ipswich vs Fulham Over 2.75 (FT 2-1, total = 3)
  // Leg 1: Over 2.5 (total 3 > 2.5 -> WIN, binaryOutcome = 1)
  // Leg 2: Over 3.0 (total 3 == 3.0 -> PUSH, excludedPush = true)
  const ipswichOu = evaluatePositionBrierLegs({
    positionId: 'test_ipswich_ou',
    fixtureId: '1557423',
    league: 'Premier League',
    homeTeam: 'Ipswich',
    awayTeam: 'Fulham',
    marketType: 'OU',
    selection: 'Over 2.75',
    line: 2.75,
    homeGoals: 2,
    awayGoals: 1,
  });

  assert.strictEqual(ipswichOu.isQuarterLine, true);
  assert.strictEqual(ipswichOu.legs.length, 2);
  assert.strictEqual(ipswichOu.resolvedLegCount, 1);
  assert.strictEqual(ipswichOu.excludedPushLegCount, 1);

  const legOver25 = ipswichOu.legs.find(l => l.legLine === 2.5);
  const legOver30 = ipswichOu.legs.find(l => l.legLine === 3.0);
  assert.strictEqual(legOver25.excludedPush, false);
  assert.strictEqual(legOver25.binaryOutcome, 1);
  assert.strictEqual(legOver25.pLegNoPush, 0.5575);
  assert.strictEqual(legOver30.excludedPush, true);
  assert.strictEqual(legOver30.binaryOutcome, null);
  assert.strictEqual(legOver30.brierSqError, null);

  // Case C: Aston Villa 0 vs Brentford (FT 2-2, margin 0) -> single whole-line leg that pushes
  const villaAh = evaluatePositionBrierLegs({
    positionId: 'test_villa_ah',
    fixtureId: '1557418',
    league: 'Premier League',
    homeTeam: 'Aston Villa',
    awayTeam: 'Brentford',
    marketType: 'AH',
    selection: 'Aston Villa 0',
    line: 0,
    homeGoals: 2,
    awayGoals: 2,
  });
  assert.strictEqual(villaAh.isQuarterLine, false);
  assert.strictEqual(villaAh.legs.length, 1);
  assert.strictEqual(villaAh.resolvedLegCount, 0);
  assert.strictEqual(villaAh.excludedPushLegCount, 1);
  assert.strictEqual(villaAh.positionBrierMean, null);
});

test('H8.2: /api/v1/research and /api/v1/performance report identical binary no-push per-leg Brier across the 12 settled EPL positions (21 total legs, 3 push legs excluded, 18 resolved legs, Brier = 0.2372)', async () => {
  const resReq = {
    headers: new Map([['x-request-id', 'test_h8_research']]),
    url: 'http://localhost:3000/api/v1/research',
  };
  const resResponse = await getResearch(resReq);
  const resJson = await resResponse.json();

  assert.strictEqual(resJson.success, true);
  const eplRow = resJson.metricComputabilityMatrix.find(m => m.league === 'Premier League');
  assert.ok(eplRow, 'Premier League entry must exist in metricComputabilityMatrix');
  assert.strictEqual(eplRow.brierScoringMethod, 'BINARY_NO_PUSH_PER_LEG');
  assert.strictEqual(eplRow.yieldCohortLabel, DIAGNOSTIC_ALL_ROWS_COHORT_LABEL);
  assert.strictEqual(eplRow.nBrierLegsTotal, 21);
  assert.strictEqual(eplRow.nBrierLegsResolved, 18);
  assert.strictEqual(eplRow.nBrierLegsExcludedPush, 3);
  assert.strictEqual(eplRow.bootstrap95CI.brier.n, 18);
  assert.strictEqual(eplRow.bootstrap95CI.brier.mean, 0.2372);
  assert.strictEqual(eplRow.brierStakeWeighted, 0.2449);

  // Verify no resolved leg in any prediction has a fractional outcome (0.25, 0.5, 0.75)
  const settledPreds = resJson.predictions.filter(p => p.scoreVerified);
  assert.strictEqual(settledPreds.length, 12);
  let resolvedLegsCheck = 0;
  let pushLegsCheck = 0;
  for (const p of settledPreds) {
    for (const leg of p.brierLegs) {
      if (leg.excludedPush) {
        pushLegsCheck++;
        assert.strictEqual(leg.binaryOutcome, null);
        assert.strictEqual(leg.brierSqError, null);
      } else {
        resolvedLegsCheck++;
        assert.ok(leg.binaryOutcome === 0 || leg.binaryOutcome === 1, 'Binary outcome must be strictly 0 or 1');
      }
    }
  }
  assert.strictEqual(resolvedLegsCheck, 18);
  assert.strictEqual(pushLegsCheck, 3);

  // Check /api/v1/performance
  const perfReq = {
    headers: new Map([['x-request-id', 'test_h8_perf']]),
  };
  const perfResponse = await getPerformance(perfReq);
  const perfJson = await perfResponse.json();

  assert.strictEqual(perfJson.success, true);
  assert.strictEqual(perfJson.report.controlFullCohort.cohortLabel, DIAGNOSTIC_ALL_ROWS_COHORT_LABEL);
  assert.strictEqual(perfJson.report.headlineGreenCohort.cohortLabel, QUALIFIED_PUBLIC_PICKS_COHORT_LABEL);
  assert.strictEqual(perfJson.report.controlFullCohort.nBrierLegsTotal, 21);
  assert.strictEqual(perfJson.report.controlFullCohort.nBrierLegsResolved, 18);
  assert.strictEqual(perfJson.report.controlFullCohort.nBrierLegsExcludedPush, 3);
  assert.strictEqual(perfJson.report.controlFullCohort.brierScore, 0.2372);
  assert.strictEqual(perfJson.report.controlFullCohort.brierStakeWeighted, 0.2449);
});

// ─── DELIVERABLE 2: GREEN COHORT & DIAGNOSTIC ALL-ROWS LABELING ──────────────

test('H8.3: Green cohort strictly requires is_pick === true && verdict === LAYAK; confidence > 70 fallback is removed', async () => {
  // 1. High confidence (75) + LEWATI + is_pick=true -> MUST BE FALSE (Liverpool FC 0 case)
  assert.strictEqual(
    isQualifiedPublicPickCohort({ is_pick: true, verdict: 'LEWATI', confidence: 75 }),
    false,
    'LEWATI row with confidence > 70 must NEVER enter greenCohort'
  );

  // 2. High confidence (82) + LAYAK + is_pick=false -> MUST BE FALSE (unqualified research/archive row)
  assert.strictEqual(
    isQualifiedPublicPickCohort({ is_pick: false, verdict: 'LAYAK', confidence: 82 }),
    false,
    'Row with is_pick=false must NEVER enter greenCohort even if verdict === LAYAK'
  );

  // 3. High confidence (82) + LAYAK + is_pick=undefined -> MUST BE FALSE
  assert.strictEqual(
    isQualifiedPublicPickCohort({ is_pick: undefined, verdict: 'LAYAK', confidence: 82 }),
    false,
    'Row with undefined is_pick must NEVER enter greenCohort'
  );

  // 4. is_pick === true && verdict === 'LAYAK' -> TRUE
  assert.strictEqual(
    isQualifiedPublicPickCohort({ is_pick: true, verdict: 'LAYAK', confidence: 76 }),
    true,
    'Row with is_pick === true && verdict === LAYAK must qualify for greenCohort'
  );

  // 5. Verify /api/v1/performance on live_prediction_ledger.jsonl has 0 greenCohort positions (since /api/daily-picks is NO_QUALIFIED_PICKS and no row has is_pick === true)
  const perfReq = {
    headers: new Map([['x-request-id', 'test_h8_green_cohort']]),
  };
  const perfResponse = await getPerformance(perfReq);
  const perfJson = await perfResponse.json();

  assert.strictEqual(perfJson.report.headlineGreenCohort.n, 0, 'Headline green cohort settled count must be 0 when no row has is_pick === true && verdict === LAYAK');
  assert.strictEqual(perfJson.report.headlineGreenCohort.pending, 0, 'Headline green cohort pending count must be 0 (Liverpool FC 0 with confidence=75 and verdict=LEWATI must be excluded)');
  assert.strictEqual(perfJson.report.controlFullCohort.cohortLabel, 'MODEL_ALL_ROWS_DIAGNOSTIC (NOT PUBLIC PICKS)');
});

// ─── DELIVERABLE 3: READ-ONLY 15-LEAGUE WALK-FORWARD BACKTEST RECOMPUTE ──────

test('H8.4: Read-only 15-league walk-forward backtest recompute preserves multi_league_team_ratings_v1.0.json byte-for-byte, proves t_train < t_eval across all 4,018 evaluated matches, and identifies 11 AH quarter-line promotion-gate flips', () => {
  const artifactPath = path.resolve(process.cwd(), 'data/artifacts/multi_league_team_ratings_v1.0.json');
  const shaBefore = crypto.createHash('sha256').update(fs.readFileSync(artifactPath)).digest('hex');

  const report = runReadOnlyH8BacktestRecompute({ writeReportFile: false });

  const shaAfter = crypto.createHash('sha256').update(fs.readFileSync(artifactPath)).digest('hex');
  assert.strictEqual(shaBefore, shaAfter, 'multi_league_team_ratings_v1.0.json must not be mutated');
  assert.strictEqual(report.readOnlyInvariant.mutated, false);

  // Verify strict chronological walk-forward proof across all 14 leagues with data (4,018 evaluated matches)
  assert.strictEqual(report.chronologicalWalkForwardGlobalProof.totalLeaguesWithData, 14);
  assert.strictEqual(report.chronologicalWalkForwardGlobalProof.totalEvaluatedMatches, 4018);
  assert.strictEqual(report.chronologicalWalkForwardGlobalProof.totalChronologicalViolations, 0);
  assert.strictEqual(report.chronologicalWalkForwardGlobalProof.allMatchesStrictlyPriorVerified, true);

  // Verify every league with data moved from artificial 0.2002-0.2178 fractional quarter-line Brier to 0.2406-0.2495 binary no-push leg Brier
  for (const [lid, r] of Object.entries(report.perLeagueResults)) {
    if (lid === 'IDN-L1') {
      assert.strictEqual(r.nEvalMatches, 0);
      continue;
    }
    assert.strictEqual(r.chronologicalProof.strictOrderingVerified, true, `${lid} must have 0 chronological violations`);
    assert.ok(r.ah.oldBalancedQuarterFractional.brier >= 0.2000 && r.ah.oldBalancedQuarterFractional.brier <= 0.2180);
    assert.ok(
      r.ah.newBalancedQuarterBinaryNoPushPerLeg.brierUnweightedLegMean >= 0.2400 &&
        r.ah.newBalancedQuarterBinaryNoPushPerLeg.brierUnweightedLegMean <= 0.2500,
      `${lid} new binary no-push leg Brier must be in [0.2400, 0.2500], got ${r.ah.newBalancedQuarterBinaryNoPushPerLeg.brierUnweightedLegMean}`
    );
    assert.ok(r.ah.newBalancedQuarterBinaryNoPushPerLeg.nLegsExcludedPush > 0, `${lid} must exclude push legs`);
  }

  // Verify 11 of 14 leagues flip from PASS (ci95Upper < 0.2500) to FAIL (ci95Upper >= 0.2500) on balanced quarter-line AH
  assert.strictEqual(report.promotionGateFlipSummary.totalQuarterLineAhFlips, 11);
});

// ─── DELIVERABLE 4: EPL PROBABILITY MISMATCH ROOT-CAUSE VERIFICATION ─────────

test('H8.5: EPL probability mismatch between live_prediction_ledger.jsonl and all_leagues_research_ledger.jsonl is isolated to the exact 4 fixtures involving clubs missing from CANONICAL_EPL_RATINGS (Leeds, Sunderland, Hull, Coventry)', () => {
  const liveLines = fs
    .readFileSync(path.resolve(process.cwd(), 'data/verification/live_prediction_ledger.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse)
    .filter(r => r.market === 'AH' || r.market === 'OU');

  const allLines = fs
    .readFileSync(path.resolve(process.cwd(), 'data/verification/all_leagues_research_ledger.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse)
    .filter(r => r.league === 'Premier League');

  assert.strictEqual(liveLines.length, 20);
  assert.strictEqual(allLines.length, 20);

  const identicalRows = [];
  const mismatchedRows = [];

  for (const aRow of allLines) {
    const lRow = liveLines.find(
      l => String(l.providerProvenance?.apiFootballFixtureId) === String(aRow.fixtureId) && l.market === aRow.market
    );
    assert.ok(lRow, `Matching live ledger row must exist for fixture ${aRow.fixtureId} ${aRow.market}`);
    if (lRow.modelProbability === aRow.modelProbability && lRow.fairOdds === aRow.fairOdds) {
      identicalRows.push({ fixtureId: aRow.fixtureId, homeTeam: aRow.homeTeam, awayTeam: aRow.awayTeam, market: aRow.market });
    } else {
      mismatchedRows.push({
        fixtureId: aRow.fixtureId,
        homeTeam: aRow.homeTeam,
        awayTeam: aRow.awayTeam,
        market: aRow.market,
        liveProb: lRow.modelProbability,
        allLeaguesProb: aRow.modelProbability,
      });
    }
  }

  assert.strictEqual(identicalRows.length, 12, 'Exactly 6 fixtures (12 AH/OU rows) must have identical probabilities');
  assert.strictEqual(mismatchedRows.length, 8, 'Exactly 4 fixtures (8 AH/OU rows) must differ');

  // Verify that for every identical fixture, BOTH teams exist in CANONICAL_EPL_RATINGS,
  // and for every mismatched fixture, at least one team is missing from CANONICAL_EPL_RATINGS
  for (const row of identicalRows) {
    const hasHome = Boolean(CANONICAL_EPL_RATINGS[row.homeTeam]);
    const hasAway = Boolean(CANONICAL_EPL_RATINGS[row.awayTeam]);
    assert.strictEqual(hasHome && hasAway, true, `Identical fixture ${row.homeTeam} vs ${row.awayTeam} must have both teams in CANONICAL_EPL_RATINGS`);
  }

  for (const row of mismatchedRows) {
    const hasHome = Boolean(CANONICAL_EPL_RATINGS[row.homeTeam]);
    const hasAway = Boolean(CANONICAL_EPL_RATINGS[row.awayTeam]);
    assert.strictEqual(
      hasHome && hasAway,
      false,
      `Mismatched fixture ${row.homeTeam} vs ${row.awayTeam} must be missing a club from CANONICAL_EPL_RATINGS`
    );
  }
});

// ─── DELIVERABLE 5: INCIDENT LOG ENTRIES ─────────────────────────────────────

test('H8.6: Incident log entries INC-H8-01 and INC-H8-02 exist in docs/INCIDENT_LOG_H8.md', () => {
  const incidentPath = path.resolve(process.cwd(), 'docs/INCIDENT_LOG_H8.md');
  assert.strictEqual(fs.existsSync(incidentPath), true, 'docs/INCIDENT_LOG_H8.md must exist');
  const content = fs.readFileSync(incidentPath, 'utf8');
  assert.ok(content.includes('INC-H8-01'), 'Must contain INC-H8-01');
  assert.ok(content.includes('0.2189 [0.097, 0.349]'), 'Must document hand-typed 0.2189 [0.097, 0.349] transcription error');
  assert.ok(content.includes('0.2074'), 'Must document actual 0.2074 code output');
  assert.ok(content.includes('INC-H8-02'), 'Must contain INC-H8-02');
  assert.ok(content.includes('HALF_WIN=0.75'), 'Must document fractional Brier artifact');
});

test('H8.7: Brier & PerformanceMetricsEngine edge-case guards (wins, losses, pushes, half lines, quarter lines, missing/invalid probabilities, duplicate legs/positions, empty samples)', () => {
  // 1. Half-line WIN and LOSS
  const halfLineWin = evaluatePositionBrierLegs({
    positionId: 'edge_half_win',
    marketType: 'OU',
    selection: 'Over 2.5',
    line: 2.5,
    homeGoals: 2,
    awayGoals: 1,
    lambdaHome: 1.5,
    lambdaAway: 1.2,
  });
  assert.strictEqual(halfLineWin.isQuarterLine, false);
  assert.strictEqual(halfLineWin.nTotalLegs, 1);
  assert.strictEqual(halfLineWin.nResolvedLegs, 1);
  assert.strictEqual(halfLineWin.legs[0].legOutcome, 'WIN');
  assert.strictEqual(halfLineWin.legs[0].binaryOutcome, 1);

  const halfLineLoss = evaluatePositionBrierLegs({
    positionId: 'edge_half_loss',
    marketType: 'OU',
    selection: 'Over 2.5',
    line: 2.5,
    homeGoals: 1,
    awayGoals: 0,
    lambdaHome: 1.5,
    lambdaAway: 1.2,
  });
  assert.strictEqual(halfLineLoss.legs[0].legOutcome, 'LOSS');
  assert.strictEqual(halfLineLoss.legs[0].binaryOutcome, 0);

  // 2. Missing probability on zero-mass grid must NOT fabricate 0.5 coin-flip Brier
  const missingProbZeroGrid = evaluatePositionBrierLegs({
    positionId: 'edge_missing_prob',
    marketType: 'AH',
    selection: 'Home -0.5',
    line: -0.5,
    homeGoals: 2,
    awayGoals: 0,
    scoreGrid: [[0, 0], [0, 0]],
    fallbackModelProbDecimal: null,
  });
  assert.strictEqual(missingProbZeroGrid, null, 'Zero-mass grid with missing fallback probability must return null instead of 0.5 coin-flip');

  // 3. Invalid probabilities (NaN, <= 0, >= 1 decimal, >= 100 pct) must be rejected
  for (const invalidDecimal of [NaN, -0.25, 0, 1, 1.35, Infinity]) {
    const res = evaluatePositionBrierLegs({
      positionId: 'edge_invalid_dec',
      marketType: 'AH',
      selection: 'Home -0.5',
      line: -0.5,
      homeGoals: 2,
      awayGoals: 0,
      fallbackModelProbDecimal: invalidDecimal,
    });
    assert.strictEqual(res, null, `Invalid fallbackModelProbDecimal ${invalidDecimal} must be rejected`);
  }

  for (const invalidPct of [NaN, -10, 0, 1, 100, 120]) {
    const res = evaluatePositionBrierLegs({
      positionId: 'edge_invalid_pct',
      marketType: 'OU',
      selection: 'Over 2.5',
      line: 2.5,
      homeGoals: 2,
      awayGoals: 1,
      fallbackProbability: invalidPct,
    });
    assert.strictEqual(res, null, `Invalid fallbackProbability ${invalidPct} must be rejected`);
  }

  // 4. Empty sample in PerformanceMetricsEngine
  const emptySummary = PerformanceMetricsEngine.aggregateMetrics([]);
  assert.strictEqual(emptySummary.n, 0);
  assert.strictEqual(emptySummary.sampleStatus, 'INSUFFICIENT SAMPLE');
  assert.strictEqual(emptySummary.roi, null);
  assert.strictEqual(emptySummary.brierScore, null);
  assert.strictEqual(emptySummary.brierStakeWeighted, null);
  assert.strictEqual(emptySummary.displayStatus, 'No settled bets');

  // 5. Duplicate legs & duplicate positions deduplicated in PerformanceMetricsEngine
  const leg1 = halfLineWin.legs[0];
  const posWithDuplicateLegs = {
    ledgerPositionId: 'dup_pos_1',
    fixtureId: 'fix_1',
    marketType: 'OU',
    selection: 'Over 2.5',
    line: 2.5,
    stakeUnits: 1.0,
    marketOdds: 2.0,
    fairOdds: 1.9,
    pWin: leg1.pLegNoPush,
    pPush: 0,
    pLoss: 1 - leg1.pLegNoPush,
    confidence: 75,
    edge: 3.5,
    expectedValuePct: 5.0,
    greenCohort: true,
    is_pick: true,
    verdict: 'LAYAK',
    settlementStatus: 'SETTLED',
    result: 'WIN',
    profitUnits: 1.0,
    clvPct: null,
    brierLegs: [leg1, { ...leg1 }], // duplicate leg with same legIndex & legLine
  };
  const dedupSummary = PerformanceMetricsEngine.aggregateMetrics([
    posWithDuplicateLegs,
    { ...posWithDuplicateLegs }, // duplicate position with same ledgerPositionId
  ]);
  assert.strictEqual(dedupSummary.settled, 1, 'Duplicate ledgerPositionId must be deduplicated');
  assert.strictEqual(dedupSummary.nBrierLegsTotal, 1, 'Duplicate leg within position must be deduplicated');
  assert.strictEqual(dedupSummary.nBrierLegsResolved, 1);
});

test('H8.8: /api/v1/research serves authoritative live_prediction_ledger.jsonl probabilities (18.5% for Arsenal AH -1.25) matching /api/v1/performance and exposes ledgerDiscrepancyAudit', async () => {
  const resReq = {
    headers: new Map([['x-request-id', 'test_h8_auth_prob']]),
    url: 'http://localhost:3000/api/v1/research?tier=PRODUCTION',
  };
  const resResponse = await getResearch(resReq);
  const resJson = await resResponse.json();

  const perfReq = {
    headers: new Map([['x-request-id', 'test_h8_auth_perf']]),
  };
  const perfResponse = await getPerformance(perfReq);
  const perfJson = await perfResponse.json();

  assert.strictEqual(resJson.predictions.length, 20);
  const arsenalAhResearch = resJson.predictions.find(
    p => String(p.fixtureId) === '1557417' && p.market === 'AH'
  );
  const arsenalAhPerf = perfJson.settledPositions.find(
    p => String(p.fixtureId) === '1557417' && p.market === 'AH'
  );
  assert.ok(arsenalAhResearch && arsenalAhPerf);
  assert.strictEqual(arsenalAhResearch.modelProbability, 18.5);
  assert.strictEqual(arsenalAhPerf.modelProbability, 18.5);
  assert.strictEqual(arsenalAhResearch.ledgerDiscrepancyAudit.hasRegeneratedDiscrepancy, true);
  assert.strictEqual(arsenalAhResearch.ledgerDiscrepancyAudit.authoritativeModelProbabilityPct, 18.5);
  assert.strictEqual(arsenalAhResearch.ledgerDiscrepancyAudit.regeneratedResearchLedgerProbabilityPct, 32.7);

  // Verify all 12 settled EPL rows have identical modelProbability and fairOdds across both endpoints
  for (const sp of perfJson.settledPositions) {
    const rp = resJson.predictions.find(
      p => String(p.fixtureId) === String(sp.fixtureId) && p.market === sp.market
    );
    assert.ok(rp, `Research row must exist for settled position ${sp.fixtureId} ${sp.market}`);
    assert.strictEqual(rp.modelProbability, sp.modelProbability);
    assert.strictEqual(rp.fairOdds, sp.fairOdds);
  }
});
