# SALMO EPIC 81 — DURABILITY, STAGING VERIFICATION & PRODUCTION READINESS REPORT

- **Document Version:** 1.0.0
- **Audit Timestamp:** 2026-10-15T22:50:00+07:00
- **Starting Commit (HEAD):** `2cfea2e4ffcf4ac8cb024dac24891cd29ae078a0`
- **Branch:** `feat/epic-77-handicaplab-salmo-sync`
- **Execution Policy:** Evidence-driven audit, zero unapproved external side effects, zero production database mutation.

---

## 1. Executive Summary & Verdict

### Executive Verdict: **PARTIAL / BLOCKED**
While repository change control, protected ledger hashes, provider quota hard-stops, and core regression suites are fully passing (**PASS**), operational promotion and production release are strictly **BLOCKED** due to:
1. **Scenario 20 Staging Blocker**: No isolated PostgreSQL staging database is configured in the environment (`BLOCKED — STAGING PREREQUISITE NOT SATISFIED`). Live production Supabase (`rgkrfzxipkrwqccfuqfq.supabase.co`) was preserved untouched in accordance with safety invariants.
2. **Durability Hydration Defect (HIGH)**: `DurablePredictionStorageAdapter.queryLatestPredictions()` only queries PostgreSQL if `options.dbClient` is explicitly injected by the caller; otherwise it falls back directly to the local JSONL path, which is ephemeral on Vercel Serverless. Furthermore, database write errors return `success: true` upon local fallback instead of bubbling a degraded status to the pipeline report.
3. **Provider Ingestion Blocker**: OddsPAPI remains hard-stopped at 260/250 requests (exhausted), and API-Football subscription expired on 2026-10-14, preventing live odds ingestion without authorized plan renewals.

---

## 2. Acceptance Gate Evaluation Matrix

| Gate | Name | Status | Evidence Summary |
| :--- | :--- | :--- | :--- |
| **G0** | Repository Integrity | **PASS** | HEAD is `2cfea2e`, branch `feat/epic-77-handicaplab-salmo-sync` ahead 1. All 3 protected hashes 100% byte identical. |
| **G1** | Storage Safety | **PARTIAL** | Uniqueness constraints and write guards verified; hydration defect and fallback success reporting identified for remediation. |
| **G2** | PostgreSQL Staging | **BLOCKED** | Marked `BLOCKED — STAGING PREREQUISITE NOT SATISFIED`. No isolated staging DB configured; production DB untouched. |
| **G3** | Migration Readiness | **READY FOR REVIEW** | `20261015_durable_prediction_storage.sql` and rollback inspected. Migration runbook prepared; **0 migrations executed**. |
| **G4** | Provider Safety | **PASS** | 0 billable provider calls made. OddsPapiQuotaGuard pre-egress hard-stop verified. Stale/missing odds cannot become public picks. |
| **G5** | Sync Artifacts | **PASS** | `data/sync/` inventoried. `handicaplab_sync_ledger.jsonl` (549 rows, 535KB) preserved untouched without modification. |
| **G6** | Production Isolation | **PASS** | `vercel.json` crons empty `[]`. 0/14 shadow leagues promoted. 0/15 picks enabled. Live betting disabled. |
| **G7** | Release Decision | **NO-GO** | System not ready for production deployment or cron activation. |

---

## 3. Phase 1 — Audit of EPIC 80 Durable Storage

