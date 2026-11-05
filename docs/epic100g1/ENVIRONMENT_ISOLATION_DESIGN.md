# ENVIRONMENT ISOLATION & FAIL-CLOSED DATABASE CONNECTION DESIGN

**Document Identifier**: `docs/epic100g1/ENVIRONMENT_ISOLATION_DESIGN.md`  
**Parent Epic**: EPIC 100G.1 — Isolated Staging Environment Provisioning & Database Identity Bootstrap  
**Authors**: Astra / DeepMind Advanced Agentic Coding Pair  
**Status**: COMPLETE / IMPLEMENTED & TESTED  
**Production Status**: STRICTLY NO-GO  

---

## 1. Executive Summary

In multi-environment cloud and serverless applications, the greatest risk to data integrity is the **silent production fallback vulnerability**—a design defect where an unconfigured staging or test worker defaults to production database variables (`DATABASE_URL`, `SUPABASE_URL`), inadvertently mutating or deleting live production data.

This document details the architectural redesign of Salmo's database connection factories and environment managers to enforce **complete fail-closed isolation** between Production and Staging.

---

## 2. Comprehensive Connection Path Audit

Every component capable of initializing a database connection in Salmo was audited:

| Component Path | Function / Factory | Historical Vulnerability Identified | EPIC 100G.1 Hardened State |
| :--- | :--- | :--- | :--- |
| **`src/repositories/dbClient.ts`** | `getPostgresPool()` | When `LOCAL_POSTGRES_URL` was unset, it checked `DATABASE_URL`. If `DATABASE_URL` pointed to production, tests would hit production directly. | **HARDENED**: When running in staging (`APP_ENV === 'staging'` or `NODE_ENV === 'staging'`), it **requires** `STAGING_DATABASE_URL`. Missing variable throws fatal error; no fallback to production or localhost allowed. |
| **`src/lib/db.ts`** | `getDbClient()` | Bound directly to `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (production). | **ISOLATED**: Created separate factory `getStagingDbClient()`. Validates that `STAGING_SUPABASE_URL` does not match production before instantiating client. |
| **`src/config/env.ts`** | `EnvironmentValidator` | Staging configuration was unmapped; only general `database` object existed. | **EXTENDED**: Added typed `staging` configuration object with boolean `configured` flag and distinct staging variables. |
| **`.env.example`** | Documentation | Only production keys were listed. | **UPDATED**: Documented dedicated Section 3.1 for `STAGING_*` variables. |
| **`vercel.json`** | Deployment Spec | Empty crons array (`"crons": []`). | **PRESERVED**: Confirmed zero active crons. |
| **`.github/workflows/settle-cron.yml`**| CI/CD Runner | Manual dispatch with `ALLOW_PRODUCTION_DB_WRITE: 'false'`. | **PRESERVED**: Read-only dry run strictly enforced. |

---

## 3. Dedicated Staging Environment Variables

The staging runtime is governed exclusively by five distinct environment variables:

```bash
# 1. Staging REST API Endpoint
STAGING_SUPABASE_URL=https://<staging-ref>.supabase.co

# 2. Staging Public Key (Read-Only)
STAGING_SUPABASE_ANON_KEY=eyJ...staging_anon

# 3. Staging Service Role Key (Backend Administrative)
STAGING_SUPABASE_SERVICE_ROLE_KEY=eyJ...staging_service

# 4. Staging PostgreSQL Direct / Pooler Connection
STAGING_DATABASE_URL=postgresql://postgres.<staging-ref>:<pwd>@aws-0-<region>.pooler.supabase.com:6543/postgres

# 5. Approved Staging Project Reference (Enforced White-List Guard)
APPROVED_STAGING_PROJECT_REF=<staging-ref>
```

---

## 4. Architectural Rules of Isolation

### Rule 1: Zero Silent Fallbacks
If a process executes in staging mode and any required `STAGING_*` variable is missing or empty, the application **must immediately terminate** with an explicit error. Falling back to `SUPABASE_URL`, `DATABASE_URL`, or local defaults is strictly forbidden.

### Rule 2: Bidirectional Project Reference Collision Check
Before establishing any network socket to Supabase:
1. Extract the project reference from the staging target URL.
2. Compare it against the known production project reference:
   ```typescript
   if (stagingRef === 'rgkrfzxipkrwqccfuqfq') {
     throw new Error('FATAL: Staging URL targets LIVE PRODUCTION.');
   }
   ```
3. If they match, abort immediately.

### Rule 3: Credential Cross-Contamination Guard
The application inspects the staging service-role key. If it matches the production service-role key byte-for-byte, the environment guard rejects initialization, preventing accidental copying of production credentials into staging `.env` files.

### Rule 4: Credential-Safe Environment Logging
When logging configuration state at startup:
- Only log boolean presence (`hasServiceRoleKey: true`).
- Only log project references (e.g. `stagingProjectRef: "abcdefgh"`).
- **Never** print JWT payloads, passwords, or connection strings.
