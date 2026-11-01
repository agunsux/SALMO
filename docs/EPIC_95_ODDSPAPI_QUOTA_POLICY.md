# EPIC 95 — ODSSPAPI QUOTA PROTECTION & CONSUMPTION POLICY
**Effective Date:** November 1, 2026  
**Auditor / Policy Author:** Antigravity Data Architecture & Cost Control Team  
**Enforcement Level:** P0 Hard Blocking Invariant across `SALMO` and `HandicapLab`  
**Governing Modules:** `SALMO/src/lib/quota/oddsPapiQuotaGuard.ts` & `HandicapLab/src/lib/providers/oddspapiQuotaAllocator.ts`

---

## 1. Contractual Quota Baseline & Financial Boundaries

Based on official provider documentation and live cryptographic account audits:
* **Plan Tier:** OddsPapi Free Plan
* **Contractual Limit:** **250 requests / calendar month**
* **Reset Cycle:** Strictly on the **1st day of every month at 00:00 UTC**
* **Audit Baseline (November 1, 2026):**
  * `request_limit`: 250
  * `request_count`: 42
  * `remaining_total`: 208
* **Mandatory Untouchable Reserve:** **50 requests** (Emergency floor; never touched for normal production cycles)
* **Maximum Operational Budget:** **158 requests** (208 total remaining - 50 reserve floor)

---

## 2. The 10 Ironclad Invariants of Quota Protection

### Invariant 1: Mandatory Batch Ingestion (Strict Prohibition of Per-Match Polling)
* Calling `/v4/odds?fixtureId=...` for individual matches is **STRICTLY PROHIBITED**.
* All odds retrieval must use the tournament batch endpoint:
  ```http
  GET /v4/odds-by-tournaments?tournamentIds=17,8,23,35,34&bookmaker=pinnacle&oddsFormat=decimal&apiKey=[REDACTED]
  ```
* A single batch request retrieves up to 5 tournaments and dozens of matches in exactly **1 metered request**.

### Invariant 2: Permanent Metadata & Participant ID Caching
* Teams, venues, and tournament participant IDs must never be re-queried once fetched.
* `DailyPicksEngine.populateParticipantMap()` caches all 3,313 participant IDs in memory and persists to `data/cache/canonical_fixtures.json`.
* Re-querying participant metadata incurs zero network calls.

### Invariant 3: Time-Stamped Odds Snapshot Caching
* Every retrieved odds snapshot is stamped with `oddsTimestampUtc` and given an in-memory TTL of **4 hours minimum**.
* Within the 4-hour window, subsequent model inference cycles reuse the cached market snapshot without contacting OddsPapi.

### Invariant 4: Pre-Filtering of Non-Actionable Fixtures
* Before any tournament ID is requested from OddsPapi:
  1. Check if the tournament has matches scheduled within the next 7 days.
  2. Check if the league is included in the approved evaluation whitelist (EPL, Championship, Serie A, La Liga, Bundesliga, Ligue 1, Eredivisie).
  3. Filter out Simulated Reality Leagues (SRL), eSports, and non-whitelisted cup competitions.
* **If zero whitelisted fixtures exist in a tournament, that tournament ID is omitted from the batch.**

### Invariant 5: Governed Production Polling Cadence
To stay well within the 158 operational budget across 30 days:
* **Cadence:** Maximum **2 batch runs per day** on matchdays (Friday to Monday), and **1 batch run per day** on non-matchdays (Tuesday to Thursday).
* **Monthly Consumption Calculation:**
  * 16 weekend/matchday runs × 2 batches = 32 requests
  * 14 weekday runs × 2 batches = 28 requests
  * Discovery overhead = 30 requests
  * **Total Estimated Monthly Spend:** **90 requests** (Well below the 158 budget, leaving a surplus of 68 requests!).

### Invariant 6: Strict Prohibition of Settlement Spend ($0 Rule)
* OddsPapi `/v4/scores` or live match endpoints **MUST NEVER BE CALLED** for settlement.
* All match results are resolved exclusively via:
  1. Level (a): Supabase PostgreSQL `public.matches` (0 API calls).
  2. Level (b): `FreeResultsAdapter` utilizing verified `football-data.co.uk` CSVs (0 API calls).

### Invariant 7: Full Utilization of Unmetered Endpoints
* `/v4/account`: Unmetered (0 cost). Used for continuous quota telemetry, verifying limit, count, and subscription status.
* `/v4/historical-odds`: Unmetered (0 cost). Used for walk-forward model calibration, closing line value (CLV) evaluation, and backtesting.

### Invariant 8: Circuit Breaker on Errors (Zero Blind Retries)
* In OddsPapi, even failed requests (e.g. 400 Bad Request) consume quota.
* **HTTP 429 (Rate Limit):** Trips the circuit breaker immediately; backoff pauses for 2 seconds. Quota is not decremented.
* **HTTP 401 / 403:** Trips circuit breaker immediately. Never retry.
* **HTTP 5xx (Server Error):** Max 1 retry after 5 seconds backoff. If it fails, fail closed.

### Invariant 9: Pre-Reservation Gate (Zero Egress Without Token)
* No network request to OddsPapi may be initiated without first acquiring a `QuotaReservation` from `OddsPapiQuotaGuard.reserveQuota()`.
* If `usableRemaining <= 0`, `reserveQuota()` returns `{ allowed: false, errorCode: 'QUOTA_EXHAUSTED' }` and the request is aborted before reaching the network interface.

### Invariant 10: Centralized Audit Logging
Every call to OddsPapi must be recorded to `data/ledger/oddspapi_call_audit.jsonl` with full forensic provenance.

---

## 3. Centralized Quota Allocator Audit Schema

Every outbound metered call to OddsPapi produces an immutable JSONL audit record:

```json
{
  "timestamp": "2026-11-01T08:47:45.098Z",
  "reservationId": "res_1793523425_8f9a2",
  "purpose": "DAILY_PREDICTION_SCAN",
  "tournamentScope": [17, 8, 23, 35, 34],
  "market": "ASIAN_HANDICAP_OVER_UNDER",
  "bookmaker": "pinnacle",
  "expectedValueThreshold": 0.02,
  "cost": 1,
  "quotaBefore": 41,
  "quotaAfter": 42,
  "quotaLimit": 250,
  "reserveFloor": 50,
  "usableRemaining": 158,
  "httpStatus": 200,
  "billingOutcome": "SUCCESS_2XX"
}
```

---

## 4. Quota Threshold Alerting & Escalation Matrix

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    ODDSPAPI CONSUMPTION THRESHOLDS                         │
├───────────────────────┬──────────────┬─────────────────────────────────────┤
│ REMAINING QUOTA       │ STATUS LABEL │ SYSTEM ACTION                       │
├───────────────────────┼──────────────┼─────────────────────────────────────┤
│ 100 - 208 requests    │ NORMAL       │ Standard 2 runs/day batch execution │
│ 75 - 99 requests      │ ECONOMY      │ Reduce to 1 run/day (morning scan)  │
│ 51 - 74 requests      │ CRITICAL     │ Only Top 3 European leagues (EPL,   │
│                       │              │ La Liga, Serie A) allowed           │
│ <= 50 requests        │ RESERVE_HOLD │ HARD STOP: Operational calls        │
│                       │              │ BLOCKED. Reserve floor preserved.   │
│ <= 5 requests         │ EXHAUSTED    │ Emergency shutdown of all calls     │
└───────────────────────┴──────────────┴─────────────────────────────────────┘
```

