# EPIC 100G.3 — FRESH DATABASE BOOTSTRAP, MIGRATION RECONCILIATION & RECOVERY VALIDATION REPORT

**Epic**: EPIC 100G.3 — Fresh Database Bootstrap, Migration Reconciliation & Recovery Validation  
**Target Codebase**: SALMO.DEV / Advanced Agentic Coding Pair  
**Date**: November 5, 2026  
**Auditor**: Astra (Principal PostgreSQL Architect, Supabase Migration Engineer, Reliability Auditor)  
**Final Status**: **COMPLETE / EMPIRICALLY CERTIFIED**  
**Classification**: **BOOTSTRAP READY**  
**Remote Staging Status**: **LOCAL ENGINEERING PASS — AWAITING STAGING PROVISIONING**  
**Production Recommendation**: **STRICTLY NO-GO (DEPLOYMENT HOLD)**  

---

## 1. Executive Summary & Mission Scope

Continuing directly from EPIC 100G, EPIC 100G.1, and EPIC 100G.2, **EPIC 100G.3** resolved the central database engineering challenge facing the SALMO platform: **producing one deterministic, reproducible, and resilient database bootstrap process for a completely fresh PostgreSQL 16 / Supabase staging project**.

### Core Problem Solved:
The EPIC 100G.2 audit revealed a critical structural conflict:
- `data/schema_canonical.sql` was an unversioned full DDL without RLS policies.
- `STAGING_MIGRATION.sql` was a delta script that asserted base tables (`matches`, `prediction_ledger`, `settlement_results`) already existed, causing an immediate failure on any clean staging database.

### Core Accomplishments in EPIC 100G.3:
1. **Engineered Unified Deterministic Bootstrap (`FRESH_DATABASE_BOOTSTRAP.sql`)**:
   Unified all 8 canonical tables, 5 immutability/sync triggers, 15 least-privilege RLS policies, and foreign key dependencies into a single transactional script.
2. **Implemented 3-State Compatibility Evaluation**:
   Replaced naive `IF NOT EXISTS` constructs with rigorous state evaluation:
   - *Absent* -> Created safely.
   - *Present & Compatible* -> Upgraded/reconciled without duplicate constraints.
   - *Present & Incompatible* -> Aborted fail-closed (`INCOMPATIBLE_SCHEMA`).
3. **Established In-Database Migration Tracking (`_salmo_migrations`)**:
   Built an authoritative schema migrations ledger recording execution sequence, timestamps, checksums, and executor identity.
4. **Passed All 12 Local PostgreSQL 16 Adversarial Scenarios (T1–T12)**:
   Tested empty databases, legacy baselines, partial schemas, column type corruption, constraint collisions, trigger immutability, mid-transaction crashes, and rollback/re-application cycles (12/12 PASS).
5. **Verified Application Repository Contract (5/5 PASS)**:
   Executed actual repository patterns against bootstrapped PostgreSQL: verified multiple AH positions on one fixture, versioned DOI keys, idempotent retries, independent settlement, and synthetic data quarantine.
6. **Preserved Production Invariants 100%**:
   Zero remote writes to `rgkrfzxipkrwqccfuqfq`. OddsPapi quota remained locked at 260/250. All 3 historical ledgers remain byte-identical.

---

## 2. Inventory of the 12 Formal Documentation Artifacts

All 12 required artifacts have been authored and placed in `docs/epic100g3/`:

| No | Document Path | Core Focus & Findings |
| :---: | :--- | :--- |
| 1 | `docs/epic100g3/CANONICAL_BASELINE_AUDIT.md` | Full inventory of all 8 core tables, columns, constraints, foreign keys, triggers, extensions, and RLS policies. |
| 2 | `docs/epic100g3/MIGRATION_RECONCILIATION_MATRIX.md` | Resolution of table/trigger/constraint collisions; specification of the 3-State Compatibility Rule. |
| 3 | `docs/epic100g3/BOOTSTRAP_ARCHITECTURE.md` | 6-stage lifecycle architecture; rationale for unified transactional bootstrap over fragmented scripts. |
| 4 | `docs/epic100g3/FRESH_DATABASE_BOOTSTRAP.sql` | The authoritative, deterministic SQL bootstrap script for PostgreSQL 16 / Supabase staging. |
| 5 | `docs/epic100g3/MIGRATION_VERSIONING_DESIGN.md` | Schema specification for `_salmo_migrations` table, checksum verification, and audit queries. |
| 6 | `docs/epic100g3/SUPABASE_COMPATIBILITY_AUDIT.md` | Supabase managed platform audit: roles, extensions schema, search path safety, and PostgREST RLS. |
| 7 | `docs/epic100g3/CONNECTION_MODE_GUIDE.md` | Connection mode rules: Direct Port 5432 (DDL/admin) vs. Transaction Pooler Port 6543 (runtime app). |
| 8 | `docs/epic100g3/BACKUP_AND_RECOVERY_VALIDATION.md` | 3-tier recovery taxonomy; zero data destruction rollback guarantees; empirical crash recovery validation. |
| 9 | `docs/epic100g3/BOOTSTRAP_TEST_MATRIX.md` | Scorecard and detailed results of all 12 adversarial test scenarios T1 through T12 (12/12 PASS). |
| 10 | `docs/epic100g3/APPLICATION_CONTRACT_VALIDATION.md` | Empirical validation of all 5 repositories (Fixture, Odds, Decisions, Settlement, Performance) (5/5 PASS). |
| 11 | `docs/epic100g3/RELEASE_GATE_REPORT.md` | Formal evaluation of Gates A through J; justification for **BOOTSTRAP READY** classification. |
| 12 | `docs/epic100g3/EPIC100G3_REPORT.md` | Master synthesis report and strategic next action roadmap. |

