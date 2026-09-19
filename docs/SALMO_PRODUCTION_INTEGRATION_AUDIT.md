# SALMO.DEV — Production Integration & Data Source Audit

## 1. Executive Summary

This document establishes the official data source inventory and classification for **SALMO.DEV** following the execution of the Production Integration & Connection Gate. 

Per architectural decree (**Option D: Consumer Layer Separation**), SALMO.DEV functions strictly as a consumer application. It does not run independent prediction models, Dixon-Coles solvers, ratings calculators, or empirical fallback approximations. It connects directly and exclusively to the canonical **HandicapLab** production intelligence pipeline and **Supabase / PostgreSQL** canonical data store.

---

## 2. Data Source Inventory & Classification

Each data source in the SALMO.DEV codebase is classified into one of six standard tiers:
- `REAL_PRODUCTION`: Canonical live data source with cryptographic provenance and walk-forward validation.
- `MOCK`: Synthetically generated data used exclusively in isolated unit tests.
- `STATIC`: Read-only architectural schemas, documentation, and UI constants.
- `DEMO`: Strictly prohibited in production runtime.
- `TEST`: Test fixtures asserting boundary conditions.
- `UNKNOWN`: Unverified or ambiguous sources (Zero allowed).

| Path / Resource | Type | Classification | Production Usage | Fail-Closed Policy |
| :--- | :--- | :--- | :--- | :--- |
| **Supabase `daily_picks`** | PostgreSQL Table | `REAL_PRODUCTION` | **Active Primary** | If offline: throws `DATA_UNAVAILABLE` (HTTP 503) |
| **Supabase `prediction_ledger_v3`** | PostgreSQL Table | `REAL_PRODUCTION` | Audit Ledger | Verified SHA-256 provenance |
| **HandicapLab REST API** (`/predictions/active-7day`) | HTTP Endpoint | `REAL_PRODUCTION` | Active (when `HANDICAPLAB_ADAPTER=http`) | If offline: throws `DATA_UNAVAILABLE` |
| **`DatabaseHandicapLabAdapter`** | TypeScript Adapter | `REAL_PRODUCTION` | **Primary Adapter** | Zero fallback to local files |
| **`HttpHandicapLabAdapter`** | TypeScript Adapter | `REAL_PRODUCTION` | Microservice Adapter | Zero fallback to local files |
| **`LocalHandicapLabAdapter`** | TypeScript Adapter | `TEST` | Dev/Offline only (`HANDICAPLAB_ADAPTER=local`) | Isolated from production database path |
| **`active_7day_predictions.json`** | JSON Artifact | `TEST` / Verification Baseline | **PROHIBITED IN PROD** | Database adapter has 0 references to this file |
| **`live_prediction_validation.json`** | JSON Artifact | `STATIC` / Calibration Report | Benchmark Baseline | Historical 11-season matrix reference |
| **`live_prediction_ledger.jsonl`** | JSONL Ledger | `REAL_PRODUCTION` / Canonical Export | Audit Baseline | Point-in-time immutable record |
| **API-Football PRO (v3)** | REST Provider | `REAL_PRODUCTION` | Provider Discovery | Rate-limited safe backoff |
| **OddsPapi (v4)** | REST Provider | `REAL_PRODUCTION` | Sharp Pinnacle Reference | Strictly no non-Pinnacle sharp reliance |

---

## 3. Elimination of Synthetic Fallbacks

Prior to this execution gate, an audit identified residual synthetic fallback mechanisms. All have been permanently eliminated from the production path:

1. **Synthetic Fixture Slicing**:
   - *Previous behavior*: When upcoming fixtures were empty, the service sliced 10 historical matches and fabricated scheduled fixture dates.
   - *Current canonical behavior*: If `activePredictions` is empty or the canonical database is unreachable, `MatchIntelligenceService.getTodaysMatches()` immediately returns `[]` (empty array). Zero fixtures fabricated.

2. **Empirical Probability Counting**:
   - *Previous behavior*: Private static methods `buildAhMarket`, `buildBttsMarket`, and `buildOuMarket` counted sample historical ratios (`bttsYesCount / sampleSize`, `overCount / sampleSize`) to simulate a model probability.
   - *Current canonical behavior*: Removed entirely. Model probability (`model_probability`) and fair odds (`fair_odds`) are strictly ingested from HandicapLab's verified Dixon-Coles model.

3. **Hardcoded Confidence Scores**:
   - *Previous behavior*: Hardcoded confidence scores (`80`, `45`, `40`, `35`, `20`) were assigned based on arbitrary edge thresholds.
   - *Current canonical behavior*: The actual canonical `confidence` score (a 0–100 integer reflecting sample size, data freshness, market spread tightness, and edge stability) is consumed directly from `daily_picks.confidence`.

4. **Hardcoded Date Horizons**:
   - *Previous behavior*: Match filtering relied on hardcoded date strings `'2026-09-18'` and `'2026-09-19'`.
   - *Current canonical behavior*: Dynamic time horizon calculation (`matchesDynamicHorizon`) evaluates kickoff timestamps strictly using UTC arithmetic for `Today`, `Tomorrow`, `+3 Days`, and `7 Days`.

---

## 4. Market Boundary Enforcement

SALMO.DEV strictly enforces the 3-market product boundary:
1. **Asian Handicap (AH)**: Quarter-line split settlement methodology ($0, \pm0.25, \pm0.5, \pm0.75, \dots$).
2. **Over/Under 2.5 Goals (OU)**: Single half-line goal expectation.
3. **Both Teams To Score (BTTS)**: Binary goal expectation derived from bivariate score grid.

**Moneyline / 1X2 / Match Winner is permanently out of scope.**
Static analysis and unit tests (`tests/salmo_production_integration.test.js`) enforce that no moneyline types, routes, or recommendations exist.

---

## 5. Security & Secret Protection

- `SUPABASE_URL` & `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Safe for client-side bundle hydration with Row-Level Security (RLS).
- `SUPABASE_SERVICE_ROLE_KEY`: Server-side only. Never prefixed with `NEXT_PUBLIC_`.
- `API_FOOTBALL_KEY`, `ODDSPAPI_KEY`, `FOOTYSTATS_KEY`: Server-side only. Never leaked to client browser.

---

## 6. Audit Verdict

**GATE STATUS: PASS**
- Synthetic Fallbacks: **0**
- Empirical Prediction Formulas: **0**
- Mock Leaks in Production Path: **0**
- Fail-Closed Implementation: **100% Verified**
