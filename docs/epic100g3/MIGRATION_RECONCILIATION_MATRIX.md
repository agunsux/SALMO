# MIGRATION RECONCILIATION & 3-STATE COMPATIBILITY MATRIX

**Epic**: EPIC 100G.3 — Fresh Database Bootstrap, Migration Reconciliation & Recovery Validation  
**Document**: Phase B — Migration Reconciliation & Incompatibility Resolution  
**Date**: November 5, 2026  
**Auditor**: Astra (Principal PostgreSQL Architect & Data Integrity Auditor)  
**Status**: **RECONCILED & PROVEN**  
**Production Recommendation**: **STRICTLY NO-GO (DEPLOYMENT HOLD)**  

---

## 1. Executive Summary & The 3-State Rule

In database reliability engineering, naive use of `IF NOT EXISTS` is an anti-pattern: it conceals incompatible schema drift (e.g. an existing column having type `INTEGER` instead of `VARCHAR`, or a constraint that allows invalid odds).

To eliminate this vulnerability, the SALMO unified bootstrap enforces the **3-State Compatibility Evaluation Rule** on every schema entity:

```text
       ┌──────────────────────────────┐
       │   Inspect Existing Object    │
       └──────────────┬───────────────┘
                      │
       ┌──────────────┴───────────────┐
       ▼                              ▼
 [Object Absent]              [Object Present]
       │                              │
       ▼                              ▼
  Create Object            ┌──────────────────────┐
 (Safe Provision)          │ Verify Definition    │
                           └──────────┬───────────┘
                                      │
                      ┌───────────────┴───────────────┐
                      ▼                               ▼
             [Matches Contract]             [Contract Mismatch]
                      │                               │
                      ▼                               ▼
                 PASS SAFELY                     FAIL CLOSED
              (Idempotent Skip)             (Abort Transaction)
```

1. **State 1 (Object Absent)**: Object is created safely according to the canonical specification.
2. **State 2 (Object Present & Compatible)**: Object is verified and preserved without recreation or duplicate index/trigger allocation.
3. **State 3 (Object Present but Incompatible)**: Process **fails closed immediately** with a fatal exception (`INCOMPATIBLE_SCHEMA`), aborting the transaction before any partial mutations occur.

---

## 2. Object Reconciliation Matrix

| Object Name | Baseline State (`schema_canonical.sql`) | Delta State (`STAGING_MIGRATION.sql`) | Reconciliation Strategy in `FRESH_DATABASE_BOOTSTRAP.sql` | 3-State Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **`matches` table** | Creates table from scratch | Assumes table pre-exists; adds columns via `ALTER` | Checks existence: if absent, creates table. If present, checks `canonical_match_id` type; if integer, fails closed. Reconciles missing columns idempotently. | Absent: CREATE<br>Compatible: ALTER ADD<br>Incompatible: FAIL |
| **`matches` kickoff trigger** | `trg_sync_matches_kickoff` | Absent | Included in unified bootstrap. Uses `DROP TRIGGER IF EXISTS ...; CREATE TRIGGER ...;` | Replaced / Idempotent |
| **`market_snapshots` table** | Creates table from scratch | Creates table from scratch | Checks existence. Verifies `home_odds` is numeric. If incompatible, fails closed. | Absent: CREATE<br>Compatible: KEEP<br>Incompatible: FAIL |
| **`market_snapshots` constraint** | `chk_market_snapshots_odds` | `chk_market_snapshots_odds` | Drops old constraint if present and re-adds canonical `home_odds > 1.0 AND away_odds > 1.0`. | Drops & Re-applies |
| **`decisions` table** | Creates table from scratch | Creates table from scratch | Checks existence. Verifies `model_prob_pct` is numeric. Fails closed on mismatch. | Absent: CREATE<br>Compatible: KEEP<br>Incompatible: FAIL |
| **`prediction_ledger` table** | Creates table from scratch | Assumes table pre-exists; adds columns via `ALTER` | Checks existence. Verifies `doi_id` is string. If incompatible, fails closed. Reconciles all columns idempotently. | Absent: CREATE<br>Compatible: ALTER ADD<br>Incompatible: FAIL |
| **`prediction_ledger` DOI index** | `uq_prediction_ledger_doi` | Absent from delta DDL | Created as `CREATE UNIQUE INDEX IF NOT EXISTS uq_prediction_ledger_doi ON prediction_ledger(doi_id)`. | Idempotent |
| **`settlement_results` unique constraint** | `uq_settlement_fixture_market` THEN replaced by `uq_settlement_ledger_pos` | Explicitly drops `uq_settlement_fixture_market`, adds `uq_settlement_ledger_pos` | Explicitly drops coarse `uq_settlement_fixture_market` and installs `uq_settlement_ledger_pos`. | Coarse constraint replaced |
| **`daily_picks` unique constraint** | `uq_daily_picks_fixture_market_source` THEN replaced by `uq_daily_picks_prediction` | Explicitly drops old constraint, adds `uq_daily_picks_prediction` | Explicitly drops old constraint, installs `uq_daily_picks_prediction`. | Replaced & Hardened |
| **Immutability Triggers (All 4)** | Present | Present | Function replaced via `CREATE OR REPLACE FUNCTION`. Trigger replaced via `DROP TRIGGER IF EXISTS ...; CREATE TRIGGER ...;` | Replaced / Idempotent |
| **Row-Level Security (RLS)** | **MISSING** (No RLS) | **PRESENT** (11 policies) | Fully incorporated into unified bootstrap with expanded 15 policies covering all 8 tables. | Newly Enforced |
| **Native System Roles** | Assumes roles exist | Assumes roles exist | Added safety block that creates `anon`, `authenticated`, `service_role` if not present (enabling standalone local testing). | Non-destructive |

