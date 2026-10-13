-- =============================================================================
-- SALMO.DEV — P0 Atomic OddsPapi Quota Reservation, Settlement & Cycle Guard
-- Forward-Only Non-Destructive Migration (2026-10-13)
-- =============================================================================
-- Purpose:
--   1. Extends public.quota_state and public.quota_reservations non-destructively
--      to enforce atomic, row-locked quota reservation across concurrent
--      serverless instances.
--   2. Enforces mandatory operational reserve (50 requests on 250-request plan;
--      operational ceiling = 200) inside the database transaction (remediating
--      the 20260911 migration that set safe_limit = limit_value = 250).
--   3. Tracks OddsPapi subscription cycle keys (subscriptions[0].valid_from)
--      instead of assuming calendar-month resets, blocking stale-cycle callers
--      and preventing stale /v4/account snapshots from rolling back confirmed
--      usage within the same cycle.
--   4. Enforces official OddsPapi v4 billing classification inside SQL:
--      - Billable: HTTP 200, billable 4xx (400/403/404/422), 5xx, and ambiguous
--        post-dispatch transport timeouts.
--      - Non-billable: /v4/account, /v4/historical-odds, pre-request abort before
--        transport, HTTP 401, HTTP 429.
--   5. Enforces deterministic lock ordering (public.quota_state FIRST, then
--      public.quota_reservations SECOND) across all RPCs to eliminate deadlocks.
--   6. Locks down RPC execution with SECURITY DEFINER, explicit search_path,
--      and REVOKE FROM PUBLIC, anon, authenticated / GRANT TO service_role.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Base Tables (Idempotent creation for fresh local/CI environments)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quota_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL,
    quota_type VARCHAR(20) NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    limit_value INTEGER NOT NULL CHECK (limit_value >= 0),
    safe_limit INTEGER NOT NULL CHECK (safe_limit >= 0),
    safety_reserve_pct INTEGER NOT NULL DEFAULT 20 CHECK (safety_reserve_pct >= 0 AND safety_reserve_pct <= 100),
    consumed INTEGER NOT NULL DEFAULT 0 CHECK (consumed >= 0),
    reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_quota_state UNIQUE (provider, quota_type, period_start)
);

CREATE TABLE IF NOT EXISTS public.quota_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL,
    quota_type VARCHAR(20) NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'RESERVED',
    endpoint VARCHAR(255),
    request_id VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- -----------------------------------------------------------------------------
-- 2. Non-Destructive Schema Extensions on public.quota_state
-- -----------------------------------------------------------------------------
ALTER TABLE public.quota_state
    ADD COLUMN IF NOT EXISTS subscription_cycle_key TEXT,
    ADD COLUMN IF NOT EXISTS mandatory_reserve INTEGER NOT NULL DEFAULT 50,
    ADD COLUMN IF NOT EXISTS operational_ceiling INTEGER NOT NULL DEFAULT 200,
    ADD COLUMN IF NOT EXISTS last_account_sync_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_provider_request_count INTEGER,
    ADD COLUMN IF NOT EXISTS schema_version TEXT NOT NULL DEFAULT 'salmo_p0_atomic_v1';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_quota_state_salmo_non_negative'
          AND conrelid = 'public.quota_state'::regclass
    ) THEN
        ALTER TABLE public.quota_state
            ADD CONSTRAINT chk_quota_state_salmo_non_negative
            CHECK (
                limit_value >= 0
                AND safe_limit >= 0
                AND consumed >= 0
                AND reserved >= 0
                AND mandatory_reserve >= 0
                AND operational_ceiling >= 0
                AND operational_ceiling <= limit_value
            );
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_quota_state_provider_cycle
    ON public.quota_state (provider, subscription_cycle_key)
    WHERE subscription_cycle_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quota_state_provider_type_period
    ON public.quota_state (provider, quota_type, period_start DESC);

-- Align existing oddspapi row(s) so mandatory_reserve (50) and operational_ceiling (200)
-- are enforced inside the database transaction instead of allowing 250/250 exhaustion.
UPDATE public.quota_state
SET mandatory_reserve = GREATEST(COALESCE(mandatory_reserve, 50), 50),
    operational_ceiling = LEAST(
        FLOOR(limit_value * 0.90)::integer,
        GREATEST(0, limit_value - GREATEST(COALESCE(mandatory_reserve, 50), 50))
    ),
    safe_limit = LEAST(
        FLOOR(limit_value * 0.90)::integer,
        GREATEST(0, limit_value - GREATEST(COALESCE(mandatory_reserve, 50), 50))
    ),
    safety_reserve_pct = CASE
        WHEN limit_value > 0 THEN ROUND((GREATEST(COALESCE(mandatory_reserve, 50), 50)::numeric / limit_value::numeric) * 100)::integer
        ELSE 20
    END,
    subscription_cycle_key = COALESCE(subscription_cycle_key, 'LEGACY_PERIOD:' || period_start::text),
    schema_version = 'salmo_p0_atomic_v1',
    updated_at = NOW()
WHERE provider = 'oddspapi';

-- -----------------------------------------------------------------------------
-- 3. Non-Destructive Schema Extensions on public.quota_reservations
-- -----------------------------------------------------------------------------
ALTER TABLE public.quota_reservations
    ADD COLUMN IF NOT EXISTS subscription_cycle_key TEXT,
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
    ADD COLUMN IF NOT EXISTS confirmed_amount INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS released_amount INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS http_status INTEGER,
    ADD COLUMN IF NOT EXISTS billing_outcome TEXT NOT NULL DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS error_code TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill idempotency_key and settlement amounts on any pre-existing rows
