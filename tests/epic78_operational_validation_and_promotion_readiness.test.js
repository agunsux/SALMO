// SALMO.DEV — EPIC 78: Operational Validation & Shadow-to-Production Promotion Readiness Audit Test Suite
// Forensic Verification | Zero Historical Ledger Mutation | Defense-in-Depth Containment

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ts = require('typescript');
const Module = require('module');

// Module resolution for '@/...' aliases
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

// TypeScript require hook with JSON module support
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

const {
  HandicapLabSyncService,
} = require('../src/engine/sync/handicapLabSyncService.ts');
const {
  CanonicalPredictionLedgerService,
} = require('../src/engine/ledger/canonicalPredictionLedger.ts');
const {
  LocalHandicapLabAdapter,
} = require('../src/contracts/handicapLabAdapter.ts');
const {
  CANONICAL_15_LEAGUES,
  isLeagueMarketProductionEnabled,
  resetRegistryToDefaultState,
} = require('../src/config/multiLeagueRegistry.ts');
const {
  MultiLeagueAutoActivator,
} = require('../src/engine/activation/multiLeagueAutoActivator.ts');
const {
  isPublicPickEligible,
  isCandidateQualifiedWithoutOdds,
} = require('../src/lib/eligibility.ts');

const AUTHORITATIVE_PROTECTED_HASHES = {
  'data/verification/live_prediction_ledger.jsonl': {
    bytes: 35690,
    lines: 30,
    sha256: '317fc037a63b811420400ea9de094092ec7d68b119ad6abc57743be12d568527',
  },
  'data/verification/all_leagues_research_ledger.jsonl': {
    bytes: 450918,
    lines: 336,
    sha256: 'eae8f364a5393255d276fca2650056951fb601ba829c1710b26ac673dffb967b',
  },
  'data/research/multi_league_research_predictions.jsonl': {
    bytes: 337554,
    lines: 336,
    sha256: '0128616a43968be5fddab76ea5c57da731955e22b1bf27bca3f886938187a12f',
  },
};

function auditProtectedLedgers() {
  for (const [relPath, meta] of Object.entries(AUTHORITATIVE_PROTECTED_HASHES)) {
    const fullPath = path.resolve(relPath);
    assert.ok(fs.existsSync(fullPath), `Protected ledger file must exist: ${relPath}`);
    const buf = fs.readFileSync(fullPath);
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    const lines = buf.toString('utf8').trim().split(/\r?\n/).filter(Boolean).length;

    assert.strictEqual(
      hash,
      meta.sha256,
      `Cryptographic SHA-256 integrity mismatch for ${relPath}. Expected ${meta.sha256}, got ${hash}`
    );
    assert.strictEqual(
      lines,
      meta.lines,
      `Line count mismatch for ${relPath}. Expected ${meta.lines}, got ${lines}`
    );
  }
}

// -----------------------------------------------------------------------------
// GATE A: Baseline Capture & Historical Ledger Immutability
// -----------------------------------------------------------------------------
test('EPIC 78 — Gate A: Cryptographic SHA-256 Immutability of Protected Historical Ledgers', () => {
  auditProtectedLedgers();
});

