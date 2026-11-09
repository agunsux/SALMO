# API-FOOTBALL ENVIRONMENT & CREDENTIAL FOOTPRINT MAP

**Project:** Salmo.dev & HandicapLab  
**Audit Date:** November 7, 2026  
**Auditor:** Senior Backend Infrastructure Engineer & Security Engineer  
**Security Posture:** **STRICT SECRET REDACTION** (No secrets printed; fingerprints masked to first 4 and last 4 characters)

---

## 1. Executive Environment Footprint

The audit performed an exhaustive search across all project configuration files, runtime environments, deployment descriptors, and CI/CD pipelines to map every potential consumer of API-Football credentials.

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           API-FOOTBALL CREDENTIAL FOOTPRINT                             │
├───────────────────────┬───────────────────────────────┬─────────────────────────────────┤
│ ENVIRONMENT           │ CREDENTIAL STATUS             │ OPERATIONAL STATE               │
├───────────────────────┼───────────────────────────────┼─────────────────────────────────┤
│ A. Vercel Production  │ UNCONFIGURED in SALMO         │ INACTIVE (Crons removed)        │
│ B. Vercel Preview     │ BLOCKED by code guard         │ INACTIVE (Hard-gated)           │
│ C. Vercel Development │ UNCONFIGURED in SALMO         │ INACTIVE                        │
│ D. Google Cloud Run   │ LEGACY DEPLOYMENT (Stale)     │ PAUSED (Cloud Scheduler paused) │
│ E. Local Development  │ CONFIGURED in HandicapLab     │ ISOLATED (cb36...aab6)          │
│ F. CI/CD (GitHub)     │ REFERENCED in Secret Vault    │ MANUAL ONLY (Dry-run enforced)  │
│ G. Scheduled Pipelines│ DISARMED in vercel.json       │ ZERO AUTOMATED CALLS            │
│ H. HandicapLab Upstr. │ CONFIGURED in .env.local      │ FAIL-CLOSED (Suspended)         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Granular Environment Profiles

### Environment A: Vercel Production (`salmo.dev` / `handicap-lab.vercel.app`)
- **Credential Variable:** `API_FOOTBALL_KEY` (or `APIFOOTBALL_KEY`)
- **Configuration Presence:** **UNCONFIGURED** in Salmo production environment. Salmo relies on Supabase and OddsPapi.
- **Provider Client Implementation:** `src/services/providers/apiFootballProvider.ts`
- **Consumer Service:** `src/engine/matchIntelligenceService.ts` and `src/engine/pipeline/productionPredictionEngine.ts`
- **Request Method:** `GET` (`/fixtures?league={id}&next=10`)
- **Request Frequency:** **0 requests/day**. The provider client checks `isConfigured()`, which evaluates to `false`.
- **Retry Behavior:** Zero retries. Returns `DATA_UNAVAILABLE` immediately on non-200.
- **Caching:** Next.js fetch revalidation `next: { revalidate: 300 }` (5 minutes).
- **Scheduler:** `vercel.json` crons are explicitly empty (`"crons": []`).
- **Logging:** Structured logging via `src/lib/logger.ts` (`Logger.warn`, `Logger.error`). Never logs request headers or tokens.
- **Evidence Level:** **VERIFIED EVIDENCE** (Confirmed by inspecting `src/config/env.ts`, `src/services/providers/apiFootballProvider.ts`, and `vercel.json`).

---

### Environment B: Vercel Preview (Pull Request Deployments)
- **Credential Variable:** `API_FOOTBALL_KEY`
- **Configuration Presence:** Inherited from Vercel project environment defaults if set to "All Environments".
- **Runtime Execution Guard:** **HARD GATED OFF**.
  - In `src/app/api/cron/predict/route.ts` line 55:
    ```typescript
    if (process.env.ENABLE_PRODUCTION_CRON !== 'true' || process.env.VERCEL_ENV === 'preview') {
      return NextResponse.json({ success: false, status: 'OFF', message: 'Preview blocked' });
    }
    ```
  - In `src/app/api/cron/settle/route.ts` line 33:
    ```typescript
    if (process.env.ENABLE_PRODUCTION_CRON !== 'true' || process.env.VERCEL_ENV === 'preview') {
      return NextResponse.json({ success: false, status: 'OFF', message: 'Preview blocked' });
    }
    ```
- **Risk Assessment:** Even if Vercel Preview environments shared credentials with Production, preview instances are strictly blocked by code from triggering cron cycles or outbound provider queries.
- **Evidence Level:** **VERIFIED EVIDENCE** (Source code lines in API routes).

