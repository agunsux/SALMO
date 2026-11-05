# EPIC 100F — PRODUCTION PARITY, ADVERSARIAL AUDIT & LIVE DATA READINESS REPORT

**Epic**: EPIC 100F — Production Parity, Adversarial Audit & Live Data Readiness  
**Target Codebase**: SALMO.DEV / Advanced Agentic Pair Programming  
**Date**: November 5, 2026  
**Final Status**: COMPLETE / FULLY AUDITED  
**Production Recommendation**: **STRICTLY NO-GO**  

---

## 1. Executive Summary

Continuing directly from EPIC 100B, 100C, 100D, and 100E, **EPIC 100F** executed an adversarial production-readiness audit. Rather than accepting passing unit tests at face value, our pairing investigated edge cases, remote database parity, mathematical invariants, multi-worker concurrency, and external provider constraints.

### Key Achievements in EPIC 100F:
1. **Resolved Settlement Overwrite Defect**:
   Demonstrated that the previous unique constraint `(fixture_id, market_type)` in `settlement_results` caused legitimate coexisting decisions on the same match (e.g., `AH -0.25` and `AH -0.50`) to overwrite each other. Refactored the constraint to `(ledger_position_id)` and `(prediction_id)`.
2. **Discovered & Fixed Away Handicap Calculation Defect**:
   Formulated an independent 27-case mathematical oracle from first principles. Discovered that away side handicaps previously used `(awayGoals - homeGoals) - line` instead of `+ line`, inverting positive handicaps into false losses. Corrected to canonical split-bet mathematics.
3. **Established Population Separation in Performance Analytics**:
   Hardened `PerformanceRepository` to exclude `source_type IN ('SYNTHETIC', 'SIMULATION')` by default. Proved that local test simulations (such as the UCL acceptance test) cannot leak into production profitability statistics.
4. **Audited Remote Supabase Parity (Read-Only)**:
   Introspected remote Supabase (`rgkrfzxipkrwqccfuqfq.supabase.co`). Discovered that `market_snapshots` and `decisions` do not exist on remote, and that remote Supabase already hosts quarantined synthetic rows. Maintained strict read-only posture.
5. **Verified Live Provider Quota Exhaustion & Inactive Schedulers**:
   Confirmed live OddsPapi quota is exhausted (260/250). Verified `ODDSPAPI_PAUSED=true` circuit breaker. Confirmed `vercel.json` has `"crons": []` and GitHub Actions workflow is strictly manual dry-run.
6. **Expanded Test Baseline**:
   Maintained all previous test invariants while adding 8 new comprehensive integration tests. Suite grew from 441 pass to **449 pass, 0 fail, 1 skipped**. Protected historical ledger hashes remain 100% byte-identical.

---

## 2. Inventory of the 10 Formal Documentation Artifacts

All 10 required artifacts have been authored and placed in `docs/epic100f/`:

| No | Document Path | Core Focus & Findings |
| :--- | :--- | :--- |
| 1 | `docs/epic100f/SETTLEMENT_IDENTITY_AUDIT.md` | Forensic audit of `(fixture_id, market_type)` defect; proof of resolution enabling multi-decision coexistence on the same fixture. |
| 2 | `docs/epic100f/IDEMPOTENCY_VERSIONING_AUDIT.md` | Architecture of `doi_id`; balancing deduplication of concurrent cron workers with legitimate model version upgrades and line adjustments. |
| 3 | `docs/epic100f/PERFORMANCE_ACCOUNTING_AUDIT.md` | Population separation; excluding test simulations; accounting for PENDING, WIN, HALF_WIN, PUSH, HALF_LOSS, LOSS, VOID; calibration metric segregation. |
| 4 | `docs/epic100f/SETTLEMENT_MATHEMATICAL_VALIDATION.md` | 27-case independent mathematical reference suite; discovery and fix of away handicap sign inversion. |
| 5 | `docs/epic100f/PRODUCTION_SECURITY_PARITY.md` | Column-by-column comparison with remote Supabase; table inventory; quarantined test row discovery; role and RLS model. |
| 6 | `docs/epic100f/PRODUCTION_ENVIRONMENT_AUDIT.md` | Audit of environment variables, secret redaction in logging, connection pooling parameters, and preview isolation. |
| 7 | `docs/epic100f/ODDSPAPI_LIVE_READINESS.md` | Live OddsPapi quota analysis (260/250); circuit breaker verification; absence of reset date in API payload; settlement anti-leakage. |
| 8 | `docs/epic100f/SCHEDULER_READINESS.md` | Verification of `"crons": []` in `vercel.json`; audit of `.github/workflows/settle-cron.yml` manual dry-run; cron authentication security. |
| 9 | `docs/epic100f/RELEASE_GATE_REPORT.md` | Evidence-based assessment of Gates A through H; justification for maintaining production deployment hold. |
| 10 | `docs/epic100f/EPIC100F_REPORT.md` | Executive synthesis and final deliverable summary. |

