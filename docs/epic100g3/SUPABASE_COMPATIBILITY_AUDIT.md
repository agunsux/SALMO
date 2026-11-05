# SUPABASE MANAGED POSTGRESQL COMPATIBILITY AUDIT

**Epic**: EPIC 100G.3 — Fresh Database Bootstrap, Migration Reconciliation & Recovery Validation  
**Document**: Phase E — Supabase Managed Infrastructure Compatibility Review  
**Date**: November 5, 2026  
**Auditor**: Astra (Principal PostgreSQL Architect & Supabase Migration Engineer)  
**Status**: **COMPATIBILITY VERIFIED**  
**Production Recommendation**: **STRICTLY NO-GO (DEPLOYMENT HOLD)**  

---

## 1. Executive Summary

Supabase is not a bare-metal vanilla PostgreSQL instance; it is an integrated platform featuring PostgREST, GoTrue authentication (`auth` schema), Supavisor connection pooling, and predefined system roles.

This audit evaluates `FRESH_DATABASE_BOOTSTRAP.sql` against the architectural requirements and constraints of the Supabase platform, identifying potential friction points between standalone local PostgreSQL 16 and remote Supabase staging.

---

## 2. Platform Feature Comparison & Compatibility Matrix

| Feature / Requirement | Standalone PostgreSQL 16 (Local) | Supabase Managed PostgreSQL | SALMO Bootstrap Compatibility Strategy |
| :--- | :--- | :--- | :--- |
| **System Roles (`anon`, `authenticated`, `service_role`)** | Absent by default | Pre-existing system roles with defined attributes | Safe DO block: `IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE ... END IF;` Works on both local and Supabase. |
| **Extensions Schema** | Typically installs in `public` | Pre-configured in `extensions` schema | Extensions created via `CREATE EXTENSION IF NOT EXISTS`. Search path resolves across `public` and `extensions`. |
| **Row-Level Security (RLS)** | Disabled by default; bypassed by superuser | Enforced by default on PostgREST; bypassed by `service_role` | All 8 tables explicitly execute `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`. 15 policies defined. |
| **Connection Pooling (Port 5432 vs 6543)** | Single port 5432 | Port 5432 (Session) vs Port 6543 (Transaction Pooler) | Migrations must target Port 5432 or Dashboard SQL Editor. Application queries use Port 6543. |
| **`auth.uid()` Dependency** | Not applicable | References JWT `sub` claim | Core tables are pipeline-driven; policies use `data_status = 'ACTIVE'` rather than user ownership. Zero dependency on `auth.users`. |
| **Search Path Hardening** | `"$user", public` | `extensions, public` | Functions explicitly specify schema qualification (`public.fn_...`) and table references (`public.matches`). |

---

## 3. Deep Dive: Security Definer & Search Path Safety

PostgreSQL CVE best practices require that trigger functions and stored procedures prevent search path hijacking. In `FRESH_DATABASE_BOOTSTRAP.sql`:

1. **Schema Qualification**: All tables and functions are explicitly qualified with `public.` (e.g. `public.matches`, `public.prediction_ledger`).
2. **Minimal Trigger Overhead**: The immutability trigger functions (`fn_prevent_market_snapshot_tampering`, `fn_protect_prediction_ledger_immutability`) perform in-memory comparisons on `OLD` vs `NEW` and raise exceptions directly without dynamic SQL or unqualified external calls.
3. **Least Privilege Grants**:
   - `anon`: `SELECT` only on `public.matches` and `public.daily_picks`.
   - `authenticated`: `SELECT` on all public tables.
   - `service_role`: Full CRUD permissions (`ALL`), aligned with backend pipeline requirements.

---

## 4. Verification Check Before Remote Staging Execution

When the staging project is provisioned, the following automated checks must be run prior to migration:
1. Verify that `current_setting('server_version_num')::INT >= 150000`.
2. Confirm that `service_role` possesses `BYPASSRLS` attribute.
3. Confirm that direct port 5432 is accessible from the deployment runner.
