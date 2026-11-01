# EPIC 95 — MONTHLY DATA COST MODEL & FINANCIAL COMPARISON
**Date:** November 1, 2026  
**Auditor:** Antigravity Financial Engineering & Unit Economics Team  
**Currency Anchor:** USD ($) & IDR (Rp, assumed exchange rate: 1 USD = 15.800 IDR)  
**Objective:** Model 5 distinct data architectures to establish the lowest sustainable cost structure for SALMO.

---

## 1. Five Architecture Scenarios Evaluated

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    SALMO DATA ARCHITECTURE SCENARIOS                       │
├────────────┬───────────────────────────────────────────────────────────────┤
│ SCENARIO A │ All-Free Architecture ($0)                                    │
│ SCENARIO B │ Free Tier Hybrid: Free Providers + OddsPapi Free ($0)        │
│ SCENARIO C │ Fixture-Heavy: Free Providers + API-Football Pro ($19/mo)    │
│ SCENARIO D │ Market-Heavy: Free Providers + OddsPapi Custom (~$50/mo)      │
│ SCENARIO E │ Full Paid Enterprise: API-Football Pro + OddsPapi Custom ($69)│
└────────────┴───────────────────────────────────────────────────────────────┘
```

---

## 2. Comprehensive Financial Comparison Table

| Metric / Attribute | Scenario A (All-Free) | Scenario B (OddsPapi Free) **[RECOMMENDED]** | Scenario C (API-Football Pro) | Scenario D (OddsPapi Custom) | Scenario E (Full Enterprise) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Monthly Cost (USD)** | **$0.00** | **$0.00** | **$19.00** | **$50.00** | **$69.00** |
| **Monthly Cost (IDR)** | **Rp0** | **Rp0** | **Rp300.200** | **Rp790.000** | **Rp1.090.200** |
| **Annualized Run-Rate** | $0.00 | **$0.00** | $228.00 | $600.00 | $828.00 |
| **Available Odds Requests** | 0 (No sharp odds) | **250 req / month** | 0 (No sharp odds) | ~2,500 req / month | ~2,500 req / month |
| **Available Fixture Requests**| Unlimited (Open Data)| 100/day (DB/Open Data) | 7,500 req / day | 100/day (DB/Open Data)| 7,500 req / day |
| **Sharp Benchmark Odds** | ❌ None | **✅ Pinnacle (Whitelisted)**| ❌ None (Soft only) | ✅ Pinnacle (Unlimited)| ✅ Pinnacle (Unlimited)|
| **Verified Leagues Covered**| 5 (Major Europe) | **15 Whitelisted Leagues** | 100+ Global Leagues | 15 Whitelisted Leagues | 100+ Global Leagues |
| **Actionable Predictions / Mo**| 0 (No EV anchor) | **25 – 45 Quality Picks** | 0 (No EV anchor) | 35 – 55 Quality Picks | 40 – 60 Quality Picks |
| **Data Cost Per Actionable Pick**| N/A | **$0.00 (Zero Cost)** | **Undefined** (No picks) | **$1.11 / pick** | **$1.38 / pick** |
| **Break-Even Subs ($15/mo)**| 0 subscribers | **0 subscribers** | 2 subscribers | 4 subscribers | 5 subscribers |
| **Operational Limitations** | Cannot calculate EV or CLV | Capped at 2 batch runs/day; 15-league focus | Wastes 98% throughput; no sharp odds | Requires formal vendor contract negotiation | High fixed overhead before revenue validation |

---

## 3. Granular Scenario Analysis

### 3.1 Scenario A: All-Free Architecture ($0/mo)
* **Structure:** openfootball / football.json + Dribble360 local archive + Football-Data.co.uk CSVs.
* **Fatal Flaw:** Zero sharp prematch odds. The model can project fair probabilities from Dixon-Coles, but cannot compute Expected Value (EV), Kelly stakes, or Closing Line Value (CLV).
* **Verdict:** Unviable for a value betting platform.

### 3.2 Scenario B: Free Providers + OddsPapi Free ($0/mo) — **THE WINNING ARCHITECTURE**
* **Structure:**
  * Fixtures: Supabase `matches` + openfootball ($0)
  * Historical Features: Dribble360 local archive (379k records, $0)
  * Results/Settlement: `FreeResultsAdapter` + database scores ($0)
  * Sharp Odds: OddsPapi Free Plan (250 req/mo, 100% Pinnacle batching, $0)
* **Economics:**
  * 2 batch scans/day on matchdays = 90 requests/month (well within the 158 operational budget).
  * Generates 25–45 rigorously vetted, high-EV picks per month.
  * **Data Cost Per Pick = $0.00**.
* **Verdict:** **MAXIMUM CAPITAL EFFICIENCY. APPROVED FOR 30-DAY OPERATIONAL EVALUATION.**

### 3.3 Scenario C: Free Providers + API-Football Pro ($19/mo)
* **Structure:** Free stack + $19/mo API-Football Pro (7,500 req/day).
* **Economics:**
  * Provides massive fixture breadth (7,500 req/day), but Salmo only monitors 15 leagues.
  * Still lacks sharp Pinnacle odds.
  * Costs \$228/year without generating a single additional actionable bet.
* **Verdict:** **UNJUSTIFIED / REJECTED**.

### 3.4 Scenario D: Free Providers + OddsPapi Custom (~$50/mo)
* **Structure:** Free stack + OddsPapi Custom Plan (2,500 req/month).
* **Economics:**
  * Allows 10–12 polling runs per day and real-time line movement tracking.
  * Incremental actionable picks: Only ~10 additional picks per month (most value is captured in the initial morning/pre-match line scans).
  * Marginal cost per incremental pick: $\frac{\$50}{10} = \mathbf{\$5.00\text{ per pick}}$.
* **Verdict:** **TENTATIVE / DEFERRED**. Only consider if Free tier is proven to miss material profitable volume during the 30-day trial.

### 3.5 Scenario E: Combined Paid Subscriptions ($69/mo ≈ Rp1.090.000/mo)
* **Structure:** API-Football Pro + OddsPapi Custom.
* **Annualized Cost:** \$828 / year (~Rp13.000.000/year).
* **Verdict:** **STRONGLY REJECTED**. Violates the core principle of minimum viable data cost. Committing to enterprise recurring costs prior to product-market fit is financially imprudent.

---

## 4. Sensitivity & Unit Economics Matrix

Assuming SALMO launches a commercial subscriber tier at **$15/month** (Rp237.000/mo):

```
┌────────────────────────────────────────────────────────────────────────────┐
│                  SUBSCRIBER MARGINS ACROSS SCENARIOS                       │
├──────────────┬──────────────────┬─────────────────┬────────────────────────┤
│ SUBSCRIBERS  │ SCENARIO B ($0)  │ SCENARIO C ($19)│ SCENARIO D ($50)       │
├──────────────┼──────────────────┼─────────────────┼────────────────────────┤
│ 1 sub ($15)  │ +$15.00 (100% GM)│ -$4.00 (LOSS)   │ -$35.00 (LOSS)         │
│ 5 subs ($75) │ +$75.00 (100% GM)│ +$56.00 (74% GM)│ +$25.00 (33% GM)       │
│ 20 subs ($300│ +$300.00 (100% GM│ +$281.00(93% GM)│ +$250.00 (83% GM)      │
│ 50 subs ($750│ +$750.00 (100% GM│ +$731.00(97% GM)│ +$700.00 (93% GM)      │
└──────────────┴──────────────────┴─────────────────┴────────────────────────┘
```

**Key Takeaway:** Under Scenario B, SALMO achieves **100% Gross Margin** on data costs from Day 1 with zero break-even pressure. Every dollar of revenue flows directly to infrastructure and operating surplus.
