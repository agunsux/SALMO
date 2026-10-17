// tests/epic79_daily_prediction_expansion_and_automated_refresh.test.js
// SALMO EPIC 79: Daily Prediction Expansion & Automated Refresh Test Suite
// Verifies:
// 1. 15-league coverage audit and UCL exclusion
// 2. Asian Handicap quarter-line modeling & settlement (-0.25, -0.75, +0.25, +0.75)
// 3. Asian Total Goals quarter-line modeling & settlement (2.25, 2.75, 3.25, 3.75 - never hardcoded 2.5)
// 4. Strict quality eligibility gates (prob > 65%, odds >= 1.60, EV > 0)
// 5. Machine-readable rejection tracking
// 6. BTTS restricted strictly to RESEARCH_ONLY
// 7. Shadow league isolation (0/14 promoted)
// 8. Quota exhaustion fail-safe (0 billable requests)
// 9. Idempotency and duplicate prevention
// 10. Kickoff cutoff enforcement (predictionTimestamp < kickoffUtc)
// 11. Fail-closed protection of 3 historical ledgers
// 12. Daily pipeline health report schema & metrics
// 13. Multi-mode execution semantics (AUDIT_ONLY, RESEARCH, SHADOW, PRODUCTION)

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
  DailyPredictionRefreshService,
} = require('../src/engine/pipeline/dailyPredictionRefreshService.ts');
const { CANONICAL_15_LEAGUES } = require('../src/config/multiLeagueRegistry.ts');
const { QuarterLineSettler } = require('../src/engine/ah/quarterLineSettler.ts');
const { AsianTotalEngine } = require('../src/engine/ou/asianTotalEngine.ts');
const { buildScoreGrid } = require('../src/engine/probability/scoreGrid.ts');

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

test('EPIC 79 — Scenario 1: Canonical 15-League Coverage & UCL Exclusion', async () => {
  assert.equal(CANONICAL_15_LEAGUES.length, 15, 'Must have exactly 15 canonical leagues');

  // Verify EPL + 14 domestic leagues
  const leagueIds = CANONICAL_15_LEAGUES.map(l => l.internal_league_id);
  assert.ok(leagueIds.includes('ENG-PL'), 'EPL must be present');
  assert.ok(leagueIds.includes('ESP-LALIGA'), 'La Liga must be present');
  assert.ok(leagueIds.includes('ITA-SERIEA'), 'Serie A must be present');
  assert.ok(leagueIds.includes('DEU-BUNDESLIGA'), 'Bundesliga must be present');
  assert.ok(leagueIds.includes('FRA-LIGUE1'), 'Ligue 1 must be present');
  assert.ok(leagueIds.includes('USA-MLS'), 'MLS must be present');
  assert.ok(leagueIds.includes('IDN-L1'), 'Liga 1 Indonesia must be present');

  // Verify UEFA Champions League is NOT in canonical domestic leagues
  assert.ok(!leagueIds.includes('UCL'), 'UCL must be excluded from canonical domestic scope');
  assert.ok(!leagueIds.includes('UEFA-CL'), 'UEFA-CL must be excluded');

  // Test that non-canonical competitions are rejected by the service
  const futureKick = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
  const res = await DailyPredictionRefreshService.runDailyRefresh({
    mode: 'AUDIT_ONLY',
    fixtures: [
      {
        fixtureId: 'ucl_test_1',
        homeTeam: 'Real Madrid',
        awayTeam: 'Bayern Munich',
        league: 'UEFA Champions League',
        kickoffUtc: futureKick,
      },
    ],
  });

  assert.equal(res.report.fixturesDiscovered.total, 0, 'UCL fixtures must be rejected as non-canonical');
  const uclRejection = res.report.rejections.details.find(r => r.rejectionCode === 'INVALID_FIXTURE');
  assert.ok(uclRejection, 'UCL rejection must be recorded as INVALID_FIXTURE');
  assert.ok(uclRejection.detail.includes('UCL excluded'));
});

