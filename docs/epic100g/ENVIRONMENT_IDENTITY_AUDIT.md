# ENVIRONMENT IDENTITY & DATABASE SELECTION AUDIT

**Document Identifier**: `docs/epic100g/ENVIRONMENT_IDENTITY_AUDIT.md`  
**Parent Epic**: EPIC 100G — Staging Database Migration, Security Parity & Rollback Validation  
**Authors**: Astra / DeepMind Advanced Agentic Coding Pair  
**Status**: COMPLETE / CRITICAL STOPPING GATE TRIGGERED  
**Target Assessment**: Staging Environment Identity Verification  
**Production Posture**: STRICTLY NO-GO (Remote Database is LIVE PRODUCTION)  

---

## 1. Executive Summary & Critical Stop Protocol

In accordance with Rule 10 of EPIC 100G:
> *"If staging identity cannot be conclusively established, STOP before executing migrations. Read-only inspection is permitted where credentials and permissions allow it. Any staging DDL/DML must be preceded by explicit confirmation that the target is staging, a backup or recovery point exists, and the migration plan has been reviewed. Do not infer authorization from this task."*

A forensic environment identity audit was conducted across `.env.local`, `.env.example`, CI workflows, application database connection selectors, and historical audit reports.

### Key Audit Finding:
1. The remote Supabase endpoint configured in `.env.local` (`https://rgkrfzxipkrwqccfuqfq.supabase.co`, Project Ref: `rgkrfzxipkrwqccfuqfq`) is the **LIVE PRODUCTION INSTANCE**, as formally documented in `docs/research/SALMO_EPIC81_DURABILITY_STAGING_AND_READINESS_REPORT.md` (Line 66) and `docs/research/SALMO_EPIC82_CLOSURE_REPORT.md` (Line 88).
2. **There is NO isolated Supabase staging project configured** in `.env.local`, `.env.example`, or GitHub repository secrets.
3. Attempting to execute `STAGING_MIGRATION.sql` against `rgkrfzxipkrwqccfuqfq.supabase.co` would constitute an unauthorized mutation of the live production database, directly violating Non-Negotiable Rule 1 ("Do not execute DDL or DML against production") and Rule 2 ("Do not use production credentials for staging").
4. **Action Taken**: In strict compliance with Rule 10, **all remote database migration executions against Supabase are HALTED**. The migration scripts (`STAGING_MIGRATION.sql` and `STAGING_ROLLBACK.sql`) have been fully designed and validated locally in an isolated PostgreSQL 16 test environment, ready to be deployed as soon as a dedicated staging project is provisioned.

---

## 2. Environment Configuration Matrix & Secret Redaction

| Configuration Parameter | Environment Variable | Declared Scope | Sanitized Target | Provenance & Environment Identity |
| :--- | :--- | :--- | :--- | :--- |
| **Local PostgreSQL** | `LOCAL_POSTGRES_URL` | Local Development & Integration Tests | `postgresql://postgres@127.0.0.1:5432/salmo_test` | **LOCAL TEST DAEMON** (PostgreSQL 16.15) |
| **Production Pooler** | `DATABASE_URL` | Application Database Connection | `(Undefined / Not set in .env.local)` | Fallback to `LOCAL_POSTGRES_URL` or localhost |
| **Remote Supabase API** | `SUPABASE_URL` | Supabase Client / REST API | `https://rgkrfzxipkrwqccfuqfq.supabase.co` | **LIVE PRODUCTION INSTANCE** (Project: `rgkrfzxipkrwqccfuqfq`) |
| **Public Supabase API** | `NEXT_PUBLIC_SUPABASE_URL` | Frontend Web Client | `https://rgkrfzxipkrwqccfuqfq.supabase.co` | **LIVE PRODUCTION INSTANCE** |
| **Supabase Anon Key** | `SUPABASE_ANON_KEY` | Public Read Access | `eyJ...Pmk` (Redacted) | Live Production Public Anon JWT |
| **Service Role Key** | `SUPABASE_SERVICE_ROLE_KEY` | Backend Administrative / Cron | `eyJ...Vzs` (Redacted) | Live Production Administrative JWT |
| **Odds Provider** | `ODDS_PAPI_KEY` | Market Odds Feeder | `62c...663` (Redacted) | Live OddsPapi Account (260/250 exhausted) |
| **Odds Provider Pause**| `ODDSPAPI_PAUSED` | Circuit Breaker Flag | `false` in `.env.local` / `true` in guard logic | Hard-blocked by persistent quota check (260/250) |

