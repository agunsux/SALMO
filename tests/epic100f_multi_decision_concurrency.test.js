// tests/epic100f_multi_decision_concurrency.test.js
// SALMO EPIC 100F: Multi-Decision Coexistence, Idempotency Versioning, and Concurrency Validation
// Validates:
// 1. Coexistence of multiple lines (e.g., AH -0.25 & AH -0.5) on the same fixture.
// 2. Distinct settlement rows in settlement_results without constraint collision.
// 3. Idempotency key versioning across model versions.
// 4. Population separation in performance accounting (SIMULATION vs PROVIDER).
// 5. High-concurrency worker execution across independent PostgreSQL sockets.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
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

const { getPostgresPool } = require('../src/repositories/dbClient.ts');
const { FixtureRepository } = require('../src/repositories/fixtureRepository.ts');
const { OddsSnapshotRepository } = require('../src/repositories/oddsSnapshotRepository.ts');
const { DecisionLedgerRepository } = require('../src/repositories/decisionLedgerRepository.ts');
const { SettlementRepository } = require('../src/repositories/settlementRepository.ts');
const { PerformanceRepository } = require('../src/repositories/performanceRepository.ts');

const pool = getPostgresPool();
let dbAvailable = false;

test.before(async () => {
  try {
    const client = await pool.connect();
    dbAvailable = true;
    client.release();
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      console.log('Skipping epic100f tests: local PostgreSQL not available');
      return;
    }
    throw err;
  }
});

test.after(async () => {
  if (dbAvailable) {
    await pool.end();
  }
});

