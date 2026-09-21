# HANDICAPLAB → SALMO CANONICAL ARCHITECTURE MAP (V1)
**Document Version:** 1.0.0  
**Date:** September 21, 2026  
**Auditor:** Quantitative Systems Architect & Research Lead  
**Scope:** Forensic End-to-End Architectural Reconstruction of HandicapLab (Data/Research/Infra) and SALMO (Decision/Product)

---

## 1. ARCHITECTURAL PRINCIPLE & BOUNDARY HYGIENE

The architecture is governed by a strict two-layer invariant:

```text
                           HANDICAPLAB.DEV
                   DATA / RESEARCH / INFRASTRUCTURE
                                  │
                                  │ Canonical Predictions ($P_{\text{model}}$, Fair Odds)
                                  │ Reference Sharp Odds (Pinnacle devigged)
                                  │ Deterministic Provenance (SHA-256)
                                  │ Historical Validation & Research Gates
                                  ▼
                             SALMO.DEV
                      DECISION / PRODUCT LAYER
                                  │
                                  │ Consumer Decision Flow (LAYAK / PANTAU / LEWATI)
                                  │ UI Presentation & Evidence Drawer
                                  │ Bankroll & Value Guidance
                                  ▼
                         END-USER EXPERIENCE
```

### Non-Negotiable Invariants:
1. **Zero Prediction Engine Duplication:** SALMO does NOT implement an independent prediction engine, Dixon-Coles solver, team rating solver, or empirical fallback calculator.
2. **Zero Secondary Data Pipeline:** SALMO does NOT query raw data providers directly in production. All data flows through HandicapLab's canonical pipeline.
3. **Fail-Closed Semantics:** When upstream HandicapLab data is missing, offline, or rate-limited, SALMO surfaces `DATA_UNAVAILABLE` or empty state (`[]`). It NEVER synthesizes fixtures, fabricates bookmaker odds, or invents confidence scores.
4. **Market Discipline:** Strictly three core football markets are supported:
   - **Asian Handicap (AH):** Quarter-line split settlement ($0, \pm0.25, \pm0.5, \pm0.75, \dots$).
   - **Over/Under 2.5 Goals (OU):** Goal expectation derived from bivariate Poisson distribution.
   - **Both Teams To Score (BTTS):** Binary score probability derived from score grid $\sum_{x \ge 1, y \ge 1} P(x, y)$.
   - **Moneyline / 1X2 is permanently out of product scope for SALMO.**

---

## 2. REPOSITORY TRUTH & IMPLEMENTATION STATUS CLASSIFICATION

To eliminate ambiguity between specification, code presence, and live operation, every architectural component is classified into one of six forensic states:

| Status | Definition |
| :--- | :--- |
| **IMPLEMENTED** | Code exists in repository, compiles, and passes syntax/type checking. |
| **TESTED** | Unit or integration test suites exercise the component with pass assertions. |
| **DEPLOYED** | Code is committed, packaged, or deployed to cloud runtime (e.g. Vercel/Supabase). |
| **CONNECTED** | Active live network/database connection established between layers. |
| **DATA-BACKED** | Operates on genuine, verifiable empirical football/odds data (zero synthetic/mock). |
| **PRODUCTION-VERIFIED** | Live operational pipeline verified end-to-end with real-world traffic and audit logging. |

---

## 3. DETAILED END-TO-END FLOW ARCHITECTURE

