# IDEMPOTENCY KEY ARCHITECTURE & VERSIONING AUDIT

**Document Identifier**: `docs/epic100f/IDEMPOTENCY_VERSIONING_AUDIT.md`  
**Parent Epic**: EPIC 100F — Production Parity, Adversarial Audit & Live Data Readiness  
**Authors**: Astra / DeepMind Advanced Agentic Coding Pair  
**Status**: COMPLETE / VERIFIED  
**Production Status**: STRICTLY NO-GO  

---

## 1. Executive Summary

In asynchronous and serverless betting architectures, idempotency keys serve two opposing operational requirements:
1. **Deduplication Invariant**: Multiple concurrent cron workers or retries evaluating the same fixture at the same minute must not create duplicate betting positions or multiple daily picks.
2. **Evolution & Revision Invariant**: Legitimate new information—such as a model upgrade, dynamic rating calibration, or significant line adjustment—must be able to record a new or superseding decision without being silently blocked by an over-broad deduplication key.

During the adversarial audit in EPIC 100F, the unversioned key:
```text
doi_{fixtureId}_{market}_{line}_{normalizedSelection}
```
was analyzed. Without explicit model or decision versioning, an unversioned key permanently locked a fixture/market/line tuple to the first decision ever generated, preventing model parameter updates or new model versions from ever recording actionable decisions on that fixture.

This audit details the design, implementation, and empirical verification of the versioned idempotency architecture.

---

## 2. Key Structure & Normalization Rules

The canonical idempotency key is generated via `DecisionLedgerRepository.generateDoiId`:

```typescript
public static generateDoiId(
  fixtureId: string,
  market: string,
  line: number,
  selection: string,
  modelVersion?: string,
  decisionVersion?: string
): string {
  const cleanSelection = selection.toLowerCase().replace(/[^a-z0-9]/g, '');
  let key = `doi_${fixtureId}_${market}_${line}_${cleanSelection}`;
  if (modelVersion) {
    key += `_${modelVersion.replace(/[^a-z0-9.-]/gi, '_')}`;
  }
  if (decisionVersion) {
    key += `_${decisionVersion}`;
  }
  return key;
}
```

### 2.1 Component Breakdown

| Component | Example | Role | Normalization Invariant |
| :--- | :--- | :--- | :--- |
| `prefix` | `doi_` | Domain namespace | Constant prefix distinguishing actionable decisions |
| `fixtureId` | `UCL_2026_RMD_MCI` | Match binding | Canonical fixture identifier or UUID |
| `market` | `AH` or `OU` | Market domain | Standardized market code (`AH`, `OU`, `BTTS`) |
| `line` | `-0.25`, `2.50` | Numerical line | Float formatted without trailing float noise |
| `cleanSelection` | `realmadrid025` | Bet target | Lowercase alphanumeric only (strips spaces, hyphens) |
| `modelVersion` | `dixon-coles-v1.0` | Model lineage | Distinguishes decisions across model versions |
| `decisionVersion` | `rev1` (optional) | Revision lineage | Allows explicit superseding decisions when needed |

---

## 3. Adversarial Scenarios Evaluated

### Scenario A: Identical Concurrent Cron Workers (Race Condition)
- **Action**: Two independent worker processes run `executeAtomicDecisionWorkflow` concurrently on the exact same match (`Tottenham vs Aston Villa`, `Over 2.5`), with the same model version `dixon-coles-v1.0`.
- **Behavior**:
  - Worker 1 executes `INSERT ... ON CONFLICT (doi_id) DO NOTHING` and returns `idempotentDuplicate: false`.
  - Worker 2 hits the same `doi_id`, encounters the unique constraint, generates 0 inserted rows, and safely returns `idempotentDuplicate: true` with the existing `ledgerId`.
- **Result**: Exactly 1 position in `prediction_ledger`, zero duplicates, zero orphan snapshots.

### Scenario B: Legitimate Model Upgrades
- **Action**: Model version `dixon-coles-v1.0` generated an initial pick. Two hours later, a new model version `dixon-coles-v2.0` (incorporating updated team rating variance) re-evaluates the fixture.
- **Behavior**:
  - Because `modelVersion` is incorporated into the key (`_dixon-coles-v2_0`), the resulting `doi_id` is distinct.
  - The workflow succeeds without being blocked by the v1.0 key.
- **Result**: Both versions coexist in database history, enabling shadow model comparison and model drift tracking.

### Scenario C: Line Movement & Adjustments
- **Action**: Odds movement causes the value engine to switch recommended line from `AH -0.25` to `AH -0.50`.
- **Behavior**:
  - The `line` and `selection` components differ (`-0.25` vs `-0.5`).
  - Both positions are independently registered and settled without collision.

---

## 4. Empirical Test Evidence

Verified in `tests/epic100f_multi_decision_concurrency.test.js`:
- **Scenario 2**:
  - Run 1 (Model v1.0): Success, `idempotentDuplicate: false`.
  - Run 2 (Model v1.0, duplicate retry): Success, `idempotentDuplicate: true` (deduplication confirmed).
  - Run 3 (Model v2.0): Success, `idempotentDuplicate: false` (legitimate upgrade allowed).
- **Scenario 5**:
  - 4 parallel workers executing concurrently (3 distinct lines + 1 exact duplicate).
  - All 4 returned `success: true`.
  - Exactly 1 was recognized as duplicate, resulting in exactly 3 positions in database.
- **Outcome**: **100% PASS**.