test('EPIC 100F — Scenario 1: Multi-Decision Coexistence on the Same Fixture (AH -0.25 and AH -0.5)', async (t) => {
  if (!dbAvailable) {
    t.skip('Local PostgreSQL offline');
    return;
  }
  const matchCanonicalId = `EPL_2026_MULTIDEC_${Date.now()}`;
  const kickoffIso = new Date(Date.now() + 6 * 3600 * 1000).toISOString();

  // 1. Create canonical fixture
  const fixture = await FixtureRepository.saveFixture({
    canonicalMatchId: matchCanonicalId,
    league: 'Premier League',
    season: '2026',
    kickoff: kickoffIso,
    homeTeam: 'Manchester City',
    awayTeam: 'Newcastle United',
    status: 'upcoming',
  });

  // 2. Decision A: Manchester City AH -0.25 @ 1.95 (Model prob 62%, EV +20.9%)
  const decisionA = await DecisionLedgerRepository.executeAtomicDecisionWorkflow({
    fixtureId: fixture.id,
    canonicalMatchId: matchCanonicalId,
    league: 'Premier League',
    homeTeam: 'Manchester City',
    awayTeam: 'Newcastle United',
    kickoffUtc: kickoffIso,
    marketType: 'AH',
    selection: 'Manchester City -0.25',
    line: -0.25,
    modelProbability: 0.62,
    fairOdds: 1.61,
    pinnacleOdds: { sideOdds: 1.95, oppositeOdds: 1.95 },
    sampleSizeHome: 15,
    sampleSizeAway: 15,
    modelVersion: 'dixon-coles-v1.0',
  });

  assert.strictEqual(decisionA.success, true, 'Decision A must succeed');
  assert.strictEqual(decisionA.idempotentDuplicate, false, 'Decision A is first insertion');

  // 3. Decision B: Manchester City AH -0.5 @ 2.10 (Model prob 58%, EV +21.8%) on SAME fixture & market
  const decisionB = await DecisionLedgerRepository.executeAtomicDecisionWorkflow({
    fixtureId: fixture.id,
    canonicalMatchId: matchCanonicalId,
    league: 'Premier League',
    homeTeam: 'Manchester City',
    awayTeam: 'Newcastle United',
    kickoffUtc: kickoffIso,
    marketType: 'AH',
    selection: 'Manchester City -0.5',
    line: -0.5,
    modelProbability: 0.58,
    fairOdds: 1.72,
    pinnacleOdds: { sideOdds: 2.10, oppositeOdds: 1.82 },
    sampleSizeHome: 15,
    sampleSizeAway: 15,
    modelVersion: 'dixon-coles-v1.0',
  });

  assert.strictEqual(decisionB.success, true, 'Decision B must succeed');
  assert.strictEqual(decisionB.idempotentDuplicate, false, 'Decision B must not be treated as duplicate of Decision A');
  assert.notStrictEqual(decisionA.doiId, decisionB.doiId, 'Doi IDs must differ based on line');

  // 4. Verify both exist simultaneously in prediction_ledger and daily_picks
  const ledgerRows = await pool.query(
    'SELECT id, doi_id, line, odds_at_prediction FROM public.prediction_ledger WHERE match_id = $1 ORDER BY line DESC',
    [fixture.id]
  );
  assert.strictEqual(ledgerRows.rows.length, 2, 'Both decisions must coexist in prediction_ledger');

  const dailyPicks = await pool.query(
    'SELECT prediction_id, line, market_odds FROM public.daily_picks WHERE fixture_id = $1 ORDER BY line DESC',
    [fixture.id]
  );
  assert.strictEqual(dailyPicks.rows.length, 2, 'Both picks must coexist in daily_picks with unique prediction_ids');

  // 5. Settle fixture: Score 1-0 (Home wins by 1)
  // AH -0.25: WIN (+0.95 profit)
  // AH -0.5: WIN (+1.10 profit)
  const settlementResult = await SettlementRepository.settleFixture({
    fixtureId: fixture.id,
    homeGoals: 1,
    awayGoals: 0,
    matchStatus: 'finished',
  });

  assert.strictEqual(settlementResult.settledCount, 2, 'Both decisions must be settled');

  // 6. Verify settlement_results has 2 DISTINCT records without overwriting
  const settlementRows = await pool.query(
    'SELECT fixture_id, ledger_position_id, prediction_id, line, outcome, profit_units FROM public.settlement_results WHERE fixture_id = $1 ORDER BY line DESC',
    [fixture.id]
  );
  assert.strictEqual(settlementRows.rows.length, 2, 'settlement_results must contain exactly 2 distinct rows');
  assert.strictEqual(settlementRows.rows[0].outcome, 'WIN');
  assert.strictEqual(settlementRows.rows[1].outcome, 'WIN');
  assert.strictEqual(Number(settlementRows.rows[0].profit_units), 0.95);
  assert.strictEqual(Number(settlementRows.rows[1].profit_units), 1.10);

  // 7. Verify daily_picks was updated independently for each prediction
  const settledDailyPicks = await pool.query(
    'SELECT prediction_id, status, profit_loss FROM public.daily_picks WHERE fixture_id = $1 ORDER BY profit_loss ASC',
    [fixture.id]
  );
  assert.strictEqual(settledDailyPicks.rows[0].status, 'WON');
  assert.strictEqual(Number(settledDailyPicks.rows[0].profit_loss), 0.95);
  assert.strictEqual(settledDailyPicks.rows[1].status, 'WON');
  assert.strictEqual(Number(settledDailyPicks.rows[1].profit_loss), 1.10);
});

