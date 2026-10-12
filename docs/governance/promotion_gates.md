# SALMO.DEV — Pre-Registered Evaluation & Promotion Gates

**Document Status:** Pre-Registered Governance Specification (Phase 2B Close-Out)
**Single Source of Truth in Code:** [`src/engine/performance/gates.ts`](../../src/engine/performance/gates.ts)
**Effective Date:** `2026-10-12`

---

## 1. Primary Metric: Closing Line Value (CLV) vs. Devigged Pinnacle Closing Line

CLV against the devigged Pinnacle closing line is the **only official primary metric** for evaluating model edge and long-term viability.

### 1.1 Reference Benchmark Bookmaker (`'pinnacle'` Only)
- **Authoritative Benchmark Slug:** `'pinnacle'` (`REFERENCE_BENCHMARK_BOOKMAKER = 'pinnacle'`).
- **Strict Exclusion of Soft Books:** No other bookmaker — explicitly including `'1xbet'`, `'bet365'`, `'unibet'`, `'williamhill'`, `'draftkings'`, `'fanduel'`, or any other soft/recreational bookmaker (`EXCLUDED_BENCHMARK_BOOKMAKERS`) — may ever enter any CLV benchmark, devigged market baseline, or league promotion gate computation.
- **Line-Shopping Separation:** Soft bookmakers (such as `1xBet`) are permitted strictly for optional user-facing line-shopping or value-bet display and must be explicitly labeled `"soft book, not a benchmark"` (`SOFT_BOOK_LINE_SHOPPING_LABEL = 'soft book, not a benchmark'`).

### 1.2 Closing Price Selection Rule (`LAST_ACTIVE_AT_OR_BEFORE_KICKOFF`)
- For each evaluated fixture, market (`AH` or `OU`), outcome, and line, the closing price is defined as the **last Pinnacle odds series entry** satisfying all of:
  1. `bookmaker === 'pinnacle'`
  2. `active === true`
  3. `createdAt <= kickoffUtc` (UTC ISO-8601 comparison)
  4. Exact match on `market`, `outcome`, and `line`.
- Entries with `active === false` or `createdAt > kickoffUtc` are strictly ignored and never used as closing prices.
- For historical backtests prior to `2026-01`, verified `Football-Data.co.uk` Pinnacle closing columns (`AHCh`, `PCAHH`, `PCAHA`, `PC>2.5`, `PC<2.5`) count as Pinnacle closing when explicitly labeled by source (`FOOTBALL_DATA_PINNACLE_CLOSING_SOURCE_ID = 'FOOTBALL_DATA_CO_UK_PINNACLE_CLOSING'`).

### 1.3 Line-Movement & Missing-Line Rule (`line_not_in_series`)
- Opening/pick-time entry odds and P&L are kept strictly separate from Pinnacle closing CLV.
- If the Pinnacle odds series for a fixture has no `active === true` pre-kickoff entry on the **exact same line** as the position (for example, if the Asian Handicap line moved from `-0.25` to `-0.50` and `-0.25` is absent from the closing series), then:
  - `clvPct = null`
  - `clvStatusReason = 'line_not_in_series'` (`MISSING_CLOSING_LINE_REASON = 'line_not_in_series'`)
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
- Below $n = 100$ resolved CLV positions, no headline CLV figure may be displayed as a validated edge; the UI and API must report `"Insufficient sample (n/100)"` (`formatInsufficientSampleLabel(n, 100)`) and `null` for the headline value.
- When closing line snapshots are not yet available (`n = 0`), the gate status must be `'NOT_COMPUTABLE_YET'` with `null` metric values (never `0` or `0.0%`).

---

## 2. Eligibility & Promotion vs. Devigged Pinnacle Closing on Identical Legs

