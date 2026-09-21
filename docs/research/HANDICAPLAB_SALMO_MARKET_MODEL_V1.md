# HANDICAPLAB × SALMO CANONICAL MARKET MODEL (V1)
**Document Version:** 1.0.0  
**Date:** September 21, 2026  
**Status:** Architectural Specification & Research Reference Baseline  
**Scope:** Three-Market Scope Definition, Common Generative Model Foundation, Line Families, Odds Normalization, Decision Gating, Settlement, Provenance, and Production Verification Matrix.

---

## 1. PRODUCT MARKET SCOPE

The product market scope for SALMO is strictly locked to three liquid football betting markets:

1. **Asian Handicap (AH):** Line family spanning $-1.5$ to $+1.5$ (whole, half, and quarter lines).
2. **Both Teams To Score (BTTS):** Binary market (`YES` / `NO`).
3. **Goals Over/Under (O/U):** Line family spanning $1.0$ to $4.0$ (whole, half, and quarter lines).

### Invariant & Scope Boundary
- All other markets (including **1X2 / Match Winner / Moneyline**, **Double Chance**, **Cards**, **Corners**, **Correct Score**, **Accumulators / Parlays**, and **Player Props**) are classified as **OUT OF CURRENT PRODUCT SCOPE**.
- The designation "OUT OF CURRENT PRODUCT SCOPE" reflects a deliberate strategic decision to prioritize depth, mathematical rigor, and market liquidity over retail breadth. It is not an assertion that other markets are mathematically invalid or permanently rejected.
- ExPrysm or other competitor offerings covering 8+ markets do not alter this lock. SALMO differentiates by building institutional-grade depth in the three liquid core markets.

---

## 2. COMMON MODEL FOUNDATION

SALMO and HandicapLab enforce a **single generative score distribution** as the common mathematical foundation for all three markets. No independent models are trained or executed per market or per line.

```text
                        MATCH & TEAM METRICS
                 (Attacking / Defending Strengths)
                                │
                                ▼
               DIXON-COLES BIVARIATE POISSON MODEL
                (Parameters: λ_home, μ_away, ρ)
                                │
                                ▼
                 JOINT SCORE DISTRIBUTION GRID
                     P(Home = x, Away = y)
                    for x, y ∈ {0, 1, ..., 10}
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
   ASIAN HANDICAP             BTTS               GOALS OVER/UNDER
    LINE FAMILY           (YES / NO)               LINE FAMILY
  (-1.5 to +1.5)                                  (1.0 to 4.0)
        │                       │                       │
        └───────────────────────┼───────────────────────┘
                                ▼
                    SHARP REFERENCE ODDS QUOTES
                     (Pinnacle / Devigged True)
                                │
                                ▼
                       EDGE & EXPECTED VALUE
               (Edge = P_model - P_devig, EV = P*b - 1)
                                │
                                ▼
                      DECISION POLICY GATES
                    (LAYAK / PANTAU / LEWATI)
                                │
                                ▼
                            SALMO UX
```

### Mathematical Invariants
1. **Grid Normalization:**
   $$\sum_{x=0}^{10} \sum_{y=0}^{10} P(X=x, Y=y) = 1.0 \pm 10^{-6}$$
2. **Low-Score Interaction Adjustment (Dixon-Coles):**
   $$\tau(x, y; \lambda, \mu, \rho) = \begin{cases} 
   1 - \lambda \mu \rho & \text{if } x = 0, y = 0 \\
   1 + \lambda \rho & \text{if } x = 0, y = 1 \\
   1 + \mu \rho & \text{if } x = 1, y = 0 \\
   1 - \rho & \text{if } x = 1, y = 1 \\
   1 & \text{otherwise}
   \end{cases}$$
   $$P(X=x, Y=y) = \tau(x, y) \cdot \frac{\lambda^x e^{-\lambda}}{x!} \cdot \frac{\mu^y e^{-\mu}}{y!}$$

---

## 3. ASIAN HANDICAP LINE FAMILY

