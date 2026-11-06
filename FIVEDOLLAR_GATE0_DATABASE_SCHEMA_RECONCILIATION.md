# Gate 0 — Database schema reconciliation

Audit 2026-11-07 Asia/Jakarta. **Status: PARTIAL; full catalog reconciliation BLOCKED.**

## Identity and access evidence

- Current Vercel Production public Supabase URL resolves to **rgkrfzxipkrwqccfuqfq.supabase.co**, project ref **rgkrfzxipkrwqccfuqfq**. Local Supabase configuration matches that host. The existing local service-role credential was used in request headers solely for authorized read-only schema inspection; no credential value is recorded here. No credential was requested or provisioned.
- E8: HTTPS GET /rest/v1/ with Accept application/openapi+json returned **200**, **214 definitions**, **223 paths**. Explicit Accept-Profile public also returned 200/214. This establishes a live public API schema surface, not 214 physical tables.
- E9: same root request with information_schema and pg_catalog profiles returned **406 / PGRST106 (Invalid schema)**. No catalogue rows or function bodies were available.
- First Node fetch failed UNABLE_TO_VERIFY_LEAF_SIGNATURE; retry with Node --use-system-ca succeeded. TLS validation was retained; no certificate bypass.
- SHA256 of JSON.stringify(received OpenAPI object): **af538a9fc27aea4b1a2d45d6ae8c0c75cd84cc70d544e7b558762f5e3694a402**. Relevant sanitized column/PK/FK metadata is preserved in the appendix below. No business/user rows were fetched; no RPC was executed.
- No direct PostgreSQL URL or Supabase management token was configured in the inspected .env.local. A dashboard session fallback was attempted, but Computer Use returned both native pipe and browser access host unavailable. No login/credentials requested.
- SQL database name/OID/server version and all schema names: **UNKNOWN**. Do not infer database name postgres or version 16 from Supabase conventions. Public is verified; enum type references public.source_type_enum and public.data_status_enum are visible. Other PostgreSQL schema existence is unverified.
- The project endpoint is verified against current Production configuration; the older deployment's frozen URL value remains an explicit limitation (see source report).

## Reconciliation matrix

Definitions are compared with data/schema.sql, data/schema_canonical.sql, November 5 migrations, October quota/durable-storage migrations, and current source queries. A local SQL file is a declared contract, not proof of successful application. Some files contain ALTER statements and triggers beyond their initial CREATE statements.

