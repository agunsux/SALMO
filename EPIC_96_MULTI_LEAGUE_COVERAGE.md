# EPIC 96 — MULTI-LEAGUE COVERAGE & EXPANSION READINESS MATRIX
## Audit of 15 Canonical Candidate Leagues, Provider Mappings & Code Constraints
### Timestamp: 2026-11-03T04:15:00+07:00 | Source: `src/lib/config/multiLeagueRegistry.ts`

---

## 1. The Multi-League Actionability Reality

The user prompt explicitly asks:
> *"Berapa banyak liga yang benar-benar bisa menghasilkan prediksi actionable hari ini?"*

The forensic answer is: **EXACTLY ONE LEAGUE: English Premier League (`ENG-PL`)**.

Although 15 canonical leagues are registered in the codebase with verified provider IDs, **13 leagues are strictly locked in `SHADOW` (`NOT_ACTIVE: PHASE_GATED`)** and **1 league (`IDN-L1`) is locked in `DATA_COMPLETENESS_FAIL`**. 

Under SALMO's `ValueEngine` and `ConfidenceGate` architecture, any fixture belonging to a non-`ACTIVE` league is strictly prohibited from receiving a `LAYAK` (actionable bet) verdict. Such fixtures are categorized as `RESEARCH_ONLY` with **zero recommended stake, zero profit/loss tracking, and no publication to `/daily-picks`**.

---

## 2. Canonical 15 League Coverage Matrix

| Internal ID | Competition Name | Tier | API-Football ID | OddsPapi Tournament ID | Production Status | Non-Active Reason | Pinnacle Available | AH Quoted | OU Quoted | Actionable Picks Today? |
|---|---|---|---|---|---|---|---|---|---|---|
| **ENG-PL** | Premier League | A | 39 | 17 | **`ACTIVE`** | `ACTIVE_QUALIFIED` | YES | YES | YES | **YES (`LAYAK` Eligible)** |
| **ESP-LALIGA** | La Liga | A | 140 | 8 | **`SHADOW`** | `NOT_ACTIVE: PHASE_GATED` | YES | YES | YES | NO (Research Only) |
| **ITA-SERIEA** | Serie A | A | 135 | 23 | **`SHADOW`** | `NOT_ACTIVE: PHASE_GATED` | YES | YES | YES | NO (Research Only) |
| **DEU-BUNDESLIGA** | Bundesliga | A | 78 | 35 | **`SHADOW`** | `NOT_ACTIVE: PHASE_GATED` | YES | YES | YES | NO (Research Only) |
| **FRA-LIGUE1** | Ligue 1 | A | 61 | 34 | **`SHADOW`** | `NOT_ACTIVE: PHASE_GATED` | YES | YES | YES | NO (Research Only) |
| **NED-ERE** | Eredivisie | B | 88 | 37 | **`SHADOW`** | `NOT_ACTIVE: PHASE_GATED` | YES | YES | YES | NO (Research Only) |
| **POR-PRIMEIRA** | Primeira Liga | B | 94 | 238 | **`SHADOW`** | `NOT_ACTIVE: PHASE_GATED` | YES | YES | YES | NO (Research Only) |
| **BEL-PRO** | Jupiler Pro League | B | 144 | 38 | **`SHADOW`** | `NOT_ACTIVE: PHASE_GATED` | YES | YES | YES | NO (Research Only) |
| **SCO-PREM** | Premiership | B | 179 | 36 | **`SHADOW`** | `NOT_ACTIVE: PHASE_GATED` | YES | YES | YES | NO (Research Only) |
| **ENG-CHAMP** | Championship | B | 40 | 18 | **`SHADOW`** | `NOT_ACTIVE: PHASE_GATED` | YES | YES | YES | NO (Research Only) |
| **USA-MLS** | Major League Soccer | C | 253 | 242 | **`SHADOW`** | `NOT_ACTIVE: PHASE_GATED` | YES | YES | YES | NO (Research Only) |
| **SAU-PRO** | Pro League | C | 307 | 955 | **`SHADOW`** | `NOT_ACTIVE: PHASE_GATED` | YES | YES | YES | NO (Research Only) |
| **JPN-J1** | J1 League | C | 98 | 196 | **`SHADOW`** | `NOT_ACTIVE: PHASE_GATED` | YES | YES | YES | NO (Research Only) |
| **KOR-K1** | K League 1 | C | 292 | 410 | **`SHADOW`** | `NOT_ACTIVE: PHASE_GATED` | YES | YES | YES | NO (Research Only) |
| **IDN-L1** | Liga 1 | C | 274 | 1015 | **`SHADOW`** | `NOT_ACTIVE: DATA_COMPLETENESS_FAIL` | NO | NO | NO | NO (Blocked / No Sharp Odds) |

