# EXPRYSM COMPETITIVE TEARDOWN × HANDICAPLAB PIPELINE AUDIT × SALMO GAP ANALYSIS (V1)
**Document Version:** 1.0.0  
**Date:** September 21, 2026  
**Auditor:** Quantitative Systems Architect & Forensic Competitive Intelligence Lead  
**Scope:** Forensic Competitive Intelligence, Dual-Layer Architectural Comparison, and Strategic Decision Framework

---

## 1. EXECUTIVE SUMMARY & CORE ARCHITECTURE PRINCIPLE

This investigation conducts an empirical, forensic teardown of **ExPrysm** (an AI football prediction platform) and maps its observed capabilities against the **actual** HandicapLab infrastructure and **actual** SALMO decision product.

### Core Architectural Principle

The system must be understood and developed as two distinct, strictly decoupled layers:

```text
                    HANDICAPLAB.DEV
             DATA / RESEARCH / INFRASTRUCTURE
                         │
                         │ Canonical Predictions (P_model, Fair Odds)
                         │ Reference Sharp Odds (Pinnacle devigged)
                         │ Deterministic Provenance (SHA-256)
                         │ Research Gates & Historical Validation
                         │
                         ▼
                     SALMO.DEV
              DECISION / PRODUCT LAYER
                         │
                         │ Consumer Decision Workflow (LAYAK / PANTAU / LEWATI)
                         │ UI Presentation, Evidence Drawers, Calculation Traces
                         │ User Value & Portfolio Guidance
                         │
                         ▼
                END-USER EXPERIENCE
```

### Forensic Grounding:
- **SALMO is not an independent prediction engine.** It never recalculates Poisson distributions, never runs Dixon-Coles fits, and never invents synthetic fallback odds.
- **HandicapLab is the quantitative foundation.** It handles ingestion, rate limiting, quota management, canonical entity resolution, devigging, modeling, backtesting, and settlement.
- **ExPrysm is an aggregator of broad pre-match predictions.** Forensic extraction of its production JSON telemetry reveals that its core football models (Asian Handicap, Over/Under, BTTS, Match Winner) lose money (-3.16% to -10.04% ROI), its Closing Line Value (CLV) is statistically flat (+0.44%), and its overall positive yield in its `hybrid` regime (+0.33%) is sustained entirely by secondary prop markets (Cards and Corners).

---

## 2. DUAL-LAYER ARCHITECTURAL COMPARISON

We strictly avoid the category error of comparing a consumer product feature with a raw data infrastructure component. We compare at two separate layers:

### 2.1 MATRIX A: Product Layer (ExPrysm Product vs SALMO Product)
*Evaluates user experience, decision workflow, packaging, and monetization.*

| Dimension | ExPrysm Product | SALMO Product | Product Layer Gap Analysis |
| :--- | :--- | :--- | :--- |
| **Primary Value Proposition** | "All-in-one" broad betting tips across 650+ leagues and 8 markets. | Deep, institutional-grade decision intelligence on core liquid football markets (AH quarter-lines, OU, BTTS). | ExPrysm offers broad retail picks; SALMO offers specialized, mathematically rigorous value decisions. |
| **Market Scope** | 8+ markets: 1X2, AH, OU, BTTS, Cards, Corners, DC, Correct Score. | Strictly 3 markets: Asian Handicap (quarter-lines), Over/Under 2.5, BTTS. (1X2 is excluded). | SALMO enforces strict market specialization; ExPrysm spreads predictions across retail prop markets. |
| **Decision Workflow** | Static list of daily tips (60–200 picks) with star confidence. | 4-Tier Gated Verdicts (`LAYAK`, `PANTAU`, `LEWATI`) based on verifiable mathematical Edge, EV, and Data Robustness. | SALMO provides actionable value filtering; ExPrysm requires user manual curation. |
| **Bankroll Integration** | Two-tier bankroll tooling: Pro Calculator (manual) + Premium Daily Bankroll Plan (automated stake sizes). | Basic staking formula documentation in research pages; no active in-app bankroll tracker or sizing engine. | **SALMO PRODUCT GAP:** SALMO lacks a structured user-facing bankroll sizing interface. |
| **Public Transparency** | Public `/performance.html` displaying settled picks, monthly breakdown, regime history, and bankroll walk curves. | Live Engine Transparency strip and `/research` historical evidence drawer; public production ledger is in backend. | **SALMO PRODUCT GAP:** SALMO needs a dedicated public track record page wired to Supabase `prediction_ledger_v3`. |
| **Monetization & Packaging** | Free (6 picks), Pro ($9.99/mo, all picks + calculator), Premium ($19.99/mo, daily plan + AI), Lifetime ($349.99). | Free pre-launch / preview; pricing tier structure defined on `/pricing` but payment gateway is unmetered. | **SALMO PRODUCT GAP:** Commercial paywall, entitlement check, and checkout integration are pending. |
| **Mobile Experience** | Dedicated mobile PWA layout with bottom navigation bar and web push notifications. | Responsive Tailwind CSS web interface; no PWA manifest or push service worker. | **SALMO PRODUCT GAP:** Mobile PWA packaging and notifications are absent in SALMO. |

