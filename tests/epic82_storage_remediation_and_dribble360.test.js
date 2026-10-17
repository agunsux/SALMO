// tests/epic82_storage_remediation_and_dribble360.test.js
// SALMO.DEV — EPIC 82: Storage Remediation, Dribble360 Data Utilization & Pipeline Recovery
// Verifies:
// 1. F-01: Serverless database hydration in queryLatestPredictions (default client resolution & error distinction)
// 2. F-01: Valid empty result ([] with 0 rows) vs connection/query error differentiation
// 3. F-02: Prevent fallback success masking (returns success: false, status: DEGRADED_LOCAL_FALLBACK on DB error)
// 4. F-02: Propagation of storage degradation to DailyPredictionRefreshService.pipelineHealth (PARTIAL)
// 5. Dribble360 research asset inventory & integrity verification
// 6. Dribble360 auto-resolved match extraction with 100% verified scores
// 7. Strict odds absence proof (odds: null on 100% of records; no fabricated odds)
// 8. Zero provider quota egress assertion (OddsPapi & API-Football)
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
const {
  Dribble360ResearchAdapter,
} = require('../src/engine/features/dribble360ResearchAdapter.ts');
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
function createMockSupabaseClient(options = {}) {
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
        async upsert(rows, opt = {}) {
          if (options.upsertError) {
            return { data: null, error: options.upsertError };
          }
          const rowList = Array.isArray(rows) ? rows : [rows];
          for (const row of rowList) {
            let key = row.id;
            if (opt.onConflict) {
              const cols = opt.onConflict.split(',').map(c => c.trim());
              key = cols.map(c => String(row[c])).join('|');
            }
            if (opt.ignoreDuplicates && table.has(key)) {
              continue;
            }
            table.set(key, { ...row });
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
              if (options.queryError) {
                resolve({ data: null, error: options.queryError });
              } else {
                resolve({ data: filtered, error: null });
              }
            },
          };
          return queryObj;
        },
      };
    },
  };
}

test('EPIC 82 — Scenario 1: F-01 Serverless Database Hydration via Default Client Resolution', async () => {
  const mockDb = createMockSupabaseClient();
  const futureKick = new Date(Date.now() + 48 * 3600 * 1000).toISOString();

  const record = {
    predictionId: 'pred_e82_f01',
    canonicalMatchId: 'EPL_2026_ARSENAL_CHELSEA_2026-10-20',
    fixtureId: 'fix_e82_1',
    league: 'Premier League',
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    kickoffUtc: futureKick,
    market: 'AH',
    line: -0.25,
    selection: 'Arsenal -0.25',
    modelProbability: 0.65,
    marketOdds: 1.95,
    expectedValue: 0.2675,
    verdict: 'LAYAK',
    isPublicPick: true,
    ledgerTier: 'PRODUCTION',
  };

  // Persist record into mock database
  const persistRes = await DurablePredictionStorageAdapter.persistDailyPredictions([record], {
    dbClient: mockDb,
  });
  assert.equal(persistRes.success, true);
  assert.equal(persistRes.status, 'SUCCESS');
  assert.equal(persistRes.storageTarget, 'IN_MEMORY_TEST');

  // Query back using injected client
  const hydrated = await DurablePredictionStorageAdapter.queryLatestPredictions({
    dbClient: mockDb,
    league: 'Premier League',
  });

  assert.equal(hydrated.length, 1);
  assert.equal(hydrated[0].canonical_match_id, 'EPL_2026_ARSENAL_CHELSEA_2026-10-20');
  assert.equal(hydrated[0].line, -0.25);
  assert.equal(hydrated[0].market, 'AH');
});

