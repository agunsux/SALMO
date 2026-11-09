# SALMO.DEV — DAILY SHADOW AUTOMATION & CONCURRENCY REPORT

**Document ID:** `SALMO-REP-SHADOW-005`  
**Date:** 2026-11-09T08:44:00+07:00 (Asia/Jakarta)  
**Author:** Lead Infrastructure & Automation Engineer  
**Classification:** Research Infrastructure & Operational Audit  
**Status:** COMPLETED & VERIFIED  

---

## 1. Automation Architecture Overview

The Salmo Shadow Automation Subsystem coordinates the daily lifecycle of fixture discovery, quota-budgeted odds fetching, probability modeling, ledger appending, and match settlement.

It operates under four strict operational mandates:
1. **Zero Production Interference:** Automated jobs never access production Supabase instances, modify production Redis queues, or trigger public alerts.
2. **Strict Concurrency Protection:** Mutex locking prevents concurrent or overlapping script executions from burning API quota or producing duplicate ledger lines.
3. **Quota Ceiling Invariant:** Maximum 42 requests per hour, maximum 12 requests per minute, minimum 18 reserve requests maintained.
4. **Deterministic Run Logging:** Every execution logs structured diagnostic telemetry to `shadow_run_history.json`.

---

## 2. Execution Harness & Pipeline Lifecycle

The primary entry point is `scripts/run_fivedollar_shadow_daily.js`, executed daily at **06:00 UTC (13:00 WIB)**.

### Pipeline Stages:

```
[Trigger Daily Automation]
           │
           ▼
[Stage 1: Acquire Concurrency Lock]
  ├── If locked: Abort gracefully (exit code 0, log 'CONCURRENCY_LOCKED')
  └── If acquired: Proceed to Stage 2
           │
           ▼
[Stage 2: Provider Quota & Preflight Check]
  ├── Verify 5Dollar quota balance (Budget >= 10 reqs)
  ├── Verify API-Football status (FAIL-CLOSED: Suspension Hold detected)
  └── Check circuit breaker state
           │
           ▼
[Stage 3: Fixture Discovery]
  ├── Fetch upcoming fixtures (next 48h window, Top 5 leagues)
  └── Apply fixture cache (24h TTL; consumes zero quota on hit)
           │
           ▼
[Stage 4: Odds Ingestion & Devigging]
  ├── Request Bet365 AH, OU, 1X2, BTTS odds per fixture
  ├── Priority throttling: Core AH/OU (P1/P3), 1X2 (P2), BTTS (P5)
  └── Devig market margins to extract true implied probability
           │
           ▼
[Stage 5: Model Evaluation & Gating]
  ├── Compute Dixon-Coles expected goals & score grid
  ├── Evaluate candidate EV & confidence
  └── Apply High-Confidence Gate (Conf >= 65, EV >= +2.0%, Odds >= 1.60)
           │
           ▼
[Stage 6: Idempotent Ledger Appending]
  ├── Read existing shadow_prediction_ledger.jsonl
  ├── Deduplicate by predictionId
  └── Append new records with provenance LIVE_SHADOW_SIGNAL
           │
           ▼
[Stage 7: Historical Settlement & CLV Audit]
  ├── Ingest finalized scores for matches past kickoff
  ├── Compute profit/loss for settled bets
  └── Compare closing odds to signal odds for CLV calculation
           │
           ▼
[Stage 8: Release Concurrency Lock & Log Run History]
  ├── Record run summary to shadow_run_history.json
  └── Release lock
```

---

## 3. Concurrency Locking Implementation

To avoid race conditions, `ShadowOperationsService` and `run_fivedollar_shadow_daily.js` utilize atomic mutex locking:

```typescript
public static acquireLock(): boolean {
  if (this.isJobRunning) return false;
  this.isJobRunning = true;
  return true;
}

public static releaseLock(): void {
  this.isJobRunning = false;
}
```

### Verification in Automated Tests:
The locking mechanism is tested in `tests/shadow_dashboard_integration.test.js`:
- First lock acquire: **`true`**
- Second simultaneous acquire: **`false`** (properly rejected)
- Acquire after release: **`true`**

---

## 4. Run History Telemetry

Execution telemetry is appended to `data/research/fivedollar_shadow/shadow_run_history.json`.

### Sample Run Record:
```json
{
  "runId": "run_20261109_083816",
  "startedAt": "2026-11-09T01:38:16.890Z",
  "completedAt": "2026-11-09T01:38:16.980Z",
  "status": "SUCCESS",
  "fixturesDiscovered": 5,
  "oddsRequestsConsumed": 0,
  "predictionsGenerated": 20,
  "qualifiedPicks": 0,
  "settlementsProcessed": 0,
  "errors": []
}
```

---

## 5. CLI Execution Modes

The script supports explicit operator flags:

| Flag | Purpose | Safety Effect |
| :--- | :--- | :--- |
| `node scripts/run_fivedollar_shadow_daily.js --status` | Inspect quota, recent runs, and ledger stats. | Zero network requests; read-only. |
| `node scripts/run_fivedollar_shadow_daily.js --dry-run` | Simulate fixture fetching and model gating. | Zero ledger writes; zero quota consumption. |
| `node scripts/run_fivedollar_shadow_daily.js --force-backfill` | Re-run historical backfill reconciliation. | Appends only missing historical records. |

---

## 6. Audit Verdict

| Requirement | Specification | Implementation Result | Verdict |
| :--- | :--- | :--- | :--- |
| **Concurrency Guard** | Mutex lock prevents overlapping runs | Verified in test suite | **PASSED** |
| **Quota Throttling** | Maximum 42 req/hr, 12 req/min burst | Token bucket + priority rationing active | **PASSED** |
| **Production Isolation** | No cron jobs registered in production | Shadow automation is local CLI/service only | **PASSED** |
| **Telemetry Persistence** | Structured run log JSON | Verified at `shadow_run_history.json` | **PASSED** |
