// tests/epic80_durable_prediction_storage.test.js
// SALMO EPIC 80: Durable Prediction Storage Test Suite
// Verifies:
// 1. SQL migration and rollback symmetry & DDL invariants
// 2. Injected database client idempotent batch persistence
// 3. Serverless restart simulation & hydration recovery
// 4. Strict fail-closed production write guard (OddsPapiQuotaGuard.isProductionDatabaseWriteAllowed)
// 5. Immutable pre-match provenance hash integrity & quarter-line precision
// 6. Dual-path resilience & local file atomic fallback
// 7. Full pipeline integration with DailyPredictionRefreshService
// 8. Rejection handling & invalid record protection
// 9. Cryptographic immutability of the 3 protected historical ledgers

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ts = require('typescript');

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

const {
  DurablePredictionStorageAdapter,
} = require('../src/engine/pipeline/durablePredictionStorageAdapter.ts');
const {
  DailyPredictionRefreshService,
} = require('../src/engine/pipeline/dailyPredictionRefreshService.ts');
const { OddsPapiQuotaGuard } = require('../src/lib/quota/oddsPapiQuotaGuard.ts');

const BASELINE_HASHES = {
  'data/verification/live_prediction_ledger.jsonl': '317fc037a63b811420400ea9de094092ec7d68b119ad6abc57743be12d568527',
  'data/verification/all_leagues_research_ledger.jsonl': 'eae8f364a5393255d276fca2650056951fb601ba829c1710b26ac673dffb967b',
  'data/research/multi_league_research_predictions.jsonl': '0128616a43968be5fddab76ea5c57da731955e22b1bf27bca3f886938187a12f',
};

function verifyProtectedHashes() {
  for (const [relPath, expected] of Object.entries(BASELINE_HASHES)) {
    const full = path.resolve(process.cwd(), relPath);
    const buf = fs.readFileSync(full);
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    assert.equal(sha, expected, `Protected ledger hash tampered for ${relPath}`);
  }
}

/**
 * Creates an in-memory mock Supabase client for testing durable database operations.
 */
function createMockSupabaseClient() {
  const tables = {
    daily_prediction_refresh_ledger: new Map(),
    daily_picks: new Map(),
    prediction_ledger: new Map(),
  };

  return {
    _tables: tables,
    from(tableName) {
      const table = tables[tableName] || new Map();
      tables[tableName] = table;

      return {
        async upsert(rows, options = {}) {
          const rowList = Array.isArray(rows) ? rows : [rows];
          let inserted = 0;
          for (const row of rowList) {
            let key = row.id;
            if (options.onConflict) {
              const cols = options.onConflict.split(',').map(c => c.trim());
              key = cols.map(c => String(row[c])).join('|');
            }
            if (options.ignoreDuplicates && table.has(key)) {
              continue;
            }
            table.set(key, { ...row });
            inserted++;
          }
          return { data: rowList, error: null };
        },
        async insert(rows) {
          const rowList = Array.isArray(rows) ? rows : [rows];
          for (const row of rowList) {
            table.set(row.id || Math.random().toString(), { ...row });
          }
          return { data: rowList, error: null };
        },
        select(fields = '*') {
          let filtered = Array.from(table.values());
          const queryObj = {
            eq(col, val) {
              filtered = filtered.filter(r => r[col] === val);
              return queryObj;
            },
            limit(n) {
              filtered = filtered.slice(0, n);
              return queryObj;
            },
            then(resolve) {
              resolve({ data: filtered, error: null });
            },
          };
          return queryObj;
        },
      };
    },
  };
}