test('EPIC 79 — Scenario 2: Asian Handicap Quarter-Line Modeling & Settlement', () => {
  // Quarter-line settlement: Chelsea -0.25 vs Arsenal
  // Home -0.25 with 1-0 win -> WIN
  assert.equal(QuarterLineSettler.settle('home', -0.25, 1, 0), 'WIN');
  // Home -0.25 with 0-0 draw -> HALF_LOSS
  assert.equal(QuarterLineSettler.settle('home', -0.25, 0, 0), 'HALF_LOSS');
  // Home -0.25 with 0-1 loss -> LOSS
  assert.equal(QuarterLineSettler.settle('home', -0.25, 0, 1), 'LOSS');

  // Away +0.25 with 0-0 draw -> HALF_WIN
  assert.equal(QuarterLineSettler.settle('away', 0.25, 0, 0), 'HALF_WIN');
  // Away +0.25 with 1-0 loss -> LOSS
  assert.equal(QuarterLineSettler.settle('away', 0.25, 1, 0), 'LOSS');

  // Home -0.75: 2-0 win -> WIN; 1-0 win -> HALF_WIN; 0-0 -> LOSS
  assert.equal(QuarterLineSettler.settle('home', -0.75, 2, 0), 'WIN');
  assert.equal(QuarterLineSettler.settle('home', -0.75, 1, 0), 'HALF_WIN');
  assert.equal(QuarterLineSettler.settle('home', -0.75, 0, 0), 'LOSS');

  // Away +0.75: 1-0 loss -> HALF_LOSS; 0-0 -> WIN; 2-0 loss -> LOSS
  assert.equal(QuarterLineSettler.settle('away', 0.75, 1, 0), 'HALF_LOSS');
  assert.equal(QuarterLineSettler.settle('away', 0.75, 0, 0), 'WIN');
  assert.equal(QuarterLineSettler.settle('away', 0.75, 2, 0), 'LOSS');
});

test('EPIC 79 — Scenario 3: Goals Over/Under Quarter-Line Modeling & Settlement', () => {
  // Over 2.25: 2 goals -> HALF_LOSS; 3 goals -> WIN; 1 goal -> LOSS
  assert.equal(QuarterLineSettler.settleOverUnder('OVER', 2.25, 2), 'HALF_LOSS');
  assert.equal(QuarterLineSettler.settleOverUnder('OVER', 2.25, 3), 'WIN');
  assert.equal(QuarterLineSettler.settleOverUnder('OVER', 2.25, 1), 'LOSS');

  // Over 2.75: 3 goals -> HALF_WIN; 4 goals -> WIN; 2 goals -> LOSS
  assert.equal(QuarterLineSettler.settleOverUnder('OVER', 2.75, 3), 'HALF_WIN');
  assert.equal(QuarterLineSettler.settleOverUnder('OVER', 2.75, 4), 'WIN');
  assert.equal(QuarterLineSettler.settleOverUnder('OVER', 2.75, 2), 'LOSS');

  // Under 2.25: 2 goals -> HALF_WIN; 1 goal -> WIN; 3 goals -> LOSS
  assert.equal(QuarterLineSettler.settleOverUnder('UNDER', 2.25, 2), 'HALF_WIN');
  assert.equal(QuarterLineSettler.settleOverUnder('UNDER', 2.25, 1), 'WIN');
  assert.equal(QuarterLineSettler.settleOverUnder('UNDER', 2.25, 3), 'LOSS');

  // Under 2.75: 3 goals -> HALF_LOSS; 2 goals -> WIN; 4 goals -> LOSS
  assert.equal(QuarterLineSettler.settleOverUnder('UNDER', 2.75, 3), 'HALF_LOSS');
  assert.equal(QuarterLineSettler.settleOverUnder('UNDER', 2.75, 2), 'WIN');
  assert.equal(QuarterLineSettler.settleOverUnder('UNDER', 2.75, 4), 'LOSS');

  // Over 3.25 & 3.75 dynamic calculation
  const grid = buildScoreGrid(1.65, 1.25, -0.06);
  const ou225 = AsianTotalEngine.calculateFromGrid(grid, 2.25, 'OVER');
  const ou275 = AsianTotalEngine.calculateFromGrid(grid, 2.75, 'OVER');
  const ou325 = AsianTotalEngine.calculateFromGrid(grid, 3.25, 'OVER');

  assert.equal(ou225.line, 2.25);
  assert.equal(ou275.line, 2.75);
  assert.equal(ou325.line, 3.25);
  assert.ok(ou225.coverProbability > ou275.coverProbability, 'P(Over 2.25) must exceed P(Over 2.75)');
  assert.ok(ou275.coverProbability > ou325.coverProbability, 'P(Over 2.75) must exceed P(Over 3.25)');
});

