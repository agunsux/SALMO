# OddsPapi — Quota Reconciliation & Guard Audit Report

- **Updated**: `2026-10-13T03:01:00+07:00`
- **Branch**: `feat/phase2d-controlled-p0-p1`
- **Compliance Verdict**: ❌ **QUOTA COMPLIANCE UNVERIFIED — DEPLOYMENT BLOCKED** (Do NOT declare production cross-instance compliance)

---

## 1. Ground-Truth Discrepancy (`260 / 250`)

1. **Committed Provider Evidence**:
   - [`data/verification/oddspapi_account_response.json`](../../../data/verification/oddspapi_account_response.json#L1636-L1639) captures a real `/v4/account` response for SALMO's `"free"` plan subscription (`valid_from: "2026-06-26T19:38:02.821232+00:00"`, `valid_until: null`) showing:
     - `"request_limit": 250`
     - `"request_count": 260`
2. **Contradiction with Prior Audit Claims & Official Documentation**:
   - Earlier audit summaries claimed quota compliance was complete, while [`oddspapi_account_response.json`](../../../data/verification/oddspapi_account_response.json) proves the account exceeded its `250` request limit by `10` requests (`260/250`), and exceeded SALMO's `225` hard-stop threshold by `35` requests.
   - Official documentation (`https://oddspapi.io/us/docs/requests-and-quota`) states that once `request_count` reaches `request_limit`, subsequent billable or free calls immediately return `HTTP 429 Too Many Requests` (`REQUEST_LIMIT_EXCEEDED`). Reaching `260/250` indicates either concurrent in-flight requests across serverless instances before the provider counter settled, historical calls prior to guard enforcement, or provider-side soft-overage accounting.

---

## 2. Phase 2D.1 & 2D.2 Remediation of [`OddsPapiQuotaGuard`](../../../src/lib/quota/oddsPapiQuotaGuard.ts), [`OddsPapiProvider`](../../../src/services/providers/oddsPapiProvider.ts), and [`MultiLeagueAutoActivator`](../../../src/engine/activation/multiLeagueAutoActivator.ts)

Cross-referencing the official `Requests & Quota` specification (`https://oddspapi.io/us/docs/requests-and-quota`) against SALMO's implementation identified **four structural mechanisms** where local quota tracking previously diverged from OddsPapi's actual `request_count`. All four have been remediated in code:

### Finding A — 4xx and 5xx Responses Are Billed by OddsPapi (**REMEDIATED**)
- **Official Rule (`https://oddspapi.io/us/docs/requests-and-quota`)**:
   > *"A request is counted after the endpoint has finished processing, whether the response was successful or returned an error. This includes: `200 OK` — successful responses, `4xx` — client errors (e.g. invalid parameters, resource not found), `5xx` — server errors. Note: Requests that are rejected before reaching the endpoint — for example, because your API key is invalid or your quota is already exhausted — are not counted."*
- **Previous Defect**:
  - `OddsPapiProvider` called `releaseQuota()` on any `!res.ok` response, treating `400`/`404`/`500` responses as free (`0` consumed).
- **Remediation**:
  - [`OddsPapiQuotaGuard.isBillableHttpStatus(statusCode)`](../../../src/lib/quota/oddsPapiQuotaGuard.ts) classifies HTTP `200`, `4xx` (except `401`/`429`), and `5xx` as billable (`1` request).
  - [`OddsPapiProvider`](../../../src/services/providers/oddsPapiProvider.ts) calls `confirmQuota(..., { outcome: 'BILLABLE_ERROR' }, allowProdWrite)` on billable `4xx`/`5xx` responses, populates `requestsConsumed` on every `ProviderResult`, and only calls `releaseQuota()` on `401`, `429`, or pre-response network exceptions where no HTTP status code is received.
  - If JSON parsing (`res.json()`) fails *after* an HTTP `200 OK` response is received, `confirmQuota` has already settled (`quotaSettled = true`, `requestsConsumed = 1`), so the billable unit is **never refunded**.
  - [`OddsPapiQuotaGuard.releaseQuota()`](../../../src/lib/quota/oddsPapiQuotaGuard.ts) enforces a defensive guard: if invoked with a billable `statusCode`, it refuses to release the reservation as free and commits the cost as `BILLABLE_ERROR`.
  - [`MultiLeagueAutoActivator.ingestPriorityFixturesAndOdds()`](../../../src/engine/activation/multiLeagueAutoActivator.ts) increments `billableRequestsMade` by `oddsRes.requestsConsumed` (even on billable `4xx`/`5xx` errors) so failed billable batches cannot bypass the 50-request mandatory reserve.

### Finding B — `confirmQuota()` In-Memory Retention, Duplicate Idempotency & Cache Window (**REMEDIATED IN-PROCESS**)
- **Previous Defect**:
  - When `allowProductionWrite` was `false`, `confirmQuota()` deleted the reservation from `activeReservations` without updating `cachedAccountData.subscriptions[0].request_count` or retaining an in-memory floor, while `syncAccount()` used `next: { revalidate: 60 }`.
- **Remediation**:
  - `confirmQuota()` records confirmed reservations in `confirmedReservations`, marks closed reservation IDs in `closedReservations` (so duplicate `confirmQuota` or `releaseQuota` calls for the same `reservationId` are idempotent no-ops), increments `inMemoryConfirmedCost`, advances a monotonic per-cycle `localConsumedFloor` (`subscription_id:valid_from`), and updates `cachedAccountData.subscriptions[0].request_count` in place.
  - `syncAccount()` uses `cache: 'no-store'` and preserves `localConsumedFloor` within the same subscription cycle so stale `/v4/account` responses cannot roll back confirmed usage within the same process.

### Finding C — Multi-Request Partial Batch Accounting & Cold-Start Fail-Closed (**REMEDIATED**)
- **Remediation**:
  - `confirmQuota()` supports partial confirmation (`details.consumedCost`) so `getUpcomingFixtures()` confirms the exact count of billable requests completed (`200` or billable `4xx`/`5xx`) and releases only unexecuted or `401`/`429` requests.
  - After a serverless cold start, `checkQuota()` recovers from `public.quota_state` or `/v4/account`, and fails closed with `DB_UNREACHABLE_BLOCK` when neither source is verifiable.

---

## 3. Critical Persistence Gate Audit (Serverless Cross-Instance & Restart Evaluation)

Per Phase 2D.2 Phase 1 requirements, the following 6 production reliability questions are answered directly against the current codebase:

### Q1: Where is confirmed quota stored in production?
- **In-Process Memory**: `OddsPapiQuotaGuard.inMemoryConfirmedCost`, `localConsumedFloor`, `activeReservations`, `confirmedReservations`, and `closedReservations` are stored in process memory (`static` fields on `OddsPapiQuotaGuard`).
- **Database (`public.quota_state`)**: `OddsPapiQuotaGuard.recordUsage()` updates `public.quota_state.consumed` **only** when `isProductionDatabaseWriteAllowed(allowProductionWrite)` evaluates to `true` (requiring `ALLOW_PRODUCTION_DB_WRITE=true`, `NODE_ENV !== 'test'`, `CI !== 'true'`, `VERCEL_ENV !== 'preview'`). In the current remediation environment, production database writes are **disabled by policy** (`ALLOW_PRODUCTION_DB_WRITE` is unset/false).
- **Provider Ground Truth (`/v4/account`)**: Read via unmetered `GET /v4/account` (`syncAccount()`, `cache: 'no-store'`).

### Q2: Does `confirmQuota()` persist across serverless cold starts, process restarts, and concurrent requests?
- **Within a single running process**: **YES** (`localConsumedFloor` and `activeReservations` persist across sequential and concurrent calls in the same Node.js isolate).
- **Across serverless cold starts / process restarts when `ALLOW_PRODUCTION_DB_WRITE !== 'true'`**: **NO** for `localConsumedFloor` and `activeReservations`; a newly spawned serverless instance starts with `localConsumedFloor = 0` and relies on `public.quota_state` (which is not written when DB writes are disabled) and live `/v4/account` (`syncAccount()`).
- **Across concurrent serverless instances**: **NO** — `activeReservations` and `activationLock` live in process memory (`Map` / static object), not in a shared transactional database lock, and `recordUsage()` performs a read-then-update (`SELECT consumed ... UPDATE consumed = nextConsumed`) rather than an atomic PostgreSQL RPC increment + row-level reservation lock.

### Q3: If `allowProductionWrite = false`, what prevents a new serverless instance from seeing stale quota and making extra paid calls?
- When `allowProductionWrite = false`, a new serverless instance calls `syncAccount()` (`GET /v4/account` with `cache: 'no-store'`).
- However, if **two serverless instances execute concurrently**, or if `/v4/account` lags briefly behind an in-flight request from Instance A while `public.quota_state` writes are disabled, Instance B cannot see Instance A's in-memory `activeReservations` or `localConsumedFloor`. This is a plausible mechanism for how the account historically reached `260/250` despite a `225` hard-stop threshold.

### Q4: If persistent quota state (`public.quota_state`) is used, is it updated atomically and safely?
- **Not yet atomically across concurrent serverless instances**:
  - `recordUsage()` in [`src/lib/quota/oddsPapiQuotaGuard.ts`](../../../src/lib/quota/oddsPapiQuotaGuard.ts) uses a two-step Supabase query (`SELECT id, consumed FROM quota_state` followed by `UPDATE quota_state SET consumed = ...`) rather than an atomic SQL `UPDATE quota_state SET consumed = GREATEST(consumed, $floor) + $cost RETURNING consumed` or a database-backed reservation table.
  - Implementing atomic cross-instance reservation/increment in PostgreSQL requires an authorized production database migration (RPC / schema update) and authorized production writes (`ALLOW_PRODUCTION_DB_WRITE=true`), both of which are **prohibited in this task**.

### Q5: What happens when `/v4/account` and local/persistent quota state disagree?
- [`OddsPapiQuotaGuard.checkQuota()`](../../../src/lib/quota/oddsPapiQuotaGuard.ts) reconciles all three sources **conservatively using the maximum**:
  $$\text{consumed} = \max\bigl(\text{dbRow.consumed},\; \text{account.request\_count},\; \text{localConsumedFloor}\bigr) + \text{activeReservedCost}$$
  within the same subscription cycle (`subscription_id:valid_from`). Thus, whichever source reports higher usage wins.

### Q6: What happens when both `/v4/account` and persistent quota state are unavailable?
- [`OddsPapiQuotaGuard.checkQuota()`](../../../src/lib/quota/oddsPapiQuotaGuard.ts) **fails closed** with `allowed: false`, `reason: "DB_UNREACHABLE_BLOCK: Neither persistent quota_state nor /v4/account could be verified; failing closed..."`, `consumed: limit`, and `remaining: 0`. Zero billable calls can proceed.

---

## 4. Exact Release & Deployment Blocker

Per the Phase 2D.2 Critical Persistence Gate & Phase 7 Deployment Gate:
1. **Current Provider Quota State**: `260 / 250` (`QUOTA_EXHAUSTED` in [`data/verification/oddspapi_account_response.json`](../../../data/verification/oddspapi_account_response.json)).
2. **Cross-Instance Serverless Persistence Blocker**:
   - While in-process quota accounting, HTTP status classification (`200`, billable `4xx`/`5xx`, non-billable `401`/`429`), partial batch confirmation, duplicate confirmation idempotency, and cold-start fail-closed (`DB_UNREACHABLE_BLOCK`) are **fixed and verified in code**, **durable cross-instance serverless reservation & confirmation** requires:
     1. An atomic PostgreSQL reservation/increment RPC or row-locked transaction on `public.quota_state` (schema migration), and
     2. Authorized production database writes (`ALLOW_PRODUCTION_DB_WRITE=true`) on the live Supabase instance.
   - Because production database writes and migrations are **unauthorized** under current safety constraints, **production deployment MUST remain BLOCKED**.

---

## 5. Summary Table

| Dimension | Status |
|-----------|--------|
| Current Provider Snapshot ([`oddspapi_account_response.json`](../../../data/verification/oddspapi_account_response.json)) | `260 / 250` (`QUOTA_EXHAUSTED`) |
| Paid API Calls Permitted | **NO (`0` calls allowed)** |
| In-Process Quota Accounting (`200`, billable `4xx`/`5xx`, free `401`/`429`, partial batch, idempotency, fail-closed) | **FIXED & VERIFIED OFFLINE** |
| Endpoint Contract Enforcement (`/v4/fixtures`, `/v4/odds-by-tournaments`) | **FIXED & VERIFIED OFFLINE** |
| Durable Cross-Instance Serverless Quota Persistence (without DB writes/migration) | **BLOCKED (Requires authorized DB write + atomic Postgres RPC/migration)** |
| Historical `260 / 250` Root Cause | **UNVERIFIED (Plausibly concurrent serverless requests + prior non-OK release bug)** |
| **Deployment Decision** | **DEPLOYMENT BLOCKED (Fail-Closed)** |
