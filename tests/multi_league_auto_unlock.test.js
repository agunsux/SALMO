// SALMO.DEV — Release Hardening (H1–H6) & Multi-League Propose-Only Governance Test Suite
// Validates all mandatory requirements across H1, H2, H3, H4, H5, and H6:
// 1. H1: Default-false database persistence & ALLOW_PRODUCTION_DB_WRITE gate
// 2. H2: PROPOSE_ONLY mode by default on quota reset (zero automatic production promotions)
// 3. H2: Manual promotion requires explicitHumanApproval=true + ALLOW_MANUAL_LEAGUE_PROMOTION='true' + all 5 per-market proofs (including historical Pinnacle benchmark)
// 4. H2/F1: Quota-reset detector states (QUOTA_EXHAUSTED, RESET_UNVERIFIED, QUOTA_AVAILABLE, ACTIVATION_IN_PROGRESS, 50-request EPL reserve)
// 5. H2/F3: Fault isolation & automatic rollback to SHADOW when smoke test fails under manual approval
// 6. H3: Cron & scheduler safety (/api/cron/predict & /api/cron/settle default OFF; settle-cron.yml manual workflow_dispatch only)
// 7. H4: Backtest integrity (strict chronological walk-forward, balanced half-line AH & OU 2.5 95% bootstrap CIs, Pinnacle benchmark, NOT_APPROVED_FOR_PRODUCTION for all 14 non-EPL leagues)
// 8. H5: Data licensing & provenance (TheSportsDB disabled by default unless ENABLE_THESPORTSDB === 'true')
// 9. H6: Multi-league research ledger (336 rows across 15 leagues, 12 settled EPL rows, model_probability in 0..1, SHADOW is_pick=false)

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
        resolveJsonModule: true,
      },
    });
    module._compile(compiled.outputText, filename);
  };
}

const {
  resetRegistryToDefaultState,
  isLeagueMarketProductionEnabled,
  getLeagueMarketBlocker,
  getPriorityOrderedLeaguesForOdds,
  getTournamentBatches,
} = require('../src/config/multiLeagueRegistry.ts');
const { OddsPapiQuotaGuard } = require('../src/lib/quota/oddsPapiQuotaGuard.ts');
const { MultiLeagueAutoActivator } = require('../src/engine/activation/multiLeagueAutoActivator.ts');
const { ProductionPredictionEngine } = require('../src/engine/pipeline/productionPredictionEngine.ts');
const { MatchIntelligenceService } = require('../src/engine/matchIntelligenceService.ts');
const { TheSportsDbProvider } = require('../src/services/providers/theSportsDbProvider.ts');

function buildMockAccountPayload(requestCount, requestLimit = 250, isActive = true) {
  return {
    api_key: '[REDACTED]',
    subscriptions: [
      {
        plan: 'free',
        is_active: isActive,
        request_limit: requestLimit,
        request_count: requestCount,
        valid_from: '2026-10-01T00:00:00.000Z',
        valid_until: null,
        sport_ids: [10],
        bookmakers: {
          pinnacle: {
            has_live_odds: true,
          },
        },
      },
    ],
  };
}

