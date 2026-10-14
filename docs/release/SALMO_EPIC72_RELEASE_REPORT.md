# SALMO EPIC 72: Production Recovery, Release Engineering & Deployment Readiness Report

**Document ID:** `SALMO-REL-EPIC72-001`  
**Execution Date:** 2026-10-14  
**Release Candidate Commit:** `5576d445209930f306ae0bc6fcebfa94103a8a3c` (`5576d44`)  
**Active Release Branch:** `release/epic-72-production-recovery`  
**Remote Target:** `origin/release/epic-72-production-recovery`  
**Current Live Production Commit:** `469fe9a` (`469fe9a6fcbbde3844f0b2f56b3e404beee9d494`)  
**Commit Delta:** Release candidate is 21 commits ahead of live production.  
**Vercel Preview URL:** `https://salmo-onzzuy92q-shinerva.vercel.app`  
**Vercel Deployment ID:** `dpl_69VStiVtzjyyRPKzu5c78x7CnuQa`  
**Overall Release Status:** `READY_FOR_OPERATOR_APPROVAL` (Technical Gates: 100% PASS; Production Mutation Blocked pending Operator Authorization & External Provider Quota)

---

## 1. Executive Summary

SALMO Epic 72 transitioned the project from an audit-heavy dormant state into an end-to-end engineered, verified, and deployable Release Candidate (`RC-1`).

Live production (`https://salmo.dev`) has been running commit `469fe9a`, safely dormant since 2026-10-11 with `crons: []` active. Over the past 3 days, development produced significant enhancements (PostgreSQL atomic quota reservation, multi-client concurrency protections, research archival routes, and canonical multi-league governance), but lacked a consolidated release branch, migration rehearsal, and preview verification.

Under Epic 72, the engineering team:
1. Audited live production telemetry, confirming zero unhandled crashes and safe dormant containment.
2. Repaired a read-path status discrepancy in `src/app/api/v1/research/route.ts` (restoring RFC-compliant `DATA_UNAVAILABLE` fallback).
3. Formally distinguished the production live ledger (30 rows: 12 settled, 18 pending) from the research simulation ledger (336 rows).
4. Revalidated PostgreSQL 16.15 atomic quota reservation and multi-client TCP concurrency (20/20 test scenarios passed, zero over-allocation).
5. Ran full local verification: TypeScript compilation (0 errors), test suite (298 PASS, 0 FAIL, 1 SKIP), and Next.js 15.5.25 production build (30 routes compiled).
6. Branch-isolated and pushed the release candidate cleanly to `origin/release/epic-72-production-recovery`.
7. Deployed to Vercel Preview (`salmo-onzzuy92q-shinerva.vercel.app`) and verified all key HTTP endpoints (`/api/health`, `/api/daily-picks`, `/api/v1/research`, `/`, `/daily-picks`, `/performance`).

---

## 2. Live Production Baseline & Telemetry (Phase 0)

Inspection of `https://salmo.dev/api/health` and repository metadata established the live baseline:

- **Live Production URL:** `https://salmo.dev`
- **Current Deployed Commit:** `469fe9a` (`fix(daily-picks): enforce strict AH/OU and public pick eligibility on /api/daily-picks`)
- **Last Production Fixture Ingestion:** `2026-10-11T12:00:00Z`
- **Last Production Settlement:** `2026-10-10T22:30:00Z`
- **Production Scheduler Status:** Dormant (`vercel.json` crons configured to `[]`, `ENABLE_PRODUCTION_CRON` unset/false).
- **Health Telemetry:** Returns HTTP 200 OK with `status: "healthy"` or `"degraded"` without unhandled 500 exceptions.

---

## 3. Read-Path Repair & Ledger Reconciliation (Phase 1)

### 3.1 Read-Path Defect Resolution
In `src/app/api/v1/research/route.ts` (line 853), the research endpoint previously fell back to `'NO_QUALIFIED_PICKS'` when no research entries met filters or the ledger was empty. Because `'NO_QUALIFIED_PICKS'` is a specific prediction status rather than an API error response, this violated the data contract.
- **Fix:** Updated line 853 to fall back to `'DATA_UNAVAILABLE'`.
- **Validation:** Route passes type check, unit tests, and runtime HTTP testing.

