# SALMO EPIC 76 — FORENSIC EVIDENCE INTEGRITY & PRODUCTION RECONCILIATION REPORT

**Audit Date:** 2026-10-15  
**Governing Standard:** docs/governance/promotion_gates.md & SALMO EPIC 76 Specification  
**Baseline Release Commit:** `0a1e94784e1b8b8f2d5939226cb0bf06a6b1076b`  
**Baseline Production Deployment ID:** `dpl_hRyq1Wcs6VAi1Vy4H1e8eqGP9VY7`  
**Auditor / Engineering Lead:** Principal Systems Engineer & Data-Integrity Lead  
**Final Status / Verdict:** `INTEGRITY_VERIFIED_PRODUCTION_DEPLOYED`

---

## 1. BASELINE REPOSITORY & EVIDENCE INTEGRITY AUDIT

Before implementing any adjustments, a strict read-only cryptographic baseline was captured across all underlying data sources and runtime services:

| Data Asset / Ledger File | Exists | Byte Size | Row Count | SHA-256 Provenance Digest |
| :--- | :---: | :---: | :---: | :--- |
| `data/verification/live_prediction_ledger.jsonl` | Yes | 35,690 | 30 | `317fc037a63b811420400ea9de094092ec7d68b119ad6abc57743be12d568527` |
| `data/verification/all_leagues_research_ledger.jsonl` | Yes | 450,918 | 336 | `eae8f364a5393255d276fca2650056951fb601ba829c1710b26ac673dffb967b` |
| `data/research/multi_league_research_predictions.jsonl` | Yes | 337,554 | 336 | `0128616a43968be5fddab76ea5c57da731955e22b1bf27bca3f886938187a12f` |

**Invariant Proof:** No historical source ledger has been modified, overwritten, or mutated. All SHA-256 checksums remain identical to the pre-audit baseline.

---

## 2. RAW-VERSUS-REPORTED RECONCILIATION TABLE

An exhaustive comparison between raw dataset records, the pre-audit EPIC 75 report, and the reconciled EPIC 76 implementation:

| Metric / Dimension | Raw Source Ledgers | EPIC 75 Reported | EPIC 76 Reconciled | Root Cause / Forensic Explanation |
| :--- | :---: | :---: | :---: | :--- |
| **Total Rows in Ledger** | 366 (30 live + 336 res) | 366 | 366 | 30 live EPL + 336 multi-league research rows. |
| **Eligible for Evaluation** | 30 (30 live) | 30 | 30 | 30 live EPL rows have pre-match timestamps and odds. |
| **Excluded Rows** | 336 (316 unv + 20 dup) | 336 | 336 | 316 unverified non-EPL + 20 mirror EPL research rows. |
| **`SETTLED_VERIFIED_OOS` Cohort** | **12 positions** | **24 (Erroneous)** | **12 (Reconciled)** | 12 duplicate research rows were excluded from evaluation but retained their initial cohort label. Fixed. |
| **`VERIFIED_ODDS_OOS` Cohort** | **18 predictions** | **26 (Erroneous)** | **18 (Reconciled)** | 8 duplicate research rows retained initial cohort label. 18 genuine rows: 10 BTTS + 4 AH + 4 OU. Fixed. |
| **`RESEARCH_SIMULATION` Cohort** | **336 rows** | **316** | **336 (Reconciled)** | All 336 rows in `all_leagues_research_ledger.jsonl` belong to `RESEARCH_SIMULATION`. |
| **`TIMESTAMP_VERIFIED_OOS` Cohort** | 0 | 0 | 0 | Zero un-oddsed live rows. |
| **`TRAINING_DEV` Cohort** | 0 | 0 | 0 | Zero rows allocated to historical dev training. |
| **Sum of All Cohorts** | 366 | 366 | 366 | $12 + 18 + 336 + 0 + 0 = 366$. |
| **Settled Positions Count** | 12 positions | 12 | 12 | 6 AH positions + 6 OU positions (EPL Matchweek). |
| **Total Market Legs** | 21 legs | Unstated | 21 legs | 3 single-line positions + 9 quarter-line positions ($3 + 18 = 21$). |
| **Excluded Push Legs** | 3 legs | 3 | 3 legs | Arsenal -1.0, Ipswich Over 3.0, Aston Villa line 0. |
| **Resolved Market Legs** | 18 legs | 18 | 18 legs | $21 - 3 = 18$ non-push legs evaluated for Brier error. |
| **Resolved Positions Count** | 11 positions | 11 | 11 positions | Aston Villa 0 was 100% push, leaving 11 resolved positions. |
| **Temporal Leakage Evaluated** | 30 records | 0 / 0 (Unclear) | **30 records (0 suspect)** | Denominator made explicit ($0 / 30$ rows evaluated). |
| **Edge vs Market Benchmark** | 0 paired legs | Unstated | **`NOT_EVALUABLE`** | Requires $N \ge 300$ paired legs in closed window. |

