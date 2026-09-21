# FORENSIC FEASIBILITY AUDIT: LIVE IN-PLAY & SECOND-HALF CAPABILITIES (V1)
**Document Version:** 1.0.0  
**Audit Date:** September 21, 2026  
**Auditor:** Quantitative Systems Architect & Research Lead  
**Scope:** Forensic evaluation of ExPrysm's live in-play capabilities and feasibility assessment through the HandicapLab/SALMO canonical pipeline.

---

## 1. EXPRYSM IN-PLAY & SECOND-HALF FORENSIC AUDIT

ExPrysm's public surfaces, client JavaScript applications, performance telemetry, and network payloads were audited to determine the reality of their live in-play capabilities.

### 1.1 Capability Classification Matrix

| Capability Dimension | ExPrysm Status | Forensic Evidence & Source | Assessment / Reality |
| :--- | :--- | :--- | :--- |
| **Live Score** | **VERIFIED** | `pricing.html` row `pf_live_scores`; `dashboard.html` match cards | Ingests live scores from API-Sports for finished and ongoing matches. |
| **Live Match Clock** | **OBSERVED** | `dashboard.html` match item metadata | Displays current match minute from API-Sports live fixture payload. |
| **Live Events (Cards/Corners/Subs)**| **OBSERVED** | API-Sports data integration | Available via API-Sports fixture events endpoint; used to settle finished picks. |
| **Live xG (In-Play Expected Goals)**| **UNKNOWN** | Not displayed on public cards or dashboard shell | FootyStats integration exists in sibling projects, but unverified in public ExPrysm UI. |
| **Live Odds (In-Play Market Prices)**| **NOT OBSERVED** | `pricing.html`, `dashboard.html`, `perf_timing_v1.json` | Public odds are pre-match reference odds. Zero live in-play odds feeds detected. |
| **Dedicated Second-Half Model** | **NOT OBSERVED** | `perf_summary_v1.json`, `perf_timing_v1.json` | ExPrysm's 8 markets include AH, OU, BTTS, Cards, Corners, 1X2, DC, Correct Score. **Zero second-half specific markets** exist in their performance database. |
| **Live Dynamic Entry Timing** | **NOT OBSERVED** | `perf_v2_tab2_timing.js` | Timing tab strictly tracks pre-match lineup updates ("Kickoff Updates / KU") and closing line value (CLV). No in-play entry signals. |
| **In-Play Entry Window** | **NOT OBSERVED** | Dashboard filters and notification scripts | Picks are published once daily in the morning, with optional T-60 pre-match lineup refreshes. |
| **Live Probability Engine** | **NOT OBSERVED** | Client bundles (`perf_v2_*.js`, `dashboard.*.js`) | No dynamic Poisson decay or Markov state transition models present. |
| **Live Edge Calculation** | **NOT OBSERVED** | Telemetry and code | Edge calculation is purely static pre-match ($P_{\text{model}} - P_{\text{implied}}$). |
| **Live In-Play Notifications** | **NOT OBSERVED** | `notifications.js`, `push-subscribe.js` | Push notifications are restricted to "Daily picks ready" and weekly summaries. |
| **Live Match Evaluation** | **VERIFIED** | `pricing.html` row `pm_live_eval`; `chatbot.js` (`chatapi.exprysm.com/chat`) | **Conversational LLM response:** Premium chatbot (Claude) answers queries about live matches using API-Sports score context. |

### 1.2 The ExPrysm "Live" Reality

ExPrysm's marketing presents "Live match evaluation" as a flagship Premium feature. Forensic inspection confirms that this is **NOT** a quantitative mathematical model executing live in-play betting edge calculations.

Instead, it is an **Anthropic Claude chatbot integration** with access to live match score metadata:
1. The user asks the chatbot a question about an ongoing match.
2. The backend queries API-Sports for current score and match clock.
3. The prompt asks Claude to evaluate match dynamics textually.
4. It does **NOT** generate quantitative in-play probabilities, calculate live devigged odds, or emit automated live picks.

---

## 2. HANDICAPLAB LIVE SECOND-HALF FEASIBILITY AUDIT

Before proposing any live or second-half feature in SALMO, the underlying HandicapLab data and research infrastructure must be forensically audited to establish feasibility.

### 2.1 Theoretical Live Second-Half Architecture

To execute a legitimate quantitative live second-half decision engine, the pipeline must support:

```text
[Live Websocket / Low-Latency Feed]
           │ (Sub-second goal/card/minute events)
           ▼
     [Live Bronze]
   (In-Memory State Store / Redis Stream)
           │
           ▼
     [Live Silver]
   (Tick-level event reconciliation, Clock sync)
           │
           ▼
     [Live Gold]
   (Score-state (x-y), Red cards, Current Minute t)
           │
           ▼
[Dynamic In-Play Prediction Model]
 (Time-decaying Bivariate Poisson / Hazard Rate Engine)
           │
           ▼
[Live Sharp Odds Ingestion & Devigging]
 (Pinnacle/Exchange live odds snapshot at minute t)
           │
           ▼
[Live Edge / Decision Gating]
 (P_live_model vs P_live_market)
           │
           ▼
       [SALMO UI]
 (Sub-second websocket consumer push)
```

### 2.2 Technical & Economic Audit Dimensions

#### Dimension 1: Data Providers & Latency
* **Current Status:** API-Football PRO REST API + OddsPapi REST API.
* **Audit Finding:**
  - REST polling over HTTP exhibits 15–45 seconds latency.
  - In-play Asian Handicap lines adjust within 1–3 seconds of an event on sharp exchanges.
  - Consuming live odds or events via REST polling leads to catastrophic latency arbitrage against the user (betting into suspended or stale markets).
  - *Requirement:* Requires dedicated push-based live websockets (e.g. Betfair Exchange Stream API or Betradar Live Odds). HandicapLab possesses zero websocket provider contracts.