test('EPIC 82 — Scenario 2: F-01 Legitimate Empty Result vs Connection/Query Error Distinction', async () => {
  // Test 2A: Query against empty DB client returns valid empty array without error
  const emptyDb = createMockSupabaseClient();
  const emptyStatusRes = await DurablePredictionStorageAdapter.queryLatestPredictionsWithStatus({
    dbClient: emptyDb,
    league: 'Premier League',
  });

  assert.equal(emptyStatusRes.success, true, 'Valid empty DB query must report success: true');
  assert.equal(emptyStatusRes.isDurable, true, 'Valid empty DB query is from durable store');
  assert.equal(emptyStatusRes.data.length, 0, 'Data must be empty array');
  assert.equal(emptyStatusRes.error, undefined, 'Error must be undefined for valid empty query');

  // Test 2B: Query encountering database error must report failure and not mask as valid empty
  const failingDb = createMockSupabaseClient({
    queryError: { message: 'connection pool timeout: database unreachable' },
  });

  const failSink = path.resolve(process.cwd(), 'data', 'sync', 'test_e82_fail_sink.jsonl');
  if (fs.existsSync(failSink)) fs.unlinkSync(failSink);

  const failStatusRes = await DurablePredictionStorageAdapter.queryLatestPredictionsWithStatus({
    dbClient: failingDb,
    league: 'Premier League',
    sourcePath: failSink,
  });

  assert.equal(failStatusRes.success, false, 'DB query error must report success: false');
  assert.equal(failStatusRes.isDurable, false, 'Failed DB query cannot claim durability');
  assert.ok(failStatusRes.error.includes('connection pool timeout'), 'Error message must be preserved');

  // Test 2C: throwOnError flag causes queryLatestPredictions to throw on DB error
  await assert.rejects(
    async () => {
      await DurablePredictionStorageAdapter.queryLatestPredictions({
        dbClient: failingDb,
        throwOnError: true,
        sourcePath: failSink,
      });
    },
    /Database query failed: connection pool timeout/,
    'Must throw explicit error when throwOnError is true'
  );

  if (fs.existsSync(failSink)) fs.unlinkSync(failSink);
});

test('EPIC 82 — Scenario 3: F-02 Prevent Fallback Success Masking on Database Failure', async () => {
  const failingDb = createMockSupabaseClient({
    upsertError: { message: 'deadlock detected on daily_prediction_refresh_ledger_pkey' },
  });

  const testSink = path.resolve(process.cwd(), 'data', 'sync', 'test_e82_f02_masking.jsonl');
  if (fs.existsSync(testSink)) fs.unlinkSync(testSink);

  const candidate = {
    predictionId: 'pred_e82_f02',
    canonicalMatchId: 'EPL_2026_MANUTD_LIVERPOOL_2026-10-21',
    fixtureId: 'fix_e82_f02',
    league: 'Premier League',
    homeTeam: 'Manchester United',
    awayTeam: 'Liverpool',
    kickoffUtc: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    market: 'OU',
    line: 2.75,
    selection: 'Over 2.75',
    modelProbability: 0.62,
    marketOdds: 1.88,
    expectedValue: 0.1656,
    verdict: 'LAYAK',
    isPublicPick: true,
    ledgerTier: 'PRODUCTION',
  };

  const res = await DurablePredictionStorageAdapter.persistDailyPredictions([candidate], {
    dbClient: failingDb,
    localFallbackPath: testSink,
  });

  // F-02 Invariant: When DB upsert fails, success MUST be false (NOT masked as true)
  assert.equal(res.success, false, 'Must return success: false when DB write fails');
  assert.equal(res.status, 'DEGRADED_LOCAL_FALLBACK', 'Must return DEGRADED_LOCAL_FALLBACK status');
  assert.equal(res.storageTarget, 'LOCAL_FALLBACK_FILE', 'Storage target must be LOCAL_FALLBACK_FILE');
  assert.equal(res.isDurableAcrossRestarts, false, 'Durability must be false');
  assert.ok(res.errors.some(e => e.includes('deadlock detected')), 'Error must record the DB failure message');
  assert.ok(res.warning.includes('Durability across serverless restarts is NOT guaranteed'));

  // Local fallback file should still exist for emergency recovery
  assert.ok(fs.existsSync(testSink), 'Local fallback file was written for resilience');
  assert.equal(res.persistedCount, 1, 'Local fallback wrote 1 record');

  if (fs.existsSync(testSink)) fs.unlinkSync(testSink);
});

test('EPIC 82 — Scenario 4: F-02 Storage Degradation Propagates to Pipeline Health', async () => {
  const failingDb = createMockSupabaseClient({
    upsertError: { message: 'relation daily_prediction_refresh_ledger does not exist' },
  });

  const testSink = path.resolve(process.cwd(), 'data', 'sync', 'test_e82_pipeline_health.jsonl');
  if (fs.existsSync(testSink)) fs.unlinkSync(testSink);

  const fixtureInput = {
    fixtureId: 'fix_e82_health_test',
    homeTeam: 'Arsenal',
    awayTeam: 'Tottenham',
    league: 'Premier League',
    kickoffUtc: new Date(Date.now() + 30 * 3600 * 1000).toISOString(),
    pinnacleOdds: {
      ah: { line: -0.5, homeOdds: 1.95, awayOdds: 1.95 },
      ou: { line: 2.5, overOdds: 1.90, underOdds: 1.95 },
      btts: { yesOdds: 1.80, noOdds: 2.05 },
    },
  };

  // Run pipeline requesting database persistence with a failing DB client
  const cycle = await DailyPredictionRefreshService.runDailyRefresh({
    mode: 'RESEARCH',
    fixtures: [fixtureInput],
    persistToDatabase: true,
    allowProductionWrite: true,
    dbClient: failingDb,
    destinationPath: testSink,
    dryRun: false,
  });

  // F-02 Invariant: Storage failure must degrade pipelineHealth from SUCCESS to PARTIAL
  assert.equal(cycle.report.pipelineHealth, 'PARTIAL', 'Pipeline health must degrade to PARTIAL when DB write fails');
  assert.equal(cycle.report.isDurableAcrossRestarts, false, 'Durability must be false in report');
  assert.equal(cycle.report.storageTarget, 'LOCAL_FALLBACK_FILE', 'Storage target must reflect local fallback');

  if (fs.existsSync(testSink)) fs.unlinkSync(testSink);
});