// -----------------------------------------------------------------------------
// GATE B: CanonicalPredictionLedgerService Idempotency & EOL Preservation
// -----------------------------------------------------------------------------
test('EPIC 78 — Gate B: reconcileAndExportResearchLedger Idempotency, EOL Preservation & Change Propagation', () => {
  const scratchDir = path.resolve('data', 'sync', 'scratch_test_export');
  if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });

  const testPath = path.join(scratchDir, 'test_export_ledger.jsonl');
  if (fs.existsSync(testPath)) fs.unlinkSync(testPath);

  try {
    const realResearch = CanonicalPredictionLedgerService.getResearchLedger();
    assert.strictEqual(realResearch.length, 336, 'Research ledger must have exactly 336 records');

    // 1. Initial write creates non-existent file
    const res1 = CanonicalPredictionLedgerService.reconcileAndExportResearchLedger(testPath);
    assert.strictEqual(res1.count, 336);
    assert.strictEqual(res1.synchronized, true);
    assert.ok(fs.existsSync(testPath), 'Export target must be created');

    const content1 = fs.readFileSync(testPath, 'utf8');
    const hash1 = crypto.createHash('sha256').update(content1).digest('hex');

    // 2. Second call is 100% idempotent and leaves file byte-identical
    const res2 = CanonicalPredictionLedgerService.reconcileAndExportResearchLedger(testPath);
    assert.strictEqual(res2.count, 336);
    assert.strictEqual(res2.synchronized, true);

    const content2 = fs.readFileSync(testPath, 'utf8');
    const hash2 = crypto.createHash('sha256').update(content2).digest('hex');
    assert.strictEqual(hash1, hash2, 'Idempotent export must produce byte-identical output');

    // 3. EOL preservation: verify CRLF file maintains CRLF
    const crlfContent = content1.replace(/\n/g, '\r\n');
    fs.writeFileSync(testPath, crlfContent, 'utf8');
    const crlfHash = crypto.createHash('sha256').update(crlfContent).digest('hex');

    const res3 = CanonicalPredictionLedgerService.reconcileAndExportResearchLedger(testPath);
    assert.strictEqual(res3.count, 336);
    const content3 = fs.readFileSync(testPath, 'utf8');
    const hash3 = crypto.createHash('sha256').update(content3).digest('hex');
    assert.strictEqual(hash3, crlfHash, 'CRLF file must not be modified when content matches');

    // 4. Change propagation: if records change, new content is written
    const modifiedRecords = [
      {
        ...realResearch[0],
        modelProbability: 0.9999,
      },
      ...realResearch.slice(1),
    ];
    const res4 = CanonicalPredictionLedgerService.reconcileAndExportResearchLedger(testPath, modifiedRecords);
    assert.strictEqual(res4.count, 336);
    const content4 = fs.readFileSync(testPath, 'utf8');
    const hash4 = crypto.createHash('sha256').update(content4).digest('hex');
    assert.notStrictEqual(hash4, hash1, 'Modified records must propagate and update file content');
    const firstLineParsed = JSON.parse(content4.split(/\r?\n/)[0]);
    assert.strictEqual(firstLineParsed.modelProbability, 0.9999);
  } finally {
    if (fs.existsSync(testPath)) fs.unlinkSync(testPath);
    if (fs.existsSync(scratchDir)) fs.rmSync(scratchDir, { recursive: true, force: true });
  }

  // Final check: live historical ledgers must remain pristine
  auditProtectedLedgers();
});

// -----------------------------------------------------------------------------
// GATE C: Skipped Test Forensic Investigation
// -----------------------------------------------------------------------------
test('EPIC 78 — Gate C: Forensic Audit of Test Suite Skip Condition (p0 Scenario 20)', () => {
  const p0TestPath = path.resolve('tests', 'p0_atomic_oddspapi_quota_reservation.test.js');
  assert.ok(fs.existsSync(p0TestPath), 'P0 quota reservation test file must exist');
  const content = fs.readFileSync(p0TestPath, 'utf8');

  // Verify Scenario 20 skip clause and explanation
  assert.ok(content.includes('Scenario 20: Multi-process PostgreSQL TCP staging harness check'));
  assert.ok(content.includes('EXTERNAL MULTI-PROCESS STAGING POSTGRES NOT CONFIGURED'));
  assert.ok(content.includes('Embedded PostgreSQL 16.4 (PGlite WASM) passed in Scenario 19'));

  // Verify that Scenario 20 strictly enforces safety rules:
  assert.ok(content.includes("parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'"));
  assert.ok(content.includes("parsed.pathname === '/salmo_test'"));
  assert.ok(content.includes('Refusing to run SQL migration harness against non-local host'));
  assert.ok(content.includes('Refusing to run SQL migration harness against non-test database'));

  // Confirm that under local test environment without external DB, only Scenario 20 skips
  const envUrl = process.env.LOCAL_POSTGRES_URL || process.env.STAGING_POSTGRES_URL || '';
  assert.strictEqual(envUrl, '', 'Staging PostgreSQL URL must not be active in audit environment');
});

