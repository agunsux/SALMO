# ODDSPAPI LIVE DATA READINESS & QUOTA AUDIT

**Document Identifier**: `docs/epic100f/ODDSPAPI_LIVE_READINESS.md`  
**Parent Epic**: EPIC 100F — Production Parity, Adversarial Audit & Live Data Readiness  
**Authors**: Astra / DeepMind Advanced Agentic Coding Pair  
**Status**: COMPLETE / FORENSICALLY VERIFIED  
**Production Status**: STRICTLY NO-GO (Provider Quota Exhaustion)  

---

## 1. Executive Summary

A core question in the user's review was:
> *"Odds Pinnacle — Belum membuktikan OddsPapi production benar-benar bekerja."*
> *"Real Madrid vs Manchester City dengan odds Pinnacle 2.05 merupakan skenario pengujian lokal."*

In EPIC 100F, we conducted an adversarial audit of the OddsPapi production integration, quota limits, circuit breaker behavior, and market data contracts.

### Critical Ground Truth:
1. **Live OddsPapi Quota is Exhausted**:
   The live account state (verified in `data/verification/oddspapi_account_truth.json` and Gate E test suite) shows:
   $$\text{Consumed Requests} = 260 \quad / \quad \text{Monthly Quota} = 250$$
   The account has **exceeded its monthly allocation by 10 requests**.
2. **Hard Circuit Breaker Tripped**:
   `OddsPapiQuotaGuard` has permanently tripped its circuit breaker. Any attempt to invoke live OddsPapi endpoints returns `HTTP 429: Too Many Requests` or is blocked preemptively by `ODDSPAPI_PAUSED=true`.
3. **No Reset Date in OddsPapi API**:
   Forensic testing confirms that OddsPapi's `/v4/account` endpoint **does not expose a billing reset date**. Therefore, automated scheduling cannot assume when quota will replenish.
4. **Settlement Anti-Leakage Invariant**:
   Under no circumstances is OddsPapi called during match settlement. Settlement requires only verified final scores ($G_H, G_A$), which are supplied by football result providers (API-Football) or local score updates. Odds at prediction time are strictly retrieved from the immutable `prediction_ledger`.

---

## 2. Live Account Truth Specification

From `data/verification/oddspapi_account_truth.json`:

```json
{
  "status": "success",
  "data": {
    "user_id": 1452,
    "email": "salmo.dev.internal@***",
    "quota_limit": 250,
    "quota_count": 260,
    "valid_from": "2026-03-31T20:25:02.000000Z",
    "sports": [
      { "id": 10, "name": "Football" }
    ],
    "bookmakers": [
      { "id": 2, "name": "Pinnacle", "slug": "pinnacle" },
      { "id": 15, "name": "Bet365", "slug": "bet365" },
      { "id": 22, "name": "1xBet", "slug": "1xbet" }
    ]
  }
}
```

### Key Observations:
- **Pinnacle Coverage**: Pinnacle (ID 2) is present in the account subscription, confirming that when quota is available, sharp Pinnacle odds can be ingested for Asian Handicap and Over/Under.
- **Quota Overdraft**: `quota_count` (260) exceeds `quota_limit` (250).
- **Billing Period**: `valid_from` is `2026-03-31T20:25:02Z`. No `reset_at` or `valid_until` field is provided by the upstream API.

---

## 3. Quota Guard & Circuit Breaker Mechanics

In `src/lib/oddspapi/quotaGuard.ts`, three defensive layers prevent uncontrolled API calls:

```typescript
// Layer 1: Environment Pause Flag
if (process.env.ODDSPAPI_PAUSED === 'true') {
  throw new Error('[OddsPapiQuotaGuard] API calls paused via ODDSPAPI_PAUSED flag.');
}

// Layer 2: Reserve Floor Hard Stop
const reserveFloor = 25; // 10% reserve for critical ops
if (consumedCount >= (limit - reserveFloor)) {
  throw new Error(`[OddsPapiQuotaGuard] Quota exhausted: ${consumedCount}/${limit}`);
}

// Layer 3: Circuit Breaker on 429
if (lastStatusCode === 429) {
  this.circuitTripped = true;
  throw new Error('[OddsPapiQuotaGuard] Circuit breaker tripped by 429.');
}
```

### Empirical Test Evidence:
In `tests/p0_atomic_oddspapi_quota_reservation.test.js`:
- `E2.1: Quota guard enforces hard stop when consumed (260) exceeds limit minus reserve (225)`: **PASS**
- `E2.2: Pre-reservation blocks execution atomically when quota is insufficient`: **PASS**
- `E2.3: Circuit breaker trips on HTTP 429 and HTTP 401 without incrementing quota count`: **PASS**

---

## 4. Anti-Fabrication & Rule Zero Compliance

**Rule Zero**: Salmo never fabricates odds or decisions.
- Synthetic odds (such as Pinnacle 2.05 in the UCL acceptance test) are strictly labeled and restricted to isolated local integration tests (`source_type = 'SIMULATION'`).
- In live operation, if OddsPapi cannot be contacted due to quota exhaustion, the pipeline returns `ODDS_UNAVAILABLE` or `AWAITING_ODDS`.
- The system **never** substitutes mock odds, never uses non-Pinnacle bookmakers as a sharp reference, and never generates an actionable decision without authentic verified odds.

---

## 5. Conclusion & Production Impact

Because the live OddsPapi quota is exhausted (260/250) and live Pinnacle odds cannot be fetched without quota renewal or plan upgrade, **live automated decision generation cannot run in production**.

This finding independently mandates a **PRODUCTION NO-GO**.
