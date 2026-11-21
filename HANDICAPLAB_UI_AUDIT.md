# HANDICAPLAB / SALMO — 3-MARKET WEB APP & TERMINAL ARCHITECTURE AUDIT
**Document ID:** `HANDICAPLAB_UI_AUDIT.md`  
**Branch:** `feat/handicaplab-3market-terminal`  
**Audit Target:** Frontend Architecture, Visual System, Quant Engine, i18n, and Monetization  
**Status:** Completed & Verified  

---

## 1. System Overview & Clean Separation Invariant

HandicapLab is positioned strictly as a **"Football Statistical Database & Pre-Match Analytics Tool"** combining:
- The statistical depth of FootyStats (purged of all throw-in/corner/card noise).
- The high-frequency density and speed of an OddsJam / Bloomberg terminal.
- Instant BettingStats-inspired visual signal classification (Green $\ge 65\%$ / $+EV \ge 3\%$, Amber $41\%–64\%$, Red $\le 40\%$).

### Strict Non-Gambling Compliance Invariants
1. **Zero Bet Placement:** No bet slips, no bet placement APIs, no bookmaker affiliate checkout links.
2. **Zero Guaranteed-Win Claims:** Transparent historical public record preserving red/losing days.
3. **Mandatory 18+ Age Gate & Disclaimer:** Prominently persisted on first visit, footer, and checkout modals.

---

## 2. Next.js 15 App Router Architecture Map

```
src/
├── app/
│   ├── layout.tsx                     # Root layout (Theme, i18n, OddsFormat, Auth providers)
│   ├── globals.css                    # Tailwind CSS + custom terminal utility classes
│   ├── page.tsx                       # Today's Slate (Unified 3-market terminal dashboard)
│   ├── asian-handicap/page.tsx        # Dedicated Asian Handicap matrix (split-line focus)
│   ├── over-under/page.tsx            # Dedicated Over/Under matrix (1.5, 2.5, 3.5 + Poisson grid)
│   ├── moneyline/page.tsx             # Dedicated 1X2 No-Vig Fair Odds & Overround matrix
│   ├── scanner/page.tsx               # Value Scanner (+EV filter across sharp vs soft odds)
│   ├── ledger/page.tsx                # Immutable Public Ledger (W/P/L, Net-CLV, Flat-Stake Yield)
│   ├── pricing/page.tsx               # Worldwide Affordable Monetization (Monthly + Non-Sub)
│   ├── methodology/page.tsx           # Transparent mathematical proofs & anti-leakage invariants
│   └── legal/
│       ├── terms/page.tsx             # Terms of Service (aligned with GDPR & ASEAN UU PDP)
│       └── privacy/page.tsx           # Privacy Policy & Cookie preferences
│
├── components/terminal/
│   ├── TerminalLayout.tsx             # Master grid container (Sidebar + Header + Content)
│   ├── TerminalSidebar.tsx            # 240px fixed (72px rail on collapse) + navigation groups
│   ├── TopUtilityBar.tsx              # Search, League, Date, Odds Format, Theme, i18n switcher
│   ├── TerminalFooter.tsx             # Legal, compliance disclaimer, methodology & timezone
│   ├── MatchMatrixTable.tsx           # Desktop 6-col scannable table / Mobile stacked card matrix
│   ├── MatchDeepDiveDrawer.tsx        # Slide-over match drawer (AH / OU / 1X2 tabs)
│   ├── OddsFormatContext.tsx          # Bidirectional conversion: Decimal, American, HK, Malay
│   └── quantMath.ts                   # Bivariate scoreline grid & BettingStats badge classifier
│
├── lib/
│   ├── quant/
│   │   └── threeMarketMath.ts         # Core mathematical engine (Poisson, exact EV, de-vig)
│   └── billing/
│       ├── types.ts                   # Plan IDs, entitlement states, payment intent contracts
│       ├── paymentRails.ts            # High-level intent router (Fiat vs Stablecoins)
│       └── providers/
│           ├── types.ts               # PaymentProviderAdapter interface
│           ├── stablecoinAdapter.ts   # USDC / USDT on Base, Polygon, Arbitrum, TRC-20 (0% chargeback)
│           ├── fiatAdapter.ts         # Stripe / Cards / Apple Pay / Google Pay / PayPal
│           ├── seaEwalletAdapter.ts   # QRIS, GoPay, OVO, DANA, TrueMoney (IDR, THB, VND)
│           └── index.ts               # Unified provider registry
│
├── i18n/
│   ├── context.tsx                    # React context & useI18n hook
│   ├── types.ts                       # Strongly-typed i18n schema
│   └── locales/
│       ├── en.json                    # English (Default)
│       ├── es.json                    # Spanish (Español)
│       ├── pt.json                    # Brazilian Portuguese (Português BR)
│       ├── zh.json                    # Simplified Chinese (简体中文)
│       ├── id.json                    # Indonesian (Bahasa Indonesia)
│       ├── th.json                    # Thai (ภาษาไทย)
│       └── vi.json                    # Vietnamese (Tiếng Việt)
│
├── theme/
│   ├── tokens.ts                      # Dark/Bright institutional hex palette
│   └── context.tsx                    # ThemeProvider with zero-FOUC & localStorage persistence
│
└── config/
    └── entitlements.ts                # Pricing plan definitions & feature matrices
```