---

## 3. Code-Level Flaws & Gaps Discovered

### A. Hardcoded `competitionId: 39` in Database Fixture Mapper
In `HandicapLab/src/lib/services/canonicalFixtureRegistry.ts:461-472`:
```typescript
const fixtureId = this.generateCanonicalFixtureId(
  39, // <-- BUG: Hardcoded to 39 (EPL)
  '2026',
  m.home_team,
  m.away_team,
  m.kickoff
);
return {
  fixtureId,
  providerFixtureId: m.id,
  competitionId: 39, // <-- BUG: Hardcoded to 39 (EPL)
  competitionName: m.league || 'Premier League', // <-- BUG: Defaults to Premier League
...
```
**Impact**: When fixtures are loaded from the database fallback (`loadUpcomingFromDatabase()`), even if the match belongs to La Liga, Serie A, or MLS, it is assigned `competitionId: 39` and labeled `Premier League`. This corrupts league segregation downstream.

### B. Suspended API-Football Discovery
The external fixture discovery path (`apiFootballClient.getUpcomingFixtures`) relies on `process.env.APIFOOTBALL_KEY`. Because this key is currently suspended on RapidAPI, external discovery fails and the system correctly falls back to Supabase database matches.

---

## 4. Eight-Point Operational Qualification by League

A league is classified as **`LIVE_ACTIONABLE`** only when it satisfies all eight requirements:
1. Valid upcoming fixtures exist.
2. Correct team and event mappings exist.
3. Valid AH or OU odds are quoted by Pinnacle.
4. Valid model features / team ratings exist.
5. Successful prediction generation passes calibration.
6. Valid EV and price thresholds are satisfied.
7. Ledger persistence is active.
8. Functioning settlement path exists.

| League | 1. Fixtures | 2. Mappings | 3. Pinnacle Odds | 4. Ratings | 5. Prediction | 6. EV Gate | 7. Ledger | 8. Settlement | Final Classification |
|---|---|---|---|---|---|---|---|---|---|
| **Premier League** | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **`LIVE_ACTIONABLE`** |
| **La Liga** | PASS | PASS | PASS | PARTIAL | PASS | GATED | PASS | PASS | **`SHADOW (PHASE_GATED)`** |
| **Serie A** | PASS | PASS | PASS | PARTIAL | PASS | GATED | PASS | PASS | **`SHADOW (PHASE_GATED)`** |
| **Bundesliga** | PASS | PASS | PASS | PARTIAL | PASS | GATED | PASS | PASS | **`SHADOW (PHASE_GATED)`** |
| **Ligue 1** | PASS | PASS | PASS | PARTIAL | PASS | GATED | PASS | PASS | **`SHADOW (PHASE_GATED)`** |
| **Eredivisie** | PASS | PASS | PASS | PARTIAL | PASS | GATED | PASS | PASS | **`SHADOW (PHASE_GATED)`** |
| **Primeira Liga** | PASS | PASS | PASS | PARTIAL | PASS | GATED | PASS | PASS | **`SHADOW (PHASE_GATED)`** |
| **Jupiler Pro League** | PASS | PASS | PASS | PARTIAL | PASS | GATED | PASS | PASS | **`SHADOW (PHASE_GATED)`** |
| **Premiership** | PASS | PASS | PASS | PARTIAL | PASS | GATED | PASS | PASS | **`SHADOW (PHASE_GATED)`** |
| **Championship** | PASS | PASS | PASS | PARTIAL | PASS | GATED | PASS | PASS | **`SHADOW (PHASE_GATED)`** |
| **MLS** | PASS | PASS | PASS | PARTIAL | PASS | GATED | PASS | PASS | **`SHADOW (PHASE_GATED)`** |
| **Saudi Pro League** | PASS | PASS | PASS | PARTIAL | PASS | GATED | PASS | PASS | **`SHADOW (PHASE_GATED)`** |
| **J1 League** | PASS | PASS | PASS | PARTIAL | PASS | GATED | PASS | PASS | **`SHADOW (PHASE_GATED)`** |
| **K League 1** | PASS | PASS | PASS | PARTIAL | PASS | GATED | PASS | PASS | **`SHADOW (PHASE_GATED)`** |
| **Liga 1 (Indonesia)** | PASS | PASS | FAIL | FAIL | PASS | GATED | PASS | PASS | **`BLOCKED (NO_ODDS)`** |

### Conclusion
**Only 1 league (Premier League) satisfies all eight criteria today.** The other 14 leagues generate research predictions, but cannot and should not be activated for financial betting until team ratings are fully calibrated and phase gating is unlocked.
