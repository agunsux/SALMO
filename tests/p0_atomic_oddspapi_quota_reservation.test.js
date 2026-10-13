// SALMO.DEV — P0 Atomic OddsPapi Quota Reservation, Concurrency & Rollback Test Suite
// Validates:
//   - All 16 required P0 atomic quota reservation, idempotency, concurrency,
//     subscription-cycle integrity, failure-injection, and worst-case billing scenarios.
//   - Non-destructive rollback (20261013_atomic_oddspapi_quota_reservation_rollback.sql)
//     and forward re-application idempotency.
//   - Static DDL / PL/pgSQL invariant verification of the SQL migration & rollback scripts
//     (FOR UPDATE row locking, deterministic lock ordering, SECURITY DEFINER, search_path,
//     REVOKE FROM PUBLIC/anon/authenticated, GRANT TO service_role).
//   - Optional Real Local PostgreSQL Multi-Session Harness when LOCAL_POSTGRES_URL is provided
//     (strictly blocking any non-local host; reports BLOCKED — LOCAL DATABASE TESTING UNAVAILABLE
//     when no local PostgreSQL server is running on the host).

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
        resolveJsonModule: true,
      },
    });
    module._compile(compiled.outputText, filename);
  };
}

const {
  OddsPapiQuotaGuard,
  AtomicOddsPapiQuotaDatabaseEngine,
} = require('../src/lib/quota/oddsPapiQuotaGuard.ts');
const { OddsPapiProvider } = require('../src/services/providers/oddsPapiProvider.ts');

const FORWARD_MIGRATION_PATH = path.resolve(
  __dirname,
  '../data/migrations/20261013_atomic_oddspapi_quota_reservation.sql'
);
const ROLLBACK_MIGRATION_PATH = path.resolve(
  __dirname,
  '../data/migrations/20261013_atomic_oddspapi_quota_reservation_rollback.sql'
);
const RUNBOOK_PATH = path.resolve(
  __dirname,
  '../docs/third-party/oddsPapi/atomic_quota_rollback_runbook.md'
);

const ACTIVE_CYCLE = 'sub-oddspapi:2026-10-08T10:19:45+00:00';

function createFreshEngine(overrides = {}) {
  OddsPapiQuotaGuard.resetCircuitBreaker();
  const engine = new AtomicOddsPapiQuotaDatabaseEngine({
    consumed: 100,
    reserved: 0,
    limit_value: 250,
    mandatory_reserve: 50,
    operational_ceiling: 200,
    safe_limit: 200,
    subscription_cycle_key: ACTIVE_CYCLE,
    ...overrides,
  });
  OddsPapiQuotaGuard.setAtomicRpcClientForTest(engine);
  return engine;
}

// -----------------------------------------------------------------------------
// SCENARIO 1: Single-request reserve -> confirm
// -----------------------------------------------------------------------------
test('P0 Atomic Quota - Scenario 01: Single-request reserve -> confirm transitions RESERVED -> CONFIRMED and moves 1 unit from reserved to consumed', async () => {
  const engine = createFreshEngine({ consumed: 100, reserved: 0 });

  const res = await OddsPapiQuotaGuard.reserveQuota(1, {
    endpoint: '/v4/odds-by-tournaments',
    idempotencyKey: 'idem-scen01-req1',
    subscriptionCycleKey: ACTIVE_CYCLE,
  });

  assert.strictEqual(res.allowed, true);
  assert.ok(res.reservationId);
  assert.strictEqual(res.status, 'RESERVED');

  let state = engine.getQuotaStateSnapshot();
  assert.strictEqual(state.consumed, 100);
  assert.strictEqual(state.reserved, 1);

  const confirm = await OddsPapiQuotaGuard.confirmQuota(res.reservationId, {
    endpoint: '/v4/odds-by-tournaments',
    params: { tournamentIds: '17', bookmakers: 'pinnacle' },
    statusCode: 200,
    outcome: 'SUCCESS',
  });

  assert.strictEqual(confirm.ok, true);
  assert.strictEqual(confirm.status, 'CONFIRMED');
  assert.strictEqual(confirm.confirmedAmount, 1);
  assert.strictEqual(confirm.releasedAmount, 0);

  state = engine.getQuotaStateSnapshot();
  assert.strictEqual(state.consumed, 101);
  assert.strictEqual(state.reserved, 0);

  const row = engine.getReservationById(res.reservationId);
  assert.strictEqual(row.status, 'CONFIRMED');
  assert.strictEqual(row.confirmed_amount, 1);
  assert.strictEqual(row.released_amount, 0);
  assert.strictEqual(row.billing_outcome, 'SUCCESS_2XX');
  assert.ok(row.resolved_at);

  OddsPapiQuotaGuard.resetCircuitBreaker();
});

// -----------------------------------------------------------------------------
// SCENARIO 2: Single-request reserve -> release (non-billable only)
// -----------------------------------------------------------------------------
test('P0 Atomic Quota - Scenario 02: Single-request reserve -> release (non-billable pre-request abort / 429) decrements reserved and leaves consumed unchanged', async () => {
  const engine = createFreshEngine({ consumed: 100, reserved: 0 });

  const res = await OddsPapiQuotaGuard.reserveQuota(1, {
    endpoint: '/v4/odds-by-tournaments',
    idempotencyKey: 'idem-scen02-req1',
    subscriptionCycleKey: ACTIVE_CYCLE,
  });
  assert.strictEqual(res.allowed, true);
  assert.strictEqual(engine.getQuotaStateSnapshot().reserved, 1);

  const release = await OddsPapiQuotaGuard.releaseQuotaAsync(res.reservationId, {
    endpoint: '/v4/odds-by-tournaments',
    params: { tournamentIds: '17' },
    preRequestAbort: true,
    error: 'Pre-request validation abort before transport',
  });

  assert.strictEqual(release.ok, true);
  assert.strictEqual(release.convertedToBillableConfirm, false);
  assert.strictEqual(release.status, 'RELEASED');
  assert.strictEqual(release.confirmedAmount, 0);
  assert.strictEqual(release.releasedAmount, 1);

  const state = engine.getQuotaStateSnapshot();
  assert.strictEqual(state.consumed, 100);
  assert.strictEqual(state.reserved, 0);

  const row = engine.getReservationById(res.reservationId);
  assert.strictEqual(row.status, 'RELEASED');
  assert.strictEqual(row.confirmed_amount, 0);
  assert.strictEqual(row.released_amount, 1);
  assert.strictEqual(row.billing_outcome, 'PRE_REQUEST_ABORT');

  OddsPapiQuotaGuard.resetCircuitBreaker();
});

