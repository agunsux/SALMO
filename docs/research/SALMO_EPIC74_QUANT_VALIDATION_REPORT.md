# SALMO EPIC 74 — QUANT VALIDATION, SETTLEMENT AUDIT & EDGE VERIFICATION REPORT

**Author:** Quantitative Validation & Release Engineering Team  
**Evaluation Date:** October 15, 2026  
**Repository Commit:** `c254ba2` (Base Main) / `feat/epic-74-quant-validation-and-edge-audit`  
**Production URL:** `https://salmo.dev` (`dpl_G1tSVUnT5SFvx6oTXZFdCRKBnPkb`)  
**Mandated Final Verdict:** `INSUFFICIENT_EVIDENCE`  
**Operational Status:** **LIVE BETTING REMAINS DISABLED (CRONS: []) — RESEARCH STREAM PRESERVED**

---

## 1. Executive Summary & Final Verdict

This quantitative validation audit establishes whether historical predictions in SALMO demonstrate statistically measurable predictive value, whether reported settlement metrics are mathematically trustworthy, and whether SALMO currently possesses demonstrable betting edge.

### Mandated Final Verdict: `INSUFFICIENT_EVIDENCE`

The verdict of **`INSUFFICIENT_EVIDENCE`** is strictly required under SALMO quantitative governance due to the following empirically established facts:

1. **Flawless Settlement Engine Accounting:** An independent recalculation of all 12 settled positions from Premier League Matchweek 6 using `QuarterLineSettler` achieved **100% agreement (12/12)** on every quarter-line split, push, and half-loss. The aggregate accounting across all 12 settled positions generated **12.00 units turnover**, **+0.830 units net profit**, and **+6.92% ROI**.
2. **Public Pick Cohort is Statistically Undersized:** Across the 12 settled positions, only **2 positions** met the platform's public pick qualification gate (`is_pick === true` AND `verdict === 'LAYAK'`). While these 2 positions generated **+0.925 units net profit** on **2.00 units turnover** (+46.25% ROI), a sample size of $N = 2$ carries zero statistical significance.
3. **Pre-Registered Gate Failure:** The platform's pre-registered promotion framework (`src/engine/performance/gates.ts`) mandates a minimum sample size of $N \ge 100$ settled positions (`HEADLINE_COHORT_MIN_SETTLED_POSITIONS = 100`) and $N \ge 300$ resolved legs (`BRIER_VS_MARKET_MIN_LEGS = 300`). At $N = 12$ (and $N = 2$ for public picks), the platform automatically enforces `GATE_STATUS_INSUFFICIENT_SAMPLE`.
4. **Calibration Indistinguishable from Random Chance:** Binary no-push per-leg Brier scoring across the 11 resolved positions yielded a mean Brier score of **0.2364** with a 95% Confidence Interval of **`[0.1853, 0.2875]`**. Because this 95% confidence interval squarely covers **0.2500** (the uninformative coin-flip prior), the null hypothesis of zero predictive skill cannot be rejected.
5. **Missing Odds on 14 Expansion Leagues:** 316 of the 336 research predictions across the 14 non-EPL domestic leagues carry `marketOdds: null` due to upstream OddsPapi quota exhaustion (260/250 consumed). Computing ROI, yield, CLV, or realized profitability on non-EPL leagues is scientifically impossible without fabricating odds, which SALMO strictly forbids.

Consequently, **zero leagues are promoted to `ACTIVE`**, no picks are released to production, and all 14 expansion leagues remain strictly designated as `RESEARCH_ONLY` / `SHADOW`.

---

## 2. Audited Dataset Sizes & Data Integrity Findings (Phase 1)

All relevant prediction streams across the repository and runtime services were audited for record counts, duplicate IDs, schema consistency, date integrity, and odds provenance.

### 2.1 Dataset Reconciliation Matrix

| Prediction Stream | File Path | Total Records | Unique IDs | Duplicate / Conflicting IDs | Valid Fixture Dates | Genuine Numeric Odds | NULL Odds | Settled Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Live Prediction Ledger** | `data/verification/live_prediction_ledger.jsonl` | **30** | 30 | 0 (0%) | 30 (100%) | 30 (100%) | 0 (0%) | 12 Settled, 18 Pending |
| **All-Leagues Research Ledger** | `data/verification/all_leagues_research_ledger.jsonl` | **336** | 336 | 0 (0%) | 336 (100%) | 20 (EPL only) | 316 (Non-EPL) | 0 Settled (Simulations) |
| **Multi-League Reconciled Mirror** | `data/research/multi_league_research_predictions.jsonl` | **336** | 336 | 0 (0%) | 336 (100%) | 20 (EPL only) | 316 (Non-EPL) | 0 Settled (Simulations) |
| **Unified Deduplicated Corpus** | `CanonicalPredictionLedgerService` | **366** | 366 | 0 (0%) | 366 (100%) | 50 (13.66%) | 316 (86.34%) | 12 Settled, 354 Pending/Sim |

