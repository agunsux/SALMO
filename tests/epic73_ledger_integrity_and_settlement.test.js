const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

// TypeScript loader
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

const { CanonicalPredictionLedgerService } = require('../src/engine/ledger/canonicalPredictionLedger.ts');
const { QuarterLineSettler } = require('../src/engine/ah/quarterLineSettler.ts');
const { SettlementEngine } = require('../src/engine/settlement/settlementEngine.ts');
const { CANONICAL_15_LEAGUES } = require('../src/config/multiLeagueRegistry.ts');

test('EPIC 73 — 1. Canonical Live Ledger: Exactly 30 records, 12 settled with verified P&L and 18 pending with 0 stake', () => {
  const liveRows = CanonicalPredictionLedgerService.getProductionLiveLedger();
  assert.strictEqual(liveRows.length, 30, 'Production live ledger must have exactly 30 records');

  const settled = liveRows.filter(r => r.settlementStatus === 'SETTLED');
  const pending = liveRows.filter(r => r.settlementStatus === 'PENDING');

  assert.strictEqual(settled.length, 12, 'Exactly 12 records must be SETTLED');
  assert.strictEqual(pending.length, 18, 'Exactly 18 records must be PENDING');

  // Verify all settled rows have scores, valid results, and non-null settledAt
  for (const s of settled) {
    assert.ok(s.matchScore, `Settled row ${s.predictionId} must have matchScore`);
    assert.strictEqual(typeof s.homeGoals, 'number', `Settled row ${s.predictionId} must have homeGoals`);
    assert.strictEqual(typeof s.awayGoals, 'number', `Settled row ${s.predictionId} must have awayGoals`);
    assert.ok(['WIN', 'HALF_WIN', 'PUSH', 'HALF_LOSS', 'LOSS'].includes(s.result), `Settled row ${s.predictionId} must have valid outcome: ${s.result}`);
    assert.strictEqual(s.stakeUnits, 1.0, `Settled row ${s.predictionId} must have 1.0 stakeUnits`);
    assert.ok(s.settledAt, `Settled row ${s.predictionId} must have settledAt timestamp`);
  }

  // Verify all pending rows have 0 profitUnits
  for (const p of pending) {
    assert.strictEqual(p.profitUnits, 0, `Pending row ${p.predictionId} must have 0 profitUnits`);
    assert.strictEqual(p.result, null, `Pending row ${p.predictionId} must have null result`);
  }
});

test('EPIC 73 — 2. Canonical Multi-League Research Ledger: 336 records across 15 canonical leagues with clean lineage', () => {
  const researchRows = CanonicalPredictionLedgerService.getResearchLedger();
  assert.strictEqual(researchRows.length, 336, 'Research ledger must contain exactly 336 rows');

  const leagueSet = new Set(researchRows.map(r => r.competitionName));
  assert.ok(leagueSet.size >= 14, `Must cover at least 14 domestic leagues, found: ${leagueSet.size}`);

  // Confirm UCL is never present
  assert.ok(!leagueSet.has('Champions League'), 'Champions League must NOT be present');
  assert.ok(!leagueSet.has('UEFA Champions League'), 'UEFA Champions League must NOT be present');

  for (const r of researchRows) {
    assert.ok(r.predictionId, 'Must have predictionId');
    assert.ok(r.canonicalMatchId, 'Must have canonicalMatchId');
    assert.ok(['AH', 'OU'].includes(r.market), `Market must be AH or OU, got: ${r.market}`);
    assert.strictEqual(r.isPublicPick, false, 'Research rows must NEVER qualify as public picks');
    if (r.competitionName !== 'Premier League') {
      assert.strictEqual(r.originalOdds, null, `Non-EPL uncalibrated research rows must report null odds, got: ${r.originalOdds} for ${r.competitionName}`);
    }
    assert.strictEqual(r.profitUnits, 0, 'Research rows must have 0 profitUnits');
    assert.ok(r.provenanceHash, 'Must have cryptographic provenanceHash');
  }
});

test('EPIC 73 — 3. Reconciled Mirror Ledger: multi_league_research_predictions.jsonl exists and matches schema', () => {
  const syncResult = CanonicalPredictionLedgerService.reconcileAndExportResearchLedger();
  assert.strictEqual(syncResult.synchronized, true);
  assert.strictEqual(syncResult.count, 336);

  const mirrorPath = path.resolve('data/research/multi_league_research_predictions.jsonl');
  assert.ok(fs.existsSync(mirrorPath), 'Mirror file must exist');

  const lines = fs.readFileSync(mirrorPath, 'utf8').trim().split('\n').filter(Boolean);
  assert.strictEqual(lines.length, 336, 'Mirror file must contain exactly 336 lines');

  const first = JSON.parse(lines[0]);
  assert.ok(first.predictionId);
  assert.ok(first.canonicalMatchId);
  assert.ok(first.provenanceHash);
  assert.strictEqual(first.originalSourcePath, 'data/verification/all_leagues_research_ledger.jsonl');
});

