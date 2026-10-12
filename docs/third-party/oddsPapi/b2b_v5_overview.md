# OddsPapi B2B API v5 — Overview & Catalog

- **Canonical Source Portal**: `https://docs.oddspapi.io` (linked as `B2B docs (v5) ↗` from the v4 documentation sidebar)
- **Machine-Readable Documentation Index**: `https://docs.oddspapi.io/llms.txt`
- **Retrieval Timestamp**: `2026-10-13T02:02:15+07:00` – `2026-10-13T02:09:10+07:00`
- **Page Title**: `OddsPapi - B2B Sports Betting Odds API - OddsPapi API`

---

## 1. Retrieval & Verification Status

| URL | Title | Retrieval Status |
|-----|-------|------------------|
| `https://docs.oddspapi.io/llms.txt` | `OddsPapi API` (Full documentation index) | **VERIFIED** (`2026-10-13T02:06:32+07:00`) |
| `https://docs.oddspapi.io/index.md` | `OddsPapi - B2B Sports Betting Odds API` | **VERIFIED** (`2026-10-13T02:06:47+07:00`) |
| `https://docs.oddspapi.io/api-reference/overview.md` | `REST API Overview - HTTP Endpoints for Sports Data` | **VERIFIED** (`2026-10-13T02:06:49+07:00`) |
| `https://docs.oddspapi.io/api-reference/authentication.md` | `API Authentication - How to Authenticate Requests` | **VERIFIED** (`2026-10-13T02:09:08+07:00`) |
| `https://docs.oddspapi.io/api-reference/rate-limits.md` | `API Rate Limits - Request Quotas & Throttling` | **VERIFIED** (`2026-10-13T02:06:52+07:00`) |
| `https://docs.oddspapi.io/websocket/overview.md` | `WebSocket API Overview - Realtime Sports Data Streaming` | **VERIFIED** (`2026-10-13T02:09:10+07:00`) |
| Individual v5 endpoint leaf pages (`https://docs.oddspapi.io/api-reference/...`) | 29 REST endpoints + 8 WebSocket channel pages | **INDEXED ONLY — NOT RETRIEVED** (cataloged from `llms.txt` below; full schemas not fetched because B2B v5 is not used by SALMO) |

---

## 2. Official Source Facts (Verified from Retrieved v5 Pages)

### 2.1 Product Scope & Access
- **Target Audience**: Enterprise/commercial B2B data feed for licensed operators, trading firms, market makers, and sportsbooks (access via `contact@55-tech.com`).
- **Architecture**: WebSocket-first low-latency realtime stream paired with HTTP REST endpoints for initial snapshots, `snapshot_required` recovery, metadata, historical odds / Opening & Closing Line Value (OLV/CLV),parlay/SGP pricing, and settlement grading.

### 2.2 Base URLs & Languages (`/api-reference/overview.md`, `/websocket/overview.md`)
- **REST Base URL**: `https://v5.oddspapi.io/{lang}` (where `{lang}` is mandatory and case-insensitive: `en`, `es`, `fr`, `pt`, `de`, `it`, `ru`, `zh`; e.g., `https://v5.oddspapi.io/en/bookmakers`).
- **WebSocket Gateway**: `wss://v5.oddspapi.io/ws` (supports `receiveType`: `"json"`, `"binary"` MessagePack, `"zstd"`, or `"zstd-dict"`, plus cursor-based resume/replay via `serverEpoch` and `entryId`).

### 2.3 Authentication (`/api-reference/authentication.md`)
- Accepts **either** the `X-API-Key: YOUR_KEY` HTTP header (recommended) **or** the `?apiKey=YOUR_KEY` query parameter.
- Sending both with different values returns `401 invalid_api_key`. Entitled channel restrictions return `403 channel_not_allowed`.

### 2.4 Rate Limits & Headers (`/api-reference/rate-limits.md`)
Unlike v4's monthly request counter, B2B v5 documents throughput rate limits per `apiKey` and endpoint group:
- **High-frequency Odds Endpoints** (`GET /fixtures/odds`, `GET /fixtures/odds/main`, `GET /fixtures/odds/parlay`, `GET /fixtures/odds/sgp`, `GET /futures/odds`): **10 requests / second**.
- **All Other Endpoints** (metadata, fixtures list, mapping, settlements, historical, media redirects): **100 requests / minute**.
- **Response Headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `Retry-After` (on HTTP `429` with `code: "rate_limited"`).

### 2.5 Indexed B2B v5 Endpoints & Channels (from `https://docs.oddspapi.io/llms.txt`)
- **Common (9)**: `get-bookmakers`, `get-sports`, `get-tournaments`, `get-seasons`, `get-participants`, `get-players`, `get-venues`, `get-markets`, `get-currencies`.
- **Fixtures (3)**: `fixtures-filtered`, `fixtures-today`, `fixtures-live`.
- **Fixtures/Odds (4)**: `fixture-odds`, `fixture-odds-clv`, `fixture-odds-historical`, `fixtures-odds-main`.
- **Parlays (2)**: `parlay-odds`, `same-game-parlay-odds`.
- **Mapping (2)**: `fixture-mapping`, `future-mapping`.
- **Settlement (2)**: `fixture-settlement`, `future-settlement` (futures settlement noted as rolling out).
- **Futures (2)**: `futures-filtered`, `futures-live`.
- **Futures/Odds (3)**: `future-odds`, `future-odds-clv`, `future-odds-historical`.
- **Media (4)**: `media-bookmaker`, `media-category`, `media-tournament`, `media-participant`.
- **WebSocket Channels (8)**: `fixtures`, `futures`, `bookmakers`, `bookmakersFutures`, `odds`, `scores`, `clocks`, `currencies`.

---

## 3. Repository Implementation Facts (SALMO)

- **SALMO Status**: **NOT IMPLEMENTED**.
- Zero files in the SALMO repository reference `v5.oddspapi.io` or any B2B v5 endpoint.
- Per Phase 2D governance rules, no B2B v5 provider stub or integration is permitted.