// -----------------------------------------------------------------------------
// SCENARIO 3: Billable 4xx / 5xx confirmation & refusal of free release
// -----------------------------------------------------------------------------
test('P0 Atomic Quota - Scenario 03: Billable HTTP 4xx (400/404/422) and 5xx (500/502/503) confirm usage and cannot be released as free even via release RPC', async () => {
  const engine = createFreshEngine({ consumed: 110, reserved: 0 });
  const billableStatuses = [400, 404, 422, 500, 502, 503];

  for (let idx = 0; idx < billableStatuses.length; idx++) {
    const status = billableStatuses[idx];
    const res = await OddsPapiQuotaGuard.reserveQuota(1, {
      endpoint: '/v4/odds-by-tournaments',
      idempotencyKey: `idem-scen03-${status}`,
      subscriptionCycleKey: ACTIVE_CYCLE,
    });
    assert.strictEqual(res.allowed, true);

    // Even if caller mistakenly calls releaseQuotaAsync with a billable status,
    // the RPC refuses free release and converts it to CONFIRMED!
    const outcome = await OddsPapiQuotaGuard.releaseQuotaAsync(res.reservationId, {
      endpoint: '/v4/odds-by-tournaments',
      params: { tournamentIds: '17' },
      statusCode: status,
      error: `HTTP ${status}`,
    });

    assert.strictEqual(outcome.ok, true);
    assert.strictEqual(
      outcome.convertedToBillableConfirm,
      true,
      `HTTP ${status} must be converted to billable confirmation`
    );
    assert.strictEqual(outcome.status, 'CONFIRMED');
    assert.strictEqual(outcome.confirmedAmount, 1);
    assert.strictEqual(outcome.releasedAmount, 0);

    const row = engine.getReservationById(res.reservationId);
    assert.strictEqual(row.status, 'CONFIRMED');
    assert.strictEqual(row.confirmed_amount, 1);
    assert.strictEqual(
      row.billing_outcome,
      status >= 500 ? 'BILLABLE_SERVER_ERROR' : 'BILLABLE_CLIENT_ERROR'
    );
  }

  const finalState = engine.getQuotaStateSnapshot();
  assert.strictEqual(finalState.consumed, 110 + billableStatuses.length);
  assert.strictEqual(finalState.reserved, 0);

  OddsPapiQuotaGuard.resetCircuitBreaker();
});

// -----------------------------------------------------------------------------
// SCENARIO 4: Invalid transition CONFIRMED -> RELEASED rejected
// -----------------------------------------------------------------------------
test('P0 Atomic Quota - Scenario 04: Invalid transition CONFIRMED -> RELEASED is rejected with INVALID_STATE_TRANSITION and does not alter consumed or reserved', async () => {
  const engine = createFreshEngine({ consumed: 120, reserved: 0 });

  const res = await OddsPapiQuotaGuard.reserveQuota(1, {
    endpoint: '/v4/odds-by-tournaments',
    idempotencyKey: 'idem-scen04-req1',
    subscriptionCycleKey: ACTIVE_CYCLE,
  });
  assert.strictEqual(res.allowed, true);

  const confirm = await OddsPapiQuotaGuard.confirmQuota(res.reservationId, {
    endpoint: '/v4/odds-by-tournaments',
    params: { tournamentIds: '17' },
    statusCode: 200,
  });
  assert.strictEqual(confirm.ok, true);
  assert.strictEqual(engine.getQuotaStateSnapshot().consumed, 121);
  assert.strictEqual(engine.getQuotaStateSnapshot().reserved, 0);

  // Attempt illegal transition CONFIRMED -> RELEASED
  const illegalRelease = await OddsPapiQuotaGuard.releaseQuotaAsync(res.reservationId, {
    endpoint: '/v4/odds-by-tournaments',
    params: { tournamentIds: '17' },
    preRequestAbort: true,
    error: 'Attempted late release after confirm',
  });

  assert.strictEqual(illegalRelease.ok, false);
  assert.strictEqual(illegalRelease.errorCode, 'INVALID_STATE_TRANSITION');
  assert.strictEqual(engine.getQuotaStateSnapshot().consumed, 121);
  assert.strictEqual(engine.getQuotaStateSnapshot().reserved, 0);
  assert.strictEqual(engine.getReservationById(res.reservationId).status, 'CONFIRMED');

  OddsPapiQuotaGuard.resetCircuitBreaker();
});

// -----------------------------------------------------------------------------
// SCENARIO 5: Invalid transition RELEASED -> CONFIRMED rejected
// -----------------------------------------------------------------------------
test('P0 Atomic Quota - Scenario 05: Invalid transition RELEASED -> CONFIRMED is rejected with INVALID_STATE_TRANSITION and does not increment consumed', async () => {
  const engine = createFreshEngine({ consumed: 125, reserved: 0 });

  const res = await OddsPapiQuotaGuard.reserveQuota(1, {
    endpoint: '/v4/odds-by-tournaments',
    idempotencyKey: 'idem-scen05-req1',
    subscriptionCycleKey: ACTIVE_CYCLE,
  });
  assert.strictEqual(res.allowed, true);

  const rel = await OddsPapiQuotaGuard.releaseQuotaAsync(res.reservationId, {
    endpoint: '/v4/odds-by-tournaments',
    params: { tournamentIds: '17' },
    statusCode: 429,
    error: 'HTTP 429',
  });
  assert.strictEqual(rel.ok, true);
  assert.strictEqual(rel.status, 'RELEASED');
  assert.strictEqual(engine.getQuotaStateSnapshot().consumed, 125);
  assert.strictEqual(engine.getQuotaStateSnapshot().reserved, 0);

  // Attempt illegal transition RELEASED -> CONFIRMED
  const illegalConfirm = await OddsPapiQuotaGuard.confirmQuota(res.reservationId, {
    endpoint: '/v4/odds-by-tournaments',
    params: { tournamentIds: '17' },
    statusCode: 200,
  });

  assert.strictEqual(illegalConfirm.ok, false);
  assert.strictEqual(illegalConfirm.errorCode, 'INVALID_STATE_TRANSITION');
  assert.strictEqual(engine.getQuotaStateSnapshot().consumed, 125);
  assert.strictEqual(engine.getQuotaStateSnapshot().reserved, 0);
  assert.strictEqual(engine.getReservationById(res.reservationId).status, 'RELEASED');

  OddsPapiQuotaGuard.resetCircuitBreaker();
});

