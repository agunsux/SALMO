# EPIC 91 — OddsPapi Quota Forensics & Account Audit Report

**Audit Date**: November 1, 2026 (Local 00:30 WIB / 2026-10-31T17:30:00Z UTC)  
**Classification**: SRE & Quantitative Systems Forensic Audit  
**Mode**: STRICTLY READ-ONLY (Zero writes, zero state mutation)  
**Verdict**: **`KEY/SUBSCRIPTION MISMATCH & CLOUD RUN DRIFT (0 REQUESTS CONSUMED ON ACTIVE KEY)`**

---

## 1. Executive Summary & Root Cause Resolution

The primary objective of Phase 1 was to determine why the OddsPapi service was reported as having zero remaining requests (0/250) following the October 23 audit.

Our forensic investigation using the unmetered OddsPapi metadata endpoint (`GET https://api.oddspapi.io/v4/account`, metered cost: **0**) has uncovered the precise dual root cause:

1. **Active Account B Key is 100% Intact with 250/250 Requests Available**:
   - The active key registered on October 23, 2026 (`62c5...2663`, account `agunsuxx@gmail.com`) currently reports:
     - `plan`: `"free"`
     - `request_limit`: **250**
     - `request_count`: **0**
     - `remaining`: **250** (100% AVAILABLE)
   - Zero billable requests have been made on this key since its creation.

2. **Cloud Run Production Runtime Drift (The Source of the "0 Remaining" Report)**:
   - The upstream Cloud Run microservice (`handicaplab-production-129269713730.asia-southeast2.run.app`) was deployed prior to October 23 and retains the **old exhausted key** (`64db...a0a2`, account `agunsux@gmail.com`, created June 26, 2026).
   - When Cloud Run's `/api/providers?view=quota` runs its live probe against `/v4/account`, it authenticates using the old key, receiving `request_count: 250 / 250` (`remaining: 0`), triggering `status: "ODDS_QUOTA_PROTECTION"`.
   - The new key was updated in local `.env.local` files on October 23 but was **never redeployed** to Cloud Run environment variables.

3. **Database Telemetry Freezing**:
   - In Supabase PostgreSQL, `public.quota_state` row `id: 11221` records `consumed: 260 / 250` for `period_start: 2026-10-01`, updated on `2026-10-11T18:54:44.133Z`. No row exists for the October 23 subscription cycle or November 2026.
   - Any service reading Supabase `quota_state` triggers the persistent hard-stop circuit breaker.

4. **Timezone & Calendar Reset Analysis**:
   - Local system timestamp: `2026-11-01T00:30:00+07:00` (WIB).
   - Canonical UTC timestamp: `2026-10-31T17:30:00Z`.
   - OddsPapi officially resets quotas on the 1st of each calendar month at `00:00:00 UTC`.
   - In UTC, it is still October 31. The November calendar reset has not yet occurred on OddsPapi servers. However, this has no negative impact on the active key (`62c5...2663`), which has 250 unused requests available immediately.

---

## 2. Unmetered Account Probe Evidence

A live query was executed against OddsPapi's unmetered metadata endpoint for both the active key and the legacy key.

### 2.1 Active Key (`SALMO/.env.local` & `HandicapLab/.env.local`)
- **Endpoint**: `GET https://api.oddspapi.io/v4/account?apiKey=62c5...2663`
- **HTTP Status**: `200 OK`
- **Account Identity**: `a***x@gmail.com` (`agunsuxx@gmail.com`)
- **Account Created At**: `2026-10-23T21:31:29.644184+00:00`
- **Subscription ID**: `5c55e28d-a6ba-41f3-bbde-38e2bef76b5f`
- **Subscription Created At**: `2026-10-23T21:31:29.644184+00:00`
- **Subscription Plan**: `free`
- **Request Limit**: `250`
- **Request Count**: `0`
- **Remaining Requests**: **`250`**
- **Sport IDs**: 59 sports enabled (including Football ID `10`)
- **Bookmakers**: 348 bookmakers enabled (including `pinnacle`, `sbobet`, `1xbet`, `bet365`)
- **Active Key Fingerprint**: Masked `62c5...2663` (Length: 36, SHA-256 Digest Prefix: `4079c8d8b2f0`)

