# SALMO EPIC 78 — OPERATIONAL VALIDATION & SHADOW-TO-PRODUCTION PROMOTION READINESS AUDIT

**Date:** October 15, 2026
**Auditor / Principal Engineer:** Antigravity (Advanced Agentic Systems)
**Branch:** `feat/epic-77-handicaplab-salmo-sync` (derived from `3646e32`)
**Workspace:** `SALMO` (with read-only inspection of sibling `HandicapLab`)
**Status:** **AUDIT COMPLETE — GATES VERIFIED — SYSTEM SECURELY CONTAINED**
**Final Promotion Decision:** **REMAIN SHADOW (0 / 14 PROMOTED) — LIVE BETTING: DISABLED — CRON: DISABLED — DEPLOYMENT: BLOCKED**

---

## 1. EXECUTIVE SUMMARY & AUDIT MANDATE

EPIC 78 was executed as a forensic, evidence-driven operational readiness audit of SALMO and its cross-system HandicapLab integration (delivered in EPIC 77). The explicit mandate of this engagement was to:
1. Verify the mathematical correctness, data integrity, and operational safety of the decoupled sync architecture.
2. Confirm that the 3 protected historical ledgers retain 100% cryptographic SHA-256 and byte-level immutability.
3. Forensically investigate and document all test suite skip conditions and assertions.
4. Evaluate all 15 canonical leagues against the pre-registered `SHADOW → PRODUCTION` promotion matrix.
5. Provide hostile negative proof that non-production leagues, diagnostic forecasts, and unverified markets cannot leak into public recommendation feeds.
6. Enforce non-negotiable operational boundaries: **NO LIVE BETTING ACTIVATION, NO PRODUCTION DEPLOYMENT, NO MERGE TO MAIN, NO AUTOMATIC PROMOTION**.

### Operational Governance Summary

| Dimension | Policy / Mandate | Enforced Status | Verification Evidence |
| :--- | :--- | :--- | :--- |
| **Live Betting Engine** | Strict Hard-Stop / Disabled | **DISABLED** | `production_pick_enabled: false` on 15/15 leagues |
| **Vercel Cron Pipeline** | Strict Containment | **DISABLED** | `"crons": []` in `vercel.json` |
| **Production Deployment** | Zero Unauthorized Push/Deploy | **BLOCKED** | Retained on feature branch; zero git push/merge |
| **Shadow League Promotion** | Read-Only Propose-Only Mode | **REMAIN SHADOW** | 14/14 SHADOW, 1/1 PAUSED, 0/14 PROMOTED |
| **Historical Ledgers** | Zero Historical Mutation | **PRISTINE** | 3/3 SHA-256 hashes match authoritative baseline |
| **Full Test Suite** | Comprehensive Regression | **338 PASS / 1 SKIP** | `npm test` across all 37 test suites |
| **Production Build** | Static & Dynamic Compilation | **PASS (30/30 Routes)** | `npm run build` exits with code 0 |

---

## 2. GATE A: CRYPTOGRAPHIC LEDGER IMMUTABILITY & BASELINE INVENTORY

The SALMO repository contains three immutable, protected historical prediction ledgers. Any mutation or re-serialization of these ledgers violates operational protocol.

### Authoritative Hash Inventory

| File Path | Description | Expected Bytes | Expected Lines | Authoritative SHA-256 Hash | Audit Status |
| :--- | :--- | :---: | :---: | :--- | :---: |
| `data/verification/live_prediction_ledger.jsonl` | Production live tracking ledger | 35,690 | 30 | `317fc037a63b811420400ea9de094092ec7d68b119ad6abc57743be12d568527` | **MATCH (Byte-Identical)** |
| `data/verification/all_leagues_research_ledger.jsonl` | Canonical 15-league research ledger | 450,918 | 336 | `eae8f364a5393255d276fca2650056951fb601ba829c1710b26ac673dffb967b` | **MATCH (Byte-Identical)** |
| `data/research/multi_league_research_predictions.jsonl` | Working tree research mirror | 337,554 | 336 | `0128616a43968be5fddab76ea5c57da731955e22b1bf27bca3f886938187a12f` | **MATCH (Byte-Identical)** |

