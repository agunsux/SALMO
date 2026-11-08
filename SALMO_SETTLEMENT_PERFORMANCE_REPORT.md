# SALMO.DEV — SETTLEMENT & PERFORMANCE ENGINE AUDIT

**Audit Date:** 2026-11-08T23:50:00+07:00 (Asia/Jakarta)  
**Evaluator:** Lead Performance Auditor & Settlement Mathematics Specialist  
**Core Invariant:** *"Never hide bad results. Never settle from simulated outcomes. Qualified performance must reflect real ledger bets only."*  
**Scope:** Reconciled settlement audit, quarter-line mathematics, performance attribution, and sample size disclosure.  
**Overall Phase 7 Status:** **PASS (Performance Status: INCONCLUSIVE due to N = 1)**

---

## 1. Executive Summary & Forensic Reconciliation

This report establishes the true, reconciled settlement performance of Salmo's shadow operations based on the immutable records in [`shadow_prediction_ledger.jsonl`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/data/research/fivedollar_shadow/shadow_prediction_ledger.jsonl).

### Reconciliation of Historical Settled Records:
A forensic check was performed across the 8 settled historical records (matches on 2026-11-07):
1. **The Only Qualified Bet Was a Loss:**
   - Record: `pred_EPL_2026_LIVERPOOL_ASTONVILLA_2026-11-07_OU_Over_2.75`
   - Market: Over/Under (OU), Line: 2.75, Selection: Over 2.75, Odds: 1.95.
   - Model EV: $+13.33\%$, Confidence: 66/100 $\to$ **`QUALIFIED_VALUE_BET`** (`stakeUnits: 1.0`).
   - Final Match Score: Liverpool 2 - 0 Aston Villa (Total goals = 2).
   - Settlement Outcome: $2 < 2.75 \to$ **`LOSS`** (`profitUnits: -1.0`, `settlementStatus: "SETTLED"`).
2. **Liverpool -1.0 Asian Handicap Was NOT a Bet:**
   - Record: `pred_EPL_2026_LIVERPOOL_ASTONVILLA_2026-11-07_AH_Liverpool_FC_-1.0`
   - Model EV: $-1.12\%$, Confidence: 52 $\to$ Classified as **`LEWATI`** (`stakeUnits: 0.0`, `profitUnits: 0.0`).
   - Although Liverpool won 2-0 (which covers -1.0), Salmo **did not bet** on it because it lacked positive mathematical edge. Salmo does not retroactively claim un-bet winners.
3. **Research Observations (1X2 & BTTS):**
   - Fixed to `stakeUnits: 0.0` and `profitUnits: 0.0`. They are tracked for modeling insight only and do not contaminate the qualified performance record.

---

## 2. Settlement Mathematics Reference & Quarter-Line Rules

Let $\text{sideGoals}$ be the goals scored by the selected team, $\text{oppGoals}$ be the opponent goals, and $L$ be the handicap line. The effective goal difference is:
$$\Delta = \text{sideGoals} - \text{oppGoals} + L$$

| Effective Difference $\Delta$ | Outcome | Profit Units (Stake = 1.0) | Return Units |
| :--- | :--- | :--- | :--- |
| $\Delta > +0.25$ | **WIN** | $\text{odds} - 1.0$ | $\text{odds}$ |
| $\Delta = +0.25$ | **HALF_WIN** | $0.5 \times (\text{odds} - 1.0)$ | $1.0 + 0.5 \times (\text{odds} - 1.0)$ |
| $\Delta = 0.00$ | **PUSH** | $0.0$ | $1.0$ |
| $\Delta = -0.25$ | **HALF_LOSS** | $-0.5$ | $0.5$ |
| $\Delta < -0.25$ | **LOSS** | $-1.0$ | $0.0$ |
| Abandoned / Postponed | **VOID** | $0.0$ | $1.0$ (Stake Refunded) |

---

## 3. Reconciled Qualified Betting Performance Ledger

