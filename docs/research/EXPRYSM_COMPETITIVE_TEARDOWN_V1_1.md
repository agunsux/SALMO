# EXPRYSM COMPETITIVE TEARDOWN × HANDICAPLAB PIPELINE AUDIT × SALMO GAP ANALYSIS (V1.1)
**Document Version:** 1.1.0  
**Baseline Document:** `docs/research/EXPRYSM_COMPETITIVE_TEARDOWN_V1.md` (Preserved intact)  
**Date:** September 21, 2026  
**Auditor:** Quantitative Systems Architect & Forensic Competitive Intelligence Lead  
**Scope:** Forensic Competitive Teardown Reconciliation, Market-Scope Rearchitecture, Line-Family Formalization, and Architecture Alignment.

---

## 1. V1 → V1.1 RECONCILIATION

This section systematically reconciles findings between the initial V1 competitive audit and the reconciled V1.1 architectural baseline.

| Item | Topic | V1 Baseline Statement | V1.1 Reconciled Finding | Status | Rationale & Code Impact |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **A** | **SALMO Market Scope** | Evaluated as AH, OU 2.5, and BTTS. | Strictly 3 markets: Asian Handicap Line Family, BTTS, and Goals Over/Under Line Family. | **CONFIRMED & EXPANDED** | Market count remains exactly 3; depth is prioritized over breadth. |
| **B** | **O/U 2.5 Assumption** | Characterized as "O/U 2.5 only". | Reconciled to **Goals Over/Under Line Family** (1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0, 3.25, 3.5, 3.75, 4.0). | **SUPERSEDED** | Score grid produces 1D goal distribution from which any available line is derivable. 2.5 was an artifact of free CSV columns. |
| **C** | **AH Quarter-Line Support** | Supported in `QuarterLineSettler`. | Confirmed as **Asian Handicap Line Family** (-1.5 to +1.5) derived from common bivariate distribution with deterministic split settlement. | **CONFIRMED** | Mathematical settlement engine verified; handles arbitrary quarter-lines without binary reduction. |
| **D** | **BTTS Model Foundation** | Surfaced as independent market. | Confirmed as deriving directly from the common bivariate score grid: $P(\text{BTTS Yes}) = \sum_{x \ge 1, y \ge 1} P(x, y)$. | **CONFIRMED** | No separate independent BTTS model required or admitted. |
| **E** | **1X2 / Moneyline Scope** | Characterized as "rejected / excluded". | Reclassified as **OUT OF CURRENT PRODUCT SCOPE**. | **SUPERSEDED (TERMINOLOGY)** | Excluded by strategic decision to focus on liquid, high-volume lines; not rejected as mathematically invalid. |
| **F** | **Closing Line Value (CLV)** | Stated that CLV engine exists. | Code exists (`clvEngine.ts`), but closing odds ingestion is pending. **NOT currently production-verified.** | **PARTIALLY CORRECT (REFINED)** | Strict governance: CLV cannot be claimed or displayed on UI until real closing odds are ingested and validated. |
| **G** | **Bankroll Management** | Highlighted as SALMO product gap. | Layered separation enforced: HandicapLab owns staking math (fractional Kelly, portfolio risk); SALMO owns input UX and stake display. | **CONFIRMED & DECOUPLED** | Mathematical calculation remains in HandicapLab; presentation belongs in SALMO. |
| **H** | **Public Ledger** | Identified as missing public UI page. | HandicapLab owns evidence infrastructure (`prediction_ledger_v3`, SHA-256); SALMO owns consumer presentation (`/track-record`). | **CONFIRMED** | Ledger is not duplicated in SALMO; SALMO queries canonical Gold layer views. |
| **I** | **Live / In-Play Feasibility** | Labeled "DO NOT BUILD YET". | Confirmed as **FUTURE RESEARCH ONLY**. Metered quota costs, 15–45s polling latency, and lack of dynamic hazard rate model make it unviable. | **CONFIRMED** | Zero changes to live/second-half status. |
| **J** | **Provider Quotas** | Dual-provider architecture noted. | Preserved. Metering rules prevent high-frequency polling on low-value features (e.g., continuous lineup scraping). | **CONFIRMED** | Strict governance of API-Football (7.5k/day) and OddsPapi (250/mo) budgets. |
| **K** | **Production Coverage** | Live prediction pipeline audited. | 33 tests pass. Fail-closed invariants verified: zero synthetic fixtures, real sharp bookmaker odds (Pinnacle). | **CONFIRMED** | High data integrity confirmed across all integration paths. |
| **L** | **EPIC 51 Impact** | Stage A audited. | Keep Picks page wiring; **REVISE** Results page to query canonical `prediction_ledger_v3` instead of legacy tables. | **CONFIRMED** | Ensures immutable cryptographic provenance across consumer track records. |
| **M** | **EPIC 52 Impact** | Stages A–E audited. | Keep Sharp Odds budget and T-60 snapshot; **REVISE** lineup polling (data shows +0.03% delta); **DEFER** rivalry pairs. | **CONFIRMED** | Prevents quota exhaustion on low-impact features. |

