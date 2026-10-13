# SALMO — P0 Atomic OddsPapi Quota Reservation Migration & Rollback Runbook

**Migration File:** `data/migrations/20261013_atomic_oddspapi_quota_reservation.sql`
**Rollback File:** `data/migrations/20261013_atomic_oddspapi_quota_reservation_rollback.sql`
**Target Schema:** `public.quota_state`, `public.quota_reservations`
**RPC Functions Introduced:**
- `public.salmo_sync_oddspapi_quota_cycle(TEXT, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ)`
- `public.salmo_reserve_oddspapi_quota(INTEGER, TEXT, TEXT, TEXT, INTEGER, NUMERIC, INTEGER, JSONB)`
- `public.salmo_confirm_oddspapi_quota(UUID, INTEGER, INTEGER, INTEGER, TEXT, TEXT, TEXT)`
- `public.salmo_release_oddspapi_quota(UUID, INTEGER, INTEGER, BOOLEAN, TEXT, TEXT, TEXT)`
- `public.salmo_cleanup_stale_oddspapi_reservations(INTEGER)`

---

## 1. Pre-Migration Backup & Verification Queries

Before applying the forward migration in any staging or production environment, run the following read-only verification queries to snapshot current quota state and active reservations:

```sql
-- 1.1 Snapshot current public.quota_state rows for oddspapi
SELECT
    id,
    provider,
    quota_type,
    period_start,
    period_end,
    limit_value,
    safe_limit,
    safety_reserve_pct,
    consumed,
    reserved,
    updated_at
FROM public.quota_state
WHERE provider = 'oddspapi'
ORDER BY period_start DESC;

-- 1.2 Snapshot active/recent reservation summary by status
SELECT
    provider,
    status,
    COUNT(*) AS reservation_count,
    COALESCE(SUM(amount), 0) AS total_amount,
    MIN(created_at) AS oldest_created_at,
    MAX(created_at) AS newest_created_at
FROM public.quota_reservations
WHERE provider = 'oddspapi'
GROUP BY provider, status
ORDER BY status;

-- 1.3 Export logical backup table in temp/audit schema (optional point-in-time copy)
CREATE TABLE IF NOT EXISTS public.quota_state_backup_20261013 AS
SELECT * FROM public.quota_state WHERE provider = 'oddspapi';
```

---

## 2. Exact Forward Migration Application Steps

1. **Verify no paid OddsPapi jobs are actively running** (or pause scheduled multi-league ingestion cron).
2. **Apply the forward migration inside a single transaction**:
   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f data/migrations/20261013_atomic_oddspapi_quota_reservation.sql
   ```
3. **What the forward migration does atomically (`BEGIN ... COMMIT`)**:
   - Adds `subscription_cycle_key`, `mandatory_reserve` (`50`), `operational_ceiling` (`200`), `last_account_sync_at`, `last_provider_request_count`, and `schema_version` (`'salmo_p0_atomic_v1'`) to `public.quota_state`.
   - Re-aligns existing `oddspapi` rows so `mandatory_reserve = 50`, `operational_ceiling = 200`, `safe_limit = 200`, and `safety_reserve_pct = 20` (remediating the `20260911` migration that set `safe_limit = 250`).
   - Adds `subscription_cycle_key`, `idempotency_key`, `confirmed_amount`, `released_amount`, `http_status`, `billing_outcome`, `error_code`, `metadata`, `expires_at`, and `updated_at` to `public.quota_reservations`.
   - Installs trigger `trg_salmo_quota_res_transition` preventing illegal terminal transitions (`CONFIRMED <-> RELEASED/ROLLED_BACK`) or decreasing `confirmed_amount` / `released_amount`.
   - Installs the 5 `SECURITY DEFINER` RPCs with `SET search_path = public, pg_temp` and revokes execution from `PUBLIC`, `anon`, and `authenticated` (granting `EXECUTE` exclusively to `service_role`).
   - Sends `NOTIFY pgrst, 'reload schema'` so PostgREST immediately exposes the new RPCs.

---

## 3. Post-Migration Verification Queries

Run the following read-only queries immediately after applying the forward migration:

```sql
-- 3.1 Verify quota_state columns and mandatory reserve alignment
SELECT
    provider,
    quota_type,
    subscription_cycle_key,
    limit_value,
    mandatory_reserve,
    operational_ceiling,
    safe_limit,
    safety_reserve_pct,
    consumed,
    reserved,
    schema_version