```text
[Data Providers]
  ├── API-Football Pro (v3) ────┐
  ├── OddsPapi (v4) ────────────┼──> [Provider Gateway + QuotaManagerV4]
  ├── Football-Data.co.uk ──────┤          │ (Soft/Hard Limit Checks, Atomic Reservations)
  └── FootyStats ───────────────┘          ▼
                                     [Bronze Storage]
                               (Raw JSON/CSV, SHA-256 Checksum)
                                           │
                                           ▼
                                [Canonical Match Registry]
                            (Deterministic Match UUID, Entity Resolver)
                                           │
                                           ▼
                                     [Silver Storage]
                         (Parquet / Structured Schema, Deduped)
                                           │
                                           ▼
                       ┌───────────────────┴───────────────────┐
                       ▼                                       ▼
             [Gold Analytics Layer]                 [Research Infrastructure]
          (Consensus Devigging, xG)               (Replay Lab, CPCV, Walk-Forward)
                       │                                       │
                       ▼                                       ▼
           [Prediction Pipeline]                     [Research Calibration]
        (Dixon-Coles Low-Score Poisson)           (Brier Score, Reliability Curves)
                       │                                       │
                       └───────────────────┬───────────────────┘
                                           │
                                           ▼
                        [Supabase Production PostgreSQL Store]
                           ├── daily_picks (30 rows live)
                           ├── prediction_ledger_v3 (151 verified records)
                           ├── matches & market_snapshots
                           └── quota_state & quota_reservations
                                           │
                                           ▼ (Server-side Database Adapter)
                             [SALMO.DEV Engine Boundary]
                           (DatabaseHandicapLabAdapter)
                                           │
                                           ├──> MatchIntelligenceService
                                           ├──> DecisionPolicy (4-Tier Gate)
                                           └──> QuarterLineSettler
                                           │
                                           ▼
                                [SALMO Public Product]
                       (/, /matches, /daily-picks, /asian-handicap,
                        /over-under, /btts, /match/[id], /pricing)
```

---

## 4. SUBSYSTEM AUDIT & LIFECYCLE BREAKDOWN

### 4.1 Data Ingestion Layer

* **Components:**
  - `src/lib/providers/providerGateway.ts` (HandicapLab)
  - `src/lib/providers/quotaManagerV4.ts` (HandicapLab)
  - `src/lib/providers/quotaPolicy.ts` (HandicapLab)
  - `src/lib/warehouse/ingestion/apiFootballProvider.ts` (HandicapLab)
  - `src/lib/providers/sharpOdds.ts` / `sharpReferenceProvider.ts` (HandicapLab)
* **Status:** `IMPLEMENTED`, `TESTED`, `DATA-BACKED` (API-Football, OddsPapi).
* **Forensic Reality:**
  - **API-Football:** Configured for PRO tier ($19/mo, 7,500 calls/day hard ceiling, 6,000 soft limit). Quota tracked atomically in Supabase `quota_state`.
  - **OddsPapi:** Connected to `/v4/` with free tier (250 calls/month metered budget). Metered odds queries restricted to 4 sharp books (Pinnacle, Singbet, SBOBet, Betfair Exchange). Historical odds endpoint (`/v4/historical-odds`) is unmetered.
  - **Fallback Logic:** Strict fail-closed. If quota is exhausted or rate limit is encountered, returns HTTP 429/503 (`QuotaExhaustionError`, `ProviderUnavailableError`). Zero fallback to synthetic odds.

### 4.2 Canonical Data & Match Registry

* **Components:**
  - `src/lib/warehouse/metadata/entityResolver.ts` (HandicapLab)
  - `src/lib/warehouse/ingestion/canonical.ts` (HandicapLab)
  - `src/lib/warehouse/storage/deduplication.ts` (HandicapLab)
* **Status:** `IMPLEMENTED`, `TESTED`.
* **Forensic Reality:**
  - **Deterministic Match UUID:** Generated via standard hashing of competition, season, normalized team names, and kickoff timestamp UTC.
  - **Entity Resolution:** Alias mapping table resolves cross-provider team names (e.g. "Man Utd", "Manchester United FC", "Man United").
  - **Discrepancy:** Production persistent cross-provider mapping table (API-Football fixture ID $\leftrightarrow$ OddsPapi fixture ID) is listed as a pending blocker in `HANDICAPLAB_PRODUCTION_READINESS.md` Blocker 3.

### 4.3 Medallion Storage Pipeline (Bronze → Silver → Gold)

* **Components:**
  - `BronzeReader` / `BronzeWriter` (`src/lib/warehouse/storage/`)
  - `SilverPipeline` (`src/lib/warehouse/storage/silverPipeline.ts`)
  - `GoldService` (`src/services/goldService.ts`)
* **Status:** `IMPLEMENTED`, `TESTED` (Offline/Batch).
* **Forensic Reality:**
  - **Bronze:** Stores verbatim raw API payloads with SHA-256 integrity checksums.
  - **Silver:** Cleans, applies surrogate integer IDs, performs deduplication (`KEEP_FIRST` strategy), validates against `DataContractDefinition`.
  - **Gold:** Read-only PostgreSQL views (`gold_competitions`, `gold_matches`) aggregating xG, rolling team form, and sharp devigged odds. In production runtime, SALMO consumes directly from Supabase tables (`daily_picks`, `prediction_ledger_v3`).

