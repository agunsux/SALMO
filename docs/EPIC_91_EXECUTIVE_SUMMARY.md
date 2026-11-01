# EPIC 91 — Executive Summary & Operational Final Verdict

**Audit Scope**: Forensic Audit of SALMO & HandicapLab Production Health as of November 1, 2026  
**Auditor**: Antigravity Quantitative Research & SRE Engineering Team  
**Audit Protocol**: STRICTLY READ-ONLY (Zero writes, zero state mutation, zero code changes, zero deployments)  
**Execution Timestamp**: 2026-11-01T00:35:00+07:00 (Local WIB) / 2026-10-31T17:35:00Z (UTC)

---

## 1. Multi-Track Forensic Status Breakdown

Per the project owner's instruction, system health is decomposed into four independent, decoupled operational tracks:

```
========================================================================================
                          EPIC 91 OPERATIONAL HEALTH MATRIX
========================================================================================
TRACK 1: ODDSPAPI ACCOUNT & QUOTA      : KEY/SUBSCRIPTION MISMATCH (250/250 Active Key Available)
TRACK 2: PREDICTION ENGINE & INGESTION : BLOCKED (Upstream API-Football Suspended; 0 Upcoming)
TRACK 3: SETTLEMENT INFRASTRUCTURE     : PARTIALLY OPERATIONAL (20 Settled; Scheduler Dormant)
TRACK 4: SALMO PRODUCTION INTERFACES   : DEPLOYED & RESPONSIVE (HTTP 200, Safe Empty States)
========================================================================================
```

---

## 2. Definitive Answers to the Two Core Objectives

### Objective A: Is SALMO consistently generating predictions, persisting them, and automatically settling completed matches?
- **Generating Predictions**: **BLOCKED**. Zero upcoming fixtures exist in the database with kickoff $> 2026-11-01$. API-Football is suspended, so no new matches are discovered. The Dixon-Coles engine itself is mathematically verified, but lacks input fixtures.
- **Persisting Predictions**: **FUNCTIONAL**. Supabase PostgreSQL is healthy (latency ~317ms), with 116 records persisted in `daily_picks` and 622 records in `prediction_ledger`.
- **Displaying Daily Picks**: **TRUTHFUL EMPTY STATE (`NO_QUALIFIED_PICKS`)**. Because all 116 existing picks in the database have kickoffs in September or October 2026, the **Stale Data Kill Switch** (`kickMs <= Date.now()`) correctly suppresses them from being presented as active picks.
- **Automated Settlement**: **PARTIALLY OPERATIONAL**. 20 historical records across 10 matches are settled and reconciled with 0 errors. However, **414 finished matches remain unsettled in the database** because no active cron job is executing the `FreeResultsAdapter` in production.

### Objective B: Exactly why did the OddsPapi account report zero remaining requests?
- **The Active Account Key is NOT at zero**: The unmetered query to `GET https://api.oddspapi.io/v4/account?apiKey=62c5...2663` (`agunsuxx@gmail.com`, created October 23, 2026) confirmed:
  - `request_limit`: **250**
  - `request_count`: **0**
  - `remaining`: **250** (100% available).
  - Exactly **0 billable requests** have been consumed on this account.
- **Source of the "0 Remaining" Report**:
  1. **Cloud Run Runtime Drift**: The live Cloud Run instance (`handicaplab-production-129269713730.asia-southeast2.run.app`) still holds the old exhausted key (`64db...a0a2`, `agunsux@gmail.com`, created June 2026). When Cloud Run queries `/v4/account`, it authenticates using the old key and receives `250/250` used (`remaining: 0`), returning `status: "ODDS_QUOTA_PROTECTION"`.
  2. **Supabase Database Quota Row**: Supabase PostgreSQL table `public.quota_state` row `id: 11221` holds an old October record showing `consumed: 260 / 250`, which triggers fail-closed circuit breakers for any service querying the database.
- **Monthly Reset Status**: The user's local clock is WIB (`2026-11-01T00:35:00+07:00`), but OddsPapi operates in UTC (`2026-10-31T17:35:00Z`). In UTC, the October cycle had not yet ended at the time of the audit. However, because the active key has consumed 0 requests, it did not depend on a reset to have 250 available.

---

## 3. Four User Corrections Validated

| User Correction | Audit Finding | Verdict |
| :--- | :--- | :---: |
| **A. `NO_QUALIFIED_PICKS` does not mean prediction engine is broken** | Confirmed. Engine math is sound. The endpoint returns empty because all database fixtures are in the past ($< 2026-11-01$), and Stale Data Kill Switch correctly filtered them out. | **VALIDATED** |
| **B. 20 settled records is not proof of automated recurring settlement** | Confirmed. The 20 records represent two manual historical cohorts (MW6 pilot + 8 reconciled matches). 414 completed matches remain pending in DB. | **VALIDATED** |
| **C. HTTP 200 is not proof the entire pipeline succeeded** | Confirmed. Endpoints respond HTTP 200 with fail-closed truthful empty states (`dataState: 'NO_QUALIFIED_PICKS'`). | **VALIDATED** |
| **D. OddsPapi 0 remaining could be key mismatch rather than consumption** | Confirmed. Active key has 250 available (0 consumed). Cloud Run environment held old key with 0 remaining. | **VALIDATED** |

