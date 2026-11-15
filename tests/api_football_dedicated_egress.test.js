// SALMO.DEV — Dedicated API-Football Gateway & Egress Architecture Test Suite
// Verifies request governance, egress verification, rate limiting, and secret isolation.
// Strictly uses mock adapters to guarantee zero live calls to suspended accounts.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Dynamic TypeScript loader
if (!require.extensions['.ts']) {
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
}

const { ApiFootballGatewayService } = require('../src/services/gateway/apiFootballGatewayService.ts');
const { ApiFootballGatewayClient } = require('../src/services/gateway/apiFootballGatewayClient.ts');
const { ApiFootballProvider } = require('../src/services/providers/apiFootballProvider.ts');

test('1. Gateway Authentication - Enforces Bearer token security', async (t) => {
  const gateway = new ApiFootballGatewayService({
    apiKey: 'test-api-key-12345',
    gatewayToken: 'secret-salmo-token-999',
    enforceDedicatedEgress: false,
    minInterRequestDelayMs: 0,
  });

  // Rejects missing auth
  const resNoAuth = await gateway.executeRequest({ endpoint: '/status' });
  assert.strictEqual(resNoAuth.success, false);
  assert.strictEqual(resNoAuth.status, 401);
  assert.match(resNoAuth.error, /Unauthorized/);

  // Rejects invalid Bearer token
  const resBadAuth = await gateway.executeRequest({ endpoint: '/status' }, 'Bearer wrong-token');
  assert.strictEqual(resBadAuth.success, false);
  assert.strictEqual(resBadAuth.status, 401);

  // Accepts valid token
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    headers: new Map(),
    json: async () => ({ response: [{ account: 'active' }] }),
  });
  gateway.setFetchFn(mockFetch);

  const resValid = await gateway.executeRequest({ endpoint: '/status' }, 'Bearer secret-salmo-token-999');
  assert.strictEqual(resValid.success, true);
  assert.strictEqual(resValid.status, 200);
});

test('2. Dedicated Egress Verification - Fails closed on IP mismatch', async (t) => {
  const EXPECTED_STATIC_IP = '34.101.200.50';

  // Scenario A: Mismatched egress IP (simulating shared dynamic egress)
  const mockSharedIpFetch = async (url) => {
    if (url.includes('ipify.org')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ip: '35.240.111.222' }), // Shared Google Cloud IP
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const gatewayMismatched = new ApiFootballGatewayService(
    {
      apiKey: 'test-api-key',
      gatewayToken: 'token',
      expectedDedicatedEgressIp: EXPECTED_STATIC_IP,
      enforceDedicatedEgress: true,
      minInterRequestDelayMs: 0,
    },
    mockSharedIpFetch
  );

  const verifyResult = await gatewayMismatched.verifyEgressIp();
  assert.strictEqual(verifyResult.verified, false);
  assert.strictEqual(verifyResult.actualIp, '35.240.111.222');
  assert.strictEqual(verifyResult.expectedIp, EXPECTED_STATIC_IP);
  assert.match(verifyResult.reason, /Egress IP mismatch/);

  // Outbound execution is strictly blocked
  const execBlocked = await gatewayMismatched.executeRequest({ endpoint: '/fixtures' }, 'Bearer token');
  assert.strictEqual(execBlocked.success, false);
  assert.strictEqual(execBlocked.status, 403);
  assert.match(execBlocked.error, /Dedicated egress violation/);

  // Scenario B: Egress IP strictly matches dedicated static IP
  const mockDedicatedIpFetch = async (url) => {
    if (url.includes('ipify.org')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ip: EXPECTED_STATIC_IP }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ response: [{ id: 101 }] }),
    };
  };

  const gatewayDedicated = new ApiFootballGatewayService(
    {
      apiKey: 'test-api-key',
      gatewayToken: 'token',
      expectedDedicatedEgressIp: EXPECTED_STATIC_IP,
      enforceDedicatedEgress: true,
      minInterRequestDelayMs: 0,
    },
    mockDedicatedIpFetch
  );

  const verifyPass = await gatewayDedicated.verifyEgressIp();
  assert.strictEqual(verifyPass.verified, true);
  assert.strictEqual(verifyPass.actualIp, EXPECTED_STATIC_IP);

  const execPass = await gatewayDedicated.executeRequest({ endpoint: '/fixtures' }, 'Bearer token');
  assert.strictEqual(execPass.success, true);
  assert.strictEqual(execPass.status, 200);
});

