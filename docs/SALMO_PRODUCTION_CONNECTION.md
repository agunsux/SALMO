# SALMO.DEV — Production Connection & Verification Report

## 1. System Topology & Architecture

SALMO.DEV is the official presentation and intelligence consumer layer for the HandicapLab quantitative football engine.

```
+-------------------------------------------------------------------------+
|                  HandicapLab Canonical Pipeline                         |
|   (API-Football Pro + OddsPapi Pinnacle Sharp + FootyStats Enrichment) |
|                                  |                                      |
|                                  v                                      |
|            Dixon-Coles Low-Score Bivariate Poisson Engine               |
|            Multiplicative Margin Removal (Devigging)                    |
|            Point-in-Time Features (Anti-Lookahead Gated)                |
|                                  |                                      |
|                                  v                                      |
|           PostgreSQL Database (Supabase Production Instance)            |
|       - daily_picks (30 rows / Gameweek 5: AH, OU, BTTS)                |
|       - prediction_ledger_v3 (151 point-in-time verified records)       |
+-------------------------------------------------------------------------+
                                   |
                     (Server-Side Connection)
                                   v
+-------------------------------------------------------------------------+
|                        SALMO.DEV Consumer Layer                         |
|                                                                         |
|  [DatabaseHandicapLabAdapter]                                           |
|         │                                                               |
|         ├──> /api/matches --------> /matches, /, /asian-handicap,       |
|         │                           /over-under, /btts, /match/[id]     |
|         │                                                               |
|         └──> /api/daily-picks ----> /daily-picks (LAYAK / PANTAU)       |
+-------------------------------------------------------------------------+
```

---

## 2. Gate Verification Matrix

| Verification Criterion | Target Standard | Observed Result | Status |
| :--- | :--- | :--- | :--- |
| **SALMO → HandicapLab canonical source** | Connect to PostgreSQL / REST | 30 live rows in `daily_picks` connected | **PASS** |
| **SALMO → canonical predictions** | Consume Dixon-Coles probabilities | $P_{\text{model}}$ & Fair Odds ingested untampered | **PASS** |
| **SALMO → canonical odds/value** | Pinnacle sharp reference quotes | Market odds & Bookmaker = Pinnacle | **PASS** |
| **SALMO → Daily Picks** | Surface LAYAK/PANTAU/LEWATI | 8 LAYAK, 22 PANTAU, 0 LEWATI surfaced | **PASS** |
| **SALMO → 7-day horizon** | Dynamic UTC kickoff filtering | Dynamic UTC offsets (Today, Tomorrow, +3D, 7D) | **PASS** |
| **Mock/static production fallback** | ZERO mock in production path | 0 references to local JSON in DB adapter | **NONE** |
| **Synthetic fixture generation** | ZERO historical slicing/fake dates | `slice(0, 10)` fallback deleted | **NONE** |
| **Hardcoded confidence** | ZERO 45/80/40/35/20 scores | Reads `daily_picks.confidence` (0–100 integer) | **NONE** |
| **Moneyline recommendation** | Strictly AH, OU 2.5, BTTS | Zero 1X2 / Moneyline in types or routes | **NONE** |
| **DATA_UNAVAILABLE fail-closed** | Return safe empty states | Returns `[]` & explicit error status | **PASS** |
| **TypeScript compilation** | Zero type errors | `npx tsc --noEmit` exited with code 0 | **PASS** |
| **Production build** | Clean Next.js static generation | Generated all 7 routes successfully | **PASS** |

---

## 3. Product Surfaces Deployed

The following 7 application surfaces are operational:

1. **Home Feed (`/`)**:
   - 7-Day forward intelligence feed.
   - Dynamic horizon filter (`Today`, `Tomorrow`, `+3 Days`, `7 Days`).
   - Quality filter (`Value Only`, `High Confidence`).
   - Live Engine Transparency strip displaying historical 11-season validation metrics.

2. **Matches Page (`/matches`)**:
   - Dedicated fixture explorer consuming live canonical predictions.
   - Full 3-market comparison with evidence drawer and calculation trace.

3. **Daily Picks (`/daily-picks`)**:
   - Curated list of qualified picks with verdict badges (`LAYAK`, `PANTAU`, `LEWATI`).
   - Detailed quantitative breakdown: $P_{\text{model}}$, Fair Odds, Pinnacle Odds, Edge %, EV %, and Data Robustness Score ($/100$).

4. **Asian Handicap Page (`/asian-handicap`)**:
   - Focused single-market view for quarter-line Asian Handicap positions.

5. **Over / Under Page (`/over-under`)**:
   - Focused single-market view for Over/Under 2.5 goals.

6. **Both Teams To Score Page (`/btts`)**:
   - Focused single-market view for BTTS (Yes/No).

7. **Match Detail Page (`/match/[id]`)**:
   - Deep-dive match analysis page displaying score grid xG summary ($\lambda_{\text{home}}, \mu_{\text{away}}, \rho$) and detailed market provenance.

---

## 4. Test Suite Execution Summary

Suite: `tests/**/*.test.js`
Total Tests: **33 passed**, 0 failed, 0 skipped.

### Production Integration Tests (`tests/salmo_production_integration.test.js`):
- `Test 1: Real fixture path (HandicapLab canonical -> SALMO)`: **PASS**
- `Test 2: Real prediction path (Canonical P_model -> SALMO)`: **PASS**
- `Test 3: Real odds path (Pinnacle reference odds -> SALMO)`: **PASS**
- `Test 4: Value path (Edge, EV, Confidence, Verdict mapping)`: **PASS**
- `Test 5: No mock leakage (Production path zero fallback to JSON)`: **PASS**
- `Test 6: No 1X2 product leakage (Strictly AH, OU 2.5, BTTS)`: **PASS**
- `Test 7: Temporal invariant (oddsTimestampUtc <= predictionTimestampUtc < kickoffUtc)`: **PASS**
- `Test 8: Empty production state (Fail-closed: safe empty, never fake cards)`: **PASS**
- `Test 9: Client secret protection (Zero private keys in client bundle)`: **PASS**
- `Test 10: Cross-book readiness (bestAvailableOdds supported without model alteration)`: **PASS**
