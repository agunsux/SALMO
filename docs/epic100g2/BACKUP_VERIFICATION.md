# STAGING BACKUP & DISASTER RECOVERY VERIFICATION REPORT

**Epic**: EPIC 100G.2 — Remote Staging Identity Verification & Read-Only Preflight  
**Document**: Phase D — Backup Verification & Disaster Recovery Specification  
**Date**: November 5, 2026  
**Auditor**: Astra (Advanced Agentic Pair Programmer)  
**Status**: **BACKUP VERIFICATION BLOCKED (AWAITING PROVISIONING)**  
**Production Status**: **STRICTLY NO-GO (DEPLOYMENT HOLD)**  

---

## 1. Executive Summary & Principle of Zero-Assumption

In strict compliance with **Phase D Instructions**:
> *"Determine whether an appropriate staging backup or recovery point exists. If not, report the exact required action. Do not assume a backup exists merely because Supabase supports backups."*

### Current Status:
Because the dedicated staging project (`salmo-staging`) has not yet been provisioned by the user, **no active backup, snapshot, or recovery point currently exists**.

Assuming that a backup exists simply because Supabase provides cloud backups is dangerous:
1. Supabase automated daily backups run on a nightly platform schedule (00:00–06:00 UTC). A freshly created project has no completed automated snapshot until the next backup window.
2. Free tier projects do not feature Point-in-Time Recovery (PITR); rollback depends entirely on explicit logical schema dumps (`pg_dump`) or transactional rollback scripts.

---

## 2. Required Pre-Migration Backup Protocol (Runbook)

Before any DDL, migration, or write operation is permitted on the newly created staging project, the following 3-step disaster recovery protocol must be executed:

### Step 1: Capture Pre-Migration Baseline Dump
Execute an explicit logical schema dump of the clean, unmigrated staging database:

```powershell
# Run from repository root against verified staging database URL
pg_dump "$env:STAGING_DATABASE_URL" `
  --schema-only `
  --no-owner `
  --no-privileges `
  --file="scratch/staging_baseline_pre_migration.sql"
```

### Step 2: Cryptographic Verification of the Baseline Dump
Calculate and record the SHA-256 hash of `scratch/staging_baseline_pre_migration.sql`:
```powershell
Get-FileHash scratch/staging_baseline_pre_migration.sql -Algorithm SHA256
```
This file serves as the golden recovery baseline.

### Step 3: Verify Rollback Runbook Readiness
Confirm that `data/migrations/20261105_epic100g_staging_canonical_migration_rollback.sql` is ready to revert policies, triggers, and constraints if needed:
- Rollback execution target: Direct connection (Port 5432).
- Transactional safety: All rollback operations are enclosed in `BEGIN ... COMMIT`.

---

## 3. Disaster Recovery Scenario Matrix

| Incident Scenario | Failure Mode | Recovery Procedure | Target RTO / RPO |
| :--- | :--- | :--- | :--- |
| **Migration Syntax Error** | Transaction abort during `BEGIN ... COMMIT` | Postgres rolls back automatically. Zero changes applied. | RTO: < 1 min<br>RPO: 0 sec |
| **Partial DDL Failure** | Non-transactional lock timeout or extension error | Restore clean state via `psql -f scratch/staging_baseline_pre_migration.sql` | RTO: < 5 min<br>RPO: 0 sec |
| **Unintended Schema Mutation** | Migration creates undesired column/index | Execute `STAGING_ROLLBACK.sql` or restore baseline dump | RTO: < 5 min<br>RPO: 0 sec |
| **Production Target Misconfiguration** | Guard detects production URL | `EnvironmentGuard` halts process immediately before connection | RTO: Instant<br>RPO: 0 sec |

---

## 4. Phase D Conclusion & Gate Decision

- **Backup Verification Status**: **BLOCKED (Awaiting Staging Provisioning)**
- **Baseline Dump Available**: **NO (Project not yet created)**
- **Mandate**: Migration authorization cannot be granted until the staging project is provisioned and the baseline dump is physically generated and verified.