---

## 2. DE-EVALUATIVIZED COMPETITIVE TELEMETRY (EXPRYSM)

All evaluative, subjective, and promotional language has been removed. Observations are restricted to numerical telemetry and structural code inspection.

### 2.1 Public Performance Telemetry (Direct Production JSON Extraction)

Data extracted directly from ExPrysm's production payloads (`perf_summary_v1.json`, `perf_timing_v1.json`, `calibration_curves.json`):

1. **Overall Aggregate Track Record:**
   - Total settled bets recorded: **13,766**.
   - Cumulative P&L: **-256.70 units**.
   - Cumulative ROI: **-1.865%**.
2. **Regime Transition (2026-06-07):**
   - **`llm_v1` Regime** (2026-02-04 to 2026-06-07):
     - Sample: 8,010 settled bets.
     - P&L: -275.78 units.
     - ROI: **-3.443%**.
   - **`hybrid` Regime** (2026-06-07 to present):
     - Sample: 5,756 settled bets.
     - P&L: +19.08 units.
     - ROI: **+0.331%** (95% Confidence Interval: $[-1.85\%, +2.55\%]$).
3. **Market-by-Market Returns in Current `hybrid` Regime:**
   - **Asian Handicap:** 1,005 bets, P&L -31.75 units, **ROI: -3.16%**.
   - **Goals Over/Under:** 569 bets, P&L -18.21 units, **ROI: -3.20%**.
   - **Both Teams To Score (BTTS):** 370 bets, P&L -30.27 units, **ROI: -8.18%**.
   - **Match Result (1X2):** 142 bets, P&L -14.26 units, **ROI: -10.04%**.
   - **Corners:** 1,842 bets, P&L +96.15 units, **ROI: +5.22%**.
   - **Cards:** 1,828 bets, P&L +162.15 units, **ROI: +8.87%**.
4. **Closing Line Value (CLV) Metrics:**
   - Evaluated sample: 2,608 bets.
   - Average CLV: **+0.44%** ($0.0044$).
   - Proportion beating closing line: **49.92%**.
   - Classification in ExPrysm telemetry: `clv_verdict_flat` (within $\pm0.5\%$ margin of error).
5. **Kickoff Lineup Updates ("KU") Telemetry:**
   - Total lineup updates processed: 5,341.
   - Pre-update morning accuracy: **49.80%**.
   - Post-update accuracy: **49.83%**.
   - Performance delta ($\Delta$): **+0.03 percentage points**.
   - Classification in ExPrysm telemetry: `ku_verdict_inconclusive`.

### 2.2 Structural Observations vs. Interpretations vs. Strategic Implications

- **Observation:** ExPrysm offers 8+ betting markets and 650+ leagues, but its core football liquid markets (AH, O/U, BTTS, 1X2) have negative empirical yields (-3.16% to -10.04% ROI). Positive aggregate yield (+0.33%) is generated by derivative prop markets (Cards and Corners).
- **Interpretation:** Spreading modeling capacity across 8+ markets and hundreds of minor leagues introduces operational noise and dilution of modeling rigor on high-liquidity football lines.
- **Strategic Implication for SALMO/HandicapLab:** SALMO should not replicate ExPrysm's broad market catalog. Liquid betting syndicates and disciplined bettors prioritize depth in Asian Handicap and Goals lines over prop markets with low liquidity and high bookmaker margins.

---

## 3. STRICT TWO-LAYER ARCHITECTURAL BOUNDARY

```text
                  HANDICAPLAB.DEV
         DATA / RESEARCH / INFRASTRUCTURE
                      │
                      │ 1. Multi-Provider Ingestion (API-Football, OddsPapi)
                      │ 2. Canonical Identity & Entity Resolution
                      │ 3. Medallion Storage (Bronze / Silver / Gold)
                      │ 4. Dixon-Coles Bivariate Poisson Modeling
                      │ 5. Joint Score Grid Generation P(x, y)
                      │ 6. Sharp Reference Odds Devigging (Pinnacle)
                      │ 7. Mathematical Staking Calculations (Kelly)
                      │ 8. Point-in-Time Cryptographic Provenance (SHA-256)
                      │ 9. Deterministic Quarter-Line Settlement
                      │
                      ▼
                   SALMO.DEV
            DECISION / PRODUCT LAYER
                      │
                      │ 1. Consumer Decision Workflow (LAYAK / PANTAU / LEWATI)
                      │ 2. Line-Aware Presentation (AH, BTTS, O/U)
                      │ 3. User Risk & Bankroll Allocation UI
                      │ 4. Public Transparent Track Record Surface
                      │ 5. Entitlements & Subscription Monetization
                      │ 6. Multi-language (i18n) Consumer Experience
                      │
                      ▼
                 END CONSUMER
```