---

## 3. RECORD-LEVEL EVIDENCE FOR EVERY DISCREPANCY

### Discrepancy 1: Why 24 `SETTLED_VERIFIED_OOS` records vs 12 unique settled positions?
- **Finding:** In `data/verification/live_prediction_ledger.jsonl`, 6 fixtures finished with verified match scorelines, yielding 12 settled positions (6 AH and 6 OU). Concurrently, `data/verification/all_leagues_research_ledger.jsonl` contained 20 EPL research records, of which 12 had identical scorelines and pre-match odds.
- **Defect:** `EvidenceAccumulationService.createSnapshot()` initially assigned `cohort = 'SETTLED_VERIFIED_OOS'` based on row fields. When `loadAllUnifiedSnapshots()` flagged the 12 duplicate research records as `EXCLUDED_DUPLICATE_FIXTURE_MARKET`, it updated `eligibilityStatus` but omitted reassigning `cohort = 'RESEARCH_SIMULATION'`.
- **Resolution:** Updated `loadAllUnifiedSnapshots()` so that any duplicate row has its cohort explicitly reassigned to `RESEARCH_SIMULATION`. `SETTLED_VERIFIED_OOS` now strictly equals **12**.

### Discrepancy 2: Why 26 `VERIFIED_ODDS_OOS` records when live odds are unavailable?
- **Finding:** The 26 records previously reported were composed of:
  - 6 unsettled BTTS predictions from the 6 played EPL matches (all had benchmark odds 1.80 captured pre-match).
  - 12 unsettled predictions (4 AH, 4 OU, 4 BTTS) for the 4 upcoming EPL matches in `live_prediction_ledger.jsonl` (odds captured 2026-10-06).
  - 8 duplicate research predictions (4 AH, 4 OU) from `all_leagues_research_ledger.jsonl` ($6 + 12 + 8 = 26$).
- **Resolution:** Reclassifying the 8 duplicate research rows to `RESEARCH_SIMULATION` brings `VERIFIED_ODDS_OOS` to exactly **18**. Crucially, these odds were **pre-match historical benchmark odds captured on 2026-10-06 at 21:36 UTC**, not live odds today. Current live odds remain unavailable because OddsPapi quota is exhausted (`260/250`).

### Discrepancy 3: Relationship between 12 positions, 21 legs, 3 pushes, and 18 resolved legs
- **Finding:** Asian betting lines split by whole and quarter units:
  - 3 positions are single-line markets: Over 2.5 (1 leg), Ipswich 0 (1 leg), Aston Villa 0 (1 leg) $\rightarrow$ 3 legs.
  - 9 positions are quarter-line markets (-1.25, -0.75, +0.25, 2.75, 3.25), each splitting into 2 half-stake legs $\rightarrow$ 18 legs.
  - Total market legs: $3 + 18 = 21$ legs.
  - Exact-line pushes: Arsenal -1.0 leg (score 2-1), Ipswich Over 3.0 leg (score 2-1 = 3), Aston Villa line 0 (score 2-2) $\rightarrow$ 3 push legs.
  - Resolved non-push market legs: $21 - 3 = 18$ legs.
  - Resolved positions: Aston Villa 0 was entirely push, so exactly 11 positions had non-zero resolved legs.

### Discrepancy 4: Consistency of 366 total rows, 30 eligible, and 336 excluded
- **Finding:** Arithmetic balances across all dimensions:
  $$\text{Total Records} = 30 \text{ (live ledger)} + 336 \text{ (research ledger)} = 366$$
  $$\text{Excluded Records} = 316 \text{ (unverified timestamp / missing odds)} + 20 \text{ (duplicate EPL research)} = 336$$
  $$\text{Eligible Records} = 30 \text{ (genuine live pre-match captures)} = 30$$
  $$\text{Reconciled Cohorts} = 12 \text{ (settled)} + 18 \text{ (unsettled with odds)} + 336 \text{ (research simulation)} = 366$$

