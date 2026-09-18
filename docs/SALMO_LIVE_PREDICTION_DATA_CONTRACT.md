# SALMO.DEV — Live Prediction Data Contract

## 1. Canonical Identifiers

All entities across HandicapLab and SALMO are referenced via deterministic canonical strings.

### 1.1 Canonical Match ID
Format:
```
EPL_{SEASON}_{HOMETEAM}_{AWAYTEAM}_{YYYY-MM-DD}
```
Example:
```
EPL_2026_BRENTFORD_CHELSEA_2026-09-18
```
Rules:
- Team names are upper-cased with spaces and punctuation removed.
- Date is in ISO 8601 `YYYY-MM-DD` representation of kickoff date in UTC.

### 1.2 Canonical Prediction ID
Format:
```
pred_{CANONICAL_MATCH_ID}_{MARKET}_{LINE}
```
Examples:
```
pred_EPL_2026_BRENTFORD_CHELSEA_2026-09-18_AH_-0.25
pred_EPL_2026_BRENTFORD_CHELSEA_2026-09-18_OU_2.5
pred_EPL_2026_BRENTFORD_CHELSEA_2026-09-18_BTTS_YES
```

---

## 2. Active Match Prediction JSON Schema

Returned by `IHandicapLabAdapter.getActive7DayPredictions()` and `/api/v1/predictions`:

```typescript
interface ActiveMatchPrediction {
  canonicalMatchId: string;         // e.g. "EPL_2026_BRENTFORD_CHELSEA_2026-09-18"
  fixtureId: string;                // API-Football fixture ID (e.g. "1557408")
  oddsPapiFixtureId: string;        // OddsPAPI fixture ID (e.g. "id1000001772221274")
  kickoffUtc: string;               // ISO 8601 UTC string (e.g. "2026-09-18T19:00:00+00:00")
  homeTeam: string;                 // e.g. "Brentford"
  awayTeam: string;                 // e.g. "Chelsea"
  league: string;                   // "Premier League"
  season: string;                   // "2026"
  venue: string;                    // "Gtech Community Stadium"
  predictionTimestamp: string;      // ISO timestamp when prediction was computed
  footballStateTimestamp: string;  // ISO timestamp of API-Football state snapshot
  footystatsStateTimestamp: string; // ISO timestamp of FootyStats state snapshot
  marketStateTimestamp: string;     // ISO timestamp of OddsPapi market snapshot
  horizon: 'T-72h' | 'T-24h' | 'T-6h' | 'T-15m';
  modelVersion: string;             // e.g. "dixon-coles-v1.0"
  featureVersion: string;           // e.g. "prematch-features-v1.0"
  markets: {
    asianHandicap: ActivePredictionMarket;
    overUnder: ActivePredictionMarket;
    btts: ActivePredictionMarket;
  };
  scoreGridSummary: {
    homeXG: number;                 // e.g. 1.35
    awayXG: number;                 // e.g. 1.50
    rho: number;                    // e.g. -0.08
  };
}

interface ActivePredictionMarket {
  market: 'AH' | 'OU' | 'BTTS';
  selection: string;                // e.g. "Brentford -0.25", "Over 2.5", "BTTS YES"
  line: number;                     // e.g. -0.25, 2.5, 0
  modelProbabilityPct: number;      // e.g. 54.2
  fairOdds: number | null;          // 1 / (prob / 100), e.g. 1.844
  marketOdds: number;               // Decimal odds from Pinnacle, e.g. 1.52
  marketImpliedProbPct: number;     // 100 / marketOdds, e.g. 65.8
  devigProbPct: number;             // Multiplicative devigged probability, e.g. 63.1
  edgePct: number;                  // modelProb - devigProb, e.g. -8.87
  expectedValuePct: number | null;  // (modelProb * odds) - 1, e.g. -17.56
  signalState: 'VALUE' | 'MARGINAL' | 'NO_SIGNAL';
  bookmaker: 'pinnacle';
  oddsCapturedAt: string;           // ISO timestamp of bookmaker quote
}
```

---

## 3. Immutable Prediction Ledger Row Schema (`live_prediction_ledger.jsonl`)

Each line in the `.jsonl` file represents one immutable pre-match prediction record:

```typescript
interface LedgerRow {
  predictionId: string;
  canonicalMatchId: string;
  predictionTimestamp: string;
  horizon: string;
  modelVersion: string;
  featureVersion: string;
  market: 'AH' | 'OU' | 'BTTS';
  selection: string;
  line: number;
  modelProbability: number;
  fairOdds: number | null;
  bookmaker: string;
  oddsAtPrediction: number;
  marketImpliedProbability: number;
  devigProbability: number;
  edge: number;
  EV: number | null;
  closingLine: number | null;
  closingOdds: number | null;
  CLV: number | null;
  result: string | null;
  settlement: 'PENDING' | 'WIN' | 'HALF_WIN' | 'PUSH' | 'HALF_LOSS' | 'LOSS';
  profitLoss: number | null;
  footballStateTimestamp: string;
  footystatsStateTimestamp: string;
  marketStateTimestamp: string;
  providerProvenance: {
    apiFootballFixtureId: number | string;
    oddsPapiFixtureId: string;
    bookmaker: string;
  };
}
```

---

## 4. Live Validation Summary Schema

Returned by `IHandicapLabAdapter.getLiveValidationSummary()`:

```typescript
interface LiveValidationSummary {
  generatedAt: string;
  windowStart: string;              // "2026-09-18"
  windowEnd: string;                // "2026-09-25"
  fixtureCount: number;             // 10
  reconciledFixtureCount: number;   // 10
  ahCoverage: string;               // "10/10"
  ouCoverage: string;               // "10/10"
  bttsCoverage: string;             // "10/10"
  predictionCount: number;          // 10
  dataCompleteness: string;         // "100%"
  providerStatus: {
    apiFootball: string;            // "HEALTHY_PRO_TIER"
    oddsPapi: string;               // "HEALTHY_PINNACLE_SHARP"
    footyStats: string;             // "HEALTHY_ENRICHMENT"
  };
  modelVersion: string;             // "dixon-coles-v1.0"
  validationStatus: string;         // "COMPLETED_ZERO_FABRICATION"
  matrix: Array<{
    market: 'AH' | 'BTTS' | 'OU';
    model: string;                  // "Poisson" | "DC" | "Hierarchical DC"
    fixtures: number;
    signals: number;
    roi: number;                    // Percentage, e.g. -7.29
    ci95: string;                   // e.g. "[-14.13%, 0.04%]"
    clv: number;                    // Closing Line Value %
    calibration: number;            // Brier score / calibration
    status: 'VALIDATED EDGE' | 'PROVISIONAL EDGE' | 'NO EDGE';
  }>;
}
```

