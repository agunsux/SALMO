# SALMO.DEV — INFRASTRUCTURE & PRODUCTION PIPELINE GAP REPORT
**Date**: September 14, 2026  
**Auditor**: Lead Architect & Release Engineer  
**Status**: PRE-FOUNDATION GAP ANALYSIS  

---

## EXECUTIVE SUMMARY

SALMO.DEV has established its core mathematical, decision policy, and UI intelligence workspace on Next.js 15 (App Router). However, it currently operates in a **local development isolation state**. To transform Salmo into a dependable, production-grade Consumer Football Intelligence platform without compromising boundary hygiene or data integrity, a clean infrastructure boundary must be established.

This audit evaluates the current architectural gap across 12 dimensions and outlines the strict P0 implementation plan.

---

## A. CURRENT ARCHITECTURE

```text
[Browser / Mobile Client]
          │
          ▼
    Next.js 15 App
┌────────────────────────────────────────────────────────┐
│ App Router Pages: /, /pricing, /research               │
│ Client State: i18n (5 languages), Dark/Light Theme     │
│ API Routes: /api/matches, /api/evidence                │
└───────────────────────┬────────────────────────────────┘
                        │
                        ▼
            [MatchIntelligenceService]
                        │
       ┌────────────────┴────────────────┐
       ▼                                 ▼
[DecisionPolicy]               [HandicapLabClient]
(Strict 4-Tier Gating)         (Direct Local Filesystem I/O)
       │                                 │
       ▼                                 ▼
QuarterLineSettler / DevigEngine   ../HandicapLab/data/bronze/football_data/*.csv
```

### Key Architectural Characteristics:
1. **Frontend**: Next.js 15.1.0 with React 19, Tailwind CSS v3, dark-mode first design system.
2. **Execution Context**: Static page generation and dynamic Node.js serverless route handlers.
3. **Internal Engines**: Fully decoupled, zero-fabrication mathematical calculation layers (QuarterLineSettler, DevigEngine, DecisionPolicy).
4. **Current Data Flow**: API route handlers call `MatchIntelligenceService`, which directly imports `HandicapLabClient`. `HandicapLabClient` reads raw CSV files from sibling directory `../HandicapLab/data/...` via Node.js `fs`.

---

## B. GITHUB STATUS

| Attribute | State | Details / Evidence |
|:---|:---:|:---|
| **Local Git Repository** | PASS | Independent local repository at `c:\Users\RYZEN\.antigravity-ide\SALMO`. Clean working tree. |
| **Git Remote (`git remote -v`)** | **MISSING** | Output is empty. No remote named `origin` is configured. |
| **Current Branch** | `master` | Local default branch is `master`. Production target branch is `main`. |
| **Repository Owner** | `agunsux` | Git global config: `Baginda Agun <agunsux@gmail.com>`. |
| **Target GitHub Repo** | `agunsux/salmo` | Not yet pushed or linked. |
| **Secret Hygiene** | PASS | `.gitignore` properly ignores `.env*`, `node_modules`, `build`. Zero secrets committed. |

**Verdict**: **BLOCKED (MANUAL ACTION REQUIRED)**. A GitHub repository (`agunsux/salmo` or `agunsux/salmo-dev`) must be created on GitHub and set as remote `origin`.

---

## C. VERCEL STATUS

| Attribute | State | Details / Evidence |
|:---|:---:|:---|
| **Vercel CLI** | PASS | CLI v54.6.1 available, logged in as `agunsux` (team `shinerva`). |
| **Existing Vercel Project** | **NONE** | `vercel project ls` lists `handicap-lab`, `argus`, `scraper`, etc. **No project exists for Salmo.** |
| **Local Link (`.vercel`)** | **NONE** | No local `.vercel` link configuration. |
| **Target Setup** | PENDING | Target project name: `salmo` or `salmo-dev`. Target domain: `salmo.dev`. |
| **Branch Mapping** | PENDING | Target: `main` → Production (`salmo.dev`); `feature/*` / PRs → Preview deployments. |

**Verdict**: **NOT CONNECTED**. Must be provisioned once GitHub remote is linked. Do NOT deploy blindly before setting up environment contracts and build verification.

---

## D. BACKEND STATUS

| Component | Current State | Production Requirement | Gap |
|:---|:---|:---|:---|
| **API Boundary** | `/api/matches`<br>`/api/evidence` | Versioned REST contracts:<br>`/api/v1/matches`<br>`/api/v1/matches/:id`<br>`/api/v1/evidence/:id`<br>`/api/v1/research` | Unversioned, missing single-match and research parameter contracts. |
| **Contract Types** | Internal TypeScript models in `src/types/index.ts` | Versioned DTOs with explicit data status and provenance fields. | High coupling between UI models and internal engine data. |
| **Failure Semantics** | Returns 500 on catch | Explicit `DATA_UNAVAILABLE`, `INSUFFICIENT_DATA`, `CONFIGURATION_ERROR` with HTTP 200/503. | Needs standardized error envelope. |

---

## E. DATABASE STATUS

| Component | Current State | Production Requirement | Gap |
|:---|:---|:---|:---|
| **Database Instance** | **NONE** | PostgreSQL / Supabase instance for users, snapshots, cached decisions, and provenance. | Zero persistence layer. Application runs purely on-demand in memory. |
| **Client Driver** | **NONE** | Type-safe query interface (e.g. pg driver / Supabase REST client). | `package.json` contains no database dependencies. |
| **Schema Definition** | **NONE** | Formal DDL schema for: `users`, `matches`, `market_snapshots`, `decisions`, `evidence`, `data_provenance`, `entitlements`. | Schema must be formally designed and versioned in `data/schema.sql`. |

---

## F. HANDICAPLAB INTEGRATION STATUS

