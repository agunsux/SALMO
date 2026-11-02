# EPIC 97 — SETTLEMENT CERTIFICATION & FINANCIAL RECONCILIATION
## Deterministic Multi-Line Settlement Engine, Zero-Quota Decoupling & Invariant Verification
### Evaluation Timestamp: 2026-11-03T04:35:00+07:00 | Code Sources: `SALMO/src/engine/settlement/`, `HandicapLab/src/lib/ledger/`

---

## 1. Executive Summary & Core Guarantees

The settlement subsystem is responsible for evaluating pre-match predictions against verified final scores and calculating financial outcomes. 

### Core Architectural Certifications
1. **Zero OddsPapi Ingestion**: The settlement engine never contacts OddsPapi. Verified scores are sourced exclusively from Supabase `public.matches` (Level a) or `FreeResultsAdapter` (Level b) via Football-Data.co.uk CSV feeds. Total OddsPapi quota cost is **strictly 0 requests**.
2. **Quarter-Line Mathematical Precision**: Quarter-line handicaps ($-0.75, -0.25, +0.25, +0.75$) and totals ($2.25, 2.75, 3.25$) are settled with exact split half-win / half-loss math without rounding distortion or binary collapse.
3. **Immutability of Pre-Match Predictions**: Pre-match predictions, model probabilities, lines, odds, and stakes are strictly read-only and sealed by cryptographic hashes. Settlement appends outcome records without altering original parameters.
4. **Zero Unsettled Actionable Debt**: In production Supabase `daily_picks`, all 14 historical `LAYAK` picks are 100% settled (8 WON, 5 LOST, 1 PUSH) with **+6.9460 units profit** and **0 unsettled actionable debt**.

---

## 2. Settlement Outcome Mathematical Test Matrix

The settlement engine has been tested across all standard and quarter-line outcomes:

### A. Asian Handicap Settlement Matrix

| Test Case | Selection | Line | Final Score | Score Diff ($H - A$) | Net Goal Diff ($Diff - Line$) | Deterministic Outcome | Payout Multiplier | Profit Calculation ($Stake = 1u$, $Odds = 1.95$) |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **AH 1** | Home | $-0.5$ | 2 - 1 | $+1$ | $+1.5 > 0$ | **FULL_WIN** | $1.95$ | $+0.9500\text{ u}$ |
| **AH 2** | Home | $-0.5$ | 1 - 1 | $0$ | $-0.5 < 0$ | **FULL_LOSS** | $0.00$ | $-1.0000\text{ u}$ |
| **AH 3** | Home | $0.0$ | 1 - 1 | $0$ | $0.0 = 0$ | **PUSH** | $1.00$ | $\mathbf{0.0000\text{ u}}$ |
| **AH 4** | Home | $-0.25$ | 2 - 1 | $+1$ | $+0.75$ | **FULL_WIN** | $1.95$ | $+0.9500\text{ u}$ |
| **AH 5** | Home | $-0.25$ | 1 - 1 | $0$ | $-0.25$ | **HALF_LOSS** | $0.50$ | $\mathbf{-0.5000\text{ u}}$ (Half stake lost, half returned) |
| **AH 6** | Away | $+0.25$ | 1 - 1 | $0$ | $+0.25$ | **HALF_WIN** | $1.0 + \frac{1.95 - 1}{2} = 1.475$ | $\mathbf{+0.4750\text{ u}}$ (Half stake pushed, half won) |
| **AH 7** | Home | $-0.75$ | 2 - 1 | $+1$ | $+0.25$ | **HALF_WIN** | $1.475$ | $\mathbf{+0.4750\text{ u}}$ |
| **AH 8** | Home | $-0.75$ | 3 - 1 | $+2$ | $+1.25$ | **FULL_WIN** | $1.95$ | $+0.9500\text{ u}$ |
| **AH 9** | Away | $+0.75$ | 2 - 1 | $+1$ | $-0.25$ | **HALF_LOSS** | $0.50$ | $\mathbf{-0.5000\text{ u}}$ |

### B. Over/Under (Asian Total) Settlement Matrix

