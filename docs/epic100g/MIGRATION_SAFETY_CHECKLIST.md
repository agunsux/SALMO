# STAGING MIGRATION SAFETY CHECKLIST

**Document Identifier**: `docs/epic100g/MIGRATION_SAFETY_CHECKLIST.md`  
**Parent Epic**: EPIC 100G — Staging Database Migration, Security Parity & Rollback Validation  
**Authors**: Astra / DeepMind Advanced Agentic Coding Pair  
**Status**: COMPLETE / PRE-FLIGHT VERIFIED  
**Production Status**: STRICTLY NO-GO  

---

## 1. Executive Summary

This checklist enforces the mandatory operational prerequisites and safety gates that must be satisfied before any database migration script (`STAGING_MIGRATION.sql`) is executed against a remote database.

---

## 2. The 10-Point Migration Safety Checklist

| Check # | Safety Check Description | Verification Method | Status for Remote Supabase (`rgkrfzxipkrwqccfuqfq`) | Status for Local Staging (`salmo_test`) |
| :--- | :--- | :--- | :--- | :--- |
| **Check 1** | **Target Environment Identification** | Explicit verification that the connection URL does not point to live production. | **FAILED (Target is LIVE PRODUCTION)** | **PASSED (`127.0.0.1:5432/salmo_test`)** |
| **Check 2** | **Point-in-Time Recovery (PITR) & Backup** | A full database snapshot or WAL backup exists prior to migration execution. | **UNVERIFIED on remote** | **PASSED (Local backup available)** |
| **Check 3** | **Transaction Enclosure** | The migration script is enclosed within a single atomic `BEGIN ... COMMIT` block. | **PASSED (`STAGING_MIGRATION.sql`)** | **PASSED** |
| **Check 4** | **Pre-Flight Assertions** | Automated validation of PostgreSQL version and pre-existing base tables. | **PASSED (Embedded in script)** | **PASSED** |
| **Check 5** | **Non-Destructive Invariant** | No pre-existing tables (`matches`, `prediction_ledger`, etc.) are dropped or truncated. | **PASSED (Only `CREATE IF NOT EXISTS` / `ADD COLUMN`)** | **PASSED** |
| **Check 6** | **Rollback Script Verification** | A corresponding rollback script (`STAGING_ROLLBACK.sql`) exists and has been tested. | **PASSED (Tested locally)** | **PASSED (Tested 100% clean)** |
| **Check 7** | **Post-Flight Assertions** | Automated verification of newly created tables, constraints, and triggers before commit. | **PASSED (Embedded in script)** | **PASSED** |
| **Check 8** | **Connection Pooler Compatibility** | Script does not rely on session-level locks or prepared statements unsupported by transaction poolers. | **PASSED (DDL-compatible)** | **PASSED** |
| **Check 9** | **Least-Privilege Security Policies** | RLS enabled and grants restricted for `anon` and `authenticated` roles. | **PASSED (`tests/epic100g_staging_security_validation.test.js`)** | **PASSED** |
| **Check 10** | **Historical Ledger Hash Invariant** | SHA-256 hashes of the 3 protected historical ledgers remain byte-identical before and after migration. | **PASSED (Hashes verified byte-identical)** | **PASSED** |

---

## 3. Go / No-Go Decision Rule

- **If Check 1 FAILS**: Immediate **FATAL STOP**. No migration script may be executed under any circumstances.
- **Current Operational Decision**:
  - Remote Supabase (`rgkrfzxipkrwqccfuqfq`): **NO-GO (EXECUTION STRICTLY FORBIDDEN)**.
  - Local Staging Environment (`salmo_test`): **GO (VALIDATED & VERIFIED)**.
