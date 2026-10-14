// SALMO.DEV — EPIC 77: HandicapLab Cross-System Sync & Verification Test Suite
// Evidence-First | Additive Storage | Zero Historical Ledger Mutation

const test = require('node:test');
const assert = require('node:assert');
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
  HandicapLabSyncService,
} = require('../src/engine/sync/handicapLabSyncService.ts');
const {
  LocalHandicapLabAdapter,
} = require('../src/contracts/handicapLabAdapter.ts');

// Immutable baseline hashes for the 3 protected historical ledgers (supporting CRLF/LF checkout parity)
const BASELINE_PROTECTED_HASHES = {
  'data/verification/live_prediction_ledger.jsonl': [
    '317fc037a63b811420400ea9de094092ec7d68b119ad6abc57743be12d568527',
  ],
  'data/verification/all_leagues_research_ledger.jsonl': [
    'eae8f364a5393255d276fca2650056951fb601ba829c1710b26ac673dffb967b',
  ],
  'data/research/multi_league_research_predictions.jsonl': [
    '0128616a43968be5fddab76ea5c57da731955e22b1bf27bca3f886938187a12f',
    '2816cf02729ef1d847ca247e725a5b905449a5b7430953b8220118dbc6013d2e',
  ],
};

function getFileSha256(relPath) {
  const fullPath = path.resolve(relPath);
  const buf = fs.readFileSync(fullPath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

test('EPIC 77 — Gate A: Schema Mapping & Field Transformation Correctness', () => {
  const mockRawCanonical = {
    canonicalFixtureId: 'bc702550dbd31ea0',
    fixture: 'Columbus Crew vs Inter Miami',
    competition: 'Major League Soccer',
    homeTeam: 'Columbus Crew',
    awayTeam: 'Inter Miami',
    kickoffTimestamp: '2026-09-27T23:00:00+00:00',
    market: 'OU',
    selection: 'Over 1.5',
    line: 1.5,
    provider: 'OddsPapi',
    bookmaker: 'Pinnacle',
    marketOdds: 1.85,
    oddsTimestamp: '2026-09-27T16:14:17.502Z',
    modelProbability: 0.7388,
    fairOdds: 1.354,
    expectedValue: 0.3668,
    edge: 0.1983,
    confidence: 'HIGH',
    predictionTimestamp: '2026-09-27T16:14:17.497Z',
    modelVersion: 'dixon-coles-v1.0',
    predictionId: 'cpred_aa889059db402c8a',
    status: 'PENDING',
  };

  const { record, error } = HandicapLabSyncService.mapRawToCanonical(mockRawCanonical, 'test_source');
  assert.strictEqual(error, undefined, 'Mapping should succeed without error');
  assert.ok(record, 'Record should not be null');

  // Verify ID prefixing to prevent ID collisions
  assert.strictEqual(record.predictionId, 'hl_cpred_aa889059db402c8a');
  assert.strictEqual(record.fixtureId, 'bc702550dbd31ea0');
  assert.strictEqual(record.competitionId, 'USA-MLS');
  assert.strictEqual(record.competitionName, 'Major League Soccer');
  assert.strictEqual(record.homeTeam, 'Columbus Crew');
  assert.strictEqual(record.awayTeam, 'Inter Miami');
  assert.strictEqual(record.market, 'OU');
  assert.strictEqual(record.line, 1.5);
  assert.strictEqual(record.selection, 'Over 1.5');
  assert.strictEqual(record.originalOdds, 1.85);
  assert.strictEqual(record.modelProbability, 0.7388);
  assert.strictEqual(record.fairOdds, 1.354);
  assert.strictEqual(record.modelVersion, 'dixon-coles-v1.0');
  assert.strictEqual(record.dataSource, 'test_source');
  assert.strictEqual(record.settlementStatus, 'PENDING');
  assert.ok(record.provenanceHash.length === 64, 'Provenance hash must be valid SHA-256');

  // Verify non-EPL league invariant: ledgerTier is SHADOW and isPublicPick is strictly false
  assert.strictEqual(record.ledgerTier, 'SHADOW');
  assert.strictEqual(record.isPublicPick, false);
});

test('EPIC 77 — Gate A: Malformed & Invalid Record Handling', () => {
  // 1. Missing ID
  const noId = HandicapLabSyncService.mapRawToCanonical({ homeTeam: 'A', awayTeam: 'B' });
  assert.strictEqual(noId.record, null);
  assert.ok(noId.error.includes('Missing prediction identifier'));

  // 2. Missing Teams
  const noTeams = HandicapLabSyncService.mapRawToCanonical({ predictionId: 'pred_1', fixtureId: 'fix_1', kickoffUtc: '2026-10-10T15:00:00Z' });
  assert.strictEqual(noTeams.record, null);
  assert.ok(noTeams.error.includes('Missing homeTeam or awayTeam'));

  // 3. Invalid Probability (<= 0 or >= 1)
  const invalidProb = HandicapLabSyncService.mapRawToCanonical({
    predictionId: 'pred_2',
    fixtureId: 'fix_2',
    homeTeam: 'A',
    awayTeam: 'B',
    kickoffUtc: '2026-10-10T15:00:00Z',
    line: 0,
    modelProbability: -0.25,
  });
  assert.strictEqual(invalidProb.record, null);
  assert.ok(invalidProb.error.includes('Invalid probability value'));
});

test('EPIC 77 — Gate B: Quarter-Line Classification Invariant', () => {
  assert.strictEqual(HandicapLabSyncService.evaluateLineType(0), 'FULL');
  assert.strictEqual(HandicapLabSyncService.evaluateLineType(1.0), 'FULL');
  assert.strictEqual(HandicapLabSyncService.evaluateLineType(-2.0), 'FULL');
  assert.strictEqual(HandicapLabSyncService.evaluateLineType(0.5), 'HALF');
  assert.strictEqual(HandicapLabSyncService.evaluateLineType(-1.5), 'HALF');
  assert.strictEqual(HandicapLabSyncService.evaluateLineType(0.25), 'QUARTER');
  assert.strictEqual(HandicapLabSyncService.evaluateLineType(-0.75), 'QUARTER');
  assert.strictEqual(HandicapLabSyncService.evaluateLineType(2.25), 'QUARTER');
  assert.strictEqual(HandicapLabSyncService.evaluateLineType(2.75), 'QUARTER');
});

test('EPIC 77 — Gate B: Strict Diagnostic vs Public Pick Separation', () => {
  // 1. Diagnostic LEWATI forecast (must NEVER be public pick)
  const diagnosticRow = {
    id: 'diag_1',
    fixture_id: 'fix_1',
    home_team: 'Arsenal',
    away_team: 'Chelsea',
    competition: 'Premier League',
    kickoff_utc: '2026-10-20T15:00:00Z',
    prediction_timestamp: '2026-10-20T10:00:00Z',
    market: 'AH',
    line: -0.25,
    market_odds: 1.95,
    model_probability: 0.52,
    verdict: 'LEWATI',
    is_pick: false,
  };
  const res1 = HandicapLabSyncService.mapRawToCanonical(diagnosticRow);
  assert.strictEqual(res1.record.isPublicPick, false, 'Diagnostic LEWATI forecast must have isPublicPick === false');

  // 2. BTTS market (strictly RESEARCH_ONLY in SALMO)
  const bttsRow = {
    id: 'btts_1',
    fixture_id: 'fix_2',
    home_team: 'Arsenal',
    away_team: 'Chelsea',
    competition: 'Premier League',
    kickoff_utc: '2026-10-20T15:00:00Z',
    prediction_timestamp: '2026-10-20T10:00:00Z',
    market: 'BTTS',
    line: 0,
    market_odds: 1.80,
    model_probability: 0.60,
    verdict: 'LAYAK',
    is_pick: true,
  };
  const res2 = HandicapLabSyncService.mapRawToCanonical(bttsRow);
  assert.strictEqual(res2.record.isPublicPick, false, 'BTTS market must strictly have isPublicPick === false');

  // 3. Valid EPL Public Pick
  const validEplPick = {
    id: 'pick_1',
    fixture_id: 'fix_3',
    home_team: 'Arsenal',
    away_team: 'Chelsea',
    competition: 'Premier League',
    kickoff_utc: '2026-10-20T15:00:00Z',
    prediction_timestamp: '2026-10-20T10:00:00Z',
    market: 'AH',
    line: -0.5,
    market_odds: 1.95,
    model_probability: 0.62,
    verdict: 'LAYAK',
    confidence: 'HIGH',
    is_pick: true,
  };
  const res3 = HandicapLabSyncService.mapRawToCanonical(validEplPick);
  assert.strictEqual(res3.record.isPublicPick, true, 'Valid pre-match EPL pick must have isPublicPick === true');
  assert.strictEqual(res3.record.ledgerTier, 'PRODUCTION');
});

test('EPIC 77 — Gate B: Temporal Provenance Gate (Prediction < Kickoff)', () => {
  // Retrospective prediction timestamp (prediction after kickoff)
  const leakedRow = {
    id: 'leaked_1',
    fixture_id: 'fix_4',
    home_team: 'Arsenal',
    away_team: 'Chelsea',
    competition: 'Premier League',
    kickoff_utc: '2026-10-10T12:00:00Z',
    prediction_timestamp: '2026-10-10T14:00:00Z', // 2 hours after kickoff!
    market: 'AH',
    line: -0.5,
    market_odds: 1.95,
    model_probability: 0.65,
    verdict: 'LAYAK',
    is_pick: true,
  };
  const res = HandicapLabSyncService.mapRawToCanonical(leakedRow);
  assert.strictEqual(res.record.isPublicPick, false, 'Retrospective prediction must NOT qualify as public pick');
});

test('EPIC 77 — Gate C: Dry-Run Invariance & Safety Protection', async () => {
  const scratchTarget = path.resolve('data', 'sync', 'test_dryrun_scratch.jsonl');
  if (fs.existsSync(scratchTarget)) fs.unlinkSync(scratchTarget);

  const syncResult = await HandicapLabSyncService.sync({
    dryRun: true,
    destinationPath: scratchTarget,
  });

  assert.strictEqual(syncResult.success, true);
  assert.strictEqual(syncResult.dryRun, true);
  assert.strictEqual(fs.existsSync(scratchTarget), false, 'Dry-run must NEVER write files to disk');

  // Attempting to overwrite protected historical ledgers must throw
  await assert.rejects(
    async () => {
      await HandicapLabSyncService.sync({
        destinationPath: 'data/verification/live_prediction_ledger.jsonl',
      });
    },
    /Refusing to write to protected historical ledger/,
    'Sync must fail closed when targeting protected historical ledgers'
  );
});

test('EPIC 77 — Gate C: Deterministic Deduplication & Idempotency', async () => {
  const scratchTarget = path.resolve('data', 'sync', 'test_idempotency_scratch.jsonl');
  if (fs.existsSync(scratchTarget)) fs.unlinkSync(scratchTarget);

  // Create a sample mock source with duplicates
  const mockSourceFile = path.resolve('data', 'sync', 'test_mock_source.jsonl');
  const dir = path.dirname(mockSourceFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const item1 = {
    id: 'sample_1',
    fixture_id: 'fix_100',
    home_team: 'Arsenal',
    away_team: 'Liverpool',
    competition: 'Premier League',
    kickoff_utc: '2026-10-25T16:30:00Z',
    prediction_timestamp: '2026-10-25T10:00:00Z',
    market: 'AH',
    line: 0.0,
    market_odds: 1.90,
    model_probability: 0.55,
    is_pick: false,
    verdict: 'LEWATI',
    modelVersion: 'dixon-coles-v1.0',
  };
  // Duplicate of item1
  const item1Duplicate = { ...item1, id: 'sample_1_dup' };
  // Distinct item2
  const item2 = {
    id: 'sample_2',
    fixture_id: 'fix_100',
    home_team: 'Arsenal',
    away_team: 'Liverpool',
    competition: 'Premier League',
    kickoff_utc: '2026-10-25T16:30:00Z',
    prediction_timestamp: '2026-10-25T10:00:00Z',
    market: 'OU',
    line: 2.5,
    market_odds: 1.85,
    model_probability: 0.58,
    is_pick: false,
    verdict: 'LEWATI',
    modelVersion: 'dixon-coles-v1.0',
  };

  fs.writeFileSync(mockSourceFile, [JSON.stringify(item1), JSON.stringify(item1Duplicate), JSON.stringify(item2)].join('\n') + '\n');

  try {
    // Run 1: First sync
    const res1 = await HandicapLabSyncService.sync({
      sourcePath: mockSourceFile,
      destinationPath: scratchTarget,
      dryRun: false,
    });

    assert.strictEqual(res1.counts.totalSourceRead, 3);
    assert.strictEqual(res1.counts.validParsed, 3);
    assert.strictEqual(res1.counts.duplicatesSkipped, 1, 'In-batch duplicate must be skipped');
    assert.strictEqual(res1.counts.totalSynchronized, 2, 'Exactly 2 unique records synchronized');

    const content1 = fs.readFileSync(scratchTarget, 'utf8');
    const hash1 = crypto.createHash('sha256').update(content1).digest('hex');

    // Run 2: Re-run sync (Idempotency test)
    const res2 = await HandicapLabSyncService.sync({
      sourcePath: mockSourceFile,
      destinationPath: scratchTarget,
      dryRun: false,
    });

    assert.strictEqual(res2.counts.duplicatesSkipped, 3, 'All 3 records should be detected as duplicates in run 2');
    assert.strictEqual(res2.counts.totalSynchronized, 2, 'Total record count must remain exactly 2');

    const content2 = fs.readFileSync(scratchTarget, 'utf8');
    const hash2 = crypto.createHash('sha256').update(content2).digest('hex');

    assert.strictEqual(hash1, hash2, 'Idempotent sync must produce 100% byte-for-byte identical output');
  } finally {
    if (fs.existsSync(scratchTarget)) fs.unlinkSync(scratchTarget);
    if (fs.existsSync(mockSourceFile)) fs.unlinkSync(mockSourceFile);
  }
});

test('EPIC 77 — Gate D: Real HandicapLab Synchronization & Adapter Integration', async () => {
  const syncLedgerPath = path.resolve('data', 'sync', 'handicaplab_sync_ledger.jsonl');

  // Execute actual synchronization
  const result = await HandicapLabSyncService.sync({
    destinationPath: syncLedgerPath,
    dryRun: false,
  });

  assert.strictEqual(result.success, true);
  assert.ok(result.counts.totalSynchronized > 0, 'Must synchronize real records from HandicapLab');
  assert.ok(fs.existsSync(syncLedgerPath), 'Sync ledger file must exist');

  // Verify adapter can read through getSalmoSync
  const adapter = new LocalHandicapLabAdapter();
  const syncFeed = await adapter.getSalmoSync();

  assert.ok(syncFeed !== null, 'Adapter getSalmoSync must return payload');
  assert.strictEqual(syncFeed.success, true);
  assert.ok(['REAL', 'NO_QUALIFIED_PICKS'].includes(syncFeed.dataState));
  assert.ok(syncFeed.counts.totalArchived > 0);

  // Invariant: diagnostic rows must have isPublicPick === false
  const lines = fs.readFileSync(syncLedgerPath, 'utf8').trim().split('\n').filter(Boolean);
  const rows = lines.map(l => JSON.parse(l));

  for (const r of rows) {
    if (r.competitionId !== 'ENG-PL') {
      assert.strictEqual(r.isPublicPick, false, `Non-EPL record ${r.predictionId} must have isPublicPick === false`);
      assert.strictEqual(r.ledgerTier, 'SHADOW');
    }
    if (r.market === 'BTTS') {
      assert.strictEqual(r.isPublicPick, false, `BTTS record ${r.predictionId} must have isPublicPick === false`);
    }
  }
});

test('EPIC 77 — Gate D: Byte-for-Byte Immutability of Protected Historical Ledgers', () => {
  for (const [relPath, expectedHashes] of Object.entries(BASELINE_PROTECTED_HASHES)) {
    const currentHash = getFileSha256(relPath);
    assert.ok(
      expectedHashes.includes(currentHash),
      `Historical ledger ${relPath} must remain byte-for-byte identical! Expected one of [${expectedHashes.join(', ')}], got ${currentHash}`
    );
  }
});
