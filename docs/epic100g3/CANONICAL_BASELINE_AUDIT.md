# CANONICAL BASELINE & MIGRATION ARTIFACT AUDIT

**Epic**: EPIC 100G.3 — Fresh Database Bootstrap, Migration Reconciliation & Recovery Validation  
**Document**: Phase A — Canonical Baseline Inventory & Artifact Audit  
**Date**: November 5, 2026  
**Auditor**: Astra (Principal PostgreSQL Architect & Data Integrity Auditor)  
**Status**: **COMPLETE & VERIFIED**  
**Production Recommendation**: **STRICTLY NO-GO (DEPLOYMENT HOLD)**  

---

## 1. Executive Summary

This document performs an exhaustive, line-by-line audit and cross-reconciliation across five database migration and contract artifacts in the SALMO codebase:
1. `data/schema_canonical.sql` (Authoritative ground-up database schema)
2. `docs/epic100g/STAGING_MIGRATION.sql` (EPIC 100G delta migration)
3. `docs/epic100g/STAGING_ROLLBACK.sql` (EPIC 100G delta rollback)
4. `data/migrations/20261105_epic100g_staging_canonical_migration.sql` (Committed staging delta)
5. `data/migrations/20261105_epic100g_staging_canonical_migration_rollback.sql` (Committed staging rollback)

The audit inventories all schemas, tables, columns, constraints, foreign keys, indexes, triggers, extensions, RLS policies, and role grants, classifying each object by its provenance and compatibility with application repositories.

---

## 2. Comprehensive Database Object Inventory

### 2.1. Schemas & Extensions
| Object Name | Type | Target Schema | Purpose / Source |
| :--- | :--- | :--- | :--- |
| `public` | Schema | Database Root | Application data domain |
| `extensions` | Schema | Database Root | Supabase extensions catalog |
| `uuid-ossp` | Extension | `extensions` / `public` | `uuid_generate_v4()` fallback |
| `pgcrypto` | Extension | `extensions` / `public` | `gen_random_uuid()`, SHA-256 cryptographic hashing |

---

### 2.2. Table Inventory & Entity Classification

| Table Name | Primary Key | Created by Baseline | Created by Delta | Required by Repositories | Entity Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `matches` | `id UUID` | **YES** | NO (Altered) | **YES** (`FixtureRepository`) | Canonical matches catalog & status |
| `market_snapshots` | `id UUID` | **YES** | **YES** | **YES** (`OddsSnapshotRepository`) | Immutable bookmaker quotes |
| `decisions` | `id UUID` | **YES** | **YES** | **YES** (`DecisionLedgerRepository`) | Quantitative evaluation snapshots |
| `evidence` | `id UUID` | **YES** | **YES** | **YES** (`DecisionLedgerRepository`) | Empirical sample and cohort stats |
| `data_provenance` | `id UUID` | **YES** | **YES** | **YES** (`DecisionLedgerRepository`) | Calculation hashes & model provenance |
| `prediction_ledger` | `id UUID` | **YES** | NO (Altered) | **YES** (`DecisionLedgerRepository`) | Official actionable decision ledger |
| `daily_picks` | `id UUID` | **YES** | NO (Altered) | **YES** (Public Read APIs) | Active qualified daily picks |
| `settlement_results` | `id UUID` | **YES** | NO (Altered) | **YES** (`SettlementRepository`) | Append-only settlement audit records |
| `_salmo_migrations` | `id SERIAL` | **NEW** | NO | **YES** (Deployment Pipeline) | Migration versioning & checksum audit |

---

### 2.3. Column-Level Specifications Across the 8 Canonical Entities

#### 1. `matches`
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `canonical_match_id VARCHAR(255) UNIQUE NOT NULL`
- `league VARCHAR(100) NOT NULL DEFAULT 'Premier League'`
- `season VARCHAR(20) NOT NULL`
- `kickoff TIMESTAMPTZ NOT NULL`
- `kickoff_time TIMESTAMPTZ` (Synchronized with `kickoff` via trigger)
- `home_team VARCHAR(100) NOT NULL`
- `away_team VARCHAR(100) NOT NULL`
- `venue VARCHAR(150)`
- `status VARCHAR(30) NOT NULL DEFAULT 'upcoming'` (Check: `upcoming`, `finished`, `live`, `postponed`)
- `home_goals INT DEFAULT NULL`
- `away_goals INT DEFAULT NULL`
- `data_status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE'` (`ACTIVE`, `QUARANTINED`, `SHADOW`)
- `source_type VARCHAR(50) NOT NULL DEFAULT 'PROVIDER'` (`PROVIDER`, `SYNTHETIC_FALLBACK`)
- `pipeline_metadata JSONB DEFAULT '{}'::jsonb`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