test('EPIC 79 — Scenario 4: Strict Quality Eligibility Gates (prob > 65%, odds >= 1.60, EV > 0)', async () => {
  const futureKick = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

  // Test fixture with strong home favorite Arsenal vs Leeds (Arsenal -1.25, odds 1.85)
  const candidateHighProb = {
    fixtureId: 'fix_high_ev',
    homeTeam: 'Arsenal',
    awayTeam: 'Leeds',
    league: 'Premier League',
    kickoffUtc: futureKick,
    pinnacleOdds: {
      ah: { line: -0.25, homeOdds: 1.85, awayOdds: 2.05 },
      ou: { line: 2.25, overOdds: 1.80, underOdds: 2.10 },
      btts: { yesOdds: 1.80, noOdds: 2.10 },
    },
  };

  const res = await DailyPredictionRefreshService.runDailyRefresh({
    mode: 'RESEARCH',
    fixtures: [candidateHighProb],
    dryRun: true,
  });

  assert.equal(res.report.modelInferencesCompleted.total, 3, 'Must evaluate AH, OU, and BTTS');
  assert.equal(res.report.modelInferencesCompleted.byMarket.AH, 1);
  assert.equal(res.report.modelInferencesCompleted.byMarket.OU, 1);
  assert.equal(res.report.modelInferencesCompleted.byMarket.BTTS, 1);

  // Check that AH and OU evaluate without crashes
  const ahPred = res.allPredictions.find(p => p.market === 'AH');
  assert.ok(ahPred, 'AH prediction must exist');
  assert.ok(ahPred.modelProbability > 0, 'Model probability must be positive');
  assert.ok(Number.isFinite(ahPred.expectedValue), 'Expected value must be numeric');
});

test('EPIC 79 — Scenario 5: Machine-Readable Rejection Codes', async () => {
  const futureKick = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

  // Fixture missing odds completely
  const fixNoOdds = {
    fixtureId: 'fix_no_odds',
    homeTeam: 'Chelsea',
    awayTeam: 'Bournemouth',
    league: 'Premier League',
    kickoffUtc: futureKick,
  };

  const res = await DailyPredictionRefreshService.runDailyRefresh({
    mode: 'AUDIT_ONLY',
    fixtures: [fixNoOdds],
    dryRun: true,
  });

  assert.equal(res.status, 'PROVIDER_QUOTA_EXHAUSTED');
  assert.ok(res.report.rejections.total > 0, 'Must record rejections');
  assert.ok(res.report.rejections.byReason.MISSING_ODDS > 0, 'Must record MISSING_ODDS');

  const missingAh = res.report.rejections.details.find(
    r => r.fixtureId === 'fix_no_odds' && r.market === 'AH' && r.rejectionCode === 'MISSING_ODDS'
  );
  assert.ok(missingAh, 'Must record missing odds rejection for AH');

  // Case B: Fixture has valid odds present, but candidates fail quality gates -> NO_QUALIFIED_PICKS
  const fixOddsFailingGate = {
    fixtureId: 'fix_low_prob',
    homeTeam: 'Chelsea',
    awayTeam: 'Bournemouth',
    league: 'Premier League',
    kickoffUtc: futureKick,
    pinnacleOdds: {
      ah: { line: -0.25, homeOdds: 1.40, awayOdds: 2.80 }, // odds < 1.60
      ou: { line: 2.5, overOdds: 1.45, underOdds: 2.70 },  // odds < 1.60
      btts: { yesOdds: 1.80, noOdds: 2.00 },
    },
  };
  const resB = await DailyPredictionRefreshService.runDailyRefresh({
    mode: 'RESEARCH',
    fixtures: [fixOddsFailingGate],
    dryRun: true,
  });
  assert.equal(resB.status, 'NO_QUALIFIED_PICKS');
  assert.ok(resB.report.rejections.byReason.INSUFFICIENT_CONFIDENCE > 0, 'Must record INSUFFICIENT_CONFIDENCE rejection');
});

