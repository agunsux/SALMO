-- =============================================================================
-- SALMO.DEV — EPIC 80: Durable Prediction Storage & Daily Refresh Reconciliation
-- Non-Destructive Schema Governance, Indexes & Durable Table Migration (2026-10-15)
-- =============================================================================
-- Solves serverless container ephemerality by providing durable PostgreSQL storage
-- for daily prediction refresh cycles, qualified picks, and immutable positions.
--
-- Tables governed:
--   1. public.daily_prediction_refresh_ledger: Durable store for all 15-league daily predictions
--   2. public.prediction_ledger: Production immutable betting positions with unique constraints
--   3. public.daily_picks: Public picks projections with idempotent conflict resolution
-- =============================================================================

BEGIN;

-- 1. Create durable daily prediction refresh table if not exists
CREATE TABLE IF NOT EXISTS public.daily_prediction_refresh_ledger (
  id TEXT PRIMARY KEY,
  prediction_id TEXT NOT NULL,
  canonical_match_id TEXT NOT NULL,
  fixture_id TEXT NOT NULL,
  league TEXT NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  kickoff_utc TIMESTAMPTZ NOT NULL,
  prediction_timestamp TIMESTAMPTZ NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('AH', 'OU', 'BTTS')),
  selection TEXT NOT NULL,
  line NUMERIC(6, 4) NOT NULL,
  market_odds NUMERIC(8, 4) NOT NULL,
  fair_odds NUMERIC(8, 4),
  bookmaker TEXT NOT NULL DEFAULT 'pinnacle',
  model_probability NUMERIC(6, 4) NOT NULL CHECK (model_probability >= 0.0 AND model_probability <= 1.0),
  expected_value NUMERIC(8, 4) NOT NULL,
  confidence_score INTEGER NOT NULL DEFAULT 0,
  confidence_tier TEXT NOT NULL DEFAULT 'PANTAU',
  verdict TEXT NOT NULL CHECK (verdict IN ('LAYAK', 'PANTAU', 'LEWATI')),
  ledger_tier TEXT NOT NULL CHECK (ledger_tier IN ('PRODUCTION', 'SHADOW', 'NONE')),
  is_public_pick BOOLEAN NOT NULL DEFAULT FALSE,
  model_version TEXT NOT NULL DEFAULT 'dixon-coles-v1.0',
  provenance_hash TEXT NOT NULL,
  settlement_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (settlement_status IN ('PENDING', 'SETTLED', 'VOID')),
  result TEXT,
  profit_units NUMERIC(8, 4) NOT NULL DEFAULT 0.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Idempotency & composite unique constraint for daily prediction refresh
-- A prediction is unique per match, market, line, selection, and model version
CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_refresh_position
  ON public.daily_prediction_refresh_ledger (canonical_match_id, market, line, selection, model_version);

-- Fast lookup indexes
CREATE INDEX IF NOT EXISTS idx_daily_refresh_kickoff_league
  ON public.daily_prediction_refresh_ledger (kickoff_utc, league);

CREATE INDEX IF NOT EXISTS idx_daily_refresh_public_verdict
  ON public.daily_prediction_refresh_ledger (is_public_pick, verdict, ledger_tier);

CREATE INDEX IF NOT EXISTS idx_daily_refresh_provenance_hash
  ON public.daily_prediction_refresh_ledger (provenance_hash);

-- 3. Ensure composite unique constraints & indexes on existing prediction_ledger
CREATE UNIQUE INDEX IF NOT EXISTS uq_prediction_ledger_doi
  ON public.prediction_ledger (doi_id);

CREATE INDEX IF NOT EXISTS idx_prediction_ledger_canonical_match
  ON public.prediction_ledger (match_id, market, result_status);

-- 4. Ensure composite unique index on daily_picks for idempotent upserts
CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_picks_fixture_market_source
  ON public.daily_picks (fixture_id, market_type, source);

COMMIT;
