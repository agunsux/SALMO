# EPIC 100E — PRODUCTION SCHEMA PARITY & MIGRATION SPECIFICATION

**Scope**: Comprehensive comparison between local PostgreSQL 16 schema and production target requirements.  
**Forward DDL**: `data/schema_canonical.sql`  
**Rollback DDL**: `data/schema_canonical_rollback.sql`  
**Production Status**: NO-GO (Strictly Local Validation; Remote migration blocked).  

---

## 1. Schema Parity Comparison

| Local Schema (PostgreSQL 16) | Remote Production Schema | Parity Status | Parity Notes / Remediation |
| :--- | :--- | :--- | :--- |
| `public.matches` (UUID PK, `canonical_match_id` unique, `kickoff` TIMESTAMPTZ) | Remote matches table (mixed UUID and text PKs in older legacy scripts) | **COMPATIBLE** | Supported via backward-compatibility triggers (`trg_sync_matches_kickoff`) keeping `kickoff` and `kickoff_time` synchronized. |
| `public.market_snapshots` (UUID PK, FK to `matches(id)`, immutable) | Remote odds table lacked immutability triggers and FK | **UPGRADE READY** | Triggers and FKs validated locally. Safe forward migration. |
| `public.decisions` (UUID PK, FK to `matches(id)`, immutable) | Remote decisions table lacked `selection`, `line`, and immutability triggers | **UPGRADE READY** | Added missing columns and immutability trigger without dropping existing rows. |
| `public.evidence` (UUID PK, FK to `decisions(id)`) | Remote evidence was unconstrained | **UPGRADE READY** | Canonical schema adds FK `ON DELETE RESTRICT`. |
| `public.data_provenance` (UUID PK, FK to `decisions(id)`) | Remote data_provenance was unconstrained | **UPGRADE READY** | Canonical schema adds FK `ON DELETE RESTRICT`. |
| `public.prediction_ledger` (UUID PK, unique `doi_id`, FKs to `matches` and `decisions`) | Remote prediction_ledger lacked `confidence`, `expected_value_pct`, and immutability triggers | **UPGRADE READY** | Added missing columns and trigger `trg_immutable_prediction_ledger`. Existing rows remain valid. |
| `public.daily_picks` (UUID PK, unique `(fixture_id, market_type, source)`) | Remote daily_picks table lacked `prediction_id` and `profit_loss` | **UPGRADE READY** | `ALTER TABLE` adds missing projection columns safely. |
| `public.settlement_results` (UUID PK, unique `(fixture_id, market_type)`, immutable) | Did not exist or was unstructured | **UPGRADE READY** | Created append-only settlement table with delete-prevention trigger. |

---

## 2. Table-by-Table Technical Specification

### 2.1 `public.matches`
- **Primary Key**: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- **Unique Constraint**: `uq_canonical_match_id UNIQUE (canonical_match_id)`
- **Columns**: `canonical_match_id`, `season`, `kickoff`, `kickoff_time`, `home_team`, `away_team`, `league`, `status`, `home_goals`, `away_goals`, `source_type`, `data_status`, `pipeline_metadata`, `created_at`, `updated_at`.
- **Triggers**: `trg_sync_matches_kickoff` synchronizes `kickoff` and `kickoff_time` bi-directionally.

### 2.2 `public.market_snapshots`
- **Primary Key**: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- **Foreign Key**: `FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE RESTRICT`
- **Check Constraints**: `chk_snapshots_odds CHECK (home_odds > 1.0 AND away_odds > 1.0)`
- **Triggers**: `trg_immutable_market_snapshots` blocks `UPDATE` and `DELETE`.

### 2.3 `public.decisions`
- **Primary Key**: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- **Foreign Keys**: 
  - `FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE RESTRICT`
  - `FOREIGN KEY (odds_snapshot_id) REFERENCES public.market_snapshots(id) ON DELETE RESTRICT`
- **Check Constraints**: `chk_decisions_prob CHECK (model_prob_pct >= 0 AND model_prob_pct <= 100)`
- **Triggers**: `trg_immutable_decisions` blocks `UPDATE` and `DELETE`.

### 2.4 `public.evidence` & `public.data_provenance`
- **Primary Key**: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- **Foreign Keys**: `FOREIGN KEY (decision_id) REFERENCES public.decisions(id) ON DELETE RESTRICT`

### 2.5 `public.prediction_ledger`
- **Primary Key**: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- **Unique Constraint**: `uq_prediction_ledger_doi UNIQUE (doi_id)`
- **Foreign Keys**:
  - `FOREIGN KEY (decision_id) REFERENCES public.decisions(id) ON DELETE RESTRICT`
  - `FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE RESTRICT`
- **Check Constraints**:
  - `chk_ledger_prob CHECK (model_probability IS NULL OR (model_probability >= 0.0 AND model_probability <= 1.0))`
  - `chk_ledger_odds CHECK (odds_at_prediction IS NULL OR odds_at_prediction > 1.0)`
  - `chk_ledger_result_status CHECK (result_status IN ('pending', 'WIN', 'HALF_WIN', 'PUSH', 'HALF_LOSS', 'LOSS', 'VOID', 'SETTLED'))`
- **Triggers**: `trg_immutable_prediction_ledger` blocks deletion and blocks modification of decision parameters (odds, probabilities, lines, selection, timestamps).

### 2.6 `public.daily_picks`
- **Primary Key**: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- **Unique Constraint**: `uq_daily_picks_fixture_market_source UNIQUE (fixture_id, market_type, source)`

### 2.7 `public.settlement_results`
- **Primary Key**: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- **Unique Constraint**: `uq_settlement_fixture_market UNIQUE (fixture_id, market_type)`
- **Triggers**: `trg_immutable_settlement_results` blocks `DELETE`.

---

## 3. Migration Rollback Triggers & Safety Boundaries

### Concrete Rollback Triggers (If Applied in Production in Future)
If a future authorized production deployment encounters any of the following, execute immediate rollback via `data/schema_canonical_rollback.sql`:
1. **Foreign Key Violation Storm**: Active ingestion pipelines inserting fixtures with missing parent records.
2. **Immutability Exception Spikes**: Legacy services attempting to issue `UPDATE` against historical odds snapshots.
3. **Application Downtime / HTTP 500 Spikes**: Connection pool exhaustion or query timeouts.

### Current Production Recommendation: NO-GO
While the schema is technically ready and 100% verified locally, production deployment remains **STRICTLY NO-GO** until:
1. Production database roles are provisioned according to the `DATABASE_PERMISSION_MATRIX.md`.
2. Supabase production environment variables and service-role keys are audited.
3. Explicit administrative sign-off is granted by system stakeholders.
