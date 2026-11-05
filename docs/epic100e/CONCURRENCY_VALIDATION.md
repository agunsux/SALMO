# EPIC 100E — CROSS-BACKEND CONCURRENCY VALIDATION REPORT

**Scope**: Multi-instance concurrency, race condition handling, crash/rollback resilience, and isolation semantics.  
**Test Suite**: `tests/epic100e_concurrency_validation.test.js`  
**Result**: 4 / 4 Scenarios Passed (100% Success)  
**Execution Runtime**: PostgreSQL 16.13 (`127.0.0.1:5432`)  

---

## 1. Concurrency Architecture & Locking Strategy

In a distributed multi-worker backend (e.g. multiple Cloud Run containers, container autoscaling, or parallel cron instances), in-memory mutexes or process-local locks fail because separate OS processes do not share memory.

SALMO employs **database-level transactional concurrency control**:

1. **Deterministic Natural Idempotency Keys**:
   - `doi_id`: Deterministically derived from `doi_{fixtureId}_{market}_{line}_{normalizedSelection}`.
   - Enforced by `UNIQUE INDEX uq_prediction_ledger_doi ON public.prediction_ledger (doi_id)`.
   - Insert statement uses `ON CONFLICT (doi_id) DO NOTHING`.
   - If a concurrent worker committed first, the losing worker detects 0 returned rows, retrieves the existing committed record, and returns `{ idempotentDuplicate: true }` without throwing or aborting.

2. **Pessimistic Row Locking on Settlement**:
   - When settling a fixture, `SettlementRepository` executes:
     ```sql
     SELECT id, doi_id, market, selection, line, odds_at_prediction, result_status
     FROM public.prediction_ledger
     WHERE (match_id = $1::uuid OR fixture_id = $1::text)
     FOR UPDATE;
     ```
   - Concurrent settlement workers block until the active transaction commits or rolls back, preventing double payouts or duplicate settlements.

3. **Snapshot Isolation & Immutability**:
   - Ingestion of fresh market quotes captures a new row in `market_snapshots`.
   - Triggers intercept any `UPDATE` or `DELETE` attempt on existing rows, ensuring that concurrent odds refreshes never overwrite or tamper with the original quote used at decision time.

---

## 2. Concurrency Simulation Test Scenarios (4 / 4 PASS)

| Scenario # | Description | Race Condition Simulated | Database Protection | Verified Invariant | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **01** | Simultaneous Decision Creation | Two workers simultaneously execute the 11-step transaction for the exact same fixture, market, line, and selection. | `prediction_ledger (doi_id)` UNIQUE constraint + `ON CONFLICT DO NOTHING`. | Exactly one official decision committed; second worker identified as idempotent duplicate. Zero duplicate rows. | **PASS** |
| **02** | Worker Crash & Rollback | A worker process crashes or encounters an error during EV evaluation (Step 7). | Full ACID transaction rollback (`ROLLBACK`). | Zero orphan records. Zero partial snapshots or decision records left behind. | **PASS** |
| **03** | Concurrent Settlement | Two settlement workers simultaneously process the final match score for the same fixture. | `SELECT ... FOR UPDATE` + unique constraint on `settlement_results (fixture_id, market_type)`. | Exactly one settlement record persisted. Idempotent settlement across both workers. | **PASS** |
| **04** | Concurrent Odds Refreshes | Two ingestion workers refresh Pinnacle quotes at T-12h and T-6h. | Append-only `market_snapshots` + immutability trigger `fn_prevent_market_snapshot_tampering()`. | Original snapshot unchanged. Two independent snapshot records preserved in historical audit trail. | **PASS** |

---

## 3. Transaction Rollback & Zero-Orphan Verification

In Scenario 2, an invalid decision input was submitted:
```typescript
const invalidDecisionInput = {
  fixtureId: fixture.id,
  marketType: 'AH',
  selection: 'Liverpool FC -0.5',
  line: -0.5,
  modelProbability: 0.40,
  pinnacleOdds: { sideOdds: 1.80, oppositeOdds: 2.10 }, // Negative EV: 0.40 * 1.80 - 1 = -0.28
  sampleSizeHome: 10,
  sampleSizeAway: 10,
};
```
The workflow failed at Step 7 (`NEGATIVE_OR_ZERO_EV`). Verification query:
```sql
SELECT COUNT(*) FROM public.decisions WHERE match_id = $1;
SELECT COUNT(*) FROM public.prediction_ledger WHERE match_id = $1;
```
Both queries returned exactly `0`. The transaction aborted cleanly with zero orphan records.
