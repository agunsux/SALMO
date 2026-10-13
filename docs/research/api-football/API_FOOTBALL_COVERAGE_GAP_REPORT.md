# SALMO — Target Coverage Gap Matrix & Valuation Report (15 Canonical Leagues)

**Audit Date:** 2026-10-13
**Auditor:** Principal Quant Platform Engineer & Release Auditor
**Scope:** 15 Worldwide Leagues (Tiers A, B, and C) across Primary Quantitative Markets (AH, OU, BTTS)

---

## 1. Executive Summary

To maximize the research value of the remaining API-Football Pro subscription before its permanent termination on **2026-10-14T07:53:10+00:00**, a granular coverage gap matrix was formulated across the 15 canonical leagues defined in `CANONICAL_15_LEAGUES` (`src/config/multiLeagueRegistry.ts`).

Prior to this harvest, the local research repository held fixture metadata for only a subset of recent seasons, with **zero deep match statistics** (shots, xG, corners, possession) and **zero standings records**. Deep match statistics are the foundation of SALMO's Dixon-Coles Poisson parameters and expected-goals regressors.

---

## 2. 15 Canonical Leagues Coverage Gap Matrix

| Tier | Internal Key | API ID | League Name | Country | Missing Fixture Seasons | Standings Needed | Priority | Egress Value |
| :---: | :--- | :---: | :--- | :--- | :--- | :--- | :---: | :--- |
| **A** | `ENG-PL` | 39 | Premier League | England | 2022, 2023, 2024, 2025 | 2024, 2025, 2026 | **P0** | **CRITICAL** (Benchmark anchor) |
| **A** | `ESP-LALIGA` | 140 | La Liga | Spain | 2022, 2023 | 2024, 2025, 2026 | **P0** | **CRITICAL** (Tier A core) |
| **A** | `ITA-SERIEA` | 135 | Serie A | Italy | 2022, 2023, 2025 | 2024, 2025, 2026 | **P0** | **CRITICAL** (Tier A core) |
| **A** | `DEU-BUNDESLIGA` | 78 | Bundesliga | Germany | 2022, 2023 | 2024, 2025, 2026 | **P0** | **HIGH** (Tier A core) |
| **A** | `FRA-LIGUE1` | 61 | Ligue 1 | France | 2022, 2023 | 2024, 2025, 2026 | **P0** | **HIGH** (Tier A core) |
| **B** | `NED-ERE` | 88 | Eredivisie | Netherlands | None (2024–2026 local) | 2024, 2025, 2026 | **P1** | **HIGH** (High-scoring OU/BTTS) |
| **B** | `POR-PRIMEIRA` | 94 | Primeira Liga | Portugal | 2026 | 2024, 2025, 2026 | **P1** | **MEDIUM** |
| **B** | `BEL-PRO` | 144 | Jupiler Pro League | Belgium | 2026 | 2024, 2025, 2026 | **P1** | **MEDIUM** |
| **B** | `SCO-PREM` | 179 | Premiership | Scotland | None (2024–2026 local) | 2024, 2025, 2026 | **P1** | **MEDIUM** |
| **B** | `ENG-CHAMP` | 40 | Championship | England | None (2024–2026 local) | 2024, 2025, 2026 | **P1** | **HIGH** (Large 46-game sample) |
| **C** | `USA-MLS` | 253 | MLS | USA | 2026 | 2024, 2025, 2026 | **P2** | **MEDIUM** (Summer cadence) |
| **C** | `SAU-PRO` | 307 | Saudi Pro League | Saudi Arabia | 2026 | 2024, 2025, 2026 | **P2** | **MEDIUM** |
| **C** | `JPN-J1` | 98 | J1 League | Japan | 2026 | 2024, 2025, 2026 | **P2** | **MEDIUM** (Summer cadence) |
| **C** | `KOR-K1` | 292 | K League 1 | South Korea | None (2024–2026 local) | 2024, 2025, 2026 | **P2** | **MEDIUM** (Summer cadence) |
| **C** | `IDN-L1` | 274 | Liga 1 Indonesia | Indonesia | 2024, 2025 | 2024, 2025, 2026 | **P2** | **MEDIUM** (Local research) |

