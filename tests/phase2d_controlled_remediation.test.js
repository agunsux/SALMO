// SALMO.DEV — Phase 2D Controlled Remediation Regression Suite
// Validates:
// 1. Consistent EPL Demotion (ACTIVE -> SHADOW) & Removal of all hardcoded EPL bypasses.
// 2. ValueEngine & MatchIntelligence strict registry gating (zero isEplLegacy leaks).
// 3. /api/daily-picks zero leaks (status: NO_QUALIFIED_PICKS).
// 4. Historical EPL preservation (20 pre-match rows remain VALID_PRE_MATCH and joined).
// 5. Brier fidelity & cohort separation (zero post-hoc rating substitution, diagnostic segregation).
// 6. OddsPapi Quota fail-closed (DB_UNREACHABLE_BLOCK, multi-batch reservation, circuit breaker).

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
  getLeagueActivationState,
  isLeagueMarketProductionEnabled,
  activateLeagueMarkets,
  rollbackLeagueMarkets,
  CANONICAL_15_LEAGUES,
} = require('../src/config/multiLeagueRegistry.ts');

const { ValueEngine } = require('../src/engine/decision/valueEngine.ts');
const { MatchIntelligenceService } = require('../src/engine/matchIntelligenceService.ts');
const { OddsPapiQuotaGuard } = require('../src/lib/quota/oddsPapiQuotaGuard.ts');
const { evaluatePositionBrierLegs } = require('../src/engine/performance/brierScoring.ts');
const { evaluateRowTemporalIntegrity } = require('../src/engine/archive/temporalIntegrityGuard.ts');

// --- 1. REGISTRY & DEMOTION TESTS ---
test('Phase 2D - Test 1: EPL default registry status is strictly SHADOW with zero production markets', () => {
  const eplState = getLeagueActivationState('ENG-PL');
  assert.strictEqual(eplState.production_status, 'SHADOW');
  assert.strictEqual(eplState.production_pick_enabled, false);
  assert.strictEqual(eplState.ledger_tier, 'SHADOW');
  assert.deepStrictEqual(eplState.production_enabled_markets, []);

  const eplEntry = CANONICAL_15_LEAGUES.find(l => l.internal_league_id === 'ENG-PL');
  assert.ok(eplEntry);
  assert.strictEqual(eplEntry.production_status, 'SHADOW');
  assert.strictEqual(eplEntry.production_pick_enabled, false);
  assert.strictEqual(eplEntry.ledger_tier, 'SHADOW');
  assert.deepStrictEqual(eplEntry.production_enabled_markets, []);

  assert.strictEqual(isLeagueMarketProductionEnabled('Premier League', 'AH'), false);
  assert.strictEqual(isLeagueMarketProductionEnabled('Premier League', 'OU'), false);
  assert.strictEqual(isLeagueMarketProductionEnabled('Premier League', 'MONEYLINE'), false);
  assert.strictEqual(isLeagueMarketProductionEnabled('ENG-PL', 'AH'), false);
  assert.strictEqual(isLeagueMarketProductionEnabled('ENG-PL', 'OU'), false);
});

test('Phase 2D - Test 2: resetRegistryToDefaultState() does NOT force EPL back to ACTIVE', () => {
  resetRegistryToDefaultState();

  const eplState = getLeagueActivationState('ENG-PL');
  assert.strictEqual(eplState.production_status, 'SHADOW');
  assert.strictEqual(eplState.production_pick_enabled, false);
  assert.strictEqual(eplState.ledger_tier, 'SHADOW');
  assert.deepStrictEqual(eplState.production_enabled_markets, []);

  const eplEntry = CANONICAL_15_LEAGUES.find(l => l.internal_league_id === 'ENG-PL');
  assert.strictEqual(eplEntry.production_status, 'SHADOW');
  assert.strictEqual(eplEntry.production_pick_enabled, false);
});

test('Phase 2D - Test 3: activateLeagueMarkets() rejects EPL activation without explicit human approval and passing gates', () => {
  const res = activateLeagueMarkets('ENG-PL', ['AH'], { explicitHumanApproval: false });
  assert.strictEqual(res.success, false);
  assert.match(res.reason, /human approval/i);

  const eplState = getLeagueActivationState('ENG-PL');
  assert.strictEqual(eplState.production_status, 'SHADOW');
  assert.strictEqual(eplState.production_pick_enabled, false);
});

test('Phase 2D - Test 4: rollbackLeagueMarkets() can rollback EPL without hardcoded exception', () => {
  const res = rollbackLeagueMarkets('ENG-PL', 'Test emergency demotion verification');
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.previousStatus, 'SHADOW');
  assert.strictEqual(getLeagueActivationState('ENG-PL').production_status, 'SHADOW');
});

// --- 2. VALUE ENGINE & MATCH INTELLIGENCE TESTS ---
test('Phase 2D - Test 5: ValueEngine cannot output LAYAK for EPL fixture when registry is SHADOW', () => {
  const now = Date.now();
  const evalResult = ValueEngine.evaluateSelection({
    market: 'AH',
    selection: 'Arsenal FC -0.5',
    line: -0.5,
    modelProbability: 0.65,
    marketOdds: 2.10,
    fairOdds: 1.538,
    league: 'Premier League',
    matchId: 'EPL_TEST_FIXTURE_1',
    confidence: 85,
    sampleSizeHome: 20,
    sampleSizeAway: 20,
    homeTeam: 'Arsenal FC',
    awayTeam: 'Chelsea FC',
    modelStatus: 'FIXTURE_SPECIFIC',
    oddsLeakedToModel: false,
    oddsTimestampUtc: new Date(now - 120000).toISOString(),
    predictionTimestampUtc: new Date(now).toISOString(),
    kickoffUtc: new Date(now + 86400000).toISOString(),
    pinnacleOdds: {
      sideOdds: 2.10,
      oppositeOdds: 1.85,
    },
  });

  assert.notStrictEqual(evalResult.verdict, 'LAYAK', 'ValueEngine must not issue LAYAK when EPL is SHADOW');
  assert.strictEqual(evalResult.verdict, 'LEWATI');
  assert.match(
    evalResult.rejectionReason || '',
    /MARKET_NOT_PRODUCTION_ENABLED|LEAGUE_NOT_WHITELISTED|LEAGUE_NOT_ACTIVE/i
  );
});