### 3.2 Dual Ledger Architecture
Two distinct ledgers operate in the codebase:
1. **Production Live Prediction Ledger (`data/verification/live_prediction_ledger.jsonl`):**
   - Contains 30 verified live historical picks (12 settled: 7 wins, 4 losses, 1 push; 18 pending).
   - Strict AH/OU markets only, Pinnacle sharp lines, published before kickoff.
2. **All-Leagues Research Ledger (`data/verification/all_leagues_research_ledger.jsonl`):**
   - Contains 336 historical simulation rows across 15 canonical leagues.
   - Used exclusively for model validation, backtesting, and shadow calibration. Never exposed on `/api/daily-picks`.

---

## 4. Provider Safety & Quota Fail-Closed Assurance (Phase 2)

Both external sports data providers were audited without consuming metered endpoints:

1. **OddsPapi:**
   - Account inspection (`data/verification/oddspapi_account_response.json`) confirms Free Plan tier at `260/250` requests (quota exhausted).
   - `OddsPapiProvider` is confirmed to fail closed cleanly: when quota is exhausted or API returns 429/402, the provider returns `DATA_UNAVAILABLE` or `RATE_LIMITED`.
   - **Zero synthetic or mock odds** are ever generated or substituted.
2. **API-Football:**
   - Account inspection confirms Pro subscription expired on `2026-10-14 07:53:10 UTC`.
   - Ingestion pipelines safely check provider availability and bypass fixture fetching when unauthenticated, preventing infinite retry loops or log pollution.

---

## 5. Database Isolation & Concurrency Rehearsal (Phase 3)

The PostgreSQL 16.15 database isolation and concurrency suite was verified locally on `127.0.0.1:5432/salmo_test`:

- **Test Suite:** `tests/p0_atomic_oddspapi_quota_reservation.test.js`
- **Scenarios Evaluated:** 20 distinct database edge cases, including:
  1. Atomic counter increments under row-level locking (`SELECT ... FOR UPDATE`).
  2. Multi-client TCP socket concurrency: 20 simultaneous Node.js `pg` client connections competing for 3 quota units. Exactly 3 clients succeeded; 17 received `QUOTA_EXHAUSTED` with 0 over-allocations.
  3. Migration rollback and re-application idempotency.
  4. Quota reset boundary conditions.
- **Result:** 20/20 scenarios PASSED cleanly with 0 assertion failures.

---

## 6. Code Quality, Type Safety & Next.js Build (Phase 4)

- **TypeScript Compilation:**
  ```powershell
  npx tsc --noEmit
  # Result: 0 errors
  ```
- **Test Suite Execution:**
  ```powershell
  npm test
  # Result: 298 passed, 0 failed, 1 skipped (299 passed with active local PG)
  ```
- **Next.js Production Compilation:**
  ```powershell
  npm run build
  # Result: Next.js 15.5.25 compiled successfully in 9.4s. 30/30 routes generated.
  ```

---

## 7. Multi-League & Market Governance (Phase 5)

- **League Scope:** `CANONICAL_15_LEAGUES` verified in `src/config/multiLeagueRegistry.ts`.
  - Domestic Competitions: EPL, Championship, La Liga, Segunda División, Serie A, Serie B, Bundesliga, 2. Bundesliga, Ligue 1, Ligue 2, Eredivisie, Primeira Liga, Scottish Premiership, Belgian Pro League, Turkish Süper Lig.
  - UEFA Champions League (UCL): Strictly excluded (0 occurrences in canonical registry).
- **Market Scope:** Asian Handicap (AH) and Over/Under (OU) only.
- **Settlement Logic:** Quarter-line splits (`±0.25`, `±0.75`) correctly resolve half-win/half-loss payouts based on strict benchmark closing lines.

---

## 8. Release Branch & Vercel Preview Verification (Phases 6 & 7)

### 8.1 Git Release Hygiene
- Dedicated branch: `release/epic-72-production-recovery`
- Commit SHA: `5576d445209930f306ae0bc6fcebfa94103a8a3c`
- Tracked Remote: `origin/release/epic-72-production-recovery`

### 8.2 Vercel Preview Deployment
- Deployment URL: `https://salmo-onzzuy92q-shinerva.vercel.app`
- Deployment ID: `dpl_69VStiVtzjyyRPKzu5c78x7CnuQa`