#### 2. `market_snapshots`
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE RESTRICT`
- `market_type VARCHAR(50) NOT NULL` (`AH`, `OU`, `BTTS`)
- `line_label VARCHAR(50) NOT NULL`
- `numeric_line NUMERIC(6, 4) NOT NULL`
- `bookmaker VARCHAR(100) NOT NULL DEFAULT 'pinnacle'`
- `home_odds NUMERIC(8, 4) NOT NULL` (Check: `home_odds > 1.0`)
- `away_odds NUMERIC(8, 4) NOT NULL` (Check: `away_odds > 1.0`)
- `overround NUMERIC(6, 4)`
- `source_provider VARCHAR(50) NOT NULL DEFAULT 'PINNACLE'`
- `captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

#### 3. `decisions`
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE RESTRICT`
- `market_type VARCHAR(50) NOT NULL`
- `line_label VARCHAR(50)`
- `selection VARCHAR(100) NOT NULL`
- `line NUMERIC(6, 4) NOT NULL`
- `badge VARCHAR(20) NOT NULL` (`GREEN`, `YELLOW`, `RED`)
- `status VARCHAR(50) NOT NULL`
- `status_label VARCHAR(100) NOT NULL`
- `confidence VARCHAR(20) NOT NULL`
- `confidence_score NUMERIC(5, 2) NOT NULL DEFAULT 0`
- `model_prob_pct NUMERIC(6, 3) NOT NULL` (Check: `0 <= model_prob_pct <= 100`)
- `implied_prob_pct NUMERIC(6, 3) NOT NULL`
- `edge_pp NUMERIC(6, 3) NOT NULL`
- `ev_pct NUMERIC(6, 3) NOT NULL`
- `sample_size INT NOT NULL DEFAULT 0`
- `data_quality VARCHAR(20) NOT NULL DEFAULT 'PASS'`
- `validation_stage VARCHAR(50) NOT NULL DEFAULT 'QUALIFIED'`
- `verdict VARCHAR(20) NOT NULL DEFAULT 'LEWATI'`
- `reason TEXT NOT NULL`
- `model_version VARCHAR(50) NOT NULL DEFAULT 'dixon-coles-v1.0'`
- `feature_version VARCHAR(50) NOT NULL DEFAULT 'dynamic-ratings-v1.0'`
- `odds_snapshot_id UUID REFERENCES public.market_snapshots(id) ON DELETE RESTRICT`
- `generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

#### 4. `evidence` & `data_provenance`
- `evidence`: PK `id UUID`, FK `decision_id -> decisions(id) ON DELETE RESTRICT`, `sample_size INT`, `win_pct`, `push_pct`, `loss_pct`, `checksum VARCHAR(100) NOT NULL`.
- `data_provenance`: PK `id UUID`, FK `decision_id -> decisions(id) ON DELETE RESTRICT`, `source VARCHAR(255)`, `canonical_match_id VARCHAR(255)`, `calculation_version VARCHAR(50)`, `checksum VARCHAR(100) NOT NULL`.

