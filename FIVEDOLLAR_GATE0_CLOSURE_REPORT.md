# Gate 0 closure report

**Verdict: BLOCKED — Gate 0 is not closed. Phase 1 NOT STARTED.**

Audit date: 2026-11-07 Asia/Jakarta. Evidence capture: 2026-11-06T23:10:37.769Z. Scope: read-only forensic verification, plus the four requested local Markdown deliverables.

## Exact source and database identities

| Item | Result |
|---|---|
| Current Production alias | salmo.dev; alias API rechecked |
| Deployment | dpl_4QZBPyauud9XbCL4BCuzemHWDRZv |
| Deployment URL | https://salmo-1xdsvxdl6-shinerva.vercel.app |
| Created / status | 2026-11-01 01:07:44.676 +07:00; READY; production |
| Metadata Git SHA | **b025798d559057446231e18f9f3be24f50bdecaf** |
| Repository / branch | agunsux/SALMO / main |
| Current remote main | b025798d559057446231e18f9f3be24f50bdecaf, verified with git ls-remote |
| Exact local HEAD | **5638c28add78d80003f092eaa5583f4aa8ed7abc** |
| Do SHAs match? | **NO**; local is six committed changes ahead of current remote main |
| Complete deployed artifact equivalent to commit? | **Not certified**; gitDirty=1 and 9,573 extra source-manifest files outside Git baseline |
| Configured Production Supabase identity | **rgkrfzxipkrwqccfuqfq**, host rgkrfzxipkrwqccfuqfq.supabase.co |
| DB verification | Current Vercel public endpoint equals local configured endpoint; authenticated public schema GET succeeds |
| SQL database name/OID/version | UNKNOWN; direct catalogs unavailable |
| Frozen deployment DB endpoint value | Not independently verified; captured env names only, current project URL verified |
| Schema status | DIVERGED on observed relevant objects; full constraints/indexes/functions reconciliation BLOCKED |
| Preview isolation | Zero Preview variables in inspected project inventory; no verified separate staging project |

## Material findings

1. **Recorded deployment SHA recovered.** Previous CLI inspect JSON omitted the metadata. Direct Vercel API supplies SHA, GitHub repository/ref and redeploy chain. All tracked application source files match that commit after EOL normalization. Local HEAD must not be represented as deployed.
2. **Reproducibility remains incomplete.** Of 327 baseline tracked files, 326 are in the deployment with equivalent content; .gitignore omitted. Additional source-manifest files: data 33, research 4,076, scratch 5,458, .vscode 1, scripts 3, generated root files 2. No extra src/ files. Their provenance/runtime relevance is unverified; this is not proof of public exposure or malicious content. A commit checkout alone does not reconstruct the upload.
3. **Live API schema inspected, not assumed.** Public schema returns 214 definitions/223 paths. matches has required timestamp-without-time-zone kickoff and no exposed canonical_match_id/season/kickoff_time. data_provenance is present but has target/links/formula fields, unlike the local canonical decision/version schema. Ledger, settlement and quota contracts also differ. Nonexposed market_snapshots is UNKNOWN, not conclusively absent.
4. **Production and local snapshot code distinguished.** New oddsSnapshotRepository and canonical schema additions are local-only. Their Pinnacle defaults cannot be claimed as active Production behavior. The deployed performance route does default unlabeled legacy observations to Pinnacle; this is a concrete isolation risk.
5. **Two CLV systems require separate evidence.** Deployed TypeScript module uses proportional no-vig CLV; no production caller was found. Existing performance readers consume stored ledger metrics. Live database exposes calculate_clv RPC and clv_results, but SQL bodies/triggers/units remain unknown. Neither RPC was invoked.
6. **Safe Bet365 design documented.** A separate local append-only dataset/entry point, explicit bookmaker and equivalence keys, verified fixture mapping, independent raw-price metrics and no shared ledger/reader/quota writes can preserve Pinnacle isolation. This is a design, not implementation or runtime validation.

