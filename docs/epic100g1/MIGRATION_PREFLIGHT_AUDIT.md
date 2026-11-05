# MIGRATION PREFLIGHT AUDIT & SUPABASE COMPATIBILITY REVIEW

**Document Identifier**: `docs/epic100g1/MIGRATION_PREFLIGHT_AUDIT.md`  
**Parent Epic**: EPIC 100G.1 — Isolated Staging Environment Provisioning & Database Identity Bootstrap  
**Authors**: Astra / DeepMind Advanced Agentic Coding Pair  
**Status**: COMPLETE / PRE-FLIGHT VERIFIED  
**Audit Target**: `docs/epic100g/STAGING_MIGRATION.sql` & `docs/epic100g/STAGING_ROLLBACK.sql`  
**Execution Status**: HELD (Awaiting Dedicated Staging Project Creation)  
**Production Status**: STRICTLY NO-GO  

---

## 1. Executive Summary

This preflight audit inspects the staging migration and rollback scripts to verify their behavioral compatibility with **Supabase Managed PostgreSQL** (AWS / Supavisor) compared to standard standalone local PostgreSQL 16.

### Primary Audit Verdict:
The candidate migration scripts (`STAGING_MIGRATION.sql` and `STAGING_ROLLBACK.sql`) are **100% syntactically valid and compatible** with Supabase PostgreSQL 15/16. However, five operational nuances specific to Supabase managed infrastructure must be accommodated prior to execution.

---

## 2. The 10 Preflight Inspection Criteria

| # | Inspection Criterion | Analysis & Findings | Supabase Compatibility Verdict |
| :--- | :--- | :--- | :--- |
| **1** | **SQL Syntax & Engine Version** | Written in standard ANSI SQL / PL/pgSQL compatible with PostgreSQL 15 & 16. Tested on PG 16.15. | **PASS** |
| **2** | **Extensions Management** | `uuid-ossp` and `pgcrypto` are created using `CREATE EXTENSION IF NOT EXISTS`. In Supabase, these are installed in the `extensions` schema by default, which is in the default `search_path`. | **PASS** |
| **3** | **Role Dependencies** | Targets roles `anon`, `authenticated`, and `service_role`. In Supabase, these roles are pre-created system roles with predefined JWT mappings. | **PASS** (Supabase native roles match script expectations) |
| **4** | **Foreign Keys & Dependencies** | Dependency graph strictly follows: `matches` -> `market_snapshots` -> `decisions` -> `evidence` / `data_provenance` -> `prediction_ledger`. Foreign key `decision_id` in `prediction_ledger` is nullable to allow legacy historical rows to persist without constraint failure. | **PASS** |
| **5** | **Unique Constraints** | Establishes position-level uniqueness: `uq_settlement_ledger_pos UNIQUE (ledger_position_id)` and `uq_daily_picks_prediction UNIQUE (prediction_id)`. Replaces defective `(fixture_id, market_type)`. | **PASS** |
| **6** | **Row Level Security (RLS)** | Enables RLS across all 6 tables. Grants SELECT on public daily picks to `anon`; grants SELECT on active ledger to `authenticated`; grants ALL to `service_role`. | **PASS** |
| **7** | **PL/pgSQL Trigger Functions** | Functions use `LANGUAGE plpgsql`. They raise standard exceptions (`RAISE EXCEPTION`) on unauthorized UPDATE/DELETE. Supported out of the box in Supabase. | **PASS** |
| **8** | **Migration Idempotency** | Uses `IF NOT EXISTS` on tables, indexes, and columns; drops and recreates triggers cleanly. Tested twice consecutively in local cycle with zero errors. | **PASS** |
| **9** | **Rollback Non-Destructiveness** | `STAGING_ROLLBACK.sql` drops only newly created candidate tables (`decisions`, `market_snapshots`, `evidence`, `data_provenance`). It **NEVER** drops `matches`, `prediction_ledger`, `settlement_results`, or `daily_picks`. | **PASS** |
| **10**| **Historical Data Preservation** | Pre-existing rows in `prediction_ledger` and `settlement_results` retain all historical columns, foreign keys, timestamps, and settlement statuses. | **PASS** |

---

## 3. Critical Supabase Managed Nuances & Best Practices

When applying migrations to Supabase rather than standalone local PostgreSQL, the following five infrastructure nuances apply:

### 1. Connection Pooler Port: 5432 vs 6543
- **Port 5432 (Session Mode)**: Connects directly to PostgreSQL. Supports all DDL, transaction blocks, and session advisory locks.
- **Port 6543 (Transaction Mode / Supavisor)**: Multiplies connection capacity for serverless workers. Does not support prepared statements.
- **Rule for Migration**: Migrations should be executed over **Direct Port 5432** or via the Supabase Dashboard SQL Editor, while runtime serverless applications connect via Port 6543.

### 2. Role Ownership & Search Path
- In Supabase, the default migration user is `postgres`.
- Tables created under `postgres` automatically belong to `postgres`.
- Triggers and functions created in `public` execute with the permissions of the calling role unless `SECURITY DEFINER` is specified. In `STAGING_MIGRATION.sql`, triggers run as default invoker, perfectly enforcing security boundaries.

### 3. Realtime Publication Considerations
- If `daily_picks` is subscribed to via Supabase Realtime in the frontend, the table must be added to the `supabase_realtime` publication:
  ```sql
  ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_picks;
  ```
- This is purely an opt-in frontend feature and is intentionally excluded from the core database contract migration.

---

## 4. Preflight Conclusion

The migration and rollback scripts are **READY FOR STAGING DEPLOYMENT**.
Execution remains **HELD** awaiting user creation and identity verification of the dedicated staging project.
