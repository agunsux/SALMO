# SALMO / HANDICAPLAB — EPIC 81C FORENSIC VERIFICATION REPORT
**Daily Prediction Pipeline & Authoritative Ledger Proof**
**Mode:** Read-Only Verification | **Status:** COMPLETED | **Date:** 2026-10-16T03:10:00+07:00 (WIB) / 2026-10-15T20:10:00Z (UTC)

---

## 1. EXECUTIVE SUMMARY & VERDICT

| Category | Forensic Verdict | Key Finding |
| :--- | :---: | :--- |
| **Scheduler & Cloud Run Infrastructure** | **PASS** | Cloud Scheduler jobs enabled; Cloud Run revision `handicaplab-production-00007-jwr` healthy and responsive (HTTP 200). |
| **Fixture Discovery** | **FAIL** | API-Football returned error: `{"access":"Your account is suspended, check on https://dashboard.api-football.com."}`. |
| **Live Odds Ingestion** | **FAIL** | OddsPapi Quota Guard evaluated `0/250 remaining` (`QUOTA_CRITICAL`). Live odds fetching disabled. |
| **Prediction Calculation** | **FAIL / EMPTY** | 0 eligible fixtures discovered on 2026-10-15; run concluded as `SUCCESS_EMPTY`. |
| **Confidence & EV Gates** | **FAIL (100% REJECT)** | Without live odds, confidence score = 0, EV = null. All candidates marked `PASS` (`LEWATI`). |
| **Daily Picks Persisted** | **0 PICKS** | Supabase `daily_picks` has 0 qualified picks (`is_pick=true`). GCS ledger has 0 active picks. |
| **Durable Ledger Freshness** | **FAIL (STALE)** | GCS ledger `gs://handicap-salmo-ledger/rescue/rescue_prediction_ledger.jsonl` has **0 records** added since **2026-10-14T07:00:24Z**. |
| **Overall Pipeline Live Status** | **NO-GO / NOT LIVE** | Pipeline infrastructure is operational, but **daily predictions are NOT live** because upstream provider feeds are dead. |

> [!IMPORTANT]
> **Definitive Answer to User Question:**
> **Does the daily prediction pipeline run and write to the ledger?**
> **NO.** While Cloud Scheduler triggers Cloud Run successfully (HTTP 200), the execution discovers 0 fixtures and 0 odds, produces 0 picks, and appends **0 records** to the authoritative ledger. The system is idling safely in an empty state rather than fabricating ungrounded predictions.

---

## 2. CLOUD SCHEDULER & CLOUD RUN EXECUTION AUDIT

### 2.1 Cloud Scheduler Jobs State (`asia-southeast2`)
```yaml
Job 1: handicaplab-pipeline-daily
  URI: https://handicaplab-production-129269713730.asia-southeast2.run.app/api/cron/pipeline
  Schedule: 0 4 * * * (Etc/UTC)
  State: ENABLED
  userUpdateTime: '2026-10-15T18:03:21.739220Z'
  scheduleTime: '2026-10-16T04:00:00Z'
  status: code: -1 (Job updated during EPIC 81B; pending first execution at 04:00 UTC)

Job 2: handicaplab-rescue-daily
  URI: https://handicaplab-production-129269713730.asia-southeast2.run.app/api/cron/rescue-pipeline
  Schedule: 0 7 * * * (Etc/UTC)
  State: ENABLED
  lastAttemptTime: '2026-10-15T07:00:05.315564Z' (WIB: 14:00:05 +0700)
  status: {} (HTTP 200)
```

### 2.2 Cloud Run Execution Telemetry (`handicaplab-production`)
The latest scheduled execution occurred on **2026-10-15T07:00:05Z** (HTTP 200, Latency: 10.087s).