Asian Handicap is modeled as a continuous line family, parameterized by the handicap line $L \in [-1.5, +1.5]$ in increments of $0.25$.

### Line Taxonomy
- **Whole Lines ($L \in \{\dots, -1.0, 0.0, +1.0, \dots\}$):** Settle with exact Push when goal difference equals the line.
- **Half Lines ($L \in \{\dots, -0.5, +0.5, \dots\}$):** Binary outcomes (Win / Loss); no push possible.
- **Quarter Lines ($L \in \{\dots, -0.75, -0.25, +0.25, +0.75, \dots\}$):** Split stakes 50/50 between the two adjacent half/whole lines:
  $$L_{\text{lower}} = L - 0.25, \quad L_{\text{upper}} = L + 0.25$$

### Derivation from Joint Score Grid
For a given line $L$ from the Home team perspective (where Home covers if $x - y + L > 0$):
- **Full Win Probability:**
  $$P(\text{Full Win}) = \sum_{x - y > -L} P(x, y)$$
- **Push Probability (Whole Line only):**
  $$P(\text{Push}) = \begin{cases} \sum_{x - y = -L} P(x, y) & \text{if } L \in \mathbb{Z} \\ 0 & \text{otherwise} \end{cases}$$
- **Quarter-Line Split Probabilities:**
  For $L = -0.25$ (split between $0.0$ and $-0.5$):
  - $P(\text{Full Win}) = \sum_{x - y \ge 1} P(x, y)$
  - $P(\text{Half Loss}) = \sum_{x - y = 0} P(x, y)$ (0.0 pushes, -0.5 loses)
  - $P(\text{Full Loss}) = \sum_{x - y \le -1} P(x, y)$

---

## 4. GOALS OVER/UNDER LINE FAMILY

Goals Over/Under is a continuous line family, parameterized by the total goals line $T \in [1.0, 4.0]$ in increments of $0.25$. It is **not** restricted to 2.5 goals only.

### 1D Total Goals Distribution Derivation
From the 2D joint score grid $P(x, y)$, the 1D total goals distribution $P(T = k)$ is derived:
$$P(\text{Total} = k) = \sum_{\substack{x, y \ge 0 \\ x + y = k}} P(x, y), \quad \text{for } k \in \{0, 1, \dots, 20\}$$
$$\sum_{k=0}^{20} P(\text{Total} = k) = 1.0 \pm 10^{-6}$$

### Settlement Outcome Probabilities per Line
For any total line $T$ and selection $\text{Side} \in \{\text{OVER}, \text{UNDER}\}$:

1. **Whole Line (e.g. 2.0, 3.0, 4.0):**
   - $P(\text{Win}_{\text{Over}}) = \sum_{k > T} P(\text{Total} = k)$
   - $P(\text{Push}) = P(\text{Total} = T)$
   - $P(\text{Loss}_{\text{Over}}) = \sum_{k < T} P(\text{Total} = k)$

2. **Half Line (e.g. 1.5, 2.5, 3.5):**
   - $P(\text{Win}_{\text{Over}}) = \sum_{k > T} P(\text{Total} = k)$
   - $P(\text{Push}) = 0$
   - $P(\text{Loss}_{\text{Over}}) = \sum_{k < T} P(\text{Total} = k)$

3. **Quarter Line .25 (e.g. 2.25, 3.25):**
   Split 50/50 between Whole Line ($T - 0.25$) and Half Line ($T + 0.25$).
   - Over: Win if $k \ge T + 0.75$; Half Loss if $k = T - 0.25$; Full Loss if $k < T - 0.25$.
   - Under: Win if $k < T - 0.25$; Half Win if $k = T - 0.25$; Full Loss if $k \ge T + 0.75$.

4. **Quarter Line .75 (e.g. 1.75, 2.75):**
   Split 50/50 between Half Line ($T - 0.25$) and Whole Line ($T + 0.25$).
   - Over: Win if $k > T + 0.25$; Half Win if $k = T + 0.25$; Full Loss if $k \le T - 0.25$.
   - Under: Win if $k \le T - 0.25$; Half Loss if $k = T + 0.25$; Full Loss if $k > T + 0.25$.

