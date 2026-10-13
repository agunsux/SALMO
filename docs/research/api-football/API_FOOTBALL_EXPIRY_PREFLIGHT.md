# SALMO — API-Football Pro Expiry & Quota Preflight Report

**Audit Timestamp:** 2026-10-13T15:45:45Z
**Auditor:** Principal Quant Platform Engineer & Release Auditor
**Project:** SALMO.dev / HandicapLab
**Egress Decision:** **GO (Controlled Research Harvesting — Zero Renewal)**

---

## 1. Executive Summary

API-Football (API-Sports) Football Pro subscription was audited directly via live authenticated probe against `GET https://v3.football.api-sports.io/status`. The account is confirmed active on the **Pro** tier, with an exact expiration timestamp of **2026-10-14T07:53:10+00:00**.

With approximately **16 hours** remaining prior to subscription termination and downgrade to the restricted Free tier (which enforces a strict 100 requests/day cap and blocks access to historical seasons prior to the current year), an emergency controlled data preservation protocol has been authorized.

All harvesting is strictly rate-limited, quarantined to local persistent storage (`research/api-football/`), mirrored to independent physical secondary storage (`D:\SALMO_Backups\api_football_vault_20261013\`), and recorded in a verifiable request ledger.

---

## 2. Live Provider Verification Evidence

The live response from `GET /status` returned:

```json
{
  "get": "status",
  "parameters": [],
  "errors": [],
  "results": 0,
  "paging": { "current": 1, "total": 1 },
  "response": {
    "account": {
      "firstname": "Brian",
      "lastname": "SALMO",
      "email": "[REDACTED]@gmail.com"
    },
    "subscription": {
      "plan": "Pro",
      "end": "2026-10-14T07:53:10+00:00",
      "active": true
    },
    "requests": {
      "current": 257,
      "limit_day": 7500
    }
  }
}
```

### Response Headers Captured

| Header Name | Value | Meaning |
| :--- | :--- | :--- |
| `x-ratelimit-requests-limit` | `7500` | Daily request hard ceiling |
| `x-ratelimit-requests-remaining` | `7243` | Remaining requests available today |
| `x-ratelimit-limit` | `300` | Per-minute burst limit |
| `x-ratelimit-remaining` | `299` | Per-minute remaining tokens |
| `server` | `openresty` | API-Sports gateway |

---

## 3. Quota & Timing Precision

| Metric | Measured Value | Operational Implication |
| :--- | :--- | :--- |
| **Current Plan** | `Pro` | Full historical access (2022–2026) enabled |
| **Exact Expiry UTC** | `2026-10-14T07:53:10+00:00` | Hard deadline for historical dataset extraction |
| **Hours Remaining** | `~16.1 hours` | Window of opportunity before downgrade |
| **Daily Request Budget** | `7,500` | Allocated by provider |
| **Available Quota at Audit** | `7,243` | 96.6% of daily quota intact |
| **Safety Reserve Floor** | `500` | Hard stop threshold (fail-closed) |
| **Maximum Safe Egress Budget** | `5,500` | Capped internally to prevent provider rate spikes |
| **Throttle Delay** | `360 ms` | Enforces ~166 req/min (safely under 300 req/min limit) |

---

## 4. Operational Directives & Non-Negotiable Constraints

1. **NO RENEWAL**: Do not renew, upgrade, or add billing credentials to API-Football.
2. **ZERO ODDS PAPI EGRESS**: Do not call OddsPapi or any other paid API.
3. **FAIL-CLOSED QUOTA GUARD**: If `x-ratelimit-requests-remaining` drops $\le 500$, the harvester halts immediately.
4. **NO SENSITIVE DATA COMMITS**: API keys remain strictly in local `.env.local` and are never logged or committed.
5. **QUARANTINED STORAGE**: All raw vendor payloads are written to `research/api-football/raw/`, which is ignored by `.gitignore`.
6. **NO PRODUCTION PROMOTION**: This harvest serves research modeling and feature preservation. No production deployment, merge to main, or database migration is permitted (`PRODUCTION_DEPLOYMENT = NO-GO`).
