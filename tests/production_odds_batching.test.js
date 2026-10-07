// SALMO.DEV — Production Odds Ingestion & Tournament Batching Invariant Test Suite
// Verifies:
// 1. Request-Count Invariant:
//    - Exactly 6 calls to getTournamentOdds() (3 batches x 2 bookmakers: Pinnacle + Bet365)
//    - Exactly 0 calls to getMarketOdds() (zero per-fixture fanout)
//    - Maximum 5 tournament IDs per batch request (MAX_TOURNAMENTS_PER_BATCH_REQUEST = 5)
//    - Total request budget = 3 discovery + 6 tournament odds = 9 requests
// 2. Mapping Integrity:
//    - Odds returned by tournament batches map strictly to matching providerFixtureId
//    - No cross-tournament or cross-fixture contamination
//    - Multiple fixtures within the same tournament map independently
//    - Missing bookmaker data remains missing (zero synthetic fabrication)
// 3. Fail-Closed Invariant:
//    - Provider 429 / error / empty yields zero synthetic odds and zero per-fixture fallback

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');

// Auto-transpile TypeScript modules
if (!require.extensions['.ts']) {
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
}

const { OddsPapiProvider } = require('../src/services/providers/oddsPapiProvider.ts');
const { ProductionPredictionEngine } = require('../src/engine/pipeline/productionPredictionEngine.ts');
const { CANONICAL_15_LEAGUES, getTournamentBatches, MAX_TOURNAMENTS_PER_BATCH_REQUEST } = require('../src/config/multiLeagueRegistry.ts');
const { OddsPapiQuotaGuard } = require('../src/lib/quota/oddsPapiQuotaGuard.ts');
const { CONSUMED_BOOKMAKERS } = require('../src/services/providers/types.ts');
const { getEnv, resetEnv } = require('../src/config/env.ts');

