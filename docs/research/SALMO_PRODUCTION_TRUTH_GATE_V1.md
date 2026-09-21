# SALMO × HANDICAPLAB PRODUCTION VERIFICATION TRUTH GATE (V1)
**Document Version:** 1.0.0  
**Audit Execution Date:** September 21, 2026  
**Auditor:** Quantitative Systems Architect & Forensic Competitive Intelligence Lead  
**Scope:** Production Runtime Reality vs. Integration Path Behavior, Database Forensics, Market Truth Matrix, and Decision Gate Alignment.

---

## 1. EXECUTIVE CONCLUSION

### Core Question:
> **Does the available evidence prove that SALMO's production environment is currently receiving and persisting real live fixture + odds data continuously?**

### Definitive Finding:
# **NO.**

### Forensic Summary:
1. **Software & Integration Path Correctness:** The TypeScript and Python codebases successfully implement the mathematical models, API contracts, devigging logic, and database schemas. All 33 automated tests pass, verifying that SALMO correctly queries and transforms data from Supabase.
2. **Database Ingestion Reality:** Supabase contains **30 rows** in `daily_picks`, all inserted within a single 29-second window on **September 18, 2026 (18:46:28 to 18:46:57 UTC)** corresponding to Premier League Gameweek 5 (kickoffs September 18–20, 2026). **Zero new fixtures or odds have been inserted since.**
3. **No Active Production Daemons / Cron Jobs:** The production cron runner is not executing continuously. The automated closing snapshot runner is inactive (`closing_odds` table contains **0 rows**), and the nightly settlement pipeline has not processed live records (`settlements` table contains **0 rows**).
4. **Truth Classification:** The system is **`INTEGRATION-PATH VERIFIED` on real historical snapshot data**, but is **NOT `CONTINUOUSLY OPERATING`** and **NOT `PRODUCTION-VERIFIED`**.

---

## 2. STRICT 8-STATE CLASSIFICATION TAXONOMY

To eliminate ambiguity between test execution and production operation, every subsystem is classified into exactly one of eight hierarchical states:

```text
[1. CODE IMPLEMENTED] 
       │  (Source code written in repo)
       ▼
[2. UNIT/TEST VERIFIED]
       │  (Unit tests or mock tests pass)
       ▼
[3. INTEGRATION-PATH VERIFIED]
       │  (Code queries real schema/APIs successfully with valid payloads)
       ▼
[4. DEPLOYED]
       │  (Code is deployed to staging/production hosting environments)
       ▼
[5. LIVE DATA CONNECTED]
       │  (Active external API credentials configured and reachable over network)
       ▼
[6. PERSISTED IN PRODUCTION]
       │  (Real data rows reside in production database tables)
       ▼
[7. CONTINUOUSLY OPERATING]
       │  (Automated crons/workers polling and persisting on an ongoing cadence)
       ▼
[8. PRODUCTION-VERIFIED]
          (End-to-end continuous pipeline operating across live gameweeks)
```

**Hierarchical Rule:** A subsystem cannot be classified at a higher state without concrete empirical evidence satisfying all lower states. Passing an integration test is evidence for State 3 (`INTEGRATION-PATH VERIFIED`), not State 7 or 8.

---

## 3. PIPELINE FORENSIC AUDIT

### Pipeline A: Fixtures
`provider → ingestion → canonical match → production persistence → SALMO adapter`

```text
[API-Football / FootyStats] 
         │ (HTTP REST)
         ▼
[CanonicalFixtureRegistry] ──► Discovered 10 EPL Gameweek 5 fixtures
         │
         ▼
[Supabase daily_picks] ──────► 30 rows inserted on 2026-09-18 (Static Snapshot)
         │
         ▼
[DatabaseHandicapLabAdapter] ─► Successfully queries daily_picks via Supabase JS client
```

- **Forensic Evidence:**
  - `daily_picks` row count: **30**.
  - `created_at` timestamp range: `2026-09-18T18:46:28.291Z` to `2026-09-18T18:46:57.400Z` (span: 29.1 seconds).
  - `kickoff_utc` range: `2026-09-18T19:00:00Z` to `2026-09-20T15:30:00Z`.
  - Upcoming fixtures (> September 21, 2026): **0 rows**.
- **State Classification:** **`PERSISTED IN PRODUCTION (STATIC SNAPSHOT)`**.
- **Continuous Operation:** **NO**. Ingestion occurred during a single manual execution of `live_reconciliation_audit.ts` on Sept 18; no ongoing automated fixture ingestion is active.

---

### Pipeline B: Model
`canonical match → model → score grid → AH / BTTS / O/U probabilities`