| Object | Local definition / query | Production public API definition | Classification / difference | Risk |
|---|---|---|---|---|
| matches identity | Canonical schema expects canonical_match_id, season, kickoff_time; FixtureRepository uses canonical identity | No canonical_match_id, season or kickoff_time exposed; UUID id, league/home/away and legacy metadata present | DIVERGED | Canonical writes/queries cannot assume local contract |
| matches time | Canonical kickoff/kickoff_time TIMESTAMPTZ, sync trigger; legacy schema kickoff_time | kickoff is required timestamp WITHOUT time zone | DIVERGED | UTC meaning not established; never invent offset |
| matches data classification | Canonical VARCHAR defaults | public.source_type_enum and public.data_status_enum | DIVERGED | Enum values/compatibility not introspected |
| market_snapshots | Defined in legacy/canonical SQL; canonical home/away prices, bookmaker default pinnacle, source default PINNACLE, immutability trigger | Not exposed | UNKNOWN (local declaration exists; physical absence not proven) | Must not treat odds_snapshots as same object or apply migration blindly |
| decisions / evidence | Canonical immutable decision/evidence relations | Not exposed | UNKNOWN | Repository persistence cannot be assumed valid |
| data_provenance | Canonical decision_id, source/version, dataset/calculation/settlement versions, checksum | target_type, target_id, target_label, links, computed_at, formula, source_hash, verified | DIVERGED | Same table name has incompatible meanings |
| predictions | Legacy declaration uses match_id VARCHAR(100), canonical_match_id, selection, line, model_probability and UNIQUE(match_id, market_type) | JSON prediction/odds_snapshot/closing_odds plus clv, closing_line_value, market and model fields | DIVERGED | Existing schema is not the repository declaration |
| prediction_ledger | Canonical/repository expects decision_id, line, model_probability, expected_value_pct, profit_loss, kickoff_utc and DOI uniqueness | Legacy 32 columns, UUID id; DOI and match_id text; requested canonical fields not exposed | DIVERGED | PerformanceRepository SELECT references absent columns; DOI uniqueness unverified |
| daily_picks | Canonical market_bookmaker and snapshot/decision links; legacy fixture_id VARCHAR | UUID fixture_id, text bookmaker, clv double precision, prediction_id and odds_snapshot_id UUID; decision_id not exposed | DIVERGED | Identity and FK assumptions unsafe |
| settlement_results | Canonical additions include ledger_position_id, market/outcome integrity and links | fixture_id UUID FK matches.id, prediction_id UUID FK predictions.id; line/selection/odds/outcome/profit; no ledger_position_id | DIVERGED | Existing position-level idempotency cannot be certified |
| ledger_settlements | Legacy schema stores clv_pct NUMERIC(6,2) | Not exposed | UNKNOWN | Cannot equate with settlement_results |
| quota_state / quota_reservations | October migration adds provider-specific cycle/reservation fields, RPCs and constraints | Simpler legacy quota tables; no mandatory_reserve or operational_ceiling in quota_state | DIVERGED | Local atomic quota contracts are not proven available |
| salmo_* quota RPCs | Local guard/migration references salmo_reserve_oddspapi_quota and companion functions | Exposed RPCs use reserve_quota, confirm_quota, rollback_quota, cleanup_stale_reservations | UNKNOWN for nonexposed functions; interface mismatch observed | Do not invoke to probe; may mutate quota |
| daily_prediction_refresh_ledger | October 15 migration and durable adapter | Not exposed | UNKNOWN | Durable storage fallback/application behavior requires independent review |
| _salmo_migrations | November 5 bootstrap bookkeeping table | Not exposed | UNKNOWN | Applied migration history unavailable |
| odds_snapshots / live_odds_snapshots | No same-named CREATE in inspected local schema/migration files | Existing odds relations with bookmaker, capture time, prices and provenance fields | PRODUCTION_AHEAD relative to inspected definitions; full contract UNKNOWN | Multiple snapshot systems coexist; no automatic reuse |
| closing_odds / clv_results | No same-named CREATE in inspected SQL | Closing flags and capture provider; CLV value/price/probability fields | PRODUCTION_AHEAD relative to inspected definitions | Units/formula/bookmaker equivalence unknown |
| provider_registry | Existing adapters use environment variables; no same-named CREATE in inspected SQL | id/name/type/base_url/rate_limit_per_min/is_active/timestamps | PRODUCTION_AHEAD relative to inspected definitions | Config rows not read; actual selection policy unknown |
| active_daily_picks / public_prediction_ledger / public_settlements | No view definition established | Exposed relations | UNKNOWN | Names do not prove view type or SQL filtering semantics |
| calculate_clv / get_closing_odds_for_match | No application caller found in src/scripts; no local function body established | RPC contracts visible, POST only | UNKNOWN | Could write; bodies/volatility/permissions not inspected, never invoked |
| All indexes/unique/check constraints/triggers/policies | Local files declare canonical uniqueness, checks and immutability | OpenAPI does not expose complete definitions | UNKNOWN | No IDENTICAL claim at database-object level |

PRODUCTION_AHEAD here means the live API exposes a named object absent from the inspected local definitions, not a verified migration ordering. LOCAL_AHEAD applies to the new local repository code/declarations; for relations missing from OpenAPI the physical database comparison remains UNKNOWN. No complete object is certified IDENTICAL solely from a matching field name/type.

## Constraints and functions actually observed

OpenAPI annotates id PKs on matches, predictions, prediction_ledger, daily_picks, settlement_results, quota_state, quota_reservations and data_provenance. It annotates matches.competition_ref_id -> competitions.id; matches.season_ref_id -> seasons.id; settlement_results.fixture_id -> matches.id; settlement_results.prediction_id -> predictions.id. These annotations are useful evidence, but do not prove index definitions, referential actions, deferrability or all constraints. Absence of an FK annotation does not prove no FK exists.

Exposed RPC names: get_closing_odds_for_match, reserve_quota, rollback_quota, get_prediction_accuracy, get_fixture_timeline, confirm_quota, cleanup_stale_reservations, calculate_clv. The CLV RPC requires p_prediction_id UUID and p_market_type text; closing-odds RPC requires p_match_id UUID. Both advertise POST, so neither was executed. Function definitions and side effects remain UNKNOWN.

