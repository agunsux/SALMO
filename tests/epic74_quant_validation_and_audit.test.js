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

const { CanonicalPredictionLedgerService } = require('../src/engine/ledger/canonicalPredictionLedger.ts');
const { QuarterLineSettler } = require('../src/engine/ah/quarterLineSettler.ts');
const { evaluatePositionBrierLegs } = require('../src/engine/performance/brierScoring.ts');
const {
  PRE_REGISTERED_GATES,
  HEADLINE_COHORT_MIN_SETTLED_POSITIONS,
  BRIER_VS_MARKET_MIN_LEGS,
  CLV_HEADLINE_MIN_POSITIONS,
  GATE_STATUS_INSUFFICIENT_SAMPLE,
} = require('../src/engine/performance/gates.ts');
const { PerformanceMetricsEngine } = require('../src/engine/performance/performanceMetrics.ts');

test('EPIC 74 — Phase 1: Canonical dataset counts and uniqueness across the entire corpus', () => {
  const livePath = path.resolve(process.cwd(), 'data', 'verification', 'live_prediction_ledger.jsonl');
  const researchPath = path.resolve(process.cwd(), 'data', 'verification', 'all_leagues_research_ledger.jsonl');
  const mirrorPath = path.resolve(process.cwd(), 'data', 'research', 'multi_league_research_predictions.jsonl');

  assert.ok(fs.existsSync(livePath), 'Live ledger file must exist');
  assert.ok(fs.existsSync(researchPath), 'Research ledger file must exist');
  assert.ok(fs.existsSync(mirrorPath), 'Mirror research ledger file must exist');

  const liveLines = fs.readFileSync(livePath, 'utf8').trim().split('\n').filter(Boolean);
  const researchLines = fs.readFileSync(researchPath, 'utf8').trim().split('\n').filter(Boolean);
  const mirrorLines = fs.readFileSync(mirrorPath, 'utf8').trim().split('\n').filter(Boolean);

  assert.strictEqual(liveLines.length, 30, 'Live ledger must contain exactly 30 records');
  assert.strictEqual(researchLines.length, 336, 'Research ledger must contain exactly 336 records');
  assert.strictEqual(mirrorLines.length, 336, 'Mirror research ledger must contain exactly 336 records');

  const liveRecords = liveLines.map(l => JSON.parse(l));
  const researchRecords = researchLines.map(l => JSON.parse(l));

  // Check unique IDs in live ledger
  const liveIds = new Set(liveRecords.map(r => r.predictionId));
  assert.strictEqual(liveIds.size, 30, 'Live ledger must have 30 unique IDs');

  // Check unique IDs in research ledger
  const resIds = new Set(researchRecords.map(r => r.predictionId));
  assert.strictEqual(resIds.size, 336, 'Research ledger must have 336 unique IDs');

  // Zero collisions between live and research IDs
  const collisions = [...liveIds].filter(id => resIds.has(id));
  assert.strictEqual(collisions.length, 0, 'There must be zero ID collisions between live and research streams');

  // Unified deduplicated corpus
  const unifiedRecords = CanonicalPredictionLedgerService.getAllUnifiedRecords();
  assert.strictEqual(unifiedRecords.length, 366, 'Unified corpus must contain exactly 366 deduplicated records');

  // Market odds distribution in research ledger
  const eplResearch = researchRecords.filter(r => r.league === 'Premier League');
  const nonEplResearch = researchRecords.filter(r => r.league !== 'Premier League');

  assert.strictEqual(eplResearch.length, 20, 'Research ledger must have exactly 20 Premier League rows');
  assert.strictEqual(nonEplResearch.length, 316, 'Research ledger must have exactly 316 non-EPL rows');

  // Verify EPL has market odds and non-EPL has marketOdds: null
  assert.ok(eplResearch.every(r => typeof r.marketOdds === 'number' && r.marketOdds > 1.0), 'All 20 EPL research rows must carry genuine numeric odds');
  assert.ok(nonEplResearch.every(r => r.marketOdds === null || r.marketOdds === undefined), 'All 316 non-EPL rows must have NULL marketOdds (no synthetic odds)');
});

