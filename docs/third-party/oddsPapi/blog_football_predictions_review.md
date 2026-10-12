# OddsPapi Official Blog Review — *Football Data API: Grade Your Model on 250 Labelled Fixtures*

- **Source URL**: `https://oddspapi.io/blog/football-data-api-betting-predictions/`
- **Retrieval Status**: **RETRIEVED & VERIFIED** (`HTTP 200`, public article HTML/Markdown)
- **Article Title**: *Football Data API: Grade Your Model on 250 Labelled Fixtures*
- **Published Timestamp**: `2026-10-01T10:00:00+00:00` (Modified: `2026-10-01T18:55:29+00:00`)
- **Retrieved Timestamp**: `2026-10-13T02:51:06+07:00`
- **Paid API Calls Executed**: `0`

---

## 1. Separation of Evidence Categories

To prevent conflating blog benchmark numbers with official API specifications or SALMO's internal model gates, this review strictly separates findings into four categories:

1. **Article Claims**: Empirical measurements, sample sizes, and 1X2 Brier/log-loss benchmarks reported by the OddsPapi blog author on a 250-fixture European football sample.
2. **Official API Contract Facts**: Endpoint parameters, response schema structures, rate-limit behavior, and billing rules corroborated against [`v4_endpoints.md`](./v4_endpoints.md) and [`v4_account_and_quota.md`](./v4_account_and_quota.md).
3. **Findings Independently Verified in SALMO**: Behaviors, tournament IDs, and scoring/temporal rules verified directly in SALMO's codebase and canonical artifacts.
4. **Recommendations Requiring Testing**: Candidate offline workflows and design improvements that require offline validation and must **not** be enabled in production without passing SALMO's promotion gates.

---

## 2. Article Claims (Reported by OddsPapi Blog, Not Assumed for SALMO)

### 2.1 Sample & Coverage Claims
- **Window**: `2026-08-01` through `2026-09-21` (`from="2026-08-01"`, `to="2026-09-22"` UTC) across the top 5 European domestic leagues (`sportId = 10`):
  - Premier League (`tournamentId = 17`): `50` finished fixtures
  - LaLiga (`tournamentId = 8`): `69` finished fixtures
  - Serie A (`tournamentId = 23`): `50` finished fixtures
  - Bundesliga (`tournamentId = 35`): `36` finished fixtures
  - Ligue 1 (`tournamentId = 34`): `45` finished fixtures
  - **Total**: `250` finished fixtures (`statusId = 2`).
- **Response Completeness Reported**:
  - `/v4/scores`: `250 / 250` fixtures (`100%`) returned final scores (`home`: `109` / `43.6%`, `draw`: `66` / `26.4%`, `away`: `75` / `30.0%`).
  - `/v4/historical-odds` (`bookmakers="pinnacle"`, market `101` = 1X2): `249 / 250` fixtures (`99.6%`) returned complete 3-way Pinnacle closing prices; `1` fixture returned `HTTP 404` (`NO_PINNACLE`).
- **Pinnacle Closing Line Microstructure Claims**:
  - **Closing Overround (1X2)**: Median `2.89%` (mean `2.88%`, min `2.26%`, max `5.14%`), clustering near `~2.45%` on Premier League/LaLiga/Serie A and `~3.2%` on Bundesliga/Ligue 1.
  - **Closing Stake Limit**: Median `10,000` (10th percentile `2,000`, 90th percentile `20,000`; range `385` to `50,000`), growing from `500–1,000` at opening (`5–10 days` pre-kickoff) to `10,000–50,000` inside the final hour.
  - **Closing Snapshot Freshness**: Median time between last active pre-kickoff snapshot and `startTime` was `32 seconds` (10th percentile `7s`, 90th percentile `195s`).
  - **Tick Density**: ~`350–400` price snapshots per outcome per match (~`1,100` ticks across the three 1X2 legs over a 10-day window).
- ** Historical Depth Claim (FAQ)**:
  - The article FAQ states that `/v4/historical-odds` on the free tier goes back to **January 2026** (~8 months of Premier League coverage at publication time), and earlier fixtures return `HTTP 404`.

