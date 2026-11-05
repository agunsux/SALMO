# STAGING BACKUP & RECOVERY PLAN

**Document Identifier**: `docs/epic100g1/STAGING_RECOVERY_PLAN.md`  
**Parent Epic**: EPIC 100G.1 — Isolated Staging Environment Provisioning & Database Identity Bootstrap  
**Authors**: Astra / DeepMind Advanced Agentic Coding Pair  
**Status**: COMPLETE / OPERATIONAL RUNBOOK  
**Target Target**: Dedicated Supabase Staging Project  
**Production Status**: STRICTLY NO-GO  

---

## 1. Executive Summary

This runbook establishes the disaster recovery, backup, and rollback procedures for the staging database. It defines the operational criteria for aborting a migration, executing rollbacks, and restoring database state from point-in-time snapshots without ever risking production data.

---

## 2. Supabase Staging Backup Mechanisms

| Backup Type | Mechanism & Frequency | Retention | RPO / RTO | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Physical WAL / PITR** | Continuous Write-Ahead Log archiving (Pro Tier). | 7 Days | RPO: seconds<br>RTO: < 15 min | Complete point-in-time restore in case of database corruption. |
| **Daily Automated Backup** | Supabase managed physical backup (Daily at 00:00 UTC). | 7 Days | RPO: 24 hours<br>RTO: < 30 min | Standard baseline recovery point. |
| **Pre-Migration Logical Backup** | `pg_dump` executed prior to running `STAGING_MIGRATION.sql`. | Stored in secure staging artifact storage | RPO: Exact pre-migration state<br>RTO: < 5 min | Immediate recovery point if manual migration fails. |

---

## 3. Pre-Migration Baseline Dump Procedure

Before executing `STAGING_MIGRATION.sql` on the newly provisioned staging database, the engineer must generate an immediate logical dump:

```bash
# 1. Set staging connection string privately
export PGPASSWORD="<staging-db-password>"

# 2. Execute pg_dump against STAGING ONLY (Port 5432)
pg_dump \
  -h aws-0-<region>.pooler.supabase.com \
  -p 5432 \
  -U postgres.<staging-project-ref> \
  -d postgres \
  --schema=public \
  -F c \
  -f "data/backup/staging_pre_migration_baseline.dump"
```

> [!CAUTION]
> Verify that the username contains the **staging project reference**, NOT `rgkrfzxipkrwqccfuqfq`!

---

## 4. Rollback Criteria & Triggers

A rollback must be initiated immediately if any of the following conditions occur during migration:

1. **Assertion Failure**: Any pre-flight or post-flight assertion inside `STAGING_MIGRATION.sql` throws `RAISE EXCEPTION`.
2. **Transaction Abort**: The migration transaction encounters a lock timeout, connection drop, or syntax exception.
3. **Repository Failure**: Post-migration acceptance tests fail to insert or retrieve decisions.
4. **Trigger Malfunction**: Legitimate settlement updates are rejected by `trg_immutable_prediction_ledger`.

---

## 5. Rollback Procedure

### Step 1: Automated Script Rollback
If the database remains responsive:
1. Run `STAGING_ROLLBACK.sql` using direct connection or Supabase SQL Editor.
2. The script:
   - Removes RLS policies.
   - Drops immutability triggers and trigger functions.
   - Relaxes foreign keys.
   - Drops `decisions`, `market_snapshots`, `evidence`, and `data_provenance`.
   - Leaves `matches`, `prediction_ledger`, `settlement_results`, and `daily_picks` completely intact.

### Step 2: Full State Restore from Baseline Dump
If the schema or catalog is in an inconsistent state:
```bash
pg_restore \
  -h aws-0-<region>.pooler.supabase.com \
  -p 5432 \
  -U postgres.<staging-project-ref> \
  -d postgres \
  --clean \
  --if-exists \
  "data/backup/staging_pre_migration_baseline.dump"
```

---

## 6. Protection Against Targeting Production during Rollback

To guarantee that a rollback script can **NEVER** accidentally execute against the production database:
1. `STAGING_ROLLBACK.sql` begins with:
   ```sql
   DO $$
   BEGIN
     -- Assert environment guard
     IF current_database() = 'postgres' AND current_user LIKE '%rgkrfzxipkrwqccfuqfq%' THEN
       RAISE EXCEPTION 'FATAL SECURITY VIOLATION: Rollback script attempted on PRODUCTION instance.';
     END IF;
   END $$;
   ```
2. `EnvironmentGuard.assertProductionWriteBlocked` checks the connection URI in Node.js before sending any query.
