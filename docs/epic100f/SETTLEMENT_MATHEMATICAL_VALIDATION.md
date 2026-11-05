# SETTLEMENT MATHEMATICAL VALIDATION & INDEPENDENT REFERENCE SUITE

**Document Identifier**: `docs/epic100f/SETTLEMENT_MATHEMATICAL_VALIDATION.md`  
**Parent Epic**: EPIC 100F — Production Parity, Adversarial Audit & Live Data Readiness  
**Authors**: Astra / DeepMind Advanced Agentic Coding Pair  
**Status**: COMPLETE / VERIFIED  
**Production Status**: STRICTLY NO-GO  

---

## 1. Executive Summary

Asian Handicap (AH) and Over/Under (OU) quarter-line betting (e.g., `-0.25`, `+0.75`, `2.25`, `2.75`) are compound bets constructed from two equal half-stakes placed on adjacent whole or half lines.

During the adversarial mathematical audit in EPIC 100F, an independent mathematical oracle (`tests/epic100f_settlement_mathematics_reference.test.js`) was constructed from first principles, completely decoupled from `SettlementRepository` and `QuarterLineSettler`.

This independent audit uncovered a **critical sign inversion defect** in `SettlementRepository.calculateAhSettlement`:
- When calculating away side handicap settlements, the codebase computed:
  $$\Delta_{\text{away}} = (\text{awayGoals} - \text{homeGoals}) - \text{line} \quad \text{[DEFECTIVE]}$$
  instead of:
  $$\Delta_{\text{away}} = (\text{awayGoals} - \text{homeGoals}) + \text{line} \quad \text{[CORRECT]}$$
- For example, an Away $+0.50$ bet on a $1 - 1$ draw yielded:
  $$(1 - 1) - (+0.50) = -0.50 < -0.25 \implies \text{LOSS} \quad \text{[FALSE LOSS!]}$$
  whereas in reality, an away team with a $+0.5$ head start in a $1 - 1$ draw covers the spread ($1.5 > 1.0$) and wins in full ($+0.95$ profit)!

This document formalizes the mathematical definition of quarter-line split mechanics, documents the correction, and records the 27-case verification matrix.

---

## 2. First-Principles Mathematical Specification

A quarter-line bet of stake $S$ on line $L = K \pm 0.25$ splits into two independent half-stakes of $S/2$:
- **Sub-bet 1**: placed on whole/half line $L_1 = L - 0.25$
- **Sub-bet 2**: placed on whole/half line $L_2 = L + 0.25$

### 2.1 Asian Handicap Formulation

Let $G_H$ be home goals, $G_A$ be away goals, and $L$ be the handicap awarded to the chosen side.
The goal differential for the chosen side is:
$$\Delta = \begin{cases} (G_H - G_A) + L & \text{if Home} \\ (G_A - G_H) + L & \text{if Away} \end{cases}$$

The settlement outcome maps deterministically from $\Delta$:
$$\text{Outcome}(\Delta) = \begin{cases}
\text{WIN} & \text{if } \Delta > +0.25 \implies \text{Profit} = S \times (\text{odds} - 1.0) \\
\text{HALF\_WIN} & \text{if } \Delta = +0.25 \implies \text{Profit} = \dfrac{S}{2} \times (\text{odds} - 1.0) \\
\text{PUSH} & \text{if } \Delta = 0.00 \implies \text{Profit} = 0.00 \\
\text{HALF\_LOSS} & \text{if } \Delta = -0.25 \implies \text{Profit} = -\dfrac{S}{2} = -0.50 \\
\text{LOSS} & \text{if } \Delta < -0.25 \implies \text{Profit} = -S = -1.00
\end{cases}$$

### 2.2 Over/Under Formulation

Let $T = G_H + G_A$ be the total match goals, and $L$ be the total line.
The goal differential is:
$$\Delta = \begin{cases} T - L & \text{if Over} \\ L - T & \text{if Under} \end{cases}$$

The mapping to outcome and profit is identical to the Asian Handicap formulation above.

---

## 3. The Away Handicap Defect and Resolution

### 3.1 Defect Details

In `src/repositories/settlementRepository.ts`, line 29:
```typescript
// DEFECTIVE IMPLEMENTATION:
const diff = side === 'home'
  ? (homeGoals - awayGoals) + line
  : (awayGoals - homeGoals) - line;
```