### 2.2 Benchmark Scoring Claims (3-Way 1X2 Multi-Class Brier & Log-Loss)
The article evaluates four baselines on the `249` fixtures with complete Pinnacle 1X2 prices using **3-leg multi-class summed Brier score**:

$$\text{Brier}_{1\text{X}2} = \sum_{k \in \{\text{H}, \text{D}, \text{A}\}} (p_k - y_k)^2$$

| Baseline (Article Table) | $N$ | 3-Way Brier ($\sum_{k=1}^3 (p_k - y_k)^2$) | Multi-Class Log-Loss | Favourite Accuracy |
|--------------------------|-----|--------------------------------------------|----------------------|--------------------|
| League base rate (`0.438 / 0.265 / 0.297`) | `249` | `0.6486` | `1.0717` | `43.8%` |
| Pinnacle opening (proportional de-vig) | `249` | `0.5875` | `0.9867` | `51.8%` |
| Pinnacle closing (proportional de-vig) | `249` | `0.5778` | `0.9710` | `52.2%` |
| Pinnacle closing (power de-vig) | `249` | `0.5776` | `0.9701` | `52.2%` |

> [!IMPORTANT]
> **Non-Transferability of `0.5778` to SALMO Production Gates**:
> The article's `0.5778` Brier score is the **sum of squared errors across all three 1X2 outcomes** ($\text{range } [0, 2]$, where a uniform $1/3$ forecast yields $0.6667$ and sample base-rate yields $0.6486$).
> By contrast, SALMO's production markets (`AH` and `OU`) are **2-way binary markets** evaluated per leg in [`brierScoring.ts`](../../../src/engine/performance/brierScoring.ts) ($\text{Brier}_{\text{binary}} = (p - y)^2$, range $[0, 1]$, where a $50/50$ coin-flip baseline is `0.2500`).
> Therefore, the article's `0.5778` 3-way 1X2 Brier figure must **never** be copied into SALMO's `AH`/`OU` Brier thresholds (`< 0.25` coin-flip baseline).

---

## 3. Official API Contract Facts Highlighted by the Article

Cross-checking the article's code and payload snippets against the retrieved v4 endpoint documentation ([`v4_endpoints.md`](./v4_endpoints.md)) confirms five critical technical contract details:

1. **`/v4/fixtures` Date-Boundary & Filter Semantics**:
   - Calling `/v4/fixtures` with `sportId=10&tournamentId=<id>&from=<YYYY-MM-DD>&to=<YYYY-MM-DD>` uses a single `tournamentId` per request (`2000ms` official cooldown) and allows multi-week windows because `tournamentId` is present (the `< 10 days` cap applies only when `sportId` is passed *without* `tournamentId`).
   - Date strings without a time component (`to="2026-09-21"`) are parsed as `00:00:00Z` midnight UTC at the **start** of that date, excluding evening kickoffs on `2026-09-21` unless `to` is set to the next day (`"2026-09-22"`) or a full ISO-8601 timestamp (`2026-09-21T23:59:59Z`).
2. **`/v4/historical-odds` vs. Live `/v4/odds-by-tournaments` Structural Difference**:
   - **Live `/v4/odds` and `/v4/odds-by-tournaments`**: Top-level bookmaker container is `bookmakerOdds[bookmaker].markets[marketId].outcomes[outcomeId].players["0"]`, where `players["0"]` is a **single current object** (`{ price, active, mainLine, ... }`).
   - **`/v4/historical-odds`**: Top-level bookmaker container is `bookmakers[bookmaker].markets[marketId].outcomes[outcomeId].players["0"]`, where `players["0"]` is a **chronological array of snapshot objects** (`[{ createdAt, price, limit, active, exchangeMeta }, ...]`).
   - Any future parser for `/v4/historical-odds` must handle `bookmakers` (not `bookmakerOdds`) and iterate over `players["0"]` as an array.
3. **In-Play & Suspended-Line Contamination in `/v4/historical-odds`**:
   - `/v4/historical-odds` continues appending price ticks **after kick-off** (in-play prices) and retains suspended/withdrawn ticks with `"active": false`.
   - Taking the last element of `players["0"]` (`entries[-1]`) without filtering leaks in-play or suspended prices into pre-match closing-line evaluation.
   - Strict pre-kickoff filtering (`entry.createdAt < fixture.startTime && entry.active === true`) is mandatory.