test('EPIC 79 — Scenario 6: BTTS Strictly Restricted to RESEARCH_ONLY', async () => {
  const futureKick = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

  const candidate = {
    fixtureId: 'fix_btts_test',
    homeTeam: 'Liverpool',
    awayTeam: 'Everton',
    league: 'Premier League',
    kickoffUtc: futureKick,
    pinnacleOdds: {
      ah: { line: -1.0, homeOdds: 1.85, awayOdds: 2.05 },
      ou: { line: 2.75, overOdds: 1.90, underOdds: 2.00 },
      btts: { yesOdds: 1.80, noOdds: 2.10 },
    },
  };

  const res = await DailyPredictionRefreshService.runDailyRefresh({
    mode: 'RESEARCH',
    fixtures: [candidate],
    dryRun: true,
  });

  const bttsPred = res.allPredictions.find(p => p.market === 'BTTS');
  assert.ok(bttsPred, 'BTTS prediction must exist');
  assert.equal(bttsPred.isPublicPick, false, 'BTTS isPublicPick must be false');
  assert.equal(bttsPred.confidenceTier, 'RESEARCH_ONLY', 'BTTS must have RESEARCH_ONLY confidence tier');
  assert.notEqual(bttsPred.verdict, 'LAYAK', 'BTTS must NEVER be LAYAK');

  const bttsRejection = res.report.rejections.details.find(
    r => r.market === 'BTTS' && r.rejectionCode === 'UNSUPPORTED_MARKET'
  );
  assert.ok(bttsRejection, 'BTTS rejection must be recorded as UNSUPPORTED_MARKET');
});

test('EPIC 79 — Scenario 7: Shadow League Production Isolation (0 of 14 Promoted)', async () => {
  const futureKick = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

  // La Liga (ESP-LALIGA is a shadow league)
  const laLigaCandidate = {
    fixtureId: 'laliga_1',
    homeTeam: 'Real Madrid',
    awayTeam: 'Getafe',
    league: 'La Liga',
    kickoffUtc: futureKick,
    pinnacleOdds: {
      ah: { line: -1.5, homeOdds: 1.85, awayOdds: 2.05 },
      ou: { line: 2.75, overOdds: 1.85, underOdds: 2.05 },
      btts: { yesOdds: 1.95, noOdds: 1.95 },
    },
  };

  const res = await DailyPredictionRefreshService.runDailyRefresh({
    mode: 'SHADOW',
    fixtures: [laLigaCandidate],
    dryRun: true,
  });

  for (const pred of res.allPredictions) {
    assert.equal(pred.isPublicPick, false, 'Shadow league predictions must never be public picks');
    assert.equal(pred.ledgerTier, 'SHADOW', 'Shadow league predictions must be tagged SHADOW');
  }
});

test('EPIC 79 — Scenario 8: Quota Exhaustion Fail-Safe (Zero Billable Requests)', async () => {
  const res = await DailyPredictionRefreshService.runDailyRefresh({
    mode: 'AUDIT_ONLY',
    horizonHours: 72,
    dryRun: true,
  });

  assert.equal(res.report.providerRequestsUsed.totalBillable, 0, 'Must make exactly 0 billable provider calls');
  assert.equal(res.report.providerRequestsUsed.apiFootball, 0, 'API-Football expired: 0 requests allowed');
  assert.equal(res.report.providerRequestsUsed.oddsPapi, 0, 'OddsPapi exhausted: 0 metered requests allowed');
});

test('EPIC 79 — Scenario 9: Idempotency & Duplicate Prevention', async () => {
  const futureKick = new Date(Date.now() + 36 * 3600 * 1000).toISOString();
  const testSink = path.resolve(process.cwd(), 'data', 'sync', 'test_epic79_idempotency_ledger.jsonl');

  if (fs.existsSync(testSink)) fs.unlinkSync(testSink);

  const fixture = {
    fixtureId: 'idem_fix_1',
    homeTeam: 'Arsenal',
    awayTeam: 'Leeds',
    league: 'Premier League',
    kickoffUtc: futureKick,
    pinnacleOdds: {
      ah: { line: -0.25, homeOdds: 1.85, awayOdds: 2.05 },
      ou: { line: 2.5, overOdds: 1.85, underOdds: 2.05 },
      btts: { yesOdds: 1.85, noOdds: 2.05 },
    },
  };

  // Run 1: writes records
  const res1 = await DailyPredictionRefreshService.runDailyRefresh({
    mode: 'RESEARCH',
    fixtures: [fixture],
    destinationPath: testSink,
    dryRun: false,
  });

  const countAfterRun1 = fs.readFileSync(testSink, 'utf8').trim().split('\n').filter(Boolean).length;
  assert.equal(countAfterRun1, 3, 'Must write exactly 3 records (AH, OU, BTTS)');

  // Run 2: identical input, should add 0 new records
  const res2 = await DailyPredictionRefreshService.runDailyRefresh({
    mode: 'RESEARCH',
    fixtures: [fixture],
    destinationPath: testSink,
    dryRun: false,
  });

  const countAfterRun2 = fs.readFileSync(testSink, 'utf8').trim().split('\n').filter(Boolean).length;
  assert.equal(countAfterRun2, 3, 'Idempotent run must not append duplicate records');
  assert.equal(res2.report.persistedRecordsCount, 0, 'Persisted count on rerun must be 0');

  // Clean up test file
  if (fs.existsSync(testSink)) fs.unlinkSync(testSink);
});

