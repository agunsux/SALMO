# Gate 0 — CLV isolation assessment

Audit 2026-11-07 Asia/Jakarta. **Isolated architecture recommendation: established. Runtime/database CLV completeness: BLOCKED. No implementation.**

## Which code is actually deployed

The deployed source manifest for dpl_4QZBPyauud9XbCL4BCuzemHWDRZv matches the recorded b025798d559057446231e18f9f3be24f50bdecaf source for src/engine/clv/clvEngine.ts, src/engine/performance/gates.ts, src/engine/performance/performanceMetrics.ts and src/app/api/v1/performance/route.ts (allowing line endings). The CLV file itself was retrieved and its content SHA1 verified as 312c4c433925d619e09974f73fd087a3f882d697. These files also have no Git delta to local HEAD.

**Correction to scope of the initial audit:** src/repositories/oddsSnapshotRepository.ts and data/schema_canonical.sql are local additions after that commit and are not present in the active deployed source manifest. Their Pinnacle/default-time behavior is a future integration hazard, not evidence that the active Production service currently executes that repository.

## Formula, identity and time semantics

For two closing decimal prices c_side and c_other:

- closingNovigProb = (1/c_side) / ((1/c_side) + (1/c_other)). This is proportional/multiplicative two-way margin removal.
- existing CLV = oddsTaken * closingNovigProb - 1; decimal rounded to 4 places; percentage rounded to 2.
- Lines differing by more than 0.0001 return LINE_MOVED/null. Missing closing side returns NO_CLOSING_SNAPSHOT; missing/invalid opposite price returns INVALID_ODDS. The closing-side price must exceed 1.
- takenSelection and marketType exist in the input contract, but calculation does not validate the selection orientation or bookmaker/fixture identity. There is no bookmaker/provider/fixture ID in this function's input. Callers must establish equivalence; the function alone cannot prove it.
- No complete explicit finite/>1 validation of oddsTaken is present. No closing timestamp freshness or pre-kickoff verification occurs here. The result timestamp uses closingSnapshotTimestamp, otherwise current time. This is calculation-time fallback, not reliable source-price time.
- Requested FiveDollar raw-price CLV is signal_odds / closing_odds - 1. It must be a separate labeled metric, never silently substituted for the existing no-vig value.

## Persistence and consumers

Source search for ClvEngine / calculateClv finds the module and tests/production_ledger_and_performance.test.js, but no production source caller. The pure calculation module does not persist results. Presence of deployed code does not establish runtime invocation.

The deployed performance route reads data/verification/live_prediction_ledger.jsonl and uses row.clvPct or legacy row.CLV. It defaults a missing row.bookmaker to the reference benchmark (Pinnacle), accepts only valid benchmark attribution, and passes observations into PerformanceMetricsEngine. The engine aggregates finite CLV values, accepts undefined clvBookmaker for legacy observations, and exposes headline CLV only at n >= 100. src/engine/performance/gates.ts explicitly excludes Bet365 from benchmark bookmakers. The /performance UI consumes the metrics and sample gate. These consumers are why shared ledgers are unsafe for new Bet365 data even if a record lacks a bookmaker label accidentally.

The production settlement runner currently constructs clvPct:null in its source path. The local new PerformanceRepository computes other ledger metrics and is not proof of a Production CLV write path. No live ledger rows were read or changed in this audit.

Live database OpenAPI independently exposes:

- predictions.clv and predictions.closing_line_value; daily_picks.clv.
- clv_results with model/closing prices and probabilities, clv, clv_bps, capture_provider and closing_odds_id.
- closing_odds with provider, market_type, line, selection, captured_at, is_opening/is_closing/is_live; no explicit bookmaker column in the exposed contract. Provider must not be assumed equivalent to bookmaker.
- odds_snapshots and live_odds_snapshots with bookmaker and multiple capture/price fields.
- RPC calculate_clv(p_prediction_id UUID, p_market_type text) and get_closing_odds_for_match(p_match_id UUID), exposed as POST.

