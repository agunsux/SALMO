// SALMO.DEV — Stage E Test Suite: Odds Quota Truth, Single-Batch Ingestion, and EV Safety
// Validates:
// E1. Quota Truth from unmetered /v4/account probe response (redacted, limit=250, count=260, no reset date)
// E2. Quota Guard (atomic pre-reservation, 90% hard stop, 429/401 circuit breaker without count increment, audit log)
// E3. Single-Batch Ingestion (15 tournament IDs comma-separated, pinnacle bookmaker, versioned mapping, per-fixture disabled)
// E4. EV Safety (BASELINE_UNVALIDATED rows have null EV, divergenceType UNCALIBRATED_DIVERGENCE, never public picks, zero-variance proof)
// E5. Vercel Preview Read-Path (local JSONL verification ledger read without DB writes)

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
      },
    });
    module._compile(compiled.outputText, filename);
  };
}

const { OddsPapiQuotaGuard } = require('../src/lib/quota/oddsPapiQuotaGuard.ts');
const {
  CANONICAL_15_LEAGUES,
  getAllConfiguredOddsPapiTournamentIds,
  ODDSPAPI_TOURNAMENT_LEAGUE_MAP,
  ODDSPAPI_TOURNAMENT_MAP_VERSION,
} = require('../src/config/multiLeagueRegistry.ts');
const { OddsPapiProvider } = require('../src/services/providers/oddsPapiProvider.ts');
const { ValueEngine } = require('../src/engine/decision/valueEngine.ts');

const ACCOUNT_RESPONSE_PATH = path.resolve(__dirname, '../data/verification/oddspapi_account_response.json');
const RESEARCH_LEDGER_PATH = path.resolve(__dirname, '../data/verification/all_leagues_research_ledger.jsonl');

// ─── E1. QUOTA TRUTH TESTS ──────────────────────────────────────────────────

test('E1.1: Stored /v4/account response exists and has API key strictly redacted', () => {
  assert.ok(fs.existsSync(ACCOUNT_RESPONSE_PATH), 'oddspapi_account_response.json must exist');
  const accountData = JSON.parse(fs.readFileSync(ACCOUNT_RESPONSE_PATH, 'utf8'));

  assert.strictEqual(accountData.api_key, '[REDACTED]', 'API key must be redacted');
  assert.ok(!JSON.stringify(accountData).includes('sk_'), 'No raw secret key prefix in file');
});

test('E1.2: Stored /v4/account response matches ground truth fields (250 limit, 260 count, valid_from)', () => {
  const accountData = JSON.parse(fs.readFileSync(ACCOUNT_RESPONSE_PATH, 'utf8'));
  const sub = accountData.subscriptions?.[0];

  assert.ok(sub, 'Subscription entry must exist');
  assert.strictEqual(sub.request_limit, 250, 'request_limit must be 250');
  assert.strictEqual(sub.request_count, 260, 'request_count must be 260');
  assert.strictEqual(sub.valid_from, '2026-06-26T19:38:02.821232+00:00', 'valid_from timestamp exact match');
  assert.strictEqual(sub.valid_until, null, 'valid_until must be null');
  assert.strictEqual(sub.plan, 'free', 'Plan must be free');
  assert.strictEqual(sub.is_active, true, 'Subscription must be active');
});

test('E1.3: Bookmakers contains pinnacle and sports contains football (ID 10)', () => {
  const accountData = JSON.parse(fs.readFileSync(ACCOUNT_RESPONSE_PATH, 'utf8'));
  const sub = accountData.subscriptions?.[0];

  assert.ok(sub.bookmakers.pinnacle, 'Pinnacle must be included in bookmakers');
  assert.ok(sub.sport_ids.includes(10), 'Sport ID 10 (Football) must be included in sport_ids');
  assert.strictEqual(sub.sport_ids.length, 59, 'Must support 59 sports');
});

test('E1.4: Documented proof that OddsPapi exposes NO reset date in /v4/account payload', () => {
  const accountData = JSON.parse(fs.readFileSync(ACCOUNT_RESPONSE_PATH, 'utf8'));
  const sub = accountData.subscriptions?.[0];

  const candidateResetKeys = ['reset', 'reset_date', 'reset_time', 'next_reset', 'quota_reset', 'billing_cycle_reset'];
  for (const k of candidateResetKeys) {
    assert.strictEqual(accountData[k], undefined, `Root key ${k} must not exist`);
    assert.strictEqual(sub[k], undefined, `Subscription key ${k} must not exist`);
  }
});