test('3. API Key Isolation - Upstream key never leaks into client payload', async (t) => {
  const SECRET_KEY = 'synthetic-mock-secret-key-isolated-123';
  let capturedHeaders = {};

  const mockFetch = async (url, opts) => {
    capturedHeaders = opts.headers;
    return {
      ok: true,
      status: 200,
      json: async () => ({ response: [{ fixture: { id: 999 } }] }),
    };
  };

  const gateway = new ApiFootballGatewayService(
    {
      apiKey: SECRET_KEY,
      gatewayToken: 'salmo-token',
      enforceDedicatedEgress: false,
      minInterRequestDelayMs: 0,
    },
    mockFetch
  );

  const res = await gateway.executeRequest({ endpoint: '/fixtures' }, 'Bearer salmo-token');
  assert.strictEqual(res.success, true);

  // Upstream received key
  assert.strictEqual(capturedHeaders['x-apisports-key'], SECRET_KEY);

  // Gateway response strictly omits key
  const resStr = JSON.stringify(res);
  assert.strictEqual(resStr.includes(SECRET_KEY), false, 'INVARIANT: API key must NEVER be in response payload');

  // Client DTO also does not contain key
  const client = new ApiFootballGatewayClient({
    gatewayUrl: 'http://gateway.local',
    gatewayToken: 'salmo-token',
  });
  assert.strictEqual(JSON.stringify(client).includes(SECRET_KEY), false);
});

test('4. Request Deduplication - Identical queries consume zero additional quota', async (t) => {
  let upstreamCalls = 0;
  const mockFetch = async () => {
    upstreamCalls++;
    return {
      ok: true,
      status: 200,
      json: async () => ({ response: [{ match: 'Arsenal vs Chelsea' }] }),
    };
  };

  const gateway = new ApiFootballGatewayService(
    {
      apiKey: 'key',
      gatewayToken: 'token',
      enforceDedicatedEgress: false,
      cacheTtlSeconds: 60,
      minInterRequestDelayMs: 0,
    },
    mockFetch
  );

  // First call: misses cache, executes upstream
  const res1 = await gateway.executeRequest(
    { endpoint: '/fixtures', params: { league: 39, season: 2026 } },
    'Bearer token'
  );
  assert.strictEqual(res1.cached, false);
  assert.strictEqual(upstreamCalls, 1);

  // Second call with differently ordered query params: matches canonical cache!
  const res2 = await gateway.executeRequest(
    { endpoint: '/fixtures', params: { season: 2026, league: 39 } },
    'Bearer token'
  );
  assert.strictEqual(res2.cached, true);
  assert.strictEqual(upstreamCalls, 1, 'INVARIANT: Duplicate request must consume 0 upstream calls');
  assert.deepStrictEqual(res2.data, res1.data);
});

test('5. Quota Enforcement & Operational Reserve - Respects Free tier ceilings', async (t) => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ response: [] }),
  });

  const gateway = new ApiFootballGatewayService(
    {
      apiKey: 'key',
      gatewayToken: 'token',
      dailyLimit: 5,
      dailyReserveFloor: 2,
      minInterRequestDelayMs: 0,
      skipCache: true,
    },
    mockFetch
  );

  // Call 1: OK (remaining after: 4)
  const r1 = await gateway.executeRequest({ endpoint: '/test1', skipCache: true }, 'Bearer token');
  assert.strictEqual(r1.success, true);

  // Call 2: OK (remaining after: 3)
  const r2 = await gateway.executeRequest({ endpoint: '/test2', skipCache: true }, 'Bearer token');
  assert.strictEqual(r2.success, true);

  // Call 3: OK (remaining after: 2)
  const r3 = await gateway.executeRequest({ endpoint: '/test3', skipCache: true }, 'Bearer token');
  assert.strictEqual(r3.success, true);

  // Call 4: Hits reserve floor (remaining 2 <= reserve floor 2) -> RESERVE_HELD
  const r4 = await gateway.executeRequest({ endpoint: '/test4', skipCache: true }, 'Bearer token');
  assert.strictEqual(r4.success, false);
  assert.strictEqual(r4.status, 429);
  assert.match(r4.error, /Operational reserve floor reached/);
});

test('6. HTTP 429 Handling & Emergency Circuit Breaker - Immediate trip, zero retry', async (t) => {
  let callCount = 0;
  const mock429Fetch = async () => {
    callCount++;
    return {
      ok: false,
      status: 429,
      json: async () => ({ errors: { rateLimit: 'Too many requests' } }),
    };
  };

  const gateway = new ApiFootballGatewayService(
    {
      apiKey: 'key',
      gatewayToken: 'token',
      minInterRequestDelayMs: 0,
      circuitBreakerCooldownMs: 500,
      maxRetries: 3, // Should NEVER retry 429 even if maxRetries > 0
    },
    mock429Fetch
  );

  // First request receives 429
  const res1 = await gateway.executeRequest({ endpoint: '/rate-limited', skipCache: true }, 'Bearer token');
  assert.strictEqual(res1.status, 429);
  assert.strictEqual(callCount, 1, 'INVARIANT: 429 must trigger ZERO retries');
  assert.strictEqual(gateway.getCircuitBreakerState(), 'OPEN');

  // Next request fails fast with circuit breaker OPEN
  const res2 = await gateway.executeRequest({ endpoint: '/subsequent', skipCache: true }, 'Bearer token');
  assert.strictEqual(res2.status, 503);
  assert.strictEqual(callCount, 1, 'Upstream must not be contacted while circuit breaker is OPEN');
  assert.match(res2.error, /Emergency circuit breaker OPEN/);

  // Wait for cooldown
  await new Promise((r) => setTimeout(r, 550));
  assert.strictEqual(gateway.getCircuitBreakerState(), 'HALF_OPEN');
});