4. **`/v4/scores` Regulation vs. Settled Result Semantics**:
   - `scores.periods.fulltime` holds the **90-minute regulation score** (`{ home, away }`).
   - `scores.periods.result` holds the **final settled score** (which includes extra time or penalties in cup competitions).
   - Standard 90-minute football markets (`AH`, `OU`, `1X2`) must be graded against `scores.periods.fulltime` (with `scores.periods.result` cross-checked in domestic league play where extra time does not apply).
5. **Rate-Limit (`429`) & Cooldown Behavior**:
   - The article demonstrates that polling faster than the endpoint cooldown returns `HTTP 429` with `{"error": {"code": "RATE_LIMITED", "retryMs": ...}}` and that running concurrent workers across the same API key triggers rate-limiting.
   - Per [`v4_account_and_quota.md`](./v4_account_and_quota.md), `/v4/historical-odds` (`5000ms` official cooldown) and `/v4/scores` (`500ms` official cooldown) are listed as free endpoints, **except** when `request_count >= request_limit` (`260/250`), at which point `/us/docs/requests-and-quota` states that even free endpoints (other than `/v4/account`) are blocked with `HTTP 429`.

---

## 4. Findings Independently Verified in SALMO

| Area | SALMO Implementation / Artifact | Verification Status |
|------|---------------------------------|---------------------|
| Tournament IDs (`17`, `8`, `23`, `35`, `34`) | [`src/config/multiLeagueRegistry.ts`](../../../src/config/multiLeagueRegistry.ts) maps `ENG-PL -> 17`, `ESP-LALIGA -> 8`, `ITA-SERIEA -> 23`, `GER-BUND -> 35`, `FRA-LIGUE1 -> 34` | **VERIFIED** (Exact match with article's `TOURNAMENTS` dictionary) |
| Strict Pre-Match Temporal Gate (`predictionTimestamp < kickoffUtc`) | [`src/engine/archive/temporalIntegrityGuard.ts`](../../../src/engine/archive/temporalIntegrityGuard.ts) excludes any row where `predictionTimestamp >= kickoffUtc` or provenance is unverified | **VERIFIED** (Consistent with article's `createdAt < startTime` closing-line rule) |
| Quarter-Line AH & OU Brier & Settlement | [`src/engine/performance/brierScoring.ts`](../../../src/engine/performance/brierScoring.ts) and [`src/engine/settlement/settlementEngine.ts`](../../../src/engine/settlement/settlementEngine.ts) split `±0.25` / `±0.75` and `2.25` / `2.75` into two half-stakes | **VERIFIED** (Superior to article's 1X2-only scope for SALMO's AH/OU markets) |
| Current Quota State (`260/250`) | [`data/verification/oddspapi_account_response.json`](../../../data/verification/oddspapi_account_response.json) shows `request_count: 260`, `request_limit: 250` | **VERIFIED** (Blocks all live `/v4/historical-odds` or `/v4/scores` calls until quota resets) |

---

## 5. Recommendations Requiring Offline Testing (See Research Plan)

1. **Do NOT enable `/v4/historical-odds` or `/v4/scores` in production runtime**: Keep all historical closing-line and score-grading workflows strictly offline in research scripts, gated by `OddsPapiQuotaGuard.detectQuotaReset()` and single-worker sequential throttling (`>= 5000ms` for `/v4/historical-odds`, `>= 500ms` for `/v4/scores`).
2. **Enforce strict closing-line extraction filters**: Any future `/v4/historical-odds` extractor must filter `active === true` and `Date.parse(createdAt) < Date.parse(fixtureStartTime)` and record `closingSnapshotLagSeconds` and `closingLimit` as data-quality diagnostics.
3. **Evaluate both proportional and power de-vigging offline**: Compare proportional vs. Shin/power de-vigging on 2-way Pinnacle AH/OU lines (where overround is smaller than 3-way 1X2) before altering any production probability calibration.
4. **Maintain strict separation between 1X2 and AH/OU scoring**: Benchmark SALMO's AH and OU predictions against de-vigged Pinnacle 2-way closing lines on matched half/quarter lines (`brierScoring.ts`), never against 3-way 1X2 Brier numbers.
