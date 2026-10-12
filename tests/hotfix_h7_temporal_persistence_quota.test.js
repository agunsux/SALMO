// SALMO.DEV — Hotfix H7 Regression Test Suite
// Validates:
// P1: Temporal Integrity & Retrospective Row Exclusion (4 separated timestamps, 20 VALID_PRE_MATCH, 144 RETROSPECTIVE_EXCLUDED, 172 UNVERIFIED_TIMESTAMP_PROVENANCE, non-EPL Brier exclusion, quarter-line settlement)
// P2: Production Prediction Persistence Safety (default-false write flags, OddsPapiQuotaGuard boundary enforcement, SHADOW/PAUSED/BTTS exclusion from daily_picks, predictions, and prediction_ledger)
// P3: OddsPAPI Request-Budget Optimization (0 calls to /v4/fixtures, 1-2 calls to /v4/odds-by-tournaments, fail-closed on missing/stale canonical fixtures or invalid tournament mappings)

const test = require('node:test');
const assert = require('node:assert');
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
  evaluateRowTemporalIntegrity,
  isKnownBatchPlaceholderTimestamp,
} = require('../src/engine/archive/temporalIntegrityGuard.ts');
const {
  SettlementEngine,
} = require('../src/engine/settlement/settlementEngine.ts');
const {
  ProductionPredictionEngine,
} = require('../src/engine/pipeline/productionPredictionEngine.ts');
const {
  MultiLeagueAutoActivator,
} = require('../src/engine/activation/multiLeagueAutoActivator.ts');
const {
  OddsPapiQuotaGuard,
} = require('../src/lib/quota/oddsPapiQuotaGuard.ts');
const {
  OddsPapiProvider,
} = require('../src/services/providers/oddsPapiProvider.ts');
const {
  resetRegistryToDefaultState,
} = require('../src/config/multiLeagueRegistry.ts');
const {
  runDryRunAudit,
} = require('../scripts/dry_run_retrospective_archive_annotations.js');

// ─── P1: TEMPORAL INTEGRITY & RETROSPECTIVE ROW EXCLUSION ────────────────────

test('P1.1: prediction_timestamp < kickoff_utc with verified provenance is VALID_PRE_MATCH and eligible for pre-match metrics', () => {
  const res = evaluateRowTemporalIntegrity(
    {
      createdAt: '2026-10-06T21:36:08.532Z',
      kickoffUtc: '2026-10-10T11:30:00.000Z',
      leagueId: 'ENG-PL',
      ledgerTier: 'PRODUCTION',
      source: 'EPL_PRODUCTION_VERIFIED_LEDGER',
      sourceDataTimestamp: '2026-10-06T21:30:00.000Z',
    },
    {
      verifiedPredictionTimestamp: '2026-10-06T21:36:08.532Z',
      verifiedSourceDataTimestamp: '2026-10-06T21:30:00.000Z',
      hasVerifiedPreMatchProvenance: true,
    }
  );

  assert.strictEqual(res.temporalEligibilityStatus, 'VALID_PRE_MATCH');
  assert.strictEqual(res.eligibleForPreMatchMetrics, true);
  assert.strictEqual(res.provenanceVerified, true);
  assert.strictEqual(res.predictionTimestamp, '2026-10-06T21:36:08.532Z');
  assert.strictEqual(res.sourceDataTimestamp, '2026-10-06T21:30:00.000Z');
  assert.strictEqual(res.archiveCreatedAt, '2026-10-06T21:36:08.532Z');
  assert.strictEqual(res.kickoffUtc, '2026-10-10T11:30:00.000Z');
});

test('P1.2: prediction_timestamp == kickoff_utc is RETROSPECTIVE_EXCLUDED', () => {
  const res = evaluateRowTemporalIntegrity(
    {
      predictionTimestamp: '2026-10-11T05:00:00.000Z',
      createdAt: '2026-10-11T05:00:00.000Z',
      kickoffUtc: '2026-10-11T05:00:00+00:00',
      leagueId: 'KOR-K1',
    },
    { hasVerifiedPreMatchProvenance: true }
  );

  assert.strictEqual(res.temporalEligibilityStatus, 'RETROSPECTIVE_EXCLUDED');
  assert.strictEqual(res.eligibleForPreMatchMetrics, false);
  assert.ok(res.temporalExclusionReason?.includes('Retrospective evaluation excluded'));
});

test('P1.3: prediction_timestamp > kickoff_utc is RETROSPECTIVE_EXCLUDED', () => {
  const res = evaluateRowTemporalIntegrity(
    {
      predictionTimestamp: '2026-10-11T05:00:00.000Z',
      createdAt: '2026-10-11T05:00:00.000Z',
      kickoffUtc: '2026-10-10T05:00:00+00:00',
      leagueId: 'JPN-J1',
    },
    { hasVerifiedPreMatchProvenance: true }
  );

  assert.strictEqual(res.temporalEligibilityStatus, 'RETROSPECTIVE_EXCLUDED');
  assert.strictEqual(res.eligibleForPreMatchMetrics, false);
  assert.ok(res.temporalExclusionReason?.includes('Retrospective evaluation excluded'));
});

