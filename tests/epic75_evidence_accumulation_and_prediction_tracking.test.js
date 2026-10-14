const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

// TypeScript loader for CommonJS test execution
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
  EvidenceAccumulationService,
} = require('../src/engine/evidence/evidenceAccumulationService.ts');
const { QuarterLineSettler } = require('../src/engine/ah/quarterLineSettler.ts');
const { OddsPapiQuotaGuard } = require('../src/lib/quota/oddsPapiQuotaGuard.ts');
const {
  HEADLINE_COHORT_MIN_SETTLED_POSITIONS,
  BRIER_VS_MARKET_MIN_LEGS,
  CLV_HEADLINE_MIN_POSITIONS,
} = require('../src/engine/performance/gates.ts');

test('EPIC 75 — Phase A: Immutable prediction snapshot schema and provenance hash integrity', () => {
  const snapshot = EvidenceAccumulationService.createSnapshot({
    predictionId: 'test_pred_001',
    canonicalMatchId: 'EPL_2026_ARSENALFC_LEEDSUNITED_2026-10-10',
    fixtureId: '1557417',
    competitionId: 'ENG-PL',
    competitionName: 'Premier League',
    homeTeam: 'Arsenal',
    awayTeam: 'Leeds United',
    kickoffUtc: '2026-10-10T14:00:00+00:00',
    predictionTimestamp: '2026-10-10T11:00:00+00:00',
    market: 'AH',
    selection: 'Arsenal FC -1.25',
    line: -1.25,
    modelVersion: 'dixon-coles-v1.0',
    featureVersion: 'dynamic-ratings-v2.0',
    modelProbability: 0.5842,
    fairOdds: 1.712,
    confidenceScore: 85,
    confidenceTier: 'HIGH',
    expectedValuePct: 14.5,
    edge: 0.074,
    bookmaker: 'pinnacle',
    marketOdds: 1.961,
    oddsTimestamp: '2026-10-10T11:00:00+00:00',
    dataSource: 'SALMO_INDEPENDENT_EVIDENCE_PIPELINE',
    isPublicPick: true,
    verdict: 'LAYAK',
  });

  assert.ok(snapshot.snapshotId.startsWith('snap_'), 'Snapshot ID must begin with snap_');
  assert.strictEqual(snapshot.predictionId, 'test_pred_001');
  assert.strictEqual(snapshot.line, -1.25);
  assert.strictEqual(snapshot.modelProbability, 0.5842);
  assert.strictEqual(snapshot.marketOdds, 1.961);
  assert.strictEqual(snapshot.leadTimeHoursBeforeKickoff, 3.0);
  assert.strictEqual(snapshot.cohort, 'VERIFIED_ODDS_OOS');
  assert.strictEqual(snapshot.eligibilityStatus, 'ELIGIBLE_FOR_EVALUATION');
  assert.strictEqual(snapshot.exclusionReason, null);

  // Provenance hash reproducibility
  const expectedHash = EvidenceAccumulationService.computeSnapshotProvenanceHash({
    predictionId: 'test_pred_001',
    canonicalMatchId: 'EPL_2026_ARSENALFC_LEEDSUNITED_2026-10-10',
    market: 'AH',
    selection: 'Arsenal FC -1.25',
    line: -1.25,
    modelVersion: 'dixon-coles-v1.0',
    featureVersion: 'dynamic-ratings-v2.0',
    modelProbability: 0.5842,
    marketOdds: 1.961,
    kickoffUtc: '2026-10-10T14:00:00+00:00',
  });
  assert.strictEqual(snapshot.provenanceHash, expectedHash, 'Provenance hash must match deterministic calculation');
});

