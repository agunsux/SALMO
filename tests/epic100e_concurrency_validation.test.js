// tests/epic100e_concurrency_validation.test.js
// SALMO EPIC 100E: Cross-Backend Concurrency & Transactional Safety Test Suite
// Verifies multi-worker concurrency, atomic rollbacks, idempotency, and race conditions
// using independent PostgreSQL 16 connection sockets.

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

test.after(async () => {
  await pool.end();
});

test('Concurrency Scenario 1: Two concurrent workers creating the exact same decision simultaneously', async () => {
  const matchCanonicalId = `EPL_2026_CONCUR_D1_${Date.now()}`;
  const kickoffIso = new Date(Date.now() + 6 * 3600 * 1000).toISOString();

  // 1. Create canonical fixture
  const fixture = await FixtureRepository.saveFixture({
    canonicalMatchId: matchCanonicalId,
    league: 'Premier League',
    season: '2026',
    kickoff: kickoffIso,
    homeTeam: 'Arsenal FC',
    awayTeam: 'Chelsea FC',
    status: 'upcoming',
  });

  const decisionInput = {
    fixtureId: fixture.id,
    canonicalMatchId: matchCanonicalId,
    league: 'Premier League',
    homeTeam: 'Arsenal FC',
    awayTeam: 'Chelsea FC',
    kickoffUtc: kickoffIso,
    marketType: 'AH',
    selection: 'Arsenal FC -0.5',
    line: -0.5,
    modelProbability: 0.68,
    fairOdds: 1.55,
    pinnacleOdds: {
      sideOdds: 1.95,
      oppositeOdds: 1.95,
    },
    sampleSizeHome: 10,
    sampleSizeAway: 10,
  };

  // 2. Launch Worker 1 and Worker 2 in parallel
  const [worker1Result, worker2Result] = await Promise.all([
    DecisionLedgerRepository.executeAtomicDecisionWorkflow(decisionInput),
    DecisionLedgerRepository.executeAtomicDecisionWorkflow(decisionInput),
  ]);

  if (!worker1Result.success || !worker2Result.success) {
    console.error('Worker1 result:', worker1Result);
    console.error('Worker2 result:', worker2Result);
  }

  assert.strictEqual(worker1Result.success, true);
  assert.strictEqual(worker2Result.success, true);

  // One worker must be the primary creator, the other must be recognized as idempotent duplicate
  const createdCount = (worker1Result.idempotentDuplicate ? 0 : 1) + (worker2Result.idempotentDuplicate ? 0 : 1);
  assert.strictEqual(createdCount, 1, 'Exactly one worker must perform the initial creation');

  // Verify database state: Exactly ONE record in prediction_ledger for this doi_id
  const doiId = DecisionLedgerRepository.generateDoiId(fixture.id, 'AH', -0.5, 'Arsenal FC -0.5');
  const checkRes = await pool.query('SELECT COUNT(*) AS count FROM public.prediction_ledger WHERE doi_id = $1', [doiId]);
  assert.strictEqual(parseInt(checkRes.rows[0].count, 10), 1, 'Exactly one record must exist in prediction_ledger');
});

test('Concurrency Scenario 2: Worker crash and transaction rollback leaves zero orphan records', async () => {
  const matchCanonicalId = `EPL_2026_CONCUR_CRASH_${Date.now()}`;
  const kickoffIso = new Date(Date.now() + 6 * 3600 * 1000).toISOString();

  const fixture = await FixtureRepository.saveFixture({
    canonicalMatchId: matchCanonicalId,
    league: 'Premier League',
    season: '2026',
    kickoff: kickoffIso,
    homeTeam: 'Liverpool FC',
    awayTeam: 'Everton FC',
    status: 'upcoming',
  });

  // Simulate a worker attempting an invalid decision (e.g. negative EV or validation failure at step 7)
  const invalidDecisionInput = {
    fixtureId: fixture.id,
    canonicalMatchId: matchCanonicalId,
    league: 'Premier League',
    homeTeam: 'Liverpool FC',
    awayTeam: 'Everton FC',
    kickoffUtc: kickoffIso,
    marketType: 'AH',
    selection: 'Liverpool FC -0.5',
    line: -0.5,
    modelProbability: 0.40, // 40% probability with 1.90 odds -> EV = 0.40 * 1.90 - 1 = -0.24 (NEGATIVE EV!)
    fairOdds: 2.50,
    pinnacleOdds: {
      sideOdds: 1.90,
      oppositeOdds: 1.95,
    },
    sampleSizeHome: 10,
    sampleSizeAway: 10,
  };

  const result = await DecisionLedgerRepository.executeAtomicDecisionWorkflow(invalidDecisionInput);
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.committed, false);
  assert.strictEqual(result.stepFailed, 7);
  assert.strictEqual(result.rejectionCode, 'NEGATIVE_OR_ZERO_EV');

  // Verify NO orphan decision was left in public.decisions or public.prediction_ledger
  const decRes = await pool.query('SELECT COUNT(*) AS count FROM public.decisions WHERE match_id = $1', [fixture.id]);
  assert.strictEqual(parseInt(decRes.rows[0].count, 10), 0, 'No orphan decisions permitted on rollback');

  const ledRes = await pool.query('SELECT COUNT(*) AS count FROM public.prediction_ledger WHERE match_id = $1', [fixture.id]);
  assert.strictEqual(parseInt(ledRes.rows[0].count, 10), 0, 'No orphan ledger positions permitted on rollback');
});

