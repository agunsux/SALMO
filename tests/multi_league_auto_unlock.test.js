// SALMO.DEV — Phase F: Multi-League Auto-Unlock & Quota-Reset Activation Test Suite
// Validates all 13 mandatory requirements across Phases A, B, C, D, E, and F:
// 1. Quota-reset detector when quota is exhausted (260/250 -> QUOTA_EXHAUSTED, 0 billable calls)
// 2. Quota-reset detector when provider is unreachable (RESET_UNVERIFIED, no calendar guessing)
// 3. Quota-reset detector when quota resets (0/250 -> QUOTA_AVAILABLE, 200 operational budget above 50 mandatory reserve)
// 4. Concurrency lock & idempotency protection (ACTIVATION_IN_PROGRESS prevents duplicate runs)
// 5. Priority-ordered batch tournament queue & 50-request mandatory reserve hard-stop (199/250 blocks non-EPL)
// 6. Auto-activation of 5 AH+OU validated leagues (ESP-LALIGA, DEU-BUNDESLIGA, FRA-LIGUE1, NED-ERE, POR-PRIMEIRA)
// 7. Partial AH-only activation for ITA-SERIEA and BEL-PRO while OU remains BLOCKED_MODEL_VALIDATION
// 8. Data-quality blocker on SCO-PREM and ENG-CHAMP (missing autumn 2026/2027 season matches -> BLOCKED_DATA_QUALITY)
// 9. Cold-start blocker on JPN-J1 and KOR-K1 (BLOCKED_COLD_START) & model validation blocker on USA-MLS and SAU-PRO
// 10. Permanent PAUSED enforcement on IDN-L1 (PAUSED_MISSING_BASELINE)
// 11. BTTS remains RESEARCH_ONLY (LEWATI) and Moneyline remains unmodeled across all promoted leagues
// 12. Fault isolation & automatic rollback to SHADOW when a single league fails smoke test
// 13. Non-regression of ENG-PL (Premier League) production pipeline & MatchIntelligenceService read-path

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
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
    // 5 AH+OU validated leagues (2 fixtures each to prove non-degenerate variance)
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
    // 2 AH-only validated leagues (ITA-SERIEA, BEL-PRO)
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

// ─── F2: PRIORITY BATCH QUEUE & 50-REQUEST RESERVE TESTS ────────────────────

test('F2.1: Priority queue groups validated leagues into 2 batches of <= 5 tournament IDs and stops at 50-request mandatory reserve', async () => {
  resetRegistryToDefaultState();
  OddsPapiQuotaGuard.resetCircuitBreaker();

  const prioritized = getPriorityOrderedLeaguesForOdds().filter(l => (l.validated_markets?.length || 0) > 0);
  const batches = getTournamentBatches(prioritized, 5);

  assert.strictEqual(prioritized.length, 8, 'EPL + 7 model-validated non-EPL leagues = 8 tournaments');
  assert.strictEqual(batches.length, 2, '8 tournaments must fit in exactly 2 batches of <= 5');
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

test('F2.2: Simulated Quota Reset automatically activates both AH + OU for the 5 full-validation leagues', async () => {
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
      writeVerificationArtifact: false,
    });

    const fullAhOuLeagues = ['ESP-LALIGA', 'DEU-BUNDESLIGA', 'FRA-LIGUE1', 'NED-ERE', 'POR-PRIMEIRA'];
    for (const lid of fullAhOuLeagues) {
      assert.strictEqual(isLeagueMarketProductionEnabled(lid, 'AH'), true, `${lid} AH must be ACTIVE`);
      assert.strictEqual(isLeagueMarketProductionEnabled(lid, 'OU'), true, `${lid} OU must be ACTIVE`);
      const evalEntry = res.leagueEvaluations.find(e => e.internalLeagueId === lid);
      assert.strictEqual(evalEntry.newStatus, 'ACTIVE');
      assert.strictEqual(evalEntry.markets.AH.readinessState, 'ACTIVE');
      assert.strictEqual(evalEntry.markets.OU.readinessState, 'ACTIVE');
      assert.strictEqual(evalEntry.markets.AH.smokeTestPassed, true);
      assert.strictEqual(evalEntry.markets.OU.smokeTestPassed, true);
    }
  } finally {
    resetRegistryToDefaultState();
    OddsPapiQuotaGuard.resetCircuitBreaker();
  }
});

test('F2.3: Simulated Quota Reset activates AH only for ITA-SERIEA and BEL-PRO while keeping OU blocked by BLOCKED_MODEL_VALIDATION', async () => {
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
      writeVerificationArtifact: false,
    });

    for (const lid of ['ITA-SERIEA', 'BEL-PRO']) {
      assert.strictEqual(isLeagueMarketProductionEnabled(lid, 'AH'), true, `${lid} AH must be ACTIVE`);
      assert.strictEqual(isLeagueMarketProductionEnabled(lid, 'OU'), false, `${lid} OU must remain BLOCKED`);
      const evalEntry = res.leagueEvaluations.find(e => e.internalLeagueId === lid);
      assert.strictEqual(evalEntry.newStatus, 'ACTIVE');
      assert.strictEqual(evalEntry.markets.AH.readinessState, 'ACTIVE');
      assert.strictEqual(evalEntry.markets.OU.readinessState, 'BLOCKED_MODEL_VALIDATION');
      assert.ok(evalEntry.markets.OU.blockerReason.includes('failed walk-forward validation'));
    }

    const serieAFixture = res.evaluatedFixtures.find(f => f.league === 'Serie A');
    const serieAEval = ProductionPredictionEngine.evaluateFixture(serieAFixture);
    assert.strictEqual(serieAEval.prediction.markets.overUnder.verdict, 'LEWATI', 'Uncalibrated OU must remain LEWATI');
  } finally {
    resetRegistryToDefaultState();
    OddsPapiQuotaGuard.resetCircuitBreaker();
  }
});

