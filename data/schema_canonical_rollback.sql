-- =============================================================================
-- SALMO.DEV — EPIC 100D/100E Canonical Database Contract Rollback
-- Drops added triggers, functions, and reverts constraint additions
-- =============================================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_immutable_settlement_results ON public.settlement_results;
DROP FUNCTION IF EXISTS public.fn_protect_settlement_results_immutability();

DROP TRIGGER IF EXISTS trg_immutable_prediction_ledger ON public.prediction_ledger;
DROP FUNCTION IF EXISTS public.fn_protect_prediction_ledger_immutability();

DROP TRIGGER IF EXISTS trg_immutable_decisions ON public.decisions;
DROP FUNCTION IF EXISTS public.fn_prevent_decision_tampering();

DROP TRIGGER IF EXISTS trg_immutable_market_snapshots ON public.market_snapshots;
DROP FUNCTION IF EXISTS public.fn_prevent_market_snapshot_tampering();

ALTER TABLE public.prediction_ledger
  DROP CONSTRAINT IF EXISTS chk_ledger_result_status,
  DROP CONSTRAINT IF EXISTS chk_ledger_odds,
  DROP CONSTRAINT IF EXISTS chk_ledger_prob;

ALTER TABLE public.decisions
  DROP CONSTRAINT IF EXISTS chk_decisions_prob;

ALTER TABLE public.market_snapshots
  DROP CONSTRAINT IF EXISTS chk_market_snapshots_odds;

COMMIT;