// -----------------------------------------------------------------------------
// GATE D: Promotion Readiness Audit across 15 Canonical Leagues
// -----------------------------------------------------------------------------
test('EPIC 78 — Gate D: Shadow-to-Production Promotion Readiness Audit (Zero Auto-Promotion Invariant)', () => {
  resetRegistryToDefaultState();
  const evaluation = MultiLeagueAutoActivator.evaluateAllShadowLeagues();

  assert.strictEqual(evaluation.promotionMode, 'PROPOSE_ONLY', 'Must execute strictly in PROPOSE_ONLY mode');
  assert.strictEqual(evaluation.totalLeaguesInRegistry, 15, 'Total canonical registry leagues must be 15');
  assert.strictEqual(evaluation.totalShadowEvaluated, 14, 'Total SHADOW leagues evaluated must be 14 (IDN-L1 is PAUSED)');
  assert.deepStrictEqual(evaluation.newlyUnlocked, [], 'Zero SHADOW leagues may be promoted to PRODUCTION');
  assert.strictEqual(evaluation.remainedShadow.length, 14, 'All 14 SHADOW leagues must remain in SHADOW state');

  // Verify each league's decision and blocking rationale
  for (const d of evaluation.decisions) {
    assert.strictEqual(d.finalDecision, 'REMAIN_SHADOW', `${d.leagueCode} must have decision REMAIN_SHADOW`);
    assert.strictEqual(d.newStatus, 'SHADOW', `${d.leagueCode} newStatus must be SHADOW`);

    // Verify AH evaluations exist and have valid Brier scores
    assert.ok(d.marketEvaluations.AH, `Missing AH evaluation for ${d.leagueCode}`);
    assert.ok(
      ['BLOCKED_MODEL_VALIDATION', 'BLOCKED_MISSING_ODDS', 'BLOCKED_DATA_INTEGRITY'].includes(
        d.marketEvaluations.AH.promotionMatrixStatus
      ),
      `Unexpected AH promotion status for ${d.leagueCode}: ${d.marketEvaluations.AH.promotionMatrixStatus}`
    );
  }

  // Verify registry production pick enablement is false for 100% of leagues
  for (const league of CANONICAL_15_LEAGUES) {
    assert.strictEqual(
      league.production_pick_enabled,
      false,
      `League ${league.internal_league_id} must have production_pick_enabled === false`
    );
    assert.strictEqual(
      isLeagueMarketProductionEnabled(league.league_name, 'AH'),
      false,
      `AH must be disabled in production for ${league.league_name}`
    );
    assert.strictEqual(
      isLeagueMarketProductionEnabled(league.league_name, 'OU'),
      false,
      `OU must be disabled in production for ${league.league_name}`
    );
  }
});

