# REMOTE STAGING SCHEMA INVENTORY & BASELINE SPECIFICATION

**Epic**: EPIC 100G.2 — Remote Staging Identity Verification & Read-Only Preflight  
**Document**: Phase B — Remote Schema Inventory & Baseline Analysis  
**Date**: November 5, 2026  
**Auditor**: Astra (Advanced Agentic Pair Programmer)  
**Status**: **REMOTE READ ACCESS BLOCKED (AWAITING PROVISIONING)**  
**Production Status**: **STRICTLY NO-GO (DEPLOYMENT HOLD)**  

---

## 1. Executive Summary & Protocol Boundary

In strict compliance with **Phase B Execution Rules**:
> *"Connect only after environment identity is proven."*  
> *"Stop immediately if staging identity is ambiguous."*

Because Phase A determined that the dedicated staging environment has not yet been provisioned and configured in `.env.local`, **no remote connection was initiated**. This fail-closed halt prevents any speculative network probing, accidental credential misrouting, or connection leakage.

This document inventories:
1. The **expected structural baseline** of a fresh Supabase PostgreSQL 16 project.
2. The **comparative inventory** between the live production schema (`rgkrfzxipkrwqccfuqfq`) and the target staging database.
3. The **read-only introspection checklist** that must be executed the moment the staging project is provisioned.

---

## 2. Supabase PostgreSQL 16 Default Structural Baseline

When the user provisions a new Supabase project (`salmo-staging`) via the Supabase Dashboard, the database is instantiated with standard Supabase infrastructure:

### 2.1. System Schemas (Standard Supabase Engine)
| Schema Name | Purpose & Ownership | Modification Policy |
| :--- | :--- | :--- |
| `public` | Application data schema (Empty on creation) | **Target for Salmo migrations** |
| `auth` | GoTrue user authentication, tokens, identities | System Managed — Read-only for migrations |
| `storage` | Supabase Storage metadata and buckets | System Managed — Read-only for migrations |
| `graphql` | pg_graphql schema generator | System Managed |
| `realtime` | Elixir Realtime CDC publication hooks | System Managed |
| `extensions` | PostgreSQL extensions installation target | Extension repository schema |
| `vault` | Supabase Vault encrypted secrets | System Managed |

### 2.2. Standard System Roles
| Role Name | Superuser / Attributes | Intended Usage in Salmo Architecture |
| :--- | :--- | :--- |
| `postgres` | Project Owner / Table Owner | Runs DDL migrations via direct port 5432 / Dashboard |
| `service_role` | `NOINHERIT`, `BYPASSRLS` | Used by Salmo backend ingestion and settlement pipelines |
| `authenticated` | `NOINHERIT`, Subject to RLS | Used by authenticated client dashboards and API callers |
| `anon` | `NOINHERIT`, Subject to RLS | Used by unauthenticated visitors (e.g. public daily picks) |
| `authenticator` | Proxy role used by PostgREST | Routes HTTP requests to `anon` or `authenticated` |
| `supabase_admin` | Internal platform maintenance role | Managed by Supabase platform infrastructure |

### 2.3. Pre-Installed Extensions
- `uuid-ossp` (installed in `extensions` schema)
- `pgcrypto` (installed in `extensions` schema)

---

## 3. Comparative Inventory: Production vs. Fresh Staging Target

The following table contrasts the existing state of the production database (`rgkrfzxipkrwqccfuqfq`, inspected via OpenAPI in EPIC 100G) with the target state of the fresh staging project:

| Database Object / Entity | Live Production (`rgkrfzxipkrwqccfuqfq`) | Fresh Staging Baseline (Pre-Migration) | Target Staging (Post-Canonical Migration) |
| :--- | :--- | :--- | :--- |
| **Total User Tables** | **200+ tables** (heavy historical warehouse & legacy schemas) | **0 tables** (clean `public` schema) | **8 core tables** (minimal, canonical, audited) |
| `matches` | Present (Legacy schema, mixed columns) | Not Present | Canonical Schema (`canonical_match_id`, kickoff sync) |
| `prediction_ledger` | Present (Legacy structure, unconstrained result_status) | Not Present | Canonical Schema (DOI unique index, immutability trigger) |
| `settlement_results` | Present (Legacy structure, lacks ledger position key) | Not Present | Canonical Schema (Ledger position unique, delete trigger) |
| `daily_picks` | Present (`active_daily_picks` + legacy `daily_picks`) | Not Present | Canonical Schema (Prediction ID unique, source scoped) |
| `market_snapshots` | **ABSENT** (Odds quotes not persisted in dedicated table) | Not Present | **NEW** (Point-in-time quotes, immutability trigger) |
| `decisions` | **ABSENT** (Evaluations not persisted in dedicated table) | Not Present | **NEW** (Point-in-time evaluation, immutability trigger) |
| `evidence` | **ABSENT** | Not Present | **NEW** (Decision supporting sample metrics) |
| `data_provenance` | **ABSENT** | Not Present | **NEW** (Calculation versions, methodology tracking) |
| **Row-Level Security (RLS)** | Partially applied across select legacy tables | Disabled (no tables) | **100% Enabled** across all 8 tables |
| **Service Role Policies** | Default bypass | Default bypass | Explicit least-privilege policies defined |

---

## 4. Remote Read-Only Introspection Checklist

The moment the staging project is provisioned and `.env.local` is populated, the following non-mutating SQL queries will be executed via Phase B inspection to establish the empirical inventory:

```sql
-- 1. PostgreSQL Version Verification
SELECT version();

-- 2. Schema Inventory
SELECT schema_name 
FROM information_schema.schemata 
ORDER BY schema_name;

-- 3. Existing Public Tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- 4. Installed Extensions
SELECT extname, extversion, extnamespace::regnamespace::text AS schema 
FROM pg_extension;

-- 5. System Roles Verification
SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolbypassrls
FROM pg_roles
WHERE rolname IN ('postgres', 'service_role', 'anon', 'authenticated', 'authenticator');
```

---

## 5. Phase B Conclusion

- **Remote Introspection Status**: **DEFERRED (WAITING FOR STAGING PROVISIONING)**
- **Integrity Assertion**: Zero queries or connections were routed to `rgkrfzxipkrwqccfuqfq`.
- **Finding**: A fresh Supabase project provides the ideal clean environment because it is free of the 200+ legacy tables that complicate production.