### 2.2 MATRIX B: Infrastructure Layer (ExPrysm Assumed Pipeline vs HandicapLab Infrastructure)
*Evaluates data ingestion, odds processing, quantitative modeling, validation, and provenance.*

| Dimension | ExPrysm Assumed Pipeline | HandicapLab Infrastructure | Infrastructure Layer Gap Analysis |
| :--- | :--- | :--- | :--- |
| **Data Ingestion & Quotas** | API-Sports (API-Football) REST feed on AWS. Single-source provider architecture. | Dual-provider architecture: API-Football PRO (7.5k/day) + OddsPapi v4 + FootyStats. Atomic `quota_state` tracking. | **ALREADY SOLVED BY HANDICAPLAB:** Multi-provider fallback and quota preservation are superior in HandicapLab. |
| **Canonical Data & Identity** | Standard API-Sports fixture and team IDs. | Canonical Match Registry, deterministic Match UUID, Entity Resolver with team alias mapping, Deduplication engine. | **ALREADY SOLVED BY HANDICAPLAB:** Robust entity resolution and deduplication architecture. |
| **Storage Architecture** | Flat JSON exports on static CDN (`perf_summary_v1.json`, etc.) + Supabase auth. | Medallion storage architecture: Bronze (raw JSON/CSV with SHA-256) $\rightarrow$ Silver (structured Parquet) $\rightarrow$ Gold (PostgreSQL views). | **ALREADY SOLVED BY HANDICAPLAB:** Enterprise medallion pipeline is fully engineered. |
| **Market Odds & Reference** | Pre-match betting odds from API-Sports bookmaker feed (retail bookmakers). | Sharp Reference Quotes: dedicated OddsPapi client filtering to sharp books (Pinnacle, Singbet, SBOBet, Betfair). | **ALREADY SOLVED BY HANDICAPLAB:** Sharp market reference and devigging engine exist in HandicapLab. |
| **Quantitative Model** | CatBoost GBDT classifier + Anthropic Claude LLM summarizer. | Dixon-Coles Low-Score Bivariate Poisson Solver with time-decay weighting ($\xi$) and low-score interaction parameter ($\rho$). | **ALREADY SOLVED BY HANDICAPLAB:** True probabilistic generative model; ExPrysm uses classification heuristics. |
| **Market devigging** | Not observed; uses raw bookmaker odds. | Multiplicative margin removal (`DevigEngine.ts`) to establish true market consensus probabilities. | **ALREADY SOLVED BY HANDICAPLAB:** Systematic devigging implemented in HandicapLab. |
| **Closing Line Value (CLV)** | Ingests closing odds; tracks 2,608 bets with +0.44% flat CLV. | Analytical engine implemented (`clvEngine.ts`), but live ingestion runner is pending (reported as `UNAVAILABLE`). | **DATA/INFRA GAP:** HandicapLab must activate historical closing odds ingestion runner via unmetered endpoint. |
| **Provenance & Audit** | Daily JSON export git commit hash (`465fbde4...`). | Point-in-time immutable record with SHA-256 hash freeze at $T_{\text{freeze}} \le T_{\text{kickoff}}$ (`prediction_ledger_v3`). | **ALREADY SOLVED BY HANDICAPLAB:** Cryptographic point-in-time provenance is fully designed. |

