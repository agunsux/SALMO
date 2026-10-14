# SALMO EPIC 73: Post-Deploy Hardening, Ledger Integrity & Operational Recovery Report

**Document ID:** `SALMO-REL-EPIC73-001`  
**Execution Date:** 2026-10-15 (WIB) / 2026-10-14 (UTC)  
**Final Release Status:** `PRODUCTION_DEPLOYED_AND_VERIFIED`  
**Live Production URL:** `https://salmo.dev`  
**Production Deployment ID:** `dpl_G1tSVUnT5SFvx6oTXZFdCRKBnPkb`  
**Preview Deployment ID:** `dpl_7wsftMtEbXGqi1ZRZ93JozDnFhEA` (`https://salmo-7y6r0p6ag-shinerva.vercel.app`)  
**Production Commit SHA:** `6c639035dbf48651a511394f1c1f7b57422f42a5` (`6c63903`)  
**Previous Rollback Target:** `dpl_DuYZX5JfdySNxZoRQJknNW2jYmt6` / `dpl_GMRwRU7c4WKWEdkPB2d7RXGNkExT`  
**Synchronized Branches:** `main`, `feat/epic-73-post-deploy-hardening`  

---

## 1. Verified Production Baseline (Phase A)

Prior to executing Epic 73 enhancements, the live production baseline was formally queried and verified:
- **Production URL:** `https://salmo.dev`
- **Initial Deployment ID:** `dpl_DuYZX5JfdySNxZoRQJknNW2jYmt6` (aliased to `https://salmo.dev`)
- **Initial Git Commit:** `d61ce14` (merged from `b63a637`)
- **Initial Health State:** HTTP 200 OK with `degraded` operational status. Database connected (latency: 387ms), prediction engine healthy.
- **Provider Status:** OddsPapi exhausted at `260/250` (Free tier); API-Football Pro expired at 07:53:10 UTC on 2026-10-14.
- **League State:** 0 active production leagues, 14 shadow research leagues, 1 paused league (`IDN-L1`).
- **Picks State:** 0 qualified daily picks (`NO_QUALIFIED_PICKS`), 50 total canonical predictions recorded.
- **Scheduler State:** `vercel.json` verified with `"crons": []`.

---

## 2. Root Causes Found & Implemented Fixes (Phase B & C)

### 2.1 Canonical Prediction Ledger Formalization
- **Finding:** The repository maintained verified prediction data across `live_prediction_ledger.jsonl` (30 rows: 12 settled, 18 pending) and `all_leagues_research_ledger.jsonl` (336 rows), but lacked a unified typed abstraction enforcing cryptographic provenance hashes and strict deduplication.
- **Fix:** Implemented `src/engine/ledger/canonicalPredictionLedger.ts` providing `CanonicalPredictionLedgerService`:
  - `computeProvenanceHash()`: Computes deterministic SHA-256 over immutable prediction attributes (`predictionId`, `canonicalMatchId`, `market`, `selection`, `line`, `modelProbability`, `originalOdds`, `kickoffUtc`).
  - `getProductionLiveLedger()`: Exposes 30 verified live records with complete P&L resolution.
  - `getResearchLedger()`: Exposes 336 multi-league simulation records across 15 domestic leagues.
  - `getAllUnifiedRecords()`: Merges and deduplicates both streams (366 total records) with production precedence.
  - `reconcileAndExportResearchLedger()`: Generates and synchronizes `data/research/multi_league_research_predictions.jsonl` with full schema lineage without mutating existing records.

### 2.2 Research Read-Path Fallback Chain & Unavailable Data Protection
- **Finding:** If the primary research ledger path were unbundled or missing, the route fell through to external database queries without an explicit mirror check.
- **Fix:** In `src/app/api/v1/research/route.ts`, integrated `data/research/multi_league_research_predictions.jsonl` into the serverless resolution chain.
- **Verification:** Unit tests confirm 336 rows are served directly from repository JSONL with sub-100ms latency.

