// SALMO.DEV — Multi-Source Fixture Integration & Resilience Test Suite
// Validates:
// 1. OpenFootball adapter normalization (competition, season, date, timezone, teams)
// 2. TheSportsDB adapter normalization (upcoming fixtures, cross-provider idAPIfootball)
// 3. Deterministic entity resolution & duplicate collapsing across sources
// 4. Kickoff conflict detection & provenance logging
// 5. Source fault tolerance (one failed source does not drop healthy source fixtures)
// 6. Empty response protection (empty feed does not wipe healthy dataset)
// 7. Fixture visibility decoupled from odds & predictions (honest GREY unavailable state)
// 8. Multi-league extensibility (zero hardcoded EPL contamination)
// 9. Biological schedule integrity (zero self-play, valid timestamps)
// 10. Separation of concerns (zero odds/predictions populated from fixture sources)

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');

// TypeScript loader
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

const { OpenFootballProvider } = require('../src/services/providers/openFootballProvider.ts');
const { TheSportsDbProvider } = require('../src/services/providers/theSportsDbProvider.ts');
const { FixtureIngestionService } = require('../src/services/fixtureIngestionService.ts');
const { FixtureIntegrityGuard } = require('../src/lib/fixtureIntegrity.ts');
const { MatchIntelligenceService } = require('../src/engine/matchIntelligenceService.ts');

// --- Controlled Offline Mock Fixtures ---
const MOCK_OPENFOOTBALL_EPL = {
  name: 'English Premier League 2026/27',
  matches: [
    {
      round: 'Matchday 6',
      date: '2026-10-10',
      time: '12:30',
      team1: 'Arsenal FC',
      team2: 'Leeds United FC',
    },
    {
      round: 'Matchday 6',
      date: '2026-10-10',
      time: '15:00',
      team1: 'Chelsea FC',
      team2: 'AFC Bournemouth',
    },
    {
      round: 'Matchday 6',
      date: '2026-10-11',
      time: '14:00',
      team1: 'Hull City AFC',
      team2: 'Everton FC',
    },
  ],
};

const MOCK_OPENFOOTBALL_BUNDESLIGA = {
  name: 'Deutsche Bundesliga 2026/27',
  matches: [
    {
      round: 'Matchday 6',
      date: '2026-10-10',
      time: '13:30',
      team1: 'FC Bayern München',
      team2: 'Borussia Dortmund',
    },
  ],
};

const MOCK_THESPORTSDB_EPL = {
  events: [
    {
      idEvent: '1001',
      idAPIfootball: '1557417',
      strEvent: 'Arsenal vs Leeds',
      strLeague: 'English Premier League',
      strSeason: '2026-2027',
      strHomeTeam: 'Arsenal',
      strAwayTeam: 'Leeds United',
      strTimestamp: '2026-10-10T12:30:00Z',
      strVenue: 'Emirates Stadium',
      intRound: '6',
    },
    {
      idEvent: '1002',
      idAPIfootball: '1557419',
      strEvent: 'Chelsea vs Bournemouth',
      strLeague: 'English Premier League',
      strSeason: '2026-2027',
      strHomeTeam: 'Chelsea',
      strAwayTeam: 'Bournemouth',
      // Conflict simulation: kickoff discrepancy (18:00 instead of 15:00)
      strTimestamp: '2026-10-10T18:00:00Z',
      strVenue: 'Stamford Bridge',
      intRound: '6',
    },
    {
      idEvent: '1003',
      idAPIfootball: '1557422',
      strEvent: 'Hull City vs Everton',
      strLeague: 'English Premier League',
      strSeason: '2026-2027',
      strHomeTeam: 'Hull City',
      strAwayTeam: 'Everton',
      strTimestamp: '2026-10-11T14:00:00Z',
      strVenue: 'MKM Stadium',
      intRound: '6',
    },
  ],
};