Step-by-step telemetry extracted directly from Cloud Logging:
1. `[2026-10-15T07:00:12.575Z]` `[GcsLedgerStorage] Successfully pulled latest ledger (598 rows) from GCS.`
2. `[2026-10-15T07:00:13.024Z]` `[Quota Guard] Status: QUOTA_CRITICAL | Remaining: 0/250`
3. `[2026-10-15T07:00:13.024Z]` `[Quota Guard] Odds fetch disabled for this run: Quota remaining (0) <= critical threshold (50)`
4. `[2026-10-15T07:00:13.025Z]` `[ApiFootballClient] Initiating request to endpoint: fixtures`
5. `[2026-10-15T07:00:16.006Z]` `[ApiFootballClient] API response reported errors for endpoint fixtures: {"access":"Your account is suspended, check on https://dashboard.api-football.com."}`
6. `[2026-10-15T07:00:16.007Z]` `[Ingestion] Discovered 0 matches across whitelisted leagues (0 eligible)`
7. `[2026-10-15T07:00:16.007Z]` `[Rescue Pipeline] No eligible fixtures today. Completing as SUCCESS_EMPTY.`

---

## 3. PREDICTION LIFECYCLE FORENSIC RECONCILIATION

| Lifecycle Stage | Expected Behavior | Actual Production Behavior | Verdict |
| :--- | :--- | :--- | :---: |
| **1. Fixture Discovery** | Fetch eligible fixtures across whitelisted leagues | API-Football endpoint returned HTTP 200 with JSON error: account suspended. 0 fixtures returned. | **FAIL** |
| **2. Odds Ingestion** | Fetch Pinnacle / SBOBET AH & OU odds | Quota Guard detected 0/250 requests remaining; aborted odds calls to protect budget. | **FAIL** |
| **3. Canonicalization** | Resolve match IDs to canonical naming (`LEAGUE_YEAR_TEAM_TEAM`) | Native canonicalization registry active; zero synthetic fallbacks triggered. | **PASS** |
| **4. Probability Calculation** | Poisson / Dixon-Coles model generates probabilities & fair odds | 0 fixtures discovered → 0 calculations performed on Oct 15. (On Oct 14: 184 calculations). | **EMPTY** |
| **5. Business Gates (Confidence / EV)** | Accept predictions with Confidence $\ge 65$ and EV $> 0.03$ | Because market odds were null, confidence = 0, EV = null. Rejection rate: 100%. | **FAIL** |
| **6. Daily Picks Creation** | Generate high-confidence picks for dashboard | 0 picks qualified. Supabase and API return `dailyPicks: []`. | **FAIL** |
| **7. Durable Ledger Write** | Append new predictions to GCS & Supabase ledgers | 0 predictions written on Oct 15. Ledger remains frozen at Oct 14. | **FAIL** |

---

## 4. DATABASE & PERSISTENT STORAGE RECONCILIATION

Direct, read-only queries were executed against production Supabase (`https://rgkrfzxipkrwqccfuqfq.supabase.co`) and Cloud Storage (`gs://handicap-salmo-ledger`):

```
Table / Object Reconciliation:
====================================================================================================
Data Store                    Total Rows  Latest Record Date            Odds Present?  Picks Count
----------------------------------------------------------------------------------------------------
GCS rescue_prediction_ledger         598  2026-10-14T07:00:08.208Z      0 / 184 (Oct 14)         0
Supabase daily_picks                  76  2026-10-15T04:19:16.738Z      None (null)              0 (all LEWATI)
Supabase active_daily_picks           22  2026-10-15T04:19:16.738Z      None (null)              0 (all LEWATI)
Supabase predictions                 510  2026-10-06T21:36:23.919Z      Historical only          0
Supabase public_prediction_ledger     13  2026-09-21T19:05:41.079Z      Historical only         13 (Sep 21)
Supabase odds_snapshots            1,041  2026-09-19T13:30:02.481Z      Stale                   N/A
Supabase matches                     933  2026-10-12T03:47:09.414Z      N/A                     N/A
SALMO live_prediction_ledger          30  2026-10-06T21:36:23.701Z      Historical               0
====================================================================================================
```

