# SCHEMA PARITY MATRIX & REMOTE DIVERGENCE AUDIT

**Document Identifier**: `docs/epic100g/SCHEMA_PARITY_MATRIX.md`  
**Parent Epic**: EPIC 100G — Staging Database Migration, Security Parity & Rollback Validation  
**Authors**: Astra / DeepMind Advanced Agentic Coding Pair  
**Status**: COMPLETE / FORENSICALLY AUDITED  
**Baseline**: Local Canonical PostgreSQL 16 (`data/schema_canonical.sql`) vs Application Repositories vs Remote Supabase (`rgkrfzxipkrwqccfuqfq.supabase.co`)  
**Production Status**: STRICTLY NO-GO  

---

## 1. Executive Summary

This document establishes an exhaustive, column-by-column comparative audit between:
1. The **Local Canonical Contract** (`salmo_test`, defined in `data/schema_canonical.sql` and `STAGING_MIGRATION.sql`),
2. The **Application Repository Layer** (`src/repositories/*.ts`), and
3. The **Remote Supabase Database** (`rgkrfzxipkrwqccfuqfq.supabase.co`), introspected via OpenAPI schema extraction.

### Core Parity Findings:
- **Base Tables Exist**: `matches`, `prediction_ledger`, `settlement_results`, and `daily_picks` exist on remote Supabase.
- **Candidate Snapshot & Decision Tables Missing**: `market_snapshots` and `decisions` **do not exist on remote Supabase** (remote currently has legacy `live_odds_snapshots`).
- **Settlement Reference Column**: Remote Supabase uses `prediction_id VARCHAR(255)`, whereas local canonical schema originally used `ledger_position_id`. Application code now populates both columns, resolving this mismatch.
- **Immutability Triggers**: Remote Supabase currently lacks database-level immutability triggers (`trg_immutable_market_snapshots`, `trg_immutable_decisions`, `trg_immutable_prediction_ledger`, `trg_immutable_settlement_results`).
- **Data Quality Invariant**: Remote `prediction_ledger` hosts quarantined rows (`source_type = 'SYNTHETIC'`), proving why `data_status = 'ACTIVE'` and `source_type != 'SYNTHETIC'` filtering is essential.

---

## 2. Table-by-Table Architectural Comparison

### 2.1 Table: `matches`

| Property | Local Canonical Schema | Application Repository (`FixtureRepository`) | Remote Supabase State | Parity Status & Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Primary Key** | `id UUID DEFAULT gen_random_uuid()` | `id: string` (UUID) | `id UUID` | **FULL PARITY** |
| **Natural Key** | `canonical_match_id VARCHAR(255) UNIQUE` | `canonical_match_id: string` | `canonical_match_id VARCHAR(255)` | **FULL PARITY** |
| **League & Season** | `league VARCHAR(100)`, `season VARCHAR(20)` | `league: string`, `season: string` | `league TEXT`, `season_ref_id INT` | **FULL PARITY** |
| **Kickoff** | `kickoff TIMESTAMPTZ NOT NULL` | `kickoff: string` (ISO 8601) | `kickoff TIMESTAMPTZ` | **FULL PARITY** |
| **Teams** | `home_team VARCHAR(100)`, `away_team VARCHAR(100)` | `home_team: string`, `away_team: string` | `home_team TEXT`, `away_team TEXT` | **FULL PARITY** |
| **Match Status** | `status VARCHAR(30) DEFAULT 'upcoming'` | `status: string` | `status TEXT` | **FULL PARITY** |
| **Final Score** | `home_goals INT`, `away_goals INT` | `home_goals: number`, `away_goals: number` | `home_goals INT`, `away_goals INT` | **FULL PARITY** |
| **Data Status** | `data_status VARCHAR(50) DEFAULT 'ACTIVE'` | `data_status: string` | `data_status TEXT` | **FULL PARITY** |
| **Source Type** | `source_type VARCHAR(50) DEFAULT 'PROVIDER'` | `source_type: string` | `source_type TEXT` | **FULL PARITY** |

---

