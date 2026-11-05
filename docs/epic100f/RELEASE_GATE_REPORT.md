# EPIC 100F — RELEASE GATES EVALUATION REPORT (GATES A — H)

**Document Identifier**: `docs/epic100f/RELEASE_GATE_REPORT.md`  
**Parent Epic**: EPIC 100F — Production Parity, Adversarial Audit & Live Data Readiness  
**Authors**: Astra / DeepMind Advanced Agentic Coding Pair  
**Status**: COMPLETE / FORENSICALLY EVALUATED  
**Overall Decision**: **STRICTLY NO-GO FOR PRODUCTION DEPLOYMENT**  

---

## 1. Executive Summary

In EPIC 100F, every subsystem of Salmo was subjected to an adversarial production-readiness audit. Rather than assuming correctness from passing local unit tests, we investigated structural edge cases, audited database schemas on remote Supabase, formulated an independent mathematical reference suite from first principles, tested multi-worker concurrency, and verified external provider quotas.

This report evaluates Release Gates A through H with rigorous, evidence-based criteria.

---

## 2. Release Gate Assessment (Gates A — H)

| Gate | Domain | Verdict | Primary Evidence & Rationale |
| :--- | :--- | :--- | :--- |
| **Gate A** | **Preserved Integrity & Protected Hashes** | **PASS** | • 3 protected historical ledgers match golden SHA-256 hashes byte-for-byte.<br>• Full test suite passes: **449 pass, 0 fail, 1 skipped** (PGlite conditional skip).<br>• Clean Git state, zero overwrites of EPIC 100B/C/D/E implementations. |
| **Gate B** | **Settlement Identity & Multi-Decision Coexistence** | **PASS** | • Structural defect `(fixture_id, market_type)` uniqueness dropped.<br>• Replaced by granular position-level constraint `(ledger_position_id)` and `(prediction_id)`.<br>• Verified simultaneous coexistence and settlement of `AH -0.25` and `AH -0.50` on the same match with zero data loss. |
| **Gate C** | **Idempotency Key & Versioning Architecture** | **PASS** | • `doi_id` key incorporates `cleanSelection` and optional `modelVersion` / `decisionVersion`.<br>• Prevents duplicate cron worker race conditions while permitting legitimate model upgrades.<br>• Multi-worker parallel test with 4 workers confirms exact deduplication. |
| **Gate D** | **Performance Accounting & Population Separation** | **PASS** | • `PerformanceRepository` strictly enforces `source_type NOT IN ('SYNTHETIC', 'SIMULATION')` by default.<br>• Local simulations (e.g., UCL Real Madrid vs Man City) cannot leak into production ROI.<br>• Complete settlement lifecycle (PENDING, WIN, HALF_WIN, PUSH, HALF_LOSS, LOSS, VOID) verified.<br>• Calibration metrics (Brier, Log Loss) segregated from financial ROI. |
| **Gate E** | **Settlement Mathematics Reference Suite** | **PASS** | • 27-case independent mathematical test suite formulated from first principles.<br>• Critical away handicap sign inversion defect discovered and resolved in `SettlementRepository`.<br>• All 27 line cases (quarter, half, whole lines, VOID) match with 0.0000 tolerance. |
| **Gate F** | **Production Database Parity & Security** | **BLOCKED (NO-GO)** | • Remote Supabase (`rgkrfzxipkrwqccfuqfq.supabase.co`) inspected via read-only OpenAPI.<br>• `market_snapshots` and `decisions` tables **do not exist** on remote Supabase.<br>• Remote Supabase lacks candidate triggers for snapshot/decision immutability.<br>• Remote DB write is held; cannot deploy to production until remote migrations are scheduled. |
| **Gate G** | **Live Provider & OddsPapi Readiness** | **BLOCKED (NO-GO)** | • OddsPapi monthly quota is **exhausted** (260 consumed / 250 limit).<br>• Circuit breaker permanently tripped; `ODDSPAPI_PAUSED=true` enforced.<br>• Live automated decision generation is physically impossible without quota renewal. |
| **Gate H** | **Schedulers & Autonomous Automation** | **PASS (SAFELY HELD)** | • `vercel.json` verified with `"crons": []` (empty array).<br>• GitHub Actions `settle-cron.yml` is strictly manual `workflow_dispatch` with `dry_run: true`.<br>• Zero autonomous cron jobs are active in production. |

---

## 3. Detailed Gate-by-Gate Audit Findings

### Gate A: Cryptographic Integrity
The three protected historical ledgers were verified via SHA-256:
- `data/verification/live_prediction_ledger.jsonl`: `317fc037a63b811420400ea9de094092ec7d68b119ad6abc57743be12d568527` [MATCH]
- `data/verification/all_leagues_research_ledger.jsonl`: `eae8f364a5393255d276fca2650056951fb601ba829c1710b26ac673dffb967b` [MATCH]
- `data/research/multi_league_research_predictions.jsonl`: `0128616a43968be5fddab76ea5c57da731955e22b1bf27bca3f886938187a12f` [MATCH]

### Gate B & C: Multi-Decision Coexistence & Idempotency
In `tests/epic100f_multi_decision_concurrency.test.js`:
- Scenario 1 proved that `AH -0.25` and `AH -0.50` on *Manchester City vs Newcastle United* coexisted, received independent ledger IDs, and settled independently with $+0.95$ and $+1.10$ profit units respectively.
- Scenario 2 proved that identical runs trigger `idempotentDuplicate: true`, while upgraded model versions generate distinct keys and succeed.
- Scenario 5 demonstrated 4 concurrent workers with zero deadlocks and exact deduplication.

### Gate D & E: Performance Accounting & Mathematical Verification
- The independent reference suite (`tests/epic100f_settlement_mathematics_reference.test.js`) uncovered that `SettlementRepository.calculateAhSettlement` previously subtracted the line for the away side, inverting positive handicaps into losses. This was resolved to `(awayGoals - homeGoals) + line`.
- `PerformanceRepository.calculatePerformance` was hardened to exclude `source_type IN ('SYNTHETIC', 'SIMULATION')`, guaranteeing that local acceptance test simulations never distort public metrics.
- PUSH decisions correctly return stake, contribute 0 profit, and are excluded from binary calibration metrics (Brier and Log Loss).

### Gate F & G: Production Blockers (The Hard NO-GO)
1. **Remote Schema Gaps (Gate F)**:
   Remote Supabase lacks `market_snapshots` and `decisions`. Running application code against remote Supabase would throw immediate foreign key and table-not-found errors.
2. **Quota Exhaustion (Gate G)**:
   OddsPapi has consumed 260 of 250 allowed requests. Upstream calls return HTTP 429. Live decision ingestion cannot function.

---

## 4. Final Recommendation: PRODUCTION NO-GO

Based on the evidence from Gates F and G:
**Production deployment remains STRICTLY NO-GO**.

The local codebase and candidate database contracts are mathematically sound, highly resilient, and fully integrated. However, until:
1. Supabase remote database receives the staging migration for `market_snapshots`, `decisions`, and PostgreSQL triggers, and
2. OddsPapi quota is replenished or upgraded,

Salmo must remain in local development and staging verification.