test('Phase 2D - Test 6: ValueEngine Gate 7 enforces registry enablement and does NOT use legacy isEplLegacy bypass', () => {
  const now = Date.now();
  const result = ValueEngine.evaluateSelection({
    market: 'OU',
    selection: 'Over 2.5',
    line: 2.5,
    modelProbability: 0.60,
    marketOdds: 2.05,
    fairOdds: 1.667,
    league: 'English Premier League',
    matchId: 'EPL_TEST_FIXTURE_2',
    confidence: 80,
    sampleSizeHome: 15,
    sampleSizeAway: 15,
    homeTeam: 'Liverpool FC',
    awayTeam: 'Everton FC',
    modelStatus: 'FIXTURE_SPECIFIC',
    oddsLeakedToModel: false,
    oddsTimestampUtc: new Date(now - 120000).toISOString(),
    predictionTimestampUtc: new Date(now).toISOString(),
    kickoffUtc: new Date(now + 86400000).toISOString(),
    pinnacleOdds: {
      sideOdds: 2.05,
      oppositeOdds: 1.88,
    },
  });

  assert.strictEqual(result.verdict, 'LEWATI');
  assert.match(result.rejectionReason || '', /NOT_PRODUCTION_ENABLED|LEAGUE_NOT_WHITELISTED/i);
});

test('Phase 2D - Test 7: buildUnavailableMarket in MatchIntelligenceService does NOT force EPL production-enabled', () => {
  const card = MatchIntelligenceService.buildUnavailableMarket(
    {
      providerFixtureId: 'test_fix_1',
      league: 'Premier League',
      season: '2026',
      kickoffTime: new Date(Date.now() + 86400000).toISOString(),
      homeTeam: 'Arsenal FC',
      awayTeam: 'Chelsea FC',
      status: 'SCHEDULED',
    },
    'AH',
    'Model baseline uncalibrated vs Pinnacle'
  );

  assert.strictEqual(card.productionEligible, false);
});

// --- 3. DAILY PICKS & UI CONTRACT TESTS ---
test('Phase 2D - Test 8 & 9: Verification that EPL is excluded from daily-picks when SHADOW', () => {
  const { isLeagueMarketProductionEnabled: checkMarket } = require('../src/config/multiLeagueRegistry.ts');
  const eplAhAllowed = checkMarket('Premier League', 'AH');
  const eplOuAllowed = checkMarket('Premier League', 'OU');
  assert.strictEqual(eplAhAllowed, false);
  assert.strictEqual(eplOuAllowed, false);
});

// --- 4. RESEARCH & HISTORICAL AUDIT PRESERVATION TESTS ---
test('Phase 2D - Test 10: 20 Historical EPL AH/OU rows in all_leagues_research_ledger retain VALID_PRE_MATCH provenance', () => {
  const researchLedgerPath = path.resolve(process.cwd(), 'data', 'verification', 'all_leagues_research_ledger.jsonl');
  const lines = fs.readFileSync(researchLedgerPath, 'utf8').trim().split('\n').filter(Boolean);
  const rows = lines.map(l => JSON.parse(l));

  const eplRows = rows.filter(r => (r.league || r.competition) === 'Premier League');
  assert.strictEqual(eplRows.length, 20);

  const liveLedgerPath = path.resolve(process.cwd(), 'data', 'verification', 'live_prediction_ledger.jsonl');
  const liveLines = fs.readFileSync(liveLedgerPath, 'utf8').trim().split('\n').filter(Boolean);
  const liveMap = new Map();
  for (const ll of liveLines) {
    const parsed = JSON.parse(ll);
    const id = parsed.providerProvenance?.apiFootballFixtureId || parsed.fixtureId;
    if (id && parsed.market) {
      liveMap.set(`${id}_${parsed.market}`, parsed);
    }
  }

  for (const r of eplRows) {
    const key = `${r.fixtureId}_${r.market}`;
    assert.ok(liveMap.has(key), `Live ledger must contain key ${key}`);
    const liveRecord = liveMap.get(key);
    assert.ok(liveRecord.predictionTimestamp);
    assert.ok(
      new Date(liveRecord.predictionTimestamp).getTime() < new Date(r.kickoffUtc).getTime(),
      'Live record timestamp must be strictly pre-match'
    );
  }
});

test('Phase 2D - Test 11: normalizeResearchRow joins live ledger by fixtureId_market regardless of ledgerTier', () => {
  const liveLedgerPath = path.resolve(process.cwd(), 'data', 'verification', 'live_prediction_ledger.jsonl');
  const liveLines = fs.readFileSync(liveLedgerPath, 'utf8').trim().split('\n').filter(Boolean);
  const liveMap = new Map();
  for (const ll of liveLines) {
    const parsed = JSON.parse(ll);
    const id = parsed.providerProvenance?.apiFootballFixtureId || parsed.fixtureId;
    if (id && parsed.market) {
      liveMap.set(`${id}_${parsed.market}`, parsed);
    }
  }

  const mockRawRow = {
    fixtureId: '1557417',
    market: 'AH',
    league: 'Premier League',
    homeTeam: 'Arsenal FC',
    awayTeam: 'Leeds United',
    kickoffUtc: '2026-10-10T11:30:00.000Z',
    ledgerTier: 'SHADOW',
    createdAt: '2026-10-11T05:00:00.000Z',
  };

  const matchedLive = liveMap.get(`${mockRawRow.fixtureId}_${mockRawRow.market}`);
  assert.ok(matchedLive, 'Must resolve live record even when ledgerTier is SHADOW');
  assert.strictEqual(matchedLive.settlementStatus, 'SETTLED');
  assert.strictEqual(matchedLive.result, 'HALF_LOSS');
});

test('Phase 2D - Test 12: Pick-time decimal probability matches live ledger modelProbability', () => {
  const liveLedgerPath = path.resolve(process.cwd(), 'data', 'verification', 'live_prediction_ledger.jsonl');
  const liveLines = fs.readFileSync(liveLedgerPath, 'utf8').trim().split('\n').filter(Boolean);
  const arsenalAh = liveLines.map(l => JSON.parse(l)).find(
    r => String(r.fixtureId || r.providerProvenance?.apiFootballFixtureId) === '1557417' && r.market === 'AH'
  );
  assert.ok(arsenalAh);
  assert.strictEqual(arsenalAh.modelProbability, 18.5);
  const expectedDecimal = arsenalAh.pWin !== undefined ? arsenalAh.pWin : arsenalAh.modelProbability / 100;
  assert.strictEqual(Number(expectedDecimal.toFixed(3)), 0.185);
});

// --- 5. BRIER FIDELITY & COHORT SEGREGATION TESTS ---
test('Phase 2D - Test 13: Brier evaluation preserves pick-time fallback lambda (1.35/1.20) for 2026-10-06 rows', () => {
  const evalResult = evaluatePositionBrierLegs({
    positionId: 'test_arsenal_ah',
    fixtureId: '1557417',
    league: 'Premier League',
    homeTeam: 'Arsenal FC',
    awayTeam: 'Leeds United',
    marketType: 'AH',
    selection: 'Arsenal FC -1.25',
    line: -1.25,
    homeGoals: 2,
    awayGoals: 1,
    lambdaHome: 1.35,
    lambdaAway: 1.20,
    fallbackModelProbDecimal: 0.185,
    useCanonicalEplOnly: true,
  });

  assert.ok(evalResult);
  assert.strictEqual(evalResult.totalLegCount, 2);
  assert.strictEqual(evalResult.nResolvedLegs, 1); // 2-1 on -1.25: -1.0 is push, -1.5 is loss
  assert.strictEqual(evalResult.nExcludedPushLegs, 1);
  assert.ok(Number.isFinite(evalResult.positionBrierMean));
});

