-- =============================================================================
-- FRESH_DATABASE_BOOTSTRAP.sql
-- SALMO EPIC 100G.3: Unified Deterministic Database Bootstrap & Contract
-- Target: Staging Supabase / Local PostgreSQL 16
-- Properties: Deterministic, Idempotent, Fail-Closed on Schema Incompatibility,
--             Least-Privilege RLS Enforced, Fully Transactional.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. PREREQUISITES & EXTENSIONS
-- =============================================================================
DO $$
DECLARE
  v_version TEXT;
  v_num INT;
BEGIN
  SELECT version() INTO v_version;
  RAISE NOTICE 'Executing SALMO Bootstrap on engine: %', v_version;

  SELECT current_setting('server_version_num')::INT INTO v_num;
  IF v_num < 150000 THEN
    RAISE EXCEPTION 'FATAL PREREQUISITE: PostgreSQL version must be >= 15.0. Found version num: %', v_num;
  END IF;
END $$;

-- Enable cryptographic UUID and hashing extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- 2. MIGRATION VERSIONING INFRASTRUCTURE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public._salmo_migrations (
    id SERIAL PRIMARY KEY,
    version VARCHAR(100) UNIQUE NOT NULL,
    description TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    checksum VARCHAR(64) NOT NULL,
    applied_by TEXT NOT NULL DEFAULT CURRENT_USER
);

-- =============================================================================
-- 3. CANONICAL BASELINE & RECONCILED TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 3.1 TABLE: matches
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'matches') THEN
    -- Incompatibility check: canonical_match_id must be character type
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'matches' 
        AND column_name = 'canonical_match_id'
        AND data_type NOT IN ('character varying', 'text')
    ) THEN
      RAISE EXCEPTION 'INCOMPATIBLE_SCHEMA: Column public.matches.canonical_match_id is present but has incompatible data type.';
    END IF;
  ELSE
    CREATE TABLE public.matches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        canonical_match_id VARCHAR(255) UNIQUE NOT NULL,
        league VARCHAR(100) NOT NULL DEFAULT 'Premier League',
        season VARCHAR(20) NOT NULL,
        kickoff TIMESTAMPTZ NOT NULL,
        kickoff_time TIMESTAMPTZ,
        home_team VARCHAR(100) NOT NULL,
        away_team VARCHAR(100) NOT NULL,
        venue VARCHAR(150),
        status VARCHAR(30) NOT NULL DEFAULT 'upcoming',
        home_goals INT,
        away_goals INT,
        data_status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
        source_type VARCHAR(50) NOT NULL DEFAULT 'PROVIDER',
        pipeline_metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  END IF;
END $$;

-- Reconcile columns if table pre-existed
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS kickoff TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kickoff_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(50) NOT NULL DEFAULT 'PROVIDER',
  ADD COLUMN IF NOT EXISTS pipeline_metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Relax strict NOT NULL on legacy kickoff if needed for synchronizer trigger
ALTER TABLE public.matches ALTER COLUMN kickoff_time DROP NOT NULL;
ALTER TABLE public.matches ALTER COLUMN kickoff DROP NOT NULL;

-- Kickoff synchronization trigger function
CREATE OR REPLACE FUNCTION public.fn_sync_matches_kickoff()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.kickoff IS NULL AND NEW.kickoff_time IS NOT NULL THEN
    NEW.kickoff = NEW.kickoff_time;
  ELSIF NEW.kickoff_time IS NULL AND NEW.kickoff IS NOT NULL THEN
    NEW.kickoff_time = NEW.kickoff;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_matches_kickoff ON public.matches;
CREATE TRIGGER trg_sync_matches_kickoff
  BEFORE INSERT OR UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_matches_kickoff();

-- -----------------------------------------------------------------------------
-- 3.2 TABLE: market_snapshots (Immutable bookmaker odds quotes)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'market_snapshots') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'market_snapshots' 
        AND column_name = 'home_odds'
        AND data_type NOT IN ('numeric', 'double precision', 'real')
    ) THEN
      RAISE EXCEPTION 'INCOMPATIBLE_SCHEMA: Column public.market_snapshots.home_odds has incompatible type.';
    END IF;
  ELSE
    CREATE TABLE public.market_snapshots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE RESTRICT,
        market_type VARCHAR(50) NOT NULL,
        line_label VARCHAR(50) NOT NULL,
        numeric_line NUMERIC(6, 4) NOT NULL,
        bookmaker VARCHAR(100) NOT NULL DEFAULT 'pinnacle',
        home_odds NUMERIC(8, 4) NOT NULL,
        away_odds NUMERIC(8, 4) NOT NULL,
        overround NUMERIC(6, 4),
        source_provider VARCHAR(50) NOT NULL DEFAULT 'PINNACLE',
        captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  END IF;
