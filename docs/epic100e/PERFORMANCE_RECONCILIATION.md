# EPIC 100E — PERFORMANCE ANALYTICS RECONCILIATION REPORT

**Scope**: Authoritative performance calculations, statistical calibration, and segmental breakdowns.  
**Tested Component**: `src/repositories/performanceRepository.ts`  
**Production Status**: NO-GO (Local Validation Only).  

---

## 1. Analytics Architecture & Strict Integrity Invariants

The analytics engine (`PerformanceRepository`) queries authoritative records directly from PostgreSQL:
- **Source of Truth**: `public.prediction_ledger` where `data_status = 'ACTIVE'`.
- **Zero Pollution**: Production ROI is NEVER computed from:
  - Research-only predictions (e.g. BTTS).
  - Shadow predictions from unpromoted leagues.
  - Unsettled / pending fixtures.
  - Synthetic or mock fixtures.
  - Historical backtests mixed into live decisions.
- **Reproducibility**: Identical filter inputs always produce identical analytical aggregates.

---

## 2. Standard Mathematical Formulations

### 2.1 Net Profit/Loss & ROI
Given $N$ settled decisions, with stake units $S_i = 1.0$ (for non-void decisions) and profit units $P_i$:
$$\text{Total Stake Units} = \sum_{i=1}^{N} S_i \quad (\text{excluding VOID})$$
$$\text{Net Profit Units} = \sum_{i=1}^{N} P_i$$
$$\text{Total Returns Units} = \sum_{i=1}^{N} (S_i + P_i)$$
$$\text{ROI} (\%) = \left(\frac{\text{Net Profit Units}}{\text{Total Stake Units}}\right) \times 100$$

### 2.2 Win Rate
$$\text{Win Rate} (\%) = \left(\frac{W + 0.5 \times HW}{N_{\text{settled}} - V}\right) \times 100$$
Where:
- $W$: Full Wins
- $HW$: Half Wins
- $V$: Voids
- Pushes and half-losses contribute proportionally to the denominator.

### 2.3 Brier Score (Probabilistic Calibration)
For each settled position with model probability $p_i \in [0, 1]$ and binary outcome $y_i \in \{0, 1\}$ (where WIN/HALF_WIN maps to 1, LOSS/HALF_LOSS maps to 0):
$$\text{Brier Score} = \frac{1}{N} \sum_{i=1}^{N} (p_i - y_i)^2$$
A lower Brier score indicates superior probability calibration ($< 0.25$ indicates positive skill vs 50/50 baseline).

### 2.4 Logarithmic Loss
$$\text{Log Loss} = -\frac{1}{N} \sum_{i=1}^{N} \left[ y_i \ln(p_i^*) + (1 - y_i) \ln(1 - p_i^*) \right]$$
Where $p_i^*$ is clamped to $[\epsilon, 1 - \epsilon]$ ($\epsilon = 10^{-6}$) to prevent infinite penalties.

### 2.5 Peak-to-Trough Maximum Drawdown
Tracking cumulative balance $B_k = \sum_{i=1}^{k} P_i$:
$$\text{Peak}_k = \max_{1 \le j \le k} B_j$$
$$\text{Drawdown}_k = \text{Peak}_k - B_k$$
$$\text{Max Drawdown Units} = \max_{1 \le k \le N} \text{Drawdown}_k$$

---

## 3. Segmental Breakdowns

The analytics engine partitions headline metrics into explicit dimensions:
1. **By Market Type**:
   - `AH` (Asian Handicap)
   - `OU` (Over / Under Total Goals)
   - `BTTS` (Restricted to research; excluded from headline production ROI)
2. **By Competition**:
   - `EPL` (English Premier League, ID 39)
   - `UCL` (UEFA Champions League, ID 2)
   - Other candidate leagues
3. **By Model & Feature Version**:
   - `model_version` (e.g. `dixon-coles-v1.0`, `dixon-coles-ucl-v1.0`)
   - `feature_version` (e.g. `dynamic-ratings-v1.0`)
4. **By Confidence Tier & Bookmaker**:
   - Categorized by `HIGH` ($\ge 65$), `MEDIUM` ($40 - 64$), `LOW` ($< 40$).
   - Sharp reference bookmaker: `Pinnacle`.

---

## 4. Reconciliation Verification

During the UCL simulation test (`tests/epic100e_ucl_end_to_end_acceptance.test.js`), a single official UCL decision on Real Madrid -0.25 @ 2.05 settled with a 2-1 score (+1.05 profit units).

Reconciliation audit:
- Total Official Decisions: `1`
- Settled Decisions: `1`
- Pending Decisions: `0`
- Wins: `1`, Half Wins: `0`, Pushes: `0`, Losses: `0`, Voids: `0`
- Total Stake: `1.00`
- Total Returns: `2.05`
- Net Profit: `+1.05` units
- ROI: `+105.00%`
- Win Rate: `100.00%`
- UCL Segment Net Profit: `+1.05` units
- Max Drawdown: `0.00` units
- Brier Score: `(0.565 - 1.0)^2 = 0.1892`

All metrics in `PerformanceRepository` matched the raw ledger rows with mathematical precision.