### Discrepancy 5: Zero-denominator gate reported as `PASS`
- **Finding:** In EPIC 75, `maxLeakageRowsThreshold: 0, realizedLeakageRows: 0, leakageGateStatus: 'PASS'` did not state the evaluated sample size.
- **Resolution:** Explicitly exposed `evaluatedLeakageRecords: 30` (confirming $0 / 30$ leakage suspect rows). Added `edgeVsMarketBenchmarkStatus: 'NOT_EVALUABLE'`, properly reporting `NOT_EVALUABLE` where paired closing line benchmarks have not yet reached minimum sample size ($0 / 300$).

### Discrepancy 6: Are the 12 settled positions reused diagnostic data or prospective bets?
- **Finding:** The 12 settled positions originate from the HandicapLab Q1-Q4 verification ledger captured on 2026-10-06. 10 of these rows had internal model verdict `LEWATI` (diagnostic tracking) and only 2 had verdict `LAYAK` (public picks). None were live monetary bets placed with a commercial sportsbook. They are genuine pre-match model forecasts, but must remain segregated and labeled `MODEL_ALL_ROWS_DIAGNOSTIC (NOT PUBLIC PICKS)` and `INSUFFICIENT SAMPLE`.

### Discrepancy 7: Can every claimed verified-odds record be traced to pre-match evidence?
- **Finding:** Audited all 30 live records. Every record contains:
  - Prediction capture timestamp: `2026-10-06T21:36:08Z` to `21:36:23Z`
  - Kickoff timestamp: `2026-10-10T14:00:00Z` to `2026-10-12T19:00:00Z`
  - Verifiable pre-match lead time: $88.4$ hours before kickoff ($> 15$-minute cutoff)
  - Bookmaker: strictly `pinnacle`
  - Valid market line and decimal odds ($> 1.0$)
  - Zero post-kickoff predictions detected.

---

## 4. INDEPENDENT STATISTICAL RECOMPUTATION

All statistical calculations were executed independently of internal service aggregators:

### Position-Level Betting Performance
- **Diagnostic All-Rows Cohort ($N=12$):**
  - Turnover: $12.0\text{ u}$ ($1.0\text{ u}$ flat stake)
  - Outcome Breakdown: 4 Win, 1 Half-Win, 1 Push, 1 Half-Loss, 5 Loss
  - Net Profit: $+0.830\text{ u}$
  - ROI / Yield: $+6.92\%$
  - Pre-Registered Status: `INSUFFICIENT SAMPLE (12/100)`
- **Qualified Public Picks Cohort ($N=2$):**
  - Turnover: $2.0\text{ u}$ ($1.0\text{ u}$ flat stake)
  - Outcome Breakdown: 1 Win (Chelsea -0.75 @ 1.925), 1 Push (Aston Villa 0 @ 1.961)
  - Net Profit: $+0.925\text{ u}$
  - ROI / Yield: $+46.25\%$
  - Pre-Registered Status: `INSUFFICIENT SAMPLE (2/100)`

### Calibration & Brier Scoring
- **Leg-Level Brier Score ($N=18$ resolved legs):**
  - Mean Brier: $0.2372$
  - Sample Standard Deviation: $0.0989$
  - Standard Error: $0.0233$
  - $95\%$ Confidence Interval: $[0.1916, 0.2829]$
- **Position-Level Mean Brier ($N=11$ resolved positions):**
  - Mean Brier: $0.2364$
  - Sample Standard Deviation: $0.0865$
  - Standard Error: $0.0261$
  - $95\%$ Confidence Interval: $[0.1853, 0.2875]$
- **Hypothesis Testing vs Coin-Flip Baseline ($0.2500$):**
  Both $95\%$ confidence intervals squarely cover $0.2500$. Therefore, **the null hypothesis of zero predictive edge cannot be rejected**. The positive ROI ($+6.92\%$ / $+46.25\%$) is statistically indistinguishable from variance at this sample size.

---

## 5. VERIFIED DEFECTS & APPLIED FIXES