### 2.2 Key Integrity Findings
- **Zero Collision Rate:** Across all 366 unique records in the repository, there is exact bijection between prediction IDs and match terms. Zero identifier collisions or overwritten keys were found.
- **Deterministic Reconciled Mirror:** `data/research/multi_league_research_predictions.jsonl` is an idempotent mirror of the 336 research records. Every entry possesses a SHA-256 provenance hash computed across immutable pre-match terms:
  $$\text{Hash} = \text{SHA-256}(\text{predictionId} \parallel \text{canonicalMatchId} \parallel \text{market} \parallel \text{selection} \parallel \text{line} \parallel \text{modelProb} \parallel \text{odds} \parallel \text{kickoffUtc})$$
- **Odds Availability Truth:** Premier League records carry authentic Pinnacle closing/current odds ($N = 20$). The remaining 14 non-EPL leagues ($N = 316$) have explicitly preserved `marketOdds: null`. No synthetic or imputed odds were generated.

---

## 3. Independent Audit of the 12 Settled Predictions (Phase 2)

Each of the 12 settled positions from Premier League Matchweek 6 (October 10, 2026) was independently audited and recomputed using `QuarterLineSettler`. The audit compared the recorded outcome and profit against the verified full-time match score, market handicap/total line, and actual Pinnacle odds taken.

### 3.1 Itemized Position-by-Position Settlement Audit

| # | Prediction ID | Match Identifier | Score | Market & Line | Odds | Recorded Outcome | Computed Outcome | Recorded Profit | Computed Profit | Verdict | Agreement |
| :-: | :--- | :--- | :-: | :---: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| **1** | `79743960-976e-4daa-8916-0b32f2f8a540` | `EPL_2026_ARSENALFC_LEEDSUNITED` | 2-1 | AH -1.25 | 1.961 | `HALF_LOSS` | `HALF_LOSS` | -0.500 | -0.500 | LEWATI | **VERIFIED** |
| **2** | `b4c3c6b4-7ad4-445d-8873-13d266fa5677` | `EPL_2026_ARSENALFC_LEEDSUNITED` | 2-1 | OU 2.50 | 1.840 | `WIN` | `WIN` | +0.840 | +0.840 | LEWATI | **VERIFIED** |
| **3** | `ad5a6519-a752-4de2-8348-683f2a403c58` | `EPL_2026_SUNDERLANDAFC_BRIGHTON` | 0-2 | AH +0.25 | 1.854 | `LOSS` | `LOSS` | -1.000 | -1.000 | LEWATI | **VERIFIED** |
| **4** | `492eb0e0-15b4-4266-80ce-cdb6967e314c` | `EPL_2026_SUNDERLANDAFC_BRIGHTON` | 0-2 | OU 2.75 | 2.040 | `LOSS` | `LOSS` | -1.000 | -1.000 | LEWATI | **VERIFIED** |
| **5** | `78dba6aa-0c1a-479e-8fd7-50ca27c4043c` | `EPL_2026_IPSWICHTOWN_FULHAMFC` | 2-1 | AH 0.00 | 2.110 | `WIN` | `WIN` | +1.110 | +1.110 | LEWATI | **VERIFIED** |
| **6** | `97d40e50-ced6-4569-853d-9aaba350a6a9` | `EPL_2026_IPSWICHTOWN_FULHAMFC` | 2-1 | OU 2.75 | 1.980 | `HALF_WIN` | `HALF_WIN` | +0.490 | +0.490 | LEWATI | **VERIFIED** |
| **7** | `63398c16-9bfd-49a7-8821-6eb20f7c6ccf` | `EPL_2026_CHELSEAFC_BOURNEMOUTH` | 5-1 | AH -0.75 | 1.925 | `WIN` | `WIN` | +0.925 | +0.925 | LEWATI | **VERIFIED** |
| **8** | `a97b3c31-258d-454a-8030-a5e4772e8db7` | `EPL_2026_CHELSEAFC_BOURNEMOUTH` | 5-1 | OU 3.25 | 2.040 | `WIN` | `WIN` | +1.040 | +1.040 | LEWATI | **VERIFIED** |
| **9** | `4ad435c1-00f0-4701-8d24-4c3ba6063218` | `EPL_2026_ASTONVILLA_BRENTFORD` | 2-2 | AH 0.00 | 1.961 | `PUSH` | `PUSH` | 0.000 | 0.000 | **LAYAK** | **VERIFIED** |
| **10** | `8ee72909-4c18-4275-8e67-485340b9719a` | `EPL_2026_ASTONVILLA_BRENTFORD` | 2-2 | OU 2.75 | 1.925 | `WIN` | `WIN` | +0.925 | +0.925 | **LAYAK** | **VERIFIED** |
| **11** | `8d4898fc-bb8f-41f2-8b8b-3f8b038444c3` | `EPL_2026_MANUTD_TOTTENHAM` | 1-1 | AH -0.75 | 1.934 | `LOSS` | `LOSS` | -1.000 | -1.000 | LEWATI | **VERIFIED** |
| **12** | `402005e6-d65c-4292-819f-91f812f2b54b` | `EPL_2026_MANUTD_TOTTENHAM` | 1-1 | OU 3.25 | 2.030 | `LOSS` | `LOSS` | -1.000 | -1.000 | LEWATI | **VERIFIED** |

