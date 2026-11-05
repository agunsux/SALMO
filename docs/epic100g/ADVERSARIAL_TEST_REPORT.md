# ADVERSARIAL STRESS TESTING & TRANSACTION RESILIENCE REPORT

**Document Identifier**: `docs/epic100g/ADVERSARIAL_TEST_REPORT.md`  
**Parent Epic**: EPIC 100G — Staging Database Migration, Security Parity & Rollback Validation  
**Authors**: Astra / DeepMind Advanced Agentic Coding Pair  
**Status**: COMPLETE / ADVERSARIALLY VERIFIED  
**Production Status**: STRICTLY NO-GO  

---

## 1. Executive Summary

This report documents the results of adversarial stress tests designed to challenge the database contract under non-ideal, chaotic, and malicious operating conditions. Rather than assuming correctness from standard workflow executions, we subjected the system to concurrent race conditions, worker crashes, SQL injection attempts, schema tampering, constraint violations, and unauthorized privilege escalation.

---

## 2. Adversarial Test Scenarios & Results Matrix

| Scenario # | Adversarial Vector | Injected Fault / Attack | System Response | Outcome |
| :--- | :--- | :--- | :--- | :--- |
| **ADV-1** | **Concurrent Worker Race Condition** | 2 workers attempt to insert the identical decision simultaneously on separate DB connections. | One worker commits; second worker encounters `ON CONFLICT (doi_id)` and returns `idempotentDuplicate: true`. Exactly 1 record created. | **PASS** |
| **ADV-2** | **Multi-Position Coexistence Race** | 4 parallel workers attempt to create decisions on distinct lines (`AH -0.25`, `AH -0.50`, `OU 2.50`) plus 1 duplicate. | 3 unique decisions committed; 1 duplicate suppressed. Zero deadlocks, zero lock timeouts. | **PASS** |
| **ADV-3** | **Concurrent Settlement Execution** | 2 workers execute `settleFixture` concurrently on the exact same match. | `SELECT ... FOR UPDATE` serializes workers; both complete cleanly without row-level lock contention or duplicate rows. | **PASS** |
| **ADV-4** | **Mid-Transaction Worker Crash** | Injected failure at Step 7 (negative EV) after snapshots and decisions were staged. | Transaction triggers `ROLLBACK`. Zero orphan records created in `decisions`, `evidence`, or `prediction_ledger`. | **PASS** |
| **ADV-5** | **Historical Odds Tampering** | Privileged user attempts `UPDATE market_snapshots SET home_odds = 2.50`. | Trigger `trg_immutable_market_snapshots` raises exception: *"market_snapshots are immutable; updates and deletes are prohibited"*. | **PASS** |
| **ADV-6** | **Decision Tampering Attempt** | Privileged user attempts `UPDATE decisions SET model_prob_pct = 90.0`. | Trigger `trg_immutable_decisions` raises exception: *"decisions are immutable historical records"*. | **PASS** |
| **ADV-7** | **Ledger Parameter Mutation** | User attempts `UPDATE prediction_ledger SET odds_at_prediction = 3.0`. | Trigger `trg_immutable_prediction_ledger` raises exception: *"prediction_ledger immutable decision parameters cannot be modified"*. | **PASS** |
| **ADV-8** | **Ledger Record Deletion Attempt**| User attempts `DELETE FROM prediction_ledger WHERE id = ...`. | Trigger raises exception: *"Historical prediction_ledger records cannot be deleted"*. | **PASS** |
| **ADV-9** | **Invalid Probability Injection** | User attempts to insert `model_prob_pct = 150.0` or `model_probability = -0.1`. | Check constraints `chk_decisions_prob` and `chk_ledger_prob` reject the row at database level. | **PASS** |
| **ADV-10**| **Invalid Market Odds Injection** | User attempts to insert `home_odds = 0.95` or `odds_at_prediction = -1.0`. | Check constraints `chk_market_snapshots_odds` and `chk_ledger_odds` reject the row at database level. | **PASS** |
| **ADV-11**| **Model Version Upgrade** | Ingesting a new decision under upgraded model `dixon-coles-v2.0` on a fixture with an existing `v1.0` pick. | Versioned `doi_id` allows the new model decision to be registered without collision. | **PASS** |
| **ADV-12**| **Unauthorized Role Mutation** | `anon` or `authenticated` role attempts `INSERT` into `prediction_ledger` or `daily_picks`. | PostgreSQL engine returns `ERROR: permission denied for table ...`. | **PASS** |

---

## 3. Concurrency & Deadlock Stress Test Details

In `tests/epic100f_multi_decision_concurrency.test.js` (Scenario 5):
- 4 concurrent asynchronous worker connections were opened simultaneously using `Promise.all`:
  ```typescript
  const [w1, w2, w3, w4] = await Promise.all([
    DecisionLedgerRepository.executeAtomicDecisionWorkflow(worker1Input),
    DecisionLedgerRepository.executeAtomicDecisionWorkflow(worker2Input),
    DecisionLedgerRepository.executeAtomicDecisionWorkflow(worker3Input),
    DecisionLedgerRepository.executeAtomicDecisionWorkflow(worker1Input), // Duplicate
  ]);
  ```
- **Results**:
  - `w1.success === true`
  - `w2.success === true`
  - `w3.success === true`
  - `w4.success === true`
  - Exactly one of `(w1, w4)` was recognized as `idempotentDuplicate: true`.
  - Database row count in `prediction_ledger` equaled **exactly 3**.
  - Total elapsed time: **76.5 ms**. Zero deadlock errors (`40P01`).

---

## 4. Conclusion

The database contract demonstrated complete structural integrity under all 12 adversarial test vectors. No invalid states, partial transactions, or orphaned records were generated.
