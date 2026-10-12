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

// ─── PHASE 2: PRE-REGISTERED GATES (DOCS + CONFIG + WIRE-UP + BENCHMARK GUARD) ─

const gatesModule = require('../src/engine/performance/gates.ts');

test('H8.9: gates.ts exports match documented values in docs/governance/promotion_gates.md', () => {
  assert.strictEqual(gatesModule.REFERENCE_BENCHMARK_BOOKMAKER, 'pinnacle');
  assert.strictEqual(gatesModule.SOFT_BOOK_LINE_SHOPPING_LABEL, 'soft book, not a benchmark');
  assert.strictEqual(gatesModule.CLOSING_PRICE_RULE_ID, 'LAST_ACTIVE_AT_OR_BEFORE_KICKOFF');
  assert.strictEqual(gatesModule.MISSING_CLOSING_LINE_REASON, 'line_not_in_series');
  assert.strictEqual(gatesModule.PRIMARY_DEVIG_METHOD_ID, 'PROPORTIONAL_TWO_WAY');
  assert.strictEqual(gatesModule.SENSITIVITY_DEVIG_METHOD_ID, 'SHIN_SENSITIVITY_ONLY');
  assert.strictEqual(gatesModule.GATE_STATUS_NOT_COMPUTABLE_YET, 'NOT_COMPUTABLE_YET');
  assert.strictEqual(gatesModule.CLV_HEADLINE_MIN_POSITIONS, 100);
  assert.strictEqual(gatesModule.HEADLINE_COHORT_MIN_SETTLED_POSITIONS, 100);
  assert.strictEqual(gatesModule.BRIER_VS_MARKET_MIN_LEGS, 300);
  assert.strictEqual(gatesModule.BRIER_DIFF_VS_MARKET_CI95_UPPER_MAX, 0);
  assert.strictEqual(gatesModule.LOG_LOSS_DIFF_VS_MARKET_CI95_UPPER_MAX, 0);
  assert.strictEqual(gatesModule.BRIER_COIN_FLIP_SANITY_FLOOR, 0.25);
  assert.strictEqual(gatesModule.LOG_LOSS_COIN_FLIP_SANITY_FLOOR, 0.6931);
  assert.strictEqual(gatesModule.MIN_CALIBRATION_SLOPE_FLOOR, 0.5);
  assert.strictEqual(gatesModule.MAX_DISPERSION_RATIO_CEILING, 1.15);
  assert.strictEqual(gatesModule.MULTIPLE_COMPARISON_CORRECTION_METHOD, 'HOLM_STEP_DOWN');
  assert.strictEqual(gatesModule.HOLM_FAMILYWISE_ALPHA, 0.05);
  assert.strictEqual(gatesModule.DEMOTION_TARGET_STATUS, 'SHADOW');
  assert.strictEqual(gatesModule.DEMOTION_PAIRED_BRIER_DIFF_CI95_LOWER_MIN, 0);
  assert.strictEqual(gatesModule.DEMOTION_CLV_CI95_UPPER_MAX, 0);
  assert.strictEqual(gatesModule.SHADOW_VALIDATION_UNTESTED_VS_MARKET, 'UNTESTED_VS_MARKET');
  assert.strictEqual(gatesModule.DRIBBLE360_EXPIRATION_DATE, '2026-12-01');

  // Verify closing selection rule: last active=true tick with createdAt <= kickoffUtc on exact market+line
  const series = [
    { bookmaker: 'pinnacle', market: 'AH', outcome: 'HOME', line: -0.5, price: 1.92, active: true, createdAt: '2026-10-10T12:00:00Z' },
    { bookmaker: 'pinnacle', market: 'AH', outcome: 'HOME', line: -0.5, price: 1.96, active: true, createdAt: '2026-10-10T13:59:00Z' },
    { bookmaker: 'pinnacle', market: 'AH', outcome: 'HOME', line: -0.5, price: 2.02, active: false, createdAt: '2026-10-10T13:59:30Z' },
    { bookmaker: 'pinnacle', market: 'AH', outcome: 'HOME', line: -0.5, price: 2.05, active: true, createdAt: '2026-10-10T14:01:00Z' }, // post-kickoff
  ];
  const closeRes = gatesModule.selectPinnacleClosingFromSeries(series, '2026-10-10T14:00:00Z', 'AH', 'HOME', -0.5);
  assert.strictEqual(closeRes.closingPrice, 1.96);
  assert.strictEqual(closeRes.reason, 'LAST_ACTIVE_AT_OR_BEFORE_KICKOFF');

  // Missing line -> null + 'line_not_in_series'
  const missingLineRes = gatesModule.selectPinnacleClosingFromSeries(series, '2026-10-10T14:00:00Z', 'AH', 'HOME', -0.75);
  assert.strictEqual(missingLineRes.closingPrice, null);
  assert.strictEqual(missingLineRes.reason, 'line_not_in_series');

  // Proportional two-way devig
  const devig = gatesModule.computeProportionalTwoWayDevig(1.95, 1.95);
  assert.ok(devig);
  assert.strictEqual(devig.probSideA, 0.5);
  assert.strictEqual(devig.probSideB, 0.5);

  // Holm step-down multiple comparison correction
  const holm = gatesModule.applyHolmStepDownCorrection([
    { id: 'H1', pValue: 0.01 },
    { id: 'H2', pValue: 0.02 },
    { id: 'H3', pValue: 0.04 },
  ], 0.05);
  assert.strictEqual(holm.length, 3);
  assert.strictEqual(holm[0].rejectedNull, true);

  // Demotion rule (ACTIVE -> SHADOW)
  const demoteBrier = gatesModule.evaluateActiveMarketDemotionGate({
    leagueId: 'ENG-PL',
    market: 'OU',
    nPairedMarketLegs: 80,
    pairedBrierDiffCi95Lower: 0.0002,
    nSettledClvPositions: 0,
    clvCi95Upper: null,
  });
  assert.strictEqual(demoteBrier.shouldDemoteToShadow, true);
  assert.strictEqual(demoteBrier.targetStatusIfDemoted, 'SHADOW');

  const govDocPath = path.resolve(process.cwd(), 'docs/governance/promotion_gates.md');
  assert.strictEqual(fs.existsSync(govDocPath), true, 'docs/governance/promotion_gates.md must exist');
  const govDoc = fs.readFileSync(govDocPath, 'utf8');
  assert.ok(govDoc.includes('pinnacle'), 'Must document pinnacle as sole reference benchmark');
  assert.ok(govDoc.includes('1xBet'), 'Must explicitly address 1xBet exclusion from benchmark');
  assert.ok(govDoc.includes('soft book, not a benchmark'), 'Must document soft-book line-shopping label');
  assert.ok(govDoc.includes('line_not_in_series'), 'Must document missing-line rule');
  assert.ok(govDoc.includes('PROPORTIONAL_TWO_WAY'), 'Must document proportional two-way devig');
  assert.ok(govDoc.includes('UNTESTED_VS_MARKET'), 'Must document UNTESTED_VS_MARKET status');
  assert.ok(govDoc.includes('HOLM_STEP_DOWN'), 'Must document Holm step-down correction');
  assert.ok(govDoc.includes('2026-12-01'), 'Must document Dribble360 expiration 2026-12-01');
  assert.ok(govDoc.includes('11/14') || govDoc.includes('11 of 14'), 'Must cite H8 11/14 quarter-line binary flip rationale');
  assert.ok(govDoc.includes('61%') || govDoc.includes('61.3%'), 'Must cite DEU/NED OU 2.5 ~61% Over base-rate skew rationale');
  assert.ok(govDoc.includes('Insufficient sample (n/100)'), 'Must document Insufficient sample (n/100) rule');
  assert.ok(govDoc.includes('NOT_COMPUTABLE_YET'), 'Must document NOT_COMPUTABLE_YET rule');
  assert.ok(govDoc.includes('2026-01'), 'Must document OddsPapi historical depth constraint (since 2026-01)');
  assert.ok(govDoc.includes('Football-Data.co.uk'), 'Must document Football-Data.co.uk prior-season closing source');
});

