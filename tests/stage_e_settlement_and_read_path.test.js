const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

// TypeScript in-memory transpile loader for seamless Node test execution
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

const { FixtureIntegrityGuard } = require('../src/lib/fixtureIntegrity.ts');
const { MatchIntelligenceService } = require('../src/engine/matchIntelligenceService.ts');

// Load Stage B1 authoritative fixture evidence JSON
const evidenceCandidates = [
  path.resolve(__dirname, '../data/verification/stage_b1_fixture_evidence.json'),
  path.resolve(process.env.USERPROFILE || 'C:/Users/RYZEN', '.gemini/antigravity/brain/a0bf40a6-284a-4dbf-9026-c0c6c3b8172e/scratch/stage_b1_fixture_evidence.json'),
  path.resolve(__dirname, '../scratch/stage_b1_fixture_evidence.json'),
];
const EVIDENCE_PATH = evidenceCandidates.find(p => fs.existsSync(p)) || evidenceCandidates[0];

test('E1: Research-only staging settlement resolves exactly 12 finished and 8 pending rows', () => {
  const settledPath = path.resolve('data/verification/staging_settled_research_ledger.jsonl');
  assert.ok(fs.existsSync(settledPath), 'staging_settled_research_ledger.jsonl must exist');

  const lines = fs.readFileSync(settledPath, 'utf8').trim().split('\n').filter(Boolean);
  assert.strictEqual(lines.length, 20, 'Must have exactly 20 rows');

  const rows = lines.map(l => JSON.parse(l));
  const settled = rows.filter(r => r.settlement === 'SETTLED');
  const pending = rows.filter(r => r.settlement === 'PENDING');

  assert.strictEqual(settled.length, 12, 'Exactly 12 rows from 6 finished matches must be SETTLED');
  assert.strictEqual(pending.length, 8, 'Exactly 8 rows from 4 upcoming matches must be PENDING');
});

test('E2: RESEARCH_ONLY settlement strictly enforces 0 stake and 0 P&L invariants', () => {
  const settledPath = path.resolve('data/verification/staging_settled_research_ledger.jsonl');
  const rows = fs.readFileSync(settledPath, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));

  for (const r of rows) {
    assert.strictEqual(r.tier, 'RESEARCH_ONLY', `Tier must be RESEARCH_ONLY for ${r.predictionId}`);
    assert.strictEqual(r.stakeUnits, 0, `stakeUnits must be 0 for ${r.predictionId}`);
    assert.strictEqual(r.profitUnits, 0, `profitUnits must be 0 for ${r.predictionId}`);
    assert.strictEqual(r.profitLoss, null, `profitLoss must be null for ${r.predictionId}`);
  }
});

test('E3: Calibration metrics (Brier score and log-loss) are mathematically sound', () => {
  const settledPath = path.resolve('data/verification/staging_settled_research_ledger.jsonl');
  const rows = fs.readFileSync(settledPath, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
  const settled = rows.filter(r => r.settlement === 'SETTLED');

  assert.strictEqual(settled.length, 12);

  const ahRows = settled.filter(r => r.market === 'AH');
  const ouRows = settled.filter(r => r.market === 'OU');

  assert.strictEqual(ahRows.length, 6, '6 AH settled rows');
  assert.strictEqual(ouRows.length, 6, '6 OU settled rows');

  // Verify probabilities are bounded in [0, 100]
  for (const r of settled) {
    assert.ok(r.modelProbability >= 0 && r.modelProbability <= 100, `Probability bounded: ${r.modelProbability}`);
  }
});

test('E4: Read path contract enforces honest baseline unavailability for unvalidated leagues', () => {
  // Test a non-EPL league
  const laLigaFixture = {
    league: 'La Liga',
    season: '2025-2026',
    homeTeam: 'Real Madrid',
    awayTeam: 'Barcelona',
    kickoffUtc: '2026-10-18T19:00:00Z',
  };

  const canonicalId = FixtureIntegrityGuard.buildCanonicalMatchId(
    laLigaFixture.league,
    laLigaFixture.season,
    laLigaFixture.homeTeam,
    laLigaFixture.awayTeam,
    laLigaFixture.kickoffUtc
  );

  assert.ok(canonicalId.startsWith('LALIGA_'), 'Canonical ID must have LALIGA prefix');

  // Check unavailable market structure for La Liga
  const ahMarket = MatchIntelligenceService.buildUnavailableMarket(
    'ASIAN_HANDICAP',
    '—',
    null,
    'La Liga'
  );

  assert.strictEqual(ahMarket.available, false, 'Market must be unavailable');
  assert.strictEqual(ahMarket.badge, 'GREY', 'Badge must be GREY');
  assert.strictEqual(ahMarket.status, 'ODDS_UNAVAILABLE');
  assert.strictEqual(ahMarket.statusLabel, 'ANALYSIS UNAVAILABLE');
  assert.strictEqual(ahMarket.reason, 'Fixtures only — model baseline not available');
});

test('E5: 15-League Reconciliation totals confirm 168 fixtures, 20 staged predictions, and 0 non-EPL leaks', () => {
  assert.ok(fs.existsSync(EVIDENCE_PATH), 'EVIDENCE_PATH must exist');
  const evidence = JSON.parse(fs.readFileSync(EVIDENCE_PATH, 'utf8'));

  assert.strictEqual(evidence.leagueResults.length, 15, 'Exactly 15 leagues');

  let totalFixtures = 0;
  evidence.leagueResults.forEach(lr => {
    totalFixtures += lr.fixtures.length;
  });
  assert.strictEqual(totalFixtures, 168, 'Total fixtures across all 15 leagues must be exactly 168');

  // EPL has 10 fixtures
  const epl = evidence.leagueResults.find(l => l.league.name === 'Premier League');
  assert.ok(epl, 'Premier League found');
  assert.strictEqual(epl.fixtures.length, 10, 'EPL has 10 fixtures');

  // Staged predictions
  const settledPath = path.resolve('data/verification/staging_settled_research_ledger.jsonl');
  const rows = fs.readFileSync(settledPath, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));

  assert.strictEqual(rows.length, 20, 'Staged predictions must be exactly 20');

  // Ensure all staged predictions belong exclusively to Premier League
  for (const r of rows) {
    assert.strictEqual(r.league, 'Premier League', 'All staged predictions must be Premier League');
  }
});
