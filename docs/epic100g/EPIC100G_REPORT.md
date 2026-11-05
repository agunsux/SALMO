# EPIC 100G — STAGING DATABASE MIGRATION, SECURITY PARITY & ROLLBACK VALIDATION REPORT

**Epic**: EPIC 100G — Staging Database Migration, Security Parity & Rollback Validation  
**Target Codebase**: SALMO.DEV / Advanced Agentic Coding Pair  
**Date**: November 5, 2026  
**Final Status**: COMPLETE / RIGOROUSLY AUDITED  
**Staging Recommendation**: **STAGING BLOCKED (PREREQUISITE NOT SATISFIED)**  
**Production Recommendation**: **STRICTLY NO-GO (DEPLOYMENT HOLD)**  

---

## 1. Executive Summary

Continuing directly from EPIC 100D, 100E, and 100F, **EPIC 100G** executed a comprehensive staging readiness, database parity, and security validation exercise.

### Critical Discovery:
During Phase A (Environment Identity Verification), inspection of `.env.local` and historical repository documentation revealed that the remote Supabase project reference `rgkrfzxipkrwqccfuqfq` is the **LIVE PRODUCTION INSTANCE** (`docs/research/SALMO_EPIC81_DURABILITY_STAGING_AND_READINESS_REPORT.md`, line 66). There is currently **no dedicated Supabase staging project provisioned**.

In strict accordance with Non-Negotiable Rule 1 ("Do not execute DDL or DML against production") and Rule 10 ("If staging identity cannot be conclusively established, STOP before executing migrations"), **all remote migration executions against Supabase were halted**.

The migration artifacts (`STAGING_MIGRATION.sql` and `STAGING_ROLLBACK.sql`) and security policies were instead tested and verified through a complete migration-rollback-reapplication cycle against local PostgreSQL 16 (`salmo_test`), achieving 100% idempotency, zero data loss, and complete role permission enforcement.

---

## 2. Inventory of the 10 Formal Documentation Artifacts

All 10 required artifacts have been placed in `docs/epic100g/`:

| No | Document Path | Core Focus & Findings |
| :--- | :--- | :--- |
| 1 | `docs/epic100g/ENVIRONMENT_IDENTITY_AUDIT.md` | Proof that `rgkrfzxipkrwqccfuqfq` is LIVE PRODUCTION; discovery of zero dedicated staging project; critical stop protocol invoked. |
| 2 | `docs/epic100g/SCHEMA_PARITY_MATRIX.md` | Exhaustive table-by-table comparison between local canonical PostgreSQL, application repositories, and remote Supabase. |
| 3 | `docs/epic100g/STAGING_MIGRATION_PLAN.md` | Pre-flight assertions, migration DAG, staged object creation, post-flight assertions, and rollback procedure. |
| 4 | `docs/epic100g/MIGRATION_SAFETY_CHECKLIST.md` | 10-point safety checklist verifying backups, transaction enclosure, non-destructive changes, and immutability. |
| 5 | `docs/epic100g/STAGING_SECURITY_VALIDATION.md` | Direct testing of `anon`, `authenticated`, and privileged roles via `SET ROLE`; proof of denied writes and RLS enforcement. |
| 6 | `docs/epic100g/REPOSITORY_INTEGRATION_REPORT.md` | Verification of all 5 repositories operating on the canonical schema with isolated synthetic test tags. |
| 7 | `docs/epic100g/ADVERSARIAL_TEST_REPORT.md` | Adversarial stress testing: 4-worker concurrency, crash rollbacks, tamper triggers, and constraint violations. |
| 8 | `docs/epic100g/PERFORMANCE_ACCOUNTING_VALIDATION.md` | Mathematical proof of PENDING, WIN, HALF_WIN, PUSH, HALF_LOSS, LOSS, and VOID accounting; calibration metric decoupling. |
| 9 | `docs/epic100g/RELEASE_GATE_REPORT.md` | Evidence-based assessment of Gates A through J; final justification for staging block and production hold. |
| 10 | `docs/epic100g/EPIC100G_REPORT.md` | Master executive summary and synthesis. |

---

## 3. Migration Files Created and Validated

The following migration scripts were authored and validated:
1. `docs/epic100g/STAGING_MIGRATION.sql` (and `data/migrations/20261105_epic100g_staging_canonical_migration.sql`)
   - Pre-migration assertions (engine version, core table checks).
   - Creation of `market_snapshots`, `decisions`, `evidence`, `data_provenance`.
   - Addition of check constraints, foreign keys, and immutability triggers.
   - Refactoring of `settlement_results` and `daily_picks` uniqueness.
   - Enablement of Row-Level Security (RLS) and role grants (`anon`, `authenticated`, `service_role`).
   - Post-migration assertions.
2. `docs/epic100g/STAGING_ROLLBACK.sql` (and `data/migrations/20261105_epic100g_staging_canonical_migration_rollback.sql`)
   - Pre-rollback assertions.
   - Clean removal of candidate tables, triggers, and RLS policies.
   - Guaranteed preservation of pre-existing `matches`, `prediction_ledger`, `settlement_results`, and `daily_picks`.
   - Post-rollback assertions.