test('H8.10: Static scan confirms no hardcoded 30 sample-size or gate threshold literals remain in src/ outside gates.ts', () => {
  const gatesFullPath = path.resolve(process.cwd(), 'src/engine/performance/gates.ts');

  function walkTsFiles(dir, out = []) {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) {
        walkTsFiles(full, out);
      } else if (full.endsWith('.ts') || full.endsWith('.tsx')) {
        out.push(full);
      }
    }
    return out;
  }

  const allSrcFiles = walkTsFiles(path.resolve(process.cwd(), 'src'));
  for (const file of allSrcFiles) {
    if (path.resolve(file) === gatesFullPath) continue;
    const content = fs.readFileSync(file, 'utf8');
    const relPath = path.relative(process.cwd(), file);

    assert.ok(
      !content.includes('MIN_SAMPLE_SIZE = 30'),
      `${relPath} must not hardcode MIN_SAMPLE_SIZE = 30`
    );
    assert.ok(
      !content.includes('settledCount < 30') && !content.includes('settled ?? settledCount) < 30'),
      `${relPath} must not hardcode settledCount < 30`
    );
    assert.ok(
      !content.includes('/ 30 min') && !content.includes('minimum sample of 30') && !content.includes('threshold of 30 settled'),
      `${relPath} must not hardcode 30 settled sample copy`
    );
    assert.ok(
      !content.includes('BRIER_THRESHOLD = 0.25'),
      `${relPath} must not hardcode BRIER_THRESHOLD = 0.25 outside gates.ts`
    );
    assert.ok(
      !content.includes('LOG_LOSS_THRESHOLD = 0.6931'),
      `${relPath} must not hardcode LOG_LOSS_THRESHOLD = 0.6931 outside gates.ts`
    );
    assert.ok(
      !content.includes('MIN_CALIBRATION_SLOPE = 0.5'),
      `${relPath} must not hardcode MIN_CALIBRATION_SLOPE = 0.5 outside gates.ts`
    );
    assert.ok(
      !content.includes('MAX_DISPERSION_RATIO = 1.15'),
      `${relPath} must not hardcode MAX_DISPERSION_RATIO = 1.15 outside gates.ts`
    );
    assert.ok(
      !content.includes('MIN_EVAL_SAMPLE = 300'),
      `${relPath} must not hardcode MIN_EVAL_SAMPLE = 300 outside gates.ts`
    );
  }
});

