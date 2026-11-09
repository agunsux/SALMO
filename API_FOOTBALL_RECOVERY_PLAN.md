# API-FOOTBALL RECOVERY PLAN & ARCHITECTURE REMEDIATION

**Project:** Salmo.dev & HandicapLab  
**Audit Date:** November 7, 2026  
**Auditor:** Senior Infrastructure Engineer, Security Engineer & API Integration Specialist  
**Target Posture:** Provider-Compliant, Single-Origin, Rate-Limited & Highly Resilient

---

## 1. Executive Summary & Recovery Philosophy

This recovery plan provides a safe, provider-compliant pathway to resolve the API-Football account suspension and re-establish data ingestion without risking re-suspension or destabilizing production operations.

### Non-Negotiable Recovery Directives:
1. **Zero New Accounts:** Do NOT create replacement accounts or rotate keys to bypass suspension. Recovery must proceed exclusively through the single existing authorized account (`Brian SALMO`).
2. **Explicit Provider Confirmation Required:** Do NOT resume automated ingestion until API-Sports support confirms the account is reinstated and active on the Free tier.
3. **No Blind Re-Probing:** Do NOT query the suspended key in rapid loops; execute only single, controlled health-check probes.
4. **Single-Origin Egress:** Transition all future API-Football traffic away from shared serverless dynamic IP pools (Cloud Run / Vercel Lambda) to a single stable origin (dedicated static egress or local worker).
5. **Strict Rate Limiting for Free Tier:** Cap requests at $\le 6$ requests/minute (1 request every 10 seconds) with bounded concurrency = 1.

---

## 2. Phase 1 — Account Recovery Protocol

### Step 1.1: Operator Dashboard Review (Manual, $0 Outlay)
The human operator must log in to the official API-Sports dashboard:
- **URL:** `https://dashboard.api-football.com`
- **Account Identity:** `[REDACTED]@gmail.com`
- **Actions Required:**
  1. Navigate to **Billing & Subscriptions**.
  2. Inspect whether the Pro subscription shows an unpaid invoice, expired status, or charge dispute.
  3. Confirm whether an option exists to reset or downgrade the account to the **Standard Free Tier (100 requests/day)** without financial outlay.
  4. If the dashboard displays an explicit "Account Suspended / Fraud Review" banner, proceed immediately to Step 1.2.

### Step 1.2: Formal Support Escalation
- Submit the formal escalation text drafted in [`API_FOOTBALL_SUPPORT_ESCALATION_DRAFT.md`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/API_FOOTBALL_SUPPORT_ESCALATION_DRAFT.md) via the API-Sports contact form or support email (`support@api-sports.io`).
- Clearly communicate:
  - We operate only **one** account.
  - We previously subscribed to the paid Football Pro plan until its scheduled expiration on October 14, 2026.
  - Our previous architecture utilized Google Cloud Run and Vercel, which egress via shared cloud IP pools.
  - We have remediated our architecture to ensure requests will originate exclusively from a single dedicated egress IP or local worker under strict 100 req/day and 10 req/min limits.
  - Request formal review and account reinstatement to Free tier.

---

## 3. Phase 2 — Architecture Remediation

To guarantee compliance upon reinstatement, the API client architecture must be hardened across 8 core dimensions:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        REMEDIATED INGESTION ARCHITECTURE                               │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│   Vercel / Cloud Run (Public Web App)                                                  │
│   ├── Reads exclusively from Supabase / Local Parquet Cache                            │
│   └── NEVER calls api-sports.io directly (Zero Outbound Key in Serverless)             │
│                                                                                        │
│                                      │                                                 │
│                                      │ (Job Queue / DB Sync)                           │
│                                      ▼                                                 │
│   Single Controlled Ingestion Worker (Local Operator / Dedicated Static IP)            │
│   ├── Single Provider Client (Consolidated)                                            │
│   ├── Concurrency Control: Strictly Sequential (Concurrency = 1)                       │
│   ├── Rate Limiter: Token Bucket @ 1 req / 10s (6 req/min << 10 req/min ceiling)       │
│   ├── Request Normalizer & In-Flight Dedup                                             │
│   ├── Distributed Persistent Cache (24h TTL for fixtures; 72h for standings)           │
│   ├── Bounded Retries: Max 1 retry, Exponential Backoff + Jitter, Honors Retry-After   │
│   ├── Circuit Breaker: 3 consecutive 4xx/5xx → OPEN (Pause 15 mins)                   │
│   └── Writes normalized fixtures to Supabase `matches`                                 │
│                                                                                        │
│                                      │                                                 │
│                                      │ Outbound HTTPS (Single Static IP)               │
│                                      ▼                                                 │
│                       https://v3.football.api-sports.io                                │
│                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Single Consolidated Provider Client
- Deprecate all legacy and bypass fetchers (`HttpClient.ts`, `apiFootball.ts`, direct `axios` scripts).
- Standardize all queries through `src/services/providers/apiFootballProvider.ts`.
- Prohibit browser/client execution via compile-time and runtime guards (`typeof window !== 'undefined'`).

