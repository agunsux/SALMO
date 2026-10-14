# SALMO EPIC 72 / 72B: Production Recovery, Release Engineering & Deployment Verification Report

**Document ID:** `SALMO-REL-EPIC72-002`  
**Execution Date:** 2026-10-15 (WIB) / 2026-10-14 (UTC)  
**Final Release Status:** `PRODUCTION_DEPLOYED_AND_VERIFIED`  
**Live Production URL:** `https://salmo.dev`  
**Live Production Deployment ID:** `dpl_GMRwRU7c4WKWEdkPB2d7RXGNkExT`  
**Production Commit SHA:** `b63a63782e432f2a651a844c7883e7038de7ffbd` (`b63a637`)  
**Synchronized Branches:** `main` and `release/epic-72-production-recovery` (both tracking remote `origin`)  
**Previous Production Deployment ID:** `dpl_3Ftk2J6stXZ7PZgHKjV29jWRY9Mi` (Instant rollback target if ever required)  
**Vercel Preview URL:** `https://salmo-onzzuy92q-shinerva.vercel.app` (`dpl_69VStiVtzjyyRPKzu5c78x7CnuQa`)  

---

## 1. Executive Summary

SALMO Epic 72 / 72B successfully transitioned the SALMO.dev platform from a dormant state into a live, verified, production deployment (`PRODUCTION_DEPLOYED_AND_VERIFIED`).

Rather than stopping at an audit document, all engineering work was executed end-to-end:
1. Repaired read-path fallback status in `src/app/api/v1/research/route.ts` from `'NO_QUALIFIED_PICKS'` to `'DATA_UNAVAILABLE'`.
2. Verified PostgreSQL 16.15 concurrency isolation locally (20/20 test scenarios passed, zero over-allocation under 20-client TCP socket race).
3. Ran full test suite (298 PASS, 0 FAIL, 1 SKIP) and Next.js 15.5.25 production compilation (30/30 routes).
4. Created and verified Vercel Preview deployment (`salmo-onzzuy92q-shinerva.vercel.app`).
5. Executed authorized production deployment to Vercel (`dpl_GMRwRU7c4WKWEdkPB2d7RXGNkExT`), aliasing to `https://salmo.dev`.
6. Verified live production endpoints directly against `https://salmo.dev`, confirming HTTP 200 OK across web pages and APIs, truthful degradation reporting, and strict fail-closed behavior (no fake odds, no fake picks).
7. Fast-forward merged `release/epic-72-production-recovery` into `main` and pushed to `origin/main`.

---

## 2. Critical Business & Operational Decisions Enforced

- **Zero API Spend:** API-Football Pro was not renewed, and OddsPapi was not upgraded.
- **Zero Metered Calls:** Billable OddsPapi endpoints were not touched. Quota remains at `260/250`.
- **Zero Fabrication:** Zero synthetic odds, zero fake probabilities, and zero fake picks were generated.
- **Scheduler Containment:** `vercel.json` maintained strictly at `"crons": []`.
- **Data Integrity:** Historical research and settlement ledgers remain immutable and preserved.
- **Separation of Application vs Betting Pipeline:** Production application is 100% operational with honest status reporting (`NO_QUALIFIED_PICKS` / `DATA_UNAVAILABLE` on picks, `status: "degraded"` on `/api/health`).

---

## 3. Engineering Fixes Implemented

### 3.1 Research Read-Path Fallback Normalization
- **File:** `src/app/api/v1/research/route.ts` (Line 853)
- **Defect:** Unfiltered or empty research ledgers previously returned `'NO_QUALIFIED_PICKS'`, which is a pick-level evaluation verdict rather than an API error response.
- **Fix:** Corrected fallback to `'DATA_UNAVAILABLE'`.
- **Validation:** Tested via unit tests and verified via HTTP requests.

### 3.2 Concurrency & Quota Guard Revalidation
- **Harness:** `tests/p0_atomic_oddspapi_quota_reservation.test.js`
- **Rehearsal:** 20 independent TCP client sockets competing for 3 quota units against PostgreSQL 16.15.
- **Result:** Exactly 3 units reserved; 17 rejected with `QUOTA_EXHAUSTED`. Zero leaks.

---

## 4. Verification Suite Results

### 4.1 Local Verification
- **TypeScript Typecheck:** `npx tsc --noEmit` -> **0 errors**.
- **Test Suite:** `npm test` -> **298 passed, 0 failed, 1 skipped** (299 passed with active local PG).
- **Production Build:** `npm run build` -> Next.js 15.5.25 generated 30 routes (Static & Dynamic) in 9.4s.