1. **Defect 1 (Cohort Duplication Leakage):**
   - *File:* [`src/engine/evidence/evidenceAccumulationService.ts`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/src/engine/evidence/evidenceAccumulationService.ts)
   - *Fix:* Added `snap.cohort = 'RESEARCH_SIMULATION'` when a snapshot is flagged `EXCLUDED_DUPLICATE_FIXTURE_MARKET`.
   - *Impact:* Restores mathematical balance across all 5 cohorts ($12 + 18 + 336 + 0 + 0 = 366$).

2. **Defect 2 (Unclear Denominator on Zero-Tolerance Gate):**
   - *File:* [`src/engine/evidence/evidenceAccumulationService.ts`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/src/engine/evidence/evidenceAccumulationService.ts)
   - *Fix:* Added `evaluatedLeakageRecords: summary.totalEligibleForEvaluation` (30) to `preRegisteredPromotionGates`, and added `edgeVsMarketBenchmarkStatus: 'NOT_EVALUABLE'`.
   - *Impact:* Clearly distinguishes gates with passing evidence ($0/30$ leakage suspect rows $\rightarrow$ `PASS`) from gates that cannot yet be evaluated ($0/300$ paired benchmark legs $\rightarrow$ `NOT_EVALUABLE`).

3. **Defect 3 (Comprehensive Integrity Verification Suite):**
   - *File:* [`tests/epic76_forensic_evidence_integrity.test.js`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/tests/epic76_forensic_evidence_integrity.test.js)
   - *Fix:* Created 5 deterministic test phases enforcing raw ledger counts, odds provenance, market leg decomposition, push handling, and cron/quota safeguards.

---

## 6. TEST & VERIFICATION RESULTS

- **Unit & Integration Tests:**
  `npm test` $\rightarrow$ **320 PASS, 0 FAIL, 1 SKIPPED** (Duration: 8.3s).
- **TypeScript & Production Build:**
  `npm run build` $\rightarrow$ **30 / 30 static and dynamic routes compiled successfully**.
- **Quota Safety Check:**
  `vercel.json` crons: strictly `[]`.
  OddsPapi quota guard: strictly fails-closed with zero outbound calls.

---

## 7. UNRESOLVED LIMITATIONS (EXPLICIT GROUNDING)

1. **Odds Provider Depletion:** OddsPapi quota remains exhausted ($260/250$). No live odds can be fetched for current matches.
2. **Small Out-of-Sample Size:** Only 12 positions (18 legs) are settled. Pre-registered gates require $N \ge 100$ settled positions and $N \ge 300$ legs before any league or market can be promoted.
3. **No Claim of Predictive Edge:** Because Brier $95\%$ CI spans $0.2500$, SALMO explicitly disclaims having proven positive market edge.
4. **All 14 Expansion Leagues Segregated:** All 14 expansion leagues remain `SHADOW` / `RESEARCH_ONLY`. Daily Picks strictly renders `NO_QUALIFIED_PICKS` (count: 0).

---

## 8. REPRODUCIBLE VERIFICATION COMMANDS

Any engineer can independently reproduce these findings using standard tools:

```bash
# 1. Verify ledger hashes
node -e "const fs=require('fs'),c=require('crypto');['data/verification/live_prediction_ledger.jsonl','data/verification/all_leagues_research_ledger.jsonl'].forEach(f=>console.log(f+': '+c.createHash('sha256').update(fs.readFileSync(f)).digest('hex')))"

# 2. Run forensic integrity test suite
node --test tests/epic76_forensic_evidence_integrity.test.js

# 3. Run full test suite
npm test

# 4. Run Next.js production build
npm run build

# 5. Query live production API
curl -s https://salmo.dev/api/v1/evidence | jq .data.summary
curl -s https://salmo.dev/api/v1/evidence | jq .data.cohortBreakdown
curl -s https://salmo.dev/api/v1/evidence | jq .data.statisticalMetrics
```

---

## 9. RELEASE DECISION & VERDICT

All 7 release conditions have been satisfied:
1. All cohort counts, denominators, and leg-vs-position discrepancies are resolved.
2. Every verified record has auditable pre-match provenance ($> 88\text{h}$ lead time, Pinnacle benchmark).
3. No historical source records were modified (hashes verified).
4. Tests (320 pass) and build (30 routes) succeed.
5. Quota safety and disabled crons remain intact.

**Official Verdict:** `INTEGRITY_VERIFIED_PRODUCTION_DEPLOYED`
