# OddsPapi REST API v4 — Complete Endpoint Reference

- **Canonical Source Portal**: `https://oddspapi.io/us/docs`
- **Retrieval Timestamp**: `2026-10-13T02:05:31+07:00` – `2026-10-13T02:06:30+07:00`
- **Retrieval Status**: **VERIFIED (All 17 official endpoint & WebSocket subpages retrieved directly)**

---

## 1. Account & Key Management Endpoints

### 1.1 `GET /v4/account`
- **Source URL**: `https://oddspapi.io/us/docs/get-account`
- **Page Title**: `OddsPapi | Docs GET account`
- **Retrieval Status**: `VERIFIED` (`2026-10-13T02:05:38+07:00`)
- **Quota Classification**: **Unmetered** (does not count toward quota; never blocked even when `request_count >= request_limit`, per `/us/docs/requests-and-quota`)
- **Cooldown**: `1000ms`
- **Parameters**: `apiKey` (query, required)
- **Response (200 OK)**: JSON object with `api_key`, `created_at`, `language_code`, `language_name`, `current_subscription_id`, and `subscriptions[]` (`subscription_id`, `currency`, `price`, `valid_from`, `valid_until`, `auto_renew`, `is_active`, `created_at`, `bookmakers`, `sport_ids`, `websocket_access`, `request_limit`, `rate_limit`, `request_count`, `last_request`).
- **SALMO Status**: **IMPLEMENTED** in [`OddsPapiQuotaGuard.syncAccount()`](../../../src/lib/quota/oddsPapiQuotaGuard.ts#L462-L490).

### 1.2 `POST /v4/account`
- **Source URL**: `https://oddspapi.io/us/docs/post-account`
- **Page Title**: `OddsPapi | Docs POST account`
- **Retrieval Status**: `VERIFIED` (`2026-10-13T02:05:41+07:00`)
- **Quota Classification**: Not listed in `/us/docs/requests-and-quota` billable list (account mutator)
- **Cooldown**: `1000ms`
- **Parameters**:
  - `language` (`string`, required): 2-letter `a2` code from `/v4/languages` (e.g., `en`).
- **Response (200 OK)**: Updates account interface language and returns account JSON.
- **SALMO Status**: **NOT IMPLEMENTED**.

### 1.3 `POST /v4/account/refresh-api-key`
- **Source URL**: `https://oddspapi.io/us/docs/post-refresh-api-key`
- **Page Title**: `OddsPapi | Docs POST refresh api key`
- **Retrieval Status**: `VERIFIED` (`2026-10-13T02:05:43+07:00`)
- **Cooldown**: `1000ms`
- **Parameters**: `apiKey` (query, required)
- **Response (200 OK)**: `{ "api_key": "<new_api_key>" }`
- **SALMO Status**: **NOT IMPLEMENTED** (keys are managed out-of-band via environment variables).

---

## 2. Reference / Metadata Endpoints

### 2.1 `GET /v4/languages`
- **Source URL**: `https://oddspapi.io/us/docs/get-languages`
- **Page Title**: `OddsPapi | Docs GET languages`
- **Retrieval Status**: `VERIFIED` (`2026-10-13T02:05:45+07:00`)
- **Quota Classification**: **Billable** (1 request per call)
- **Cooldown**: `1000ms`
- **Parameters**: None (besides `apiKey`)
- **Response (200 OK)**: JSON containing `a2` (2-letter language code) and `name` (language name).
- **SALMO Status**: **NOT IMPLEMENTED**.

### 2.2 `GET /v4/sports`
- **Source URL**: `https://oddspapi.io/us/docs/get-sports`
- **Page Title**: `OddsPapi | Docs GET sports`
- **Retrieval Status**: `VERIFIED` (`2026-10-13T02:05:48+07:00`)
- **Quota Classification**: **Billable** (1 request per call)
- **Cooldown**: `1000ms`
- **Parameters**:
  - `language` (`string`, optional): Language for `sportName` (e.g., `en`).
- **Response (200 OK)**: JSON array of `{ "sportId": number, "slug": string, "sportName": string }` (e.g., `sportId: 10` = `"Soccer"`).
- **SALMO Status**: **NOT IMPLEMENTED** (`sportId=10` is hardcoded in [`OddsPapiProvider`](../../../src/services/providers/oddsPapiProvider.ts#L84) and [`OddsPapiQuotaGuard`](../../../src/lib/quota/oddsPapiQuotaGuard.ts#L307)).

### 2.3 `GET /v4/bookmakers`
- **Source URL**: `https://oddspapi.io/us/docs/get-bookmakers`
- **Page Title**: `OddsPapi | Docs GET bookmakers`
- **Retrieval Status**: `VERIFIED` (`2026-10-13T02:05:50+07:00`)
- **Quota Classification**: **Billable** (1 request per call)
- **Cooldown**: `1000ms`
- **Parameters**: None (besides `apiKey`)
- **Response (200 OK)**: JSON array of `{ "bookmakerName": string, "slug": string, "liveOdds": boolean|null, "cloneOf": string|null }`.
- **SALMO Status**: **NOT IMPLEMENTED** (bookmaker slugs `pinnacle` and `bet365` are statically configured in [`src/services/providers/types.ts`](../../../src/services/providers/types.ts)).

### 2.4 `GET /v4/tournaments`
- **Source URL**: `https://oddspapi.io/us/docs/get-tournaments`
- **Page Title**: `OddsPapi | Docs GET tournaments`
- **Retrieval Status**: `VERIFIED` (`2026-10-13T02:06:04+07:00`)
- **Quota Classification**: **Billable** (1 request per call)
- **Cooldown**: `1000ms`
- **Parameters**:
  - `sportId` (`number`, **required**): Sport ID (e.g., `10`).
  - `language` (`a2`, optional): Default `en`.
- **Response (200 OK)**: JSON array of `{ "tournamentId": number, "tournamentSlug": string, "tournamentName": string, "categorySlug": string, "categoryName": string, "futureFixtures": number, "upcomingFixtures": number, "liveFixtures": number }`.
- **SALMO Status**: **NOT IMPLEMENTED** at runtime (the 15 canonical `oddspapi_tournament_id` values are statically registered in [`src/config/multiLeagueRegistry.ts`](../../../src/config/multiLeagueRegistry.ts)).

### 2.5 `GET /v4/markets`
- **Source URL**: `https://oddspapi.io/us/docs/get-markets`
- **Page Title**: `OddsPapi | Docs GET markets`
- **Retrieval Status**: `VERIFIED` (`2026-10-13T02:06:12+07:00`)
- **Quota Classification**: **Billable** (1 request per call)
- **Cooldown**: `1000ms`
- **Parameters**:
  - `language` (`a2`, optional): Default `en`.
- **Response (200 OK)**: JSON array of `{ "marketId": number, "marketLength": number, "marketName": string, "playerProp": boolean, "sportId": number, "handicap": number, "period": string, "marketType": string, "outcomes": [{ "outcomeId": number, "outcomeName": string }] }`.
- **SALMO Status**: **NOT IMPLEMENTED** (market parsing in [`OddsPapiProvider.parseOddsApiResponse`](../../../src/services/providers/oddsPapiProvider.ts#L477-L614) inspects `bookmakerMarketId` suffixes `/spreads`, `/totals`, `/btts`).

### 2.6 `GET /v4/participants`
- **Source URL**: `https://oddspapi.io/us/docs/get-participants`
- **Page Title**: `OddsPapi | Docs GET participants`
- **Retrieval Status**: `VERIFIED` (`2026-10-13T02:06:14+07:00`)
- **Quota Classification**: **Billable** (1 request per call)
- **Cooldown**: `1000ms`
- **Parameters**:
  - `sportId` (`number`, **required**): Numeric identifier for the sport.
  - `language` (`a2`, optional): Default `en`.
- **Response (200 OK)**: JSON object mapping `{ "<participantId>": "<participantName>" }`.
- **SALMO Status**: **NOT IMPLEMENTED**.

---

## 3. Fixture Discovery Endpoints

### 3.1 `GET /v4/fixtures`
- **Source URL**: `https://oddspapi.io/us/docs/get-fixtures`
- **Page Title**: `OddsPapi | Docs GET fixtures`
- **Retrieval Status**: `VERIFIED` (`2026-10-13T02:06:07+07:00`)
- **Quota Classification**: **Billable** (1 request per call)
- **Cooldown**: `2000ms`
- **Official Parameters**:
  - `tournamentId` (`number`, optional): Single league ID.
  - `sportId` (`number`, optional): Sport ID (must be accompanied by `tournamentId`, `participantId`, or `from` + `to` `< 10 days` apart).
  - `participantId` (`number`, optional): Participant ID.
  - `from` (`string`, ISO 8601, optional): Start date/time.
  - `to` (`string`, ISO 8601, optional): End date/time (if only `from` and `to` are provided without `sportId`/`tournamentId`/`participantId`, must be `< 48 hours` apart).
  - `language` (`a2`, optional): Default `en`.
  - `statusId` (`number`, optional): `0` (Not yet started), `1` (Live), `2` (Finished), `3` (Cancelled).
  - `hasOdds` (`boolean`, optional): Filter by odds availability.
  - `bookmakers` (`string`, optional): Comma-separated bookmaker slugs used to evaluate `hasOdds`.
- **Response (200 OK)**: JSON array of fixture objects (`fixtureId`, `participant1Id`, `participant2Id`, `sportId`, `tournamentId`, `seasonId`, `statusId`, `hasOdds`, `startTime`, `trueStartTime`, `trueEndTime`, `updatedAt`, `statusName`, `participant1Name`, `participant2Name`, `tournamentSlug`, `tournamentName`, `externalProviders`, etc.).
- **SALMO Status**: **IMPLEMENTED (Remediated in Phase 2D.1)** in [`OddsPapiProvider.getUpcomingFixtures()`](../../../src/services/providers/oddsPapiProvider.ts) and [`OddsPapiProvider.buildFixturesRequestUrl()`](../../../src/services/providers/oddsPapiProvider.ts).
- **Phase 2D.1 Contract Alignment**:
  1. Uses singular `tournamentId` (`number`) per request and never emits the undocumented `tournaments=` parameter.
  2. Validates `< 10 days` date window when `sportId` is provided without `tournamentId`/`participantId`, and `< 48 hours` when unfiltered (`FIXTURES_MAX_SPORT_DATE_WINDOW_DAYS = 10`, `FIXTURES_MAX_UNFILTERED_DATE_WINDOW_HOURS = 48`).
  3. Enforces the official `2000ms` cooldown (`FIXTURES_COOLDOWN_MS = 2000`) between consecutive `/v4/fixtures` calls.

### 3.2 `GET /v4/fixture`
- **Source URL**: `https://oddspapi.io/us/docs/get-fixture`
- **Page Title**: `OddsPapi | Docs GET fixture`
- **Retrieval Status**: `VERIFIED` (`2026-10-13T02:06:09+07:00`)
- **Quota Classification**: **Billable** (1 request per call)
- **Cooldown**: `500ms`
- **Parameters**:
  - `fixtureId` (`string`, **required**): Unique ID of the fixture (e.g., `id1000001761301153`).
  - `language` (`string`, optional): Default `en`.
- **Response (200 OK)**: Single fixture metadata object including `externalProviders` (`betradarId`, `mollybetId`, `opticoddsId`, `sofascoreId`, `betgeniusId`, `flashscoreId`, `pinnacleId`, `oddinId`). Does not include odds.
- **SALMO Status**: **DISABLED / STUBBED** — [`OddsPapiProvider.getFixtureById()`](../../../src/services/providers/oddsPapiProvider.ts) returns `DATA_UNAVAILABLE` without making network calls.

---

## 4. Odds & Historical Odds Endpoints

### 4.1 `GET /v4/odds`
- **Source URL**: `https://oddspapi.io/us/docs/get-odds`
- **Page Title**: `OddsPapi | Docs GET odds`
- **Retrieval Status**: `VERIFIED` (`2026-10-13T02:06:17+07:00`)
- **Quota Classification**: **Billable** (1 request per call)
- **Cooldown**: `500ms`
- **Parameters**:
  - `fixtureId` (`string`, **required**): Unique ID of the event.
  - `bookmakers` (`string`, optional): Comma-separated list of bookmakers.
  - `oddsFormat` (`string`, optional): `fractional`, `decimal`, `american` (note: response always includes `price`, `priceAmerican`, and `priceFractional`).
  - `language` (`string`, optional): Language code.
  - `verbosity` (`number`, optional): Level of response detail.
- **Response (200 OK)**: Single fixture object with `bookmakerOdds.<slug>.markets.<marketId>.outcomes.<outcomeId>.players.<playerId>`.
- **SALMO Status**: **DISABLED** — [`OddsPapiProvider.getMarketOdds()`](../../../src/services/providers/oddsPapiProvider.ts) is intentionally blocked and returns `DATA_UNAVAILABLE` to prevent per-fixture quota exhaustion.

### 4.2 `GET /v4/odds-by-tournaments`
- **Source URL**: `https://oddspapi.io/us/docs/get-odds-by-tournaments`
- **Page Title**: `OddsPapi | Docs GET odds by tournaments`
- **Retrieval Status**: `VERIFIED` (`2026-10-13T02:06:20+07:00`)
- **Quota Classification**: **Billable** (1 request per call)
- **Cooldown**: `1000ms`
- **Official Parameters**:
  - `tournamentIds` (`string`, **required**): Comma-separated list of league IDs.
  - `bookmakers` (`string`, **required**): Comma-separated list of bookmakers (max 3; if using `betfair-ex`, max 1). *(Upstream doc note: the `/us/docs` Overview page Step 3 curl snippet shows singular `bookmaker=pinnacle`, whereas `/us/docs/get-odds-by-tournaments` specifies `bookmakers`.)*
  - `language` (`string`, optional): Default `en`.
  - `verbosity` (`number`, optional): Verbosity level.
- **Response (200 OK)**: Array/map of fixture objects with `bookmakerOdds.<slug>.markets`. Each player pricing entry contains `active`, `betslip`, `bookmakerOutcomeId`, `bookmakerChangedAt`, `changedAt`, `limit`, `playerName`, `price`, `priceAmerican`, `priceFractional`, `mainLine`, `exchangeMeta`.
- **SALMO Status**: **IMPLEMENTED (Remediated in Phase 2D.1)** in [`OddsPapiProvider.getSingleBatchTournamentOdds()`](../../../src/services/providers/oddsPapiProvider.ts), [`OddsPapiProvider.getBatchTournamentOdds()`](../../../src/services/providers/oddsPapiProvider.ts), and [`OddsPapiProvider.buildOddsByTournamentsRequestUrl()`](../../../src/services/providers/oddsPapiProvider.ts).
- **Phase 2D.1 Contract Alignment**:
  1. Both `getSingleBatchTournamentOdds()` and `getBatchTournamentOdds()` build URLs via `buildOddsByTournamentsRequestUrl()`, passing `tournamentIds` and `bookmakers` (never `tournaments=` or `bookmaker=`).
  2. Enforces `MAX_BOOKMAKERS_PER_REQUEST = 3`, `MAX_BOOKMAKERS_WITH_BETFAIR_EX = 1`, and `MAX_TOURNAMENTS_PER_BATCH_REQUEST = 5` (in `getBatchTournamentOdds`).
  3. Enforces the official `1000ms` cooldown (`ODDS_BY_TOURNAMENTS_COOLDOWN_MS = 1000`) between consecutive `/v4/odds-by-tournaments` calls.
  4. [`OddsPapiProvider.parseOddsApiResponse()`](../../../src/services/providers/oddsPapiProvider.ts) honors the official boolean `player0.mainLine` field when present, with fallback to legacy `line/.../0/` string detection.

### 4.3 `GET /v4/historical-odds`
- **Source URL**: `https://oddspapi.io/us/docs/get-historical-odds`
- **Page Title**: `OddsPapi | Docs GET historical odds`
- **Retrieval Status**: `VERIFIED` (`2026-10-13T02:06:22+07:00`)
- **Quota Classification**: **FREE** ("`/v4/historical-odds` — always free. Calls never increment your request count", per `/us/docs/requests-and-quota`). *Note: still blocked with HTTP 429 once `request_count >= request_limit`.*
- **Cooldown**: `5000ms` (304 responses still count against the 5000ms rate-limit cooldown)
- **Official Parameters & Headers**:
  - `fixtureId` (`string`, **required**): Event ID to retrieve historical odds for.
  - `bookmakers` (`string`, **required**): Comma-separated bookmaker slugs (max 3), e.g., `pinnacle,bet365`.
  - `id` (`number`, optional): Specific historical odds entry ID.
  - `playerId` (`number`, optional): Filter by playerId.
  - `outcomeId` (`number`, optional): Filter by outcomeId.
  - `active` (`boolean`, optional): Filter by active status.
  - Header `If-None-Match` (`string`, optional): ETag conditional request for finished/cancelled events (returns `304 Not Modified`).
- **Coverage Note**: Official page states: *"All historical odds data since January 2026 is available."*
- **SALMO Status**: **NOT IMPLEMENTED** (historical benchmarks in SALMO use local Football-Data.co.uk archives).

---

## 5. Settlement & Scores Endpoints

### 5.1 `GET /v4/settlements`
- **Source URL**: `https://oddspapi.io/us/docs/get-settlements`
- **Page Title**: `OddsPapi | Docs GET settlements`
- **Retrieval Status**: `VERIFIED` (`2026-10-13T02:06:25+07:00`)
- **Quota Classification**: **Billable** (1 request per call)
- **Cooldown**: `2000ms`
- **Parameters**:
  - `fixtureId` (`string`, **required**): Unique event ID.
  - `playerId` (`number`, optional): Filter by player ID.
  - `outcomeId` (`number`, optional): Filter by outcome ID.
- **Response (200 OK)**: `{ "fixtureId": string, "markets": { "<marketId>": { "outcomes": { "<outcomeId>": { "players": { "0": { "result": "WIN" | "LOSE" | "HALFWIN" | "HALFLOSS" | "PUSH" | "CANCELLED" | "UNDECIDED" } } } } } } }`.
- **SALMO Status**: **NOT IMPLEMENTED** (SALMO grades AH/OU outcomes deterministically via internal `QuarterLineSettler`).

### 5.2 `GET /v4/scores`
- **Source URL**: `https://oddspapi.io/us/docs/get-scores`
- **Page Title**: `OddsPapi | Docs GET scores`
- **Retrieval Status**: `VERIFIED` (`2026-10-13T02:06:27+07:00`)
- **Quota Classification**: **Billable** (1 request per call)
- **Cooldown**: `1000ms`
- **Parameters**:
  - `fixtureId` (`string`, **required**): Unique identifier of the event.
- **Response (200 OK)**: `{ "fixtureId": string, "scores": { "<periodKey>": { "participant1Score": number, "participant2Score": number, "updatedAt": string } } }`.
- **SALMO Status**: **NOT IMPLEMENTED**.

---

## 6. WebSocket Streaming (v4)

### 6.1 `wss://api.oddspapi.io/v4/ws`
- **Source URL**: `https://oddspapi.io/us/docs/websocket-api`
- **Page Title**: `OddsPapi | Docs Websocket API`
- **Retrieval Status**: `VERIFIED` (`2026-10-13T02:06:30+07:00`)
- **Connection URL**: `wss://api.oddspapi.io/v4/ws?apiKey=YOUR_API_KEY`
- **Access Restriction**: Official note states: *"The WebSocket is only available by contacting us or via the b2b plan."* (In SALMO's `/v4/account` snapshot, `"websocket_access": 0`.)
- **Protocol**: One-way (`server -> client`) JSON delta messages keyed by `fixtureId`, transmitting only changed fields (except complete `players` objects when any player value changes) and single-bookmaker updates per message.
- **SALMO Status**: **NOT IMPLEMENTED**.

---

## 7. Undocumented Endpoint Referenced in Quota Rules (`/v4/players`)

- **Source URL**: Referenced on `https://oddspapi.io/us/docs/requests-and-quota` under *Billable endpoints*.
- **Direct Page Check**: `https://oddspapi.io/us/docs/get-players` was probed on `2026-10-13T02:08:52+07:00` and falls back to `OddsPapi | Docs Overview` (no dedicated v4 specification page exists).
- **SALMO Status**: **NOT IMPLEMENTED**.
