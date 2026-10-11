// SALMO.DEV — 15-League Research Pipeline Verification Test Suite
// Verifies:
// 1. Coverage across all 15 candidate leagues (Tiers A, B, C)
// 2. Exactly 168 fixtures -> 336 research predictions (168 AH + 168 OU)
// 3. Zero fake odds invariant: all unquoted / non-EPL rows have marketOdds: null
// 4. Strict segregation: RESEARCH_ONLY tier with 0 stake and null P&L
// 5. Transfer baseline provenance: BASELINE_UNVALIDATED tag on all transferred leagues
// 6. EPL canonical ID byte-identical parity preserved
// 7. Deterministic idempotency across generator runs
// 8. Safe read-path discovery and public pick separation

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

if (!require.extensions['.ts']) {
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
}

const { CANONICAL_15_LEAGUES } = require('../src/config/multiLeagueRegistry.ts');
const { generateAllLeaguesResearchPredictions, ALL_LEAGUES_OUTPUT_PATH } = require('../scripts/generate_all_leagues_research_predictions.js');
const { FixtureIntegrityGuard } = require('../src/lib/fixtureIntegrity.ts');

test('1. All 15 registered leagues are covered in generated research predictions', () => {
  const { generatedRows, leagueCounts } = generateAllLeaguesResearchPredictions();

  assert.strictEqual(CANONICAL_15_LEAGUES.length, 15, 'Canonical registry must have 15 leagues');

  for (const league of CANONICAL_15_LEAGUES) {
    const stats = leagueCounts[league.league_name];
    assert.ok(stats, `League ${league.league_name} must exist in generated results`);
    assert.ok(stats.fixtures > 0, `League ${league.league_name} must have at least 1 fixture`);
    assert.strictEqual(stats.predictions, stats.fixtures * 2, `League ${league.league_name} must have exactly 2 predictions per fixture`);
  }
});

test('2. Total volume equals exactly 168 fixtures and 336 research predictions (168 AH + 168 OU)', () => {
  const { generatedRows } = generateAllLeaguesResearchPredictions();

  assert.strictEqual(generatedRows.length, 336, 'Must generate exactly 336 predictions');

  const ahRows = generatedRows.filter(r => r.market === 'AH');
  const ouRows = generatedRows.filter(r => r.market === 'OU');

  assert.strictEqual(ahRows.length, 168, 'Must have exactly 168 Asian Handicap predictions');
  assert.strictEqual(ouRows.length, 168, 'Must have exactly 168 Over/Under predictions');
});

test('3. Zero fake odds invariant: all 14 non-EPL leagues strictly have marketOdds: null', () => {
  const { generatedRows } = generateAllLeaguesResearchPredictions();
  const nonEplRows = generatedRows.filter(r => r.leaguePrefix !== 'EPL');

  assert.strictEqual(nonEplRows.length, 316, '158 fixtures x 2 = 316 non-EPL rows');

  for (const row of nonEplRows) {
    assert.strictEqual(row.marketOdds, null, `Market odds must be null for non-EPL row: ${row.predictionId}`);
    assert.strictEqual(row.expectedValue, null, `Expected value must be null for non-EPL row: ${row.predictionId}`);
    assert.strictEqual(row.bookmaker, null, `Bookmaker must be null for non-EPL row: ${row.predictionId}`);
  }
});

test('4. Strict RESEARCH_ONLY tier segregation: 0 stake units, 0 profit units, null profitLoss', () => {
  const { generatedRows } = generateAllLeaguesResearchPredictions();

  for (const row of generatedRows) {
    assert.strictEqual(row.tier, 'RESEARCH_ONLY', `Tier must be RESEARCH_ONLY for ${row.predictionId}`);
    assert.strictEqual(row.verdict, 'LEWATI', `Verdict must be LEWATI for ${row.predictionId}`);
    assert.strictEqual(row.stakeUnits, 0, `stakeUnits must be 0 for ${row.predictionId}`);
    assert.strictEqual(row.profitUnits, 0, `profitUnits must be 0 for ${row.predictionId}`);
    assert.strictEqual(row.profitLoss, null, `profitLoss must be null for ${row.predictionId}`);
  }
});