function buildSimulatedResetFixturesAndOdds() {
  const futureKickoff = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
  const capturedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const fixtures = [
    // EPL
    { providerFixtureId: 'id100001', homeTeam: 'Arsenal', awayTeam: 'Chelsea', league: 'Premier League', kickoffTime: futureKickoff, season: '2026' },
    { providerFixtureId: 'id100002', homeTeam: 'Liverpool', awayTeam: 'Everton', league: 'Premier League', kickoffTime: futureKickoff, season: '2026' },
    // Non-EPL candidate fixtures (2 fixtures each to prove non-degenerate variance)
    { providerFixtureId: 'id200001', homeTeam: 'Real Madrid', awayTeam: 'Getafe', league: 'La Liga', kickoffTime: futureKickoff, season: '2026' },
    { providerFixtureId: 'id200002', homeTeam: 'Barcelona', awayTeam: 'Sevilla', league: 'La Liga', kickoffTime: futureKickoff, season: '2026' },
    { providerFixtureId: 'id300001', homeTeam: 'Bayern Munich', awayTeam: 'Augsburg', league: 'Bundesliga', kickoffTime: futureKickoff, season: '2026' },
    { providerFixtureId: 'id300002', homeTeam: 'Borussia Dortmund', awayTeam: 'Mainz 05', league: 'Bundesliga', kickoffTime: futureKickoff, season: '2026' },
    { providerFixtureId: 'id400001', homeTeam: 'Paris Saint Germain', awayTeam: 'Nantes', league: 'Ligue 1', kickoffTime: futureKickoff, season: '2026' },
    { providerFixtureId: 'id400002', homeTeam: 'Monaco', awayTeam: 'Lens', league: 'Ligue 1', kickoffTime: futureKickoff, season: '2026' },
    { providerFixtureId: 'id500001', homeTeam: 'PSV Eindhoven', awayTeam: 'NEC Nijmegen', league: 'Eredivisie', kickoffTime: futureKickoff, season: '2026' },
    { providerFixtureId: 'id500002', homeTeam: 'Ajax', awayTeam: 'Twente', league: 'Eredivisie', kickoffTime: futureKickoff, season: '2026' },
    { providerFixtureId: 'id600001', homeTeam: 'Sporting CP', awayTeam: 'Arouca', league: 'Primeira Liga', kickoffTime: futureKickoff, season: '2026' },
    { providerFixtureId: 'id600002', homeTeam: 'Benfica', awayTeam: 'Braga', league: 'Primeira Liga', kickoffTime: futureKickoff, season: '2026' },
    { providerFixtureId: 'id700001', homeTeam: 'Inter', awayTeam: 'Cagliari', league: 'Serie A', kickoffTime: futureKickoff, season: '2026' },
    { providerFixtureId: 'id700002', homeTeam: 'Napoli', awayTeam: 'Torino', league: 'Serie A', kickoffTime: futureKickoff, season: '2026' },
    { providerFixtureId: 'id800001', homeTeam: 'Club Brugge', awayTeam: 'Westerlo', league: 'Belgian Pro League', kickoffTime: futureKickoff, season: '2026' },
    { providerFixtureId: 'id800002', homeTeam: 'Genk', awayTeam: 'Standard Liege', league: 'Belgian Pro League', kickoffTime: futureKickoff, season: '2026' },
  ];

  const buildOddsForFixture = (fid, ahLine = -0.75, ouLine = 2.5) => [
    {
      providerFixtureId: fid,
      bookmaker: 'pinnacle',
      marketType: 'ASIAN_HANDICAP',
      line: ahLine,
      homeOdds: 1.98,
      awayOdds: 1.92,
      isMainLine: true,
      capturedAt,
    },
    {
      providerFixtureId: fid,
      bookmaker: 'pinnacle',
      marketType: 'OVER_UNDER',
      line: ouLine,
      homeOdds: 1.95,
      awayOdds: 1.95,
      isMainLine: true,
      capturedAt,
    },
    {
      providerFixtureId: fid,
      bookmaker: 'pinnacle',
      marketType: 'BTTS',
      line: 0,
      homeOdds: 1.85,
      awayOdds: 1.95,
      isMainLine: true,
      capturedAt,
    },
  ];

  const batch1Odds = [
    ...buildOddsForFixture('id100001', -1.0, 2.75),
    ...buildOddsForFixture('id100002', -1.25, 2.5),
    ...buildOddsForFixture('id200001', -1.25, 2.75),
    ...buildOddsForFixture('id200002', -1.0, 3.0),
    ...buildOddsForFixture('id300001', -1.5, 3.25),
    ...buildOddsForFixture('id300002', -0.75, 2.75),
    ...buildOddsForFixture('id400001', -1.25, 2.75),
    ...buildOddsForFixture('id400002', -0.5, 2.5),
    ...buildOddsForFixture('id500001', -1.5, 3.0),
    ...buildOddsForFixture('id500002', -0.75, 2.75),
  ];

  const batch2Odds = [
    ...buildOddsForFixture('id600001', -1.25, 2.75),
    ...buildOddsForFixture('id600002', -0.75, 2.5),
    ...buildOddsForFixture('id700001', -1.25, 2.5),
    ...buildOddsForFixture('id700002', -0.75, 2.5),
    ...buildOddsForFixture('id800001', -1.0, 2.75),
    ...buildOddsForFixture('id800002', -0.5, 2.5),
  ];

  return {
    fixtures,
    oddsByBatch: {
      '17,8,35,34,37': batch1Odds,
      '238,23,38': batch2Odds,
    },
  };
}

