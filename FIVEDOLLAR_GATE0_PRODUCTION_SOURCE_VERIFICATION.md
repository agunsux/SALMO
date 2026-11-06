# Gate 0 — Production source verification

Audit: 2026-11-07 Asia/Jakarta; final evidence capture 2026-11-06T23:10:37.769Z (UTC). Status: PARTIALLY VERIFIED; reproducibility remains BLOCKED.

## Identity and current alias ownership

| Field | Verified value |
|---|---|
| Project / scope | shinerva/salmo |
| Project ID | prj_HDnX6QKn8BA7wGz6o2GcnJpJnzpz |
| Team ID | team_xhqWUuga9unawMGnTbAtm147 |
| Serving alias | salmo.dev |
| Alias deployment ID | dpl_4QZBPyauud9XbCL4BCuzemHWDRZv |
| Deployment URL | https://salmo-1xdsvxdl6-shinerva.vercel.app |
| Created | 2026-11-01 01:07:44.676 +07:00 / 2026-10-31T18:07:44.676Z |
| Status / target | READY / production |
| Other aliases in metadata | www.salmo.dev; salmo-xi.vercel.app; salmo-shinerva.vercel.app |
| Repository link | https://github.com/agunsux/SALMO |
| Branch / metadata SHA | main / b025798d559057446231e18f9f3be24f50bdecaf |
| Local HEAD | 5638c28add78d80003f092eaa5583f4aa8ed7abc |
| SHA match | NO |
| Deployment source | redeploy; metadata gitDirty=1 |
| Build | @vercel/vc-build; build config framework nextjs; next build; npm ci; Node 24.x |
| Output | Node.js 24 lambdas in iad1; build createdIn sfo1; 86 output entries in CLI inspection |
| Deployed scheduler config | build vercelConfig.crons is empty |

Identity is based on the alias API and current project production target, not the latest-by-date assumption. The earlier Phase 0 report only used CLI inspect's reduced JSON; full deployment API metadata now resolves the recorded SHA. Project-level framework is null, while the deployed build config identifies nextjs: these are different metadata layers.

## Evidence and chain of custody

Read-only authenticated GETs through existing Vercel CLI session:

- E1: /v4/aliases/salmo.dev (rechecked at end); alias points to the ID above.
- E2: /v13/deployments/dpl_4QZBPyauud9XbCL4BCuzemHWDRZv; metadata SHA/ref/repository, source, originalDeploymentId, gitDirty, captured environment names.
- E3: /v9/projects/prj_HDnX6QKn8BA7wGz6o2GcnJpJnzpz; GitHub link agunsux/SALMO, productionBranch main, production target.
- E4: /v6/deployments/dpl_4QZBPyauud9XbCL4BCuzemHWDRZv/files; source manifest 9,899 files. SHA256 of JSON.stringify(flat path/UID array): 1f64c2a39f78b7f17c1345588327dd1064e362d34c0ccef6e0bc72cca9f83028.
- E5: /v8/deployments/{deployment}/files/{fileId}; retrieved CLV module and schema.sql contents only, decoded base64, checked SHA1 against manifest UIDs. No environment files or data rows downloaded.
- E6: git ls-remote origin refs/heads/main; live GitHub main is b025798d559057446231e18f9f3be24f50bdecaf. git merge-base --is-ancestor b025798d559057446231e18f9f3be24f50bdecaf HEAD exited 0. Local object and ancestry verified without fetch/checkout.

Redeploy chain:

1. Active dpl_4QZBPyauud9XbCL4BCuzemHWDRZv -> original dpl_6EP7SjJg8vjxibwgkSv9R7RAZsjB.
2. dpl_6EP7SjJg8vjxibwgkSv9R7RAZsjB -> original dpl_7AM4DAN6gwhQiWFN8vdpSEP5bmGt.
3. dpl_7AM4DAN6gwhQiWFN8vdpSEP5bmGt has source cli, no originalDeploymentId. All three record the same SHA and gitDirty=1.

## Source reproduction result

Git baseline contains 327 tracked files. 326 are present in the deployment and match content with line-ending normalization; .gitignore is omitted. Initial uniform-EOL fingerprint comparison flagged data/schema.sql; retrieving it and normalizing CRLF to LF confirmed **zero line differences**. Do not classify that as a semantic schema change. All tracked src/ files match the recorded commit; no extra src/ files occur.

