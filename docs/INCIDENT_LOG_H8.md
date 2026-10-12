# SALMO — Incident Log Entries (Hotfix H8: Metric Integrity)

**Recorded At:** `2026-10-12`
**Branch:** `feat/openfootball-fixture-ingestion`
**Scope:** Hotfix H8 Deliverable 5 — Metric Integrity & Reporting Provenance Incidents

---

## INC-H8-01 — Hand-Typed Summary Table Transcription Error in Hotfix H7 Report (`0.2189 [0.097, 0.349]` vs `0.2074 [0.1299, 0.2852]` in Code)

- **Date Discovered:** `2026-10-12`
- **Severity:** Medium (Reporting / Audit Trail Integrity; Zero Production Code Impact)
- **Affected Artifact:** Hotfix H7 Merge-Readiness Markdown Report (`Premier League` row in the 15-League Metric Computability Matrix summary table)
- **What Happened:**
  - In the Hotfix H7 markdown summary table, the `Premier League` Brier 95% confidence interval was manually typed in prose as `0.2189 [0.097, 0.349]` (`n=12`) instead of copying the exact JSON output emitted by `/api/v1/research` (`src/app/api/v1/research/route.ts`, lines 505–584).
  - The actual deterministic code output on commit `f31406d` (using `seed = 42`, `iterations = 2000`) remained unchanged at **`0.2074 [0.1299, 0.2852]`** (`stdErr = 0.0414`, `n = 12`).
  - The number `0.2189` came from conflating `ENG-PL` `ahHomeMinus05.brier = 0.2189` in `data/artifacts/multi_league_team_ratings_v1.0.json` with the 12-row live EPL Brier in `/api/v1/research`.
- **Root Cause:**
  - Manual prose transcription of summary tables instead of programmatic extraction from raw command/endpoint output.
- **Corrective Action & Prevention Rule:**
  - Raw JSON/CLI outputs from `/api/v1/research`, `/api/v1/performance`, and verification scripts must be generated and asserted directly by automated tests before any markdown table is written.
  - Summary prose is never accepted as evidence; every numeric claim in a release or hotfix report must match an automated test assertion and raw command output.

---

## INC-H8-02 — Fractional Outcome Coding Artifact in Quarter-Line Brier Scoring (`PUSH=0.5, HALF_WIN=0.75, HALF_LOSS=0.25`) Across Live EPL and 14-League Backtest

- **Date Discovered:** `2026-10-12`
- **Severity:** High (Statistical Validation & Promotion Gate Integrity)
- **Affected Components:**
  1. `src/app/api/v1/research/route.ts` (`outcomeValueMap = { WIN: 1.0, HALF_WIN: 0.75, PUSH: 0.5, HALF_LOSS: 0.25, LOSS: 0.0 }`)
  2. `scripts/build_multi_league_ratings_and_backtest.js` (`evalQuarterLineAh`, which scored settled outcomes as `actualSettledScore in {0.0, 0.25, 0.5, 0.75, 1.0}` and compared the resulting fractional Brier against the binary coin-flip threshold `0.2500`)
- **What Happened & Mathematical Mechanism:**
  - Standard Brier scoring $B = \frac{1}{N}\sum (p_i - y_i)^2$ is defined strictly for **binary** outcomes $y_i \in \{0, 1\}$, where a non-informative $p = 0.50$ coin-flip yields $B_{\text{coin}} = (0.50 - 1)^2 = (0.50 - 0)^2 = 0.2500$.
  - When quarter-line and integer-line outcomes were mapped to fractional target values $y \in \{0.0, 0.25, 0.50, 0.75, 1.0\}$, any prediction near $p \approx 0.50$ incurred a squared error of:
    - $(p - 0.50)^2 \approx 0.0000$ on a whole-line `PUSH` ($y = 0.50$), instead of being excluded;
    - $(p - 0.75)^2 \approx 0.0625$ on a quarter-line `HALF_WIN` ($y = 0.75$);
    - $(p - 0.25)^2 \approx 0.0625$ on a quarter-line `HALF_LOSS` ($y = 0.25$).
  - Consequently, even a pure coin-flip ($p = 0.50$ everywhere) achieved a fractional Brier of **`0.2030 – 0.2180`** across the 14 leagues (`~0.035 – 0.045` lower than `0.2500`), creating a false appearance that the model beat the `0.2500` coin-flip benchmark by a wide margin.
- **Measured Impact:**
  1. **Live EPL (`n=12` settled positions / `21` legs):**
     - Old fractional position Brier: **`0.2074 [0.1299, 0.2852]`** (`n=12` positions, including 3 push legs coded as `0.5` / `0.75` / `0.25`).
     - Honest position-level Brier without fractional coding: **`0.2543`** (`n=11`, excluding push) and **`0.2649`** (`n=9` pure binary outcomes).
     - Hotfix H8 **Binary No-Push Per-Leg Brier** (`21` total legs across `12` positions -> `3` push legs excluded -> `18` resolved binary legs scored against each leg's conditional non-push win probability $p_{\text{leg}} = \frac{p_W(\text{leg})}{p_W(\text{leg}) + p_L(\text{leg})}$ from the $11 \times 11$ Dixon-Coles score grid):
       - Unweighted per-leg Brier (`n=18` resolved legs): **`0.2372 [0.1453, 0.3357]`**
       - Stake-weighted per-leg Brier (`10.0u` resolved stake weight): **`0.2449`**
  2. **14-League Walk-Forward Backtest (`n=4,018` evaluated matches):**
     - Old fractional quarter-line AH Brier (`ahBalancedQuarterLine`): **`0.2002 – 0.2178`** across all 14 leagues (`14/14` leagues appeared to have `ci95Upper < 0.2500`).
     - Hotfix H8 **Binary No-Push Per-Leg Quarter-Line AH Brier**: **`0.2406 – 0.2495`** (unweighted per-leg) / **`0.2416 – 0.2498`** (stake-weighted), causing **11 of the 14 leagues** (including 4 of the 7 European candidate leagues: `ESP-LALIGA`, `ITA-SERIEA`, `NED-ERE`, `BEL-PRO`) to **flip from PASS to FAIL** on `ci95Upper < 0.2500`.
     - **ENG-PL Pinnacle Historical Benchmark (`n=80` matched fixtures):** Old fractional AH Brier was `0.2089` (Pinnacle) vs `0.2088` (Model); under Binary No-Push Per-Leg (`105` resolved legs, `16` push legs excluded), Pinnacle AH Brier is **`0.2516`** and Model AH Brier is **`0.2501`**.
- **Corrective Action Implemented in Hotfix H8:**
  - Created `src/engine/performance/brierScoring.ts` implementing strict binary no-push per-leg Brier decomposition (`evaluatePositionBrierLegs`), decomposing quarter-lines (`.25`, `.75`) into two half-stake legs (`[line - 0.25, line + 0.25]`), scoring each leg against its own conditional non-push win probability from the $11 \times 11$ Dixon-Coles grid, and excluding push legs (`actualMargin == 0`).
  - Replaced fractional Brier in `src/app/api/v1/research/route.ts` and wired per-leg Brier into `src/engine/performance/performanceMetrics.ts` and `src/app/api/v1/performance/route.ts`.
