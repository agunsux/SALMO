# EPIC 95 — DATA PROVIDER INVENTORY & CAPABILITY AUDIT
**Date:** November 1, 2026  
**Auditor:** Antigravity Autonomous Data Architecture & Cost Control Team  
**System Target:** `SALMO` Production Architecture & `HandicapLab` Quantitative Framework  
**Scope:** Exhaustive audit of all 7 data providers integrated across the codebase.

---

## 1. Executive Provider Matrix

| Provider | Integration Type | Current Status | Plan Tier | Monthly Quota & Reset | Verified Production Usage | Rate Limits | Commercial Rights | Fallback Mechanism |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **OddsPapi** | REST API v4 | **ACTIVE / HEALTHY** | Free Tier | 250 req/mo (Resets 1st of month) | **42 used / 208 remaining** | 5 req/s (0.02-0.20s backoff) | Evaluation / Free Tier terms | The-Odds-API / Cached Snapshots |
| **API-Football** | REST API v3 | **SUSPENDED** | Free / Ex-Pro | 100 req/day (Free) / 7.5k (Pro) | **0 req (HTTP 403/Account Hold)** | 10 req/s | Commercial with paid plans | Database Cache / FreeResultsAdapter |
| **Dribble360** | REST Ingestion | **EXPIRING 2026-12-01** | Elite / Lite | Batch Harvesting (Cancelled) | **379,143 records harvested** | 60 req/min | Research & derived local assets | Local DuckDB / Parquet Warehouse |
| **Football-Data.co.uk** | Static CSV Feeds | **ACTIVE / FREE** | Public Download | Unlimited (Twice weekly updates) | **Active Settlement Source ($0 cost)** | None | **Personal Use Only (Commercial Gated)** | Database `public.matches` / TheSportsDB |
| **The-Odds-API** | REST API v4 | **STANDBY / EVAL** | Free Tier | 500 req/mo (Rolling) | **0 used (Emergency Fallback)** | 1 req/s | Permitted under free terms | OddsPapi / Local Odds Snapshots |
| **FootyStats** | REST API v2 | **INACTIVE / TRIAL** | Trial Evaluation | Limited trial tokens | **0 active calls** | 1 req/s | Pro required for commercial | Dribble360 local features |
| **TheSportsDB** | REST API v1/v2 | **STANDBY / FREE** | Community Free | Unlimited public / 1 req/s | **Metadata / Logo resolution only** | 1 req/s | Free / CC Attribution | Static Asset Bundles |

---

## 2. Granular Provider Profiles

### 2.1 OddsPapi (Primary Market Benchmark)
* **API Client Location:** `SALMO/src/services/providers/oddsPapiProvider.ts` & `HandicapLab/src/lib/apis/oddspapi.ts`
* **Account Credentials:** `agunsuxx@gmail.com` | Key Fingerprint: `62c5...2663`
* **Account Status Proof:**
  * Verified via unmetered `/v4/account` endpoint: HTTP 200, `request_limit: 250`, `request_count: 42`, `plan: "free"`, `is_active: true`.
  * Reset Cycle: Every 1st day of the calendar month (confirmed via official documentation).
* **Available Competitions:** 15+ canonical tournaments mapped (Championship `701`, Premier League `17`, Serie A `23`, La Liga `8`, Bundesliga `35`, Ligue 1 `34`, Eredivisie `7`, etc.).
* **Market Coverage:**
  * Primary: Pinnacle Asian Handicap (`1070`) and Over/Under (`1010`) decimal odds.
  * Secondary Soft Books: 1xBet, Bet365, Unibet, Bovada, SBOBET (strictly classified as soft, not benchmark).
* **Endpoint Metering Classification:**
  * **Metered (1 call per request):** `/v4/fixtures`, `/v4/odds-by-tournaments`, `/v4/odds`, `/v4/scores`.
  * **Unmetered (0 cost):** `/v4/account` (quota telemetry), `/v4/historical-odds` (historical line series).
* **Rate Limits & Behavior:** Maximum 5 concurrent calls; HTTP 429 returns retry advisory (0.02 - 0.20s). The codebase implements an exponential backoff circuit breaker.
* **Production Role:** **P0 Sharp Odds Benchmark**. Never used for fixtures, general stats, or match settlement.

---

### 2.2 API-Football (API-Sports)
* **API Client Location:** `SALMO/src/services/providers/apiFootballProvider.ts` & `HandicapLab/src/lib/apis/football.ts`
* **Account Credentials:** Key Fingerprint: `cb36...aab6`
* **Account Status Proof:**
  * Verified via live probe to `https://v3.football.api-sports.io/status`:
  * Response: `{"errors": {"access": "Your account is suspended, check on https://dashboard.api-football.com."}}`