test('EPIC 75 — Phase B.1: Timestamp verification and rejection of batch placeholders and retrospective predictions', () => {
  // Case 1: Known batch placeholder timestamp (2026-10-11T05:00:00.000Z)
  const placeholderSnap = EvidenceAccumulationService.createSnapshot({
    canonicalMatchId: 'ESP_2026_REALMADRID_BARCELONA_2026-10-15',
    fixtureId: '1570999',
    competitionId: 'ESP-LALIGA',
    competitionName: 'La Liga',
    homeTeam: 'Real Madrid',
    awayTeam: 'Barcelona',
    kickoffUtc: '2026-10-15T19:00:00+00:00',
    predictionTimestamp: '2026-10-11T05:00:00.000Z',
    market: 'OU',
    selection: 'Over 2.5',
    line: 2.5,
    modelProbability: 0.52,
    marketOdds: 1.95,
  });
  assert.strictEqual(placeholderSnap.eligibilityStatus, 'EXCLUDED_UNVERIFIED_TIMESTAMP');
  assert.ok(placeholderSnap.exclusionReason.includes('batch placeholder'));

  // Case 2: Retrospective prediction (prediction timestamp >= kickoff)
  const retroSnap = EvidenceAccumulationService.createSnapshot({
    canonicalMatchId: 'ENG_2026_CHELSEAFC_BOURNEMOUTH_2026-10-10',
    fixtureId: '1557420',
    competitionId: 'ENG-PL',
    competitionName: 'Premier League',
    homeTeam: 'Chelsea',
    awayTeam: 'Bournemouth',
    kickoffUtc: '2026-10-10T14:00:00+00:00',
    predictionTimestamp: '2026-10-10T14:05:00+00:00', // 5 minutes after kickoff
    market: 'AH',
    selection: 'Chelsea -0.75',
    line: -0.75,
    modelProbability: 0.58,
    marketOdds: 1.925,
  });
  assert.strictEqual(retroSnap.eligibilityStatus, 'EXCLUDED_RETROSPECTIVE');
  assert.ok(retroSnap.exclusionReason.includes('at or after kickoff'));

  // Case 3: Missing prediction timestamp
  const missingTsSnap = EvidenceAccumulationService.createSnapshot({
    canonicalMatchId: 'ITA_2026_JUVENTUS_MILAN_2026-10-18',
    fixtureId: '1580111',
    competitionId: 'ITA-SERIEA',
    competitionName: 'Serie A',
    homeTeam: 'Juventus',
    awayTeam: 'Milan',
    kickoffUtc: '2026-10-18T19:45:00+00:00',
    predictionTimestamp: null,
    market: 'OU',
    selection: 'Over 2.5',
    line: 2.5,
    modelProbability: 0.50,
  });
  assert.strictEqual(missingTsSnap.eligibilityStatus, 'EXCLUDED_UNVERIFIED_TIMESTAMP');
});

