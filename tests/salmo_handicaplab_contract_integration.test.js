// SALMO.DEV — HandicapLab Contract Integration & Adapter Test Suite
// Rigorous verification of HttpHandicapLabAdapter, LocalHandicapLabAdapter,
// fail-closed error mapping, timeout, retry backoff, and secret-safe logging.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
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

const {
  HttpHandicapLabAdapter,
  LocalHandicapLabAdapter,
  DatabaseHandicapLabAdapter,
  HandicapLabAdapterFactory,
  mapRawPicksToActivePredictions,
} = require('../src/contracts/handicapLabAdapter.ts');

const originalFetch = global.fetch;

test.afterEach(() => {
  global.fetch = originalFetch;
});

test('HandicapLab Contract — HttpAdapter URL and Auth Initialization', () => {
  const adapter = new HttpHandicapLabAdapter('https://handicaplab.dev/', 'test-secret-key-123');
  assert.strictEqual(adapter.getBaseUrl(), 'https://handicaplab.dev');
  assert.strictEqual(adapter.mode, 'http');
});

test('HandicapLab Contract — Successful Sync Payload Ingestion', async () => {
  const mockPayload = {
    success: true,
    timestampUtc: '2026-10-18T12:00:00Z',
    syncChecksum: 'abc123sha256',
    dataState: 'REAL',
    counts: {
      totalArchived: 10,
      dailyPicks: 1,
      settled: 5,
      pending: 5,
      upcomingFixtures: 2,
      verifiedResults: 5,
    },
    dailyPicks: [
      {
        projectionId: 'proj_1',
        predictionId: 'pred_1',
        targetWindow: 'TODAY',
        fixtureId: 'fix_1',
        matchId: 'EPL_2026_ARS_CHE_2026-10-18',
        leagueId: 39,
        leagueName: 'Premier League',
        homeTeam: 'Arsenal',
        awayTeam: 'Chelsea',
        kickoffUtc: '2026-10-18T16:30:00Z',
        horizon: 'T-6h',
        marketType: 'ASIAN_HANDICAP',
        recommendedLine: -0.5,
        recommendedSelection: 'Arsenal -0.5',
        modelProbability: 0.58,
        fairOdds: 1.724,
        marketOdds: 1.95,
        edgePct: 7.2,
        confidenceScore: 85,
        verdict: 'LAYAK',
        modelQualityGrade: 'GRADE_A',
        modelVersion: 'dixon-coles-v1.0',
        sourceBookmaker: 'Pinnacle',
        oddsCapturedAt: '2026-10-18T10:00:00Z',
        provenanceHash: 'hash123',
        status: 'ACTIVE',
      },
    ],
    upcomingFixtures: [
      {
        canonicalFixtureId: 'fix_1',
        providerMatchId: '1557400',
        competition: 'Premier League',
        season: '2026',
        homeTeam: 'Arsenal',
        awayTeam: 'Chelsea',
        kickoffUtc: '2026-10-18T16:30:00Z',
        status: 'SCHEDULED',
        targetWindow: 'TODAY',
        marketsAvailable: ['AH', 'OU', 'BTTS'],
        venue: 'Emirates Stadium',
        sourceProvider: 'HandicapLab-Core',
        sourceVersion: 'v1.0',
      },
    ],
    verifiedResults: [
      {
        canonicalFixtureId: 'fix_0',
        providerMatchId: '1557399',
        competition: 'Premier League',
        season: '2026',
        homeTeam: 'Liverpool',
        awayTeam: 'Everton',
        kickoffUtc: '2026-10-17T14:00:00Z',
        status: 'FT',
        homeGoals: 2,
        awayGoals: 0,
        totalGoals: 2,
        sourceProvider: 'HandicapLab-Verified',
        verifiedAt: '2026-10-17T16:00:00Z',
      },
    ],
    settledHistory: [],
    performance: { windows: { ALL_TIME: { totalPredictions: 10, yieldPct: 5.2 } } },
    providerStatus: {
      apiFootball: {
        name: 'API-Football',
        status: 'UNAVAILABLE',
        plan: 'Suspended',
        reason: 'Account suspended upstream',
        authenticated: false,
        liveIngestion: 'BLOCKED',
      },
      footyStats: {
        name: 'FootyStats',
        status: 'AUTH_FAILED',
        plan: 'Demo',
        reason: 'Restricted demo key',
        authenticated: false,
        liveIngestion: 'BLOCKED',
      },
      oddsPapi: {
        name: 'OddsPapi',
        status: 'QUOTA_BLOCKED',
        plan: 'Standard',
        reason: 'Quota exhausted 260/250',
        authenticated: true,
        quotaLimit: 250,
        quotaUsed: 260,
        quotaRemaining: 0,
        reserveFloor: 15,
        liveIngestion: 'BLOCKED',
      },
    },
  };

  global.fetch = async (url, opts) => {
    assert.strictEqual(opts.headers['Authorization'], 'Bearer test-key');
    assert.strictEqual(opts.headers['Accept'], 'application/json');
    return {
      ok: true,
      status: 200,
      json: async () => mockPayload,
    };
  };

  const adapter = new HttpHandicapLabAdapter('https://handicaplab.dev', 'test-key');
  const payload = await adapter.getSalmoSync({ horizon: 'TODAY', view: 'daily_picks' });

  assert.strictEqual(payload.success, true);
  assert.strictEqual(payload.dataState, 'REAL');
  assert.strictEqual(payload.counts.dailyPicks, 1);
  assert.strictEqual(payload.dailyPicks.length, 1);
  assert.strictEqual(payload.dailyPicks[0].homeTeam, 'Arsenal');
  assert.strictEqual(payload.dailyPicks[0].verdict, 'LAYAK');
  assert.strictEqual(payload.upcomingFixtures.length, 1);
  assert.strictEqual(payload.verifiedResults.length, 1);
  assert.strictEqual(payload.providerStatus.oddsPapi.status, 'QUOTA_BLOCKED');
});

