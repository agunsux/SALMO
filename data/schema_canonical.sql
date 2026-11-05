-- =============================================================================
-- SALMO.DEV — EPIC 100D/100E Canonical Database Contract
-- Authoritative schema with strict constraints, foreign keys, and immutability triggers
-- =============================================================================

BEGIN;

-- 1. Ensure extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Base tables if not exists
CREATE TABLE IF NOT EXISTS public.matches (
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

-- Ensure columns exist if matches table was pre-existing
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS kickoff TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kickoff_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(50) NOT NULL DEFAULT 'PROVIDER',
  ADD COLUMN IF NOT EXISTS pipeline_metadata JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.matches ALTER COLUMN kickoff_time DROP NOT NULL;
ALTER TABLE public.matches ALTER COLUMN kickoff DROP NOT NULL;

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

UPDATE public.matches SET kickoff = kickoff_time WHERE kickoff IS NULL AND kickoff_time IS NOT NULL;
UPDATE public.matches SET kickoff_time = kickoff WHERE kickoff_time IS NULL AND kickoff IS NOT NULL;

-- 3. Market Snapshots (Point-in-time immutable odds quotes)
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

ALTER TABLE public.market_snapshots
  DROP CONSTRAINT IF EXISTS market_snapshots_match_id_fkey,
  ADD CONSTRAINT market_snapshots_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE RESTRICT;

ALTER TABLE public.market_snapshots
  DROP CONSTRAINT IF EXISTS chk_market_snapshots_odds;

ALTER TABLE public.market_snapshots
  ADD CONSTRAINT chk_market_snapshots_odds CHECK (home_odds > 1.0 AND away_odds > 1.0);

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

-- 4. Decisions (Point-in-time immutable evaluation snapshots)
CREATE TABLE IF NOT EXISTS public.decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE RESTRICT,
    market_type VARCHAR(50) NOT NULL,
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

ALTER TABLE public.decisions
  ALTER COLUMN line_label DROP NOT NULL;

ALTER TABLE public.decisions
  DROP CONSTRAINT IF EXISTS decisions_match_id_fkey;

ALTER TABLE public.decisions
  ADD CONSTRAINT decisions_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE RESTRICT;

ALTER TABLE public.decisions
  ADD COLUMN IF NOT EXISTS selection VARCHAR(100),
  ADD COLUMN IF NOT EXISTS line NUMERIC(6, 4),
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(5, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verdict VARCHAR(20) DEFAULT 'LEWATI',
  ADD COLUMN IF NOT EXISTS model_version VARCHAR(50) DEFAULT 'dixon-coles-v1.0',
  ADD COLUMN IF NOT EXISTS feature_version VARCHAR(50) DEFAULT 'dynamic-ratings-v1.0',
  ADD COLUMN IF NOT EXISTS odds_snapshot_id UUID REFERENCES public.market_snapshots(id);

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

-- 5. Evidence & Data Provenance
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

-- 6. Prediction Ledger (Authoritative Actionable Decisions)
CREATE TABLE IF NOT EXISTS public.prediction_ledger (
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

-- Ensure columns exist if table was created previously with different columns
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

ALTER TABLE public.prediction_ledger ALTER COLUMN prediction_id DROP NOT NULL;
ALTER TABLE public.prediction_ledger ALTER COLUMN fixture_id DROP NOT NULL;
ALTER TABLE public.prediction_ledger ALTER COLUMN model_version DROP NOT NULL;
ALTER TABLE public.prediction_ledger ALTER COLUMN feature_version DROP NOT NULL;
ALTER TABLE public.prediction_ledger ALTER COLUMN prediction_timestamp DROP NOT NULL;
ALTER TABLE public.prediction_ledger ALTER COLUMN odds_timestamp DROP NOT NULL;
ALTER TABLE public.prediction_ledger ALTER COLUMN provenance_hash DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_prediction_ledger_doi ON public.prediction_ledger(doi_id);

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

-- 7. Daily Picks Table
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
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_daily_picks_fixture_market_source UNIQUE(fixture_id, market_type, source)
);

-- 8. Settlement Results Table (Append-only)
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_settlement_fixture_market UNIQUE(fixture_id, market_type)
);

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

ALTER TABLE public.settlement_results
  ADD COLUMN IF NOT EXISTS prediction_id VARCHAR(255);
ALTER TABLE public.settlement_results
  DROP CONSTRAINT IF EXISTS uq_settlement_fixture_market;
ALTER TABLE public.settlement_results
  DROP CONSTRAINT IF EXISTS uq_settlement_ledger_pos;
ALTER TABLE public.settlement_results
  ADD CONSTRAINT uq_settlement_ledger_pos UNIQUE (ledger_position_id);
ALTER TABLE public.daily_picks
  DROP CONSTRAINT IF EXISTS uq_daily_picks_fixture_market_source;
ALTER TABLE public.daily_picks
  DROP CONSTRAINT IF EXISTS uq_daily_picks_prediction;
ALTER TABLE public.daily_picks
  ADD CONSTRAINT uq_daily_picks_prediction UNIQUE (prediction_id);

COMMIT;

ALTER TABLE public.daily_picks
  ADD COLUMN IF NOT EXISTS prediction_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS profit_loss NUMERIC(8, 4),
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;