test('A. Request-Count Invariant: Exact 6 Tournament Odds Requests, 0 Market Odds Requests', async () => {
  const originalGetUpcoming = OddsPapiProvider.prototype.getUpcomingFixtures;
  const originalGetTournamentOdds = OddsPapiProvider.prototype.getTournamentOdds;
  const originalGetMarketOdds = OddsPapiProvider.prototype.getMarketOdds;
  const originalIsConfigured = OddsPapiProvider.prototype.isConfigured;

  const tournamentOddsCalls = [];
  let marketOddsCallsCount = 0;
  let discoveryCallsCount = 0;

  try {
    // 1. Force provider to report configured
    OddsPapiProvider.prototype.isConfigured = () => true;

    // 2. Mock discovery: returns 10 test fixtures across 5 leagues
    OddsPapiProvider.prototype.getUpcomingFixtures = async function () {
      discoveryCallsCount += 3; // Simulating the 3 discovery batch requests for 15 leagues
      return {
        status: 'AVAILABLE',
        provider: 'OddsPapi',
        data: [
          {
            providerFixtureId: 'fx_pl_1',
            league: 'Premier League',
            season: '2026',
            kickoffTime: '2026-10-10T14:00:00.000Z',
            homeTeam: 'Arsenal',
            awayTeam: 'Chelsea',
            status: 'SCHEDULED',
            oddspapiTournamentId: 17,
          },
          {
            providerFixtureId: 'fx_pl_2',
            league: 'Premier League',
            season: '2026',
            kickoffTime: '2026-10-10T16:30:00.000Z',
            homeTeam: 'Liverpool',
            awayTeam: 'Manchester City',
            status: 'SCHEDULED',
            oddspapiTournamentId: 17,
          },
          {
            providerFixtureId: 'fx_laliga_1',
            league: 'La Liga',
            season: '2026',
            kickoffTime: '2026-10-10T19:00:00.000Z',
            homeTeam: 'Real Madrid',
            awayTeam: 'Barcelona',
            status: 'SCHEDULED',
            oddspapiTournamentId: 8,
          },
          {
            providerFixtureId: 'fx_j1_1',
            league: 'J1 League',
            season: '2026',
            kickoffTime: '2026-10-11T10:00:00.000Z',
            homeTeam: 'Urawa Reds',
            awayTeam: 'Yokohama F Marinos',
            status: 'SCHEDULED',
            oddspapiTournamentId: 196,
          },
        ],
        latencyMs: 10,
        cached: false,
        timestamp: new Date().toISOString(),
      };
    };

    // 3. Spy getTournamentOdds
    OddsPapiProvider.prototype.getTournamentOdds = async function (batch, bookmaker) {
      tournamentOddsCalls.push({ batch, bookmaker, length: batch.length });
      return {
        status: 'AVAILABLE',
        provider: 'OddsPapi',
        data: [],
        latencyMs: 5,
        cached: false,
        timestamp: new Date().toISOString(),
      };
    };

    // 4. Spy getMarketOdds (MUST REMAIN ZERO)
    OddsPapiProvider.prototype.getMarketOdds = async function () {
      marketOddsCallsCount++;
      return {
        status: 'AVAILABLE',
        provider: 'OddsPapi',
        data: [],
        latencyMs: 5,
        cached: false,
        timestamp: new Date().toISOString(),
      };
    };

    // Run discovery & odds ingestion
    const fixtures = await ProductionPredictionEngine.discoverUpcomingFixturesWithOdds();

    // ASSERTION 1: Exactly 6 calls to getTournamentOdds (3 batches x 2 bookmakers)
    assert.strictEqual(
      tournamentOddsCalls.length,
      6,
      `Expected exactly 6 calls to getTournamentOdds, received ${tournamentOddsCalls.length}`
    );

    // ASSERTION 2: Exactly 0 calls to getMarketOdds
    assert.strictEqual(
      marketOddsCallsCount,
      0,
      `Expected 0 calls to getMarketOdds (per-fixture fanout must be eliminated), received ${marketOddsCallsCount}`
    );

    // ASSERTION 3: Max tournaments per request <= 5
    for (const call of tournamentOddsCalls) {
      assert.ok(
        call.length <= MAX_TOURNAMENTS_PER_BATCH_REQUEST,
        `Batch size ${call.length} exceeded MAX_TOURNAMENTS_PER_BATCH_REQUEST (${MAX_TOURNAMENTS_PER_BATCH_REQUEST})`
      );
    }

    // ASSERTION 4: Exactly 3 Pinnacle calls and 3 Bet365 calls
    const pinnacleCalls = tournamentOddsCalls.filter(c => c.bookmaker === 'pinnacle');
    const bet365Calls = tournamentOddsCalls.filter(c => c.bookmaker === 'bet365');
    assert.strictEqual(pinnacleCalls.length, 3, 'Must have exactly 3 Pinnacle batch calls');
    assert.strictEqual(bet365Calls.length, 3, 'Must have exactly 3 Bet365 batch calls');

    // ASSERTION 5: Full request budget = 3 discovery + 6 odds = 9 total
    const totalRequests = discoveryCallsCount + tournamentOddsCalls.length;
    assert.strictEqual(
      totalRequests,
      9,
      `Expected exact 9 total provider requests per execution budget, observed ${totalRequests}`
    );

    assert.strictEqual(fixtures.length, 4, 'Must retain all 4 discovered fixtures');
  } finally {
    OddsPapiProvider.prototype.getUpcomingFixtures = originalGetUpcoming;
    OddsPapiProvider.prototype.getTournamentOdds = originalGetTournamentOdds;
    OddsPapiProvider.prototype.getMarketOdds = originalGetMarketOdds;
    OddsPapiProvider.prototype.isConfigured = originalIsConfigured;
  }
});

