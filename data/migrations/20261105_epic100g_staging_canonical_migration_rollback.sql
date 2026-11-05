-- =============================================================================
-- STAGING_ROLLBACK.sql
-- SALMO EPIC 100G: Rollback Plan for Canonical Staging Database Contract
-- Reverses triggers, policies, and candidate tables while strictly preserving
-- pre-existing matches, prediction_ledger, settlement_results, and daily_picks.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. PRE-ROLLBACK ASSERTIONS
-- =============================================================================
DO $$
BEGIN
  RAISE NOTICE 'Executing Staging Rollback...';
  -- Verify core base tables exist before rollback
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'prediction_ledger') THEN
    RAISE EXCEPTION 'PRE-ROLLBACK ASSERTION FAILED: Table public.prediction_ledger is missing.';
  END IF;
END $$;

-- =============================================================================
-- 2. REMOVE RLS POLICIES APPLIED IN MIGRATION
-- =============================================================================
DROP POLICY IF EXISTS p_anon_daily_picks_read ON public.daily_picks;
DROP POLICY IF EXISTS p_anon_matches_read ON public.matches;
DROP POLICY IF EXISTS p_auth_daily_picks_read ON public.daily_picks;
DROP POLICY IF EXISTS p_auth_matches_read ON public.matches;
DROP POLICY IF EXISTS p_auth_prediction_ledger_read ON public.prediction_ledger;
DROP POLICY IF EXISTS p_service_role_all_matches ON public.matches;
DROP POLICY IF EXISTS p_service_role_all_snapshots ON public.market_snapshots;
DROP POLICY IF EXISTS p_service_role_all_decisions ON public.decisions;
DROP POLICY IF EXISTS p_service_role_all_ledger ON public.prediction_ledger;
DROP POLICY IF EXISTS p_service_role_all_settlement ON public.settlement_results;
DROP POLICY IF EXISTS p_service_role_all_daily_picks ON public.daily_picks;

-- =============================================================================
-- 3. REMOVE IMMUTABILITY TRIGGERS & FUNCTIONS
-- =============================================================================
DROP TRIGGER IF EXISTS trg_immutable_settlement_results ON public.settlement_results;
DROP FUNCTION IF EXISTS public.fn_protect_settlement_results_immutability();

DROP TRIGGER IF EXISTS trg_immutable_prediction_ledger ON public.prediction_ledger;
DROP FUNCTION IF EXISTS public.fn_protect_prediction_ledger_immutability();

DROP TRIGGER IF EXISTS trg_immutable_decisions ON public.decisions;
DROP FUNCTION IF EXISTS public.fn_prevent_decision_tampering();

DROP TRIGGER IF EXISTS trg_immutable_market_snapshots ON public.market_snapshots;
DROP FUNCTION IF EXISTS public.fn_prevent_market_snapshot_tampering();

-- =============================================================================
-- 4. RESTORE OR RELAX CONSTRAINTS SAFELY
-- =============================================================================
ALTER TABLE public.prediction_ledger
  DROP CONSTRAINT IF EXISTS chk_ledger_prob,
  DROP CONSTRAINT IF EXISTS chk_ledger_odds,
  DROP CONSTRAINT IF EXISTS chk_ledger_result_status,
  DROP CONSTRAINT IF EXISTS prediction_ledger_decision_id_fkey;

ALTER TABLE public.settlement_results
  DROP CONSTRAINT IF EXISTS uq_settlement_ledger_pos;

ALTER TABLE public.daily_picks
  DROP CONSTRAINT IF EXISTS uq_daily_picks_prediction;

-- =============================================================================
-- 5. SAFELY DROP STAGED-ONLY TABLES
-- =============================================================================
DROP TABLE IF EXISTS public.data_provenance CASCADE;
DROP TABLE IF EXISTS public.evidence CASCADE;
DROP TABLE IF EXISTS public.decisions CASCADE;
DROP TABLE IF EXISTS public.market_snapshots CASCADE;

-- =============================================================================
-- 6. POST-ROLLBACK VERIFICATION ASSERTIONS
-- =============================================================================
DO $$
BEGIN
  -- Verify core tables are still intact
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'matches') THEN
    RAISE EXCEPTION 'POST-ROLLBACK CRITICAL FAILURE: Table matches was destroyed!';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'prediction_ledger') THEN
    RAISE EXCEPTION 'POST-ROLLBACK CRITICAL FAILURE: Table prediction_ledger was destroyed!';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'settlement_results') THEN
    RAISE EXCEPTION 'POST-ROLLBACK CRITICAL FAILURE: Table settlement_results was destroyed!';
  END IF;

  -- Verify staged tables are removed
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'decisions') THEN
    RAISE EXCEPTION 'POST-ROLLBACK FAILURE: Table decisions was not dropped.';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'market_snapshots') THEN
    RAISE EXCEPTION 'POST-ROLLBACK FAILURE: Table market_snapshots was not dropped.';
  END IF;

  RAISE NOTICE 'POST-ROLLBACK VERIFICATION SUCCEEDED: Pre-existing core tables preserved, candidate objects cleanly removed.';
END $$;

COMMIT;