The deployment contains **9,573 additional files outside that commit**: data 33, research 4,076, scratch 5,458, .vscode 1, scripts 3, next-env.d.ts 1, tsconfig.tsbuildinfo 1. Extra scripts: audit_pre_settlement.js, reconcile_8_unsettled_matches.js, verify_persisted_settlement.js. Extra data includes backups, external football-data CSVs, a quota file and handicaplab_sync_ledger.jsonl. Only names/fingerprints were inspected; their full contents and runtime influence are unverified. Presence in the authenticated deployment source manifest does not establish public exposure.

Therefore: the recorded **code baseline** is verified; the **complete uploaded source/data/build input** cannot be reproduced from the Git commit alone. gitDirty=1 is corroborated by the additional files, but it does not by itself prove changed tracked application code. Full artifact provenance remains a Gate 0 blocker. No rebuild/redeploy was attempted.

Selected manifest SHA1 evidence:

| Path | Deployment content UID | Assessment |
|---|---|---|
| src/engine/clv/clvEngine.ts | 312c4c433925d619e09974f73fd087a3f882d697 | Retrieved content equals local and baseline bytes |
| src/engine/performance/gates.ts | 88a7a12c80913bfec592d9c80b9f29f64d7c5ccd | Local exact; Git baseline differs only EOL |
| src/app/api/v1/performance/route.ts | bf79fb8a59d88be34868737e490fe7033899e175 | Local exact; Git baseline differs only EOL |
| src/config/env.ts | 197d7e5b58bd3c1274f98469eef986e7a877204e | Baseline match after EOL; local implementation changed |
| src/lib/db.ts | 1bc2a119fa74fd385b85288b797a6deeee0e04f0 | Baseline exact; local implementation changed |
| src/repositories/oddsSnapshotRepository.ts | Not present | LOCAL_AHEAD; cannot claim its defaults currently run in Production |
| data/schema.sql | ce1849bc45a0d095ef2cc3123ccf0cbbee8e53ac | Retrieved content normalized equals Git baseline; local bytes exact |

## Local Git classification

Six local committed changes are not on the currently verified remote main. Whether another remote branch contains them was not checked. Tracked working tree and staged diff are empty. Nine pre-existing untracked reports were present at task start, including the two Phase 0 reports; preserved unchanged. No fetch, reset, commit or push.

```text
5638c28add78d80003f092eaa5583f4aa8ed7abc chore(salmo): checkpoint EPIC 100G database and staging readiness
6140b1eaa78df60a4dea2c6a1ff058b610461e22 docs(audit): final production safety gate verification report
80a9088c6dbee619f53b96471916a1c2c8609182 feat(epic99): certify controlled EPL production release
03b80e1d24d9c309e59feb642a2c4e8d74abf56f feat(epic98): integrate Dribble360 AH shadow intelligence
a92b4680a47c8268ddffc2ab91c03e4f38e6d68c feat(epic97): certify staging automation and quota-safe settlement
eff5dfbdd51a671395699dc932f4756ed6ac4754 feat(epic95): provider optimization, quota policy, and settlement governance
```

## Production / Preview environment metadata

E7: GET /v10/projects/{project}/env returned 13 project variables, all production-scoped, none preview-scoped, no branch overrides. This does not exclude team-shared/custom-target configuration not included in that response. Active deployment environment-name metadata also includes existing provider keys and Supabase configuration; only names inspected.

- ODDS_PAPI_KEY — sensitive — production
- HANDICAPLAB_API_KEY — sensitive — production
- ODDS_API_KEY — sensitive — production
- DRIBBLE_API_KEY — sensitive — production
- HANDICAPLAB_ADAPTER — sensitive — production
- HANDICAPLAB_API_URL — sensitive — production
- NEXT_PUBLIC_SUPABASE_ANON_KEY — encrypted — production
- NEXT_PUBLIC_APP_URL — encrypted — production
- CRON_SECRET — sensitive — production
- SUPABASE_SERVICE_ROLE_KEY — sensitive — production
- NEXT_PUBLIC_SUPABASE_URL — encrypted — production
- FOOTYSTATS_API_KEY — sensitive — production
- APIFOOTBALL_KEY — sensitive — production

Only NEXT_PUBLIC_SUPABASE_URL (a public endpoint, not a credential) was resolved via GET /v1/projects/{project}/env/{id}; reported hostname: rgkrfzxipkrwqccfuqfq.supabase.co. Local configured host matches. The captured deployment names do not reveal the frozen URL value, so current project configuration is proven but exact historical deployment value equivalence is not independently proven. No secret was printed or added; no FiveDollar key was requested/read/used. No Preview variables were added. Staging project separation is unverified.

