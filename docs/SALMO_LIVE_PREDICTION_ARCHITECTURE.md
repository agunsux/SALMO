# SALMO.DEV — Live Prediction Engine Architecture

## 1. Executive Summary

This architecture defines the end-to-end live football prediction pipeline powering **SALMO.DEV** using the authoritative quantitative modeling engine in **HandicapLab**.

The system strictly adheres to the core product philosophy:
> **Real data + real odds + coherent probability model + transparent prediction history + excellent UX + only three markets.**

Moneyline / 1X2 is **permanently OUT OF SCOPE**.

The platform is strictly locked to three markets:
1. **Asian Handicap (AH)**
2. **Both Teams To Score (BTTS)**
3. **Over/Under Goals (OU 2.5)**

---

## 2. System Authority & Separation of Concerns

```
+-----------------------------------------------------------------------------------+
| HANDICAPLAB (Authoritative Prediction & Research Engine)                          |
|                                                                                   |
|  [API-Football PRO]  [OddsPapi v4 / Pinnacle]  [FootyStats API]                   |
|           |                    |                     |                            |
|           v                    v                     v                            |
|  +-------------------------------------------------------------+                  |
|  | Multi-Provider Gateway & Canonical Fixture Reconciler       |                  |
|  +-------------------------------------------------------------+                  |
|                                |                                                  |
|                                v                                                  |
|  +-------------------------------------------------------------+                  |
|  | Dixon-Coles (1997) Bivariate Poisson Poisson Score Engine   |                  |
|  | lambda_home, mu_away, rho correlation correction            |                  |
|  +-------------------------------------------------------------+                  |
|                                |                                                  |
|                                v                                                  |
|  +-------------------------------------------------------------+                  |
|  | Market Derivation Engine (AH Quarter-Line, OU 2.5, BTTS)   |                  |
|  | Sharp Multiplicative Devigging & Edge Calculation          |                  |
|  +-------------------------------------------------------------+                  |
|                                |                                                  |
|                                v                                                  |
|  +-------------------------------------------------------------+                  |
|  | Walk-Forward Cross-Validation (11 Seasons, 4,180 Matches)   |                  |
|  | 1,000-Resample Bootstrap 95% Confidence Intervals           |                  |
|  +-------------------------------------------------------------+                  |
|                                |                                                  |
|                                v                                                  |
|  +-------------------------------------------------------------+                  |
|  | Immutable Prediction Ledger (data/verification/*.jsonl)     |                  |
|  +-------------------------------------------------------------+                  |
+-----------------------------------------------------------------------------------+
                                 |
                                 | JSON Contracts / REST Boundary
                                 v
+-----------------------------------------------------------------------------------+
| SALMO.DEV (Consumer Product & Presentation Layer)                                 |
|                                                                                   |
|  +-------------------------------------------------------------+                  |
|  | HandicapLab Adapter (Local / HTTP / Database)               |                  |
|  +-------------------------------------------------------------+                  |
|                                |                                                  |
|                                v                                                  |
|  +-------------------------------------------------------------+                  |
|  | Match Intelligence Service & API Endpoints                  |                  |
|  | /api/matches  |  /api/v1/predictions                        |                  |
|  +-------------------------------------------------------------+                  |
|                                |                                                  |
|                                v                                                  |
|  +-------------------------------------------------------------+                  |
|  | ExPrysm-Grade Consumer Dashboard                            |                  |
|  | Horizon Tabs (7D, T-6h, T-24h, T-48h)                       |                  |
|  | Market Filter (ALL, AH, BTTS, OU)                           |                  |
|  | Mathematical Trace, Devig Probability, Honest Badging       |                  |
|  +-------------------------------------------------------------+                  |
+-----------------------------------------------------------------------------------+
```

### Invariants:
1. **HandicapLab is the Authoritative Engine**: HandicapLab owns data ingestion, quota management, canonical fixture reconciliation, feature generation, Dixon-Coles goal modeling, market probability derivation, walk-forward validation, and the immutable prediction ledger.
2. **SALMO is Strictly the Consumer Experience**: SALMO owns presentation, responsive UI, i18n localization, multi-horizon exploration, transparency drawers, and calculation traces. SALMO never generates synthetic odds or fabricates probabilities.
3. **Decoupled Boundary**: Communication between SALMO and HandicapLab is strictly through typed contracts (`IHandicapLabAdapter`), supporting local filesystem verification, HTTP microservice, or PostgreSQL database.

---

## 3. Data Providers & Roles