### 2.1 Paired Identical-Leg Market Benchmark (`Brier` & `Log-Loss`)
- Eligibility and promotion are defined **exclusively** relative to the devigged Pinnacle closing market on **identical binary legs** (same `fixture`, same `market`, same `line`, same `legLine`, and same `selection`, with push legs excluded):
  $$\Delta_{\text{Brier}, i} = (p_{\text{model}, i} - y_i)^2 - (p_{\text{pinnacle, close}, i} - y_i)^2$$
  $$\Delta_{\text{LogLoss}, i} = \text{LogLoss}(p_{\text{model}, i}, y_i) - \text{LogLoss}(p_{\text{pinnacle, close}, i}, y_i)$$
- **Mandatory Pass Criteria:**
  1. **Sample Size:** $n \ge 300$ resolved paired binary legs (`BRIER_VS_MARKET_MIN_LEGS = 300`).
  2. **Paired Brier Differential:** Seeded bootstrap ($10,000$ resamples) 95% confidence interval upper bound strictly negative:
     $$\text{CI}_{95,\text{upper}}\left(\Delta_{\text{Brier}}\right) < 0 \quad (\text{BRIER\_DIFF\_VS\_MARKET\_CI95\_UPPER\_MAX} = 0)$$
  3. **Paired Log-Loss Differential:** Seeded bootstrap ($10,000$ resamples) 95% confidence interval upper bound strictly negative:
     $$\text{CI}_{95,\text{upper}}\left(\Delta_{\text{LogLoss}}\right) < 0 \quad (\text{LOG\_LOSS\_DIFF\_VS\_MARKET\_CI95\_UPPER\_MAX} = 0)$$

### 2.2 Retirement of `< 0.25` as an Eligibility Criterion (`UNTESTED_VS_MARKET`)
- The uniform coin-flip Brier score (`BRIER_COIN_FLIP_SANITY_FLOOR = 0.25`) is retained **solely as a diagnostic sanity floor**, never as an eligibility, shadow-validation, or promotion pass criterion.
- Until a league-market has been evaluated against devigged Pinnacle closing odds on identical legs ($n \ge 300$), [`MultiLeagueAutoActivator`](../../src/engine/activation/multiLeagueAutoActivator.ts) and [`gates.ts`](../../src/engine/performance/gates.ts) must emit `UNTESTED_VS_MARKET` (`SHADOW_VALIDATION_UNTESTED_VS_MARKET = 'UNTESTED_VS_MARKET'`) rather than `ELIGIBLE_FOR_SHADOW_VALIDATION`.

### 2.3 Pre-Registered Multiple-Comparison Correction (`HOLM_STEP_DOWN`)
- Whenever $m \ge 2$ candidate $(\text{league} \times \text{market} \times \text{line})$ hypotheses are tested across the multi-league universe, one-sided bootstrap p-values $p_{(1)} \le p_{(2)} \le \dots \le p_{(m)}$ for $H_0: \mathbb{E}[\Delta_{\text{Brier}}] \ge 0$ must pass the **Holm step-down** familywise error rate control (`MULTIPLE_COMPARISON_CORRECTION_METHOD = 'HOLM_STEP_DOWN'`) at $\alpha = 0.05$ (`HOLM_FAMILYWISE_ALPHA = 0.05`):
  $$p_{(j)} < \frac{\alpha}{m - j + 1} \quad \text{for all } 1 \le j \le j^*$$
  where rejection stops at the first index $j$ violating the inequality.

---

## 3. Headline Public-Pick Cohort Unlock Gate (`n >= 100`)

- **Minimum Settled Positions for Headline Cohort Unlock:** `HEADLINE_COHORT_MIN_SETTLED_POSITIONS = 100` verified pre-kickoff settled positions in `QUALIFIED_PUBLIC_PICKS` (`is_pick === true && verdict === 'LAYAK'`), replacing the legacy `30`-position threshold.
- Until `headlineGreenCohort.settled >= 100`, `headlineGreenCohort` remains in `'INSUFFICIENT SAMPLE'` (`Insufficient sample (n/100)`) and public pages must not display headline ROI, yield, or win-rate marketing claims.