### 4.4 Odds Pipeline

* **Pipeline Flow:**
  $$\text{Odds Provider} \longrightarrow \text{Raw Odds} \longrightarrow \text{Market Mapping} \longrightarrow \text{Timestamp Snapshot} \longrightarrow \text{Canonical Odds} \longrightarrow \text{Devigging} \longrightarrow \text{Edge / EV}$$
* **Status:** `IMPLEMENTED`, `TESTED`, `DATA-BACKED` for Pre-Match; `NOT IMPLEMENTED` for In-Play Live Odds.
* **Forensic Reality:**
  - Pre-match odds ingestion from OddsPapi captures Pinnacle quotes.
  - Multiplicative devigging (`DevigEngine.ts`) removes bookmaker overround to establish fair baseline implied probabilities.
  - Live odds updates during in-play are NOT supported due to the 250 requests/month OddsPapi limit.

### 4.5 Prediction Pipeline

* **Model Family:**
  - Dixon-Coles bivariate Poisson regression with time decay parameter ($\xi$) and low-score correction ($\tau(\lambda, \mu, \rho)$).
* **Target Markets:**
  1. **Asian Handicap (AH):** Quarter-line split evaluation using bivariate score probabilities.
  2. **Over/Under (OU):** Goal totals derived from marginal Poisson probabilities.
  3. **Both Teams To Score (BTTS):** Probability derived from joint probability matrix minus zero-goal margins.
* **Status:**
  - AH: `IMPLEMENTED`, `TESTED`, `DATA-BACKED`.
  - OU: `IMPLEMENTED`, `TESTED`, `DATA-BACKED`.
  - BTTS: `IMPLEMENTED`, `TESTED` (Historical priced odds unverified).

### 4.6 Research Infrastructure

* **Components:**
  - Replay Lab (`src/lib/replay/`)
  - Walk-Forward Backtesting (`src/lib/research/ah-edge/`, `src/lib/research/ah-yield/`)
  - Calibration Engine (Brier Score, reliability curves)
  - Market Discovery Engine (`EPIC66_GLOBAL_MARKET_PROFITABILITY_REPORT.md`)
* **Status:** `IMPLEMENTED`, `TESTED` (Research runtime).
* **Forensic Reality:**
  - Operates on 17,738 historical matches across European leagues.
  - Empirical backtest demonstrates that naive betting yields negative ROI without strict liquidity and margin filtering.
  - Quarantines unverified models (e.g., EPIC-66 discovery rankings quarantined under strict validation governance).

### 4.7 Closing Line Value (CLV) Pipeline

* **Target Formula:**
  $$\text{CLV} = \frac{\text{Odds}_{\text{taken}}}{\text{Odds}_{\text{closing, devigged}}} - 1$$
* **Status:** `IMPLEMENTED` in analytical code, but `UNAVAILABLE` in live production.
* **Forensic Reality:**
  - Closing odds ingestion job requires systematic post-match fetching.
  - In `HANDICAPLAB_PRODUCTION_READINESS.md` (Blocker 2), CLV is explicitly reported as `UNAVAILABLE` because closing-odds historical synchronization is pending execution.
  - SALMO does not expose fake CLV numbers; it correctly surfaces unavailability until closing lines are systematically ingested.

### 4.8 Track Record & Public Ledger

* **Components:**
  - `src/lib/ledger/productionSettlementService.ts` (HandicapLab)
  - `prediction_ledger_v3` table (Supabase)
  - `daily_picks` table (Supabase)
  - `tests/salmo_production_integration.test.js` (SALMO)
* **Status:** `IMPLEMENTED`, `DATA-BACKED` (151 point-in-time verified records, Gameweek 5 active picks).
* **Forensic Reality:**
  - Immutable SHA-256 hash generated for each prediction snapshot at freeze time ($T \le \text{kickoff}$).
  - Settlement service updates ledger post-match using official match outcomes.

### 4.9 SALMO Consumer Layer

* **Components:**
  - `src/contracts/handicapLabAdapter.ts` (`DatabaseHandicapLabAdapter`, `HttpHandicapLabAdapter`, `LocalHandicapLabAdapter`)
  - `src/engine/matchIntelligenceService.ts`
  - `src/engine/decision/decisionPolicy.ts`
  - `src/engine/ah/quarterLineSettler.ts`
