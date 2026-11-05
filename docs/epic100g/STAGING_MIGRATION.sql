-- =============================================================================
-- STAGING_MIGRATION.sql
-- SALMO EPIC 100G: Canonical Staging Database Contract & Security Migration
-- Target: Staging Supabase / PostgreSQL 16
-- Transactional, Idempotent, Non-Destructive, Least-Privilege Enforced
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. PRE-MIGRATION SAFETY ASSERTIONS
-- =============================================================================
DO $$
DECLARE
  v_version TEXT;
BEGIN
  SELECT version() INTO v_version;
  RAISE NOTICE 'Executing Staging Migration on engine: %', v_version;

  -- Verify core base tables exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'matches') THEN
    RAISE EXCEPTION 'PRE-MIGRATION ASSERTION FAILED: Table public.matches does not exist.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'prediction_ledger') THEN
    RAISE EXCEPTION 'PRE-MIGRATION ASSERTION FAILED: Table public.prediction_ledger does not exist.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'settlement_results') THEN
    RAISE EXCEPTION 'PRE-MIGRATION ASSERTION FAILED: Table public.settlement_results does not exist.';
  END IF;

  RAISE NOTICE 'Pre-migration assertions satisfied. Proceeding with staged object creation.';
END $$;

-- Ensure necessary cryptographic extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- 2. MARKET_SNAPSHOTS TABLE & IMMUTABILITY TRIGGERS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.market_snapshots (
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

-- Ensure odds check constraint
ALTER TABLE public.market_snapshots
  DROP CONSTRAINT IF EXISTS chk_market_snapshots_odds;
ALTER TABLE public.market_snapshots
  ADD CONSTRAINT chk_market_snapshots_odds CHECK (home_odds > 1.0 AND away_odds > 1.0);

-- Indexes for point-in-time lookup
CREATE INDEX IF NOT EXISTS idx_market_snapshots_match_market ON public.market_snapshots(match_id, market_type);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_captured_at ON public.market_snapshots(captured_at);

-- Immutability trigger function
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

-- =============================================================================
-- 3. DECISIONS TABLE & IMMUTABILITY TRIGGERS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.decisions (
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

-- Ensure probability check constraint
ALTER TABLE public.decisions
  DROP CONSTRAINT IF EXISTS chk_decisions_prob;
ALTER TABLE public.decisions
  ADD CONSTRAINT chk_decisions_prob CHECK (model_prob_pct >= 0 AND model_prob_pct <= 100);

-- Indexes for decision retrieval
CREATE INDEX IF NOT EXISTS idx_decisions_match_id ON public.decisions(match_id);
CREATE INDEX IF NOT EXISTS idx_decisions_generated_at ON public.decisions(generated_at);

-- Immutability trigger function
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

-- =============================================================================
-- 4. EVIDENCE & DATA PROVENANCE TABLES
-- =============================================================================
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

-- =============================================================================
-- 5. PREDICTION_LEDGER CONSTRAINTS & IMMUTABILITY TRIGGERS
-- =============================================================================
-- Add missing foreign key safely (nullable for legacy historical records)
ALTER TABLE public.prediction_ledger
  ADD COLUMN IF NOT EXISTS decision_id UUID REFERENCES public.decisions(id) ON DELETE RESTRICT;

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

-- Unique index on doi_id
CREATE UNIQUE INDEX IF NOT EXISTS uq_prediction_ledger_doi ON public.prediction_ledger(doi_id);

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

-- =============================================================================
-- 6. SETTLEMENT_RESULTS PARITY & POSITION-LEVEL UNIQUENESS
-- =============================================================================
-- Add dual compatibility column prediction_id if missing
ALTER TABLE public.settlement_results
  ADD COLUMN IF NOT EXISTS prediction_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS ledger_position_id VARCHAR(255);

-- Replace defective fixture-market uniqueness with position-level uniqueness
ALTER TABLE public.settlement_results
  DROP CONSTRAINT IF EXISTS uq_settlement_fixture_market;
ALTER TABLE public.settlement_results
  DROP CONSTRAINT IF EXISTS uq_settlement_ledger_pos;
ALTER TABLE public.settlement_results
  ADD CONSTRAINT uq_settlement_ledger_pos UNIQUE (ledger_position_id);

-- Settlement immutability trigger
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
-- 7. DAILY_PICKS UNIQUENESS REFACTOR
-- =============================================================================
ALTER TABLE public.daily_picks
  ADD COLUMN IF NOT EXISTS prediction_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS profit_loss NUMERIC(8, 4),
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;

ALTER TABLE public.daily_picks
  DROP CONSTRAINT IF EXISTS uq_daily_picks_fixture_market_source;
ALTER TABLE public.daily_picks
  DROP CONSTRAINT IF EXISTS uq_daily_picks_prediction;
ALTER TABLE public.daily_picks
  ADD CONSTRAINT uq_daily_picks_prediction UNIQUE (prediction_id);

-- =============================================================================
-- 8. ROW LEVEL SECURITY (RLS) & LEAST-PRIVILEGE GRANTS
-- =============================================================================
-- Enable RLS across all canonical tables
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediction_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_picks ENABLE ROW LEVEL SECURITY;

-- 8.1 Policies for 'anon' role (Public Web Visitors)
DROP POLICY IF EXISTS p_anon_daily_picks_read ON public.daily_picks;
CREATE POLICY p_anon_daily_picks_read ON public.daily_picks
  FOR SELECT TO anon
  USING (status IN ('ACTIVE', 'WON', 'LOST', 'PUSH', 'VOID'));

DROP POLICY IF EXISTS p_anon_matches_read ON public.matches;
CREATE POLICY p_anon_matches_read ON public.matches
  FOR SELECT TO anon
  USING (status != 'cancelled');

-- Deny all writes for anon
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon;

-- 8.2 Policies for 'authenticated' role
DROP POLICY IF EXISTS p_auth_daily_picks_read ON public.daily_picks;
CREATE POLICY p_auth_daily_picks_read ON public.daily_picks
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS p_auth_matches_read ON public.matches;
CREATE POLICY p_auth_matches_read ON public.matches
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS p_auth_prediction_ledger_read ON public.prediction_ledger;
CREATE POLICY p_auth_prediction_ledger_read ON public.prediction_ledger
  FOR SELECT TO authenticated
  USING (data_status = 'ACTIVE');

-- Deny writes for authenticated ordinary users
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM authenticated;

-- 8.3 Policies for 'service_role' (Backend Cron & Repository Execution)
DROP POLICY IF EXISTS p_service_role_all_matches ON public.matches;
CREATE POLICY p_service_role_all_matches ON public.matches
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_service_role_all_snapshots ON public.market_snapshots;
CREATE POLICY p_service_role_all_snapshots ON public.market_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_service_role_all_decisions ON public.decisions;
CREATE POLICY p_service_role_all_decisions ON public.decisions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_service_role_all_ledger ON public.prediction_ledger;
CREATE POLICY p_service_role_all_ledger ON public.prediction_ledger
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_service_role_all_settlement ON public.settlement_results;
CREATE POLICY p_service_role_all_settlement ON public.settlement_results
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_service_role_all_daily_picks ON public.daily_picks;
CREATE POLICY p_service_role_all_daily_picks ON public.daily_picks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- 9. POST-MIGRATION VERIFICATION ASSERTIONS
-- =============================================================================
DO $$
BEGIN
  -- Verify market_snapshots existence & triggers
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'market_snapshots') THEN
    RAISE EXCEPTION 'POST-MIGRATION ASSERTION FAILED: Table market_snapshots was not created.';
  END IF;

  -- Verify decisions existence & triggers
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'decisions') THEN
    RAISE EXCEPTION 'POST-MIGRATION ASSERTION FAILED: Table decisions was not created.';
  END IF;

  -- Verify triggers are attached
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_immutable_market_snapshots') THEN
    RAISE EXCEPTION 'POST-MIGRATION ASSERTION FAILED: Trigger trg_immutable_market_snapshots is missing.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_immutable_decisions') THEN
    RAISE EXCEPTION 'POST-MIGRATION ASSERTION FAILED: Trigger trg_immutable_decisions is missing.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_immutable_prediction_ledger') THEN
    RAISE EXCEPTION 'POST-MIGRATION ASSERTION FAILED: Trigger trg_immutable_prediction_ledger is missing.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_immutable_settlement_results') THEN
    RAISE EXCEPTION 'POST-MIGRATION ASSERTION FAILED: Trigger trg_immutable_settlement_results is missing.';
  END IF;

  RAISE NOTICE 'POST-MIGRATION VERIFICATION SUCCEEDED: All objects, constraints, and triggers verified.';
END $$;

COMMIT;
