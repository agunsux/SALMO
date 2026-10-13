-- =============================================================================
-- SALMO.DEV — P0 Atomic OddsPapi Quota Reservation Rollback Script
-- Safe, Non-Destructive Rollback (2026-10-13)
-- =============================================================================
-- Rollback Philosophy:
--   1. ZERO DATA LOSS: Never drops public.quota_state or public.quota_reservations,
--      and never deletes confirmed consumption or historical audit rows.
--   2. SAFE IN-FLIGHT DRAIN: Any in-flight 'RESERVED' rows for 'oddspapi' are
--      safely reconciled before removing the SALMO P0 RPC functions and trigger.
--   3. RE-APPLICABLE: After running this rollback script, the forward migration
--      (20261013_atomic_oddspapi_quota_reservation.sql) can be re-applied
--      cleanly and idempotently.
-- =============================================================================

BEGIN;

-- 1. Drop the state-transition enforcement trigger and helper function first
--    so status normalization can run without trigger blocks.
DROP TRIGGER IF EXISTS trg_salmo_quota_res_transition ON public.quota_reservations;
DROP FUNCTION IF EXISTS public.salmo_enforce_quota_reservation_transition();

-- 2. Safely drain any unsettled in-flight RESERVED rows for oddspapi so
--    quota_state.reserved does not remain artificially elevated after rollback,
--    while preserving any confirmed_amount already charged.
DO $$
DECLARE
    v_res RECORD;
    v_unsettled INTEGER;
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'quota_state'
    ) THEN
        -- Lock #1: Lock public.quota_state rows FIRST (matches RPC deterministic lock order)
        PERFORM 1
        FROM public.quota_state
        WHERE provider = 'oddspapi'
        FOR UPDATE;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'quota_reservations'
    ) THEN
        -- Lock #2: Lock public.quota_reservations rows SECOND
        FOR v_res IN
            SELECT id, provider, quota_type, period_start, subscription_cycle_key, amount,
                   COALESCE(confirmed_amount, 0) AS confirmed_amount,
                   COALESCE(released_amount, 0) AS released_amount
            FROM public.quota_reservations
            WHERE provider = 'oddspapi'
              AND status = 'RESERVED'
            ORDER BY created_at ASC
            FOR UPDATE
        LOOP
            v_unsettled := GREATEST(0, v_res.amount - v_res.confirmed_amount - v_res.released_amount);

            UPDATE public.quota_reservations
            SET released_amount = COALESCE(released_amount, 0) + v_unsettled,
                status = CASE WHEN v_res.confirmed_amount > 0 THEN 'CONFIRMED' ELSE 'ROLLED_BACK' END,
                billing_outcome = CASE WHEN v_res.confirmed_amount > 0 THEN 'PARTIAL_BATCH_SETTLED' ELSE 'PRE_REQUEST_ABORT' END,
                error_code = COALESCE(error_code, 'ROLLED_BACK_BY_MIGRATION_REVERT'),
                resolved_at = COALESCE(resolved_at, NOW()),
                updated_at = NOW()
            WHERE id = v_res.id;

            IF v_unsettled > 0 THEN
                UPDATE public.quota_state
                SET reserved = GREATEST(0, reserved - v_unsettled),
                    updated_at = NOW()
                WHERE id = (
                    SELECT id
                    FROM public.quota_state
                    WHERE provider = v_res.provider
                      AND quota_type = v_res.quota_type
                    ORDER BY
                        CASE
                            WHEN v_res.subscription_cycle_key IS NOT NULL AND subscription_cycle_key = v_res.subscription_cycle_key THEN 0
                            WHEN period_start = v_res.period_start THEN 1
                            ELSE 2
                        END,
                        period_start DESC,
                        updated_at DESC
                    LIMIT 1
                );
            END IF;
        END LOOP;
    END IF;
END
$$;

-- 3. Drop the SALMO P0 atomic RPC functions
DROP FUNCTION IF EXISTS public.salmo_cleanup_stale_oddspapi_reservations(INTEGER);
DROP FUNCTION IF EXISTS public.salmo_release_oddspapi_quota(UUID, INTEGER, INTEGER, BOOLEAN, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.salmo_confirm_oddspapi_quota(UUID, INTEGER, INTEGER, INTEGER, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.salmo_reserve_oddspapi_quota(INTEGER, TEXT, TEXT, TEXT, INTEGER, NUMERIC, INTEGER, JSONB);
DROP FUNCTION IF EXISTS public.salmo_sync_oddspapi_quota_cycle(TEXT, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ);

-- 4. Drop SALMO-specific secondary indexes (preserving all columns and historical data)
DROP INDEX IF EXISTS public.uq_quota_res_provider_idempotency;
DROP INDEX IF EXISTS public.idx_quota_res_provider_cycle_status;
DROP INDEX IF EXISTS public.idx_quota_res_expires_at;
DROP INDEX IF EXISTS public.uq_quota_state_provider_cycle;
DROP INDEX IF EXISTS public.idx_quota_state_provider_type_period;

-- 5. Mark schema_version on oddspapi quota_state row(s) as rolled back while
--    keeping the 50-request mandatory reserve (safe_limit = 200) intact so
--    rolling back the RPCs does NOT re-open the 250/250 overrun vulnerability.
UPDATE public.quota_state
SET schema_version = 'rolled_back_to_v4_compat',
    updated_at = NOW()
WHERE provider = 'oddspapi';

NOTIFY pgrst, 'reload schema';

COMMIT;