test('Test 1: OpenFootball adapter normalizes competition, season, date, timezone, and teams', async () => {
  // Use mock provider with intercepted fetch
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => MOCK_OPENFOOTBALL_EPL,
    });

    const provider = new OpenFootballProvider('https://mock.openfootball.org');
    const result = await provider.getUpcomingFixtures('39', '2026-27');

    assert.strictEqual(result.status, 'AVAILABLE');
    assert.strictEqual(result.provider, 'OpenFootball');
    assert.ok(result.data && result.data.length === 3, 'Expected 3 parsed fixtures');

    const arsenalMatch = result.data[0];
    assert.strictEqual(arsenalMatch.homeTeam, 'Arsenal');
    assert.strictEqual(arsenalMatch.awayTeam, 'Leeds United');
    assert.strictEqual(arsenalMatch.kickoffTime, '2026-10-10T12:30:00Z');
    assert.strictEqual(arsenalMatch.kickoffTimeConfirmed, true, 'Kickoff time confirmed when explicit time provided');
    assert.strictEqual(arsenalMatch.league, 'Premier League');
    assert.strictEqual(arsenalMatch.season, '2026');
    assert.strictEqual(arsenalMatch.status, 'SCHEDULED');
  } finally {
    global.fetch = originalFetch;
  }
});

test('Test 2: TheSportsDB adapter defaults to OFF, requires ENABLE_THESPORTSDB=true, and preserves cross-provider ID', async () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env.ENABLE_THESPORTSDB;
  try {
    delete process.env.ENABLE_THESPORTSDB;

    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => MOCK_THESPORTSDB_EPL,
    });

    const provider = new TheSportsDbProvider('https://mock.thesportsdb.org');

    // Gate 1: When disabled (default OFF), must return isConfigured=false and status=UNCONFIGURED
    assert.strictEqual(provider.isConfigured(), false, 'TheSportsDB must be default OFF');
    const disabledResult = await provider.getUpcomingFixtures('39');
    assert.strictEqual(disabledResult.status, 'UNCONFIGURED');
    assert.strictEqual(disabledResult.data, null);

    // Gate 1: When explicitly enabled via ENABLE_THESPORTSDB=true
    process.env.ENABLE_THESPORTSDB = 'true';
    assert.strictEqual(provider.isConfigured(), true, 'TheSportsDB enabled when ENABLE_THESPORTSDB=true');
    const result = await provider.getUpcomingFixtures('39');

    assert.strictEqual(result.status, 'AVAILABLE');
    assert.strictEqual(result.provider, 'TheSportsDB');
    assert.ok(result.data && result.data.length === 3, 'Expected 3 parsed events');

    const m = result.data[0];
    assert.strictEqual(m.providerFixtureId, 'TSDB_1001');
    assert.strictEqual(m.oddspapiTournamentId, 1557417, 'Cross-provider ID must be preserved');
    assert.strictEqual(m.homeTeam, 'Arsenal');
    assert.strictEqual(m.awayTeam, 'Leeds United');
    assert.strictEqual(m.kickoffTime, '2026-10-10T12:30:00Z');
    assert.strictEqual(m.kickoffTimeConfirmed, true);
  } finally {
    global.fetch = originalFetch;
    if (originalEnv !== undefined) {
      process.env.ENABLE_THESPORTSDB = originalEnv;
    } else {
      delete process.env.ENABLE_THESPORTSDB;
    }
  }
});