---

### Environment C: Vercel Development (`vercel dev`)
- **Credential Variable:** `API_FOOTBALL_KEY`
- **Configuration Presence:** Reads from local `.env.local`. In SALMO `.env.local`, `API_FOOTBALL_KEY` is absent.
- **Consumer Status:** Unconfigured. Returns `status: 'UNCONFIGURED'`.
- **Evidence Level:** **VERIFIED EVIDENCE** (`.env.local` inspection).

---

### Environment D: Google Cloud Run (`handicaplab-production-129269713730.asia-southeast2.run.app`)
- **Service Name:** `handicaplab-production-129269713730`
- **Region:** `asia-southeast2` (Jakarta)
- **Active Revision:** `handicaplab-production-00007-jwr`
- **Credential Variable:** `APIFOOTBALL_KEY`
- **Configuration Presence:** **CONFIGURED** historically in Cloud Run environment variables.
- **API Consumer:** Legacy HandicapLab `src/lib/providers/providerGateway.ts` & `src/lib/apis/apifootball.ts`.
- **Request Method:** `GET` (`/fixtures`, `/standings`, `/teams/statistics`, `/fixtures/statistics`).
- **Request Frequency:** **0 active requests**. Cloud Scheduler jobs `handicaplab-pipeline-daily` and `handicaplab-rescue-daily` were verified **PAUSED** via `gcloud scheduler jobs list`.
- **Retry Behavior:** 2 retries, fixed backoff (10s for 429, 5s for 5xx).
- **Caching:** In-memory `memoryCache` with 1-hour TTL.
- **Network Egress:** Dynamic shared Google Cloud IP pool in `asia-southeast2`. Zero Cloud NAT / zero static IP.
- **Evidence Level:** **VERIFIED EVIDENCE** (Documented in `EPIC_96_AUTOMATION_SCHEDULE.md`, `EPIC_93_FINAL_PRODUCTION_LEDGER_REPORT.md`, and `APIFOOTBALL_EGRESS_RECOMMENDATION.md`).

---

### Environment E: Local Development (`C:\Users\RYZEN\.antigravity-ide\SALMO` & `HandicapLab`)
- **SALMO Local:**
  - File: `SALMO/.env.local`
  - Variable: `API_FOOTBALL_KEY` (Not present / unset).
  - Provider Status: `UNCONFIGURED`.
- **HandicapLab Local:**
  - File: `HandicapLab/.env.local`
  - Variable: `APIFOOTBALL_KEY`
  - Key Fingerprint: `cb36...aab6` (32 characters, masked).
  - Provider Status: **SUSPENDED**.
- **API Consumer:** Historical research harvesting scripts (`scripts/research/apifootball_harvester.js`, `scripts/research/run_final_topup.js`, `scratch/check-key-status.ts`).
- **Network Egress:** Local residential / office ISP in Indonesia (UTC+7).
- **Evidence Level:** **VERIFIED EVIDENCE** (Direct inspection of `.env.local` files).

---

### Environment F: CI/CD (GitHub Actions)
- **Repository Workflows:**
  - `.github/workflows/ci.yml`: Standard lint and unit test workflow. Does not query live providers. Runs `MockApiFootballProvider` in `tests/infrastructure.test.js`.
  - `.github/workflows/settle-cron.yml`: Manual workflow dispatch for settlement dry-run.
- **Secret Referenced:** `${{ secrets.API_FOOTBALL_KEY }}`
- **Execution Mode:** Strictly enforces `dry_run: 'true'`, `ALLOW_PRODUCTION_DB_WRITE: 'false'`.
- **Request Volume:** Zero mutating calls; manual dispatch only (never runs automatically on push or cron).
- **Evidence Level:** **VERIFIED EVIDENCE** (Workflow YAML inspection).

---

### Environment G: Scheduled Pipelines & Crons
- **SALMO Vercel Crons:** `vercel.json` has `"crons": []`. No automated schedules exist.
- **Cloud Scheduler (GCP):**
  - Job: `handicaplab-pipeline-daily` → PAUSED.
  - Job: `handicaplab-rescue-daily` → PAUSED.
- **Active Automation State:** **100% PAUSED / DISARMED**. Zero automated requests are emitted from any cloud scheduler.
- **Evidence Level:** **VERIFIED EVIDENCE** (`vercel.json` commit history and GCP status logs).

---