test('EPIC 100F — Scenario 2: Idempotency Key Model Versioning', async (t) => {
  if (!dbAvailable) {
    t.skip('Local PostgreSQL offline');
    return;
  }
  const matchCanonicalId = `EPL_2026_IDEMP_VER_${Date.now()}`;
  const kickoffIso = new Date(Date.now() + 6 * 3600 * 1000).toISOString();

  const fixture = await FixtureRepository.saveFixture({
    canonicalMatchId: matchCanonicalId,
    league: 'Premier League',
    season: '2026',
    kickoff: kickoffIso,
    homeTeam: 'Tottenham Hotspur',
    awayTeam: 'Aston Villa',
    status: 'upcoming',
  });

  const baseInput = {
    fixtureId: fixture.id,
    canonicalMatchId: matchCanonicalId,
    league: 'Premier League',
    homeTeam: 'Tottenham Hotspur',
    awayTeam: 'Aston Villa',
    kickoffUtc: kickoffIso,
    marketType: 'OU',
    selection: 'Over 2.5',
    line: 2.5,
    modelProbability: 0.65,
    fairOdds: 1.54,
    pinnacleOdds: { sideOdds: 1.90, oppositeOdds: 2.00 },
    sampleSizeHome: 12,
    sampleSizeAway: 12,
  };

  // Run 1: Model Version 1.0
  const run1 = await DecisionLedgerRepository.executeAtomicDecisionWorkflow({
    ...baseInput,
    modelVersion: 'dixon-coles-v1.0',
  });
  assert.strictEqual(run1.success, true);
  assert.strictEqual(run1.idempotentDuplicate, false);

  // Run 2: Exact duplicate with Model Version 1.0 (should be suppressed as duplicate)
  const run2 = await DecisionLedgerRepository.executeAtomicDecisionWorkflow({
    ...baseInput,
    modelVersion: 'dixon-coles-v1.0',
  });
  assert.strictEqual(run2.success, true);
  assert.strictEqual(run2.idempotentDuplicate, true, 'Identical model and inputs must be recognized as idempotent duplicate');

  // Run 3: Legitimate upgraded Model Version 2.0
  const run3 = await DecisionLedgerRepository.executeAtomicDecisionWorkflow({
    ...baseInput,
    modelVersion: 'dixon-coles-v2.0',
    modelProbability: 0.67,
    fairOdds: 1.49,
  });
  assert.strictEqual(run3.success, true);
  assert.strictEqual(run3.idempotentDuplicate, false, 'New model version must NOT be blocked by old model version key');
  assert.notStrictEqual(run1.doiId, run3.doiId, 'doi_id must incorporate model version');
});

test('EPIC 100F — Scenario 3: Performance Accounting Population Separation (SIMULATION vs PROVIDER)', async (t) => {
  if (!dbAvailable) {
    t.skip('Local PostgreSQL offline');
    return;
  }
  const matchCanonicalId = `EPL_2026_PERF_SEP_${Date.now()}`;
  const kickoffIso = new Date(Date.now() + 5 * 3600 * 1000).toISOString();

  const fixture = await FixtureRepository.saveFixture({
    canonicalMatchId: matchCanonicalId,
    league: 'Premier League',
    season: '2026',
    kickoff: kickoffIso,
    homeTeam: 'Brentford FC',
    awayTeam: 'Brighton & Hove Albion',
    status: 'upcoming',
  });

  // Decision 1: Official PROVIDER decision (will be settled as WIN +0.90)
  const officialDecision = await DecisionLedgerRepository.executeAtomicDecisionWorkflow({
    fixtureId: fixture.id,
    canonicalMatchId: matchCanonicalId,
    league: 'Premier League',
    homeTeam: 'Brentford FC',
    awayTeam: 'Brighton & Hove Albion',
    kickoffUtc: kickoffIso,
    marketType: 'AH',
    selection: 'Brentford FC 0.0',
    line: 0.0,
    modelProbability: 0.60,
    fairOdds: 1.67,
    pinnacleOdds: { sideOdds: 1.90, oppositeOdds: 2.00 },
    sampleSizeHome: 10,
    sampleSizeAway: 10,
  });

  // Decision 2: Synthetic/Simulation decision inserted directly to test population leakage
  const simDecisionId = (await pool.query(`
    INSERT INTO public.decisions (
      id, match_id, market_type, line_label, selection, line,
      badge, status, status_label, confidence, confidence_score,
      model_prob_pct, implied_prob_pct, edge_pp, ev_pct,
      sample_size, data_quality, validation_stage, verdict, reason,
      model_version, feature_version, generated_at
    ) VALUES (
      gen_random_uuid(), $1::uuid, 'AH', '-1.0', 'Brighton -1.0', -1.0,
      'GREEN', 'VALUE', 'Qualified Value', 'HIGH', 80.0,
      70.0, 40.0, 30.0, 75.0,
      20, 'PASS', 'QUALIFIED', 'LAYAK', 'Sim pick',
      'sim-v1', 'sim-v1', NOW()
    ) RETURNING id;
  `, [fixture.id])).rows[0].id;

  const simDoiId = `doi_${fixture.id}_AH_-1.0_brighton_sim`;
  await pool.query(`
    INSERT INTO public.prediction_ledger (
      id, doi_id, decision_id, match_id, canonical_match_id, competition_id,
      market, selection, line, model_probability, fair_odds, odds_at_prediction,
      confidence, edge, expected_value_pct, xg_home, xg_away, dixon_coles_rho,
      sha256_hash, provenance_hash, decision, published_at, kickoff_utc,
      result_status, roi, profit_loss, source_type, data_status, verified, created_at
    ) VALUES (
      gen_random_uuid(), $1, $5::uuid, $2::uuid, $3, 39,
      'AH', 'Brighton -1.0', -1.0, 0.70, 1.42, 2.50,
      80.0, 0.20, 75.0, 1.5, 1.0, -0.05,
      'hash_sim', 'hash_sim', 'BET', NOW(), $4,
      'WIN', 1.50, 1.50, 'SIMULATION', 'ACTIVE', FALSE, NOW()
    );
  `, [simDoiId, fixture.id, matchCanonicalId, kickoffIso, simDecisionId]);

  // Settle official fixture (Brentford wins 2-1) -> Brentford 0.0 is a WIN
  await SettlementRepository.settleFixture({
    fixtureId: fixture.id,
    homeGoals: 2,
    awayGoals: 1,
    matchStatus: 'finished',
  });

  // 1. Calculate production performance without simulation
  const prodReport = await PerformanceRepository.calculatePerformance();
  // Verify that the SIMULATION record is NOT included in prodReport audit trail
  const simFound = prodReport.auditTrail.find(a => a.doiId === simDoiId);
  assert.strictEqual(simFound, undefined, 'SIMULATION records must be strictly excluded from production performance aggregates');

  // 2. Calculate performance with includeSimulations: true
  const allReport = await PerformanceRepository.calculatePerformance({ includeSimulations: true });
  const simFoundInAll = allReport.auditTrail.find(a => a.doiId === simDoiId);
  assert.ok(simFoundInAll, 'SIMULATION records are accessible only when explicitly included');
});

