# EPIC 100G.2 — REMOTE STAGING IDENTITY VERIFICATION & READ-ONLY PREFLIGHT REPORT

**Epic**: EPIC 100G.2 — Remote Staging Identity Verification & Read-Only Preflight  
**Target Codebase**: SALMO.DEV / Advanced Agentic Coding Pair  
**Date**: November 5, 2026  
**Final Status**: **READ-ONLY PREFLIGHT AUDIT COMPLETE — AWAITING USER PROVISIONING**  
**Staging Classification**: **IDENTITY NOT PROVEN (PROVISIONING PENDING)**  
**Production Recommendation**: **STRICTLY NO-GO (DEPLOYMENT HOLD)**  

---

## 1. Executive Summary & Mission Scope

Continuing directly from EPIC 100G and EPIC 100G.1, **EPIC 100G.2** executed the read-only verification of staging environment identity, preflight architectural auditing, dependency graph validation, and backup specification.

### Core Objectives & Execution Summary:
1. **Adherence to Safety Protocol**:
   All 8 safety rules were strictly enforced. Zero remote writes or mutations were executed. Zero DDL/DML was run against any remote database. Production project `rgkrfzxipkrwqccfuqfq` was completely isolated and untouched.
2. **Phase A (Identity Verification)**:
   Audit of `.env.local` determined that dedicated staging variables (`APPROVED_STAGING_PROJECT_REF`, `STAGING_SUPABASE_URL`, `STAGING_DATABASE_URL`, `STAGING_SUPABASE_SERVICE_ROLE_KEY`) are currently not set. `EnvironmentGuard` immediately halted all connection attempts fail-closed (`MISSING_STAGING_CONFIG`).
3. **Phase B (Remote Read-Only Preflight)**:
   In strict compliance with the rule *"Connect only after environment identity is proven"*, remote connections were held. Baseline schemas for a clean Supabase PostgreSQL 16 project were specified and contrasted with the 200+ tables in production.
4. **Phase C (Migration Preflight)**:
   Audited `data/schema_canonical.sql`, `STAGING_MIGRATION.sql`, and `STAGING_ROLLBACK.sql`. Identified the critical architectural dependency: `STAGING_MIGRATION.sql` requires base tables to pre-exist, meaning a fresh Supabase database must be initialized with the canonical base schema.
5. **Phase D (Backup Verification)**:
   Enforced the principle of zero-assumption. Established that a fresh staging database has no default backup, and formulated the mandatory pre-migration baseline logical dump runbook (`pg_dump`).
6. **Phase E (Deliverables & Gates)**:
   Delivered all 7 formal documentation artifacts in `docs/epic100g2/`. Migration authorization is explicitly **NOT GRANTED**.

---

## 2. Inventory of the 7 Formal Documentation Artifacts

All 7 required artifacts are placed in `docs/epic100g2/`:

| No | Document Path | Focus & Core Audit Findings |
| :--- | :--- | :--- |
| 1 | `docs/epic100g2/STAGING_IDENTITY_VERIFICATION.md` | Audit of local environment; verification of missing staging variables; proof of fail-closed halt by `EnvironmentGuard`. |
| 2 | `docs/epic100g2/REMOTE_SCHEMA_INVENTORY.md` | Baseline specification of fresh Supabase PostgreSQL 16 instance; comparison with production's 200+ legacy tables. |
| 3 | `docs/epic100g2/SCHEMA_PARITY_REPORT.md` | Full model-by-model parity matrix across all 8 canonical entities; constraints, foreign keys, and immutability triggers. |
| 4 | `docs/epic100g2/MIGRATION_PREFLIGHT_REPORT.md` | Preflight analysis of `STAGING_MIGRATION.sql` vs. fresh database requirements; direct port 5432 vs pooler 6543 rules. |
| 5 | `docs/epic100g2/BACKUP_VERIFICATION.md` | Zero-assumption backup evaluation; pre-migration logical baseline dump runbook (`pg_dump`). |
| 6 | `docs/epic100g2/RELEASE_GATE_REPORT.md` | Official scorecards across Gates 1 through 7; justification for withholding migration authorization. |
| 7 | `docs/epic100g2/EPIC100G2_REPORT.md` | Master synthesis report and next action protocol. |

---

## 3. Critical Technical Discoveries & Architecture Insights

### Discovery 1: The Delta Migration vs. Fresh Database Paradox
- `STAGING_MIGRATION.sql` lines 20–32 contain pre-migration assertions requiring `public.matches`, `public.prediction_ledger`, and `public.settlement_results` to already exist.
- In a fresh Supabase staging project, the `public` schema is initially empty. Running `STAGING_MIGRATION.sql` directly on an empty database will abort the transaction with:
  `PRE-MIGRATION ASSERTION FAILED: Table public.matches does not exist.`