---

## 4. League Promotion (`SHADOW -> ACTIVE`) & Demotion (`ACTIVE -> SHADOW`) Rules

### 4.1 `SHADOW -> ACTIVE` Promotion Requirements (Per League & Market)
A league/market in `SHADOW` may be proposed for `ACTIVE` status only when **all five** conditions are simultaneously satisfied over a sealed evaluation window:
1. **Positive CLV Proof:** Mean CLV 95% CI lower bound $> 0$ (`PROMOTION_CLV_CI95_LOWER_MIN = 0`) across $n \ge 100$ resolved positions (`CLV_HEADLINE_MIN_POSITIONS = 100`) against `'pinnacle'` closing lines.
2. **Paired Brier & Log-Loss vs. Market Proof:** Paired $\Delta_{\text{Brier}}$ 95% CI upper bound $< 0$ (`BRIER_DIFF_VS_MARKET_CI95_UPPER_MAX = 0`) and paired $\Delta_{\text{LogLoss}}$ 95% CI upper bound $< 0$ (`LOG_LOSS_DIFF_VS_MARKET_CI95_UPPER_MAX = 0`) on identical legs across $n \ge 300$ resolved binary legs (`BRIER_VS_MARKET_MIN_LEGS = 300`), surviving Holm step-down correction (`HOLM_FAMILYWISE_ALPHA = 0.05`).
3. **Zero Temporal/Rating Leakage:** `leakage_suspect === 0` (`PROMOTION_MAX_LEAKAGE_SUSPECT_ROWS = 0`) across all evaluated rows in the window.
4. **Frozen Parameter & Artifact Provenance:** Zero parameter retuning or rating updates inside the evaluation window. Both `modelVersion` and the immutable `ratingsSha256` hash (`53466f88ae63f5246f8756f8873f71c472669b0912f09979cfc5e77b82050984` for `multi_league_team_ratings_v1.0.json`) must be frozen prior to window opening and recorded on every row.
5. **Explicit Human Approval (`PROPOSE_ONLY` by Default):** Automated jobs never promote a league; promotion requires explicit human sign-off after auditing the sealed window report.

### 4.2 `ACTIVE -> SHADOW` Demotion / Circuit-Breaker Triggers
An `ACTIVE` league/market is flagged for demotion to `SHADOW` (`DEMOTION_TARGET_STATUS = 'SHADOW'`) whenever either condition holds:
1. **Model Significantly Worse Than Market:** Paired $\Delta_{\text{Brier}} = \text{Brier}_{\text{model}} - \text{Brier}_{\text{pinnacle}}$ 95% CI lower bound $> 0$ (`DEMOTION_PAIRED_BRIER_DIFF_CI95_LOWER_MIN = 0`), OR
2. **Negative Rolling CLV:** Rolling CLV 95% CI upper bound $< 0$ (`DEMOTION_CLV_CI95_UPPER_MAX = 0`) at $n \ge 100$ resolved positions (`CLV_HEADLINE_MIN_POSITIONS = 100`).

---

## 5. Data-Source & Licensing Constraints

1. **OddsPapi Historical Coverage Boundary (`2026-01`):**
   - OddsPapi `/v4/historical-odds` provides historical timestamped odds series starting only from **January 2026** (`ODDSPAPI_HISTORICAL_START_MONTH = '2026-01'`, approximately 9 months of depth) and enforces a 5-second cooldown per single-fixture request (`ODDSPAPI_HISTORICAL_COOLDOWN_SECONDS = 5`).
   - Multi-season historical backtests prior to `2026-01` cannot be sourced from OddsPapi and must use an explicitly documented external archive (such as `Football-Data.co.uk` Pinnacle closing columns, verified per league and market) with explicit source labeling (`FOOTBALL_DATA_CO_UK_PINNACLE_CLOSING` vs `ODDSPAPI_HISTORICAL_PINNACLE_SERIES`).
