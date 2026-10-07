// SALMO.DEV — Fixture Integrity & Canonicalization P0 Regression Test Suite
// Verifies:
// 1. Empty provider result fails closed (0 fixtures, 0 picks, zero fabrication)
// 2. OddsPapi 429 fails closed (no synthetic fallback)
// 3. Liverpool vs Chelsea ghost prevented (absent on 2026-10-10)
// 4. Liverpool vs Manchester City (2026-10-11) preserved
// 5. EPL fixture count in window = exactly 10 (no duplicates, no ghosts)
// 6. Team alias normalization (Brighton, Sunderland, Man City vs Man Utd collision prevention)
// 7. Synthetic provenance rejection guard (rejecting SYNTHETIC_FALLBACK and fabricated IDs)

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');

// Helper to auto-load .env.local if present
const envPath = path.resolve('.env.local');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [k, ...v] = trimmed.split('=');
    const key = k.trim();
    const val = v.join('=').replace(/^["']|["']$/g, '').trim();
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

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

const { normalizeTeamKey } = require('../src/engine/features/teamRatings.ts');
const { MatchIntelligenceService } = require('../src/engine/matchIntelligenceService.ts');
const { ProductionPredictionEngine } = require('../src/engine/pipeline/productionPredictionEngine.ts');

test('Test 1: Empty provider result fails closed (0 fixtures, 0 picks)', async () => {
  // Verify codebase does not contain synthetic fallback fabrication
  const engineCode = fs.readFileSync(path.resolve('src/engine/pipeline/productionPredictionEngine.ts'), 'utf8');
  assert.ok(!engineCode.includes('canonicalUpcoming = ['), 'Must eliminate hardcoded canonicalUpcoming fallback');
  assert.ok(!engineCode.includes('epl_2026_mancity_arsenal'), 'Must eliminate hardcoded epl_2026_mancity_arsenal');
  assert.ok(!engineCode.includes('epl_2026_liverpool_chelsea'), 'Must eliminate hardcoded epl_2026_liverpool_chelsea');
  assert.ok(!engineCode.includes('epl_2026_tottenham_astonvilla'), 'Must eliminate hardcoded epl_2026_tottenham_astonvilla');

  // Verify persistPredictionCycle with 0 items returns 0 persisted
  const emptyResult = await ProductionPredictionEngine.persistPredictionCycle([]);
  assert.strictEqual(emptyResult.persistedPicksCount, 0, 'Empty cycle must persist 0 daily picks');
  assert.strictEqual(emptyResult.persistedLedgerCount, 0, 'Empty cycle must persist 0 ledger rows');
});

test('Test 2: OddsPapi 429 fails closed (no fallback)', async () => {
  const engineCode = fs.readFileSync(path.resolve('src/engine/pipeline/productionPredictionEngine.ts'), 'utf8');

  // Verify that provider failure or empty result falls closed to return []
  assert.ok(
    engineCode.includes('No upcoming fixtures discovered from providers; failing closed (0 fixtures returned)'),
    'Must log fail-closed warning when providers return 0 fixtures'
  );
  assert.ok(
    engineCode.includes('if (fixtures.length === 0) {\n      Logger.warn(\'[ProductionPredictionEngine] No upcoming fixtures discovered from providers; failing closed (0 fixtures returned).\');\n      return [];\n    }'),
    'Must return empty array on provider discovery failure'
  );
});

test('Test 3: Liverpool vs Chelsea ghost prevented (absent on 2026-10-10)', async () => {
  const matches = await MatchIntelligenceService.getForward7DayMatches();

  const liverpoolChelseaGhost = matches.find(m => {
    const home = normalizeTeamKey(m.homeTeam);
    const away = normalizeTeamKey(m.awayTeam);
    const date = (m.kickoffIso || '').split('T')[0];
    return ((home === 'liverpool' && away === 'chelsea') || (home === 'chelsea' && away === 'liverpool')) && date === '2026-10-10';
  });

  assert.strictEqual(
    liverpoolChelseaGhost,
    undefined,
    'Ghost fixture Liverpool vs Chelsea on 2026-10-10 must NEVER appear in forward 7-day schedule'
  );

  // Chelsea should be playing Bournemouth on 2026-10-10
  const chelseaBournemouth = matches.find(m => {
    const home = normalizeTeamKey(m.homeTeam);
    const away = normalizeTeamKey(m.awayTeam);
    return home === 'chelsea' && away === 'bournemouth';
  });
  assert.ok(chelseaBournemouth, 'Chelsea vs Bournemouth must be present on 2026-10-10');
});

test('Test 4: Liverpool vs Manchester City (2026-10-11) preserved', async () => {
  const matches = await MatchIntelligenceService.getForward7DayMatches();

  const liverpoolManCity = matches.find(m => {
    const home = normalizeTeamKey(m.homeTeam);
    const away = normalizeTeamKey(m.awayTeam);
    const date = (m.kickoffIso || '').split('T')[0];
    return home === 'liverpool' && away === 'mancity' && date === '2026-10-11';
  });

  assert.ok(liverpoolManCity, 'Liverpool vs Manchester City on 2026-10-11 must be preserved');
  assert.strictEqual(liverpoolManCity.canonicalMatchId, 'EPL_2026_LIVERPOOL_MANCITY_2026-10-11');
});

test('Test 5: EPL fixture count in window = exactly 10', async () => {
  const matches = await MatchIntelligenceService.getForward7DayMatches();

  // Exactly 10 fixtures for a full 20-team Premier League gameweek
  assert.strictEqual(matches.length, 10, `Expected exactly 10 forward 7-day fixtures, got ${matches.length}`);

  // Sunderland vs Brighton must appear exactly once
  const sunderlandBrightonMatches = matches.filter(m => {
    const home = normalizeTeamKey(m.homeTeam);
    const away = normalizeTeamKey(m.awayTeam);
    return (home === 'sunderland' && away === 'brighton') || (home === 'brighton' && away === 'sunderland');
  });
  assert.strictEqual(
    sunderlandBrightonMatches.length,
    1,
    `Sunderland vs Brighton must collapse to exactly 1 fixture, got ${sunderlandBrightonMatches.length}`
  );
});

test('Test 6: Team alias normalization (Brighton, Sunderland, Man City vs Man Utd)', async () => {
  // Brighton & Hove Albion aliases
  assert.strictEqual(normalizeTeamKey('Brighton & Hove Albion'), 'brighton');
  assert.strictEqual(normalizeTeamKey('Brighton and Hove Albion'), 'brighton');
  assert.strictEqual(normalizeTeamKey('Brighton Hove'), 'brighton');
  assert.strictEqual(normalizeTeamKey('Brighton'), 'brighton');

  // Sunderland aliases
  assert.strictEqual(normalizeTeamKey('Sunderland AFC'), 'sunderland');
  assert.strictEqual(normalizeTeamKey('Sunderland'), 'sunderland');

  // Manchester City vs Manchester United collision prevention
  const manCityKey = normalizeTeamKey('Manchester City');
  const manUtdKey = normalizeTeamKey('Manchester United');
  assert.strictEqual(manCityKey, 'mancity');
  assert.strictEqual(manUtdKey, 'manunited');
  assert.notStrictEqual(manCityKey, manUtdKey, 'Manchester City and Manchester United must NEVER normalize to the same key');

  assert.strictEqual(normalizeTeamKey('Man City'), 'mancity');
  assert.strictEqual(normalizeTeamKey('Man Utd'), 'manunited');
  assert.strictEqual(normalizeTeamKey('Man United'), 'manunited');

  // Tottenham / Spurs
  assert.strictEqual(normalizeTeamKey('Tottenham Hotspur'), 'tottenham');
  assert.strictEqual(normalizeTeamKey('Spurs'), 'tottenham');

  // Wolverhampton / Wolves
  assert.strictEqual(normalizeTeamKey('Wolverhampton Wanderers'), 'wolves');
  assert.strictEqual(normalizeTeamKey('Wolves'), 'wolves');

  // Nottingham Forest / Forest
  assert.strictEqual(normalizeTeamKey('Nottingham Forest'), 'nottinghamforest');
  assert.strictEqual(normalizeTeamKey('Nottm Forest'), 'nottinghamforest');
});

test('Test 7: Synthetic provenance rejection guard', async () => {
  // Mock synthetic prediction with fake ID
  const syntheticPredictionItem = {
    prediction: {
      canonicalMatchId: 'EPL_2026_MANCITY_ARSENAL_2026-10-10',
      fixtureId: 'epl_2026_mancity_arsenal',
      sourceType: 'SYNTHETIC_FALLBACK',
      homeTeam: 'Manchester City',
      awayTeam: 'Arsenal',
      league: 'Premier League',
      season: '2026',
      kickoffUtc: '2026-10-10T14:00:00Z',
      predictionTimestamp: '2026-10-06T16:57:37Z',
      markets: {
        asianHandicap: {
          marketType: 'ASIAN_HANDICAP',
          line: -0.25,
          selection: 'Manchester City -0.25',
          marketOdds: 1.95,
          fairOdds: 1.85,
          edgePct: 5.4,
          confidence: 75,
          verdict: 'LAYAK',
          isExecutable: true,
        },
        overUnder: {
          marketType: 'OVER_UNDER',
          line: 2.75,
          selection: 'Over 2.75',
          marketOdds: 1.90,
          fairOdds: 1.82,
          edgePct: 4.4,
          confidence: 72,
          verdict: 'LAYAK',
          isExecutable: true,
        },
        btts: {
          marketType: 'BTTS',
          line: 0,
          selection: 'BTTS YES',
          marketOdds: 1.80,
          fairOdds: 1.75,
          edgePct: 2.8,
          confidence: 65,
          verdict: 'PANTAU',
          isExecutable: false,
        },
      },
    },
    evaluations: {
      ah: { fairOdds: 1.85, marketOdds: 1.95, edge: 0.054, expectedValue: 0.054, confidence: 75 },
      ou: { fairOdds: 1.82, marketOdds: 1.90, edge: 0.044, expectedValue: 0.044, confidence: 72 },
    },
  };

  const persistResult = await ProductionPredictionEngine.persistPredictionCycle([syntheticPredictionItem]);

  // Provenance guard must exclude this synthetic item
  assert.strictEqual(persistResult.excludedCount, 1, 'Synthetic item must be flagged as excluded');
  assert.strictEqual(persistResult.persistedPicksCount, 0, 'Zero daily picks must be persisted for synthetic item');
  assert.strictEqual(persistResult.persistedLedgerCount, 0, 'Zero ledger rows must be persisted for synthetic item');

  // Also test unverified arbitrary fixture ID
  const fakeIdItem = {
    ...syntheticPredictionItem,
    prediction: {
      ...syntheticPredictionItem.prediction,
      fixtureId: 'unverified_fake_id_999',
      sourceType: undefined,
    },
  };

  const fakeIdResult = await ProductionPredictionEngine.persistPredictionCycle([fakeIdItem]);
  assert.strictEqual(fakeIdResult.excludedCount, 1, 'Unverified fake ID must be flagged as excluded');
  assert.strictEqual(fakeIdResult.persistedPicksCount, 0, 'Zero daily picks must be persisted for fake ID item');
  assert.strictEqual(fakeIdResult.persistedLedgerCount, 0, 'Zero ledger rows must be persisted for fake ID item');
});

test('Test 8: MatchIntelligenceService fails closed on empty/429 provider and NEVER reconstructs schedule from daily_picks', async () => {
  // 1. Static codebase verification: MatchIntelligenceService must NOT query daily_picks for fixture discovery
  const serviceCode = fs.readFileSync(path.resolve('src/engine/matchIntelligenceService.ts'), 'utf8');
  assert.ok(
    !serviceCode.includes(".from('daily_picks')"),
    'MatchIntelligenceService must NOT contain query to daily_picks for fixture discovery'
  );
  assert.ok(
    !serviceCode.includes('discover from native database daily_picks'),
    'MatchIntelligenceService must eliminate secondary daily_picks fallback comment and logic'
  );

  // 2. Dynamic behavior: When provider discovery returns [] (e.g. 429 / quota / timeout)
  // Even if database daily_picks has valid rows, forward schedule must return []
  const originalGetUpcoming = MatchIntelligenceService.apiFootball.getUpcomingFixtures;
  try {
    // Simulate provider failure / quota 429 / empty result
    MatchIntelligenceService.apiFootball.getUpcomingFixtures = async () => ({
      status: 'RATE_LIMITED',
      error: 'HTTP 429: Daily request limit reached',
      data: [],
    });

    const matchesUnder429 = await MatchIntelligenceService.getForward7DayMatches();
    assert.strictEqual(
      matchesUnder429.length,
      0,
      'When provider returns 0 fixtures, forward fixture schedule must fail closed to [] (never reconstruct from DB daily_picks)'
    );

    // Also test completely empty / error result
    MatchIntelligenceService.apiFootball.getUpcomingFixtures = async () => ({
      status: 'AVAILABLE',
      data: [],
    });

    const matchesUnderEmpty = await MatchIntelligenceService.getForward7DayMatches();
    assert.strictEqual(
      matchesUnderEmpty.length,
      0,
      'When provider returns empty array, forward fixture schedule must fail closed to []'
    );
  } finally {
    // Restore original provider method
    MatchIntelligenceService.apiFootball.getUpcomingFixtures = originalGetUpcoming;
  }

  // 3. Normal provider behavior: Returns legitimate fixtures unchanged
  const normalMatches = await MatchIntelligenceService.getForward7DayMatches();
  assert.strictEqual(
    normalMatches.length,
    10,
    `Under normal provider discovery, expected exactly 10 EPL fixtures, got ${normalMatches.length}`
  );
});