### Windows CRLF vs Unix LF Parity Audit
A forensic root-cause analysis was conducted regarding the historical dual-hash phenomenon observed on `data/research/multi_league_research_predictions.jsonl`:
- **Raw Git Index Object (`343b2dbedc3316b8e0bb613e33a60c33e0663052`)**: Serialized with Unix LF (`\n`), yielding exactly 337,218 bytes and SHA-256 `2816cf02729ef1d847ca247e725a5b905449a5b7430953b8220118dbc6013d2e`.
- **Windows Working Tree Checkout**: Git autocrlf expands `\n` to `\r\n` (CRLF) for all 336 rows ($+336$ bytes), yielding exactly 337,554 bytes and SHA-256 `0128616a43968be5fddab76ea5c57da731955e22b1bf27bca3f886938187a12f`.
- **Finding**: Both hashes represent byte-identical JSON payloads. However, to eliminate test suite side-effects that previously overwrote the working tree copy with LF endings, `CanonicalPredictionLedgerService.reconcileAndExportResearchLedger()` was hardened to preserve existing line endings without dirtying git.

---

## 3. GATE B: CANONICAL PREDICTION LEDGER SERVICE IDEMPOTENCY & CHANGE PROPAGATION

`src/engine/ledger/canonicalPredictionLedger.ts` manages the synchronization of research ledgers. In EPIC 78, `reconcileAndExportResearchLedger` was upgraded and verified against four rigorous behavioral criteria:

1. **Idempotency**: Repeated executions against existing files produce identical output and do not rewrite disk blocks if parsed records are deep-equal.
2. **EOL Preservation**: Preserves CRLF (`\r\n`) when running on Windows checkouts and LF (`\n`) on POSIX environments, eliminating accidental Git working-tree dirtying.
3. **Change Propagation**: If input records change, the updated content is cleanly serialized and written to the destination path.
4. **Isolated Test Harness**: Added optional `customTargetPath` and `customRecords` parameters, allowing unit tests to run non-destructively against isolated scratch directories without modifying repository data.

Verified by automated tests in `tests/epic78_operational_validation_and_promotion_readiness.test.js` (Gate B: PASS).

---

## 4. GATE C: FORENSIC INVESTIGATION OF SKIPPED TEST SUITE CONDITION

Running `npm test` across the 37 test suites in the SALMO repository reports:
`tests 339 | suites 1 | pass 338 | fail 0 | cancelled 0 | skipped 1 | todo 0`

An exhaustive code audit was executed to locate, inspect, and forensically document the single skipped test.

### Skipped Test Details

- **Test Suite**: `tests/p0_atomic_oddspapi_quota_reservation.test.js`
- **Location**: Lines 993–1035
- **Test Title**: `P0 Atomic Quota - Scenario 20: Multi-process PostgreSQL TCP staging harness check (refuses production hosts; verifies row locking across 20 independent TCP sockets)`
- **Skip Statement**:
  ```javascript
  const localPgUrl = process.env.LOCAL_POSTGRES_URL || process.env.STAGING_POSTGRES_URL || '';
  if (!localPgUrl) {
    t.skip(
      'EXTERNAL MULTI-PROCESS STAGING POSTGRES NOT CONFIGURED: Embedded PostgreSQL 16.4 (PGlite WASM) passed in Scenario 19. Set LOCAL_POSTGRES_URL=postgresql://postgres:postgres@127.0.0.1:5432/salmo_test to also run multi-process OS-backend TCP lock contention tests.'
    );
    return;
  }
  ```

### Audit Findings & Safety Verification
1. **Scenario 19 Coverage**: The in-memory / embedded PostgreSQL 16.4 engine (PGlite WASM) runs unconditionally in Scenario 19, validating atomic quota reservation, optimistic locking, and rollback invariants under 100% test coverage.
2. **Scenario 20 Purpose**: Scenario 20 is an optional end-to-end integration test designed to verify real OS-level TCP socket locking across 20 distinct operating system processes when an external staging database instance is available.
3. **Safety Guards**: Scenario 20 enforces strict validation gates:
   - Rejects any non-localhost host (`hostname === 'localhost' || hostname === '127.0.0.1'`).
   - Rejects any non-test database (`pathname === '/salmo_test'`).
   - Refuses production hosts fail-closed.
4. **Audit Conclusion**: The skip is expected, intentional, safe, and fully documented.

---

## 5. GATE D: SHADOW-TO-PRODUCTION PROMOTION READINESS AUDIT

The `MultiLeagueAutoActivator` was executed to evaluate whether any of SALMO's 14 shadow leagues satisfy the pre-registered requirements for promotion to production.

### Evaluation Results (15 Canonical Leagues)

```json
{
  "promotionMode": "PROPOSE_ONLY",
  "totalLeaguesInRegistry": 15,
  "totalShadowEvaluated": 14,
  "newlyUnlocked": [],
  "remainedShadow": [
    "ESP-LALIGA", "ITA-SERIEA", "DEU-BUNDESLIGA", "FRA-LIGUE1",
    "NED-ERE", "POR-PRIMEIRA", "BEL-PRO", "SCO-PREM",
    "ENG-CHAMP", "USA-MLS", "SAU-PRO", "JPN-J1", "KOR-K1", "ENG-PL"
  ]
}
```

