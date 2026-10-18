# EPIC SALMO — HANDICAPLAB CONTRACT INTEGRATION, LEDGER RECONCILIATION & PRODUCTION READINESS REPORT

**Generated:** 2026-10-18T17:48:00+07:00  
**Scope:** `c:\Users\RYZEN\.antigravity-ide\SALMO` (Consumer UI / Verification Surface)  
**Status:** **GO FOR LOCAL CONTRACT INTEGRATION** | **BLOCKED_PENDING_BACKEND_DEPLOYMENT FOR PRODUCTION CLOUD RUN**  
**Vercel Deployment:** **HELD** (Pending backend live verification)  
**Cloud Scheduler:** **STRICTLY PAUSED**

---

## EXECUTIVE SUMMARY

SALMO has completed its role as the authoritative consumer UI for the HandicapLab canonical contract. Direct polling fallbacks to third-party providers (API-Football, FootyStats, OddsPapi) within SALMO have been thoroughly disarmed. All picks, fixtures, verified results, and provider statuses now strictly consume the versioned HandicapLab contract through the modernized `HttpHandicapLabAdapter`.

A live probe to the deployed Cloud Run instance (`handicaplab-production-00011-v6p`) confirmed that the backend is currently running a legacy build expecting Google Cloud Scheduler OIDC tokens and rejects Bearer API keys (`CRYPTOGRAPHIC_VERIFICATION_FAILED: Wrong number of segments in token`). Consequently, the live integration status is officially classified as **`BLOCKED_PENDING_BACKEND_DEPLOYMENT`**. No deployment to Vercel production has been triggered, preserving operational integrity.

---

## 1. GIT PROVENANCE & BASELINE AUDIT

| Component | Status / Hash | Notes |
| :--- | :--- | :--- |
| **Branch** | `main` | Verified working branch |
| **Commit Baseline** | `2144784` | Synced with `origin/main` |
| **Remote Origin** | `https://github.com/ghiffari99/SALMO.git` | Clean provenance |
| **Modified Files** | 7 files | Contract client, adapter, sync, settlement, picks & research routes |
| **New Test** | `tests/salmo_handicaplab_contract_integration.test.js` | 8 dedicated contract integration tests |
| **HandicapLab Workspace** | **Untouched** | Zero edits to `c:\Users\RYZEN\.antigravity-ide\HandicapLab` |

---

## 2. PROVIDER DISARMAMENT AUDIT

SALMO is strictly a consumer UI and research dashboard; it does not duplicate ingestion infrastructure or poll upstream providers directly:

1. **OddsPapi Direct Calls Disarmed:**
   - `src/engine/matchIntelligenceService.ts`: Removed fallback calls to OddsPapi when fixtures/odds are empty. Replaced with structured queries to `HttpHandicapLabAdapter` with graceful empty state handling (`HANDICAPLAB_EMPTY`).
2. **API-Football Direct Settlement Disarmed:**
   - `src/engine/settlement/productionSettlementRunner.ts`: Completely removed direct API-Football REST calls (`fetchFixturesByIds`) from the active settlement loop. Match scores are now resolved exclusively through local Supabase storage and the canonical `verifiedResults` array in the HandicapLab sync payload.
3. **FootyStats Direct Calls Confined:**
   - No active production runtime calls to FootyStats occur in SALMO's daily picks or research surfaces. FootyStats historical backfill data remains strictly in offline forensic analysis scripts.

---

## 3. CANONICAL CONTRACT SPECIFICATION & ADAPTER CONSUMPTION

The SALMO HandicapLab client (`src/contracts/handicapLabClient.ts`) and adapter (`src/contracts/handicapLabAdapter.ts`) have been upgraded to match the exact schema specified in HandicapLab's `SALMO_DATA_EXCHANGE_SPECIFICATION.md`:

### Core DTOs Implemented:
- `SalmoDataState`: Union type of `'EMPTY' | 'RESEARCH_ONLY' | 'QUALIFIED' | 'QUOTA_BLOCKED' | 'PROVIDER_ERROR' | 'DATA_TEMPORARILY_UNAVAILABLE'`.
- `SalmoDailyPickDTO`: Full pick structure with pre-match timestamp, freeze time, home/away odds, dynamic Asian handicap & O/U lines, stake, EV, status, and contract version.
- `SalmoUpcomingFixtureDTO`: Unfiltered fixture slate from HandicapLab for research.
- `SalmoVerifiedResultDTO`: Verified settlement payload containing official scores, status (`FT`), and settlement timestamps.
- `SalmoProviderStatusReport`: Live status of API-Football, FootyStats, The Odds API, and OddsPapi.
- `SalmoFreshnessReport`: Payload generation time, data age in seconds, and staleness warning.
- `SalmoProductionSyncPayload`: Unified envelope (`contractVersion: "3.1.0"`).

### Robust Adapter Features:
- **Fail-Closed Networking:** 10,000ms timeout enforced via `AbortController`.
- **Automatic Retries:** Exponential backoff for transient 5xx HTTP responses.
- **Header Authentication:** Passes `Authorization: Bearer <HANDICAPLAB_API_KEY>` or falls back to `x-api-key`.
- **Secret-Safe Error Logging:** Token values are stripped before logging error details.