* **Historical & Upcoming Coverage:** 1,000+ leagues worldwide, 10+ seasons of match details, live events, lineups, injuries.
* **Odds Limitations:** Lacks sharp Pinnacle closing series; bookmaker updates have variable latency; unsuitable as a sharp benchmark.
* **Pricing Structure:**
  * Free Tier: 100 requests/day (covers ~15 leagues with conservative scheduling).
  * Pro Tier: $19/month (7,500 requests/day, commercial license included).
  * Ultra Tier: $29/month (75,000 requests/day).
* **Current Operational Posture:** **COMPLETELY ISOLATED / FAIL-CLOSED**. All live pipelines fall back to cached database fixtures and `FreeResultsAdapter`.

---

### 2.3 Dribble360 (Historical Feature Reservoir)
* **Harvest Client Location:** `HandicapLab/scripts/harvest_dribble360.ts` & `SALMO/src/engine/features/dribble360ResearchAdapter.ts`
* **Subscription Status:** Elite/Lite subscription expiring **December 1, 2026** (Auto-renewal: **OFF**).
* **Extraction Audit:**
  * Extraction Status: **100% COMPLETE** (EPIC 92 Mission 3).
  * Total Harvest Volume: **379,143 records (270.76 MB)** across 8 seasons (2019/20 to 2026/27).
  * Storage Format: Line-delimited JSON (`.jsonl`) and Apache Parquet in `HandicapLab/data/harvest/dribble360/`.
  * Manifest Hash: SHA-256 verified in `harvest_manifest.json`.
* **Odds Availability:** **0 odds**. Audit of 8 distinct Dribble360 odds endpoints produced HTTP 404.
* **Production Role:** Offline training corpus for Dixon-Coles parameters, home advantage metrics, and team ratings. Zero recurring live calls.

---

### 2.4 Football-Data.co.uk (Free Settlement & Backtest Source)
* **Adapter Location:** `HandicapLab/src/lib/results/freeResultsAdapter.ts` & `HandicapLab/src/research/football-data/*`
* **Data Access:** Free public HTTP CSV downloads from `https://football-data.co.uk/mmz4281/`.
* **Coverage:** 10 major European divisions (`E0`, `E1`, `D1`, `SP1`, `I1`, `F1`, `N1`, `P1`, `B1`, `SC0`).
* **Update Frequency:** Twice weekly (Monday morning UTC and Thursday morning UTC).
* **Historical Depth:** Continuous historical records since 1993/94.
* **Metrics Provided:** Full-time goals (FTHG, FTAG), Half-time goals (HTHG, HTAG), shots, corners, Pinnacle closing odds.
* **Legal & Licensing Posture:**
  * **CRITICAL FINDING:** Site terms state: *"Data is free for individual, non-commercial, personal research. Automated scraping, commercial redistribution, and AI dataset construction without prior written permission is prohibited."*
  * **Remediation:** Must not be redistributed or exposed raw via public APIs. Used strictly as internal evidence; formal written license request submitted.

---

### 2.5 The-Odds-API (Secondary Standby)
* **Client Location:** `SALMO/src/services/providers/theOddsApiProvider.ts` & `HandicapLab/src/lib/apis/theOddsApi.ts`
* **Tier:** Free tier (500 requests/month).
* **Coverage:** Major international soccer, US sports, European leagues.
* **Strengths:** Clean REST JSON format, reliable uptime.
* **Limitations:** Spreads and totals for soccer frequently feature soft bookmakers (DraftKings, Bovada); Pinnacle odds availability varies by region.
* **Production Role:** **Warm Standby Fallback** for emergency quota exhaustion.

---

### 2.6 FootyStats & TheSportsDB (Auxiliary)
* **FootyStats:** Evaluated for xG and referee cards; requires paid tier ($20-$50/mo) for commercial use. Currently disabled in production.
* **TheSportsDB:** Free community API (1 req/s). Utilized for static team badges, stadium coordinates, and club metadata. $0 cost.

---

## 3. Four-Layer Provider Separation of Concerns

To prevent architectural coupling, data functions are strictly partitioned:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   SALMO DATA LAYER SEPARATION                          │
├───────────────────────┬────────────────────────────────────────────────┤
│ FUNCTION              │ PRIMARY PROVIDER       │ FAILOVER PROVIDER     │
├───────────────────────┼────────────────────────┼───────────────────────┤
│ 1. Historical Dataset │ Dribble360 (Local)     │ Football-Data (Local) │
│ 2. Fixture Discovery  │ Supabase matches / AF  │ Open-Source Feeds     │
│ 3. Market Odds        │ OddsPapi (Pinnacle)    │ The-Odds-API          │
│ 4. Match Settlement   │ FreeResultsAdapter     │ Supabase DB Matches   │
└───────────────────────┴────────────────────────┴───────────────────────┘
```
**Invariant:** A failure in any single provider can never paralyze more than one function.