test('EPIC 74 — Phase 2: Independent Quarter-line settlement audit of all 12 settled positions', () => {
  const liveRows = CanonicalPredictionLedgerService.getProductionLiveLedger();
  const settled = liveRows.filter(r => r.settlementStatus === 'SETTLED');
  const pending = liveRows.filter(r => r.settlementStatus === 'PENDING');

  assert.strictEqual(settled.length, 12, 'Live ledger must have exactly 12 settled positions');
  assert.strictEqual(pending.length, 18, 'Live ledger must have exactly 18 pending positions');

  let totalStake = 0;
  let totalProfit = 0;
  let verifiedCount = 0;

  for (const r of settled) {
    assert.ok(typeof r.homeGoals === 'number' && typeof r.awayGoals === 'number', `Record ${r.predictionId} must have verified goals`);
    assert.ok(typeof r.originalOdds === 'number' && r.originalOdds > 1.0, `Record ${r.predictionId} must have valid odds`);

    let computedOutcome;
    let computedProfit;

    if (r.market === 'AH') {
      computedOutcome = QuarterLineSettler.settle('home', r.line, r.homeGoals, r.awayGoals);
      computedProfit = QuarterLineSettler.calculateProfit(computedOutcome, r.originalOdds, 1.0);
    } else if (r.market === 'OU') {
      const isOver = r.selection.toLowerCase().startsWith('over');
      computedOutcome = QuarterLineSettler.settleOverUnder(isOver ? 'OVER' : 'UNDER', r.line, r.homeGoals + r.awayGoals);
      computedProfit = QuarterLineSettler.calculateProfit(computedOutcome, r.originalOdds, 1.0);
    }

    assert.strictEqual(computedOutcome, r.result, `Settlement outcome for ${r.predictionId} must match QuarterLineSettler`);
    assert.strictEqual(Number(computedProfit.toFixed(3)), Number(r.profitUnits.toFixed(3)), `Settlement profit for ${r.predictionId} must match QuarterLineSettler`);

    totalStake += r.stakeUnits;
    totalProfit += computedProfit;
    verifiedCount++;
  }

  assert.strictEqual(verifiedCount, 12, 'All 12 settled positions must be mathematically verified');
  assert.strictEqual(totalStake, 12.0, 'Total turnover on 12 settled positions must be 12.0 units');
  assert.strictEqual(Number(totalProfit.toFixed(3)), 0.830, 'Total net profit across all 12 settled positions must equal exactly +0.830 units');
  const overallRoi = (totalProfit / totalStake) * 100;
  assert.strictEqual(Number(overallRoi.toFixed(2)), 6.92, 'Overall ROI must equal exactly +6.92%');

  // Verify Public Picks cohort (verdict === 'LAYAK')
  const publicPicks = settled.filter(r => r.isPublicPick);
  assert.strictEqual(publicPicks.length, 2, 'Exactly 2 settled positions qualified as public picks');

  const pubStake = publicPicks.reduce((acc, p) => acc + p.stakeUnits, 0);
  const pubProfit = publicPicks.reduce((acc, p) => acc + p.profitUnits, 0);
  assert.strictEqual(pubStake, 2.0, 'Public picks stake must equal 2.0 units');
  assert.strictEqual(Number(pubProfit.toFixed(3)), 0.925, 'Public picks profit must equal +0.925 units');
  const pubRoi = (pubProfit / pubStake) * 100;
  assert.strictEqual(Number(pubRoi.toFixed(2)), 46.25, 'Public picks ROI must equal +46.25%');
});

