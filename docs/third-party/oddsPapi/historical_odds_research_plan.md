# SALMO — Offline Historical Odds & Closing-Line Research Plan

- **Status**: **OFFLINE RESEARCH PLAN ONLY** (No production runtime changes, no paid API calls while `request_count >= request_limit`)
- **Primary References**:
  - [`v4_endpoints.md`](./v4_endpoints.md) (`GET /v4/historical-odds`, `GET /v4/scores`, `GET /v4/settlements`)
  - [`v4_account_and_quota.md`](./v4_account_and_quota.md) (`Requests & Quota` rules)
  - [`blog_football_predictions_review.md`](./blog_football_predictions_review.md) (*Football Data API: Grade Your Model on 250 Labelled Fixtures*)

---

## 0. Execution Preconditions & Quota Guard Gate

1. **Zero Calls While Quota Is Exhausted (`260 / 250`)**:
   - Per [`v4_account_and_quota.md`](./v4_account_and_quota.md), although `/v4/historical-odds` and `/v4/scores` are listed as free (`0` billable quota), the provider rejects all endpoints except `/v4/account` with `HTTP 429` (`REQUEST_LIMIT_EXCEEDED`) whenever `request_count >= request_limit`.
   - Any offline historical collection script must first invoke `OddsPapiQuotaGuard.detectQuotaReset()` and abort immediately unless `state === 'QUOTA_AVAILABLE'` and `request_count < operationalCeiling`.
2. **Single-Worker Sequential Throttling & ETag Caching**:
   - Never run concurrent workers against `/v4/historical-odds` or `/v4/scores`.
   - Enforce a strict `>= 5200ms` sequential sleep between `/v4/historical-odds` requests (official cooldown: `5000ms`) and `>= 600ms` between `/v4/scores` requests (official cooldown: `500ms`).
   - Persist raw responses and HTTP `ETag` headers to local disk (`data/research/oddspapi_historical_cache/`) and send `If-None-Match` on repeat inspections.

---

## 1. Historical Odds Coverage Audit by League, Season, Market & Bookmaker

### 1.1 Scope & Priority Order
- **Bookmaker Priority**:
  1. `pinnacle` (Primary sharp closing-line benchmark; required for CLV and de-vigged baseline).
  2. `bet365` / `sbobet` / `1xbet` (Secondary comparison only after `pinnacle` coverage is verified).
- **League Coverage Matrix**:
  - Audit all 15 canonical leagues in [`src/config/multiLeagueRegistry.ts`](../../../src/config/multiLeagueRegistry.ts), starting with the 8 Priority Tier-A European leagues (`ENG-PL: 17`, `ESP-LALIGA: 8`, `GER-BUND: 35`, `FRA-LIGUE1: 34`, `NED-ERED: 37`, `POR-LIGA: 238`, `ITA-SERIEA: 23`, `BEL-PRO: 38`), followed by Tier-B/Regional leagues (`ENG-CHAMP: 18`, `BRA-SERIEA: 325`, `ARG-LPF: 155`, `JPN-J1: 196`, `KOR-K1: 410`, `IDN-LIGA1: 1015`, `KSA-PRO: 955`).
- **Temporal Depth Audit**:
  - Verify actual earliest available fixture date per league (the OddsPapi blog FAQ claims January 2026 retention on Premier League, with `HTTP 404` on older fixtures).
- **Market Coverage Audit**:
  - Catalog exact OddsPapi `marketId` and `bookmakerMarketId` mappings in `/v4/historical-odds` for:
    - **Asian Handicap (`AH`)** — primary SALMO production market (including quarter lines `±0.25`, `±0.75` and half/whole lines).
    - **Over/Under (`OU`)** — primary SALMO production market (including `2.0`, `2.25`, `2.5`, `2.75`, `3.0`).
    - **1X2 (`marketId = "101"`)** — diagnostic reference only.
    - **BTTS** — `RESEARCH_ONLY` diagnostic evaluation (`production_enabled_markets` excludes BTTS across all leagues).

---

## 2. Fixture-ID & Timestamp Reconciliation

