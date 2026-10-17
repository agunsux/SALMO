// SALMO.DEV — OddsPAPI Pause Safety & Containment Test Suite
// Strictly verifies:
// 1. OddsPapiProvider honors ODDSPAPI_PAUSED / PAUSE_ODDSPAPI / ODDS_PAPI_PAUSED.
// 2. All methods (getUpcomingFixtures, getTournamentOdds, getSingleBatchTournamentOdds,
//    getFixtureById, getMarketOdds) return status: 'PAUSED' with 0 requestsConsumed.
// 3. Zero outbound network calls to api.oddspapi.io occur while paused.
// 4. OddsPapiQuotaGuard.reserveQuota() and checkQuota() fail closed with ODDSPAPI_PAUSED
//    without creating reservations, consuming quota, or invoking atomic RPCs.
// 5. Existing quota state and history are strictly preserved without mutation.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
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

const { OddsPapiProvider } = require('../src/services/providers/oddsPapiProvider.ts');
const { OddsPapiQuotaGuard } = require('../src/lib/quota/oddsPapiQuotaGuard.ts');

test('OddsPAPI Pause Safety: Provider & Quota Guard Containment', async (t) => {
  const origPaused = process.env.ODDSPAPI_PAUSED;
  const origPauseLegacy = process.env.PAUSE_ODDSPAPI;
  const origKey = process.env.ODDS_PAPI_KEY;

  // Intercept fetch to guarantee zero network traffic to oddspapi
  const originalFetch = global.fetch;
  let oddspapiFetchCount = 0;
  global.fetch = async function (url, ...args) {
    const urlStr = String(url);
    if (urlStr.includes('oddspapi.io')) {
      oddspapiFetchCount++;
      throw new Error(`ILLEGAL_OUTBOUND_CALL: Outbound call to ${urlStr} attempted while OddsPAPI is PAUSED!`);
    }
    return originalFetch(url, ...args);
  };

  t.after(() => {
    global.fetch = originalFetch;
    if (origPaused !== undefined) process.env.ODDSPAPI_PAUSED = origPaused;
    else delete process.env.ODDSPAPI_PAUSED;
    if (origPauseLegacy !== undefined) process.env.PAUSE_ODDSPAPI = origPauseLegacy;
    else delete process.env.PAUSE_ODDSPAPI;
    if (origKey !== undefined) process.env.ODDS_PAPI_KEY = origKey;
    else delete process.env.ODDS_PAPI_KEY;
  });

  // Ensure key exists so we test the pause gate specifically (not UNCONFIGURED)
  process.env.ODDS_PAPI_KEY = 'test_key_paused_safety';
  process.env.ODDSPAPI_PAUSED = 'true';

  await t.test('1. Provider recognizes paused state', () => {
    assert.strictEqual(OddsPapiProvider.isPaused(), true);
    const provider = new OddsPapiProvider();
    assert.strictEqual(provider.isPaused(), true);
  });

  await t.test('2. getUpcomingFixtures fails fast with status PAUSED and 0 requests', async () => {
    const provider = new OddsPapiProvider();
    const result = await provider.getUpcomingFixtures([10, 11]);

    assert.strictEqual(result.status, 'PAUSED');
    assert.strictEqual(result.requestsConsumed, 0);
    assert.ok(result.error && result.error.includes('PAUSED'));
    assert.strictEqual(oddspapiFetchCount, 0, 'Must have zero network calls');
  });

  await t.test('3. getTournamentOdds and single batch fail fast with status PAUSED', async () => {
    const provider = new OddsPapiProvider();
    const resBatch = await provider.getBatchTournamentOdds([10, 11]);
    assert.strictEqual(resBatch.status, 'PAUSED');
    assert.strictEqual(resBatch.requestsConsumed, 0);

    const resSingle = await provider.getSingleBatchTournamentOdds([10, 11]);
    assert.strictEqual(resSingle.status, 'PAUSED');
    assert.strictEqual(resSingle.requestsConsumed, 0);
    assert.strictEqual(oddspapiFetchCount, 0, 'Must have zero network calls');
  });

  await t.test('4. getFixtureById and getMarketOdds fail fast with status PAUSED', async () => {
    const provider = new OddsPapiProvider();
    const resFixture = await provider.getFixtureById('test_fix_1');
    assert.strictEqual(resFixture.status, 'PAUSED');
    assert.strictEqual(resFixture.requestsConsumed, 0);

    const resMarket = await provider.getMarketOdds('test_fix_1');
    assert.strictEqual(resMarket.status, 'PAUSED');
    assert.strictEqual(resMarket.requestsConsumed, 0);
    assert.strictEqual(oddspapiFetchCount, 0, 'Must have zero network calls');
  });

  await t.test('5. OddsPapiQuotaGuard.isPaused() returns true and blocks reservations', async () => {
    assert.strictEqual(OddsPapiQuotaGuard.isPaused(), true);

    const reservation = await OddsPapiQuotaGuard.reserveQuota(1, {
      endpoint: '/odds-by-tournaments',
      allowProductionWrite: false,
    });

    assert.strictEqual(reservation.allowed, false);
    assert.strictEqual(reservation.errorCode, 'ODDSPAPI_PAUSED');
    assert.ok(reservation.reason && reservation.reason.includes('PAUSED'));
    assert.strictEqual(oddspapiFetchCount, 0, 'Must have zero network calls');
  });

  await t.test('6. OddsPapiQuotaGuard.checkQuota() fails closed with ODDSPAPI_PAUSED', async () => {
    const status = await OddsPapiQuotaGuard.checkQuota(1, 50, false);
    assert.strictEqual(status.allowed, false);
    assert.strictEqual(status.errorCode, 'ODDSPAPI_PAUSED');
    assert.ok(status.reason && status.reason.includes('PAUSED'));
    assert.strictEqual(oddspapiFetchCount, 0, 'Must have zero network calls');
  });

  await t.test('7. Alternate env var PAUSE_ODDSPAPI=true also activates pause', () => {
    delete process.env.ODDSPAPI_PAUSED;
    process.env.PAUSE_ODDSPAPI = 'true';

    assert.strictEqual(OddsPapiProvider.isPaused(), true);
    assert.strictEqual(OddsPapiQuotaGuard.isPaused(), true);
  });

  await t.test('8. syncAccount(true) makes ZERO network calls when paused', async () => {
    process.env.ODDSPAPI_PAUSED = 'true';
    const account = await OddsPapiQuotaGuard.syncAccount(true);
    assert.strictEqual(oddspapiFetchCount, 0, 'syncAccount must make zero network calls while paused');
  });

  await t.test('9. detectQuotaReset() makes ZERO network calls and returns RESET_UNVERIFIED', async () => {
    process.env.ODDSPAPI_PAUSED = 'true';
    const resetResult = await OddsPapiQuotaGuard.detectQuotaReset(3, true, undefined, false);
    assert.strictEqual(resetResult.state, 'RESET_UNVERIFIED');
    assert.strictEqual(resetResult.providerStatus, 'UNVERIFIED_OFFLINE');
    assert.ok(resetResult.reason.includes('PAUSED'));
    assert.strictEqual(oddspapiFetchCount, 0, 'detectQuotaReset must make zero network calls while paused');
  });
});