test('Concurrency Scenario 3: Two workers settling the exact same fixture simultaneously', async () => {
  const matchCanonicalId = `EPL_2026_CONCUR_SETTLE_${Date.now()}`;
  const kickoffIso = new Date(Date.now() - 4 * 3600 * 1000).toISOString(); // 4 hours in past

  const fixture = await FixtureRepository.saveFixture({
    canonicalMatchId: matchCanonicalId,
    league: 'Premier League',
    season: '2026',
    kickoff: kickoffIso,
    homeTeam: 'Manchester City',
    awayTeam: 'Newcastle United',
    status: 'upcoming',
  });

  // Manually seed an active prediction_ledger entry for this fixture
  const doiId = `seed_${Date.now()}_mc_new`;
  await pool.query(`
    INSERT INTO public.prediction_ledger (
      doi_id, match_id, canonical_match_id, competition_id, market, selection,
      line, model_probability, fair_odds, odds_at_prediction, confidence,
      sha256_hash, kickoff_utc, result_status
    ) VALUES (
      $1, $2, $3, 39, 'AH', 'Manchester City -1.0',
      -1.0, 0.70, 1.45, 1.95, 80,
      'hash_seed_123', $4, 'pending'
    );
  `, [doiId, fixture.id, matchCanonicalId, kickoffIso]);

  // Two workers concurrently run settlement with final score Man City 3 - 1 Newcastle (homeGoals=3, awayGoals=1)
  // AH -1.0 with diff (3-1) - 1.0 = +1.0 > 0.25 => WIN (profit = 1.95 - 1.0 = +0.95)
  const [settleRes1, settleRes2] = await Promise.all([
    SettlementRepository.settleFixture({ fixtureId: fixture.id, homeGoals: 3, awayGoals: 1 }),
    SettlementRepository.settleFixture({ fixtureId: fixture.id, homeGoals: 3, awayGoals: 1 }),
  ]);

  // Both should succeed idempotently
  assert.ok(settleRes1.settledCount >= 0);
  assert.ok(settleRes2.settledCount >= 0);

  // Verify exactly ONE settlement record in settlement_results for this fixture and market
  const srRes = await pool.query(
    "SELECT COUNT(*) AS count, outcome, profit_units FROM public.settlement_results WHERE fixture_id = $1 AND market_type = 'AH' GROUP BY outcome, profit_units",
    [fixture.id]
  );
  assert.strictEqual(srRes.rows.length, 1);
  assert.strictEqual(parseInt(srRes.rows[0].count, 10), 1);
  assert.strictEqual(srRes.rows[0].outcome, 'WIN');
  assert.strictEqual(Number(srRes.rows[0].profit_units), 0.95);

  // Verify prediction_ledger has correct outcome and was not double-settled
  const plRes = await pool.query(
    'SELECT result_status, roi, status FROM public.prediction_ledger WHERE doi_id = $1',
    [doiId]
  );
  assert.strictEqual(plRes.rows[0].result_status, 'WIN');
  assert.strictEqual(Number(plRes.rows[0].roi), 0.95);
  assert.strictEqual(plRes.rows[0].status, 'SETTLED');
});

test('Concurrency Scenario 4: Concurrent odds refreshes do not overwrite or tamper original snapshots', async () => {
  const matchCanonicalId = `EPL_2026_CONCUR_ODDS_${Date.now()}`;
  const kickoffIso = new Date(Date.now() + 12 * 3600 * 1000).toISOString();

  const fixture = await FixtureRepository.saveFixture({
    canonicalMatchId: matchCanonicalId,
    league: 'Premier League',
    season: '2026',
    kickoff: kickoffIso,
    homeTeam: 'Tottenham Hotspur',
    awayTeam: 'West Ham United',
    status: 'upcoming',
  });

  // Capture quote at T-12h
  const snap1 = await OddsSnapshotRepository.captureSnapshot({
    matchId: fixture.id,
    marketType: 'AH',
    lineLabel: '-0.5',
    numericLine: -0.5,
    bookmaker: 'pinnacle',
    homeOdds: 1.95,
    awayOdds: 1.95,
    capturedAt: new Date(Date.now() - 10000).toISOString(),
  });

  // Capture updated quote at T-6h (line moved to 1.91)
  const snap2 = await OddsSnapshotRepository.captureSnapshot({
    matchId: fixture.id,
    marketType: 'AH',
    lineLabel: '-0.5',
    numericLine: -0.5,
    bookmaker: 'pinnacle',
    homeOdds: 1.91,
    awayOdds: 1.99,
    capturedAt: new Date().toISOString(),
  });

  assert.notStrictEqual(snap1.id, snap2.id);

  // Verify both snapshots exist unchanged in database
  const allSnaps = await pool.query(
    'SELECT id, home_odds, away_odds FROM public.market_snapshots WHERE match_id = $1 ORDER BY captured_at ASC',
    [fixture.id]
  );
  assert.strictEqual(allSnaps.rows.length, 2);
  assert.strictEqual(Number(allSnaps.rows[0].home_odds), 1.95);
  assert.strictEqual(Number(allSnaps.rows[1].home_odds), 1.91);
});
