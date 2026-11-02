# EPIC 96 — DATA PROVIDER LEGAL, COMMERCIAL & OPERATIONAL MATRIX
## Intellectual Property Rights, Free vs Paid Economics & Redistribution Governance
### Timestamp: 2026-11-03T04:15:00+07:00 | Legal Boundary: SALMO Commercial Production

---

## 1. Provider Evaluation Matrix

| Provider | Purpose in Pipeline | Current Operational Status | Monthly Cost | Quota Ceiling | Commercial Rights | Production Role |
|---|---|---|---|---|---|---|
| **OddsPapi** | Sharp Market Benchmark (Pinnacle AH & OU) | **HEALTHY / OPERATIONAL** | **$0** (Free Tier) | 250 req/mo (208 remaining) | API Terms permit private analysis; no raw resale | **Production Benchmark (Tier A)** |
| **API-Football** | Fixture & Historical Metadata | **SUSPENDED (KEY EXHAUSTED)** | **$0** ($19/mo Pro rejected) | 0 req active (100 req/day free when reset) | Commercial license included in API-Sports terms | **Secondary Fallback Only** |
| **Dribble360** | Opta Advanced Metrics (Harvested Archive) | **ARCHIVED (SUBSCRIPTION ACTIVE)** | **$0** (Pre-paid to Dec 1) | 64,850 unique entities archived | Internal research only; no raw redistribution | **Internal Research & Feature Lab** |
| **Football-Data.co.uk** | Match Results & Benchmark Historical Odds | **OPERATIONAL (CSV INGESTION)** | **$0** | Unlimited static CSV downloads | **Strictly Personal / Academic Research Only**. Commercial redistribution prohibited | **Internal Settlement Evidence Only** |
| **OpenFootball** | Fixture Schedules & Results | **OPERATIONAL (GITHUB / PUBLIC DOMAIN)** | **$0** | Unlimited (CC0 / Public Domain) | **100% Commercial Use Permitted (Public Domain)** | **Production Fixture & Result Discovery** |
| **The Odds API** | Emergency Fallback Bookmaker Odds | **CONFIGURED (STANDBY)** | **$0** (Free Tier) | 500 req/mo | Permitted for display & analysis | **Emergency Standby Fallback** |
| **TheSportsDB** | Team Badges, Stadiums & Metadata | **CONFIGURED (STANDBY)** | **$0** (Free Tier) | Standard free API | Permitted non-commercial / attribution | **UI Enrichment Only** |
| **Supabase Cache** | Historical Matches, Ratings, Ledgers | **HEALTHY / DURABLE** | **$0** (Internal DB) | Durable storage | **100% Proprietary (First-Party Owned)** | **Primary Production Source of Truth** |

---

## 2. Commercial Compliance Directives

### A. The `football-data.co.uk` Commercial Use Boundary
- **License Terms**: Joseph Buchdahl's terms explicitly state that data is free for individual personal research and analysis. Automated bots and commercial redistribution are prohibited without written agreement.
- **Enforced Boundary**:
  - `football-data.co.uk` CSVs are maintained strictly within `HandicapLab` as **internal offline validation benchmarks**.
  - No raw CSV data, headers, or bookmaker columns from `football-data.co.uk` are exposed via public SALMO API endpoints.
  - Public SALMO settlement derives exclusively from **first-party verified scores stored in the database** and public domain feeds.

### B. Prevention of Paid Provider Traps
1. **API-Football Pro ($19/month)**:
   - Rejected. The 15 canonical leagues require ~42.5 requests/day. Purchasing a 7,500 req/day Pro plan would waste 98% of capacity.
2. **OddsPapi Pro / Custom**:
   - Postponed. The Free tier (250 req/mo) with tournament batching consumes only 48-60 requests/month, providing 4 months of runway without subscription costs.