Migration history was not read: no exposed _salmo_migrations or migration-history relation was identified, and catalog schemas are unavailable. The November 5 migration files and older reports cannot substitute for current applied-migration evidence. Earlier local documentation claiming data_provenance absent is not current evidence: this audit finds it exposed, with an incompatible structure.

## Minimum remaining evidence

An authorized existing read-only catalog connection or a sanitized schema-only export from this exact project is needed: current_database/database OID/version, pg_namespace, pg_class/pg_attribute, pg_constraint, pg_index/pg_get_indexdef, pg_views/pg_get_viewdef, pg_proc/pg_get_functiondef for relevant functions, trigger definitions and migration history. Query inside a READ ONLY transaction and exclude business rows, auth data and secrets. No migration, grant, new RPC or SQL function should be created for audit access. No credentials are requested by this report.

## Relevant live public API inventory

Types, required flags and key annotations below were observed on the live OpenAPI surface. Required means OpenAPI request required metadata, not independently verified pg_attribute nullability. Relation kind (table/view) remains unknown unless separately established.

### matches

| Column | PostgreSQL type | Required in OpenAPI | Key evidence |
|---|---|---|---|
| id | uuid | true | PK annotation |
| home_team | character varying | true | — |
| away_team | character varying | true | — |
| league | character varying | true | — |
| kickoff | timestamp without time zone | true | — |
| status | character varying | false | — |
| home_goals | integer | false | — |
| away_goals | integer | false | — |
| ht_home_goals | integer | false | — |
| ht_away_goals | integer | false | — |
| created_at | timestamp without time zone | false | — |
| updated_at | timestamp without time zone | false | — |
| fifa_ranking_home | integer | false | — |
| fifa_ranking_away | integer | false | — |
| squad_strength_home | numeric | false | — |
| squad_strength_away | numeric | false | — |
| competition_type | text | false | — |
| tournament_stage | text | false | — |
| venue | text | false | — |
| weather_condition | text | false | — |
| attendance | integer | false | — |
| competition_ref_id | uuid | false | competitions.id |
| season_ref_id | uuid | false | seasons.id |
| pipeline_state | text | true | — |
| pipeline_version | integer | true | — |
| pipeline_last_event | text | false | — |
| pipeline_transition_reason | text | false | — |
| pipeline_previous_state | text | false | — |
| pipeline_mode | text | true | — |
| pipeline_metadata | jsonb | false | — |
| var_era | boolean | true | — |
| source_type | public.source_type_enum | false | — |
| data_status | public.data_status_enum | false | — |

### market_snapshots

Not exposed in authenticated public OpenAPI; existence in PostgreSQL is UNKNOWN.

### decisions

Not exposed in authenticated public OpenAPI; existence in PostgreSQL is UNKNOWN.

### evidence

Not exposed in authenticated public OpenAPI; existence in PostgreSQL is UNKNOWN.

### data_provenance

| Column | PostgreSQL type | Required in OpenAPI | Key evidence |
|---|---|---|---|
| id | uuid | true | PK annotation |
| target_type | character varying | true | — |
| target_id | character varying | true | — |
| target_label | text | true | — |
| links | jsonb | true | — |
| computed_at | timestamp with time zone | true | — |
| formula | text | true | — |
| source_hash | character varying | true | — |
| verified | boolean | true | — |
| created_at | timestamp with time zone | true | — |

### predictions

| Column | PostgreSQL type | Required in OpenAPI | Key evidence |
|---|---|---|---|
| id | uuid | true | PK annotation |
| match_id | text | false | — |
| market_type | text | false | — |
| home_team | text | false | — |
| away_team | text | false | — |
| prediction | jsonb | false | — |
| odds_snapshot | jsonb | false | — |
| closing_odds | jsonb | false | — |
| model_version | text | false | — |
| feature_version | text | false | — |
| generated_at | timestamp with time zone | false | — |
| prediction_timestamp | timestamp with time zone | false | — |
| brier_score | double precision | false | — |
| clv | double precision | false | — |
| created_at | timestamp with time zone | false | — |
| confidence | numeric | false | — |
| model_confidence | numeric | false | — |
| data_confidence | numeric | false | — |
| market_confidence | numeric | false | — |
| cohort_tag | text | false | — |
| league_id | text | false | — |
| edge_pct | numeric | false | — |
| predicted_line | numeric | false | — |
| market_line | numeric | false | — |
| market_odds | numeric | false | — |
| kelly_fraction | numeric | false | — |
| expected_value | numeric | false | — |
| market_subtype | text | false | — |
| selection | text | false | — |
| model_probability | double precision | false | — |
| fair_odds | double precision | false | — |
| entry_odds | double precision | false | — |
| market_confidence_score | integer | false | — |
| predicted_odds | double precision | false | — |
| closing_line_value | double precision | false | — |
| source_type | public.source_type_enum | false | — |
| data_status | public.data_status_enum | false | — |

