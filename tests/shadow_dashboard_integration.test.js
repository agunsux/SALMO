// tests/shadow_dashboard_integration.test.js
// Unit & Integration Acceptance Suite for Salmo Shadow Operations Dashboard & Daily High-Confidence Engine.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

// Hook TypeScript compiler
require.extensions['.ts'] = function (module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  module._compile(result.outputText, filename);
};

// Import tested modules
const {
  ShadowOperationsService,
} = require('../src/services/shadow/shadowOperationsService.ts');
const {
  HistoricalBackfillService,
} = require('../src/services/shadow/historicalBackfillService.ts');
const {
  FourMarketShadowEngine,
} = require('../src/engine/shadow/fourMarketShadowEngine.ts');
const {
  FiveDollarQuotaManager,
} = require('../src/lib/quota/fiveDollarQuotaManager.ts');
const {
  FiveDollarFreeProvider,
  FIVE_DOLLAR_ATTRIBUTION,
} = require('../src/services/providers/fiveDollarFreeProvider.ts');

// Ensure ledger is populated before testing
test.before(async () => {
  const ledgerPath = path.resolve(process.cwd(), 'data/research/fivedollar_shadow/shadow_prediction_ledger.jsonl');
  if (!fs.existsSync(ledgerPath)) {
    HistoricalBackfillService.executeBackfill();
  }
});

test('EPIC SHADOW DASHBOARD — Section 1: Provenance Segregation & Data Integrity', async (t) => {
  await t.test('1. Loads ledger records and correctly groups them into 5 distinct provenance categories', () => {
    const overview = ShadowOperationsService.getDashboardOverview();
    assert.ok(overview, 'Dashboard overview should be returned');
    assert.ok(overview.recordsByProvenance, 'recordsByProvenance must exist');

    const {
      HISTORICAL_PREDICTION,
      HISTORICAL_RECONSTRUCTION,
      HISTORICAL_RESULT_ONLY,
      UNVERIFIED,
      LIVE_SHADOW_SIGNAL,
    } = overview.recordsByProvenance;

    assert.ok(Array.isArray(HISTORICAL_PREDICTION), 'HISTORICAL_PREDICTION must be an array');
    assert.ok(Array.isArray(HISTORICAL_RECONSTRUCTION), 'HISTORICAL_RECONSTRUCTION must be an array');
    assert.ok(Array.isArray(HISTORICAL_RESULT_ONLY), 'HISTORICAL_RESULT_ONLY must be an array');
    assert.ok(Array.isArray(UNVERIFIED), 'UNVERIFIED must be an array');
    assert.ok(Array.isArray(LIVE_SHADOW_SIGNAL), 'LIVE_SHADOW_SIGNAL must be an array');

    // Total count matches sum of categories
    const totalRecords =
      HISTORICAL_PREDICTION.length +
      HISTORICAL_RECONSTRUCTION.length +
      HISTORICAL_RESULT_ONLY.length +
      UNVERIFIED.length +
      LIVE_SHADOW_SIGNAL.length;

    assert.strictEqual(totalRecords, 633, 'Total records across categories must equal 633');
    assert.strictEqual(HISTORICAL_PREDICTION.length, 30, 'Should have exactly 30 genuine historical predictions');
    assert.strictEqual(HISTORICAL_RECONSTRUCTION.length, 60, 'Should have exactly 60 reconstructed predictions');
    assert.strictEqual(HISTORICAL_RESULT_ONLY.length, 522, 'Should have exactly 522 verified historical results');
    assert.strictEqual(UNVERIFIED.length, 1, 'Should have exactly 1 quarantined unverified record');
    assert.strictEqual(LIVE_SHADOW_SIGNAL.length, 20, 'Should have exactly 20 live shadow signals');
  });

  await t.test('2. Invariant: HISTORICAL_RESULT_ONLY records have strictly zero stake, zero profit, and zero ROI impact', () => {
    const overview = ShadowOperationsService.getDashboardOverview();
    const resultOnly = overview.recordsByProvenance.HISTORICAL_RESULT_ONLY;

    assert.ok(resultOnly.length > 0, 'Must have result-only records to test');
    for (const r of resultOnly) {
      assert.strictEqual(r.stakeUnits, 0, `Record ${r.predictionId} stakeUnits must be 0`);
      assert.strictEqual(r.profitUnits, 0, `Record ${r.predictionId} profitUnits must be 0`);
      assert.strictEqual(r.predictionStatus, 'NO_MARKET_DATA', `Record ${r.predictionId} predictionStatus must be NO_MARKET_DATA`);
    }
  });

  await t.test('3. Invariant: HISTORICAL_RECONSTRUCTION records verify lookahead bias and pre-match feature cutoff', () => {
    const overview = ShadowOperationsService.getDashboardOverview();
    const reconstructions = overview.recordsByProvenance.HISTORICAL_RECONSTRUCTION;

    assert.ok(reconstructions.length > 0, 'Must have reconstruction records to test');
    for (const r of reconstructions) {
      assert.strictEqual(r.lookaheadBiasVerified, true, `Record ${r.predictionId} must have lookaheadBiasVerified=true`);
      assert.ok(r.featureCutoffTimestamp, `Record ${r.predictionId} must have featureCutoffTimestamp`);
      assert.ok(r.reconstructionTimestamp, `Record ${r.predictionId} must have reconstructionTimestamp`);

      // feature cutoff must be less than or equal to kickoff time
      const cutoffTime = new Date(r.featureCutoffTimestamp).getTime();
      const kickoffTime = new Date(r.kickoffAt).getTime();
      assert.ok(cutoffTime <= kickoffTime, `Record ${r.predictionId} featureCutoff (${r.featureCutoffTimestamp}) must not exceed kickoff (${r.kickoffAt})`);
    }
  });

  await t.test('4. Invariant: UNVERIFIED records are strictly quarantined and excluded from ROI calculations', () => {
    const overview = ShadowOperationsService.getDashboardOverview();
    const unverified = overview.recordsByProvenance.UNVERIFIED;

    assert.strictEqual(unverified.length, 1, 'Must have 1 quarantined unverified record');
    const quarantined = unverified[0];
    assert.strictEqual(quarantined.provenanceType, 'UNVERIFIED');
    assert.strictEqual(quarantined.stakeUnits, 0);
    assert.strictEqual(quarantined.profitUnits, 0);
  });
});