### 3.2 Mathematical Verification Summary
- **Outcome Distribution:**
  - Full Wins: **5** (Arsenal OU 2.5, Ipswich AH 0, Chelsea AH -0.75, Chelsea OU 3.25, Villa OU 2.75)
  - Half Wins: **1** (Ipswich OU 2.75)
  - Pushes: **1** (Aston Villa AH 0)
  - Half Losses: **1** (Arsenal AH -1.25)
  - Full Losses: **4** (Sunderland AH +0.25, Sunderland OU 2.75, Man Utd AH -0.75, Man Utd OU 3.25)
- **Accounting Verification:**
  - Positive Profits: $+0.840 + 1.110 + 0.490 + 0.925 + 1.040 + 0.925 = \mathbf{+5.330\text{ units}}$
  - Negative Profits: $-0.500 - 1.000 - 1.000 - 1.000 - 1.000 = \mathbf{-4.500\text{ units}}$
  - Net Profit: $+5.330 - 4.500 = \mathbf{+0.830\text{ units}}$
  - Total Turnover: $12 \times 1.0 = \mathbf{12.00\text{ units}}$
  - Realized ROI: $\frac{+0.830}{12.00} \times 100\% = \mathbf{+6.92\%}$
- **Public Pick Cohort (`verdict === 'LAYAK'`):**
  - Positions: 2 (`4ad435c1-00f0-4701-8d24-4c3ba6063218` & `8ee72909-4c18-4275-8e67-485340b9719a`)
  - Turnover: $2.00\text{ units}$
  - Net Profit: $0.000 + 0.925 = \mathbf{+0.925\text{ units}}$
  - Realized ROI: $\mathbf{+46.25\%}$
  - Sample Size Status: **$N = 2$ fails the 100-position pre-registered gate.**

---

## 4. Measurability, Calibration & Uncertainty Breakdown (Phase 3)

We explicitly separate the 5 distinct evidence classes to maintain rigorous scientific integrity:

### 4.1 Evidence Class Breakdown

| Evidence Class | Description | Usable Sample Size | Available Metrics | Strict Limitations |
| :--- | :--- | :---: | :--- | :--- |
| **Class 1: Prediction Quality** | Forecast probabilities paired with verified outcomes | $N = 12$ positions (11 non-push) | Binary outcomes, hit rate (50.0%) | Extreme sample variance; cannot infer generalized forecast skill |
| **Class 2: Calibration** | Forecast probabilities vs observed frequencies | $N = 18$ resolved legs, $N = 11$ resolved positions | Brier score, 95% Confidence Interval | 95% CI contains 0.2500; cannot reject uninformative null hypothesis |
| **Class 3: Market Comparison** | Forecasts with time-aligned Pinnacle benchmark closing prices | $N = 12$ positions | Closing line value (CLV%), market beat rate | Sample too small ($N < 100$) to evaluate systematic market outperformance |
| **Class 4: Betting Performance** | Settled positions with genuine executable odds and turnover | $N = 12$ positions (diagnostic), $N = 2$ (public picks) | Turnover (12.0u), Net Profit (+0.830u), ROI (+6.92%) | High variance; $N = 2$ public picks cannot establish edge |
| **Class 5: Research Simulations** | 14 non-EPL leagues without genuine executable odds | $N = 316$ positions | Model probabilities, score grid outputs | **Zero odds (`marketOdds: null`)**; ROI, yield, and CLV cannot be calculated |