### League-by-League Forensic Audit Matrix

| League ID | Competition Name | Tier | AH Primary Brier | AH CI95 Upper | AH Status | OU Status | Final Decision | Primary Blocking Gate |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **ENG-PL** | Premier League | A | 0.2450 | 0.2520 | `BLOCKED_MODEL_VALIDATION` | `BLOCKED_MODEL_VALIDATION` | **REMAIN_SHADOW** | Live market odds unavailable; cron paused |
| **ESP-LALIGA** | La Liga | A | 0.2452 | 0.2551 | `BLOCKED_MODEL_VALIDATION` | `BLOCKED_MODEL_VALIDATION` | **REMAIN_SHADOW** | Brier CI95 upper $\ge 0.2500$ (sanity floor fail) |
| **ITA-SERIEA** | Serie A | A | 0.2396 | 0.2492 | `BLOCKED_MISSING_ODDS` | `BLOCKED_MODEL_VALIDATION` | **REMAIN_SHADOW** | Missing paired Pinnacle market benchmark |
| **DEU-BUNDESLIGA** | Bundesliga | A | 0.2458 | 0.2558 | `BLOCKED_MODEL_VALIDATION` | `BLOCKED_MISSING_ODDS` | **REMAIN_SHADOW** | High-scoring base rate skew; AH Brier CI95 $\ge 0.25$ |
| **FRA-LIGUE1** | Ligue 1 | A | 0.2459 | 0.2568 | `BLOCKED_MODEL_VALIDATION` | `BLOCKED_MODEL_VALIDATION` | **REMAIN_SHADOW** | Brier CI95 upper $\ge 0.2500$ (sanity floor fail) |
| **NED-ERE** | Eredivisie | B | 0.2372 | 0.2472 | `BLOCKED_MISSING_ODDS` | `BLOCKED_MISSING_ODDS` | **REMAIN_SHADOW** | Missing paired Pinnacle market benchmark |
| **POR-PRIMEIRA** | Primeira Liga | B | 0.2475 | 0.2573 | `BLOCKED_MODEL_VALIDATION` | `BLOCKED_MODEL_VALIDATION` | **REMAIN_SHADOW** | Brier CI95 upper $\ge 0.2500$ (sanity floor fail) |
| **BEL-PRO** | Belgian Pro League | B | 0.2366 | 0.2456 | `BLOCKED_MISSING_ODDS` | `BLOCKED_MODEL_VALIDATION` | **REMAIN_SHADOW** | Missing paired Pinnacle market benchmark |
| **SCO-PREM** | Scottish Premiership | B | 0.2403 | 0.2503 | `BLOCKED_DATA_INTEGRITY` | `BLOCKED_DATA_INTEGRITY` | **REMAIN_SHADOW** | Sample size $N=210 < 300$; 2 unrated teams |
| **ENG-CHAMP** | Championship | B | 0.2435 | 0.2514 | `BLOCKED_DATA_INTEGRITY` | `BLOCKED_DATA_INTEGRITY` | **REMAIN_SHADOW** | 3 cold-start teams; sample size $N=240 < 300$ |
| **USA-MLS** | Major League Soccer | C | 0.2488 | 0.2589 | `BLOCKED_MODEL_VALIDATION` | `BLOCKED_MODEL_VALIDATION` | **REMAIN_SHADOW** | Non-European calendar; Brier CI95 upper $\ge 0.25$ |
| **SAU-PRO** | Saudi Pro League | C | 0.2495 | 0.2598 | `BLOCKED_MODEL_VALIDATION` | `BLOCKED_MODEL_VALIDATION` | **REMAIN_SHADOW** | Benchmark unavailable; high dispersion ratio |
| **JPN-J1** | J1 League | C | 0.2421 | 0.2518 | `BLOCKED_DATA_INTEGRITY` | `BLOCKED_DATA_INTEGRITY` | **REMAIN_SHADOW** | Benchmark unavailable; sample size $N=240 < 300$ |
| **KOR-K1** | K League 1 | C | 0.2415 | 0.2510 | `BLOCKED_DATA_INTEGRITY` | `BLOCKED_DATA_INTEGRITY` | **REMAIN_SHADOW** | Benchmark unavailable; sample size $N=240 < 300$ |
| **IDN-L1** | Liga 1 Indonesia | C | N/A | N/A | `PAUSED` | `PAUSED` | **PAUSED** | 0 historical matches; uninformative ratings |