2. **Prohibition on Public Redistribution of Raw Odds Series:**
   - Per OddsPapi Terms of Use, storing data locally for internal modeling and verification is permitted, but **reselling, repackaging, or redistributing raw odds data as a standalone product is strictly prohibited** (`EXPOSE_RAW_BOOKMAKER_ODDS_SERIES_PUBLICLY = false`).
   - SALMO public pages and public API endpoints must **never** expose raw bookmaker odds time-series payloads; only derived statistical metrics (CLV%, devigged fair probabilities, and Brier/log-loss differentials) may be exposed publicly.
3. **Dribble360 Internal-Only Constraint:**
   - Twelve leagues in the historical ratings artifact were calibrated from `Dribble360` captures stored locally under `research/raw_dribble/`.
   - Raw `Dribble360` captures are strictly internal-only (`EXPOSE_DRIBBLE360_RAW_CAPTURES_PUBLICLY = false`), gitignored (`/research/raw_dribble/`), never committed to Git, and never exposed via public endpoints. Subscription expires `2026-12-01`.

---

## 6. Rationale: Hotfix H8 Flips & Base-Rate Skew Discovery

1. **Hotfix H8 Quarter-Line Flips (`11 / 14` Leagues):**
   - Replacing non-standard fractional quarter-line outcome coding (`HALF_WIN = 0.75`, `PUSH = 0.5`, `HALF_LOSS = 0.25`) with standard binary no-push per-leg scoring (`BINARY_NO_PUSH_PER_LEG`) across all `4,018` chronologically ordered walk-forward evaluation matches (`14` leagues) shifted balanced quarter-line Asian Handicap Brier scores from an artificial `0.2002–0.2178` band to `0.2406–0.2495`, flipping **11 of 14 leagues** from `PASS` (`ci95Upper < 0.2500`) to `FAIL` (`ci95Upper >= 0.2500`).
2. **`DEU-BUNDESLIGA` & `NED-ERE` `OU 2.5` Base-Rate Skew:**
   - In high-scoring leagues (`DEU-BUNDESLIGA` `3.2111` goals/match and `NED-ERE` `3.1945` goals/match), fixed `OU 2.5` Brier (`0.2308 [0.2158, 0.2446]` and `0.2279 [0.2139, 0.2422]`) fell below `0.2500` solely because Over 2.5 occurred in `~61%` of matches (`baseRateBrier = 0.2323` and `0.2259`). When evaluated on balanced `3.0 / 3.25` match-total lines, both failed (`0.2492 [0.2422, 0.2571]` and `0.2491 [0.2412, 0.2566]`).
3. **Multiple-Testing & Market-Relative Requirement:**
   - Testing `~26` $(\text{league} \times \text{market})$ pairs against a fixed `0.2500` threshold without Holm correction guarantees false positives by chance and says nothing about beating market efficiency. On the `80` matched `ENG-PL` evaluation fixtures, the model trailed Pinnacle closing on both `AH` (`0.2202` vs `0.2072`) and `OU 2.5` (`0.2581` vs `0.2412`). Therefore, `< 0.2500` is retired as an eligibility rule and replaced by paired $(\text{Brier}_{\text{model}} - \text{Brier}_{\text{pinnacle}})$ and CLV gates with Holm step-down correction.

---

## 7. Gate Amendment Rule

- All thresholds and criteria defined in this document and exported by [`src/engine/performance/gates.ts`](../../src/engine/performance/gates.ts) are **pre-registered**.
- Gates may only be modified via a new, explicitly dated Git commit merged **before** an evaluation window opens.
- Retroactive adjustment of sample minimums, confidence intervals, benchmark bookmakers, or pass criteria on an active or completed evaluation window is strictly forbidden.