| Provider | Subscription / Tier | Role | Invariants Enforced |
| :--- | :--- | :--- | :--- |
| **API-Football** | PRO (7,500 req/day) | Football-state provider: upcoming fixtures, lineups, venue, referee, kickoff timestamps | Fixture discovery, kickoff timestamp anchoring |
| **OddsPapi v4** | Production API (`v4`) | Market benchmark provider: live sharp Pinnacle closing/pre-match odds for AH, OU, BTTS | Pinnacle is mandatory market reference; strictly NO synthetic odds |
| **FootyStats** | Production API (1,800 req/hr) | Feature enrichment: team form, rolling xG, home/away attack and defense ratings | Point-in-time state snapshotting |

---

## 4. Multi-Horizon Prediction Pipeline

Predictions are tracked across distinct temporal horizons:

```
[T-72h Early Line] ----> [T-24h Day Prior] ----> [T-6h Matchday] ----> [T-15m Lineups Closing]
        |                        |                     |                       |
   Opening quote           Market liquidity       Team injury news        Sharp closing line
   captured & saved        updated               incorporated            anchored for CLV
```

### Point-in-Time Anti-Leakage Guard
For every prediction row in the immutable ledger:
$$\text{predictionTimestamp} < \text{kickoffUtc}$$
$$\text{marketStateTimestamp} \le \text{predictionTimestamp}$$
$$\text{footballStateTimestamp} \le \text{predictionTimestamp}$$

Any pipeline run where a prediction timestamp equals or exceeds kickoff is rejected by automated invariants.

---

## 5. Mathematical Models & Market Derivation

### 5.1 Dixon-Coles Goal Grid
The underlying bivariate score distribution $P(X=x, Y=y)$ is evaluated up to $x, y \in \{0, \dots, 10\}$ using:
$$P(X=x, Y=y) = \tau(x, y, \lambda, \mu, \rho) \cdot \frac{e^{-\lambda} \lambda^x}{x!} \cdot \frac{e^{-\mu} \mu^y}{y!}$$

Where $\tau$ is the low-score correlation adjustment factor:
$$\tau(x, y) = \begin{cases}
1 - \lambda \mu \rho & x=0, y=0 \\
1 + \lambda \rho & x=0, y=1 \\
1 + \mu \rho & x=1, y=0 \\
1 - \rho & x=1, y=1 \\
1 & \text{otherwise}
\end{cases}$$

### 5.2 Market Derivations
1. **Asian Handicap (Quarter-Line)**:
   $$P(\text{Home Cover}) = \sum_{x, y} P(X=x, Y=y) \cdot w(x - y, L)$$
   where $w$ evaluates exact split-line weights ($1.0$ for win, $0.5$ for half-win, $0.0$ for push, $-0.5$ for half-loss, $-1.0$ for loss).
2. **Over / Under 2.5 Goals**:
   $$P(\text{Over 2.5}) = \sum_{x + y > 2.5} P(X=x, Y=y) = 1 - \sum_{x+y \le 2} P(X=x, Y=y)$$
3. **Both Teams To Score (BTTS)**:
   $$P(\text{BTTS YES}) = \sum_{x \ge 1, y \ge 1} P(X=x, Y=y) = 1 - P(X=0) - P(Y=0) + P(X=0, Y=0)$$

### 5.3 Multiplicative Devigging
Sharp Pinnacle quotes $(O_A, O_B)$ are devigged by normalizing implied probabilities:
$$P_{\text{raw}}(A) = \frac{1}{O_A}, \quad P_{\text{raw}}(B) = \frac{1}{O_B}, \quad \text{Overround } S = P_{\text{raw}}(A) + P_{\text{raw}}(B)$$
$$P_{\text{devig}}(A) = \frac{P_{\text{raw}}(A)}{S}, \quad P_{\text{devig}}(B) = \frac{P_{\text{raw}}(B)}{S}$$

$$\text{Edge} = P_{\text{model}} - P_{\text{devig}}, \quad \text{EV} = (P_{\text{model}} \cdot O_A) - 1$$

---

## 6. Zero Fabrication & Honest Transparency

If edge $\le 0$ or Expected Value $\le 0$, the engine **never fabricates positive numbers**. The user interface truthfully renders:
- Badge: `RED` / `GREY`
- Label: `NEGATIVE EV` / `NO SIGNAL`
- Reason: Exact delta between devigged sharp probability and model probability.
- Walk-forward validation metrics: ROI, 95% Bootstrap CI, and CLV.