test('P1.4: missing prediction_timestamp and createdAt is excluded from pre-match metrics', () => {
  const res = evaluateRowTemporalIntegrity({
    predictionTimestamp: null,
    createdAt: null,
    kickoffUtc: '2026-10-12T15:00:00Z',
    leagueId: 'ESP-LALIGA',
  });

  assert.strictEqual(res.temporalEligibilityStatus, 'MISSING_PREDICTION_TIMESTAMP');
  assert.strictEqual(res.eligibleForPreMatchMetrics, false);
  assert.strictEqual(res.predictionTimestamp, null);
});

test('P1.5: invalid timestamp format is excluded from pre-match metrics', () => {
  const badPred = evaluateRowTemporalIntegrity({
    predictionTimestamp: 'not-a-valid-iso-timestamp',
    createdAt: 'not-a-valid-iso-timestamp',
    kickoffUtc: '2026-10-12T15:00:00Z',
    leagueId: 'ENG-PL',
  });
  assert.strictEqual(badPred.temporalEligibilityStatus, 'INVALID_PREDICTION_TIMESTAMP');
  assert.strictEqual(badPred.eligibleForPreMatchMetrics, false);

  const badKickoff = evaluateRowTemporalIntegrity({
    predictionTimestamp: '2026-10-06T21:36:08.532Z',
    createdAt: '2026-10-06T21:36:08.532Z',
    kickoffUtc: 'invalid-kickoff',
    leagueId: 'ENG-PL',
  });
  assert.strictEqual(badKickoff.temporalEligibilityStatus, 'INVALID_KICKOFF_TIMESTAMP');
  assert.strictEqual(badKickoff.eligibleForPreMatchMetrics, false);
});

test('P1.6: untrusted created_at placeholder timestamp (2026-10-11T05:00:00.000Z) without verified prediction-time provenance is excluded even when kickoff is later', () => {
  assert.strictEqual(isKnownBatchPlaceholderTimestamp('2026-10-11T05:00:00.000Z'), true);

  const res = evaluateRowTemporalIntegrity({
    createdAt: '2026-10-11T05:00:00.000Z',
    kickoffUtc: '2026-10-11T19:00:00+00:00',
    leagueId: 'ESP-LALIGA',
    ledgerTier: 'SHADOW',
    source: 'MULTI_LEAGUE_POISSON_RATINGS_V1.0',
  });

  assert.strictEqual(res.temporalEligibilityStatus, 'UNVERIFIED_TIMESTAMP_PROVENANCE');
  assert.strictEqual(res.eligibleForPreMatchMetrics, false);
  assert.strictEqual(res.provenanceVerified, false);
  assert.strictEqual(res.isBatchPlaceholderTimestamp, true);
  assert.strictEqual(res.predictionTimestamp, null);
  assert.strictEqual(res.archiveCreatedAt, '2026-10-11T05:00:00.000Z');
});

test('P1.7: 336-row canonical research ledger dry-run classifies 20 VALID_PRE_MATCH, 144 RETROSPECTIVE_EXCLUDED, and 172 UNVERIFIED_TIMESTAMP_PROVENANCE without mutating files', () => {
  const ledgerPath = path.join(process.cwd(), 'data/verification/all_leagues_research_ledger.jsonl');
  const beforeContent = fs.readFileSync(ledgerPath, 'utf8');

  const report = runDryRunAudit();

  const afterContent = fs.readFileSync(ledgerPath, 'utf8');
  assert.strictEqual(beforeContent, afterContent, 'Dry-run must not mutate historical archive file');

  assert.strictEqual(report.summary.totalRowsInspected, 336);
  assert.strictEqual(report.summary.validPreMatchCount, 20);
  assert.strictEqual(report.summary.confirmedRetrospectiveExcludedCount, 144);
  assert.strictEqual(report.summary.unverifiedTimestampProvenanceCount, 172);
  assert.strictEqual(report.summary.unverifiedBreakdown.kickoffAtOrBeforeBatchCommit_1ad1b70, 70);
  assert.strictEqual(report.summary.unverifiedBreakdown.kickoffAfterBatchCommit_1ad1b70, 102);
  assert.strictEqual(report.summary.eligiblePreMatchWithFinalScoreCount, 12);
  assert.strictEqual(report.summary.excludedRetrospectiveWithFinalScoreCount, 16);

  // Verify non-EPL leagues with FT scores (J1 League, K League 1, Liga 1) have 0 VALID_PRE_MATCH rows
  for (const lgName of ['J1 League', 'K League 1', 'Liga 1']) {
    const lgEntry = report.perLeagueBreakdown.find(l => l.league === lgName);
    assert.ok(lgEntry, `Must have per-league breakdown for ${lgName}`);
    assert.strictEqual(lgEntry.VALID_PRE_MATCH, 0, `${lgName} must have 0 VALID_PRE_MATCH rows`);
    assert.ok(lgEntry.excludedWithFtScore > 0, `${lgName} FT rows must be excluded as retrospective`);
  }
});