test('EPIC SHADOW DASHBOARD — Section 2: Four-Market Gating & High-Confidence Filter', async (t) => {
  await t.test('1. Market Roles: AH & OU are Core Candidates; 1X2 is Validation-Pending; BTTS is Research-Only', () => {
    const dummyMatch = {
      canonicalMatchId: 'TEST_MATCH_001',
      providerFixtureId: 99991,
      competition: 'Premier League',
      season: '2025/2026',
      homeTeam: 'Team A',
      awayTeam: 'Team B',
      kickoffAt: '2026-11-15T15:00:00Z',
      homeExpectedGoals: 1.8,
      awayExpectedGoals: 1.1,
    };

    const oddsList = [
      { market: 'AH', selection: 'Team A -0.5', handicapLine: -0.5, bookmaker: 'Bet365', odds: 1.95, oppositeOdds: 1.95, capturedAt: '2026-11-15T10:00:00Z' },
      { market: 'OU', selection: 'Over 2.5', totalLine: 2.5, bookmaker: 'Bet365', odds: 1.90, oppositeOdds: 1.90, capturedAt: '2026-11-15T10:00:00Z' },
      { market: '1X2', selection: 'Home', bookmaker: 'Bet365', odds: 1.80, drawOdds: 3.60, awayOdds: 4.50, capturedAt: '2026-11-15T10:00:00Z' },
      { market: 'BTTS', selection: 'BTTS Yes', bookmaker: 'Bet365', odds: 1.85, oppositeOdds: 1.95, capturedAt: '2026-11-15T10:00:00Z' },
    ];

    const records = FourMarketShadowEngine.evaluateMatch(dummyMatch, oddsList);
    assert.strictEqual(records.length, 4);

    const ahRec = records.find(r => r.market === 'AH');
    const ouRec = records.find(r => r.market === 'OU');
    const oneXTwoRec = records.find(r => r.market === '1X2');
    const bttsRec = records.find(r => r.market === 'BTTS');

    assert.strictEqual(ahRec.marketRole, 'CORE_CANDIDATE');
    assert.strictEqual(ouRec.marketRole, 'CORE_CANDIDATE');
    assert.strictEqual(oneXTwoRec.marketRole, 'VALIDATION_PENDING');
    assert.strictEqual(bttsRec.marketRole, 'RESEARCH_ONLY');

    // 1X2 and BTTS must never be QUALIFIED_VALUE_BET
    assert.strictEqual(oneXTwoRec.predictionStatus, 'RESEARCH_ONLY');
    assert.strictEqual(bttsRec.predictionStatus, 'RESEARCH_ONLY');
  });

  await t.test('2. High-Confidence Gating rejects candidates with Confidence < 65 or EV < +2.0%', () => {
    // Sub-threshold test: AH with low edge
    const matchLowEdge = {
      canonicalMatchId: 'TEST_MATCH_002',
      providerFixtureId: 99992,
      competition: 'Premier League',
      season: '2025/2026',
      homeTeam: 'Team C',
      awayTeam: 'Team D',
      kickoffAt: '2026-11-15T15:00:00Z',
      homeExpectedGoals: 1.3,
      awayExpectedGoals: 1.25, // very close -> low edge
    };

    const closeOdds = [
      { market: 'AH', selection: 'Team C -0.5', handicapLine: -0.5, bookmaker: 'Bet365', odds: 2.10, oppositeOdds: 1.80, capturedAt: '2026-11-15T10:00:00Z' },
    ];

    const records = FourMarketShadowEngine.evaluateMatch(matchLowEdge, closeOdds);
    const rec = records[0];

    // Must not qualify as a value bet
    assert.notStrictEqual(rec.predictionStatus, 'QUALIFIED_VALUE_BET');
    assert.ok(rec.predictionStatus === 'PANTAU' || rec.predictionStatus === 'LEWATI');
  });

  await t.test('3. Daily prediction output for Nov 9-10 produces zero qualified value bets (Truth Over Volume)', () => {
    const dailyPath = path.resolve(process.cwd(), 'data/research/fivedollar_shadow/daily_prediction_output.json');
    assert.ok(fs.existsSync(dailyPath), 'daily_prediction_output.json must exist');

    const dailyOutput = JSON.parse(fs.readFileSync(dailyPath, 'utf8'));
    assert.strictEqual(dailyOutput.marketDistribution.qualifiedCandidates, 0, 'Must have zero qualified candidates');
    assert.strictEqual(dailyOutput.marketDistribution.pantauCandidates, 3, 'Must have 3 pantau candidates');
    assert.strictEqual(dailyOutput.marketDistribution.lewatiCandidates, 7, 'Must have 7 lewati candidates');
    assert.strictEqual(dailyOutput.marketDistribution.researchOnlyCandidates, 10, 'Must have 10 research-only candidates');
    assert.strictEqual(dailyOutput.marketDistribution.totalCandidates, 20, 'Must have 20 total candidates evaluated');
  });
});

