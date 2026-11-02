# EPIC 98 — DRIBBLE360 AH FEATURE SPECIFICATION: `ah_rolling_shot_diff_10`
## Feature Engineering Blueprint, Mathematical Derivation & Shadow Inference Formulation
### Evaluation Timestamp: 2026-11-03T04:48:00+07:00 | Component: `DribbleAhShadowAdapter`

---

## 1. Feature Definition & Theoretical Motivation

In football analytics, goal expectancy models based purely on historical goals (Poisson / Dixon-Coles) often exhibit latency in detecting sudden changes in tactical dominance or finishing variance. 

The feature **`ah_rolling_shot_diff_10`** captures the sustained shot generation and suppression capability of competing teams over their last 10 competitive domestic matches. It serves as a secondary, point-in-time leading indicator of territorial pressure and chance creation, specifically designed to refine Asian Handicap cover probabilities without disrupting Poisson-based goal expectancy models.

---

## 2. Mathematical Formulation

For a scheduled match between Home team $H$ and Away team $A$ with kickoff timestamp $T_{\text{kickoff}}$:

### A. Point-in-Time Historical Sample Set
Let $\mathcal{H}_T(T_{\text{kickoff}})$ denote the strictly chronological sequence of matches completed by team $T$ prior to $T_{\text{kickoff}}$:
$$\mathcal{H}_T(T_{\text{kickoff}}) = \{ m \in \mathcal{M}_T \mid t_{\text{end}}(m) < T_{\text{kickoff}} \}$$

Let $N = \min(10, |\mathcal{H}_T(T_{\text{kickoff}})|)$ denote the available window length.

### B. Team Rolling Shot Average ($\bar{S}_{T, 10}$)
For each match $m \in \mathcal{H}_T$, let $S(T, m)$ denote the total scoring attempts (`total_scoring_att`):
$$\bar{S}_{T, 10} = \frac{1}{N} \sum_{i=1}^{N} S(T, m_i) \quad \text{where } m_i \text{ is the } i\text{-th most recent match}$$

### C. Feature Difference Formula
$$\mathbf{ah\_rolling\_shot\_diff\_10} = \bar{S}_{H, 10} - \bar{S}_{A, 10}$$

---

## 3. Parameter Specifications & Governance Bounds

| Attribute | Specification | Justification & Safeguard |
|:---|:---|:---|
| **Primary Metric** | `total_scoring_att` (Shots For) | High frequency metric with lower Poisson noise than goals |
| **Secondary Verification**| `ontarget_scoring_att` (Shots on Target) | Monitored to prevent distortion from speculative long-range shots |
| **Window Size ($N$)** | **10 competitive matches** | Balances recent tactical form with sample stability (~2.5 months) |
| **Minimum History Floor**| **5 competitive matches** | If $|\mathcal{H}_T| < 5$, feature evaluates to 0.0 (Neutral); flags `INSUFFICIENT_SAMPLE` |
| **Competition Scope** | Domestic league matches only | Excludes cup mismatches and international fixtures |
| **Temporal Lag** | Strictly $t - 1$ prior to target kickoff | Zero in-match or future match leakage |
| **Missing Value Handling**| Neutral imputation ($\Delta P = 0.0$) | Never fabricates synthetic averages; defaults to pure Dixon-Coles |

---

## 4. Shadow Inference Integration & Calibration Mapping

The feature is mapped into a shadow probability adjustment via an empirical sensitivity coefficient derived from walk-forward testing:

### A. Probability Adjustment Formula
$$\Delta P_{\text{raw}} = \mathbf{ah\_rolling\_shot\_diff\_10} \times \beta_{\text{shot}}$$
$$\Delta P_{\text{capped}} = \text{clamp}(\Delta P_{\text{raw}}, -\delta_{\max}, +\delta_{\max})$$

Where:
- $\beta_{\text{shot}} = \mathbf{0.0065}$ (0.65% probability shift per 1.0 shot difference).
- $\delta_{\max} = \mathbf{0.04}$ (Maximum allowed probability shift of $\pm 4.0\%$).

### B. Handicap Line Orientation
- For Home favorite / negative handicap ($Line \le 0$):
  $$P_{\text{shadow}}(H_{\text{cover}}) = P_{\text{DC}}(H_{\text{cover}}) + \Delta P_{\text{capped}}$$
- For Away favorite / positive handicap ($Line > 0$):
  $$P_{\text{shadow}}(A_{\text{cover}}) = P_{\text{DC}}(A_{\text{cover}}) - \Delta P_{\text{capped}}$$

---

## 5. Strict Market Boundary: Over/Under Exclusion Invariant

> [!CAUTION]
> **OVER/UNDER IS STRICTLY EXCLUDED FROM `ah_rolling_shot_diff_10`.**

Empirical research in HandicapLab demonstrated that incorporating shot difference into Over/Under totals produces severe miscalibration:
1. High shot volume between two teams frequently occurs in low-efficiency matches characterized by blocked shots and defensive crowding, leading to fewer goals than predicted.
2. When tested on Over/Under lines, the shot-difference feature produced a **-19.55% ROI collapse** and degraded Brier score ($0.2482 \rightarrow 0.2510$).
3. **Invariant**: Over/Under lines remain 100% governed by the validated, pure Poisson / Dixon-Coles bivariate goal distribution.