### 2.3 Six-State Data Freshness & Safety Observability
- **Finding:** System health previously combined application runtime status with betting pipeline readiness into a single status string, creating potential ambiguity for operators.
- **Fix:** Enhanced `src/app/api/health/route.ts` to explicitly separate application availability from betting data freshness via the `dataFreshness` interface:
  ```json
  "dataFreshness": {
    "historicalResearchAvailable": true,
    "currentFixturesAvailable": false,
    "currentOddsVerified": false,
    "predictionsQualified": false,
    "settlementUpToDate": true,
    "liveDataState": "HISTORICAL_PRESERVED_LIVE_UNAVAILABLE"
  }
  ```

---

## 3. Canonical Ledger Integrity Findings

| Ledger File | Record Count | Market Types | Settlement Status | Lineage & Provenance |
| :--- | :---: | :---: | :---: | :--- |
| `data/verification/live_prediction_ledger.jsonl` | 30 | AH, OU | 12 Settled, 18 Pending | Canonical EPL MW6/MW7 picks; verified Pinnacle sharp lines; exact match scores. |
| `data/verification/all_leagues_research_ledger.jsonl` | 336 | AH, OU | 336 Simulation Rows | 15 domestic leagues; honest `marketOdds: null` for 14 uncalibrated leagues; Dixon-Coles model. |
| `data/research/multi_league_research_predictions.jsonl` | 336 | AH, OU | 336 Mirror Rows | Synchronized mirror with full `CanonicalPredictionRecord` schema and SHA-256 hashes. |
| **Unified Canonical Dataset** | **366** | **AH, OU** | **12 Settled, 354 Pending** | **Deduplicated, 100% passing integrity checks (0 errors).** |

---

## 4. Historical Research Availability & UI Experience (Phase C)

1. **Accessibility Without Live Providers:** Historical research is completely decoupled from active external subscriptions. Even with OddsPapi at 260/250 and API-Football expired, `/api/v1/research` serves all 336 predictions with 0 crashes.
2. **Institutional Distinction (`CONFIDENCE ≠ PICK`):**
   - The `/research` interface clearly states: *"A research record contains mathematical model analysis without being a qualified market pick. Confidence indicates model qualification level, not certainty of outcome."*
   - Research predictions are excluded from `/daily-picks` and `/picks`.
3. **Multi-League Filtering:** Users can filter across 15 leagues, Asian Handicap and Over/Under markets, and temporal eligibility tiers.

---

## 5. Settlement & Performance Integrity (Phase D)

- **Engine Validation:** Tested via `tests/epic73_ledger_integrity_and_settlement.test.js` against `QuarterLineSettler` and `SettlementEngine`.
- **Quarter-Line Mathematics Verified:**
  - Chelsea -0.75 (5-1) -> `WIN`, profit: `+0.925` units
  - Arsenal -1.25 (2-1) -> `HALF_LOSS`, profit: `-0.500` units
  - Aston Villa 0 (2-2) -> `PUSH`, profit: `0.000` units
  - Over 2.75 (2-1) -> `HALF_WIN`, profit: `+0.490` units
  - Over 3.25 (1-1) -> `LOSS`, profit: `-1.000` units
- **Idempotency Proof:** Consecutive settlement calls on identical fixtures produce bit-for-bit identical results with zero mutation.
- **Pending Position Invariant:** All pending predictions maintain strictly `profitUnits: 0` and `stakeUnits: 0`. Missing scores are never converted to default losses.

---

## 6. Full Verification Suite Results (Phase F)

### 6.1 Automated Test Execution (`npm test`)
```
✔ EPIC 73 — 1. Canonical Live Ledger: Exactly 30 records, 12 settled with verified P&L and 18 pending with 0 stake
✔ EPIC 73 — 2. Canonical Multi-League Research Ledger: 336 records across 15 canonical leagues with clean lineage
✔ EPIC 73 — 3. Reconciled Mirror Ledger: multi_league_research_predictions.jsonl exists and matches schema
✔ EPIC 73 — 4. Unified Deduplicated Dataset: 366 total records with zero loss of integrity
✔ EPIC 73 — 5. Quarter-Line Settlement Math: Precision across AH and OU quarter splits
✔ EPIC 73 — 6. Settlement Engine Idempotency: Repeated settlement yields identical results
✔ EPIC 73 — 7. Production Safety: vercel.json crons empty and UCL excluded from canonical registry
... (306 total tests)
ℹ tests 306
ℹ pass 305
ℹ fail 0
ℹ skipped 1
```