### Key Reconciliations:
1. **GCS Ledger Object:**
   - Object: `gs://handicap-salmo-ledger/rescue/rescue_prediction_ledger.jsonl`
   - Generation: `1791961224838662` (Last modified: `2026-10-14T07:00:24+0000`).
   - Total rows: exactly 598 rows.
   - Latest execution in ledger: `RUN-RESCUE-1791961208208` (2026-10-14 07:00:08 UTC).
   - In that Oct 14 run: 184 predictions were generated for 4 Championship matches (`Norwich vs Southampton`, `Portsmouth vs Sheffield Utd`, `QPR vs Derby`, `Lincoln vs West Ham`).
   - Every single one of those 184 predictions had `market_odds: null`, `market_status: "QUOTA_CRITICAL"`, `confidence_tier: "PASS"`, and `is_pick: false`.
2. **Duplicate Check:**
   - GCS ledger: 598 rows, 598 unique IDs, **0 duplicates**.
   - Supabase `daily_picks`: 76 rows, 76 unique IDs, **0 duplicates**.
   - Supabase `predictions`: 510 rows, 510 unique IDs, **0 duplicates**.
   - Supabase `public_prediction_ledger`: 13 rows, 13 unique IDs, **0 duplicates**.
3. **Synthetic Data Invariants:**
   - No synthetic fixtures, fallback scores, or fake odds exist in any production data store.
   - The system correctly refuses to hallucinate odds or picks when upstream providers fail.

---

## 5. UPSTREAM PROVIDER ROOT CAUSE ANALYSIS

| Provider | Configured Status | Actual Upstream Status | Impact on Daily Predictions |
| :--- | :--- | :--- | :--- |
| **API-Football** | `APIFOOTBALL_KEY` configured in Secret Manager | **Account Suspended** (`{"access":"Your account is suspended..."}`) | Ingestion receives 0 matches. Pipeline immediately halts with `SUCCESS_EMPTY`. |
| **OddsPapi** | `ODDS_PAPI_KEY` configured in Secret Manager | **Quota Exhausted** (`0/250 remaining`, `QUOTA_CRITICAL`) | Odds fetching is hard-blocked by Quota Guard. Even if fixtures were known, no odds could be ingested. |
| **Dribble360** | Available as research dataset | No live odds endpoint; match data only | Cannot supply live AH/OU bookmaker odds needed for betting EV calculations. |

---

## 6. RELEASE GATE VERDICT & RECOMMENDATIONS

### Final Decision:
- **Local Commit (EPIC 81 / 81B):** **APPROVED (GO)**
  - All 14/14 invariant tests pass.
  - All 75/75 regression checks pass.
  - Next.js production build passes.
  - Vercel SSR timeout remediation and GCS CAS lease locking are verified locally.
- **Production Deployment (Cloud Run & Vercel):** **STRICT NO-GO**
  - Deploying now will not produce daily predictions.
  - Until API-Football subscription is renewed/reactivated and OddsPapi quota is refreshed (or alternative live odds provider is integrated), the daily pipeline will continue to exit with `SUCCESS_EMPTY` and 0 ledger records.

### Action Items for Production Go-Live:
1. **Reactivate API-Football Account:**
   - Resolve account suspension on `dashboard.api-football.com`.
2. **Refresh OddsPapi Quota or Switch Provider:**
   - Reset the 250 request monthly quota or increase tier to enable live AH/OU odds retrieval.
3. **Verify Staging First Run:**
   - Run a single staging execution once provider credentials are confirmed active to prove that predictions pass EV gates and write to the GCS ledger with valid timestamps.
4. **Deploy Cloud Run Revision & Vercel Production:**
   - Once end-to-end data flow is proven with non-zero ledger outputs.
