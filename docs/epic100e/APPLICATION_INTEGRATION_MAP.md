# EPIC 100E — APPLICATION INTEGRATION MAP & DATA DOMAINS

**Scope**: Authoritative architecture mapping across all 11 application lifecycle stages.  
**Baseline**: Post-EPIC 100D local PostgreSQL contract validation.  
**Production Status**: NO-GO (Local Validation Only).  

---

## 1. Authoritative Domain Layer Architecture

To prevent dual-write architecture, inconsistent field mappings, and fragmented validations, SALMO defines exactly one authoritative repository for each data domain:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              SALMO RUNTIME DOMAINS                              │
└─────────────────────────────────────────────────────────────────────────────────┘
         │
         ├── [1] Fixtures & Matches Domain ───────> FixtureRepository
         │                                          (Canonical ID, Status, Lifecycle)
         │
         ├── [2] Odds & Snapshots Domain ─────────> OddsSnapshotRepository
         │                                          (Pinnacle Reference, Immutability)
         │
         ├── [3] Decisions & Ledger Domain ───────> DecisionLedgerRepository
         │                                          (11-Step Transaction, ConfidenceGate)
         │
         ├── [4] Settlement Domain ───────────────> SettlementRepository
         │                                          (Quarter-line Math, Results, Daily)
         │
         └── [5] Performance & Analytics Domain ──> PerformanceRepository
                                                    (Pure Derivations, Zero Writes)
```

---

## 2. Integration Across 11 Lifecycle Stages

### Stage 1: Prediction Generation
- **Authoritative Engine**: `ProductionPredictionEngine` (Dixon-Coles bivariate Poisson with low-scoring dependency parameter $\rho$).
- **Output Contract**: `ActiveMatchPrediction` containing `lambdaHome`, `lambdaAway`, $\rho$, score grid matrix, and goal environment.
- **Repository Integration**: Resolves team ratings and verifies minimum sample size ($n \ge 3$ matches per team).

### Stage 2: Odds Retrieval
- **Authoritative Provider**: Pinnacle via OddsPapi or The Odds API sharp quote capture.
- **Quota Guard**: `TheOddsApiQuotaManager` and `OddsPapiQuotaGuard` block calls if quota exceeds limits. Zero unmetered or synthetic odds allowed.

### Stage 3: Odds Normalization
- **Authoritative Engine**: `OddsSnapshotRepository` + `ValueEngine.devigTwoWay`.
- **Methodology**: Two-way multiplicative devigging against Pinnacle sharp reference.
- **Invariant**: Overround must be within $(1.0, 1.08]$; individual odds must strictly exceed $1.0$.

### Stage 4: Expected Value (EV) Calculation
- **Authoritative Engine**: `ValueEngine.calculateAhExpectedValue` & `AsianTotalEngine.calculateOuExpectedValue`.
- **Methodology**: Settlement-aware expected value incorporating quarter-line outcomes (half-win, half-loss, push).
- **Formula**: $EV = \sum (OutcomeProbability \times OutcomePayout) - 1.0$.

### Stage 5: ConfidenceGate Evaluation
- **Authoritative Engine**: `ValueEngine.evaluateSelection` & `DecisionPolicy.evaluate`.
- **Factors**: 4-factor decoupled composite signal robustness:
  1. Sample Support ($0 - 35$ pts)
  2. Odds Freshness ($0 - 25$ pts)
  3. Market Spread Tightness ($0 - 20$ pts)
  4. Edge Depth ($0 - 20$ pts)
- **Qualification Invariant**: Only selections achieving verdict `LAYAK` and Confidence Tier `HIGH` ($\ge 65$) qualify for actionable ledger insertion.

### Stage 6: Decision Creation
- **Authoritative Repository**: `DecisionLedgerRepository` (Step 9).
- **Target Table**: `public.decisions`.
- **Fields**: UUID PK, match_id FK, market_type, selection, line, badge, status, confidence, edge_pp, ev_pct, model_version, feature_version, odds_snapshot_id.
- **Invariant**: Protected by trigger `trg_immutable_decisions`. Once inserted, decision parameters cannot be altered.

### Stage 7: Actionable Ledger Insertion
- **Authoritative Repository**: `DecisionLedgerRepository` (Step 10).
- **Target Table**: `public.prediction_ledger`.
- **Idempotency Key**: Deterministic `doi_id = doi_{fixtureId}_{market}_{line}_{normalizedSelection}`.
- **Execution Window**: Fixture kickoff must be strictly within 24 hours of prediction generation.

### Stage 8: Settlement
- **Authoritative Repository**: `SettlementRepository.settleFixture`.
- **Target Tables**: Atomic update across `matches`, `settlement_results`, `prediction_ledger`, and `daily_picks`.
- **Methodology**: Quarter-line Asian math (AH and OU). OddsPapi is strictly NOT called during settlement.

### Stage 9: Performance Aggregation
- **Authoritative Repository**: `PerformanceRepository.calculatePerformance`.
- **Target Source**: Authoritative `prediction_ledger` records where `data_status = 'ACTIVE'`.
- **Invariants**:
  - Never calculates production ROI from unverified predictions or synthetic backtests.
  - Voids return 0 stake and 0 returns (excluded from win rate calculations).

### Stage 10: API Responses
- **Authoritative Endpoints**:
  - `GET /api/v1/matches`: Queries canonical `matches` and `decisions`.
  - `GET /api/v1/performance`: Queries `PerformanceRepository`.
  - `GET /api/v1/daily-picks`: Queries `public.daily_picks` projection.

### Stage 11: Frontend Data Access
- **Client Protocol**: Read-only Supabase anon client or direct Next.js server actions querying read-only repositories.
- **Security Invariant**: Frontend never possesses service-role credentials and has zero write permissions to any canonical table.

---

## 3. Legacy Path Decommissioning Classification

| Path / Mechanism | Domain | Former Usage | Target Canonical Path | Classification |
| :--- | :--- | :--- | :--- | :--- |
| Supabase direct `.insert()` in API | Decisions | Client-side pick creation | `DecisionLedgerRepository.executeAtomicDecisionWorkflow` | **REPLACED** |
| Direct SQL without FK constraints | Matches | Legacy ingestion | `FixtureRepository.saveFixture` | **REPLACED** |
| Unconstrained `market_snapshots` | Odds | Legacy odds logger | `OddsSnapshotRepository.captureSnapshot` | **REPLACED** |
| Raw JSONL file mutations without DB | Settlement | Standalone file runner | `SettlementRepository.settleFixture` | **DEPRECATED** (File kept for audit) |
| Hardcoded EPL tournament ID queries | Pipeline | Single-league assumptions | `CANONICAL_15_LEAGUES` versioned registry | **REPLACED** |
| Uncalibrated non-EPL production picks | ValueEngine | Unvalidated promotions | `isLeagueMarketProductionEnabled` fail-closed gate | **BLOCKED** |
| BTTS Actionable Qualification | Ledger | Legacy multi-market pick | `UNSUPPORTED_MARKET_RESEARCH_ONLY` gate | **BLOCKED** (Research Only) |