Those function bodies, database triggers, metric units, view consumers and RPC side effects are **UNKNOWN**. No RPC was invoked. The database function must not be assumed to implement the TypeScript formula. Schema presence is not proof that SALMO calls it.

## Local-only snapshot hazard

oddsSnapshotRepository.ts defaults bookmaker to pinnacle, sourceProvider to PINNACLE, capturedAt to current time; writes public.market_snapshots through the default PostgreSQL repository client. getLatestSnapshot selects only match_id and market_type, not exact bookmaker, selection, line or snapshot role. The canonical schema applies similar defaults and immutability declarations, but actual Production market_snapshots is not exposed in the live OpenAPI. Do not reuse this path or change its defaults for FiveDollar.

## Minimum independent Bet365 shadow architecture (design only)

1. **Storage boundary:** dedicated local directory, proposed data/research/fivedollar_shadow/, with raw responses, append-only normalized observations, mapping decisions and CLV results. Confirm no existing reader/glob ingests this directory before implementation. No writes to any existing canonical dataset, verification JSONL, SQL table or production ledger. Later cloud work requires a separately verified staging project and least-privilege identity; no production credentials in its process.
2. **Independent entry point:** explicit research command/module, not imported by production prediction, settlement, performance endpoints or cron. No activation, provider-priority or threshold changes. Independent FiveDollar request budget; no shared OddsPapi quota state.
3. **Strict normalized identity:** provider, provider_fixture_id, verified canonical_match_id, bookmaker ID/name, competition/season, home/away orientation, market/period, exact selection and signed handicap/total line, prematch flag, decimal price, snapshot role, source timestamp/timezone, captured_at, raw content hash/reference and validation status. Require explicit Bet365; missing identity/line/time yields unavailable/review status. Captured_at is not a replacement source timestamp.
4. **Mapping ledger:** VERIFIED/REVIEW_REQUIRED/REJECTED with rule version, evidence and ambiguity handling. Only VERIFIED mappings enter comparisons. Reschedules/version changes remain auditable; never accept fuzzy similarity alone.
5. **Comparable-price key:** fixture + bookmaker + market + period + selection + exact line + prematch state. Signal and closing observations reference immutable snapshot IDs. Changed lines produce LINE_MOVED with raw CLV null. Missing or post-kickoff closing evidence produces unavailable status; no synthetic observations or opening/current substitutions.
6. **Separate measurements:** BET365_OPEN_TO_CLOSE_RAW and BET365_SIGNAL_TO_CLOSE_RAW, plus a versioned formula identifier. Decimal result and percent conversion recorded explicitly. Any future no-vig variant is another field/method, never the same CLV field. Pinnacle metrics remain unchanged and independently sourced.
7. **Reader isolation:** no automatic union with Pinnacle headline metrics, promotion gates, pick/settlement ledger or existing research cohorts. Cross-book research is a separate read-only equivalence join with explicit provider/bookmaker labels, timestamp gap, line gap and missingness. No consensus or edge claim from one bookmaker.
8. **Provenance and idempotency:** hash/version each raw payload and normalization/mapping/calculation contract; deterministic source-observation key with explicit timestamp availability rules; record conflicts rather than overwrite. Append-only local observation is not proof of capture stability until tested in later phases.

Required later tests: absent bookmaker never becomes Pinnacle; distinct quarter lines/selections/periods never join; ambiguous mapping excluded; missing source timestamps stay missing; raw and no-vig formulas separated; duplicate reruns idempotent; no writes/imports into production paths; credentials and quotas isolated. Not implemented or executed during this audit.

## Decision

Independent Bet365 research is feasible by this design without changing Pinnacle behavior. It is **not certified operational**. Full deployed-data reproducibility, database CLV function definitions/consumers and staging isolation remain unresolved. Gate 0 cannot be marked PASS, and Phase 1 remains unopened.