| Component | Current Implementation | Production Requirement | Risk / Gap |
|:---|:---|:---|:---|
| **Data Access** | Direct filesystem read `path.resolve('..', 'HandicapLab', ...)` | Abstract adapter boundary: `IHandicapLabAdapter` with `LocalAdapter` (dev) & `HttpAdapter` (prod). | **CRITICAL BREAKAGE IN PRODUCTION**: Vercel serverless containers do not have sibling directory `../HandicapLab`. Any production build/run depending on local fs will fail. |
| **Data Versioning** | Hardcoded checksum / version metadata in client | Real contract metadata from HandicapLab API (`/api/v1/contract/summary`). | Need runtime contract validation. |
| **Zero-Copy Boundary** | Maintained (no files copied) | Must maintain zero-copy invariant; consume only JSON contracts. | Fully preserved. |

---

## G. PROVIDER STATUS

| Provider | Status | Credentials | Risk / Gap |
|:---|:---:|:---:|:---|
| **API-Football** | Inactive / Unimplemented | None in `.env` | No adapter interface; missing live fixture feed. Missing credentials must yield `DATA_UNAVAILABLE`. |
| **OddsPapi** | Inactive / Unimplemented | None in `.env` | No adapter interface; missing live market odds feed. Missing credentials must yield `DATA_UNAVAILABLE`. |
| **Fallback Policy** | Strict Zero-Fabrication | Enforced | Must guarantee no dummy bookmaker odds or synthetic fixtures are generated when providers fail. |

---

## H. ENVIRONMENT STATUS

| Item | Status | Gap |
|:---|:---:|:---|
| **`.env.example`** | **MISSING** | Developers and CI have no canonical template for required environment variables. |
| **Environment Separation** | **UNVERIFIED** | No distinction between `.env.local`, preview, and production configurations. |
| **Validation Layer** | **MISSING** | No startup validation schema; missing secrets could cause silent runtime degradation. |
| **Client Leak Prevention** | Enforced | No secrets exposed via `NEXT_PUBLIC_*`. Needs automated validation check. |

---

## I. CI/CD STATUS

| Item | Status | Gap |
|:---|:---:|:---|
| **GitHub Actions** | **MISSING** | No `.github/workflows/ci.yml` exists. |
| **Automated Checks** | Manual only | `npm test` and `npm run build` pass locally, but are not enforced on PR or push. |
| **Branch Protection** | None | No rules enforcing passing CI before merging into `main`. |

---

## J. OBSERVABILITY STATUS

| Item | Status | Gap |
|:---|:---:|:---|
| **Server Logger** | Raw `console.error` | No structured JSON logging with correlation IDs, latency tracking, and status codes. |
| **Redaction** | Manual | No automated scrubber to guarantee zero logging of API keys, tokens, or personal identifiers. |
| **Request Tracing** | None | No `x-request-id` header generation or propagation across serverless handlers. |

---

## K. SECURITY STATUS

| Item | Status | Gap |
|:---|:---:|:---|
| **Security Headers** | Basic Next.js default | Missing standard security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy). |
| **CORS Policy** | Default Next.js | API routes do not declare explicit CORS origin restrictions. |
| **Rate Limiting** | None | Public API endpoints lack protection against scrapers and denial-of-service spikes. |

---

## L. MISSING INFRASTRUCTURE SUMMARY

1. **GitHub Remote & Branch Alignment**: No remote origin; branch is `master` instead of `main`.
2. **Vercel Project Configuration**: No `vercel.json` or project link.
3. **Canonical Environment Contract**: No `.env.example` or validated environment configuration loader.
4. **Decoupled HandicapLab Adapter**: No abstract adapter separating local disk I/O from production HTTP contracts.
5. **Versioned API Endpoints (`/api/v1/*`)**: Missing v1 routes with strict contract serialization.
6. **Data Provenance Structure**: Missing standardized traceability metadata schema.
7. **Live Provider Boundaries**: Missing typed interfaces for API-Football and OddsPapi with graceful failure modes.
8. **Production Database DDL**: Missing minimum database schema design for production rollout.
9. **CI Workflow (`ci.yml`)**: Missing automated test and build pipeline.
10. **Observability & Logging**: Missing structured JSON logger with secret redaction.
11. **Health Check Endpoint (`/api/health`)**: Missing real dependency health reporting.
12. **Security Headers & CORS**: Missing headers configuration in `next.config.ts`.

---

## M. RECOMMENDED IMPLEMENTATION ORDER

```text
Phase 1: Environment & Security Foundation
  ├── 1. Canonical Environment Specification (.env.example & env validation)
  ├── 2. Security Headers & CORS Policy in next.config.ts
  └── 3. Vercel Configuration (vercel.json)

Phase 2: Core Adapter & Provider Boundaries
  ├── 4. Abstract HandicapLab Adapter (IHandicapLabAdapter, LocalAdapter, HttpAdapter)
  ├── 5. Live Provider Boundaries (API-Football & OddsPapi interfaces with DATA_UNAVAILABLE)
  └── 6. Canonical Data Provenance & Traceability Model

Phase 3: Versioned API & Health Check
  ├── 7. Health Check Endpoint (GET /api/health with real dependency introspection)
  └── 8. Versioned API Endpoints (/api/v1/matches, /api/v1/evidence, /api/v1/research)

Phase 4: Database Schema & Observability
  ├── 9. Minimum Production Database Schema (data/schema.sql)
  └── 10. Structured Server-Side Observability Logger (src/lib/logger.ts)

Phase 5: CI/CD & Automated Verification
  ├── 11. GitHub Actions CI Pipeline (.github/workflows/ci.yml)
  └── 12. Verification Test Suite for Adapters, Contracts, Health, and Environment
```