test('EPIC 75 — Phase B.2: Missing odds handling and invalid probability rejection', () => {
  // Case 1: Missing odds (marketOdds: null)
  const noOddsSnap = EvidenceAccumulationService.createSnapshot({
    canonicalMatchId: 'DEU_2026_BAYERN_DORTMUND_2026-10-17',
    fixtureId: '1590222',
    competitionId: 'DEU-BUNDESLIGA',
    competitionName: 'Bundesliga',
    homeTeam: 'Bayern Munich',
    awayTeam: 'Borussia Dortmund',
    kickoffUtc: '2026-10-17T16:30:00+00:00',
    predictionTimestamp: '2026-10-17T12:00:00+00:00',
    market: 'AH',
    selection: 'Bayern -1.0',
    line: -1.0,
    modelProbability: 0.62,
    marketOdds: null, // Odds unavailable due to quota exhaustion
  });
  assert.strictEqual(noOddsSnap.cohort, 'RESEARCH_SIMULATION');
  assert.strictEqual(noOddsSnap.eligibilityStatus, 'EXCLUDED_MISSING_ODDS');
  assert.strictEqual(noOddsSnap.marketOdds, null);

  // Case 2: Invalid probability (p <= 0 or p >= 1)
  const invalidProbSnapZero = EvidenceAccumulationService.createSnapshot({
    canonicalMatchId: 'FRA_2026_PSG_MARSEILLE_2026-10-19',
    fixtureId: '1600333',
    competitionId: 'FRA-LIGUE1',
    competitionName: 'Ligue 1',
    homeTeam: 'PSG',
    awayTeam: 'Marseille',
    kickoffUtc: '2026-10-19T19:00:00+00:00',
    predictionTimestamp: '2026-10-19T14:00:00+00:00',
    market: 'AH',
    selection: 'PSG -1.5',
    line: -1.5,
    modelProbability: 0.0, // Invalid
    marketOdds: 1.95,
  });
  assert.strictEqual(invalidProbSnapZero.eligibilityStatus, 'EXCLUDED_INVALID_PROBABILITY');

  const invalidProbSnapOne = EvidenceAccumulationService.createSnapshot({
    canonicalMatchId: 'FRA_2026_PSG_MARSEILLE_2026-10-19',
    fixtureId: '1600333',
    competitionId: 'FRA-LIGUE1',
    competitionName: 'Ligue 1',
    homeTeam: 'PSG',
    awayTeam: 'Marseille',
    kickoffUtc: '2026-10-19T19:00:00+00:00',
    predictionTimestamp: '2026-10-19T14:00:00+00:00',
    market: 'AH',
    selection: 'PSG -1.5',
    line: -1.5,
    modelProbability: 1.0, // Invalid
    marketOdds: 1.95,
  });
  assert.strictEqual(invalidProbSnapOne.eligibilityStatus, 'EXCLUDED_INVALID_PROBABILITY');
});

test('EPIC 75 — Phase C: Idempotent recording and duplicate prevention', () => {
  const tempLedgerPath = path.resolve(process.cwd(), 'data', 'verification', 'temp_test_evidence_ledger.jsonl');
  if (fs.existsSync(tempLedgerPath)) fs.unlinkSync(tempLedgerPath);

  try {
    const snap = EvidenceAccumulationService.createSnapshot({
      predictionId: 'idempotent_test_001',
      canonicalMatchId: 'EPL_2026_TEST_A_VS_B',
      fixtureId: '9999001',
      competitionId: 'ENG-PL',
      competitionName: 'Premier League',
      homeTeam: 'Team A',
      awayTeam: 'Team B',
      kickoffUtc: '2026-10-20T14:00:00+00:00',
      predictionTimestamp: '2026-10-20T10:00:00+00:00',
      market: 'AH',
      selection: 'Team A -0.5',
      line: -0.5,
      modelProbability: 0.55,
      marketOdds: 1.90,
    });

    // First write: success, not duplicate
    const res1 = EvidenceAccumulationService.recordSnapshot(snap, tempLedgerPath);
    assert.strictEqual(res1.success, true);
    assert.strictEqual(res1.isDuplicate, false);

    // Second write with identical snapshot: idempotent skip, isDuplicate = true
    const res2 = EvidenceAccumulationService.recordSnapshot(snap, tempLedgerPath);
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.isDuplicate, true);
    assert.ok(res2.reason.includes('already exists'));

    // File must contain exactly 1 line
    const lines = fs.readFileSync(tempLedgerPath, 'utf8').trim().split('\n').filter(Boolean);
    assert.strictEqual(lines.length, 1);
  } finally {
    if (fs.existsSync(tempLedgerPath)) fs.unlinkSync(tempLedgerPath);
  }
});

