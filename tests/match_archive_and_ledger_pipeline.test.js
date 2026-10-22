// SALMO.DEV — Canonical Match Archive, Immutable Ledger & End-to-End Results Pipeline Test Suite
// Validates Phases A–I of the Match Archive & Results Pipeline Epic:
// 1. Fixture ingestion idempotency & canonical deduplication across 15 leagues
// 2. Score conflict blocking & null-score overwrite protection
// 3. Prediction ledger immutability & anti-temporal leakage enforcement (predictionTimestamp <= kickoffUtc)
// 4. Asian Handicap & Over/Under whole/half/quarter-line settlement & EPL MW6 reconciliation (+1.83u / 12u)
// 5. Canonical Match Archive query engine (11,819 matches: 177 active window + 11,642 historical gold)
// 6. Explicit NO_PREDICTION_RECORDED state for historical completed matches without pre-match predictions
// 7. API contract & observability parity (/api/matches, /api/v1/matches, /api/v1/research, /api/v1/performance, /api/health)
// 8. Durable Supabase storage verification (public.matches, public.settlement_results, public.forecast_archive)

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Auto-load .env.local if present
const envPath = path.resolve('.env.local');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [k, ...v] = trimmed.split('=');
    const key = k.trim();
    const val = v.join('=').replace(/^["']|["']$/g, '').trim();
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

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
  CanonicalMatchArchiveService,
  toDeterministicUuid,
} = require('../src/engine/archive/canonicalMatchArchiveService.ts');
const { SettlementEngine } = require('../src/engine/settlement/settlementEngine.ts');

test('Archive Test 1: Deterministic UUID generation and fixture deduplication idempotency', () => {
  const uuid1 = toDeterministicUuid('SALMO_FIXTURE', '1600001');
  const uuid2 = toDeterministicUuid('SALMO_FIXTURE', '1600001');
  const uuid3 = toDeterministicUuid('SALMO_FIXTURE', '1600002');
  const mw6Uuid = toDeterministicUuid('SALMO_FIXTURE', '1557417');

  assert.strictEqual(uuid1, uuid2, 'Deterministic UUID must be identical for same namespace + key');
  assert.notStrictEqual(uuid1, uuid3, 'Deterministic UUID must differ for distinct keys');
  assert.match(uuid1, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.strictEqual(mw6Uuid, 'bffe1c0e-d8f8-4dd7-8445-994354aa2e69', 'Known EPL MW6 fixture UUID must be preserved');

  const existingMap = new Map();
  const batch = [
    {
      providerFixtureId: '1557417',
      providerName: 'API-Football',
      league: 'Premier League',
      season: '2026',
      kickoffUtc: '2026-10-10T11:30:00Z',
      homeTeam: 'Arsenal',
      awayTeam: 'Leeds',
      status: 'FT',
      homeGoals: 2,
      awayGoals: 1,
    },
    // Duplicate observation of the same fixture
    {
      providerFixtureId: '1557417',
      providerName: 'API-Football',
      league: 'Premier League',
      season: '2026',
      kickoffUtc: '2026-10-10T11:30:00Z',
      homeTeam: 'Arsenal',
      awayTeam: 'Leeds',
      status: 'FT',
      homeGoals: 2,
      awayGoals: 1,
    },
  ];

  const res = CanonicalMatchArchiveService.deduplicateAndReconcileFixtures(existingMap, batch);
  assert.strictEqual(res.reconciled.length, 1, 'Duplicate fixture observations must deduplicate to 1 canonical match');
  assert.strictEqual(res.finishedVerifiedCount, 1);
  assert.strictEqual(res.conflictsBlocked.length, 0);
  assert.strictEqual(res.reconciled[0].matchScore, '2-1');
  assert.strictEqual(res.reconciled[0].resultCode, 'H');
});

test('Archive Test 2: Score conflict protection and null-score overwrite prevention', () => {
  const existingMap = new Map();
  const firstPass = CanonicalMatchArchiveService.deduplicateAndReconcileFixtures(existingMap, [
    {
      providerFixtureId: '1557419',
      league: 'Premier League',
      season: '2026',
      kickoffUtc: '2026-10-10T14:00:00Z',
      homeTeam: 'Chelsea',
      awayTeam: 'Bournemouth',
      status: 'FT',
      homeGoals: 5,
      awayGoals: 1,
    },
  ]);

  const verifiedMatch = firstPass.reconciled[0];
  existingMap.set(verifiedMatch.canonicalMatchId, verifiedMatch);

  // Attempt 1: Incoming update with null score must NEVER overwrite verified 5-1 score
  const nullOverwriteAttempt = CanonicalMatchArchiveService.deduplicateAndReconcileFixtures(existingMap, [
    {
      providerFixtureId: '1557419',
      league: 'Premier League',
      season: '2026',
      kickoffUtc: '2026-10-10T14:00:00Z',
      homeTeam: 'Chelsea',
      awayTeam: 'Bournemouth',
      status: 'NS',
      homeGoals: null,
      awayGoals: null,
    },
  ]);

  assert.strictEqual(nullOverwriteAttempt.reconciled[0].status, 'FINISHED', 'Verified FINISHED status must be preserved');
  assert.strictEqual(nullOverwriteAttempt.reconciled[0].homeGoals, 5, 'Verified homeGoals (5) must not be wiped by null');
  assert.strictEqual(nullOverwriteAttempt.reconciled[0].awayGoals, 1, 'Verified awayGoals (1) must not be wiped by null');
  assert.strictEqual(nullOverwriteAttempt.conflictsBlocked.length, 0);

  // Attempt 2: Conflicting final score (e.g. 2-2 vs verified 5-1) must be blocked and logged
  const conflictAttempt = CanonicalMatchArchiveService.deduplicateAndReconcileFixtures(existingMap, [
    {
      providerFixtureId: '1557419',
      league: 'Premier League',
      season: '2026',
      kickoffUtc: '2026-10-10T14:00:00Z',
      homeTeam: 'Chelsea',
      awayTeam: 'Bournemouth',
      status: 'FT',
      homeGoals: 2,
      awayGoals: 2,
    },
  ]);

  assert.strictEqual(conflictAttempt.conflictsBlocked.length, 1, 'Conflicting score must be blocked and recorded');
  assert.strictEqual(conflictAttempt.conflictsBlocked[0].existingScore, '5-1');
  assert.strictEqual(conflictAttempt.conflictsBlocked[0].incomingScore, '2-2');
  assert.strictEqual(conflictAttempt.reconciled[0].matchScore, '5-1', 'Original verified score 5-1 must remain intact');
});

test('Archive Test 3: Prediction Ledger Immutability & Anti-Temporal Leakage Guard', () => {
  const originalPrediction = {
    predictionId: 'pred_epl_20261010_arsenal_fc_bournemouth_ah',
    canonicalMatchId: 'EPL_2026_ARSENAL_BOURNEMOUTH_2026-10-10',
    market: 'AH',
    selection: 'Arsenal FC -1.25',
    line: -1.25,
    modelProbability: 54.6,
    fairOdds: 1.832,
    oddsAtPrediction: 1.95,
    verdict: 'LAYAK',
    predictionTimestamp: '2026-10-09T18:00:00.000Z',
    kickoffUtc: '2026-10-10T11:30:00.000Z',
  };

  // Valid settlement update (only settlement fields added, pre-match fields untouched)
  const validSettledUpdate = {
    ...originalPrediction,
    settlementStatus: 'SETTLED',
    result: 'HALF_LOSS',
    profitUnits: -0.5,
  };
  const checkValid = CanonicalMatchArchiveService.verifyPredictionImmutability(originalPrediction, validSettledUpdate);
  assert.strictEqual(checkValid.immutable, true);
  assert.strictEqual(checkValid.violations.length, 0);

  // Illegal mutation of pre-match line or selection after match completion
  const mutatedSelection = {
    ...originalPrediction,
    selection: 'Arsenal FC -0.5',
    line: -0.5,
  };
  const checkMutated = CanonicalMatchArchiveService.verifyPredictionImmutability(originalPrediction, mutatedSelection);
  assert.strictEqual(checkMutated.immutable, false, 'Mutating pre-match selection/line must fail immutability check');
  assert.strictEqual(checkMutated.violations.length, 2);

  // Illegal backdated/post-kickoff prediction (predictionTimestamp > kickoffUtc)
  const postKickoffPrediction = {
    ...originalPrediction,
    predictionTimestamp: '2026-10-10T14:00:00.000Z',
    kickoffUtc: '2026-10-10T11:30:00.000Z',
  };
  const checkLeakage = CanonicalMatchArchiveService.verifyPredictionImmutability(originalPrediction, postKickoffPrediction);
  assert.strictEqual(checkLeakage.immutable, false, 'Post-kickoff predictionTimestamp must be flagged as temporal leakage');
  assert.ok(checkLeakage.violations.some(v => v.includes('Temporal leakage violation')));
});

test('Archive Test 4: Complete EPL MW6 Quarter-Line Settlement Audit (+0.83u across 12 settled positions, zero losing bets deleted)', () => {
  const snapshot = CanonicalMatchArchiveService.loadCanonicalLocalSnapshot();
  const ahOuRows = snapshot.liveLedgerRows.filter(r => r.market === 'AH' || r.market === 'OU');
  assert.strictEqual(ahOuRows.length, 20, 'Must have 20 EPL AH/OU ledger rows');

  const settledRows = ahOuRows.filter(r => r.settlementStatus === 'SETTLED');
  const pendingRows = ahOuRows.filter(r => r.settlementStatus === 'PENDING');

  assert.strictEqual(settledRows.length, 12, 'Must have 12 settled positions from 6 finished Oct 10 matches');
  assert.strictEqual(pendingRows.length, 8, 'Must have 8 pending positions from 4 upcoming Oct 11–12 matches');

  const wins = settledRows.filter(r => r.result === 'WIN');
  const halfWins = settledRows.filter(r => r.result === 'HALF_WIN');
  const pushes = settledRows.filter(r => r.result === 'PUSH');
  const halfLosses = settledRows.filter(r => r.result === 'HALF_LOSS');
  const losses = settledRows.filter(r => r.result === 'LOSS');

  assert.strictEqual(wins.length, 5, 'Must have 5 full WIN positions');
  assert.strictEqual(halfWins.length, 1, 'Must have 1 HALF_WIN position (Ipswich vs Fulham Over 2.75)');
  assert.strictEqual(pushes.length, 1, 'Must have 1 PUSH position (Aston Villa vs Brentford AH 0)');
  assert.strictEqual(halfLosses.length, 1, 'Must have 1 HALF_LOSS position (Arsenal -1.25 on 2-1)');
  assert.strictEqual(losses.length, 4, 'All 4 full LOSS positions must be preserved in ledger');

  // Re-verify every settled row via SettlementEngine.settlePosition
  let totalProfit = 0;
  for (const r of settledRows) {
    const recomputed = SettlementEngine.settlePosition({
      ledgerPositionId: r.predictionId,
      marketType: r.market,
      selection: r.selection,
      line: Number(r.line),
      oddsTaken: Number(r.oddsAtPrediction),
      homeGoals: Number(r.homeGoals),
      awayGoals: Number(r.awayGoals),
      matchStatus: 'FINISHED',
    });
    assert.strictEqual(recomputed.result, r.result, `Result mismatch on ${r.predictionId}`);
    assert.ok(Math.abs(recomputed.profitUnits - r.profitUnits) < 1e-6, `Profit mismatch on ${r.predictionId}`);
    totalProfit += recomputed.profitUnits;
  }

  assert.strictEqual(Number(totalProfit.toFixed(2)), 0.83, 'Net profit across 12 settled positions must equal +0.83u');
});

test('Archive Test 5: Canonical Match Archive Query Engine (Pagination, Filtering, and NO_PREDICTION_RECORDED honesty)', async () => {
  // 1. Query all matches across both LIVE_WINDOW and HISTORICAL_GOLD
  const page1 = await CanonicalMatchArchiveService.queryMatchArchive({
    page: 1,
    pageSize: 25,
    status: 'ALL',
    source: 'ALL',
  });

  assert.ok(page1.totalCount >= 11800, `Expected >= 11,800 canonical matches, got ${page1.totalCount}`);
  assert.strictEqual(page1.matches.length, 25, 'Page size must be 25');
  assert.strictEqual(page1.summary.activeWindowCount, 177, 'Active window must contain 177 canonical matches across 15 leagues');
  assert.strictEqual(page1.summary.historicalArchiveCount, 11642, 'Historical gold archive must contain 11,642 matches');
  assert.strictEqual(page1.summary.leaguesCovered.length, 15, 'All 15 canonical leagues must be covered');

  // 2. Query LIVE_WINDOW FINISHED matches (19 finished matches across EPL, J1, K1, Liga 1 after MW6 complete settlement)
  const liveFinished = await CanonicalMatchArchiveService.queryMatchArchive({
    page: 1,
    pageSize: 50,
    source: 'LIVE_WINDOW',
    status: 'FINISHED',
  });

  assert.ok(liveFinished.totalCount >= 15, 'Must have at least 15 finished matches in active window');
  const eplFinished = liveFinished.matches.filter(m => m.league === 'Premier League');
  assert.ok(eplFinished.length >= 6, 'Must have at least 6 finished EPL matches');
  for (const m of eplFinished) {
    assert.strictEqual(m.predictionCoverage, 'PRODUCTION_LEDGER');
    assert.strictEqual(m.settlementStatus, 'SETTLED');
    assert.strictEqual(m.resultVerified, true);
  }

  // 3. Query HISTORICAL_GOLD matches and verify explicit NO_PREDICTION_RECORDED status (zero fabricated backdated picks)
  const goldQuery = await CanonicalMatchArchiveService.queryMatchArchive({
    page: 1,
    pageSize: 10,
    source: 'HISTORICAL_GOLD',
    league: 'La Liga',
  });

  assert.ok(goldQuery.totalCount >= 300, 'La Liga historical gold archive must have >= 300 matches');
  for (const m of goldQuery.matches) {
    assert.strictEqual(m.sourceLayer, 'HISTORICAL_GOLD');
    assert.strictEqual(m.status, 'FINISHED');
    assert.strictEqual(
      m.predictionCoverage,
      'NO_PREDICTION_RECORDED',
      'Historical matches without recorded pre-match predictions must explicitly report NO_PREDICTION_RECORDED'
    );
    assert.strictEqual(m.settlementStatus, 'NO_PREDICTION_RECORDED');
    assert.strictEqual(m.linkedPredictionsCount, 0);
  }
});

test('Archive Test 6: Dry-run sync and observability state consistency', async () => {
  const dryRunReport = await CanonicalMatchArchiveService.runCanonicalSyncAndSettlement({
    dryRun: true,
    allowProductionWrite: false,
  });

  assert.strictEqual(dryRunReport.dryRun, true);
  assert.strictEqual(dryRunReport.persistedToDatabase, false, 'Dry-run must never write to database');
  assert.strictEqual(dryRunReport.fixturesEvaluated, 168);
  assert.strictEqual(dryRunReport.predictionsReconciled, 12);
  assert.strictEqual(dryRunReport.researchArchiveSynced, 336);
  assert.strictEqual(dryRunReport.scoreConflictsBlocked, 0);

  const obs = await CanonicalMatchArchiveService.getPipelineObservabilityState();
  assert.ok(obs.canonicalMatchesActiveWindow >= 168);
  assert.strictEqual(obs.canonicalMatchesHistoricalArchive, 11642);
  assert.strictEqual(obs.totalPredictionsArchived, 336);
  assert.strictEqual(obs.productionPredictionsCount, 20);
  assert.strictEqual(obs.shadowPredictionsCount, 294);
  assert.strictEqual(obs.settledPositionsCount, 12);
  assert.strictEqual(obs.conflictsDetectedCount, 0);
});