### 6.2 TypeScript & Next.js Production Build
- `npx tsc --noEmit` -> **0 errors**.
- `npm run build` -> Next.js 15.5.25 generated 30 static and dynamic routes in 4.1s.

---

## 7. Vercel Preview & Production Verification Evidence (Phase G & H)

### 7.1 Preview Deployment (`dpl_7wsftMtEbXGqi1ZRZ93JozDnFhEA`)
- Preview URL: `https://salmo-7y6r0p6ag-shinerva.vercel.app`
- `/api/health`: 200 OK (Contains new `dataFreshness` block)
- `/api/v1/research?limit=5`: 200 OK (Delivers 5 rows in 73ms)
- `/api/daily-picks`: 503 Service Unavailable (Fail-closed isolation without DB)
- `/`, `/daily-picks`, `/performance`: 200 OK (Prerendered HTML)

### 7.2 Production Deployment (`dpl_G1tSVUnT5SFvx6oTXZFdCRKBnPkb`)
- Production URL: `https://salmo.dev`
- Deployed Commit: `6c63903`
- Domain Aliases: `salmo.dev`, `www.salmo.dev`

### 7.3 Live Production Verification Matrix (`https://salmo.dev`)

| Target Route | HTTP Status | Response Payload & Operational Evidence | Result |
| :--- | :---: | :--- | :---: |
| `GET /api/health` | `200 OK` | `{"status":"healthy","latencyMs":5060,"dataFreshness":{"historicalResearchAvailable":true,"currentFixturesAvailable":false,"currentOddsVerified":false,"predictionsQualified":false,"settlementUpToDate":true,"liveDataState":"HISTORICAL_PRESERVED_LIVE_UNAVAILABLE"},"dependencies":{"database":{"status":"connected","latencyMs":387}}}` | **PASS** |
| `GET /api/daily-picks` | `200 OK` | `{"success":true,"status":"NO_QUALIFIED_PICKS","count":0,"totalCanonicalPicks":50,"data":[]}` | **PASS** |
| `GET /api/v1/research?limit=5` | `200 OK` | Returns 5 research predictions across 15 leagues (`latencyMs: 89`) | **PASS** |
| `GET /` | `200 OK` | Prerendered HTML document (`Content-Length: 26,965B`) | **PASS** |
| `GET /daily-picks` | `200 OK` | Prerendered HTML document (`Content-Length: 23,060B`) | **PASS** |
| `GET /performance` | `200 OK` | Prerendered HTML document (`Content-Length: 21,281B`) | **PASS** |

---

## 8. Remaining Provider Dependencies & Strategic Path

1. **OddsPapi:** Account remains on Free Tier at `260/250` requests. Metered endpoints (`/v4/odds`, `/v4/odds-by-tournaments`) are strictly locked by `OddsPapiQuotaGuard` to prevent billable errors.
2. **API-Football:** Pro plan expired on 2026-10-14. All 11,642 historical matches and 168 window fixtures are preserved offline in committed JSON/CSV files.
3. **Next Actions for Live Re-Activation:**
   - When leadership decides to restore live betting predictions, acquire a sustainable odds provider plan (or await OddsPapi quota reset).
   - Once quota is confirmed > 50 units, activate multi-league automated ingestion following documented runbooks.
   - Schedulers remain safely contained (`vercel.json` crons: `[]`).

---

## 9. Final Release Status

```
================================================================================
  EPIC 73 VERDICT: PRODUCTION_DEPLOYED_AND_VERIFIED
  COMMIT SHA: 6c639035dbf48651a511394f1c1f7b57422f42a5
  DEPLOYMENT ID: dpl_G1tSVUnT5SFvx6oTXZFdCRKBnPkb
  LIVE URL: https://salmo.dev
  PREVIEW URL: https://salmo-7y6r0p6ag-shinerva.vercel.app
  TEST SUITE: 305 PASS, 0 FAIL, 1 SKIP
  DATA INTEGRITY: 100% PRESERVED (366 CANONICAL RECORDS)
================================================================================
```