test('EPIC 82 — Scenario 5: Dribble360 Research Asset Inventory & Integrity Verification', () => {
  const inventory = Dribble360ResearchAdapter.getInventorySummary();

  assert.equal(inventory.snapshotId, 'snapshot_20261008_v1');
  assert.equal(inventory.totalSnapshotFiles, 225);
  assert.equal(inventory.totalSnapshotRecords, 119694);
  assert.equal(inventory.workingTreeFileCount, 441);
  assert.equal(inventory.autoResolvedMatchCount, 4834);
  assert.equal(inventory.autoResolvedTeamCount, 113);
  assert.equal(inventory.hasBettingOdds, false, 'Must assert hasBettingOdds: false');
  assert.equal(inventory.exposeRawCapturesPublicly, false, 'Raw captures must remain shielded');
  assert.ok(inventory.competitionsCovered.length >= 5, 'Must cover at least Big 5 leagues');
  assert.ok(inventory.seasonsCovered.length >= 6, 'Must cover 6+ seasons');
});

test('EPIC 82 — Scenario 6: Dribble360 Auto-Resolved Match Loading & Empirical Goal Stats', () => {
  const eplMatches = Dribble360ResearchAdapter.loadAutoResolvedMatches({ league: 'ENG-PL' });

  assert.ok(eplMatches.length >= 2000, `Must load at least 2,000 EPL matches, found ${eplMatches.length}`);

  // Verify first 10 matches have 100% verified final scores and ZERO odds
  for (const m of eplMatches.slice(0, 10)) {
    assert.equal(m.resolutionStatus, 'AUTO_RESOLVED');
    assert.equal(m.scoresMatch, true);
    assert.ok(typeof m.homeScore === 'number');
    assert.ok(typeof m.awayScore === 'number');
    assert.equal(m.odds, null, 'Odds must be strictly null (no fabricated odds)');
  }

  // Compute empirical goal statistics
  const stats = Dribble360ResearchAdapter.computeEmpiricalGoalStats('ENG-PL');
  assert.ok(stats !== null);
  assert.ok(stats.matchesEvaluated >= 2000);
  assert.ok(stats.totalGoalsAverage > 2.0 && stats.totalGoalsAverage < 3.5, 'Average goals must be realistic');
  assert.ok(stats.homeWinPct > 35 && stats.homeWinPct < 55, 'Home win pct must be realistic');
});

test('EPIC 82 — Scenario 7: Strict Odds Absence Proof & Anti-Hallucination Assertion', () => {
  // Must execute without error, proving Dribble360 has no betting odds
  assert.doesNotThrow(() => {
    Dribble360ResearchAdapter.assertNoOddsAvailable();
  });

  const summary = Dribble360ResearchAdapter.getInventorySummary();
  assert.equal(summary.hasBettingOdds, false);
  assert.ok(summary.oddsAbsenceProof.includes('Unknown dataset'));
});

test('EPIC 82 — Scenario 8: Zero Provider Quota Egress & Pre-Flight Hard-Stop', async () => {
  // Verify OddsPapi quota guard reports billable request not permitted (quota exhausted / circuit open)
  const quotaStatus = await OddsPapiQuotaGuard.checkQuota();
  assert.equal(quotaStatus.allowed, false, 'OddsPapi billable requests must be blocked by quota guard');

  // Verify production database write is fail-closed in test environment
  const isWriteAllowed = OddsPapiQuotaGuard.isProductionDatabaseWriteAllowed(true);
  assert.equal(isWriteAllowed, false, 'Production DB writes must be blocked in test environment');
});

test('EPIC 82 — Scenario 9: Cryptographic Immutability of the 3 Protected Historical Ledgers', () => {
  verifyProtectedHashes();
});
