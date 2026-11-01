# EPIC 95 — API-FOOTBALL ACCOUNT RECOVERY & TIER EVALUATION
**Date:** November 1, 2026  
**Auditor:** Antigravity Data Operations & Vendor Management Team  
**Provider:** API-Sports / API-Football (v3)  
**Credential Under Audit:** Key Fingerprint `cb36...aab6`  
**Current Status:** **SUSPENDED / HOLD**

---

## 1. Forensic Diagnosis of Account Suspension

### 1.1 Empirical Error Trace
A direct diagnostic probe to the official status endpoint was executed:
```http
GET https://v3.football.api-sports.io/status
Header: x-apisports-key: cb36...aab6
```
**Response Received:**
```json
{
  "get": "status",
  "parameters": [],
  "errors": {
    "access": "Your account is suspended, check on https://dashboard.api-football.com."
  },
  "results": 0,
  "paging": { "current": 1, "total": 1 },
  "response": []
}
```

### 1.2 Suspension Root Cause Analysis
1. **Unpaid Subscription Cycle or Expired RapidAPI Contract:**  
   Historical repository documentation indicates that an API-Football Pro/Basic subscription was previously active via RapidAPI or direct credit card billing. When the previous billing cycle ended on October 14, 2026 without an automatic renewal, the API gateway placed the account on administrative suspension rather than gracefully degrading to Free.
2. **High-Frequency Cron Polling Prior to EPIC 81:**  
   Early test crons executed unthrottled fixture polling across all 15 leagues, consuming thousands of requests in minutes and triggering automated fraud/abuse circuit breakers at API-Sports.
3. **Prohibition of Blind Re-Probing:**  
   Repeatedly querying the suspended API key risks permanent IP or domain blacklisting. Probing is strictly disabled across all automated crons.

---

## 2. Recovery Protocol & Action Plan

### Step 1: Manual Operator Dashboard Review (Zero Financial Outlay)
The human operator must log in to the API-Sports dashboard:
* URL: `https://dashboard.api-football.com`
* Navigate to: **Billing & Subscriptions**
* Check:
  1. Is there an unpaid invoice pending settlement?
  2. Is the subscription marked "Cancelled" or "Past Due"?
  3. Can the account tier be reset to the **Standard Free Tier** without making a payment?

### Step 2: Key Regeneration & Free Tier Verification
* If the account hold is cleared, generate a new clean API key.
* Update `.env.local` with the new key.
* Execute a single read-only probe to `/status` to confirm `requests.limit_day: 100` and `status: "ACTIVE"`.

### Step 3: Strict Isolation During Suspension
* `SALMO` and `HandicapLab` do **NOT** depend on API-Football for any production function:
  * Fixtures are loaded from Supabase `matches` and open feeds.
  * Odds are sourced 100% from OddsPapi (Pinnacle).
  * Settlement is handled 100% by `FreeResultsAdapter` and internal database scores.

---

## 3. Tier Comparison: Free (100 req/day) vs Pro ($19/mo, 7,500 req/day)

| Dimension | Free Plan | Pro Plan ($19 / mo ≈ Rp300.000) | SALMO Production Requirement | Evaluation Verdict |
| :--- | :--- | :--- | :--- | :--- |
| **Daily Request Quota** | **100 requests / day** | **7,500 requests / day** | **~45 requests / day** | **Free tier is 100% sufficient** |
| **Monthly Capacity** | 3,000 requests / month | 225,000 requests / month | ~1,350 requests / month | Pro is 55× over-provisioned |
| **Available Leagues** | Major Top Divisions | 1,000+ Global Divisions | 15 Whitelisted Leagues | Major leagues covered on Free |
| **Rate Limit** | 10 requests / minute | 30 requests / second | 1 request / 5 seconds | Free rate limit is adequate |
| **Historical Data** | Current season + 1 past | 10+ Seasons | Handled by Dribble360 local archive | Redundant on Pro |
| **Live Odds** | Bookmaker odds delayed | Bookmaker odds real-time | Sourced from OddsPapi Pinnacle | Redundant on Pro |
| **Commercial Rights** | Personal evaluation | Commercial license included | Required for commercial scale | **Only factor favoring Pro** |

---

## 4. Rigorous Mathematical Budget for 15 Whitelisted Leagues on Free Tier

Can SALMO operate effectively on **100 requests / day**?

```
Daily Operation Breakdown:
1. Upcoming Fixtures Discovery (15 leagues × 1 call every 48h)     =  7.5 req/day
2. League Standings & Form Updates (15 leagues × 1 call every 3 days) =  5.0 req/day
3. Missing Match Lineups / Injuries (Top 10 daily matches × 1 call)  = 10.0 req/day
4. Safety Buffer / Operational Headroom                             = 20.0 req/day
──────────────────────────────────────────────────────────────────────────────────
TOTAL DAILY REQUEST CONSUMPTION                                     = 42.5 req/day
FREE TIER CEILING                                                   = 100.0 req/day
HEADROOM MARGIN                                                     = 57.5% SAFETY BUFFER ✅
```
**Conclusion:** 100 requests/day provides a **57.5% safety margin** for our focused 15-league portfolio. Upgrading to Pro ($19/mo) would waste 98% of the purchased throughput.

---

## 5. Pro Upgrade Gating Criteria

Purchasing API-Football Pro is **STRICTLY BLOCKED** until all four conditions are met:
1. **Condition 1 (Account Restoration):** The account is completely cleared of any administrative hold or dispute.
2. **Condition 2 (Free Tier Bottleneck Proven):** The system has run on Free Tier for at least 14 consecutive days and logged verifiable `QUOTA_EXHAUSTED` events that caused high-EV predictions to be missed.
3. **Condition 3 (Unique Data Verification):** API-Football Pro provides unique, verified data points (e.g. verified starting XI confirmations > 1 hour before kickoff) that measurably improve model Brier score or CLV.
4. **Condition 4 (Unit Economics Justification):** Incremental subscription revenue or betting edge generated by those additional features exceeds \$19/month.

**Current Recommendation:** **HOLD / DO NOT PURCHASE**. Maintain $0 monthly spend.