### 3.1 Trace of Write & Read Paths
1. **Prediction Generation**: Dixon-Coles model generates score grids, AH probabilities, Asian Total Goals distributions, and BTTS probabilities.
2. **Canonical Normalization**: Normalizes competition IDs, teams via `TeamAliasRegistry`, and ISO UTC timestamps.
3. **Database Write**: `DurablePredictionStorageAdapter.persistDailyPredictions` converts candidates into `DurableStorageRecord` format with deterministic ID (`computeDeterministicId`).
4. **Conflict Handling & Idempotency**: Target table `daily_prediction_refresh_ledger` enforces composite unique index `uq_daily_refresh_position` on `(canonical_match_id, market, line, selection, model_version)`. Upsert uses `onConflict: 'canonical_match_id, market, line, selection, model_version', ignoreDuplicates: true`.
5. **Error Propagation**: Live database write failure logs a warning and falls back to atomic local file write.
6. **Latest Prediction Retrieval & Hydration**: `DurablePredictionStorageAdapter.queryLatestPredictions` reads stored records.
7. **Environment Guards**: `OddsPapiQuotaGuard.isProductionDatabaseWriteAllowed(true)` blocks all direct writes in test, CI, or preview environments.

### 3.2 Detailed Findings

| Finding ID | Classification | Location | Description & Impact | Recommended Fix |
| :--- | :--- | :--- | :--- | :--- |
| **F-01** | **HIGH** | `durablePredictionStorageAdapter.ts:543` | **Serverless Hydration Omission**: `queryLatestPredictions` only queries PostgreSQL if `options.dbClient` is explicitly injected. If called without `options.dbClient` in production serverless, it falls back to local disk (`DEFAULT_LOCAL_PATH`) which is empty on container cold start, returning `[]`. | Add fallback to singleton `getDbClient()` in `queryLatestPredictions` when `options.dbClient` is omitted and database is configured. |
| **F-02** | **MEDIUM** | `durablePredictionStorageAdapter.ts:377,439` | **Fallback Success Masking**: When Supabase write fails (`upsertErr` or `dbErr`), the adapter returns `success: true` with `storageTarget: 'LOCAL_FALLBACK_FILE'`. This causes `DailyPredictionRefreshService` to mark `pipelineHealth: 'SUCCESS'` rather than surfacing a degraded state. | Return `success: false` or introduce explicit `status: 'DEGRADED_LOCAL_FALLBACK'` so production callers know durable write failed. |
| **F-03** | **PASS** | `durablePredictionStorageAdapter.ts:80-120` | **Deterministic Idempotency**: Fixed-point string hashing of `(canonical_match_id, market, line, selection, model_version)` ensures quarter lines (`-0.25`, `-0.75`, `2.25`, `2.75`) produce unique keys. | Maintain current implementation. |
| **F-04** | **PASS** | `durablePredictionStorageAdapter.ts:130-150` | **Protected Ledger Safety Assertion**: `assertDestinationSafety` strictly throws `FATAL SECURITY INVARIANT VIOLATION` if write targets any of the 3 historical ledgers. | Maintain current implementation. |
| **F-05** | **PASS** | `durablePredictionStorageAdapter.ts:360` | **Fail-Closed Production Write Guard**: Direct Supabase writes strictly require dual authorization (`allowProductionWrite=true` AND `ALLOW_PRODUCTION_DB_WRITE=true`, non-test/CI/preview). | Maintain current implementation. |

---

## 4. Phase 2 — Real PostgreSQL Staging Verification (Scenario 20)

### 4.1 Environment Inspection
Inspection of process environment variables and `.env.local` revealed:
- `STAGING_DATABASE_URL`: **UNSET**
- `SUPABASE_STAGING_URL`: **UNSET**
- `POSTGRES_STAGING_URL`: **UNSET**
- `SUPABASE_URL`: Configured to `rgkrfzxipkrwqccfuqfq.supabase.co` (**LIVE PRODUCTION INSTANCE**).

### 4.2 Scenario 20 Verdict
**`BLOCKED — STAGING PREREQUISITE NOT SATISFIED`**
- In accordance with the prompt's explicit instruction: *"A local mock, in-memory database, SQLite substitute, or successful unit test does not count as real PostgreSQL staging verification. If no safe staging database is available, mark Scenario 20: BLOCKED — STAGING PREREQUISITE NOT SATISFIED. Do not create infrastructure, purchase a service, or change credentials."*
- Testing against the live production instance (`rgkrfzxipkrwqccfuqfq.supabase.co`) was strictly rejected to prevent unapproved production mutation.