function buildPassingProofOverride(markets = ['AH', 'OU']) {
  const passAh = markets.includes('AH');
  const passOu = markets.includes('OU');
  return {
    nTrainInitial: 795,
    nEval: 300,
    chronologicalWalkForwardVerified: true,
    ahBalancedHalfLine: {
      brier: passAh ? 0.2380 : 0.2510,
      brierCi95: passAh ? [0.2290, 0.2460] : [0.2420, 0.2600],
      beatsConstant05At95Ci: passAh,
      logLoss: passAh ? 0.6680 : 0.7010,
      calibrationSlope: passAh ? 0.9200 : 0.4100,
    },
    ahHomeMinus05: {
      brier: 0.2100,
      brierCi95: [0.1950, 0.2250],
      beatsConstant05At95Ci: true,
      logLoss: 0.6100,
      calibrationSlope: 0.9000,
    },
    ahBalancedQuarterLine: {
      brier: 0.2050,
    },
    ou25: {
      brier: passOu ? 0.2290 : 0.2580,
      brierCi95: passOu ? [0.2150, 0.2420] : [0.2440, 0.2710],
      beatsConstant05At95Ci: passOu,
      logLoss: passOu ? 0.6510 : 0.7080,
      calibrationSlope: passOu ? 0.8900 : 0.3500,
    },
    pinnacleBenchmark: {
      available: true,
      matchedFixtures: 120,
      ou25PinnacleBrier: 0.2410,
      ou25ModelBrierOnMatched: 0.2390,
      ahMarketLinePinnacleBrier: 0.2090,
      ahMarketLineModelBrierOnMatched: 0.2080,
    },
    marketApproval: {
      AH: passAh ? 'PROPOSED_READY_FOR_HUMAN_REVIEW' : 'NOT_APPROVED_FOR_PRODUCTION',
      OU: passOu ? 'PROPOSED_READY_FOR_HUMAN_REVIEW' : 'NOT_APPROVED_FOR_PRODUCTION',
      approvalBlockers: [],
    },
  };
}

// ─── H1: PRODUCTION DATABASE WRITE AUDIT & DEFAULT-FALSE PERSISTENCE ─────────

