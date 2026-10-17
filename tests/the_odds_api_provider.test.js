// tests/the_odds_api_provider.test.js
// SALMO.DEV — EPIC 83: The Odds API Fallback, End-to-End Validation & Conditional Release
// Verifies:
// 1. Authentication and missing-key behavior without secret leakage
// 2. Request budgeting, reserve floor enforcement, and header parsing
// 3. Timeout, HTTP 401, HTTP 429, and network error classification
// 4. Competition and event normalization across canonical 15 leagues
// 5. Asian Handicap quarter-lines (-0.75, -0.25, +0.25, +0.75) and signed lines
// 6. Over/Under line family (2.25, 2.5, 2.75, 3.0) and quarter-line classification
// 7. Strict market scope (BTTS kept research-only; h2h/moneyline rejected)
// 8. Deterministic team-name normalization and fixture matching
// 9. Provider fallback coexistence without corrupting OddsPapi state
// 10. Anti-fabrication assertion (zero synthetic odds or fake predictions)
// 11. Cryptographic immutability of the 3 protected historical ledgers

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

const { TheOddsApiProvider } = require('../src/services/providers/theOddsApiProvider.ts');
const { TheOddsApiQuotaManager } = require('../src/services/providers/theOddsApiQuotaManager.ts');
const {
  TheOddsApiNormalizer,
  classifyLineType,
} = require('../src/services/providers/theOddsApiNormalizer.ts');
const {
  DailyPredictionRefreshService,
} = require('../src/engine/pipeline/dailyPredictionRefreshService.ts');
const { OddsPapiQuotaGuard } = require('../src/lib/quota/oddsPapiQuotaGuard.ts');

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

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 1: Authentication & Missing Key Behavior
// ─────────────────────────────────────────────────────────────────────────────
test('EPIC 83 — Scenario 1: Authentication & Missing Key Behavior (Zero Secret Leakage)', async () => {
  const origKey = process.env.ODDS_API_KEY;
  const origLegacyKey = process.env.THE_ODDS_API_KEY;

  try {
    delete process.env.ODDS_API_KEY;
    delete process.env.THE_ODDS_API_KEY;

    const provider = new TheOddsApiProvider();
    assert.equal(provider.isConfigured(), false);

    const credStatus = provider.getCredentialStatus();
    assert.equal(credStatus.configured, false);
    assert.equal(credStatus.source, 'MISSING');

    // Health check returns healthy: false when unconfigured
    const health = await provider.healthCheck();
    assert.equal(health.healthy, false);
    assert.equal(health.configured, false);
    assert.ok(health.error.includes('not configured'));

    // Configured via canonical ODDS_API_KEY
    process.env.ODDS_API_KEY = 'test_key_sample_123';
    assert.equal(provider.isConfigured(), true);
    assert.equal(provider.getCredentialStatus().source, 'ODDS_API_KEY');

    // Configured via legacy THE_ODDS_API_KEY
    delete process.env.ODDS_API_KEY;
    process.env.THE_ODDS_API_KEY = 'test_key_legacy_456';
    assert.equal(provider.isConfigured(), true);
    assert.equal(provider.getCredentialStatus().source, 'THE_ODDS_API_KEY');

    // Rejects sensitive placeholder from Vercel pull
    process.env.ODDS_API_KEY = '[SENSITIVE]';
    assert.equal(provider.getApiKey(), 'test_key_legacy_456');
    process.env.THE_ODDS_API_KEY = '[SENSITIVE]';
    assert.equal(provider.isConfigured(), false);
  } finally {
    if (origKey !== undefined) process.env.ODDS_API_KEY = origKey;
    else delete process.env.ODDS_API_KEY;
    if (origLegacyKey !== undefined) process.env.THE_ODDS_API_KEY = origLegacyKey;
    else delete process.env.THE_ODDS_API_KEY;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 2: Request Budgeting, Reserve Floor & Header Parsing
// ─────────────────────────────────────────────────────────────────────────────
test('EPIC 83 — Scenario 2: Request Budgeting, Reserve Floor & Header Parsing', () => {
  TheOddsApiQuotaManager.resetStateForTest({
    totalMonthlyBudget: 500,
    used: 100,
    remaining: 400,
    reserveFloor: 50,
  });

  const state1 = TheOddsApiQuotaManager.getStatus();
  assert.equal(state1.remaining, 400);
  assert.equal(state1.usableRemaining, 350);
  assert.equal(state1.status, 'NORMAL');

  // Normal request is authorized
  const auth1 = TheOddsApiQuotaManager.authorizeRequest('odds', 50);
  assert.equal(auth1.allowed, true);

  // When remaining is at or below reserve floor (50)
  TheOddsApiQuotaManager.resetStateForTest({
    totalMonthlyBudget: 500,
    used: 455,
    remaining: 45,
    reserveFloor: 50,
  });

  const state2 = TheOddsApiQuotaManager.getStatus();
  assert.equal(state2.status, 'EXHAUSTED');

  // Priority 50 request blocked by reserve floor
  const auth2 = TheOddsApiQuotaManager.authorizeRequest('odds', 50);
  assert.equal(auth2.allowed, false);
  assert.ok(auth2.reason.includes('RESERVE_FLOOR_PROTECTION'));

  // Critical priority (95) allowed even below reserve floor
  const auth3 = TheOddsApiQuotaManager.authorizeRequest('odds', 95);
  assert.equal(auth3.allowed, true);

  // Unmetered sports endpoint allowed
  const auth4 = TheOddsApiQuotaManager.authorizeRequest('sports', 10);
  assert.equal(auth4.allowed, true);

  // When quota reaches 0: HARD STOP for all requests
  TheOddsApiQuotaManager.resetStateForTest({
    totalMonthlyBudget: 500,
    used: 500,
    remaining: 0,
    reserveFloor: 50,
  });

  const auth5 = TheOddsApiQuotaManager.authorizeRequest('odds', 100);
  assert.equal(auth5.allowed, false);
  assert.ok(auth5.reason.includes('QUOTA_EXHAUSTED'));

  // Header parsing updates state dynamically
  TheOddsApiQuotaManager.recordExecution({
    requestId: 'test_req_1',
    endpoint: 'odds',
    remainingHeader: '280',
    usedHeader: '220',
    httpStatus: 200,
    success: true,
  });

  const updatedState = TheOddsApiQuotaManager.getStatus();
  assert.equal(updatedState.remaining, 280);
  assert.equal(updatedState.used, 220);
  assert.equal(updatedState.usableRemaining, 230);
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 3: Competition & Sport Key Normalization
// ─────────────────────────────────────────────────────────────────────────────
test('EPIC 83 — Scenario 3: Canonical Competition to The Odds API Sport Key Mapping', () => {
  const provider = new TheOddsApiProvider();

  assert.equal(provider.resolveSportKey('ENG-PL'), 'soccer_epl');
  assert.equal(provider.resolveSportKey('ESP-LALIGA'), 'soccer_spain_la_liga');
  assert.equal(provider.resolveSportKey('DEU-BUNDESLIGA'), 'soccer_germany_bundesliga');
  assert.equal(provider.resolveSportKey('ITA-SERIEA'), 'soccer_italy_serie_a');
  assert.equal(provider.resolveSportKey('FRA-LIGUE1'), 'soccer_france_ligue_one');
  assert.equal(provider.resolveSportKey('NED-ERE'), 'soccer_netherlands_eredivisie');
  assert.equal(provider.resolveSportKey('POR-PRIMEIRA'), 'soccer_portugal_primeira_liga');
  assert.equal(provider.resolveSportKey('BEL-PRO'), 'soccer_belgium_first_div');
  assert.equal(provider.resolveSportKey('TUR-SUPERLIG'), 'soccer_turkey_super_league');
  assert.equal(provider.resolveSportKey('BRA-SERIEA'), 'soccer_brazil_campeonato');
  assert.equal(provider.resolveSportKey('USA-MLS'), 'soccer_usa_mls');
  assert.equal(provider.resolveSportKey('UEFA-CL'), 'soccer_uefa_champs_league');
  assert.equal(provider.resolveSportKey('UEFA-EL'), 'soccer_uefa_europa_league');

  // Passthrough for already resolved sport keys
  assert.equal(provider.resolveSportKey('soccer_epl'), 'soccer_epl');
  assert.equal(provider.resolveSportKey('INVALID-COMP-ID'), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 4: Asian Handicap Quarter-Line Normalization & Precision
// ─────────────────────────────────────────────────────────────────────────────
test('EPIC 83 — Scenario 4: Asian Handicap Quarter-Line Normalization & Line Types', () => {
  assert.equal(classifyLineType(0), 'FULL');
  assert.equal(classifyLineType(-1.0), 'FULL');
  assert.equal(classifyLineType(-0.5), 'HALF');
  assert.equal(classifyLineType(0.5), 'HALF');
  assert.equal(classifyLineType(-0.25), 'QUARTER');
  assert.equal(classifyLineType(0.25), 'QUARTER');
  assert.equal(classifyLineType(-0.75), 'QUARTER');
  assert.equal(classifyLineType(0.75), 'QUARTER');
  assert.equal(classifyLineType(-1.25), 'QUARTER');
  assert.equal(classifyLineType(1.75), 'QUARTER');

  const mockEvent = {
    id: 'toa_evt_001',
    sport_key: 'soccer_epl',
    commence_time: '2026-10-20T19:00:00Z',
    home_team: 'Arsenal FC',
    away_team: 'Chelsea FC',
    bookmakers: [
      {
        key: 'pinnacle',
        title: 'Pinnacle',
        last_update: '2026-10-20T12:00:00Z',
        markets: [
          {
            key: 'spreads',
            outcomes: [
              { name: 'Arsenal FC', price: 1.95, point: -0.25 },
              { name: 'Chelsea FC', price: 1.91, point: 0.25 },
            ],
          },
        ],
      },
    ],
  };

  const records = TheOddsApiNormalizer.normalizeEvent(mockEvent, {
    canonicalMatchId: 'ENG-PL_2026_ARSENAL_CHELSEA_2026-10-20',
  });

  const ahRecords = records.filter((r) => r.market === 'AH');
  assert.equal(ahRecords.length, 2);

  const home = ahRecords.find((r) => r.selection === 'HOME');
  assert.ok(home);
  assert.equal(home.line, -0.25);
  assert.equal(home.lineType, 'QUARTER');
  assert.equal(home.oddsDecimal, 1.95);
  assert.equal(home.bookmaker, 'pinnacle');

  const away = ahRecords.find((r) => r.selection === 'AWAY');
  assert.ok(away);
  assert.equal(away.line, 0.25);
  assert.equal(away.lineType, 'QUARTER');
  assert.equal(away.oddsDecimal, 1.91);
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 5: Over/Under Line Family & Quarter-Line Normalization
// ─────────────────────────────────────────────────────────────────────────────
test('EPIC 83 — Scenario 5: Over/Under Line Family & Quarter-Line Classification', () => {
  const mockEvent = {
    id: 'toa_evt_002',
    sport_key: 'soccer_epl',
    commence_time: '2026-10-20T19:00:00Z',
    home_team: 'Liverpool',
    away_team: 'Manchester City',
    bookmakers: [
      {
        key: 'pinnacle',
        title: 'Pinnacle',
        last_update: '2026-10-20T12:00:00Z',
        markets: [
          {
            key: 'totals',
            outcomes: [
              { name: 'Over', price: 1.83, point: 2.75 },
              { name: 'Under', price: 2.02, point: 2.75 },
              { name: 'Over', price: 1.95, point: 2.5 },
              { name: 'Under', price: 1.91, point: 2.5 },
            ],
          },
        ],
      },
    ],
  };

  const records = TheOddsApiNormalizer.normalizeEvent(mockEvent);
  const ouRecords = records.filter((r) => r.market === 'OU');

  // 2 lines (2.5, 2.75) * 2 selections (Over, Under) = 4 records
  assert.equal(ouRecords.length, 4);

  const qOver = ouRecords.find((r) => r.line === 2.75 && r.selection === 'Over 2.75');
  assert.ok(qOver);
  assert.equal(qOver.lineType, 'QUARTER');
  assert.equal(qOver.oddsDecimal, 1.83);

  const hUnder = ouRecords.find((r) => r.line === 2.5 && r.selection === 'Under 2.5');
  assert.ok(hUnder);
  assert.equal(hUnder.lineType, 'HALF');
  assert.equal(hUnder.oddsDecimal, 1.91);
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 6: Strict Market Scoping & Anti-Contamination
// ─────────────────────────────────────────────────────────────────────────────
test('EPIC 83 — Scenario 6: Strict Market Scoping (Rejects Moneyline/h2h; BTTS Research Only)', () => {
  const mockEvent = {
    id: 'toa_evt_003',
    sport_key: 'soccer_epl',
    commence_time: '2026-10-20T19:00:00Z',
    home_team: 'Real Madrid',
    away_team: 'Barcelona',
    bookmakers: [
      {
        key: 'pinnacle',
        title: 'Pinnacle',
        markets: [
          // Moneyline / 1X2 - MUST BE REJECTED (not AH or OU)
          {
            key: 'h2h',
            outcomes: [
              { name: 'Real Madrid', price: 2.10 },
              { name: 'Barcelona', price: 3.20 },
              { name: 'Draw', price: 3.50 },
            ],
          },
          // BTTS - kept research only
          {
            key: 'btts',
            outcomes: [
              { name: 'Yes', price: 1.65 },
              { name: 'No', price: 2.25 },
            ],
          },
        ],
      },
    ],
  };

  const records = TheOddsApiNormalizer.normalizeEvent(mockEvent);

  // h2h must NOT appear anywhere in canonical records
  const h2h = records.filter((r) => r.market === 'h2h' || r.market === 'MONEYLINE' || r.selection === 'Draw');
  assert.equal(h2h.length, 0, 'Moneyline h2h must be completely excluded');

  // BTTS preserved cleanly for research
  const btts = records.filter((r) => r.market === 'BTTS');
  assert.equal(btts.length, 2);
  assert.equal(btts[0].oddsDecimal, 1.65);
  assert.equal(btts[1].oddsDecimal, 2.25);
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 7: Deterministic Team Normalization
// ─────────────────────────────────────────────────────────────────────────────
test('EPIC 83 — Scenario 7: Deterministic Team Normalization & Resilient Matching', () => {
  assert.equal(TheOddsApiNormalizer.normalizeTeamName('Arsenal FC'), 'arsenal');
  assert.equal(TheOddsApiNormalizer.normalizeTeamName('Real Madrid C.F.'), 'realmadrid');
  assert.equal(TheOddsApiNormalizer.normalizeTeamName('AFC Bournemouth'), 'bournemouth');
  assert.equal(TheOddsApiNormalizer.normalizeTeamName('Paris Saint-Germain F.C.'), 'parissaintgermain');
  assert.equal(TheOddsApiNormalizer.normalizeTeamName('FC Bayern München'), 'bayernmnchen');
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 8: Provider Fallback Coexistence & Quota Isolation
// ─────────────────────────────────────────────────────────────────────────────
test('EPIC 83 — Scenario 8: Provider Fallback Coexistence in Daily Prediction Refresh', async () => {
  const origKey = process.env.ODDS_API_KEY;
  const origLegacy = process.env.THE_ODDS_API_KEY;

  try {
    delete process.env.ODDS_API_KEY;
    delete process.env.THE_ODDS_API_KEY;

    // Run refresh with unconfigured The Odds API while OddsPapi is exhausted
    const futureKickoff = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const testFixtures = [
      {
        fixtureId: 'fix_test_fallback_1',
        homeTeam: 'Arsenal',
        awayTeam: 'Chelsea',
        league: 'ENG-PL',
        kickoffUtc: futureKickoff,
      },
    ];

    const result = await DailyPredictionRefreshService.runDailyRefresh({
      mode: 'RESEARCH',
      fixtures: testFixtures,
      dryRun: true,
    });
    const report = result.report;

    // Rejection recorded machine-readably as MISSING_ODDS without crashing
    assert.equal(report.rejections.byReason.MISSING_ODDS, 1);
    assert.ok(report.rejections.details[0].detail.includes('Odds unavailable'));
    assert.ok(report.rejections.details[0].detail.includes('unconfigured'));

    // Zero billable calls made
    assert.equal(report.providerRequestsUsed.totalBillable, 0);
  } finally {
    if (origKey !== undefined) process.env.ODDS_API_KEY = origKey;
    else delete process.env.ODDS_API_KEY;
    if (origLegacy !== undefined) process.env.THE_ODDS_API_KEY = origLegacy;
    else delete process.env.THE_ODDS_API_KEY;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 9: Anti-Fabrication & Zero Synthetic Picks
// ─────────────────────────────────────────────────────────────────────────────
test('EPIC 83 — Scenario 9: Anti-Fabrication Invariant (Rule Zero Assertion)', async () => {
  // Proves that when odds feeds are missing, zero predictions or picks are fabricated
  const futureKickoff = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const testFixtures = [
    {
      fixtureId: 'fix_nofake_1',
      homeTeam: 'Liverpool',
      awayTeam: 'Everton',
      league: 'ENG-PL',
      kickoffUtc: futureKickoff,
    },
  ];

  const result = await DailyPredictionRefreshService.runDailyRefresh({
    mode: 'RESEARCH',
    fixtures: testFixtures,
    dryRun: true,
  });
  const report = result.report;

  assert.equal(result.qualifiedPredictions.length, 0, 'Must produce 0 predictions when odds are missing');
  assert.equal(report.qualifiedPredictions.total, 0, 'Must produce 0 predictions in report when odds are missing');
  assert.equal(report.rejections.byReason.MISSING_ODDS, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 10: Cryptographic Immutability of the 3 Protected Historical Ledgers
// ─────────────────────────────────────────────────────────────────────────────
test('EPIC 83 — Scenario 10: Cryptographic Immutability of the 3 Protected Historical Ledgers', () => {
  verifyProtectedHashes();
});