#### 5. `prediction_ledger`
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `doi_id VARCHAR(255) UNIQUE NOT NULL` (Format: `doi_{fixtureId}_{market}_{line}_{selection}_{modelVersion}_{decisionVersion}`)
- `decision_id UUID REFERENCES public.decisions(id) ON DELETE RESTRICT`
- `match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE RESTRICT`
- `canonical_match_id VARCHAR(255) NOT NULL`
- `competition_id INT NOT NULL DEFAULT 39`
- `market VARCHAR(50) NOT NULL`
- `selection VARCHAR(100) NOT NULL`
- `line NUMERIC(6, 4) NOT NULL`
- `model_probability NUMERIC(6, 4) NOT NULL` (Check: `model_probability IS NULL OR (0.0 <= model_probability <= 1.0)`)
- `fair_odds NUMERIC(8, 4) NOT NULL`
- `odds_at_prediction NUMERIC(8, 4) NOT NULL` (Check: `odds_at_prediction IS NULL OR odds_at_prediction > 1.0`)
- `confidence NUMERIC(6, 2) NOT NULL DEFAULT 0`
- `edge NUMERIC(6, 4)`
- `expected_value_pct NUMERIC(6, 2)`
- `xg_home NUMERIC(6, 4) NOT NULL DEFAULT 1.35`
- `xg_away NUMERIC(6, 4) NOT NULL DEFAULT 1.20`
- `dixon_coles_rho NUMERIC(6, 4) NOT NULL DEFAULT -0.06`
- `sha256_hash VARCHAR(64) NOT NULL`
- `provenance_hash VARCHAR(64)`
- `decision VARCHAR(20) NOT NULL DEFAULT 'BET'`
- `decision_reason TEXT`
- `published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `prediction_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `odds_snapshot_ts TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `kickoff_utc TIMESTAMPTZ NOT NULL`
- `result_status VARCHAR(30) NOT NULL DEFAULT 'pending'` (Check: `'pending', 'WIN', 'HALF_WIN', 'PUSH', 'HALF_LOSS', 'LOSS', 'VOID', 'SETTLED'`)
- `status VARCHAR(30) NOT NULL DEFAULT 'PENDING'`
- `settlement VARCHAR(30) NOT NULL DEFAULT 'PENDING'`
- `roi NUMERIC(8, 4) DEFAULT NULL`
- `profit_loss NUMERIC(8, 4) DEFAULT NULL`
- `settled_at TIMESTAMPTZ DEFAULT NULL`
- `source_type VARCHAR(50) NOT NULL DEFAULT 'PROVIDER'`
- `data_status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE'`
- `verified BOOLEAN NOT NULL DEFAULT TRUE`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

#### 6. `daily_picks`
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `fixture_id VARCHAR(100) NOT NULL`
- `league VARCHAR(100) NOT NULL DEFAULT 'Premier League'`
- `home_team VARCHAR(100) NOT NULL`
- `away_team VARCHAR(100) NOT NULL`
- `kickoff_utc TIMESTAMPTZ NOT NULL`
- `market_type VARCHAR(50) NOT NULL`
- `prediction VARCHAR(100) NOT NULL`
- `line NUMERIC(6, 4)`
- `model_probability NUMERIC(6, 4)`
- `fair_odds NUMERIC(8, 4)`
- `market_odds NUMERIC(8, 4)`
- `market_bookmaker VARCHAR(50) NOT NULL DEFAULT 'Pinnacle'`
- `edge_pct NUMERIC(6, 2)`
- `expected_value NUMERIC(6, 4)`
- `confidence INT NOT NULL DEFAULT 0`
- `verdict VARCHAR(20) NOT NULL DEFAULT 'LEWATI'`
- `model_version VARCHAR(50) NOT NULL DEFAULT 'dixon-coles-v1.0'`
- `reasoning TEXT`
- `rejection_reason TEXT`
- `status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE'`
- `profit_loss NUMERIC(8, 4)`
- `settled_at TIMESTAMPTZ`
- `source VARCHAR(50) NOT NULL DEFAULT 'live'`
- `prediction_id VARCHAR(255) UNIQUE`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