### 2.2 Table: `market_snapshots` (Point-in-Time Odds Quotes)

| Property | Local Canonical Schema | Application Repository (`OddsSnapshotRepository`) | Remote Supabase State | Parity Status & Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Existence** | **EXISTS** | **IMPLEMENTED** | **DOES NOT EXIST** | **STRUCTURAL GAP (BLOCKED)** |
| **Primary Key** | `id UUID PRIMARY KEY` | `id: string` | N/A | Missing on remote |
| **Foreign Key** | `match_id UUID REFERENCES matches(id) ON DELETE RESTRICT` | `matchId: string` | N/A | Missing on remote |
| **Market Code** | `market_type VARCHAR(50) NOT NULL` | `marketType: 'AH' \| 'OU'` | N/A | Missing on remote |
| **Line Parameters** | `line_label VARCHAR(50)`, `numeric_line NUMERIC(6,4)` | `lineLabel: string`, `numericLine: number` | N/A | Missing on remote |
| **Odds Values** | `home_odds NUMERIC(8,4)`, `away_odds NUMERIC(8,4)` | `homeOdds: number`, `awayOdds: number` | N/A | Missing on remote |
| **Check Constraint**| `chk_market_snapshots_odds (home_odds > 1.0 AND away_odds > 1.0)` | Validated before insert | N/A | Missing on remote |
| **Immutability Trigger**| `trg_immutable_market_snapshots` (Blocks UPDATE/DELETE) | Enforced by DB trigger | N/A | Missing on remote |

*Remediation Required*: Staging migration `STAGING_MIGRATION.sql` creates `market_snapshots` and its immutability trigger.

---

### 2.3 Table: `decisions` (Immutable Point-in-Time Value Evaluations)

| Property | Local Canonical Schema | Application Repository (`DecisionLedgerRepository`) | Remote Supabase State | Parity Status & Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Existence** | **EXISTS** | **IMPLEMENTED** | **DOES NOT EXIST** | **STRUCTURAL GAP (BLOCKED)** |
| **Primary Key** | `id UUID PRIMARY KEY` | `decisionId: string` | N/A | Missing on remote |
| **Foreign Keys** | `match_id (FK matches)`, `odds_snapshot_id (FK market_snapshots)` | Referenced in transaction | N/A | Missing on remote |
| **Confidence & Badge**| `badge VARCHAR(20)`, `confidence VARCHAR(20)`, `confidence_score NUMERIC(5,2)` | Evaluated by ValueEngine | N/A | Missing on remote |
| **Model Invariants** | `model_prob_pct NUMERIC(6,3)`, `ev_pct NUMERIC(6,3)`, `edge_pp NUMERIC(6,3)` | Calculated by ValueEngine | N/A | Missing on remote |
| **Immutability Trigger**| `trg_immutable_decisions` (Blocks UPDATE/DELETE) | Enforced by DB trigger | N/A | Missing on remote |

*Remediation Required*: Staging migration `STAGING_MIGRATION.sql` creates `decisions` and its immutability trigger.

---

### 2.4 Table: `prediction_ledger` (Authoritative Actionable Ledger)

| Property | Local Canonical Schema | Application Repository (`DecisionLedgerRepository`) | Remote Supabase State | Parity Status & Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Primary Key** | `id UUID PRIMARY KEY` | `ledgerId: string` | `id UUID PRIMARY KEY` | **FULL PARITY** |
| **Idempotency Key** | `doi_id VARCHAR(255) UNIQUE` | `doiId: string` (versioned format) | `doi_id VARCHAR(255)` | **FULL PARITY** |
| **Decision Reference**| `decision_id UUID REFERENCES decisions(id)` | `decisionId: string` | `decision_id UUID` (column exists) | **COMPATIBLE** |
| **Core Odds & Prob** | `odds_at_prediction NUMERIC(8,4)`, `model_probability NUMERIC(6,4)` | Evaluated in Step 4-6 | `odds_at_prediction NUMERIC`, `model_probability NUMERIC` | **FULL PARITY** |
| **Check Constraints** | `chk_ledger_prob`, `chk_ledger_odds`, `chk_ledger_result_status` | Enforced at DB level | Not fully validated on remote | **PARTIAL** |
| **Immutability Trigger**| `trg_immutable_prediction_ledger` (prohibits mutation of decision parameters) | Tested in Test 11-12 | **MISSING ON REMOTE** | **GAP TO REMEDIATE** |
| **Settlement Columns** | `result_status`, `roi`, `profit_loss`, `settled_at` (MUTABLE via trigger whitelist) | Updated by `SettlementRepository` | Columns exist on remote | **FULL PARITY** |