test('H1.1: OddsPapiQuotaGuard.isProductionDatabaseWriteAllowed defaults to false and blocks test/CI/preview environments', () => {
  const origAllow = process.env.ALLOW_PRODUCTION_DB_WRITE;
  const origNodeEnv = process.env.NODE_ENV;
  const origCi = process.env.CI;
  const origVercelEnv = process.env.VERCEL_ENV;

  try {
    delete process.env.ALLOW_PRODUCTION_DB_WRITE;
    assert.strictEqual(OddsPapiQuotaGuard.isProductionDatabaseWriteAllowed(false), false);
    assert.strictEqual(OddsPapiQuotaGuard.isProductionDatabaseWriteAllowed(true), false);

    process.env.ALLOW_PRODUCTION_DB_WRITE = 'true';
    process.env.NODE_ENV = 'production';
    delete process.env.CI;
    delete process.env.VERCEL_ENV;
    assert.strictEqual(OddsPapiQuotaGuard.isProductionDatabaseWriteAllowed(false), false, 'Caller must also pass allowProductionWrite=true');
    assert.strictEqual(OddsPapiQuotaGuard.isProductionDatabaseWriteAllowed(true), true, 'Allowed only when both caller flag and env var are true in production');

    process.env.VERCEL_ENV = 'preview';
    assert.strictEqual(OddsPapiQuotaGuard.isProductionDatabaseWriteAllowed(true), false, 'Must block writes in VERCEL_ENV=preview');

    delete process.env.VERCEL_ENV;
    process.env.CI = 'true';
    assert.strictEqual(OddsPapiQuotaGuard.isProductionDatabaseWriteAllowed(true), false, 'Must block writes in CI=true');

    delete process.env.CI;
    process.env.NODE_ENV = 'test';
    assert.strictEqual(OddsPapiQuotaGuard.isProductionDatabaseWriteAllowed(true), false, 'Must block writes in NODE_ENV=test');
  } finally {
    if (origAllow === undefined) delete process.env.ALLOW_PRODUCTION_DB_WRITE;
    else process.env.ALLOW_PRODUCTION_DB_WRITE = origAllow;
    if (origNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = origNodeEnv;
    if (origCi === undefined) delete process.env.CI;
    else process.env.CI = origCi;
    if (origVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = origVercelEnv;
  }
});

test('H1.2: MultiLeagueAutoActivator defaults productionWriteAllowed to false even if persistToDatabase=true is passed without env override', async () => {
  resetRegistryToDefaultState();
  OddsPapiQuotaGuard.resetCircuitBreaker();

  const exhaustedPayload = buildMockAccountPayload(260, 250, true);
  const res = await MultiLeagueAutoActivator.runAutoUnlockCycle({
    mode: 'SIMULATED_RESET_TEST',
    injectedAccountData: exhaustedPayload,
    persistToDatabase: true,
    allowProductionWrite: true,
    writeVerificationArtifact: false,
  });

  assert.strictEqual(res.productionWriteAllowed, false, 'productionWriteAllowed must remain false when ALLOW_PRODUCTION_DB_WRITE is not set');
  assert.strictEqual(res.promotionMode, 'PROPOSE_ONLY');
  assert.strictEqual(res.billableRequestsMade, 0);
});

// ─── F1: QUOTA-RESET DETECTOR TESTS ─────────────────────────────────────────

test('F1.1: Quota-Reset Detector returns QUOTA_EXHAUSTED when count is 260/250 and makes 0 billable requests', async () => {
  resetRegistryToDefaultState();
  OddsPapiQuotaGuard.resetCircuitBreaker();

  const exhaustedPayload = buildMockAccountPayload(260, 250, true);
  const res = await MultiLeagueAutoActivator.runAutoUnlockCycle({
    mode: 'SIMULATED_RESET_TEST',
    injectedAccountData: exhaustedPayload,
    writeVerificationArtifact: false,
  });

  assert.strictEqual(res.quotaDetection.state, 'QUOTA_EXHAUSTED');
  assert.strictEqual(res.quotaDetection.requestCount, 260);
  assert.strictEqual(res.quotaDetection.requestLimit, 250);
  assert.strictEqual(res.quotaDetection.mandatoryReserve, 50);
  assert.strictEqual(res.quotaDetection.operationalCeiling, 200);
  assert.strictEqual(res.quotaDetection.remainingOperationalBudget, 0);
  assert.strictEqual(res.billableRequestsMade, 0, 'Must make 0 billable calls when quota is exhausted');
  assert.strictEqual(res.leaguesPromoted.length, 0, 'Must not promote any non-EPL league when quota is exhausted');
  assert.strictEqual(res.activeLeaguesAfterRun.length, 1, 'Only EPL remains ACTIVE');
  assert.strictEqual(res.activeLeaguesAfterRun[0].internalLeagueId, 'ENG-PL');
});

test('F1.2: Quota-Reset Detector returns RESET_UNVERIFIED when /v4/account cannot be verified (never guesses by calendar date)', async () => {
  resetRegistryToDefaultState();
  OddsPapiQuotaGuard.resetCircuitBreaker();

  const res = await MultiLeagueAutoActivator.runAutoUnlockCycle({
    mode: 'SIMULATED_RESET_TEST',
    injectedAccountData: null,
    writeVerificationArtifact: false,
  });

  assert.strictEqual(res.quotaDetection.state, 'RESET_UNVERIFIED');
  assert.strictEqual(res.quotaDetection.providerStatus, 'UNVERIFIED_OFFLINE');
  assert.strictEqual(res.billableRequestsMade, 0, 'Must make 0 billable calls when account state is unverified');
  assert.strictEqual(res.leaguesPromoted.length, 0);
});

test('F1.3: Quota-Reset Detector returns QUOTA_AVAILABLE when /v4/account resets (0/250 -> 200 operational budget above 50 reserve)', async () => {
  resetRegistryToDefaultState();
  OddsPapiQuotaGuard.resetCircuitBreaker();

  const resetPayload = buildMockAccountPayload(0, 250, true);
  const detection = await OddsPapiQuotaGuard.detectQuotaReset(3, false, resetPayload);

  assert.strictEqual(detection.state, 'QUOTA_AVAILABLE');
  assert.strictEqual(detection.requestCount, 0);
  assert.strictEqual(detection.requestLimit, 250);
  assert.strictEqual(detection.mandatoryReserve, 50);
  assert.strictEqual(detection.operationalCeiling, 200);
  assert.strictEqual(detection.remainingTotal, 250);
  assert.strictEqual(detection.remainingOperationalBudget, 200);
  assert.strictEqual(detection.hasPinnacle, true);
  assert.strictEqual(detection.supportsFootball, true);
});

test('F1.4: Concurrency lock prevents duplicate concurrent activation runs (returns ACTIVATION_IN_PROGRESS)', async () => {
  resetRegistryToDefaultState();
  OddsPapiQuotaGuard.resetCircuitBreaker();

  const lock = OddsPapiQuotaGuard.acquireActivationLock('test_cycle_1');
  assert.strictEqual(lock.acquired, true);

  try {
    const secondLock = OddsPapiQuotaGuard.acquireActivationLock('test_cycle_1');
    assert.strictEqual(secondLock.acquired, false);

    const detection = await OddsPapiQuotaGuard.detectQuotaReset(3, false, buildMockAccountPayload(0, 250, true));
    assert.strictEqual(detection.state, 'ACTIVATION_IN_PROGRESS');
  } finally {
    OddsPapiQuotaGuard.releaseActivationLock(lock.lockId);
  }
});

// ─── H2: PROPOSE-ONLY MODE & MANUAL PROMOTION GOVERNANCE TESTS ───────────────

test('H2.1: Priority queue & 50-request mandatory reserve hard-stop', async () => {
  resetRegistryToDefaultState();
  OddsPapiQuotaGuard.resetCircuitBreaker();

  const allNonPaused = getPriorityOrderedLeaguesForOdds();
  const batches = getTournamentBatches(allNonPaused.slice(0, 8), 5);

  assert.strictEqual(batches.length, 2, '8 tournaments fit in 2 batches of <= 5');
  assert.deepStrictEqual(batches[0], [17, 8, 35, 34, 37], 'Batch 1: EPL, La Liga, Bundesliga, Ligue 1, Eredivisie');
  assert.deepStrictEqual(batches[1], [238, 23, 38], 'Batch 2: Primeira Liga, Serie A, Belgian Pro League');

  // Verify 199/250 blocks non-EPL batch activation while keeping 51 requests for EPL reserve
  const nearReservePayload = buildMockAccountPayload(199, 250, true);
  const detection = await OddsPapiQuotaGuard.detectQuotaReset(3, false, nearReservePayload);
  assert.strictEqual(detection.state, 'QUOTA_EXHAUSTED');
  assert.strictEqual(detection.remainingTotal, 51);
  assert.strictEqual(detection.remainingOperationalBudget, 1);
  assert.ok(detection.reason.includes('50-request reserve'));
});

test('H2.2: Default PROPOSE_ONLY mode NEVER promotes any non-EPL league on quota reset even when odds and proofs are present', async () => {
  resetRegistryToDefaultState();
  OddsPapiQuotaGuard.resetCircuitBreaker();

  try {
    const resetAccount = buildMockAccountPayload(0, 250, true);
    const { fixtures, oddsByBatch } = buildSimulatedResetFixturesAndOdds();

    const res = await MultiLeagueAutoActivator.runAutoUnlockCycle({
      mode: 'SIMULATED_RESET_TEST',
      injectedAccountData: resetAccount,
      injectedFixtures: fixtures,
      injectedOddsByTournamentBatch: oddsByBatch,
      injectedBacktestOverride: {
        'NED-ERE': buildPassingProofOverride(['AH', 'OU']),
        'ITA-SERIEA': buildPassingProofOverride(['AH']),
      },
      writeVerificationArtifact: false,
    });

    assert.strictEqual(res.promotionMode, 'PROPOSE_ONLY');
    assert.strictEqual(res.leaguesPromoted.length, 0, 'PROPOSE_ONLY mode must promote 0 leagues automatically');
    assert.deepStrictEqual(
      res.activeLeaguesAfterRun.map(l => l.internalLeagueId),
      ['ENG-PL'],
      'Only ENG-PL remains ACTIVE in PROPOSE_ONLY mode'
    );
    assert.strictEqual(res.shadowLeaguesAfterRun.length, 13, 'All 13 non-EPL leagues must remain SHADOW');
    assert.strictEqual(isLeagueMarketProductionEnabled('NED-ERE', 'AH'), false);
    assert.strictEqual(isLeagueMarketProductionEnabled('NED-ERE', 'OU'), false);

    // Verify NED-ERE was recorded as PROPOSED_FOR_REVIEW (not ACTIVE)
    const nedEval = res.leagueEvaluations.find(e => e.internalLeagueId === 'NED-ERE');
    assert.strictEqual(nedEval.newStatus, 'SHADOW');
    assert.strictEqual(nedEval.markets.AH.readinessState, 'PROPOSED_FOR_REVIEW');
    assert.strictEqual(nedEval.markets.OU.readinessState, 'PROPOSED_FOR_REVIEW');
    assert.ok(res.leaguesProposedForReview.some(p => p.internalLeagueId === 'NED-ERE'));
  } finally {
    resetRegistryToDefaultState();
    OddsPapiQuotaGuard.resetCircuitBreaker();
  }
});

test('H2.3: Even with explicitHumanApproval=true + ALLOW_MANUAL_LEAGUE_PROMOTION=true, real H4 backtest artifact blocks all 14 non-EPL leagues due to missing Pinnacle benchmark (PinMatch=0)', async () => {
  resetRegistryToDefaultState();
  OddsPapiQuotaGuard.resetCircuitBreaker();
  const origManual = process.env.ALLOW_MANUAL_LEAGUE_PROMOTION;

  try {
    process.env.ALLOW_MANUAL_LEAGUE_PROMOTION = 'true';
    const resetAccount = buildMockAccountPayload(0, 250, true);
    const { fixtures, oddsByBatch } = buildSimulatedResetFixturesAndOdds();

    const res = await MultiLeagueAutoActivator.runAutoUnlockCycle({
      mode: 'SIMULATED_RESET_TEST',
      explicitHumanApproval: true,
      injectedAccountData: resetAccount,
      injectedFixtures: fixtures,
      injectedOddsByTournamentBatch: oddsByBatch,
      writeVerificationArtifact: false,
    });

    assert.strictEqual(res.promotionMode, 'MANUAL_APPROVED_PROMOTION');
    assert.strictEqual(res.leaguesPromoted.length, 0, 'Zero non-EPL leagues may promote without historical Pinnacle benchmark');
    assert.deepStrictEqual(res.activeLeaguesAfterRun.map(l => l.internalLeagueId), ['ENG-PL']);

    // NED-ERE passes balanced Brier CI95 on AH and OU 2.5, so its remaining blocker is BLOCKED_PINNACLE_BENCHMARK
    const nedEval = res.leagueEvaluations.find(e => e.internalLeagueId === 'NED-ERE');
    assert.strictEqual(nedEval.newStatus, 'SHADOW');
    assert.strictEqual(nedEval.markets.AH.readinessState, 'BLOCKED_PINNACLE_BENCHMARK');
    assert.strictEqual(nedEval.markets.OU.readinessState, 'BLOCKED_PINNACLE_BENCHMARK');

    // ESP-LALIGA fails balanced half-line CI95 upper bound (< 0.2500), so its blocker is BLOCKED_MODEL_VALIDATION
    const espEval = res.leagueEvaluations.find(e => e.internalLeagueId === 'ESP-LALIGA');
    assert.strictEqual(espEval.newStatus, 'SHADOW');
    assert.strictEqual(espEval.markets.AH.readinessState, 'BLOCKED_MODEL_VALIDATION');
    assert.strictEqual(espEval.markets.OU.readinessState, 'BLOCKED_MODEL_VALIDATION');

    // SCO-PREM & ENG-CHAMP remain BLOCKED_DATA_QUALITY
    for (const lid of ['SCO-PREM', 'ENG-CHAMP']) {
      const evalEntry = res.leagueEvaluations.find(e => e.internalLeagueId === lid);
      assert.strictEqual(evalEntry.newStatus, 'SHADOW');
      assert.strictEqual(evalEntry.markets.AH.readinessState, 'BLOCKED_DATA_QUALITY');
      assert.strictEqual(evalEntry.markets.OU.readinessState, 'BLOCKED_DATA_QUALITY');
    }

    // JPN-J1 & KOR-K1 remain BLOCKED_COLD_START
    for (const lid of ['JPN-J1', 'KOR-K1']) {
      const evalEntry = res.leagueEvaluations.find(e => e.internalLeagueId === lid);
      assert.strictEqual(evalEntry.newStatus, 'SHADOW');
      assert.strictEqual(evalEntry.markets.AH.readinessState, 'BLOCKED_COLD_START');
      assert.strictEqual(evalEntry.markets.OU.readinessState, 'BLOCKED_COLD_START');
    }

    // IDN-L1 remains PAUSED_MISSING_BASELINE
    const idnEval = res.leagueEvaluations.find(e => e.internalLeagueId === 'IDN-L1');
    assert.strictEqual(idnEval.newStatus, 'PAUSED');
    assert.strictEqual(idnEval.markets.AH.readinessState, 'PAUSED_MISSING_BASELINE');
    assert.strictEqual(idnEval.markets.OU.readinessState, 'PAUSED_MISSING_BASELINE');
  } finally {
    if (origManual === undefined) delete process.env.ALLOW_MANUAL_LEAGUE_PROMOTION;
    else process.env.ALLOW_MANUAL_LEAGUE_PROMOTION = origManual;
    resetRegistryToDefaultState();
    OddsPapiQuotaGuard.resetCircuitBreaker();
  }
});

test('H2.4: Manual promotion with all 5 proofs satisfied promotes only approved markets (AH+OU vs AH-only) and enforces fault-isolation rollback', async () => {
  resetRegistryToDefaultState();
  OddsPapiQuotaGuard.resetCircuitBreaker();
  const origManual = process.env.ALLOW_MANUAL_LEAGUE_PROMOTION;

  try {
    process.env.ALLOW_MANUAL_LEAGUE_PROMOTION = 'true';
    const resetAccount = buildMockAccountPayload(10, 250, true);
    const { fixtures, oddsByBatch } = buildSimulatedResetFixturesAndOdds();

    const res = await MultiLeagueAutoActivator.runAutoUnlockCycle({
      mode: 'SIMULATED_RESET_TEST',
      explicitHumanApproval: true,
      injectedAccountData: resetAccount,
      injectedFixtures: fixtures,
      injectedOddsByTournamentBatch: oddsByBatch,
      injectedBacktestOverride: {
        'NED-ERE': buildPassingProofOverride(['AH', 'OU']),
        'ITA-SERIEA': buildPassingProofOverride(['AH']),
        'FRA-LIGUE1': buildPassingProofOverride(['AH', 'OU']),
      },
      simulateSmokeTestFailureForLeagues: ['FRA-LIGUE1'],
      writeVerificationArtifact: false,
    });

    // NED-ERE promotes both AH and OU
    assert.strictEqual(isLeagueMarketProductionEnabled('NED-ERE', 'AH'), true);
    assert.strictEqual(isLeagueMarketProductionEnabled('NED-ERE', 'OU'), true);

    // ITA-SERIEA promotes AH only while OU stays BLOCKED_MODEL_VALIDATION
    assert.strictEqual(isLeagueMarketProductionEnabled('ITA-SERIEA', 'AH'), true);
    assert.strictEqual(isLeagueMarketProductionEnabled('ITA-SERIEA', 'OU'), false);

    // FRA-LIGUE1 fails smoke test and rolls back to SHADOW
    assert.ok(res.leaguesRolledBack.includes('FRA-LIGUE1'));
    assert.strictEqual(isLeagueMarketProductionEnabled('FRA-LIGUE1', 'AH'), false);
    assert.strictEqual(isLeagueMarketProductionEnabled('FRA-LIGUE1', 'OU'), false);

    // BTTS remains RESEARCH_ONLY (LEWATI) and Moneyline remains NOT MODELED YET
    for (const evalEntry of res.leagueEvaluations) {
      assert.strictEqual(evalEntry.markets.BTTS.readinessState, 'RESEARCH_ONLY');
      assert.strictEqual(evalEntry.markets.BTTS.productionEnabled, false);
    }
    const mlView = MatchIntelligenceService.buildUnmodeledMoneylineMarket();
    assert.strictEqual(mlView.status, 'MARKET_UNAVAILABLE');
    assert.strictEqual(mlView.statusLabel, 'NOT MODELED YET');
  } finally {
    if (origManual === undefined) delete process.env.ALLOW_MANUAL_LEAGUE_PROMOTION;
    else process.env.ALLOW_MANUAL_LEAGUE_PROMOTION = origManual;
    resetRegistryToDefaultState();
    OddsPapiQuotaGuard.resetCircuitBreaker();
  }
});

// ─── H3: CRON & SCHEDULER SAFETY TESTS ───────────────────────────────────────

test('H3.1: /api/cron/predict and /api/cron/settle enforce strict opt-in (ENABLE_PRODUCTION_CRON === "true") and block preview deployments', () => {
  const predictRouteContent = fs.readFileSync(path.join(process.cwd(), 'src/app/api/cron/predict/route.ts'), 'utf8');
  const settleRouteContent = fs.readFileSync(path.join(process.cwd(), 'src/app/api/cron/settle/route.ts'), 'utf8');

  assert.ok(
    predictRouteContent.includes("process.env.ENABLE_PRODUCTION_CRON !== 'true'") &&
      predictRouteContent.includes("process.env.VERCEL_ENV === 'preview'"),
    '/api/cron/predict must require ENABLE_PRODUCTION_CRON === "true" and block VERCEL_ENV === "preview"'
  );
  assert.ok(
    settleRouteContent.includes("process.env.ENABLE_PRODUCTION_CRON !== 'true'") &&
      settleRouteContent.includes("process.env.VERCEL_ENV === 'preview'"),
    '/api/cron/settle must require ENABLE_PRODUCTION_CRON === "true" and block VERCEL_ENV === "preview"'
  );

  const workflowContent = fs.readFileSync(path.join(process.cwd(), '.github/workflows/settle-cron.yml'), 'utf8');
  assert.strictEqual(/^\s*schedule:/m.test(workflowContent), false, 'settle-cron.yml must not have active schedule triggers');
  assert.strictEqual(/^\s*curl\b/m.test(workflowContent), false, 'settle-cron.yml must not invoke curl against cron webhooks');
  assert.ok(workflowContent.includes('workflow_dispatch:'), 'settle-cron.yml must be manual workflow_dispatch only');
});

// ─── H4: BACKTEST INTEGRITY & STATISTICAL PROOF TESTS ────────────────────────

test('H4.1: multi_league_team_ratings_v1.0.json enforces chronological walk-forward, balanced AH/OU 95% CIs, Pinnacle benchmark, and NOT_APPROVED_FOR_PRODUCTION for all 14 non-EPL leagues', () => {
  const artifactPath = path.join(process.cwd(), 'data/artifacts/multi_league_team_ratings_v1.0.json');
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

  assert.ok(artifact.provenance.generationMethod.includes('strict chronological walk-forward'));

  // ENG-PL has historical Pinnacle benchmark (80 matched fixtures)
  const eplBt = artifact.backtestSummary['ENG-PL'];
  assert.strictEqual(eplBt.chronologicalWalkForwardVerified, true);
  assert.strictEqual(eplBt.pinnacleBenchmark.available, true);
  assert.strictEqual(eplBt.pinnacleBenchmark.matchedFixtures, 80);
  assert.ok(eplBt.ahBalancedHalfLine.brierCi95[1] < 0.2500, 'ENG-PL balanced half-line AH 95% CI upper bound < 0.2500');

  // All 14 non-EPL leagues in backtestSummary: 13 modeled are NOT_APPROVED_FOR_PRODUCTION, IDN-L1 is null (0 matches)
  const nonEplIds = Object.keys(artifact.backtestSummary).filter(id => id !== 'ENG-PL');
  assert.strictEqual(nonEplIds.length, 14);
  for (const lid of nonEplIds) {
    const entry = artifact.backtestSummary[lid];
    if (lid === 'IDN-L1') {
      assert.strictEqual(entry, null, 'IDN-L1 backtestSummary must be null (0 historical matches)');
    } else {
      assert.strictEqual(entry.marketApproval.AH, 'NOT_APPROVED_FOR_PRODUCTION', `${lid} AH must be NOT_APPROVED_FOR_PRODUCTION`);
      assert.strictEqual(entry.marketApproval.OU, 'NOT_APPROVED_FOR_PRODUCTION', `${lid} OU must be NOT_APPROVED_FOR_PRODUCTION`);
    }
  }
  assert.strictEqual(artifact.leagueProfiles['IDN-L1'].sampleMatches, 0, 'IDN-L1 has 0 historical matches');
});

// ─── H5: DATA LICENSING & PROVENANCE TESTS ───────────────────────────────────

test('H5.1: TheSportsDbProvider is disabled by default unless ENABLE_THESPORTSDB === "true"', async () => {
  const origFlag = process.env.ENABLE_THESPORTSDB;
  try {
    delete process.env.ENABLE_THESPORTSDB;
    const provider = new TheSportsDbProvider();
    assert.strictEqual(provider.isConfigured(), false);
    const res = await provider.getUpcomingFixtures();
    assert.strictEqual(res.status, 'UNCONFIGURED');
    assert.ok(res.error.includes('ENABLE_THESPORTSDB=true'));
  } finally {
    if (origFlag === undefined) delete process.env.ENABLE_THESPORTSDB;
    else process.env.ENABLE_THESPORTSDB = origFlag;
  }
});

// ─── H6: MULTI-LEAGUE RESEARCH LEDGER & NORMALIZATION TESTS ──────────────────

test('H6.1: Canonical research ledger contains 336 rows across 15 leagues with 12 settled EPL rows and non-PRODUCTION LEWATI enforcement', () => {
  const ledgerPath = path.join(process.cwd(), 'data/verification/all_leagues_research_ledger.jsonl');
  const lines = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n').filter(Boolean);
  const rows = lines.map(l => JSON.parse(l));

  assert.strictEqual(rows.length, 336, 'Must have 336 canonical multi-league research rows (168 fixtures x 2 markets)');
  const leagues = new Set(rows.map(r => r.league));
  assert.strictEqual(leagues.size, 15, 'Must cover all 15 registered leagues');

  const prodRows = rows.filter(r => r.ledgerTier === 'PRODUCTION');
  const shadowRows = rows.filter(r => r.ledgerTier === 'SHADOW');
  const pausedRows = rows.filter(r => r.ledgerTier === 'NONE');
  const settledRows = prodRows.filter(r => r.settlement === 'SETTLED');

  assert.strictEqual(prodRows.length, 20, 'EPL must have 20 PRODUCTION rows (10 fixtures x 2 markets)');
  assert.strictEqual(settledRows.length, 12, 'EPL must have 12 SETTLED rows (6 matches on 10 Oct 2026 x 2 markets)');
  assert.strictEqual(shadowRows.length, 294, '13 SHADOW leagues must have 294 rows (147 fixtures x 2 markets)');
  assert.strictEqual(pausedRows.length, 22, 'IDN-L1 must have 22 PAUSED (NONE) rows (11 fixtures x 2 markets)');

  for (const r of rows) {
    if (r.modelProbability !== null && r.modelProbability !== undefined) {
      const normalizedProb = r.modelProbability > 1 ? r.modelProbability / 100 : r.modelProbability;
      assert.ok(normalizedProb >= 0 && normalizedProb <= 1, `Normalized probability must be in 0..1, got ${normalizedProb}`);
    }
    if (r.ledgerTier !== 'PRODUCTION') {
      assert.strictEqual(r.verdict, 'LEWATI', 'All non-PRODUCTION rows must have verdict LEWATI');
    }
  }
});

// ─── F4: EPL NON-REGRESSION & MATCH INTELLIGENCE READ-PATH TESTS ────────────

test('F4.1: EPL remains ACTIVE and MatchIntelligenceService reflects market-level activation states accurately', () => {
  resetRegistryToDefaultState();

  const eplUnavail = MatchIntelligenceService.buildUnavailableMarket('ASIAN_HANDICAP', '-0.5', null, 'Premier League');
  assert.strictEqual(eplUnavail.statusLabel, 'ODDS UNAVAILABLE');

  const laLigaShadow = MatchIntelligenceService.buildUnavailableMarket('ASIAN_HANDICAP', '-0.5', null, 'La Liga');
  assert.strictEqual(laLigaShadow.statusLabel, 'ANALYSIS UNAVAILABLE');
  assert.strictEqual(getLeagueMarketBlocker('ITA-SERIEA', 'OU')?.includes('0.2577'), true);
});