test('P1.8: Quarter-line AH and OU settlement remains green for -0.25, +0.25, -0.75, +0.75, 2.25, and 2.75', () => {
  // AH -0.25 on 1-1 draw -> HALF_LOSS (-0.50u)
  const ahMinus025 = SettlementEngine.settlePosition({
    ledgerPositionId: 'q_ah_m025',
    marketType: 'AH',
    selection: 'Arsenal -0.25',
    line: -0.25,
    oddsTaken: 1.96,
    homeGoals: 1,
    awayGoals: 1,
    matchStatus: 'FINISHED',
  });
  assert.strictEqual(ahMinus025.result, 'HALF_LOSS');
  assert.strictEqual(ahMinus025.profitUnits, -0.5);

  // AH +0.25 on 1-1 draw -> HALF_WIN (+0.45u at 1.90)
  const ahPlus025 = SettlementEngine.settlePosition({
    ledgerPositionId: 'q_ah_p025',
    marketType: 'AH',
    selection: 'Arsenal +0.25',
    line: 0.25,
    oddsTaken: 1.90,
    homeGoals: 1,
    awayGoals: 1,
    matchStatus: 'FINISHED',
  });
  assert.strictEqual(ahPlus025.result, 'HALF_WIN');
  assert.strictEqual(Number(ahPlus025.profitUnits.toFixed(2)), 0.45);

  // AH -0.75 on 1-0 win -> HALF_WIN (+0.50u at 2.00)
  const ahMinus075 = SettlementEngine.settlePosition({
    ledgerPositionId: 'q_ah_m075',
    marketType: 'AH',
    selection: 'Arsenal -0.75',
    line: -0.75,
    oddsTaken: 2.00,
    homeGoals: 1,
    awayGoals: 0,
    matchStatus: 'FINISHED',
  });
  assert.strictEqual(ahMinus075.result, 'HALF_WIN');
  assert.strictEqual(Number(ahMinus075.profitUnits.toFixed(2)), 0.5);

  // AH +0.75 on 0-1 loss -> HALF_LOSS (-0.50u)
  const ahPlus075 = SettlementEngine.settlePosition({
    ledgerPositionId: 'q_ah_p075',
    marketType: 'AH',
    selection: 'Arsenal +0.75',
    line: 0.75,
    oddsTaken: 1.92,
    homeGoals: 0,
    awayGoals: 1,
    matchStatus: 'FINISHED',
  });
  assert.strictEqual(ahPlus075.result, 'HALF_LOSS');
  assert.strictEqual(ahPlus075.profitUnits, -0.5);

  // OU 2.25 OVER on 2 total goals -> HALF_LOSS (-0.50u)
  const ou225Over = SettlementEngine.settlePosition({
    ledgerPositionId: 'q_ou_225',
    marketType: 'OU',
    selection: 'Over 2.25',
    line: 2.25,
    oddsTaken: 1.95,
    homeGoals: 1,
    awayGoals: 1,
    matchStatus: 'FINISHED',
  });
  assert.strictEqual(ou225Over.result, 'HALF_LOSS');
  assert.strictEqual(ou225Over.profitUnits, -0.5);

  // OU 2.75 OVER on 3 total goals -> HALF_WIN (+0.45u at 1.90)
  const ou275Over = SettlementEngine.settlePosition({
    ledgerPositionId: 'q_ou_275',
    marketType: 'OU',
    selection: 'Over 2.75',
    line: 2.75,
    oddsTaken: 1.90,
    homeGoals: 2,
    awayGoals: 1,
    matchStatus: 'FINISHED',
  });
  assert.strictEqual(ou275Over.result, 'HALF_WIN');
  assert.strictEqual(Number(ou275Over.profitUnits.toFixed(2)), 0.45);
});

// ─── P2: PRODUCTION PREDICTION PERSISTENCE SAFETY ────────────────────────────