---

## 5. Phase 3 — Supabase Migration Readiness & Runbook

### 5.1 Technical SQL Inspection
- **Script**: `data/migrations/20261015_durable_prediction_storage.sql`
- **Rollback**: `data/migrations/20261015_durable_prediction_storage_rollback.sql`
- **Execution Status**: **NOT EXECUTED (0 schema modifications performed)**.
- **Review Verdict**: **READY FOR REVIEW** (Pending staging verification and production signoff).

### 5.2 Pre-Migration Runbook
1. **Prerequisites & Backup**:
   - Create Supabase project backup or snapshot before applying DDL.
   - Run deduplication query on `public.prediction_ledger`:
     ```sql
     SELECT doi_id, COUNT(*) FROM public.prediction_ledger GROUP BY doi_id HAVING COUNT(*) > 1;
     ```
   - Run deduplication query on `public.daily_picks`:
     ```sql
     SELECT fixture_id, market_type, source, COUNT(*) FROM public.daily_picks GROUP BY fixture_id, market_type, source HAVING COUNT(*) > 1;
     ```
2. **Execution Command**:
   - Execute in Supabase SQL Editor or via migration pipeline:
     `psql "$DATABASE_URL" -f data/migrations/20261015_durable_prediction_storage.sql`
3. **Verification Queries**:
   ```sql
   SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'daily_prediction_refresh_ledger';
   SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'daily_prediction_refresh_ledger';
   ```
4. **Smoke Test**:
   - Insert synthetic test record with `model_version = 'smoke-test-v1'`.
   - Verify idempotent re-insert does not fail.
   - Delete smoke test record.
5. **Rollback Trigger**:
   - If index creation fails due to duplicate keys or table lock contention, execute `data/migrations/20261015_durable_prediction_storage_rollback.sql`.

---

## 6. Phase 4 — Odds Provider Recovery Audit

### 6.1 Provider Recovery Decision Table

| Provider | Current Evidence | Safe Action Now | Requires Authorization |
| :--- | :--- | :--- | :--- |
| **OddsPAPI** | Usage: **260 / 250** (Limit exceeded). `valid_until: null`. Circuit breaker tripped on HTTP 429. | Read-only audit; zero egress. Quota guard enforces hard-stop at 225. | Subscription renewal or plan upgrade with increased monthly request quota. |
| **API-Football** | Subscription expired **2026-10-14T00:00:00Z**. Live fixture discovery returns 0 authentic fixtures. | Fall back to local verified fixture archives (`stage_b1_fixture_evidence.json`). | Subscription renewal or API key replacement. |
| **Local Historical Datasets** | 11,642 gold matches, 336 research predictions, 30 live ledger rows verified. | Read-only inventory and offline model inference. | Any external data acquisition. |

### 6.2 Pre-Egress Protection Verification
`OddsPapiQuotaGuard.reserveQuota` was verified to reject requests before network dispatch:
- Total consumed (260) exceeds operational ceiling (225).
- Returns `{ allowed: false, errorCode: 'QUOTA_EXHAUSTED' }`.
- Provider call returns `{ status: 'RATE_LIMITED', requestsConsumed: 0 }`.
- Zero billable egress was generated during this audit.

---

## 7. Phase 5 — Audit of `data/sync/`

### 7.1 Directory Inventory
Command: `git status --short --untracked-files=all -- data/sync/`
Found exactly one file:

| Path | Size (Bytes) | Modified UTC | Format / Rows | SHA-256 |
| :--- | :--- | :--- | :--- | :--- |
| `data/sync/handicaplab_sync_ledger.jsonl` | 535,886 | 2026-10-14T20:59:38Z | JSONL / 549 records | `6f6c18f261b7d892020b02735a49bcc39a239ae4da18ed7d913975f009ea4d60` |

