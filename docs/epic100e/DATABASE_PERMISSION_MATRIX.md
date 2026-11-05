# EPIC 100E — DATABASE ROLE PERMISSION MATRIX & SECURITY SPECIFICATION

**Scope**: Least-privilege role segregation, RLS policy design, credential boundaries, and protection against unauthorized tampering.  
**Production Status**: NO-GO (Local Validation Only; No production permissions modified).  

---

## 1. Least-Privilege Role Architecture

To protect the integrity of official decisions and historical settlement records, the database must segregate access into five distinct roles:

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                             DATABASE ROLES MATRIX                              │
├──────────────────────────┬─────────────────────────────┬───────────────────────┤
│ Role Name                │ Granted Permissions         │ Intended Service      │
├──────────────────────────┼─────────────────────────────┼───────────────────────┤
│ salmo_anon_reader        │ SELECT on public views only │ Web client, public UI │
│ salmo_app_service        │ SELECT on all, INSERT picks │ Backend API services  │
│ salmo_ledger_writer      │ INSERT on decisions, ledger │ Prediction engine     │
│ salmo_settlement_runner  │ UPDATE result columns only  │ Settlement worker     │
│ salmo_migration_owner    │ DDL, ALTER, CREATE, DROP    │ CI/CD migration runner│
└──────────────────────────┴─────────────────────────────┴───────────────────────┘
```

---

## 2. Table-by-Table Role Access Matrix

| Table / Relation | `salmo_anon_reader` | `salmo_app_service` | `salmo_ledger_writer` | `salmo_settlement_runner` | `salmo_migration_owner` |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `public.matches` | SELECT | SELECT, INSERT | SELECT, INSERT | SELECT, UPDATE (status, goals) | ALL (DDL) |
| `public.market_snapshots` | NO ACCESS | SELECT | SELECT, INSERT (no UPDATE) | SELECT | ALL (DDL) |
| `public.decisions` | NO ACCESS | SELECT | SELECT, INSERT (no UPDATE) | SELECT | ALL (DDL) |
| `public.evidence` | NO ACCESS | SELECT | SELECT, INSERT (no UPDATE) | SELECT | ALL (DDL) |
| `public.data_provenance` | NO ACCESS | SELECT | SELECT, INSERT (no UPDATE) | SELECT | ALL (DDL) |
| `public.prediction_ledger` | NO ACCESS | SELECT | SELECT, INSERT (no UPDATE) | SELECT, UPDATE (settlement cols) | ALL (DDL) |
| `public.daily_picks` | SELECT | SELECT, INSERT | SELECT, INSERT, UPDATE | SELECT, UPDATE (status, P&L) | ALL (DDL) |
| `public.settlement_results`| NO ACCESS | SELECT | NO ACCESS | SELECT, INSERT (no UPDATE) | ALL (DDL) |

---

## 3. Row-Level Security (RLS) Policy Specifications

```sql
-- Enable RLS across all canonical tables
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediction_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_picks ENABLE ROW LEVEL SECURITY;

-- 1. Daily Picks (Public projection table)
CREATE POLICY rls_daily_picks_public_select ON public.daily_picks
  FOR SELECT TO anon, authenticated USING (status IN ('ACTIVE', 'WON', 'LOST', 'PUSH', 'VOID'));

CREATE POLICY rls_daily_picks_service_all ON public.daily_picks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Matches
CREATE POLICY rls_matches_public_select ON public.matches
  FOR SELECT TO anon, authenticated USING (data_status = 'ACTIVE');

CREATE POLICY rls_matches_service_all ON public.matches
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. Market Snapshots (Strictly backend service role only)
CREATE POLICY rls_market_snapshots_service_select ON public.market_snapshots
  FOR SELECT TO service_role USING (true);

CREATE POLICY rls_market_snapshots_service_insert ON public.market_snapshots
  FOR INSERT TO service_role WITH CHECK (true);

-- 4. Decisions (Strictly backend service role only)
CREATE POLICY rls_decisions_service_select ON public.decisions
  FOR SELECT TO service_role USING (true);

CREATE POLICY rls_decisions_service_insert ON public.decisions
  FOR INSERT TO service_role WITH CHECK (true);

-- 5. Prediction Ledger (Strictly backend service role only)
CREATE POLICY rls_prediction_ledger_service_select ON public.prediction_ledger
  FOR SELECT TO service_role USING (true);

CREATE POLICY rls_prediction_ledger_service_insert ON public.prediction_ledger
  FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY rls_prediction_ledger_service_update ON public.prediction_ledger
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- 6. Settlement Results (Strictly backend service role only)
CREATE POLICY rls_settlement_results_service_select ON public.settlement_results
  FOR SELECT TO service_role USING (true);

CREATE POLICY rls_settlement_results_service_insert ON public.settlement_results
  FOR INSERT TO service_role WITH CHECK (true);
```

---

## 4. Security Invariants & Credentials Hygiene

1. **Zero Credential Exposure**:
   - `SUPABASE_SERVICE_ROLE_KEY` and database write credentials must never be prefixed with `NEXT_PUBLIC_` or bundled into client-side JS bundles.
   - Any API route exposing database data to the web UI must use server-side rendering or sanitized route handlers (`/api/v1/...`).

2. **Database Trigger Enforcement**:
   - Even if an attacker acquires `service_role` credentials, the triggers `fn_prevent_market_snapshot_tampering`, `fn_prevent_decision_tampering`, `fn_protect_prediction_ledger_immutability`, and `fn_protect_settlement_results_immutability` operate at the database trigger layer and will reject modifications regardless of application-level permissions.

3. **No Production Permissions Altered**:
   - Per mission guidelines, all security policies and matrices are validated locally. No production database permissions were altered.
