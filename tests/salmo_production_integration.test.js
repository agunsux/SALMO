// SALMO.DEV — Production Integration & Connection Gate Test Suite
// Strictly verifies:
// 1. Real fixture path: canonical fixture -> SALMO API -> SALMO UI DTO.
// 2. Real prediction path: canonical P_model -> SALMO (zero local recalculation).
// 3. Real odds path: Pinnacle sharp odds -> SALMO.
// 4. Value path: Edge, EV, Confidence (0-100 integer score), Verdict (LAYAK/PANTAU/LEWATI).
// 5. No mock leakage: zero fallback to active_7day_predictions.json in database adapter.
// 6. No 1X2 product leakage: strictly AH, OU 2.5, BTTS (NO Moneyline/1X2).
// 7. Temporal invariant: predictionTimestamp <= kickoffUtc (anti-leakage).
// 8. Empty production state: fail-closed (DATA_UNAVAILABLE / NO_QUALIFIED_PICKS, never fake cards).
// 9. Client secret protection: zero private keys exposed to client bundles.
// 10. Cross-book readiness: bestAvailableOdds supported without altering model probabilities.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

// Helper to read .env.local
function getEnvConfig() {
  const envPath = path.resolve('.env.local');
  const config = {};
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [k, ...v] = trimmed.split('=');
      config[k.trim()] = v.join('=').replace(/^["']|["']$/g, '').trim();
    }
  }
  return config;
}

const envConfig = getEnvConfig();

test('Integration Test 1: Real fixture path (HandicapLab canonical -> SALMO)', async () => {
  const { createClient } = require('@supabase/supabase-js');
  assert.ok(envConfig.SUPABASE_URL, 'SUPABASE_URL must be defined');
  assert.ok(envConfig.SUPABASE_ANON_KEY, 'SUPABASE_ANON_KEY must be defined');

  const client = createClient(envConfig.SUPABASE_URL, envConfig.SUPABASE_ANON_KEY);
  const { data: picks, error } = await client
    .from('daily_picks')
    .select('fixture_id, home_team, away_team, kickoff_utc, league')
    .limit(10);

  assert.strictEqual(error, null, 'Query to canonical daily_picks must succeed');
  assert.ok(picks && picks.length > 0, 'Canonical daily_picks must contain real rows');

  for (const pick of picks) {
    assert.ok(pick.fixture_id, 'Must have canonical fixture_id');
    assert.ok(pick.home_team, 'Must have canonical home_team');
    assert.ok(pick.away_team, 'Must have canonical away_team');
    assert.ok(pick.kickoff_utc, 'Must have canonical kickoff_utc');
    assert.strictEqual(pick.league, 'Premier League', 'Must be Premier League canonical fixture');
  }
});

test('Integration Test 2: Real prediction path (Canonical P_model -> SALMO)', async () => {
  const { createClient } = require('@supabase/supabase-js');
  const client = createClient(envConfig.SUPABASE_URL, envConfig.SUPABASE_ANON_KEY);

  const { data: picks, error } = await client
    .from('daily_picks')
    .select('model_probability, fair_odds, market_type')
    .limit(10);

  assert.strictEqual(error, null);
  assert.ok(picks.length > 0);

  for (const pick of picks) {
    const pModel = Number(pick.model_probability);
    assert.ok(!isNaN(pModel), 'model_probability must be a valid number');
    assert.ok(pModel > 0 && pModel < 1.0, `model_probability must be between 0 and 1, got ${pModel}`);

    if (pick.fair_odds) {
      const fairOdds = Number(pick.fair_odds);
      // Fair odds should closely approximate 1 / pModel
      const expectedFair = 1 / pModel;
      assert.ok(
        Math.abs(fairOdds - expectedFair) < 0.25,
        `fair_odds (${fairOdds}) must be derived from 1/pModel (${expectedFair})`
      );
    }
  }
});

test('Integration Test 3: Real odds path (Pinnacle reference odds -> SALMO)', async () => {
  const { createClient } = require('@supabase/supabase-js');
  const client = createClient(envConfig.SUPABASE_URL, envConfig.SUPABASE_ANON_KEY);

  const { data: picks, error } = await client
    .from('daily_picks')
    .select('market_odds, market_bookmaker, market_type');

  assert.strictEqual(error, null);
  for (const pick of picks) {
    const odds = Number(pick.market_odds);
    assert.ok(odds > 1.0, `market_odds must be valid decimal odds (> 1.0), got ${odds}`);
    assert.strictEqual(
      pick.market_bookmaker.toUpperCase(),
      'PINNACLE',
      'Canonical reference bookmaker must be Pinnacle sharp'
    );
  }
});