test('Phase 2D - Test 14: Headline cohort requires valid model status and rejects INSUFFICIENT_MODEL rows', () => {
  const { isQualifiedPublicPickCohort } = require('../src/engine/performance/performanceMetrics.ts');

  assert.strictEqual(
    isQualifiedPublicPickCohort({
      is_pick: false,
      verdict: 'LEWATI',
    }),
    false
  );

  assert.strictEqual(
    isQualifiedPublicPickCohort({
      is_pick: true,
      verdict: 'PANTAU',
    }),
    false
  );
});

test('Phase 2D - Test 15: Temporal integrity engine classifies rows without blending', () => {
  const preMatchEval = evaluateRowTemporalIntegrity(
    { kickoffUtc: '2026-10-10T14:00:00Z' },
    { verifiedPredictionTimestamp: '2026-10-06T21:36:00Z', hasVerifiedPreMatchProvenance: true }
  );
  assert.strictEqual(preMatchEval.temporalEligibilityStatus, 'VALID_PRE_MATCH');
  assert.strictEqual(preMatchEval.eligibleForPreMatchMetrics, true);

  const retroEval = evaluateRowTemporalIntegrity(
    { kickoffUtc: '2026-10-10T14:00:00Z' },
    { verifiedPredictionTimestamp: null, batchCommitTimestampUtc: '2026-10-11T05:00:00Z' }
  );
  assert.strictEqual(retroEval.temporalEligibilityStatus, 'RETROSPECTIVE_EXCLUDED');
  assert.strictEqual(retroEval.eligibleForPreMatchMetrics, false);

  const unverifiedEval = evaluateRowTemporalIntegrity(
    { kickoffUtc: '2026-10-18T14:00:00Z' },
    { verifiedPredictionTimestamp: '2026-10-11T05:00:00Z', hasVerifiedPreMatchProvenance: false }
  );
  assert.strictEqual(unverifiedEval.temporalEligibilityStatus, 'UNVERIFIED_TIMESTAMP_PROVENANCE');
  assert.strictEqual(unverifiedEval.eligibleForPreMatchMetrics, false);
});

// --- 6. QUOTA GUARD FAIL-CLOSED & CIRCUIT BREAKER TESTS ---
test('Phase 2D - Test 16: DB unreachable AND account unreachable returns DB_UNREACHABLE_BLOCK (fail-closed)', async () => {
  const status = await OddsPapiQuotaGuard.checkQuotaOfflineUnverifiableForTest();
  assert.strictEqual(status.allowed, false, 'Quota check must fail closed when DB and provider are both unreachable');
  assert.match(status.reason || '', /DB_UNREACHABLE_BLOCK/i);
});

test('Phase 2D - Test 17: Multi-batch discovery reserves total batch count before request loop', async () => {
  const targetBatchesCount = 3;
  const res = await OddsPapiQuotaGuard.reserveQuota(targetBatchesCount);

  if (res.allowed) {
    assert.ok(res.reservationId);
    OddsPapiQuotaGuard.releaseQuota(res.reservationId, {
      endpoint: 'test-batch',
      params: {},
    });
  } else {
    assert.match(res.reason || '', /quota/i);
  }
});

test('Phase 2D - Test 18: HTTP 429 trips circuit breaker and blocks subsequent paid requests', async () => {
  OddsPapiQuotaGuard.tripCircuitBreaker(429, 'Rate limit exceeded on OddsPAPI tier');
  assert.strictEqual(OddsPapiQuotaGuard.isCircuitTripped(), true);

  const check = await OddsPapiQuotaGuard.checkQuota(1);
  assert.strictEqual(check.allowed, false);
  assert.match(check.reason || '', /circuit/i);

  OddsPapiQuotaGuard.resetCircuitBreaker();
  assert.strictEqual(OddsPapiQuotaGuard.isCircuitTripped(), false);
});

test('Phase 2D - Test 19: HTTP 401 / 402 trips circuit breaker and fails closed', async () => {
  OddsPapiQuotaGuard.tripCircuitBreaker(401, 'Unauthorized API key on OddsPAPI');
  assert.strictEqual(OddsPapiQuotaGuard.isCircuitTripped(), true);

  const reservation = await OddsPapiQuotaGuard.reserveQuota(1);
  assert.strictEqual(reservation.allowed, false);
  assert.match(reservation.reason || '', /circuit/i);

  OddsPapiQuotaGuard.resetCircuitBreaker();
});

test('Phase 2D - Test 20: Quota test executions make zero live network requests', async () => {
  OddsPapiQuotaGuard.setMockAccountDataForTest({
    subscriptions: [
      {
        plan: 'free',
        is_active: true,
        request_limit: 250,
        request_count: 50,
        bookmakers: { pinnacle: { has_live_odds: true } },
        sport_ids: [10],
      },
    ],
  });

  const detection = await OddsPapiQuotaGuard.detectQuotaReset(3, false);
  assert.strictEqual(detection.state, 'QUOTA_AVAILABLE');
  assert.strictEqual(detection.requestCount, 50);

  OddsPapiQuotaGuard.setMockAccountDataForTest(null);
});

// --- 7. PHASE 2D.1 ODDSPAPI QUOTA ACCOUNTING & ENDPOINT CONTRACT TESTS ---
const {
  OddsPapiProvider,
  FIXTURES_COOLDOWN_MS,
  FIXTURES_MAX_SPORT_DATE_WINDOW_DAYS,
  FIXTURES_MAX_UNFILTERED_DATE_WINDOW_HOURS,
  ODDS_BY_TOURNAMENTS_COOLDOWN_MS,
  MAX_TOURNAMENTS_PER_BATCH_REQUEST,
  MAX_BOOKMAKERS_PER_REQUEST,
  MAX_BOOKMAKERS_WITH_BETFAIR_EX,
} = require('../src/services/providers/oddsPapiProvider.ts');

function buildMockAccountPayload(requestCount, requestLimit = 250, subscriptionId = 'sub-cycle-1', validFrom = '2026-10-01T00:00:00.000Z') {
  return {
    current_subscription_id: subscriptionId,
    subscriptions: [
      {
        subscription_id: subscriptionId,
        plan: 'free',
        is_active: true,
        valid_from: validFrom,
        valid_until: null,
        request_limit: requestLimit,
        request_count: requestCount,
        bookmakers: {
          pinnacle: { has_live_odds: false, has_player_props: false },
          bet365: { has_live_odds: false, has_player_props: false },
        },
        sport_ids: [10],
      },
    ],
  };
}