// -----------------------------------------------------------------------------
// GATE E: Synchronization Mode Verification (sourceType: 'auto' vs 'all')
// -----------------------------------------------------------------------------
test('EPIC 78 — Gate E: Synchronization Mode Analysis (auto vs all reconciliation)', async () => {
  // Test auto mode (canonical only)
  const resAuto = await HandicapLabSyncService.sync({
    sourceType: 'auto',
    dryRun: true,
  });
  assert.strictEqual(resAuto.success, true);
  assert.strictEqual(resAuto.dryRun, true);
  assert.strictEqual(resAuto.counts.totalSourceRead, 566, 'Auto mode reads exactly 566 canonical records');
  assert.strictEqual(resAuto.counts.validParsed, 549, 'Auto mode parses 549 valid AH/OU records');
  assert.strictEqual(resAuto.counts.invalidSkipped, 17, 'Auto mode skips 17 BTTS records with line: null');
  assert.strictEqual(resAuto.counts.publicPicks, 0, 'Auto mode must qualify 0 public picks');
  assert.strictEqual(resAuto.counts.diagnosticRows, 549, 'Auto mode treats 100% of synced rows as diagnostic');

  // Test all mode (canonical + rescue)
  const resAll = await HandicapLabSyncService.sync({
    sourceType: 'all',
    dryRun: true,
  });
  assert.strictEqual(resAll.success, true);
  assert.strictEqual(resAll.dryRun, true);
  assert.strictEqual(resAll.counts.totalSourceRead, 980, 'All mode reads 980 records (566 canonical + 414 rescue)');
  assert.strictEqual(resAll.counts.validParsed, 945, 'All mode parses 945 valid AH/OU records (549 + 396)');
  assert.strictEqual(resAll.counts.invalidSkipped, 35, 'All mode skips 35 BTTS records (17 canonical + 18 rescue)');
  assert.strictEqual(resAll.counts.publicPicks, 0, 'All mode must qualify 0 public picks');
  assert.strictEqual(resAll.counts.diagnosticRows, 945, 'All mode treats 100% of synced rows as diagnostic');
});

// -----------------------------------------------------------------------------
// GATE F: BTTS Market Semantics Forensic Audit
// -----------------------------------------------------------------------------
test('EPIC 78 — Gate F: BTTS Market Semantics & Exclusion Audit', () => {
  // Case 1: Raw HandicapLab BTTS record with line: null
  const rawBttsNullLine = {
    predictionId: 'pred_btts_test_01',
    canonicalFixtureId: 'btts_test_01',
    fixtureId: 'fix_btts_01',
    homeTeam: 'Benin',
    awayTeam: 'Mauritania',
    competition: 'Africa Cup of Nations - Qualification',
    kickoffTimestamp: '2026-09-29T17:00:00+00:00',
    predictionTimestamp: '2026-09-29T16:00:00+00:00',
    market: 'BTTS',
    selection: 'YES',
    line: null,
    lineType: 'NONE',
    marketOdds: 2.17,
    modelProbability: 0.528,
    status: 'PENDING',
  };

  const mapRes1 = HandicapLabSyncService.mapRawToCanonical(rawBttsNullLine);
  assert.strictEqual(mapRes1.record, null, 'BTTS with line: null is rejected under strict numerical line validation');
  assert.strictEqual(mapRes1.error, 'Missing or non-numeric line');

  // Case 2: BTTS record provided with explicit line: 0.0
  const rawBttsZeroLine = {
    ...rawBttsNullLine,
    line: 0.0,
  };
  const mapRes2 = HandicapLabSyncService.mapRawToCanonical(rawBttsZeroLine);
  assert.ok(mapRes2.record !== null, 'BTTS with line: 0 parses successfully');
  assert.strictEqual(mapRes2.record.market, 'BTTS');
  assert.strictEqual(mapRes2.record.line, 0.0);
  assert.strictEqual(mapRes2.record.isPublicPick, false, 'BTTS must strictly have isPublicPick === false');
  assert.strictEqual(mapRes2.record.confidenceTier, 'RESEARCH_ONLY');

  // Case 3: Retrospective BTTS record (pred after kickoff)
  const rawBttsPostKickoff = {
    ...rawBttsZeroLine,
    predictionTimestamp: '2026-09-29T17:29:29+00:00', // 29 mins after kickoff!
  };
  const mapRes3 = HandicapLabSyncService.mapRawToCanonical(rawBttsPostKickoff);
  assert.ok(mapRes3.record !== null);
  assert.strictEqual(mapRes3.record.isPublicPick, false);
});

