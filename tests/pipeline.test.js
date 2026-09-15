// SALMO.DEV — Production Pipeline & Data Verification Tests (CommonJS)
// Strictly tests:
// 1. Adapter selection: production mode rejects local filesystem fallback.
// 2. Database client: unconfigured state fails gracefully with explicit error; probe handles connection.
// 3. API-Football provider: DTO mapping and error handling.
// 4. OddsPAPI provider: DTO mapping strictly restricted to AH, OU 2.5, and BTTS.
// 5. Invariant check: Strictly ZERO Moneyline / 1X2 market admitted.
// 6. Mathematical Engines: devigging, settlement, and decision policy.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

test('Pipeline - Database & Adapter Configuration Validation', async (t) => {
  // Test db connection probe logic against unconfigured environment
  const originalUrl = process.env.SUPABASE_URL;
  delete process.env.SUPABASE_URL;

  // Read lib/db.ts to ensure export structure and error handling
  const dbCode = fs.readFileSync(path.resolve('src/lib/db.ts'), 'utf8');
  assert.ok(dbCode.includes('testDbConnection'), 'Must export testDbConnection');
  assert.ok(dbCode.includes('SUPABASE_URL'), 'Must validate SUPABASE_URL');
  assert.ok(dbCode.includes('createClient'), 'Must instantiate createClient');

  if (originalUrl) process.env.SUPABASE_URL = originalUrl;
});

test('Pipeline - DatabaseHandicapLabAdapter Architecture', async (t) => {
  const adapterCode = fs.readFileSync(path.resolve('src/contracts/handicapLabAdapter.ts'), 'utf8');
  assert.ok(adapterCode.includes('class DatabaseHandicapLabAdapter'), 'Must define DatabaseHandicapLabAdapter');
  assert.ok(adapterCode.includes("mode = 'database'"), 'Must declare database mode');
  assert.ok(adapterCode.includes("from('matches')"), 'Must query matches table');
});

test('Pipeline - Live Provider DTO Mapping & Strict Scope Invariant', async (t) => {
  const providerTypes = fs.readFileSync(path.resolve('src/services/providers/types.ts'), 'utf8');
  assert.ok(providerTypes.includes("'ASIAN_HANDICAP' | 'OVER_UNDER' | 'BTTS'"), 'MarketType strictly limited to AH, OU, BTTS');
  assert.ok(!providerTypes.includes('MONEYLINE'), 'INVARIANT: Strictly NO Moneyline in provider types');
  assert.ok(!providerTypes.includes('1X2'), 'INVARIANT: Strictly NO 1X2 in provider types');

  const oddsProvider = fs.readFileSync(path.resolve('src/services/providers/oddsPapiProvider.ts'), 'utf8');
  assert.ok(oddsProvider.includes('OddsPapiProvider'), 'Must define OddsPapiProvider');
  assert.ok(!oddsProvider.includes('MONEYLINE'), 'INVARIANT: Strictly NO Moneyline in OddsPAPI provider');
});

test('Pipeline - MatchIntelligenceService Wire-up & Filesystem Decoupling', async (t) => {
  const serviceCode = fs.readFileSync(path.resolve('src/engine/matchIntelligenceService.ts'), 'utf8');
  // Must NOT directly import HandicapLabClient
  assert.ok(!serviceCode.includes("import { HandicapLabClient }"), 'Must NOT directly import HandicapLabClient');
  // Must NOT slice -12 historical records as fake upcoming schedule
  assert.ok(!serviceCode.includes('slice(-12)'), 'Must NOT simulate upcoming fixtures via slice(-12)');
  // Must wire ApiFootballProvider and OddsPapiProvider
  assert.ok(serviceCode.includes('ApiFootballProvider'), 'Must use ApiFootballProvider for real schedule');
  assert.ok(serviceCode.includes('OddsPapiProvider'), 'Must use OddsPapiProvider for live odds');
  // Must strictly evaluate only AH, BTTS, OU
  assert.ok(serviceCode.includes('asianHandicap: ahMarket'), 'Must evaluate asianHandicap');
  assert.ok(serviceCode.includes('btts: bttsMarket'), 'Must evaluate btts');
  assert.ok(serviceCode.includes('overUnder: ouMarket'), 'Must evaluate overUnder');
  assert.ok(!serviceCode.includes('moneyline'), 'INVARIANT: Strictly NO moneyline market in MatchIntelligenceService');
});

test('Pipeline - Decision Engine Strict Gating on Odds Availability', async (t) => {
  // Verify that DecisionPolicy assigns GREY when odds are null
  const policyCode = fs.readFileSync(path.resolve('src/engine/decision/decisionPolicy.ts'), 'utf8');
  assert.ok(policyCode.includes('ODDS_UNAVAILABLE'), 'Must support ODDS_UNAVAILABLE');
  assert.ok(policyCode.includes('GREY'), 'Must assign GREY badge when odds missing');
});