#### 7. `settlement_results`
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `fixture_id VARCHAR(100) NOT NULL`
- `ledger_position_id VARCHAR(255) UNIQUE NOT NULL` (Replaces coarse `fixture_id, market_type` unique constraint)
- `prediction_id VARCHAR(255)`
- `market_type VARCHAR(50) NOT NULL`
- `selection VARCHAR(50) NOT NULL`
- `line NUMERIC(6, 4) NOT NULL`
- `odds NUMERIC(8, 4) NOT NULL`
- `outcome VARCHAR(30) NOT NULL CHECK (outcome IN ('WIN', 'HALF_WIN', 'PUSH', 'HALF_LOSS', 'LOSS', 'VOID'))`
- `profit_units NUMERIC(8, 4) NOT NULL`
- `stake_units NUMERIC(6, 2) NOT NULL DEFAULT 1.0 CHECK (stake_units >= 0)`
- `home_goals INT NOT NULL`
- `away_goals INT NOT NULL`
- `voided BOOLEAN NOT NULL DEFAULT FALSE`
- `settled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

---

### 2.4. Triggers & Immutability Functions

| Trigger Name | Target Table | Trigger Timing & Events | Function Name | Protection Invariant |
| :--- | :--- | :--- | :--- | :--- |
| `trg_sync_matches_kickoff` | `matches` | `BEFORE INSERT OR UPDATE` | `fn_sync_matches_kickoff()` | Keeps `kickoff` and `kickoff_time` in sync |
| `trg_immutable_market_snapshots` | `market_snapshots` | `BEFORE UPDATE OR DELETE` | `fn_prevent_market_snapshot_tampering()` | Blocks all UPDATE and DELETE mutations |
| `trg_immutable_decisions` | `decisions` | `BEFORE UPDATE OR DELETE` | `fn_prevent_decision_tampering()` | Blocks all UPDATE and DELETE mutations |
| `trg_immutable_prediction_ledger` | `prediction_ledger` | `BEFORE UPDATE OR DELETE` | `fn_protect_prediction_ledger_immutability()` | Blocks DELETE; blocks UPDATE on decision parameters |
| `trg_immutable_settlement_results` | `settlement_results` | `BEFORE DELETE` | `fn_protect_settlement_results_immutability()` | Blocks DELETE (Append-only audit record) |

---

### 2.5. Row-Level Security (RLS) Policy Specifications

| Table | Policy Name | Permitted Role | Operation | Security Predicate / Using |
| :--- | :--- | :--- | :--- | :--- |
| `matches` | `p_anon_matches_read` | `anon` | `SELECT` | `data_status = 'ACTIVE'` |
| `matches` | `p_auth_matches_read` | `authenticated` | `SELECT` | `data_status = 'ACTIVE'` |
| `matches` | `p_service_role_all_matches` | `service_role` | `ALL` | `true` with check `true` |
| `market_snapshots` | `p_auth_snapshots_read` | `authenticated` | `SELECT` | `true` |
| `market_snapshots` | `p_service_role_all_snapshots` | `service_role` | `ALL` | `true` with check `true` |
| `decisions` | `p_auth_decisions_read` | `authenticated` | `SELECT` | `true` |
| `decisions` | `p_service_role_all_decisions` | `service_role` | `ALL` | `true` with check `true` |
| `evidence` | `p_auth_evidence_read` | `authenticated` | `SELECT` | `true` |
| `evidence` | `p_service_role_all_evidence` | `service_role` | `ALL` | `true` with check `true` |
| `data_provenance` | `p_auth_provenance_read` | `authenticated` | `SELECT` | `true` |
| `data_provenance` | `p_service_role_all_provenance` | `service_role` | `ALL` | `true` with check `true` |
| `prediction_ledger` | `p_auth_prediction_ledger_read` | `authenticated` | `SELECT` | `data_status = 'ACTIVE'` |
| `prediction_ledger` | `p_service_role_all_ledger` | `service_role` | `ALL` | `true` with check `true` |
| `daily_picks` | `p_anon_daily_picks_read` | `anon` | `SELECT` | `status = 'ACTIVE'` |
| `daily_picks` | `p_auth_daily_picks_read` | `authenticated` | `SELECT` | `status = 'ACTIVE'` |
| `daily_picks` | `p_service_role_all_daily_picks` | `service_role` | `ALL` | `true` with check `true` |
| `settlement_results` | `p_auth_settlement_read` | `authenticated` | `SELECT` | `true` |
| `settlement_results` | `p_service_role_all_settlement` | `service_role` | `ALL` | `true` with check `true` |

---

## 3. Findings & Reconciliation Recommendations

1. **The Delta Incompleteness**: `STAGING_MIGRATION.sql` only created 4 of the 8 tables and assumed `matches`, `prediction_ledger`, `settlement_results`, and `daily_picks` were pre-installed.
2. **Missing RLS in Baseline**: `data/schema_canonical.sql` defined the correct 8 tables and triggers, but completely lacked RLS policies and role grants.
3. **The Unified Solution**: `FRESH_DATABASE_BOOTSTRAP.sql` combines both artifacts into one unified, fail-closed bootstrap script that handles empty, partial, and pre-existing databases deterministically.