* **Status:** `IMPLEMENTED`, `TESTED`, `CONNECTED` (PostgreSQL Supabase).
* **Active Surfaces:**
  - Home 7-Day Feed (`/`)
  - Match Explorer (`/matches`)
  - Daily Picks Curated Feed (`/daily-picks`)
  - Asian Handicap Desk (`/asian-handicap`)
  - Over/Under Desk (`/over-under`)
  - Both Teams To Score Desk (`/btts`)
  - Match Deep Dive (`/match/[id]`)
  - Pricing & Transparency (`/pricing`)
  - Research Evidence Desk (`/research`)

---

## 5. FLOW SPECIFICATIONS (INPUT → TRANSFORMATION → STORAGE → CONTRACT → CONSUMER → VALIDATION)

| Flow Name | Input | Transformation | Storage | Contract | Consumer | Validation Gate |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Fixture Ingestion** | API-Football `/fixtures` | Deduplication, Entity Resolution, UTC normalization | Bronze JSON $\rightarrow$ Silver DB `matches` | `CanonicalFixture` | HandicapLab Scheduler | `checkpoint.ts` + Dedup Check |
| **Odds Ingestion** | OddsPapi `/v4/odds` | Pinnacle filter, 4-sharp book mapping | Silver `market_snapshots` | `CanonicalOddsSnapshot` | Devig Engine | Odds format $> 1.0$, Request Counter |
| **Prediction Run** | Silver match history + Team stats | Dixon-Coles MLE Solver, Low-score adjustment | Supabase `daily_picks` | `ActiveMatchPrediction` | SALMO `daily_picks` | Anti-leakage temporal check ($T_{\text{pred}} < T_{\text{kickoff}}$) |
| **Decision Gating** | Model $P$, Fair Odds, Pinnacle Odds | Edge calculation, Liquidity filter, EV computation | Supabase `daily_picks` | Verdict (`LAYAK`/`PANTAU`/`LEWATI`) | SALMO Daily Picks UI | Multi-threshold policy: Edge $\ge 3.0\%$, EV $\ge 5.0\%$, Conf $\ge 70$ |
| **Settlement** | Finished match score (Home/Away goals) | QuarterLineSettler split rules ($0, \pm0.25, \dots$) | Supabase `prediction_ledger_v3` | `SettlementOutcome` (WIN/LOSS/PUSH/HALF) | SALMO Evidence Drawer | Official final score reconciliation |
| **CLV Tracking** | Taken odds vs Pinnacle Closing devigged | $\frac{O_{\text{taken}}}{O_{\text{close, devig}}} - 1$ | Supabase `prediction_audits` | `CLVMetric` | SALMO Research UI | Blocker: Closing odds runner must be active |

---

## 6. DISCREPANCY AUDIT: SPECIFICATION VS REPOSITORY TRUTH

1. **PRO Plan Capacity:**
   - *Specification:* Theoretical capacity for 650+ leagues worldwide.
   - *Repository Truth:* API-Football PRO budget is 7,500 requests/day. At 1 call per fixture update + lineups + stats, daily capacity supports ~50–80 active fixtures comfortably. 650+ concurrent leagues would blow daily rate limits within hours.
2. **Active Production Coverage:**
   - *Specification:* Multi-league coverage across top 5 European leagues.
   - *Repository Truth:* Active live rows in `daily_picks` currently cover English Premier League (Gameweek 5). Multi-league historical data exists in Bronze/Silver, but live serving is staged starting with EPL.
3. **Odds Provider Availability:**
   - *Specification:* Multi-bookmaker odds aggregation with sharp consensus.
   - *Repository Truth:* Live odds consumption relies strictly on OddsPapi free tier (250 calls/month budget), focusing exclusively on Pinnacle reference quotes. Zero non-Pinnacle live sharp books are queried to preserve budget.
4. **Closing Line Value (CLV):**
   - *Specification:* Automatic real-time CLV reporting on all settled picks.
   - *Repository Truth:* Historical closing odds ingestion runner is listed as a pending blocker in `HANDICAPLAB_PRODUCTION_READINESS.md`. CLV is currently reported as `UNAVAILABLE` in live production.

