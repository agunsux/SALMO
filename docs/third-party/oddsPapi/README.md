# OddsPapi Documentation Archive — SALMO

> **Archive Purpose**: Local, auditable reference archive of official OddsPapi REST API v4 (`https://oddspapi.io/us/docs`), B2B API v5 (`https://docs.oddspapi.io`), and official technical blog documentation (`https://oddspapi.io/blog/football-data-api-betting-predictions/`), mapped against SALMO's repository implementation, offline research plan, and quota-guard state.

## Index

| File | Description | Source Coverage |
|------|-------------|-----------------|
| [v4_overview.md](./v4_overview.md) | REST API v4 overview, host, authentication, navigation index | **VERIFIED** (`https://oddspapi.io/us/docs`) |
| [v4_endpoints.md](./v4_endpoints.md) | Complete specification of all 16 documented v4 REST endpoints + WebSocket + undocumented `/v4/players` reference | **VERIFIED** (17 official subpages retrieved) |
| [v4_account_and_quota.md](./v4_account_and_quota.md) | `/v4/account` schema, official `Requests & Quota` rules, sanitized SALMO ground-truth snapshot, and SALMO guard comparison | **VERIFIED** (`/us/docs/requests-and-quota` + `/us/docs/get-account`) |
| [b2b_v5_overview.md](./b2b_v5_overview.md) | B2B API v5 (`https://docs.oddspapi.io`) architecture, REST & WebSocket index, rate limits, and `NOT IMPLEMENTED` status | **VERIFIED** (`llms.txt` index + 5 core pages retrieved; individual endpoint specs unretrieved by design) |
| [endpoint_inventory.md](./endpoint_inventory.md) | Complete code-to-doc matrix across all v4 & B2B v5 endpoints with parameter-level contract notes | **VERIFIED** |
| [quota_reconciliation.md](./quota_reconciliation.md) | Audit of `260/250` overuse, official vs. code quota rules, Critical Persistence Gate answers, and `DEPLOYMENT BLOCKED` verdict | **VERIFIED** |
| [blog_football_predictions_review.md](./blog_football_predictions_review.md) | Review of official OddsPapi football prediction article (`/blog/football-data-api-betting-predictions/`), separating article claims, contract facts, verified SALMO findings, and offline testing items | **VERIFIED** (`https://oddspapi.io/blog/football-data-api-betting-predictions/`) |
| [historical_odds_research_plan.md](./historical_odds_research_plan.md) | Offline research plan for `/v4/historical-odds` & `/v4/scores` coverage, fixture reconciliation, pre-kickoff look-ahead prevention, AH/OU quarter-line Brier/CLV, and promotion governance | **VERIFIED** (Offline Research Plan) |

## Retrieval & Provenance Log

- **Retrieval Timestamp**: `2026-10-13T02:05:31+07:00` – `2026-10-13T02:51:06+07:00`
- **Branch**: `feat/phase2d-controlled-p0-p1`
- **Paid API Calls Executed**: `0` (all pages retrieved from public static documentation HTML/Markdown)

### Retrieved Official Pages

1. **REST API v4 (`https://oddspapi.io/us/docs`) — 19 of 19 navigation pages retrieved**:
   - Overview: `https://oddspapi.io/us/docs` (redirected from `https://oddspapi.io/docs`)
   - Quota Rules: `https://oddspapi.io/us/docs/requests-and-quota`
   - 16 REST Endpoints:
     - `https://oddspapi.io/us/docs/get-account`
     - `https://oddspapi.io/us/docs/post-account`
     - `https://oddspapi.io/us/docs/post-refresh-api-key`
     - `https://oddspapi.io/us/docs/get-languages`
     - `https://oddspapi.io/us/docs/get-sports`
     - `https://oddspapi.io/us/docs/get-bookmakers`
     - `https://oddspapi.io/us/docs/get-tournaments`
     - `https://oddspapi.io/us/docs/get-fixtures`
     - `https://oddspapi.io/us/docs/get-fixture`
     - `https://oddspapi.io/us/docs/get-markets`
     - `https://oddspapi.io/us/docs/get-participants`
     - `https://oddspapi.io/us/docs/get-odds`
     - `https://oddspapi.io/us/docs/get-odds-by-tournaments`
     - `https://oddspapi.io/us/docs/get-historical-odds`
     - `https://oddspapi.io/us/docs/get-settlements`
     - `https://oddspapi.io/us/docs/get-scores`
   - WebSocket v4: `https://oddspapi.io/us/docs/websocket-api`
   - Probed non-existent page: `https://oddspapi.io/us/docs/get-players` (falls back to `OddsPapi | Docs Overview`; `/v4/players` is listed in `/us/docs/requests-and-quota` without a dedicated sidebar page).
2. **B2B API v5 (`https://docs.oddspapi.io`) — Index + 5 core pages retrieved**:
   - `https://docs.oddspapi.io/llms.txt` (Full sitemap/index of all v5 pages)
   - `https://docs.oddspapi.io/index.md`
   - `https://docs.oddspapi.io/api-reference/overview.md`
   - `https://docs.oddspapi.io/api-reference/authentication.md`
   - `https://docs.oddspapi.io/api-reference/rate-limits.md`
   - `https://docs.oddspapi.io/websocket/overview.md`
   - *(Individual v5 endpoint leaf pages listed in `llms.txt` are cataloged by URL in [b2b_v5_overview.md](./b2b_v5_overview.md) and marked `INDEXED ONLY — NOT RETRIEVED` because SALMO does not implement B2B v5.)*
3. **Official OddsPapi Technical Blog (`https://oddspapi.io/blog/`) — 1 article retrieved**:
   - `https://oddspapi.io/blog/football-data-api-betting-predictions/` (*Football Data API: Grade Your Model on 250 Labelled Fixtures*, published `2026-10-01T10:00:00+00:00`, retrieved `2026-10-13T02:51:06+07:00`).
