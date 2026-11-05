# EPIC 100E — FULL APPLICATION WRITE-PATH AUDIT INVENTORY

**Scope**: Complete inventory of every application write and modification path.  
**Baseline**: Post-EPIC 100D local PostgreSQL contract validation.  
**Production Status**: NO-GO (Local Validation Only).  

---

## 1. Executive Summary

This audit identifies every component in the SALMO architecture that inserts, updates, or modifies data across:
1. **Fixtures / Matches**
2. **Predictions**
3. **Odds Snapshots**
4. **Decision Records**
5. **Actionable Ledger**
6. **Settlement Records**
7. **Performance Aggregates**

All write paths have been evaluated to ensure that no legacy code silently bypasses database constraints or tampers with immutable snapshots.

---

## 2. Complete Application Write-Path Inventory

| Component / File | Current Write Method | Target Canonical Contract | Classification | Transition Status |
| :--- | :--- | :--- | :--- | :--- |
| `src/repositories/fixtureRepository.ts` | Direct parameterized SQL `INSERT INTO public.matches` / `UPDATE public.matches` | `public.matches` (UUID PK, canonical_match_id unique) | CANONICAL | **ACTIVE** |
| `src/repositories/oddsSnapshotRepository.ts` | Direct parameterized SQL `INSERT INTO public.market_snapshots` | `public.market_snapshots` (FK to matches, immutability trigger) | CANONICAL | **ACTIVE** |
| `src/repositories/decisionLedgerRepository.ts` | 11-step ACID transaction: inserts `decisions`, `evidence`, `data_provenance`, `prediction_ledger`, `daily_picks` | `public.decisions` & `public.prediction_ledger` | CANONICAL | **ACTIVE** |
| `src/repositories/settlementRepository.ts` | ACID transaction: updates `matches`, inserts `settlement_results`, updates `prediction_ledger`, updates `daily_picks` | `public.settlement_results` & `public.prediction_ledger` | CANONICAL | **ACTIVE** |
| `src/repositories/performanceRepository.ts` | Pure query engine reading authoritative `prediction_ledger` and `settlement_results` (Zero write side-effects) | Read-only analytics over canonical ledger | CANONICAL | **ACTIVE** |
| `src/engine/pipeline/productionPredictionEngine.ts` | Supabase JS client `.insert(ledgerRow)` + optional `live_prediction_ledger.jsonl` append | Delegated to `DecisionLedgerRepository.executeAtomicDecisionWorkflow` | MIGRATED | **ACTIVE** (Postgres Mode) |
| `src/engine/settlement/productionSettlementRunner.ts` | Supabase JS client `.update()` + local JSONL write | Delegated to `SettlementRepository.settleFixture` | MIGRATED | **ACTIVE** (Postgres Mode) |
| `src/engine/evidence/evidenceAccumulationService.ts` | `fs.appendFileSync(targetFile)` for JSONL audit trails | Historical audit trail, non-transactional | AUXILIARY | **ACTIVE** (Audit only) |
| `src/engine/ledger/canonicalPredictionLedger.ts` | File write for local simulation outputs | Canonical in-memory ledger generator | SIMULATION | **ACTIVE** |
| `src/engine/pipeline/dailyPredictionRefreshService.ts` | Atomic temp-file write `fs.writeFileSync(tempPath)` | Daily cache projection writer | PROJECTION | **ACTIVE** |
| `src/engine/pipeline/durablePredictionStorageAdapter.ts` | File-based local storage cache | Local snapshot cache | CACHE | **ACTIVE** |
| `src/engine/sync/handicapLabSyncService.ts` | Atomic file write for verified sync records | Local sync adapter | ADAPTER | **ACTIVE** |
| `src/app/api/v1/cron/daily-refresh/route.ts` | Invokes `DailyPredictionRefreshService.executeDailyRefresh` | Runs pipeline, respects cron authentication | API / CRON | **ACTIVE** |
| `src/app/api/v1/cron/settlement/route.ts` | Invokes `runProductionSettlement` | Calls `SettlementRepository.settleFixture` | API / CRON | **ACTIVE** |
| `src/app/api/v1/matches/route.ts` | Read-only API handler | Reads from `matches` & `decisions` | READ-ONLY | **ACTIVE** |
| `src/app/api/v1/performance/route.ts` | Read-only API handler | Reads from `PerformanceRepository.calculatePerformance` | READ-ONLY | **ACTIVE** |
| `src/services/providers/theOddsApiQuotaManager.ts` | Atomic JSON state file write | Quota tracking state | UTILITY | **ACTIVE** |

---

## 3. High-Risk Bypass Identification & Mitigation

### 3.1 Direct Database Inserts Bypassing Validation
- **Identified Risk**: Any component writing directly to `prediction_ledger` without going through the 11-step qualification workflow could insert negative EV or unvalidated picks.
- **Mitigation**: 
  - Database-level check constraints `chk_ledger_prob` and `chk_ledger_odds` enforce mathematical validity at the schema level.
  - Immutability trigger `fn_protect_prediction_ledger_immutability()` prevents modifying decision parameters.
  - Unique constraint on `doi_id` prevents duplicate insertion.

### 3.2 UPDATE Operations Against Immutable Snapshots
- **Identified Risk**: Bookmaker odds updates overwriting original quote snapshots.
- **Mitigation**: 
  - `market_snapshots` has trigger `fn_prevent_market_snapshot_tampering()` which unconditionally raises an exception on `UPDATE` or `DELETE`. Fresh quotes MUST create a new snapshot with an independent UUID and timestamp.

### 3.3 Duplicate Insertion Under Concurrency
- **Identified Risk**: Multiple worker instances ingesting the same fixture or creating the same decision concurrently.
- **Mitigation**: 
  - `prediction_ledger (doi_id)` unique constraint with `ON CONFLICT (doi_id) DO NOTHING`.
  - In `executeAtomicDecisionWorkflow`, a detected conflict fetches the existing committed row and returns `{ idempotentDuplicate: true }`, preventing dual records or race-condition panics.

### 3.4 Non-Transactional Settlement
- **Identified Risk**: Settlement updating fixture scores but crashing before settling the ledger row, leaving corrupted state.
- **Mitigation**: 
  - `SettlementRepository.settleFixture` wraps all updates (`matches`, `settlement_results`, `prediction_ledger`, `daily_picks`) inside a single `BEGIN ... COMMIT` block. Any failure triggers immediate `ROLLBACK`.