test('EPIC 80 — Scenario 1: SQL Migration and Rollback Symmetry & DDL Invariants', () => {
  const migPath = path.resolve(process.cwd(), 'data', 'migrations', '20261015_durable_prediction_storage.sql');
  const rollPath = path.resolve(process.cwd(), 'data', 'migrations', '20261015_durable_prediction_storage_rollback.sql');

  assert.ok(fs.existsSync(migPath), 'Migration file must exist');
  assert.ok(fs.existsSync(rollPath), 'Rollback file must exist');

  const migContent = fs.readFileSync(migPath, 'utf8');
  const rollContent = fs.readFileSync(rollPath, 'utf8');

  // Verify transaction wrapping
  assert.ok(migContent.includes('BEGIN;'), 'Migration must begin with transaction');
  assert.ok(migContent.includes('COMMIT;'), 'Migration must commit transaction');
  assert.ok(rollContent.includes('BEGIN;'), 'Rollback must begin with transaction');
  assert.ok(rollContent.includes('COMMIT;'), 'Rollback must commit transaction');

  // Verify daily_prediction_refresh_ledger schema
  assert.ok(migContent.includes('CREATE TABLE IF NOT EXISTS public.daily_prediction_refresh_ledger'), 'Must create daily_prediction_refresh_ledger');
  assert.ok(migContent.includes('uq_daily_refresh_position'), 'Must define composite unique constraint');
  assert.ok(migContent.includes('canonical_match_id, market, line, selection, model_version'), 'Unique constraint must cover match, market, line, selection, model_version');
  assert.ok(migContent.includes('idx_daily_refresh_kickoff_league'), 'Must create index on kickoff and league');
  assert.ok(migContent.includes('idx_daily_refresh_public_verdict'), 'Must create index on public picks and verdict');
  assert.ok(migContent.includes('idx_daily_refresh_provenance_hash'), 'Must create index on provenance hash');

  // Verify prediction_ledger and daily_picks idempotency indexes
  assert.ok(migContent.includes('uq_prediction_ledger_doi'), 'Must define unique index on prediction_ledger doi_id');
  assert.ok(migContent.includes('uq_daily_picks_fixture_market_source'), 'Must define unique index on daily_picks fixture_id, market_type, source');

  // Verify rollback symmetry
  assert.ok(rollContent.includes('DROP TABLE IF EXISTS public.daily_prediction_refresh_ledger CASCADE;'), 'Rollback must drop table');
  assert.ok(rollContent.includes('DROP INDEX IF EXISTS public.uq_daily_refresh_position;'), 'Rollback must drop unique position index');
  assert.ok(rollContent.includes('DROP INDEX IF EXISTS public.uq_prediction_ledger_doi;'), 'Rollback must drop prediction_ledger unique index');
});

test('EPIC 80 — Scenario 2: Injected Database Client Idempotent Batch Persistence', async () => {
  const mockDb = createMockSupabaseClient();
  const futureKick = new Date(Date.now() + 48 * 3600 * 1000).toISOString();

  const candidates = [
    {
      predictionId: 'pred_epl_1_ah',
      canonicalMatchId: 'EPL_2026_ARSENAL_CHELSEA_2026-10-18',
      fixtureId: 'fix_101',
      league: 'Premier League',
      homeTeam: 'Arsenal',
      awayTeam: 'Chelsea',
      kickoffUtc: futureKick,
      market: 'AH',
      line: -0.25, // Quarter-line
      selection: 'Arsenal -0.25',
      modelProbability: 0.68,
      marketOdds: 1.88,
      fairOdds: 1.47,
      expectedValue: 0.2784,
      confidenceScore: 78,
      confidenceTier: 'VALUE_HIGH',
      verdict: 'LAYAK',
      isPublicPick: true,
      ledgerTier: 'PRODUCTION',
    },
    {
      predictionId: 'pred_epl_1_ou',
      canonicalMatchId: 'EPL_2026_ARSENAL_CHELSEA_2026-10-18',
      fixtureId: 'fix_101',
      league: 'Premier League',
      homeTeam: 'Arsenal',
      awayTeam: 'Chelsea',
      kickoffUtc: futureKick,
      market: 'OU',
      line: 2.75, // Quarter-line
      selection: 'Over 2.75',
      modelProbability: 0.66,
      marketOdds: 1.95,
      fairOdds: 1.515,
      expectedValue: 0.287,
      confidenceScore: 74,
      confidenceTier: 'VALUE_HIGH',
      verdict: 'LAYAK',
      isPublicPick: true,
      ledgerTier: 'PRODUCTION',
    },
    {
      predictionId: 'pred_epl_1_btts',
      canonicalMatchId: 'EPL_2026_ARSENAL_CHELSEA_2026-10-18',
      fixtureId: 'fix_101',
      league: 'Premier League',
      homeTeam: 'Arsenal',
      awayTeam: 'Chelsea',
      kickoffUtc: futureKick,
      market: 'BTTS',
      line: 0,
      selection: 'BTTS YES',
      modelProbability: 0.62,
      marketOdds: 1.80,
      expectedValue: 0.116,
      confidenceScore: 62,
      confidenceTier: 'RESEARCH_ONLY',
      verdict: 'PANTAU',
      isPublicPick: false,
      ledgerTier: 'SHADOW',
    },
  ];

  // Batch 1 persistence
  const res1 = await DurablePredictionStorageAdapter.persistDailyPredictions(candidates, {
    dbClient: mockDb,
  });

  assert.equal(res1.success, true);
  assert.equal(res1.storageTarget, 'IN_MEMORY_TEST');
  assert.equal(res1.isDurableAcrossRestarts, true);
  assert.equal(res1.persistedCount, 3);
  assert.equal(mockDb._tables.daily_prediction_refresh_ledger.size, 3);

  // Batch 2: Exact identical rerun (idempotency proof)
  const res2 = await DurablePredictionStorageAdapter.persistDailyPredictions(candidates, {
    dbClient: mockDb,
  });

  assert.equal(res2.success, true);
  assert.equal(res2.isDurableAcrossRestarts, true);
  // Zero new rows added on rerun
  assert.equal(mockDb._tables.daily_prediction_refresh_ledger.size, 3, 'Table size must remain strictly 3');
});