UPDATE public.quota_reservations
SET idempotency_key = COALESCE(idempotency_key, NULLIF(request_id, '')),
    confirmed_amount = CASE
        WHEN status = 'CONFIRMED' AND confirmed_amount = 0 AND released_amount = 0 THEN amount
        ELSE confirmed_amount
    END,
    released_amount = CASE
        WHEN status IN ('RELEASED', 'ROLLED_BACK') AND confirmed_amount = 0 AND released_amount = 0 THEN amount
        ELSE released_amount
    END,
    billing_outcome = CASE
        WHEN status = 'CONFIRMED' AND billing_outcome = 'PENDING' THEN 'SUCCESS_2XX'
        WHEN status IN ('RELEASED', 'ROLLED_BACK') AND billing_outcome = 'PENDING' THEN 'PRE_REQUEST_ABORT'
        ELSE billing_outcome
    END
WHERE idempotency_key IS NULL
   OR (status IN ('CONFIRMED', 'RELEASED', 'ROLLED_BACK') AND confirmed_amount = 0 AND released_amount = 0);

-- Upgrade status check constraint on public.quota_reservations to allow 'RELEASED'
-- in addition to 'RESERVED', 'CONFIRMED', and legacy 'ROLLED_BACK'.
DO $$
DECLARE
    v_con record;