function createMockDbClient() {
  const upserts = {
    predictions: [],
    daily_picks: [],
    prediction_ledger: [],
  };

  return {
    upserts,
    totalWrites() {
      return (
        upserts.predictions.length +
        upserts.daily_picks.length +
        upserts.prediction_ledger.length
      );
    },
    from(table) {
      return {
        upsert(payload) {
          if (upserts[table]) {
            upserts[table].push(payload);
          }
          return Promise.resolve({ data: payload, error: null });
        },
        insert(payload) {
          if (upserts[table]) {
            upserts[table].push(payload);
          }
          return Promise.resolve({ data: payload, error: null });
        },
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return { data: null, error: null };
                },
                eq() {
                  return {
                    eq() {
                      return {
                        async maybeSingle() {
                          return { data: null, error: null };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

function buildTestFixturesForPersistence() {
  const futureKickoff = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
  const capturedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  return [
    // ACTIVE league: Premier League
    {
      fixtureId: '1557501',
      providerFixtureId: '1557501',
      providerName: 'OddsPapi',
      sourceType: 'PROVIDER',
      homeTeam: 'Arsenal',
      awayTeam: 'Chelsea',
      league: 'Premier League',
      kickoffUtc: futureKickoff,
      season: '2026',
      pinnacleOdds: {
        ah: { line: -0.75, homeOdds: 2.08, awayOdds: 1.85, timestampUtc: capturedAt },
        ou: { line: 2.5, overOdds: 2.05, underOdds: 1.87, timestampUtc: capturedAt },
        btts: { yesOdds: 2.10, noOdds: 1.80, timestampUtc: capturedAt },
      },
    },
    // SHADOW league: La Liga
    {
      fixtureId: '1570501',
      providerFixtureId: '1570501',
      providerName: 'OddsPapi',
      sourceType: 'PROVIDER',
      homeTeam: 'Real Madrid',
      awayTeam: 'Barcelona',
      league: 'La Liga',
      kickoffUtc: futureKickoff,
      season: '2026',
      pinnacleOdds: {
        ah: { line: -0.5, homeOdds: 2.15, awayOdds: 1.80, timestampUtc: capturedAt },
        ou: { line: 2.75, overOdds: 2.10, underOdds: 1.82, timestampUtc: capturedAt },
        btts: { yesOdds: 2.05, noOdds: 1.85, timestampUtc: capturedAt },
      },
    },
    // PAUSED league: Liga 1 Indonesia
    {
      fixtureId: '1590501',
      providerFixtureId: '1590501',
      providerName: 'OddsPapi',
      sourceType: 'PROVIDER',
      homeTeam: 'Persib Bandung',
      awayTeam: 'Persija Jakarta',
      league: 'Liga 1 Indonesia',
      kickoffUtc: futureKickoff,
      season: '2026',
      pinnacleOdds: {
        ah: { line: -0.5, homeOdds: 2.10, awayOdds: 1.82, timestampUtc: capturedAt },
        ou: { line: 2.5, overOdds: 2.05, underOdds: 1.85, timestampUtc: capturedAt },
      },
    },
  ];
}

test('P2.1: runPredictionCycle() with default options performs 0 database writes', async () => {
  resetRegistryToDefaultState();
  const mockDb = createMockDbClient();
  const fixtures = buildTestFixturesForPersistence();

  const res = await ProductionPredictionEngine.runPredictionCycle(fixtures, {
    dbClient: mockDb,
    skipLocalFileAppend: true,
  });

  assert.strictEqual(mockDb.totalWrites(), 0, 'Default options must perform 0 DB writes');
  assert.strictEqual(res.persistedPicksCount, 0);
  assert.strictEqual(res.persistedLedgerCount, 0);
});

test('P2.2: persistToDatabase: false or allowProductionWrite: false or ALLOW_PRODUCTION_DB_WRITE !== "true" or VERCEL_ENV === "preview" performs 0 writes', async () => {
  resetRegistryToDefaultState();
  const origAllow = process.env.ALLOW_PRODUCTION_DB_WRITE;
  const origNodeEnv = process.env.NODE_ENV;
  const origCi = process.env.CI;
  const origVercelEnv = process.env.VERCEL_ENV;

  try {
    const fixtures = buildTestFixturesForPersistence();

    // Case A: persistToDatabase: false, allowProductionWrite: true
    process.env.ALLOW_PRODUCTION_DB_WRITE = 'true';
    process.env.NODE_ENV = 'production';
    delete process.env.CI;
    delete process.env.VERCEL_ENV;

    const dbA = createMockDbClient();
    await ProductionPredictionEngine.runPredictionCycle(fixtures, {
      persistToDatabase: false,
      allowProductionWrite: true,
      dbClient: dbA,
      skipLocalFileAppend: true,
    });
    assert.strictEqual(dbA.totalWrites(), 0, 'persistToDatabase: false must perform 0 writes');

    // Case B: persistToDatabase: true, allowProductionWrite: false
    const dbB = createMockDbClient();
    await ProductionPredictionEngine.runPredictionCycle(fixtures, {
      persistToDatabase: true,
      allowProductionWrite: false,
      dbClient: dbB,
      skipLocalFileAppend: true,
    });
    assert.strictEqual(dbB.totalWrites(), 0, 'allowProductionWrite: false must perform 0 writes');

    // Case C: ALLOW_PRODUCTION_DB_WRITE !== 'true'
    delete process.env.ALLOW_PRODUCTION_DB_WRITE;
    const dbC = createMockDbClient();
    await ProductionPredictionEngine.runPredictionCycle(fixtures, {
      persistToDatabase: true,
      allowProductionWrite: true,
      dbClient: dbC,
      skipLocalFileAppend: true,
    });
    assert.strictEqual(dbC.totalWrites(), 0, 'Missing ALLOW_PRODUCTION_DB_WRITE must perform 0 writes');

    // Case D: VERCEL_ENV === 'preview'
    process.env.ALLOW_PRODUCTION_DB_WRITE = 'true';
    process.env.VERCEL_ENV = 'preview';
    const dbD = createMockDbClient();
    await ProductionPredictionEngine.runPredictionCycle(fixtures, {
      persistToDatabase: true,
      allowProductionWrite: true,
      dbClient: dbD,
      skipLocalFileAppend: true,
    });
    assert.strictEqual(dbD.totalWrites(), 0, 'VERCEL_ENV === preview must perform 0 writes');
  } finally {
    if (origAllow === undefined) delete process.env.ALLOW_PRODUCTION_DB_WRITE;
    else process.env.ALLOW_PRODUCTION_DB_WRITE = origAllow;
    if (origNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = origNodeEnv;
    if (origCi === undefined) delete process.env.CI;
    else process.env.CI = origCi;
    if (origVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = origVercelEnv;
  }
});

test('P2.3: When persistence is explicitly authorized, SHADOW and PAUSED leagues and BTTS markets produce 0 writes while ACTIVE EPL writes only AH and OU', async () => {
  resetRegistryToDefaultState();
  const origAllow = process.env.ALLOW_PRODUCTION_DB_WRITE;
  const origNodeEnv = process.env.NODE_ENV;
  const origCi = process.env.CI;
  const origVercelEnv = process.env.VERCEL_ENV;

  try {
    process.env.ALLOW_PRODUCTION_DB_WRITE = 'true';
    process.env.NODE_ENV = 'production';
    delete process.env.CI;
    delete process.env.VERCEL_ENV;

    const fixtures = buildTestFixturesForPersistence();
    const mockDb = createMockDbClient();

    // 1. Test SHADOW + PAUSED fixtures only -> 0 writes across all tables
    const shadowAndPausedOnly = fixtures.filter(f => f.league !== 'Premier League');
    const shadowDb = createMockDbClient();
    await ProductionPredictionEngine.runPredictionCycle(shadowAndPausedOnly, {
      persistToDatabase: true,
      allowProductionWrite: true,
      dbClient: shadowDb,
      skipLocalFileAppend: true,
    });
    assert.strictEqual(shadowDb.upserts.daily_picks.length, 0, 'SHADOW/PAUSED must write 0 rows to daily_picks');
    assert.strictEqual(shadowDb.upserts.predictions.length, 0, 'SHADOW/PAUSED must write 0 rows to predictions');
    assert.strictEqual(shadowDb.upserts.prediction_ledger.length, 0, 'SHADOW/PAUSED must write 0 rows to prediction_ledger');

    // 2. Test mixed ACTIVE EPL + SHADOW La Liga + PAUSED Liga 1 -> only ACTIVE EPL (AH and OU, never BTTS) is persisted
    await ProductionPredictionEngine.runPredictionCycle(fixtures, {
      persistToDatabase: true,
      allowProductionWrite: true,
      dbClient: mockDb,
      skipLocalFileAppend: true,
    });

    assert.strictEqual(mockDb.upserts.daily_picks.length, 2, 'Only 2 ACTIVE EPL market rows (AH and OU) may be written to daily_picks');
    for (const pick of mockDb.upserts.daily_picks) {
      assert.strictEqual(pick.league, 'Premier League', 'Only Premier League may be written to daily_picks');
      assert.ok(
        pick.market_type === 'ASIAN_HANDICAP' || pick.market_type === 'OVER_UNDER',
        `Only AH and OU may be written to daily_picks, got ${pick.market_type}`
      );
      assert.notStrictEqual(pick.market_type, 'BTTS', 'BTTS must never be written to daily_picks');
    }

    assert.strictEqual(mockDb.upserts.predictions.length, 2, 'Only 2 ACTIVE EPL market rows (AH and OU) may be written to predictions');
    for (const pred of mockDb.upserts.predictions) {
      assert.strictEqual(pred.home_team, 'Arsenal');
      assert.ok(
        pred.market_type === 'AH' || pred.market_type === 'OU',
        `Only AH and OU may be written to predictions, got ${pred.market_type}`
      );
    }

    for (const ledgerRow of mockDb.upserts.prediction_ledger) {
      assert.strictEqual(ledgerRow.competition_id, 39, 'Only Premier League (competition_id=39) may be written to prediction_ledger');
      assert.ok(ledgerRow.market === 'AH' || ledgerRow.market === 'OU', `Only AH and OU allowed in prediction_ledger, got ${ledgerRow.market}`);
    }
  } finally {
    if (origAllow === undefined) delete process.env.ALLOW_PRODUCTION_DB_WRITE;
    else process.env.ALLOW_PRODUCTION_DB_WRITE = origAllow;
    if (origNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = origNodeEnv;
    if (origCi === undefined) delete process.env.CI;
    else process.env.CI = origCi;
    if (origVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = origVercelEnv;
  }
});

// ─── P3: ODDSPAPI REQUEST-BUDGET OPTIMIZATION ────────────────────────────────

function buildMockAccount(requestCount, requestLimit = 250) {
  return {
    api_key: '[REDACTED]',
    subscriptions: [
      {
        plan: 'free',
        is_active: true,
        request_limit: requestLimit,
        request_count: requestCount,
        valid_from: '2026-10-01T00:00:00.000Z',
        valid_until: null,
        sport_ids: [10],
        bookmakers: {
          pinnacle: { has_live_odds: true },
        },
      },
    ],
  };
}

test('P3.1: MultiLeagueAutoActivator makes 0 calls to /v4/fixtures; <= 5 priority leagues make 1 /v4/odds-by-tournaments call; 8 priority leagues make 2 /v4/odds-by-tournaments calls', async () => {
  resetRegistryToDefaultState();
  OddsPapiQuotaGuard.resetCircuitBreaker();

  const origGetFixtures = OddsPapiProvider.prototype.getUpcomingFixtures;
  const origGetTournamentOdds = OddsPapiProvider.prototype.getTournamentOdds;
  const origCheckQuota = OddsPapiQuotaGuard.checkQuota;

  let getUpcomingFixturesCalls = 0;
  let getTournamentOddsCalls = [];

  try {
    OddsPapiProvider.prototype.getUpcomingFixtures = async function () {
      getUpcomingFixturesCalls += 1;
      throw new Error('/v4/fixtures must NEVER be called by MultiLeagueAutoActivator');
    };

    OddsPapiProvider.prototype.getTournamentOdds = async function (tournamentIds, bookmaker) {
      getTournamentOddsCalls.push({ tournamentIds, bookmaker });
      return {
        status: 'AVAILABLE',
        data: [],
      };
    };

    OddsPapiQuotaGuard.checkQuota = async function () {
      return { allowed: true, reason: 'Allowed in test' };
    };

    const futureKickoff = new Date(Date.now() + 12 * 3600 * 1000).toISOString();

    // Case 1: <= 5 priority leagues have upcoming canonical fixtures -> 1 batch call
    const fiveLeagueFixtures = [
      { providerFixtureId: 'f1', homeTeam: 'Arsenal', awayTeam: 'Chelsea', league: 'Premier League', kickoffTime: futureKickoff },
      { providerFixtureId: 'f2', homeTeam: 'Real Madrid', awayTeam: 'Getafe', league: 'La Liga', kickoffTime: futureKickoff },
      { providerFixtureId: 'f3', homeTeam: 'Bayern Munich', awayTeam: 'Augsburg', league: 'Bundesliga', kickoffTime: futureKickoff },
      { providerFixtureId: 'f4', homeTeam: 'Monaco', awayTeam: 'Lens', league: 'Ligue 1', kickoffTime: futureKickoff },
      { providerFixtureId: 'f5', homeTeam: 'Ajax', awayTeam: 'Twente', league: 'Eredivisie', kickoffTime: futureKickoff },
    ];

    const resFive = await MultiLeagueAutoActivator.runAutoUnlockCycle({
      mode: 'SIMULATED_RESET_TEST',
      injectedAccountData: buildMockAccount(0, 250),
      injectedFixtures: fiveLeagueFixtures,
      writeVerificationArtifact: false,
    });

    assert.strictEqual(getUpcomingFixturesCalls, 0, 'Must make 0 calls to /v4/fixtures');
    assert.strictEqual(getTournamentOddsCalls.length, 1, '<= 5 priority leagues must make exactly 1 /v4/odds-by-tournaments call');
    assert.strictEqual(resFive.billableRequestsMade, 1);
    assert.strictEqual(resFive.batchesQueried.length, 1);
    assert.deepStrictEqual(resFive.batchesQueried[0], [17, 8, 35, 34, 37]);
    assert.strictEqual(getTournamentOddsCalls[0].bookmaker, 'pinnacle');

    // Case 2: 8 priority leagues have upcoming canonical fixtures -> 2 batch calls
    getTournamentOddsCalls = [];
    const eightLeagueFixtures = [
      ...fiveLeagueFixtures,
      { providerFixtureId: 'f6', homeTeam: 'Sporting CP', awayTeam: 'Arouca', league: 'Primeira Liga', kickoffTime: futureKickoff },
      { providerFixtureId: 'f7', homeTeam: 'Inter', awayTeam: 'Cagliari', league: 'Serie A', kickoffTime: futureKickoff },
      { providerFixtureId: 'f8', homeTeam: 'Club Brugge', awayTeam: 'Westerlo', league: 'Belgian Pro League', kickoffTime: futureKickoff },
    ];

    const resEight = await MultiLeagueAutoActivator.runAutoUnlockCycle({
      mode: 'SIMULATED_RESET_TEST',
      injectedAccountData: buildMockAccount(0, 250),
      injectedFixtures: eightLeagueFixtures,
      writeVerificationArtifact: false,
    });

    assert.strictEqual(getUpcomingFixturesCalls, 0, 'Must make 0 calls to /v4/fixtures');
    assert.strictEqual(getTournamentOddsCalls.length, 2, '8 priority leagues must make exactly 2 /v4/odds-by-tournaments calls');
    assert.strictEqual(resEight.billableRequestsMade, 2);
    assert.strictEqual(resEight.batchesQueried.length, 2);
    assert.deepStrictEqual(resEight.batchesQueried[0], [17, 8, 35, 34, 37]);
    assert.deepStrictEqual(resEight.batchesQueried[1], [238, 23, 38]);
  } finally {
    OddsPapiProvider.prototype.getUpcomingFixtures = origGetFixtures;
    OddsPapiProvider.prototype.getTournamentOdds = origGetTournamentOdds;
    OddsPapiQuotaGuard.checkQuota = origCheckQuota;
    resetRegistryToDefaultState();
    OddsPapiQuotaGuard.resetCircuitBreaker();
  }
});

test('P3.2: Missing or stale canonical fixtures fail closed with 0 billable requests and explicit blocker', async () => {
  resetRegistryToDefaultState();
  OddsPapiQuotaGuard.resetCircuitBreaker();

  // Case A: Empty injectedFixtures -> 0 billable requests + BLOCKED_MISSING_CANONICAL_FIXTURES
  const resMissing = await MultiLeagueAutoActivator.runAutoUnlockCycle({
    mode: 'SIMULATED_RESET_TEST',
    injectedAccountData: buildMockAccount(0, 250),
    injectedFixtures: [],
    writeVerificationArtifact: false,
  });
  assert.strictEqual(resMissing.billableRequestsMade, 0);
  assert.ok(resMissing.ingestionBlockerReason?.includes('BLOCKED_MISSING_CANONICAL_FIXTURES'));

  // Case B: Non-existent canonicalFixturesPath -> 0 billable requests + BLOCKED_MISSING_CANONICAL_FIXTURES
  const resNoFile = await MultiLeagueAutoActivator.runAutoUnlockCycle({
    mode: 'SIMULATED_RESET_TEST',
    injectedAccountData: buildMockAccount(0, 250),
    canonicalFixturesPath: path.join(process.cwd(), 'data/verification/does_not_exist.json'),
    writeVerificationArtifact: false,
  });
  assert.strictEqual(resNoFile.billableRequestsMade, 0);
  assert.ok(resNoFile.ingestionBlockerReason?.includes('BLOCKED_MISSING_CANONICAL_FIXTURES'));

  // Case C: Stale canonical fixtures (all kickoff timestamps in the past) -> 0 billable requests + BLOCKED_STALE_CANONICAL_FIXTURES
  const pastKickoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const resStale = await MultiLeagueAutoActivator.runAutoUnlockCycle({
    mode: 'SIMULATED_RESET_TEST',
    injectedAccountData: buildMockAccount(0, 250),
    injectedFixtures: [
      { providerFixtureId: 'old1', homeTeam: 'Arsenal', awayTeam: 'Chelsea', league: 'Premier League', kickoffTime: pastKickoff },
    ],
    writeVerificationArtifact: false,
  });
  assert.strictEqual(resStale.billableRequestsMade, 0);
  assert.ok(resStale.ingestionBlockerReason?.includes('BLOCKED_STALE_CANONICAL_FIXTURES'));
});

test('P3.3: Invalid tournament mapping fails closed with 0 billable requests and explicit blocker', async () => {
  resetRegistryToDefaultState();
  OddsPapiQuotaGuard.resetCircuitBreaker();

  const futureKickoff = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
  const resInvalidMap = await MultiLeagueAutoActivator.runAutoUnlockCycle({
    mode: 'SIMULATED_RESET_TEST',
    injectedAccountData: buildMockAccount(0, 250),
    injectedFixtures: [
      { providerFixtureId: 'f1', homeTeam: 'Arsenal', awayTeam: 'Chelsea', league: 'Premier League', kickoffTime: futureKickoff },
    ],
    tournamentMappingOverride: {
      17: { internal_league_id: 'WRONG-LEAGUE-ID', league_name: 'Wrong League' },
    },
    writeVerificationArtifact: false,
  });

  assert.strictEqual(resInvalidMap.billableRequestsMade, 0);
  assert.ok(resInvalidMap.ingestionBlockerReason?.includes('BLOCKED_INVALID_TOURNAMENT_MAPPING'));
});

test('P3.4: Quota exhausted or within the 50-request reserve makes 0 billable requests', async () => {
  resetRegistryToDefaultState();
  OddsPapiQuotaGuard.resetCircuitBreaker();

  const futureKickoff = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
  const fixtures = [
    { providerFixtureId: 'f1', homeTeam: 'Arsenal', awayTeam: 'Chelsea', league: 'Premier League', kickoffTime: futureKickoff },
  ];

  // Exhausted (260/250)
  const resExhausted = await MultiLeagueAutoActivator.runAutoUnlockCycle({
    mode: 'SIMULATED_RESET_TEST',
    injectedAccountData: buildMockAccount(260, 250),
    injectedFixtures: fixtures,
    writeVerificationArtifact: false,
  });
  assert.strictEqual(resExhausted.quotaDetection.state, 'QUOTA_EXHAUSTED');
  assert.strictEqual(resExhausted.billableRequestsMade, 0);

  // Within 50-request reserve (199/250 -> only 1 operational request above 200 ceiling, below 2 needed for cycle)
  const resReserve = await MultiLeagueAutoActivator.runAutoUnlockCycle({
    mode: 'SIMULATED_RESET_TEST',
    injectedAccountData: buildMockAccount(199, 250),
    injectedFixtures: fixtures,
    writeVerificationArtifact: false,
  });
  assert.strictEqual(resReserve.quotaDetection.state, 'QUOTA_EXHAUSTED');
  assert.strictEqual(resReserve.billableRequestsMade, 0);
});

test('P1.9: /api/v1/research excludes retrospective and unverified rows from Brier, settled counts, verified-score counts, and denominators while keeping them visible in archive', async () => {
  const { GET } = require('../src/app/api/v1/research/route.ts');

  const response = await GET(new Request('http://localhost:3000/api/v1/research'));
  assert.strictEqual(response.status, 200);
  const body = await response.json();

  assert.strictEqual(body.counts.totalArchived, 336, 'All 336 rows remain visible in the archive');
  assert.strictEqual(body.temporalEligibilitySummary.validPreMatchCount, 20);
  assert.strictEqual(body.temporalEligibilitySummary.confirmedRetrospectiveCount, 144);
  assert.strictEqual(body.temporalEligibilitySummary.unverifiedProvenanceCount, 172);
  assert.strictEqual(body.temporalEligibilitySummary.excludedRetrospectiveWithScoreCount, 16);

  assert.strictEqual(body.counts.verifiedFinalScoresCount, 12, 'Only 12 EPL pre-match FT rows count toward verifiedFinalScoresCount');
  assert.strictEqual(body.counts.settled, 12, 'Only 12 EPL pre-match FT rows count toward settledCount');
  assert.strictEqual(body.settlementSummary.settledCount, 12);
  assert.strictEqual(body.counts.excludedRetrospectiveWithScoreCount, 16);

  // Non-EPL leagues with FT scores (J1 League, K League 1, Liga 1) must NOT compute Brier from retrospective rows
  for (const lgName of ['J1 League', 'K League 1', 'Liga 1']) {
    const matrixEntry = body.metricComputabilityMatrix.find(m => m.league === lgName);
    assert.ok(matrixEntry, `Matrix entry must exist for ${lgName}`);
    assert.strictEqual(matrixEntry.computableNow.brier, false, `${lgName} Brier must be false when all FT rows are retrospective`);
    assert.strictEqual(matrixEntry.bootstrap95CI.brier, null, `${lgName} Brier CI must be null`);
    assert.strictEqual(matrixEntry.nEligiblePreMatch, 0);
    assert.ok(matrixEntry.nArchiveScorePresentExcluded > 0);
  }

  // Test temporalStatus query filter
  const validOnlyRes = await GET(new Request('http://localhost:3000/api/v1/research?temporalStatus=VALID_PRE_MATCH'));
  const validOnlyBody = await validOnlyRes.json();
  assert.strictEqual(validOnlyBody.predictions.length, 20);
  assert.ok(validOnlyBody.predictions.every(r => r.temporalEligibilityStatus === 'VALID_PRE_MATCH'));
});