test('F2.4: SCO-PREM and ENG-CHAMP remain in SHADOW with BLOCKED_DATA_QUALITY even after quota reset', async () => {
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
      writeVerificationArtifact: false,
    });

    for (const lid of ['SCO-PREM', 'ENG-CHAMP']) {
      assert.strictEqual(isLeagueMarketProductionEnabled(lid, 'AH'), false);
      assert.strictEqual(isLeagueMarketProductionEnabled(lid, 'OU'), false);
      const evalEntry = res.leagueEvaluations.find(e => e.internalLeagueId === lid);
      assert.strictEqual(evalEntry.newStatus, 'SHADOW');
      assert.strictEqual(evalEntry.markets.AH.readinessState, 'BLOCKED_DATA_QUALITY');
      assert.strictEqual(evalEntry.markets.OU.readinessState, 'BLOCKED_DATA_QUALITY');
    }
  } finally {
    resetRegistryToDefaultState();
    OddsPapiQuotaGuard.resetCircuitBreaker();
  }
});

test('F2.5: JPN-J1 & KOR-K1 remain blocked by BLOCKED_COLD_START and USA-MLS & SAU-PRO remain blocked by BLOCKED_MODEL_VALIDATION', async () => {
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
      writeVerificationArtifact: false,
    });

    for (const lid of ['JPN-J1', 'KOR-K1']) {
      assert.strictEqual(isLeagueMarketProductionEnabled(lid, 'AH'), false);
      assert.strictEqual(isLeagueMarketProductionEnabled(lid, 'OU'), false);
      const evalEntry = res.leagueEvaluations.find(e => e.internalLeagueId === lid);
      assert.strictEqual(evalEntry.newStatus, 'SHADOW');
      assert.strictEqual(evalEntry.markets.AH.readinessState, 'BLOCKED_COLD_START');
      assert.strictEqual(evalEntry.markets.OU.readinessState, 'BLOCKED_COLD_START');
    }

    for (const lid of ['USA-MLS', 'SAU-PRO']) {
      assert.strictEqual(isLeagueMarketProductionEnabled(lid, 'AH'), false);
      assert.strictEqual(isLeagueMarketProductionEnabled(lid, 'OU'), false);
      const evalEntry = res.leagueEvaluations.find(e => e.internalLeagueId === lid);
      assert.strictEqual(evalEntry.newStatus, 'SHADOW');
      assert.strictEqual(evalEntry.markets.AH.readinessState, 'BLOCKED_MODEL_VALIDATION');
      assert.strictEqual(evalEntry.markets.OU.readinessState, 'BLOCKED_MODEL_VALIDATION');
    }
  } finally {
    resetRegistryToDefaultState();
    OddsPapiQuotaGuard.resetCircuitBreaker();
  }
});

test('F2.6: IDN-L1 remains permanently PAUSED with PAUSED_MISSING_BASELINE', async () => {
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
      writeVerificationArtifact: false,
    });

    const idnEval = res.leagueEvaluations.find(e => e.internalLeagueId === 'IDN-L1');
    assert.strictEqual(idnEval.newStatus, 'PAUSED');
    assert.strictEqual(idnEval.markets.AH.readinessState, 'PAUSED_MISSING_BASELINE');
    assert.strictEqual(idnEval.markets.OU.readinessState, 'PAUSED_MISSING_BASELINE');
    assert.strictEqual(isLeagueMarketProductionEnabled('IDN-L1', 'AH'), false);
    assert.strictEqual(isLeagueMarketProductionEnabled('IDN-L1', 'OU'), false);
  } finally {
    resetRegistryToDefaultState();
    OddsPapiQuotaGuard.resetCircuitBreaker();
  }
});

// ─── F3: BTTS / MONEYLINE GOVERNANCE & FAULT ISOLATION TESTS ────────────────

