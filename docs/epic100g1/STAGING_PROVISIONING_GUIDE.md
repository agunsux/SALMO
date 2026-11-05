# DEDICATED SUPABASE STAGING PROVISIONING GUIDE

**Document Identifier**: `docs/epic100g1/STAGING_PROVISIONING_GUIDE.md`  
**Parent Epic**: EPIC 100G.1 — Isolated Staging Environment Provisioning & Database Identity Bootstrap  
**Authors**: Astra / DeepMind Advanced Agentic Coding Pair  
**Status**: COMPLETE / STEP-BY-STEP SPECIFICATION  
**Target Action**: Manual Provisioning in Supabase Dashboard (To be executed by authorized user)  
**Production Status**: STRICTLY NO-GO (Production project `rgkrfzxipkrwqccfuqfq` must remain untouched)  

---

## 1. Executive Summary & Objective

In EPIC 100G, forensic introspection established that the only remote Supabase project configured in `.env.local` (`rgkrfzxipkrwqccfuqfq`) is the **LIVE PRODUCTION DATABASE**. Consequently, all remote migration scripts were halted to prevent data loss and unauthorized schema mutation.

This guide provides the exact, step-by-step procedure for the project owner to provision a **genuinely isolated Supabase Staging Project**.

### Core Isolation Requirements:
1. **Independent Project Reference**: The staging project must have its own distinct 20-character reference (e.g. `salmo-staging-<id>`), completely separate from `rgkrfzxipkrwqccfuqfq`.
2. **Independent Database Cluster**: Dedicated PostgreSQL database host and dedicated Supavisor transaction pooler.
3. **Dedicated Secret Boundary**:
   - Distinct Staging Anon Key (`STAGING_SUPABASE_ANON_KEY`).
   - Distinct Staging Service Role Key (`STAGING_SUPABASE_SERVICE_ROLE_KEY`).
   - Distinct Database Password & Connection String (`STAGING_DATABASE_URL`).
4. **Zero Production Credential Sharing**: Production credentials must **NEVER** be entered into staging configurations, and vice versa.

---

## 2. Step-by-Step Dashboard Provisioning Instructions

Follow these instructions in the official [Supabase Dashboard](https://supabase.com/dashboard):

### Step 1: Create a New Project
1. Log in to your authorized organization in the Supabase Dashboard.
2. Click **New project** (ensure you select your active organization, e.g. `salmo-dev` or personal account).
3. Fill in the project configuration fields:
   - **Name**: `salmo-staging` (or `salmo-dev-staging`).
   - **Database Password**: Generate a secure, 32-character random password.  
     *(Store this securely in your private password manager; DO NOT paste it into chat).*
   - **Region**: Choose the same geographic cloud region as production (e.g., `Singapore (ap-southeast-1)` or `Frankfurt (eu-central-1)`) to ensure latency parity.
   - **Pricing Plan**: Free Tier or Pro (Staging instances can run on the Free Tier for developmental verification).
4. Click **Create new project** and wait 2–3 minutes for PostgreSQL provisioning to complete.

---

### Step 2: Retrieve Staging Project Identity (Safe to Share)
Once the project is created:
1. Navigate to **Project Settings** (gear icon) -> **General**.
2. Copy the **Reference ID** (a string of lowercase alphanumeric characters, e.g., `abcdefghijklmnopqrst`).
   - *This Reference ID is the non-secret project identity.*
3. Copy the **Project URL** (e.g., `https://abcdefghijklmnopqrst.supabase.co`).
4. **Verification Rule**: Verify that the first 5 characters of this Project URL **do not match** `rgkrf` (the production reference).

---

### Step 3: Retrieve Staging API Keys
1. Navigate to **Project Settings** -> **API**.
2. In the **Project API keys** section:
   - Copy the `anon` / `public` key -> Set locally as `STAGING_SUPABASE_ANON_KEY`.
   - Copy the `service_role` / `secret` key -> Set locally as `STAGING_SUPABASE_SERVICE_ROLE_KEY`.

---

### Step 4: Retrieve Database Connection String (Transaction Pooler)
1. Navigate to **Project Settings** -> **Database**.
2. Scroll to **Connection string** -> Select **URI** mode -> Choose **Transaction** pooler (Port `6543`).
   - Format:
     ```text
     postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:6543/postgres
     ```
3. Replace `[YOUR-PASSWORD]` with the password generated in Step 1.
4. Set locally as `STAGING_DATABASE_URL`.

---

## 3. Local Environment Variable Configuration

In your private local development environment, add the following section to `.env.local`:

```bash
# ==============================================================================
# SALMO STAGING ENVIRONMENT CONFIGURATION (EPIC 100G.1)
# ==============================================================================
# Verified separate staging project reference (NEVER rgkrfzxipkrwqccfuqfq)
APPROVED_STAGING_PROJECT_REF="<staging-project-ref>"

# Staging Supabase REST API & Keys
STAGING_SUPABASE_URL="https://<staging-project-ref>.supabase.co"
STAGING_SUPABASE_ANON_KEY="<staging-anon-key>"
STAGING_SUPABASE_SERVICE_ROLE_KEY="<staging-service-role-key>"

# Staging PostgreSQL Direct / Pooler Connection
STAGING_DATABASE_URL="postgresql://postgres.<staging-project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres"
```

> [!IMPORTANT]
> **Zero Credential Exposure Rule**:
> When replying to this session, **DO NOT PASTE** the database password or service-role key into the chat!
> You only need to provide:
> 1. The staging project reference (e.g. `abcdefghijklmnopqrst`).
> 2. The staging project URL (e.g. `https://abcdefghijklmnopqrst.supabase.co`).
> 3. Confirmation that you have configured `.env.local` privately.