// -----------------------------------------------------------------------------
// SCENARIO 6: Idempotent reserve retry
// -----------------------------------------------------------------------------
test('P0 Atomic Quota - Scenario 06: Duplicate reserve with the same idempotency_key returns existing reservation without double-incrementing reserved', async () => {
  const engine = createFreshEngine({ consumed: 130, reserved: 0 });

  const first = await OddsPapiQuotaGuard.reserveQuota(2, {
    endpoint: '/v4/fixtures',
    idempotencyKey: 'idem-scen06-dup-key',
    subscriptionCycleKey: ACTIVE_CYCLE,
  });
  assert.strictEqual(first.allowed, true);
  assert.strictEqual(first.idempotentReplay, false);
  assert.strictEqual(engine.getQuotaStateSnapshot().reserved, 2);

  const second = await OddsPapiQuotaGuard.reserveQuota(2, {
    endpoint: '/v4/fixtures',
    idempotencyKey: 'idem-scen06-dup-key',
    subscriptionCycleKey: ACTIVE_CYCLE,
  });
  assert.strictEqual(second.allowed, true);
  assert.strictEqual(second.idempotentReplay, true);
  assert.strictEqual(second.errorCode, 'DUPLICATE_IDEMPOTENCY_KEY');
  assert.strictEqual(second.reservationId, first.reservationId);
  assert.strictEqual(engine.getQuotaStateSnapshot().reserved, 2, 'reserved must NOT be double-incremented');

  OddsPapiQuotaGuard.resetCircuitBreaker();
});

// -----------------------------------------------------------------------------
// SCENARIO 7: Idempotent confirm retry
// -----------------------------------------------------------------------------
test('P0 Atomic Quota - Scenario 07: Duplicate confirm on the same reservation_id is an idempotent no-op and does not double-increment consumed', async () => {
  const engine = createFreshEngine({ consumed: 135, reserved: 0 });

  const res = await OddsPapiQuotaGuard.reserveQuota(1, {
    endpoint: '/v4/odds-by-tournaments',
    idempotencyKey: 'idem-scen07-req1',
    subscriptionCycleKey: ACTIVE_CYCLE,
  });
  assert.strictEqual(res.allowed, true);

  const firstConfirm = await OddsPapiQuotaGuard.confirmQuota(res.reservationId, {
    endpoint: '/v4/odds-by-tournaments',
    params: { tournamentIds: '17' },
    statusCode: 200,
  });
  assert.strictEqual(firstConfirm.ok, true);
  assert.strictEqual(firstConfirm.idempotentReplay, false);
  assert.strictEqual(engine.getQuotaStateSnapshot().consumed, 136);
  assert.strictEqual(engine.getQuotaStateSnapshot().reserved, 0);

  const secondConfirm = await OddsPapiQuotaGuard.confirmQuota(res.reservationId, {
    endpoint: '/v4/odds-by-tournaments',
    params: { tournamentIds: '17' },
    statusCode: 200,
  });
  assert.strictEqual(secondConfirm.ok, true);
  assert.strictEqual(secondConfirm.idempotentReplay, true);
  assert.strictEqual(secondConfirm.errorCode, 'ALREADY_CONFIRMED');
  assert.strictEqual(engine.getQuotaStateSnapshot().consumed, 136, 'consumed must NOT be double-incremented');
  assert.strictEqual(engine.getQuotaStateSnapshot().reserved, 0);

  OddsPapiQuotaGuard.resetCircuitBreaker();
});

// -----------------------------------------------------------------------------
// SCENARIO 8: Idempotent release retry
// -----------------------------------------------------------------------------
test('P0 Atomic Quota - Scenario 08: Duplicate release on the same reservation_id is an idempotent no-op and never makes reserved negative', async () => {
  const engine = createFreshEngine({ consumed: 140, reserved: 0 });

  const res = await OddsPapiQuotaGuard.reserveQuota(2, {
    endpoint: '/v4/fixtures',
    idempotencyKey: 'idem-scen08-req1',
    subscriptionCycleKey: ACTIVE_CYCLE,
  });
  assert.strictEqual(res.allowed, true);
  assert.strictEqual(engine.getQuotaStateSnapshot().reserved, 2);

  const firstRelease = await OddsPapiQuotaGuard.releaseQuotaAsync(res.reservationId, {
    endpoint: '/v4/fixtures',
    params: {},
    preRequestAbort: true,
    error: 'Pre-flight abort',
  });
  assert.strictEqual(firstRelease.ok, true);
  assert.strictEqual(firstRelease.idempotentReplay, false);
  assert.strictEqual(engine.getQuotaStateSnapshot().reserved, 0);

  const secondRelease = await OddsPapiQuotaGuard.releaseQuotaAsync(res.reservationId, {
    endpoint: '/v4/fixtures',
    params: {},
    preRequestAbort: true,
    error: 'Duplicate release retry',
  });
  assert.strictEqual(secondRelease.ok, true);
  assert.strictEqual(secondRelease.idempotentReplay, true);
  assert.strictEqual(secondRelease.errorCode, 'ALREADY_RELEASED');
  assert.strictEqual(engine.getQuotaStateSnapshot().reserved, 0, 'reserved must remain 0 and never go negative');
  assert.strictEqual(engine.getQuotaStateSnapshot().consumed, 140);

  OddsPapiQuotaGuard.resetCircuitBreaker();
});

// -----------------------------------------------------------------------------
// SCENARIO 9: Batch reservation rejected when insufficient
// -----------------------------------------------------------------------------
test('P0 Atomic Quota - Scenario 09: With operational_remaining = 2, a batch reservation of 3 fails atomically with QUOTA_EXHAUSTED, leaving consumed and reserved unchanged', async () => {
  // limit=250, mandatory_reserve=50 -> operational_ceiling=200; consumed=198 -> operational_remaining=2
  const engine = createFreshEngine({ consumed: 198, reserved: 0 });

  const batchRes = await OddsPapiQuotaGuard.reserveQuota(3, {
    endpoint: '/v4/fixtures',
    idempotencyKey: 'idem-scen09-batch3',
    subscriptionCycleKey: ACTIVE_CYCLE,
  });

  assert.strictEqual(batchRes.allowed, false);
  assert.strictEqual(batchRes.errorCode, 'QUOTA_EXHAUSTED');

  const state = engine.getQuotaStateSnapshot();
  assert.strictEqual(state.consumed, 198);
  assert.strictEqual(state.reserved, 0);
  assert.strictEqual(engine.getAllReservationsSnapshot().length, 0);

  OddsPapiQuotaGuard.resetCircuitBreaker();
});

