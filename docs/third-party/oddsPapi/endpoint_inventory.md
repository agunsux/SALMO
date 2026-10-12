# OddsPapi — Complete Endpoint Inventory & Code-to-Doc Matrix

- **Updated**: `2026-10-13T02:10:00+07:00`
- **Branch**: `feat/phase2d-controlled-p0-p1`
- **Purpose**: Audit-ready mapping between every official OddsPapi v4 & B2B v5 documentation page and SALMO's codebase.

---

## 1. REST API v4 & WebSocket v4 Inventory (`https://oddspapi.io/us/docs`)

All 19 official pages in the v4 documentation navigation (plus the undocumented `/v4/players` endpoint listed on `/us/docs/requests-and-quota`) were directly retrieved and verified:

| # | Official Page / Endpoint | Canonical Doc URL | Doc Retrieval Status | Official Quota Rule | Cooldown | SALMO Status | Repository Location & Implementation Notes |
|---|--------------------------|-------------------|----------------------|---------------------|----------|--------------|-------------------------------------------|
| 1 | Overview | `https://oddspapi.io/us/docs` | `VERIFIED` | N/A | N/A | Reference | Host `https://api.oddspapi.io/v4` configured in [`src/config/env.ts`](../../../src/config/env.ts) |
| 2 | Requests & Quota | `https://oddspapi.io/us/docs/requests-and-quota` | `VERIFIED` | N/A | N/A | Reference | Defines billable vs. free (`/v4/historical-odds`) vs. unmetered (`/v4/account`) and 200/4xx/5xx counting rules |
| 3 | `GET /v4/account` | `https://oddspapi.io/us/docs/get-account` | `VERIFIED` | **Unmetered** (0 req, never blocked) | `1000ms` | **IMPLEMENTED** | [`OddsPapiQuotaGuard.syncAccount()`](../../../src/lib/quota/oddsPapiQuotaGuard.ts#L462-L490); 1s cooldown enforced; ground-truth response stored at [`oddspapi_account_response.json`](../../../data/verification/oddspapi_account_response.json) |
| 4 | `POST /v4/account` | `https://oddspapi.io/us/docs/post-account` | `VERIFIED` | Not in billable list | `1000ms` | **NOT IMPLEMENTED** | Updates account language (`?language=`); not used by SALMO |
| 5 | `POST /v4/account/refresh-api-key` | `https://oddspapi.io/us/docs/post-refresh-api-key` | `VERIFIED` | Not in billable list | `1000ms` | **NOT IMPLEMENTED** | Rotates API key; not used by SALMO |
| 6 | `GET /v4/languages` | `https://oddspapi.io/us/docs/get-languages` | `VERIFIED` | **Billable** (1 req) | `1000ms` | **NOT IMPLEMENTED** | Lists supported `a2` language codes |
| 7 | `GET /v4/sports` | `https://oddspapi.io/us/docs/get-sports` | `VERIFIED` | **Billable** (1 req) | `1000ms` | **NOT IMPLEMENTED** | SALMO hardcodes `sportId=10` (Soccer) |
| 8 | `GET /v4/bookmakers` | `https://oddspapi.io/us/docs/get-bookmakers` | `VERIFIED` | **Billable** (1 req) | `1000ms` | **NOT IMPLEMENTED** | SALMO statically configures `pinnacle` and `bet365` |
| 9 | `GET /v4/tournaments` | `https://oddspapi.io/us/docs/get-tournaments` | `VERIFIED` | **Billable** (1 req) | `1000ms` | **NOT IMPLEMENTED** | 15 canonical `oddspapi_tournament_id` values statically mapped in [`multiLeagueRegistry.ts`](../../../src/config/multiLeagueRegistry.ts) |
| 10 | `GET /v4/fixtures` | `https://oddspapi.io/us/docs/get-fixtures` | `VERIFIED` | **Billable** (1 req) | `2000ms` | **IMPLEMENTED (Phase 2D.1 Remediated)** | [`OddsPapiProvider.getUpcomingFixtures()`](../../../src/services/providers/oddsPapiProvider.ts) & [`buildFixturesRequestUrl()`](../../../src/services/providers/oddsPapiProvider.ts). Uses singular `tournamentId` (`number`), validates `<10d`/`<48h` date windows, and enforces `2000ms` cooldown |
| 11 | `GET /v4/fixture` | `https://oddspapi.io/us/docs/get-fixture` | `VERIFIED` | **Billable** (1 req) | `500ms` | **DISABLED (Stub)** | [`OddsPapiProvider.getFixtureById()`](../../../src/services/providers/oddsPapiProvider.ts) returns `DATA_UNAVAILABLE` with 0 network calls |
| 12 | `GET /v4/markets` | `https://oddspapi.io/us/docs/get-markets` | `VERIFIED` | **Billable** (1 req) | `1000ms` | **NOT IMPLEMENTED** | Market types inferred from `bookmakerMarketId` strings in [`parseOddsApiResponse()`](../../../src/services/providers/oddsPapiProvider.ts) |
| 13 | `GET /v4/participants` | `https://oddspapi.io/us/docs/get-participants` | `VERIFIED` | **Billable** (1 req) | `1000ms` | **NOT IMPLEMENTED** | Participant names extracted from fixture payloads |
| 14 | `GET /v4/odds` | `https://oddspapi.io/us/docs/get-odds` | `VERIFIED` | **Billable** (1 req) | `500ms` | **DISABLED (Quota Protection)** | [`OddsPapiProvider.getMarketOdds()`](../../../src/services/providers/oddsPapiProvider.ts) returns `DATA_UNAVAILABLE` to prevent per-fixture quota drain |
| 15 | `GET /v4/odds-by-tournaments` | `https://oddspapi.io/us/docs/get-odds-by-tournaments` | `VERIFIED` | **Billable** (1 req) | `1000ms` | **IMPLEMENTED (Phase 2D.1 Remediated)** | [`getSingleBatchTournamentOdds()`](../../../src/services/providers/oddsPapiProvider.ts), [`getBatchTournamentOdds()`](../../../src/services/providers/oddsPapiProvider.ts), & [`buildOddsByTournamentsRequestUrl()`](../../../src/services/providers/oddsPapiProvider.ts). Enforces `tournamentIds`, `bookmakers` (max 3; max 1 with `betfair-ex`), batch size `<= 5`, `1000ms` cooldown, and boolean `player0.mainLine` |
| 16 | `GET /v4/historical-odds` | `https://oddspapi.io/us/docs/get-historical-odds` | `VERIFIED` | **Free** (0 req, blocked if quota exhausted) | `5000ms` | **NOT IMPLEMENTED** | Supports ETag / `If-None-Match` (304) and covers data since Jan 2026; SALMO uses local Football-Data.co.uk archives |
| 17 | `GET /v4/settlements` | `https://oddspapi.io/us/docs/get-settlements` | `VERIFIED` | **Billable** (1 req) | `2000ms` | **NOT IMPLEMENTED** | SALMO settles AH/OU internally via `QuarterLineSettler` |
| 18 | `GET /v4/scores` | `https://oddspapi.io/us/docs/get-scores` | `VERIFIED` | **Billable** (1 req) | `1000ms` | **NOT IMPLEMENTED** | Scores sourced via openfootball / Football-Data |
| 19 | `wss://api.oddspapi.io/v4/ws` | `https://oddspapi.io/us/docs/websocket-api` | `VERIFIED` | B2B / Contact Only (`websocket_access`) | N/A | **NOT IMPLEMENTED** | SALMO subscription has `websocket_access: 0` |
| 20 | `/v4/players` *(undocumented page)* | Listed in `/us/docs/requests-and-quota`; `/us/docs/get-players` falls back to Overview | `VERIFIED (No Standalone Page)` | **Billable** (1 req) | Unknown | **NOT IMPLEMENTED** | Not referenced anywhere in SALMO |

---

## 2. B2B API v5 Inventory (`https://docs.oddspapi.io`)

Cataloged from the verified `https://docs.oddspapi.io/llms.txt` index and 5 retrieved core pages (`index.md`, `api-reference/overview.md`, `api-reference/authentication.md`, `api-reference/rate-limits.md`, `websocket/overview.md`):

| Category | Endpoints / Channels | Canonical Doc Prefix | Doc Retrieval Status | Official Rate Limit | SALMO Status |
|----------|----------------------|----------------------|----------------------|---------------------|--------------|
| Overview, Auth & Rate Limits (5 pages) | `index.md`, `overview.md`, `authentication.md`, `rate-limits.md`, `websocket/overview.md` | `https://docs.oddspapi.io/` | `VERIFIED` | N/A | **NOT IMPLEMENTED** |
| Common Metadata (9 REST endpoints) | `get-bookmakers`, `get-sports`, `get-tournaments`, `get-seasons`, `get-participants`, `get-players`, `get-venues`, `get-markets`, `get-currencies` | `https://docs.oddspapi.io/api-reference/common/` | `INDEXED ONLY — NOT RETRIEVED` | 100 req / min | **NOT IMPLEMENTED** |
| Fixtures (3 REST endpoints) | `fixtures-filtered`, `fixtures-today`, `fixtures-live` | `https://docs.oddspapi.io/api-reference/fixtures/` | `INDEXED ONLY — NOT RETRIEVED` | 100 req / min | **NOT IMPLEMENTED** |
| Fixtures/Odds (4 REST endpoints) | `fixture-odds`, `fixture-odds-clv`, `fixture-odds-historical`, `fixtures-odds-main` | `https://docs.oddspapi.io/api-reference/fixturesodds/` | `INDEXED ONLY — NOT RETRIEVED` | 10 req / sec (current/main), 100 req / min (CLV/historical) | **NOT IMPLEMENTED** |
| Parlays (2 REST endpoints) | `parlay-odds`, `same-game-parlay-odds` | `https://docs.oddspapi.io/api-reference/parlays/` | `INDEXED ONLY — NOT RETRIEVED` | 10 req / sec | **NOT IMPLEMENTED** |
| Mapping (2 REST endpoints) | `fixture-mapping`, `future-mapping` | `https://docs.oddspapi.io/api-reference/mapping/` | `INDEXED ONLY — NOT RETRIEVED` | 100 req / min | **NOT IMPLEMENTED** |
| Settlement (2 REST endpoints) | `fixture-settlement`, `future-settlement` | `https://docs.oddspapi.io/api-reference/settlement/` | `INDEXED ONLY — NOT RETRIEVED` | 100 req / min | **NOT IMPLEMENTED** |
| Futures & Futures/Odds (5 REST endpoints) | `futures-filtered`, `futures-live`, `future-odds`, `future-odds-clv`, `future-odds-historical` | `https://docs.oddspapi.io/api-reference/futures*` | `INDEXED ONLY — NOT RETRIEVED` | 10 req / sec (`future-odds`), 100 req / min (others) | **NOT IMPLEMENTED** |
| Media (4 REST endpoints) | `media-bookmaker`, `media-category`, `media-tournament`, `media-participant` | `https://docs.oddspapi.io/api-reference/media/` | `INDEXED ONLY — NOT RETRIEVED` | 100 req / min | **NOT IMPLEMENTED** |
| WebSocket v5 (`wss://v5.oddspapi.io/ws`) | 8 channels: `fixtures`, `futures`, `bookmakers`, `bookmakersFutures`, `odds`, `scores`, `clocks`, `currencies` | `https://docs.oddspapi.io/websocket/channels/` | `INDEXED ONLY — NOT RETRIEVED` | Max 5 concurrent connections per key group | **NOT IMPLEMENTED** |

---

## 3. Summary Counts

- **REST API v4**: 16 documented REST endpoints + 1 WebSocket endpoint + 1 undocumented billable endpoint (`/v4/players`) = **18 endpoints total**:
  - **IMPLEMENTED**: `3` (`GET /v4/account`, `GET /v4/fixtures`, `GET /v4/odds-by-tournaments` — parameter contracts & cooldowns remediated in Phase 2D.1)
  - **DISABLED / STUBBED**: `2` (`GET /v4/fixture`, `GET /v4/odds`)
  - **NOT IMPLEMENTED**: `13`
- **B2B API v5**: 31 REST endpoints + 8 WebSocket channels = **39 endpoints/channels total**:
  - **NOT IMPLEMENTED**: `39` (100% unimplemented by design)
