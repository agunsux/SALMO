# EPIC 100E — COMPLETE SETTLEMENT INTEGRATION REPORT

**Scope**: Integration of canonical PostgreSQL settlement contract with application settlement runner.  
**Tested Component**: `src/repositories/settlementRepository.ts` & `src/engine/settlement/productionSettlementRunner.ts`  
**Production Status**: NO-GO (Local Validation Only).  

---

## 1. Settlement Architecture & Decoupling

SALMO strictly decouples match settlement from odds providers:
- **Zero OddsPapi Dependency**: OddsPapi is strictly an odds ingestion provider. It is NEVER called during fixture settlement. This eliminates unnecessary quota consumption and API rate-limiting risk during matchdays.
- **Result Verification**: Match final scores are sourced from verified provider feeds (API-Football, HandicapLab verified sync, or administrative ingestion) and stored in `public.matches`.
- **Atomic Settlement**: A single ACID transaction settles positions across `matches`, `settlement_results`, `prediction_ledger`, and `daily_picks`.

---

## 2. Settlement Calculation Rules & Quarter-Line Math

Settlement calculations are performed by pure mathematical engines without floating-point distortion.

### 2.1 Asian Handicap (AH) Quarter-Line Calculation
Given goal difference $\Delta = G_{\text{home}} - G_{\text{away}}$ (or $G_{\text{away}} - G_{\text{home}}$ for away selections), and handicap line $L$:
$$\text{diff} = \Delta + L$$

| Outcome Condition | Settlement Verdict | Profit Units ($O$ = decimal odds) | Stake Units |
| :--- | :--- | :--- | :--- |
| $\text{diff} \ge +0.50$ | **WIN** (Full Win) | $+(O - 1.00)$ | $1.0$ |
| $\text{diff} = +0.25$ | **HALF_WIN** | $+0.50 \times (O - 1.00)$ | $1.0$ |
| $\text{diff} = 0.00$ | **PUSH** | $0.00$ | $1.0$ |
| $\text{diff} = -0.25$ | **HALF_LOSS** | $-0.50$ | $1.0$ |
| $\text{diff} \le -0.50$ | **LOSS** (Full Loss) | $-1.00$ | $1.0$ |

### 2.2 Over / Under (OU) Variable & Quarter-Line Calculation
Given total match goals $T = G_{\text{home}} + G_{\text{away}}$, line $L$:
- For `OVER`: $\text{diff} = T - L$
- For `UNDER`: $\text{diff} = L - T$

| Outcome Condition | Settlement Verdict | Profit Units ($O$ = decimal odds) | Stake Units |
| :--- | :--- | :--- | :--- |
| $\text{diff} \ge +0.50$ | **WIN** (Full Win) | $+(O - 1.00)$ | $1.0$ |
| $\text{diff} = +0.25$ | **HALF_WIN** | $+0.50 \times (O - 1.00)$ | $1.0$ |
| $\text{diff} = 0.00$ | **PUSH** | $0.00$ | $1.0$ |
| $\text{diff} = -0.25$ | **HALF_LOSS** | $-0.50$ | $1.0$ |
| $\text{diff} \le -0.50$ | **LOSS** (Full Loss) | $-1.00$ | $1.0$ |

---

## 3. Special Settlement Scenarios & Invariants

1. **VOID vs LOSS Separation**:
   - Cancelled or voided matches receive `result_status = 'VOID'`.
   - `stake_units = 0.0` and `profit_units = 0.0`.
   - Voids are strictly excluded from ROI and win-rate denominators.
   - Verified in test suite: `EPIC 100E UCL Simulation` and `EPIC 100D Contract Test 13`.

2. **Postponed Fixtures**:
   - Matches marked with status `postponed` do NOT settle positions.
   - Associated `prediction_ledger` positions remain strictly `pending` until official rescheduling or void declaration.

3. **Auditable Revisions**:
   - `settlement_results` acts as an append-only log.
   - Deletions are blocked by `fn_protect_settlement_results_immutability()`.
   - If a score correction occurs, the database records an updated settlement row with updated timestamp, maintaining full auditability.

4. **Idempotent Multi-Worker Settlement**:
   - Settlement jobs use `SELECT ... FOR UPDATE` row locks and `ON CONFLICT (fixture_id, market_type) DO UPDATE` in `settlement_results`.
   - Concurrent settlement workers process the same match with zero duplicates and zero race conditions (validated in `tests/epic100e_concurrency_validation.test.js`).
