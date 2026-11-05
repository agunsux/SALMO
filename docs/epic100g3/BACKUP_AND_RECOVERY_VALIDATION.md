# BACKUP, DISASTER RECOVERY & ROLLBACK VALIDATION REPORT

**Epic**: EPIC 100G.3 — Fresh Database Bootstrap, Migration Reconciliation & Recovery Validation  
**Document**: Phase G — Backup Strategy & Recovery Validation  
**Date**: November 5, 2026  
**Auditor**: Astra (Principal PostgreSQL Architect & Database Reliability Engineer)  
**Status**: **VALIDATED & TESTED**  
**Production Recommendation**: **STRICTLY NO-GO (DEPLOYMENT HOLD)**  

---

## 1. Executive Summary & Core Distinctions

A fundamental principle established in EPIC 100G.3 is that **a schema-only dump is NOT a complete data backup**.

This document defines the complete recovery architecture across three distinct recovery stages:
1. **Pre-Bootstrap Baseline Dump**: Captures the initial empty state of the fresh database before any migrations are applied.
2. **Pre-Migration Data Backup**: Captures table contents (`data-only` or full logical dump) before applying delta updates to an existing database.
3. **Post-Bootstrap Verification Dump**: Golden reference snapshot verifying that the resulting schema matches the expected canonical contract.

---

## 2. The 3-Tier Recovery Point Taxonomy

| Recovery Tier | Target State | Tool / Command | Purpose | Retention |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1: Pre-Bootstrap Baseline** | Unmigrated clean Supabase DB | `pg_dump --schema-only` | Clean slate fallback if initial bootstrap fails | Stored in `scratch/staging_baseline_pre_migration.sql` |
| **Tier 2: Pre-Migration Data Backup** | Pre-existing staging data | `pg_dump -Fc --data-only` | Protects test fixtures and staged odds from corruption | Stored in encrypted artifact directory |
| **Tier 3: Post-Bootstrap Golden Reference** | Bootstrapped canonical DB | `pg_dump --schema-only` | Schema parity comparison against future migrations | Stored in `docs/epic100g3/golden_schema.sql` |

---

## 3. Rollback Scope & Data-Loss Limitations

The rollback script (`STAGING_ROLLBACK.sql`) was specifically engineered with **zero data destruction**:

```sql
-- 1. Drops RLS policies (reverts access control)
DROP POLICY IF EXISTS p_anon_matches_read ON public.matches;
...
-- 2. Drops immutability triggers (unfreezes rows for administrative correction)
DROP TRIGGER IF EXISTS trg_immutable_settlement_results ON public.settlement_results;
...
-- 3. Relaxes strict check constraints safely
ALTER TABLE public.prediction_ledger DROP CONSTRAINT IF EXISTS chk_ledger_prob;
...
-- NOTICE: Core tables matches, prediction_ledger, settlement_results ARE NOT DROPPED!
```

### Data-Loss Guarantees:
- **No `DROP TABLE`**: Tables `matches`, `prediction_ledger`, `settlement_results`, and `daily_picks` remain intact.
- **No `DELETE` or `TRUNCATE`**: All historical rows and test fixtures remain preserved.
- **Reversibility**: As proven in Scenario T11, the unified bootstrap can be re-applied immediately after rollback, returning the database to 100% compliant canonical status.

---

## 4. Empirical Test Verification in PostgreSQL 16

The recovery protocols were empirically validated in isolated local databases:
- **Mid-Transaction Abort (Scenario T9)**: Verified that when an error occurs inside a migration block, `ROLLBACK` executes automatically, leaving zero partial tables or constraints.
- **Delta Rollback (Scenario T10)**: Applied bootstrap, executed rollback script, and verified that baseline tables and records survived intact while triggers were removed.
- **Reapply After Rollback (Scenario T11)**: Re-executed bootstrap on a rolled-back database. All 9 tables, 5 triggers, and 15 RLS policies were restored cleanly with zero duplicate constraint errors.
