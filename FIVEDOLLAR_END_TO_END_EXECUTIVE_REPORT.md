# FiveDollar end-to-end executive report

2026-11-07 (Asia/Jakarta). **Verdict: INCONCLUSIVE. Phase 0 BLOCKED; Phases 1-9 NOT STARTED.** This is a gate-stop report, not completed integration certification.

## A-B. Decision and verified facts

The real SALMO checkout exists at HEAD `5638c28add78d80003f092eaa5583f4aa8ed7abc`. Current Vercel inspection identifies a READY Production deployment created November 1 with salmo.dev aliases; local HEAD is November 5. Inspected deployment metadata does not identify a Git commit. Applied production schema has not been verified. Consequently Gate 0 is not passed. Full source findings and exact commands are in `FIVEDOLLAR_PHASE_0_BASELINE_AUDIT.md`.

Local `.env.local` and process lack `FIVEDOLLAR_API_KEY` and explicit staging database configuration. No API key was added and no sports provider was contacted. Seven existing untracked reports were preserved.

## C. API capability matrix

All advertised entries below are user-supplied claims, not independently verified documentation or runtime results. Official provider documentation review and authenticated calls belong to Phase 1, which was not started.

| Capability | Advertised | Verified | Evidence | Status |
|---|---|---|---|---|
| EPL fixtures | Yes | No | User prompt only | NOT_EVALUATED |
| AH odds | Yes | No | User prompt only | NOT_EVALUATED |
| OU odds | Yes | No | User prompt only | NOT_EVALUATED |
| Bet365 identity | Yes | No | User prompt only | NOT_EVALUATED |
| Opening odds | Yes | No | User prompt only | NOT_EVALUATED |
| Closing odds | Yes | No | User prompt only | NOT_EVALUATED |
| In-play odds | Yes | No | User prompt only | NOT_EVALUATED |
| Odds timestamps | To verify | No | None | NOT_EVALUATED |
| Historical odds | Tier dependent | No | User prompt only | NOT_EVALUATED |
| Quota enforcement | Yes | No | User prompt only | NOT_EVALUATED |

## D-F. Data quality, operations and CLV

FiveDollar requests: **0**. Captured FiveDollar fixtures/snapshots: **0**. Observation duration: **0 days**. Mapping rate, coverage, invalid/duplicate rates, uptime, request success, latency, quota consumption behavior and idempotency are **not measured**, not 0% or 100%. AH CLV n=0; OU CLV n=0; means, confidence intervals and edge conclusions unavailable. No 7-day or 14-day result exists.

Existing CLV is no-vig based, unlike the requested raw-price ratio. Existing snapshot writes default missing bookmaker to Pinnacle and capture time to now; latest lookup is not line/bookmaker constrained. Existing fixture ingestion has a first-match 36-hour proximity branch. Those paths cannot establish strict FiveDollar market/provenance/mapping validity unchanged.

## G. Economics

Free $0/60 requests per hour, Pro $5/10 requests per minute, Ultra $25/40 requests per minute remain user-provided commercial baselines. No verified request cost, account tier, coverage or incremental value exists. No paid-tier or OddsPapi replacement recommendation is justified. The proposed 70% scheduled allowance would be 42 requests/hour only if 60/hour is verified; this is arithmetic, not a deployed quota policy.

## H-I. Changes and security

Created only the Phase 0 baseline report and this executive report to preserve evidence and blockers. No existing files modified; no adapter, migrations, environment changes, deployments, cron activation, commit or push. Production variables were inspected by name through Vercel CLI, without pulling secret values. Local credential checks emitted presence/absence only. Preview scope, outbound IP behavior, shared egress restrictions and staging isolation have not been verified. Region iad1 is not evidence of static outbound IP.

## J. Regression assessment

No application implementation occurred. Tests, type checking, lint and build were not run; no green-validation claim. The audit performed no production mutations. Production health and absence of pre-existing incidents are not certified by this statement.

## K. Remaining risks

| Severity | Risk | Likelihood/evidence |
|---|---|---|
| Critical | Local architecture differs from deployed architecture/schema | Unresolved; deployment predates HEAD and migrations |
| High | Reused defaults write into production or mislabel bookmaker/time | Concrete source paths observed; occurrence not measured |
| High | FiveDollar contract/authentication/market identity unavailable | Key absent; Phase 1 not started |
| High | Ambiguous fixture mapping or incompatible CLV definition | Source mismatch observed; FiveDollar impact not measured |
| High | Insufficient reliability/economic sample | Certain: zero observations |

## L. Recommended next action

Reconcile active deployment `dpl_4QZBPyauud9XbCL4BCuzemHWDRZv` with its exact source/build artifact and obtain sanitized read-only applied-schema evidence to close Gate 0. Then supply the FiveDollar key via local environment for Gate 1. Do not change or redeploy Production to bypass the gate. No Production Activation Plan is certified at this stage.

## Phase reporting

**PHASE STATUS:** BLOCKED (0). **OBJECTIVE:** current architecture baseline. **ACTIONS PERFORMED:** source/configuration inventory and read-only Vercel inspection. **FILES CREATED:** two reports. **FILES MODIFIED:** none. **TESTS EXECUTED:** none. **EVIDENCE:** Phase 0 report. **RISKS:** unresolved deployed provenance/schema, unsafe shared defaults, missing key/staging configuration. **GATE DECISION:** stop. **NEXT PHASE:** Phase 1 pending Gate 0; no dependent phase marked PASS.