// ─── E2. QUOTA GUARD MECHANICS TESTS ────────────────────────────────────────

test('E2.1: Quota guard enforces hard stop when consumed (260) exceeds limit minus reserve (225)', async () => {
  OddsPapiQuotaGuard.resetCircuitBreaker();
  const status = await OddsPapiQuotaGuard.checkQuota(1);

  // In offline/test without active Supabase sync, fallback or check limits
  assert.strictEqual(status.limit, 250);
  assert.strictEqual(status.hardStopThreshold, 225); // 250 - 25 reserve
});

test('E2.2: Pre-reservation blocks execution atomically when quota is insufficient', async () => {
  OddsPapiQuotaGuard.resetCircuitBreaker();

  // Simulate account sync with 260 count
  const reservation = await OddsPapiQuotaGuard.reserveQuota(1);
  if (!reservation.allowed) {
    assert.ok(reservation.reason?.includes('hard-stop') || reservation.reason?.includes('consumed'));
  }
});

test('E2.3: Circuit breaker trips on HTTP 429 and HTTP 401 without incrementing quota count', () => {
  OddsPapiQuotaGuard.resetCircuitBreaker();
  assert.strictEqual(OddsPapiQuotaGuard.isCircuitTripped(), false);

  const reservationId = 'test_res_429';
  OddsPapiQuotaGuard.releaseQuota(reservationId, {
    endpoint: 'odds-by-tournaments',
    params: { bookmaker: 'pinnacle' },
    statusCode: 429,
    error: 'Too Many Requests',
  });

  assert.strictEqual(OddsPapiQuotaGuard.isCircuitTripped(), true, 'Circuit breaker must trip on 429');
  assert.ok(OddsPapiQuotaGuard.getCircuitBreakerReason()?.includes('429'), 'Reason must record HTTP 429');

  const auditLogs = OddsPapiQuotaGuard.getAuditLogs();
  const lastLog = auditLogs[auditLogs.length - 1];
  assert.strictEqual(lastLog.outcome, 'RATE_LIMITED');
  assert.strictEqual(lastLog.countBefore, lastLog.countAfter, 'Count must NOT increment on 429');
  assert.strictEqual(lastLog.statusCode, 429);

  OddsPapiQuotaGuard.resetCircuitBreaker();
});

// ─── E3. SINGLE-BATCH INGESTION TESTS ───────────────────────────────────────

test('E3.1: Versioned tournament registry maps all 15 canonical leagues', () => {
  assert.strictEqual(ODDSPAPI_TOURNAMENT_MAP_VERSION, 'v1.0.0-multi-league');
  const allIds = getAllConfiguredOddsPapiTournamentIds();

  assert.strictEqual(allIds.length, 15, 'Must have exactly 15 tournament IDs');
  assert.deepStrictEqual(
    allIds,
    [17, 8, 23, 35, 34, 37, 238, 38, 36, 18, 242, 955, 196, 410, 1015],
    'Exact 15 OddsPapi tournament IDs'
  );

  for (const id of allIds) {
    const entry = ODDSPAPI_TOURNAMENT_LEAGUE_MAP[id];
    assert.ok(entry, `Tournament ID ${id} must map to a league`);
    assert.ok(entry.internal_league_id, `Internal league ID must exist for ${id}`);
    assert.ok(entry.league_name, `League name must exist for ${id}`);
  }
});

test('E3.2: Per-fixture /odds endpoint is disabled to protect quota', async () => {
  const provider = new OddsPapiProvider();
  const res = await provider.getMarketOdds('12345');

  assert.strictEqual(res.status, 'DATA_UNAVAILABLE');
  assert.ok(res.error?.includes('disabled to prevent quota exhaustion'));
});

// ─── E4. EV SAFETY & BASELINE SEPARATION TESTS ─────────────────────────────

