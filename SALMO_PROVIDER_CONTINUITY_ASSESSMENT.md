# SALMO DATA CONTINUITY & PROVIDER SEPARATION ASSESSMENT

**Project:** Salmo.dev  
**Audit Date:** November 7, 2026  
**Auditor:** Quantitative Systems Architect & Data Provenance Lead  
**Assessment Target:** Impact of API-Football suspension on Salmo research and production pipelines, and independent evaluation of 5DollarFootballAPI.

---

## 1. Executive Summary & Continuity Verdict

```
========================================================================================
SALMO SYSTEM CONTINUITY VERDICT: 100% OPERATIONAL & PROTECTED
========================================================================================
HISTORICAL RESEARCH ASSETS:   SECURED & DUAL-DISK MIRRORED (379,143 + 3,710 records)
CANONICAL FIXTURE PIPELINE:   ACTIVE (Supabase public.matches + Open Feeds)
SHARP MARKET ODDS:            ACTIVE (OddsPapi Pinnacle Benchmark)
MATCH SETTLEMENT:             ACTIVE (FreeResultsAdapter & Database Scores)
FABRICATED / MOCK DATA:       STRICTLY ZERO (Fail-Closed Contract Enforced)
5DOLLARFOOTBALLAPI POSTURE:   STRICTLY INDEPENDENT (Isolated Provider Boundary)
========================================================================================
```

The suspension of API-Football has **ZERO critical operational impact** on Salmo's live production predictions or settlement integrity. Because of Salmo's strict four-layer decoupling architecture, no single provider outage can paralyze the platform.

---

## 2. Decoupled Architecture & Layer Assessment

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        SALMO FOUR-LAYER DATA SEPARATION                                │
├───────────────────────┬───────────────────────────────┬────────────────────────────────┤
│ ARCHITECTURAL LAYER   │ PRIMARY ACTIVE SOURCE         │ STATUS UNDER AF SUSPENSION     │
├───────────────────────┼───────────────────────────────┼────────────────────────────────┤
│ 1. Historical Dataset │ Dribble360 Local Archive      │ 100% INTACT (Offline DuckDB)   │
│                       │ API-Football Pre-Expiry Vault │ Dual-disk mirrored (Drive C/D) │
│ 2. Fixture Discovery  │ Supabase `public.matches`     │ 100% OPERATIONAL               │
│                       │ Open-Source Feeds             │ Fallback standby ready         │
│ 3. Sharp Market Odds  │ OddsPapi (Pinnacle Benchmark) │ 100% ACTIVE (208 req available)│
│ 4. Match Settlement   │ Supabase Match Results        │ 100% AUTOMATED & ACCURATE      │
│                       │ FreeResultsAdapter            │ Zero API-Football dependency   │
└───────────────────────┴───────────────────────────────┴────────────────────────────────┘
```

### Layer 1: Historical Research Datasets
- **Dribble360 Feature Reservoir:** 379,143 records across 8 seasons (2019/20 to 2026/27) permanently preserved in `HandicapLab/data/harvest/dribble360/` as Parquet and JSONL. All Dixon-Coles parameters, home-advantage factors, and team ratings are pre-calculated and versioned (`dynamic-ratings-v1.0`).
- **API-Football Pre-Expiry Vault:** 3,710 files (40.79 MB) harvested on October 13, 2026, containing canonical fixtures (13,386 matches), standings (927 rows), and deep match stats with official xG (3,428 matches across Big 5 European leagues). Cryptographically validated via SHA-256 and mirrored on physical secondary storage (`Drive D: ST500DM009-2DM14C`).
- **Status:** **100% OFFLINE CAPABLE. Zero recurring network dependency.**

### Layer 2: Canonical Fixture Pipeline
- In `src/engine/matchIntelligenceService.ts` lines 82–110:
  - Upcoming scheduled fixtures are loaded directly from Supabase `public.matches` ordered by kickoff.
  - If database returns zero upcoming fixtures, the system falls back to `HandicapLabAdapterFactory.getAdapter().getSalmoSync({ view: 'fixtures' })`.
  - If both sources yield 0 fixtures, the service strictly **fails closed**, returning an empty array `[]`.
- **Status:** **100% PROTECTED. Zero fabrication of matches.**

### Layer 3: Sharp Market Odds (OddsPapi)
- API-Football was **NEVER** used for sharp odds. API-Football lacks sharp Pinnacle closing line data and features bookmaker latency.
- Salmo's Asian Handicap and Goal Line Over/Under models rely 100% on **OddsPapi** (`https://api.oddspapi.io/v4`), which provides authentic Pinnacle decimal odds (`market 1070` for AH, `market 1010` for OU).
- Current OddsPapi Quota: 42 requests used out of 250, with **208 requests remaining** and a 50-request hard reserve floor protected by `OddsPapiQuotaGuard`.
- **Status:** **ACTIVE & HEALTHY.**

