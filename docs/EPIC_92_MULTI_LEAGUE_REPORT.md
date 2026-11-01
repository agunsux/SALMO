# EPIC 92 — MULTI-LEAGUE EXPANSION & COVERAGE FUNNEL REPORT

**Date:** 2026-11-01  
**Repository:** SALMO × HandicapLab  
**Author:** Antigravity Autonomous Pair Programmer  

---

### 1. Canonical League Funnel Architecture

The system supports a 15-league multi-tier expansion architecture designed to expand coverage without risking capital on uncalibrated markets.

```
                    ┌─────────────────────────┐
                    │   15 CANONICAL LEAGUES   │
                    └────────────┬────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
       ┌──────────────────┐            ┌──────────────────┐
       │ TIER 1: LIVE     │            │ TIER 2: SHADOW   │
       │ Premier League   │            │ 14 Other Leagues │
       └─────────┬────────┘            └─────────┬────────┘
                 │                               │
                 ▼                               ▼
       Pinnacle Odds Mandatory         Zero-Odds Research Mode
       Strict Confidence Gates         (marketOdds: null)
       Actionable Public Picks         RESEARCH_ONLY Ledger
```

---

### 2. Multi-League Readiness Matrix

| Competition | Country | Tier / Stage | Odds Status | Model Calibration | Public Display Status |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Premier League** | England | **Tier 1 (LIVE)** | Available (Pinnacle) | Calibrated (Dixon-Coles) | **Actionable Picks Allowed** |
| **La Liga** | Spain | Tier 2 (SHADOW) | Awaiting Quota | Shadow Benchmark | Research Only (LEWATI) |
| **Serie A** | Italy | Tier 2 (SHADOW) | Awaiting Quota | Shadow Benchmark | Research Only (LEWATI) |
| **Bundesliga** | Germany | Tier 2 (SHADOW) | Awaiting Quota | Shadow Benchmark | Research Only (LEWATI) |
| **Ligue 1** | France | Tier 2 (SHADOW) | Awaiting Quota | Shadow Benchmark | Research Only (LEWATI) |
| **Eredivisie** | Netherlands | Tier 2 (SHADOW) | Awaiting Quota | Shadow Benchmark | Research Only (LEWATI) |
| **Primeira Liga** | Portugal | Tier 2 (SHADOW) | Awaiting Quota | Shadow Benchmark | Research Only (LEWATI) |
| **Championship** | England | Tier 2 (SHADOW) | Awaiting Quota | Shadow Benchmark | Research Only (LEWATI) |
| **J1 League** | Japan | Tier 2 (SHADOW) | Awaiting Quota | Transfer Calibration | Research Only (LEWATI) |
| **K League 1** | South Korea | Tier 2 (SHADOW) | Awaiting Quota | Transfer Calibration | Research Only (LEWATI) |
| **Brasileirão** | Brazil | Tier 2 (SHADOW) | Awaiting Quota | Shadow Benchmark | Research Only (LEWATI) |
| **Liga MX** | Mexico | Tier 2 (SHADOW) | Awaiting Quota | Shadow Benchmark | Research Only (LEWATI) |
| **Super Lig** | Turkey | Tier 2 (SHADOW) | Awaiting Quota | Shadow Benchmark | Research Only (LEWATI) |
| **Belgian Pro League**| Belgium | Tier 2 (SHADOW) | Awaiting Quota | Shadow Benchmark | Research Only (LEWATI) |
| **Liga 1** | Indonesia | Tier 2 (SHADOW) | Awaiting Quota | Non-Informative | Research Only (LEWATI) |

---

### 3. Promotion Gates for Unlocking LIVE Status

Before any non-EPL league can transition from Tier 2 (SHADOW) to Tier 1 (LIVE), it must satisfy four immutable release criteria:

1. **Active Odds Provider:** Verified, unmetered access to Pinnacle AH and OU lines with $< 15$ min update frequency.
2. **Backtest Sample Size ($N \ge 100$):** At least 100 settled historical matches with verified closing odds.
3. **Statistical Calibration ($B < 0.25$):** Brier score strictly lower than market baseline ($B_{\text{model}} < B_{\text{market}}$).
4. **Positive Empirical CLV:** Demonstrated positive Closing Line Value over a rolling 30-day evaluation window.