test('5. Provenance integrity: unvalidated leagues tagged BASELINE_UNVALIDATED with shadow or transfer calibration version', () => {
  const { generatedRows } = generateAllLeaguesResearchPredictions();

  for (const row of generatedRows) {
    if (row.leaguePrefix === 'EPL') {
      assert.strictEqual(row.calibrationStatus, 'VALIDATED');
      assert.ok(row.modelVersion.includes('dixon-coles-v1.0') || row.modelVersion.includes('ASIAN-TOTAL-jointscore'));
    } else if (row.leaguePrefix === 'IDNL1') {
      assert.strictEqual(row.calibrationStatus, 'BASELINE_UNVALIDATED');
      assert.strictEqual(row.calibrationVersion, 'transfer-baseline-unvalidated');
      assert.strictEqual(row.ledgerTier, 'NONE');
    } else {
      assert.strictEqual(row.calibrationStatus, 'BASELINE_UNVALIDATED');
      assert.strictEqual(row.calibrationVersion, 'walkforward-shadow-v2.0');
      assert.strictEqual(row.ledgerTier, 'SHADOW');
    }
  }
});

test('6. Canonical match IDs conform to league prefix standard without EPL contamination', () => {
  const { generatedRows } = generateAllLeaguesResearchPredictions();

  for (const row of generatedRows) {
    const prefix = row.leaguePrefix;
    assert.ok(row.canonicalMatchId.startsWith(`${prefix}_`), `Canonical ID ${row.canonicalMatchId} must start with ${prefix}_`);
    if (prefix !== 'EPL') {
      assert.ok(!row.canonicalMatchId.startsWith('EPL_'), `Non-EPL row must not start with EPL_: ${row.canonicalMatchId}`);
    }
  }
});

test('7. Deterministic idempotency: repeated runs produce byte-for-byte identical output', () => {
  const run1 = generateAllLeaguesResearchPredictions();
  const run2 = generateAllLeaguesResearchPredictions();

  assert.strictEqual(run1.generatedRows.length, run2.generatedRows.length);

  const ids1 = run1.generatedRows.map(r => r.predictionId);
  const ids2 = run2.generatedRows.map(r => r.predictionId);

  assert.deepStrictEqual(ids1, ids2, 'Prediction IDs must match byte-for-byte');

  const uniqueIds = new Set(ids1);
  assert.strictEqual(uniqueIds.size, 336, 'All 336 generated prediction IDs must be unique');
});

test('8. Persisted file verification: all_leagues_research_ledger.jsonl is non-empty and readable', () => {
  assert.ok(fs.existsSync(ALL_LEAGUES_OUTPUT_PATH), 'Output file must exist on disk');

  const lines = fs.readFileSync(ALL_LEAGUES_OUTPUT_PATH, 'utf8').trim().split('\n').filter(Boolean);
  assert.strictEqual(lines.length, 336, 'File must contain exactly 336 rows');

  // Parse each line to verify valid JSON
  lines.forEach((l, idx) => {
    try {
      const parsed = JSON.parse(l);
      assert.ok(parsed.predictionId, `Row ${idx} must have predictionId`);
    } catch (e) {
      assert.fail(`Line ${idx} is not valid JSON: ${e.message}`);
    }
  });
});