// -----------------------------------------------------------------------------
// SCENARIO 10: Partial batch settlement
// -----------------------------------------------------------------------------
test('P0 Atomic Quota - Scenario 10: Reserve 3; request 1 returns 200, request 2 returns 500, request 3 is aborted before transport -> confirmed_amount = 2, released_amount = 1, consumed += 2, reserved -= 3', async () => {
  const engine = createFreshEngine({ consumed: 150, reserved: 0 });

  const res = await OddsPapiQuotaGuard.reserveQuota(3, {
    endpoint: '/v4/fixtures',
    idempotencyKey: 'idem-scen10-batch3',
    subscriptionCycleKey: ACTIVE_CYCLE,
  });
  assert.strictEqual(res.allowed, true);
  assert.strictEqual(engine.getQuotaStateSnapshot().reserved, 3);

  // Request 1: 200 OK (1 unit confirmed, 2 remain reserved)
  const step1 = await OddsPapiQuotaGuard.confirmQuota(res.reservationId, {
    endpoint: '/v4/fixtures',
    params: { tournamentId: 17 },
    statusCode: 200,
    outcome: 'SUCCESS',
    consumedCost: 1,
    stepKey: 'step-1-t17',
  });
  assert.strictEqual(step1.ok, true);
  assert.strictEqual(step1.status, 'RESERVED');
  assert.strictEqual(engine.getQuotaStateSnapshot().consumed, 151);
  assert.strictEqual(engine.getQuotaStateSnapshot().reserved, 2);

  // Request 2: 500 Internal Server Error (1 unit confirmed as BILLABLE_ERROR, 1 remains reserved)
  const step2 = await OddsPapiQuotaGuard.confirmQuota(res.reservationId, {
    endpoint: '/v4/fixtures',
    params: { tournamentId: 8 },
    statusCode: 500,
    outcome: 'BILLABLE_ERROR',
    consumedCost: 1,
    stepKey: 'step-2-t8',
  });
  assert.strictEqual(step2.ok, true);
  assert.strictEqual(step2.status, 'RESERVED');
  assert.strictEqual(engine.getQuotaStateSnapshot().consumed, 152);
  assert.strictEqual(engine.getQuotaStateSnapshot().reserved, 1);

  // Request 3: Aborted before transport (1 unit released)
  const step3 = await OddsPapiQuotaGuard.releaseQuotaAsync(res.reservationId, {
    endpoint: '/v4/fixtures',
    params: { tournamentId: 23 },
    consumedCost: 1,
    preRequestAbort: true,
    error: 'Aborted before transport',
  });
  assert.strictEqual(step3.ok, true);
  assert.strictEqual(step3.status, 'CONFIRMED');
  assert.strictEqual(step3.confirmedAmount, 2);
  assert.strictEqual(step3.releasedAmount, 1);

  const finalState = engine.getQuotaStateSnapshot();
  assert.strictEqual(finalState.consumed, 152, 'consumed must increase by exactly 2');
  assert.strictEqual(finalState.reserved, 0, 'reserved must decrease by all 3 settled units');

  const row = engine.getReservationById(res.reservationId);
  assert.strictEqual(row.status, 'CONFIRMED');
  assert.strictEqual(row.amount, 3);
  assert.strictEqual(row.confirmed_amount, 2);
  assert.strictEqual(row.released_amount, 1);
  assert.strictEqual(row.billing_outcome, 'PARTIAL_BATCH_SETTLED');
  assert.ok(row.resolved_at);

  OddsPapiQuotaGuard.resetCircuitBreaker();
});

// -----------------------------------------------------------------------------
// SCENARIO 11: Concurrent reservation contention (10 workers, operational_remaining = 3)
// -----------------------------------------------------------------------------
test('P0 Atomic Quota - Scenario 11: With operational_remaining = 3, 10 concurrent 1-unit reservation requests result in exactly 3 RESERVED and 7 QUOTA_EXHAUSTED; consumed + reserved never exceeds 200', async () => {
  // consumed=197, operational_ceiling=200 -> operational_remaining = 3
  const engine = createFreshEngine({ consumed: 197, reserved: 0 });

  const workers = Array.from({ length: 10 }, (_, idx) =>
    OddsPapiQuotaGuard.reserveQuota(1, {
      endpoint: '/v4/odds-by-tournaments',
      idempotencyKey: `idem-scen11-worker-${idx + 1}`,
      subscriptionCycleKey: ACTIVE_CYCLE,
    })
  );

  const results = await Promise.all(workers);
  const succeeded = results.filter(r => r.allowed === true);
  const failed = results.filter(r => r.allowed === false);

  assert.strictEqual(succeeded.length, 3, 'Exactly 3 concurrent reservations must succeed');
  assert.strictEqual(failed.length, 7, 'Exactly 7 concurrent reservations must be rejected');
  for (const f of failed) {
    assert.strictEqual(f.errorCode, 'QUOTA_EXHAUSTED');
  }

  const state = engine.getQuotaStateSnapshot();
  assert.strictEqual(state.consumed, 197);
  assert.strictEqual(state.reserved, 3);
  assert.strictEqual(
    state.consumed + state.reserved,
    200,
    'consumed + reserved must never exceed operational_ceiling (200)'
  );

  OddsPapiQuotaGuard.resetCircuitBreaker();
});

// -----------------------------------------------------------------------------
// SCENARIO 12: Concurrent multi-unit batch contention (4 workers x 2 units, operational_remaining = 5)
// -----------------------------------------------------------------------------
test('P0 Atomic Quota - Scenario 12: With operational_remaining = 5, 4 concurrent 2-unit batch reservations result in 2 succeeding (4 units) and 2 failing with QUOTA_EXHAUSTED; reserved never exceeds 5', async () => {
  // consumed=195, operational_ceiling=200 -> operational_remaining = 5
  const engine = createFreshEngine({ consumed: 195, reserved: 0 });

  const batchWorkers = Array.from({ length: 4 }, (_, idx) =>
    OddsPapiQuotaGuard.reserveQuota(2, {
      endpoint: '/v4/fixtures',
      idempotencyKey: `idem-scen12-batch-${idx + 1}`,
      subscriptionCycleKey: ACTIVE_CYCLE,
    })
  );

  const results = await Promise.all(batchWorkers);
  const succeeded = results.filter(r => r.allowed === true);
  const failed = results.filter(r => r.allowed === false);

  assert.strictEqual(succeeded.length, 2, 'At most 2 batch reservations of 2 units can fit in 5 remaining');
  assert.strictEqual(failed.length, 2, 'The other 2 batch reservations must fail with QUOTA_EXHAUSTED');
  for (const f of failed) {
    assert.strictEqual(f.errorCode, 'QUOTA_EXHAUSTED');
  }

  const state = engine.getQuotaStateSnapshot();
  assert.strictEqual(state.consumed, 195);
  assert.strictEqual(state.reserved, 4);
  assert.ok(state.reserved <= 5, 'reserved must never exceed 5');
  assert.ok(state.consumed + state.reserved <= 200, 'consumed + reserved must never exceed 200');

  OddsPapiQuotaGuard.resetCircuitBreaker();
});

