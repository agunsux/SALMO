-- =============================================================================
-- SALMO.DEV — EPIC 80: Durable Prediction Storage Rollback
-- Safely reverts durable table and index additions if required.
-- =============================================================================

BEGIN;

DROP INDEX IF EXISTS public.uq_prediction_ledger_doi;
DROP INDEX IF EXISTS public.idx_prediction_ledger_canonical_match;
DROP INDEX IF EXISTS public.uq_daily_picks_fixture_market_source;

DROP INDEX IF EXISTS public.idx_daily_refresh_provenance_hash;
DROP INDEX IF EXISTS public.idx_daily_refresh_public_verdict;
DROP INDEX IF EXISTS public.idx_daily_refresh_kickoff_league;
DROP INDEX IF EXISTS public.uq_daily_refresh_position;

DROP TABLE IF EXISTS public.daily_prediction_refresh_ledger CASCADE;

COMMIT;