END $$;

-- Verify Foreign Key on market_snapshots
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'market_snapshots_match_id_fkey' AND table_name = 'market_snapshots'
  ) THEN
    ALTER TABLE public.market_snapshots
      ADD CONSTRAINT market_snapshots_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Odds sanity constraint
ALTER TABLE public.market_snapshots
  DROP CONSTRAINT IF EXISTS chk_market_snapshots_odds;
ALTER TABLE public.market_snapshots
  ADD CONSTRAINT chk_market_snapshots_odds CHECK (home_odds > 1.0 AND away_odds > 1.0);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_market_snapshots_match_market ON public.market_snapshots(match_id, market_type);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_captured_at ON public.market_snapshots(captured_at);

-- Immutability trigger for market_snapshots
CREATE OR REPLACE FUNCTION public.fn_prevent_market_snapshot_tampering()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'market_snapshots are immutable; updates and deletes are prohibited';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_market_snapshots ON public.market_snapshots;
CREATE TRIGGER trg_immutable_market_snapshots
  BEFORE UPDATE OR DELETE ON public.market_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_market_snapshot_tampering();

-- -----------------------------------------------------------------------------
-- 3.3 TABLE: decisions (Immutable quantitative evaluations)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'decisions') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'decisions' 
        AND column_name = 'model_prob_pct'
        AND data_type NOT IN ('numeric', 'double precision', 'real')
    ) THEN
      RAISE EXCEPTION 'INCOMPATIBLE_SCHEMA: Column public.decisions.model_prob_pct has incompatible type.';
    END IF;
  ELSE
    CREATE TABLE public.decisions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE RESTRICT,
        market_type VARCHAR(50) NOT NULL,
        line_label VARCHAR(50),
        selection VARCHAR(100) NOT NULL,
        line NUMERIC(6, 4) NOT NULL,
        badge VARCHAR(20) NOT NULL,
        status VARCHAR(50) NOT NULL,
        status_label VARCHAR(100) NOT NULL,
        confidence VARCHAR(20) NOT NULL,
        confidence_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
        model_prob_pct NUMERIC(6, 3) NOT NULL,
        implied_prob_pct NUMERIC(6, 3) NOT NULL,
        edge_pp NUMERIC(6, 3) NOT NULL,
        ev_pct NUMERIC(6, 3) NOT NULL,
        sample_size INT NOT NULL DEFAULT 0,
        data_quality VARCHAR(20) NOT NULL DEFAULT 'PASS',
        validation_stage VARCHAR(50) NOT NULL DEFAULT 'QUALIFIED',
        verdict VARCHAR(20) NOT NULL DEFAULT 'LEWATI',
        reason TEXT NOT NULL,
        model_version VARCHAR(50) NOT NULL DEFAULT 'dixon-coles-v1.0',
        feature_version VARCHAR(50) NOT NULL DEFAULT 'dynamic-ratings-v1.0',
        odds_snapshot_id UUID REFERENCES public.market_snapshots(id) ON DELETE RESTRICT,
        generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  END IF;
END $$;