BEGIN
    FOR v_con IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.quota_reservations'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%status%'
          AND conname <> 'chk_quota_res_salmo_status'
    LOOP
        EXECUTE format('ALTER TABLE public.quota_reservations DROP CONSTRAINT IF EXISTS %I', v_con.conname);
    END LOOP;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_quota_res_salmo_status'
          AND conrelid = 'public.quota_reservations'::regclass
    ) THEN
        ALTER TABLE public.quota_reservations
            ADD CONSTRAINT chk_quota_res_salmo_status
            CHECK (status IN ('RESERVED', 'CONFIRMED', 'RELEASED', 'ROLLED_BACK'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_quota_res_salmo_amounts'
          AND conrelid = 'public.quota_reservations'::regclass
    ) THEN
        ALTER TABLE public.quota_reservations
            ADD CONSTRAINT chk_quota_res_salmo_amounts
            CHECK (
                amount > 0
                AND confirmed_amount >= 0
                AND released_amount >= 0
                AND (confirmed_amount + released_amount) <= amount
            );
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_quota_res_provider_idempotency
    ON public.quota_reservations (provider, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quota_res_provider_cycle_status
    ON public.quota_reservations (provider, subscription_cycle_key, status);

CREATE INDEX IF NOT EXISTS idx_quota_res_expires_at
    ON public.quota_reservations (expires_at)
    WHERE status = 'RESERVED';

-- -----------------------------------------------------------------------------
-- 4. State Transition Guard Trigger on public.quota_reservations
--    Forbids illegal terminal transitions (CONFIRMED <-> RELEASED/ROLLED_BACK)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.salmo_enforce_quota_reservation_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF OLD.status = 'CONFIRMED' AND NEW.status <> 'CONFIRMED' THEN
        RAISE EXCEPTION 'INVALID_STATE_TRANSITION: reservation % cannot transition from CONFIRMED to %', OLD.id, NEW.status
            USING ERRCODE = 'P0001';
    END IF;

    IF OLD.status IN ('RELEASED', 'ROLLED_BACK') AND NEW.status NOT IN ('RELEASED', 'ROLLED_BACK') THEN
        RAISE EXCEPTION 'INVALID_STATE_TRANSITION: reservation % cannot transition from % to %', OLD.id, OLD.status, NEW.status
            USING ERRCODE = 'P0001';
    END IF;

    IF NEW.confirmed_amount < OLD.confirmed_amount THEN
        RAISE EXCEPTION 'INVALID_STATE_TRANSITION: confirmed_amount cannot decrease (% -> %) on reservation %',
            OLD.confirmed_amount, NEW.confirmed_amount, OLD.id
            USING ERRCODE = 'P0001';
    END IF;

    IF NEW.released_amount < OLD.released_amount THEN
        RAISE EXCEPTION 'INVALID_STATE_TRANSITION: released_amount cannot decrease (% -> %) on reservation %',
            OLD.released_amount, NEW.released_amount, OLD.id
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_salmo_quota_res_transition ON public.quota_reservations;
CREATE TRIGGER trg_salmo_quota_res_transition
    BEFORE UPDATE ON public.quota_reservations
    FOR EACH ROW
    EXECUTE FUNCTION public.salmo_enforce_quota_reservation_transition();

-- -----------------------------------------------------------------------------
-- 5. RPC 1: public.salmo_sync_oddspapi_quota_cycle
--    Reconciles /v4/account snapshot against public.quota_state monotonically
--    within the same subscription cycle, or initializes a new cycle on rollover.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.salmo_sync_oddspapi_quota_cycle(
    p_subscription_cycle_key TEXT,
    p_provider_count INTEGER,
    p_provider_limit INTEGER DEFAULT 250,
    p_mandatory_reserve INTEGER DEFAULT 50,
    p_period_start TIMESTAMPTZ DEFAULT NULL,
    p_period_end TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_state public.quota_state%ROWTYPE;
    v_effective_reserve INTEGER;
    v_operational_ceiling INTEGER;
    v_reserve_pct INTEGER;
    v_period_start TIMESTAMPTZ;
    v_period_end TIMESTAMPTZ;
    v_cycle_rollover BOOLEAN := FALSE;
BEGIN
    IF p_subscription_cycle_key IS NULL OR btrim(p_subscription_cycle_key) = '' THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error_code', 'INVALID_CYCLE_KEY',
            'reason', 'p_subscription_cycle_key must be a non-empty string.'
        );
    END IF;

    IF p_provider_count IS NULL OR p_provider_count < 0 OR p_provider_limit IS NULL OR p_provider_limit <= 0 OR COALESCE(p_mandatory_reserve, 50) < 0 THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error_code', 'INVALID_AMOUNT',
            'reason', 'Provider count, limit, and reserve must be valid non-negative integers.'
        );
    END IF;

    v_effective_reserve := GREATEST(COALESCE(p_mandatory_reserve, 50), 25);
    v_operational_ceiling := LEAST(
        FLOOR(p_provider_limit * 0.90)::integer,
        GREATEST(0, p_provider_limit - v_effective_reserve)
    );
    v_reserve_pct := LEAST(100, GREATEST(0, ROUND((v_effective_reserve::numeric / p_provider_limit::numeric) * 100)::integer));
    v_period_start := COALESCE(p_period_start, date_trunc('day', NOW()));
    v_period_end := COALESCE(p_period_end, v_period_start + INTERVAL '30 days');

    -- Lock #1: Lock matching cycle row or latest oddspapi row FOR UPDATE
    SELECT * INTO v_state
    FROM public.quota_state
    WHERE provider = 'oddspapi'
      AND quota_type = 'MONTHLY'
    ORDER BY
        CASE WHEN subscription_cycle_key = p_subscription_cycle_key THEN 0 ELSE 1 END,
        period_start DESC,
        updated_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.quota_state (
            provider, quota_type, period_start, period_end,
            limit_value, safe_limit, safety_reserve_pct,
            consumed, reserved, subscription_cycle_key,
            mandatory_reserve, operational_ceiling,
            last_account_sync_at, last_provider_request_count,
            schema_version
        )
        VALUES (
            'oddspapi', 'MONTHLY', v_period_start, v_period_end,
            p_provider_limit, v_operational_ceiling, v_reserve_pct,
            p_provider_count, 0, p_subscription_cycle_key,
            v_effective_reserve, v_operational_ceiling,
            NOW(), p_provider_count,
            'salmo_p0_atomic_v1'
        )
        RETURNING * INTO v_state;
    ELSIF v_state.subscription_cycle_key IS NULL
       OR v_state.subscription_cycle_key LIKE 'LEGACY_PERIOD:%'
       OR v_state.subscription_cycle_key = p_subscription_cycle_key THEN
        -- Same subscription cycle (or legacy row adoption): NEVER lower consumed on stale provider snapshot
        UPDATE public.quota_state
        SET subscription_cycle_key = p_subscription_cycle_key,
            consumed = GREATEST(v_state.consumed, p_provider_count),
            limit_value = p_provider_limit,
            mandatory_reserve = v_effective_reserve,
            operational_ceiling = v_operational_ceiling,
            safe_limit = v_operational_ceiling,
            safety_reserve_pct = v_reserve_pct,
            last_account_sync_at = NOW(),
            last_provider_request_count = p_provider_count,
            schema_version = 'salmo_p0_atomic_v1',
            updated_at = NOW()
        WHERE id = v_state.id
        RETURNING * INTO v_state;
    ELSE
        -- Genuine subscription cycle rollover: reset consumed/reserved for the new subscription cycle
        v_cycle_rollover := TRUE;
        UPDATE public.quota_state
        SET subscription_cycle_key = p_subscription_cycle_key,
            period_start = v_period_start,
            period_end = v_period_end,
            consumed = p_provider_count,
            reserved = 0,
            limit_value = p_provider_limit,
            mandatory_reserve = v_effective_reserve,
            operational_ceiling = v_operational_ceiling,
            safe_limit = v_operational_ceiling,
            safety_reserve_pct = v_reserve_pct,
            last_account_sync_at = NOW(),
            last_provider_request_count = p_provider_count,
            schema_version = 'salmo_p0_atomic_v1',
            updated_at = NOW()
        WHERE id = v_state.id
        RETURNING * INTO v_state;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'error_code', null,
        'cycle_rollover', v_cycle_rollover,
        'state', jsonb_build_object(
            'subscription_cycle_key', v_state.subscription_cycle_key,
            'consumed', v_state.consumed,
            'reserved', v_state.reserved,
            'limit_value', v_state.limit_value,
            'mandatory_reserve', v_state.mandatory_reserve,
            'operational_ceiling', v_state.operational_ceiling,
            'operational_remaining', GREATEST(0, v_state.operational_ceiling - v_state.consumed - v_state.reserved)
        )
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. RPC 2: public.salmo_reserve_oddspapi_quota
--    Atomically checks operational ceiling under row-level FOR UPDATE lock,
--    enforces subscription cycle & idempotency, and creates a RESERVED row.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.salmo_reserve_oddspapi_quota(
    p_amount INTEGER,
    p_endpoint TEXT,
    p_idempotency_key TEXT,
    p_subscription_cycle_key TEXT DEFAULT NULL,
    p_mandatory_reserve INTEGER DEFAULT 50,
    p_hard_stop_ratio NUMERIC DEFAULT 0.90,
    p_ttl_seconds INTEGER DEFAULT 600,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_state public.quota_state%ROWTYPE;
    v_existing public.quota_reservations%ROWTYPE;
    v_effective_reserve INTEGER;
    v_ratio_ceiling INTEGER;
    v_reserve_ceiling INTEGER;
    v_operational_ceiling INTEGER;
    v_committed INTEGER;
    v_operational_remaining INTEGER;
    v_reservation_id UUID;
    v_effective_cycle_key TEXT;
BEGIN
    -- 1. Validate request amount and idempotency key
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error_code', 'INVALID_AMOUNT',
            'reason', format('INVALID_AMOUNT: reservation amount must be a positive integer, got %s.', COALESCE(p_amount::text, 'NULL'))
        );
    END IF;

    IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error_code', 'INVALID_IDEMPOTENCY_KEY',
            'reason', 'INVALID_IDEMPOTENCY_KEY: non-empty deterministic p_idempotency_key is required.'
        );
    END IF;

    -- 2. Lock #1: Acquire row-level lock on public.quota_state FIRST (deterministic lock order)
    SELECT * INTO v_state
    FROM public.quota_state
    WHERE provider = 'oddspapi'
      AND quota_type = 'MONTHLY'
    ORDER BY
        CASE
            WHEN p_subscription_cycle_key IS NOT NULL AND subscription_cycle_key = p_subscription_cycle_key THEN 0
            ELSE 1
        END,
        period_start DESC,
        updated_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error_code', 'MISSING_QUOTA_STATE',
            'reason', 'MISSING_QUOTA_STATE: no public.quota_state row exists for oddspapi; failing closed.'
        );
    END IF;

    -- 3. Subscription-cycle integrity verification
    IF p_subscription_cycle_key IS NOT NULL
       AND btrim(p_subscription_cycle_key) <> ''
       AND v_state.subscription_cycle_key IS NOT NULL
       AND v_state.subscription_cycle_key NOT LIKE 'LEGACY_PERIOD:%'
       AND v_state.subscription_cycle_key <> p_subscription_cycle_key THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error_code', 'STALE_SUBSCRIPTION_CYCLE',
            'reason', format(
                'STALE_SUBSCRIPTION_CYCLE: caller cycle %s does not match active quota_state cycle %s.',
                p_subscription_cycle_key,
                v_state.subscription_cycle_key
            ),
            'active_subscription_cycle_key', v_state.subscription_cycle_key
        );
    END IF;

    -- 4. Lock #2: Check idempotency key on public.quota_reservations under lock
    SELECT * INTO v_existing
    FROM public.quota_reservations
    WHERE provider = 'oddspapi'
      AND (idempotency_key = p_idempotency_key OR request_id = p_idempotency_key)
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'ok', v_existing.status IN ('RESERVED', 'CONFIRMED'),
            'idempotent_replay', true,
            'error_code', 'DUPLICATE_IDEMPOTENCY_KEY',
            'reason', format('Idempotent replay for key %s (existing status=%s).', p_idempotency_key, v_existing.status),
            'reservation_id', v_existing.id,
            'status', v_existing.status,
            'amount', v_existing.amount,
            'confirmed_amount', v_existing.confirmed_amount,
            'released_amount', v_existing.released_amount,
            'consumed', v_state.consumed,
            'reserved', v_state.reserved,
            'limit_value', v_state.limit_value,
            'operational_ceiling', v_state.operational_ceiling
        );
    END IF;

    -- 5. Compute operational ceiling inside the database transaction
    v_effective_reserve := GREATEST(
        COALESCE(v_state.mandatory_reserve, 50),
        COALESCE(p_mandatory_reserve, 50),
        25
    );
    v_ratio_ceiling := FLOOR(v_state.limit_value * COALESCE(p_hard_stop_ratio, 0.90))::integer;
    v_reserve_ceiling := GREATEST(0, v_state.limit_value - v_effective_reserve);
    v_operational_ceiling := LEAST(v_ratio_ceiling, v_reserve_ceiling);
    v_committed := v_state.consumed + v_state.reserved;
    v_operational_remaining := GREATEST(0, v_operational_ceiling - v_committed);

    IF (v_committed + p_amount) > v_operational_ceiling THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error_code', 'QUOTA_EXHAUSTED',
            'reason', format(
                'QUOTA_EXHAUSTED: requested %s unit(s) exceeds operational remaining %s (consumed=%s, reserved=%s, operational_ceiling=%s, limit_value=%s, mandatory_reserve=%s).',
                p_amount,
                v_operational_remaining,
                v_state.consumed,
                v_state.reserved,
                v_operational_ceiling,
                v_state.limit_value,
                v_effective_reserve
            ),
            'consumed', v_state.consumed,
            'reserved', v_state.reserved,
            'limit_value', v_state.limit_value,
            'operational_ceiling', v_operational_ceiling,
            'mandatory_reserve', v_effective_reserve,
            'operational_remaining', v_operational_remaining
        );
    END IF;

    v_effective_cycle_key := COALESCE(
        NULLIF(btrim(p_subscription_cycle_key), ''),
        v_state.subscription_cycle_key,
        'LEGACY_PERIOD:' || v_state.period_start::text
    );

    -- 6. Increment reserved in public.quota_state
    UPDATE public.quota_state
    SET reserved = reserved + p_amount,
        mandatory_reserve = v_effective_reserve,
        operational_ceiling = v_operational_ceiling,
        safe_limit = v_operational_ceiling,
        subscription_cycle_key = v_effective_cycle_key,
        updated_at = NOW()
    WHERE id = v_state.id
    RETURNING * INTO v_state;

    -- 7. Insert RESERVED row into public.quota_reservations
    INSERT INTO public.quota_reservations (
        provider,
        quota_type,
        period_start,
        amount,
        confirmed_amount,
        released_amount,
        status,
        endpoint,
        request_id,
        idempotency_key,
        subscription_cycle_key,
        billing_outcome,
        metadata,
        expires_at,
        created_at,
        updated_at
    )
    VALUES (
        'oddspapi',
        v_state.quota_type,
        v_state.period_start,
        p_amount,
        0,
        0,
        'RESERVED',
        COALESCE(p_endpoint, 'unknown'),
        p_idempotency_key,
        p_idempotency_key,
        v_effective_cycle_key,
        'PENDING',
        COALESCE(p_metadata, '{}'::jsonb),
        NOW() + make_interval(secs => GREATEST(COALESCE(p_ttl_seconds, 600), 30)),
        NOW(),
        NOW()
    )
    RETURNING id INTO v_reservation_id;

    RETURN jsonb_build_object(
        'ok', true,
        'idempotent_replay', false,
        'error_code', null,
        'reservation_id', v_reservation_id,
        'status', 'RESERVED',
        'amount', p_amount,
        'consumed', v_state.consumed,
        'reserved', v_state.reserved,
        'limit_value', v_state.limit_value,
        'operational_ceiling', v_state.operational_ceiling,
        'mandatory_reserve', v_state.mandatory_reserve,
        'operational_remaining', GREATEST(0, v_state.operational_ceiling - v_state.consumed - v_state.reserved),
        'subscription_cycle_key', v_effective_cycle_key
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. RPC 3: public.salmo_confirm_oddspapi_quota
--    Atomically confirms full or partial billable reservation usage.
--    Supports step-level idempotency and partial batch settlement
--    (p_confirmed_amount + p_released_amount).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.salmo_confirm_oddspapi_quota(
    p_reservation_id UUID,
    p_confirmed_amount INTEGER DEFAULT NULL,
    p_released_amount INTEGER DEFAULT 0,
    p_http_status INTEGER DEFAULT 200,
    p_billing_outcome TEXT DEFAULT 'SUCCESS_2XX',
    p_step_key TEXT DEFAULT NULL,
    p_error_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_lookup public.quota_reservations%ROWTYPE;
    v_state public.quota_state%ROWTYPE;
    v_res public.quota_reservations%ROWTYPE;
    v_unsettled INTEGER;
    v_inc_confirmed INTEGER;
    v_inc_released INTEGER;
    v_total_delta INTEGER;
    v_new_confirmed INTEGER;
    v_new_released INTEGER;
    v_is_fully_settled BOOLEAN;
    v_next_status VARCHAR(20);
    v_next_outcome TEXT;
    v_settled_steps JSONB;
BEGIN
    IF p_reservation_id IS NULL THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error_code', 'RESERVATION_NOT_FOUND',
            'reason', 'p_reservation_id is required.'
        );
    END IF;

    -- Non-locking lookup to identify parent quota_state key
    SELECT * INTO v_lookup
    FROM public.quota_reservations
    WHERE id = p_reservation_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error_code', 'RESERVATION_NOT_FOUND',
            'reason', format('RESERVATION_NOT_FOUND: reservation %s does not exist.', p_reservation_id)
        );
    END IF;

    -- Lock #1: Lock parent public.quota_state row FIRST (deterministic lock order)
    SELECT * INTO v_state
    FROM public.quota_state
    WHERE provider = v_lookup.provider
      AND quota_type = v_lookup.quota_type
    ORDER BY
        CASE
            WHEN v_lookup.subscription_cycle_key IS NOT NULL AND subscription_cycle_key = v_lookup.subscription_cycle_key THEN 0
            WHEN period_start = v_lookup.period_start THEN 1
            ELSE 2
        END,
        period_start DESC,
        updated_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error_code', 'MISSING_QUOTA_STATE',
            'reason', 'MISSING_QUOTA_STATE: parent quota_state row not found.'
        );
    END IF;

    -- Lock #2: Lock public.quota_reservations row SECOND
    SELECT * INTO v_res
    FROM public.quota_reservations
    WHERE id = p_reservation_id
    FOR UPDATE;

    -- Reject illegal transition from RELEASED/ROLLED_BACK -> CONFIRMED
    IF v_res.status IN ('RELEASED', 'ROLLED_BACK') THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error_code', 'INVALID_STATE_TRANSITION',
            'reason', format('INVALID_STATE_TRANSITION: cannot confirm reservation %s in terminal status %s.', p_reservation_id, v_res.status),
            'status', v_res.status,
            'consumed', v_state.consumed,
            'reserved', v_state.reserved
        );
    END IF;

    -- Idempotent replay if already CONFIRMED
    IF v_res.status = 'CONFIRMED' THEN
        RETURN jsonb_build_object(
            'ok', true,
            'idempotent_replay', true,
            'error_code', 'ALREADY_CONFIRMED',
            'reservation_id', v_res.id,
            'status', v_res.status,
            'confirmed_amount', v_res.confirmed_amount,
            'released_amount', v_res.released_amount,
            'consumed', v_state.consumed,
            'reserved', v_state.reserved
        );
    END IF;

    -- Step-level idempotency check for multi-request batch reservations
    v_settled_steps := COALESCE(v_res.metadata->'settled_steps', '[]'::jsonb);
    IF p_step_key IS NOT NULL AND btrim(p_step_key) <> '' AND v_settled_steps ? p_step_key THEN
        RETURN jsonb_build_object(
            'ok', true,
            'idempotent_replay', true,
            'error_code', 'ALREADY_CONFIRMED',
            'reservation_id', v_res.id,
            'status', v_res.status,
            'confirmed_amount', v_res.confirmed_amount,
            'released_amount', v_res.released_amount,
            'consumed', v_state.consumed,
            'reserved', v_state.reserved
        );
    END IF;

    v_unsettled := v_res.amount - v_res.confirmed_amount - v_res.released_amount;
    v_inc_confirmed := COALESCE(p_confirmed_amount, v_unsettled);
    v_inc_released := COALESCE(p_released_amount, 0);
    v_total_delta := v_inc_confirmed + v_inc_released;

    IF v_inc_confirmed < 0 OR v_inc_released < 0 OR v_total_delta <= 0 OR v_total_delta > v_unsettled THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error_code', 'INVALID_AMOUNT',
            'reason', format(
                'INVALID_AMOUNT: cannot settle confirmed=%s + released=%s against unsettled=%s (total amount=%s).',
                v_inc_confirmed, v_inc_released, v_unsettled, v_res.amount
            )
        );
    END IF;

    v_new_confirmed := v_res.confirmed_amount + v_inc_confirmed;
    v_new_released := v_res.released_amount + v_inc_released;
    v_is_fully_settled := ((v_new_confirmed + v_new_released) = v_res.amount);

    IF v_is_fully_settled THEN
        IF v_new_confirmed > 0 THEN
            v_next_status := 'CONFIRMED';
        ELSE
            v_next_status := 'RELEASED';
        END IF;
    ELSE
        v_next_status := 'RESERVED';
    END IF;

    IF v_is_fully_settled AND v_new_confirmed > 0 AND v_new_released > 0 THEN
        v_next_outcome := 'PARTIAL_BATCH_SETTLED';
    ELSIF p_http_status IS NOT NULL AND p_http_status >= 500 THEN
        v_next_outcome := COALESCE(NULLIF(p_billing_outcome, 'SUCCESS_2XX'), 'BILLABLE_SERVER_ERROR');
    ELSIF p_http_status IS NOT NULL AND p_http_status >= 400 THEN
        v_next_outcome := COALESCE(NULLIF(p_billing_outcome, 'SUCCESS_2XX'), 'BILLABLE_CLIENT_ERROR');
    ELSE
        v_next_outcome := COALESCE(p_billing_outcome, 'SUCCESS_2XX');
    END IF;

    IF p_step_key IS NOT NULL AND btrim(p_step_key) <> '' THEN
        v_settled_steps := v_settled_steps || to_jsonb(p_step_key);
    END IF;

    -- Update reservation row
    UPDATE public.quota_reservations
    SET confirmed_amount = v_new_confirmed,
        released_amount = v_new_released,
        status = v_next_status,
        http_status = COALESCE(p_http_status, http_status),
        billing_outcome = v_next_outcome,
        error_code = COALESCE(p_error_code, error_code),
        metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{settled_steps}', v_settled_steps, true),
        resolved_at = CASE WHEN v_is_fully_settled THEN NOW() ELSE resolved_at END,
        updated_at = NOW()
    WHERE id = v_res.id
    RETURNING * INTO v_res;

    -- Update parent quota_state row atomically
    UPDATE public.quota_state
    SET consumed = consumed + v_inc_confirmed,
        reserved = GREATEST(0, reserved - v_total_delta),
        updated_at = NOW()
    WHERE id = v_state.id
    RETURNING * INTO v_state;

    RETURN jsonb_build_object(
        'ok', true,
        'idempotent_replay', false,
        'error_code', null,
        'reservation_id', v_res.id,
        'status', v_res.status,
        'amount', v_res.amount,
        'confirmed_amount', v_res.confirmed_amount,
        'released_amount', v_res.released_amount,
        'billing_outcome', v_res.billing_outcome,
        'consumed', v_state.consumed,
        'reserved', v_state.reserved,
        'limit_value', v_state.limit_value,
        'operational_ceiling', v_state.operational_ceiling,
        'operational_remaining', GREATEST(0, v_state.operational_ceiling - v_state.consumed - v_state.reserved)
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. RPC 4: public.salmo_release_oddspapi_quota
--    Atomically releases unbilled reservation units ONLY when the request is
--    genuinely unbilled (pre-request abort, HTTP 401, or HTTP 429).
--    If called with a billable HTTP status (200, 4xx/5xx except 401/429) or
--    p_is_ambiguous_transport = true, refuses free release and charges the unit!
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.salmo_release_oddspapi_quota(
    p_reservation_id UUID,
    p_released_amount INTEGER DEFAULT NULL,
    p_http_status INTEGER DEFAULT NULL,
    p_is_ambiguous_transport BOOLEAN DEFAULT FALSE,
    p_billing_outcome TEXT DEFAULT 'PRE_REQUEST_ABORT',
    p_error_code TEXT DEFAULT NULL,
    p_step_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_lookup public.quota_reservations%ROWTYPE;
    v_state public.quota_state%ROWTYPE;
    v_res public.quota_reservations%ROWTYPE;
    v_unsettled INTEGER;
    v_inc_released INTEGER;
    v_new_released INTEGER;
    v_is_fully_settled BOOLEAN;
    v_next_status VARCHAR(20);
    v_next_outcome TEXT;
    v_confirm_res JSONB;
    v_settled_steps JSONB;
BEGIN
    IF p_reservation_id IS NULL THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error_code', 'RESERVATION_NOT_FOUND',
            'reason', 'p_reservation_id is required.'
        );
    END IF;

    -- Official Billing Safety Guard inside SQL:
    -- 1) HTTP 2xx/4xx/5xx (other than 401/429) reached the endpoint and IS billed.
    -- 2) Ambiguous post-dispatch transport failures (timeouts after dispatch) MUST be charged
    --    for worst-case quota safety rather than released as free.
    IF COALESCE(p_is_ambiguous_transport, false) = TRUE
       OR (p_http_status IS NOT NULL AND p_http_status >= 200 AND p_http_status < 600 AND p_http_status NOT IN (401, 429)) THEN
        v_confirm_res := public.salmo_confirm_oddspapi_quota(
            p_reservation_id => p_reservation_id,
            p_confirmed_amount => p_released_amount,
            p_released_amount => 0,
            p_http_status => p_http_status,
            p_billing_outcome => CASE
                WHEN COALESCE(p_is_ambiguous_transport, false) = TRUE THEN 'AMBIGUOUS_TRANSPORT_CHARGED'
                WHEN p_http_status >= 500 THEN 'BILLABLE_SERVER_ERROR'
                ELSE 'BILLABLE_CLIENT_ERROR'
            END,
            p_step_key => p_step_key,
            p_error_code => COALESCE(p_error_code, 'BILLABLE_RELEASE_REFUSED')
        );
        RETURN v_confirm_res || jsonb_build_object('converted_to_billable_confirm', true);
    END IF;

    -- Non-locking lookup to identify parent quota_state key
    SELECT * INTO v_lookup
    FROM public.quota_reservations
    WHERE id = p_reservation_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error_code', 'RESERVATION_NOT_FOUND',
            'reason', format('RESERVATION_NOT_FOUND: reservation %s does not exist.', p_reservation_id)
        );
    END IF;

    -- Lock #1: Lock parent public.quota_state row FIRST (deterministic lock order)
    SELECT * INTO v_state
    FROM public.quota_state
    WHERE provider = v_lookup.provider
      AND quota_type = v_lookup.quota_type
    ORDER BY
        CASE
            WHEN v_lookup.subscription_cycle_key IS NOT NULL AND subscription_cycle_key = v_lookup.subscription_cycle_key THEN 0
            WHEN period_start = v_lookup.period_start THEN 1
            ELSE 2
        END,
        period_start DESC,
        updated_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error_code', 'MISSING_QUOTA_STATE',
            'reason', 'MISSING_QUOTA_STATE: parent quota_state row not found.'
        );
    END IF;

    -- Lock #2: Lock public.quota_reservations row SECOND
    SELECT * INTO v_res
    FROM public.quota_reservations
    WHERE id = p_reservation_id
    FOR UPDATE;

    -- Reject illegal transition from CONFIRMED -> RELEASED
    IF v_res.status = 'CONFIRMED' THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error_code', 'INVALID_STATE_TRANSITION',
            'reason', format('INVALID_STATE_TRANSITION: cannot release reservation %s because it is already CONFIRMED.', p_reservation_id),
            'status', v_res.status,
            'consumed', v_state.consumed,
            'reserved', v_state.reserved
        );
    END IF;

    -- Idempotent replay if already RELEASED or ROLLED_BACK
    IF v_res.status IN ('RELEASED', 'ROLLED_BACK') THEN
        RETURN jsonb_build_object(
            'ok', true,
            'idempotent_replay', true,
            'converted_to_billable_confirm', false,
            'error_code', 'ALREADY_RELEASED',
            'reservation_id', v_res.id,
            'status', v_res.status,
            'confirmed_amount', v_res.confirmed_amount,
            'released_amount', v_res.released_amount,
            'consumed', v_state.consumed,
            'reserved', v_state.reserved
        );
    END IF;

    -- Step-level idempotency check for multi-request batch reservations
    v_settled_steps := COALESCE(v_res.metadata->'settled_steps', '[]'::jsonb);
    IF p_step_key IS NOT NULL AND btrim(p_step_key) <> '' AND v_settled_steps ? p_step_key THEN
        RETURN jsonb_build_object(
            'ok', true,
            'idempotent_replay', true,
            'converted_to_billable_confirm', false,
            'error_code', 'ALREADY_RELEASED',
            'reservation_id', v_res.id,
            'status', v_res.status,
            'confirmed_amount', v_res.confirmed_amount,
            'released_amount', v_res.released_amount,
            'consumed', v_state.consumed,
            'reserved', v_state.reserved
        );
    END IF;

    v_unsettled := v_res.amount - v_res.confirmed_amount - v_res.released_amount;
    v_inc_released := COALESCE(p_released_amount, v_unsettled);

    IF v_inc_released <= 0 OR v_inc_released > v_unsettled THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error_code', 'INVALID_AMOUNT',
            'reason', format('INVALID_AMOUNT: cannot release %s unit(s) when unsettled=%s.', v_inc_released, v_unsettled)
        );
    END IF;

    v_new_released := v_res.released_amount + v_inc_released;
    v_is_fully_settled := ((v_res.confirmed_amount + v_new_released) = v_res.amount);

    IF v_is_fully_settled THEN
        IF v_res.confirmed_amount > 0 THEN
            v_next_status := 'CONFIRMED';
        ELSE
            v_next_status := 'RELEASED';
        END IF;
    ELSE
        v_next_status := 'RESERVED';
    END IF;

    IF v_is_fully_settled AND v_res.confirmed_amount > 0 THEN
        v_next_outcome := 'PARTIAL_BATCH_SETTLED';
    ELSIF p_http_status = 401 THEN
        v_next_outcome := 'FREE_401_UNAUTHORIZED';
    ELSIF p_http_status = 429 THEN
        v_next_outcome := 'FREE_429_RATE_LIMITED';
    ELSE
        v_next_outcome := COALESCE(p_billing_outcome, 'PRE_REQUEST_ABORT');
    END IF;

    IF p_step_key IS NOT NULL AND btrim(p_step_key) <> '' THEN
        v_settled_steps := v_settled_steps || to_jsonb(p_step_key);
    END IF;

    -- Update reservation row
    UPDATE public.quota_reservations
    SET released_amount = v_new_released,
        status = v_next_status,
        http_status = COALESCE(p_http_status, http_status),
        billing_outcome = v_next_outcome,
        error_code = COALESCE(p_error_code, error_code),
        metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{settled_steps}', v_settled_steps, true),
        resolved_at = CASE WHEN v_is_fully_settled THEN NOW() ELSE resolved_at END,
        updated_at = NOW()
    WHERE id = v_res.id
    RETURNING * INTO v_res;

    -- Update parent quota_state row atomically
    UPDATE public.quota_state
    SET reserved = GREATEST(0, reserved - v_inc_released),
        updated_at = NOW()
    WHERE id = v_state.id
    RETURNING * INTO v_state;

    RETURN jsonb_build_object(
        'ok', true,
        'idempotent_replay', false,
        'converted_to_billable_confirm', false,
        'error_code', null,
        'reservation_id', v_res.id,
        'status', v_res.status,
        'amount', v_res.amount,
        'confirmed_amount', v_res.confirmed_amount,
        'released_amount', v_res.released_amount,
        'billing_outcome', v_res.billing_outcome,
        'consumed', v_state.consumed,
        'reserved', v_state.reserved,
        'limit_value', v_state.limit_value,
        'operational_ceiling', v_state.operational_ceiling,
        'operational_remaining', GREATEST(0, v_state.operational_ceiling - v_state.consumed - v_state.reserved)
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 9. RPC 5: public.salmo_cleanup_stale_oddspapi_reservations
--    Recovers expired RESERVED rows using deterministic lock ordering
--    (public.quota_state FIRST, public.quota_reservations SECOND).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.salmo_cleanup_stale_oddspapi_reservations(
    p_stale_seconds INTEGER DEFAULT 600
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_state public.quota_state%ROWTYPE;
    v_res RECORD;
    v_unsettled INTEGER;
    v_total_recovered INTEGER := 0;
    v_rows_recovered INTEGER := 0;
BEGIN
    -- Lock #1: Lock oddspapi quota_state row FIRST
    SELECT * INTO v_state
    FROM public.quota_state
    WHERE provider = 'oddspapi'
      AND quota_type = 'MONTHLY'
    ORDER BY period_start DESC, updated_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', true, 'rows_recovered', 0, 'units_recovered', 0);
    END IF;

    -- Lock #2: Lock expired RESERVED rows SECOND
    FOR v_res IN
        SELECT id, amount, confirmed_amount, released_amount
        FROM public.quota_reservations
        WHERE provider = 'oddspapi'
          AND status = 'RESERVED'
          AND (
              (expires_at IS NOT NULL AND expires_at < NOW())
              OR created_at < NOW() - make_interval(secs => GREATEST(COALESCE(p_stale_seconds, 600), 30))
          )
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
    LOOP
        v_unsettled := GREATEST(0, v_res.amount - v_res.confirmed_amount - v_res.released_amount);

        UPDATE public.quota_reservations
        SET released_amount = v_res.released_amount + v_unsettled,
            status = CASE WHEN v_res.confirmed_amount > 0 THEN 'CONFIRMED' ELSE 'RELEASED' END,
            billing_outcome = CASE WHEN v_res.confirmed_amount > 0 THEN 'PARTIAL_BATCH_SETTLED' ELSE 'STALE_EXPIRED_RELEASED' END,
            error_code = 'STALE_RESERVATION_EXPIRED',
            resolved_at = NOW(),
            updated_at = NOW()
        WHERE id = v_res.id;

        v_total_recovered := v_total_recovered + v_unsettled;
        v_rows_recovered := v_rows_recovered + 1;
    END LOOP;

    IF v_total_recovered > 0 THEN
        UPDATE public.quota_state
        SET reserved = GREATEST(0, reserved - v_total_recovered),
            updated_at = NOW()
        WHERE id = v_state.id
        RETURNING * INTO v_state;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'rows_recovered', v_rows_recovered,
        'units_recovered', v_total_recovered,
        'consumed', v_state.consumed,
        'reserved', v_state.reserved
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 10. Security Hardening: RLS & Function Execution Grants (Least Privilege)
-- -----------------------------------------------------------------------------
ALTER TABLE public.quota_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quota_reservations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.quota_state FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.quota_reservations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.quota_state TO service_role;
GRANT ALL ON TABLE public.quota_reservations TO service_role;

REVOKE ALL ON FUNCTION public.salmo_enforce_quota_reservation_transition() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.salmo_sync_oddspapi_quota_cycle(TEXT, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.salmo_reserve_oddspapi_quota(INTEGER, TEXT, TEXT, TEXT, INTEGER, NUMERIC, INTEGER, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.salmo_confirm_oddspapi_quota(UUID, INTEGER, INTEGER, INTEGER, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.salmo_release_oddspapi_quota(UUID, INTEGER, INTEGER, BOOLEAN, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.salmo_cleanup_stale_oddspapi_reservations(INTEGER) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.salmo_sync_oddspapi_quota_cycle(TEXT, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.salmo_reserve_oddspapi_quota(INTEGER, TEXT, TEXT, TEXT, INTEGER, NUMERIC, INTEGER, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.salmo_confirm_oddspapi_quota(UUID, INTEGER, INTEGER, INTEGER, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.salmo_release_oddspapi_quota(UUID, INTEGER, INTEGER, BOOLEAN, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.salmo_cleanup_stale_oddspapi_reservations(INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