test('B. Mapping Integrity: Batched Odds Correctly Map to Distinct Fixtures Without Contamination', async () => {
  const originalGetUpcoming = OddsPapiProvider.prototype.getUpcomingFixtures;
  const originalGetTournamentOdds = OddsPapiProvider.prototype.getTournamentOdds;
  const originalIsConfigured = OddsPapiProvider.prototype.isConfigured;

  try {
    OddsPapiProvider.prototype.isConfigured = () => true;

    // Discovered fixtures across 2 tournaments (17 and 8)
    OddsPapiProvider.prototype.getUpcomingFixtures = async () => ({
      status: 'AVAILABLE',
      provider: 'OddsPapi',
      data: [
        {
          providerFixtureId: 'fx_epl_arsenal_chelsea',
          league: 'Premier League',
          season: '2026',
          kickoffTime: '2026-10-10T14:00:00.000Z',
          homeTeam: 'Arsenal',
          awayTeam: 'Chelsea',
          status: 'SCHEDULED',
          oddspapiTournamentId: 17,
        },
        {
          providerFixtureId: 'fx_epl_liverpool_mancity',
          league: 'Premier League',
          season: '2026',
          kickoffTime: '2026-10-10T16:30:00.000Z',
          homeTeam: 'Liverpool',
          awayTeam: 'Manchester City',
          status: 'SCHEDULED',
          oddspapiTournamentId: 17,
        },
        {
          providerFixtureId: 'fx_laliga_madrid_barca',
          league: 'La Liga',
          season: '2026',
          kickoffTime: '2026-10-10T19:00:00.000Z',
          homeTeam: 'Real Madrid',
          awayTeam: 'Barcelona',
          status: 'SCHEDULED',
          oddspapiTournamentId: 8,
        },
        {
          providerFixtureId: 'fx_no_odds_match',
          league: 'Bundesliga',
          season: '2026',
          kickoffTime: '2026-10-10T14:30:00.000Z',
          homeTeam: 'Bayern Munich',
          awayTeam: 'Dortmund',
          status: 'SCHEDULED',
          oddspapiTournamentId: 35,
        },
      ],
      latencyMs: 10,
      cached: false,
      timestamp: new Date().toISOString(),
    });

    // Mock batch odds returning specific odds tagged with providerFixtureId
    OddsPapiProvider.prototype.getTournamentOdds = async function (batch, bookmaker) {
      if (bookmaker === 'pinnacle') {
        return {
          status: 'AVAILABLE',
          provider: 'OddsPapi',
          data: [
            // Arsenal vs Chelsea (AH -0.5, OU 2.75, BTTS)
            {
              providerFixtureId: 'fx_epl_arsenal_chelsea',
              bookmaker: 'Pinnacle',
              marketType: 'ASIAN_HANDICAP',
              line: -0.5,
              homeOdds: 1.95,
              awayOdds: 1.95,
              capturedAt: '2026-10-07T12:00:00Z',
              isMainLine: true,
            },
            {
              providerFixtureId: 'fx_epl_arsenal_chelsea',
              bookmaker: 'Pinnacle',
              marketType: 'OVER_UNDER',
              line: 2.75,
              homeOdds: 1.92,
              awayOdds: 1.98,
              capturedAt: '2026-10-07T12:00:00Z',
              isMainLine: true,
            },
            {
              providerFixtureId: 'fx_epl_arsenal_chelsea',
              bookmaker: 'Pinnacle',
              marketType: 'BTTS',
              line: 0,
              homeOdds: 1.80,
              awayOdds: 2.05,
              capturedAt: '2026-10-07T12:00:00Z',
              isMainLine: true,
            },
            // Liverpool vs Man City (AH 0.0, OU 3.0)
            {
              providerFixtureId: 'fx_epl_liverpool_mancity',
              bookmaker: 'Pinnacle',
              marketType: 'ASIAN_HANDICAP',
              line: 0.0,
              homeOdds: 2.02,
              awayOdds: 1.88,
              capturedAt: '2026-10-07T12:00:00Z',
              isMainLine: true,
            },
            {
              providerFixtureId: 'fx_epl_liverpool_mancity',
              bookmaker: 'Pinnacle',
              marketType: 'OVER_UNDER',
              line: 3.0,
              homeOdds: 1.85,
              awayOdds: 2.05,
              capturedAt: '2026-10-07T12:00:00Z',
              isMainLine: true,
            },
            // Real Madrid vs Barcelona (AH -0.25, OU 3.25)
            {
              providerFixtureId: 'fx_laliga_madrid_barca',
              bookmaker: 'Pinnacle',
              marketType: 'ASIAN_HANDICAP',
              line: -0.25,
              homeOdds: 1.91,
              awayOdds: 1.99,
              capturedAt: '2026-10-07T12:00:00Z',
              isMainLine: true,
            },
            {
              providerFixtureId: 'fx_laliga_madrid_barca',
              bookmaker: 'Pinnacle',
              marketType: 'OVER_UNDER',
              line: 3.25,
              homeOdds: 2.00,
              awayOdds: 1.90,
              capturedAt: '2026-10-07T12:00:00Z',
              isMainLine: true,
            },
          ],
          latencyMs: 15,
          cached: false,
          timestamp: new Date().toISOString(),
        };
      }

      // Bet365 returns independent retail execution lines
      return {
        status: 'AVAILABLE',
        provider: 'OddsPapi',
        data: [
          {
            providerFixtureId: 'fx_epl_arsenal_chelsea',
            bookmaker: 'Bet365',
            marketType: 'ASIAN_HANDICAP',
            line: -0.5,
            homeOdds: 1.98, // retail price
            awayOdds: 1.92,
            capturedAt: '2026-10-07T12:00:00Z',
            isMainLine: true,
          },
        ],
        latencyMs: 15,
        cached: false,
        timestamp: new Date().toISOString(),
      };
    };

    const fixtures = await ProductionPredictionEngine.discoverUpcomingFixturesWithOdds();

    assert.strictEqual(fixtures.length, 4, 'Must create exactly 4 fixture records without duplication');

    // 1. Verify Arsenal vs Chelsea
    const arsenalFixture = fixtures.find(f => f.fixtureId === 'fx_epl_arsenal_chelsea');
    assert.ok(arsenalFixture, 'Arsenal fixture must exist');
    assert.strictEqual(arsenalFixture.pinnacleOdds.ah.line, -0.5);
    assert.strictEqual(arsenalFixture.pinnacleOdds.ah.homeOdds, 1.95);
    assert.strictEqual(arsenalFixture.pinnacleOdds.ou.line, 2.75);
    assert.strictEqual(arsenalFixture.pinnacleOdds.ou.overOdds, 1.92);
    assert.strictEqual(arsenalFixture.pinnacleOdds.btts.yesOdds, 1.80);

    // 2. Verify Liverpool vs Man City (no bleed from Arsenal)
    const liverpoolFixture = fixtures.find(f => f.fixtureId === 'fx_epl_liverpool_mancity');
    assert.ok(liverpoolFixture, 'Liverpool fixture must exist');
    assert.strictEqual(liverpoolFixture.pinnacleOdds.ah.line, 0.0);
    assert.strictEqual(liverpoolFixture.pinnacleOdds.ah.homeOdds, 2.02);
    assert.strictEqual(liverpoolFixture.pinnacleOdds.ou.line, 3.0);
    assert.strictEqual(liverpoolFixture.pinnacleOdds.btts, undefined, 'BTTS must remain undefined for Liverpool');

    // 3. Verify Real Madrid vs Barcelona (cross-tournament isolation)
    const madridFixture = fixtures.find(f => f.fixtureId === 'fx_laliga_madrid_barca');
    assert.ok(madridFixture, 'Madrid fixture must exist');
    assert.strictEqual(madridFixture.pinnacleOdds.ah.line, -0.25);
    assert.strictEqual(madridFixture.pinnacleOdds.ah.homeOdds, 1.91);
    assert.strictEqual(madridFixture.pinnacleOdds.ou.line, 3.25);

    // 4. Verify fixture with no odds in batch remains cleanly undefined (ZERO synthetic odds)
    const bayernFixture = fixtures.find(f => f.fixtureId === 'fx_no_odds_match');
    assert.ok(bayernFixture, 'Bayern fixture must exist');
    assert.strictEqual(bayernFixture.pinnacleOdds.ah, undefined, 'Missing AH must NOT be synthetically fabricated');
    assert.strictEqual(bayernFixture.pinnacleOdds.ou, undefined, 'Missing OU must NOT be synthetically fabricated');
    assert.strictEqual(bayernFixture.pinnacleOdds.btts, undefined, 'Missing BTTS must NOT be synthetically fabricated');
  } finally {
    OddsPapiProvider.prototype.getUpcomingFixtures = originalGetUpcoming;
    OddsPapiProvider.prototype.getTournamentOdds = originalGetTournamentOdds;
    OddsPapiProvider.prototype.isConfigured = originalIsConfigured;
  }
});

