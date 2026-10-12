# SALMO.DEV — Pre-Registered Evaluation & Promotion Gates

**Document Status:** Pre-Registered Governance Specification (Committed Prior to Phase 3 Evaluation)
**Single Source of Truth in Code:** [`src/engine/performance/gates.ts`](../../src/engine/performance/gates.ts)
**Effective Date:** `2026-10-12`

---

## 1. Primary Metric: Closing Line Value (CLV) vs. Devigged Pinnacle Closing Line

CLV against the devigged Pinnacle closing line is the **only official primary metric** for evaluating model edge and long-term viability.

### 1.1 Reference Benchmark Bookmaker (`'pinnacle'` Only)
- **Authoritative Benchmark Slug:** `'pinnacle'` (`REFERENCE_BENCHMARK_BOOKMAKER = 'pinnacle'`).
- **Strict Exclusion of Soft Books:** No other bookmaker — explicitly including `'1xbet'`, `'bet365'`, `'unibet'`, `'williamhill'`, or any other soft/recreational bookmaker — may ever enter any CLV benchmark, devigged market baseline, or league promotion gate computation.
- **Line-Shopping Separation:** Soft bookmakers (such as `1xBet`) are permitted strictly for optional user-facing line-shopping or value-bet display and must be explicitly labeled `"soft book, not a benchmark"` (`SOFT_BOOK_LINE_SHOPPING_LABEL`).

### 1.2 Closing Price Selection Rule (`LAST_ACTIVE_AT_OR_BEFORE_KICKOFF`)
- For each evaluated fixture, market (`AH` or `OU`), outcome, and line, the closing price is defined as the **last Pinnacle odds series entry** satisfying both:
  1. `active === true`
  2. `createdAt <= kickoffUtc`
- Entries with `active === false` are strictly ignored and never used as closing prices.

### 1.3 Line-Movement & Missing-Line Rule (`line_not_in_series`)
- Opening/pick-time entry odds and P&L are kept strictly separate from Pinnacle closing CLV.
- If the Pinnacle odds series for a fixture has no `active === true` pre-kickoff entry on the **exact same line** as the position (for example, if the Asian Handicap line moved from `-0.25` to `-0.50` and `-0.25` is absent from the closing series), then:
  - `clvPct = null`
  - `clvStatusReason = 'line_not_in_series'` (`MISSING_CLOSING_LINE_REASON`)
- Missing lines are **never** interpolated, extrapolated, or imputed from adjacent lines.

### 1.4 Devigging Method & Per-Leg Quarter-Line Decomposition
- **Primary Devig Method (`PROPORTIONAL_TWO_WAY`):** Two-way market margin is removed proportionally at the closing timestamp:
  $$q_{\text{home}} = \frac{1}{O_{\text{home, close}}}, \quad q_{\text{away}} = \frac{1}{O_{\text{away, close}}}, \quad p_{\text{fair, side}} = \frac{q_{\text{side}}}{q_{\text{home}} + q_{\text{away}}}, \quad O_{\text{fair, close}} = \frac{1}{p_{\text{fair, side}}}$$
- **Sensitivity Check Only (`SHIN_SENSITIVITY_ONLY`):** Shin devigging is permitted strictly as a secondary diagnostic sensitivity check and never replaces `PROPORTIONAL_TWO_WAY` for official gate decisions.
- **Per-Leg Quarter-Line Decomposition:**
  - Half-lines (`.5`) and whole lines (`.0`) are evaluated as a single leg (`stakeWeight = 1.0`).
  - Quarter-lines (`.25`, `.75`) are decomposed into two half-stake legs (`[line - 0.25, line + 0.25]`, `stakeWeight = 0.5` each), matching the binary no-push Brier engine in [`brierScoring.ts`](../../src/engine/performance/brierScoring.ts).
  - Push legs (`actualMargin == 0`) are excluded.
  - Per-leg CLV percentage is computed as:
    $$\text{CLV}\% = \left(\frac{O_{\text{taken}}}{O_{\text{fair, close}}} - 1\right) \times 100$$

