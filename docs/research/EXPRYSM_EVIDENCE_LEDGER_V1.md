# EXPRYSM FORENSIC EVIDENCE LEDGER (V1)
**Document Version:** 1.0.0  
**Audit Date:** September 21, 2026  
**Auditor:** Quantitative Systems Architect & Forensic Competitive Intelligence Lead  
**Scope:** Material claims, source inspection, verified telemetry, and classification of ExPrysm capabilities.

---

## 1. EVIDENCE TYPE DEFINITIONS

| Type | Definition |
| :--- | :--- |
| **PUBLIC** | Directly inspected on unauthenticated public URLs, HTTP endpoints, static landing pages, or public JavaScript/JSON bundles. |
| **AUTHENTICATED UI** | Inspected inside a logged-in user session with active session tokens. |
| **SCREENSHOT** | Verified visual capture provided by users or official release logs. |
| **REPOSITORY** | Inspected in local or sibling source code repositories. |
| **DOCUMENTATION** | Official written specifications, change logs, or engineering manuals. |
| **USER-PROVIDED** | Explicit reports, account screenshots, or invoices provided by users. |
| **INFERENCE** | Analytical deduction derived from code logic, comments, or architecture. *Never represented as verified fact.* |

---

## 2. MATERIAL CLAIMS & EVIDENCE LEDGER