---

## 4. Operational KPI Scorecard

| KPI | Target Standard | Measured Audit Reality | Status |
| :--- | :---: | :---: | :---: |
| **OddsPapi Monthly Quota** | 250 requests | **250 requests** (on active key `62c5...2663`) | **PASS** |
| **Protected Emergency Reserve** | 50 requests | **50 requests** (strictly enforced in allocator) | **PASS** |
| **Net Operational Budget** | 200 requests | **200 requests available** | **PASS** |
| **Actual Consumed (Active Key)** | $\le 200$ | **0 requests** (0.0%) | **OPTIMAL** |
| **Prediction Persistence** | 100% | 100% (All runs persisted to Supabase) | **PASS** |
| **Settlement OddsPapi Cost** | **0 calls** | **0 calls spent** (`FreeResultsAdapter` uses zero quota) | **PASS** |
| **Duplicate Settlements** | **0** | **0 duplicates** across all tables | **PASS** |
| **Finished Fixtures Unsettled** | 0 | **414 matches pending score update** | **ACTION REQUIRED** |
| **Upcoming Fixture Discovery** | Continuous | **0 fixtures** (API-Football suspended) | **ACTION REQUIRED** |

---

## 5. Comprehensive Forensic Deliverables

The full investigation is documented across the five required audit reports:

1. [EPIC_91_ODDSPAPI_QUOTA_FORENSICS.md](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/docs/EPIC_91_ODDSPAPI_QUOTA_FORENSICS.md)  
   *Unmetered API probe evidence, account identities, subscription parameters, and key fingerprint analysis.*
2. [ODDSPAPI_DAILY_CONSUMPTION_TIMELINE.md](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/docs/ODDSPAPI_DAILY_CONSUMPTION_TIMELINE.md)  
   *Day-by-day request egress log, endpoint breakdown, zero billable request proof, and November runway model.*
3. [SALMO_LIVE_PREDICTION_HEALTH.md](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/docs/SALMO_LIVE_PREDICTION_HEALTH.md)  
   *Ingestion status, Stale Data Kill Switch mechanics, Dixon-Coles engine status, and root cause of empty picks.*
4. [SALMO_AUTOMATIC_SETTLEMENT_HEALTH.md](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/docs/SALMO_AUTOMATIC_SETTLEMENT_HEALTH.md)  
   *20-record settlement trace, 414-match backlog inventory, FreeResultsAdapter verification, and scheduler status.*
5. [EPIC_91_EXECUTIVE_SUMMARY.md](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/docs/EPIC_91_EXECUTIVE_SUMMARY.md)  
   *High-level executive overview, final operational verdicts, and remediation roadmap.*

---

## 6. Official Final Verdicts

### ODDSPAPI VERDICT
# **`KEY/SUBSCRIPTION MISMATCH`**
*(Active key `62c5...2663` has 250/250 requests remaining; Cloud Run environment holds the legacy exhausted key `64db...a0a2`)*

### PREDICTION ENGINE VERDICT
# **`BLOCKED`**
*(Engine mathematics and code are healthy, but upstream fixture discovery is blocked by API-Football suspension, yielding 0 upcoming matches)*

### SETTLEMENT VERDICT
# **`PARTIALLY OPERATIONAL`**
*(Settlement algorithms and FreeResultsAdapter are verified, with 20/20 cohort positions settled; however, 414 completed matches remain pending due to a dormant scheduler)*

### RELEASE VERDICT
# **`MANUAL ACTION REQUIRED`**
*(No technical code rewrites needed; requires operator administrative actions outlined below)*

---

## 7. Recommended Action Roadmap (For Post-EPIC 91 Execution)

1. **Step 1: Align Cloud Run Environment Variable**:
   - Update `ODDS_PAPI_KEY` on Cloud Run (`handicaplab-production-129269713730`) to the active key (`62c5...2663`).
2. **Step 2: Initialize Supabase Quota Row**:
   - Insert/update `public.quota_state` row for `oddspapi` with `period_start: 2026-11-01`, `consumed: 0`, `limit_value: 250`, `safe_limit: 200`.
3. **Step 3: Resolve Upstream Fixture Source**:
   - Either reactivate/resolve API-Football account suspension, OR configure `FreeResultsAdapter` / `football-data.co.uk` as the primary fixture discovery provider.
4. **Step 4: Execute Backlog Sweep**:
   - Trigger `FreeResultsAdapter` to ingest verified scores for the 414 completed matches and settle all eligible pending predictions in `public.prediction_ledger`.
5. **Step 5: Activate Governed Matchday Scheduler**:
   - Schedule Cloud Scheduler or Vercel cron to execute the 40-cycle November budget schedule (160 requests planned, 40 buffer, 50 emergency reserve).

