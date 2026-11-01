# SALMO Live Prediction Health & Engine Forensic Audit

**Audit Date**: November 1, 2026 (Local 00:30 WIB / 2026-10-31T17:30:00Z UTC)  
**Target Architecture**: Dixon-Coles Bivariate Poisson Quantitative Engine & SALMO Consumer Presentation Layer  
**Mode**: READ-ONLY  
**Engine Verdict**: **`BLOCKED (UPSTREAM FIXTURE INGESTION CEASED / DATASET TEMPORALLY EXHAUSTED)`**

---

## 1. Executive Summary & Clarification of `NO_QUALIFIED_PICKS`

In EPIC 90, the status of daily picks was reported as `NO_QUALIFIED_PICKS`. User Correction A rightfully emphasized:
> *"NO_QUALIFIED_PICKS bukan berarti prediction engine rusak. Artinya endpoint tidak menemukan prediksi yang memenuhi kriteria publikasi saat diperiksa. Namun kita belum membuktikan bahwa engine berhasil menghasilkan prediksi untuk seluruh pertandingan yang memenuhi syarat."*

Our forensic audit confirms this distinction with definitive database and code evidence:

1. **The Prediction Engine is NOT Crashing or Mathematically Failing**:
   - The Dixon-Coles solver, margin-stripping logic, Kelly stake sizing, and EV gates are fully functional (422 unit tests passing, zero compilation errors).
2. **Upstream Ingestion is Permanently Blocked**:
   - **Zero future fixtures exist in the entire system**: In the Supabase `matches` table (933 total rows), the latest kickoff date is `2026-10-18T15:30:00` (Nottingham Forest vs Arsenal). There are **zero matches** with kickoff $> 2026-11-01$.
   - **API-Football is Suspended**: The primary fixture ingestion authority returns `HTTP 200: { errors: { access: 'Your account is suspended...' } }`.
3. **The Stale Data Safeguard Rejects All Existing Historical Picks**:
   - The `daily_picks` table contains 116 records, all generated on or before `2026-10-16`.
   - In `src/contracts/handicapLabAdapter.ts`, lines 100–104 enforce the **Stale Data Kill Switch**:
     ```typescript
     const kickMs = new Date(kickoffUtc).getTime();
     if (!isNaN(kickMs) && kickMs <= Date.now()) {
       continue; // Stale Data Kill Switch: kicked-off matches must NEVER appear in active Daily Picks feed
     }
     ```
   - Because `Date.now()` is November 1, 2026, and all records in `daily_picks` have kickoffs in September or October, 100% of rows are filtered out.
   - `/api/daily-picks` truthfully returns `dataState: "NO_QUALIFIED_PICKS"` and `data: []`.

Therefore, `NO_QUALIFIED_PICKS` is not an algorithmic verdict on today's football matches; it is the **system correctly refusing to present expired historical matches as upcoming bets**.

---

## 2. Ingestion & Pipeline Observability Telemetry

Telemetry extracted from live production endpoints (`https://salmo.dev/api/health` and Supabase PostgreSQL):

| Pipeline Stage | Telemetry Metric | Measured Production Value | Status |
| :--- | :--- | :--- | :---: |
| **Latest Fixture Ingestion** | `lastFixtureIngestionAt` | `2026-10-11T05:00:00.000Z` | **STALE (> 20 days ago)** |
| **Latest Match Kickoff in DB** | `max(kickoff)` in `matches` | `2026-10-18T15:30:00.000Z` | **EXPIRED** |
| **Upcoming Fixtures Available** | `upcomingFixturesCount` | **0** | **EMPTY** |
| **Latest Odds Ingestion** | `odds_snapshots.timestamp` | `2026-10-16T20:12:05.043Z` | **STALE** |
| **Latest Prediction Generation** | `daily_picks.created_at` | `2026-10-16T20:12:07.251Z` | **STALE** |
| **Latest Model Run ID** | `runId` | `daily-2026-10-16T20:00Z` | **STALE** |
| **Active Competitions** | Whitelisted Competitions | 15 defined, **0 active in live feed** | **PAUSED / SHADOW** |
| **Live Data State** | `liveDataState` | `HISTORICAL_PRESERVED_LIVE_UNAVAILABLE` | **FAIL-CLOSED** |

---

## 3. Detailed Root Cause Breakdown of `NO_QUALIFIED_PICKS`

| Candidate Cause | Investigated Reality | Contribution to Empty State |
| :--- | :--- | :---: |
| **A. No Eligible Upcoming Fixtures** | 0 fixtures in DB with kickoff $> 2026-11-01$. | **PRIMARY CAUSE (100% Blocker)** |
| **B. Upstream API-Football Ingestion Failure** | Account suspended on `api-sports.io` dashboard. Zero new fixtures ingested since Oct 11. | **ROOT UPSTREAM CAUSE** |
| **C. Missing / Stale Odds** | Latest Pinnacle snapshots are from Oct 16. Cloud Run OddsPapi poller blocked by legacy key drift. | **SECONDARY BLOCKER** |
| **D. Stale Data Kill Switch** | All 116 records in `daily_picks` have kickoffs in the past. Correctly filtered out by adapter. | **EXPECTED SAFE BEHAVIOR** |
| **E. Quantitative Model Execution Failure** | Dixon-Coles Poisson model passes 100% of mathematical integrity tests. | **NOT A FACTOR (Engine OK)** |
| **F. Database Persistence Failure** | Supabase connection healthy; latency 317ms; tables accessible. | **NOT A FACTOR (DB OK)** |

---

## 4. Market & Competition Coverage Analysis

1. **Asian Handicap (AH)**:
   - Full quarter-line split settlement engine verified (`0, ±0.25, ±0.5, ±0.75, ±1.0, ...`).
   - Covered in historical ledger and Oct 16 cohort.
   - Current live active coverage: **0 matches** (due to missing upcoming fixtures).
2. **Over / Under (OU)**:
   - Variable half-line and quarter-line goal expectation engine verified (`2.25, 2.5, 2.75, 3.0`).
   - Current live active coverage: **0 matches**.
3. **Both Teams To Score (BTTS)**:
   - Bivariate Poisson joint probability distribution verified.
   - Current live active coverage: **0 matches**.
4. **Moneyline / 1X2**:
   - Strictly out of scope per SALMO design decrees. Zero moneyline recommendations in production.

---

## 5. Prediction Generation & Ledger Persistence Inventory

| Table / Ledger | Total Records | Historical Settled | Stale Pending | Active Live |
| :--- | :---: | :---: | :---: | :---: |
| **Supabase `daily_picks`** | 116 | 20 | 96 | **0** |
| **Supabase `prediction_ledger`** | 622 | 20 | 602 | **0** |
| **Supabase `prediction_ledger_v3`** | 206 | 0 | 206 (Legacy) | **0** |
| **`handicaplab_sync_ledger.jsonl`** | 549 | 21 | 528 | **0** |
| **`live_prediction_ledger.jsonl`** | 30 | 12 | 18 | **0** |
| **`all_leagues_research_ledger.jsonl`**| 336 | 12 | 324 | **0** |

---

## 6. Audit Verdict: Prediction Engine Health

**VERDICT: `BLOCKED`**

- **Reason**: The prediction engine algorithms and models are sound, but operational prediction generation is **completely blocked** because:
  1. API-Football is suspended, halting new fixture discovery.
  2. All fixtures in the database have kickoffs in the past ($< 2026-11-01$).
  3. OddsPapi live odds polling on Cloud Run is halted due to key mismatch.
  4. The Stale Data Kill Switch correctly prevents stale historical picks from appearing in the live feed.

