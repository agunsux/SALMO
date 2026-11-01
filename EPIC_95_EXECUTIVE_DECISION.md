# EPIC 95 — EXECUTIVE DECISION & STRATEGIC ROADMAP
**Date:** November 1, 2026  
**Decision Authority:** SALMO & HandicapLab Executive Leadership  
**Effective Period:** November 1, 2026 – November 30, 2026 (30-Day Evaluation Window)  
**Core Mandate:** **Zero Recurring Data Expense ($0/mo) with Maximum Sharp Prediction Quality**

---

## 1. Definitive Provider Policy Matrix

```
========================================================================================
PROVIDER            ACTION      COST/MO     RATIONALE & OPERATIONAL BOUNDARIES
========================================================================================
OddsPapi            KEEP (Free) Rp0 ($0)    250 req/mo. Batch Pinnacle odds only.
                                            50 reserve floor protected. 158 budget.
API-Football Pro    HOLD        Rp0 ($0)    Account suspended. Do NOT pay $19/mo.
                                            Evaluate Free (100 req/day) once cleared.
OddsPapi Custom     HOLD        Rp0 ($0)    Do NOT negotiate Custom before completing
                                            30-day operational proof on Free tier.
Dribble360          ARCHIVE     Rp0 ($0)    Let subscription expire Dec 1, 2026.
                                            379k records archived permanently.
Football-Data.co.uk COMPLY      Rp0 ($0)    Internal research evidence only.
                                            Send written waiver request for commercial.
The-Odds-API        STANDBY     Rp0 ($0)    Free tier (500 req/mo) as emergency backup.
TheSportsDB         STANDBY     Rp0 ($0)    Free community metadata & logos ($0).
========================================================================================
TOTAL MONTHLY RECURRING COMMITMENT:         Rp0 / month ($0.00 / month)
========================================================================================
```

---

## 2. Core Architectural Principles Enforced

1. **Principle 1 — Minimum Viable Data Cost:**  
   Every dollar spent on third-party APIs must generate verifiable marginal predictive edge. A free solution that provides 95% of the required accuracy is vastly superior to a $100/month enterprise feed that adds zero actionable betting volume.
2. **Principle 2 — Strict Non-Duplication:**  
   Never pay two separate providers for the same dataset. Sourcing fixtures from API-Football, OddsPapi, and TheSportsDB simultaneously is strictly prohibited.
3. **Principle 3 — Four-Layer Segregation:**  
   Historical data, fixture discovery, market odds, and settlement are four decoupled layers. If OddsPapi is down, settlement continues unaffected; if API-Football is suspended, live predictions proceed seamlessly.
4. **Principle 4 — Zero Sacrifice of Sharp Odds Integrity:**  
   Cost savings are achieved on discovery, metadata caching, and settlement—**never** by substituting low-quality soft bookmaker odds for Pinnacle benchmark prices.

---

## 3. The 30-Day Operational Evaluation Scorecard (Nov 1 – Nov 30, 2026)

Rather than judging provider necessity by raw request counts, SALMO will track the following 9 KPIs throughout November 2026:

| KPI # | Operational Metric | Target Threshold | Evaluation Methodology |
| :---: | :--- | :--- | :--- |
| **1** | **Pinnacle Odds Match Rate** | $\ge 85\%$ of whitelisted matches | Ratio of target matches receiving valid Pinnacle decimal lines |
| **2** | **Market Completeness** | $\ge 90\%$ have both AH and OU | Ensures balanced multi-market portfolio |
| **3** | **Quality Gate Pass Rate** | $15\% - 30\%$ of matched fixtures | Model probability, edge, and confidence filtering |
| **4** | **Actionable Picks Per Day** | $1.0 - 2.5$ picks / matchday | True actionable volume (LAYAK) |
| **5** | **Kickoff Odds Availability** | Fresh odds $\le 4\text{ hours}$ before kickoff | Elimination of stale price execution |
| **6** | **Closing Line Comparison** | $100\%$ matched against closing line | Tracking market drift |
| **7** | **Average CLV** | $> +1.5\%$ across cohort | Independent mathematical proof of betting edge |
| **8** | **Model Brier Score** | Lower than naive market baseline | Probabilistic calibration rigor |
| **9** | **Data Cost Per Actionable Pick** | Strictly **\$0.00** | Proves unit economic sustainability |

---

## 4. Specific Action Runbook for Operations

### 4.1 OddsPapi Management (Immediate)
* Maintain `OddsPapiQuotaGuard` hard stop at 50 requests.
* Run batch tournament queries twice daily on matchdays (Friday 18:00 UTC, Saturday 10:00 UTC, Sunday 10:00 UTC) and once daily on weekdays.
* Log all calls with explicit purpose and expected value in `data/ledger/oddspapi_call_audit.jsonl`.

### 4.2 API-Football Resolution (Immediate)
* Operator to log in to `dashboard.api-football.com` and inspect billing/hold status.
* If cleared without payment, obtain a clean API key for Free Tier (100 req/day).
* If payment or chargeback is demanded, **leave the account suspended indefinitely**.

### 4.3 Dribble360 Sunset Protocol (By November 30, 2026)
* Confirm auto-renewal is cancelled before December 1, 2026.
* Verify local DuckDB database contains all 379,143 records from `HandicapLab/data/harvest/dribble360/`.
* Back up the Parquet files to secondary cold storage.

### 4.4 Commercial Licensing Compliance (Immediate)
* Dispatch formal data usage inquiry to Joseph Buchdahl (`football-data.co.uk`) requesting commercial score verification authorization.
* Direct production settlement to rely on database match records and open-source data feeds (`openfootball`).

---

## 5. Summary Conclusion

SALMO enters November 2026 in its strongest architectural and financial position to date:
* **Predictions:** Active and generating real Pinnacle-backed recommendations.
* **Settlement:** 100% automated, accurate to the quarter-line, and completely free.
* **Historical Data:** Fully archived across 8 seasons (379,143 records).
* **Monthly Data Cost:** **$0.00 / month (Rp0)**.

The platform requires **zero new capital commitments** to operate at peak analytical rigor.
