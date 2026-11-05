# DETERMINISTIC BOOTSTRAP ADVERSARIAL TEST MATRIX REPORT

**Epic**: EPIC 100G.3 — Fresh Database Bootstrap, Migration Reconciliation & Recovery Validation  
**Document**: Phase D — Adversarial Scenarios T1–T12 Empirical Verification  
**Date**: November 5, 2026  
**Auditor**: Astra (Principal PostgreSQL Architect & Database Reliability Engineer)  
**Test Suite**: `tests/epic100g3_bootstrap_adversarial.test.js`  
**Result**: **12 / 12 PASS (100%)**  
**Production Recommendation**: **STRICTLY NO-GO (DEPLOYMENT HOLD)**  

---

## 1. Executive Summary & Adversarial Test Philosophy

To prove that the SALMO unified bootstrap is truly deterministic, resilient, and fail-closed, the bootstrap was subjected to a battery of **12 adversarial test scenarios** in isolated local PostgreSQL 16 databases.

The test suite exercises empty databases, pre-existing legacy schemas, partial schemas, incompatible data types, constraint collisions, mid-migration crashes, and rollback/re-application cycles.

---

## 2. Adversarial Test Scorecard (12 / 12 PASS)

| Scenario | Test ID & Name | Initial Database Condition | Adversarial Challenge | Result | Duration |
| :---: | :--- | :--- | :--- | :---: | :---: |
| **T1** | Empty Database Bootstrap | Completely empty DB (`0` tables in `public`) | Bootstrap must create all 8 core tables + 1 tracking table without pre-requisite errors | **PASS** | 630.8ms |
| **T2** | Baseline Pre-Applied | Pre-existing legacy `matches` and `prediction_ledger` | Bootstrap must upgrade columns and apply triggers without dropping tables | **PASS** | 653.6ms |
| **T3** | Repeated Bootstrap (Idempotency) | Fully bootstrapped DB | Second and third executions must complete safely without duplicate errors | **PASS** | 610.7ms |
| **T4** | Partial Baseline Preservation | Partial `matches` table containing active test row | Bootstrap must preserve existing data row while adding missing columns and tables | **PASS** | 591.6ms |
| **T5** | Incompatible Existing Column | Table with corrupted column (`canonical_match_id INT`) | Bootstrap must detect type mismatch and **FAIL CLOSED** (`INCOMPATIBLE_SCHEMA`) | **PASS** | 484.5ms |
| **T6** | Constraint Collision & Upgrade | Table with coarse `UNIQUE(fixture_id, market_type)` | Bootstrap must drop coarse constraint and install position-level constraint | **PASS** | 505.6ms |
| **T7** | Trigger Immutability Enforcement | Valid match and snapshot inserted | Attempts to `UPDATE` or `DELETE` snapshot row must be blocked by trigger | **PASS** | 652.0ms |
| **T8** | Prerequisite Engine Version Check | Engine version check assertion (< 15.0) | Bootstrap must abort immediately with clear prerequisite failure message | **PASS** | 424.9ms |
| **T9** | Mid-Migration Transaction Abort | Deliberate exception injected inside transaction | Transaction must roll back completely; zero partial tables created | **PASS** | 438.8ms |
| **T10** | Delta Rollback Baseline Survival | Fully bootstrapped database | Rollback drops triggers and RLS policies while preserving `matches` and `prediction_ledger` | **PASS** | 536.6ms |
| **T11** | Re-Apply Bootstrap After Rollback | Database that was just rolled back | Re-applying bootstrap succeeds completely, restoring all triggers and policies | **PASS** | 637.4ms |
| **T12** | Historical Ledger Immutability | Repository filesystem | All 3 protected historical ledgers verified against golden SHA-256 targets | **PASS** | 2.7ms |

---

## 3. Empirical Test Log Excerpt

From the final execution of `tests/epic100g3_bootstrap_adversarial.test.js`:

```text
✔ T1: Completely empty database -> Bootstrap succeeds (630.8616ms)
✔ T2: Baseline already applied -> Delta completes safely (653.5569ms)
✔ T3: Full bootstrap already applied -> Repeat run is safe (610.692ms)
✔ T4: Partial baseline -> Compatible objects preserved; missing objects handled (591.6147ms)
✔ T5: Incompatible existing column -> Hard failure (484.4517ms)
✔ T6: Duplicate or incompatible constraint -> Reconciles to canonical constraint (505.585ms)
✔ T7: Duplicate or incompatible trigger -> Immutability trigger enforces freeze (652.017ms)
✔ T8: Missing required extension / engine version -> Clear prerequisite failure (424.8957ms)
✔ T9: Failure midway through migration -> Transaction rollback verified (438.7729ms)
✔ T10: Rollback of delta -> Baseline survives (536.6217ms)
✔ T11: Reapply delta after rollback -> Bootstrap succeeds (637.3886ms)
✔ T12: Historical ledger integrity -> All 3 protected hashes unchanged (2.6852ms)

ℹ tests 12
ℹ suites 0
ℹ pass 12
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 6327.2472
```

---

## 4. Phase D Conclusion

The bootstrap script has proven 100% resilient across all 12 adversarial scenarios. It guarantees clean instantiation on fresh staging databases, safe upgrades on partially initialized databases, and strict fail-closed protection against corrupted schemas.