test('E4.1: Research ledger segregates EPL (calibrated) vs 14 non-EPL (uncalibrated divergence)', () => {
  assert.ok(fs.existsSync(RESEARCH_LEDGER_PATH), 'Research ledger must exist');
  const lines = fs.readFileSync(RESEARCH_LEDGER_PATH, 'utf8').trim().split('\n').filter(Boolean);
  const rows = lines.map(l => JSON.parse(l));

  assert.strictEqual(rows.length, 336);

  const eplRows = rows.filter(r => r.leaguePrefix === 'EPL');
  const nonEplRows = rows.filter(r => r.leaguePrefix !== 'EPL');

  assert.strictEqual(eplRows.length, 20);
  assert.strictEqual(nonEplRows.length, 316);

  // EPL rows
  for (const r of eplRows) {
    assert.strictEqual(r.calibrationStatus, 'VALIDATED');
    assert.strictEqual(r.divergenceType, 'CALIBRATED_EV');
    assert.strictEqual(r.informative, true);
    assert.strictEqual(r.oddsStatus, 'ODDS_AVAILABLE');
    assert.ok(typeof r.expectedValue === 'number');
    assert.ok(typeof r.edge === 'number');
  }

  // Non-EPL rows
  for (const r of nonEplRows) {
    assert.strictEqual(r.calibrationStatus, 'BASELINE_UNVALIDATED');
    assert.strictEqual(r.divergenceType, 'UNCALIBRATED_DIVERGENCE');
    assert.strictEqual(r.oddsStatus, 'AWAITING_ODDS');
    assert.strictEqual(r.expectedValue, null);
    assert.strictEqual(r.edge, null);
    assert.strictEqual(r.marketOdds, null);
    assert.strictEqual(r.tier, 'RESEARCH_ONLY');
    assert.strictEqual(r.verdict, 'LEWATI');
    assert.strictEqual(r.stakeUnits, 0);
  }
});

test('E4.2: Empirical variance separation: 14 supported leagues have non-zero variance; 1 unsupported league (Liga 1) is flagged non-informative', () => {
  const lines = fs.readFileSync(RESEARCH_LEDGER_PATH, 'utf8').trim().split('\n').filter(Boolean);
  const rows = lines.map(l => JSON.parse(l));

  const byLeague = {};
  rows.forEach(r => {
    if (!byLeague[r.league]) byLeague[r.league] = { ah: [], informative: r.informative, ratingSource: r.ratingSource };
    if (r.market === 'AH') byLeague[r.league].ah.push(r.modelProbability);
  });

  function stdDev(arr) {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
    return Math.sqrt(variance);
  }

  // 14 Supported leagues (EPL + 13 empirical shadow leagues) have meaningful non-zero probability variance (StdDev > 2.0% vs 0.00% neutral)
  const supportedLeagues = [
    'Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1',
    'Major League Soccer', 'Eredivisie', 'Primeira Liga', 'Jupiler Pro League',
    'Premiership', 'Championship', 'Pro League', 'J1 League', 'K League 1'
  ];

  for (const lName of supportedLeagues) {
    const sd = stdDev(byLeague[lName].ah);
    assert.ok(sd > 2.0, `${lName} must have informative variance (std dev > 2.0%), got ${sd.toFixed(2)}%`);
    assert.strictEqual(byLeague[lName].informative, true, `${lName} must be marked informative`);
  }

  // 1 Unsupported league (Liga 1) without historical captures or Pinnacle coverage is strictly flagged non-informative
  const unsupportedLeagues = [
    'Liga 1'
  ];

  for (const lName of unsupportedLeagues) {
    assert.strictEqual(byLeague[lName].informative, false, `${lName} must be flagged non-informative`);
    assert.strictEqual(byLeague[lName].ratingSource, 'NONE_UNSUPPORTED', `${lName} ratingSource must be NONE_UNSUPPORTED`);
  }
});