### Layer 4: Match Settlement & Reconciliation
- In `src/engine/settlement/productionSettlementRunner.ts`:
  - Level (a) resolves official scores from Supabase `public.matches`.
  - Level (b) resolves scores from `FreeResultsAdapter` and HandicapLab verified results.
  - All direct API-Football calls were permanently excised in commit `935fb88` (October 18, 2026).
- **Status:** **100% ACCURATE & INDEPENDENT.**

---

## 3. Data Integrity & Anti-Fabrication Guarantees

Salmo enforces four strict anti-fabrication invariants across the entire platform:

1. **Fail-Closed on Missing Upstream Data:**  
   `NO PROVIDER DATA = NO FIXTURES = NO PREDICTIONS = NO PICKS`.  
   If upstream fixture or odds feeds fail, the prediction engine returns `status: "DATA_UNAVAILABLE"` or `NO_QUALIFIED_PICKS`. It never synthesizes placeholder fixtures or mock scorelines.
2. **Zero Mock Ingestion in Production:**  
   Mock providers are restricted strictly to unit tests (`tests/infrastructure.test.js`). Runtime code validates provider payloads and rejects mock structures.
3. **Transparent Provenance Tracking:**  
   Every prediction generated carries an immutable SHA-256 hash, recording the exact odds snapshot timestamp, bookmaker key (`pinnacle`), model version (`dixon-coles-v1.0`), and rating artifact hash.
4. **Frozen Mathematical Models:**  
   Model formulas (Dixon-Coles 11x11 bivariate Poisson grids, tau correlation matrix, Asian quarter-line settlement math) remain completely untouched and frozen.

---

## 4. Phase 10 — 5DollarFootballAPI Separation & Evaluation

The user is evaluating **5DollarFootballAPI Free** as an independent odds provider. To prevent cross-contamination or single-point failure, strict separation rules are established:

### 4.1 Strict Architectural Separation Rules
1. **Zero Credential Sharing:** 5DollarFootballAPI tokens must use dedicated variables (`FIVEDOLLAR_API_KEY`) and must never be co-mingled with API-Football or OddsPapi configurations.
2. **Independent Quota Management:** 5DollarFootballAPI quotas must be metered in a dedicated guard (`FiveDollarQuotaGuard`), completely segregated from `OddsPapiQuotaGuard`.
3. **No Cross-Attribution of Status:** An outage or suspension of API-Football must never affect 5DollarFootballAPI, and vice-versa.
4. **No Unvalidated Replacement:** 5Dollar data cannot replace API-Football statistics or OddsPapi Pinnacle benchmark odds without prior quantitative parity validation.

### 4.2 Intended Trial Dual-Provider Division of Labor

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        INTENDED TRIAL ARCHITECTURE                                     │
├─────────────────────────────────────────────────┬──────────────────────────────────────┤
│ API-FOOTBALL (FREE TIER - WHEN REINSTATED)      │ 5DOLLARFOOTBALLAPI (FREE TIER)       │
├─────────────────────────────────────────────────┼──────────────────────────────────────┤
│ • Canonical Fixtures discovery                  │ • Bet365 Asian Handicap odds         │
│ • Official team standings and form strings      │ • Goal Line Over/Under decimal lines │
│ • Head-to-Head (H2H) match history              │ • Opening line tracking              │
│ • Starting XI lineups & confirmed injuries      │ • Closing line movement              │
│ • League schedules & kickoff UTC timestamps     │ • In-play odds monitoring            │
└─────────────────────────────────────────────────┴──────────────────────────────────────┘
```

### 4.3 Mandatory Pre-Activation Validation Checklist for 5DollarFootballAPI
Prior to integrating 5DollarFootballAPI into Salmo's live prediction loop, the following 5 gates must be satisfied:
- [ ] **Gate 1 (Coverage Verification):** Verify that 5DollarFootballAPI covers all 15 canonical leagues with fresh Bet365 Asian lines $\le 4$ hours before kickoff.
- [ ] **Gate 2 (Decimal Line Precision):** Confirm that handicap lines are reported in standard quarter-line increments (e.g. $-0.25, -0.50, -0.75, -1.00$) rather than ambiguous text strings.
- [ ] **Gate 3 (Timestamp Freshness):** Audit odds latency against real Bet365 exchange lines to ensure price updates are not delayed by $> 5$ minutes.
- [ ] **Gate 4 (Rate Limits & Terms):** Verify Free tier daily call caps, burst limits, and commercial evaluation terms.
- [ ] **Gate 5 (Isolated Provider Client):** Implement a dedicated client (`FiveDollarFootballProvider.ts`) with bounded retries, independent caching, and fail-closed error handling.

---

## 5. Summary & Next Steps

1. **Production Pipeline:** Remains fully functional, powered by OddsPapi and Supabase.
2. **API-Football Suspension:** Pose zero threat to data continuity; all necessary historical data is stored locally.
3. **Action on 5DollarFootballAPI:** Proceed with read-only sandbox evaluation of response schemas and market completeness before writing any production adapters.