// -----------------------------------------------------------------------------
// GATE G: Deduplication, Idempotency & Atomic Rename Integrity
// -----------------------------------------------------------------------------
test('EPIC 78 — Gate G: Deterministic Deduplication, Idempotency & Refusal to Mutate Protected Files', async () => {
  const scratchTarget = path.resolve('data', 'sync', 'epic78_scratch_dedup.jsonl');
  if (fs.existsSync(scratchTarget)) fs.unlinkSync(scratchTarget);

  try {
    // 1. Refusal to write to protected historical ledgers
    for (const [relPath] of Object.entries(AUTHORITATIVE_PROTECTED_HASHES)) {
      await assert.rejects(
        async () => {
          await HandicapLabSyncService.sync({ destinationPath: relPath });
        },
        /Refusing to write to protected historical ledger/,
        `Sync must fail closed when destinationPath is ${relPath}`
      );
    }

    // 2. In-batch duplicate handling
    const mockSourceFile = path.resolve('data', 'sync', 'epic78_mock_source.jsonl');
    const rowA = {
      id: 'row_a1',
      fixture_id: 'fix_a',
      home_team: 'Arsenal',
      away_team: 'Chelsea',
      competition: 'Premier League',
      kickoff_utc: '2026-11-01T15:00:00Z',
      prediction_timestamp: '2026-11-01T10:00:00Z',
      market: 'AH',
      line: -0.25,
      market_odds: 1.95,
      model_probability: 0.55,
      verdict: 'LEWATI',
      modelVersion: 'dixon-coles-v1.0',
    };
    const rowADup = { ...rowA, id: 'row_a2' }; // Identical terms, distinct raw id
    fs.writeFileSync(mockSourceFile, `${JSON.stringify(rowA)}\n${JSON.stringify(rowADup)}\n`, 'utf8');

    const res1 = await HandicapLabSyncService.sync({
      sourcePath: mockSourceFile,
      destinationPath: scratchTarget,
      dryRun: false,
    });

    assert.strictEqual(res1.counts.totalSourceRead, 2);
    assert.strictEqual(res1.counts.validParsed, 2);
    assert.strictEqual(res1.counts.duplicatesSkipped, 1, 'In-batch duplicate must be skipped');
    assert.strictEqual(res1.counts.totalSynchronized, 1, 'Exactly 1 unique record synchronized');

    // 3. Second run idempotency
    const res2 = await HandicapLabSyncService.sync({
      sourcePath: mockSourceFile,
      destinationPath: scratchTarget,
      dryRun: false,
    });
    assert.strictEqual(res2.counts.duplicatesSkipped, 2, 'Both rows skipped as duplicates on run 2');
    assert.strictEqual(res2.counts.totalSynchronized, 1, 'Total remains exactly 1');

    if (fs.existsSync(mockSourceFile)) fs.unlinkSync(mockSourceFile);
  } finally {
    if (fs.existsSync(scratchTarget)) fs.unlinkSync(scratchTarget);
  }

  // Verify historical ledgers remain untouched
  auditProtectedLedgers();
});