test('EPIC 75 — Phase D: Settlement immutability, quarter-line split, and statistical evidence reporting', () => {
  const report = EvidenceAccumulationService.generateStatisticalEvidenceReport();

  // Summary counts
  assert.strictEqual(report.summary.totalPredictionsGenerated, 366);
  assert.strictEqual(report.summary.totalEligibleForEvaluation, 30);
  assert.strictEqual(report.summary.totalExcluded, 336);
  assert.strictEqual(report.summary.totalSettledWithVerifiedResults, 12);
  assert.strictEqual(report.summary.totalWithVerifiedOdds, 50);

  // Exclusion breakdown
  assert.strictEqual(report.exclusionBreakdown.EXCLUDED_UNVERIFIED_TIMESTAMP, 316);
  assert.strictEqual(report.exclusionBreakdown.EXCLUDED_DUPLICATE_FIXTURE_MARKET, 20);

  // Betting performance
  assert.strictEqual(report.bettingPerformance.diagnosticAllRowsCohort.nSettled, 12);
  assert.strictEqual(report.bettingPerformance.diagnosticAllRowsCohort.unitsStaked, 12.0);
  assert.strictEqual(report.bettingPerformance.diagnosticAllRowsCohort.profitUnits, 0.830);
  assert.strictEqual(report.bettingPerformance.diagnosticAllRowsCohort.roiPct, 6.92);
  assert.strictEqual(report.bettingPerformance.diagnosticAllRowsCohort.sampleStatus, 'INSUFFICIENT SAMPLE');

  // Public picks
  assert.strictEqual(report.bettingPerformance.qualifiedPublicPicksCohort.nSettled, 2);
  assert.strictEqual(report.bettingPerformance.qualifiedPublicPicksCohort.unitsStaked, 2.0);
  assert.strictEqual(report.bettingPerformance.qualifiedPublicPicksCohort.profitUnits, 0.925);
  assert.strictEqual(report.bettingPerformance.qualifiedPublicPicksCohort.roiPct, 46.25);
  assert.strictEqual(report.bettingPerformance.qualifiedPublicPicksCohort.sampleStatus, 'INSUFFICIENT SAMPLE');

  // Statistical calibration
  assert.strictEqual(report.statisticalMetrics.brierScore, 0.2364);
  assert.strictEqual(report.statisticalMetrics.nResolvedLegs, 18);
  assert.strictEqual(report.statisticalMetrics.nResolvedPositions, 11);
  assert.strictEqual(report.statisticalMetrics.spansCoinFlipPrior, true);
  assert.ok(
    report.statisticalMetrics.brier95ConfidenceInterval[0] <= 0.2500 &&
    0.2500 <= report.statisticalMetrics.brier95ConfidenceInterval[1],
    '95% Confidence Interval must cover 0.2500 coin-flip prior'
  );

  // Pre-registered promotion gates
  assert.strictEqual(report.preRegisteredPromotionGates.settledPositionsThreshold, HEADLINE_COHORT_MIN_SETTLED_POSITIONS);
  assert.strictEqual(report.preRegisteredPromotionGates.settledPositionsGateStatus, 'INSUFFICIENT_SAMPLE');
  assert.strictEqual(report.preRegisteredPromotionGates.brierMarketLegsThreshold, BRIER_VS_MARKET_MIN_LEGS);
  assert.strictEqual(report.preRegisteredPromotionGates.brierLegsGateStatus, 'INSUFFICIENT_SAMPLE');
  assert.strictEqual(report.preRegisteredPromotionGates.leakageGateStatus, 'PASS');

  // Readiness status
  assert.strictEqual(report.readinessConclusions.researchReadiness, 'OPERATIONAL');
  assert.strictEqual(report.readinessConclusions.liveBettingReadiness, 'BLOCKED');
  assert.strictEqual(report.readinessConclusions.officialVerdict, 'EVIDENCE_PIPELINE_DEPLOYED');
});

test('EPIC 75 — Phase E: Provider quota exhaustion protection', async () => {
  assert.strictEqual(OddsPapiQuotaGuard.HARD_STOP_RATIO, 0.90, 'Hard-stop ratio must be 90%');
  const status = await OddsPapiQuotaGuard.checkQuota(1);
  assert.strictEqual(status.allowed, false, 'Unconfigured/exhausted quota must fail-closed with allowed: false');
});