---

## 3. Database Connection Selection & Fallback Risk Analysis

We conducted an architectural audit of every path capable of selecting a database connection in Salmo:

### Path 1: `src/repositories/dbClient.ts` (PostgreSQL Driver)
```typescript
const connectionString =
  process.env.LOCAL_POSTGRES_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres@127.0.0.1:5432/salmo_test';
```
- **Vulnerability Identified**: If a developer runs tests without setting `LOCAL_POSTGRES_URL`, and `DATABASE_URL` is populated with a production Supabase connection string (e.g. Supavisor pooler on port 6543), queries would **silently fall through to production**.
- **Safeguard In Place**: Currently, `DATABASE_URL` is completely absent from `.env.local`. Therefore, `dbClient.ts` strictly defaults to `salmo_test` on `127.0.0.1:5432`.

### Path 2: `src/lib/db.ts` (Supabase JS Client)
```typescript
const supabaseUrl = env.database.supabaseUrl || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  env.database.supabaseAnonKey ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
```
- **Vulnerability Identified**: Any service calling `getDbClient()` will bind directly to `https://rgkrfzxipkrwqccfuqfq.supabase.co` with `SUPABASE_SERVICE_ROLE_KEY`.
- **Enforcement**: Because this endpoint is production, `getDbClient()` write calls must be strictly blocked in staging tests.

---

## 4. Evidence of Production Identity for `rgkrfzxipkrwqccfuqfq`

Historical repository documentation conclusively establishes that `rgkrfzxipkrwqccfuqfq.supabase.co` is the live production instance:

1. **`docs/research/SALMO_EPIC81_DURABILITY_STAGING_AND_READINESS_REPORT.md` (Lines 66-71)**:
   > `SUPABASE_URL: Configured to rgkrfzxipkrwqccfuqfq.supabase.co (LIVE PRODUCTION INSTANCE).`  
   > `Testing against the live production instance (rgkrfzxipkrwqccfuqfq.supabase.co) was strictly rejected to prevent unapproved production mutation.`
2. **`docs/research/SALMO_EPIC81_DURABILITY_STAGING_AND_READINESS_REPORT.md` (Line 15)**:
   > `No isolated PostgreSQL staging database is configured in the environment (BLOCKED - STAGING PREREQUISITE NOT SATISFIED). Live production Supabase (rgkrfzxipkrwqccfuqfq.supabase.co) was preserved untouched in accordance with safety invariants.`
3. **`docs/research/SALMO_EPIC82_CLOSURE_REPORT.md` (Line 88)**:
   > `Production Boundary Enforcement: .env.local contains production Supabase endpoint (https://rgkrfzxipkrwqccfuqfq.supabase.co). In strict adherence to Rule 1 of this audit, zero migration or load tests were directed against this production endpoint.`

---

## 5. Architectural Recommendation & Staging Provisioning Plan

To unblock remote staging migrations in future epics without violating production safety:
1. Provision a distinct Supabase project (e.g. `salmo-staging-<id>.supabase.co`).
2. Add explicit staging environment variables in `.env.staging`:
   ```bash
   STAGING_SUPABASE_URL=https://<staging-id>.supabase.co
   STAGING_SUPABASE_ANON_KEY=...
   STAGING_SUPABASE_SERVICE_ROLE_KEY=...
   STAGING_DATABASE_URL=postgresql://postgres.<staging-id>:...pooler.supabase.com:6543/postgres
   ```
3. Update `dbClient.ts` to require explicit `NODE_ENV=staging` or `STAGING_DATABASE_URL`, preventing silent fallbacks.
4. **Current Status**: Staging migration is held locally; remote execution against `rgkrfzxipkrwqccfuqfq` is **STRICTLY BLOCKED**.