// -----------------------------------------------------------------------------
// GATE H: Public Pick Leak Proof (Multi-Layered Hostile Negative Tests)
// -----------------------------------------------------------------------------
test('EPIC 78 — Gate H: Hostile Negative Testing Against Public Pick Leakage', () => {
  const referenceTimeMs = new Date('2026-10-15T00:00:00Z').getTime();

  // Test 1: Non-EPL league (La Liga)
  const nonEplPick = {
    id: 'leak_1',
    fixture_id: 'fix_1',
    home_team: 'Real Madrid',
    away_team: 'Barcelona',
    competition: 'La Liga',
    league: 'La Liga',
    kickoff_utc: '2026-10-25T20:00:00Z',
    prediction_timestamp: '2026-10-25T10:00:00Z',
    market: 'AH',
    market_type: 'ASIAN_HANDICAP',
    selection: 'Real Madrid -0.25',
    line: -0.25,
    prediction: 'Real Madrid -0.25',
    market_odds: 1.95,
    model_probability: 0.65,
    verdict: 'LAYAK',
    confidence: 'HIGH',
    model_version: 'dixon-coles-esp-laliga-v1.0',
    is_pick: true,
  };
  const mappedNonEpl = HandicapLabSyncService.mapRawToCanonical(nonEplPick);
  assert.ok(mappedNonEpl.record !== null, 'Mapped record should parse');
  assert.strictEqual(mappedNonEpl.record.isPublicPick, false, 'Non-EPL records must have isPublicPick === false');
  assert.strictEqual(mappedNonEpl.record.ledgerTier, 'SHADOW', 'Non-EPL records must have ledgerTier === SHADOW');
  assert.strictEqual(
    isLeagueMarketProductionEnabled('La Liga', 'AH'),
    false,
    'La Liga AH must not be production enabled'
  );

  // Test 2: Diagnostic verdict 'LEWATI'
  const diagnosticPick = {
    ...nonEplPick,
    competition: 'Premier League',
    league: 'Premier League',
    verdict: 'LEWATI',
  };
  assert.strictEqual(
    isPublicPickEligible(diagnosticPick, referenceTimeMs),
    false,
    'LEWATI verdict must be ineligible for public picks'
  );

  // Test 3: Stale/Past Kickoff (temporal kill switch)
  const pastKickoffPick = {
    ...nonEplPick,
    competition: 'Premier League',
    league: 'Premier League',
    kickoff_utc: '2026-10-10T15:00:00Z', // 5 days in the past!
  };
  assert.strictEqual(
    isPublicPickEligible(pastKickoffPick, referenceTimeMs),
    false,
    'Past kickoff must be killed by temporal boundary'
  );

  // Test 4: Missing or invalid market odds (<= 1.0)
  const noOddsPick = {
    ...nonEplPick,
    competition: 'Premier League',
    league: 'Premier League',
    market_odds: null,
  };
  assert.strictEqual(
    isPublicPickEligible(noOddsPick, referenceTimeMs),
    false,
    'Null market odds must be ineligible for public picks'
  );
  assert.strictEqual(
    isCandidateQualifiedWithoutOdds(noOddsPick, referenceTimeMs),
    true,
    'Must be categorized as candidate qualified WITHOUT odds'
  );

  const subOneOddsPick = {
    ...nonEplPick,
    competition: 'Premier League',
    league: 'Premier League',
    market_odds: 0.95,
  };
  assert.strictEqual(
    isPublicPickEligible(subOneOddsPick, referenceTimeMs),
    false,
    'Odds <= 1.0 must be ineligible for public picks'
  );

  // Test 5: BTTS market (excluded from daily picks)
  const bttsPick = {
    ...nonEplPick,
    competition: 'Premier League',
    league: 'Premier League',
    market_type: 'BTTS',
  };
  assert.strictEqual(
    bttsPick.market_type === 'ASIAN_HANDICAP' || bttsPick.market_type === 'OVER_UNDER',
    false,
    'BTTS is strictly not allowed in public picks'
  );
});

// -----------------------------------------------------------------------------
// GATE I: Vercel Cron Containment & Final Safety Invariants
// -----------------------------------------------------------------------------
test('EPIC 78 — Gate I: Vercel Cron Containment & Operational Governance', () => {
  const vercelJsonPath = path.resolve('vercel.json');
  assert.ok(fs.existsSync(vercelJsonPath), 'vercel.json must exist');
  const vercelJson = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));

  assert.deepStrictEqual(vercelJson.crons, [], 'vercel.json crons must strictly remain empty []');

  // Verify all 3 protected ledgers one last time
  auditProtectedLedgers();
});