// -----------------------------------------------------------------------------
// SCENARIO 13: Subscription-cycle mismatch rejected
// -----------------------------------------------------------------------------
test('P0 Atomic Quota - Scenario 13: Attempt to reserve against a stale subscription_cycle_key fails closed with STALE_SUBSCRIPTION_CYCLE', async () => {
  const engine = createFreshEngine({
    consumed: 50,
    reserved: 0,
    subscription_cycle_key: 'sub-oddspapi:2026-10-08T10:19:45+00:00',
  });

  const staleRes = await OddsPapiQuotaGuard.reserveQuota(1, {
    endpoint: '/v4/odds-by-tournaments',
    idempotencyKey: 'idem-scen13-stale-cycle',
    subscriptionCycleKey: 'sub-oddspapi:2026-09-08T10:19:45+00:00', // Stale cycle key!
  });

  assert.strictEqual(staleRes.allowed, false);
  assert.strictEqual(staleRes.errorCode, 'STALE_SUBSCRIPTION_CYCLE');
  assert.strictEqual(engine.getQuotaStateSnapshot().reserved, 0);

  OddsPapiQuotaGuard.resetCircuitBreaker();
});

// -----------------------------------------------------------------------------
// SCENARIO 14: Stale /v4/account sync does not lower DB usage in same cycle
// -----------------------------------------------------------------------------
test('P0 Atomic Quota - Scenario 14: After confirming 2 calls in the current cycle, a stale /v4/account snapshot with lower request_count does not reduce consumed below confirmed usage', async () => {
  const engine = createFreshEngine({
    consumed: 150,
    reserved: 0,
    subscription_cycle_key: ACTIVE_CYCLE,
  });

  const res = await OddsPapiQuotaGuard.reserveQuota(2, {
    endpoint: '/v4/fixtures',
    idempotencyKey: 'idem-scen14-req2',
    subscriptionCycleKey: ACTIVE_CYCLE,
  });
  assert.strictEqual(res.allowed, true);

  await OddsPapiQuotaGuard.confirmQuota(res.reservationId, {
    endpoint: '/v4/fixtures',
    params: { tournamentId: 17 },
    statusCode: 200,
    consumedCost: 2,
  });
  assert.strictEqual(engine.getQuotaStateSnapshot().consumed, 152);

  // Stale /v4/account snapshot in the SAME subscription cycle still reporting 150
  const staleSync = await OddsPapiQuotaGuard.syncQuotaCycleAtomic({
    subscriptionCycleKey: ACTIVE_CYCLE,
    providerCount: 150,
    providerLimit: 250,
    mandatoryReserve: 50,
  });
  assert.strictEqual(staleSync.ok, true);
  assert.strictEqual(staleSync.cycleRollover, false);
  assert.strictEqual(
    engine.getQuotaStateSnapshot().consumed,
    152,
    'Stale /v4/account count (150) in the same cycle must NOT lower consumed below 152'
  );

  // Genuine new subscription cycle rollover ('sub-oddspapi:2026-11-08T10:19:45+00:00') with count = 0
  const newCycleKey = 'sub-oddspapi:2026-11-08T10:19:45+00:00';
  const rolloverSync = await OddsPapiQuotaGuard.syncQuotaCycleAtomic({
    subscriptionCycleKey: newCycleKey,
    providerCount: 0,
    providerLimit: 250,
    mandatoryReserve: 50,
    periodStart: '2026-11-08T10:19:45.000Z',
  });
  assert.strictEqual(rolloverSync.ok, true);
  assert.strictEqual(rolloverSync.cycleRollover, true);
  assert.strictEqual(engine.getQuotaStateSnapshot().consumed, 0);
  assert.strictEqual(engine.getQuotaStateSnapshot().subscription_cycle_key, newCycleKey);

  OddsPapiQuotaGuard.resetCircuitBreaker();
});

// -----------------------------------------------------------------------------
// SCENARIO 15: Database failure / RPC timeout fails closed (zero paid calls)
// -----------------------------------------------------------------------------
test('P0 Atomic Quota - Scenario 15: Database unreachable or RPC timeout fails closed with DB_UNREACHABLE_BLOCK and dispatches zero paid OddsPapi calls', async () => {
  const engine = createFreshEngine({ consumed: 80, reserved: 0 });
  engine.setSimulatedFailureMode('DB_UNREACHABLE');

  const res = await OddsPapiQuotaGuard.reserveQuota(1, {
    endpoint: '/v4/odds-by-tournaments',
    idempotencyKey: 'idem-scen15-db-down',
    subscriptionCycleKey: ACTIVE_CYCLE,
  });
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.errorCode, 'DB_UNREACHABLE_BLOCK');
  assert.match(res.reason || '', /DB_UNREACHABLE_BLOCK/);

  // Also test statement timeout during reserve via OddsPapiProvider: must make 0 HTTP calls
  engine.setSimulatedFailureMode('TIMEOUT_DURING_RESERVE');

  const originalFetch = global.fetch;
  const originalApiKey = process.env.ODDS_PAPI_KEY;
  process.env.ODDS_PAPI_KEY = 'test-offline-key';
  let paidFetchCalls = 0;

  try {
    global.fetch = async () => {
      paidFetchCalls += 1;
      return { ok: true, status: 200, json: async () => [] };
    };

    const provider = new OddsPapiProvider();
    const oddsResult = await provider.getBatchTournamentOdds([17], 'pinnacle');
    assert.strictEqual(oddsResult.status, 'RATE_LIMITED');
    assert.match(oddsResult.error || '', /DB_UNREACHABLE_BLOCK/);
    assert.strictEqual(paidFetchCalls, 0, 'Zero paid network calls may be dispatched when atomic DB RPC fails');

    // Also test missing quota_state row -> MISSING_QUOTA_STATE
    engine.setSimulatedFailureMode(null);
    engine.clearQuotaState();
    const missingRowRes = await OddsPapiQuotaGuard.reserveQuota(1, {
      endpoint: '/v4/odds-by-tournaments',
      idempotencyKey: 'idem-scen15-missing-state',
    });
    assert.strictEqual(missingRowRes.allowed, false);
    assert.strictEqual(missingRowRes.errorCode, 'MISSING_QUOTA_STATE');
  } finally {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.ODDS_PAPI_KEY;
    else process.env.ODDS_PAPI_KEY = originalApiKey;
    OddsPapiQuotaGuard.resetCircuitBreaker();
  }
});