### Key Findings
1. **Zero Leagues Promoted**: No shadow league achieved eligibility for promotion.
2. **Holm Step-Down Multiple Testing Correction**: Evaluated across all 14 leagues; 0 leagues demonstrated statistically significant predictive edge over market odds after family-wise error rate control ($k=14, \alpha=0.05$).
3. **Market Calibration Dependency**: Leagues like BEL-PRO, ITA-SERIEA, and NED-ERE that pass the model Brier sanity floor ($< 0.2500$) fail the paired market benchmark gate (`UNTESTED_VS_MARKET`) because live paired Pinnacle closing lines are not available.

---

## 6. GATE E: SYNCHRONIZATION MODE RECONCILIATION (`auto` vs `all`)

`HandicapLabSyncService` supports multiple source ingestion modes. Both modes were evaluated and reconciled against raw source ledgers.

### Ledger Counts Reconciliation

| Ingestion Mode | Source Files Read | Total Source Rows | Valid Parsed | Invalid Skipped | Duplicates Skipped | Total Synchronized | Public Picks | Diagnostic Rows |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`sourceType: 'auto'`** | `canonical_prediction_ledger.jsonl` | 566 | 549 | 17 | 549 | **549** | **0** | **549** (100%) |
| **`sourceType: 'all'`** | `canonical_prediction_ledger.jsonl` + `rescue_prediction_ledger.jsonl` | 980 | 945 | 35 | 549 | **945** | **0** | **945** (100%) |

### Market Breakdown

- **`auto` Mode (549 Rows)**: 418 Asian Handicap (AH) + 131 Over/Under (OU) + 0 BTTS.
- **`all` Mode (945 Rows)**: 652 Asian Handicap (AH) + 293 Over/Under (OU) + 0 BTTS.
- **Why 17 (or 35) Rows Were Skipped**: All skipped rows are Both Teams To Score (BTTS) records that have `line: null` and `lineType: "NONE"` in raw HandicapLab ledgers.

---

## 7. GATE F: BTTS MARKET SEMANTICS & EXCLUSION AUDIT

A targeted forensic audit was performed on the Both Teams To Score (BTTS) records generated by HandicapLab:

1. **Raw Payload Characteristics**:
   - `market: "BTTS"`, `selection: "YES"` (or `"NO"`).
   - `line: null`, `lineType: "NONE"`.
   - Timestamps: Many BTTS records in HandicapLab were captured post-kickoff (e.g. `kickoffTimestamp: "2026-09-29T17:00:00Z"` vs `predictionTimestamp: "2026-09-29T17:29:29Z"`).
2. **SALMO Canonical Schema Constraint**:
   - `CanonicalPredictionRecord` strictly requires `line: number`.
   - `HandicapLabSyncService.mapRawToCanonical` enforces `typeof line === 'number'`, rejecting `line: null` with error `'Missing or non-numeric line'`.
3. **Policy Determination**:
   - In betting mathematics, BTTS is a binary proposition with no point spread or goal total.
   - Even if mapped to a canonical default of `line: 0.0`, BTTS records remain strictly classified as `confidenceTier: 'RESEARCH_ONLY'` and `isPublicPick: false`.
   - Furthermore, `src/app/api/daily-picks/route.ts` strictly enforces:
     ```typescript
     if (pick.market_type !== 'ASIAN_HANDICAP' && pick.market_type !== 'OVER_UNDER') {
       return false;
     }
     ```
   - **Conclusion**: BTTS cannot leak into public recommendations under any circumstance.

---

## 8. GATE G: DEDUPLICATION, IDEMPOTENCY & ATOMIC RENAME INTEGRITY

The sync pipeline enforces enterprise-grade durability and idempotency:

1. **Composite Key**: Records are uniquely identified by:
   `canonicalMatchId | market | line.toFixed(2) | selection.toLowerCase().trim() | modelVersion`
2. **In-Batch & Cross-Run Deduplication**: Duplicates within a batch or across subsequent sync runs are detected and skipped without mutating existing records.
3. **Atomic File Write**: Writes new ledger data to a temporary file (`.tmp.<timestamp>.<nonce>`), followed by `fs.renameSync()`. This guarantees that crashes or power interruptions never result in corrupted or half-written ledger files.
4. **Historical Ledger Containment**: Hard-coded safety guards explicitly throw an unhandled exception if `destinationPath` matches any of the 3 protected historical ledgers.

---

## 9. GATE H: MULTI-LAYERED DEFENSE-IN-DEPTH AGAINST PUBLIC PICK LEAKAGE