test('EPIC 73 — 4. Unified Deduplicated Dataset: 366 total records with zero loss of integrity', () => {
  const unified = CanonicalPredictionLedgerService.getAllUnifiedRecords();
  assert.strictEqual(unified.length, 366, 'Unified dataset must contain 366 records (336 research + 30 production live)');

  for (const rec of unified) {
    const check = CanonicalPredictionLedgerService.verifyRecordIntegrity(rec);
    assert.strictEqual(check.valid, true, `Record ${rec.predictionId} integrity failed: ${check.errors.join('; ')}`);
  }
});

test('EPIC 73 — 5. Quarter-Line Settlement Math: Precision across AH and OU quarter splits', () => {
  // Chelsea -0.75 vs Bournemouth (5-1) -> WIN
  const chelseaWin = QuarterLineSettler.settle('home', -0.75, 5, 1);
  assert.strictEqual(chelseaWin, 'WIN');
  assert.strictEqual(QuarterLineSettler.calculateProfit(chelseaWin, 1.925, 1.0), 0.925);

  // Arsenal -1.25 vs Leeds (2-1) -> HALF_LOSS
  const arsenalHalfLoss = QuarterLineSettler.settle('home', -1.25, 2, 1);
  assert.strictEqual(arsenalHalfLoss, 'HALF_LOSS');
  assert.strictEqual(QuarterLineSettler.calculateProfit(arsenalHalfLoss, 1.961, 1.0), -0.5);

  // Aston Villa 0 vs Brentford (2-2) -> PUSH
  const villaPush = QuarterLineSettler.settle('home', 0, 2, 2);
  assert.strictEqual(villaPush, 'PUSH');
  assert.strictEqual(QuarterLineSettler.calculateProfit(villaPush, 1.961, 1.0), 0);

  // Over 2.75 in a 2-1 match (total 3 goals) -> HALF_WIN
  const ouHalfWin = QuarterLineSettler.settleOverUnder('OVER', 2.75, 3);
  assert.strictEqual(ouHalfWin, 'HALF_WIN');
  assert.strictEqual(QuarterLineSettler.calculateProfit(ouHalfWin, 1.98, 1.0), 0.49);

  // Over 3.25 in a 1-1 match (total 2 goals) -> LOSS
  const ouLoss = QuarterLineSettler.settleOverUnder('OVER', 3.25, 2);
  assert.strictEqual(ouLoss, 'LOSS');
  assert.strictEqual(QuarterLineSettler.calculateProfit(ouLoss, 2.03, 1.0), -1.0);
});

test('EPIC 73 — 6. Settlement Engine Idempotency: Repeated settlement yields identical results', () => {
  const input = {
    ledgerPositionId: 'test_pos_001',
    marketType: 'AH',
    selection: 'Chelsea FC -0.75',
    line: -0.75,
    oddsTaken: 1.925,
    homeGoals: 5,
    awayGoals: 1,
    matchStatus: 'FINISHED',
  };

  const res1 = SettlementEngine.settlePosition(input);
  const res2 = SettlementEngine.settlePosition(input);

  assert.strictEqual(res1.result, 'WIN');
  assert.strictEqual(res1.result, res2.result);
  assert.strictEqual(res1.profitUnits, res2.profitUnits);
  assert.strictEqual(res1.stakeUnits, res2.stakeUnits);
  assert.strictEqual(res1.settlementStatus, res2.settlementStatus);
});

test('EPIC 73 — 7. Production Safety: vercel.json crons empty and UCL excluded from canonical registry', () => {
  const vercelConfig = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  assert.deepStrictEqual(vercelConfig.crons, [], 'vercel.json crons must be strictly empty []');

  const uclInRegistry = CANONICAL_15_LEAGUES.some(l =>
    l.league_name.toLowerCase().includes('champions league') ||
    l.internal_league_id.toLowerCase().includes('ucl')
  );
  assert.strictEqual(uclInRegistry, false, 'UEFA Champions League must be completely absent from CANONICAL_15_LEAGUES');
});
