const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
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
  EvidenceAccumulationService,
} = require('../src/engine/evidence/evidenceAccumulationService.ts');
const {
  CanonicalPredictionLedgerService,
} = require('../src/engine/ledger/canonicalPredictionLedger.ts');
const {
  evaluatePositionBrierLegs,
} = require('../src/engine/performance/brierScoring.ts');
const { OddsPapiQuotaGuard } = require('../src/lib/quota/oddsPapiQuotaGuard.ts');

test('EPIC 76 — Phase 1 & 2: Reconcile all cohorts, raw ledgers, and duplicate exclusions', () => {
  const liveRecords = CanonicalPredictionLedgerService.getProductionLiveLedger();
  const researchRecords = CanonicalPredictionLedgerService.getResearchLedger();
  assert.strictEqual(liveRecords.length, 30, 'Raw live ledger must contain exactly 30 records');
  assert.strictEqual(researchRecords.length, 336, 'Raw research ledger must contain exactly 336 records');

  const report = EvidenceAccumulationService.generateStatisticalEvidenceReport();

  // Summary reconciliation
  assert.strictEqual(report.summary.totalPredictionsGenerated, 366);
  assert.strictEqual(report.summary.totalEligibleForEvaluation, 30);
  assert.strictEqual(report.summary.totalExcluded, 336);
  assert.strictEqual(report.summary.totalSettledWithVerifiedResults, 12);
  assert.strictEqual(report.summary.totalEligibleWithVerifiedOdds, 30);

  // Exact cohort reconciliation (No duplicate records misallocated to SETTLED_VERIFIED_OOS or VERIFIED_ODDS_OOS)
  assert.strictEqual(report.cohortBreakdown.SETTLED_VERIFIED_OOS, 12, 'SETTLED_VERIFIED_OOS must be exactly 12');
  assert.strictEqual(report.cohortBreakdown.VERIFIED_ODDS_OOS, 18, 'VERIFIED_ODDS_OOS must be exactly 18');
  assert.strictEqual(report.cohortBreakdown.RESEARCH_SIMULATION, 336, 'RESEARCH_SIMULATION must be exactly 336');
  assert.strictEqual(report.cohortBreakdown.TIMESTAMP_VERIFIED_OOS, 0, 'TIMESTAMP_VERIFIED_OOS must be 0');
  assert.strictEqual(report.cohortBreakdown.TRAINING_DEV, 0, 'TRAINING_DEV must be 0');

  // Sum of cohorts must equal total predictions generated
  const totalCohortSum = Object.values(report.cohortBreakdown).reduce((a, b) => a + b, 0);
  assert.strictEqual(totalCohortSum, 366, 'Sum of cohorts must equal 366');

  // Exclusion breakdown
  assert.strictEqual(report.exclusionBreakdown.ELIGIBLE_FOR_EVALUATION, 30);
  assert.strictEqual(report.exclusionBreakdown.EXCLUDED_UNVERIFIED_TIMESTAMP, 316);
  assert.strictEqual(report.exclusionBreakdown.EXCLUDED_DUPLICATE_FIXTURE_MARKET, 20);
  assert.strictEqual(report.exclusionBreakdown.EXCLUDED_RETROSPECTIVE, 0);
  assert.strictEqual(report.exclusionBreakdown.EXCLUDED_MISSING_ODDS, 0);
  assert.strictEqual(report.exclusionBreakdown.EXCLUDED_TEMPORAL_LEAKAGE, 0);
});

test('EPIC 76 — Phase 3: Verify temporal and odds provenance of live prediction ledger', () => {
  const liveRecords = CanonicalPredictionLedgerService.getProductionLiveLedger();

  for (const r of liveRecords) {
    // 1. Kickoff timestamp validity
    const kickoffMs = Date.parse(r.kickoffUtc);
    assert.ok(!Number.isNaN(kickoffMs), `Fixture ${r.canonicalMatchId} has invalid kickoffUtc`);

    // 2. Prediction capture timestamp validity
    assert.ok(r.predictionTimestamp, `Fixture ${r.canonicalMatchId} missing predictionTimestamp`);
    const predMs = Date.parse(r.predictionTimestamp);
    assert.ok(!Number.isNaN(predMs), `Fixture ${r.canonicalMatchId} has unparseable predictionTimestamp`);

    // 3. Lead time pre-match invariant
    assert.ok(predMs < kickoffMs, `Prediction timestamp ${r.predictionTimestamp} is not strictly before kickoff ${r.kickoffUtc}`);
    const leadHours = (kickoffMs - predMs) / (3600 * 1000);
    assert.ok(leadHours >= 0.25, `Lead time ${leadHours}h must be >= 15 minutes before kickoff`);

    // 4. Odds provenance
    assert.ok(typeof r.originalOdds === 'number' && r.originalOdds > 1.0, `Record ${r.predictionId} has invalid odds`);
    assert.strictEqual(r.bookmaker, 'pinnacle', `Record ${r.predictionId} must have Pinnacle benchmark bookmaker`);

    // 5. Market line validity
    assert.ok(['AH', 'OU', 'BTTS'].includes(r.market), `Invalid market ${r.market}`);
    assert.ok(typeof r.line === 'number' && !Number.isNaN(r.line), `Invalid line ${r.line}`);
  }
});

