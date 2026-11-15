# SALMO — DEDICATED EGRESS & DEPLOYMENT VERIFICATION REPORT

**Document Date:** November 16, 2026  
**Auditor:** Senior Site Reliability & Network Security Engineer  
**Standard of Proof:** EMPIRICAL RUNTIME EVIDENCE ONLY (Zero inference from source code; missing or unprovisioned systems marked NOT VERIFIED)

---

## 1. Executive Summary & Verification Matrix

| Verification Target | Category | Empirical Status | Evidence & Verification Method |
| :--- | :---: | :---: | :--- |
| **Gateway Governance Logic** | Code / Architecture | **PASS** | `ApiFootballGatewayService.ts` verified via 10 automated unit/integration tests. |
| **Vercel Runtime Configuration** | Deployment Config | **VERIFIED** | Inspected via `vercel env ls` & `vercel logs`. `APIFOOTBALL_KEY` present (58d ago); fail-closed active. |
| **GitHub Actions Runner Hardening** | CI/CD Config | **VERIFIED** | Version control verified: `API_FOOTBALL_KEY` purged from `.github/workflows/settle-cron.yml`. |
| **GitHub Actions Remote Run History** | CI/CD Telemetry | **NOT VERIFIED** | GitHub CLI (`gh`) not installed on host machine; remote execution history unavailable via CLI. |
| **Cloud Run Gateway Service** | Live Runtime | **NOT VERIFIED** | `salmo-apifootball-gateway` is **NOT DEPLOYED**; `gcloud run services list` denies access. |
| **Cloud NAT Gateway Infrastructure** | Live Network | **NOT VERIFIED** | Cloud NAT has **NOT BEEN PROVISIONED**; zero cloud spend policy enforced. |
| **Reserved Dedicated Static IP** | IP Ownership | **NOT VERIFIED** | No static external IPv4 has been reserved or allocated on Google Cloud. |
| **Runtime Egress IP Exclusivity** | Network Egress | **NOT VERIFIED** | Egress IP cannot be verified against live endpoints until gateway and NAT are provisioned. |
| **API-Sports Account Reactivation** | External Provider | **BLOCKED** | Account remains in administrative hold (`errors.access`); requires human escalation. |

---

## 2. Granular Telemetry & Evidence Breakdown

### 2.1 Vercel Deployment & Runtime State
- **CLI Authentication:** Authenticated as user `agunsux` on team `shinerva`.
- **Project ID:** `prj_HDnX6QKn8BA7wGz6o2GcnJpJnzpz` (Project: `salmo`).
- **Active Production Deployment:** `https://salmo-1xdsvxdl6-shinerva.vercel.app` (Status: Ready, Duration: 59s, deployed 15 days ago).
- **Environment Variables Audit (`vercel env ls`):**
  - `APIFOOTBALL_KEY`: Secret (Production, created 58d ago).
  - `ODDS_PAPI_KEY`: Secret (Production, created 15d ago).
  - `CRON_SECRET`: Secret (Production, created 58d ago).
  - `SUPABASE_SERVICE_ROLE_KEY`: Secret (Production, created 58d ago).
- **Runtime Logs Inspection (`vercel logs`):**
  - Recent route invocations (`GET /api/matches` at `2026-11-15T19:54:27Z`) confirmed:
    `[MatchIntelligenceService] No upcoming fixtures discovered from authoritative provider; failing closed (0 fixtures returned).`
  - Zero outgoing HTTP calls were made to API-Sports from Vercel Serverless.
- **Verdict:** **VERIFIED**. Vercel is in a safe fail-closed state, but `APIFOOTBALL_KEY` should be removed from Vercel project settings to prevent accidental leakage.

### 2.2 GitHub Actions Configuration
- **Workflow Audited:** `.github/workflows/settle-cron.yml`.
- **Audit Action:** Lines 42 and 56 containing `API_FOOTBALL_KEY: ${{ secrets.API_FOOTBALL_KEY }}` were removed.
- **Workflow Triggers:** Configured exclusively as `workflow_dispatch` (manual only). No automated cron triggers exist in GitHub Actions.
- **Remote Run History:** `gh` CLI was not found on the local workstation. Remote run logs could not be retrieved via terminal.
- **Verdict:** Source configuration is **VERIFIED CLEAN**. Remote run history is **NOT VERIFIED**.

### 2.3 Google Cloud Platform Runtime Inspection
- **Local CLI Authentication:** `gcloud` version 587.0.0, authenticated as `agunsux@gmail.com`.
- **Active Configuration Property:** `project = handicap-salmo`.
- **Permission Check (`gcloud run services list --project=handicap-salmo`):**
  ```
  ERROR: (gcloud.run.services.list) PERMISSION_DENIED: Permission 'run.services.list' denied on resource 'namespaces/handicap-salmo/services' (or resource may not exist).
  ```
- **Project Listing (`gcloud projects list`):**
  The projects accessible to `agunsux@gmail.com` are:
  - `affable-symbol-fgwbd` (794506742699)
  - `citric-progress-tsjh2` (1033512577626)
  - `gen-lang-client-0402115682`
  - `gen-lang-client-0999065087`
  - `project-077d53f6-09cd-4d7b-9fb`
  - `project-9f655e64-428e-4d5b-870`
  *(Note: `handicap-salmo` and the legacy project `129269713730` are NOT accessible under the currently authenticated Google account).*
- **Infrastructure Status:** No dedicated Cloud Run service, VPC subnet, Cloud Router, or Cloud NAT exists or is currently running for the SALMO dedicated gateway.
- **Verdict:** **NOT VERIFIED (NOT DEPLOYED)**. In strict accordance with the hard-stop instruction, no cloud resources were created and zero billing charges were incurred.

---

## 3. Dedicated Egress Verification Protocol

Dedicated egress CANNOT be claimed or marked as PASS based solely on unit tests or architectural diagrams.

To reach **VERIFIED DEDICATED EGRESS**, the following 4-step physical verification protocol must be executed once infrastructure is provisioned:

```
[Gateway Service Container]
          │
          ├── Step 1: Query Independent Reflector (https://api.ipify.org?format=json)
          │           Capture: `actual_egress_ip`
          │
          ├── Step 2: Query Cloud Provider API (gcloud compute addresses describe)
          │           Capture: `reserved_static_ip`
          │
          ├── Step 3: Exact Cryptographic Parity Match
          │           Assert: actual_egress_ip === reserved_static_ip
          │           If Mismatch -> HALT (Fail-Closed, 403 Forbidden)
          │
          └── Step 4: Exclusivity Attestation
                      Verify reverse DNS / PTR and tenant isolation to confirm
                      zero third-party egress sharing.
```

Until this protocol runs on live infrastructure, **Dedicated Egress remains NOT VERIFIED**.
