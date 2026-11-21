# SALMO — QUANT TERMINAL UI/UX, i18n & MONETIZATION OVERHAUL
## Executive Verification & Deployment Report

**Commit:** `fa8a3f4`  
**Branch:** `feat/handicaplab-salmo-3market-terminal`  
**Target Environment:** Antigravity IDE / Staging / Production  
**Status:** **READY FOR DEPLOYMENT — ALL QA GATES PASSED (9/9 Tests, 0 Type Errors, 0 Lint Errors, Clean Production Build)**

---

## 1. Executive Summary

This release completely transforms SALMO into an **OddsJam-density Quantitative Sports Analytics Terminal** tailored exclusively for high-volume football bettors across the three most liquid markets in global sports wagering: **Asian Handicap (AH)**, **Over/Under (O/U)**, and **Moneyline (1X2)**.

All secondary noise (corners, yellow cards, throw-ins, generic possession stats) has been purged from the core surveillance matrix. The new UI pairs high data density with the instant color classification of BettingStats, an instant slide-over deep dive drawer, an immutable public ledger, 7 bettor languages with 100% key parity, and a worldwide low-friction monetization architecture featuring non-expiring credit packs, 48-hour weekend passes, and multi-chain stablecoin payment rails (USDC / USDT).

---

## 2. Key Architecture Pillars

### A. Design System & Theme Engine (Zero-FOUC)
- **Terminal Palette:**
  - Dark Navy Terminal (Default): Canvas `#070B14`, Card `#0F1624`, Panel `#121A2A`, Elevated `#161F30`, Border `#1E293B`, Text `#F8FAFC`, Muted `#94A3B8`.
  - Bright Mode (Counterpart): Canvas `#F8FAFC`, Card `#FFFFFF`, Panel `#F1F5F9`, Elevated `#E2E8F0`, Border `#CBD5E1`, Text `#0F172A`.
  - Signal Badges: Emerald (`#10B981`), Amber (`#F59E0B`), Red (`#EF4444`), Cyan (`#06B6D4`).
- **Anti-FOUC Invariant:** Pre-hydration theme injection script in `src/app/layout.tsx` guarantees zero white-flash on page reload.
- **Tabular Alignment:** Monospace numbers (`.font-tabular`, `.font-mono`) across all market lines, odds, and EV percentages.

### B. Core 3-Market Specialization & Mathematics
- **Asian Handicap (AH):**
  - Full split-line support from `-1.25` to `+1.25`.
  - Quarter-line mathematical settlement without midpoint probability inversion:
    $$\text{EV} = P_{win}^{eff} \cdot (\text{Odds} - 1.0) - P_{lose}^{eff} \cdot 1.0$$
- **Over/Under Totals (O/U):**
  - 1.5, 2.5, and 3.5 total goal hit-rates derived from Dixon-Coles bivariate Poisson grid.
  - Full goal distribution histogram (0-1, 2, 3, 4+ goals).
- **Moneyline (1X2):**
  - True devigged 3-way probabilities.
  - Explicit bookmaker vigorish / overround display.

### C. OddsJam-Style Terminal Navigation & Drawer
- **Persistent Left Sidebar (`TerminalSidebar.tsx`):**
  - Desktop: 240px width collapsible into a sleek 72px icon rail.
  - Mobile: Slide-over drawer + compact bottom thumb navigation bar.
- **Top Utility Bar (`TopUtilityBar.tsx`):**
  - Instant fixture search (team or league).
  - Quick league filter (All, Premier League, La Liga, Serie A, Bundesliga, Ligue 1).
  - Multi-odds format switcher: Decimal (DEC), American (AMER), Hong Kong (HK), Malay (MY).
- **Slide-Over Deep Dive Drawer (`MatchDeepDiveDrawer.tsx`):**
  - Opens on the right without navigating away or causing full page reloads.
  - Three specialized tabs: Asian Handicap Matrix, Over/Under Goals, and Moneyline Probabilities.

### D. Global i18n Parity (7 Worldwide Bettor Languages)
- Fully supported languages:
  1. **EN** (English — International)
  2. **ES** (Español — Spain & Latin America)
  3. **PT** (Português — Brazil & Portugal)
  4. **ZH** (简体中文 — East Asia / Macau)
  5. **ID** (Bahasa Indonesia — Southeast Asia)
  6. **TH** (ไทย — Southeast Asia)
  7. **VI** (Tiếng Việt — Southeast Asia)
- **100% Key Parity:** Every locale JSON dictionary contains identical key hierarchies with zero empty strings or missing properties.

