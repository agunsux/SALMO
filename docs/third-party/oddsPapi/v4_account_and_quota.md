# OddsPapi REST API v4 — Account & Quota Model

- **Canonical Source URLs**:
  1. `https://oddspapi.io/us/docs/requests-and-quota` (`OddsPapi | Docs Requests & Quota`, retrieved `2026-10-13T02:05:36+07:00`)
  2. `https://oddspapi.io/us/docs/get-account` (`OddsPapi | Docs GET account`, retrieved `2026-10-13T02:05:38+07:00`)
- **Retrieval Status**: **VERIFIED (Full HTML retrieved for both pages)**

---

## 1. Official Source Facts (`/us/docs/requests-and-quota`)

### 1.1 Definition of 1 Request
- **1 Request = 1 call to a billable API endpoint**, regardless of response payload size or number of items returned (returning 1,000 events or 0 events both consume 1 request).
- Requests accumulate per subscription (`apiKey`).

### 1.2 Endpoint Quota Classification

| Classification | Endpoints | Quota Behavior |
|----------------|-----------|----------------|
| **Billable** (1 request per call) | `/v4/players`, `/v4/settlements`, `/v4/fixtures`, `/v4/fixture`, `/v4/odds-by-tournaments`, `/v4/languages`, `/v4/sports`, `/v4/bookmakers`, `/v4/markets`, `/v4/tournaments`, `/v4/participants`, `/v4/scores`, `/v4/odds` | Increments `request_count` by 1 after processing |
| **Free** (0 requests) | `/v4/historical-odds` | **Always free** — calls never increment `request_count`, but are blocked with HTTP 429 once `request_count` reaches `request_limit` |
| **Unmetered** (0 requests, never blocked) | `/v4/account` | **Always accessible**, even after `request_count` reaches or exceeds `request_limit` |

### 1.3 When Is a Request Counted? (Critical Official Rule)
According to `https://oddspapi.io/us/docs/requests-and-quota`:
- A request is counted **after the endpoint has finished processing, whether the response was successful or returned an error**:
  - `200 OK` — **COUNTED**
  - `4xx` client errors (e.g., invalid parameters, resource not found) — **COUNTED**
  - `5xx` server errors — **COUNTED**
- **Exception**: Requests rejected **before** reaching the endpoint — specifically invalid API key (`401`) or quota already exhausted (`429`) — are **NOT counted**.

### 1.4 Reaching the Limit (`HTTP 429`)
When `request_count` reaches `request_limit`, subsequent calls to billable or free endpoints (except `/v4/account`) return:

```json
{
  "message": "Request limit exceeded",
  "details": "You have exceeded your request limit of X requests.",
  "code": "REQUEST_LIMIT_EXCEEDED"
}
```

---

## 2. `/v4/account` Schema & Sanitized Evidence

### 2.1 Official Documentation Illustrative Example (`/us/docs/get-account`)
*(Explicitly labeled: illustrative example from `https://oddspapi.io/us/docs/get-account`)*

```json
{
  "api_key": "[ILLUSTRATIVE_DOC_EXAMPLE_KEY]",
  "created_at": "2025-07-14T13:29:48.525Z",
  "language_code": "en",
  "language_name": "English",
  "current_subscription_id": "v6ZgCuxA-gMTn5Bd-nKPPvkycUK-xgmNehB",
  "subscriptions": [
    {
      "subscription_id": "v6ZgCuxA-gMTn5Bd-nKPPvkycUK-xgmNehB",
      "currency": "USD",
      "price": null,
      "valid_from": "2025-07-16T13:25:00.647Z",
      "valid_until": null,
      "auto_renew": false,
      "is_active": true,
      "created_at": "2025-07-16T13:25:00.647Z",
      "bookmakers": {
        "pinnacle": {
          "has_live_odds": false,
          "has_player_props": false
        }
      },
      "sport_ids": [10, 11, 12, 13, 14, 15],
      "websocket_access": 0,
      "request_limit": 500,
      "rate_limit": null,
      "request_count": 100,
      "last_request": "2025-07-16T13:25:00.647Z"
    }
  ]
}
```

### 2.2 SALMO Sanitized Ground-Truth Snapshot ([`data/verification/oddspapi_account_response.json`](../../../data/verification/oddspapi_account_response.json))
*(Actual stored response in repository with `api_key` redacted and `bookmakers` map abbreviated for readability; verified by `tests/stage_e_odds_quota_and_ev_safety.test.js` E1.1–E1.4)*

