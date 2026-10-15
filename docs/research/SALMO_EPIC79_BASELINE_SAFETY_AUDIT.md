# SALMO EPIC 79 — PHASE 0: BASELINE & SAFETY AUDIT REPORT

**Audit Date:** October 15, 2026  
**Auditor:** Antigravity Senior Staff Systems & Quantitative Engineer  
**Workspace:** `c:\Users\RYZEN\.antigravity-ide\SALMO`  
**Execution Phase:** Phase 0 — Baseline & Safety Audit (Read-Only)

---

### 1. Repository, Branch, & Deployment Baseline

| Parameter | Current Verified State | Audit Status |
| :--- | :--- | :---: |
| **Current Branch** | `feat/epic-77-handicaplab-salmo-sync` | **PASS** |
| **HEAD Commit** | `3100c528281e6d3d909dad9b0fe26ca08c23db63` | **PASS** |
| **Parent Commit** | `3646e32dd55863089ca07044a8b68bdee74a7c45` (identical to `origin/main`) | **PASS** |
| **Remote Tracking** | `origin/feat/epic-77-handicaplab-salmo-sync` (synchronized, 0 commits ahead/behind) | **PASS** |
| **Working Tree** | Clean; untracked: `data/sync/` (runtime sink) & audit docs | **PASS** |
| **Latest Production Deployment** | `dpl_4YNQsfRHpNApuKc1EBn7ZJdHqAQe` (commit `3646e32`, deployed 2026-10-14) | **VERIFIED** |
| **Production Rollback Target** | `dpl_4YNQsfRHpNApuKc1EBn7ZJdHqAQe` | **STANDBY** |

---

### 2. Runtime, Cron, & Persistence Configuration

| Subsystem | Configuration File / Code Path | Current State | Audit Disposition |
| :--- | :--- | :--- | :---: |
| **Vercel Cron Trigger** | `vercel.json` | `"crons": []` | **DISABLED (SAFE)** |
| **Cron Route Gate** | `src/app/api/cron/predict/route.ts` | Gated by `ENABLE_PRODUCTION_CRON === 'true'` (default OFF) | **DISABLED (SAFE)** |
| **Live Betting Switch** | `src/config/multiLeagueRegistry.ts` | `production_pick_enabled: false` (15 of 15 leagues) | **DISABLED (SAFE)** |
| **Shadow League Status** | `src/config/multiLeagueRegistry.ts` | 0 of 14 leagues promoted (`REMAIN_SHADOW`) | **LOCKED (SAFE)** |
| **Serverless Filesystem** | Vercel Lambda Execution Environment | Root filesystem is strictly read-only; `/tmp` is ephemeral | **AUDITED** |
| **Durable Prediction Storage** | Git-bundled JSONL + local append sink | Bundled ledgers read synchronously; runtime sink in `data/sync/` | **VERIFIED** |
| **PostgreSQL Staging Mutex** | `tests/p0_atomic_oddspapi_quota_reservation.test.js` | Scenario 20 TCP port 5432 closed | **NOT VERIFIED** |

---

### 3. Provider Credentials & Quota Accounting

| Provider | Documented Plan / Tier | Verified Quota Status | Empirical Evidence |
| :--- | :--- | :--- | :--- |
| **API-Football** | Pro Plan (7,500 req/day) | **EXPIRED** (October 14, 2026) | Subscription expired; zero live requests permitted. Renewals prohibited. |
| **OddsPapi** | Free Plan (250 req/month) | **EXHAUSTED** (260 / 250 consumed) | `data/verification/oddspapi_account_response.json`: `request_limit: 250`, `request_count: 260`. Metered calls fail-closed. |
| **OpenFootball** | Public Domain (CC0 1.0) | **OPERATIONAL & UNMETERED** | `src/services/providers/openFootballProvider.ts`: Direct GitHub raw JSON, 0 API key required, 100% legal free reuse. |
| **TheSportsDB** | Free Tier | **STANDBY / OPTIONAL** | Gated by `isConfigured()`; default OFF. |
| **HandicapLab** | Local / Shared Bronze Ledger | **OPERATIONAL** | Ingests from local bronze files via `LocalHandicapLabAdapter` with zero network quota consumption. |

---

### 4. Canonical Model Provenance & Pipeline Integrity

1. **Prediction Generation:**
   - Model outputs are computed dynamically using Dixon-Coles 11x11 score grids (`lambdaHome`, `lambdaAway`, $\rho = -0.06$).
   - Dynamic team ratings (`resolveTeamRating`) compute attack and defense strength from rolling match history ($\ge 3$ matches required).
   - Zero hardcoded probabilities or fabricated odds.
2. **Asian Handicap & Asian Total Goals:**
   - Quarter lines supported mathematically: $-0.25, -0.75, +0.25, +0.75, 2.25, 2.75, 3.25, 3.75$.
   - Quarter line settlement properly accounts for half-win, half-loss, and push outcomes.
   - Goals Over/Under is never hardcoded to 2.5.
3. **Market Boundary:**
   - Production-eligible: `ASIAN_HANDICAP`, `OVER_UNDER`.
   - Research-only: `BTTS` (strictly excluded from `/picks` and `isPublicPick: false`).
4. **Dashboard Canonical Source:**
   - `/picks` (redirects to `/daily-picks`) consumes `/api/daily-picks`, which reads canonical pick tables and enforces `isPublicPickEligible`.
   - `/research` consumes `/api/v1/research`, which exposes all research rows, confidence tiers, and structured rejection reasons.
   - When no qualified picks exist, `/daily-picks` returns HTTP 200 with `status: 'NO_QUALIFIED_PICKS'`.

---

### 5. Protected Historical Ledger Checksums

| Protected Historical Ledger | Records | Size | SHA-256 Checksum | Baseline Status |
| :--- | :---: | :---: | :--- | :---: |
| `data/verification/live_prediction_ledger.jsonl` | 30 | 35,690 B | `317fc037a63b811420400ea9de094092ec7d68b119ad6abc57743be12d568527` | **100% MATCH** |
| `data/verification/all_leagues_research_ledger.jsonl` | 336 | 450,918 B | `eae8f364a5393255d276fca2650056951fb601ba829c1710b26ac673dffb967b` | **100% MATCH** |
| `data/research/multi_league_research_predictions.jsonl` | 336 | 337,554 B | `0128616a43968be5fddab76ea5c57da731955e22b1bf27bca3f886938187a12f` | **100% MATCH** |

---

### 6. Summary of Phase 0 Safety Disposition

- **Operational Safety Baseline:** **ESTABLISHED & CERTIFIED**
- **Live Betting:** **DISABLED**
- **Automated Production Cron:** **DISABLED**
- **Quota Consumption Policy:** **0 BILLABLE CALLS ALLOWED**
- **Read-Only Audit Decision:** **PROCEED TO PHASE 1 (PREDICTION EXPANSION & REFRESH SERVICE IMPLEMENTATION)**