1. **Deterministic Cross-Source Matching**:
   - Canonical openfootball / historical CSV fixtures do not carry OddsPapi `fixtureId` (`id10...`).
   - Reconciliation must join on:
     - `oddspapi_tournament_id === fixture.tournamentId`
     - Normalized canonical team names (`normalizeTeamName(participant1Name) === normalizeTeamName(homeTeam)` and `normalizeTeamName(participant2Name) === normalizeTeamName(awayTeam)`)
     - Kickoff timestamp proximity (`|Date.parse(oddspapi.startTime) - Date.parse(canonical.kickoffUtc)| <= 36 hours`, tightened to exact UTC timestamp once matched).
2. **UTC Date-Window Boundary Handling**:
   - When querying `/v4/fixtures` for historical fixture IDs, always pass full ISO-8601 UTC timestamps (`YYYY-MM-DDTHH:mm:ssZ`) or add `+1 day` to bare `YYYY-MM-DD` `to` dates so evening fixtures on the final day are never truncated by midnight-UTC parsing.
3. **Unmatched Fixture Disposition**:
   - Any canonical fixture without a unique, deterministic `fixtureId` match is flagged `UNMATCHED_PROVIDER_FIXTURE` and never coerced or fuzzy-matched across different matchweeks.

---

## 3. Strict Look-Ahead Bias & In-Play Contamination Prevention

Per [`blog_football_predictions_review.md`](./blog_football_predictions_review.md) and [`src/engine/archive/temporalIntegrityGuard.ts`](../../../src/engine/archive/temporalIntegrityGuard.ts):

1. **Mandatory Pre-Kickoff Tick Filter**:
   - `/v4/historical-odds` appends in-play ticks after `startTime` and retains suspended ticks with `active: false`.
   - Every snapshot $s \in \text{players}["0"]$ must satisfy:
     $$\text{Date.parse}(s.\text{createdAt}) < \text{Date.parse}(\text{fixture.startTime}) \quad \land \quad s.\text{active} === \text{true}$$
2. **Opening vs. Closing Snapshot Extraction**:
   - **Opening Pre-Match Snapshot**: Earliest tick satisfying `active === true` and `createdAt < startTime` across all legs of the market line.
   - **Closing Pre-Match Snapshot**: Latest tick satisfying `active === true` and `createdAt < startTime` across all legs of the market line, paired with:
     - `closingLagSeconds = (Date.parse(fixture.startTime) - Date.parse(s.createdAt)) / 1000`
     - `closingLimit = s.limit` (to detect illiquid/stale lines where `limit < 500` or `closingLagSeconds > 3600`).
3. **SALMO Prediction Temporal Gate**:
   - When grading SALMO predictions, `evaluateRowTemporalIntegrity()` in [`temporalIntegrityGuard.ts`](../../../src/engine/archive/temporalIntegrityGuard.ts) must classify the prediction row as `VALID_PRE_MATCH` (`predictionTimestamp < kickoffUtc` with verified provenance). Rows marked `RETROSPECTIVE_EXCLUDED` or `UNVERIFIED_TIMESTAMP_PROVENANCE` are never included in Brier, log-loss, CLV, or ROI denominators.

---

## 4. Asian Handicap & Over/Under Line-Matching and Quarter-Line Evaluation

1. **Why 1X2 Brier (`0.5778`) Is Not Transferable to SALMO AH/OU**:
   - The OddsPapi article's `0.5778` benchmark is a **3-outcome summed Brier score** ($\sum_{k=1}^3 (p_k - y_k)^2 \in [0, 2]$) on 1X2.
   - SALMO's production markets are **2-way Asian Handicap (`AH`) and Over/Under (`OU`)**, evaluated as binary/split-leg predictions in [`src/engine/performance/brierScoring.ts`](../../../src/engine/performance/brierScoring.ts) ($\text{range } [0, 1]$, coin-flip baseline `0.2500`).
2. **Exact Line Matching (`line_taken === pinnacle_closing_line`)**:
   - Closing-line comparisons must match the **exact handicap or total line** (e.g., `AH -0.25` vs. Pinnacle closing `AH -0.25`, `OU 2.75` vs. Pinnacle closing `OU 2.75`).
   - If the main line moved between prediction time and close (e.g., `-0.25` to `-0.50`), the extractor must look up the historical alternate line matching `line_taken` (`-0.25`) at close; if that line was no longer active at close, record `CLOSING_EXACT_LINE_UNAVAILABLE` rather than comparing mismatched lines.