#### Dimension 2: Provider Quotas & Rate Limits
* **Current Status:**
  - API-Football PRO: 7,500 requests/day (6,000 internal soft limit).
  - OddsPapi: 250 requests/month (metered sharp odds).
* **Audit Finding:**
  - Polling live odds and events every 30 seconds for a single match across 90 minutes consumes:
    $$\frac{90 \times 60}{30} = 180 \text{ calls per provider per match}.$$
  - Polling 20 concurrent Saturday matches:
    $$20 \times 180 = 3,600 \text{ calls}.$$
  - This single Saturday afternoon slate would consume **60% of API-Football's total daily PRO quota** and would **exhaust OddsPapi's entire monthly quota in 2 minutes**.
  - Rate limiting mechanisms in `ProviderGateway` and `QuotaManagerV4` would immediately trigger `QuotaExhaustionError` and shut down the pipeline.

#### Dimension 3: Mathematical Model Invalidation
* **Current Status:** Dixon-Coles Bivariate Poisson Solver.
* **Audit Finding:**
  - The Dixon-Coles model in `HandicapLab` is parameterized strictly for pre-match, 90-minute unconditional goal expectations ($\lambda_{\text{home}}, \mu_{\text{away}}, \rho$).
  - Second-half in-play modeling requires:
    1. Conditioning on first-half score $S_{45} = (x, y)$ and game state.
    2. Dynamic hazard rate adjustments for time elapsed ($t \in [45, 90]$).
    3. Red card intensity multipliers ($\delta_{\text{home}}, \delta_{\text{away}}$).
    4. Lead-protecting tactical shifts (score-state dependent transition probabilities).
  - HandicapLab possesses **ZERO** dynamic hazard rate, renewal process, or in-play state transition code. Applying pre-match Poisson parameters to a 45-minute conditional remainder produces mathematically invalid probabilities.

#### Dimension 4: Timestamp Synchronization & Anti-Lookahead Integrity
* **Current Status:** Pre-match temporal invariant: $T_{\text{prediction}} \le T_{\text{kickoff}}$.
* **Audit Finding:**
  - Live in-play evaluation requires precise clock synchronization:
    $$T_{\text{odds\_tick}} \equiv T_{\text{event\_tick}} \equiv T_{\text{minute}}.$$
  - If a goal is scored at 51:12 but the provider event registers at 51:45 while the odds update at 51:20, the model experiences severe temporal distortion (calculating pre-goal probabilities against post-goal odds, fabricating false massive positive EV).
  - Replay Lab has no support for sub-minute tick-level historical replay.

#### Dimension 5: Infrastructure Operating Cost
* **Current Status:** Cost footprint is ~$19/mo (API-Football) + $0 (OddsPapi free tier) + Supabase Pro.
* **Audit Finding:**
  - True live in-play feeds with sub-second odds and event streams cost between **$1,500/month to $5,000/month** (Betradar, Sportmonks Live Ultra, or Pinnacle live enterprise tier).
  - Real-time Redis streaming, websocket gateway clusters, and continuous inference servers add another $300–$800/month.
  - This represents a **100x cost explosion** with zero verified user unit economics.

---

## 3. ARCHITECTURAL BLOCKER SUMMARY

| Blocker ID | Domain | Root Blocker | Severity | Status |
| :--- | :--- | :--- | :--- | :--- |
| **BLK-LIVE-01** | Data Ingestion | REST polling latency (15–45s) is too slow for in-play market dynamics. | **CRITICAL** | UNRESOLVED |
| **BLK-LIVE-02** | Quotas & Cost | OddsPapi (250 req/mo) exhausts in 2 minutes; API-Football (7.5k req/day) exhausts in 1 slate. | **FATAL** | UNRESOLVED |
| **BLK-LIVE-03** | Quantitative Engine | Dixon-Coles pre-match solver cannot be evaluated conditionally for in-play second half. | **FATAL** | UNRESOLVED |
| **BLK-LIVE-04** | Data Integrity | Clock drift and out-of-order REST events produce false lookahead EV. | **CRITICAL** | UNRESOLVED |
| **BLK-LIVE-05** | Research Infrastructure | Zero tick-level in-play historical database exists for walk-forward validation. | **CRITICAL** | UNRESOLVED |

---

## 4. VERDICT & STRATEGIC RECOMMENDATION

### VERDICT: HARD STOP — DO NOT BUILD

1. **Neither ExPrysm nor HandicapLab possesses a verified quantitative live second-half engine.**
   - ExPrysm's "live evaluation" is an LLM chatbot novelty wrapper around live score text.
   - HandicapLab's architecture is specialized and validated for pre-match quarter-line Asian Handicap, Over/Under, and BTTS.
2. **Attempting to build live second-half features in SALMO would:**
   - Violate Boundary Hygiene by attempting to solve an infrastructure problem inside the product layer.
   - Instantly exhaust provider quotas, crashing the stable pre-match production pipeline.
   - Present mathematically invalid conditional probabilities to end users.
   - Incur catastrophic operating costs without proven user demand or model edge.
3. **Strategic Pivot:**
   - SALMO must double down on its verifiable, mathematical pre-match edge (Dixon-Coles bivariate Poisson, devigged quarter-line Asian Handicap, and cryptographic immutable ledger), where it already holds a superior methodological foundation over ExPrysm's losing pre-match football models.