test('H8.11: Any non-pinnacle bookmaker (including 1xbet) is rejected as a CLV/baseline reference', () => {
  assert.strictEqual(gatesModule.isValidBenchmarkBookmaker('pinnacle'), true);
  assert.strictEqual(gatesModule.isValidBenchmarkBookmaker('PINNACLE'), true);
  assert.strictEqual(gatesModule.isValidBenchmarkBookmaker('  Pinnacle '), true);
  assert.strictEqual(gatesModule.validateBenchmarkBookmaker ? gatesModule.validateBenchmarkBookmaker('pinnacle') : gatesModule.assertBenchmarkBookmaker('pinnacle'), 'pinnacle');

  for (const invalidBook of ['1xbet', '1xBet', 'bet365', 'draftkings', 'fanduel', 'williamhill', '', null, undefined]) {
    assert.strictEqual(
      gatesModule.isValidBenchmarkBookmaker(invalidBook),
      false,
      `Bookmaker ${String(invalidBook)} must be rejected by isValidBenchmarkBookmaker`
    );
    assert.throws(
      () => gatesModule.assertBenchmarkBookmaker(invalidBook),
      /Invalid reference benchmark bookmaker/,
      `Bookmaker ${String(invalidBook)} must throw in assertBenchmarkBookmaker`
    );
    assert.throws(
      () => PerformanceMetricsEngine.validateBenchmarkBookmaker(invalidBook),
      /Invalid reference benchmark bookmaker/,
      `Bookmaker ${String(invalidBook)} must throw in PerformanceMetricsEngine.validateBenchmarkBookmaker`
    );
  }

  // Passing a position with clvBookmaker: '1xbet' into aggregateMetrics must throw
  assert.throws(
    () =>
      PerformanceMetricsEngine.aggregateMetrics([
        {
          ledgerPositionId: 'bad_book_1',
          fixtureId: 'fix_1',
          marketType: 'AH',
          selection: 'Home -0.5',
          line: -0.5,
          stakeUnits: 1.0,
          marketOdds: 1.95,
          fairOdds: 1.9,
          pWin: 0.53,
          pPush: 0,
          pLoss: 0.47,
          confidence: 75,
          edge: 2.5,
          expectedValuePct: 3.1,
          greenCohort: true,
          is_pick: true,
          verdict: 'LAYAK',
          settlementStatus: 'SETTLED',
          result: 'WIN',
          profitUnits: 0.95,
          clvPct: 1.8,
          clvBookmaker: '1xbet',
        },
      ]),
    /1xBet and soft books are strictly excluded/
  );
});