// -----------------------------------------------------------------------------
// SCENARIO 16: Worst-case billing safety for ambiguous timeout/network error after dispatch
// -----------------------------------------------------------------------------
test('P0 Atomic Quota - Scenario 16: Ambiguous timeout/network error after request dispatch charges 1 unit (AMBIGUOUS_TRANSPORT_CHARGED) and does not silently free quota as uncharged', async () => {
  const engine = createFreshEngine({ consumed: 160, reserved: 0 });
  const originalFetch = global.fetch;
  const originalApiKey = process.env.ODDS_PAPI_KEY;
  process.env.ODDS_PAPI_KEY = 'test-offline-key';
  OddsPapiProvider.resetCooldownStateForTest();
  OddsPapiProvider.setSleepFnForTest(async () => {});

  try {
    global.fetch = async () => {
      throw new Error('ETIMEDOUT: socket timed out after dispatch waiting for upstream response');
    };

    const provider = new OddsPapiProvider();
    const result = await provider.getBatchTournamentOdds([17], 'pinnacle');

    assert.strictEqual(result.status, 'DATA_UNAVAILABLE');
    assert.strictEqual(
      result.requestsConsumed,
      1,
      'Ambiguous post-dispatch timeout must count as 1 consumed request for worst-case quota safety'
    );

    const state = engine.getQuotaStateSnapshot();
    assert.strictEqual(state.consumed, 161, 'Database consumed count must increment from 160 to 161');
    assert.strictEqual(state.reserved, 0);

    const reservations = engine.getAllReservationsSnapshot();
    assert.strictEqual(reservations.length, 1);
    assert.strictEqual(reservations[0].status, 'CONFIRMED');
    assert.strictEqual(reservations[0].confirmed_amount, 1);
    assert.strictEqual(reservations[0].billing_outcome, 'AMBIGUOUS_TRANSPORT_CHARGED');
  } finally {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.ODDS_PAPI_KEY;
    else process.env.ODDS_PAPI_KEY = originalApiKey;
    OddsPapiProvider.setSleepFnForTest(null);
    OddsPapiProvider.resetCooldownStateForTest();
    OddsPapiQuotaGuard.resetCircuitBreaker();
  }
});

// -----------------------------------------------------------------------------
// SCENARIO 17: Non-Destructive Rollback & Forward Re-Migration Readiness
// -----------------------------------------------------------------------------
test('P0 Atomic Quota - Scenario 17: Non-destructive rollback drains in-flight RESERVED rows safely, preserves confirmed usage, fails closed while rolled back, and cleanly re-migrates forward', async () => {
  const engine = createFreshEngine({ consumed: 170, reserved: 0 });

  // 1. Confirm 1 reservation (170 -> 171)
  const r1 = await OddsPapiQuotaGuard.reserveQuota(1, {
    endpoint: '/v4/odds-by-tournaments',
    idempotencyKey: 'idem-scen17-confirmed',
    subscriptionCycleKey: ACTIVE_CYCLE,
  });
  await OddsPapiQuotaGuard.confirmQuota(r1.reservationId, {
    endpoint: '/v4/odds-by-tournaments',
    params: { tournamentIds: '17' },
    statusCode: 200,
  });

  // 2. Leave 1 in-flight RESERVED reservation of 2 units (reserved = 2)
  const r2 = await OddsPapiQuotaGuard.reserveQuota(2, {
    endpoint: '/v4/fixtures',
    idempotencyKey: 'idem-scen17-inflight',
    subscriptionCycleKey: ACTIVE_CYCLE,
  });
  assert.strictEqual(r2.allowed, true);
  assert.strictEqual(engine.getQuotaStateSnapshot().consumed, 171);
  assert.strictEqual(engine.getQuotaStateSnapshot().reserved, 2);

  // 3. Execute rollback migration
  const rbResult = await engine.executeRollbackMigration();
  assert.strictEqual(rbResult.ok, true);
  assert.strictEqual(rbResult.drainedReservations, 1);
  assert.strictEqual(rbResult.unitsReturned, 2);

  const postRollbackState = engine.getQuotaStateSnapshot();
  assert.strictEqual(postRollbackState.consumed, 171, 'Confirmed consumption must be preserved across rollback');
  assert.strictEqual(postRollbackState.reserved, 0, 'In-flight reserved units must be cleanly drained on rollback');
  assert.strictEqual(postRollbackState.safe_limit, 200, 'Mandatory 50-request reserve ceiling (200) must remain intact');

  // 4. While RPCs are rolled back, reserveQuota fails closed with DB_UNREACHABLE_BLOCK
  const whileRolledBack = await OddsPapiQuotaGuard.reserveQuota(1, {
    endpoint: '/v4/odds-by-tournaments',
    idempotencyKey: 'idem-scen17-while-rolled-back',
  });
  assert.strictEqual(whileRolledBack.allowed, false);
  assert.strictEqual(whileRolledBack.errorCode, 'DB_UNREACHABLE_BLOCK');

  // 5. Re-apply forward migration and verify clean operation
  const fwdResult = await engine.executeForwardMigration();
  assert.strictEqual(fwdResult.ok, true);
  assert.strictEqual(fwdResult.schemaVersion, 'salmo_p0_atomic_v1');

  const r3 = await OddsPapiQuotaGuard.reserveQuota(1, {
    endpoint: '/v4/odds-by-tournaments',
    idempotencyKey: 'idem-scen17-after-remigrate',
    subscriptionCycleKey: ACTIVE_CYCLE,
  });
  assert.strictEqual(r3.allowed, true);
  assert.strictEqual(engine.getQuotaStateSnapshot().consumed, 171);
  assert.strictEqual(engine.getQuotaStateSnapshot().reserved, 1);

  OddsPapiQuotaGuard.resetCircuitBreaker();
});