| ID | Claim | Source | Location | Date Checked | Evidence Type | Confidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **EXP-001** | Covers 650+ football leagues and tournaments globally. | `exprysm.com/en/`, `exprysm.com/pricing.html` | Meta tags, hero headline, pricing cards | 2026-09-21 | PUBLIC | HIGH | Verified marketing claim. In practice, daily prediction volume is 60–200 picks across active in-season leagues. |
| **EXP-002** | AI-powered predictions utilizing CatBoost machine learning and LLM pipeline. | `exprysm.com`, `productdirs.com`, `perf_summary_v1.json` | Public documentation, JSON regime definitions (`llm_v1`, `hybrid`) | 2026-09-21 | PUBLIC | HIGH | Transitioned on 2026-06-07 from pure LLM (`llm_v1`) to hybrid ML/LLM (`hybrid`). |
| **EXP-003** | Supports 8+ betting markets: Match Result (1X2), Goals O/U, BTTS, Asian Handicap, Cards, Corners, Double Chance, Correct Score. | `exprysm.com/en/`, `perf_timing_v1.json` | Landing page, `clv.by_market` array | 2026-09-21 | PUBLIC | HIGH | Confirmed in production telemetry. Telemetry tracks AH (-1.5, +1.5, -1.0), Goals (1.5, 2.5, 3.5), Cards (3.5, 4.5, 5.5, 6.5), Corners (7.5 to 11.5), BTTS, DC, MS. |
| **EXP-004** | Fully transparent public performance ledger tracking every settled pick. | `exprysm.com/performance.html`, `perf_summary_v1.json` | Public performance dashboard | 2026-09-21 | PUBLIC | HIGH | Real JSON payload verified: 13,766 all-time settled bets (-256.70 units, -1.865% ROI); current hybrid regime: 5,756 bets (+19.08 units, +0.331% ROI). |
| **EXP-005** | Bankroll Calculator available in Pro tier for manual stake sizing. | `exprysm.com/pricing.html`, `dashboard.html` | Pricing comparison table, dashboard sub-tab `tp-bankroll` | 2026-09-21 | PUBLIC | HIGH | Allows user to input initial bankroll and select staking rules; user must manually log placed bets. |
| **EXP-006** | Automated Daily Bankroll Plan in Premium tier that allocates daily stakes. | `exprysm.com/pricing.html`, `perf_v2_bankroll.js`, `dashboard.html` | Pricing table, dashboard tab `premium-bankroll` | 2026-09-21 | PUBLIC | HIGH | System generates daily recommended stakes per bet based on selected risk rule. Does NOT automatically place bets at bookmakers. |
| **EXP-007** | Four distinct bankroll staking rules: Edge-weighted (Quarter-Kelly), Split evenly 10%, Split evenly 5%, Flat stake. | `exprysm.com/en/`, `perf_v2_bankroll.js` | Bankroll replay cards, client code | 2026-09-21 | PUBLIC | HIGH | Verified in client script `perf_v2_bankroll.js` with ruin limit stop ($B < 1\%$ of start) and max drawdown tracking. |
| **EXP-008** | Pricing: Free ($0), Pro ($9.99/mo or $99.99/yr), Premium ($19.99/mo or $199.99/yr), Premium Lifetime ($349.99). | `exprysm.com/pricing.html` | Pricing cards | 2026-09-21 | PUBLIC | HIGH | Verified directly on live pricing page. Pricing was updated in late September 2026. |
| **EXP-009** | 24-hour to 3-day free trial for Pro tier. | `exprysm.com/en/`, `exprysm.com/pricing.html` | Hero CTA, button text `Start 3-Day Free Trial` | 2026-09-21 | PUBLIC | HIGH | Verified on pricing card (`getProBtn`). Requires Whop checkout initialization. |
| **EXP-010** | Payment processing and user entitlement handled via Whop. | `exprysm.com/en/`, `exprysm.com/pricing.html` | Whop pixel script (`biz_PCKnGbN5cCzA4e`), `js.whop.com` | 2026-09-21 | PUBLIC | HIGH | Whop SDK handles subscription billing, trial lifecycle, and webhook-driven Supabase `app_metadata.tier` updates. |
| **EXP-011** | Pre-match lineup-based pick updates ("Kickoff Updates" / KU). | `exprysm.com/pricing.html`, `perf_timing_v1.json`, `perf_v2_tab2_timing.js` | Dashboard tab `tp-kickoff-updates`, `perf_timing_v1.json::ku` | 2026-09-21 | PUBLIC | HIGH | Refreshes picks when official team sheets are announced. Actual telemetry shows 5,341 updates, accuracy before: 49.80%, after: 49.83% ($\Delta = +0.03\%$). Marked `ku_verdict_inconclusive`. |
| **EXP-012** | "Live match evaluation" real-time read when data is available. | `exprysm.com/pricing.html` | Feature list under Premium tier, row `pm_live_eval` | 2026-09-21 | PUBLIC | HIGH | Marketing text specifies "real-time read when data is available". Operates via conversational AI chatbot (`chatapi.exprysm.com/chat`). |
| **EXP-013** | Operates an in-play quantitative second-half prediction model. | `perf_timing_v1.json`, `dashboard.html`, `perf_v2_*.js` | Full site scripts, performance ledger | 2026-09-21 | INFERENCE | HIGH | **NOT OBSERVED.** Zero second-half markets in performance telemetry. Zero in-play mathematical models in scripts. Live feature is an LLM chatbot prompt over live scores. |
| **EXP-014** | Ingests and displays live in-play market odds. | `pricing.html`, `dashboard.html`, `footer` | Feature list, provider attribution | 2026-09-21 | INFERENCE | HIGH | **NOT OBSERVED.** Free/Pro tiers show "Live scores", not live betting odds. Odds provider is API-Sports pre-match. Sharp exchange in-play stream is completely absent. |
| **EXP-015** | Closing Line Value (CLV) tracked and reported on settled picks. | `perf_timing_v1.json`, `perf_v2_tab2_timing.js` | Performance Timing tab, `clv` JSON object | 2026-09-21 | PUBLIC | HIGH | Verified: Average CLV across 2,608 bets is **+0.44%** ($0.0044$). 49.92% beat closing line. Statistically flat (`clv_verdict_flat`, within $\pm0.5\%$ margin). Does not prove market beat. |
| **EXP-016** | Transitioned from legacy LLM regime to hybrid machine learning regime. | `perf_summary_v1.json` | `regimes` configuration in production telemetry | 2026-09-21 | PUBLIC | HIGH | `llm_v1` (2026-02-04 to 2026-06-07): 8,010 bets, ROI -3.443%. `hybrid` (2026-06-07 to present): 5,756 bets, ROI +0.331% (95% CI [-1.85%, +2.55%]). |
| **EXP-017** | Core football betting markets (AH, Goals, BTTS, 1X2) are unprofitable in ExPrysm. | `perf_summary_v1.json`, `perf_timing_v1.json` | `market_mix` telemetry in production JSON | 2026-09-21 | PUBLIC | HIGH | In `hybrid` regime: AH is **-3.16% ROI** (1,005 bets); Goals O/U is **-3.20% ROI** (569 bets); BTTS is **-8.18% ROI** (370 bets); Match Winner (MS) is **-10.04% ROI** (142 bets). Only Cards (+8.87%) and Corners (+5.22%) are positive. |
| **EXP-018** | Ranks market and league strength using Wilson score lower bound. | `perf_v2_tab1_results.js`, `perf_summary_v1.json::strength` | Client code comments, JSON `score_lb` | 2026-09-21 | PUBLIC | HIGH | Formula: $\text{score\_lb} = \text{wilson\_lb} \times \text{avg\_odds} - 1$. Prevents ranking high-win-rate, low-odds markets that lose money long term. |
| **EXP-019** | Underlying data and tech stack: AWS, API-Sports (API-Football), Anthropic Claude, Kiro. | `dashboard.html` | Footer logos and text | 2026-09-21 | PUBLIC | HIGH | Verified in HTML footer. Data source is standard API-Sports REST feed; LLM is Anthropic Claude. |
| **EXP-020** | Supports PWA, Web Push notifications, and 13 languages. | `dashboard.html`, `exprysm.com/en/` | Header language select, serviceWorker registration | 2026-09-21 | PUBLIC | HIGH | Supported: EN, TR, ES, PT, DE, FR, RU, UK, AZ, AR, ZH, IT, PL, JA. |
| **EXP-021** | Authenticated user features: Today's Picks (60–200), Coupon Builder, Match Explorer, Detailed vs Quick view. | `dashboard.html` | Tabs and sub-tabs in dashboard shell | 2026-09-21 | PUBLIC / AUTH UI | MEDIUM | **REQUIRES USER TRIAL INSPECTION** for full in-depth examination of locked Pro/Premium views during live gameweeks. Shell and client code verified. |

