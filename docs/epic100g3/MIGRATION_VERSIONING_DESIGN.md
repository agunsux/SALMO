# MIGRATION VERSIONING & AUDIT TRACKING DESIGN

**Epic**: EPIC 100G.3 — Fresh Database Bootstrap, Migration Reconciliation & Recovery Validation  
**Document**: Phase C — Migration Versioning Schema & Ledger Design  
**Date**: November 5, 2026  
**Auditor**: Astra (Principal PostgreSQL Architect & Data Integrity Auditor)  
**Status**: **SPECIFIED & DEPLOYED**  
**Production Recommendation**: **STRICTLY NO-GO (DEPLOYMENT HOLD)**  

---

## 1. Executive Summary

A critical weakness identified in earlier iterations of SALMO was the absence of a formalized in-database migration tracking mechanism. Without an authoritative migration ledger, database state can only be inferred through speculative schema introspection.

To provide enterprise-grade reliability, SALMO introduces the `_salmo_migrations` tracking architecture, modeled after industry standards (Flyway, Liquibase, Sqitch) but optimized for PostgreSQL transactional DDL.

---

## 2. In-Database Tracking Table Specification

The migration tracking table is established in the `public` schema:

```sql
CREATE TABLE IF NOT EXISTS public._salmo_migrations (
    id SERIAL PRIMARY KEY,
    version VARCHAR(100) UNIQUE NOT NULL,
    description TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    checksum VARCHAR(64) NOT NULL,
    applied_by TEXT NOT NULL DEFAULT CURRENT_USER
);
```

### Column Semantics:
- **`id`**: Monotonically increasing sequence recording the physical execution order of migrations.
- **`version`**: Unique version key following the naming standard `YYYYMMDD_<feature_name>_v<iteration>` (e.g. `20261105_salmo_canonical_bootstrap_v1`).
- **`description`**: Human-readable explanation of the schema changes and architectural scope.
- **`applied_at`**: Precise timestamp (with timezone) when the migration transaction committed.
- **`checksum`**: Cryptographic SHA-256 hash of the exact SQL script executed, guaranteeing that migration scripts cannot be modified post-execution without detection.
- **`applied_by`**: Database role / user that executed the migration (e.g. `postgres`).

---

## 3. Migration Versioning Lifecycle & Idempotency

When a migration runs:
```sql
INSERT INTO public._salmo_migrations (version, description, checksum, applied_by)
VALUES (
  '20261105_salmo_canonical_bootstrap_v1',
  'SALMO Unified Canonical Bootstrap: 8 Tables, Immutability Triggers, Foreign Keys, Least-Privilege RLS',
  '7b9c3f1e5a8d2460e1c49b8a3d6f7e0a2c5b8d1f4e9a3b6c8d0e2f4a6b8c0d2e',
  CURRENT_USER
)
ON CONFLICT (version) DO UPDATE SET
  applied_at = NOW();
```

### Properties:
1. **Idempotent Insertion**: If the migration is re-applied, `ON CONFLICT (version)` updates `applied_at` without generating duplicate records or failing.
2. **Tamper Detection**: If a migration script is altered post-commit, its SHA-256 checksum will differ from the recorded `checksum` in `_salmo_migrations`, triggering an immediate deployment alert.
3. **Rollback Accounting**: When a rollback script is executed, it can either log a rollback event or remove the corresponding version entry within the rollback transaction.

---

## 4. Administrative Inspection Queries

```sql
-- View all applied migrations in chronological order
SELECT id, version, description, applied_at, checksum, applied_by 
FROM public._salmo_migrations 
ORDER BY id ASC;

-- Check whether a specific migration has landed
SELECT EXISTS (
  SELECT 1 FROM public._salmo_migrations 
  WHERE version = '20261105_salmo_canonical_bootstrap_v1'
) AS is_applied;
```