test('EPIC 80 — Scenario 3: Serverless Restart Simulation & Hydration Recovery', async () => {
  const mockDb = createMockSupabaseClient();
  const futureKick = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

  const record = {
    predictionId: 'pred_serverless_restart_test',
    canonicalMatchId: 'EPL_2026_LIVERPOOL_MANCITY_2026-10-19',
    fixtureId: 'fix_restart_99',
    league: 'Premier League',
    homeTeam: 'Liverpool',
    awayTeam: 'Manchester City',
    kickoffUtc: futureKick,
    market: 'AH',
    line: -0.5,
    selection: 'Liverpool -0.5',
    modelProbability: 0.70,
    marketOdds: 1.90,
    fairOdds: 1.428,
    expectedValue: 0.33,
    confidenceScore: 82,
    confidenceTier: 'HIGH',
    verdict: 'LAYAK',
    isPublicPick: true,
    ledgerTier: 'PRODUCTION',
  };

  await DurablePredictionStorageAdapter.persistDailyPredictions([record], {
    dbClient: mockDb,
  });

  // Simulate a cold-start lambda instance querying the store
  const hydrated = await DurablePredictionStorageAdapter.queryLatestPredictions({
    dbClient: mockDb,
    league: 'Premier League',
  });

  assert.equal(hydrated.length, 1);
  const h = hydrated[0];
  assert.equal(h.canonical_match_id, 'EPL_2026_LIVERPOOL_MANCITY_2026-10-19');
  assert.equal(h.market, 'AH');
  assert.equal(h.line, -0.5);
  assert.equal(h.selection, 'Liverpool -0.5');
  assert.equal(h.model_probability, 0.70);
  assert.equal(h.market_odds, 1.90);
  assert.equal(h.verdict, 'LAYAK');
  assert.equal(h.is_public_pick, true);
  assert.ok(h.provenance_hash, 'Provenance hash must be present');
});

test('EPIC 80 — Scenario 4: Strict Fail-Closed Production Write Guard', async () => {
  // In test environment, OddsPapiQuotaGuard.isProductionDatabaseWriteAllowed must be false
  const isAllowedDefault = OddsPapiQuotaGuard.isProductionDatabaseWriteAllowed(false);
  const isAllowedTrueCaller = OddsPapiQuotaGuard.isProductionDatabaseWriteAllowed(true);

  assert.equal(isAllowedDefault, false, 'Must block writes when caller flag is false');
  assert.equal(isAllowedTrueCaller, false, 'Must block writes when NODE_ENV is test');

  // Attempting to persist without injected test dbClient in test environment must fall back safely to local file
  const testSink = path.resolve(process.cwd(), 'data', 'sync', 'test_epic80_guard_fallback.jsonl');
  if (fs.existsSync(testSink)) fs.unlinkSync(testSink);

  const futureKick = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const res = await DurablePredictionStorageAdapter.persistDailyPredictions(
    [
      {
        predictionId: 'pred_guard_test',
        canonicalMatchId: 'EPL_2026_TEST_MATCH',
        fixtureId: 'fix_guard',
        league: 'Premier League',
        homeTeam: 'Home',
        awayTeam: 'Away',
        kickoffUtc: futureKick,
        market: 'AH',
        line: 0,
        selection: 'Home 0',
        modelProbability: 0.66,
        marketOdds: 1.85,
        expectedValue: 0.22,
        verdict: 'LAYAK',
        isPublicPick: true,
        ledgerTier: 'PRODUCTION',
      },
    ],
    {
      persistToDatabase: true,
      allowProductionWrite: true, // Caller requested write
      localFallbackPath: testSink,
    }
  );

  assert.equal(res.success, true);
  assert.equal(res.storageTarget, 'LOCAL_FALLBACK_FILE');
  assert.equal(res.isDurableAcrossRestarts, false);
  assert.ok(res.warning.includes('blocked by fail-closed production write guard'), 'Warning must explain guard block');

  if (fs.existsSync(testSink)) fs.unlinkSync(testSink);
});