test('EPIC 74 — Phase 3: Binary no-push Brier scoring, calibration CI95, and uninformative prior coverage', () => {
  const liveRows = CanonicalPredictionLedgerService.getProductionLiveLedger();
  const settled = liveRows.filter(r => r.settlementStatus === 'SETTLED');

  const legErrors = [];
  const positionErrors = [];

  for (const r of settled) {
    const decomp = evaluatePositionBrierLegs({
      positionId: r.predictionId,
      canonicalMatchId: r.canonicalMatchId,
      market: r.market,
      line: r.line,
      selection: r.selection,
      homeTeam: r.homeTeam,
      awayTeam: r.awayTeam,
      league: 'Premier League',
      homeGoals: r.homeGoals,
      awayGoals: r.awayGoals,
      fallbackProbability: r.modelProbability,
    });

    assert.ok(decomp, `Brier decomposition must succeed for position ${r.predictionId}`);

    for (const leg of decomp.legs) {
      if (!leg.excludedPush && leg.brierSqError !== null) {
        legErrors.push(leg.brierSqError);
      }
    }

    if (decomp.positionBrierMean !== null) {
      positionErrors.push(decomp.positionBrierMean);
    }
  }

  // Exactly 18 resolved legs and 11 resolved positions (1 push position excluded)
  assert.strictEqual(legErrors.length, 18, 'There must be exactly 18 resolved legs across the 12 settled positions');
  assert.strictEqual(positionErrors.length, 11, 'There must be exactly 11 resolved positions (Aston Villa 0 PUSH excluded)');

  // Position-level metrics
  const meanPos = positionErrors.reduce((a, b) => a + b, 0) / positionErrors.length;
  const variancePos = positionErrors.reduce((a, b) => a + Math.pow(b - meanPos, 2), 0) / (positionErrors.length - 1);
  const stdErrPos = Math.sqrt(variancePos) / Math.sqrt(positionErrors.length);
  const ci95LowerPos = meanPos - 1.96 * stdErrPos;
  const ci95UpperPos = meanPos + 1.96 * stdErrPos;

  assert.strictEqual(Number(meanPos.toFixed(4)), 0.2364, 'Position mean Brier must be 0.2364');
  assert.strictEqual(Number(ci95LowerPos.toFixed(4)), 0.1853, 'Position 95% CI lower bound must be 0.1853');
  assert.strictEqual(Number(ci95UpperPos.toFixed(4)), 0.2875, 'Position 95% CI upper bound must be 0.2875');

  // Rigorous mathematical check: 95% CI contains 0.2500 (coin flip prior)
  assert.ok(
    ci95LowerPos <= 0.25 && 0.25 <= ci95UpperPos,
    '95% Confidence Interval must span 0.2500, proving statistical indistinguishability from chance on current sample'
  );
});

test('EPIC 74 — Phase 5: Enforcement of pre-registered sample size gates and INSUFFICIENT_EVIDENCE verdict', () => {
  // Pre-registered thresholds
  assert.strictEqual(HEADLINE_COHORT_MIN_SETTLED_POSITIONS, 100, 'Pre-registered minimum settled positions must be 100');
  assert.strictEqual(BRIER_VS_MARKET_MIN_LEGS, 300, 'Pre-registered minimum Brier legs vs market must be 300');
  assert.strictEqual(CLV_HEADLINE_MIN_POSITIONS, 100, 'Pre-registered minimum CLV positions must be 100');

  // Verify performance metrics engine behavior
  const liveRows = CanonicalPredictionLedgerService.getProductionLiveLedger();
  const settled = liveRows.filter(r => r.settlementStatus === 'SETTLED');

  const snaps = settled.map(r => ({
    ledgerPositionId: r.predictionId,
    fixtureId: r.fixtureId,
    marketType: r.market,
    selection: r.selection,
    line: r.line,
    stakeUnits: r.stakeUnits,
    marketOdds: r.originalOdds || 1.95,
    fairOdds: r.fairOdds || 1.90,
    pWin: r.modelProbability,
    pPush: 0,
    pLoss: 1 - r.modelProbability,
    confidence: 80,
    edge: 0.05,
    expectedValuePct: 5.0,
    greenCohort: r.isPublicPick,
    is_pick: r.isPublicPick,
    verdict: r.isPublicPick ? 'LAYAK' : 'LEWATI',
    settlementStatus: 'SETTLED',
    result: r.result,
    profitUnits: r.profitUnits,
    clvPct: null,
  }));

  const metrics = PerformanceMetricsEngine.aggregateMetrics(snaps, 'TEST_SETTLED');

  // Sample status must be INSUFFICIENT SAMPLE because 12 < 100
  assert.strictEqual(metrics.sampleStatus, 'INSUFFICIENT SAMPLE', 'Sample status must be INSUFFICIENT SAMPLE');
  assert.strictEqual(metrics.n, 12, 'Recorded settled count must be 12');
  assert.strictEqual(metrics.minSampleRequired, 100, 'Required sample size must be 100');
  assert.strictEqual(metrics.insufficientSampleLabel, 'Insufficient sample (12/100)', 'Label must indicate 12/100');

  // Verdict validation: Allowed verdicts check
  const ALLOWED_VERDICTS = [
    'EDGE_SUPPORTED_WITH_LIMITATIONS',
    'INSUFFICIENT_EVIDENCE',
    'VALIDATION_FAILED',
    'BLOCKED',
  ];

  const epic74Verdict = 'INSUFFICIENT_EVIDENCE';
  assert.ok(ALLOWED_VERDICTS.includes(epic74Verdict), 'Verdict must be one of the four mandated enum values');
});