---

## 3. FULL SALMO VS EXPRYSM MASTER CAPABILITY MATRIX

Every dimension evaluated across ExPrysm, SALMO, and HandicapLab, classified strictly using standard gap taxonomy:

| Dimension | ExPrysm | Evidence | SALMO Product | HandicapLab Infrastructure | Gap | Classification | Confidence |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Markets** | 8+ (AH, OU, BTTS, Cards, Corners, 1X2, DC, Score) | `perf_timing_v1.json` | 3 core (AH quarter-lines, OU 2.5, BTTS) | Dixon-Coles bivariate grid supports AH, OU, BTTS | ExPrysm offers prop markets; SALMO enforces market discipline | **POTENTIAL DIFFERENTIATOR** | HIGH |
| **League Breadth** | 650+ leagues claimed | `pricing.html` | EPL active live; 5 European in history | 17,738 matches across 11 seasons; multi-league batch | ExPrysm covers massive minor leagues; SALMO currently stages EPL | **DATA/INFRA GAP** | HIGH |
| **Pre-match** | Yes (published daily morning) | `exprysm.com/en/` | Yes (dynamic 7-day UTC horizon) | Automated pre-match feature generation | None | **TABLE STAKES** | HIGH |
| **In-play** | None (only live score text) | `pricing.html`, scripts | None | None (polling REST is unviable) | Neither platform has quantitative live betting engine | **DO NOT BUILD YET** | HIGH |
| **Second-half** | None (zero 2H models/markets) | `perf_summary_v1.json` | None | None | Neither platform supports 2H models | **DO NOT BUILD YET** | HIGH |
| **Entry timing** | T-60 lineup update ("KU") | `perf_timing_v1.json::ku` | Match countdown; static pre-match | T-60 snapshot job designed in EPIC 52 Stage C | SALMO does not expose T-60 lineup refresh badges | **SALMO PRODUCT GAP** | HIGH |
| **Probability** | Model prob published on picks | `perf_summary_v1.json` | $P_{\text{model}}$ surfaced directly | Dixon-Coles Poisson joint probabilities | None | **ALREADY SOLVED BY HANDICAPLAB** | HIGH |
| **Confidence** | Star rating / confidence % | `dashboard.html` | 0–100 integer Data Robustness score | Multi-factor sample & freshness score | None | **ALREADY SOLVED BY HANDICAPLAB** | HIGH |
| **Edge** | Plus-EV value flags | `pricing.html` | Exact Edge % ($P_{\text{model}} - P_{\text{implied}}$) | Calculated against devigged Pinnacle line | None | **ALREADY SOLVED BY HANDICAPLAB** | HIGH |
| **Odds** | Retail bookmaker odds | `dashboard.html` | Pinnacle reference sharp odds | OddsPapi Pinnacle reference quotes | None | **ALREADY SOLVED BY HANDICAPLAB** | HIGH |
| **CLV** | Tracked (+0.44% flat average) | `perf_timing_v1.json` | Not displayed (pending data) | `clvEngine.ts` implemented; closing runner pending | Upstream closing odds runner not yet scheduled | **DATA/INFRA GAP** | HIGH |
| **ROI** | Public (+0.33% hybrid; -1.86% all) | `perf_summary_v1.json` | Historical validation matrix (-5.37% OOS) | Walk-forward backtesting ledger | None | **TABLE STAKES** | HIGH |
| **Settlement** | Automated daily check | `result_check.py` | Automated via QuarterLineSettler | `productionSettlementService.ts` | None | **ALREADY SOLVED BY HANDICAPLAB** | HIGH |
| **Public ledger** | Public `/performance.html` with 13.7k picks | `performance.html` | Surfaced in tests/backend; no public page | `prediction_ledger_v3` (151 point-in-time verified) | SALMO needs a user-facing public ledger view | **SALMO PRODUCT GAP** | HIGH |
| **Bankroll simulator** | Interactive walk (10k units, 4 rules) | `perf_v2_bankroll.js` | None | Staking formulas documented; no simulation engine | SALMO lacks user bankroll simulation interface | **SALMO PRODUCT GAP** | HIGH |
| **Staking** | Kelly, Split 10%, Split 5%, Flat | `perf_v2_bankroll.js` | Documented in research; not interactive | Staking formulas in quant library | SALMO needs interactive stake calculator | **SALMO PRODUCT GAP** | HIGH |
| **Bankroll plan** | Daily allocation plan (Premium) | `pricing.html`, `stake-plan` | None | Portfolio correlation / exposure library | SALMO lacks structured daily budget allocation | **SALMO PRODUCT GAP** | HIGH |
| **Model transparency**| High-level CatBoost + LLM mention | `exprysm.com` | Deep score grid ($\lambda, \mu, \rho$), calculation trace | Dixon-Coles parameters fully inspectable | SALMO is far more transparent than ExPrysm | **POTENTIAL DIFFERENTIATOR** | HIGH |
| **Data provenance** | Git commit hash | `perf_summary_v1.json` | Full SHA-256 provenance badges | Cryptographic snapshot hashing | None | **ALREADY SOLVED BY HANDICAPLAB** | HIGH |
| **Data quality** | Filtered by Wilson score | `perf_v2_tab1_results.js` | Fail-closed DATA_UNAVAILABLE | Market Quality Score (MQS), Liquidity filters | None | **ALREADY SOLVED BY HANDICAPLAB** | HIGH |
| **Integrity** | None mentioned | Public site inspection | Data integrity safeguards | SELIDIKI fraud engine exists in workspace | Integrity layer integration unexploited | **POTENTIAL DIFFERENTIATOR** | MEDIUM |
| **Daily picks** | 60–200 daily picks | `pricing.html` | Curated qualified picks (LAYAK/PANTAU) | Gated by DecisionPolicy ($E \ge 3\%$, EV $\ge 5\%$) | None | **ALREADY SOLVED BY HANDICAPLAB** | HIGH |
| **Notifications** | Web push + weekly email digest | `dashboard.html` | None | None | SALMO lacks push notification delivery | **SALMO PRODUCT GAP** | HIGH |
| **API** | Chat API (`chatapi.exprysm.com`) | `chatbot.js` | REST API (`/api/matches`, `/api/daily-picks`)| REST endpoints (`/predictions/active-7day`) | None | **TABLE STAKES** | HIGH |
| **Trial** | 24-hour / 3-day free trial | `pricing.html` | Full preview open | Not applicable | SALMO currently in open preview | **TABLE STAKES** | HIGH |
| **Free tier** | 6 homepage picks + performance | `pricing.html` | Full current feed open | Open to consumer layer | Commercial paywall not yet activated | **TABLE STAKES** | HIGH |
| **Paid tier** | Pro ($9.99) & Premium ($19.99) | `pricing.html` | Tier models specified; billing inactive | Quota allocation rules defined | Billing integration pending | **SALMO PRODUCT GAP** | HIGH |
| **Lifetime** | $349.99 one-time payment | `pricing.html` | Specified in design; inactive | Not applicable | Lifetime SKU not yet implemented | **SALMO PRODUCT GAP** | HIGH |
| **Payment** | Whop checkout | `js.whop.com` | None | None | Whop / Stripe integration pending | **SALMO PRODUCT GAP** | HIGH |