test('F3.1: BTTS remains RESEARCH_ONLY (LEWATI) and Moneyline (1X2) remains unmodeled across all promoted leagues', async () => {
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
      writeVerificationArtifact: false,
    });

    for (const evalEntry of res.leagueEvaluations) {
      assert.strictEqual(evalEntry.markets.BTTS.readinessState, 'RESEARCH_ONLY');
      assert.strictEqual(evalEntry.markets.BTTS.productionEnabled, false);
    }

    const laLigaFixture = res.evaluatedFixtures.find(f => f.league === 'La Liga');
    const laLigaEval = ProductionPredictionEngine.evaluateFixture(laLigaFixture);
    assert.strictEqual(laLigaEval.prediction.markets.btts.verdict, 'LEWATI', 'BTTS must always be LEWATI');

    const mlView = MatchIntelligenceService.buildUnmodeledMoneylineMarket();
    assert.strictEqual(mlView.status, 'MARKET_UNAVAILABLE');
    assert.strictEqual(mlView.statusLabel, 'NOT MODELED YET');
  } finally {
    resetRegistryToDefaultState();
    OddsPapiQuotaGuard.resetCircuitBreaker();
  }
});

test('F3.2: Fault isolation rolls back a failing league to SHADOW while promoting all other passing leagues', async () => {
  resetRegistryToDefaultState();
  OddsPapiQuotaGuard.resetCircuitBreaker();

  try {
    const resetAccount = buildMockAccountPayload(10, 250, true);
    const { fixtures, oddsByBatch } = buildSimulatedResetFixturesAndOdds();

    const res = await MultiLeagueAutoActivator.runAutoUnlockCycle({
      mode: 'SIMULATED_RESET_TEST',
      injectedAccountData: resetAccount,
      injectedFixtures: fixtures,
      injectedOddsByTournamentBatch: oddsByBatch,
      simulateSmokeTestFailureForLeagues: ['FRA-LIGUE1'],
      writeVerificationArtifact: false,
    });

    assert.ok(res.leaguesRolledBack.includes('FRA-LIGUE1'), 'FRA-LIGUE1 must be rolled back on smoke test failure');
    assert.strictEqual(isLeagueMarketProductionEnabled('FRA-LIGUE1', 'AH'), false, 'Rolled-back league must have AH disabled');
    assert.strictEqual(isLeagueMarketProductionEnabled('FRA-LIGUE1', 'OU'), false, 'Rolled-back league must have OU disabled');

    // Other 6 validated leagues must still promote cleanly
    assert.strictEqual(res.leaguesPromoted.length, 6);
    assert.strictEqual(isLeagueMarketProductionEnabled('ESP-LALIGA', 'AH'), true);
    assert.strictEqual(isLeagueMarketProductionEnabled('DEU-BUNDESLIGA', 'OU'), true);
    assert.strictEqual(isLeagueMarketProductionEnabled('ITA-SERIEA', 'AH'), true);
  } finally {
    resetRegistryToDefaultState();
    OddsPapiQuotaGuard.resetCircuitBreaker();
  }
});

// ─── F4: EPL NON-REGRESSION & MATCH INTELLIGENCE READ-PATH TESTS ────────────

test('F4.1: EPL remains ACTIVE and MatchIntelligenceService reflects market-level activation states accurately', () => {
  resetRegistryToDefaultState();

  // Default state: EPL is ACTIVE (ODDS UNAVAILABLE when odds missing), La Liga is SHADOW (ANALYSIS UNAVAILABLE)
  const eplUnavail = MatchIntelligenceService.buildUnavailableMarket('ASIAN_HANDICAP', '-0.5', null, 'Premier League');
  assert.strictEqual(eplUnavail.statusLabel, 'ODDS UNAVAILABLE');

  const laLigaShadow = MatchIntelligenceService.buildUnavailableMarket('ASIAN_HANDICAP', '-0.5', null, 'La Liga');
  assert.strictEqual(laLigaShadow.statusLabel, 'ANALYSIS UNAVAILABLE');
  assert.strictEqual(getLeagueMarketBlocker('ITA-SERIEA', 'OU')?.includes('0.2577'), true);
});

test('F4.2: persistToDatabase=true with exhausted quota (260/250) persists zero non-EPL league promotions and zero billable requests', async () => {
  resetRegistryToDefaultState();
  OddsPapiQuotaGuard.resetCircuitBreaker();

  try {
    const exhaustedAccount = buildMockAccountPayload(260, 250, true);
    const res = await MultiLeagueAutoActivator.runAutoUnlockCycle({
      mode: 'SIMULATED_RESET_TEST',
      injectedAccountData: exhaustedAccount,
      persistToDatabase: true,
      writeVerificationArtifact: false,
    });

    assert.strictEqual(res.quotaDetection.state, 'QUOTA_EXHAUSTED');
    assert.strictEqual(res.billableRequestsMade, 0, 'Must make 0 billable requests');
    assert.strictEqual(res.leaguesPromoted.length, 0, 'Must promote 0 leagues');
    assert.deepStrictEqual(
      res.activeLeaguesAfterRun.map((l) => l.internalLeagueId),
      ['ENG-PL'],
      'Only ENG-PL may remain ACTIVE'
    );
    assert.deepStrictEqual(
      res.pausedLeaguesAfterRun.map((l) => l.internalLeagueId),
      ['IDN-L1'],
      'IDN-L1 must remain PAUSED'
    );
    assert.strictEqual(res.shadowLeaguesAfterRun.length, 13, 'All 13 non-EPL leagues must remain SHADOW');
  } finally {
    resetRegistryToDefaultState();
    OddsPapiQuotaGuard.resetCircuitBreaker();
  }
});