test('EPIC 100F — Scenario 4: Performance Accounting for VOID and PUSH Invariants', async (t) => {
  if (!dbAvailable) {
    t.skip('Local PostgreSQL offline');
    return;
  }
  const matchCanonicalId = `EPL_2026_VOID_PUSH_${Date.now()}`;
  const kickoffIso = new Date(Date.now() + 4 * 3600 * 1000).toISOString();

  const fixture = await FixtureRepository.saveFixture({
    canonicalMatchId: matchCanonicalId,
    league: 'Premier League',
    season: '2026',
    kickoff: kickoffIso,
    homeTeam: 'Fulham FC',
    awayTeam: 'Wolverhampton',
    status: 'upcoming',
  });

  // Push Decision: Fulham 0.0 @ 1.95 (Draw 1-1 => PUSH)
  const pushDecisionId = (await pool.query(`
    INSERT INTO public.decisions (
      id, match_id, market_type, line_label, selection, line,
      badge, status, status_label, confidence, confidence_score,
      model_prob_pct, implied_prob_pct, edge_pp, ev_pct,
      sample_size, data_quality, validation_stage, verdict, reason,
      model_version, feature_version, generated_at
    ) VALUES (
      gen_random_uuid(), $1::uuid, 'AH', '0.0', 'Fulham 0.0', 0.0,
      'GREEN', 'VALUE', 'Qualified Value', 'HIGH', 70.0,
      60.0, 51.3, 8.7, 17.0,
      20, 'PASS', 'QUALIFIED', 'LAYAK', 'Push pick',
      'v1', 'v1', NOW()
    ) RETURNING id;
  `, [fixture.id])).rows[0].id;

  const pushDoi = `doi_${fixture.id}_AH_0.0_fulham_push`;
  await pool.query(`
    INSERT INTO public.prediction_ledger (
      id, doi_id, decision_id, match_id, canonical_match_id, competition_id,
      market, selection, line, model_probability, fair_odds, odds_at_prediction,
      confidence, edge, expected_value_pct, xg_home, xg_away, dixon_coles_rho,
      sha256_hash, provenance_hash, decision, published_at, kickoff_utc,
      result_status, roi, profit_loss, source_type, data_status, verified, created_at
    ) VALUES (
      gen_random_uuid(), $1, $5::uuid, $2::uuid, $3, 39,
      'AH', 'Fulham 0.0', 0.0, 0.60, 1.67, 1.95,
      70.0, 0.10, 17.0, 1.2, 1.2, -0.05,
      'hash_push', 'hash_push', 'BET', NOW(), $4,
      'PUSH', 0.0, 0.0, 'PROVIDER', 'ACTIVE', TRUE, NOW()
    );
  `, [pushDoi, fixture.id, matchCanonicalId, kickoffIso, pushDecisionId]);

  // Void Decision: Match abandoned / voided
  const voidDecisionId = (await pool.query(`
    INSERT INTO public.decisions (
      id, match_id, market_type, line_label, selection, line,
      badge, status, status_label, confidence, confidence_score,
      model_prob_pct, implied_prob_pct, edge_pp, ev_pct,
      sample_size, data_quality, validation_stage, verdict, reason,
      model_version, feature_version, generated_at
    ) VALUES (
      gen_random_uuid(), $1::uuid, 'AH', '-0.5', 'Fulham -0.5', -0.5,
      'GREEN', 'VALUE', 'Qualified Value', 'HIGH', 65.0,
      55.0, 48.8, 6.2, 12.0,
      20, 'PASS', 'QUALIFIED', 'LAYAK', 'Void pick',
      'v1', 'v1', NOW()
    ) RETURNING id;
  `, [fixture.id])).rows[0].id;

  const voidDoi = `doi_${fixture.id}_AH_-0.5_fulham_void`;
  await pool.query(`
    INSERT INTO public.prediction_ledger (
      id, doi_id, decision_id, match_id, canonical_match_id, competition_id,
      market, selection, line, model_probability, fair_odds, odds_at_prediction,
      confidence, edge, expected_value_pct, xg_home, xg_away, dixon_coles_rho,
      sha256_hash, provenance_hash, decision, published_at, kickoff_utc,
      result_status, roi, profit_loss, source_type, data_status, verified, created_at
    ) VALUES (
      gen_random_uuid(), $1, $5::uuid, $2::uuid, $3, 39,
      'AH', 'Fulham -0.5', -0.5, 0.55, 1.82, 2.05,
      65.0, 0.08, 12.0, 1.2, 1.2, -0.05,
      'hash_void', 'hash_void', 'BET', NOW(), $4,
      'VOID', 0.0, 0.0, 'PROVIDER', 'ACTIVE', TRUE, NOW()
    );
  `, [voidDoi, fixture.id, matchCanonicalId, kickoffIso, voidDecisionId]);

  const report = await PerformanceRepository.calculatePerformance({ competitionId: 39 });
  const pushEntry = report.auditTrail.find(a => a.doiId === pushDoi);
  const voidEntry = report.auditTrail.find(a => a.doiId === voidDoi);

  assert.ok(pushEntry, 'Push entry must be in audit trail');
  assert.ok(voidEntry, 'Void entry must be in audit trail');
  assert.strictEqual(pushEntry.profitUnits, 0.0, 'Push must have 0.0 profit units');
  assert.strictEqual(voidEntry.profitUnits, 0.0, 'Void must have 0.0 profit units');
});