## Complete committed file delta: recorded deployment SHA to local HEAD

This is a Git delta, not an assertion that all uploaded deployment artifacts are represented by Git.

```text
M	.env.example
A	EPIC_91_EXECUTIVE_SUMMARY.md
A	EPIC_91_ODDSPAPI_QUOTA_FORENSICS.md
A	EPIC_92_DAILY_PREDICTION_REPORT.md
A	EPIC_92_DRIBBLE360_HARVEST_REPORT.md
A	EPIC_92_EXECUTIVE_SUMMARY.md
A	EPIC_92_MULTI_LEAGUE_REPORT.md
A	EPIC_92_ODDSPAPI_PRODUCTION_REPORT.md
A	EPIC_92_PRODUCTION_READINESS.md
A	EPIC_92_SETTLEMENT_REPORT.md
A	EPIC_93_FINAL_PRODUCTION_LEDGER_REPORT.md
A	EPIC_95_API_FOOTBALL_RECOVERY.md
A	EPIC_95_COMMERCIAL_DATA_LICENSE_AUDIT.md
A	EPIC_95_EXECUTIVE_DECISION.md
A	EPIC_95_FREE_VS_PAID_COMPARISON.md
A	EPIC_95_MONTHLY_COST_MODEL.md
A	EPIC_95_ODDSPAPI_QUOTA_POLICY.md
A	EPIC_95_PROVIDER_INVENTORY.md
A	EPIC_96_AUTOMATION_SCHEDULE.md
A	EPIC_96_COMPLETED_MATCH_LEDGER_RECONCILIATION.md
A	EPIC_96_DRIBBLE360_UTILIZATION_REPORT.md
A	EPIC_96_EXECUTIVE_AUDIT.md
A	EPIC_96_MULTI_LEAGUE_COVERAGE.md
A	EPIC_96_ODDSPAPI_QUOTA_FORENSICS.md
A	EPIC_96_PREDICTION_ENGINE_VALIDATION.md
A	EPIC_96_PRODUCTION_READINESS.md
A	EPIC_96_PROVIDER_LICENSE_MATRIX.md
A	EPIC_96_SETTLEMENT_AUDIT.md
A	EPIC_97_99_EXECUTIVE_DECISION.md
A	EPIC_97_99_FINAL_PRODUCTION_SAFETY_GATE.md
A	EPIC_97_AUTOMATION_READINESS.md
A	EPIC_97_ODDSPAPI_BUDGET_SIMULATION.md
A	EPIC_97_PIPELINE_DEPENDENCY_MATRIX.md
A	EPIC_97_SETTLEMENT_CERTIFICATION.md
A	EPIC_97_STAGING_EXECUTION_EVIDENCE.md
A	EPIC_98_DRIBBLE360_DATA_FORENSICS.md
A	EPIC_98_FEATURE_SPECIFICATION.md
A	EPIC_98_LEAKAGE_AUDIT.md
A	EPIC_98_SHADOW_INFERENCE_REPORT.md
A	EPIC_98_WALK_FORWARD_VALIDATION.md
A	EPIC_99_EPL_RELEASE_CERTIFICATION.md
A	EPIC_99_MONITORING_AND_SLO.md
A	EPIC_99_PRODUCTION_ACTIVATION_PLAN.md
A	EPIC_99_ROLLBACK_RUNBOOK.md
A	ODDSPAPI_DAILY_CONSUMPTION_TIMELINE.md
A	SALMO_AUTOMATIC_SETTLEMENT_HEALTH.md
A	SALMO_LIVE_PREDICTION_HEALTH.md
A	data/migrations/20261105_epic100g_staging_canonical_migration.sql
A	data/migrations/20261105_epic100g_staging_canonical_migration_rollback.sql
A	data/migrations/20261105_fresh_database_bootstrap.sql
A	data/schema_canonical.sql
A	data/schema_canonical_rollback.sql
A	docs/EPIC_91_EXECUTIVE_SUMMARY.md
A	docs/EPIC_91_ODDSPAPI_QUOTA_FORENSICS.md
A	docs/EPIC_92_DAILY_PREDICTION_REPORT.md
A	docs/EPIC_92_DRIBBLE360_HARVEST_REPORT.md
A	docs/EPIC_92_EXECUTIVE_SUMMARY.md
A	docs/EPIC_92_MULTI_LEAGUE_REPORT.md
A	docs/EPIC_92_ODDSPAPI_PRODUCTION_REPORT.md
A	docs/EPIC_92_PRODUCTION_READINESS.md
A	docs/EPIC_92_SETTLEMENT_REPORT.md
A	docs/EPIC_93_FINAL_PRODUCTION_LEDGER_REPORT.md
A	docs/EPIC_95_API_FOOTBALL_RECOVERY.md
A	docs/EPIC_95_COMMERCIAL_DATA_LICENSE_AUDIT.md
A	docs/EPIC_95_EXECUTIVE_DECISION.md
A	docs/EPIC_95_FREE_VS_PAID_COMPARISON.md
A	docs/EPIC_95_MONTHLY_COST_MODEL.md
A	docs/EPIC_95_ODDSPAPI_QUOTA_POLICY.md
A	docs/EPIC_95_PROVIDER_INVENTORY.md
A	docs/EPIC_96_AUTOMATION_SCHEDULE.md
A	docs/EPIC_96_COMPLETED_MATCH_LEDGER_RECONCILIATION.md
A	docs/EPIC_96_DRIBBLE360_UTILIZATION_REPORT.md
A	docs/EPIC_96_EXECUTIVE_AUDIT.md
A	docs/EPIC_96_MULTI_LEAGUE_COVERAGE.md
A	docs/EPIC_96_ODDSPAPI_QUOTA_FORENSICS.md
A	docs/EPIC_96_PREDICTION_ENGINE_VALIDATION.md
A	docs/EPIC_96_PRODUCTION_READINESS.md
A	docs/EPIC_96_PROVIDER_LICENSE_MATRIX.md
A	docs/EPIC_96_SETTLEMENT_AUDIT.md
A	docs/EPIC_97_99_EXECUTIVE_DECISION.md
A	docs/EPIC_97_99_FINAL_PRODUCTION_SAFETY_GATE.md
A	docs/EPIC_97_AUTOMATION_READINESS.md
A	docs/EPIC_97_ODDSPAPI_BUDGET_SIMULATION.md
A	docs/EPIC_97_PIPELINE_DEPENDENCY_MATRIX.md
A	docs/EPIC_97_SETTLEMENT_CERTIFICATION.md
A	docs/EPIC_97_STAGING_EXECUTION_EVIDENCE.md
A	docs/EPIC_98_DRIBBLE360_DATA_FORENSICS.md
A	docs/EPIC_98_FEATURE_SPECIFICATION.md
A	docs/EPIC_98_LEAKAGE_AUDIT.md
A	docs/EPIC_98_SHADOW_INFERENCE_REPORT.md
A	docs/EPIC_98_WALK_FORWARD_VALIDATION.md
A	docs/EPIC_99_EPL_RELEASE_CERTIFICATION.md
A	docs/EPIC_99_MONITORING_AND_SLO.md
A	docs/EPIC_99_PRODUCTION_ACTIVATION_PLAN.md
A	docs/EPIC_99_ROLLBACK_RUNBOOK.md
A	docs/ODDSPAPI_DAILY_CONSUMPTION_TIMELINE.md
A	docs/SALMO_AUTOMATIC_SETTLEMENT_HEALTH.md
A	docs/SALMO_LIVE_PREDICTION_HEALTH.md
A	docs/epic100d/EPIC100D_REPORT.md
A	docs/epic100e/APPLICATION_INTEGRATION_MAP.md
A	docs/epic100e/CONCURRENCY_VALIDATION.md
A	docs/epic100e/DATABASE_PERMISSION_MATRIX.md
A	docs/epic100e/EPIC100E_REPORT.md
A	docs/epic100e/PERFORMANCE_RECONCILIATION.md
A	docs/epic100e/PRODUCTION_SCHEMA_PARITY.md
A	docs/epic100e/SETTLEMENT_INTEGRATION_REPORT.md
A	docs/epic100e/WRITE_PATH_INVENTORY.md
A	docs/epic100f/EPIC100F_REPORT.md
A	docs/epic100f/IDEMPOTENCY_VERSIONING_AUDIT.md
A	docs/epic100f/ODDSPAPI_LIVE_READINESS.md
A	docs/epic100f/PERFORMANCE_ACCOUNTING_AUDIT.md
A	docs/epic100f/PRODUCTION_ENVIRONMENT_AUDIT.md
A	docs/epic100f/PRODUCTION_SECURITY_PARITY.md
A	docs/epic100f/RELEASE_GATE_REPORT.md
A	docs/epic100f/SCHEDULER_READINESS.md
A	docs/epic100f/SETTLEMENT_IDENTITY_AUDIT.md
A	docs/epic100f/SETTLEMENT_MATHEMATICAL_VALIDATION.md
A	docs/epic100g/ADVERSARIAL_TEST_REPORT.md
A	docs/epic100g/ENVIRONMENT_IDENTITY_AUDIT.md
A	docs/epic100g/EPIC100G_REPORT.md
A	docs/epic100g/MIGRATION_SAFETY_CHECKLIST.md
A	docs/epic100g/PERFORMANCE_ACCOUNTING_VALIDATION.md
A	docs/epic100g/RELEASE_GATE_REPORT.md
A	docs/epic100g/REPOSITORY_INTEGRATION_REPORT.md
A	docs/epic100g/SCHEMA_PARITY_MATRIX.md
A	docs/epic100g/STAGING_MIGRATION.sql
A	docs/epic100g/STAGING_MIGRATION_PLAN.md
A	docs/epic100g/STAGING_ROLLBACK.sql
A	docs/epic100g/STAGING_SECURITY_VALIDATION.md
A	docs/epic100g1/ENVIRONMENT_GUARD_VALIDATION.md
A	docs/epic100g1/ENVIRONMENT_ISOLATION_DESIGN.md
A	docs/epic100g1/EPIC100G1_REPORT.md
A	docs/epic100g1/MIGRATION_PREFLIGHT_AUDIT.md
A	docs/epic100g1/PRODUCTION_PROTECTION_AUDIT.md
A	docs/epic100g1/RELEASE_GATE_REPORT.md
A	docs/epic100g1/STAGING_PROVISIONING_GUIDE.md
A	docs/epic100g1/STAGING_RECOVERY_PLAN.md
A	docs/epic100g2/BACKUP_VERIFICATION.md
A	docs/epic100g2/EPIC100G2_REPORT.md
A	docs/epic100g2/MIGRATION_PREFLIGHT_REPORT.md
A	docs/epic100g2/RELEASE_GATE_REPORT.md
A	docs/epic100g2/REMOTE_SCHEMA_INVENTORY.md
A	docs/epic100g2/SCHEMA_PARITY_REPORT.md
A	docs/epic100g2/STAGING_IDENTITY_VERIFICATION.md
A	docs/epic100g3/APPLICATION_CONTRACT_VALIDATION.md
A	docs/epic100g3/BACKUP_AND_RECOVERY_VALIDATION.md
A	docs/epic100g3/BOOTSTRAP_ARCHITECTURE.md
A	docs/epic100g3/BOOTSTRAP_TEST_MATRIX.md
A	docs/epic100g3/CANONICAL_BASELINE_AUDIT.md
A	docs/epic100g3/CONNECTION_MODE_GUIDE.md
A	docs/epic100g3/EPIC100G3_REPORT.md
A	docs/epic100g3/FRESH_DATABASE_BOOTSTRAP.sql
A	docs/epic100g3/MIGRATION_RECONCILIATION_MATRIX.md
A	docs/epic100g3/MIGRATION_VERSIONING_DESIGN.md
A	docs/epic100g3/RELEASE_GATE_REPORT.md
A	docs/epic100g3/SUPABASE_COMPATIBILITY_AUDIT.md
M	src/config/env.ts
M	src/engine/decision/valueEngine.ts
M	src/lib/db.ts
A	src/lib/security/environmentGuard.ts
A	src/repositories/dbClient.ts
A	src/repositories/decisionLedgerRepository.ts
A	src/repositories/fixtureRepository.ts
A	src/repositories/oddsSnapshotRepository.ts
A	src/repositories/performanceRepository.ts
A	src/repositories/settlementRepository.ts
A	tests/epic100d_postgres_contract.test.js
A	tests/epic100e_concurrency_validation.test.js
A	tests/epic100e_ucl_end_to_end_acceptance.test.js
A	tests/epic100f_multi_decision_concurrency.test.js
A	tests/epic100f_settlement_mathematics_reference.test.js
A	tests/epic100g1_environment_guard.test.js
A	tests/epic100g3_application_contract.test.js
A	tests/epic100g3_bootstrap_adversarial.test.js
A	tests/epic100g_staging_security_validation.test.js
M	tests/match_archive_and_ledger_pipeline.test.js
M	tsconfig.json
```