### prediction_ledger

| Column | PostgreSQL type | Required in OpenAPI | Key evidence |
|---|---|---|---|
| id | uuid | true | PK annotation |
| doi_id | character varying | false | — |
| ci_lower | numeric | false | — |
| ci_upper | numeric | false | — |
| fair_odds | numeric | false | — |
| recommended_stake_kelly | numeric | false | — |
| xg_home | numeric | false | — |
| xg_away | numeric | false | — |
| dixon_coles_rho | numeric | false | — |
| elo_home_shift | numeric | false | — |
| elo_away_shift | numeric | false | — |
| home_advantage_index | numeric | false | — |
| sha256_hash | character varying | false | — |
| ecdsa_signature | text | false | — |
| competition_id | integer | false | — |
| prediction_snapshot_id | uuid | false | — |
| match_id | text | false | — |
| published_at | timestamp with time zone | false | — |
| market | character varying | false | — |
| selection | character varying | false | — |
| odds_at_prediction | double precision | false | — |
| confidence | numeric | false | — |
| model_version | character varying | false | — |
| result_status | character varying | false | — |
| settled_at | timestamp with time zone | false | — |
| roi | double precision | false | — |
| verified | boolean | false | — |
| decision | character varying | false | — |
| decision_reason | text | false | — |
| created_at | timestamp with time zone | false | — |
| updated_at | timestamp with time zone | false | — |
| source_type | public.source_type_enum | false | — |
| data_status | public.data_status_enum | false | — |

### daily_picks

| Column | PostgreSQL type | Required in OpenAPI | Key evidence |
|---|---|---|---|
| id | uuid | true | PK annotation |
| fixture_id | uuid | true | — |
| league | text | false | — |
| home_team | text | false | — |
| away_team | text | false | — |
| kickoff_utc | timestamp with time zone | false | — |
| market_type | text | true | — |
| prediction | text | false | — |
| model_probability | double precision | false | — |
| fair_odds | double precision | false | — |
| market_odds | double precision | false | — |
| market_bookmaker | text | false | — |
| edge_pct | double precision | false | — |
| confidence | integer | false | — |
| verdict | text | false | — |
| reasoning | text | false | — |
| status | text | true | — |
| actual_score | text | false | — |
| profit_loss | double precision | false | — |
| clv | double precision | false | — |
| source | text | true | — |
| created_at | timestamp with time zone | true | — |
| settled_at | timestamp with time zone | false | — |
| rejection_reason | text | false | — |
| calibration_status | character varying | false | — |
| data_age_ms | integer | false | — |
| odds_snapshot_id | uuid | false | — |
| prediction_id | uuid | false | — |

### active_daily_picks

| Column | PostgreSQL type | Required in OpenAPI | Key evidence |
|---|---|---|---|
| id | uuid | false | PK annotation |
| fixture_id | uuid | false | — |
| league | text | false | — |
| home_team | text | false | — |
| away_team | text | false | — |
| kickoff_utc | timestamp with time zone | false | — |
| market_type | text | false | — |
| prediction | text | false | — |
| model_probability | double precision | false | — |
| fair_odds | double precision | false | — |
| market_odds | double precision | false | — |
| market_bookmaker | text | false | — |
| edge_pct | double precision | false | — |
| confidence | integer | false | — |
| verdict | text | false | — |
| reasoning | text | false | — |
| status | text | false | — |
| actual_score | text | false | — |
| profit_loss | double precision | false | — |
| clv | double precision | false | — |
| source | text | false | — |
| created_at | timestamp with time zone | false | — |
| settled_at | timestamp with time zone | false | — |
| rejection_reason | text | false | — |
| calibration_status | character varying | false | — |
| data_age_ms | integer | false | — |
| odds_snapshot_id | uuid | false | — |
| prediction_id | uuid | false | — |