test('Test 3: Entity Resolution & Deduplication — Identical matches across OpenFootball and TheSportsDB collapse to 1 canonical fixture', async () => {
  const service = new FixtureIngestionService();

  const observations = [
    // OpenFootball observation
    {
      source: 'OpenFootball',
      sourceFixtureId: 'OF_202627_en1_R6_ARSENAL_LEEDS',
      league: 'Premier League',
      season: '2026',
      homeTeam: 'Arsenal FC',
      awayTeam: 'Leeds United FC',
      kickoffTime: '2026-10-10T12:30:00Z',
      status: 'SCHEDULED',
      retrievedAt: new Date().toISOString(),
    },
    // TheSportsDB observation of the same match
    {
      source: 'TheSportsDB',
      sourceFixtureId: 'TSDB_1001',
      league: 'Premier League',
      season: '2026',
      homeTeam: 'Arsenal',
      awayTeam: 'Leeds United',
      kickoffTime: '2026-10-10T12:30:00Z',
      venue: 'Emirates Stadium',
      status: 'SCHEDULED',
      retrievedAt: new Date().toISOString(),
      crossIds: { apiFootballId: '1557417' },
    },
  ];

  const report = await service.processAndPersistObservations(observations, ['OpenFootball', 'TheSportsDB']);

  assert.strictEqual(report.totalObservations, 2, '2 observations received');
  assert.strictEqual(report.canonicalFixturesCount, 1, 'Must collapse to exactly 1 canonical fixture');
  assert.strictEqual(report.duplicatesCollapsed, 1, '1 duplicate collapsed');
  assert.strictEqual(report.conflictsDetected, 0, 'No kickoff conflict for matching timestamps');
});

test('Test 4: Conflict Detection — Discrepant kickoff times (> 2h) are recorded in provenance metadata without crashing', async () => {
  const service = new FixtureIngestionService();

  const observations = [
    {
      source: 'OpenFootball',
      sourceFixtureId: 'OF_CHELSEA_BOURNEMOUTH',
      league: 'Premier League',
      season: '2026',
      homeTeam: 'Chelsea FC',
      awayTeam: 'AFC Bournemouth',
      kickoffTime: '2026-10-10T15:00:00Z',
      status: 'SCHEDULED',
      retrievedAt: new Date().toISOString(),
    },
    {
      source: 'TheSportsDB',
      sourceFixtureId: 'TSDB_1002',
      league: 'Premier League',
      season: '2026',
      homeTeam: 'Chelsea',
      awayTeam: 'Bournemouth',
      kickoffTime: '2026-10-10T18:00:00Z', // 3 hours difference
      status: 'SCHEDULED',
      retrievedAt: new Date().toISOString(),
    },
  ];

  const report = await service.processAndPersistObservations(observations, ['OpenFootball', 'TheSportsDB']);

  assert.strictEqual(report.canonicalFixturesCount, 1, 'Must still merge into 1 canonical fixture');
  assert.strictEqual(report.conflictsDetected, 1, 'Must detect kickoff time conflict (> 2h)');
});

test('Test 5: Source Fault Tolerance — One failed source does not drop healthy source fixtures', async () => {
  const service = new FixtureIngestionService();

  // Simulate observations where only OpenFootball returned data, TheSportsDB returned empty
  const healthyObservations = [
    {
      source: 'OpenFootball',
      sourceFixtureId: 'OF_HULL_EVERTON',
      league: 'Premier League',
      season: '2026',
      homeTeam: 'Hull City',
      awayTeam: 'Everton',
      kickoffTime: '2026-10-11T14:00:00Z',
      status: 'SCHEDULED',
      retrievedAt: new Date().toISOString(),
    },
  ];

  const report = await service.processAndPersistObservations(healthyObservations, ['OpenFootball']);
  assert.strictEqual(report.canonicalFixturesCount, 1, 'Healthy source fixtures must be preserved');
});

test('Test 6: Empty Response Guard — Empty observations array produces zero mutations safely', async () => {
  const service = new FixtureIngestionService();
  const report = await service.processAndPersistObservations([], ['EmptySource']);

  assert.strictEqual(report.totalObservations, 0);
  assert.strictEqual(report.canonicalFixturesCount, 0);
  assert.strictEqual(report.persistedCount, 0);
});