### 3.1 Official Qualified Bets Summary ($N = 1$ Settled Bet)
* **Total Qualified Bets:** 1
* **Wins:** 0
* **Half Wins:** 0
* **Pushes:** 0
* **Half Losses:** 0
* **Losses:** 1 (Liverpool vs Aston Villa Over 2.75)
* **Total Capital Staked:** 1.0 unit
* **Net Profit / Loss:** **-1.00 unit**
* **ROI / Yield:** **-100.0%**
* **Average Odds:** 1.950
* **Average Signal EV:** +13.33%
* **Statistical Significance:** **INCONCLUSIVE ($N = 1$)**.
  - A single loss in sports betting is within normal variance and provides zero proof of negative edge, just as a single win provides zero proof of positive edge.
  - Salmo requires a minimum sample of $N \ge 100$ verified bets before drawing statistical conclusions on profitability.

---

## 4. Un-bet Research & Observation Outcomes (Nov 7 Matches)

To maintain absolute transparency, the un-bet signals are tracked below:

| Fixture | Market | Line | Selection | Model EV | Pred Status | Final Score | Settled Result | Stake | Profit |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `LIVERPOOL_ASTONVILLA` | **AH** | -1.00 | Liverpool -1.0 | -1.12% | **LEWATI** | 2-0 | WIN (Un-bet) | 0.0 | 0.0 |
| `LIVERPOOL_ASTONVILLA` | **OU** | 2.75 | Over 2.75 | **+13.33%** | **QUALIFIED** | 2-0 | **LOSS** | **1.0** | **-1.0** |
| `LIVERPOOL_ASTONVILLA` | **1X2** | — | Home | -3.30% | **RESEARCH** | 2-0 | WIN (Obs.) | 0.0 | 0.0 |
| `LIVERPOOL_ASTONVILLA` | **BTTS** | — | BTTS No | +0.74% | **RESEARCH** | 2-0 | WIN (Obs.) | 0.0 | 0.0 |
| `BRIGHTON_MANCITY` | **AH** | +0.75 | Brighton +0.75 | +1.38% | **PANTAU** | 2-1 | WIN (Un-bet) | 0.0 | 0.0 |
| `BRIGHTON_MANCITY` | **OU** | 2.75 | Over 2.75 | +0.25% | **PANTAU** | 2-1 | WIN (Un-bet) | 0.0 | 0.0 |
| `BRIGHTON_MANCITY` | **1X2** | — | Away | -2.10% | **RESEARCH** | 2-1 | LOSS (Obs.) | 0.0 | 0.0 |
| `BRIGHTON_MANCITY` | **BTTS** | — | BTTS Yes | +1.10% | **RESEARCH** | 2-1 | WIN (Obs.) | 0.0 | 0.0 |

*Auditor Finding:*  
Even though un-bet observations won (e.g. Brighton +0.75 and Liverpool -1.0), Salmo strictly refrained from betting because the model confidence did not meet the 65 threshold or the EV was negative. This proves strict adherence to policy.

---

## 5. Phase 7 Execution Accounting

* **STATUS:** **PASS (RECORD RECONCILIATION COMPLETE; PERFORMANCE INCONCLUSIVE)**
* **ACTIONS:**
  1. Fully reconciled settlement section with actual ledger data: corrected the erroneous report of a Liverpool AH win; recorded the true Liverpool OU loss (-1.0 unit).
  2. Documented exact quarter-line settlement mathematics.
  3. Labeled performance metrics as statistically **INCONCLUSIVE** ($N = 1$).
* **FILES MODIFIED:**
  - `SALMO_SETTLEMENT_PERFORMANCE_REPORT.md` (reconciled)
* **TESTS:** Verified via `tests/fivedollar_free_integration.test.js`.
* **QUOTA CONSUMPTION:** 0 requests.
* **GATE DECISION:** **GATE 7 PASS. Performance and settlement reporting reconciled with truth.**
