# PERFORMANCE ACCOUNTING & POPULATION SEPARATION AUDIT

**Document Identifier**: `docs/epic100f/PERFORMANCE_ACCOUNTING_AUDIT.md`  
**Parent Epic**: EPIC 100F — Production Parity, Adversarial Audit & Live Data Readiness  
**Authors**: Astra / DeepMind Advanced Agentic Coding Pair  
**Status**: COMPLETE / VERIFIED  
**Production Status**: STRICTLY NO-GO  

---

## 1. Executive Summary

During the review of EPIC 100E, the user noted a critical methodological concern:
> *"Simulasi UCL ROI +105%... Real Madrid vs Manchester City dengan odds Pinnacle 2.05 merupakan skenario pengujian lokal. Jangan mencampur hasil simulasi ini dengan data pertandingan aktual atau statistik profitability Salmo."*
> *"Pastikan keputusan yang belum settled tidak masuk ke perhitungan profit/loss dan ROI. Pastikan pula keputusan VOID, PUSH, dan partial settlement dihitung dengan benar."*

In response to this directive, EPIC 100F conducted a deep adversarial audit of `PerformanceRepository` and the data populations inhabiting `prediction_ledger`.

This audit establishes:
1. **Strict Population Isolation**: Local acceptance simulations and synthetic test records are tagged `source_type = 'SIMULATION'` or `'SYNTHETIC'`. They are hard-filtered out of production analytics queries by default.
2. **Settlement Lifecycle Rigor**: Unsettled positions (`result_status = 'pending'`) do not contribute to profit, loss, stake at risk, or ROI calculations.
3. **Mathematical Correctness of Non-Binary Settlements**:
   - `VOID`: 0 profit, 0 stake consumed, removed from ROI denominator.
   - `PUSH`: 0 profit, 1.0 stake consumed & returned, 0 effect on net profit, correctly dilutes ROI denominator.
   - `HALF_WIN`: $+0.5 \times (\text{odds} - 1.0)$ profit, 1.0 stake.
   - `HALF_LOSS`: $-0.50$ profit, 1.0 stake ($0.50$ returned).
4. **Calibration Metric Decoupling**: Brier score and Log Loss measure probabilistic forecasting skill and are calculated strictly on non-push resolved events, completely segregated from financial ROI.

---

## 2. Population Separation Architecture

### 2.1 The Danger of Metric Leakage

In EPIC 100E, an end-to-end acceptance test simulated *Real Madrid vs Manchester City* (`UCL_2026_RMD_MCI`), which resulted in a 3-1 win and recorded $+1.05$ profit units on a $1.0$ stake (+105.0% ROI). If a production dashboard query executed `SELECT * FROM prediction_ledger WHERE status = 'SETTLED'`, that single test match would artificially inject $+1.05$ units of profit into public performance metrics, representing an unconscionable fabrication of performance.

Furthermore, remote Supabase introspection (`scratch/fetch_supabase_schema.js`) discovered that the remote Supabase database already contained quarantined test rows with:
```json
{
  "source_type": "SYNTHETIC",
  "data_status": "QUARANTINED"
}
```
This confirms that in live multi-environment operations, test or diagnostic rows will enter the database and must be structurally quarantined.

### 2.2 Enforced Repository Filtering

In `src/repositories/performanceRepository.ts`, `PerformanceRepository.calculatePerformance` was fortified with strict default conditions:

```typescript
const conditions: string[] = ["data_status = 'ACTIVE'"];

// Strict population separation: Never mix synthetic or local simulations into production aggregates
if (!filter.includeSimulations && filter.sourceType !== 'SIMULATION' && filter.sourceType !== 'ALL') {
  conditions.push("source_type NOT IN ('SYNTHETIC', 'SIMULATION')");
} else if (filter.sourceType && filter.sourceType !== 'ALL') {
  conditions.push(`source_type = $${idx++}`);
  params.push(filter.sourceType);
}
```

