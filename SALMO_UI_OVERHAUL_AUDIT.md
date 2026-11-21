# SALMO — FRONTEND UI/UX OVERHAUL, i18n & MONETIZATION ARCHITECTURE AUDIT

**Date:** 2026-11-21  
**Branch:** `feat/salmo-terminal-ui-i18n-monetization` (branched from clean `main`)  
**Isolation Status:** Research branch `epic75/odds-microstructure-incremental-test` is strictly isolated. Backend models, database schemas, and holdout 2026/27 are untouched.

---

## 1. Current Repository Baseline

- **Framework:** Next.js 15.1.0 (App Router), React 19.0.0, TypeScript 5.7.2.
- **Styling:** Tailwind CSS 3.4.17 (`darkMode: "class"`), Lucide React 0.468.0.
- **Current Theme:** Dark/Light toggle exists in `src/theme/context.tsx`, but palettes contain mixed beige/warm tones (`#F6F3EE`, `#E4DED4`) incompatible with institutional quant trading aesthetics.
- **Current Layout:** Conventional top navbar with numbered items (`01 Research`, `02 Picks`, etc.). Lacks persistent left sidebar navigation and table density required for pre-match odds surveillance.
- **Current i18n:** Limited 5-language setup (`en, es, pt-BR, hi, fr`) in a monolithic TS file with untyped gaps. Missing critical Asian Handicap & global bettor hubs (`zh-CN, id, th, vi`).
- **Current Monetization:** `/pricing` returns `notFound()` when `MONETIZATION_ENABLED=false`. Lacks non-subscription models (Weekend Pass, Credit Packs) and Stablecoin payment rails.
- **Market Focus:** Currently cluttered with legacy BTTS, cards, and corners. Must be refocused exclusively on the 3 core markets: **Asian Handicap (AH)**, **Over/Under (O/U)**, and **Moneyline (1X2)**.

---

## 2. Architecture Plan & Exact Files to Create / Modify

### A. Phase 1: Institutional Design System & Theme Engine
- Palette: **Default Dark Mode** (Deep Slate/Navy `#070B14`, `#0F1624`, `#161F30`, `#1E293B`, `#F8FAFC`, `#94A3B8`, `#10B981` Emerald, `#F59E0B` Amber, `#EF4444` Coral) + **Bright Mode** (`#F8FAFC`, `#FFFFFF`, `#F1F5F9`, `#E2E8F0`, `#0F172A`, `#059669`).
- Typography: Tabular numerals (`font-variant-numeric: tabular-nums`) across all odds, handicaps, EV%, probabilities, and xG metrics.
- *Files:* `tailwind.config.ts`, `src/theme/tokens.ts`, `src/theme/context.tsx`, `src/app/globals.css`.

### B. Phase 2: OddsJam-Inspired Left Sidebar & 3-Market Terminal
- Navigation: Persistent Left Sidebar (Desktop 240px collapsible to 72px icon rail; Mobile drawer + bottom bar).
- Top Utility Bar: Search, League multi-select, Date selector, Odds Format Switcher (Decimal, American, HK, Malay), Theme toggle, Language selector.
- High-Signal Match Matrix Table: BettingStats color-coded pills (`+EV >= 3%` Green, `1.0-2.9%` Amber, `< 1%` Slate), xG bar, Action drawer.
- Slide-over Match Deep-Dive Drawer: Exact split-line AH calculation (`EV = P_win*(O-1) - P_lose`), O/U Poisson expectations, Moneyline No-Vig Fair Odds.
- *Files:* `src/components/terminal/TerminalSidebar.tsx`, `TopUtilityBar.tsx`, `TerminalLayout.tsx`, `MatchMatrixTable.tsx`, `MatchDeepDiveDrawer.tsx`, `OddsFormatContext.tsx`, `src/app/page.tsx`, `src/app/asian-handicap/page.tsx`, `src/app/over-under/page.tsx`, `src/app/moneyline/page.tsx`, `src/app/scanner/page.tsx`, `src/app/ledger/page.tsx`.

### C. Phase 3: Global Multi-Language System (7 Bettor Languages)
- Locales: `en` (English), `es` (Español), `pt` (Português), `zh` (简体中文), `id` (Bahasa Indonesia), `th` (ภาษาไทย), `vi` (Tiếng Việt).
- Domain-accurate sports betting terminology for split handicaps, over/under totals, and fair probabilities.
- *Files:* `src/i18n/locales/{en,es,pt,zh,id,th,vi}.json`, `src/i18n/types.ts`, `src/i18n/context.tsx`.

### D. Phase 4: Worldwide Monetization & Payment Rails
- Tiers: Free ($0, 3 match deep-dives/day), Weekend Pass ($1.99 / 72h), Credit Packs ($4.99 for 40 credits, $9.99 for 100 credits), Pro Monthly ($7.99/mo), Pro Annual ($59/yr).
- Payment Rails: Stablecoin (USDC/USDT on Base/Polygon/Arbitrum/TRC-20) + Fiat (Card/PayPal/E-wallets).
- `MONETIZATION_ENABLED=false` safety: Renders clean Early Access banner with zero broken buttons and zero 404s.
- 18+ compliance & non-gambling statistical database disclaimers.
- *Files:* `src/lib/billing/types.ts`, `src/lib/billing/paymentRails.ts`, `src/config/entitlements.ts`, `src/hooks/useEntitlements.ts`, `src/app/pricing/page.tsx`.

### E. Phase 5: Verification & Automated Test Suites
- Test suites:
  - `tests/terminal/i18n-parity.test.js`: 100% key parity across all 7 language dictionaries.
  - `tests/terminal/odds-format-and-ev.test.js`: Decimal, American, HK, Malay conversions and quarter-line EV calculations.
  - `tests/terminal/entitlement-gating.test.js`: Feature flag behavior and credit/tier gating.
- Full type safety (`tsc --noEmit`), linting (`npm run lint`), and production build (`npm run build`).

---

## 3. Strict Safety Invariants
1. No mutation to `data/research/holdout_2026_2027/`.
2. No modification to mathematical prediction models or ingestion cron jobs.
3. No fake data fabrication: real API and fallback data used with clean `—` indicators.
4. No commit to `main` until all Phase 5 gates pass 100%.