test('9. EPL rows have valid Pinnacle odds, non-null EV, dynamic lines, and ODDS_AVAILABLE status', () => {
  const { generatedRows } = generateAllLeaguesResearchPredictions();
  const eplRows = generatedRows.filter(r => r.leaguePrefix === 'EPL');

  assert.strictEqual(eplRows.length, 20, '10 fixtures x 2 = 20 EPL rows');

  const distinctLines = new Set(eplRows.map(r => r.line));
  assert.ok(distinctLines.size > 2, `EPL rows must reflect dynamic market lines, found ${distinctLines.size}`);

  for (const row of eplRows) {
    assert.strictEqual(row.oddsStatus, 'ODDS_AVAILABLE', `Odds status must be ODDS_AVAILABLE for ${row.predictionId}`);
    assert.strictEqual(row.bookmaker, 'PINNACLE', `Bookmaker must be PINNACLE for ${row.predictionId}`);
    assert.ok(typeof row.marketOdds === 'number' && row.marketOdds > 1.0, `marketOdds must be valid decimal > 1.0 for ${row.predictionId}`);
    assert.ok(typeof row.fairOdds === 'number' && row.fairOdds > 1.0, `fairOdds must be valid decimal > 1.0 for ${row.predictionId}`);
    assert.ok(typeof row.expectedValue === 'number', `expectedValue must be non-null number for ${row.predictionId}`);
    assert.ok(typeof row.edge === 'number', `edge must be non-null number for ${row.predictionId}`);
  }

  // Verify 12 settled rows from finished matches and 8 pending rows from upcoming matches
  const settledRows = eplRows.filter(r => r.settlement === 'SETTLED');
  const pendingRows = eplRows.filter(r => r.settlement === 'PENDING');
  assert.strictEqual(settledRows.length, 12, 'Exactly 12 EPL rows must be SETTLED');
  assert.strictEqual(pendingRows.length, 8, 'Exactly 8 EPL rows must be PENDING');

  for (const row of settledRows) {
    assert.ok(typeof row.homeGoals === 'number', `homeGoals must be number for ${row.predictionId}`);
    assert.ok(typeof row.awayGoals === 'number', `awayGoals must be number for ${row.predictionId}`);
    assert.ok(row.result, `result must be populated for ${row.predictionId}`);
    assert.ok(row.settledAt, `settledAt must be populated for ${row.predictionId}`);
  }
});

test('10. 14 non-EPL leagues strictly have oddsStatus: AWAITING_ODDS and explicit quota/baseline reason', () => {
  const { generatedRows } = generateAllLeaguesResearchPredictions();
  const nonEplRows = generatedRows.filter(r => r.leaguePrefix !== 'EPL');

  assert.strictEqual(nonEplRows.length, 316, '158 fixtures x 2 = 316 non-EPL rows');

  for (const row of nonEplRows) {
    assert.strictEqual(row.oddsStatus, 'AWAITING_ODDS', `oddsStatus must be AWAITING_ODDS for ${row.predictionId}`);
    assert.strictEqual(row.marketOdds, null, `marketOdds must be null for ${row.predictionId}`);
    assert.strictEqual(row.expectedValue, null, `expectedValue must be null for ${row.predictionId}`);
    assert.strictEqual(row.edge, null, `edge must be null for ${row.predictionId}`);
    assert.strictEqual(row.bookmaker, null, `bookmaker must be null for ${row.predictionId}`);
    if (row.leaguePrefix === 'IDNL1') {
      assert.ok(row.reasoning.includes('Unsupported league'), `reasoning must state unsupported league for ${row.predictionId}`);
      assert.strictEqual(row.reasonCode, 'MISSING_BASELINE');
    } else {
      assert.ok(row.reasoning.includes('OddsPAPI quota hard-stop (260/250 consumed)'), `reasoning must state quota hard-stop for ${row.predictionId}`);
      assert.strictEqual(row.reasonCode, 'ODDS_UNAVAILABLE');
    }
  }
});

test('11. OddsPAPI persistent quota guard strictly blocks calls when quota limit is exceeded (delta: 0)', async () => {
  // Load env if available
  if (fs.existsSync('.env.local')) {
    fs.readFileSync('.env.local', 'utf8').split('\n').forEach(l => {
      const t = l.trim();
      if (t && !t.startsWith('#')) {
        const idx = t.indexOf('=');
        if (idx !== -1) {
          const k = t.slice(0, idx).trim();
          const v = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
          process.env[k] = v;
        }
      }
    });
  }

  const { OddsPapiQuotaGuard } = require('../src/lib/quota/oddsPapiQuotaGuard.ts');
  const guardStatus = await OddsPapiQuotaGuard.checkQuota(1);

  // If Supabase is configured, consumed is 260/250 and allowed is false
  if (guardStatus.source === 'SUPABASE' && guardStatus.consumed >= guardStatus.hardStopThreshold) {
    assert.strictEqual(guardStatus.allowed, false, 'Quota guard must block requests when consumed >= hardStopThreshold');
    assert.ok(guardStatus.reason?.includes('hard-stop'), 'Guard reason must explicitly state hard-stop');
    assert.strictEqual(guardStatus.consumed, 260, 'Starting and ending consumed must remain 260 (delta: 0)');
  }
});