### 7.2 Integrity & Comparison
- Compared against baseline hashes: does NOT match `live_prediction_ledger.jsonl` (30 rows), `all_leagues_research_ledger.jsonl` (336 rows), or `multi_league_research_predictions.jsonl` (336 rows).
- Content: Contains 549 canonical records synchronized from HandicapLab historical ledgers during EPIC 77 test execution.
- **Recommended Disposition**: **KEEP LOCAL & ADD TO `.gitignore`**. This file is a local sync output sink and should not be deleted, but should be ignored to prevent working-tree clutter.

---

## 8. Phase 6 — Production Safety Regressions

### 8.1 Safety Governance Check

| Guard / Invariant | Required State | Actual State | Verification Status |
| :--- | :--- | :--- | :--- |
| `vercel.json` crons | `[]` (Empty) | `[]` (Empty) | **PASS** |
| Domestic leagues pick status | `production_pick_enabled: false` | 15 / 15 leagues `false` | **PASS** |
| Shadow league status | `production_status: 'SHADOW'` | 14 / 14 leagues `SHADOW` | **PASS** |
| Live betting | Disabled | 0 active picks | **PASS** |
| BTTS Market Scope | `RESEARCH_ONLY` | Strictly excluded from picks | **PASS** |
| Production DB Write Guard | Fail-closed | Returns `false` | **PASS** |
| Provider Quota Egress | 0 billable calls | 0 calls made | **PASS** |
| Protected Ledgers (3/3) | Baseline SHA-256 | Exact match | **PASS** |

### 8.2 Test Suite Execution Summary
- **EPIC 80 Durable Storage Suite**: 9 / 9 PASS (725ms)
- **Core Regression Suite**: 70 / 70 PASS (9.56s)
- **TypeScript Compiler (`tsc --noEmit`)**: 0 errors
- **Production Build (`npm run build`)**: 30 / 30 routes PASS (3.4s)

---

## 9. Protected Historical Ledger Baseline Audit

| Protected File | Baseline SHA-256 | Actual SHA-256 | Status |
| :--- | :--- | :--- | :--- |
| `data/verification/live_prediction_ledger.jsonl` | `317fc037a63b811420400ea9de094092ec7d68b119ad6abc57743be12d568527` | `317fc037a63b811420400ea9de094092ec7d68b119ad6abc57743be12d568527` | **MATCH (PASS)** |
| `data/verification/all_leagues_research_ledger.jsonl` | `eae8f364a5393255d276fca2650056951fb601ba829c1710b26ac673dffb967b` | `eae8f364a5393255d276fca2650056951fb601ba829c1710b26ac673dffb967b` | **MATCH (PASS)** |
| `data/research/multi_league_research_predictions.jsonl` | `0128616a43968be5fddab76ea5c57da731955e22b1bf27bca3f886938187a12f` | `0128616a43968be5fddab76ea5c57da731955e22b1bf27bca3f886938187a12f` | **MATCH (PASS)** |

---

## 10. Operational Blockers & Smallest Safe Next Steps

### Outstanding Blockers
1. **Scenario 20 Staging PostgreSQL**: No isolated staging database exists to verify migration application and cross-restart hydration against real PostgreSQL.
2. **Hydration Read Path Defect (F-01)**: `queryLatestPredictions` needs to be equipped with default `getDbClient()` connectivity for production serverless lambdas.
3. **Provider Ingestion**: OddsPAPI quota renewal (260/250 limit) and API-Football reactivation are required before live daily refresh can ingest current prematch lines.

### Smallest Safe Next Steps
1. **Remediate F-01 & F-02 Locally**: In a future scoped task, update `queryLatestPredictions` to safely probe `getDbClient()` and return explicit degraded statuses on database write failure.
2. **Provision Isolated Staging DB**: Set up a separate staging PostgreSQL database (or Supabase branching environment) with credentials in `STAGING_DATABASE_URL` to execute Scenario 20 safely.
3. **Resolve Provider Quota**: Renew OddsPAPI / API-Football subscriptions under authorized budget before scheduling automated prediction crons.