3. **Quarter-Line (`±0.25`, `±0.75`, `2.25`, `2.75`) Half-Stake Decomposition**:
   - In accordance with [`brierScoring.ts`](../../../src/engine/performance/brierScoring.ts) and [`settlementEngine.ts`](../../../src/engine/settlement/settlementEngine.ts):
     - Quarter lines decompose into two equal half-stakes on the adjacent half/whole lines $(L - 0.25, L + 0.25)$.
     - Whole-line pushes (`WIN` / `PUSH` / `LOSS` resulting in half-win `y = 0.75`, push `y = 0.50`, or half-loss `y = 0.25`) must use the exact SALMO quarter-line Brier and settlement formulas for both the model and the Pinnacle closing baseline.

---

## 5. Proper Scoring Rules & De-Vigged Pinnacle Baseline

For every league $L$ and market $M \in \{\text{AH}, \text{OU}\}$ with $n$ valid pre-match settled fixtures:

1. **2-Way De-Vigged Pinnacle Closing Probabilities**:
   - Given closing decimal prices $(O_1, O_2)$ on the matched 2-way line:
     - **Proportional (Multiplicative) De-Vig**:
       $$q_i^{\text{prop}} = \frac{1 / O_i}{1 / O_1 + 1 / O_2}$$
     - **Power De-Vig**: Solve $O_1^{-k} + O_2^{-k} = 1$ for $k > 0$, setting $q_i^{\text{pow}} = O_i^{-k}$.
2. **Paired Proper Scoring Metrics**:
   - **2-Way Brier Score**: $\text{Brier}_{\text{model}}$ vs. $\text{Brier}_{\text{PinnacleClose}}$ and $\Delta\text{Brier} = \text{Brier}_{\text{model}} - \text{Brier}_{\text{PinnacleClose}}$, with 95% paired bootstrap confidence intervals.
   - **Binary / Split-Leg Log-Loss**: Clipped at $\epsilon = 10^{-6}$ on identical settled fixtures.
   - **Calibration Curve / ECE**: 5-bin and 10-bin reliability tables comparing predicted probability deciles against realized empirical win rates.

---

## 6. CLV, Settlement Accuracy & ROI Evaluation

1. **Regulation-Time Score Verification**:
   - Grade 90-minute `AH` and `OU` markets strictly against regulation full-time goals (`scores.periods.fulltime.home` and `scores.periods.fulltime.away`), cross-checked against canonical openfootball/football-data FT scores.
2. **Closing Line Value (CLV)**:
   - Compute price-space and probability-space CLV against Pinnacle's last active pre-kickoff snapshot (`createdAt < startTime && active === true`):
     $$\text{CLV}_{\text{prob}} = p_{\text{close}}^{\text{devig}} - p_{\text{taken}}^{\text{devig}}, \qquad \text{CLV}_{\text{odds}} = \frac{O_{\text{taken}}}{O_{\text{close}}^{\text{fair}}} - 1$$
3. **Sample-Size & Promotion Gates**:
   - Per [`src/config/multiLeagueRegistry.ts`](../../../src/config/multiLeagueRegistry.ts), promotion from `SHADOW` to `ACTIVE` requires:
     - `min_sample_size >= 100` valid pre-match settled predictions (`VALID_PRE_MATCH`) in the league.
     - Verified Brier calibration (`brier_max_threshold <= 0.25` and competitive $\Delta\text{Brier}$ vs. de-vigged Pinnacle close).
     - Positive CLV (`clv_required: true`) and complete draw/push/quarter-line audit (`draw_push_audit_required: true`).

---

## 7. Governance Rule: Evidence-Gated Promotion Only

- **No Promotion by Documentation or Blog Benchmark**:
  - All 15 canonical leagues remain in `SHADOW` (`8` leagues, including `ENG-PL` with `12 / 100` valid pre-match settled matches) or `PAUSED` (`7` leagues).
  - `BTTS` remains `RESEARCH_ONLY` across all 15 leagues.
  - No league or market may be promoted to `ACTIVE` until its own valid pre-match sample meets all quantitative promotion gates in [`data/verification/shadow_to_production_promotion_manifest.json`](../../../data/verification/shadow_to_production_promotion_manifest.json).