### settlement_results

| Column | PostgreSQL type | Required in OpenAPI | Key evidence |
|---|---|---|---|
| id | uuid | true | PK annotation |
| fixture_id | uuid | true | matches.id |
| prediction_id | uuid | false | predictions.id |
| market_type | character varying | true | — |
| line | numeric | true | — |
| selection | character varying | true | — |
| odds | numeric | true | — |
| outcome | character varying | true | — |
| profit_units | numeric | true | — |
| home_goals | integer | true | — |
| away_goals | integer | true | — |
| voided | boolean | true | — |
| settled_at | timestamp with time zone | true | — |
| created_at | timestamp with time zone | true | — |

### ledger_settlements

Not exposed in authenticated public OpenAPI; existence in PostgreSQL is UNKNOWN.

### quota_state

| Column | PostgreSQL type | Required in OpenAPI | Key evidence |
|---|---|---|---|
| id | bigint | true | PK annotation |
| provider | character varying | true | — |
| quota_type | character varying | true | — |
| period_start | date | true | — |
| period_end | date | true | — |
| limit_value | integer | true | — |
| safe_limit | integer | true | — |
| safety_reserve_pct | integer | true | — |
| consumed | integer | true | — |
| reserved | integer | true | — |
| created_at | timestamp with time zone | true | — |
| updated_at | timestamp with time zone | true | — |

### quota_reservations

| Column | PostgreSQL type | Required in OpenAPI | Key evidence |
|---|---|---|---|
| id | uuid | true | PK annotation |
| provider | character varying | true | — |
| quota_type | character varying | true | — |
| period_start | date | true | — |
| amount | integer | true | — |
| endpoint | character varying | false | — |
| request_id | character varying | false | — |
| status | character varying | true | — |
| created_at | timestamp with time zone | true | — |
| resolved_at | timestamp with time zone | false | — |

### daily_prediction_refresh_ledger

Not exposed in authenticated public OpenAPI; existence in PostgreSQL is UNKNOWN.

### _salmo_migrations

Not exposed in authenticated public OpenAPI; existence in PostgreSQL is UNKNOWN.

### odds_snapshots

| Column | PostgreSQL type | Required in OpenAPI | Key evidence |
|---|---|---|---|
| id | uuid | true | PK annotation |
| match_id | text | true | — |
| bookmaker | text | true | — |
| market | text | true | — |
| line | numeric | false | — |
| odds | numeric | false | — |
| captured_at | timestamp with time zone | false | — |
| fixture_id | uuid | false | matches.id |
| price_home | numeric | false | — |
| price_away | numeric | false | — |
| price_draw | numeric | false | — |
| chain_hash | text | false | — |
| provider | character varying | false | — |
| provider_latency_ms | integer | false | — |
| raw_payload_id | text | false | — |
| snapshot_label | text | false | — |
| ah_home_line | double precision | false | — |
| ah_home_odds | double precision | false | — |
| ah_away_odds | double precision | false | — |
| ou_line | double precision | false | — |
| ou_over_odds | double precision | false | — |
| ou_under_odds | double precision | false | — |
| ml_home | double precision | false | — |
| ml_draw | double precision | false | — |
| ml_away | double precision | false | — |
| snapshot_time | timestamp with time zone | false | — |
| btts_yes_odds | double precision | false | — |
| btts_no_odds | double precision | false | — |
| market_type | character varying | false | — |
| handicap_line | numeric | false | — |
| home_odds | numeric | false | — |
| draw_odds | numeric | false | — |
| away_odds | numeric | false | — |
| odds_home | numeric | false | — |
| odds_away | numeric | false | — |
| signal_id | uuid | false | — |
| timestamp | timestamp with time zone | false | — |

### live_odds_snapshots

| Column | PostgreSQL type | Required in OpenAPI | Key evidence |
|---|---|---|---|
| id | uuid | true | PK annotation |
| fixture_id | text | true | — |
| phase | text | true | — |
| market | text | true | — |
| line | numeric | true | — |
| price_home | numeric | true | — |
| price_away | numeric | true | — |
| price_draw | numeric | false | — |
| bookmaker | text | true | — |
| captured_at | timestamp with time zone | true | — |
| chain_hash | text | true | — |
| previous_snapshot_id | uuid | false | — |
| created_at | timestamp with time zone | true | — |
| created_by | text | true | — |
| schema_version | text | true | — |
| correlation_id | text | true | — |