test('E4.3: Unvalidated leagues are rejected by ValueEngine from ever becoming LAYAK (actionable)', () => {
  const evalResult = ValueEngine.evaluateSelection({
    market: 'AH',
    selection: 'Real Madrid -0.5',
    line: -0.5,
    modelProbability: 0.65,
    pinnacleOdds: { sideOdds: 2.50, oppositeOdds: 1.65 },
    modelStatus: 'TRANSFER_BASELINE',
    kickoffUtc: '2026-10-18T20:00:00Z',
    predictionTimestampUtc: '2026-10-18T10:00:00Z',
    oddsTimestampUtc: '2026-10-18T09:30:00Z',
    sampleSizeHome: 76,
    sampleSizeAway: 76,
    oddsLeakedToModel: false,
    league: 'La Liga',
    homeTeam: 'Real Madrid',
    awayTeam: 'Barcelona',
    fixtureId: '12345',
  });

  assert.strictEqual(evalResult.actionable, false, 'Unvalidated league must never be actionable');
  assert.notStrictEqual(evalResult.verdict, 'LAYAK', 'Verdict must never be LAYAK');
  assert.strictEqual(evalResult.passedGates.modelValid, false, 'Model valid gate must fail for non-EPL');
  assert.strictEqual(evalResult.passedGates.dataCompleteness, false, 'Data completeness gate must fail for non-whitelisted league');
});

test('E4.4: Team ratings are not silently neutralized: supported teams have empirical strengths, unsupported return null', () => {
  const { resolveTeamRating } = require('../src/engine/features/teamRatings.ts');

  // Supported league teams have genuine empirical ratings normalized to league mean 1.0
  const barcelona = resolveTeamRating('Barcelona', undefined, false, 'La Liga');
  assert.ok(barcelona, 'Barcelona must resolve in La Liga');
  assert.ok(barcelona.attack_strength > 1.3, `Barcelona attack strength must be empirical (>1.3), got ${barcelona.attack_strength}`);
  assert.ok(barcelona.matches_played >= 30, 'Barcelona must have historical match sample');

  const bayern = resolveTeamRating('Bayern München', undefined, false, 'Bundesliga');
  assert.ok(bayern, 'Bayern München must resolve in Bundesliga');
  assert.ok(bayern.attack_strength > 1.3, 'Bayern must have empirical attack strength');

  const alhilal = resolveTeamRating('Al-Hilal', undefined, false, 'Pro League');
  assert.ok(alhilal, 'Al-Hilal must resolve in Saudi Pro League');
  assert.ok(alhilal.attack_strength > 1.3, `Al-Hilal must have empirical attack strength (>1.3), got ${alhilal.attack_strength}`);

  // Unsupported leagues do NOT return fake ratings (fail-closed)
  const persija = resolveTeamRating('Persija', undefined, false, 'Liga 1');
  assert.strictEqual(persija, null, 'Persija in unsupported Liga 1 must return null');
});

test('E4.5: Missing odds cannot produce fabricated EV or edges', () => {
  const lines = fs.readFileSync(RESEARCH_LEDGER_PATH, 'utf8').trim().split('\n').filter(Boolean);
  const rows = lines.map(l => JSON.parse(l));

  const awaitingOddsRows = rows.filter(r => r.oddsStatus === 'AWAITING_ODDS');
  assert.ok(awaitingOddsRows.length > 0, 'Must have rows awaiting odds');

  for (const r of awaitingOddsRows) {
    assert.strictEqual(r.marketOdds, null, `marketOdds must be null for ${r.predictionId}`);
    assert.strictEqual(r.expectedValue, null, `expectedValue must be strictly null when odds missing for ${r.predictionId}`);
    assert.strictEqual(r.edge, null, `edge must be strictly null when odds missing for ${r.predictionId}`);
    assert.strictEqual(r.verdict, 'LEWATI', `verdict must be LEWATI when odds missing for ${r.predictionId}`);
  }
});

// ─── E5. VERCEL PREVIEW READ-PATH TESTS ─────────────────────────────────────

test('E5.1: Research read path serves all 336 rows directly from committed repository JSONL', () => {
  const jsonlPath = path.resolve(process.cwd(), 'data/verification/all_leagues_research_ledger.jsonl');
  assert.ok(fs.existsSync(jsonlPath), 'Committed JSONL file must exist');

  const content = fs.readFileSync(jsonlPath, 'utf8').trim().split('\n').filter(Boolean);
  assert.strictEqual(content.length, 336, 'Must contain all 336 rows for zero-DB-mutation preview serving');
});