When an away team has a positive handicap (e.g., $L = +0.50$):
- Actual goal difference: $G_A - G_H = 1 - 1 = 0$
- With $+0.50$ handicap, effective score is $1.5$ vs $1.0$, which is $+0.50 > 0$.
- But the code evaluated: $(1 - 1) - (+0.50) = -0.50$, triggering `Full Loss: diff -0.5 < -0.25`.
- This inverted every positive away handicap into a loss!

### 3.2 Resolution Applied

In `src/repositories/settlementRepository.ts`:
```typescript
// CORRECTED CANONICAL FORMULA:
const diff = side === 'home'
  ? (homeGoals - awayGoals) + line
  : (awayGoals - homeGoals) + line;
```
Now, for Away $+0.50$ on a $1 - 1$ draw:
$$\Delta = (1 - 1) + (+0.50) = +0.50 > 0.25 \implies \text{WIN} \quad [\checkmark]$$

---

## 4. The 27-Case Mathematical Reference Test Matrix

Implemented in `tests/epic100f_settlement_mathematics_reference.test.js`:

| Case | Side | Line | Home Goals | Away Goals | $\Delta$ | Reference Outcome | Expected Profit (Odds 2.00) | Code Outcome | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | Home | -0.25 | 2 | 1 | +0.75 | WIN | +1.0000 | WIN | PASS |
| 2 | Home | -0.25 | 1 | 1 | -0.25 | HALF_LOSS | -0.5000 | HALF_LOSS | PASS |
| 3 | Home | -0.25 | 0 | 1 | -1.25 | LOSS | -1.0000 | LOSS | PASS |
| 4 | Away | +0.25 | 1 | 1 | +0.25 | HALF_WIN | +0.5000 | HALF_WIN | PASS |
| 5 | Away | +0.25 | 0 | 1 | +1.25 | WIN | +1.0000 | WIN | PASS |
| 6 | Away | +0.25 | 2 | 1 | -0.75 | LOSS | -1.0000 | LOSS | PASS |
| 7 | Home | -0.50 | 2 | 1 | +0.50 | WIN | +1.0000 | WIN | PASS |
| 8 | Home | -0.50 | 1 | 1 | -0.50 | LOSS | -1.0000 | LOSS | PASS |
| 9 | Away | +0.50 | 1 | 1 | +0.50 | WIN | +1.0000 | WIN | PASS |
| 10 | Away | +0.50 | 2 | 1 | -0.50 | LOSS | -1.0000 | LOSS | PASS |
| 11 | Home | -0.75 | 3 | 1 | +1.25 | WIN | +1.0000 | WIN | PASS |
| 12 | Home | -0.75 | 2 | 1 | +0.25 | HALF_WIN | +0.5000 | HALF_WIN | PASS |
| 13 | Home | -0.75 | 1 | 1 | -0.75 | LOSS | -1.0000 | LOSS | PASS |
| 14 | Away | +0.75 | 2 | 1 | -0.25 | HALF_LOSS | -0.5000 | HALF_LOSS | PASS |
| 15 | Away | +0.75 | 1 | 1 | +0.75 | WIN | +1.0000 | WIN | PASS |
| 16 | Home | -1.00 | 2 | 1 | 0.00 | PUSH | 0.0000 | PUSH | PASS |
| 17 | Home | -1.00 | 3 | 1 | +1.00 | WIN | +1.0000 | WIN | PASS |
| 18 | Away | +1.00 | 2 | 1 | 0.00 | PUSH | 0.0000 | PUSH | PASS |
| 19 | Over | 2.25 | 2 | 1 | +0.75 | WIN | +1.0000 | WIN | PASS |
| 20 | Over | 2.25 | 1 | 1 | -0.25 | HALF_LOSS | -0.5000 | HALF_LOSS | PASS |
| 21 | Under | 2.25 | 1 | 1 | +0.25 | HALF_WIN | +0.5000 | HALF_WIN | PASS |
| 22 | Under | 2.25 | 2 | 1 | -0.75 | LOSS | -1.0000 | LOSS | PASS |
| 23 | Over | 2.50 | 2 | 1 | +0.50 | WIN | +1.0000 | WIN | PASS |
| 24 | Under | 2.50 | 1 | 1 | +0.50 | WIN | +1.0000 | WIN | PASS |
| 25 | Over | 2.75 | 2 | 1 | +0.25 | HALF_WIN | +0.5000 | HALF_WIN | PASS |
| 26 | Under | 3.00 | 2 | 1 | 0.00 | PUSH | 0.0000 | PUSH | PASS |
| 27 | Any | Any | Any | Any | N/A | VOID | 0.0000 | VOID | PASS |

All 27 reference cases match with 0.0000 tolerance.