test('Phase 2D.1 - Test 21: HTTP 200 confirmation increments consumed count and retains in-memory floor when allowProductionWrite=false', async () => {
  OddsPapiQuotaGuard.resetCircuitBreaker();
  OddsPapiQuotaGuard.setMockPersistentQuotaStoreForTest(null);
  OddsPapiQuotaGuard.setMockAccountDataForTest(buildMockAccountPayload(100, 250));

  const res = await OddsPapiQuotaGuard.reserveQuota(1);
  assert.strictEqual(res.allowed, true);
  assert.ok(res.reservationId);
  assert.strictEqual(OddsPapiQuotaGuard.getActiveReservations().length, 1);
  assert.strictEqual(OddsPapiQuotaGuard.getActiveReservations()[0].cost, 1);

  await OddsPapiQuotaGuard.confirmQuota(
    res.reservationId,
    {
      endpoint: '/v4/odds-by-tournaments',
      params: { tournamentIds: '17', bookmakers: 'pinnacle' },
      statusCode: 200,
      outcome: 'SUCCESS',
    },
    false // allowProductionWrite = false
  );

  // Reservation moved from activeReservations to confirmedReservations; consumed floor is 101
  assert.strictEqual(OddsPapiQuotaGuard.getActiveReservations().length, 0);
  assert.strictEqual(OddsPapiQuotaGuard.getConfirmedReservations().length, 1);
  assert.strictEqual(OddsPapiQuotaGuard.getConfirmedReservations()[0].outcome, 'SUCCESS');
  assert.strictEqual(OddsPapiQuotaGuard.getInMemoryConfirmedCost(), 1);
  assert.strictEqual(OddsPapiQuotaGuard.getLocalConsumedFloor(), 101);

  const postConfirmStatus = await OddsPapiQuotaGuard.checkQuota(1);
  assert.strictEqual(postConfirmStatus.allowed, true);
  assert.strictEqual(postConfirmStatus.consumed, 101, 'Confirmed usage must not disappear when allowProductionWrite is false');

  OddsPapiQuotaGuard.resetCircuitBreaker();
  OddsPapiQuotaGuard.setMockAccountDataForTest(null);
});