### 4.2 Binary No-Push Per-Leg Brier Scoring Audit
Quarter-line bets were decomposed into two half-stake legs ($line \pm 0.25$, weight $= 0.5$). Integer/half lines carry 1 leg (weight $= 1.0$). Push legs are excluded from Brier calculation.

- **Leg-Level Metrics ($N = 18$ resolved legs):**
  - Mean Brier Score: **0.2372**
  - Standard Deviation: **0.0989**
  - Standard Error: **0.0233**
  - 95% Confidence Interval: **`[0.1916, 0.2829]`**
- **Position-Level Metrics ($N = 11$ resolved positions):**
  - Mean Brier Score: **0.2364**
  - Standard Deviation: **0.0865**
  - Standard Error: **0.0261**
  - 95% Confidence Interval: **`[0.1853, 0.2875]`**

### 4.3 Statistical Implication: Uninformative Prior Coverage
The 95% Confidence Interval for the model's position Brier score spans from **0.1853 to 0.2875**. Because this interval includes **0.2500** (the theoretical Brier score of an uninformative prior predicting $p = 0.50$ on every trial), **there is no statistically significant evidence that SALMO's model outperformed a random coin flip on this sample.**

---

## 5. Audit for Data Leakage and Selection Bias (Phase 4)

The modeling and validation pipeline was audited for post-match leakage, retrospective contamination, and cherry-picking.

### 5.1 Temporal Integrity & Feature Construction
- **Team Ratings:** Ratings are computed using an exponentially time-decayed Dixon-Coles Poisson model ($\text{decayRate} = 0.90$). Ratings updates ingest strictly past match goals; no current-fixture or future-match information leaks into team attack/defense ratings.
- **Timestamp Integrity:** The `TemporalIntegrityGuard` inspects ingestion timestamps. Batch staging fixtures initialized with placeholder timestamps (`2026-10-11T05:00:00.000Z`) are strictly segregated into `UNVERIFIED_TIMESTAMP_PROVENANCE` to prevent retrospective evaluation.

### 5.2 Selection Bias Audit
- **Zero Cherry-Picking in Stored Records:** The live prediction ledger contains all 12 positions generated for Premier League Matchweek 6. No losing bets were omitted:
  - Sunderland AH +0.25 (LOSS, -1.0u)
  - Sunderland OU 2.75 (LOSS, -1.0u)
  - Man United AH -0.75 (LOSS, -1.0u)
  - Man United OU 3.25 (LOSS, -1.0u)
  - Arsenal AH -1.25 (HALF_LOSS, -0.5u)
  All 5 losing/half-losing positions remain immutably preserved in the ledger, proving zero survival or reporting bias in the recorded archive.

---

## 6. Pre-Registered Research Acceptance Gates (Phase 5)

Under `src/engine/performance/gates.ts`, the following single source of truth governs model promotion and operational activation:

```typescript
// Pre-registered minimum sample sizes
export const CLV_HEADLINE_MIN_POSITIONS = 100;
export const HEADLINE_COHORT_MIN_SETTLED_POSITIONS = 100;
export const BRIER_VS_MARKET_MIN_LEGS = 300;

// Pass / sanity thresholds
export const BRIER_DIFF_VS_MARKET_CI95_UPPER_MAX = 0; // (modelBrier - marketBrier) CI95 upper < 0
export const PROMOTION_CLV_CI95_LOWER_MIN = 0;        // CLV mean CI95 lower bound > 0 at n >= 100
export const PROMOTION_MAX_LEAKAGE_SUSPECT_ROWS = 0; // Zero leakage suspect rows allowed
```

### 6.1 Evaluation of Current Status Against Acceptance Gates

| Acceptance Gate | Required Threshold | Current Realized State | Status | Promotion Decision |
| :--- | :---: | :---: | :---: | :---: |
| **Headline Settled Positions** | $N \ge 100$ | $N = 2$ (Public Picks) / $N = 12$ (All) | `FAIL` | **BLOCKED (Insufficient Sample)** |
| **Brier vs Market Benchmark Legs** | $N \ge 300$ | $N = 18$ | `FAIL` | **BLOCKED (Insufficient Sample)** |
| **CLV Benchmark Observations** | $N \ge 100$ | $N = 12$ | `FAIL` | **BLOCKED (Insufficient Sample)** |
| **Brier 95% CI Upper Bound** | $\text{CI}_{95} \text{ upper} < 0.250$ | $0.2875$ | `FAIL` | **BLOCKED (Cannot reject null)** |
| **Market Odds Completeness** | 100% Genuine Odds | 20 / 336 (6.0%) in research | `FAIL` | **BLOCKED (14 Leagues Missing Odds)** |
| **Leakage Suspect Rows** | 0 rows | 0 rows | `PASS` | Precondition satisfied |

