# SALMO.DEV — SHADOW DASHBOARD & OPERATIONS BASELINE AUDIT

**Audit Date:** 2026-11-09T08:35:00+07:00 (Asia/Jakarta)  
**Evaluator:** Principal Frontend & Systems Architect  
**Objective:** Establish repository, UI architecture, routing conventions, and shadow subsystem baselines prior to dashboard implementation.  
**Safety Mandate:** Isolated Shadow Operations Only (Zero Production Modifications).

---

## 1. Repository & Git State Checkpoint

| Parameter | Inspected State | Parity & Integrity Verdict |
| :--- | :--- | :--- |
| **Working Root** | `C:/Users/RYZEN/.antigravity-ide/SALMO` | Clean working boundary |
| **Active Branch** | `main` | Verified |
| **HEAD SHA** | `a24a545a7f63c5f7a934cd7181fac385b913fd10` | Verified (`feat(salmo): add quota-aware 5Dollar free shadow research`) |
| **Remote Status** | Ahead of `origin/main` by 8 commits | Verified (Local development only; no push) |
| **Tracked Changes** | Zero unstaged or staged modifications | Clean working tree on all tracked assets |
| **Untracked Assets** | `data/research/fivedollar_shadow/` & 9 historical investigation reports | Preserved without contamination |

---

## 2. Existing Frontend & UI Conventions

1. **Framework & Runtime:**
   - Next.js 15.1.0 (App Router architecture under `src/app/`)
   - React 19.0.0
   - TypeScript 5.7.2
   - Tailwind CSS 3.4.17 with custom `salmo` design system palette.
2. **Design System & Styling:**
   - **Theme:** Dark, understated, institutional, and dense (`salmo.dark.bg: "#0B0D10"`, `surface: "#111418"`, `elevated: "#171B20"`, `border: "#232830"`).
   - **Typography:** Inter sans-serif paired with monospace fonts for numerical data, IDs, and timestamps.
   - **Status Badges:** Strict color mapping:
     - `QUALIFIED_VALUE_BET`: `#22C55E` (Emerald Green)
     - `PANTAU` / `WATCHLIST`: `#EAB308` (Amber Yellow)
     - `LEWATI`: `#71717A` (Muted Zinc Grey)
     - `RESEARCH_ONLY`: `#3B82F6` (Steel Blue)
     - `NO_MARKET_DATA` / `UNVERIFIED`: `#EF4444` (Coral Red)
3. **Existing Page Inventory:**
   - Public pages: `/`, `/research`, `/picks`, `/matches`, `/performance`, `/blog`, `/pricing`
   - User dashboard: `/dashboard/page.tsx` (consumer subscription view)
   - Proposed Operator Route: `/admin/shadow-operations/page.tsx` (strictly operator-only, separated from consumer pages).

---

## 3. Existing Shadow Subsystems Inventory

| Subsystem Component | File Path | Verified Capability |
| :--- | :--- | :--- |
| **Quota Manager** | `src/lib/quota/fiveDollarQuotaManager.ts` | 42 req/hr budget, 12 req/min burst, token bucket, priority queuing, cache, circuit breaker |
| **Provider Adapter** | `src/services/providers/fiveDollarFreeProvider.ts` | Free-tier constraints, Top-5 leagues, Bet365 odds, fail-closed unconfigured status |
| **Shadow Engine** | `src/engine/shadow/fourMarketShadowEngine.ts` | Dixon-Coles Poisson grid, AH quarter lines, OU split lines, 1X2 devig, BTTS research isolation |
| **Daily Script** | `scripts/run_fivedollar_shadow_daily.js` | Idempotent daily run harness, ledger writer, performance aggregator |
| **Integration Suite**| `tests/fivedollar_free_integration.test.js` | 13/13 passing automated unit & integration tests |
| **Shadow Storage** | `data/research/fivedollar_shadow/` | Local JSONL ledger & daily prediction JSON output |

---

## 4. Architectural Design for Shadow Dashboard

To satisfy all operator requirements without modifying production tables, the dashboard will be powered by:
1. **Isolated Backend Service:** `src/services/shadow/shadowOperationsService.ts` to query, aggregate, and execute operations across:
   - Provider health and quota status.
   - Active daily predictions (upcoming matches).
   - Historical ledger records (categorized into 4 strict provenance classes).
   - Settlement and CLV performance by market.
   - Daily run execution logs.
2. **Dedicated Read/Write API Route:** `src/app/api/admin/shadow-operations/route.ts` with server-side bearer authorization and concurrency locking.
3. **Dense Operator Dashboard UI:** `src/app/admin/shadow-operations/page.tsx` featuring tabbed views, KPI summary cards, filter bars, drill-down panels, and execution controls.

---

## 5. Baseline Gate Verdict

```
========================================================================================
SALMO.DEV SHADOW DASHBOARD BASELINE DETERMINATION
========================================================================================
BASELINE STATUS:          PASS
CURRENT REPOSITORY HEAD:  a24a545a7f63c5f7a934cd7181fac385b913fd10
PRODUCTION ISOLATION:     100% PRESERVED
NEXT PHASE:               PHASE 1 — LIVE PROVIDER VERIFICATION
========================================================================================
```