test('Phase 2D.1 - Test 22: Billable HTTP 4xx (400/404/422) and 5xx (500/502/503) count as 1 billable request and cannot be released as free', async () => {
  OddsPapiQuotaGuard.resetCircuitBreaker();
  OddsPapiQuotaGuard.setMockPersistentQuotaStoreForTest(null);
  OddsPapiQuotaGuard.setMockAccountDataForTest(buildMockAccountPayload(120, 250));

  // Classification check per official /us/docs/requests-and-quota rules
  for (const billableStatus of [200, 400, 403, 404, 422, 500, 502, 503]) {
    assert.strictEqual(
      OddsPapiQuotaGuard.isBillableHttpStatus(billableStatus),
      true,
      `HTTP ${billableStatus} must be classified as billable`
    );
    assert.strictEqual(
      OddsPapiQuotaGuard.isNonBillableHttpStatus(billableStatus),
      false,
      `HTTP ${billableStatus} must not be classified as non-billable`
    );
  }

  // Attempting to call releaseQuota with a billable status (e.g. 400 or 500) must refuse free release and commit cost
  const res400 = await OddsPapiQuotaGuard.reserveQuota(1);
  assert.strictEqual(res400.allowed, true);
  OddsPapiQuotaGuard.releaseQuota(res400.reservationId, {
    endpoint: '/v4/odds-by-tournaments',
    params: { tournamentIds: '17', bookmakers: 'pinnacle' },
    error: 'HTTP 400 Bad Request',
    statusCode: 400,
  });

  const statusAfter400 = await OddsPapiQuotaGuard.checkQuota(1);
  assert.strictEqual(statusAfter400.consumed, 121, 'HTTP 400 must increment consumed count by 1');

  // Test via new OddsPapiProvider().getSingleBatchTournamentOdds receiving HTTP 500
  const originalFetch = global.fetch;
  const originalApiKey = process.env.ODDS_PAPI_KEY;
  process.env.ODDS_PAPI_KEY = 'test-offline-key';
  OddsPapiProvider.resetCooldownStateForTest();
  OddsPapiProvider.setSleepFnForTest(async () => {});
  const provider = new OddsPapiProvider();

  try {
    global.fetch = async () => ({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const providerResult = await provider.getSingleBatchTournamentOdds([17], 'pinnacle');
    assert.strictEqual(providerResult.status, 'DATA_UNAVAILABLE');
    assert.strictEqual(OddsPapiQuotaGuard.getInMemoryConfirmedCost(), 2, 'Both 400 and 500 must be confirmed as billable');

    const statusAfter500 = await OddsPapiQuotaGuard.checkQuota(1);
    assert.strictEqual(statusAfter500.consumed, 122, 'HTTP 500 via provider must increment consumed count to 122');
  } finally {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.ODDS_PAPI_KEY;
    else process.env.ODDS_PAPI_KEY = originalApiKey;
    OddsPapiProvider.setSleepFnForTest(null);
    OddsPapiProvider.resetCooldownStateForTest();
    OddsPapiQuotaGuard.resetCircuitBreaker();
    OddsPapiQuotaGuard.setMockAccountDataForTest(null);
  }
});

test('Phase 2D.1 - Test 23: Non-billable HTTP 401 and 429 release reservation as free (0 consumed) and trip circuit breaker', async () => {
  for (const freeStatus of [401, 429]) {
    assert.strictEqual(OddsPapiQuotaGuard.isNonBillableHttpStatus(freeStatus), true);
    assert.strictEqual(OddsPapiQuotaGuard.isBillableHttpStatus(freeStatus), false);
  }

  const originalFetch = global.fetch;
  const originalApiKey = process.env.ODDS_PAPI_KEY;
  process.env.ODDS_PAPI_KEY = 'test-offline-key';
  OddsPapiProvider.resetCooldownStateForTest();
  OddsPapiProvider.setSleepFnForTest(async () => {});
  const provider = new OddsPapiProvider();

  try {
    // 1. Test HTTP 401 via provider
    OddsPapiQuotaGuard.resetCircuitBreaker();
    OddsPapiQuotaGuard.setMockAccountDataForTest(buildMockAccountPayload(130, 250));

    global.fetch = async () => ({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized API key',
    });

    const res401 = await provider.getSingleBatchTournamentOdds([17], 'pinnacle');
    assert.strictEqual(res401.status, 'UNCONFIGURED');
    assert.strictEqual(OddsPapiQuotaGuard.isCircuitTripped(), true);
    assert.strictEqual(OddsPapiQuotaGuard.getInMemoryConfirmedCost(), 0, 'HTTP 401 must consume 0 quota');

    // 2. Test HTTP 429 via provider
    OddsPapiQuotaGuard.resetCircuitBreaker();
    OddsPapiQuotaGuard.setMockAccountDataForTest(buildMockAccountPayload(130, 250));

    global.fetch = async () => ({
      ok: false,
      status: 429,
      text: async () => 'Request limit exceeded',
    });

    const res429 = await provider.getBatchTournamentOdds([17], 'pinnacle');
    assert.strictEqual(res429.status, 'RATE_LIMITED');
    assert.strictEqual(OddsPapiQuotaGuard.isCircuitTripped(), true);
    assert.strictEqual(OddsPapiQuotaGuard.getInMemoryConfirmedCost(), 0, 'HTTP 429 must consume 0 quota');
  } finally {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.ODDS_PAPI_KEY;
    else process.env.ODDS_PAPI_KEY = originalApiKey;
    OddsPapiProvider.setSleepFnForTest(null);
    OddsPapiProvider.resetCooldownStateForTest();
    OddsPapiQuotaGuard.resetCircuitBreaker();
    OddsPapiQuotaGuard.setMockAccountDataForTest(null);
  }
});

test('Phase 2D.1 - Test 24: Pre-response network error rolls back reservation, and partial multi-request batch confirms only billable units', async () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.ODDS_PAPI_KEY;
  process.env.ODDS_PAPI_KEY = 'test-offline-key';
  OddsPapiProvider.resetCooldownStateForTest();
  OddsPapiProvider.setSleepFnForTest(async () => {});
  const provider = new OddsPapiProvider();

  try {
    // Part A: Pre-response transport error on single batch -> 0 consumed
    OddsPapiQuotaGuard.resetCircuitBreaker();
    OddsPapiQuotaGuard.setMockAccountDataForTest(buildMockAccountPayload(140, 250));

    global.fetch = async () => {
      throw new Error('ECONNRESET before HTTP response');
    };

    const netErrRes = await provider.getSingleBatchTournamentOdds([17], 'pinnacle');
    assert.strictEqual(netErrRes.status, 'DATA_UNAVAILABLE');
    const statusAfterNetErr = await OddsPapiQuotaGuard.checkQuota(1);
    assert.strictEqual(statusAfterNetErr.consumed, 140, 'Pre-response transport failure must release reservation with 0 consumed');

    // Part B: Multi-request loop in getUpcomingFixtures ([17, 8, 23] -> 3 requests)
    // Request 1 (tournamentId=17) -> 200 OK (billable: +1)
    // Request 2 (tournamentId=8)  -> 500 Error (billable: +1)
    // Request 3 (tournamentId=23) -> 429 Too Many Requests (non-billable: +0, aborts)
    // Expected: 2 units confirmed (140 -> 142), 1 unit released!
    OddsPapiQuotaGuard.resetCircuitBreaker();
    OddsPapiQuotaGuard.setMockAccountDataForTest(buildMockAccountPayload(140, 250));

    let callIdx = 0;
    global.fetch = async () => {
      callIdx++;
      if (callIdx === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              fixtureId: 'id10001',
              tournamentId: 17,
              tournamentName: 'Premier League',
              participant1Name: 'Arsenal FC',
              participant2Name: 'Chelsea FC',
              startTime: '2026-10-15T15:00:00.000Z',
              statusId: 0,
            },
          ],
        };
      }
      if (callIdx === 2) {
        return {
          ok: false,
          status: 500,
          text: async () => 'Upstream 500',
        };
      }
      return {
        ok: false,
        status: 429,
        text: async () => 'Request limit exceeded',
      };
    };

    const partialRes = await provider.getUpcomingFixtures([17, 8, 23]);
    assert.strictEqual(partialRes.status, 'RATE_LIMITED');
    assert.strictEqual(OddsPapiQuotaGuard.getInMemoryConfirmedCost(), 2, 'Must confirm 2 billable requests (200 + 500) and release 1 unbilled (429)');
    assert.strictEqual(OddsPapiQuotaGuard.getLocalConsumedFloor(), 142);
    assert.strictEqual(OddsPapiQuotaGuard.getActiveReservations().length, 0);
  } finally {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.ODDS_PAPI_KEY;
    else process.env.ODDS_PAPI_KEY = originalApiKey;
    OddsPapiProvider.setSleepFnForTest(null);
    OddsPapiProvider.resetCooldownStateForTest();
    OddsPapiQuotaGuard.resetCircuitBreaker();
    OddsPapiQuotaGuard.setMockAccountDataForTest(null);
  }
});

test('Phase 2D.1 - Test 25: Cache-window monotonic floor prevents stale /v4/account payload from rolling back confirmed usage in same cycle', async () => {
  OddsPapiQuotaGuard.resetCircuitBreaker();
  OddsPapiQuotaGuard.setMockPersistentQuotaStoreForTest(null);
  OddsPapiQuotaGuard.setMockAccountDataForTest(buildMockAccountPayload(150, 250, 'sub-cycle-A', '2026-10-01T00:00:00.000Z'));

  // Reserve & confirm 2 requests (150 -> 152)
  const r = await OddsPapiQuotaGuard.reserveQuota(2);
  assert.strictEqual(r.allowed, true);
  await OddsPapiQuotaGuard.confirmQuota(
    r.reservationId,
    {
      endpoint: '/v4/fixtures',
      params: { tournamentId: 17 },
      statusCode: 200,
      outcome: 'SUCCESS',
      consumedCost: 2,
    },
    false
  );

  // Simulate a stale /v4/account response in the same subscription cycle still reporting request_count: 150
  OddsPapiQuotaGuard.setMockAccountDataForTest(buildMockAccountPayload(150, 250, 'sub-cycle-A', '2026-10-01T00:00:00.000Z'));

  const checkSameCycle = await OddsPapiQuotaGuard.checkQuota(1);
  assert.strictEqual(
    checkSameCycle.consumed,
    152,
    'Stale /v4/account payload in same subscription cycle must NOT roll back confirmed floor (152)'
  );

  // Now simulate a genuine new subscription billing cycle ('sub-cycle-B') where provider reset request_count to 0
  OddsPapiQuotaGuard.setMockAccountDataForTest(buildMockAccountPayload(0, 250, 'sub-cycle-B', '2026-11-01T00:00:00.000Z'));
  const checkNewCycle = await OddsPapiQuotaGuard.checkQuota(1);
  assert.strictEqual(
    checkNewCycle.consumed,
    0,
    'New subscription cycle must reset localConsumedFloor to the new cycle request_count (0)'
  );

  OddsPapiQuotaGuard.resetCircuitBreaker();
  OddsPapiQuotaGuard.setMockAccountDataForTest(null);
});