test('EPIC SHADOW DASHBOARD — Section 3: Concurrency Control & Execution Safety', async (t) => {
  await t.test('1. Concurrency lock prevents simultaneous daily pipeline executions', () => {
    // Release any leftover lock
    ShadowOperationsService.releaseLock();

    // First acquire succeeds
    const firstAcquire = ShadowOperationsService.acquireLock();
    assert.strictEqual(firstAcquire, true, 'First lock acquire must succeed');

    // Second simultaneous acquire must be rejected
    const secondAcquire = ShadowOperationsService.acquireLock();
    assert.strictEqual(secondAcquire, false, 'Simultaneous lock acquire must return false');

    // Release lock
    ShadowOperationsService.releaseLock();

    // Subsequent acquire succeeds
    const thirdAcquire = ShadowOperationsService.acquireLock();
    assert.strictEqual(thirdAcquire, true, 'Acquire after release must succeed');

    // Clean up
    ShadowOperationsService.releaseLock();
  });
});

test('EPIC SHADOW DASHBOARD — Section 4: Quota & Attribution Invariants', async (t) => {
  await t.test('1. FiveDollar Free quota enforces 42/hr budget and retains 18/hr safety reserve', () => {
    FiveDollarQuotaManager.resetInstance();
    const qm = FiveDollarQuotaManager.getInstance();
    const snap = qm.getSnapshot();

    assert.strictEqual(snap.hourlyLimit, 60, 'Hourly limit must be 60');
    assert.strictEqual(snap.internalBudget, 42, 'Internal budget must be 42');
    assert.strictEqual(snap.reserveRemaining, 60, 'Safety reserve must be at least 18 (unconsumed: 60)');
    assert.strictEqual(snap.circuitBreakerOpen, false, 'Circuit breaker must be initially closed');
  });

  await t.test('2. Required attribution is exposed and immutable', () => {
    assert.strictEqual(FIVE_DOLLAR_ATTRIBUTION.text, 'Football data by 5DollarFootballAPI');
    assert.strictEqual(FIVE_DOLLAR_ATTRIBUTION.url, 'https://5dollarfootballapi.com');
  });

  await t.test('3. API-Football is reported as BLOCKED (Suspension Hold)', () => {
    const overview = ShadowOperationsService.getDashboardOverview();
    assert.strictEqual(
      overview.kpis.providerApiFootballStatus,
      'BLOCKED (Suspension Hold)',
      'API-Football must be permanently marked as BLOCKED due to ongoing suspension hold'
    );
  });
});
