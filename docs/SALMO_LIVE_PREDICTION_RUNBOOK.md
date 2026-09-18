# SALMO.DEV — Live Prediction Operations Runbook

## 1. Daily Operations & Matchday Lifecycle

To operate the live prediction pipeline for Premier League matchdays:

### Step 1: Health & Quota Verification
Check API provider health and available quota before running discovery:
```powershell
# In HandicapLab workspace
npx tsx scripts/research/salmo_provider_health.ts
```
Expected output:
- API-Football PRO: >= 7,000 requests remaining.
- OddsPapi v4: Endpoint responsive (`https://api.oddspapi.io/v4`).
- FootyStats: Endpoint responsive (1,800/hr limit intact).

---

### Step 2: Live Prediction & Walk-Forward Execution
Run the authoritative engine script to discover the next 7 days of fixtures, fetch sharp Pinnacle odds, compute Dixon-Coles goal distributions, devig market lines, evaluate walk-forward bootstrap intervals, and append to the prediction ledger:

```powershell
# In HandicapLab workspace
npx tsx scripts/research/salmo_validation_run.ts
```

This script automatically outputs:
1. `data/verification/active_7day_predictions.json` (10 reconciled match predictions).
2. `data/verification/live_prediction_validation.json` (3x3 validation matrix).
3. `data/verification/live_prediction_ledger.jsonl` (30 immutable prediction rows).

---

### Step 3: Synchronize to SALMO Consumer Platform
Sync generated artifacts to SALMO's verification data folder:
```powershell
# In SALMO workspace
cp ../HandicapLab/data/verification/active_7day_predictions.json data/verification/
cp ../HandicapLab/data/verification/live_prediction_validation.json data/verification/
cp ../HandicapLab/data/verification/live_prediction_ledger.jsonl data/verification/
```

---

### Step 4: Verification & Automated Test Suite
Verify that all invariants, anti-leakage assertions, and contract schemas pass:
```powershell
# In SALMO workspace
npm test
npm run build
```
Requirements for clean pass:
- All 23 tests pass with 0 failures.
- Next.js build creates all static and dynamic pages with 0 warnings/errors.

---

### Step 5: Matchday Settlement & CLV Audit
Following match completion (e.g. Sunday evening after final fixtures):
1. Ingest final scorelines from API-Football.
2. Fetch final Pinnacle closing odds for closing line value (CLV) calculation:
   $$\text{CLV} = \frac{O_{\text{bet}}}{O_{\text{closing}}} - 1$$
3. Run quarter-line settlement engine to settle PENDING predictions to WIN / HALF_WIN / PUSH / HALF_LOSS / LOSS.
4. Record actual P&L against the immutable ledger.

---

## 2. Troubleshooting & Failure Modes

| Symptom | Cause | Resolution |
| :--- | :--- | :--- |
| **Odds Missing / GREY badge** | OddsPAPI has not yet published Pinnacle quotes for distant fixtures (e.g. T-72h) | Expected behavior under Zero Fabrication Policy. The market is truthfully marked `ODDS_UNAVAILABLE`. Once Pinnacle opens the market, rerun Step 2. |
| **Prediction Timestamp Error** | Clock drift or pipeline run after kickoff | Pipeline halts immediately if $t_{\text{pred}} \ge t_{\text{kickoff}}$ to prevent look-ahead contamination. |
| **Quota Exceeded (429)** | Rapid polling of FootyStats or API-Football | Utilize cached football state or increase polling interval. In-flight cache protects against repeated requests within 5 minutes. |
| **CI Crosses Zero** | Small sample size or weak signal | System strictly displays `PROVISIONAL EDGE` (Yellow) or `NO EDGE` (Red). Do NOT manually override decision policy. |