---

## 4. IN-DEPTH FORENSIC ANALYSIS OF KEY MODULES

### 4.1 Public Ledger: Trust Infrastructure vs Product Feature

* **What ExPrysm Exposes:**
  - 13,766 all-time settled picks dating back to March 2026.
  - Transparent admission of regime change: `llm_v1` lost -275.78 units (-3.44% ROI); `hybrid` gained +19.08 units (+0.33% ROI).
  - Disclosure of historical settlement corrections (e.g. 2026-07-29 settlement bug affecting 259 rows).
  - Market-by-market breakdown revealing negative returns on core football markets and positive returns on Cards/Corners.
  - Interactive bankroll curves displaying drawdowns across 4 staking methods.
* **Analysis & Strategic Classification:**
  - A public ledger is **NOT** a differentiating product feature; it is **TABLE STAKES TRUST INFRASTRUCTURE**.
  - In modern quantitative sports analytics, any platform that hides historical losses or fails to provide an unfiltered ledger is immediately dismissed by serious bettors as marketing fraud.
  - **HandicapLab already has superior ledger architecture:** immutable point-in-time records with SHA-256 checksums frozen before kickoff (`prediction_ledger_v3`).
  - **SALMO's Gap:** SALMO has not yet exposed this ledger on a public `/results` or `/track-record` page. Building this public surface in SALMO is a **P0 requirement to match table stakes trust infrastructure**.