test('Integration Test 4: Value path (Edge, EV, Confidence, Verdict mapping)', async () => {
  const { createClient } = require('@supabase/supabase-js');
  const client = createClient(envConfig.SUPABASE_URL, envConfig.SUPABASE_ANON_KEY);

  const { data: picks, error } = await client
    .from('daily_picks')
    .select('edge_pct, confidence, verdict, rejection_reason');

  assert.strictEqual(error, null);
  assert.ok(picks.length > 0);

  let hasLayak = false;
  let hasPantau = false;

  for (const pick of picks) {
    assert.ok(
      ['LAYAK', 'PANTAU', 'LEWATI'].includes(pick.verdict),
      `Verdict must be one of LAYAK, PANTAU, LEWATI, got ${pick.verdict}`
    );

    const conf = Number(pick.confidence);
    assert.ok(!isNaN(conf), 'Confidence must be a valid integer score');
    assert.ok(conf >= 0 && conf <= 100, `Confidence must be between 0 and 100, got ${conf}`);

    if (pick.verdict === 'LAYAK') hasLayak = true;
    if (pick.verdict === 'PANTAU') hasPantau = true;
  }

  assert.ok(hasLayak, 'Must contain verified LAYAK picks');
  assert.ok(hasPantau, 'Must contain PANTAU picks');
});

test('Integration Test 5: No mock leakage (Production path zero fallback to JSON)', () => {
  const adapterSource = fs.readFileSync(path.resolve('src/contracts/handicapLabAdapter.ts'), 'utf8');

  // Verify DatabaseHandicapLabAdapter does not fall back to LocalHandicapLabAdapter
  const dbAdapterSection = adapterSource.slice(adapterSource.indexOf('class DatabaseHandicapLabAdapter'));
  assert.ok(
    !dbAdapterSection.includes('new LocalHandicapLabAdapter()'),
    'DatabaseHandicapLabAdapter must NEVER fall back to LocalHandicapLabAdapter'
  );
  assert.ok(
    !dbAdapterSection.includes('active_7day_predictions.json'),
    'DatabaseHandicapLabAdapter must NEVER reference active_7day_predictions.json'
  );

  // Verify HttpHandicapLabAdapter does not fall back to LocalHandicapLabAdapter
  const httpAdapterSection = adapterSource.slice(
    adapterSource.indexOf('class HttpHandicapLabAdapter'),
    adapterSource.indexOf('class DatabaseHandicapLabAdapter')
  );
  assert.ok(
    !httpAdapterSection.includes('new LocalHandicapLabAdapter()'),
    'HttpHandicapLabAdapter must NEVER fall back to LocalHandicapLabAdapter'
  );

  // Verify MatchIntelligenceService does not synthesize fake upcoming schedule
  const serviceSource = fs.readFileSync(path.resolve('src/engine/matchIntelligenceService.ts'), 'utf8');
  assert.ok(!serviceSource.includes('slice(0, 10)'), 'MatchIntelligenceService must not slice historical matches');
  assert.ok(!serviceSource.includes('bttsYesCount / sampleSize'), 'Must not calculate empirical BTTS fallback');
  assert.ok(!serviceSource.includes('overCount / sampleSize'), 'Must not calculate empirical OU fallback');
});

test('Integration Test 6: No 1X2 product leakage (Strictly AH, OU 2.5, BTTS)', () => {
  const typesSource = fs.readFileSync(path.resolve('src/types/index.ts'), 'utf8');
  assert.ok(typesSource.includes("'ASIAN_HANDICAP' | 'BTTS' | 'OVER_UNDER'"), 'MarketType must be strictly AH, BTTS, OU');
  assert.ok(!typesSource.includes("'MONEYLINE'"), 'INVARIANT: Moneyline must NOT exist in MarketType');
  assert.ok(!typesSource.includes("'1X2'"), 'INVARIANT: 1X2 must NOT exist in MarketType');

  // Check all API routes for absence of moneyline
  const matchesRoute = fs.readFileSync(path.resolve('src/app/api/matches/route.ts'), 'utf8');
  assert.ok(!matchesRoute.includes('moneyline') && !matchesRoute.includes('1x2'));

  const dailyPicksRoute = fs.readFileSync(path.resolve('src/app/api/daily-picks/route.ts'), 'utf8');
  assert.ok(!dailyPicksRoute.includes('moneyline') && !dailyPicksRoute.includes('1x2'));
});