### Architectural Invariants
1. **Zero Mathematical Duplication:** SALMO must never implement Poisson solvers, bivariate solvers, or independent probability models. It consumes validated predictions via `DatabaseHandicapLabAdapter`.
2. **Zero Secondary Odds Pipelines:** SALMO must never query raw bookmakers directly or synthesize odds. All odds must originate from HandicapLab's governed ingestion.
3. **Fail-Closed State:** If HandicapLab canonical data is missing, SALMO renders explicit empty states (`ODDS_UNAVAILABLE` / `GREY`), never synthetic fallback data.

---

## 4. MARKET SCOPE RECONCILIATION: LINE FAMILIES OVER NARROW RESTRICTIONS

### 4.1 Asian Handicap Line Family
- Line family parameter: $L \in [-1.5, +1.5]$ in $0.25$ increments.
- Model output: Probabilities for full win, half win, push, half loss, full loss derived from $P(x, y)$.
- Settlement: Deterministic split settlement handled via `QuarterLineSettler` (SALMO) and `asianTotalEngine.ts` / `settlement.py` (HandicapLab).

### 4.2 Goals Over/Under Line Family
- Line family parameter: $T \in [1.0, 4.0]$ in $0.25$ increments.
- Model output: 1D distribution $P(\text{Total} = k) = \sum_{x+y=k} P(x, y)$ mapped across available market lines.
- Provider integration: The active line is determined by the market quote provided by sharp books (Pinnacle), not fixed at 2.5.
- Research finding: HandicapLab's `asianTotalEngine.ts` already contains the full mathematical formulation for lines $2.0, 2.25, 2.5, 2.75, 3.0, 3.25, 3.5, 3.75, 4.0$. The appearance of "O/U 2.5 only" in earlier audits was due to column constraints in free historical CSV files, not an architectural limitation of the model.

### 4.3 Both Teams To Score (BTTS)
- Binary market: `YES` / `NO`.
- Model output: Derived directly from the joint score grid $P(\text{BTTS Yes}) = \sum_{x \ge 1, y \ge 1} P(x, y)$.
- No independent model: Ensures complete mathematical consistency with team attacking and defensive intensities ($\lambda, \mu$).

---

## 5. RECONCILED CAPABILITY MATRIX

| Feature / Dimension | ExPrysm Status | HandicapLab Infrastructure | SALMO Product Layer | Architectural Gate Verdict |
| :--- | :--- | :--- | :--- | :--- |
| **Liquid Markets (AH, O/U, BTTS)**| Negative returns in core markets (-3.16% to -8.18% ROI) | Bivariate Poisson solver derives probabilities across line families | Gated decision verdicts (`LAYAK`, `PANTAU`, `LEWATI`) | **CORE PRODUCT MOAT** |
| **Secondary Prop Markets (Cards/Corners)**| Drives positive hybrid yield (+5.22% to +8.87% ROI) | None (Out of scope) | None | **OUT OF CURRENT PRODUCT SCOPE** |
| **1X2 / Moneyline** | Tracked (-10.04% ROI) | Modelable from grid | None | **OUT OF CURRENT PRODUCT SCOPE** |
| **Public Track Record** | Public `/performance.html` (13.7k picks) | `prediction_ledger_v3` with SHA-256 point-in-time hashes | Lacks public user-facing results page | **SALMO PRODUCT P0: BUILD `/track-record`** |
| **Bankroll Management** | Pro Calculator + Premium Daily Budget Plan | Mathematical Kelly, variance, and portfolio risk calculations | Needs user bankroll input modal & stake recommendations | **SALMO PRODUCT P1: BUILD BANKROLL UX** |
| **Closing Line Value (CLV)** | Tracked (+0.44% flat average) | `clvEngine.ts` written; closing odds ingestion pending | Suppressed until verified closing odds exist | **HANDICAPLAB INFRA P1: ACTIVATE CLOSING RUNNER** |
| **T-60 Pre-Match Snapshots** | Tracked (+0.03% delta, inconclusive) | Designed in EPIC 52 Stage C | Displays pre-match freeze timestamp | **HANDICAPLAB INFRA: KEEP SINGLE SNAPSHOT** |
| **In-Play / Live Second-Half** | Chatbot interface over live scores; zero models | None (polling unviable) | None | **DO NOT BUILD YET / FUTURE RESEARCH ONLY** |

---

## 6. STRATEGIC DECISION: DEPTH OVER BREADTH

ExPrysm demonstrates the operational hazard of expanding across 8+ markets and 650+ leagues: diluted model performance on liquid lines and reliance on volatile, easily-limited prop markets.

SALMO and HandicapLab will maintain an uncompromising focus on **Depth over Breadth**:
1. **Line-Aware Precision:** Extracting maximum value from whole, half, and quarter lines on AH and Totals.
2. **True Market Consensus:** Devigging sharp bookmaker prices (Pinnacle) to quantify verifiable mathematical edge.
3. **Cryptographic Provenance:** Unalterable SHA-256 pre-kickoff records establishing institutional trust.
4. **Actionable Decision Guidance:** Translating complex score distributions into disciplined consumer choices with explicit bankroll sizing.

