-- =============================================================================
-- SALMO.DEV — Canonical Match Archive, Immutable Ledger & Settlement Pipeline
-- Non-Destructive Schema Governance & Indexing Migration (2026-10-12)
-- =============================================================================
-- Maps the 4 logical layers onto existing production Supabase tables:
--   Layer A (Canonical Match Archive): public.matches (active season window)
--                                    + public.gold_historical_matches (11,642 verified historical matches)
--   Layer B (Immutable Prediction Ledger): public.prediction_ledger (production ledger)
--                                        + public.daily_picks (public pick projections)
--                                        + public.forecast_archive (15-league canonical research ledger)
--   Layer C (Append-Only Settlement Ledger): public.settlement_results
--   Layer D (Derived Performance & Observability): public.performance_ledger + runtime views
-- =============================================================================

BEGIN;

-- 1. Ensure safe indexes exist on public.matches for archive filtering and deduplication
CREATE INDEX IF NOT EXISTS idx_matches_data_status_kickoff
  ON public.matches (data_status, kickoff DESC);

CREATE INDEX IF NOT EXISTS idx_matches_league_status
  ON public.matches (league, status);

-- 2. Ensure safe indexes exist on public.gold_historical_matches for fast historical archive queries
CREATE INDEX IF NOT EXISTS idx_gold_hist_matches_league_season_date
  ON public.gold_historical_matches (league_id, season, match_date DESC);

CREATE INDEX IF NOT EXISTS idx_gold_hist_matches_date
  ON public.gold_historical_matches (match_date DESC);

-- 3. Ensure safe indexes exist on public.prediction_ledger for canonical reconciliation
CREATE INDEX IF NOT EXISTS idx_prediction_ledger_data_status_match
  ON public.prediction_ledger (data_status, match_id, market);

CREATE INDEX IF NOT EXISTS idx_prediction_ledger_result_status
  ON public.prediction_ledger (result_status, settled_at DESC);

-- 4. Ensure safe indexes exist on public.settlement_results for append-only audit lookups
CREATE INDEX IF NOT EXISTS idx_settlement_results_fixture_market
  ON public.settlement_results (fixture_id, market_type);

CREATE INDEX IF NOT EXISTS idx_settlement_results_settled_at
  ON public.settlement_results (settled_at DESC);

-- 5. Ensure safe indexes exist on public.forecast_archive for 15-league research queries
CREATE INDEX IF NOT EXISTS idx_forecast_archive_prediction_hash
  ON public.forecast_archive (prediction_hash);

CREATE INDEX IF NOT EXISTS idx_forecast_archive_league_market
  ON public.forecast_archive (league, market, created_at DESC);

COMMIT;