test('EPIC 100F — Scenario 5: Multi-Worker Concurrency across 4 Parallel Workers (Simultaneous Ingestion & Settlement)', async (t) => {
  if (!dbAvailable) {
    t.skip('Local PostgreSQL offline');
    return;
  }
  const matchCanonicalId = `EPL_2026_PARALLEL_4W_${Date.now()}`;
  const kickoffIso = new Date(Date.now() + 8 * 3600 * 1000).toISOString();

  const fixture = await FixtureRepository.saveFixture({
    canonicalMatchId: matchCanonicalId,
    league: 'Premier League',
    season: '2026',
    kickoff: kickoffIso,
    homeTeam: 'Liverpool FC',
    awayTeam: 'Arsenal FC',
    status: 'upcoming',
  });

  // 4 workers attempt to create decisions on different lines concurrently:
  // Worker 1: Liverpool AH -0.25
  // Worker 2: Liverpool AH -0.5
  // Worker 3: Liverpool Over 2.5
  // Worker 4: Identical duplicate of Worker 1 (to test concurrent idempotency lock)
  const worker1Input = {
    fixtureId: fixture.id,
    canonicalMatchId: matchCanonicalId,
    league: 'Premier League',
    homeTeam: 'Liverpool FC',
    awayTeam: 'Arsenal FC',
    kickoffUtc: kickoffIso,
    marketType: 'AH',
    selection: 'Liverpool FC -0.25',
    line: -0.25,
    modelProbability: 0.60,
    fairOdds: 1.67,
    pinnacleOdds: { sideOdds: 1.98, oppositeOdds: 1.92 },
    sampleSizeHome: 12,
    sampleSizeAway: 12,
  };

  const worker2Input = {
    ...worker1Input,
    selection: 'Liverpool FC -0.5',
    line: -0.5,
    modelProbability: 0.56,
    fairOdds: 1.78,
    pinnacleOdds: { sideOdds: 2.15, oppositeOdds: 1.78 },
  };

  const worker3Input = {
    ...worker1Input,
    marketType: 'OU',
    selection: 'Over 2.5',
    line: 2.5,
    modelProbability: 0.65,
    fairOdds: 1.54,
    pinnacleOdds: { sideOdds: 1.88, oppositeOdds: 2.02 },
  };

  const [w1, w2, w3, w4] = await Promise.all([
    DecisionLedgerRepository.executeAtomicDecisionWorkflow(worker1Input),
    DecisionLedgerRepository.executeAtomicDecisionWorkflow(worker2Input),
    DecisionLedgerRepository.executeAtomicDecisionWorkflow(worker3Input),
    DecisionLedgerRepository.executeAtomicDecisionWorkflow(worker1Input), // Duplicate of W1
  ]);

  assert.strictEqual(w1.success, true);
  assert.strictEqual(w2.success, true);
  assert.strictEqual(w3.success, true);
  assert.strictEqual(w4.success, true);

  // Exactly one of W1 and W4 should be primary, the other idempotent duplicate
  const w1w4Duplicates = (w1.idempotentDuplicate ? 1 : 0) + (w4.idempotentDuplicate ? 1 : 0);
  assert.strictEqual(w1w4Duplicates, 1, 'Exactly one of W1/W4 must be flagged as idempotent duplicate');

  // Verify exactly 3 unique decisions landed in prediction_ledger
  const ledgerCount = await pool.query(
    'SELECT COUNT(*) FROM public.prediction_ledger WHERE match_id = $1',
    [fixture.id]
  );
  assert.strictEqual(parseInt(ledgerCount.rows[0].count, 10), 3, 'Must have exactly 3 distinct positions');

  // Now, 2 workers attempt simultaneous settlement of the fixture
  const [settle1, settle2] = await Promise.all([
    SettlementRepository.settleFixture({ fixtureId: fixture.id, homeGoals: 2, awayGoals: 1 }),
    SettlementRepository.settleFixture({ fixtureId: fixture.id, homeGoals: 2, awayGoals: 1 }),
  ]);

  assert.strictEqual(settle1.settledCount, 3);
  assert.strictEqual(settle2.settledCount, 3);

  // Verify settlement_results has exactly 3 records, no corruption or duplicates
  const finalSettlementRows = await pool.query(
    'SELECT COUNT(*) FROM public.settlement_results WHERE fixture_id = $1',
    [fixture.id]
  );
  assert.strictEqual(parseInt(finalSettlementRows.rows[0].count, 10), 3, 'Exactly 3 settlement rows must exist');
});