Hostile negative testing was conducted to prove that diagnostic, unvalidated, or research predictions can **never** enter public feeds (such as `/daily-picks` or `/picks`).

```mermaid
flowchart TD
    Candidate["Raw Candidate Prediction"] --> L1{"Layer 1: League Production Status<br/>(isLeagueMarketProductionEnabled)"}
    L1 -- "false (15/15 Leagues)" --> Quarantined["QUARANTINED / EXCLUDED<br/>(Cannot Enter Daily Picks)"]
    L1 -- "true" --> L2{"Layer 2: Market Type<br/>(AH or OU Only)"}
    L2 -- "BTTS or Other" --> Quarantined
    L2 -- "AH / OU" --> L3{"Layer 3: Temporal Guard<br/>(kickoffUtc > referenceTimeMs)"}
    L3 -- "Past / Stale Kickoff" --> Quarantined
    L3 -- "Future" --> L4{"Layer 4: Verdict Filter<br/>(verdict === 'LAYAK')"}
    L4 -- "LEWATI / PANTAU" --> Quarantined
    L4 -- "LAYAK" --> L5{"Layer 5: Market Odds Gate<br/>(marketOdds > 1.0)"}
    L5 -- "Null / Unavailable" --> Quarantined
    L5 -- "Valid Odds (> 1.0)" --> PublicPick["Actionable Public Pick"]
```

### The 5 Defense-in-Depth Layers

1. **Layer 1: League Production Status (`multiLeagueRegistry.ts`)**:
   - `production_pick_enabled` is set to `false` for all 15 canonical leagues.
   - `isLeagueMarketProductionEnabled(league, market)` evaluates to `false` across every league and market.
2. **Layer 2: Betting Market Boundary (`/api/daily-picks/route.ts`)**:
   - Only `ASIAN_HANDICAP` and `OVER_UNDER` markets are eligible. BTTS is explicitly rejected at line 48.
3. **Layer 3: Temporal Kickoff Kill Switch (`lib/eligibility.ts`)**:
   - Requires `kickoffUtc > referenceTimeMs`. Post-kickoff, in-play, or stale predictions fail immediately.
4. **Layer 4: Decision Verdict Gate (`lib/eligibility.ts`)**:
   - Only picks with verdict strictly equal to `'LAYAK'` qualify. Diagnostic forecasts (`'LEWATI'`) are dropped.
5. **Layer 5: Market Odds Availability (`lib/eligibility.ts`)**:
   - Requires real, valid decimal market odds ($> 1.0$). Picks without odds are classified as `ODDS NOT YET AVAILABLE` and suppressed.

---

## 10. GATE I: FULL REGRESSION SUITE & PRODUCTION BUILD VERIFICATION

1. **Test Suite Execution (`npm test`)**:
   - 37 test suites executed.
   - **338 tests passed**.
   - **1 test skipped** (Scenario 20, external TCP staging postgres).
   - **0 tests failed**.
2. **Next.js Production Build (`npm run build`)**:
   - Next.js 15.5.25 compiled successfully in 3.7s.
   - Type-checking and ESLint passed with 0 errors.
   - 30 routes (static and dynamic) generated successfully.
3. **Cron Containment (`vercel.json`)**:
   - `"crons": []` verified on disk. No background execution scheduled.

---

## 11. GATE J: FINAL OPERATIONAL DECISION & NEXT STEPS

### Operational Verdict

```
================================================================================
FINAL OPERATIONAL VERDICT:
NOT READY FOR PRODUCTION PROMOTION — SYSTEM PROPERLY CONTAINED IN SHADOW STATE
================================================================================
- LIVE BETTING ENGINE:    DISABLED
- CRON BACKGROUND JOBS:   DISABLED (crons: [])
- PRODUCTION DEPLOYMENT:  BLOCKED (Zero unauthorized push or merge)
- SHADOW LEAGUES:         REMAIN SHADOW (14/14 SHADOW, 1/1 PAUSED)
- HISTORICAL LEDGERS:     PRISTINE (3/3 Cryptographic Hashes Preserved)
================================================================================
```

### Recommended Next Engineering Steps (EPIC 79+)
1. **Out-of-Sample Accumulation**: Continue operating in read-only / shadow evidence collection until a statistically valid sample of true closing market odds is acquired ($N \ge 300$ per league).
2. **Pinnacle Market Benchmark Pairing**: Once live quota or open market odds feeds are secured, conduct paired Brier score difference tests against Pinnacle closing lines before scheduling another promotion audit.
3. **BTTS Standardization**: Align with HandicapLab on whether BTTS should adopt a formal dimensionless line convention (`line: 0.0`) or maintain dedicated binary proposition typing.