test('EPIC 80 — Scenario 5: Immutable Pre-Match Provenance Hash & Quarter-Line Precision', () => {
  const base = {
    canonicalMatchId: 'EPL_2026_ARSENAL_CHELSEA_2026-10-18',
    market: 'AH',
    selection: 'Arsenal -0.75',
    line: -0.75, // Asian Handicap quarter line
    modelProbability: 0.69,
    marketOdds: 1.95,
    kickoffUtc: '2026-10-18T14:00:00Z',
  };

  const hash1 = DurablePredictionStorageAdapter.computeProvenanceHash(base);
  const hash2 = DurablePredictionStorageAdapter.computeProvenanceHash(base);
  assert.equal(hash1, hash2, 'Provenance hash must be deterministic');

  // Any change in quarter line or terms must alter hash
  const tamperedLine = { ...base, line: -0.5 };
  const tamperedOdds = { ...base, marketOdds: 2.05 };
  const tamperedProb = { ...base, modelProbability: 0.70 };

  assert.notEqual(hash1, DurablePredictionStorageAdapter.computeProvenanceHash(tamperedLine), 'Tampered line must alter hash');
  assert.notEqual(hash1, DurablePredictionStorageAdapter.computeProvenanceHash(tamperedOdds), 'Tampered odds must alter hash');
  assert.notEqual(hash1, DurablePredictionStorageAdapter.computeProvenanceHash(tamperedProb), 'Tampered probability must alter hash');

  // Verify deterministic ID
  const id1 = DurablePredictionStorageAdapter.computeDeterministicId(base.canonicalMatchId, base.market, base.line, base.selection);
  const id2 = DurablePredictionStorageAdapter.computeDeterministicId(base.canonicalMatchId, base.market, base.line, base.selection);
  assert.equal(id1, id2, 'Deterministic ID must be reproducible');
});

test('EPIC 80 — Scenario 6: Dual-Path Resilience & Local File Atomic Fallback', async () => {
  const testSink = path.resolve(process.cwd(), 'data', 'sync', 'test_epic80_atomic_fallback.jsonl');
  if (fs.existsSync(testSink)) fs.unlinkSync(testSink);

  const futureKick = new Date(Date.now() + 36 * 3600 * 1000).toISOString();
  const items = [
    {
      predictionId: 'pred_dual_1',
      canonicalMatchId: 'EPL_2026_SPURS_NEWCASTLE_2026-10-18',
      fixtureId: 'fix_dual_1',
      league: 'Premier League',
      homeTeam: 'Tottenham',
      awayTeam: 'Newcastle',
      kickoffUtc: futureKick,
      market: 'OU',
      line: 3.25, // Over/Under quarter line
      selection: 'Over 3.25',
      modelProbability: 0.67,
      marketOdds: 1.92,
      expectedValue: 0.2864,
      verdict: 'LAYAK',
      isPublicPick: true,
      ledgerTier: 'PRODUCTION',
    },
  ];

  // Write run 1
  const res1 = await DurablePredictionStorageAdapter.persistDailyPredictions(items, {
    localFallbackPath: testSink,
  });

  assert.equal(res1.success, true);
  assert.equal(res1.persistedCount, 1);
  assert.equal(res1.storageTarget, 'LOCAL_FALLBACK_FILE');
  assert.equal(res1.isDurableAcrossRestarts, false);
  assert.ok(fs.existsSync(testSink), 'Local fallback file must exist');

  // Write run 2 (exact same items)
  const res2 = await DurablePredictionStorageAdapter.persistDailyPredictions(items, {
    localFallbackPath: testSink,
  });

  assert.equal(res2.persistedCount, 0, 'Rerun must add 0 duplicate lines');
  assert.equal(res2.skippedDuplicatesCount, 1, 'Duplicate must be counted as skipped');

  const lines = fs.readFileSync(testSink, 'utf8').trim().split('\n').filter(Boolean);
  assert.equal(lines.length, 1, 'File must contain exactly 1 line');

  if (fs.existsSync(testSink)) fs.unlinkSync(testSink);
});