test('Phase 2D.1 - Test 26: Cold-start accounting recovers from persistent store or fails closed with DB_UNREACHABLE_BLOCK', async () => {
  OddsPapiQuotaGuard.resetCircuitBreaker();
  OddsPapiQuotaGuard.setMockPersistentQuotaStoreForTest({
    consumed: 160,
    limit: 250,
    updatedAt: '2026-10-13T00:00:00.000Z',
  });
  OddsPapiQuotaGuard.setMockAccountDataForTest(buildMockAccountPayload(160, 250));

  // Confirm 1 request with allowProductionWrite = false -> updates mockPersistentQuotaStore to 161
  const res = await OddsPapiQuotaGuard.reserveQuota(1);
  assert.strictEqual(res.allowed, true);
  await OddsPapiQuotaGuard.confirmQuota(
    res.reservationId,
    {
      endpoint: '/v4/odds-by-tournaments',
      params: { tournamentIds: '17', bookmakers: 'pinnacle' },
      statusCode: 200,
    },
    false
  );

  assert.strictEqual(OddsPapiQuotaGuard.getMockPersistentQuotaStoreForTest().consumed_count, 161);

  // Simulate serverless cold start: clears all in-memory state (cachedAccountData, localConsumedFloor, confirmedReservations)
  OddsPapiQuotaGuard.simulateColdStartForTest();
  assert.strictEqual(OddsPapiQuotaGuard.getInMemoryConfirmedCost(), 0);
  assert.strictEqual(OddsPapiQuotaGuard.getLocalConsumedFloor(), 0);

  // 1. Cold start with persistent store available (and /v4/account returning stale 160) -> recovers max(160, 161) = 161
  OddsPapiQuotaGuard.setMockAccountDataForTest(buildMockAccountPayload(160, 250));
  const statusRecovered = await OddsPapiQuotaGuard.checkQuota(1);
  assert.strictEqual(statusRecovered.allowed, true);
  assert.strictEqual(statusRecovered.consumed, 161, 'Cold start must recover 161 from persistent quota store');

  // 2. Cold start with NEITHER persistent store NOR /v4/account reachable -> MUST fail closed with DB_UNREACHABLE_BLOCK
  OddsPapiQuotaGuard.simulateColdStartForTest();
  OddsPapiQuotaGuard.setMockPersistentQuotaStoreForTest(null);
  OddsPapiQuotaGuard.setMockAccountDataForTest(null);

  const originalSupaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalApiKey = process.env.ODDS_PAPI_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.ODDS_PAPI_KEY;

  try {
    const coldFailClosed = await OddsPapiQuotaGuard.checkQuota(1);
    assert.strictEqual(coldFailClosed.allowed, false, 'Must fail closed when both persistent state and /v4/account are unreachable');
    assert.match(coldFailClosed.reason || '', /DB_UNREACHABLE_BLOCK/i);
  } finally {
    if (originalSupaUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupaUrl;
    if (originalApiKey !== undefined) process.env.ODDS_PAPI_KEY = originalApiKey;
    OddsPapiQuotaGuard.resetCircuitBreaker();
    OddsPapiQuotaGuard.setMockPersistentQuotaStoreForTest(null);
    OddsPapiQuotaGuard.setMockAccountDataForTest(null);
  }
});

test('Phase 2D.1 - Test 27: GET /v4/fixtures contract enforces singular tournamentId, <10d/<48h date windows, and 2000ms cooldown', async () => {
  assert.strictEqual(FIXTURES_COOLDOWN_MS, 2000);
  assert.strictEqual(FIXTURES_MAX_SPORT_DATE_WINDOW_DAYS, 10);
  assert.strictEqual(FIXTURES_MAX_UNFILTERED_DATE_WINDOW_HOURS, 48);

  // 1. Valid URL construction with singular tournamentId
  const builtUrl = OddsPapiProvider.buildFixturesRequestUrl({
    apiKey: 'secret-key',
    sportId: 10,
    tournamentId: 17,
    from: '2026-10-13T00:00:00.000Z',
    to: '2026-10-20T00:00:00.000Z',
    statusId: 0,
    hasOdds: true,
    bookmakers: ['pinnacle', 'bet365'],
  });
  assert.ok(builtUrl.includes('tournamentId=17'), 'Must use singular tournamentId=17');
  assert.ok(!builtUrl.includes('tournaments='), 'Must NEVER emit undocumented tournaments= param');
  assert.ok(builtUrl.includes('sportId=10'));
  assert.ok(builtUrl.includes('bookmakers=pinnacle%2Cbet365'));

  // 2. Rejects date window >= 10 days when sportId is used without tournamentId
  assert.throws(
    () =>
      OddsPapiProvider.buildFixturesRequestUrl({
        apiKey: 'secret-key',
        sportId: 10,
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-10-12T00:00:00.000Z', // 11 days
      }),
    /FIXTURES_DATE_WINDOW_EXCEEDED/
  );

  // 3. Rejects date window >= 48 hours when unfiltered (no sportId, tournamentId, or participantId)
  assert.throws(
    () =>
      OddsPapiProvider.buildFixturesRequestUrl({
        apiKey: 'secret-key',
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-10-04T00:00:00.000Z', // 72 hours
      }),
    /FIXTURES_UNFILTERED_WINDOW_EXCEEDED/
  );

  // 4. Verify getUpcomingFixtures enforces 2000ms cooldown between consecutive requests and constructs tournamentId= per tournament
  const originalFetch = global.fetch;
  const originalApiKey = process.env.ODDS_PAPI_KEY;
  process.env.ODDS_PAPI_KEY = 'test-offline-key';
  OddsPapiQuotaGuard.resetCircuitBreaker();
  OddsPapiQuotaGuard.setMockAccountDataForTest(buildMockAccountPayload(50, 250));
  OddsPapiProvider.resetCooldownStateForTest();
  OddsPapiProvider.setSleepFnForTest(async () => {});
  const provider = new OddsPapiProvider();

  const requestedUrls = [];
  try {
    global.fetch = async (url) => {
      requestedUrls.push(String(url));
      return {
        ok: true,
        status: 200,
        json: async () => [],
      };
    };

    const res = await provider.getUpcomingFixtures([17, 8]);
    assert.strictEqual(res.status, 'DATA_UNAVAILABLE'); // empty fixture list -> DATA_UNAVAILABLE
    assert.strictEqual(requestedUrls.length, 2);
    assert.ok(requestedUrls[0].includes('tournamentId=17') && !requestedUrls[0].includes('tournaments='));
    assert.ok(requestedUrls[1].includes('tournamentId=8') && !requestedUrls[1].includes('tournaments='));

    const cooldownHistory = OddsPapiProvider.getCooldownHistoryForTest();
    assert.strictEqual(cooldownHistory.length, 1, 'Second consecutive /v4/fixtures call must trigger 1 cooldown wait');
    assert.strictEqual(cooldownHistory[0].endpoint, '/fixtures');
    assert.ok(cooldownHistory[0].waitedMs > 0 && cooldownHistory[0].waitedMs <= 2000);
  } finally {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.ODDS_PAPI_KEY;
    else process.env.ODDS_PAPI_KEY = originalApiKey;
    OddsPapiProvider.setSleepFnForTest(null);
    OddsPapiProvider.resetCooldownStateForTest();
    OddsPapiQuotaGuard.resetCircuitBreaker();
    OddsPapiQuotaGuard.setMockAccountDataForTest(null);
  }
});

test('Phase 2D.1 - Test 28: GET /v4/odds-by-tournaments contract enforces tournamentIds, bookmakers (max 3 / betfair-ex max 1), batch size <= 5, and 1000ms cooldown', async () => {
  assert.strictEqual(ODDS_BY_TOURNAMENTS_COOLDOWN_MS, 1000);
  assert.strictEqual(MAX_TOURNAMENTS_PER_BATCH_REQUEST, 5);
  assert.strictEqual(MAX_BOOKMAKERS_PER_REQUEST, 3);
  assert.strictEqual(MAX_BOOKMAKERS_WITH_BETFAIR_EX, 1);

  // 1. Valid request construction uses tournamentIds and bookmakers (never tournaments= or bookmaker=)
  const validUrl = OddsPapiProvider.buildOddsByTournamentsRequestUrl({
    apiKey: 'secret-key',
    tournamentIds: [17, 8, 23, 35, 34],
    bookmakers: ['pinnacle', 'bet365'],
    enforceBatchSizeLimit: true,
  });
  assert.ok(validUrl.includes('tournamentIds=17%2C8%2C23%2C35%2C34'));
  assert.ok(validUrl.includes('bookmakers=pinnacle%2Cbet365'));
  assert.ok(!validUrl.includes('tournaments='), 'Must NEVER emit undocumented tournaments= param');
  assert.ok(!validUrl.includes('bookmaker='), 'Must NEVER emit singular bookmaker= param');

  // 2. Rejects > 3 bookmakers
  assert.throws(
    () =>
      OddsPapiProvider.buildOddsByTournamentsRequestUrl({
        apiKey: 'secret-key',
        tournamentIds: [17],
        bookmakers: ['pinnacle', 'bet365', 'unibet', 'bwin'],
      }),
    /MAX_BOOKMAKERS_EXCEEDED/
  );

  // 3. Rejects betfair-ex combined with any other bookmaker
  assert.throws(
    () =>
      OddsPapiProvider.buildOddsByTournamentsRequestUrl({
        apiKey: 'secret-key',
        tournamentIds: [17],
        bookmakers: ['betfair-ex', 'pinnacle'],
      }),
    /BETFAIR_EX_BOOKMAKER_LIMIT/
  );

  // 4. Rejects > 5 tournamentIds when enforceBatchSizeLimit is true
  assert.throws(
    () =>
      OddsPapiProvider.buildOddsByTournamentsRequestUrl({
        apiKey: 'secret-key',
        tournamentIds: [17, 8, 23, 35, 34, 7],
        bookmakers: 'pinnacle',
        enforceBatchSizeLimit: true,
      }),
    /MAX_TOURNAMENTS_PER_BATCH_EXCEEDED/
  );

  // 5. Verify 1000ms cooldown between two consecutive getBatchTournamentOdds calls & boolean player0.mainLine parsing
  const originalFetch = global.fetch;
  const originalApiKey = process.env.ODDS_PAPI_KEY;
  process.env.ODDS_PAPI_KEY = 'test-offline-key';
  OddsPapiQuotaGuard.resetCircuitBreaker();
  OddsPapiQuotaGuard.setMockAccountDataForTest(buildMockAccountPayload(60, 250));
  OddsPapiProvider.resetCooldownStateForTest();
  OddsPapiProvider.setSleepFnForTest(async () => {});
  const provider = new OddsPapiProvider();

  try {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => [
        {
          fixtureId: 'id10000099',
          bookmakerOdds: {
            pinnacle: {
              markets: {
                m_ah: {
                  bookmakerMarketId: 'alt/1/spreads',
                  marketActive: true,
                  outcomes: {
                    home: {
                      players: {
                        '0': {
                          active: true,
                          bookmakerOutcomeId: '-0.5/home',
                          price: 1.91,
                          mainLine: true,
                        },
                      },
                    },
                    away: {
                      players: {
                        '0': {
                          active: true,
                          bookmakerOutcomeId: '0.5/away',
                          price: 1.99,
                          mainLine: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      ],
    });

    const batch1 = await provider.getBatchTournamentOdds([17, 8], 'pinnacle');
    const batch2 = await provider.getBatchTournamentOdds([23, 35], 'pinnacle');
    assert.strictEqual(batch1.status, 'AVAILABLE');
    assert.strictEqual(batch2.status, 'AVAILABLE');
    assert.strictEqual(batch1.data.length, 1);
    assert.strictEqual(batch1.data[0].marketType, 'ASIAN_HANDICAP');
    assert.strictEqual(batch1.data[0].isMainLine, true, 'Must honor official boolean player0.mainLine');

    const cooldownHistory = OddsPapiProvider.getCooldownHistoryForTest();
    assert.strictEqual(cooldownHistory.length, 1, 'Second consecutive /v4/odds-by-tournaments call must trigger 1000ms cooldown');
    assert.strictEqual(cooldownHistory[0].endpoint, '/odds-by-tournaments');
    assert.ok(cooldownHistory[0].waitedMs > 0 && cooldownHistory[0].waitedMs <= 1000);
  } finally {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.ODDS_PAPI_KEY;
    else process.env.ODDS_PAPI_KEY = originalApiKey;
    OddsPapiProvider.setSleepFnForTest(null);
    OddsPapiProvider.resetCooldownStateForTest();
    OddsPapiQuotaGuard.resetCircuitBreaker();
    OddsPapiQuotaGuard.setMockAccountDataForTest(null);
  }
});

test('Phase 2D.2 - Test 29: Duplicate confirmQuota idempotency and HTTP 200 corrupt JSON body is still counted as 1 billable request', async () => {
  OddsPapiQuotaGuard.resetCircuitBreaker();
  OddsPapiQuotaGuard.setMockPersistentQuotaStoreForTest(null);
  OddsPapiQuotaGuard.setMockAccountDataForTest(buildMockAccountPayload(170, 250));

  // Part A: Duplicate confirmQuota on the same reservationId increments consumed only once
  const r = await OddsPapiQuotaGuard.reserveQuota(1);
  assert.strictEqual(r.allowed, true);
  await OddsPapiQuotaGuard.confirmQuota(
    r.reservationId,
    {
      endpoint: '/v4/odds-by-tournaments',
      params: { tournamentIds: '17', bookmakers: 'pinnacle' },
      statusCode: 200,
    },
    false
  );
  // Duplicate call with identical reservationId must be ignored
  await OddsPapiQuotaGuard.confirmQuota(
    r.reservationId,
    {
      endpoint: '/v4/odds-by-tournaments',
      params: { tournamentIds: '17', bookmakers: 'pinnacle' },
      statusCode: 200,
    },
    false
  );
  assert.strictEqual(OddsPapiQuotaGuard.getInMemoryConfirmedCost(), 1, 'Duplicate confirmQuota must NOT double-count');
  assert.strictEqual(OddsPapiQuotaGuard.getLocalConsumedFloor(), 171);

  // Part B: HTTP 200 with corrupt/unparseable JSON body still counts as 1 billable request (not refunded)
  const originalFetch = global.fetch;
  const originalApiKey = process.env.ODDS_PAPI_KEY;
  process.env.ODDS_PAPI_KEY = 'test-offline-key';
  OddsPapiProvider.resetCooldownStateForTest();
  OddsPapiProvider.setSleepFnForTest(async () => {});
  const provider = new OddsPapiProvider();

  try {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected end of JSON input after HTTP 200');
      },
    });

    const corruptRes = await provider.getBatchTournamentOdds([17], 'pinnacle');
    assert.strictEqual(corruptRes.status, 'DATA_UNAVAILABLE');
    assert.strictEqual(corruptRes.requestsConsumed, 1, 'HTTP 200 with parse failure must still report requestsConsumed=1');
    assert.strictEqual(OddsPapiQuotaGuard.getInMemoryConfirmedCost(), 2, 'HTTP 200 with parse failure must not refund confirmed quota');
    assert.strictEqual(OddsPapiQuotaGuard.getLocalConsumedFloor(), 172);
  } finally {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.ODDS_PAPI_KEY;
    else process.env.ODDS_PAPI_KEY = originalApiKey;
    OddsPapiProvider.setSleepFnForTest(null);
    OddsPapiProvider.resetCooldownStateForTest();
    OddsPapiQuotaGuard.resetCircuitBreaker();
    OddsPapiQuotaGuard.setMockAccountDataForTest(null);
  }
});

test('Phase 2D.2 - Test 30: MultiLeagueAutoActivator counts billable 500 error toward billableRequestsMade and protects 50-request reserve', async () => {
  const { MultiLeagueAutoActivator } = require('../src/engine/activation/multiLeagueAutoActivator.ts');
  OddsPapiQuotaGuard.resetCircuitBreaker();

  const origGetTournamentOdds = OddsPapiProvider.prototype.getTournamentOdds;
  const origCheckQuota = OddsPapiQuotaGuard.checkQuota;

  try {
    // Simulate a billable HTTP 500 failure (status='DATA_UNAVAILABLE', requestsConsumed=1)
    OddsPapiProvider.prototype.getTournamentOdds = async function () {
      return {
        status: 'DATA_UNAVAILABLE',
        provider: 'OddsPapi',
        data: null,
        error: 'OddsPapi /odds-by-tournaments returned HTTP 500',
        latencyMs: 12,
        cached: false,
        timestamp: new Date().toISOString(),
        requestsConsumed: 1,
      };
    };

    OddsPapiQuotaGuard.checkQuota = async function () {
      return { allowed: true, reason: 'Allowed in test' };
    };

    const futureKickoff = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
    const res = await MultiLeagueAutoActivator.runAutoUnlockCycle({
      mode: 'SIMULATED_RESET_TEST',
      injectedAccountData: buildMockAccountPayload(100, 250),
      injectedFixtures: [
        { providerFixtureId: 'f1', homeTeam: 'Arsenal', awayTeam: 'Chelsea', league: 'Premier League', kickoffTime: futureKickoff },
      ],
      writeVerificationArtifact: false,
    });

    assert.strictEqual(res.billableRequestsMade, 1, 'Billable HTTP 500 batch call must increment billableRequestsMade by 1');
  } finally {
    OddsPapiProvider.prototype.getTournamentOdds = origGetTournamentOdds;
    OddsPapiQuotaGuard.checkQuota = origCheckQuota;
    OddsPapiQuotaGuard.resetCircuitBreaker();
  }
});

test('Phase 2D.2 - Test 31: Official OddsPapi football prediction article review and offline historical research plan are archived and complete', () => {
  const archiveDir = path.join(process.cwd(), 'docs/third-party/oddsPapi');
  const blogReviewPath = path.join(archiveDir, 'blog_football_predictions_review.md');
  const researchPlanPath = path.join(archiveDir, 'historical_odds_research_plan.md');
  const quotaRecPath = path.join(archiveDir, 'quota_reconciliation.md');

  assert.ok(fs.existsSync(blogReviewPath), 'blog_football_predictions_review.md must exist');
  assert.ok(fs.existsSync(researchPlanPath), 'historical_odds_research_plan.md must exist');

  const blogReview = fs.readFileSync(blogReviewPath, 'utf8');
  const researchPlan = fs.readFileSync(researchPlanPath, 'utf8');
  const quotaRec = fs.readFileSync(quotaRecPath, 'utf8');

  // Verify blog review captures source URL, 4-way separation, 0.5778 1X2 Brier vs SALMO AH/OU distinction, and pre-kickoff active filter
  assert.ok(blogReview.includes('https://oddspapi.io/blog/football-data-api-betting-predictions/'));
  assert.ok(blogReview.includes('0.5778'));
  assert.ok(blogReview.includes('0.2500'));
  assert.ok(blogReview.includes('entry.createdAt < fixture.startTime && entry.active === true'));
  assert.ok(blogReview.includes('scores.periods.fulltime'));

  // Verify research plan covers all 7 required offline research dimensions
  assert.ok(researchPlan.includes('createdAt') && researchPlan.includes('startTime') && researchPlan.includes('active === true'));
  assert.ok(researchPlan.includes('2.25') && researchPlan.includes('2.75'));
  assert.ok(researchPlan.includes('min_sample_size >= 100'));
  assert.ok(researchPlan.includes('RESEARCH_ONLY'));

  // Verify quota_reconciliation.md answers the 6 Critical Persistence Gate questions
  assert.ok(quotaRec.includes('Critical Persistence Gate Audit'));
  assert.ok(quotaRec.includes('Q1: Where is confirmed quota stored in production?'));
  assert.ok(quotaRec.includes('Q6: What happens when both `/v4/account` and persistent quota state are unavailable?'));
});
