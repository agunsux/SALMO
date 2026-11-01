# EPIC 92 — ODDSPAPI PRODUCTION ACTIVATION & QUOTA GOVERNANCE REPORT

**Date:** 2026-11-01  
**Repository:** SALMO × HandicapLab  
**Author:** Antigravity Autonomous Pair Programmer  

---

### 1. Account Status & Unmetered Probe Verification

The production OddsPapi account was probed using the unmetered `/v4/account` endpoint to verify authentication, subscription tier, and request consumption without incurring billable usage.

```json
{
  "email": "agunsuxx@gmail.com",
  "plan": "free",
  "request_limit": 250,
  "request_count": 19,
  "is_active": true,
  "valid_from": "2026-09-08T03:47:08.040Z",
  "bookmakers": ["pinnacle", "1xbet", "bet365", "unibet", "williamhill"],
  "sports": [
    { "id": 10, "name": "football", "slug": "football" }
  ]
}
```

- **Authentication Key:** Verified active key `62c5...2663` (SHA-256 redacted).
- **Billing Tier:** Free Tier (250 requests/month).
- **Consumed Count:** 19 requests used.
- **Remaining Requests:** 231 requests.
- **Emergency Reserve:** 50 requests (strictly locked).
- **Operational Budget:** 181 requests available for November 2026.

---

### 2. Live Prematch Verification Request

A minimal prematch request was executed against OddsPapi for the Premier League (`tournamentId: 17`) to verify network connectivity, payload integrity, and atomic billing increments.

- **Endpoint:** `GET /v4/odds-by-tournaments?sport=football&tournaments=17&bookmaker=pinnacle`
- **Method:** `OddsPapiProvider.getBatchTournamentOdds([17], 'pinnacle')`
- **HTTP Status:** 200 OK
- **Latency:** 2,731 ms
- **Odds Records Received:** 436 live odds records
- **Count Delta:** 18 $\to$ 19 (exactly 1 request consumed, verified atomically via unmetered `/v4/account`).

---

### 3. Supabase Quota State Reconciliation

The database table `public.quota_state` was inspected and reconciled to reflect the exact account state for the November 2026 billing cycle.

```sql
SELECT id, provider, consumed, limit_value, safe_limit, safety_reserve_pct, period_start, period_end
FROM public.quota_state
WHERE provider = 'oddspapi' AND period_start >= '2026-11-01';
```

**Reconciled Row Metadata:**
- `id`: `19903`
- `provider`: `'oddspapi'`
- `consumed`: `19`
- `limit_value`: `250`
- `safe_limit`: `200`
- `safety_reserve_pct`: `20`
- `period_start`: `'2026-11-01'`
- `period_end`: `'2026-11-30'`

---

### 4. Quota Guard Thresholds & Alerting Policy

The system enforces multi-tiered quota monitoring across three critical thresholds:

| Threshold | Utilization | Consumed Requests | Remaining Requests | System Behavior |
| :--- | :---: | :---: | :---: | :--- |
| **Normal** | 0% – 69.9% | 0 – 174 | 250 – 76 | Standard batch tournament operations permitted. Max 5 tournaments per call. |
| **Warning (70%)** | 70.0% – 84.9% | 175 – 211 | 75 – 39 | Log elevated warning. Restrict polling to matchday horizons (T-24h only). |
| **Elevated (85%)** | 85.0% – 94.9% | 212 – 236 | 38 – 14 | Restrict polling to Premier League only. Disable secondary league discovery. |
| **Hard Stop (Reserve Floor)** | $\ge$ 95.0% or $\le 50$ left | 237 – 250 | $\le 50$ | **CIRCUIT BREAKER OPEN**: All OddsPapi requests strictly blocked. Zero quota consumption. System fails closed gracefully. |

---

### 5. Architectural Guardrails Verified

1. **Zero Egress on Match Results:** Match results and settlements are strictly forbidden from calling OddsPapi. All settlement results are resolved via `FreeResultsAdapter` (`football-data.co.uk`) and local database scores.
2. **Batching Enforcement:** No per-fixture `/odds` calls are permitted. All odds requests must use `/odds-by-tournaments` batching (up to 5 tournament IDs per request).
3. **Idempotency & Pre-Reservation:** Quota reservations are claimed atomically in PostgreSQL before network execution and confirmed only upon HTTP 200 responses.