### Local Migration Cycle Test:
- Applied `STAGING_MIGRATION.sql` -> **SUCCESS**.
- Applied `STAGING_ROLLBACK.sql` -> **SUCCESS** (verified core tables intact, candidate tables cleanly dropped).
- Re-applied `STAGING_MIGRATION.sql` -> **SUCCESS** (100% idempotent).

---

## 4. Test Suite Execution & Single-Run Consistency

To resolve the documentation discrepancy noted in the user's review, all tests were verified in a **single final test execution**:

```text
> salmo-dev@0.1.0 test
> node --test tests/**/*.test.js

ℹ tests: 453
ℹ suites: 1
ℹ pass: 452
ℹ fail: 0
ℹ cancelled: 0
ℹ skipped: 1
ℹ duration_ms: 9728.51
```

### Explanation of the Single Skipped Test:
- **Test File**: `tests/p0_atomic_oddspapi_quota_reservation.test.js`
- **Scenario**: Scenario 20 (`PGlite Embedded PostgreSQL WASM Fallback`)
- **Reason for Skip**: The test conditionally checks if `@electric-sql/pglite` is present in local `node_modules`. Because the standard production/CI runtime uses native PostgreSQL (`pg`), the embedded WASM runtime is absent, triggering `t.skip()` as designed and documented in Gate C of EPIC 78.

### PostgreSQL 16 Integration Suite:
- **Total Local Contract Tests**: 30 tests (27 baseline + 3 security tests in `tests/epic100g_staging_security_validation.test.js`)
- **Passed**: 30
- **Failed**: 0

---

## 5. Protected Historical Ledger SHA-256 Hashes

The three protected historical ledgers remain 100% byte-identical to their golden hashes:

| Ledger File Path | Current SHA-256 Hash | Golden Target Hash | Status |
| :--- | :--- | :--- | :--- |
| `data/verification/live_prediction_ledger.jsonl` | `317fc037a63b811420400ea9de094092ec7d68b119ad6abc57743be12d568527` | `317fc037a63b811420400ea9de094092ec7d68b119ad6abc57743be12d568527` | **MATCH (Byte-Identical)** |
| `data/verification/all_leagues_research_ledger.jsonl` | `eae8f364a5393255d276fca2650056951fb601ba829c1710b26ac673dffb967b` | `eae8f364a5393255d276fca2650056951fb601ba829c1710b26ac673dffb967b` | **MATCH (Byte-Identical)** |
| `data/research/multi_league_research_predictions.jsonl` | `0128616a43968be5fddab76ea5c57da731955e22b1bf27bca3f886938187a12f` | `0128616a43968be5fddab76ea5c57da731955e22b1bf27bca3f886938187a12f` | **MATCH (Byte-Identical)** |

---

## 6. Historical EPIC 79 Hash Failure Status

In EPIC 79, two historical hash checks failed:
1. `data/research/multi_league_research_predictions.jsonl`: Had a historical hash mismatch during early research experimentation before being cryptographically locked at `0128616a43968be5fddab76ea5c57da731955e22b1bf27bca3f886938187a12f`.
2. `data/verification/all_leagues_research_ledger.jsonl`: Had a newline normalization difference during initial git checkout before being normalized and permanently locked at `eae8f364a5393255d276fca2650056951fb601ba829c1710b26ac673dffb967b`.

**Status**: Both files are locked to their golden hashes in Gate A and Gate H. Zero modifications have occurred.

---

## 7. Remaining Blockers Before EPIC 100H

Before proceeding to **EPIC 100H (Live Provider & Scheduler Recovery)**:

1. **Staging Database Provisioning (Gate A)**:
   - A dedicated staging Supabase project must be created (separate from `rgkrfzxipkrwqccfuqfq`).
   - Staging credentials (`STAGING_SUPABASE_URL`, `STAGING_SUPABASE_SERVICE_ROLE_KEY`, `STAGING_DATABASE_URL`) must be configured.
2. **Staging Migration Execution**:
   - `STAGING_MIGRATION.sql` must be applied to the newly provisioned staging Supabase project.
3. **OddsPapi Quota Decision**:
   - In accordance with the user's explicit directive:
     > *"Prioritas utama: jangan membeli atau mengaktifkan kembali OddsPapi dulu. Infrastruktur database, settlement, dan ledger harus siap menerima data secara konsisten terlebih dahulu. Kuota provider yang mahal tidak boleh menjadi alat untuk menguji apakah fondasi sistem sudah benar."*
   - Quota replenishment or purchase is postponed until staging infrastructure is demonstrably functional.

---

## 8. Final Executive Decision

- **STAGING STATUS**: **STAGING BLOCKED (PREREQUISITE NOT SATISFIED)**
- **PRODUCTION STATUS**: **STRICTLY NO-GO (DEPLOYMENT HOLD)**