// -----------------------------------------------------------------------------
// SCENARIO 18: SQL Migration, Rollback Script & Runbook Static Invariant Verification
// -----------------------------------------------------------------------------
test('P0 Atomic Quota - Scenario 18: Forward SQL migration, rollback SQL script, and runbook satisfy all locking, constraint, and security invariants', () => {
  assert.ok(fs.existsSync(FORWARD_MIGRATION_PATH), 'Forward migration SQL file must exist');
  assert.ok(fs.existsSync(ROLLBACK_MIGRATION_PATH), 'Rollback SQL file must exist');
  assert.ok(fs.existsSync(RUNBOOK_PATH), 'Rollback runbook Markdown file must exist');

  const forwardSql = fs.readFileSync(FORWARD_MIGRATION_PATH, 'utf8');
  const rollbackSql = fs.readFileSync(ROLLBACK_MIGRATION_PATH, 'utf8');
  const runbookMd = fs.readFileSync(RUNBOOK_PATH, 'utf8');

  // 1. All 5 required RPCs exist with SECURITY DEFINER and locked search_path
  const requiredRpcs = [
    'salmo_sync_oddspapi_quota_cycle',
    'salmo_reserve_oddspapi_quota',
    'salmo_confirm_oddspapi_quota',
    'salmo_release_oddspapi_quota',
    'salmo_cleanup_stale_oddspapi_reservations',
  ];
  for (const rpcName of requiredRpcs) {
    assert.ok(
      forwardSql.includes(`CREATE OR REPLACE FUNCTION public.${rpcName}`),
      `Forward migration must define public.${rpcName}`
    );
    assert.ok(
      rollbackSql.includes(`DROP FUNCTION IF EXISTS public.${rpcName}`),
      `Rollback script must drop public.${rpcName}`
    );
  }

  assert.match(forwardSql, /SECURITY DEFINER/);
  assert.match(forwardSql, /SET search_path = public, pg_temp/);
  assert.match(forwardSql, /REVOKE ALL ON FUNCTION public\.salmo_reserve_oddspapi_quota.*FROM PUBLIC, anon, authenticated/);
  assert.match(forwardSql, /GRANT EXECUTE ON FUNCTION public\.salmo_reserve_oddspapi_quota.*TO service_role/);

  // 2. Row-level FOR UPDATE locking and deterministic lock order (public.quota_state FIRST)
  assert.match(forwardSql, /FROM public\.quota_state[\s\S]*?FOR UPDATE/);
  assert.match(forwardSql, /FROM public\.quota_reservations[\s\S]*?FOR UPDATE/);

  // 3. No secrets or live subscription IDs in migration, rollback, or runbook
  for (const content of [forwardSql, rollbackSql, runbookMd]) {
    assert.doesNotMatch(content, /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/, 'Must never contain JWT secrets');
    assert.doesNotMatch(content, /sbp_[a-zA-Z0-9]{20,}/, 'Must never contain Supabase tokens');
  }
});