### 1.5 Minimum Sample Size & Display Gate (`n >= 100`)
- **Minimum Resolved CLV Positions:** `CLV_HEADLINE_MIN_POSITIONS = 100`.
- Below $n = 100$ resolved CLV positions, no headline CLV figure may be displayed as a validated edge; the UI and API must report `"Insufficient sample (n/100)"` and `null` for the headline value.
- When closing line snapshots are not yet available (`n = 0`), the gate status must be `'NOT_COMPUTABLE_YET'` with `null` metric values (never `0` or `0.0%`).

---

## 2. Secondary Metrics: Brier Score & Log-Loss vs. Devigged Pinnacle Closing Baseline

### 2.1 Paired Market-Baseline Pass Criterion
- Model probability calibration is evaluated on resolved binary legs (push legs excluded, quarter-lines decomposed into two `0.5`-stake legs) against the **devigged Pinnacle closing probability on the exact same legs**.
- **Pass Criterion:** The upper bound of the 95% bootstrap confidence interval of the paired Brier differential must be strictly negative:
  $$\text{CI}_{95,\text{upper}}\left(\text{Brier}_{\text{model}} - \text{Brier}_{\text{market}}\right) < 0 \quad (\text{BRIER\_DIFF\_VS\_MARKET\_CI95\_UPPER\_MAX} = 0)$$
- **Coin-Flip Sanity Floor Only (`0.25`):** The uniform coin-flip Brier score (`BRIER_COIN_FLIP_SANITY_FLOOR = 0.25`) is retained **solely as a diagnostic sanity floor**, never as a pass or promotion criterion.
- **Minimum Resolved Legs:** `BRIER_VS_MARKET_MIN_LEGS = 300` resolved binary legs with paired Pinnacle closing baseline probabilities.
- **Missing Baseline Handling:** Any leg lacking a valid pre-kickoff Pinnacle closing price on the same line receives `marketBaselineBrier = null` and is excluded from the paired comparison (never imputed). When $n = 0$ paired legs exist, status is `'NOT_COMPUTABLE_YET'` with `null` values.

---

## 3. Headline Public-Pick Cohort Unlock Gate (`n >= 100`)

- **Minimum Settled Positions for Headline Cohort Unlock:** `HEADLINE_COHORT_MIN_SETTLED_POSITIONS = 100` verified pre-kickoff settled positions in `QUALIFIED_PUBLIC_PICKS` (`is_pick === true && verdict === 'LAYAK'`), replacing the legacy `30`-position threshold.
- Until `headlineGreenCohort.settled >= 100`, `headlineGreenCohort` remains in `'INSUFFICIENT SAMPLE'` (`Insufficient sample (n/100)`) and public pages must not display headline ROI, yield, or win-rate marketing claims.

---

## 4. League Promotion (`SHADOW -> ACTIVE`) & Demotion (`ACTIVE -> PAUSED`) Rules

### 4.1 `SHADOW -> ACTIVE` Promotion Requirements (Per League & Market)
A league/market in `SHADOW` may be proposed for `ACTIVE` status only when **all four** conditions are simultaneously satisfied over a sealed evaluation window:
1. **Positive CLV Proof:** Mean CLV 95% CI lower bound $> 0$ (`PROMOTION_CLV_CI95_LOWER_MIN = 0`) across $n \ge 100$ resolved positions (`CLV_HEADLINE_MIN_POSITIONS = 100`) against `'pinnacle'` closing lines.
2. **Brier-vs-Market Proof:** Paired $(\text{Brier}_{\text{model}} - \text{Brier}_{\text{market}})$ 95% CI upper bound $< 0$ (`BRIER_DIFF_VS_MARKET_CI95_UPPER_MAX = 0`) across $n \ge 300$ resolved binary legs (`BRIER_VS_MARKET_MIN_LEGS = 300`).
3. **Zero Temporal/Rating Leakage:** `leakage_suspect === 0` (`PROMOTION_MAX_LEAKAGE_SUSPECT_ROWS = 0`) across all evaluated rows in the window.
4. **Frozen Parameter & Artifact Provenance:** Zero parameter retuning or rating updates inside the evaluation window. Both `modelVersion` and the immutable `ratingsSha256` hash (`53466f88ae63f5246f8756f8873f71c472669b0912f09979cfc5e77b82050984` for `multi_league_team_ratings_v1.0.json`) must be frozen prior to window opening and recorded on every row.