---

## 3. Brand Identity & Visual System

- **Dark Mode (Default):**
  - Canvas: `#060B16`
  - Cards & Sidebar: `#0E1525`
  - Elevated Panels: `#151E32`
  - Hairline Border: `#1E293B` (1px crisp)
  - Primary Text: `#F8FAFC`
  - Muted Text: `#94A3B8`
  - Accent Emerald: `#10B981` / `#1CD67B`
- **Bright Mode:**
  - High-contrast institutional daylight (`#F8FAFC` canvas, `#FFFFFF` cards, `#CBD5E1` borders, `#0F172A` ink, `#059669` accessible emerald).
- **Signal Badges:**
  - `STRONG` (Emerald Green): Cover rate $\ge 65\%$ OR $+EV \ge 3.0\%$.
  - `WATCH` (Amber): Cover rate $41\%–64\%$ OR $+EV 1.0\%–2.9\%$.
  - `PASS` (Coral Red/Slate): Cover rate $\le 40\%$ OR $EV < 1.0\%$.

---

## 4. Monetization & Pricing Matrix (Globally Affordable)

| Plan / Option | Type | Price | Entitlement Scope |
| :--- | :---: | :---: | :--- |
| **Free** | Tier | **$0** | Full schedule, standings, basic O/U 2.5 & 1X2 trends, Public Ledger, + **3 full Deep-Dives / day**. |
| **Weekend Pass** | Non-Sub | **$1.99** | Unlimited 3-market Pro access & Smart Filters for **72 Hours**. |
| **Starter Credit Pack** | Non-Sub | **$4.99** | **40 Match Credits** ($0.12/match). Credits **never expire**. |
| **Grinder Credit Pack** | Non-Sub | **$9.99** | **100 Match Credits** ($0.10/match). Credits **never expire**. |
| **Competition Pass** | Non-Sub | **$9.99** | Full season unlimited 3-market access for **1 chosen league**. |
| **Pro Monthly** | Subscription | **$7.99 / mo** | Unlimited leagues, Value Scanner, unlimited Deep-Dives, CSV export. |
| **Pro Annual** | Subscription | **$59 / yr** | Equivalent to **$4.91 / mo** (Save 38%). |

### Multi-Rail Payment Adapters
1. **Stablecoin Rail:** USDC / USDT on Base, Polygon, Arbitrum, TRC-20 (0% chargeback risk, no banking blockades).
2. **Global Fiat Rail:** Cards, Apple Pay, Google Pay, PayPal Web Checkout (97% revenue retention).
3. **SEA Local E-Wallets Rail:** QRIS, GoPay, OVO, DANA, TrueMoney (IDR, THB, VND native support).

---

## 5. Verification & Test Suite Status

- `npx tsc --noEmit` -> PASS (0 errors)
- `npm run lint` -> PASS (0 errors)
- `tests/terminal/threeMarketMath.test.js` -> 6/6 PASS
- `tests/terminal/entitlement-gating.test.js` -> 3/3 PASS
- `tests/terminal/i18n-parity.test.js` -> 3/3 PASS
- `tests/terminal/odds-format-and-ev.test.js` -> 3/3 PASS
- `npm run build` -> 36/36 static/dynamic routes successfully built.