### E. Worldwide Low-Friction Monetization & Anti-Banned Payment Rails
- **Tiers:**
  - **Free Scout:** $0 (3 match analyses/day, standard terminal view).
  - **Weekend Pass:** $1.99 (48 hours all-access, non-recurring).
  - **Starter 40 Pack:** $4.99 (40 match unlocks, credits never expire).
  - **Grinder 100 Pack:** $9.99 (100 match unlocks, credits never expire, most popular).
  - **Pro Monthly:** $7.99/mo (unlimited terminal access, live scanner, public ledger).
  - **Pro Annual:** $59/yr ($4.91/mo, saves 38%).
- **Multi-Rail Payments (`paymentRails.ts`):**
  - Fiat (Debit/Credit Card, PayPal).
  - Stablecoins (USDC / USDT) on low-fee networks: **Base**, **Polygon**, **Arbitrum**, and **TRON (TRC20)**.
- **Graceful Feature Flag:** When `NEXT_PUBLIC_MONETIZATION_ENABLED=false`, `/pricing` stays live and renders an "Early Access — Currently Free During Live Verification" banner with zero broken buttons.
- **18+ Compliance:** Prominent responsible gambling notices and non-gambling analytical disclaimers on footer, pricing, and methodology.

---

## 3. Automated Test Suite & QA Gate Verification

All verification tests run under Node's native test runner (`node --test`):

```bash
node --test tests/terminal/*.test.js
```

| Test Suite | Spec | Result | Duration |
| :--- | :--- | :---: | :---: |
| `i18n-parity.test.js` | 1. All 7 locale JSON files exist & valid JSON | **PASS** | 3.2ms |
| `i18n-parity.test.js` | 2. 100% key hierarchy parity across 7 languages | **PASS** | 3.0ms |
| `i18n-parity.test.js` | 3. Zero empty strings across all 7 dictionaries | **PASS** | 2.6ms |
| `odds-format-and-ev.test.js` | 4. Exact Decimal, American, HK, Malay odds | **PASS** | 0.9ms |
| `odds-format-and-ev.test.js` | 5. Quarter-line EV non-inversion invariant | **PASS** | 0.2ms |
| `odds-format-and-ev.test.js` | 6. BettingStats badge color classification | **PASS** | 0.1ms |
| `entitlement-gating.test.js` | 7. Pricing tiers & invariants validation | **PASS** | 0.8ms |
| `entitlement-gating.test.js` | 8. Multi-rail payment intent generation | **PASS** | 1.1ms |
| `entitlement-gating.test.js` | 9. Quota & credit balance deduction gating | **PASS** | 0.2ms |
| **Total Test Suite** | **9 automated terminal tests** | **9 / 9 PASS** | **324 ms** |

---

## 4. Build, Typecheck, and Linter Audit

| Audit Step | Command | Exit Code | Result | Notes |
| :--- | :--- | :---: | :---: | :--- |
| **Type Check** | `npx tsc --noEmit` | **0** | **0 errors** | Full static type safety across React 19 & Next.js 15 |
| **Linter** | `npm run lint` | **0** | **0 warnings** | ESLint verified cleanly |
| **Production Build** | `npm run build` | **0** | **0 errors** | 36 static / SSG / dynamic routes successfully built |

### Verified Route Inventory
- `○ /` (Today's Terminal Slate — 138 kB)
- `○ /asian-handicap` (Dedicated AH Matrix — 138 kB)
- `○ /over-under` (Dedicated Over/Under Totals — 138 kB)
- `○ /moneyline` (Dedicated 1X2 Moneyline & Overround — 138 kB)
- `○ /scanner` (+EV Algorithmic Value Scanner — 138 kB)
- `○ /ledger` (Public Pre-Kickoff Ledger — 132 kB)
- `○ /pricing` (Pricing, Passes & Payment Rails — 134 kB)
- `○ /methodology` (Quantitative Specification & 18+ — 132 kB)

---

## 5. Non-Negotiable Boundary Checks

1. **Research Branch Isolation:** Research branch `epic75/odds-microstructure-incremental-test` was preserved completely intact. All UI work was completed on dedicated branch `feat/handicaplab-salmo-3market-terminal`.
2. **Holdout Invariant:** Directory `data/research/holdout_2026_2027/` was **never accessed, read, or modified**.
3. **Backend Model Protection:** Zero modification to production quant models, cron jobs, database migrations, or betting engines.
4. **Zero Fabrication:** If odds or lines are missing or not yet posted, the terminal renders a clean `—` fallback state.