### 2.2 Legacy Key (Deployed in Cloud Run Environment)
- **Endpoint**: `GET https://api.oddspapi.io/v4/account?apiKey=64db...a0a2`
- **HTTP Status**: `200 OK`
- **Account Identity**: `agunsux@gmail.com`
- **Account Created At**: `2026-06-26T19:38:02.821232+00:00`
- **Subscription ID**: `eda43fc3-748b-44ed-a5f0-03e45810cbd3`
- **Subscription Plan**: `free`
- **Request Limit**: `250`
- **Request Count**: **`250`**
- **Remaining Requests**: **`0`**
- **Active Key Fingerprint**: Masked `64db...a0a2` (Length: 36, SHA-256 Digest Prefix: `c45c92539358`)

---

## 3. Comparative Account Audit Matrix

| Forensic Dimension | October 23 Baseline | Cloud Run Live Probe | Local Active Key Live Probe | Audit Verdict |
| :--- | :--- | :--- | :--- | :--- |
| **Account Identity** | `agunsuxx@gmail.com` | `agunsux@gmail.com` | `agunsuxx@gmail.com` | **MISMATCH (Cloud Run Stale)** |
| **Account Creation** | 2026-10-23T21:31:29Z | 2026-06-26T19:38:02Z | 2026-10-23T21:31:29Z | **CONFIRMED 2 SEPARATE ACCOUNTS** |
| **Key SHA-256 Digest** | `4079c8d8b2f0...` | `c45c92539358...` | `4079c8d8b2f0...` | **CONFIRMED RUNTIME DRIFT** |
| **Request Limit** | 250 | 250 | 250 | **MATCH** |
| **Request Count** | 0 | 250 | 0 | **0 CONSUMED ON ACTIVE KEY** |
| **Remaining Quota** | 250 | 0 | 250 | **ACTIVE KEY HAS FULL 250** |
| **Pinnacle Bookmaker** | Available | Excluded / Limited | Available | **CONFIRMED CANONICAL TIER** |

---

## 4. Quota Reset Analysis

1. **OddsPapi Official Reset Schedule**:
   - Free plan quota resets at `00:00:00 UTC` on the 1st of every calendar month.
   - The `/v4/account` payload exposes no `valid_until` or `next_reset_at` field (`"valid_until": null`).
2. **Current System Temporal Coordinates**:
   - Local Time: `2026-11-01T00:30:24+07:00`
   - Canonical UTC Time: `2026-10-31T17:30:24Z`
   - Time remaining until UTC calendar reset: **6 hours, 29 minutes, 36 seconds**.
3. **Implications**:
   - The old account (`agunsux@gmail.com`) has not reset because it is still October 31 in UTC.
   - The new account (`agunsuxx@gmail.com`) did not need a reset because it has never been polled (`request_count: 0`).

---

## 5. Architectural & Governance Integrity

1. **Sole Polling Authority**:
   - `SALMO/.env.local` contains `ODDSPAPI_PAUSED=true`.
   - `SALMO` makes zero independent metered calls.
   - All external OddsPapi egress is centralized in HandicapLab.
2. **Emergency Reserve Enforcement**:
   - The quota allocator enforces `RESERVE_FLOOR = 50`.
   - Hard limit: 250 requests. Soft ceiling: 200 requests.
   - Because current remaining on the active key is 250, usable operational budget is **200 requests** and protected reserve is **50 requests**.
3. **Single-Fixture Anti-Pattern Elimination**:
   - All tournament calls are batched via `tournamentOddsBatch.ts` (max 5 competitions per call).
   - Calling `/v4/odds?fixtureId=` is banned by code and static analysis tests.

---

## 6. Audit Verdict: OddsPapi Quota

**VERDICT: `KEY/SUBSCRIPTION MISMATCH & CLOUD RUN DRIFT`**

- **Reason**: The OddsPapi account did NOT consume 250 requests after November 1 or October 23. The active key (`62c5...2663`) has **250 remaining out of 250** (0 requests spent). The "0 remaining" reading was generated by Cloud Run querying the legacy expired key (`64db...a0a2`) and Supabase holding a frozen row from October 11.