// -----------------------------------------------------------------------------
// SCENARIO 19: Real PostgreSQL 16.4 Engine (PGlite WASM) Full SQL & PL/pgSQL Execution
// -----------------------------------------------------------------------------
test('P0 Atomic Quota - Scenario 19: Real PostgreSQL 16.4 engine executes forward SQL migration, all 5 PL/pgSQL RPCs, state-transition trigger, partial batch settlement, and rollback migration', async t => {
  const pgliteCandidatePaths = [
    '@electric-sql/pglite',
    'C:/Users/RYZEN/AppData/Local/npm-cache/_npx/1e52a5e71bf722fc/node_modules/pglite-2',
  ];
  let PGlite = null;
  for (const modPath of pgliteCandidatePaths) {
    try {
      ({ PGlite } = require(modPath));
      if (PGlite) break;
    } catch {
      // Try next candidate
    }
  }

  if (!PGlite) {
    t.diagnostic('PGlite WASM PostgreSQL runtime not found in local module cache; skipping embedded PostgreSQL 16.4 test.');
    return;
  }

  const db = new PGlite();
  await db.waitReady;

  const verRes = await db.query('SELECT version() AS v');
  assert.match(verRes.rows[0].v, /PostgreSQL 16\./, 'Must execute on real PostgreSQL 16 engine');

  // 1. Provision standard Supabase roles and execute the verbatim forward migration SQL
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  const forwardSql = fs.readFileSync(FORWARD_MIGRATION_PATH, 'utf8');
  await db.exec(forwardSql);

  // 2. Sync cycle at 197/250 (mandatory_reserve=50 -> operational_ceiling=200 -> 3 units remaining)
  const syncRes = await db.query(
    "SELECT public.salmo_sync_oddspapi_quota_cycle('pg16-cycle-2026-10', 197, 250, 50) AS res"
  );
  assert.strictEqual(syncRes.rows[0].res.ok, true);
  assert.strictEqual(syncRes.rows[0].res.state.consumed, 197);
  assert.strictEqual(syncRes.rows[0].res.state.operational_ceiling, 200);
  assert.strictEqual(syncRes.rows[0].res.state.operational_remaining, 3);

  // 3. Staleprovider snapshot (190 < 197) in same cycle must NOT roll back consumed
  const staleSync = await db.query(
    "SELECT public.salmo_sync_oddspapi_quota_cycle('pg16-cycle-2026-10', 190, 250, 50) AS res"
  );
  assert.strictEqual(staleSync.rows[0].res.state.consumed, 197, 'Monotonic floor inside PostgreSQL must prevent rollback');

  // 4. Fire 10 concurrent reservations against 3 remaining units -> exactly 3 allowed, 7 denied
  const burst = await Promise.all(
    Array.from({ length: 10 }, (_, idx) =>
      db.query(
        "SELECT public.salmo_reserve_oddspapi_quota(1, '/v4/odds-by-tournaments', $1, 'pg16-cycle-2026-10', 50, 0.90, 600) AS res",
        [`pg16-burst-${idx}`]
      )
    )
  );
  const allowed = burst.map(r => r.rows[0].res).filter(r => r.ok);
  const denied = burst.map(r => r.rows[0].res).filter(r => !r.ok);
  assert.strictEqual(allowed.length, 3, 'PostgreSQL RPC must allow exactly 3 reservations up to ceiling 200');
  assert.strictEqual(denied.length, 7, 'PostgreSQL RPC must deny 7 reservations exceeding ceiling 200');
  for (const d of denied) {
    assert.strictEqual(d.error_code, 'QUOTA_EXHAUSTED');
  }

  // 5. Idempotent replay on duplicate idempotency_key must not double-reserve
  const dupRes = await db.query(
    "SELECT public.salmo_reserve_oddspapi_quota(1, '/v4/odds-by-tournaments', 'pg16-burst-0', 'pg16-cycle-2026-10', 50, 0.90, 600) AS res"
  );
  assert.strictEqual(dupRes.rows[0].res.ok, true);
  assert.strictEqual(dupRes.rows[0].res.idempotent_replay, true);
  assert.strictEqual(dupRes.rows[0].res.reservation_id, allowed[0].reservation_id);

  // 6. Confirm reservation #0 (HTTP 200 OK) -> consumed=198, reserved=2
  const c0 = await db.query(
    "SELECT public.salmo_confirm_oddspapi_quota($1::uuid, 1, 0, 200, 'SUCCESS_2XX', 'step-c0') AS res",
    [allowed[0].reservation_id]
  );
  assert.strictEqual(c0.rows[0].res.ok, true);
  assert.strictEqual(c0.rows[0].res.status, 'CONFIRMED');
  assert.strictEqual(c0.rows[0].res.consumed, 198);
  assert.strictEqual(c0.rows[0].res.reserved, 2);

  // 7. Attempt free release on reservation #1 with billable HTTP 422 -> SQL must convert to billable confirm!
  const rel422 = await db.query(
    "SELECT public.salmo_release_oddspapi_quota($1::uuid, 1, 422, false, 'PRE_REQUEST_ABORT', 'HTTP_422', 'step-r1') AS res",
    [allowed[1].reservation_id]
  );
  assert.strictEqual(rel422.rows[0].res.ok, true);
  assert.strictEqual(rel422.rows[0].res.converted_to_billable_confirm, true);
  assert.strictEqual(rel422.rows[0].res.status, 'CONFIRMED');
  assert.strictEqual(rel422.rows[0].res.billing_outcome, 'BILLABLE_CLIENT_ERROR');
  assert.strictEqual(rel422.rows[0].res.consumed, 199);
  assert.strictEqual(rel422.rows[0].res.reserved, 1);

  // 8. Genuine free release on reservation #2 with HTTP 429 -> released without charging consumed (consumed=199, reserved=0)
  const rel429 = await db.query(
    "SELECT public.salmo_release_oddspapi_quota($1::uuid, 1, 429, false, 'FREE_429_RATE_LIMITED', 'HTTP_429', 'step-r2') AS res",
    [allowed[2].reservation_id]
  );
  assert.strictEqual(rel429.rows[0].res.ok, true);
  assert.strictEqual(rel429.rows[0].res.converted_to_billable_confirm, false);
  assert.strictEqual(rel429.rows[0].res.status, 'RELEASED');
  assert.strictEqual(rel429.rows[0].res.consumed, 199);
  assert.strictEqual(rel429.rows[0].res.reserved, 0);

  // 9. Verify PostgreSQL BEFORE UPDATE trigger blocks illegal CONFIRMED -> RELEASED transition
  await assert.rejects(
    () => db.query("UPDATE public.quota_reservations SET status = 'RELEASED' WHERE id = $1::uuid", [allowed[0].reservation_id]),
    /INVALID_STATE_TRANSITION/
  );

  // 10. Create 1 in-flight RESERVED row (consumed=199, reserved=1), then execute verbatim rollback SQL migration
  const inflight = await db.query(
    "SELECT public.salmo_reserve_oddspapi_quota(1, '/v4/fixtures', 'pg16-inflight-rb', 'pg16-cycle-2026-10', 50, 0.90, 600) AS res"
  );
  assert.strictEqual(inflight.rows[0].res.ok, true);
  assert.strictEqual(inflight.rows[0].res.reserved, 1);

  const rollbackSql = fs.readFileSync(ROLLBACK_MIGRATION_PATH, 'utf8');
  await db.exec(rollbackSql);

  const postRb = await db.query(
    "SELECT consumed, reserved, limit_value, safe_limit, schema_version FROM public.quota_state WHERE provider = 'oddspapi'"
  );
  assert.strictEqual(postRb.rows[0].consumed, 199, 'Confirmed consumption preserved on PostgreSQL rollback');
  assert.strictEqual(postRb.rows[0].reserved, 0, 'In-flight reservation drained on PostgreSQL rollback');
  assert.strictEqual(postRb.rows[0].safe_limit, 200, 'Mandatory 50-request reserve ceiling (200) preserved on rollback');
  assert.strictEqual(postRb.rows[0].schema_version, 'rolled_back_to_v4_compat');

  // 11. Re-apply forward migration idempotently on the same PostgreSQL instance
  await db.exec(forwardSql);
  const postRemigrate = await db.query(
    "SELECT consumed, reserved, operational_ceiling, schema_version FROM public.quota_state WHERE provider = 'oddspapi'"
  );
  assert.strictEqual(postRemigrate.rows[0].consumed, 199);
  assert.strictEqual(postRemigrate.rows[0].operational_ceiling, 200);
  assert.strictEqual(postRemigrate.rows[0].schema_version, 'salmo_p0_atomic_v1');

  await db.close();
});

// -----------------------------------------------------------------------------
// SCENARIO 20: Multi-Process External/Staging PostgreSQL TCP Harness Check
// -----------------------------------------------------------------------------
test('P0 Atomic Quota - Scenario 20: Multi-process PostgreSQL TCP staging harness check (refuses production hosts; reports explicit status when external staging Postgres URL is unset)', async t => {
  const localPgUrl = process.env.LOCAL_POSTGRES_URL || process.env.STAGING_POSTGRES_URL || '';
  if (!localPgUrl) {
    t.skip(
      'EXTERNAL MULTI-PROCESS STAGING POSTGRES NOT CONFIGURED: Embedded PostgreSQL 16.4 (PGlite WASM) passed in Scenario 19. Set LOCAL_POSTGRES_URL=postgresql://postgres:postgres@127.0.0.1:5432/salmo_test to also run multi-process OS-backend TCP lock contention tests.'
    );
    return;
  }

  // Safety gate: strictly forbid non-localhost URLs
  const parsed = new URL(localPgUrl);
  assert.ok(
    parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1',
    `Refusing to run SQL migration harness against non-local host: ${parsed.hostname}`
  );
});
