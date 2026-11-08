# SALMO.DEV — FREE-TIER EXECUTIVE DECISION & PRODUCTION READINESS REVIEW

**Audit Date:** 2026-11-08T23:59:59+07:00 (Asia/Jakarta)  
**Evaluators:** Executive Leadership, Principal Systems Architect & Head of Quantitative Strategy  
**Positioning Statement:**  
> **"Fewer Markets. Better Evidence. Every Prediction Accounted For."**

**Final Executive Gate Determination:**  
* **Production Deployment:** **BLOCKED (Gate 0 Safety Mandate Active)**  
* **Local Shadow Operation:** **PASS & FULLY CERTIFIED (LOCAL HARNESS & TESTS)**  
* **Live Provider Ingestion:** **NOT VERIFIED (No live API key provisioned)**  
* **Monetization Gate:** **MONETIZATION_ENABLED = false (Preserved)**

---

## 1. Executive Strategic Synthesis

This executive decision establishes the definitive operational posture of Salmo.dev following the pre-commit forensic audit and reconciliation of the free-tier provider integration.

### 1.1 Competitive Positioning vs ExPrysm
1. **Infrastructure Credits vs Durable Unit Economics:** ExPrysm's access to startup cloud credits represents temporary infrastructure sponsorship, not structural cost efficiency or algorithmic superiority. Salmo does not need to compete on cloud credit burn.
2. **Honesty Over Marketing Hype:** Salmo rejects claiming to be "more accurate" before mathematical proof exists. An immutable public ledger, verifiable CLV, and an unalterable track record are Salmo's primary evidence of edge.
3. **Discipline Over Breadth:** Salmo will not chase 650+ obscure leagues or 12+ noisy betting markets. By focusing on four core markets (Asian Handicap, Moneyline, Over/Under, BTTS) and top-tier competitions with genuine liquidity, Salmo delivers institutional-grade market intelligence.

---

## 2. Executive Phase-by-Phase Scorecard (Reconciled)

| Phase | Description | Deliverable Artifact | Status | Gate Decision |
| :---: | :--- | :--- | :---: | :---: |
| **Phase 0** | Repository & Production Baseline | `FIVEDOLLAR_GATE0_CURRENT_STATE_RECONCILIATION.md` | **BLOCKED** | Production mutation prohibited |
| **Phase 1** | Provider Capability Audit | `SALMO_FREE_PROVIDER_CAPABILITY_AUDIT.md` | **PARTIAL** | API-Football blocked; 5Dollar live NOT VERIFIED |
| **Phase 2** | Quota-Aware Orchestration | `SALMO_FREE_QUOTA_ORCHESTRATION_REPORT.md` | **PASS** | 42 req/hr budget test-certified |
| **Phase 3** | Canonical Entity Normalization | `SALMO_FREE_CANONICAL_MAPPING_AUDIT.md` | **PASS** | Zero-ambiguity mapping certified |
| **Phase 4** | Four-Market Model Readiness | `SALMO_FOUR_MARKET_READINESS_REPORT.md` | **PARTIAL** | AH/OU: PASS; ML/BTTS: RESEARCH ONLY |
| **Phase 5** | Daily Prediction Engine | `SALMO_DAILY_PREDICTION_AUDIT.md` | **PASS** | Zero upcoming picks; zero fabrication |
| **Phase 6** | Immutable Prediction Ledger | `SALMO_IMMUTABLE_LEDGER_AUDIT.md` | **PASS** | Cryptographic audit trail certified |
| **Phase 7** | Settlement & Performance Engine | `SALMO_SETTLEMENT_PERFORMANCE_REPORT.md` | **PASS** | Reconciled: 1 settled loss (-1.0u), N=1 INCONCLUSIVE |
| **Phase 8** | Closing Line Value (CLV) Engine | `SALMO_CLV_VALIDATION_REPORT.md` | **PASS** | Bet365 same-line CLV certified |
| **Phase 9** | Daily Operating Reporting | `SALMO_DAILY_OPERATIONS_REPORT.md` | **PASS** | Complete 7-section daily reporting certified |
| **Phase 10** | Monetization & Production Gate | `SALMO_FREE_TIER_EXECUTIVE_DECISION.md` | **BLOCKED** | Monetization disabled; Shadow active |

---

## 3. Four Core Operational Decisions

### Decision 1: API-Football Posture
* **Rule:** Access remains strictly **BLOCKED**. Zero outbound calls directed to API-Sports servers.
* **Condition for Reinstatement:** Formal resolution of support ticket submitted on Nov 7, 2026 (`API_FOOTBALL_SUPPORT_ESCALATION_DRAFT.md`), restoring Free tier access (100 req/day).

### Decision 2: 5Dollar Free Tier as Primary Shadow Provider
* **Rule:** 5Dollar Free serves as the shadow provider for Bet365 odds.
* **Verification Status:** Adapter, rate limits, and schemas are test-certified. Live network ingestion is marked **NOT VERIFIED** until an authorized API key is added to `.env.local`.
* **Endpoint Discipline:** Enforce per-fixture odds queries (`GET /fixtures/{id}/odds`). Mandatory attribution *"Football data by 5DollarFootballAPI"* is permanently enforced.

### Decision 3: Market Tier Segregation & Research Quarantine
* **Asian Handicap (AH):** Operational Core Candidate Prediction (Prioritas 1).
* **Over/Under Goals (OU):** Operational Core Candidate Prediction (Prioritas 3).
* **Moneyline (1X2):** Quarantined to Research & Model Validation (Prioritas 2).
* **Both Teams To Score (BTTS):** Quarantined to **RESEARCH_ONLY** (Prioritas 4).

### Decision 4: Daily Operating Rigor & Monetization Freeze
* **Monetization Status:** Strictly maintained at `MONETIZATION_ENABLED = false`.
* **Discipline:** Producing zero picks on days without a clear mathematical edge ($+2.0\%$ EV and 65 confidence) is an explicit mark of quality.
* **Ledger Invariant:** Every prediction generated is immutably recorded in the shadow ledger.

---

## 4. Final Executive Gate Decision

```
========================================================================================
SALMO.DEV EXECUTIVE DECISION GATE
========================================================================================
GATE 0 PRODUCTION DEPLOYMENT:      BLOCKED (Pre-existing safety blockers active)
5DOLLAR FREE SHADOW OPERATION:     CERTIFIED & READY (LOCAL HARNESS & TESTS)
5DOLLAR LIVE NETWORK CALLS:        NOT VERIFIED (No live API key provisioned)
API-FOOTBALL STATUS:               BLOCKED (Awaiting support ticket resolution)
CORE MARKETS (AH & OU):            CERTIFIED FOR CANDIDATE PREDICTION
QUARANTINED MARKETS (1X2 & BTTS):  STRICTLY RESEARCH-ONLY
QUALIFIED PERFORMANCE RESULT:      INCONCLUSIVE (N = 1, Net -1.0 unit loss)
MONETIZATION STATUS:               DISABLED (MONETIZATION_ENABLED = false)
========================================================================================
```

**Final Order:**  
The engineering team is authorized to commit the isolated shadow integration and reconciled documentation to local Git. Zero modifications to production files, routes, or databases are permitted. No push or deployment is authorized.