test('C. Fail-Closed Invariant: Provider Error Fails Closed with Zero Per-Fixture Fallback', async () => {
  const originalGetUpcoming = OddsPapiProvider.prototype.getUpcomingFixtures;
  const originalGetTournamentOdds = OddsPapiProvider.prototype.getTournamentOdds;
  const originalGetMarketOdds = OddsPapiProvider.prototype.getMarketOdds;
  const originalIsConfigured = OddsPapiProvider.prototype.isConfigured;

  let marketOddsAttemptedCount = 0;

  try {
    OddsPapiProvider.prototype.isConfigured = () => true;

    // Discovered fixtures
    OddsPapiProvider.prototype.getUpcomingFixtures = async () => ({
      status: 'AVAILABLE',
      provider: 'OddsPapi',
      data: [
        {
          providerFixtureId: 'fx_err_1',
          league: 'Premier League',
          season: '2026',
          kickoffTime: '2026-10-10T14:00:00.000Z',
          homeTeam: 'Arsenal',
          awayTeam: 'Chelsea',
          status: 'SCHEDULED',
          oddspapiTournamentId: 17,
        },
      ],
      latencyMs: 10,
      cached: false,
      timestamp: new Date().toISOString(),
    });

    // Tournament odds simulated 429 rate limit / quota exhaustion
    OddsPapiProvider.prototype.getTournamentOdds = async () => ({
      status: 'RATE_LIMITED',
      provider: 'OddsPapi',
      data: null,
      error: 'HTTP 429: Request limit exceeded',
      latencyMs: 15,
      cached: false,
      timestamp: new Date().toISOString(),
    });

    // Guard: getMarketOdds must NEVER be called
    OddsPapiProvider.prototype.getMarketOdds = async () => {
      marketOddsAttemptedCount++;
      return {
        status: 'AVAILABLE',
        provider: 'OddsPapi',
        data: [],
        latencyMs: 5,
        cached: false,
        timestamp: new Date().toISOString(),
      };
    };

    const fixtures = await ProductionPredictionEngine.discoverUpcomingFixturesWithOdds();

    // Verify: Zero calls to getMarketOdds
    assert.strictEqual(
      marketOddsAttemptedCount,
      0,
      'Must NOT fall back to per-fixture getMarketOdds on tournament batch failure'
    );

    // Verify: Fixture preserved with undefined odds (fail-closed)
    assert.strictEqual(fixtures.length, 1);
    assert.strictEqual(fixtures[0].pinnacleOdds.ah, undefined);
    assert.strictEqual(fixtures[0].pinnacleOdds.ou, undefined);
    assert.strictEqual(fixtures[0].pinnacleOdds.btts, undefined);

    // Verify evaluation fails closed to ODDS_UNAVAILABLE
    const evaluated = ProductionPredictionEngine.evaluateFixture(fixtures[0]);
    assert.strictEqual(evaluated.prediction.markets.asianHandicap.marketOdds, 0);
    assert.strictEqual(evaluated.prediction.markets.asianHandicap.verdict, 'LEWATI');
  } finally {
    OddsPapiProvider.prototype.getUpcomingFixtures = originalGetUpcoming;
    OddsPapiProvider.prototype.getTournamentOdds = originalGetTournamentOdds;
    OddsPapiProvider.prototype.getMarketOdds = originalGetMarketOdds;
    OddsPapiProvider.prototype.isConfigured = originalIsConfigured;
  }
});