```text
[Canonical Fixture Data]
         │
         ▼
[Dixon-Coles Solver] ────────► Calculates λ_home, μ_away, ρ (-0.06)
         │
         ▼
[Joint Score Grid P(x, y)] ──► Grid dimension 11x11, normalized to 1.0
         │
         ├───────────────────► AH: line probabilities calculated
         ├───────────────────► BTTS: P(x ≥ 1, y ≥ 1) derived
         └───────────────────► O/U: 1D total distribution derived
```

- **Forensic Evidence:**
  - Feature vectors and probabilities are stored in `prediction_ledger_v3` (206 rows).
  - Sample row `dd18a48d-...`: `homeXG: 1.35`, `awayXG: 1.2`, `rho: -0.06`, `raw_probability: 0.5252` for BTTS YES.
  - Verified mathematically in `tests/salmo_live_engine.test.js` ([L99-120](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/tests/salmo_live_engine.test.js#L99-L120)).
- **State Classification:** **`INTEGRATION-PATH VERIFIED`**.
- **Continuous Operation:** **NO**. Executed only when batch scripts are manually triggered.

---

### Pipeline C: Odds
`OddsPapi → Pinnacle odds → normalization → persistence → prediction-time odds`

```text
[OddsPapi v4 API] ──────────► Quota: 250 requests/month free tier
         │
         ▼
[OddsPapiFetcher] ──────────► Ingests Pinnacle reference quotes
         │
         ▼
[Supabase odds_snapshots] ──► 1,041 total rows
         │                    ├── 1,040 rows from 2026-08-04
         │                    └── 1 row from 2026-09-19T13:30:02Z
         ▼
[DevigEngine] ──────────────► Multiplicative margin removal (P_devig)
```

- **Forensic Evidence:**
  - `odds_snapshots` contains 1,041 rows, but **1,040 rows are historical archives from August 4, 2026**. Only **1 row** exists from September 19, 2026.
  - `daily_picks` market odds are populated from the September 18 snapshot (e.g. Manchester City vs Sunderland AH market_odds: 2.76).
- **State Classification:** **`PERSISTED IN PRODUCTION (STATIC SNAPSHOT)`**.
- **Continuous Operation:** **NO**. Continuous live odds ingestion is inactive to preserve the 250 req/mo OddsPapi quota ceiling.

---

### Pipeline D: Decision
`probability → fair odds → devig → edge → decision gate → SALMO card`

```text
[Model Probability (P_model)] ───► e.g. 52.5%
[Devigged Market Prob (P_devig)] ─► e.g. 63.8%
         │
         ▼
[Edge Calculation] ──────────────► Edge = P_model - P_devig
[EV Calculation] ────────────────► EV = P_model * Odds - 1
         │
         ▼
[DecisionPolicy Gating] ─────────► LAYAK (Value), PANTAU (Marginal), LEWATI (No Value)
         │
         ▼
[SALMO UI MatchCard] ────────────► Badge: GREEN / YELLOW / RED / GREY
```

- **Forensic Evidence:**
  - Evaluated in `daily_picks`: 8 LAYAK, 22 PANTAU, 0 LEWATI rows stored for Gameweek 5.
  - Verified in `tests/salmo_production_integration.test.js` ([L99-130](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/tests/salmo_production_integration.test.js#L99-L130)).
  - Decision gating functions deterministically in application memory.
- **State Classification:** **`INTEGRATION-PATH VERIFIED`**.
- **Continuous Operation:** **NO**. Decisions are rendered on the static 30 rows in `daily_picks`.

---

### Pipeline E: Ledger
`prediction → immutable ledger → settlement → result → track record`

```text
[Pre-Kickoff Prediction] ──────► SHA-256 hash frozen (prediction_ledger_v3: 206 rows)
         │
         ▼
[Match Completion] ────────────► Full-time score recorded
         │
         ▼
[nightly_settle.py] ───────────► Settle picks via QuarterLineSettler
         │
         ▼
[Supabase settlements table] ──► 0 ROWS (EMPTY)
[Public Track Record UI] ──────► MISSING IN SALMO
```

- **Forensic Evidence:**
  - `prediction_ledger_v3` table has **206 rows** with cryptographic hashes (`prediction_hash`, `prior_hash`).
  - `prediction_ledger_v3` **does not have outcome, pnl, or settlement columns**.
  - `settlements` table in Supabase contains **0 rows**.
  - `prediction_audits` table contains **0 rows**.
  - No public track record page exists in SALMO that queries `prediction_ledger_v3`.
- **State Classification:** **`CODE IMPLEMENTED / PARTIALLY PERSISTED (PREDICTIONS ONLY)`**.
- **Continuous Operation:** **NO**. Settlement pipeline has never written a settled row to Supabase in production.

---

### Pipeline F: Closing Odds & CLV
`taken odds → closing snapshot → closing normalization → CLV calculation → persisted CLV`

```text
[Taken Odds at T_freeze] ──────► Recorded in daily_picks
         │
         ▼
[T_kickoff - 5m Snapshot] ─────► closing_snapshot.py exists
         │
         ▼
[Supabase closing_odds table] ─► 0 ROWS (EMPTY)
         │
         ▼
[clvEngine.ts] ────────────────► Mathematical calculation exists
         │
         ▼
[Persisted CLV Ledger] ────────► 0 ROWS (NON-EXISTENT)
```

- **Forensic Evidence:**
  - `closing_odds` table in Supabase contains **0 rows**.
  - `clv_records` table does not exist in schema cache.
  - `closing_snapshot.py` script exists in repo but has never persisted records to Supabase.
- **State Classification:** **`CODE IMPLEMENTED ONLY`**.
- **Continuous Operation:** **NO**.

---

## 4. MARKET STATUS BREAKDOWN

| Market | Sub-Component | State Classification | Evidence & Status |
| :--- | :--- | :--- | :--- |
| **ASIAN HANDICAP** | Line Derivation | `INTEGRATION-PATH VERIFIED` | Dixon-Coles grid derives probabilities across lines $-1.5$ to $+1.5$. |
| | Settlement | `UNIT/TEST VERIFIED` | `QuarterLineSettler.ts` verified for whole, half, and quarter-lines in test suite. Python `settlement.py` has quarter-line split logic. |
| | Odds Ingestion | `PERSISTED IN PRODUCTION (SNAPSHOT)` | Pinnacle AH lines ingested in Sept 18 snapshot (30 rows). |
| | Decision Path | `INTEGRATION-PATH VERIFIED` | Evaluates edge against devigged Pinnacle line; produces LAYAK/PANTAU/LEWATI. |
| **BTTS** | Probability Derivation | `INTEGRATION-PATH VERIFIED` | Derived directly via $P(\text{BTTS Yes}) = \sum_{x \ge 1, y \ge 1} P(x, y)$; verified in test suite. |
| | Settlement | `CODE IMPLEMENTED` | Deterministic condition ($x \ge 1 \land y \ge 1$), but explicit BTTS function is missing from `settlement.py`. |
| | Odds Ingestion | `PERSISTED IN PRODUCTION (SNAPSHOT)` | Ingested in Sept 18 snapshot (10 BTTS rows). |
| | Decision Path | `INTEGRATION-PATH VERIFIED` | Gated as `PROVISIONAL_EDGE` due to 95% CI crossing zero. |
| **GOALS OVER/UNDER**| O/U 2.5 Derivation | `INTEGRATION-PATH VERIFIED` | Derived from 1D total goals distribution; present in Sept 18 snapshot (10 OU rows). |
| | Variable Lines (1.5, 3.5)| `CODE IMPLEMENTED` | Implemented in `asianTotalEngine.ts` for lines $2.0\text{--}4.0$. |
| | Quarter Lines (.25, .75)| `CODE IMPLEMENTED` | Implemented in `asianTotalEngine.ts` with 5-outcome probabilities. |
| | Odds Ingestion (Multi-line)| `CODE IMPLEMENTED` | Provider adapter currently only extracts 2.5 line from free CSV/snapshot. Multi-line OddsPapi query not configured. |
| | Decision Path | `INTEGRATION-PATH VERIFIED` | Operates on line 2.5; variable lines not yet active in decision feed. |

---

## 5. CLOSING LINE VALUE (CLV) AUDIT

| Stage | Required Capability | Current Status | Forensic Evidence |
| :--- | :--- | :--- | :--- |
| **1** | CLV calculation engine exists | **VERIFIED** | `clvEngine.ts` exists in `HandicapLab/src/historical/forensics/`. |
| **2** | Historical closing data exists | **PARTIAL** | Historical CSV files contain some closing quotes, but database table is empty. |
| **3** | Automated closing runner exists | **VERIFIED** | `closing_snapshot.py` exists in `handicaplab-pipeline/scripts/`. |
| **4** | Automated closing runner active | **NOT VERIFIED** | Runner is not configured in any active cron daemon. |
| **5** | Closing odds persisted | **NOT VERIFIED** | Supabase `closing_odds` table contains **0 rows**. |
| **6** | CLV production verified | **NOT VERIFIED** | Zero verified CLV records exist in production. |

---

## 6. PRODUCTION-VS-INTEGRATION CONTRADICTION AUDIT

Why did previous reports claim "production verified" when production is not live?

1. **Category Confusion (Path vs. Operation):** An automated integration test that queries a remote database table (e.g. `daily_picks`) proves that the **network path, query schema, and data contract work**. It does **NOT** prove that the database is being continuously updated with live data by automated cron jobs.
2. **Snapshot Misinterpreted as Live Stream:** The 30 rows in `daily_picks` were populated on September 18, 2026. Because the tests queried real table rows with real Pinnacle odds, the test output was labeled "Real odds path" and "Real fixture path". While the data in those rows was real, it was a **one-time snapshot**, not a live, operating system.
3. **Empty Settlement Tables Ignored:** Tests focused on pre-match reads (`daily_picks`) and unit settlement logic (`QuarterLineSettler.test.js`), but did not check whether the production `settlements` table actually contained settled rows.

---

## 7. RESEARCH DOCUMENTATION WORDING RECTIFICATION

The following terms in existing research documents (`EXPRYSM_COMPETITIVE_TEARDOWN_V1.md`, `EXPRYSM_COMPETITIVE_TEARDOWN_V1_1.md`, `HANDICAPLAB_SALMO_MARKET_MODEL_V1.md`) must be interpreted under these strict reconciled definitions:

| Existing Wording in Research Docs | Previous Context | Reconciled Truth Classification | Justification & Precise Replacement |
| :--- | :--- | :--- | :--- |
| **"PRODUCTION-VERIFIED"** | Applied to AH and OU 2.5 in market matrices. | **INTEGRATION-PATH VERIFIED** | Code path executes against Supabase schema, but continuous live production operation is not active. |
| **"VERIFIED IN PRODUCTION PATH"**| Applied to integration tests 1–4. | **INTEGRATION-TEST VERIFIED (SNAPSHOT DATA)** | Verified that code reads real-shaped Gameweek 5 snapshot rows from Supabase. |
| **"REAL SHARP BOOKMAKER ODDS"** | Applied to Pinnacle quotes. | **REAL QUOTES (STATIC SNAPSHOT)** | Pinnacle odds in `daily_picks` are authentic historical quotes from Sept 18, not a live streaming feed. |
| **"REAL FIXTURES"** | Applied to EPL match rows. | **CANONICAL FIXTURES (GW5 SNAPSHOT)** | Matches are authentic Premier League fixtures from Gameweek 5 (Sept 18–20, 2026). |
| **"CONTINUOUS PIPELINE"** | Described in architecture maps. | **ARCHITECTURAL TARGET SPECIFICATION** | Architecture is designed for continuous execution, but crons are currently dormant. |
| **"CLV INFRASTRUCTURE"** | Described in HandicapLab capabilities. | **OFFLINE ANALYTICAL ENGINE ONLY** | Calculation code exists; data ingestion runner is completely unpopulated. |

---

## 8. FINAL GO / NO-GO PRODUCTION GATE MATRIX

| Pipeline / Feature | Current Truth State | Production Gate Verdict | Next Required Engineering Action |
| :--- | :--- | :--- | :--- |
| **Core Architecture & Decoupling** | `CODE IMPLEMENTED` | **GO** | HandicapLab (quant) $\rightarrow$ SALMO (decision) boundary is clean and correct. |
| **Three-Market Scope (AH, BTTS, O/U)**| `CODE IMPLEMENTED` | **GO** | Market scope locked; no scope creep into prop markets. |
| **Generative Score Grid Model** | `INTEGRATION-PATH VERIFIED` | **GO** | Dixon-Coles solver produces valid joint probabilities. |
| **Deterministic Settlement Logic** | `UNIT/TEST VERIFIED` | **GO (LOCAL) / NO-GO (DB)** | Code handles quarter-lines correctly; production settlement table is unpopulated. |
| **O/U Variable Line Ingestion** | `CODE IMPLEMENTED` | **NO-GO FOR PRODUCTION** | Model is ready, but multi-line OddsPapi ingestion is not configured. |
| **Live Continuous Ingestion** | `PERSISTED SNAPSHOT ONLY` | **NO-GO FOR PRODUCTION** | Production cron jobs (`daily_fetch.py`) are not running continuously. |
| **Closing Odds & CLV Tracking** | `CODE IMPLEMENTED ONLY` | **NO-GO FOR PRODUCTION** | `closing_odds` table has 0 rows; runner is inactive. |
| **Public Track Record Page** | `CODE MISSING IN SALMO` | **NO-GO FOR PRODUCTION** | SALMO lacks a public UI view querying `prediction_ledger_v3`. |

---

### Truth Gate Verdict:
### **STATUS: ARCHITECTURE & INTEGRATION-PATH READY.**
### **PRODUCTION RUNTIME OPERATION: NOT YET ACTIVE.**

SALMO and HandicapLab have achieved solid architectural coherence, complete mathematical specifications, clean provider decoupling, and verified database integration contracts. 

However, **production is not currently live**. The database holds a static snapshot from September 18, 2026; settlement and closing odds tables are empty; and no continuous daemons are operating. 

Prior to commercial launch or marketing claims, engineering must activate the scheduled ingestion and settlement crons in HandicapLab and wire the public track record surface in SALMO.