FROM public.quota_state
WHERE provider = 'oddspapi';
-- Expected for 250-limit plan:
-- mandatory_reserve = 50, operational_ceiling = 200, safe_limit = 200, schema_version = 'salmo_p0_atomic_v1'

-- 3.2 Verify all 5 RPC functions exist with SECURITY DEFINER and locked search_path
SELECT
    p.proname AS function_name,
    p.prosecdef AS is_security_definer,
    p.proconfig AS function_config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname LIKE 'salmo_%_oddspapi_%'
ORDER BY p.proname;

-- 3.3 Verify PUBLIC/anon/authenticated cannot execute the quota mutation RPCs
SELECT
    routine_name,
    grantee,
    privilege_type
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public'
  AND routine_name LIKE 'salmo_%_oddspapi_%'
ORDER BY routine_name, grantee;
```

---

## 4. Exact Rollback SQL & Execution Steps

If the migration must be reverted:

1. **Deploy/revert application code** to the prior commit (or leave current code in fail-closed mode while rolling back).
2. **Execute the non-destructive rollback script**:
   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f data/migrations/20261013_atomic_oddspapi_quota_reservation_rollback.sql
   ```
3. **What the rollback script guarantees**:
   - **Zero Data Loss**: Neither `public.quota_state` nor `public.quota_reservations` is dropped or truncated; all historical `CONFIRMED`, `RELEASED`, and `ROLLED_BACK` audit rows and additive columns remain intact.
   - **In-Flight Reservation Drain**: Any unsettled `RESERVED` rows for `oddspapi` are cleanly settled (`confirmed_amount > 0 -> CONFIRMED`, `confirmed_amount = 0 -> ROLLED_BACK`) and their unsettled units are subtracted from `public.quota_state.reserved`.
   - **Reserve Floor Preserved**: Keeps `safe_limit = 200` and `mandatory_reserve = 50` on `public.quota_state` so rolling back the RPCs does not re-introduce the `250/250` overrun bug.
   - **Clean Re-Application**: The forward migration (`20261013_atomic_oddspapi_quota_reservation.sql`) can be re-applied at any time without conflict.

---

## 5. Application Behavior When RPC or Database Is Temporarily Unavailable

`OddsPapiQuotaGuard` (`src/lib/quota/oddsPapiQuotaGuard.ts`) and `OddsPapiProvider` (`src/services/providers/oddsPapiProvider.ts`) are strictly **fail-closed**:

1. **When atomic RPC mode is required** (`isProductionDatabaseWriteAllowed(true)` or explicit atomic RPC mode enabled):
   - If `salmo_reserve_oddspapi_quota` fails due to network timeout, PostgREST schema cache lag, missing RPC (`PGRST202`), or database unavailability, `OddsPapiQuotaGuard.reserveQuota` immediately returns:
     ```json
     {
       "allowed": false,
       "errorCode": "DB_UNREACHABLE_BLOCK",
       "reason": "DB_UNREACHABLE_BLOCK: Atomic quota reservation RPC failed or database unreachable; failing closed."
     }
     ```
   - **Zero paid OddsPapi requests are dispatched** when `allowed === false`.
   - The application **never** falls back to local-only in-memory reservations when atomic database reservation is enabled and fails.
2. **When `salmo_confirm_oddspapi_quota` or `salmo_release_oddspapi_quota` encounters a transient DB error after a request was already reserved**:
   - The in-memory monotonic consumption floor (`localConsumedFloor` / `inMemoryConfirmedCost`) immediately records the charge in the local instance so subsequent requests in the same instance see the higher usage.
   - Any unconfirmed `RESERVED` row in `public.quota_reservations` continues to hold its `reserved` units against `operational_ceiling` (`consumed + reserved <= 200`), preventing concurrent instances from double-spending those units until reconciled or cleaned up.