**Research Acceptance Conclusion:**
- Premier League (`ENG-PL`): Stays in `PRODUCTION` infrastructure, but live daily picks remain gated (`NO_QUALIFIED_PICKS` / `ODDS NOT YET AVAILABLE`) until active valid odds are fed.
- 14 Expansion Domestic Leagues: Retained in `RESEARCH_ONLY` / `SHADOW`. Zero leagues promoted.
- Both Teams to Score (`BTTS`): Retained in `RESEARCH_ONLY` due to uncalibrated correlation parameters.

---

## 7. Code Changes, Regression Suite & Build Evidence (Phase 6 & 7)

### 7.1 Implemented Artifacts & Tests
1. **`tests/epic74_quant_validation_and_audit.test.js`:**
   - Test 1: Canonical dataset counts (30 live, 336 research, 366 deduplicated unified, 0 ID collisions, odds distribution).
   - Test 2: Independent Quarter-line settlement audit of all 12 positions (100% match, +0.830u net profit, +6.92% ROI; N=2 public picks +0.925u, +46.25% ROI).
   - Test 3: Binary no-push Brier scoring, calibration CI95 calculation ([0.1853, 0.2875]), and uninformative prior coverage verification.
   - Test 4: Pre-registered sample size gate enforcement (`HEADLINE_COHORT_MIN_SETTLED_POSITIONS = 100`) and verification of mandated verdict enum `INSUFFICIENT_EVIDENCE`.

### 7.2 Full Test Suite Verification
```
✔ EPIC 74 — Phase 1: Canonical dataset counts and uniqueness across the entire corpus (8.7ms)
✔ EPIC 74 — Phase 2: Independent Quarter-line settlement audit of all 12 settled positions (1.0ms)
✔ EPIC 74 — Phase 3: Binary no-push Brier scoring, calibration CI95, and uninformative prior coverage (3.3ms)
✔ EPIC 74 — Phase 5: Enforcement of pre-registered sample size gates and INSUFFICIENT_EVIDENCE verdict (1.1ms)

ℹ tests 310
ℹ suites 1
ℹ pass 309
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
```

### 7.3 Production Build Verification
```
   ▲ Next.js 15.5.25
   - Environments: .env.local

   Creating an optimized production build ...
 ✓ Compiled successfully in 2.8s
   Linting and checking validity of types ...
   Collecting page data ...
 ✓ Generating static pages (30/30)
   Finalizing page optimization ...
   Collecting build traces ...
```
All 30 static and dynamic routes compiled without error.

---

## 8. Outstanding Requirements for Future Live Validation

Before live prediction publishing can be resumed for any league, the following operational requirements must be satisfied:

1. **Odds Provider Quota Restoration:**
   - Establish a funded, non-exhausted subscription with OddsPapi or an equivalent Pinnacle-benchmark provider to ingest authentic AH and OU lines.
   - Live prediction publishing cannot occur while OddsPapi is at `260/250` consumed.
2. **Expansion League Benchmark Mapping:**
   - Ingest genuine Pinnacle pre-match and closing lines for the 14 expansion leagues.
   - Validate market liquidity and devigged probabilities before calculating CLV or evaluating walk-forward profitability.
3. **Out-of-Sample Evaluation Window:**
   - Accumulate at least 100 live settled positions under pre-registered frozen model hashes to satisfy `HEADLINE_COHORT_MIN_SETTLED_POSITIONS = 100`.
   - Achieve a paired Brier score difference vs Pinnacle where the upper bound of the 95% Confidence Interval is strictly less than 0 ($\text{CI}_{95} \text{ upper} < 0$).
4. **Automated Scheduler Safety:**
   - Production cron jobs in `vercel.json` must remain `crons: []` until quota recovery and staging migration rehearsals are completed.

---

## 9. Final Decision & Sign-off

- **Verdict:** `INSUFFICIENT_EVIDENCE`
- **Release Status:** Technical platform healthy; live prediction publishing halted; research datasets cleanly preserved.
- **Sign-off:** SALMO Quantitative Validation & Release Engineering Team.
