# SALMO — Existing API-Football Data Forensic Inventory

**Audit Date:** 2026-10-13
**Auditor:** Principal Quant Platform Engineer & Release Auditor
**Repositories Evaluated:** `c:\Users\RYZEN\.antigravity-ide\SALMO` and `c:\Users\RYZEN\.antigravity-ide\HandicapLab`
**Inventory Scope:** All pre-existing API-Football payloads prior to the expiry harvest run

---

## 1. Inventory Summary

An exhaustive forensic scan was conducted across all lakehouse, cache, and backup directories in both SALMO and HandicapLab to map existing data assets and avoid redundant requests.

| Metric | Measured Value |
| :--- | :--- |
| **Total Pre-Existing Files** | **74 files** |
| **Total Pre-Existing Payload Size** | **31,840,209 bytes (30.37 MB)** |
| **Total Fixture Header Records** | **22,704 matches** |
| **Pre-Existing Match Statistics Files** | **0** (Deep stats absent) |
| **Pre-Existing Standings Files** | **0** (Standings tables absent) |
| **Pre-Existing Odds Records** | **0** (Unpopulated for historical fixtures) |
| **Master League Catalog** | `data/cache/apifootball_all_leagues.json` (1,245 leagues cataloged) |

---

## 2. Pre-Existing Storage Topology

Pre-existing datasets were distributed across two primary cache/bronze paths:

1. **Bronze Lakehouse Partitioning (`HandicapLab/data/lakehouse/bronze/apifootball/`)**:
   - 15 files, total 4,598,035 bytes.
   - Organized as `{league_id}/{season}/fixtures_{hash}.json`.
   - Sample files:
     - `103/2026/fixtures_4a7c3686c2c3.json` (220,745 bytes)
     - `128/2026/fixtures_3258365b91e3.json` (476,753 bytes)
     - `140/2026/fixtures_cbb79a7848f5.json` (451,122 bytes)
     - `39/2026/fixtures_...json` (350,995 bytes)

2. **Epic 66 Research Cache (`HandicapLab/data/cache/epic66/`)**:
   - 59 files, total 27,242,174 bytes.
   - Cached historical fixture sets across various global leagues.

---

## 3. Canonical 15 League Pre-Harvest Coverage Status

| Internal Key | API League ID | Name | Pre-Existing Seasons | Missing Seasons (Gaps) | Match Stats | Standings |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `ENG-PL` | 39 | Premier League | `[2026]` | 2022, 2023, 2024, 2025 | ❌ None | ❌ None |
| `ESP-LALIGA` | 140 | La Liga | `[2024, 2025, 2026]` | 2022, 2023 | ❌ None | ❌ None |
| `ITA-SERIEA` | 135 | Serie A | `[2024, 2026]` | 2022, 2023, 2025 | ❌ None | ❌ None |
| `DEU-BUNDESLIGA` | 78 | Bundesliga | `[2024, 2025, 2026]` | 2022, 2023 | ❌ None | ❌ None |
| `FRA-LIGUE1` | 61 | Ligue 1 | `[2024, 2025, 2026]` | 2022, 2023 | ❌ None | ❌ None |
| `NED-ERE` | 88 | Eredivisie | `[2024, 2025, 2026]` | 2022, 2023 | ❌ None | ❌ None |
| `POR-PRIMEIRA` | 94 | Primeira Liga | `[2024, 2025]` | 2026 | ❌ None | ❌ None |
| `BEL-PRO` | 144 | Jupiler Pro League | `[2024, 2025]` | 2026 | ❌ None | ❌ None |
| `SCO-PREM` | 179 | Premiership | `[2024, 2025, 2026]` | 2022, 2023 | ❌ None | ❌ None |
| `ENG-CHAMP` | 40 | Championship | `[2024, 2025, 2026]` | 2022, 2023 | ❌ None | ❌ None |
| `USA-MLS` | 253 | MLS | `[2024, 2025]` | 2026 | ❌ None | ❌ None |
| `SAU-PRO` | 307 | Saudi Pro League | `[2024, 2025]` | 2026 | ❌ None | ❌ None |
| `JPN-J1` | 98 | J1 League | `[2024, 2025, 2027]` | 2026 | ❌ None | ❌ None |
| `KOR-K1` | 292 | K League 1 | `[2024, 2025, 2026]` | 2022, 2023 | ❌ None | ❌ None |
| `IDN-L1` | 274 | Liga 1 Indonesia | `[2026]` | 2024, 2025 | ❌ None | ❌ None |

---

## 4. Empirical Inspection of Existing Payloads

Inspection of `data/lakehouse/bronze/apifootball/39/2026/` and `data/cache/epic66/` revealed the exact schema:
- Schema fields present: `fixture` (id, referee, timezone, date, timestamp, periods, venue, status), `league` (id, name, country, logo, flag, season, round), `teams` (home, away), `goals` (home, away), `score` (halftime, fulltime, extratime, penalty).
- **Explicitly absent fields**:
  - `statistics`: `false` (no match stats embedded in fixture list)
  - `events`: `false` (no goals/cards timeline)
  - `lineups`: `false` (no starting XI or formations)

### Tested Probe Results
- `/odds?fixture=1557367`: Returned `HTTP 200` with `results: 0`. API-Football historical odds are unpopulated and non-viable for backtesting.
- `/fixtures/statistics?fixture=1557367`: Returned `HTTP 200` with full match metrics, including `expected_goals` (xG), total shots, shots on goal, corner kicks, ball possession percentage, goalkeeper saves, and accurate passes.

**Conclusion**: Pre-existing data provided only match schedule and final score headers. Deep predictive signals (xG, shot rates, corners) required a dedicated, targeted harvest before Pro subscription termination.