- **Resolution**: The bootstrap procedure for a fresh staging instance must execute `data/schema_canonical.sql` (which creates all 8 base tables and initial constraints idempotently) before or alongside delta constraints.

### Discovery 2: Connection Mode Discipline (Port 5432 vs. 6543)
- **Port 5432 (Session Mode)**: Direct connection to PostgreSQL. Mandatory for running DDL migrations, extension management, and creating functions/triggers.
- **Port 6543 (Transaction Pooler Mode / Supavisor)**: Used for application queries (`dbClient.ts`). Cannot execute prepared statements or session-level locks required by heavy DDL.

### Discovery 3: Zero-Assumption Disaster Recovery
- Automated daily backups on Supabase do not create an instantaneous backup when a new project is created.
- Before executing any DDL on the new staging database, an explicit baseline logical dump (`pg_dump --schema-only`) must be captured and stored in `scratch/staging_baseline_pre_migration.sql`.

---

## 4. Cryptographic Ledger & Quota Invariants

| Monitored Resource | Baseline Target | Status | Verification Result |
| :--- | :--- | :--- | :--- |
| `live_prediction_ledger.jsonl` | `317fc037a63b811420400ea9de094092ec7d68b119ad6abc57743be12d568527` | Untouched | **100% MATCH** |
| `all_leagues_research_ledger.jsonl` | `eae8f364a5393255d276fca2650056951fb601ba829c1710b26ac673dffb967b` | Untouched | **100% MATCH** |
| `multi_league_research_predictions.jsonl` | `0128616a43968be5fddab76ea5c57da731955e22b1bf27bca3f886938187a12f` | Untouched | **100% MATCH** |
| **OddsPapi Quota** | 260 consumed / 250 limit | Circuit Breaker Active | **0 Quota Consumed** |
| **Production DB (`rgkrfzxipkrwqccfuqfq`)** | Zero queries / zero writes | Enforced | **100% Clean** |

---

## 5. Final Release Gates

```text
================================================================================
EPIC 100G.2 FINAL RELEASE GATE EVALUATION
================================================================================
1. STAGING IDENTITY          : FAIL (Awaiting User Provisioning in Dashboard)
2. REMOTE READ ACCESS        : BLOCKED (Halted Fail-Closed; Zero Probing)
3. SCHEMA PREFLIGHT          : BLOCKED (Awaiting Staging Target; DDL Analyzed)
4. BACKUP VERIFICATION       : BLOCKED (Baseline Dump Pending Creation)
5. PRODUCTION PROTECTION     : PASS (Zero Remote Mutations, Hashes Identical)
6. ODDSPAPI QUOTA LOCK       : PASS (260/250 Maintained, Zero Ingestion)
7. MIGRATION AUTHORIZATION   : NOT GRANTED (Strictly Forbidden in this Phase)
================================================================================
OVERALL STAGING STATUS       : PROVISIONING PENDING — READ-ONLY PREFLIGHT PASS
PRODUCTION RECOMMENDATION    : STRICTLY NO-GO (DEPLOYMENT HOLD)
================================================================================
```

---

## 6. Action Items & Instructions for the User

All preparatory audits, dependency mapping, fail-closed security guards, and baseline specifications are complete. The next action rests with the project owner:

1. **Create the Project in Supabase Dashboard**:
   - Log in to [Supabase Dashboard](https://supabase.com/dashboard).
   - Click **New Project**.
   - Project Name: `salmo-staging`
   - Database Password: Generate a strong password and save it securely in your local password manager.
   - Region: Select same geographic region as production (e.g. `ap-southeast-1` Singapore or `us-east-1`).
2. **Configure Local `.env.local` Privately**:
   Open `.env.local` on your local machine and append the following staging variables:
   ```env
   APPROVED_STAGING_PROJECT_REF="<your-new-staging-project-ref>"
   STAGING_SUPABASE_URL="https://<your-new-staging-project-ref>.supabase.co"
   STAGING_SUPABASE_ANON_KEY="<staging-anon-key>"
   STAGING_SUPABASE_SERVICE_ROLE_KEY="<staging-service-role-key>"
   STAGING_DATABASE_URL="postgresql://postgres.<your-new-staging-project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres"
   ```
3. **Reply with Non-Secret Identity**:
   Provide only:
   - **Staging Project Reference** (e.g., `abcdefghijklmnopqrst`).
   - **Staging Supabase URL** (e.g., `https://abcdefghijklmnopqrst.supabase.co`).
   - Confirmation that `.env.local` is set and strictly separate from `rgkrfzxipkrwqccfuqfq`.
   *(Do NOT send database passwords or service-role keys in chat).*
