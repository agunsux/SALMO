# SETTLEMENT IDENTITY AUDIT & MULTI-DECISION COEXISTENCE

**Document Identifier**: `docs/epic100f/SETTLEMENT_IDENTITY_AUDIT.md`  
**Parent Epic**: EPIC 100F — Production Parity, Adversarial Audit & Live Data Readiness  
**Authors**: Astra / DeepMind Advanced Agentic Coding Pair  
**Status**: COMPLETE / VERIFIED  
**Production Status**: STRICTLY NO-GO  

---

## 1. Executive Summary

In EPIC 100E, the settlement table `settlement_results` enforced the uniqueness constraint:
```sql
CONSTRAINT uq_settlement_fixture_market UNIQUE (fixture_id, market_type)
```
During the adversarial audit in EPIC 100F, this constraint was identified as a **structural defect** that prevents multiple legitimate actionable decisions from coexisting and settling on the same fixture.

Specifically, in modern quantitative football betting:
1. A fixture can legitimately yield multiple positions on the same market family (e.g., Asian Handicap `AH -0.25` and `AH -0.50`, or Over/Under `OU 2.25` and `OU 2.75`).
2. Distinct models or upgraded model iterations (e.g., `dixon-coles-v1.0` vs `dixon-coles-v2.0`) can generate separate positions on the same match.
3. Under the previous `(fixture_id, market_type)` constraint, inserting or updating the settlement for a second decision on the same fixture and market caused an `ON CONFLICT DO UPDATE` collision that **silently overwrote** the settlement outcome and profit units of the first decision.
4. Furthermore, in `SettlementRepository.settleFixture`, the `daily_picks` update clause contained:
   ```sql
   WHERE prediction_id = $1 OR fixture_id = $4;
   ```
   This caused every pick for that fixture to be overwritten with the settlement status of whichever pick was processed last in the loop.

This document details the forensic root-cause analysis, mathematical impact, schema resolution, and local PostgreSQL validation of the settlement identity model.

---

## 2. Forensic Analysis of the Settlement Uniqueness Defect

### 2.1 The Collision Scenario

Consider a Premier League fixture: *Manchester City vs Newcastle United*.
The value engine identifies two actionable value opportunities across different lines in the Asian Handicap market:
- **Decision 1**: Manchester City `AH -0.25` @ 1.95 (Model Prob: 62.0%, EV: +20.9%)
- **Decision 2**: Manchester City `AH -0.50` @ 2.10 (Model Prob: 58.0%, EV: +21.8%)

Both decisions pass ConfidenceGate (verdict `LAYAK`, confidence $\ge 65$, badge `GREEN`) and are recorded into `prediction_ledger`.

#### The Legacy Execution Trace:
1. Match finishes `1 - 0` (Manchester City wins by 1 goal).
2. Settlement worker executes `settleFixture`:
   - Decision 1 (`AH -0.25`): Differential $\Delta = (1 - 0) - 0.25 = +0.75 > 0.25 \implies \text{WIN}$, Profit = $+0.95$ units.
     Inserts row into `settlement_results` with `(fixture_id, market_type) = ('EPL_MCI_NEW', 'AH')`.
   - Decision 2 (`AH -0.50`): Differential $\Delta = (1 - 0) - 0.50 = +0.50 > 0.25 \implies \text{WIN}$, Profit = $+1.10$ units.
     Attempts to insert into `settlement_results`.
3. **Database Conflict Triggered**:
   Because `(fixture_id, market_type)` was already present from Decision 1, PostgreSQL executed:
   ```sql
   ON CONFLICT (fixture_id, market_type) DO UPDATE SET
     outcome = EXCLUDED.outcome,
     profit_units = EXCLUDED.profit_units, ...
   ```
4. **Data Loss**:
   The settlement record for Decision 1 was overwritten by Decision 2. Only 1 row remained in `settlement_results`, destroying the settlement history of Decision 1 and corrupting ledger reconciliation.

---

## 3. The Canonical Resolution: Granular Position Identity

### 3.1 Primary Identity Shift: From Market-Level to Position-Level

Settlement must bind to the **specific actionable decision position**, not the fixture market abstraction.

In `data/schema_canonical.sql`, the schema was refactored:

```sql
-- 1. Drop restrictive market-level uniqueness
ALTER TABLE public.settlement_results DROP CONSTRAINT IF EXISTS uq_settlement_fixture_market;

-- 2. Add prediction_id column for Supabase remote schema compatibility
ALTER TABLE public.settlement_results ADD COLUMN IF NOT EXISTS prediction_id VARCHAR(255);

-- 3. Establish canonical uniqueness on position identifier
ALTER TABLE public.settlement_results ADD CONSTRAINT uq_settlement_ledger_pos UNIQUE (ledger_position_id);

-- 4. Scope daily_picks uniqueness to individual prediction
ALTER TABLE public.daily_picks DROP CONSTRAINT IF EXISTS uq_daily_picks_fixture_market_source;
ALTER TABLE public.daily_picks ADD CONSTRAINT uq_daily_picks_prediction UNIQUE (prediction_id);
```

### 3.2 Dual Column Compatibility (`ledger_position_id` & `prediction_id`)

Remote Supabase inspection (OpenAPI introspection of `rgkrfzxipkrwqccfuqfq.supabase.co`) revealed that the existing remote table `settlement_results` had `prediction_id` as its reference column, while local canonical schema used `ledger_position_id`.

By maintaining both columns populated with the canonical `doi_id`, we guarantee 100% backward and forward compatibility across local PostgreSQL and remote Supabase environments.

### 3.3 Scoped `daily_picks` Reconciliation

In `SettlementRepository.settleFixture`, the update statement was corrected from:
```sql
-- VULNERABLE (overwrites all picks for the fixture):
UPDATE public.daily_picks SET status = $2, profit_loss = $3 WHERE prediction_id = $1 OR fixture_id = $4;
```
to:
```sql
-- SECURE & SCOPED (updates only the specific prediction):
UPDATE public.daily_picks SET status = $2, profit_loss = $3, settled_at = NOW(), updated_at = NOW() WHERE prediction_id = $1;
```

---

## 4. Verification & Test Evidence

The resolution was validated in `tests/epic100f_multi_decision_concurrency.test.js`:
- **Scenario 1**: Simultaneously created `AH -0.25` and `AH -0.50` on the same fixture.
- Both rows inserted into `prediction_ledger` and `daily_picks`.
- Settled match with score `1 - 0`.
- Verified `settlement_results` contains **exactly 2 distinct rows**:
  - Row 1: Line `-0.25`, Outcome `WIN`, Profit Units `+0.95`.
  - Row 2: Line `-0.50`, Outcome `WIN`, Profit Units `+1.10`.
- Verified `daily_picks` contains **2 independent settled picks** with their respective profits.
- Result: **PASS** (Zero collision, zero data loss).