test('H8.12: UI/API return "Insufficient sample (n/100)" (or NOT_COMPUTABLE_YET) and null values (never zeros) when n is below 100', async () => {
  // 1. Engine level: n = 0
  const zeroSummary = PerformanceMetricsEngine.aggregateMetrics([]);
  assert.strictEqual(zeroSummary.n, 0);
  assert.strictEqual(zeroSummary.minSampleRequired, 100);
  assert.strictEqual(zeroSummary.sampleStatus, 'INSUFFICIENT SAMPLE');
  assert.strictEqual(zeroSummary.insufficientSampleLabel, 'Insufficient sample (0/100)');
  assert.strictEqual(zeroSummary.roi, null, 'ROI must be null, never 0');
  assert.strictEqual(zeroSummary.yield, null, 'Yield must be null, never 0');
  assert.strictEqual(zeroSummary.avgClvPct, null, 'avgClvPct must be null, never 0');
  assert.strictEqual(zeroSummary.clvHeadlinePct, null, 'clvHeadlinePct must be null, never 0');
  assert.strictEqual(zeroSummary.clvGateStatus, 'NOT_COMPUTABLE_YET');
  assert.strictEqual(zeroSummary.clvInsufficientSampleLabel, 'Insufficient sample (0/100)');
  assert.strictEqual(zeroSummary.brierScore, null, 'brierScore must be null, never 0');
  assert.strictEqual(zeroSummary.marketBaselineStatus, 'NOT_COMPUTABLE_YET');
  assert.strictEqual(zeroSummary.marketBaselineBrier, null);
  assert.strictEqual(zeroSummary.brierDiffVsMarket, null);
  assert.strictEqual(zeroSummary.brierDiffVsMarketCi95Upper, null);

  // 2. API level: /api/v1/performance (n = 12 settled diagnostic, n = 0 green cohort, nClv = 0)
  const perfResponse = await getPerformance({
    headers: new Map([['x-request-id', 'test_h8_12_perf']]),
  });
  const perfJson = await perfResponse.json();

  assert.strictEqual(perfJson.registeredGates.headlineCohortMinSettledPositions, 100);
  assert.strictEqual(perfJson.registeredGates.clvHeadlineMinPositions, 100);
  assert.strictEqual(perfJson.registeredGates.brierVsMarketMinLegs, 300);
  assert.strictEqual(perfJson.registeredGates.referenceBenchmarkBookmaker, 'pinnacle');

  assert.strictEqual(perfJson.report.headlineGreenCohort.n, 0);
  assert.strictEqual(perfJson.report.headlineGreenCohort.sampleStatus, 'INSUFFICIENT SAMPLE');
  assert.strictEqual(perfJson.report.headlineGreenCohort.insufficientSampleLabel, 'Insufficient sample (0/100)');
  assert.strictEqual(perfJson.report.headlineGreenCohort.roi, null);
  assert.strictEqual(perfJson.report.headlineGreenCohort.avgClvPct, null);
  assert.strictEqual(perfJson.report.headlineGreenCohort.clvHeadlinePct, null);
  assert.strictEqual(perfJson.report.headlineGreenCohort.clvGateStatus, 'NOT_COMPUTABLE_YET');

  assert.strictEqual(perfJson.report.controlFullCohort.n, 12);
  assert.strictEqual(perfJson.report.controlFullCohort.sampleStatus, 'INSUFFICIENT SAMPLE');
  assert.strictEqual(perfJson.report.controlFullCohort.insufficientSampleLabel, 'Insufficient sample (12/100)');
  assert.strictEqual(perfJson.report.controlFullCohort.clvHeadlinePct, null);
  assert.strictEqual(perfJson.report.controlFullCohort.clvGateStatus, 'NOT_COMPUTABLE_YET');
  assert.strictEqual(perfJson.report.controlFullCohort.marketBaselineStatus, 'NOT_COMPUTABLE_YET');
  assert.strictEqual(perfJson.report.controlFullCohort.marketBaselineBrier, null);

  // 3. API level: /api/v1/research
  const resResponse = await getResearch({
    headers: new Map([['x-request-id', 'test_h8_12_research']]),
    url: 'http://localhost:3000/api/v1/research',
  });
  const resJson = await resResponse.json();

  assert.strictEqual(resJson.registeredGates.headlineCohortMinSettledPositions, 100);
  assert.strictEqual(resJson.settlementSummary.minSampleRequired, 100);
  assert.strictEqual(resJson.settlementSummary.sampleStatus, 'INSUFFICIENT SAMPLE');
  assert.strictEqual(resJson.settlementSummary.insufficientSampleLabel, 'Insufficient sample (12/100)');
  const eplMatrix = resJson.metricComputabilityMatrix.find(m => m.league === 'Premier League');
  assert.strictEqual(eplMatrix.referenceBenchmarkBookmaker, 'pinnacle');
  assert.strictEqual(eplMatrix.minSampleRequired, 100);
  assert.strictEqual(eplMatrix.sampleStatus, 'INSUFFICIENT SAMPLE');
  assert.strictEqual(eplMatrix.insufficientSampleLabel, 'Insufficient sample (12/100)');
  assert.strictEqual(eplMatrix.clvGateStatus, 'NOT_COMPUTABLE_YET');
  assert.strictEqual(eplMatrix.clvInsufficientSampleLabel, 'Insufficient sample (0/100)');
  assert.strictEqual(eplMatrix.marketBaselineStatus, 'NOT_COMPUTABLE_YET');
  assert.strictEqual(eplMatrix.marketBaselineBrier, null);
  assert.strictEqual(eplMatrix.brierDiffVsMarketCi95Upper, null);
  assert.strictEqual(eplMatrix.bootstrap95CI.clv, null);
});
