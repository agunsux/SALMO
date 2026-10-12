# OddsPapi REST API v4 — Overview

- **Canonical Source URL**: `https://oddspapi.io/us/docs` (redirect target of `https://oddspapi.io/docs`)
- **Retrieval Timestamp**: `2026-10-13T02:01:43+07:00`
- **Page Title**: `OddsPapi | Documentation overview` (`H1: OddsPapi Sports Betting Odds API Documentation`)
- **Retrieval Status**: **VERIFIED (Full HTML retrieved)**

---

## 1. Official Source Facts

### Host & Base URL
- **Official Host**: `https://api.oddspapi.io`
- **REST API v4 Prefix**: `https://api.oddspapi.io/v4`
- **WebSocket v4 Endpoint**: `wss://api.oddspapi.io/v4/ws?apiKey=YOUR_API_KEY`

### Authorization
All REST v4 endpoints require an API key passed as a query parameter:

| Parameter | Key | Value |
|-----------|-----|-------|
| Authorization | `apiKey` | `{{YOUR_API_KEY}}` |

### Official 3-Step Quickstart Shown on Overview Page
1. **Step 1 — Get your API key**: Obtained from account settings (`/us/account`).
2. **Step 2 — Get leagues for a sport**:
   - `GET https://api.oddspapi.io/v4/tournaments?sportId=10&apiKey={{YOUR_API_KEY}}`
   - Returns array of tournament objects (`tournamentId`, `tournamentSlug`, `tournamentName`, `categorySlug`, `categoryName`, `futureFixtures`, `upcomingFixtures`, `liveFixtures`).
3. **Step 3 — Get upcoming events and odds by leagues**:
   - Overview page example URL: `GET https://api.oddspapi.io/v4/odds-by-tournaments?bookmaker=pinnacle&tournamentIds=17,8&apiKey={{YOUR_API_KEY}}`
   - *(Note: The overview page example uses singular `bookmaker=pinnacle`, whereas the dedicated endpoint page `/us/docs/get-odds-by-tournaments` documents `bookmakers` (max 3). See [v4_endpoints.md](./v4_endpoints.md) for the exact comparison.)*

### Official Sidebar Navigation (`OddsPapi Documentation v4`)
The official sidebar on `https://oddspapi.io/us/docs` lists **19 items** plus an external link to B2B v5:
1. **Overview** (`/us/docs`)
2. **Requests & Quota** (`/us/docs/requests-and-quota`)
3. **REST API Endpoints (16 pages)**:
   - `GET account` (`/us/docs/get-account`)
   - `POST account` (`/us/docs/post-account`)
   - `POST refresh api key` (`/us/docs/post-refresh-api-key`)
   - `GET languages` (`/us/docs/get-languages`)
   - `GET sports` (`/us/docs/get-sports`)
   - `GET bookmakers` (`/us/docs/get-bookmakers`)
   - `GET tournaments` (`/us/docs/get-tournaments`)
   - `GET fixtures` (`/us/docs/get-fixtures`)
   - `GET fixture` (`/us/docs/get-fixture`)
   - `GET markets` (`/us/docs/get-markets`)
   - `GET participants` (`/us/docs/get-participants`)
   - `GET odds` (`/us/docs/get-odds`)
   - `GET odds by tournaments` (`/us/docs/get-odds-by-tournaments`)
   - `GET historical odds` (`/us/docs/get-historical-odds`)
   - `GET settlements` (`/us/docs/get-settlements`)
   - `GET scores` (`/us/docs/get-scores`)
4. **Websocket API** (`/us/docs/websocket-api`)
5. **B2B docs (v5) ↗** (`https://docs.oddspapi.io`)

---

## 2. Repository Implementation Facts (SALMO)

- **Configured Base URL**: [`src/config/env.ts`](../../../src/config/env.ts) sets `env.providers.oddsPapi.baseUrl` to `process.env.ODDS_PAPI_BASE_URL || 'https://api.oddspapi.io/v4'`.
- **Configured Authentication**: [`OddsPapiProvider`](../../../src/services/providers/oddsPapiProvider.ts) and [`OddsPapiQuotaGuard`](../../../src/lib/quota/oddsPapiQuotaGuard.ts) append `apiKey=${apiKey}` as a query string parameter.
- **Sport Scope**: SALMO queries `sportId=10` (Soccer/Football) exclusively, across 15 canonical tournament IDs mapped in [`src/config/multiLeagueRegistry.ts`](../../../src/config/multiLeagueRegistry.ts).

---

## 3. Unresolved Assumptions & Discrepancies

- **Undocumented `/v4/players` endpoint**: Listed as a billable endpoint on `/us/docs/requests-and-quota`, but has no entry in the v4 sidebar (`https://oddspapi.io/us/docs/get-players` falls back to the overview page). SALMO does not call `/v4/players`.
- **`bookmaker` vs `bookmakers` parameter on `/v4/odds-by-tournaments`**: The v4 Overview page Step 3 curl snippet uses `bookmaker=pinnacle` (singular), while the dedicated endpoint specification `/us/docs/get-odds-by-tournaments` documents `bookmakers` (plural, required, max 3; max 1 with `betfair-ex`). In Phase 2D.1, [`OddsPapiProvider.buildOddsByTournamentsRequestUrl()`](../../../src/services/providers/oddsPapiProvider.ts) was standardized on the canonical endpoint specification (`tournamentIds` + `bookmakers`), while recording this upstream documentation discrepancy.