---

## 3. Market-Specific Utility & Quant Modeling Value

| Target Market | Critical Required Features | Endpoint Source | Model Application |
| :--- | :--- | :--- | :--- |
| **Asian Handicap (AH)** | Goal difference, xG differential, shots on target ratio, home/away dominance | `/fixtures/statistics`, `/teams/statistics` | Calibrates Dixon-Coles goal expectation parameter $\lambda_{\text{home}} / \mu_{\text{away}}$ to estimate true spread probabilities without bookmaker skew. |
| **Over/Under (OU)** | Total goals, combined xG, total shots inside penalty area, corner volume | `/fixtures/statistics`, `/standings` | Estimates aggregate match goal intensity $\lambda + \mu$ and tail probabilities for OU 2.25, OU 2.50, and OU 2.75 lines. |
| **Both Teams To Score (BTTS)** | Clean sheet frequency, failed-to-score rates, defensive xG conceded, goalkeeper saves | `/fixtures/statistics`, `/teams/statistics` | Models joint probability $P(X \ge 1 \cap Y \ge 1)$ under bivariate Poisson structure adjusted for dependency factor $\rho$. |

---

## 4. Endpoint Cost-Benefit Matrix

| Endpoint | Request Cost | Records Acquired | Valuation / Recommendation |
| :--- | :--- | :--- | :--- |
| `GET /fixtures?league=&season=` | **1 request** | **240 – 510 matches** | **MAXIMUM EFFICIENCY**: 1 call captures full schedule, final scores, and halftime scores for an entire season. |
| `GET /standings?league=&season=` | **1 request** | **18 – 24 teams** | **MAXIMUM EFFICIENCY**: 1 call captures full table, points, home/away splits, goal differences, and form. |
| `GET /teams/statistics?league=&season=&team=` | **1 request** | **1 team aggregate profile** | **HIGH VALUE**: Captures goal timing intervals, clean sheets, and failed-to-score rates for Big 5. |
| `GET /fixtures/statistics?fixture=` | **1 request** | **1 deep match profile** | **GOLDMINE**: Only endpoint providing official `expected_goals` (xG), shots on goal, corners, and possession. |
| `GET /odds?fixture=` | **1 request** | **0 records (EMPTY)** | **EXCLUDED (ZERO VALUE)**: Verified unpopulated for past fixtures. Must not spend any quota. |

---

## 5. Harvest Allocation Architecture

To stay within the safe operating envelope of **5,500 requests** (leaving $>1,700$ requests in safety reserve from the initial $7,243$):

- **Batch 1 (Missing Fixtures)**: 20 requests $\rightarrow$ ~7,200 fixtures added.
- **Batch 2 (Standings 15x3)**: 45 requests $\rightarrow$ Full historical table dynamics for all 15 leagues.
- **Batch 3 (Team Statistics Big 5)**: 192 requests $\rightarrow$ Comprehensive aggregate profiles for 96 teams.
- **Batch 4 (2026 Match Stats Big 5)**: ~320 requests $\rightarrow$ All finished matches in the current active season.
- **Batch 5 (2024/25 PL Match Stats)**: 380 requests $\rightarrow$ Full 380-match Premier League benchmark season.
- **Batch 6 (2024/25 La Liga & Serie A)**: ~760 requests $\rightarrow$ Full 760-match Spanish & Italian seasons.
- **Batch 7 (2024/25 Bundesliga & Ligue 1)**: ~612 requests $\rightarrow$ Full 612-match German & French seasons.

**Cumulative Egress**: $\approx 2,329$ requests (well under the 5,500 ceiling, ensuring zero rate-limit or quota starvation risk).
