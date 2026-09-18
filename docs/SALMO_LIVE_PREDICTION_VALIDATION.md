# SALMO.DEV — Model Validation & Backtest Methodology

## 1. Walk-Forward Cross-Validation Methodology

To prevent look-ahead bias and data leakage, HandicapLab evaluates models strictly through **chronological walk-forward validation**:

- **Historical Range**: 2014-2015 through 2025-2026 (11 full English Premier League seasons).
- **Total Ingested Matches**: 4,180 canonical matches.
- **In-Sample Training Window**: 3,420 matches (2014-2015 through 2023-2024).
- **Out-of-Sample Holdout Window**: 760 matches (2024-2025 and 2025-2026).
- **Re-estimation Frequency**: Re-fit attack ($\alpha$) and defense ($\beta$) ratings per team sequentially after each round.
- **Market Reference**: Real Pinnacle closing odds with exact quarter-line split settlement and devigging.

---

## 2. The 3x3 Model / Market Validation Matrix

The engine benchmarks 3 probability models across the 3 strictly approved markets:

| Market | Model | Out-of-Sample Fixtures | Traded Signals | Empirical ROI | 95% Bootstrap CI | CLV | Calibration (Brier) | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **AH** | Independent Poisson | 590 | 236 | **-7.29%** | `[-14.13%, 0.04%]` | -0.69% | 0.2500 | **NO EDGE** |
| **AH** | Flat Dixon-Coles | 590 | 236 | **-7.29%** | `[-14.18%, 0.04%]` | -0.69% | 0.2500 | **NO EDGE** |
| **AH** | Hierarchical DC | 590 | 236 | **-7.29%** | `[-14.51%, -0.42%]` | -0.69% | 0.2500 | **NO EDGE** |
| **OU 2.5** | Independent Poisson | 760 | 304 | **-4.76%** | `[-11.58%, 2.73%]` | -1.09% | 0.2457 | **NO EDGE** |
| **OU 2.5** | Flat Dixon-Coles | 760 | 304 | **-4.76%** | `[-11.83%, 2.51%]` | -1.09% | 0.2457 | **NO EDGE** |
| **OU 2.5** | Hierarchical DC | 760 | 304 | **-4.76%** | `[-11.85%, 2.45%]` | -1.09% | 0.2457 | **NO EDGE** |
| **BTTS** | Independent Poisson | 760 | 304 | **+0.94%** | `[-5.38%, 7.27%]` | 0.00% | 0.2457 | **PROVISIONAL EDGE** |
| **BTTS** | Flat Dixon-Coles | 760 | 304 | **+0.94%** | `[-5.14%, 7.74%]` | 0.00% | 0.2457 | **PROVISIONAL EDGE** |
| **BTTS** | Hierarchical DC | 760 | 304 | **+0.94%** | `[-5.47%, 7.35%]` | 0.00% | 0.2457 | **PROVISIONAL EDGE** |

---

## 3. Mathematical Analysis & Findings

### 3.1 Hard Rule 4 Enforcement: Why BTTS is PROVISIONAL, Not VALIDATED
Even though BTTS generates a positive historical return ($+0.94\%$ ROI), its 1,000-resample Bootstrap 95% Confidence Interval is:
$$\text{CI}_{95\%} = [-5.38\%, +7.27\%]$$

Because this interval encompasses zero, we cannot reject the null hypothesis of no true market edge with 95% statistical confidence.
Under **Hard Rule 4**, the system strictly assigns:
- Status: `PROVISIONAL EDGE`
- Badge: `YELLOW` / `MARGINAL`
- **It is strictly prohibited from claiming "VALIDATED VALUE" or assigning a GREEN badge.**

### 3.2 Over/Under 2.5 Dixon-Coles Equivalence Proof
In Dixon-Coles (1997), the probability correction factor $\tau(x, y)$ applies only to scorelines $(0,0), (1,0), (0,1), (1,1)$:
- $\tau(0,0) = 1 - \lambda \mu \rho$
- $\tau(0,1) = 1 + \lambda \rho$
- $\tau(1,0) = 1 + \mu \rho$
- $\tau(1,1) = 1 - \rho$

For Over/Under 2.5, Under 2.5 consists of scores $(0,0), (1,0), (0,1), (1,1), (2,0), (0,2)$:
Notice that over the first 4 low scores:
$$\sum_{x=0}^1 \sum_{y=0}^1 \tau(x, y) \cdot P_{\text{Pois}}(x, y) = \sum_{x=0}^1 \sum_{y=0}^1 P_{\text{Pois}}(x, y) + \rho \cdot e^{-(\lambda+\mu)} [-\lambda \mu + \lambda \cdot \mu + \mu \cdot \lambda - \lambda \mu] = \sum P_{\text{Pois}}$$

The sum of adjustments equals exactly zero! Therefore:
$$P_{\text{Dixon-Coles}}(\text{Over 2.5}) \equiv P_{\text{Poisson}}(\text{Over 2.5})$$
This mathematical invariance explains why Poisson, Flat DC, and Hierarchical DC yield identical returns for standard 2.5 goal lines.

### 3.3 Negative ROI Honesty (Asian Handicap & Over/Under)
Against Pinnacle sharp closing lines, basic Poisson goal models without live line movement features experience negative returns (AH: $-7.29\%$, OU: $-4.76\%$).
SALMO never distorts these numbers to attract users. The platform honestly reveals negative expected values, cautioning users and highlighting where retail bettors typically lose margin.

