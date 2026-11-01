# EPIC 92 — PRODUCTION READINESS & DEPLOYMENT RUNBOOK

**Date:** 2026-11-01  
**Target Systems:** SALMO (`salmo.dev`) & HandicapLab (`handicaplab.vercel.app`)  
**Verdict:** **APPROVED FOR SALMO RELEASE / HANDICAPLAB CODE HARDENED**  

---

### 1. Release Gating Verification Checklist

| Gate # | Requirement | Verification Method | Status | Evidence |
| :---: | :--- | :--- | :---: | :--- |
| **G1** | **Git Working Tree Integrity** | `git status` in SALMO & HandicapLab | **PASS** | `origin/main` synchronized. No unstaged breaking changes. |
| **G2** | **Cryptographic Hash Immutability** | SHA-256 computation on benchmark files | **PASS** | `live_prediction_ledger.jsonl`: `317FC037...` (MATCH)<br>`all_leagues_research_ledger.jsonl`: `EAE8F364...` (MATCH) |
| **G3** | **Full Unit & Integration Test Suites** | `npm test` across both workspaces | **PASS** | **HandicapLab:** 3,186 passed, 0 failed.<br>**SALMO:** 422 passed, 0 failed. |
| **G4** | **Clean Production Builds** | `npm run build` | **PASS** | **SALMO:** 30/30 pages compiled.<br>**HandicapLab:** 268/268 pages compiled. |
| **G5** | **Live Odds Provider Activation** | Probed unmetered `/v4/account` + prematch test | **PASS** | OddsPapi active. Count 19/250. 50-reserve intact. |
| **G6** | **Dribble360 Data Secured** | Parquet file validation | **PASS** | 379,143 rows in 18.41 MB ZSTD Parquet. Manifest committed. |
| **G7** | **Zero Secret Leakage** | Repository audit for plaintext tokens | **PASS** | Zero keys in source, logs, or reports. |

---

### 2. Operational Runbook for Production

#### Step 1: Deploying SALMO to Vercel
SALMO contains only isolated, hardened production code and is 100% ready for deployment:
```bash
# Push validated main branch to trigger Vercel deployment
git push origin main
```

#### Step 2: Scheduling Odds Ingestion & Daily Predictions
To maximize the value of the 181 operational OddsPapi calls for November 2026:
- Poll only on matchdays (T-24h to T-2h before kickoff).
- Use batch tournament requests exclusively (`tournaments=17` for EPL).
- Enforce the 50-request reserve floor; if remaining requests drop to 50, immediately halt polling.

#### Step 3: Cancelling Dribble360 Auto-Renewal
All historical seasons (2019–2027) have been archived to local durable Parquet storage. Log into the Dribble360 dashboard and turn off auto-renewal before **December 1, 2026**.

#### Step 4: Settlement Verification
Run automated settlement daily using `FreeResultsAdapter` (0 OddsPapi calls):
```bash
node -e "require('./src/engine/settlement/productionSettlementRunner').runProductionSettlement()"
```
All finished matches will settle automatically against verified scores.