test('7. Structured Audit Ledger Integrity - Every execution logged to disk', async (t) => {
  const tmpLedger = path.join(os.tmpdir(), `test_ledger_${Date.now()}.jsonl`);

  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ response: [{ test: 'entry' }] }),
  });

  const gateway = new ApiFootballGatewayService(
    {
      apiKey: 'key',
      gatewayToken: 'token',
      minInterRequestDelayMs: 0,
      ledgerPath: tmpLedger,
      expectedDedicatedEgressIp: '34.101.200.50',
    },
    mockFetch
  );

  await gateway.executeRequest({ endpoint: '/fixtures', params: { league: 39 } }, 'Bearer token');

  assert.ok(fs.existsSync(tmpLedger), 'Ledger file must be created on disk');
  const lines = fs.readFileSync(tmpLedger, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length, 1);

  const entry = JSON.parse(lines[0]);
  assert.strictEqual(entry.endpoint, '/fixtures');
  assert.strictEqual(entry.httpStatus, 200);
  assert.strictEqual(entry.egressIp, '34.101.200.50');
  assert.strictEqual(entry.circuitBreakerState, 'CLOSED');
  assert.ok(entry.latencyMs >= 0);

  // Clean up
  try { fs.unlinkSync(tmpLedger); } catch {}
});

test('8. Vercel & Client Bypass Prevention - ApiFootballProvider fail-closed without reactivation', async (t) => {
  // Provider initialized by default: fail-closed, transition unauthorized
  const providerDisabled = new ApiFootballProvider();
  assert.strictEqual(providerDisabled.isConfigured(), false);

  const resultDisabled = await providerDisabled.getUpcomingFixtures('39');
  assert.strictEqual(resultDisabled.status, 'UNCONFIGURED');
  assert.strictEqual(resultDisabled.data, null);
  assert.match(resultDisabled.error, /disabled pending official account reactivation/);

  // Verify that provider implementation source does NOT contain hardcoded direct URL
  const providerSource = fs.readFileSync(path.resolve('src/services/providers/apiFootballProvider.ts'), 'utf8');
  assert.ok(
    !providerSource.includes("fetch('https://v3.football.api-sports.io"),
    'INVARIANT: ApiFootballProvider must NOT contain direct fetch to api-sports.io'
  );
  assert.ok(
    !providerSource.includes('fetch(url'),
    'INVARIANT: ApiFootballProvider must route exclusively through ApiFootballGatewayClient'
  );
});

test('9. GitHub Actions Bypass Prevention - settle-cron.yml clean of API_FOOTBALL_KEY', async (t) => {
  const workflowPath = path.resolve('.github/workflows/settle-cron.yml');
  const workflowContent = fs.readFileSync(workflowPath, 'utf8');

  assert.ok(
    !workflowContent.includes('API_FOOTBALL_KEY: ${{ secrets.API_FOOTBALL_KEY }}'),
    'INVARIANT: settle-cron.yml must NOT expose API_FOOTBALL_KEY to GitHub Actions runners'
  );
});

test('10. Provider Normalization Parity - Gateway response properly mapped to LiveFixtureDTO', async (t) => {
  const mockGatewayClient = {
    isConfigured: () => true,
    get: async () => ({
      success: true,
      status: 200,
      data: {
        response: [
          {
            fixture: {
              id: 123456,
              date: '2026-11-20T15:00:00Z',
              venue: { name: 'Emirates Stadium' },
              status: { short: 'NS' },
            },
            league: {
              name: 'Premier League',
              season: 2026,
            },
            teams: {
              home: { name: 'Arsenal' },
              away: { name: 'Chelsea' },
            },
          },
        ],
      },
      cached: false,
      latencyMs: 45,
      timestamp: new Date().toISOString(),
    }),
  };

  const provider = new ApiFootballProvider({
    gatewayClient: mockGatewayClient,
    operationalTransitionAuthorized: true,
  });
  assert.strictEqual(provider.isConfigured(), true);

  const res = await provider.getUpcomingFixtures('39');
  assert.strictEqual(res.status, 'AVAILABLE');
  assert.strictEqual(res.data ? res.data.length : 0, 1);

  const fixture = res.data[0];
  assert.strictEqual(fixture.providerFixtureId, '123456');
  assert.strictEqual(fixture.homeTeam, 'Arsenal');
  assert.strictEqual(fixture.awayTeam, 'Chelsea');
  assert.strictEqual(fixture.league, 'Premier League');
  assert.strictEqual(fixture.season, '2026');
  assert.strictEqual(fixture.venue, 'Emirates Stadium');
  assert.strictEqual(fixture.status, 'SCHEDULED');
});