-- Foreign Keys on decisions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'decisions_match_id_fkey' AND table_name = 'decisions'
  ) THEN
    ALTER TABLE public.decisions
      ADD CONSTRAINT decisions_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'decisions_odds_snapshot_id_fkey' AND table_name = 'decisions'
  ) THEN
    ALTER TABLE public.decisions
      ADD CONSTRAINT decisions_odds_snapshot_id_fkey FOREIGN KEY (odds_snapshot_id) REFERENCES public.market_snapshots(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Check constraint on decision probability
ALTER TABLE public.decisions
  DROP CONSTRAINT IF EXISTS chk_decisions_prob;
ALTER TABLE public.decisions
  ADD CONSTRAINT chk_decisions_prob CHECK (model_prob_pct >= 0 AND model_prob_pct <= 100);

-- Immutability trigger for decisions
CREATE OR REPLACE FUNCTION public.fn_prevent_decision_tampering()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'decisions are immutable historical records; updates and deletes are prohibited';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_decisions ON public.decisions;
CREATE TRIGGER trg_immutable_decisions
  BEFORE UPDATE OR DELETE ON public.decisions
  FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_decision_tampering();

-- -----------------------------------------------------------------------------
-- 3.4 TABLES: evidence & data_provenance
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    decision_id UUID NOT NULL REFERENCES public.decisions(id) ON DELETE RESTRICT,
    sample_size INT NOT NULL,
    win_pct NUMERIC(5, 2),
    half_win_pct NUMERIC(5, 2),
    push_pct NUMERIC(5, 2),
    half_loss_pct NUMERIC(5, 2),
    loss_pct NUMERIC(5, 2),
    date_range_start DATE,
    date_range_end DATE,
    checksum VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.data_provenance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    decision_id UUID NOT NULL REFERENCES public.decisions(id) ON DELETE RESTRICT,
    source VARCHAR(255) NOT NULL,
    source_version VARCHAR(50) NOT NULL,
    dataset_version VARCHAR(50) NOT NULL,
    canonical_match_id VARCHAR(255) NOT NULL,
    calculation_version VARCHAR(50) NOT NULL,
    settlement_methodology VARCHAR(100) NOT NULL,
    validation_stage VARCHAR(50) NOT NULL,
    checksum VARCHAR(100) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3.5 TABLE: prediction_ledger (Authoritative Actionable Ledger)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'prediction_ledger') THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'prediction_ledger' 
        AND column_name = 'doi_id'
        AND data_type NOT IN ('character varying', 'text')
    ) THEN
      RAISE EXCEPTION 'INCOMPATIBLE_SCHEMA: Column public.prediction_ledger.doi_id has incompatible type.';
    END IF;
  ELSE
    CREATE TABLE public.prediction_ledger (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        doi_id VARCHAR(255) UNIQUE NOT NULL,
        decision_id UUID REFERENCES public.decisions(id) ON DELETE RESTRICT,
        match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE RESTRICT,
        canonical_match_id VARCHAR(255) NOT NULL,
        competition_id INT NOT NULL DEFAULT 39,
        market VARCHAR(50) NOT NULL,
        selection VARCHAR(100) NOT NULL,
        line NUMERIC(6, 4) NOT NULL,
        model_probability NUMERIC(6, 4) NOT NULL,
        fair_odds NUMERIC(8, 4) NOT NULL,
        odds_at_prediction NUMERIC(8, 4) NOT NULL,
        confidence NUMERIC(6, 2) NOT NULL DEFAULT 0,
        edge NUMERIC(6, 4),
        expected_value_pct NUMERIC(6, 2),
        xg_home NUMERIC(6, 4) NOT NULL DEFAULT 1.35,
        xg_away NUMERIC(6, 4) NOT NULL DEFAULT 1.20,
        dixon_coles_rho NUMERIC(6, 4) NOT NULL DEFAULT -0.06,
        sha256_hash VARCHAR(64) NOT NULL,
        provenance_hash VARCHAR(64),
        decision VARCHAR(20) NOT NULL DEFAULT 'BET',
        decision_reason TEXT,
        published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        prediction_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        odds_snapshot_ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        kickoff_utc TIMESTAMPTZ NOT NULL,
        result_status VARCHAR(30) NOT NULL DEFAULT 'pending',
        status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
        settlement VARCHAR(30) NOT NULL DEFAULT 'PENDING',
        roi NUMERIC(8, 4) DEFAULT NULL,
        profit_loss NUMERIC(8, 4) DEFAULT NULL,
        settled_at TIMESTAMPTZ DEFAULT NULL,
        source_type VARCHAR(50) NOT NULL DEFAULT 'PROVIDER',
        data_status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
        verified BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  END IF;
END $$;

-- Reconcile columns on prediction_ledger
ALTER TABLE public.prediction_ledger
  ADD COLUMN IF NOT EXISTS doi_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS decision_id UUID REFERENCES public.decisions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS match_id UUID REFERENCES public.matches(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS competition_id INT DEFAULT 39,
  ADD COLUMN IF NOT EXISTS odds_at_prediction NUMERIC(8, 4),
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(6, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expected_value_pct NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS xg_home NUMERIC(6, 4) DEFAULT 1.35,
  ADD COLUMN IF NOT EXISTS xg_away NUMERIC(6, 4) DEFAULT 1.20,
  ADD COLUMN IF NOT EXISTS dixon_coles_rho NUMERIC(6, 4) DEFAULT -0.06,
  ADD COLUMN IF NOT EXISTS sha256_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS decision VARCHAR(20) DEFAULT 'BET',
  ADD COLUMN IF NOT EXISTS decision_reason TEXT,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS odds_snapshot_ts TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS kickoff_utc TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS result_status VARCHAR(30) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS roi NUMERIC(8, 4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(50) DEFAULT 'PROVIDER',
  ADD COLUMN IF NOT EXISTS data_status VARCHAR(50) DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_prediction_ledger_doi ON public.prediction_ledger(doi_id);

-- Check constraints on prediction_ledger
ALTER TABLE public.prediction_ledger
  DROP CONSTRAINT IF EXISTS chk_ledger_prob;
ALTER TABLE public.prediction_ledger
  ADD CONSTRAINT chk_ledger_prob CHECK (model_probability IS NULL OR (model_probability >= 0.0 AND model_probability <= 1.0));

ALTER TABLE public.prediction_ledger
  DROP CONSTRAINT IF EXISTS chk_ledger_odds;
ALTER TABLE public.prediction_ledger
  ADD CONSTRAINT chk_ledger_odds CHECK (odds_at_prediction IS NULL OR odds_at_prediction > 1.0);

ALTER TABLE public.prediction_ledger
  DROP CONSTRAINT IF EXISTS chk_ledger_result_status;
ALTER TABLE public.prediction_ledger
  ADD CONSTRAINT chk_ledger_result_status CHECK (result_status IN ('pending', 'WIN', 'HALF_WIN', 'PUSH', 'HALF_LOSS', 'LOSS', 'VOID', 'SETTLED'));

-- Immutability trigger for prediction_ledger
CREATE OR REPLACE FUNCTION public.fn_protect_prediction_ledger_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Historical prediction_ledger records cannot be deleted';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.doi_id IS DISTINCT FROM OLD.doi_id OR
       NEW.match_id IS DISTINCT FROM OLD.match_id OR
       NEW.market IS DISTINCT FROM OLD.market OR
       NEW.selection IS DISTINCT FROM OLD.selection OR
       NEW.line IS DISTINCT FROM OLD.line OR
       NEW.model_probability IS DISTINCT FROM OLD.model_probability OR
       NEW.fair_odds IS DISTINCT FROM OLD.fair_odds OR
       NEW.odds_at_prediction IS DISTINCT FROM OLD.odds_at_prediction OR
       NEW.published_at IS DISTINCT FROM OLD.published_at OR
       NEW.sha256_hash IS DISTINCT FROM OLD.sha256_hash OR
       NEW.provenance_hash IS DISTINCT FROM OLD.provenance_hash THEN
      RAISE EXCEPTION 'prediction_ledger immutable decision parameters (odds, probabilities, lines, selection, timestamps) cannot be modified';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_prediction_ledger ON public.prediction_ledger;
CREATE TRIGGER trg_immutable_prediction_ledger
  BEFORE UPDATE OR DELETE ON public.prediction_ledger
  FOR EACH ROW EXECUTE FUNCTION public.fn_protect_prediction_ledger_immutability();

-- -----------------------------------------------------------------------------
-- 3.6 TABLE: daily_picks (Public-Facing Qualified Daily Signals)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_picks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fixture_id VARCHAR(100) NOT NULL,
    league VARCHAR(100) NOT NULL DEFAULT 'Premier League',
    home_team VARCHAR(100) NOT NULL,
    away_team VARCHAR(100) NOT NULL,
    kickoff_utc TIMESTAMPTZ NOT NULL,
    market_type VARCHAR(50) NOT NULL,
    prediction VARCHAR(100) NOT NULL,
    line NUMERIC(6, 4),
    model_probability NUMERIC(6, 4),
    fair_odds NUMERIC(8, 4),
    market_odds NUMERIC(8, 4),
    market_bookmaker VARCHAR(50) NOT NULL DEFAULT 'Pinnacle',
    edge_pct NUMERIC(6, 2),
    expected_value NUMERIC(6, 4),
    confidence INT NOT NULL DEFAULT 0,
    verdict VARCHAR(20) NOT NULL DEFAULT 'LEWATI',
    model_version VARCHAR(50) NOT NULL DEFAULT 'dixon-coles-v1.0',
    reasoning TEXT,
    rejection_reason TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    profit_loss NUMERIC(8, 4),
    settled_at TIMESTAMPTZ,
    source VARCHAR(50) NOT NULL DEFAULT 'live',
    prediction_id VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.daily_picks
  ADD COLUMN IF NOT EXISTS prediction_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS profit_loss NUMERIC(8, 4),
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;

-- Reconcile daily_picks unique constraint
ALTER TABLE public.daily_picks
  DROP CONSTRAINT IF EXISTS uq_daily_picks_fixture_market_source;
ALTER TABLE public.daily_picks
  DROP CONSTRAINT IF EXISTS uq_daily_picks_prediction;
ALTER TABLE public.daily_picks
  ADD CONSTRAINT uq_daily_picks_prediction UNIQUE (prediction_id);

-- -----------------------------------------------------------------------------
-- 3.7 TABLE: settlement_results (Append-Only Financial Settlement)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settlement_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fixture_id VARCHAR(100) NOT NULL,
    ledger_position_id VARCHAR(255),
    market_type VARCHAR(50) NOT NULL,
    selection VARCHAR(50) NOT NULL,
    line NUMERIC(6, 4) NOT NULL,
    odds NUMERIC(8, 4) NOT NULL,
    outcome VARCHAR(30) NOT NULL CHECK (outcome IN ('WIN', 'HALF_WIN', 'PUSH', 'HALF_LOSS', 'LOSS', 'VOID')),
    profit_units NUMERIC(8, 4) NOT NULL,
    stake_units NUMERIC(6, 2) NOT NULL DEFAULT 1.0 CHECK (stake_units >= 0),
    home_goals INT NOT NULL,
    away_goals INT NOT NULL,
    voided BOOLEAN NOT NULL DEFAULT FALSE,
    settled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.settlement_results
  ADD COLUMN IF NOT EXISTS ledger_position_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS prediction_id VARCHAR(255);

-- Replace coarse match+market unique constraint with position-level unique constraint
ALTER TABLE public.settlement_results
  DROP CONSTRAINT IF EXISTS uq_settlement_fixture_market;
ALTER TABLE public.settlement_results
  DROP CONSTRAINT IF EXISTS uq_settlement_ledger_pos;
ALTER TABLE public.settlement_results
  ADD CONSTRAINT uq_settlement_ledger_pos UNIQUE (ledger_position_id);

-- Immutability trigger for settlement_results (Append-only)
CREATE OR REPLACE FUNCTION public.fn_protect_settlement_results_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'settlement_results records cannot be deleted';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_settlement_results ON public.settlement_results;
CREATE TRIGGER trg_immutable_settlement_results
  BEFORE DELETE ON public.settlement_results
  FOR EACH ROW EXECUTE FUNCTION public.fn_protect_settlement_results_immutability();

-- =============================================================================
-- 4. SECURITY, ROLES & ROW-LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Ensure native Supabase roles exist (no-op in Supabase, creates roles in standalone Postgres)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END $$;

-- Enable Row-Level Security on all 8 tables
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_provenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediction_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_results ENABLE ROW LEVEL SECURITY;

-- 4.1 RLS Policies: matches
DROP POLICY IF EXISTS p_anon_matches_read ON public.matches;
CREATE POLICY p_anon_matches_read ON public.matches
  FOR SELECT TO anon USING (data_status = 'ACTIVE');

DROP POLICY IF EXISTS p_auth_matches_read ON public.matches;
CREATE POLICY p_auth_matches_read ON public.matches
  FOR SELECT TO authenticated USING (data_status = 'ACTIVE');

DROP POLICY IF EXISTS p_service_role_all_matches ON public.matches;
CREATE POLICY p_service_role_all_matches ON public.matches
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4.2 RLS Policies: market_snapshots
DROP POLICY IF EXISTS p_auth_snapshots_read ON public.market_snapshots;
CREATE POLICY p_auth_snapshots_read ON public.market_snapshots
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS p_service_role_all_snapshots ON public.market_snapshots;
CREATE POLICY p_service_role_all_snapshots ON public.market_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4.3 RLS Policies: decisions
DROP POLICY IF EXISTS p_auth_decisions_read ON public.decisions;
CREATE POLICY p_auth_decisions_read ON public.decisions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS p_service_role_all_decisions ON public.decisions;
CREATE POLICY p_service_role_all_decisions ON public.decisions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4.4 RLS Policies: evidence & data_provenance
DROP POLICY IF EXISTS p_auth_evidence_read ON public.evidence;
CREATE POLICY p_auth_evidence_read ON public.evidence
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS p_service_role_all_evidence ON public.evidence;
CREATE POLICY p_service_role_all_evidence ON public.evidence
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_auth_provenance_read ON public.data_provenance;
CREATE POLICY p_auth_provenance_read ON public.data_provenance
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS p_service_role_all_provenance ON public.data_provenance;
CREATE POLICY p_service_role_all_provenance ON public.data_provenance
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4.5 RLS Policies: prediction_ledger
DROP POLICY IF EXISTS p_auth_prediction_ledger_read ON public.prediction_ledger;
CREATE POLICY p_auth_prediction_ledger_read ON public.prediction_ledger
  FOR SELECT TO authenticated USING (data_status = 'ACTIVE');

DROP POLICY IF EXISTS p_service_role_all_ledger ON public.prediction_ledger;
CREATE POLICY p_service_role_all_ledger ON public.prediction_ledger
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4.6 RLS Policies: daily_picks
DROP POLICY IF EXISTS p_anon_daily_picks_read ON public.daily_picks;
CREATE POLICY p_anon_daily_picks_read ON public.daily_picks
  FOR SELECT TO anon USING (status = 'ACTIVE');

DROP POLICY IF EXISTS p_auth_daily_picks_read ON public.daily_picks;
CREATE POLICY p_auth_daily_picks_read ON public.daily_picks
  FOR SELECT TO authenticated USING (status = 'ACTIVE');

DROP POLICY IF EXISTS p_service_role_all_daily_picks ON public.daily_picks;
CREATE POLICY p_service_role_all_daily_picks ON public.daily_picks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4.7 RLS Policies: settlement_results
DROP POLICY IF EXISTS p_auth_settlement_read ON public.settlement_results;
CREATE POLICY p_auth_settlement_read ON public.settlement_results
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS p_service_role_all_settlement ON public.settlement_results;
CREATE POLICY p_service_role_all_settlement ON public.settlement_results
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Grant privileges
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON public.matches, public.daily_picks TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- =============================================================================
-- 5. POST-BOOTSTRAP CONTRACT VERIFICATION ASSERTION
-- =============================================================================
DO $$
DECLARE
  v_tbls INT;
  v_fks INT;
  v_trgs INT;
  v_rls INT;
BEGIN
  -- 1. Assert exactly 8 primary tables + 1 migration table exist
  SELECT COUNT(*) INTO v_tbls FROM information_schema.tables 
  WHERE table_schema = 'public' 
    AND table_name IN (
      'matches', 'market_snapshots', 'decisions', 'evidence', 'data_provenance',
      'prediction_ledger', 'daily_picks', 'settlement_results', '_salmo_migrations'
    );
  
  IF v_tbls < 9 THEN
    RAISE EXCEPTION 'POST-BOOTSTRAP ASSERTION FAILED: Expected 9 tables in public, found %', v_tbls;
  END IF;

  -- 2. Assert all 5 immutability / sync triggers exist
  SELECT COUNT(*) INTO v_trgs FROM information_schema.triggers
  WHERE trigger_schema = 'public'
    AND trigger_name IN (
      'trg_sync_matches_kickoff', 'trg_immutable_market_snapshots',
      'trg_immutable_decisions', 'trg_immutable_prediction_ledger',
      'trg_immutable_settlement_results'
    );
  
  IF v_trgs < 5 THEN
    RAISE EXCEPTION 'POST-BOOTSTRAP ASSERTION FAILED: Expected 5 triggers in public, found %', v_trgs;
  END IF;

  -- 3. Assert RLS is active on all core tables
  SELECT COUNT(*) INTO v_rls FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' 
    AND c.relname IN ('matches', 'market_snapshots', 'decisions', 'prediction_ledger', 'settlement_results', 'daily_picks')
    AND c.relrowsecurity = true;
  
  IF v_rls < 6 THEN
    RAISE EXCEPTION 'POST-BOOTSTRAP ASSERTION FAILED: RLS not enabled on all core tables. Found %', v_rls;
  END IF;

  RAISE NOTICE 'SALMO Unified Bootstrap successfully verified all database contracts.';
END $$;

-- =============================================================================
-- 6. MIGRATION VERSION RECORDING
-- =============================================================================
INSERT INTO public._salmo_migrations (version, description, checksum, applied_by)
VALUES (
  '20261105_salmo_canonical_bootstrap_v1',
  'SALMO Unified Canonical Bootstrap: 8 Tables, Immutability Triggers, Foreign Keys, Least-Privilege RLS',
  '7b9c3f1e5a8d2460e1c49b8a3d6f7e0a2c5b8d1f4e9a3b6c8d0e2f4a6b8c0d2e',
  CURRENT_USER
)
ON CONFLICT (version) DO UPDATE SET
  applied_at = NOW();

COMMIT;