---

## 3. SUMMARY OF VERIFIED VS INFERRED CLAIMS

### Verified Facts:
1. **ExPrysm is fundamentally a pre-match prediction aggregator** with 60–200 picks published each morning across 8 markets.
2. **Its core football markets generate negative returns:** Asian Handicap (-3.16% ROI), Over/Under (-3.20% ROI), BTTS (-8.18% ROI), and Moneyline (-10.04% ROI).
3. **Overall hybrid profitability (+0.33% ROI) is driven entirely by secondary prop markets:** Cards (+8.87% ROI) and Corners (+5.22% ROI).
4. **Closing Line Value is statistically flat (+0.44%),** confirming that ExPrysm's pre-match predictions do not beat the sharp market closing line.
5. **Lineup adjustments ("Kickoff Updates / KU") produce negligible improvement:** +0.03% delta in accuracy, classified in their own ledger as `ku_verdict_inconclusive`.
6. **Staking tools are split into Pro (Calculator) and Premium (Automated Daily Plan),** but neither executes automated bets.

### Critical Inferences & Unknowns Requiring User Trial Inspection:
1. **Chatbot Prompt Mechanics:** The exact system prompt and grounding data supplied to Claude via `chatapi.exprysm.com/chat` cannot be inspected without an authenticated Premium session.
2. **Coupon Optimizer:** Whether the "AI Optimize" button in the Coupon Builder executes mathematical portfolio optimization or heuristic filtering requires active session testing.
3. **Live Match Evaluation Output:** The exact format and utility of the real-time read when a match is in-play requires live match testing inside a trial account.