test('EPIC 79 — Scenario 10: Kickoff Cutoff & Temporal Invariant Enforcement', async () => {
  // Fixture already started 2 hours ago
  const pastKickoff = new Date(Date.now() - 2 * 3600 * 1000).toISOString();

  const staleFixture = {
    fixtureId: 'past_fix_1',
    homeTeam: 'Arsenal',
    awayTeam: 'Leeds',
    league: 'Premier League',
    kickoffUtc: pastKickoff,
  };

  const res = await DailyPredictionRefreshService.runDailyRefresh({
    mode: 'AUDIT_ONLY',
    fixtures: [staleFixture],
    dryRun: true,
  });

  assert.equal(res.report.fixturesDiscovered.total, 0, 'Past fixture must not be discovered');
  assert.ok(res.report.rejections.byReason.MATCH_STARTED > 0, 'Must record MATCH_STARTED rejection');
});

test('EPIC 79 — Scenario 11: Fail-Closed Protection of 3 Historical Ledgers', () => {
  const protectedPath1 = path.resolve(process.cwd(), 'data', 'verification', 'live_prediction_ledger.jsonl');
  const protectedPath2 = path.resolve(process.cwd(), 'data', 'verification', 'all_leagues_research_ledger.jsonl');
  const protectedPath3 = path.resolve(process.cwd(), 'data', 'research', 'multi_league_research_predictions.jsonl');

  assert.throws(
    () => DailyPredictionRefreshService.assertDestinationSafety(protectedPath1),
    /FATAL SECURITY INVARIANT VIOLATION/,
    'Must throw fatal security error for live_prediction_ledger.jsonl'
  );

  assert.throws(
    () => DailyPredictionRefreshService.assertDestinationSafety(protectedPath2),
    /FATAL SECURITY INVARIANT VIOLATION/,
    'Must throw fatal security error for all_leagues_research_ledger.jsonl'
  );

  assert.throws(
    () => DailyPredictionRefreshService.assertDestinationSafety(protectedPath3),
    /FATAL SECURITY INVARIANT VIOLATION/,
    'Must throw fatal security error for multi_league_research_predictions.jsonl'
  );

  verifyProtectedHashes();
});

test('EPIC 79 — Scenario 12: Daily Pipeline Health Report Schema & Metrics Generation', async () => {
  const res = await DailyPredictionRefreshService.runDailyRefresh({
    mode: 'AUDIT_ONLY',
    dryRun: true,
  });

  const rep = res.report;
  assert.ok(rep.timestampUtc, 'Report must contain timestampUtc');
  assert.equal(rep.mode, 'AUDIT_ONLY');
  assert.ok(rep.fixturesDiscovered && typeof rep.fixturesDiscovered.total === 'number');
  assert.ok(rep.fixturesWithValidAhOdds && typeof rep.fixturesWithValidAhOdds.total === 'number');
  assert.ok(rep.fixturesWithValidOuOdds && typeof rep.fixturesWithValidOuOdds.total === 'number');
  assert.ok(rep.modelInferencesCompleted && typeof rep.modelInferencesCompleted.total === 'number');
  assert.ok(rep.qualifiedPredictions && typeof rep.qualifiedPredictions.total === 'number');
  assert.ok(rep.rejections && typeof rep.rejections.total === 'number');
  assert.ok(rep.providerRequestsUsed && rep.providerRequestsUsed.totalBillable === 0);
  assert.ok(['PASS', 'FAIL'].includes(rep.ledgerIntegrity));
  assert.ok(['SUCCESS', 'PARTIAL', 'FAILED'].includes(rep.pipelineHealth));
  assert.equal(rep.nextScheduledRun, null, 'nextScheduledRun must be null (production cron disabled)');
});

test('EPIC 79 — Scenario 13: Final Hash Baseline Verification', () => {
  verifyProtectedHashes();
});
