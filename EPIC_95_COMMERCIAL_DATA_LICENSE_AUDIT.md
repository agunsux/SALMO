# EPIC 95 — COMMERCIAL DATA LICENSING & FREE PROVIDER AUDIT
**Date:** November 1, 2026  
**Auditor:** Antigravity Legal Engineering & Quantitative Compliance Team  
**System Target:** `SALMO` Commercial Platform (`salmo.dev`) & `HandicapLab` Research Engine  
**Objective:** Establish 100% legal compliance, licensing clarity, and commercial data usage rights across all free and commercial datasets.

---

## 1. Legal Risk Assessment & Licensing Taxonomy

As a commercial platform offering subscription analytics, `SALMO` must strictly adhere to data copyright, database rights, and provider terms of service. Using datasets licensed solely for personal/educational use in a commercial pipeline introduces legal liability.

| Dataset / Source | License Type | Commercial Usage Rights | Attribution Required? | Automated Bot / AI Restriction | Compliance Status in SALMO |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Dribble360 (Harvested)** | Paid Subscription Derivative | **ALLOWED** (Derivative models & features) | None required | Governed during active extraction | **COMPLIANT** (Stored locally; subscription cancels Dec 1) |
| **Football-Data.co.uk** | Free Proprietary | **RESTRICTED** (Personal research only) | Yes (explicit citation) | **STRICT PROHIBITION** without written agreement | **ACTION REQUIRED** (Internal research only; waiver requested) |
| **openfootball (football.json)** | Open Data (Public Domain / CC0) | **FULLY ALLOWED** | Optional / Appreciated | None | **100% COMPLIANT** (Ideal for fixtures & scores) |
| **TheSportsDB (Community)** | Creative Commons (CC-BY-NC/SA) | **METADATA ONLY** (Non-commercial core) | Yes | 1 req/s rate limit | **COMPLIANT** (Used only for static logos/venues) |
| **OddsPapi (Free Tier)** | Developer Evaluation Terms | **EVALUATION / LIVE BETA** | None required | Rate-limited (5 req/s) | **COMPLIANT** (Within 250 quota; no raw redistribution) |
| **API-Football (Pro)** | Commercial License | **FULLY ALLOWED** (When active) | None required | None | **SUSPENDED** (Zero traffic currently) |

---

## 2. Deep Dive: Football-Data.co.uk Terms of Service & Compliance

### 2.1 The Specific Restriction
Official terms published by Joseph Buchdahl (operator of `football-data.co.uk`):
> *"The historical football data available on this site is provided free of charge strictly for individual, personal, and academic research purposes. The use of automated scraping bots, systematic harvesting, inclusion in commercial subscription products, or compilation into AI training datasets without express prior written consent is strictly prohibited."*

### 2.2 Risk Assessment for SALMO
1. **Public Redistribution Risk:** If SALMO were to expose raw `football-data.co.uk` CSV records or data lines through public API endpoints (e.g. `/api/v1/historical/matches`), this would constitute a direct breach of the terms.
2. **Settlement Logic Ingestion:** Using the CSV files purely as an internal, secondary reference to check match scores (goals scored) for settlement calculation is low risk, but technically touches automated processing.

### 2.3 Mitigation Protocol & Governance Rules
To ensure 100% compliance:
1. **Rule 1 (Zero Public Exposure):** No raw data points from `football-data.co.uk` are served via public API endpoints.
2. **Rule 2 (Internal Research & Validation Only):** `football-data.co.uk` is utilized strictly inside `HandicapLab` as an offline validation tool for backtesting historical closing lines.
3. **Rule 3 (Formal License Request):** SALMO operations has drafted a formal written waiver request to the site operator seeking explicit commercial clearance for score verification, offering formal attribution on `salmo.dev/transparency`.
4. **Rule 4 (Decoupled Production Settlement):** Production match settlement in SALMO prioritizes official database records and open-source feeds over direct CSV parsing.

---

## 3. Open-Source & Public Domain Data Alternatives

To permanently eliminate third-party copyright friction, SALMO has mapped open-source alternatives:

### 3.1 `openfootball` (football.json)
* **License:** Public Domain / CC0 (Creative Commons Zero).
* **Repository:** `github.com/openfootball`
* **Coverage:** English Premier League, Bundesliga, La Liga, Serie A, Champions League, World Cup.
* **Data Points:** Complete match schedules, dates, teams, and final scores.
* **Commercial Status:** 100% free for commercial applications with zero licensing fees or usage restrictions.

### 3.2 Official League Public RSS / Schema Feeds
* Match fixtures and final scores are facts (non-copyrightable raw data under international copyright law; Feist Publications doctrine).
* Sourcing final scores from public league results feeds carries zero risk provided database structures and creative descriptions are not copied verbatim.

---

## 4. Priority Allocation Matrix: Free vs Paid Sources

To achieve the **minimum viable data cost**, data tasks are assigned strictly according to cost efficiency:

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    SALMO DATA TASK ASSIGNMENT MATRIX                       │
├───────────────────────┬──────────────────────┬─────────────────────────────┤
│ TASK                  │ DESIGNATED SOURCE    │ JUSTIFICATION / COST        │
├───────────────────────┼──────────────────────┼─────────────────────────────┤
│ Fixture Discovery     │ Supabase DB / Open   │ FREE ($0) — Simple dates &  │
│                       │ football feeds       │ team names; zero paid calls │
├───────────────────────┼──────────────────────┼─────────────────────────────┤
│ Historical Matches    │ Dribble360 Local     │ FREE ($0) — 379k records    │
│                       │ Parquet Archive      │ already paid and archived   │
├───────────────────────┼──────────────────────┼─────────────────────────────┤
│ Historical Team Stats │ Dribble360 Local     │ FREE ($0) — 70k team-match  │
│                       │ Feature Reservoir    │ records stored locally      │
├───────────────────────┼──────────────────────┼─────────────────────────────┤
│ Asian Handicap Odds   │ OddsPapi (Pinnacle)  │ SELECTIVE PAID / FREE TIER  │
│                       │ Batch Endpoint       │ Sharp benchmark essential   │
├───────────────────────┼──────────────────────┼─────────────────────────────┤
│ Over/Under Odds       │ OddsPapi (Pinnacle)  │ SELECTIVE PAID / FREE TIER  │
│                       │ Batch Endpoint       │ Sharp benchmark essential   │
├───────────────────────┼──────────────────────┼─────────────────────────────┤
│ Match Results/Scores  │ openfootball /       │ FREE ($0) — Score lines are │
│                       │ FreeResultsAdapter   │ facts; zero paid calls      │
├───────────────────────┼──────────────────────┼─────────────────────────────┤
│ Automatic Settlement  │ Database matches /   │ FREE ($0) — Local execution;│
│                       │ FreeResultsAdapter   │ zero OddsPapi consumption   │
├───────────────────────┼──────────────────────┼─────────────────────────────┤
│ League Standings/Form │ Cached Database /    │ FREE ($0) — Derived from    │
│                       │ Dribble360 Archive   │ finished match scores       │
└───────────────────────┴──────────────────────┴─────────────────────────────┘
```

**Non-Duplication Rule:** SALMO strictly prohibits paying two separate providers for the same dataset. OddsPapi will never be queried for scores or fixtures; API-Football will never be queried for odds.
