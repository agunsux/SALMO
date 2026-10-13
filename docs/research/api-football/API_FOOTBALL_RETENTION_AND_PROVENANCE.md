# SALMO — API-Football Retention, Licensing & Provenance Framework

**Audit Date:** 2026-10-13
**Auditor:** Principal Quant Platform Engineer & Release Auditor
**Scope:** Data Retention Rights, Intellectual Property, and Post-Subscription Operational Architecture

---

## 1. Terms of Service & Data Rights Analysis

A compliance review of API-Sports / API-Football terms of service and commercial policies was conducted regarding the retention and utilization of data harvested under the Football Pro plan:

1. **Internal Research & Modeling Usage**:
   - API-Sports permits subscribers to query, store, and utilize statistical data (fixtures, scores, standings, match statistics) for internal analytics, mathematical modeling, and personal/organizational development.
2. **Prohibition of Direct Reselling**:
   - The terms prohibit re-distributing or sub-licensing raw vendor JSON feeds as a standalone competing sports data API.
   - SALMO does not expose, resell, or distribute raw API-Football endpoints. All data remains strictly quarantined within internal quantitative modeling pipelines.
3. **Proprietary Ownership of Derived Features**:
   - Derived statistical artifacts, empirical Poisson parameters, rolling expected-goals differentials, team power ratings, and predictive distributions constitute the proprietary intellectual property of SALMO.dev and HandicapLab.
   - These derived mathematical models remain 100% valid, retained, and usable indefinitely after subscription expiration.

---

## 2. Post-Expiry Technical Realities (The "No Renewal" Rule)

At **2026-10-14T07:53:10+00:00**, the account transitions to the Free tier with the following architectural constraints:

| Capability | Pro Tier (Current) | Free Tier (Post-Expiry) | Strategic Mitigation |
| :--- | :--- | :--- | :--- |
| **Historical Seasons** | Full historical access (2022–2026) | Restricted to current year only | **Pre-emptive Harvest**: All historical fixtures and match stats for Big 5 and canonical leagues captured prior to expiry. |
| **Daily Request Quota** | **7,500 requests / day** | **100 requests / day** | **Complete Decoupling**: Runtime ingestion no longer queries API-Football; switches to OpenFootball & TheSportsDB. |
| **Rate Limit** | 300 requests / minute | 10 requests / minute | **Quarantine**: Harvester scripts archived; no automated runtime jobs permitted to call API-Football. |
| **Deep Statistics (xG)** | Enabled | Disabled / Severely throttled | **Durable Storage**: All match statistics archived in normalized parquet/jsonl format on dual physical disks. |

---

## 3. Post-Subscription Decoupling & Ingestion Failover

To ensure SALMO suffers zero operational disruption after Pro expiry without requiring paid renewal:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     SALMO RUNTIME INGESTION FAILOVER                     │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
    ┌──────────────────────────┐            ┌──────────────────────────┐
    │  HISTORICAL / RESEARCH   │            │   LIVE FIXTURE DISCOVERY │
    │    (MODEL TRAINING)      │            │      & INGESTION         │
    └──────────────────────────┘            └──────────────────────────┘
                 │                                       │
                 ▼                                       ▼
     Offline Local Bronze Vault               OpenFootball / TheSportsDB
   • canonical_fixtures.jsonl                 • Daily fixture schedules
   • canonical_match_stats.jsonl              • Live / Finished scores
   • team_empirical_profiles.json             • Zero API key or renewal
   • Dual-Disk SHA-256 Verified                 required
```

1. **Runtime Fixture Discovery**:
   - `src/services/fixtureIngestionService.ts` already integrates multi-source ingestion via **OpenFootball** and **TheSportsDB**.
   - These sources operate without API-Football quota dependencies.
2. **Historical Backtesting & Model Fitting**:
   - Model estimation pipelines (Dixon-Coles, Poisson, xG regressors) point directly to `research/api-football/normalized/` and `D:\SALMO_Backups\api_football_vault_20261013\`.
   - Zero network egress is required for model inference.

---

## 4. Physical Storage & Provenance Guarantees

Every harvested record is anchored with strict cryptographic provenance:

- **Source Integrity**: Each raw HTTP response body is hashed with SHA-256 upon reception and recorded alongside timestamp, endpoint, and HTTP status in `API_FOOTBALL_REQUEST_LEDGER.jsonl`.
- **Dual-Disk Redundancy**:
  - Primary working storage: `c:\Users\RYZEN\.antigravity-ide\SALMO\research\api-football\` (NVMe SSD).
  - Secondary cold backup: `D:\SALMO_Backups\api_football_vault_20261013\` (ST500DM009-2DM14C physical HDD).
- **Audit Verification**: `API_FOOTBALL_HARVEST_MANIFEST.json` enforces bit-for-bit checksum equality across primary and secondary storage media.
