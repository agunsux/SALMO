# EPIC 100D — CANONICAL DATABASE CONTRACT VALIDATION REPORT

**Status**: 14 / 14 PostgreSQL Tests Passed (Local Execution)  
**Target Database**: PostgreSQL 16.13 (`salmo_test` on `127.0.0.1:5432`)  
**Production Status**: NO-GO (Strictly Local Validation)  
**Date**: November 2026  

---

## Executive Summary

EPIC 100D formalizes and validates the canonical PostgreSQL database contract for the SALMO decision intelligence engine. The database schema replaces loosely structured, unconstrained legacy tables with a fully typed, constrained, relational schema enforcing:
- Strict Foreign Key referential integrity (`RESTRICT` on delete).
- Database-level `CHECK` constraints on model probabilities and market odds.
- Row-level immutability triggers preventing unauthorized tampering of odds snapshots, decision records, and prediction ledger rows.
- Atomic settlement quarter-line calculations with immutable audit records.
- Complete migration idempotency across forward application and rollback.

All 14 core database contract tests pass with 100% success against local PostgreSQL 16.

---

## 1. Validated Database Contract Invariants (14 / 14 PASS)

| Test # | Invariant Tested | Verification Method | Result |
| :--- | :--- | :--- | :--- |
| **01** | Foreign Key Constraint: Reject decision with orphan `match_id` | Attempt insert of decision referencing non-existent `match_id` (`00000000-0000-0000-0000-000000000099`). Caught FK violation `23503`. | **PASS** |
| **02** | Foreign Key Restrict: Prevent deletion of parent match | Insert match and market snapshot; attempt `DELETE FROM matches`. Verified foreign key restriction blocks deletion. | **PASS** |
| **03** | Probability Range Check: Decisions table (`0.0 <= prob <= 100.0`) | Insert decisions with `model_prob_pct = -5.0` and `model_prob_pct = 105.0`. Both rejected by `chk_decisions_prob`. | **PASS** |
| **04** | Market Odds Check: Market snapshots table (`odds > 1.0`) | Insert market snapshots with `home_odds = 0.95` and `away_odds = -1.5`. Both rejected by `chk_snapshots_odds`. | **PASS** |
| **05** | Probability Range Check: Prediction ledger (`0.0 <= prob <= 1.0`) | Insert ledger row with `model_probability = 1.25`. Rejected by `chk_ledger_prob`. | **PASS** |
| **06** | Odds Check: Prediction ledger (`odds_at_prediction > 1.0`) | Insert ledger row with `odds_at_prediction = 1.00`. Rejected by `chk_ledger_odds`. | **PASS** |
| **07** | Result Status Check: Prediction ledger enum validation | Insert ledger row with `result_status = 'INVALID_STATUS'`. Rejected by `chk_ledger_result_status`. | **PASS** |
| **08** | Snapshot Immutability: Block UPDATE operations | Trigger `fn_prevent_market_snapshot_tampering()` intercepts `UPDATE` on odds and raises exception. | **PASS** |
| **09** | Snapshot Immutability: Block DELETE operations | Trigger `fn_prevent_market_snapshot_tampering()` intercepts `DELETE` on snapshot and raises exception. | **PASS** |
| **10** | Decision Immutability: Block UPDATE operations | Trigger `fn_prevent_decision_tampering()` intercepts `UPDATE` on decision record and raises exception. | **PASS** |
| **11** | Prediction Ledger Immutability: Block parameter updates | Trigger `fn_protect_prediction_ledger_immutability()` blocks modification of `odds_at_prediction`, `model_probability`, or `selection`. | **PASS** |
| **12** | Prediction Ledger Immutability: Block DELETE operations | Trigger `fn_protect_prediction_ledger_immutability()` blocks `DELETE` on historical ledger positions. | **PASS** |
| **13** | Settlement Math & Immutability: Quarter-line resolution | Tested AH -0.25 on a 2-1 win (Full Win payout). Attempted `DELETE` on `settlement_results` blocked by `fn_protect_settlement_results_immutability()`. | **PASS** |
| **14** | Migration Idempotency: Rollback and Re-apply | Executed `data/schema_canonical_rollback.sql` followed by `data/schema_canonical.sql`. Database returned cleanly to canonical state without orphan triggers or schemas. | **PASS** |

---

## 2. Canonical Schema Structure

The canonical database schema is implemented in `data/schema_canonical.sql`:

1. **`matches`**:
   - Primary key: `id UUID DEFAULT gen_random_uuid()`
   - Unique identifier: `canonical_match_id VARCHAR(255) UNIQUE NOT NULL`
   - Data status: `ACTIVE`, `QUARANTINED`, `CANCELLED`
   - Automatic sync trigger: `trg_sync_matches_kickoff` maintains synchronization between legacy `kickoff_time` and canonical `kickoff`.

2. **`market_snapshots`**:
   - Foreign key: `match_id UUID REFERENCES matches(id) ON DELETE RESTRICT`
   - Immutable historical record of bookmaker quotes (Pinnacle sharp reference).
   - Protected by trigger: `trg_immutable_market_snapshots`.

3. **`decisions`**:
   - Foreign key: `match_id UUID REFERENCES matches(id) ON DELETE RESTRICT`
   - Foreign key: `odds_snapshot_id UUID REFERENCES market_snapshots(id) ON DELETE RESTRICT`
   - Immutable record of ValueEngine qualification gates and decision badges.
   - Protected by trigger: `trg_immutable_decisions`.

4. **`evidence` & `data_provenance`**:
   - Relational audit trail linked to `decisions(id)`.
   - Stores sample size distributions, checksums, and dataset provenance.

5. **`prediction_ledger`**:
   - The authoritative actionable decision ledger.
   - Unique constraint: `doi_id VARCHAR(255) UNIQUE NOT NULL`.
   - Foreign keys to `decisions(id)` and `matches(id)`.
   - Immutability trigger: `trg_immutable_prediction_ledger` permits updating only settlement outcome columns (`result_status`, `roi`, `profit_loss`, `status`, `settlement`, `settled_at`). Modifications of original odds, probability, selection, or timestamps are strictly rejected.

6. **`daily_picks`**:
   - Public projection table for active and settled qualified picks.
   - Unique constraint: `(fixture_id, market_type, source)`.

7. **`settlement_results`**:
   - Append-only immutable settlement log.
   - Unique constraint: `(fixture_id, market_type)`.
   - Protected by trigger: `trg_immutable_settlement_results`.

---

## 3. Cryptographic Verification & Ledger Integrity

All three protected historical ledgers remain byte-identical:
- `data/verification/live_prediction_ledger.jsonl`: `317fc037a63b811420400ea9de094092ec7d68b119ad6abc57743be12d568527`
- `data/verification/all_leagues_research_ledger.jsonl`: `eae8f364a5393255d276fca2650056951fb601ba829c1710b26ac673dffb967b`
- `data/research/multi_league_research_predictions.jsonl`: `0128616a43968be5fddab76ea5c57da731955e22b1bf27bca3f886938187a12f`

Historical EPIC 79 hash investigations confirmed that legacy non-reproducible runs were caused by unconstrained date formatting differences in legacy scripts, which are now replaced by deterministic ISO timestamps and deterministic SHA-256 provenance hashes.
