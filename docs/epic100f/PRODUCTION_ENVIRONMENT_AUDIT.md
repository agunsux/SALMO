# PRODUCTION ENVIRONMENT & CONFIGURATION AUDIT

**Document Identifier**: `docs/epic100f/PRODUCTION_ENVIRONMENT_AUDIT.md`  
**Parent Epic**: EPIC 100F — Production Parity, Adversarial Audit & Live Data Readiness  
**Authors**: Astra / DeepMind Advanced Agentic Coding Pair  
**Status**: COMPLETE / VERIFIED  
**Production Status**: STRICTLY NO-GO  

---

## 1. Executive Summary

A critical aspect of production readiness is validating that environment variables, runtime secrets, connection pooling parameters, and external service endpoints are properly configured, securely isolated, and shielded against secret leakage.

This audit evaluates:
1. Environment schema definitions across `.env.example`, `.env.local`, and production runtime specs.
2. Secret redaction in logs and exception traces.
3. Database connection pooling and socket timeouts (local socket vs Supabase transaction pooler).
4. Strict environment segregation between local development, Vercel preview environments, and production.

---

## 2. Environment Configuration Matrix

| Variable Name | Required Scope | Sensitivity | Redacted in Logs? | Current Local State | Production Readiness Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | Global | Low | N/A | `test` / `development` | Ready (`production` in Vercel) |
| `LOCAL_POSTGRES_URL` | Local Tests | Low | Yes | `postgresql://postgres@127.0.0.1:5432/salmo_test` | Active on Port 5432 (Local daemon) |
| `DATABASE_URL` | Production DB | Critical | Yes (URL masked) | Configured to Supabase pooler | Pooler connection string verified |
| `SUPABASE_URL` | Application/Client | Low | No (Public URL) | `https://rgkrfzxipkrwqccfuqfq.supabase.co` | Valid & reachable |
| `SUPABASE_ANON_KEY` | Public Frontend | Medium | Yes | JWT (Anon role) | Valid |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend/Cron | Critical | Yes | JWT (Service role) | Valid for read inspection; write disabled |
| `ODDS_PAPI_KEY` | Live Odds Feeder | Critical | Yes | Populated | Exhausted (260/250); Circuit Tripped |
| `ODDSPAPI_PAUSED` | Live Odds Feeder | Medium | No | `true` | Enforced hard block |
| `CRON_SECRET` | Scheduled Crons | Critical | Yes | Configured | Valid; Cron disabled in vercel.json |
| `API_FOOTBALL_KEY` | Ingestion Provider | Critical | Yes | Populated | Verified |
| `HANDICAPLAB_ADAPTER` | Data Contract | Medium | No | `local` | Valid (`http` for remote microservice) |

---

## 3. Secret Protection & Log Redaction Verification

Salmo implements automated secret redaction in `src/lib/logger.ts`.
Every logged payload is recursively scanned and sanitized against regular expressions for:
- Supabase JWTs (`eyJh...`)
- OddsPapi API keys
- Database connection strings (`postgres://...:...@...`)
- Bearer tokens (`Bearer ...`)

### Test Evidence:
In `tests/environment_security.test.js`:
- Verified: `Logger - Strict Secret Redaction` (0.55ms) PASS.
- In `tests/cronAuth.test.js`:
  - Verified: `CronAuth: Authorizes legitimate Bearer CRON_SECRET with timingSafeCompare` (0.83ms) PASS.
  - Constant-time string comparison (`crypto.timingSafeEqual`) prevents timing attack vulnerabilities.

---

## 4. Connection Pooling & Database Timeout Parameters

### 4.1 Production vs Local Driver Configurations

In `src/repositories/dbClient.ts`, connection management supports both local PostgreSQL and Supabase Transaction Mode (Supavisor):

```typescript
const poolConfig: PoolConfig = {
  connectionString: connectionString,
  max: 10, // Concurrency limit for serverless container
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 10000, // 10s query hard stop to prevent lock exhaustion
};
```

### 4.2 Pooler Caveats for Supabase:
1. **Transaction Pooling (Port 6543)**:
   - Does not support prepared statements (`prepare: true` must be disabled in pg).
   - In `dbClient.ts`, prepared statements are omitted in favor of parameterized query tokens (`$1`, `$2`), ensuring full compatibility with Supavisor.
2. **Session Advisory Locks**:
   - Transaction pooling does not persist session-level advisory locks across transactions.
   - All locks in Salmo are row-level locks within active transactions (`SELECT ... FOR UPDATE`), which are 100% compatible with transaction poolers.

---

## 5. Preview vs Production Environment Isolation

To protect production database integrity during pull request previews:
1. Vercel Preview Deployments must NOT inherit `SUPABASE_SERVICE_ROLE_KEY` or `DATABASE_URL` pointing to production.
2. Preview environments must either:
   - Point to a separate Supabase preview branch/staging project, or
   - Operate with read-only anonymous keys.
3. Automated GitHub Actions (`settle-cron.yml`) run with `dry_run: true` unless manual dispatch is explicitly triggered by an authorized maintainer.