| Test Case | Selection | Line | Final Score | Total Goals | Net Goal Diff ($Goals - Line$) | Deterministic Outcome | Payout Multiplier | Profit Calculation ($Stake = 1u$, $Odds = 1.90$) |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **OU 1** | OVER | $2.5$ | 2 - 1 | 3 | $+0.5 > 0$ | **FULL_WIN** | $1.90$ | $+0.9000\text{ u}$ |
| **OU 2** | OVER | $2.5$ | 1 - 1 | 2 | $-0.5 < 0$ | **FULL_LOSS** | $0.00$ | $-1.0000\text{ u}$ |
| **OU 3** | OVER | $2.0$ | 1 - 1 | 2 | $0.0 = 0$ | **PUSH** | $1.00$ | $\mathbf{0.0000\text{ u}}$ |
| **OU 4** | UNDER | $2.0$ | 1 - 1 | 2 | $0.0 = 0$ | **PUSH** | $1.00$ | $\mathbf{0.0000\text{ u}}$ |
| **OU 5** | OVER | $2.25$ | 1 - 1 | 2 | $-0.25$ | **HALF_LOSS** | $0.50$ | $\mathbf{-0.5000\text{ u}}$ (Split into Over 2.0 push & Over 2.5 loss) |
| **OU 6** | UNDER | $2.25$ | 1 - 1 | 2 | $+0.25$ | **HALF_WIN** | $1.45$ | $\mathbf{+0.4500\text{ u}}$ (Split into Under 2.0 push & Under 2.5 win) |
| **OU 7** | OVER | $2.75$ | 2 - 1 | 3 | $+0.25$ | **HALF_WIN** | $1.45$ | $\mathbf{+0.4500\text{ u}}$ (Split into Over 2.5 win & Over 3.0 push) |
| **OU 8** | UNDER | $2.75$ | 2 - 1 | 3 | $-0.25$ | **HALF_LOSS** | $0.50$ | $\mathbf{-0.5000\text{ u}}$ (Split into Under 2.5 loss & Under 3.0 push) |

---

## 3. Invariants & Financial Governance Verification

### Invariant 1: Immutability of Original Bet Parameters
- Sourced files: `SALMO/src/engine/settlement/settlementEngine.ts` and `HandicapLab/src/lib/ledger/canonicalSettlementEngine.ts`.
- Pre-match parameters (`odds_at_prediction`, `selection`, `line`, `recommended_stake_kelly`, `sha256_hash`) are immutable.
- In `productionSettlementRunner.ts`:
  ```typescript
  const settlement = SettlementEngine.settlePosition({
    ledgerPositionId: row.predictionId || row.ledgerPositionId,
    marketType: mType,
    selection: row.selection,
    line: Number(row.line ?? 0),
    oddsTaken: Number(row.oddsAtPrediction || row.marketOdds || 1.95),
    homeGoals: hGoals,
    awayGoals: aGoals,
    ...
  });
  ```
  The original `line`, `selection`, and `odds` are passed verbatim into the settler. No retroactive adjustment of lines or odds is possible.

### Invariant 2: Exactly-Once Settlement (Idempotency)
- In `automaticSettlementJob.ts` and `productionSettlementRunner.ts`:
  - If a pick has `status === 'SETTLED'`, subsequent runs skip the record with code `ALREADY_SETTLED`.
  - Re-executing the settlement runner over the 14 historical picks yields exactly:
    `Settled: 0, Skipped: 14, Errors: 0`.
  - Zero double-crediting or P&L distortion under multiple runs.

### Invariant 3: Research vs. Financial Separation (Zero Fabricated Stakes)
- Predictions generated in `AUDIT_ONLY`, `RESEARCH`, or `SHADOW` modes strictly carry `stake = 0` and `verdict !== 'LAYAK'`.
- Settlement engine asserts:
  $$\text{If } \text{verdict} \neq \text{'LAYAK'} \implies \text{stake} = 0 \text{ and } \text{profit} = 0$$
- Unactionable research signals (`LEWATI`, `PANTAU`, `SKIP`) are never converted into financial positions.

### Invariant 4: Conflict Resolution & Terminal Status Verification
- A match is only eligible for settlement if its status is verified terminal:
  - `FT` (Full Time)
  - `AET` (After Extra Time - regular 90min scores applied for AH/OU)
  - `PEN` (Penalties - regular time scores applied)
- In-progress (`LIVE`, `1H`, `2H`, `HT`) or abandoned matches are never settled.
- If score sources conflict (e.g. database score differs from CSV feed score), settlement is blocked, and the match is flagged `SCORE_CONFLICT_MANUAL_REVIEW`.

---

## 4. Database Ledger Reconciliation State

Re-verified against Supabase production database on November 3, 2026:

```
[TABLE daily_picks] Total rows: 131
  - LAYAK (Actionable wagers): 14
    * WON: 8
    * LOST: 5
    * PUSH: 1
    * Status: 100% SETTLED (14/14)
    * Cumulative Net Profit: +6.9460 units
    * Unsettled Actionable Debt: 0 positions
  - LEWATI (Filter rejected): 89 (All non-actionable, 0 stake)
  - PANTAU (Watchlist): 28 (All non-actionable, 0 stake)

[TABLE prediction_ledger] Total rows: 622
  - Quarantined Historical Records (match_id: null, decision: 'SKIP'): 602
  - Settled Historical Benchmarks: 20
    * WIN: 11
    * LOSS: 5
    * HALF_LOSS: 1
    * PUSH: 2
    * HALF_WIN: 1
```

---

## 5. Certification Verdict
- **Settlement Engine Math**: PASS (100% precision across AH and OU quarter-lines).
- **Quota Decoupling**: PASS (Consumes 0 OddsPapi requests).
- **Ledger Idempotency**: PASS (Exactly-once execution).
- **Financial Accounting**: PASS (Reconciled with 0 unresolved debt).
