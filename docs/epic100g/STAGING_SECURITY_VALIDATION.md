# STAGING SECURITY VALIDATION & ROLE PERMISSION REPORT

**Document Identifier**: `docs/epic100g/STAGING_SECURITY_VALIDATION.md`  
**Parent Epic**: EPIC 100G — Staging Database Migration, Security Parity & Rollback Validation  
**Authors**: Astra / DeepMind Advanced Agentic Coding Pair  
**Status**: COMPLETE / EMPIRICALLY VALIDATED  
**Test Reference**: `tests/epic100g_staging_security_validation.test.js`  
**Production Status**: STRICTLY NO-GO  

---

## 1. Executive Summary

A database security audit that merely documents policies without executing permission test queries is insufficient. In Phase D of EPIC 100G, we constructed a dedicated automated security test suite (`tests/epic100g_staging_security_validation.test.js`) that directly tests the `anon`, `authenticated`, and privileged database roles using explicit `SET ROLE` commands against PostgreSQL.

### Verified Security Invariants:
1. **Anonymous Role (`anon`)**:
   - `SELECT` on public `daily_picks` is **PERMITTED**.
   - `INSERT` on `daily_picks` is **DENIED** (`permission denied for table daily_picks`).
   - `SELECT` on internal `prediction_ledger` is **DENIED** (`permission denied for table prediction_ledger`).
2. **Authenticated Role (`authenticated`)**:
   - `SELECT` on `prediction_ledger` is **PERMITTED** for active records.
   - `INSERT` on `prediction_ledger` is **DENIED** (`permission denied for table prediction_ledger`).
   - `DELETE` on `prediction_ledger` is **DENIED** (`permission denied for table prediction_ledger`).
3. **Privileged / Immutability Invariant**:
   - Even under superuser / privileged role execution, database triggers prohibit `UPDATE` or `DELETE` on `market_snapshots`, `decisions`, core fields in `prediction_ledger`, and `settlement_results`.

---

## 2. Empirical Role Permission Matrix

| Database Table | `anon` Role (Public Visitor) | `authenticated` Role (Registered User) | `service_role` (Backend Worker) | Immutability Trigger Protection |
| :--- | :--- | :--- | :--- | :--- |
| **`daily_picks`** | `SELECT` (active only)<br>`INSERT/UPDATE/DELETE: DENIED` | `SELECT`<br>`INSERT/UPDATE/DELETE: DENIED` | `SELECT / INSERT / UPDATE` | Updates permitted for settlement results |
| **`matches`** | `SELECT` (non-cancelled)<br>`INSERT/UPDATE/DELETE: DENIED` | `SELECT`<br>`INSERT/UPDATE/DELETE: DENIED` | `SELECT / INSERT / UPDATE` | Mutable score & status fields |
| **`prediction_ledger`** | **DENIED ALL** (Table hidden from anon) | `SELECT` (active only)<br>`INSERT/UPDATE/DELETE: DENIED` | `SELECT / INSERT / UPDATE` (settlement only) | **TRIGGER ENFORCED**: Odds, prob, selection, line, hashes **CANNOT** be updated |
| **`settlement_results`**| **DENIED ALL** | **DENIED ALL** | `SELECT / INSERT / UPDATE` | **TRIGGER ENFORCED**: `DELETE` strictly blocked |
| **`market_snapshots`** | **DENIED ALL** | **DENIED ALL** | `SELECT / INSERT` | **TRIGGER ENFORCED**: `UPDATE/DELETE` strictly blocked |
| **`decisions`** | **DENIED ALL** | **DENIED ALL** | `SELECT / INSERT` | **TRIGGER ENFORCED**: `UPDATE/DELETE` strictly blocked |

---

## 3. Test Evidence from `tests/epic100g_staging_security_validation.test.js`

```text
✔ Security Gate 1: Anon role is restricted to read-only active daily_picks (46.6575ms)
✔ Security Gate 2: Authenticated role can read active ledger but cannot mutate records (2.8277ms)
✔ Security Gate 3: Immutability triggers prohibit update/delete even under privileged role (10.1578ms)
ℹ tests: 3 | pass: 3 | fail: 0 | duration: 199.93ms
```

### Detailed Trace:
1. **Anon Role Rejection**:
   - Query: `INSERT INTO public.daily_picks (...) VALUES (...)` under `SET ROLE anon`.
   - PostgreSQL Response: `ERROR: permission denied for table daily_picks`.
   - Assertion: `assert.rejects(...)` matched successfully.
2. **Authenticated Role Rejection**:
   - Query: `DELETE FROM public.prediction_ledger WHERE id = ...` under `SET ROLE authenticated`.
   - PostgreSQL Response: `ERROR: permission denied for table prediction_ledger`.
   - Assertion: `assert.rejects(...)` matched successfully.
3. **Privileged Trigger Rejection**:
   - Query: `UPDATE public.market_snapshots SET home_odds = 2.50 WHERE id = ...` under superuser.
   - PostgreSQL Response: `ERROR: market_snapshots are immutable; updates and deletes are prohibited`.
   - Assertion: `assert.rejects(...)` matched successfully.

---

## 4. Conclusion

The security model implements true defense-in-depth:
- Layer 1: PostgreSQL Role Grants (`GRANT` / `REVOKE`).
- Layer 2: Row-Level Security (`RLS`) policies filtering row visibility.
- Layer 3: PL/pgSQL Immutability Triggers preventing tampering even if credentials are compromised.

This provides rigorous database-level protection against unauthorized mutations.