---

## 5. BOTH TEAMS TO SCORE (BTTS)

BTTS evaluates whether both teams score at least one goal in the match.

### Derivation from Joint Score Grid
$$P(\text{BTTS YES}) = \sum_{x=1}^{10} \sum_{y=1}^{10} P(X=x, Y=y)$$
Equivalently, via the complement:
$$P(\text{BTTS NO}) = \sum_{x=0}^{10} P(X=x, Y=0) + \sum_{y=0}^{10} P(X=0, Y=y) - P(X=0, Y=0)$$
$$P(\text{BTTS YES}) = 1 - P(\text{BTTS NO})$$

This formulation guarantees exact coherence between the team scoring rate parameters ($\lambda, \mu$), the joint score distribution, and the BTTS probability.

---

## 6. ODDS MAPPING

Market odds ingestion and mapping are strictly governed by HandicapLab:

1. **Sharp Reference Standard:** Pinnacle is the primary reference bookmaker. Secondary sharp books include Singbet, SBOBet, and Betfair Exchange.
2. **Retail Providers:** Odds from retail soft books (Bet365, etc.) are ingested for user execution comparison only, never for fair value modeling.
3. **Point-in-Time Capture:** Every odds quote recorded in the canonical pipeline contains:
   - `bookmaker`: Canonical string (e.g., `"Pinnacle"`).
   - `captured_at_utc`: ISO 8601 UTC timestamp of quote ingestion.
   - `line`: Specific market line (e.g. `-0.25`, `2.75`).
   - `odds_home` / `odds_over` / `odds_yes`: Decimal odds $\ge 1.01$.
   - `odds_away` / `odds_under` / `odds_no`: Decimal odds $\ge 1.01$.
4. **Devigging Engine:** Two-way multiplicative margin removal establishes true bookmaker consensus probabilities:
   $$\text{Margin } M = \frac{1}{O_1} + \frac{1}{O_2} - 1$$
   $$P_{\text{devig}, 1} = \frac{1 / O_1}{1 + M}, \quad P_{\text{devig}, 2} = \frac{1 / O_2}{1 + M}$$

---

## 7. FAIR ODDS

Fair odds ($O_{\text{fair}}$) represent the break-even decimal price implied purely by the quantitative model probability $P_{\text{model}} \in (0, 1)$:

$$O_{\text{fair}} = \frac{1}{P_{\text{model}}}$$

### Multi-Outcome Fair Odds (Quarter Lines)
For quarter lines with push and half-win/half-loss outcomes, binary fair odds are supplemented with the expected return formula:
$$\mathbb{E}[R] = P(\text{Full Win}) \cdot (O - 1) + P(\text{Half Win}) \cdot \frac{O - 1}{2} - P(\text{Half Loss}) \cdot 0.5 - P(\text{Full Loss}) \cdot 1.0 = 0$$
Solving for $O_{\text{fair, cover}}$:
$$O_{\text{fair, cover}} = 1 + \frac{P(\text{Full Loss}) + 0.5 \cdot P(\text{Half Loss})}{P(\text{Full Win}) + 0.5 \cdot P(\text{Half Win})}$$

---

## 8. EDGE & EXPECTED VALUE

### Mathematical Edge (Percentage Points)
Edge quantifies the model's advantage relative to the devigged market consensus:
$$\text{Edge}_{\text{pp}} = (P_{\text{model}} - P_{\text{devig}}) \times 100\%$$

### Expected Value (EV %)
Expected value is calculated per unit stake against available market decimal odds $O_{\text{market}}$:
$$\text{EV}_{\%} = (P_{\text{model}} \times O_{\text{market}} - 1) \times 100\%$$

---

## 9. DECISION GATING & VERDICTS

SALMO converts quantitative model outputs into consumer decision verdicts using deterministic decision gates:

| Verdict Badge | Decision Status | Gating Criteria | Action / Interpretation |
| :--- | :--- | :--- | :--- |
| **GREEN** | `VALUE` / `LAYAK` | $\text{Edge} \ge +3.0\%$, $\text{EV} \ge +5.0\%$, Robustness $\ge 70$, Market Odds Available | Actionable value pick meeting all statistical qualification criteria. |
| **YELLOW** | `MARGINAL` / `PANTAU` | $\text{Edge} > 0.0\%$, $\text{EV} > 0.0\%$, Robustness $40\text{--}69$, Market Odds Available | Positive expectation but marginal margin of safety; watch for line movement. |
| **RED** | `NO_VALUE` / `LEWATI` | $\text{Edge} \le 0.0\%$ OR $\text{EV} \le 0.0\%$ | Negative mathematical expectation; strictly skipped. |
| **GREY** | `ODDS_UNAVAILABLE` | Real bookmaker odds not published or stale ($T > 12\text{h}$) | Fail-closed state; no synthetic fallback allowed. |

---

## 10. QUARTER-LINE SETTLEMENT

Settlement correctness is an immutable requirement. SALMO and HandicapLab implement deterministic split settlement:

| Outcome Code | Nominal Margin | P&L per Unit Stake ($S = 1$) | Return ($R$) |
| :--- | :--- | :--- | :--- |
| **`WIN`** | Covered by $\ge 0.5$ goals | $+(O - 1)$ | $O$ |
| **`HALF_WIN`** | Covered by $0.25$ goals (split with Push) | $+0.5 \times (O - 1)$ | $1 + 0.5 \times (O - 1)$ |
| **`PUSH`** | Margin equals line | $0.00$ | $1.00$ |
| **`HALF_LOSS`** | Missed by $0.25$ goals (split with Push) | $-0.50$ | $0.50$ |
| **`LOSS`** | Missed by $\ge 0.5$ goals | $-1.00$ | $0.00$ |
| **`VOID`** | Match abandoned or cancelled | $0.00$ | $1.00$ |

---

## 11. PROVENANCE & IMMUTABILITY

Every prediction published to the consumer layer must be cryptographically immutable:

1. **Point-in-Time Freeze:** Predictions are committed to `prediction_ledger_v3` at timestamp $T_{\text{freeze}} \le T_{\text{kickoff}} - 60\text{m}$.
2. **SHA-256 Checksum:** Generated over the canonical tuple:
   $$\text{Hash} = \text{SHA-256}(\text{match\_id} \parallel \text{kickoff\_utc} \parallel \text{market} \parallel \text{line} \parallel P_{\text{model}} \parallel O_{\text{market}} \parallel T_{\text{freeze}})$$
3. **No Retroactive Updates:** Once written, probability, line, and odds records cannot be modified. Settlement only updates settlement fields (`outcome`, `pnl`, `settled_at_utc`).

---

## 12. CLOSING LINE VALUE (CLV)

### Definition
Closing Line Value measures the ratio of the bet price taken to the closing devigged market price:
$$\text{CLV} = \frac{O_{\text{taken}}}{O_{\text{closing, devig}}} - 1$$
Or in probability terms:
$$\text{CLV}_{\text{prob}} = P_{\text{closing, devig}} - P_{\text{implied, taken}}$$

### Implementation & Verification Status
- **Analytical Engine:** `clvEngine.ts` is implemented in HandicapLab research libraries.
- **Closing Odds Data:** Ingestion runner for final pre-kickoff sharp odds snapshots is pending activation.
- **Production Status:** **NOT CURRENTLY PRODUCTION-VERIFIED.** SALMO will not display CLV metrics on user interfaces until closing odds ingestion is actively populated and verified across $\ge 1,000$ settled bets.

---

## 13. CURRENT IMPLEMENTATION STATUS

