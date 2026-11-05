# DETERMINISTIC BOOTSTRAP ARCHITECTURE SPECIFICATION

**Epic**: EPIC 100G.3 — Fresh Database Bootstrap, Migration Reconciliation & Recovery Validation  
**Document**: Phase C — Bootstrap Architecture Design & Lifecycle  
**Date**: November 5, 2026  
**Auditor**: Astra (Principal PostgreSQL Architect & Data Integrity Auditor)  
**Status**: **ARCHITECTURE CERTIFIED**  
**Production Recommendation**: **STRICTLY NO-GO (DEPLOYMENT HOLD)**  

---

## 1. Architectural Philosophy & Objectives

The SALMO unified bootstrap (`FRESH_DATABASE_BOOTSTRAP.sql`) replaces the fragmented approach of running multiple disconnected migration scripts with **one deterministic, fully transactional bootstrap process**.

### Core Architecture Goals:
1. **Zero-Configuration Fresh Provisioning**: Instantiates an empty PostgreSQL 16 / Supabase database to full production capability without manual table pre-creation.
2. **Safe Schema Upgrade**: Can run against a database that already has partial or legacy tables, upgrading columns and constraints without dropping existing data.
3. **Fail-Closed Drift Detection**: If existing columns or constraints conflict with the canonical contract, the migration halts immediately and rolls back cleanly.
4. **Autonomous Verification**: Contains built-in self-testing assertions that verify table counts, foreign keys, triggers, and RLS before committing the transaction.
5. **Audited Version Ledger**: Automatically registers the execution record and SHA-256 checksum in `_salmo_migrations`.

---

## 2. Six-Stage Bootstrap Lifecycle Flow

```text
================================================================================
STAGE 1: PREREQUISITES & EXTENSION VALIDATION
  - Asserts PostgreSQL version >= 15.0
  - Provisions "uuid-ossp" and "pgcrypto" in extensions schema
================================================================================
                                │
                                ▼
================================================================================
STAGE 2: MIGRATION TRACKING INFRASTRUCTURE
  - Creates public._salmo_migrations tracking table
================================================================================
                                │
                                ▼
================================================================================
STAGE 3: TOPOLOGICAL CANONICAL TABLE CREATION & RECONCILIATION
  - Evaluates 3-state compatibility (Absent -> CREATE, Compatible -> KEEP, Incompatible -> FAIL)
  - Creates tables in strict dependency order:
    1. matches
    2. market_snapshots
    3. decisions
    4. evidence & data_provenance
    5. prediction_ledger
    6. daily_picks
    7. settlement_results
================================================================================
                                │
                                ▼
================================================================================
STAGE 4: IMMUTABILITY ENFORCEMENT & TRIGGERS
  - Creates kickoff sync trigger on matches
  - Creates immutable trigger on market_snapshots (Blocks UPDATE/DELETE)
  - Creates immutable trigger on decisions (Blocks UPDATE/DELETE)
  - Creates immutable trigger on prediction_ledger (Blocks DELETE & decision params)
  - Creates immutable trigger on settlement_results (Blocks DELETE - Append only)
================================================================================
                                │
                                ▼
================================================================================
STAGE 5: ROW-LEVEL SECURITY (RLS) & LEAST-PRIVILEGE GRANTS
  - Ensures roles anon, authenticated, and service_role exist
  - Enables RLS on all 8 tables
  - Creates 15 dedicated RLS policies
  - Grants specific least-privilege permissions
================================================================================
                                │
                                ▼
================================================================================
STAGE 6: POST-BOOTSTRAP CONTRACT VERIFICATION ASSERTION & COMMIT
  - Self-audit DO block asserts table count >= 9, triggers >= 5, RLS enabled
  - Inserts version record into public._salmo_migrations
  - Issues COMMIT
================================================================================
```

---

## 3. Why Unified Bootstrap Over Fragmented Scripts?

| Design Approach | Operational Risk | Error Behavior | Fresh Staging Result |
| :--- | :--- | :--- | :--- |
| **Fragmented Sequential Scripts** (`schema_canonical.sql` followed by `STAGING_MIGRATION.sql`) | Pre-migration assertions in delta fail on clean DB; duplicate triggers and indexes created; multiple non-atomic transactions. | Partial failures leave intermediate dirty schema states. | **CRITICAL FAILURE** (Asserts base tables exist). |
| **Unified Deterministic Bootstrap** (`FRESH_DATABASE_BOOTSTRAP.sql`) | Single atomic transaction (`BEGIN ... COMMIT`); idempotent; verifies compatibility; records migration state. | Fails closed on any defect, rolling back 100% of operations. | **100% SUCCESS** (Zero manual prerequisite needed). |

---

## 4. Operational Invariants Enforced by Architecture

1. **Transaction Atomicity**: Either 100% of the bootstrap lands, or 0% lands. No half-migrated state can persist.
2. **Deterministic Checksums**: Every migration script is cryptographically hashed and versioned in `_salmo_migrations`.
3. **Zero Data Destruction**: No `DROP TABLE` commands exist anywhere in the forward bootstrap. Existing records in `matches` or `prediction_ledger` survive unconditionally.
4. **Strict Isolation**: Production target `rgkrfzxipkrwqccfuqfq` is safeguarded by application-level guards, while local bootstrap operates strictly in isolated databases.