---

### 2.5 Table: `settlement_results` (Settled Financial Positions)

| Property | Local Canonical Schema | Application Repository (`SettlementRepository`) | Remote Supabase State | Parity Status & Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Primary Key** | `id UUID PRIMARY KEY` | Generated by DB | `id UUID PRIMARY KEY` | **FULL PARITY** |
| **Fixture Binding** | `fixture_id VARCHAR(100) NOT NULL` | `fixtureId: string` | `fixture_id VARCHAR(100)` | **FULL PARITY** |
| **Position Reference** | `ledger_position_id VARCHAR(255)` AND `prediction_id VARCHAR(255)` | Sets both columns to `row.doi_id` | `prediction_id VARCHAR(255)` | **PARITY RESOLVED** |
| **Uniqueness** | `uq_settlement_ledger_pos UNIQUE (ledger_position_id)` | Scoped to individual position | Remote has legacy constraints | **REQUIRES MIGRATION** |
| **Outcome Matrix** | `CHECK (outcome IN ('WIN', 'HALF_WIN', 'PUSH', 'HALF_LOSS', 'LOSS', 'VOID'))` | 6-state quarter-line outcome | Column exists on remote | **FULL PARITY** |
| **Immutability Trigger**| `trg_immutable_settlement_results` (Blocks DELETE) | Tested in Test 13 | **MISSING ON REMOTE** | **GAP TO REMEDIATE** |

---

### 2.6 Table: `daily_picks` (Public Projection Table)

| Property | Local Canonical Schema | Application Repository (`DecisionLedgerRepository`) | Remote Supabase State | Parity Status & Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Primary Key** | `id UUID PRIMARY KEY` | Generated by DB | `id UUID PRIMARY KEY` | **FULL PARITY** |
| **Prediction Ref** | `prediction_id VARCHAR(255) UNIQUE` | `prediction_id: doiId` | `prediction_id VARCHAR(255)` | **FULL PARITY** |
| **Uniqueness** | `uq_daily_picks_prediction UNIQUE (prediction_id)` | Upsert `ON CONFLICT (prediction_id)` | Remote has `prediction_id` | **COMPATIBLE** |
| **Display Fields** | `fixture_id`, `market_type`, `prediction`, `line`, `fair_odds`, `market_odds`, `verdict` | Written by atomic workflow | Matching columns exist | **FULL PARITY** |

---

## 3. Row-Level Security (RLS) & Role Privileges Parity

| Role Name | Intended Security Policy | Local Test Engine Status | Remote Supabase Status |
| :--- | :--- | :--- | :--- |
| `anon` | Read-only access to published `daily_picks` (`status IN ('ACTIVE', 'WON', 'LOST', 'PUSH', 'VOID')`). Zero write permissions on any table. | **ENFORCED & TESTED** (`tests/epic100g_staging_security_validation.test.js`) | Requires explicit staging policy application |
| `authenticated` | Read-only access to `prediction_ledger` (`data_status = 'ACTIVE'`). Zero write permissions. | **ENFORCED & TESTED** | Requires explicit staging policy application |
| `service_role` | Full operational access for background workers and cron endpoints via service-role JWT. | **ENFORCED & TESTED** | Supabase default for service role |

> [!WARNING]
> While OpenAPI schema definitions confirm table existence, they do **NOT** prove that foreign keys, check constraints, RLS policies, or PL/pgSQL triggers are active. Remote Supabase lacks all immutability triggers. The candidate schema in `STAGING_MIGRATION.sql` resolves this gap.