test('EPIC 76 — Phase 4: Position vs market leg reconciliation, pushes, and Brier CI', () => {
  const snapshots = EvidenceAccumulationService.loadAllUnifiedSnapshots();
  const eligibleSettled = snapshots.filter(s => s.eligibilityStatus === 'ELIGIBLE_FOR_EVALUATION' && s.settlementStatus === 'SETTLED');
  assert.strictEqual(eligibleSettled.length, 12, 'Must have exactly 12 eligible settled positions');

  let totalLegsCount = 0;
  let pushLegsCount = 0;
  let resolvedLegsCount = 0;

  for (const s of eligibleSettled) {
    const decomp = evaluatePositionBrierLegs({
      positionId: s.predictionId,
      fixtureId: s.fixtureId,
      market: s.market,
      line: s.line,
      selection: s.selection,
      homeTeam: s.homeTeam,
      awayTeam: s.awayTeam,
      league: s.competitionName,
      homeGoals: s.homeGoals,
      awayGoals: s.awayGoals,
      fallbackProbability: s.modelProbability,
    });
    assert.ok(decomp, `Position ${s.predictionId} must successfully decompose into legs`);

    totalLegsCount += decomp.legs.length;
    pushLegsCount += decomp.nExcludedPushLegs;
    resolvedLegsCount += (decomp.legs.length - decomp.nExcludedPushLegs);
  }

  // 12 positions (3 single-line + 9 quarter-lines) = 21 total legs
  assert.strictEqual(totalLegsCount, 21, '12 positions must decompose into exactly 21 total legs');
  assert.strictEqual(pushLegsCount, 3, 'Must have exactly 3 excluded push legs');
  assert.strictEqual(resolvedLegsCount, 18, 'Must have exactly 18 resolved market legs');

  const report = EvidenceAccumulationService.generateStatisticalEvidenceReport();
  assert.strictEqual(report.statisticalMetrics.nResolvedLegs, 18);
  assert.strictEqual(report.statisticalMetrics.nExcludedPushLegs, 3);
  assert.strictEqual(report.statisticalMetrics.nResolvedPositions, 11);

  // Position Brier score and CI
  assert.strictEqual(report.statisticalMetrics.brierScore, 0.2364);
  assert.ok(
    report.statisticalMetrics.brier95ConfidenceInterval[0] <= 0.2500 &&
    0.2500 <= report.statisticalMetrics.brier95ConfidenceInterval[1],
    '95% CI must span 0.2500 coin-flip prior (confirming lack of statistical proof of edge)'
  );
  assert.strictEqual(report.statisticalMetrics.spansCoinFlipPrior, true);
});

test('EPIC 76 — Phase 5: Promotion gates, unambiguous denominators, and edge-vs-market status', () => {
  const report = EvidenceAccumulationService.generateStatisticalEvidenceReport();

  // Gates audit
  assert.strictEqual(report.preRegisteredPromotionGates.settledPositionsThreshold, 100);
  assert.strictEqual(report.preRegisteredPromotionGates.realizedSettledPositions, 12);
  assert.strictEqual(report.preRegisteredPromotionGates.settledPositionsGateStatus, 'INSUFFICIENT_SAMPLE');

  assert.strictEqual(report.preRegisteredPromotionGates.brierMarketLegsThreshold, 300);
  assert.strictEqual(report.preRegisteredPromotionGates.realizedBrierLegs, 18);
  assert.strictEqual(report.preRegisteredPromotionGates.brierLegsGateStatus, 'INSUFFICIENT_SAMPLE');

  assert.strictEqual(report.preRegisteredPromotionGates.maxLeakageRowsThreshold, 0);
  assert.strictEqual(report.preRegisteredPromotionGates.realizedLeakageRows, 0);
  assert.strictEqual(report.preRegisteredPromotionGates.evaluatedLeakageRecords, 30);
  assert.strictEqual(report.preRegisteredPromotionGates.leakageGateStatus, 'PASS');

  assert.strictEqual(report.preRegisteredPromotionGates.edgeVsMarketBenchmarkStatus, 'NOT_EVALUABLE');

  // Overall readiness verdict
  assert.strictEqual(report.readinessConclusions.researchReadiness, 'OPERATIONAL');
  assert.strictEqual(report.readinessConclusions.liveBettingReadiness, 'BLOCKED');
  assert.strictEqual(report.readinessConclusions.officialVerdict, 'INTEGRITY_VERIFIED_PRODUCTION_DEPLOYED');
});

test('EPIC 76 — Phase 6: Crons disabled and zero metered OddsPapi requests', async () => {
  // 1. vercel.json cron must be strictly empty array
  const vercelJsonPath = path.resolve(process.cwd(), 'vercel.json');
  assert.ok(fs.existsSync(vercelJsonPath), 'vercel.json must exist');
  const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));
  assert.deepStrictEqual(vercelConfig.crons, [], 'vercel.json crons must be strictly empty array []');

  // 2. OddsPapi quota guard must fail-closed
  const quotaCheck = await OddsPapiQuotaGuard.checkQuota(1);
  assert.strictEqual(quotaCheck.allowed, false, 'OddsPapi quota guard must deny requests');
});