---

## 3. Audit of the Four Technical Risks Raised by User

### Risk A: Settlement Uniqueness (`fixture_id, market_type`)
- **Evaluation**: The user's concern was **100% confirmed**. The constraint was too restrictive and destroyed settlement history for multi-line positions.
- **Resolution**:
  - Dropped `uq_settlement_fixture_market`.
  - Added `uq_settlement_ledger_pos UNIQUE (ledger_position_id)` and supported `prediction_id`.
  - In `SettlementRepository.settleFixture`, scoped `daily_picks` update to `WHERE prediction_id = $1`.
  - Tested in PostgreSQL: `AH -0.25` and `AH -0.50` settled simultaneously on the same match with 2 distinct settlement rows.

### Risk B: Idempotency Key Formulation
- **Evaluation**: The unversioned key `doi_{fixtureId}_{market}_{line}_{normalizedSelection}` blocked legitimate model updates and new versions.
- **Resolution**:
  - `generateDoiId` updated to include `cleanSelection` and optional `modelVersion` and `decisionVersion`.
  - Verified that identical runs trigger `idempotentDuplicate: true`, while upgraded model versions generate distinct keys and succeed.

### Risk C: Performance Calculation Rigor
- **Evaluation**: Unsettled, void, and test fixtures risked corrupting public ROI.
- **Resolution**:
  - `PerformanceRepository.calculatePerformance` updated to enforce `source_type NOT IN ('SYNTHETIC', 'SIMULATION')` by default.
  - PENDING positions are strictly excluded from stake and profit calculations.
  - VOID positions refund stake and are excluded from the ROI denominator.
  - PUSH positions return stake, record 0.0 profit, and dilute the ROI denominator without affecting win counts.
  - Brier score and Log Loss strictly evaluate non-push binary outcomes, preventing probability distortion.

### Risk D: UCL Simulation Isolation
- **Evaluation**: The UCL acceptance test (*Real Madrid vs Man City*) showed +105% ROI from a single test match.
- **Resolution**:
  - All acceptance simulations are tagged `source_type = 'SIMULATION'`.
  - Verified that default performance queries return `simFound === undefined`, guaranteeing zero pollution of Salmo profitability statistics.

---

## 4. Test Suite Summary

- **Local PostgreSQL 16 Daemon**: Running continuously on `127.0.0.1:5432` (`salmo_test`).
- **PostgreSQL Integration Tests**: 27 / 27 PASS
  - `tests/epic100d_postgres_contract.test.js`: 14 tests PASS
  - `tests/epic100e_concurrency_validation.test.js`: 4 tests PASS
  - `tests/epic100e_ucl_end_to_end_acceptance.test.js`: 1 test PASS
  - `tests/epic100f_settlement_mathematics_reference.test.js`: 3 tests PASS (27 sub-cases)
  - `tests/epic100f_multi_decision_concurrency.test.js`: 5 tests PASS
- **Total Repository Test Suite**:
  - **449 passed**
  - **0 failed**
  - **1 skipped** (PGlite conditional WASM test, audited in EPIC 78 Gate C)
- **Cryptographic Ledgers**:
  - `live_prediction_ledger.jsonl`: `317fc037a63b811420400ea9de094092ec7d68b119ad6abc57743be12d568527` (MATCH)
  - `all_leagues_research_ledger.jsonl`: `eae8f364a5393255d276fca2650056951fb601ba829c1710b26ac673dffb967b` (MATCH)
  - `multi_league_research_predictions.jsonl`: `0128616a43968be5fddab76ea5c57da731955e22b1bf27bca3f886938187a12f` (MATCH)

---

## 5. Final Production Recommendation

**PRODUCTION STATUS: STRICTLY NO-GO**

### Justification:
1. **Remote Database Parity (Gate F)**:
   Remote Supabase does not currently possess `market_snapshots` or `decisions` tables, and lacks database immutability triggers. Deploying the application code to production without applying staged database migrations would cause immediate runtime errors.
2. **Provider Quota Depletion (Gate G)**:
   OddsPapi has consumed 260 of 250 monthly requests. The circuit breaker is permanently tripped (`ODDSPAPI_PAUSED=true`). Autonomous production operation cannot fetch live sharp odds until the provider subscription is renewed or upgraded.

### Safe Forward Path:
1. Maintain local and staging validation.
2. Prepare an automated migration script for staging deployment of the canonical schema (`market_snapshots`, `decisions`, triggers).
3. Secure OddsPapi quota renewal before activating any production scheduler.