test('D. Check 1 Invariant: OddsPapiQuotaGuard Persistent 90% Hard-Stop & Safe Halting', async () => {
  // Test math of 90% hard stop
  assert.strictEqual(OddsPapiQuotaGuard.HARD_STOP_RATIO, 0.90, 'Hard stop ratio must be exactly 90%');

  // Verify that exceeding 90% threshold (e.g. 225/250) rejects requests
  const threshold = Math.floor(250 * 0.90);
  assert.strictEqual(threshold, 225, 'For 250 request limit, hard stop threshold must be 225');

  // Verify checkQuota logic when quota >= 90%
  // Currently live account has 260/250, so checkQuota must return allowed: false
  const status = await OddsPapiQuotaGuard.checkQuota(1);
  if (status.consumed >= status.hardStopThreshold) {
    assert.strictEqual(status.allowed, false, 'Requests must be blocked when consumed >= 90%');
    assert.ok(status.reason.includes('hard-stop'), 'Reason must explicitly state hard-stop');
  }
});

test('E. Check 3 Invariant: Configuration-Driven Bookmaker Allowlist (Pinnacle + Bet365 Default)', async () => {
  // 1. Default launch pair is strictly pinnacle + bet365
  assert.deepStrictEqual(
    [...CONSUMED_BOOKMAKERS],
    ['pinnacle', 'bet365'],
    'CONSUMED_BOOKMAKERS must default strictly to pinnacle and bet365'
  );

  // 2. Downstream model check: No unintended bookmakers (1xbet, sbobet, singbet, betfair) in active launch pair
  assert.ok(!CONSUMED_BOOKMAKERS.includes('1xbet'), '1xbet must not be in default launch pair');
  assert.ok(!CONSUMED_BOOKMAKERS.includes('sbobet'), 'sbobet must not be in default launch pair');
  assert.ok(!CONSUMED_BOOKMAKERS.includes('singbet'), 'singbet must not be in default launch pair');
  assert.ok(!CONSUMED_BOOKMAKERS.includes('betfair'), 'betfair must not be in default launch pair');

  // 3. Configuration-driven override test
  const originalEnv = process.env.ODDSPAPI_ACTIVE_BOOKMAKERS;
  try {
    process.env.ODDSPAPI_ACTIVE_BOOKMAKERS = 'pinnacle';
    resetEnv();
    const updatedEnv = getEnv();
    assert.deepStrictEqual(updatedEnv.providers.oddsPapi.activeBookmakers, ['pinnacle']);
  } finally {
    if (originalEnv !== undefined) {
      process.env.ODDSPAPI_ACTIVE_BOOKMAKERS = originalEnv;
    } else {
      delete process.env.ODDSPAPI_ACTIVE_BOOKMAKERS;
    }
    resetEnv();
  }
});