### 3.2 Concurrency & Pacing Controls
- Enforce strict sequential execution:
  ```typescript
  export class RateLimitedQueue {
    private static minDelayMs = 10000; // 10 seconds = 6 req/min
    private static lastRequestMs = 0;

    public static async schedule<T>(fn: () => Promise<T>): Promise<T> {
      const now = Date.now();
      const elapsed = now - this.lastRequestMs;
      if (elapsed < this.minDelayMs) {
        await new Promise(resolve => setTimeout(resolve, this.minDelayMs - elapsed));
      }
      this.lastRequestMs = Date.now();
      return fn();
    }
  }
  ```

### 3.3 Request Normalization & Deduplication
- Normalize query parameters alphabetically before cache lookup to eliminate redundant calls:
  `buildCacheKey('/fixtures', { season: '2026', league: '39' }) === buildCacheKey('/fixtures', { league: '39', season: '2026' })`

### 3.4 Bounded Retries & Backoff
- Maximum retry count: **1**.
- Backoff formula: `delay = Math.min(60000, 10000 * Math.pow(2, attempt) + Math.random() * 2000)`.
- If response contains `Retry-After` header, backoff must strictly pause for the indicated duration.
- HTTP 429 must immediately halt the queue for 60 seconds without retrying immediately.

### 3.5 Provider Circuit Breaker
- State Machine: `CLOSED` (Normal) → `OPEN` (Tripped after 3 consecutive errors) → `HALF-OPEN` (Single diagnostic probe after 15-minute cooldown).
- When `OPEN`, all calls fail closed with `DATA_UNAVAILABLE`, preserving existing database fixtures without spamming the provider gateway.

### 3.6 Environment Credential Segregation
- **Production Key:** Scoped strictly to the dedicated worker / production environment.
- **Preview Key:** Strictly prohibited; Vercel preview environments must never contain `API_FOOTBALL_KEY`.
- **Local Dev:** Use cached JSON snapshots in `data/research/api-football/` by default.

---

## 4. Phase 3 — Egress Infrastructure Options

Because API-Sports flags shared cloud IP ranges (Google Cloud Run / AWS Lambda), future traffic must egress through a stable origin:

| Egress Option | Implementation Mechanism | Est. Monthly Cost | Stability / IP Control | Recommendation |
| :--- | :--- | :---: | :--- | :--- |
| **Option A: Local Dev / Manual Harvester** | Run batch harvesting from operator machine (Node CLI) | **$0.00** | Stable residential ISP IP | **RECOMMENDED FOR TRIAL** |
| **Option B: Cloud Run with Cloud NAT** | Serverless VPC Access + Cloud NAT + Static IP | ~$35.00 | Dedicated Google Static IP | Overkill for Free tier |
| **Option C: Small VPS Worker (Hetzner / DO)** | Dedicated single-core VPS with assigned static IPv4 | ~$4.00 | Dedicated Static IPv4 | Excellent for future scale |
| **Option D: Fly.io Micro Worker** | `shared-cpu-1x` (256MB) + dedicated IPv4 | ~$3.50 | Dedicated Static IPv4 | Viable low-cost cloud option |

**Decision for Trial on Free Tier:** **Option A (Local Ingestion)**.  
Because the Free tier permits only 100 requests/day, scheduled batch scripts can be executed locally once daily by the operator. This incurs **$0 cost** and completely eliminates cloud shared-IP contamination.

---

## 5. Phase 4 — Controlled Re-Entry Validation Protocol

Once API-Sports support confirms the account is reinstated:

```
[SUPPORT REINSTATEMENT CONFIRMATION]
                │
                ▼
  [Step 1: Single Diagnostic Health Check]
  Execute GET /status (1 request only)
  Verify: status === 'ACTIVE', requests.limit_day === 100
                │
                ├────────────────────────────────────────┐
                │ FAIL (Still suspended or limit mismatch)│
                ▼                                        ▼
         [Halt & Escalate]                      [Step 2: Dry-Run Pacing Verification]
                                                Verify token bucket enforces 10s gap
                                                         │
                                                         ▼
                                                [Step 3: Low-Volume Single League Probe]
                                                Fetch Premier League fixtures (1 request)
                                                Confirm HTTP 200 & valid JSON payload
                                                         │
                                                         ▼
                                                [Step 4: Controlled Daily Batch Run]
                                                Execute 15-league fixtures (15 requests)
                                                Duration: 15 req × 10s = 150 seconds
                                                Monitor x-ratelimit-requests-remaining
                                                         │
                                                         ▼
                                                [Step 5: Steady State Production]
                                                Daily run at 06:00 UTC (42.5 req/day max)
```

---

## 6. Rollback & Fail-Safe Contingency

If API-Sports denies reinstatement or requires a paid subscription:
1. **Maintain Zero Expense:** Do NOT upgrade to Pro ($19/mo) unless all 4 Gating Criteria of EPIC 95 are satisfied.
2. **Permanent Decoupling:** Continue operating Salmo's primary research and live pipeline using open fixture discovery feeds (`openfootball`, TheSportsDB) and Supabase match data.
3. **Pinnacle Market Integrity:** OddsPapi remains the uncompromised source of truth for Asian Handicap and Goal Line odds.