### 4.2 Bankroll Management Analysis

* **Audit of ExPrysm:**
  - ExPrysm separates bankroll functionality into two distinct tiers:
    1. **Pro ($9.99/mo): "Bankroll Calculator"** — A manual tool where users enter their bankroll, select a rule (Quarter-Kelly, Split 10%, Split 5%, Flat), and manually record bets.
    2. **Premium ($19.99/mo): "Daily Bankroll Plan"** — An automated budget allocator that calculates exact dollar stakes for the day's selections based on the user's defined daily budget.
  - ExPrysm code comments reveal team discussions explicitly refusing to call it "Automatic bankroll management" because the software cannot place bets on behalf of users.
* **Where Missing Functionality Belongs:**
  - **HANDICAPLAB Responsibilities:**
    - Portfolio correlation analysis (evaluating simultaneous exposure on correlated matches).
    - Fractional Kelly criterion calculation derived from model edge and bookmaker odds:
      $$f^* = \frac{b \cdot p - q}{b} \times \text{fraction}.$$
    - Maximum drawdown and value-at-risk (VaR) quantification.
  - **SALMO Responsibilities:**
    - User input interface: user specifies bankroll size ($B$) and risk tolerance (Conservative, Balanced, Aggressive).
    - Stake recommendation display: showing recommended unit and monetary stakes alongside each `LAYAK` pick.
    - Personal bankroll simulation card replaying the user's specific bankroll against the verified ledger.

### 4.3 Pre-Match Lineup Refresh ("Kickoff Updates" / KU)

* **Audit of ExPrysm:**
  - ExPrysm tracks "Kickoff Updates (KU)" in its timing tab.
  - Production telemetry (`perf_timing_v1.json`) reports:
    - 5,341 total lineup updates processed.
    - Pre-lineup morning accuracy: **49.80%**.
    - Post-lineup update accuracy: **49.83%**.
    - Performance delta: **+0.03 percentage points**.
    - Verdict: classified by ExPrysm itself as `ku_verdict_inconclusive`.
* **Strategic Implication:**
  - While refreshing lineups is a logical pre-match step, empirical evidence proves it produces **negligible performance improvement (+0.03%)**.
  - Rushing to build high-frequency pre-match lineup polling would consume vast API-Football quota with virtually zero impact on prediction profitability.
  - HandicapLab's planned T-60 snapshot job (EPIC 52 Stage C) is sufficient; real-time continuous lineup polling is **not justified**.

---

## 5. SALMO DIFFERENTIATION ROADMAP: WHERE TO COMPETE & WIN

To build a defensible, sustainable product without duplicating infrastructure or copying competitor flaws, SALMO must differentiate across 11 strategic vectors:

| Vector | What? | Why? | Empirical Evidence | HandicapLab Dependency | Engineering Required | Operating Cost | Risk / Unknown |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **A. Market Specialization** | Specialize strictly in Asian Handicap quarter-lines, OU 2.5, and BTTS. | ExPrysm's core football models lose money (-3.16% to -10.04% ROI). Spreading across 8 markets masks weak modeling with volatile prop markets (Cards/Corners). | ExPrysm `perf_summary_v1.json` shows AH (-3.16%) and Goals (-3.20%) are negative. | Dixon-Coles bivariate Poisson engine. | Low (Already built in SALMO). | Minimal ($0 incremental). | Low (Core focus). |
| **B. Decision Workflow** | Actionable 3-tier verdict (`LAYAK`, `PANTAU`, `LEWATI`) based on strict mathematical gates. | Bettors suffer from choice fatigue when faced with 200 daily tips. They need strict value filtering. | 30 live Gameweek 5 rows filter to 8 LAYAK, 22 PANTAU, 0 LEWATI. | DecisionPolicy and edge calculation. | Low (Already implemented in SALMO). | Minimal. | Low. |
| **C. Closing Line Value (CLV)** | Publish verified CLV on all settled picks using sharp Pinnacle closing quotes. | Proven positive CLV is the only mathematically accepted indicator of long-term sports betting edge. | ExPrysm CLV is flat (+0.44%), failing to prove market beat. | Unmetered OddsPapi historical odds runner. | Medium (Activate runner in HandicapLab). | Minimal (Unmetered endpoint). | Medium (Requires closing odds collection). |
| **D. Bankroll Guidance** | Native stake sizing recommendation (Fractional Kelly / unit sizing) on `LAYAK` picks. | High-value picks are worthless if improper staking leads to gambler's ruin. | ExPrysm monetizes bankroll tools at $19.99/mo Premium. | Staking formulas and risk engine. | Medium (UI input modal + local storage). | Minimal. | Low. |
| **E. Model Explainability** | Transparent display of Dixon-Coles parameters ($\lambda, \mu, \rho$) and bivariate score grids. | Sharp bettors and quant syndicates reject black boxes. Full mathematical transparency builds unshakeable trust. | SALMO `/match/[id]` displays score grid and lambdas. ExPrysm hides model behind generic "AI". | Dixon-Coles score grid output. | Low (Already built in SALMO). | Minimal. | Low. |
| **F. Provider & Odds Provenance** | Explicit bookmaker provenance (Pinnacle devigged) and freeze timestamp for every pick. | ExPrysm uses uncredited retail odds. Tracing exact Pinnacle lines proves zero synthetic fabrication. | SALMO contract requires explicit bookmaker provenance. | OddsPapi sharp consensus. | Low (Already enforced in SALMO). | Minimal. | Low. |
| **G. Match Integrity Layer** | Integrate market anomaly and suspicious odds movement scoring (MQS + SELIDIKI fraud graph). | Lower leagues frequently suffer from syndicate manipulation and illiquid lines. Protecting users from toxic matches is a moat. | HandicapLab `market-quality-score.ts` and SELIDIKI fraud graph in repo. | Market Quality Score engine. | High (Connect MQS scoring to SALMO verdict). | Minimal. | Medium (False positive rate on minor leagues). |
| **H. Live In-Play** | Live in-play odds and second-half models. | Strategically tempting, but forensically unviable. | ExPrysm has NO live model (only Claude chat). HandicapLab has NO websocket feed. Quota exhausts in 2 minutes. | Full live websocket stream + dynamic hazard rate model. | Prohibitive ($5,000/mo feeds + new quant model). | Massive ($5k+/mo). | **FATAL RISK. DO NOT BUILD.** |

---

## 6. AUDIT OF EPIC 51 & EPIC 52 OBJECTIVES

We audit existing EPIC 51 and EPIC 52 specifications to determine what to keep, revise, defer, or remove, distinguishing clearly between HandicapLab and SALMO responsibilities:

### 6.1 EPIC 51: Wire Pages to Real Supabase Data

| Objective | Architectural Layer | Classification | Rationale & Recommendation |
| :--- | :--- | :--- | :--- |
| **Stage A: Connect Picks Page to Supabase** | SALMO | **KEEP** | Successfully completed in SALMO via `DatabaseHandicapLabAdapter` reading `daily_picks`. |
| **Stage A: Connect Results Page to `prediction_audits`** | SALMO | **REVISE** | Must query canonical `prediction_ledger_v3` rather than legacy `prediction_audits` to preserve cryptographic SHA-256 provenance. |
| **Stage A: TrackRecordCard with Low-Sample Fallback** | SALMO | **KEEP** | Preserves truth-in-advertising: displays "Insufficient sample — building track record" when $N < 30$. |
| **Stage A: Replace Hardcoded Metrics with Live Queries** | SALMO | **KEEP** | Completed in SALMO. Zero mock or hardcoded fallback remains in production path. |

### 6.2 EPIC 52: Pre-Match Real-Time Enrichment & Production Hardening

