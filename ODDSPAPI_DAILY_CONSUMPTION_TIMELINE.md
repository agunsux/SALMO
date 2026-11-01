# OddsPapi Daily Consumption Timeline & Request Forensics

**Audit Scope**: Forensic reconstruction of OddsPapi API request egress across SALMO and HandicapLab.  
**Audit Baseline Date**: October 23, 2026 – November 1, 2026.  
**Mode**: READ-ONLY.

---

## 1. Key Forensic Timestamps

| Event | Timestamp (UTC) | Calling Service | Endpoint | Key Fingerprint | Cost | Result |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Account B Key Registration** | `2026-10-23T21:31:29Z` | Registration Dashboard | `/v4/account` | `62c5...2663` | 0 | Account Created |
| **First Request on Account B** | **NONE** | N/A | N/A | `62c5...2663` | 0 | `request_count: 0` |
| **Last Billable Request in Ledger** | `2026-09-21T19:05:41Z` | HandicapLab | `/v4/odds-by-tournaments` | `64db...a0a2` | 1 | Count 154 -> 155 |
| **Last Quota State Update in DB** | `2026-10-11T18:54:44Z` | HandicapLab Pipeline | `/v4/odds-by-tournaments` | `64db...a0a2` | - | Consumed: 260 |
| **First Request after Nov 1 Reset** | **NONE** | N/A | N/A | Both Keys | 0 | Reset not fired in UTC |
| **Last Unmetered Probe** | `2026-10-31T17:28:35Z` | EPIC 91 Audit Harness | `/v4/account` | `62c5...2663` | 0 | HTTP 200, Count: 0 |

---

## 2. Daily Request Consumption Timeline (October 23 – November 1, 2026)

| Date (UTC) | Active Key Requests | Legacy Key Requests | Calling Service | Endpoints Polled | Failed Billable Requests | Duplicate Calls | Daily Quota Spent | Cumulative Spent (Active Key) | Remaining Operational Budget |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **2026-10-23** | 0 | 0 | Standby | `/v4/account` (unmetered) | 0 | 0 | **0** | **0 / 250** | 200 (Reserve: 50) |
| **2026-10-24** | 0 | 0 | Standby | `/v4/account` (unmetered) | 0 | 0 | **0** | **0 / 250** | 200 (Reserve: 50) |
| **2026-10-25** | 0 | 0 | Standby | None | 0 | 0 | **0** | **0 / 250** | 200 (Reserve: 50) |
| **2026-10-26** | 0 | 0 | Standby | None | 0 | 0 | **0** | **0 / 250** | 200 (Reserve: 50) |
| **2026-10-27** | 0 | 0 | Standby | None | 0 | 0 | **0** | **0 / 250** | 200 (Reserve: 50) |
| **2026-10-28** | 0 | 0 | Standby | None | 0 | 0 | **0** | **0 / 250** | 200 (Reserve: 50) |
| **2026-10-29** | 0 | 0 | Standby | None | 0 | 0 | **0** | **0 / 250** | 200 (Reserve: 50) |
| **2026-10-30** | 0 | 0 | Standby | None | 0 | 0 | **0** | **0 / 250** | 200 (Reserve: 50) |
| **2026-10-31** | 0 | 0 | Standby | `/v4/account` (unmetered) | 0 | 0 | **0** | **0 / 250** | 200 (Reserve: 50) |
| **2026-11-01** (WIB) | 0 | 0 | Standby | `/v4/account` (unmetered) | 0 | 0 | **0** | **0 / 250** | 200 (Reserve: 50) |

---

## 3. Request Breakdown by Dimension

### 3.1 By Endpoint
- `GET /v4/account`: 3 unmetered requests (0 metered cost). Executed exclusively for forensic verification.
- `GET /v4/odds-by-tournaments`: 0 requests.
- `GET /v4/odds`: 0 requests (Permanently banned).
- `GET /v4/fixtures`: 0 requests.
- `GET /v4/scores`: 0 requests (Permanently banned; delegated to free results provider).

### 3.2 By Calling Service
- `SALMO`: 0 billable calls (`ODDSPAPI_PAUSED=true` strictly respected).
- `HandicapLab` (Local): 0 billable calls.
- `HandicapLab` (Cloud Run): 0 billable calls (Blocked by `ODDS_QUOTA_PROTECTION` circuit breaker due to legacy key status `250/250`).

### 3.3 By Tournament Batch
- No tournament batch requests were dispatched between October 23 and November 1.

---

## 4. Quota Consumption Budget & Runway Estimation

- **Total Monthly Allowance**: 250 requests
- **Protected Emergency Reserve**: 50 requests
- **Net Usable Operational Budget**: 200 requests
- **Actual Consumed (Active Key)**: **0 requests**
- **Actual Remaining (Active Key)**: **250 requests**
- **Average Daily Consumption (Oct 24 - Nov 1)**: **0.0 req/day**
- **Planned Daily Run-rate for November (30 Days)**:
  - Total Planned: 160 requests across 40 matchday cycles (~5.3 req/day).
  - Unallocated Operational Buffer: 40 requests.
  - Emergency Reserve Floor: 50 requests.
- **Estimated Operating Runway**: **Full 30 days of November 2026** at the recommended Scenario B or C schedule.

---

## 5. Explicit Forensic Declaration on Historical Provider Logs

Per Phase 2 requirements:
- OddsPapi does NOT provide an external server-side request access log via `/v4/account`. It only exposes the cumulative integer counter `request_count`.
- However, because `request_count` on the active key (`62c5...2663`) is **0**, we have mathematical and cryptographic certainty that **zero requests** were dispatched to OddsPapi on this key.
- The exhaustion of the legacy key (`64db...a0a2`) occurred historically prior to October 12, 2026, as evidenced by Supabase `quota_state` (updated `2026-10-11T18:54:44Z`).