| Component | Repository Location | Status | Implementation Details |
| :--- | :--- | :--- | :--- |
| **Bivariate Poisson Solver** | `HandicapLab/.../dixonColes.ts` | Complete | Computes joint grid $P(x, y)$ for $x, y \in [0, 10]$. |
| **Asian Total Engine** | `HandicapLab/.../asianTotalEngine.ts` | Complete | Derives total distribution $P(T=k)$ and calculates probabilities for lines $2.0$ to $4.0$. |
| **Quarter-Line Settler (AH)** | `SALMO/src/engine/ah/quarterLineSettler.ts` | Complete | Deterministic split settlement for arbitrary quarter-lines. |
| **Devigging Engine** | `SALMO/src/engine/devigEngine.ts` | Complete | Multiplicative margin removal for 2-way markets. |
| **Decision Policy Engine** | `SALMO/src/engine/decisionPolicy.ts` | Complete | Gating for GREEN, YELLOW, RED, GREY verdicts. |
| **Database Adapter** | `SALMO/src/contracts/handicapLabAdapter.ts` | Complete | Maps `daily_picks` from Supabase to SALMO DTOs. |
| **Match Intelligence Service**| `SALMO/src/engine/matchIntelligenceService.ts` | Complete | Line-aware presentation of AH, BTTS, and OU. |

---

## 14. GAPS & MISSING IMPLEMENTATION

1. **HandicapLab Ingestion of Variable Totals:** Historical CSV parser in `handicapLabAdapter.ts` only extracts `P>2.5` / `P<2.5` columns due to Football-Data.co.uk free schema limitations. Provider ingestion must be upgraded to query OddsPapi variable total endpoints (1.5, 2.0, 2.25, 2.75, 3.0, 3.5).
2. **Total Goals Quarter-Line Settlement in Pipeline:** `settlement.py` in HandicapLab handles whole and half totals, but does not yet contain quarter-line split logic for totals (unlike `asianTotalEngine.ts` which does).
3. **BTTS Settlement Function in Python Pipeline:** `settlement.py` lacks an explicit `settle_btts(fthg, ftag, prediction)` function.
4. **Public Track Record Page:** SALMO lacks a public `/results` or `/track-record` page exposing `prediction_ledger_v3`.
5. **Closing Odds Collection Runner:** Scheduled T-0 closing odds snapshot runner is not yet running in production cron.

---

## 15. PRODUCTION VERIFICATION MATRIX

| Market & Line | Model Derivable | Data Available | Odds Available | Settlement Supported | UI Supported | Production Verified |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **AH -1.5 to +1.5** | YES | YES | YES | YES | YES | **VERIFIED** |
| **BTTS (Yes/No)** | YES | YES | YES | YES | YES | **PROVISIONAL** (ROI CI crosses 0) |
| **O/U 2.5** | YES | YES | YES | YES | YES | **VERIFIED** |
| **O/U 2.0, 3.0 (Whole)**| YES | PARTIAL | PARTIAL | YES | YES | **INFRASTRUCTURE READY** |
| **O/U 2.25, 2.75 (Qtr)**| YES | PARTIAL | PARTIAL | YES | YES | **INFRASTRUCTURE READY** |
| **O/U 1.5, 3.5 (Half)** | YES | PARTIAL | PARTIAL | YES | YES | **INFRASTRUCTURE READY** |

*Note: "Infrastructure Ready" indicates mathematical derivation and TypeScript engines are implemented, but real-time multi-line odds ingestion is pending provider configuration.*

---

## 16. FUTURE RESEARCH

1. **Dynamic In-Play Hazard Modeling:** Continuous-time Poisson hazard rates for live second-half predictions. Strictly gated behind data cost and quota viability research.
2. **Lineup Urgency Decay:** Quantifying whether T-60 lineup releases alter edge in European secondary leagues beyond the observed $+0.03\%$ delta.
3. **Multi-Book Execution Routing:** Quantifying slippage and best execution across Pinnacle vs. Singbet vs. SBOBet without altering canonical fair odds models.
4. **Market Quality Score (MQS) Filtering:** Machine-learning detection of illiquid or manipulated betting lines prior to decision gating.