## Acceptance criteria

| # | Criterion | Result | Evidence / limitation |
|---|---|---|---|
| 1 | Currently serving deployment identified | VERIFIED | Alias API and project production target agree |
| 2 | Exact Git SHA verified | VERIFIED AS RECORDED CODE BASELINE | Full metadata plus manifest/Git comparison; full upload includes extras |
| 3 | Corresponding repository source identified | PARTIAL | Repository/commit/ancestry known; non-Git artifacts not reproducible from repository |
| 4 | Actual Production database identified | PARTIAL | Current configured Supabase endpoint and live schema verified; frozen deployment value and SQL identity unknown |
| 5 | Relevant Production schema inspected | PARTIAL | Public columns, type metadata, PK/FK annotations; indexes/unique/check constraints/views/functions not fully inspected |
| 6 | Local/Production differences documented | VERIFIED WITH UNKNOWN CELLS | Detailed matrix and sanitized column inventory; no parity claim |
| 7 | Existing CLV behavior understood | PARTIAL | Deployed TypeScript and reader behavior understood; database function body/consumers unknown |
| 8 | Safe isolated Bet365 architecture established | DESIGN COMPLETE | Separate storage, metric identities, entry point and reader boundaries; no implementation |
| 9 | No Production changes occurred | VERIFIED FOR THIS AUDIT | Metadata/schema GETs only; no SQL/RPC writes, deployment or config mutation |

**Acceptance rule:** partial/unknown criteria cannot be promoted to PASS. No provider capability, coverage, quota, reliability or commercial verdict is implied.

## Remaining blockers and minimum corrective evidence

1. **Full deployment provenance:** a retained, sanitized deployment/source manifest or artifact bundle with checksums and an explanation of which non-Git assets are build/runtime inputs. The live manifest is already identified; do not redeploy or change Git to manufacture parity. Data-bearing extras were not read wholesale for this audit.
2. **SQL catalog visibility:** existing authorized read-only access or a sanitized schema-only catalog export from project rgkrfzxipkrwqccfuqfq, including exact database identity, schemas, indexes, all constraints, views, relevant function/trigger definitions and migration records. REST information_schema/pg_catalog profiles return 406/PGRST106; no direct DB/management configuration was found; dashboard access host is unavailable. Do not create audit RPCs, grants or migrations to bypass the limitation.
3. **Deployment-specific environment binding:** sanitized evidence of the public Supabase endpoint captured by this deployment, and a separately identified staging project before any later Preview work. Current project metadata alone is not frozen-deployment evidence.

No API key is required for any of these steps. FIVEDOLLAR_API_KEY was not requested, provisioned or used. Phase 1 and all sports-provider calls remain prohibited.

## Deliverables and evidence references

- FIVEDOLLAR_GATE0_PRODUCTION_SOURCE_VERIFICATION.md — E1-E7: alias/deployment/project/env APIs, manifest hashes, redeploy chain, exact commits and full file delta.
- FIVEDOLLAR_GATE0_DATABASE_SCHEMA_RECONCILIATION.md — E8-E9: live OpenAPI, catalog-access errors, explicit difference matrix and relevant columns/types/PK/FK annotations.
- FIVEDOLLAR_GATE0_CLV_ISOLATION_ASSESSMENT.md — deployed-code verification, local-only distinction, formula/readers/database unknowns, minimum isolated design.
- This report — acceptance decision and remaining evidence requirements.

Earlier Phase 0 reports remain historical artifacts and were not overwritten. This audit supersedes their unknown-SHA finding and narrows their local-vs-production snapshot claims.

## Execution accounting

Only four requested reports created. Existing tracked files, nine pre-existing untracked reports, database objects, data rows, environment settings, deployments and provider configuration remain untouched by audit actions. No provider requests; no new credentials; no tests/typecheck/lint/build because no application change was authorized or made. Source fingerprints and Git diffs are forensic validations, not application test results. No commit/push. No claim that pre-existing Production operation is healthy.