### closing_odds

| Column | PostgreSQL type | Required in OpenAPI | Key evidence |
|---|---|---|---|
| id | uuid | true | PK annotation |
| fixture_id | uuid | true | matches.id |
| provider | character varying | true | — |
| market_type | character varying | true | — |
| line | numeric | true | — |
| selection | character varying | true | — |
| odds | numeric | true | — |
| captured_at | timestamp with time zone | true | — |
| is_opening | boolean | true | — |
| is_closing | boolean | true | — |
| is_live | boolean | true | — |
| provider_latency_ms | integer | false | — |
| raw_payload_id | text | false | — |
| chain_hash | text | false | — |
| created_at | timestamp with time zone | true | — |

### clv_results

| Column | PostgreSQL type | Required in OpenAPI | Key evidence |
|---|---|---|---|
| id | uuid | true | PK annotation |
| prediction_id | uuid | false | predictions.id |
| match_id | uuid | true | matches.id |
| market_type | text | true | — |
| model_price | numeric | true | — |
| model_prob | numeric | true | — |
| closing_price | numeric | true | — |
| closing_prob | numeric | true | — |
| clv | numeric | true | — |
| clv_bps | integer | true | — |
| edge_vs_closing | numeric | false | — |
| closing_odds_id | uuid | false | closing_odds.id |
| capture_provider | text | false | — |
| created_at | timestamp with time zone | false | — |

### provider_registry

| Column | PostgreSQL type | Required in OpenAPI | Key evidence |
|---|---|---|---|
| id | character varying | true | PK annotation |
| name | character varying | true | — |
| provider_type | character varying | true | — |
| base_url | text | false | — |
| rate_limit_per_min | integer | false | — |
| is_active | boolean | false | — |
| created_at | timestamp with time zone | false | — |
| updated_at | timestamp with time zone | false | — |

### market_odds

| Column | PostgreSQL type | Required in OpenAPI | Key evidence |
|---|---|---|---|
| id | uuid | true | PK annotation |
| book_id | uuid | true | market_books.id |
| selection | character varying | true | — |
| decimal_odds | numeric | true | — |
| implied_probability | numeric | true | — |
| fair_probability | numeric | false | — |
| created_at | timestamp with time zone | true | — |

### public_prediction_ledger

| Column | PostgreSQL type | Required in OpenAPI | Key evidence |
|---|---|---|---|
| id | uuid | true | PK annotation |
| prediction_number | bigint | true | — |
| fixture_id | text | true | — |
| league | text | true | — |
| home_team | text | true | — |
| away_team | text | true | — |
| kickoff | timestamp with time zone | true | — |
| market | text | true | — |
| selection | text | true | — |
| model_prob | numeric | true | — |
| ci_lower | numeric | true | — |
| ci_upper | numeric | true | — |
| model_fair_odds | numeric | true | — |
| bookmaker_odds | numeric | true | — |
| prob_edge | numeric | true | — |
| expected_value | numeric | true | — |
| recommendation | text | true | — |
| model_version | text | true | — |
| feature_version | text | true | — |
| prediction_hash | text | true | — |
| dataset_hash | text | true | — |
| verification_status | text | true | — |
| created_at | timestamp with time zone | true | — |
| source | text | false | — |

### public_settlements

| Column | PostgreSQL type | Required in OpenAPI | Key evidence |
|---|---|---|---|
| id | uuid | true | PK annotation |
| prediction_id | uuid | false | public_prediction_ledger.id |
| closing_odds | numeric | true | — |
| closing_prob | numeric | true | — |
| result | text | true | — |
| profit | numeric | true | — |
| clv | numeric | true | — |
| realized_roi | numeric | true | — |
| settled_at | timestamp with time zone | true | — |


## Safety and validation

Only HTTPS schema/metadata GETs and source reads. No SQL mutations, RPC calls, row queries, provider requests, migration, deployment, credential/configuration change, commit or push. No tests/build were run in this forensic task. Gate 0 remains blocked because catalogs, complete deployed artifact provenance and database CLV function behavior are not established.