| Objective | Architectural Layer | Classification | Rationale & Recommendation |
| :--- | :--- | :--- | :--- |
| **Stage A: Odds 4 Sharp Books via OddsPapi w/ Budget** | HANDICAPLAB | **KEEP** | Essential for preserving 250 req/mo free budget while capturing Pinnacle, Singbet, SBOBet, Betfair. |
| **Stage B: Weather, Injuries, Lineups via API-Football** | HANDICAPLAB | **REVISE** | Lineups and injuries are useful context, but empirical ExPrysm data proves lineup refreshes add only +0.03% accuracy. Do not over-allocate API-Football daily quota to frequent lineup polling. |
| **Stage C: T-60 Snapshot Cron Job** | HANDICAPLAB | **KEEP** | Single canonical pre-match snapshot frozen 60 minutes before kickoff. Perfectly aligns with anti-leakage invariants. |
| **Stage D: Rivalry Pairs Reference Table** | HANDICAPLAB | **DEFER** | Seeded derby intensity scale is an interesting feature, but has secondary priority compared to closing odds ingestion and public ledger. |
| **Stage E: VAR-Era Historical Data Scoping** | HANDICAPLAB | **KEEP** | Methodologically critical: models trained on pre-VAR penalty/goal rules suffer from structural regime drift. |

---

## 7. MANDATORY "DO NOT BUILD YET" REGISTER

The following capabilities are strictly gated and must **NOT** be built in the immediate product roadmap:

1. **DO NOT BUILD: Live In-Play Odds & Signals:**
   - *Reason:* Consumes 3,600 API calls per matchday, exhausting OddsPapi monthly quota in 2 minutes and API-Football daily quota in 1 slate. Latency (15–45s) guarantees adverse execution.
2. **DO NOT BUILD: Second-Half Quantitative Model:**
   - *Reason:* Requires a completely unwritten dynamic hazard rate model with time-varying Poisson decay and score-state conditional transitions. Zero research validation exists.
3. **DO NOT BUILD: Real-Time Lineup Scrapers:**
   - *Reason:* ExPrysm's empirical telemetry proves that lineup-adjusted picks produce an insignificant +0.03% delta in accuracy, classified as inconclusive.
4. **DO NOT BUILD: Automated Betting / Bookmaker Bot Integration:**
   - *Reason:* Extreme legal, regulatory, and financial liability. ExPrysm explicitly distances itself from automated bet placement in its terms and user documentation.
5. **DO NOT BUILD: 650+ Minor League Ingestion:**
   - *Reason:* Illiquid minor leagues have high bookmaker overrounds (8–15%), severe limits, and high match manipulation risks. HandicapLab's quantitative advantage is maximized in liquid European markets.
6. **DO NOT BUILD: Generative AI Mascot / Chatbot Wrapper:**
   - *Reason:* ExPrysm's "ExPrysma" Claude wrapper is a retail novelty that provides no quantitative betting edge and adds third-party token costs.

---

## 8. ARCHITECTURAL CHANGE GATE VERIFICATION

Before executing any future code change, the 10 architectural gate questions are answered:

1. **Is the problem actually in SALMO?** Yes, user-facing public ledger, bankroll guidance, and entitlement gating belong in SALMO.
2. **Is it already solved by HandicapLab?** Ingestion, quota management, devigging, modeling, and immutable ledger storage are already solved by HandicapLab.
3. **Is the required data available?** Pre-match fixtures, predictions, and Pinnacle odds are available. Closing odds require running the unmetered ingestion runner.
4. **Is the provider reliable?** API-Football and OddsPapi are verified under strict quota governance.
5. **Is the model validated?** Dixon-Coles Poisson engine is walk-forward validated across 11 seasons.
6. **Are the economics understood?** Pre-match pipeline runs at ~$19/month. Live feeds ($1,500+/mo) are rejected.
7. **Is the capability actually verified in ExPrysm?** Pre-match ledger, bankroll cards, and Whop checkout are verified. Live in-play models and second-half edges are verified as non-existent.
8. **Is the feature strategically differentiated?** Market discipline (AH quarter-lines) and explainable score grids beat ExPrysm's losing pre-match predictions.
9. **Can the existing architecture support it?** Yes, via Next.js App Router and Supabase server-side adapter.
10. **What is the smallest change required?** Exposing the existing Supabase `prediction_ledger_v3` data on a new public `/track-record` page.