---

## 3. Single-Run Test Suite Baseline

From the full test suite run across the entire SALMO repository:

```text
> salmo-dev@0.1.0 test
> node --test tests/**/*.test.js

ℹ tests 479
ℹ suites 1
ℹ pass 478
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 17022.067
```

- **Total Tests**: 479 tests (+12 adversarial bootstrap tests + 5 repository contract tests).
- **Pass Count**: **478 passed**.
- **Skipped Count**: 1 (Conditional WASM PGlite test in `p0_atomic_oddspapi_quota_reservation.test.js`).
- **Failures**: **0 failures**.

---

## 4. Cryptographic Ledger & Quota Invariants

| Monitored Resource | Baseline Target Hash | Verified SHA-256 Hash | Integrity Status |
| :--- | :--- | :--- | :---: |
| `live_prediction_ledger.jsonl` | `317fc037a63b811420400ea9de094092ec7d68b119ad6abc57743be12d568527` | `317fc037a63b811420400ea9de094092ec7d68b119ad6abc57743be12d568527` | **100% MATCH** |
| `all_leagues_research_ledger.jsonl` | `eae8f364a5393255d276fca2650056951fb601ba829c1710b26ac673dffb967b` | `eae8f364a5393255d276fca2650056951fb601ba829c1710b26ac673dffb967b` | **100% MATCH** |
| `multi_league_research_predictions.jsonl` | `0128616a43968be5fddab76ea5c57da731955e22b1bf27bca3f886938187a12f` | `0128616a43968be5fddab76ea5c57da731955e22b1bf27bca3f886938187a12f` | **100% MATCH** |
| **OddsPapi Quota** | 260 consumed / 250 limit | 260 consumed / 250 limit (Circuit Breaker Tripped) | **0 Calls Consumed** |
| **Production DB (`rgkrfzxipkrwqccfuqfq`)** | Zero queries / zero writes | Zero queries / zero writes | **100% Isolated** |

---

## 5. Strategic Classification & Completion Verdict

```text
================================================================================
EPIC 100G.3 COMPLETION VERDICT
================================================================================
CANONICAL BASELINE COMPLETENESS : PASS (All 8 core tables + 1 audit table)
MIGRATION RECONCILIATION        : PASS (3-state compatibility rule enforced)
FRESH DATABASE BOOTSTRAP        : PASS (Zero-pre-existing-table bootstrap)
PARTIAL DATABASE HANDLING       : PASS (Compatible upgrades; records preserved)
REPEAT RUN IDEMPOTENCY          : PASS (Zero duplicate errors on repeat runs)
FAIL-CLOSED CORRUPTION GUARD    : PASS (Type/constraint drift aborts cleanly)
DELTA ROLLBACK REVERSIBILITY    : PASS (Zero data destruction; baseline survives)
SUPABASE COMPATIBILITY          : PASS (Native roles, RLS, search path secured)
APPLICATION REPOSITORY CONTRACT : PASS (5/5 repositories verified)
HISTORICAL LEDGER INTEGRITY     : PASS (3/3 hashes byte-identical)
================================================================================
FINAL CLASSIFICATION            : BOOTSTRAP READY
PRODUCTION STATUS               : STRICTLY NO-GO (DEPLOYMENT HOLD)
================================================================================
```

---

## 6. Manual Prerequisites Before Staging Provisioning

In accordance with the project owner's instruction:
> *"Belum perlu membuat project Supabase staging hari ini. Selesaikan EPIC 100G.3 lebih dahulu. Setelah itu, kita akan memiliki satu urutan bootstrap yang jelas dan bisa diuji dari database kosong sampai semua repository berjalan."*

When the user is ready to provision the Supabase staging project, the operational sequence is now completely deterministic and ready:

1. **Provision Project on Supabase Dashboard**:
   - Name: `salmo-staging`
   - Dedicated database (PostgreSQL 16)
   - Save credentials privately in `.env.local`
2. **Execute Pre-Bootstrap Baseline Dump**:
   - `pg_dump "$env:STAGING_DATABASE_URL" --schema-only --file="scratch/staging_baseline_pre_migration.sql"`
3. **Apply Deterministic Bootstrap**:
   - Run `data/migrations/20261105_fresh_database_bootstrap.sql` over Direct Port 5432 or Supabase Dashboard SQL Editor.
4. **Execute Staging Verification Test Suite**:
   - Run the 12 adversarial scenarios and 5 repository contract tests directly against remote staging.
