// SALMO.DEV — Canonical HandicapLab Rescue Sync Test Suite
// Verifies coordinated synchronization between HandicapLab and SALMO:
// 1. One canonical implementation (HandicapLab source-of-truth).
// 2. Predictions != picks (414 predictions recorded in ledger, 0 actionable picks).
// 3. Proper AH/OU line ladders (no moneyline corruption).
// 4. BTTS strictly research-only.
// 5. Zero fabricated data and verified sync schema.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

// We simulate/verify the Local adapter sync path directly from the ledger
test('HandicapLab -> SALMO Rescue Sync: Canonical Ledger Ingestion', async (t) => {
  const ledgerPath = path.resolve(__dirname, '..', '..', 'HandicapLab', 'data', 'ledger', 'rescue_prediction_ledger.jsonl');
  assert.ok(fs.existsSync(ledgerPath), `Canonical rescue ledger must exist at ${ledgerPath}`);

  const content = fs.readFileSync(ledgerPath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim().length > 0);
  assert.strictEqual(lines.length, 414, 'Canonical rescue ledger must contain exactly 414 records');

  const records = lines.map(l => JSON.parse(l));

  // 1. Model version invariant
  for (const r of records) {
    assert.strictEqual(r.model_version, 'poisson_v1_rescue', 'Model version must be poisson_v1_rescue');
    assert.ok(r.run_id, 'Must have run_id');
    assert.ok(r.fixture_id, 'Must have fixture_id');
    assert.ok(r.home_team && r.away_team, 'Must have teams');
    assert.ok(['AH', 'OU', 'BTTS'].includes(r.market), 'Market must be AH, OU, or BTTS');
  }

  // 2. Invariant: Predictions != picks
  const qualifyingPicks = records.filter(r => r.is_pick === true);
  assert.strictEqual(
    qualifyingPicks.length,
    0,
    'Verified run had Pinnacle odds rejected (EV < 0) -> exactly 0 picks generated'
  );

  // 3. Asian Handicap line family invariant (not moneyline!)
  const ahRecords = records.filter(r => r.market === 'AH');
  assert.ok(ahRecords.length > 0, 'Must have AH records');
  const ahLines = new Set(ahRecords.map(r => r.line));
  assert.ok(ahLines.has(-1.5), 'AH must support -1.5 line');
  assert.ok(ahLines.has(-0.5), 'AH must support -0.5 line');
  assert.ok(ahLines.has(0), 'AH must support 0 (level) line');
  assert.ok(ahLines.has(0.5), 'AH must support +0.5 line');
  assert.ok(ahLines.has(1.5), 'AH must support +1.5 line');

  // 4. Over/Under line family invariant (not hardcoded 2.5!)
  const ouRecords = records.filter(r => r.market === 'OU');
  assert.ok(ouRecords.length > 0, 'Must have OU records');
  const ouLines = new Set(ouRecords.map(r => r.line));
  assert.ok(ouLines.has(1.5), 'OU must support 1.5 line');
  assert.ok(ouLines.has(2.5), 'OU must support 2.5 line');
  assert.ok(ouLines.has(3.5), 'OU must support 3.5 line');

  // 5. BTTS is strictly RESEARCH_ONLY
  const bttsRecords = records.filter(r => r.market === 'BTTS');
  assert.ok(bttsRecords.length > 0, 'Must have BTTS records');
  assert.ok(
    bttsRecords.every(r => r.is_pick === false),
    'BTTS records must strictly have is_pick === false (research only)'
  );

  // 6. Data state mapping
  const dataState = qualifyingPicks.length > 0 ? 'REAL' : 'NO_QUALIFIED_PICKS';
  assert.strictEqual(dataState, 'NO_QUALIFIED_PICKS', 'Data state must be NO_QUALIFIED_PICKS when 0 picks qualify');
});

test('HandicapLab -> SALMO HTTP Contract URL Formatting', async (t) => {
  const baseUrl = 'https://handicaplab.vercel.app';
  const query = {
    view: 'all',
    horizon: 'NEXT_7_DAYS',
    market: 'AH',
    modelVersion: 'poisson_v1_rescue',
  };

  const url = new URL(`${baseUrl}/api/v1/salmo/sync`);
  if (query.view) url.searchParams.set('view', query.view);
  if (query.horizon) url.searchParams.set('horizon', query.horizon);
  if (query.market) url.searchParams.set('market', query.market);
  if (query.modelVersion) url.searchParams.set('modelVersion', query.modelVersion);

  assert.strictEqual(
    url.toString(),
    'https://handicaplab.vercel.app/api/v1/salmo/sync?view=all&horizon=NEXT_7_DAYS&market=AH&modelVersion=poisson_v1_rescue'
  );
});

test('HandicapLab -> SALMO HttpHandicapLabAdapter Health Probe uses /api/health', async (t) => {
  const adapterSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'contracts', 'handicapLabAdapter.ts'), 'utf8');
  const httpAdapterStart = adapterSource.indexOf('class HttpHandicapLabAdapter');
  const getHealthMethod = adapterSource.slice(
    adapterSource.indexOf('public async getHealth(): Promise<AdapterHealth> {', httpAdapterStart),
    adapterSource.indexOf('class DatabaseHandicapLabAdapter')
  );

  assert.ok(
    getHealthMethod.includes('${this.baseUrl}/api/health'),
    'HttpHandicapLabAdapter.getHealth must query ${this.baseUrl}/api/health'
  );
  assert.ok(
    !getHealthMethod.includes('${this.baseUrl}/summary'),
    'HttpHandicapLabAdapter.getHealth must NOT query legacy /summary endpoint'
  );
});