### 4.2 Vercel Preview Verification (`https://salmo-onzzuy92q-shinerva.vercel.app`)
- `GET /api/health` -> HTTP 200 OK (Isolated preview telemetry).
- `GET /api/daily-picks` -> HTTP 503 Service Unavailable (`DATA_UNAVAILABLE`, safe fail-closed without DB credentials).
- `GET /api/v1/research?limit=5` -> HTTP 200 OK (Serves bundled research rows).
- `GET /` -> HTTP 200 OK (HTML document delivered).
- `GET /daily-picks` -> HTTP 200 OK (HTML document delivered).
- `GET /performance` -> HTTP 200 OK (HTML document delivered).

---

## 5. Live Production Deployment & Verification (`https://salmo.dev`)

The release candidate commit `b63a637` was deployed to Vercel production:
- **Command:** `npx vercel --prod --yes`
- **Deployment ID:** `dpl_GMRwRU7c4WKWEdkPB2d7RXGNkExT`
- **Ready State:** `READY`
- **Live Alias:** `https://salmo.dev`

### 5.1 Live HTTP Production Verification Matrix

| Target Endpoint | HTTP Status | Observed Payload / Behavior | Verdict |
| :--- | :---: | :--- | :---: |
| `GET https://salmo.dev/` | `200 OK` | Prerendered HTML document (`Content-Length: 26,965B`, Next.js 15.5.25) | **PASS** |
| `GET https://salmo.dev/daily-picks` | `200 OK` | Prerendered HTML document (`Content-Length: 23,060B`) | **PASS** |
| `GET https://salmo.dev/performance` | `200 OK` | Prerendered HTML document (`Content-Length: 21,281B`) | **PASS** |
| `GET https://salmo.dev/api/health` | `200 OK` | `{"status":"degraded","service":"salmo","version":"0.1.0","environment":"production",...}` | **PASS** |
| `GET https://salmo.dev/api/daily-picks` | `200 OK` | `{"success":true,"status":"NO_QUALIFIED_PICKS","count":0,"totalCanonicalPicks":50,...}` | **PASS** |
| `GET https://salmo.dev/api/v1/research?limit=5` | `200 OK` | Returns 5 canonical research rows with latency 61ms | **PASS** |
| `GET https://salmo.dev/api/v1/performance` | `200 OK` | Returns settled positions, Brier scores, profit/loss, latency 17ms | **PASS** |

### 5.2 Production Operational Telemetry
- **Database Status:** `connected` (Latency: ~916ms)
- **Prediction Engine:** `healthy` (`dixon-coles-v1.0`, mode: `salmo-native`)
- **OddsPapi Status:** `configured` (Exhausted at 260/250, fail-closed active)
- **API-Football Status:** `configured` (Expired, legacy archive mode)
- **Scheduler:** `crons: []` active in production `vercel.json` (No autonomous runs)
- **Active Leagues:** 0 | **Shadow Leagues:** 14 | **Paused Leagues:** 1 (`IDN-L1`)

---

## 6. Git Hygiene & Branch Synchronization

1. Dedicated release branch `release/epic-72-production-recovery` pushed to `origin`.
2. Fast-forward merge performed to `main`:
   ```bash
   git checkout main
   git merge release/epic-72-production-recovery --ff-only
   git push origin main
   ```
3. Remote `origin/main` and `origin/release/epic-72-production-recovery` are synchronized at commit `b63a637`.
4. Working tree is 100% clean.

---

## 7. Rollback Runbook (If Needed)

If an operational regression is detected in production, rollback can be executed instantly via Vercel CLI without code mutations:

```bash
# Roll back to previous production deployment (469fe9a / 3Ftk2J6stXZ7PZgHKjV29jWRY9Mi)
npx vercel rollback dpl_3Ftk2J6stXZ7PZgHKjV29jWRY9Mi --yes

# Verify production alias returns previous deployment
curl.exe -s -I https://salmo.dev/api/health
```

---

## 8. Final Status Verdict

```
===========================================================
  OVERALL STATUS: PRODUCTION_DEPLOYED_AND_VERIFIED
  APPLICATION HEALTH: DEGRADED (HONEST, SAFE, FAIL-CLOSED)
  BETTING PIPELINE: DORMANT (ZERO SPEND, NO FAKE PICKS)
  LIVE URL: https://salmo.dev
===========================================================
```
