# SALMO — API-FOOTBALL / API-SPORTS REQUEST PATH MATRIX (REVISED)

**Audit Date:** November 16, 2026  
**Auditor:** Senior Infrastructure & API Security Engineer  
**Classification Standards:**
1. `MIGRATED_TO_GATEWAY`: Fully refactored to route exclusively through `ApiFootballGatewayClient`. Zero direct calls to `api-sports.io`.
2. `DIRECT_PERMANENTLY_DISABLED`: Historical script containing direct endpoints, but permanently and unconditionally locked with `process.exit(1)` / fatal exception. Zero bypasses.
3. `CONFIG_ONLY`: Type declarations, default URLs, or status strings. Zero network calls.
4. `TEST_MOCK`: In-memory mock adapter or synthetic test harness.
5. `HISTORICAL_DOC`: Static documentation or forensic ledger records.

---

## 1. Exhaustive Request-Path Inventory Matrix

| # | File Path & Function | Classification | Execution Environment | Credentials Source | Outbound Destination | Runtime Safety Invariant | Current Operational Status |
| :---: | :--- | :---: | :--- | :--- | :--- | :--- | :---: |
| **1** | `src/services/providers/apiFootballProvider.ts`<br>`getUpcomingFixtures(leagueId)` | **MIGRATED_TO_GATEWAY** | Vercel Serverless (Node.js runtime) | `API_FOOTBALL_GATEWAY_URL`, `API_FOOTBALL_GATEWAY_TOKEN` | Gateway URL only (`/api/gateway/*`). | Fail-closed: `isConfigured()` returns `false` by default. Zero direct calls to `api-sports.io`. | **DISABLED (FAIL-CLOSED)** |
| **2** | `src/services/providers/apiFootballProvider.ts`<br>`getFixtureById(id)` | **MIGRATED_TO_GATEWAY** | Vercel Serverless | None | None | Fails closed with `DATA_UNAVAILABLE`. | **DISABLED (FAIL-CLOSED)** |
| **3** | `src/services/gateway/apiFootballGatewayService.ts`<br>`executeRequest(options)` | **GATEWAY_INTERNAL** | Dedicated Gateway Container (Cloud Run / VPS) | `API_FOOTBALL_KEY` / `APIFOOTBALL_KEY` (Server-only in Secret Manager) | `https://v3.football.api-sports.io` via dedicated static IP. | Serialized queue (10s delay), SHA-256 dedup (300s TTL), circuit breaker (429 trip), quota guard. | **UNPROVISIONED / GOVERNED IN CODE** |
| **4** | `src/services/gateway/apiFootballGatewayService.ts`<br>`verifyEgressIp()` | **INDEPENDENT_REFLECTOR** | Dedicated Gateway Container | None | `https://api.ipify.org?format=json` | Aborts outbound requests if actual egress IP != expected static IP. | **ACTIVE CHECK IN CODE** |
| **5** | `src/services/gateway/apiFootballGatewayClient.ts`<br>`get(endpoint, params)` | **GATEWAY_CLIENT** | Vercel Serverless / Client | `API_FOOTBALL_GATEWAY_TOKEN` | `API_FOOTBALL_GATEWAY_URL` | Fails closed with 503 if gateway URL is unset. Never touches `api-sports.io`. | **FAIL-CLOSED** |
| **6** | `src/config/env.ts`<br>`env.providers.apiFootball` | **CONFIG_ONLY** | Node.js Runtime | `API_FOOTBALL_KEY`, `API_FOOTBALL_BASE_URL` | None | Zero network requests. Type definitions and defaults only. | **SAFE** |
| **7** | `src/app/api/health/route.ts`<br>`GET()` | **CONFIG_ONLY** | Vercel Serverless | `env.providers.apiFootball.configured` | None | Zero network requests. Returns status string only. | **SAFE** |
| **8** | `src/app/daily-picks/page.tsx`<br>`Page()` | **CONFIG_ONLY** | Client / SSR | None | None | Renders status string in UI badge. Zero network calls. | **SAFE** |
| **9** | `src/engine/matchIntelligenceService.ts`<br>`getUpcomingFixturesWithIntelligence()` | **CONFIG_ONLY** | Vercel Serverless | Supabase credentials | Supabase PostgreSQL | Line 57 checks `isMockedTest`. In production, queries Supabase directly. | **SAFE (DECOUPLED)** |
| **10**| `src/engine/pipeline/productionPredictionEngine.ts`<br>`discoverUpcomingFixturesWithOdds()` | **GATEWAY_CONSUMER** | Vercel Serverless | None | Gateway client | Line 1118 checks `apiFootball.isConfigured()`. If false/failed, fails closed (0 fixtures). **Zero direct fallback**. | **SAFE (FAIL-CLOSED)** |
| **11**| `scripts/ingest_real_fixtures.ts`<br>`main()` | **DIRECT_PERMANENTLY_DISABLED** | Workstation CLI | `.env.local` | `v3.football.api-sports.io/fixtures` | **Unconditional Hard Lock:** `process.exit(1)` immediately on startup. Zero bypasses. | **PERMANENTLY DISABLED (LEGACY)** |
| **12**| `scripts/research/apifootball_harvester.js`<br>`checkStatus()`, `harvest*()` | **DIRECT_PERMANENTLY_DISABLED** | Workstation CLI | `.env.local` | `v3.football.api-sports.io/*` | **Unconditional Hard Lock:** `getApiKey()` throws fatal error on call. Zero bypasses. | **PERMANENTLY DISABLED (LEGACY)** |
| **13**| `scripts/research/run_final_topup.js`<br>`runTopUp()` | **DIRECT_PERMANENTLY_DISABLED** | Workstation CLI | `.env.local` | `v3.football.api-sports.io/fixtures/statistics` | **Unconditional Hard Lock:** `process.exit(1)` immediately on startup. Zero bypasses. | **PERMANENTLY DISABLED (LEGACY)** |
| **14**| `scratch/audit_temp/probe_api_football.js`<br>`main()` | **DIRECT_PERMANENTLY_DISABLED** | Workstation CLI | `.env.local` | `v3.football.api-sports.io/status` | **Unconditional Hard Lock:** `process.exit(1)` immediately on startup. `ALLOW_SUSPENDED_STATUS_PROBE` removed. | **PERMANENTLY DISABLED (LEGACY)** |
| **15**| `.github/workflows/settle-cron.yml`<br>`Dry-Run Settlement Job` | **CONFIG_ONLY** | GitHub Actions Runner | None (`API_FOOTBALL_KEY` removed) | Supabase only | Dry-run settlement runner. Zero provider calls. | **CLEANSED** |
| **16**| `.github/workflows/ci.yml`<br>`verify job` | **TEST_MOCK** | GitHub Actions Runner | None | In-memory | Runs `npm test` and `npm run build`. Zero live provider queries. | **SAFE** |
| **17**| `tests/api_football_dedicated_egress.test.js`<br>10 Architectural Tests | **TEST_MOCK** | Local / CI Node.js | Synthetic mocks | In-memory | 100% mocked fetch. Zero network calls. | **PASS** |
| **18**| `tests/infrastructure.test.js`<br>`MockApiFootballProvider` | **TEST_MOCK** | Local / CI Node.js | Synthetic mock | In-memory | Synthetic mock class. Zero network calls. | **PASS** |
| **19**| `tests/shadow_dashboard_integration.test.js`<br>Section 3 | **TEST_MOCK** | Local / CI Node.js | Synthetic mock | In-memory | Verifies UI reflects suspended hold truthfully. | **PASS** |
| **20**| Legacy HandicapLab Cloud Run (`handicaplab-production-129269713730`) | **HISTORICAL_UPSTREAM** | Google Cloud Run `asia-southeast2` | GCP Secret Manager | Shared dynamic IP pool | Historical root cause. Cloud Scheduler jobs verified paused. | **PAUSED (INACTIVE)** |

---

## 2. Summary of Migration vs. Disablement

- **Production Application Code (`src/`):** **100% Migrated & Decoupled.** `apiFootballProvider.ts` routes strictly through `ApiFootballGatewayClient`. Zero direct calls to `v3.football.api-sports.io`.
- **Historical / Operational Scripts (`scripts/`, `scratch/`):** **100% Permanently Disabled.** Not migrated to gateway; instead, permanently locked with unconditional `process.exit(1)` / fatal error guards with all environment-variable bypasses stripped.
- **CI/CD Pipelines (`.github/`):** **100% Cleansed.** Secret `API_FOOTBALL_KEY` purged from workflow files.
