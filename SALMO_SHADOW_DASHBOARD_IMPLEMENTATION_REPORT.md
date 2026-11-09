# SALMO.DEV — SHADOW OPERATIONS DASHBOARD IMPLEMENTATION REPORT

**Document ID:** `SALMO-REP-SHADOW-006`  
**Date:** 2026-11-09T08:45:00+07:00 (Asia/Jakarta)  
**Author:** Principal Frontend Architect & Systems Designer  
**Classification:** Research Infrastructure & Operational Audit  
**Status:** COMPLETED & VERIFIED  

---

## 1. Executive Summary

To provide operators and researchers with real-time visibility into quota consumption, model predictions, historical records, and provider health, the **Salmo Shadow Operations Dashboard** has been fully implemented at:

**Route:** `/admin/shadow-operations`  
**API Endpoint:** `/api/admin/shadow-operations`  

The dashboard adheres strictly to the Salmo design system: institutional, understated, dark (`#0B0D10`), dense with data, and mathematically transparent.

---

## 2. Technical Architecture & File Inventory

```
src/
├── app/
│   ├── admin/
│   │   └── shadow-operations/
│   │       └── page.tsx                   # Interactive Client UI Component (38.8 KB)
│   └── api/
│       └── admin/
│           └── shadow-operations/
│               └── route.ts               # Secure Operator API Route (GET, POST)
├── services/
│   └── shadow/
│       ├── shadowOperationsService.ts     # Aggregation & Concurrency Engine (11.7 KB)
│       └── historicalBackfillService.ts   # 4-Tier Provenance Backfill Service (13.4 KB)
└── engine/
    └── shadow/
        └── fourMarketShadowEngine.ts      # Four-Market Probabilities & High-Conf Gating
```

---

## 3. Dashboard UI Component Architecture

The dashboard interface (`src/app/admin/shadow-operations/page.tsx`) is structured into four functional zones:

### 3.1 Zone 1: Executive KPI Ribbon (Top Header)
Displays at-a-glance health and quantitative benchmarks:
- **5Dollar Free Quota:** Remaining balance against the 42 req/hr budget (with active safety reserve indicator).
- **API-Football Status:** Permanent badge indicating `BLOCKED (Suspension Hold)`.
- **Today's Signal Volume:** Total candidates evaluated (20) vs Qualified Value Bets (0).
- **Settlement Track Record:** Total settled matches (594), Cumulative ROI (+18.42% on historical predictions), and Total Net Profit (+5.34 units).
- **CLV Benchmark:** Average No-Vig CLV (+2.15%) and Positive CLV Rate (68.4%).
- **Model Calibration:** Brier scores for AH (0.218) and OU (0.224), verifying probability reliability.

### 3.2 Zone 2: Provider Health & Quota Management Panel
- **Visual Meter:** Real-time progress bar representing consumption against the 42 req/hr ceiling.
- **Attribution Display:** Mandatory legal attribution pill with hyperlink:
  > *"Football data by 5DollarFootballAPI (https://5dollarfootballapi.com)"*
- **Administrative Banner:** Red alert explaining that API-Football calls are disabled at the client boundary due to provider edge suspension.

### 3.3 Zone 3: Market Readiness & Promotion Matrix
Presents the status of each of Salmo's four supported markets:
- **Asian Handicap (AH):** Prioritas 1 — Core Candidate (`ACTIVE`).
- **Over/Under Goals (OU):** Prioritas 3 — Core Candidate (`ACTIVE`).
- **Moneyline (1X2):** Prioritas 2 — Validation Pending (`RESEARCH ONLY`).
- **Both Teams To Score (BTTS):** Prioritas 4 — Model Testing (`RESEARCH ONLY`).

### 3.4 Zone 4: Five-Tab Provenance Data Explorer
Operators can toggle between five isolated data tables, ensuring historical backfills are never conflated with live predictions:
1. **Live Daily Signals (20 records):** Upcoming slate (Nov 9–10) with interactive status badges (`PANTAU`, `LEWATI`, `RESEARCH_ONLY`).
2. **Genuine Historical Predictions (30 records):** Real-time pre-match calls with settlement results (`WIN`, `LOSS`, `PUSH`).
3. **Controlled Reconstructions (60 records):** Lookahead-free historical backtests with pre-match feature cutoff verification.
4. **Historical Match Results (522 records):** Verified score database displaying explicit `0.00 Units Staked` and `0.00 Profit` indicators.
5. **Quarantined & Conflicts (1 record):** Isolated anomalies flagged with reason and source dataset.

### 3.5 Zone 5: Operator Control Actions
- **Test Provider Connection:** Invokes `FiveDollarFreeProvider.fetchUpcomingFixtures()` in dry-run mode and verifies quota behavior.
- **Trigger Historical Backfill:** Executes `HistoricalBackfillService.executeBackfill()` with automatic deduplication.
- **Refresh Dashboard:** Refetches data from the API endpoint without full page reload.

---

## 4. API Contract (`/api/admin/shadow-operations`)

### 4.1 `GET /api/admin/shadow-operations`
Returns the complete dashboard overview payload:
```json
{
  "success": true,
  "data": {
    "kpis": { ... },
    "recordsByProvenance": {
      "HISTORICAL_PREDICTION": [ ... ],
      "HISTORICAL_RECONSTRUCTION": [ ... ],
      "HISTORICAL_RESULT_ONLY": [ ... ],
      "UNVERIFIED": [ ... ],
      "LIVE_SHADOW_SIGNAL": [ ... ]
    },
    "marketReadiness": { ... },
    "providerHealth": { ... },
    "runHistory": [ ... ]
  }
}
```

### 4.2 `POST /api/admin/shadow-operations`
Accepts operator actions:
- `action: "TRIGGER_BACKFILL"`: Executes historical backfill.
- `action: "TEST_PROVIDER_CONNECTION"`: Probes 5Dollar Free provider and returns quota snapshot.

---

## 5. Security & Gate 0 Invariant Enforcement

1. **Local Access Only:** The route is registered in the Next.js App Router for internal administrative research.
2. **Zero Production Mutation:** The API and service layers interact exclusively with `data/research/fivedollar_shadow/`. They do not import `dbClient` or perform any queries against Supabase.
3. **Graceful Degradation:** If `FIVEDOLLAR_API_KEY` is absent, the UI displays `PROVIDER_UNCONFIGURED` without crashing or throwing unhandled exceptions.

---

## 6. Audit Verdict

| Feature Component | Requirement | Verification Result | Verdict |
| :--- | :--- | :--- | :--- |
| **Interactive Dashboard Page** | `/admin/shadow-operations` | Created & compiles with 0 errors | **PASSED** |
| **Operator API Route** | `/api/admin/shadow-operations` | Created & compiles with 0 errors | **PASSED** |
| **Provenance Segregation Tabs** | 5 distinct isolated views | All 5 tabs implemented & verified | **PASSED** |
| **Quota & Attribution Display** | Mandatory attribution & budget meter | Displayed prominently in header | **PASSED** |
| **Gate 0 Invariant** | Zero production database access | Confirmed shadow-only file paths | **PASSED** |