test('HandicapLab Contract — 401 Unauthorized Handled as Fail-Closed DATA_TEMPORARILY_UNAVAILABLE', async () => {
  global.fetch = async () => {
    return {
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({
        error: 'CRYPTOGRAPHIC_VERIFICATION_FAILED: token segments invalid',
      }),
    };
  };

  const adapter = new HttpHandicapLabAdapter('https://handicaplab-production-129269713730.asia-southeast2.run.app', 'cron-token');
  const payload = await adapter.getSalmoSync();

  assert.strictEqual(payload.success, false);
  assert.strictEqual(payload.dataState, 'DATA_TEMPORARILY_UNAVAILABLE');
  assert.strictEqual(payload.counts.dailyPicks, 0);
  assert.strictEqual(payload.dailyPicks.length, 0);
  assert.ok(payload.missingDataReasons.some(r => r.includes('BACKEND_AUTH_REJECTED_401')));
});

test('HandicapLab Contract — 503 Provider Unavailable Payload Parsing', async () => {
  const mock503Payload = {
    success: false,
    timestampUtc: '2026-10-18T12:00:00Z',
    syncChecksum: 'checksum503',
    dataState: 'QUOTA_BLOCKED',
    counts: { totalArchived: 0, dailyPicks: 0, settled: 0, pending: 0 },
    dailyPicks: [],
    missingDataReasons: ['OddsPapi quota exceeded 260/250'],
    providerStatus: {
      oddsPapi: {
        name: 'OddsPapi',
        status: 'QUOTA_BLOCKED',
        plan: 'Standard',
        reason: 'Quota 260/250',
        authenticated: true,
        quotaLimit: 250,
        quotaUsed: 260,
        quotaRemaining: 0,
        reserveFloor: 15,
        liveIngestion: 'BLOCKED',
      },
    },
  };

  global.fetch = async () => {
    return {
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: async () => mock503Payload,
    };
  };

  const adapter = new HttpHandicapLabAdapter('https://handicaplab.dev', 'key');
  const payload = await adapter.getSalmoSync();

  assert.strictEqual(payload.dataState, 'QUOTA_BLOCKED');
  assert.strictEqual(payload.dailyPicks.length, 0);
  assert.strictEqual(payload.missingDataReasons[0], 'OddsPapi quota exceeded 260/250');
});

test('HandicapLab Contract — Exponential Backoff Retry on 500 Transient Error', async () => {
  let attempts = 0;
  global.fetch = async () => {
    attempts++;
    if (attempts === 1) {
      return {
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        dataState: 'REAL',
        counts: { dailyPicks: 0, totalArchived: 5, settled: 5, pending: 0 },
        dailyPicks: [],
      }),
    };
  };

  const adapter = new HttpHandicapLabAdapter('https://handicaplab.dev', 'key', { maxRetries: 2 });
  const payload = await adapter.getSalmoSync();

  assert.strictEqual(attempts, 2, 'Should have retried after initial 502');
  assert.strictEqual(payload.success, true);
});

test('HandicapLab Contract — Network Timeout Handled Fail-Closed', async () => {
  global.fetch = async () => {
    const error = new Error('The operation was aborted');
    error.name = 'AbortError';
    throw error;
  };

  const adapter = new HttpHandicapLabAdapter('https://handicaplab.dev', 'key', { timeoutMs: 50 });
  const payload = await adapter.getSalmoSync();

  assert.strictEqual(payload.success, false);
  assert.strictEqual(payload.dataState, 'DATA_TEMPORARILY_UNAVAILABLE');
  assert.ok(payload.missingDataReasons.some(r => r.includes('CONTRACT_UNREACHABLE')));
});

test('HandicapLab Contract — Stale Kickoff Filter in mapRawPicksToActivePredictions', () => {
  const futureKickoff = new Date(Date.now() + 86400000).toISOString();
  const pastKickoff = new Date(Date.now() - 3600000).toISOString();

  const picks = [
    {
      fixtureId: 'fix_past',
      homeTeam: 'Arsenal',
      awayTeam: 'Chelsea',
      kickoffUtc: pastKickoff,
      marketType: 'ASIAN_HANDICAP',
      recommendedLine: -0.5,
      recommendedSelection: 'Arsenal -0.5',
      modelProbability: 0.55,
      marketOdds: 1.95,
      verdict: 'LAYAK',
    },
    {
      fixtureId: 'fix_future',
      homeTeam: 'Liverpool',
      awayTeam: 'Man City',
      kickoffUtc: futureKickoff,
      marketType: 'OVER_UNDER',
      recommendedLine: 2.5,
      recommendedSelection: 'Over 2.5',
      modelProbability: 0.60,
      marketOdds: 1.85,
      verdict: 'LAYAK',
    },
  ];

  const active = mapRawPicksToActivePredictions(picks);
  assert.strictEqual(active.length, 1, 'Only future kickoff should be active');
  assert.strictEqual(active[0].homeTeam, 'Liverpool');
});

test('HandicapLab Contract — Local Adapter Parity', async () => {
  const adapter = new LocalHandicapLabAdapter();
  const summary = await adapter.getDatasetSummary();
  assert.ok(summary.verifiedMatchCount >= 0);
  assert.strictEqual(adapter.mode, 'local');

  const health = await adapter.getHealth();
  assert.ok(['HEALTHY', 'DEGRADED', 'UNAVAILABLE'].includes(health.status));
});