test('EPIC 80 — Scenario 7: Full Pipeline Integration with DailyPredictionRefreshService', async () => {
  const mockDb = createMockSupabaseClient();
  const futureKick = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

  const fixtureInput = {
    fixtureId: 'fix_integration_e80',
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    league: 'Premier League',
    kickoffUtc: futureKick,
    pinnacleOdds: {
      ah: { line: -0.25, homeOdds: 1.88, awayOdds: 2.02 },
      ou: { line: 2.75, overOdds: 1.90, underOdds: 2.00 },
      btts: { yesOdds: 1.85, noOdds: 2.05 },
    },
  };

  const cycle = await DailyPredictionRefreshService.runDailyRefresh({
    mode: 'RESEARCH',
    fixtures: [fixtureInput],
    persistToDatabase: true,
    allowProductionWrite: true,
    dbClient: mockDb,
    dryRun: false,
  });

  assert.equal(cycle.success, true);
  assert.equal(cycle.report.storageTarget, 'IN_MEMORY_TEST');
  assert.equal(cycle.report.isDurableAcrossRestarts, true);
  assert.ok(cycle.report.persistedRecordsCount > 0, 'Records must be persisted to injected dbClient');
  assert.ok(mockDb._tables.daily_prediction_refresh_ledger.size >= 1, 'Table must contain records');
});

test('EPIC 80 — Scenario 8: Rejection Handling & Invalid Record Protection', async () => {
  const invalidCandidate = {
    predictionId: 'invalid_pred',
    canonicalMatchId: '', // Missing
    fixtureId: 'fix_bad',
    league: 'Premier League',
    homeTeam: 'Team A',
    awayTeam: 'Team B',
    kickoffUtc: new Date().toISOString(),
    market: 'INVALID_MARKET',
    line: 0,
    selection: 'Bad',
    modelProbability: 1.5, // Out of bounds > 1.0
    marketOdds: -2.0, // Negative odds
    expectedValue: 0,
    verdict: 'LEWATI',
    isPublicPick: false,
    ledgerTier: 'NONE',
  };

  const res = await DurablePredictionStorageAdapter.persistDailyPredictions([invalidCandidate]);
  assert.equal(res.success, false);
  assert.ok(res.errors.length > 0, 'Must record validation errors');
  assert.ok(res.errors.some(e => e.includes('Missing canonical_match_id')));
  assert.ok(res.errors.some(e => e.includes('model_probability out of bounds')));
  assert.ok(res.errors.some(e => e.includes('Invalid market')));
});

test('EPIC 80 — Scenario 9: Cryptographic Immutability of the 3 Protected Historical Ledgers', () => {
  const p1 = path.resolve(process.cwd(), 'data', 'verification', 'live_prediction_ledger.jsonl');
  const p2 = path.resolve(process.cwd(), 'data', 'verification', 'all_leagues_research_ledger.jsonl');
  const p3 = path.resolve(process.cwd(), 'data', 'research', 'multi_league_research_predictions.jsonl');

  assert.throws(
    () => DurablePredictionStorageAdapter.assertDestinationSafety(p1),
    /FATAL SECURITY INVARIANT VIOLATION/,
    'Must protect live_prediction_ledger.jsonl'
  );

  assert.throws(
    () => DurablePredictionStorageAdapter.assertDestinationSafety(p2),
    /FATAL SECURITY INVARIANT VIOLATION/,
    'Must protect all_leagues_research_ledger.jsonl'
  );

  assert.throws(
    () => DurablePredictionStorageAdapter.assertDestinationSafety(p3),
    /FATAL SECURITY INVARIANT VIOLATION/,
    'Must protect multi_league_research_predictions.jsonl'
  );

  verifyProtectedHashes();
});