### 4.2 `ACTIVE -> PAUSED` Demotion / Circuit-Breaker Trigger
- Any `ACTIVE` league/market whose rolling CLV 95% CI upper bound falls below $0$ (`DEMOTION_CLV_CI95_UPPER_MAX = 0`) at $n \ge 100$ resolved positions (`CLV_HEADLINE_MIN_POSITIONS = 100`) is automatically flagged for demotion to `PAUSED`.

---

## 5. Data-Source & Licensing Constraints

1. **OddsPapi Historical Coverage Boundary (`2026-01`):**
   - OddsPapi `/v4/historical-odds` provides historical timestamped odds series starting only from **January 2026** (`ODDSPAPI_HISTORICAL_START_MONTH = '2026-01'`, approximately 9 months of depth) and enforces a 5-second cooldown per single-fixture request.
   - Multi-season historical backtests prior to `2026-01` cannot be sourced from OddsPapi and must use an explicitly documented external archive (such as `Football-Data.co.uk` Pinnacle closing columns, verified per league and market) with explicit source labeling (`dataSource: 'FOOTBALL_DATA_CO_UK_PINNACLE_CLOSING'` vs `'ODDSPAPI_HISTORICAL_PINNACLE_SERIES'`).
2. **Prohibition on Public Redistribution of Raw Odds Series:**
   - Per OddsPapi Terms of Use, storing data locally for internal modeling and verification is permitted, but **reselling, repackaging, or redistributing raw odds data as a standalone product is strictly prohibited** (`EXPOSE_RAW_BOOKMAKER_ODDS_SERIES_PUBLICLY = false`).
   - SALMO public pages and public API endpoints must **never** expose raw bookmaker odds time-series payloads; only derived statistical metrics (CLV%, devigged fair probabilities, and Brier/log-loss differentials) may be exposed publicly.

---

## 6. Rationale: Hotfix H8 Empirical Finding

During the Hotfix H8 audit ([`docs/releases/h8.md`](../releases/h8.md) and [`docs/INCIDENT_LOG_H8.md`](../INCIDENT_LOG_H8.md)):
- Replacing non-standard fractional quarter-line outcome coding (`HALF_WIN = 0.75`, `PUSH = 0.5`, `HALF_LOSS = 0.25`) with standard binary no-push per-leg scoring (`BINARY_NO_PUSH_PER_LEG`) across all `4,018` chronologically ordered walk-forward evaluation matches (`14` leagues) shifted balanced quarter-line Asian Handicap Brier scores from an artificial `0.2002–0.2178` band to `0.2406–0.2495`.
- Because fractional targets (`0.25`, `0.50`, `0.75`) lie closer to `0.50` than binary outcomes (`{0, 1}`), fractional coding mechanically compressed squared error by $0.1875\text{–}0.2500$ on every push or half-result.
- Once corrected to binary no-push per-leg scoring, **11 of 14 leagues** (`ENG-PL`, `ESP-LALIGA`, `ITA-SERIEA`, `DEU-BUNDESLIGA`, `FRA-LIGUE1`, `NED-ERE`, `POR-PRIMEIRA`, `BEL-PRO`, `ENG-CHAMP`, `JPN-J1`, `KOR-K1`) flipped from `PASS` (`ci95Upper < 0.2500`) to `FAIL` (`ci95Upper >= 0.2500`).
- Furthermore, on near-balanced Asian Handicap lines where true win probabilities cluster near `0.50`, any calibrated model's binary Brier score naturally lies near `0.2500`, making `< 0.2500` both noisy and uninformative compared to a paired test against the devigged Pinnacle closing market baseline. Consequently, `ci95Upper < 0.2500` is retired as a pass criterion and replaced by paired CLV and $(\text{Brier}_{\text{model}} - \text{Brier}_{\text{market}})$ gates.

---

## 7. Gate Amendment Rule

- All thresholds and criteria defined in this document and exported by [`src/engine/performance/gates.ts`](../../src/engine/performance/gates.ts) are **pre-registered**.
- Gates may only be modified via a new, explicitly dated Git commit merged **before** an evaluation window opens.
- Retroactive adjustment of sample minimums, confidence intervals, benchmark bookmakers, or pass criteria on an active or completed evaluation window is strictly forbidden.