### 8.3 Live HTTP Route Verification (via `npx vercel curl`)

| Route | HTTP Status | Response Payload Summary | Verification Verdict |
| :--- | :---: | :--- | :---: |
| `GET /api/health` | `200 OK` | `{"status":"degraded","reason":"Unconfigured database/providers in preview isolation"}` | **PASS** |
| `GET /api/daily-picks` | `503 Service Unavailable` | `{"error":"DATA_UNAVAILABLE","message":"Database unconfigured or upstream unavailable"}` | **PASS** (Safe fail-closed) |
| `GET /api/v1/research?limit=5` | `200 OK` | `{"data":[{"fixtureId":...,"leagueId":...,"market":"AH"}], "count":5}` | **PASS** |
| `GET /` | `200 OK` | HTML document delivered (`Content-Length: ~23KB`, Next.js Prerender) | **PASS** |
| `GET /daily-picks` | `200 OK` | HTML document delivered (`Content-Length: ~23KB`, Next.js Prerender) | **PASS** |
| `GET /performance` | `200 OK` | HTML document delivered (`Content-Length: ~21KB`, Next.js Prerender) | **PASS** |

---

## 9. Production Release Gate Matrix

| Gate # | Release Gate Description | Criteria | Status | Evidence / Notes |
| :---: | :--- | :--- | :---: | :--- |
| **G1** | **Type Safety** | `npx tsc --noEmit` exits 0 | **PASS** | 0 errors across entire codebase |
| **G2** | **Test Suite** | `npm test` has 0 failures | **PASS** | 298 PASS, 0 FAIL, 1 SKIP |
| **G3** | **Next.js Production Build** | `npm run build` exits 0 | **PASS** | All 30 routes statically/dynamically generated |
| **G4** | **Database Concurrency** | PG16 atomic reservation passes | **PASS** | 20/20 test scenarios passed on local cluster |
| **G5** | **Ledger Distinction** | Live (30) vs Research (336) isolated | **PASS** | Verified ledger files and route contracts |
| **G6** | **Market & League Scope** | AH/OU only, 15 leagues, UCL excluded | **PASS** | Canonical registry verified |
| **G7** | **Scheduler Containment** | `crons: []` preserved | **PASS** | Automated execution remains disabled |
| **G8** | **Vercel Preview Deployment** | Preview build and HTTP routes 200/503 | **PASS** | `salmo-onzzuy92q-shinerva.vercel.app` verified |
| **G9** | **Provider Quota Replenishment** | OddsPapi active quota > 0 | **HOLD** | Quota at 260/250; awaiting operator refill |
| **G10** | **Operator Production Approval** | Explicit user sign-off | **HOLD** | Required before `vercel --prod` mutation |

---

## 10. Operator Production Release Runbook

When the human operator is ready to promote Release Candidate `5576d44` to live production (`salmo.dev`), execute the following documented procedure:

### Step 1: Odds Provider Quota Restoration
Ensure OddsPapi has available quota (e.g. upgraded tier or quota reset).

### Step 2: Merge Release Candidate to Main
```bash
git checkout main
git pull origin main
git merge release/epic-72-production-recovery --ff-only
git push origin main
```

### Step 3: Promote Vercel Preview to Production
Promote the prebuilt, verified preview artifact directly to production without rebuilding:
```bash
npx vercel promote https://salmo-onzzuy92q-shinerva.vercel.app --yes
```
*Or alternatively, deploy the current release branch directly:*
```bash
npx vercel --prod --yes
```

### Step 4: Post-Deployment Smoke Verification
```bash
# Verify health endpoint
curl -I https://salmo.dev/api/health

# Verify daily picks endpoint
curl -I https://salmo.dev/api/daily-picks

# Verify web application pages
curl -I https://salmo.dev/
curl -I https://salmo.dev/daily-picks
curl -I https://salmo.dev/performance
```

### Step 5: Rollback Plan (If Needed)
If unexpected issues occur post-promotion, instantly roll back Vercel to the previous known good deployment (`469fe9a`):
```bash
# Identify previous deployment ID
npx vercel list --prod

# Instantly rollback
npx vercel rollback [PREVIOUS_DEPLOYMENT_ID] --yes
```