---

## 4. LEDGER RECONCILIATION & BETTING TRUTH AUDIT

A complete forensic scan of all local SALMO ledgers was executed:

| Ledger File | Total Records | Settled Records | Pending Records | Net P/L | ROI | Historical Proof |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `live_prediction_ledger.jsonl` | 30 | 12 | 18 | **+0.83 units** | **+6.92%** | Real historical matches; zero fabrication |
| `all_leagues_research_ledger.jsonl` | 336 | 0 | 336 | **0.00 units** | **0.00%** | Research tier; zero stake, zero profit claimed |
| `handicaplab_sync_ledger.jsonl` | 549 | — | — | — | — | Sync history with deterministic pre-match provenance |

### Integrity Findings:
1. **Zero CLV Fabrication:** No fabricated closing line values exist in production records.
2. **Pre-Match Provenance:** All 12 settled records in `live_prediction_ledger.jsonl` carry pre-match generation timestamps (`created_at < kickoff_at`).
3. **Pending Isolation:** 18 records correctly retain `status: "PENDING"` awaiting verified scores from HandicapLab.

---

## 5. SETTLEMENT RECONCILIATION

- `productionSettlementRunner.ts` settles matches using the rules:
  - Match status must be `FT` (Finished).
  - Half-win / Half-loss rules for Asian handicap lines (quarter lines e.g. -0.25, -0.75, +0.25, +0.75) are mathematically verified against test fixtures.
  - Over/Under settlements calculate exact dynamic line logic (2.0, 2.25, 2.5, 2.75, 3.0, 3.5).
- Matches without verified scores from HandicapLab or database remain `PENDING`. No phantom settlements occur.

---

## 6. PUBLIC SURFACE & RESEARCH AUDIT

1. **Daily Picks Route (`/api/daily-picks`):**
   - Returns HTTP 200 with `{ status: "EMPTY", picks: [], message: "NO_QUALIFIED_PICKS" }` when no candidates qualify EV gates.
   - When HandicapLab responds with provider errors or quota blocks, maps directly to fail-closed state (`QUOTA_BLOCKED`, `DATA_TEMPORARILY_UNAVAILABLE`).
   - Never fabricates placeholder picks or synthetic predictions.
2. **Research Route (`/api/v1/research`):**
   - Surfaces unvetted fixtures and provider telemetry accurately.
   - Accurately renders provider degradation states without masking outages.

---

## 7. MULTI-LEAGUE GOVERNANCE

- Multi-league research data is strictly isolated into `all_leagues_research_ledger.jsonl`.
- Unqualified leagues or experimental research models carry `stake: 0` and are completely quarantined from `live_prediction_ledger.jsonl`.
- EPL remains the sole active tier permitted to yield actionable bets into `live_prediction_ledger.jsonl` when qualifying gates are satisfied.

---

## 8. TEST SUITE & BUILD VERIFICATION

1. **Unit & Integration Tests (`npm test`):**
   - **422 passed, 0 failed, 1 skipped** (across 54 test suites).
   - `tests/salmo_handicaplab_contract_integration.test.js` passed 8/8 tests.
2. **Production Build (`npm run build`):**
   - **Status: PASS (Exit code 0)**.
   - All 30 routes compiled and type-checked cleanly with Next.js 14.2.15.

---

## 9. LIVE INTEGRATION PROBE & PRODUCTION READINESS VERDICT

### Live Probe of Cloud Run Instance:
- **Target URL:** `https://handicaplab-production-129269713730.asia-southeast2.run.app/api/v1/salmo/sync`
- **Result:** HTTP 401 Unauthorized
- **Payload:** `{"success":false,"error":"UNAUTHORIZED","message":"CRYPTOGRAPHIC_VERIFICATION_FAILED: Wrong number of segments in token"}`
- **Diagnosis:** The live Cloud Run revision (`handicaplab-production-00011-v6p`) is currently expecting a 3-part Google Cloud Scheduler OIDC token and has not yet been updated with the new HandicapLab Bearer API key authentication route.

### Operational Verdicts:

| Scope | Verdict | Action Required |
| :--- | :--- | :--- |
| **SALMO Code & Contract Parity** | **GO (PASS)** | Code changes tested and ready for production |
| **Backend Deployment State** | **BLOCKED_PENDING_BACKEND_DEPLOYMENT** | Deploy HandicapLab to Cloud Run to activate new sync endpoints |
| **SALMO Vercel Deployment** | **HELD** | Do NOT deploy SALMO until HandicapLab backend is confirmed live |
| **Cloud Scheduler Jobs** | **STRICTLY PAUSED** | Maintain `handicaplab-pipeline-daily` and `rescue-daily` in PAUSED state |

---

## NEXT OPERATIONAL ACTIONS

1. **In HandicapLab Repo:**
   - Commit and push changes implementing contract v3.1.0.
   - Deploy new revision to Cloud Run (`gcloud run deploy ...`).
   - Verify `GET /api/v1/salmo/sync` returns HTTP 200 with Bearer API key.
2. **In SALMO Repo:**
   - Commit and merge verified changes to `main`.
   - Deploy SALMO to Vercel production.
   - Verify live handshake between `salmo.dev` and Cloud Run.