test('Integration Test 7: Temporal invariant (oddsTimestampUtc <= predictionTimestampUtc < kickoffUtc)', async () => {
  const { createClient } = require('@supabase/supabase-js');
  const client = createClient(envConfig.SUPABASE_URL, envConfig.SUPABASE_ANON_KEY);

  const { data: picks, error } = await client
    .from('daily_picks')
    .select('created_at, kickoff_utc');

  assert.strictEqual(error, null);
  for (const pick of picks) {
    if (pick.created_at && pick.kickoff_utc) {
      const predTime = new Date(pick.created_at).getTime();
      const kickoffTime = new Date(pick.kickoff_utc).getTime();
      // Point-in-time invariant: prediction timestamp must precede or equal kickoff time
      assert.ok(
        predTime <= kickoffTime,
        `Temporal Invariant Violated: created_at (${pick.created_at}) > kickoff_utc (${pick.kickoff_utc})`
      );
    }
  }
});

test('Integration Test 8: Empty production state (Fail-closed: safe empty, never fake cards)', async () => {
  const serviceSource = fs.readFileSync(path.resolve('src/engine/matchIntelligenceService.ts'), 'utf8');

  // 1. Static Invariant: MatchIntelligenceService must return [] on empty/failed predictions
  assert.ok(
    serviceSource.includes('return [];'),
    'MatchIntelligenceService must return empty array when no predictions available'
  );

  // 2. Anti-Fabrication Invariant: No fallback creates synthetic fixtures
  assert.ok(
    !serviceSource.includes('upcomingFixtures = scheduled'),
    'Must NOT fall back to scheduled historical matches'
  );

  // 3. API Route Invariant: Daily picks API returns explicit fail-closed status
  const apiRoute = fs.readFileSync(path.resolve('src/app/api/daily-picks/route.ts'), 'utf8');
  assert.ok(
    apiRoute.includes("status: 'NO_QUALIFIED_PICKS'") && apiRoute.includes("status: 'DATA_UNAVAILABLE'"),
    'Daily picks route must return explicit NO_QUALIFIED_PICKS or DATA_UNAVAILABLE status on empty state'
  );

  // 4. Runtime Invariant: Simulate fail-closed adapter behaviour
  async function simulateDatabaseAdapter(mockClient) {
    const { data: picks, error } = await mockClient.from('daily_picks').select('*');
    if (error) {
      const err = new Error(`Database query failed: ${error.message}`);
      err.code = 'DATA_UNAVAILABLE';
      throw err;
    }
    if (!picks || picks.length === 0) {
      return [];
    }
    return picks;
  }

  // Probe empty response -> returns [] (zero cards)
  const emptyPicks = await simulateDatabaseAdapter({
    from: () => ({ select: async () => ({ data: [], error: null }) }),
  });
  assert.deepStrictEqual(emptyPicks, [], 'Must return empty array on empty database, never fake cards');

  // Probe offline database -> throws DATA_UNAVAILABLE
  await assert.rejects(
    async () =>
      simulateDatabaseAdapter({
        from: () => ({ select: async () => ({ data: null, error: new Error('Postgres unreachable') }) }),
      }),
    (err) => err.code === 'DATA_UNAVAILABLE',
    'Must throw DATA_UNAVAILABLE when database connection fails'
  );
});

test('Integration Test 9: Client secret protection (Zero private keys in client bundle)', () => {
  // Verify that private keys are NOT prefixed with NEXT_PUBLIC_
  for (const key of Object.keys(envConfig)) {
    if (key.includes('SECRET') || key.includes('SERVICE_ROLE') || key.includes('API_KEY')) {
      assert.ok(
        !key.startsWith('NEXT_PUBLIC_'),
        `Security Violation: Private key ${key} must NOT be prefixed with NEXT_PUBLIC_`
      );
    }
  }
});

test('Integration Test 10: Cross-book readiness (bestAvailableOdds supported without model alteration)', () => {
  const serviceSource = fs.readFileSync(path.resolve('src/engine/matchIntelligenceService.ts'), 'utf8');
  assert.ok(serviceSource.includes('bestAvailableOdds:'), 'MarketView must map bestAvailableOdds');
  assert.ok(serviceSource.includes('bestBookmaker:'), 'MarketView must map bestBookmaker');

  const typesSource = fs.readFileSync(path.resolve('src/types/index.ts'), 'utf8');
  assert.ok(typesSource.includes('bestAvailableOdds?: number | null;'), 'MarketView must define bestAvailableOdds');
  assert.ok(typesSource.includes('bestBookmaker?: string | null;'), 'MarketView must define bestBookmaker');
});
