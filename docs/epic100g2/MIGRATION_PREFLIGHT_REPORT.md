# MIGRATION PREFLIGHT & DEPENDENCY COMPATIBILITY REPORT

**Epic**: EPIC 100G.2 — Remote Staging Identity Verification & Read-Only Preflight  
**Document**: Phase C — Migration Preflight & Execution Risk Analysis  
**Date**: November 5, 2026  
**Auditor**: Astra (Advanced Agentic Pair Programmer)  
**Status**: **PREFLIGHT AUDITED — READY FOR STAGING BOOTSTRAP**  
**Production Status**: **STRICTLY NO-GO (DEPLOYMENT HOLD)**  

---

## 1. Executive Summary

This report delivers the preflight engineering audit of the planned migration scripts:
- **Forward Migration**: `data/migrations/20261105_epic100g_staging_canonical_migration.sql` (and `docs/epic100g/STAGING_MIGRATION.sql`)
- **Rollback Migration**: `data/migrations/20261105_epic100g_staging_canonical_migration_rollback.sql` (and `docs/epic100g/STAGING_ROLLBACK.sql`)
- **Authoritative Canonical DDL**: `data/schema_canonical.sql`

The audit identifies object creation sequences, foreign key dependencies, constraint collision risks, connection port restrictions, and Supabase managed PostgreSQL role requirements.

---

## 2. Key Findings & Preflight Diagnoses

### Finding 1: The Delta Migration vs. Fresh Database Paradox
- **Issue**: `STAGING_MIGRATION.sql` lines 20–32 contain pre-migration assertions:
  ```sql
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'matches') THEN
    RAISE EXCEPTION 'PRE-MIGRATION ASSERTION FAILED: Table public.matches does not exist.';
  END IF;
  ```
- **Risk**: In a freshly provisioned Supabase staging project, the `public` schema has zero tables. Executing `STAGING_MIGRATION.sql` first will cause an immediate transaction abort.
- **Remediation**: The deployment runbook must first execute the canonical base bootstrap from `data/schema_canonical.sql` (which creates all 8 tables, indexes, and initial constraints idempotently), OR use a unified bootstrap script that combines base table creation with canonical hardening.

### Finding 2: Foreign Key Dependency Topology
The relational dependency graph must be created in strict topological order to prevent unresolved foreign key errors:

```text
[matches] (Level 0 - Root Entity)
    │
    ├──► [market_snapshots] (Level 1 - Depends on matches.id)
    │         │
    │         ▼
    └──► [decisions] (Level 2 - Depends on matches.id & market_snapshots.id)
              │
              ├──► [prediction_ledger] (Level 3 - Depends on matches.id & decisions.id)
              │         │
              │         ▼
              │    [settlement_results] (Level 4 - Unique on ledger_position_id)
              │
              ├──► [evidence] (Level 3 - Depends on decisions.id)
              │
              └──► [data_provenance] (Level 3 - Depends on decisions.id)

[daily_picks] (Independent root, references prediction_id via unique constraint)
```

**Verification**: `data/schema_canonical.sql` adheres strictly to this topological ordering.

### Finding 3: Unique Constraint Evolution on Settlement Results
- **Previous Risk**: EPIC 100E identified that constraint `uq_settlement_fixture_market UNIQUE(fixture_id, market_type)` causes collisions when multiple positions are taken on the same match (e.g. AH -0.25 and AH -0.5).
- **Preflight Verification**: The migration properly drops `uq_settlement_fixture_market` and installs:
  ```sql
  ALTER TABLE public.settlement_results
    ADD CONSTRAINT uq_settlement_ledger_pos UNIQUE (ledger_position_id);
  ```
  This guarantees that position-level settlement proceeds deterministically.

### Finding 4: Supabase Connection Mode Requirements (Port 5432 vs. 6543)
- **Direct Connection (Port 5432 - Session Mode)**:
  - Required for executing DDL migrations, creating extensions, setting schema search paths, and defining trigger functions.
  - Connection format: `postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres` (or direct host).
- **Transaction Pooler (Port 6543 - Supavisor Mode)**:
  - Required for application runtime queries (`dbClient.ts`).
  - Does NOT support certain session-level DDL locks or transaction-scoped prepared statements.
- **Rule**: Migration execution must use Direct Port 5432 or Supabase Dashboard SQL Editor.

### Finding 5: Extension Schema Placement
- In Supabase managed PostgreSQL, extensions reside in the `extensions` schema rather than `public`.
- The migration scripts execute:
  ```sql
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  ```
- **Preflight Check**: Supabase automatically provisions both extensions in the `extensions` schema. Search path resolution ensures `gen_random_uuid()` is available globally.

### Finding 6: Zero Legacy Data Risk
Because the staging database is a freshly provisioned instance:
- Existing row count = 0.
- Check constraints (`chk_ledger_prob`, `chk_ledger_odds`, `chk_ledger_result_status`, `chk_decisions_prob`) will encounter zero violating rows.
- Unique constraints (`uq_prediction_ledger_doi`, `uq_daily_picks_prediction`) will encounter zero duplicate records.

---

## 3. Rollback Feasibility & Safety Assessment

The rollback script (`STAGING_ROLLBACK.sql`) was analyzed:
1. **Pre-Rollback Assertion**: Checks if `public.prediction_ledger` exists.
2. **Policy Removal**: Drops all 11 RLS policies created during migration.
3. **Trigger Deletion**: Safely removes immutability triggers and drops corresponding functions.
4. **Constraint Relaxation**: Drops added check constraints and foreign keys without dropping core tables.
5. **Data Preservation**: Rollback does NOT execute `DROP TABLE` on `matches`, `prediction_ledger`, `settlement_results`, or `daily_picks`.

---

## 4. Phase C Conclusion

- **Schema Architecture**: **VERIFIED COMPATIBLE**.
- **Bootstrap Requirement**: Must apply base table DDL (`schema_canonical.sql`) before or in conjunction with delta constraints.
- **Migration Authorization**: **NOT GRANTED** (Phase C is read-only preflight; migration execution is deferred to EPIC 100G.3).