By default, any record with `source_type = 'SIMULATION'` or `source_type = 'SYNTHETIC'` is **completely omitted** from:
- `headline` metrics (Total Stake, Returns, Net Profit, ROI, Win Rate)
- `byMarket` breakdown (`ah`, `ou`)
- `byCompetition` breakdown (`EPL`, `UCL`)
- `auditTrail` export table

---

## 3. Mathematical Reference Accounting

### 3.1 Decision Status Matrix

| Settlement Status | Stake Counted | Net Profit Units | Return Units | Effect on ROI | Win Rate Counter | Calibration Scoring |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `pending` | 0.0 | 0.0 | 0.0 | None (Excluded) | Excluded | Excluded |
| `WIN` | 1.0 | $+(\text{odds} - 1.0)$ | $\text{odds}$ | Positive | $+1.0$ win | $y = 1$ |
| `HALF_WIN` | 1.0 | $+0.5 \times (\text{odds} - 1.0)$ | $1.0 + \text{profit}$ | Positive | $+0.5$ win | $y = 1$ |
| `PUSH` | 1.0 | $0.0$ | $1.0$ | Dilutes | $+0.0$ win | Excluded (neutral) |
| `HALF_LOSS` | 1.0 | $-0.50$ | $0.50$ | Negative | $+0.0$ win | $y = 0$ |
| `LOSS` | 1.0 | $-1.00$ | $0.0$ | Negative | $+0.0$ win | $y = 0$ |
| `VOID` | 0.0 | $0.0$ | $0.0$ | None (Stake refunded) | Excluded | Excluded |

### 3.2 Formal Formulas

1. **Net Profit Units**:
   $$\text{Net Profit} = \sum_{i \in \text{Settled} \setminus \text{VOID}} \text{profit\_loss}_i$$

2. **Total Stake Units**:
   $$\text{Total Stake} = \sum_{i \in \text{Settled} \setminus \text{VOID}} 1.0$$

3. **Return on Investment (ROI)**:
   $$\text{ROI} = \begin{cases} \dfrac{\text{Net Profit}}{\text{Total Stake}} \times 100\% & \text{if Total Stake} > 0 \\ \text{null} & \text{if Total Stake} = 0 \end{cases}$$

4. **Quarter-Line Win Rate**:
   $$\text{Win Rate} = \dfrac{N_{\text{WIN}} + 0.5 \times N_{\text{HALF\_WIN}}}{N_{\text{Settled}} - N_{\text{VOID}}} \times 100\%$$

5. **Brier Score (Forecasting Accuracy)**:
   $$\text{Brier Score} = \dfrac{1}{N_{\text{binary}}} \sum_{i \in \text{Binary}} (p_i - y_i)^2$$
   where $\text{Binary} = \{\text{WIN}, \text{HALF\_WIN}, \text{HALF\_LOSS}, \text{LOSS}\}$ (PUSH and VOID excluded to prevent artificial probability distortion).

6. **Log Loss (Cross-Entropy Calibration)**:
   $$\text{Log Loss} = -\dfrac{1}{N_{\text{binary}}} \sum_{i \in \text{Binary}} \left[ y_i \ln(p_i) + (1 - y_i) \ln(1 - p_i) \right]$$

---

## 4. Empirical Test Evidence

Verified in `tests/epic100f_multi_decision_concurrency.test.js`:
- **Scenario 3 (Population Separation)**:
  - Ingested 1 `PROVIDER` settled win (+0.90 units) and 1 `SIMULATION` settled win (+1.50 units).
  - Executed `PerformanceRepository.calculatePerformance()` default call:
    - Audit trail contains only the `PROVIDER` position.
    - `simFound === undefined` (100% verified exclusion).
  - Executed with `{ includeSimulations: true }`:
    - `simFoundInAll` present.
- **Scenario 4 (VOID and PUSH Invariants)**:
  - Ingested 1 `PUSH` (profit 0.0) and 1 `VOID` (profit 0.0).
  - Verified `profitUnits === 0.0` for both.
  - Verified stake units and ROI reflect refunded stakes accurately.
- **Outcome**: **100% PASS**.