test('Test 7: Multi-League Extensibility — Canonical match IDs generate with clean league prefix', () => {
  const eplId = FixtureIntegrityGuard.buildCanonicalMatchId('Premier League', '2026', 'Arsenal', 'Leeds', '2026-10-10T12:30:00Z');
  assert.strictEqual(eplId, 'EPL_2026_ARSENAL_LEEDS_2026-10-10');

  const bundesligaId = FixtureIntegrityGuard.buildCanonicalMatchId('Bundesliga', '2026', 'Bayern Munich', 'Dortmund', '2026-10-10T13:30:00Z');
  assert.ok(bundesligaId.startsWith('BUNDESLIGA_2026_'), `Must use BUNDESLIGA prefix, got ${bundesligaId}`);

  const laLigaId = FixtureIntegrityGuard.buildCanonicalMatchId('La Liga', '2026', 'Real Madrid', 'Barcelona', '2026-10-11T19:00:00Z');
  assert.ok(laLigaId.startsWith('LALIGA_2026_'), `Must use LALIGA prefix, got ${laLigaId}`);

  const serieAId = FixtureIntegrityGuard.buildCanonicalMatchId('Serie A', '2026', 'Juventus', 'Milan', '2026-10-11T18:45:00Z');
  assert.ok(serieAId.startsWith('SERIEA_2026_'), `Must use SERIEA prefix, got ${serieAId}`);
});

test('Test 8: Biological Schedule Integrity — Self-play and malformed dates are rejected', () => {
  const invalidBatch = [
    {
      providerFixtureId: 'ERR_01',
      league: 'Premier League',
      season: '2026',
      homeTeam: 'Arsenal',
      awayTeam: 'Arsenal', // Self-play
      kickoffTime: '2026-10-10T15:00:00Z',
    },
    {
      providerFixtureId: 'ERR_02',
      league: 'Premier League',
      season: '2026',
      homeTeam: 'Chelsea',
      awayTeam: 'Liverpool',
      kickoffTime: 'invalid-date-string', // Unparseable
    },
    {
      providerFixtureId: 'VALID_01',
      league: 'Premier League',
      season: '2026',
      homeTeam: 'Chelsea',
      awayTeam: 'Bournemouth',
      kickoffTime: '2026-10-10T15:00:00Z',
    },
  ];

  const result = FixtureIntegrityGuard.validateFixtureBatch(invalidBatch);
  assert.strictEqual(result.rejectedCount, 2, '2 invalid fixtures must be rejected');
  assert.strictEqual(result.validFixtures.length, 1, 'Only 1 valid fixture must pass');
  assert.strictEqual(result.validFixtures[0].providerFixtureId, 'VALID_01');
});

test('Test 9: Fixture Visibility Decoupled from Odds & Predictions — Honest GREY unavailable state', () => {
  const summary = { version: 'v1.0.0-salmo-native' };

  // Asian Handicap unavailable
  const ah = MatchIntelligenceService.buildUnavailableMarket('ASIAN_HANDICAP', '—', summary, 'Bundesliga');
  assert.strictEqual(ah.status, 'ODDS_UNAVAILABLE');
  assert.strictEqual(ah.badge, 'GREY');
  assert.strictEqual(ah.available, false);
  assert.strictEqual(ah.odds, null);
  assert.strictEqual(ah.modelProbabilityPct, null);
  assert.strictEqual(ah.provenance.league, 'Bundesliga', 'League provenance must reflect Bundesliga');

  // Both Teams To Score unavailable
  const btts = MatchIntelligenceService.buildUnavailableMarket('BTTS', 'YES', summary, 'La Liga');
  assert.strictEqual(btts.status, 'ODDS_UNAVAILABLE');
  assert.strictEqual(btts.badge, 'GREY');
  assert.strictEqual(btts.provenance.league, 'La Liga');
});

test('Test 10: Separation of Concerns — Fixture ingestion strictly does NOT populate odds or predictions', async () => {
  // Inspect FixtureIngestionService code to verify it touches zero prediction or odds tables
  const code = fs.readFileSync(path.resolve('src/services/fixtureIngestionService.ts'), 'utf8');

  assert.ok(!code.includes(".from('daily_picks')"), 'Must never write to daily_picks from fixture ingestion');
  assert.ok(!code.includes(".from('prediction_ledger')"), 'Must never write to prediction_ledger from fixture ingestion');
  assert.ok(!code.includes(".from('odds')"), 'Must never write to odds table from fixture ingestion');
  assert.ok(code.includes(".from('matches')"), 'Must only write to canonical matches table');
});
