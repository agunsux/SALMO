# SCHEDULER & AUTOMATION READINESS AUDIT

**Document Identifier**: `docs/epic100f/SCHEDULER_READINESS.md`  
**Parent Epic**: EPIC 100F — Production Parity, Adversarial Audit & Live Data Readiness  
**Authors**: Astra / DeepMind Advanced Agentic Coding Pair  
**Status**: COMPLETE / VERIFIED  
**Production Status**: STRICTLY NO-GO  

---

## 1. Executive Summary

A core question in the user's review was:
> *"Scheduler history remain unverified... Prioritas sekarang adalah Production Parity, Security Verification & Adversarial Audit... jangan mengaktifkan production cron."*

This audit conducted a complete inspection of all automation configurations, scheduled runners, cron handlers, and GitHub Actions workflows in the Salmo codebase.

### Key Audit Findings:
1. **Zero Active Vercel Crons**:
   Inspection of `vercel.json` confirms:
   ```json
   "crons": []
   ```
   No recurring cron schedules are registered with Vercel.
2. **GitHub Actions Workflow is Strictly Manual & Dry-Run Only**:
   Inspection of `.github/workflows/settle-cron.yml` confirms:
   - Trigger is strictly manual via `workflow_dispatch` (no `schedule` / cron trigger exists).
   - Default input enforces `dry_run: true`.
   - Environment variables explicitly declare `ALLOW_PRODUCTION_DB_WRITE: 'false'`.
   - Quota detection is configured to `PROPOSE_ONLY` without persistence.
3. **Cron Authentication Security**:
   All administrative and cron API endpoints (`/api/cron/predict`, `/api/cron/settle`) require timing-safe Bearer authentication via `CRON_SECRET` or cryptographically verified Google Cloud Scheduler OIDC tokens. Unauthenticated requests are rejected with `HTTP 401`.
4. **Autonomous Ingestion Invariant**:
   No background runner is currently active or capable of making unmonitored external API calls or database mutations.

---

## 2. In-Depth Scheduler Configuration Audit

### 2.1 Vercel Deployment Configuration (`vercel.json`)

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "buildCommand": "next build",
  "installCommand": "npm ci",
  "headers": [ ... ],
  "crons": []
}
```
- **Line 50**: `"crons": []`
- **Verification**: The cron array is completely empty. When deployed to Vercel, no automated cron jobs will be instantiated on Vercel's edge network.

### 2.2 GitHub Actions Settlement Workflow (`.github/workflows/settle-cron.yml`)

- **Trigger Definition**:
  ```yaml
  on:
    workflow_dispatch:
      inputs:
        dry_run:
          description: 'Dry run execution (strictly enforced true in CI)'
          required: false
          default: 'true'
  ```
- **Audit**:
  - Zero recurring cron syntax (`schedule:` is absent).
  - Cannot run autonomously. Requires manual maintainer action in GitHub UI.
  - Hardcoded flag `ALLOW_PRODUCTION_DB_WRITE: 'false'` prevents database writes even if manually invoked.

---

## 3. Cron Endpoint Security & Authentication

The endpoint handlers in `src/app/api/cron/` enforce two-factor authorization logic via `src/lib/security/cronAuth.ts`:

1. **Bearer Token Authentication**:
   - Header: `Authorization: Bearer <CRON_SECRET>`
   - Validated using `crypto.timingSafeEqual` across constant-length buffers, preventing side-channel timing analysis.
2. **Google Cloud Scheduler OIDC Verification**:
   - Validates JWT signature against Google's public JWKS certificates (`https://www.googleapis.com/oauth2/v3/certs`).
   - Asserts `iss` equals `https://accounts.google.com`.
   - Asserts `aud` equals configured service audience.
   - Asserts `email_verified: true` for the authorized scheduler service account.

### Test Evidence:
In `tests/cronAuth.test.js`:
- `CronAuth: Rejects request missing Authorization header`: **PASS**
- `CronAuth: Rejects query-parameter credential attempts (?key=...)`: **PASS**
- `CronAuth: Rejects invalid or forged Bearer secret`: **PASS**
- `CronAuth: Authorizes legitimate Bearer CRON_SECRET with timingSafeCompare`: **PASS**
- `CronAuth: Authorizes valid Google Cloud Scheduler OIDC ID Token`: **PASS**
- `CronAuth: Rejects OIDC token with invalid issuer / audience mismatch`: **PASS**

---

## 4. Operational Invariant: Deployment Hold

Because:
1. Live OddsPapi quota is exhausted (260/250),
2. Supabase remote database has not yet received candidate migrations,
3. Remote triggers have not been deployed,

The current state of **inactive crons** (`"crons": []`) and **dry-run-only workflows** is the **correct, safe operational posture**.

**Recommendation**: Maintain `"crons": []` indefinitely until formal Release Gate authorization is granted.