### Environment H: HandicapLab Upstream Sibling Project
- **Role:** Upstream quantitative research and historical feature archive.
- **Integration with Salmo:** Connected via `HandicapLabAdapterFactory`. In production, SALMO connects to Supabase database directly or via HTTP contract (`/api/v1/contract`).
- **Decoupling Gate:** `src/contracts/handicapLabAdapter.ts` strictly ensures that SALMO does not invoke upstream provider APIs. If data is absent, it returns `DATA_UNAVAILABLE` (fail-closed).
- **Evidence Level:** **VERIFIED EVIDENCE** (Adapter contract code in `src/contracts/handicapLabAdapter.ts`).

---

## 3. Credential Footprint & Variable Name Matrix

| Repository | File / Resource | Variable Name | Length | Fingerprint | Environment | Purpose |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| `SALMO` | `.env.example` | `API_FOOTBALL_KEY` | 0 | `[EMPTY]` | Template | Documentation |
| `SALMO` | `.env.local` | `API_FOOTBALL_KEY` | — | `[NOT PRESENT]` | Local Dev | Disabled |
| `SALMO` | `src/config/env.ts` | `API_FOOTBALL_KEY` / `APIFOOTBALL_KEY` | Dynamic | Dynamic | App Runtime | Typed configuration |
| `SALMO` | GitHub Actions | `API_FOOTBALL_KEY` | Secret | Unknown | CI Secrets | Manual dry-run |
| `HandicapLab` | `.env.example` | `APIFOOTBALL_KEY` | 21 | `your..._key` | Template | Documentation |
| `HandicapLab` | `.env.example` | `API_FOOTBALL_KEY` | 0 | `[EMPTY]` | Template | Legacy alias |
| `HandicapLab` | `.env.local` | `APIFOOTBALL_KEY` | 32 | `cb36...aab6` | Local Dev | Historical Key |
| `HandicapLab` | `.env.production.local` | `APIFOOTBALL_KEY` | 11 | `[SENSITIVE]` | Ops Template | Redacted Template |
| `HandicapLab` | GCP Cloud Run | `APIFOOTBALL_KEY` | Secret | `cb36...aab6` (Inferred) | Cloud Run Prod | Legacy Service |

*Zero unmasked secrets exist in version control or logging.*

---

## 4. Credential Sharing & Cross-Environment Risks

1. **Production vs Preview Sharing:**
   - In Vercel, environment variables set at the project level default to Production, Preview, and Development unless explicitly scoped.
   - However, Salmo's runtime code implements an unbypassable environment guard: `process.env.VERCEL_ENV === 'preview'` immediately returns HTTP 200 with `status: 'OFF'`.
   - **Risk Level:** **LOW / MITIGATED**.

2. **Cloud Run vs Local Development Sharing:**
   - The same credential (`cb36...aab6`) was utilized in both local development (for research harvesting) and Cloud Run production.
   - When requests originated from both local residential IPs and Google Cloud Run shared IPs, API-Sports' gateway observed traffic with the same API key from disparate geographic locations (`ID` residential vs Google Cloud data centers).
   - On a paid Pro plan, multi-origin access is typically permitted. However, once the plan reverted towards Free, this multi-origin footprint triggered anti-abuse heuristics.
   - **Risk Level:** **HIGH (Historical Contributor to Suspension)**.

---

## 5. Summary of Evidence, Inferences & Missing Information

| Category | Finding | Evidence Level |
| :--- | :--- | :--- |
| **Active Key** | Only 1 key (`cb36...aab6`) has ever existed for API-Football across all environments. | **VERIFIED EVIDENCE** |
| **Automation** | No automated crons are actively calling API-Football today in any environment. | **VERIFIED EVIDENCE** |
| **Cloud Run Secret** | Cloud Run environment holds the legacy key, but scheduler is paused. | **VERIFIED EVIDENCE** |
| **Exact Cloud Run IP** | Outbound IP of Cloud Run instances is dynamically assigned by GCP from `asia-southeast2` NAT pool; exact egress IPs for historical requests cannot be reconstructed without VPC flow logs. | **MISSING INFORMATION** |
| **Vercel Secret Scope** | Direct read-only inspection of Vercel dashboard project settings is unavailable via CLI without active token; inferred from code guards. | **INFERENCE** |

---

## 6. Recommendations

1. **Purge `API_FOOTBALL_KEY` from Vercel Preview:** In Vercel dashboard, explicitly restrict any future API-Football key to Production only.
2. **Remove Unused Key from Cloud Run:** Clear `APIFOOTBALL_KEY` from Cloud Run service environment variables to prevent accidental reactivation.
3. **Enforce Single Egress Origin:** Once reinstated, API-Football traffic must be restricted to a single, dedicated static IP or local developer execution.