```json
{
  "api_key": "[REDACTED]",
  "created_at": "2026-06-26T19:38:02.821232+00:00",
  "language_code": "en",
  "language_name": "English",
  "email": "[REDACTED_EMAIL]",
  "email_verified": true,
  "current_subscription_id": "[REDACTED_SUBSCRIPTION_ID]",
  "customer_segment": "user",
  "subscriptions": [
    {
      "subscription_id": "[REDACTED_SUBSCRIPTION_ID]",
      "currency": "USD",
      "price": null,
      "valid_from": "2026-06-26T19:38:02.821232+00:00",
      "valid_until": null,
      "auto_renew": false,
      "is_active": true,
      "created_at": "2026-06-26T19:38:02.821232+00:00",
      "bookmakers": {
        "pinnacle": {
          "has_live_odds": false,
          "has_player_props": false
        }
      },
      "sport_ids": [10, 11, "... through 68"],
      "websocket_access": 0,
      "request_limit": 250,
      "plan": "free",
      "request_count": 260
    }
  ]
}
```

### 2.3 Verified Schema Observations
1. **No reset timestamp field in SALMO's snapshot**: `valid_until` is `null` on the ongoing `"free"` plan, and there is no `reset_date` or `next_reset_at` property.
2. **Observed overage (`260 / 250`)**: Despite `/us/docs/requests-and-quota` stating that calls beyond `request_limit` return HTTP 429, SALMO's captured account state shows `request_count: 260` against `request_limit: 250`. (See [quota_reconciliation.md](./quota_reconciliation.md) for full analysis.)
3. **Pinnacle live odds flag**: On SALMO's `"free"` plan snapshot, `bookmakers.pinnacle` is present (`hasPinnacle = true`), with `has_live_odds: false` and `has_player_props: false`.

---

## 3. Repository Implementation Facts ([`OddsPapiQuotaGuard`](../../../src/lib/quota/oddsPapiQuotaGuard.ts))

| Constant / Mechanism | Value in Code | Code Location |
|----------------------|---------------|---------------|
| `HARD_STOP_RATIO` | `0.90` (225 of 250) | [`oddsPapiQuotaGuard.ts`](../../../src/lib/quota/oddsPapiQuotaGuard.ts) |
| `DEFAULT_MONTHLY_LIMIT` | `250` | [`oddsPapiQuotaGuard.ts`](../../../src/lib/quota/oddsPapiQuotaGuard.ts) |
| `DEFAULT_RESERVE` | `25` | [`oddsPapiQuotaGuard.ts`](../../../src/lib/quota/oddsPapiQuotaGuard.ts) |
| `MANDATORY_MULTI_LEAGUE_RESERVE` | `50` | [`oddsPapiQuotaGuard.ts`](../../../src/lib/quota/oddsPapiQuotaGuard.ts) |
| `ACCOUNT_SYNC_COOLDOWN_MS` | `1000` (matches official 1000ms cooldown) | [`oddsPapiQuotaGuard.ts`](../../../src/lib/quota/oddsPapiQuotaGuard.ts) |
| Billable Status Classification | `isBillableHttpStatus(statusCode)`: HTTP `200`, `4xx` (except `401`/`429`), and `5xx` count as billable; only `401`, `429`, or pre-response transport failures release reservations as free | [`oddsPapiQuotaGuard.ts`](../../../src/lib/quota/oddsPapiQuotaGuard.ts) |
| Monotonic In-Memory Floor | `localConsumedFloor` + `inMemoryConfirmedCost` + `confirmedReservations` retained within each `subscription_id:valid_from` cycle even when `allowProductionWrite = false`; `/v4/account` fetched with `cache: 'no-store'` | [`oddsPapiQuotaGuard.ts`](../../../src/lib/quota/oddsPapiQuotaGuard.ts) |
| Production DB Write Gate | Opt-in (`allowProductionWrite && process.env.ALLOW_PRODUCTION_DB_WRITE === 'true'`) | [`oddsPapiQuotaGuard.ts`](../../../src/lib/quota/oddsPapiQuotaGuard.ts) |

---

## 4. Unresolved Assumptions & Historical Overage Status

- **Phase 2D.1 Quota-Accounting Remediation**: [`OddsPapiQuotaGuard`](../../../src/lib/quota/oddsPapiQuotaGuard.ts) and [`OddsPapiProvider`](../../../src/services/providers/oddsPapiProvider.ts) now enforce official billing rules (counting `200`, non-401/429 `4xx`, and `5xx` as billable requests, retaining monotonic in-memory floor `localConsumedFloor`, and supporting partial batch confirmation).
- **Historical `260/250` Overage Status**: Remains **UNVERIFIED**. While Phase 2D.1 fixes the local under-counting mechanisms in code, the historical root cause of how the provider counter reached `260/250` cannot be proven without provider-side request logs.