---

## 3. Detailed Resolution of Specific Conflict Scenarios

### 3.1. Settlement Position Granularity Resolution
- **Conflict**: Initial versions used `UNIQUE (fixture_id, market_type)`. If an analyst takes both `AH -0.25` and `AH -0.5` on the same match, the second position collides and is rejected.
- **Reconciliation**:
  ```sql
  ALTER TABLE public.settlement_results
    DROP CONSTRAINT IF EXISTS uq_settlement_fixture_market;
  ALTER TABLE public.settlement_results
    DROP CONSTRAINT IF EXISTS uq_settlement_ledger_pos;
  ALTER TABLE public.settlement_results
    ADD CONSTRAINT uq_settlement_ledger_pos UNIQUE (ledger_position_id);
  ```
  This guarantees position-level granularity across all markets and quarter-lines.

### 3.2. Foreign Key Dependency Sequencing
- **Dependency Hierarchy**:
  1. `matches` (Root entity)
  2. `market_snapshots` (References `matches.id`)
  3. `decisions` (References `matches.id` and `market_snapshots.id`)
  4. `prediction_ledger` (References `matches.id` and `decisions.id`)
  5. `settlement_results` (References `matches.id` / `ledger_position_id`)
  6. `evidence` & `data_provenance` (References `decisions.id`)
  7. `daily_picks` (Independent root, references `prediction_id`)
- **Resolution**: `FRESH_DATABASE_BOOTSTRAP.sql` creates tables in exact topological order, preventing foreign key target resolution errors.

---

## 4. Rollback Ownership & Reversibility Contract

| Component | Forward Bootstrap Action | Rollback Action (`STAGING_ROLLBACK.sql`) | Reversibility Guarantee |
| :--- | :--- | :--- | :--- |
| **RLS Policies** | Creates 15 policies across 8 tables | Drops all policies explicitly | 100% Reversible |
| **Immutability Triggers** | Creates 5 immutability / sync triggers | Drops all 5 triggers and functions | 100% Reversible |
| **Check Constraints** | Adds strict odds and probability checks | Drops check constraints safely | 100% Reversible |
| **Core Tables (`matches`, etc.)** | Creates base tables | **PRESERVED** (No DROP TABLE) | **Zero Data Loss Guarantee** |
| **Migration Tracking** | Records migration record in `_salmo_migrations` | Deletes or marks rolled back | Fully Traceable |
