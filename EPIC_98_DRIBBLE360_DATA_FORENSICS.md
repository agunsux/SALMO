# EPIC 98 — DRIBBLE360 DATA FORENSICS & REPRODUCIBLE ARCHIVE INVENTORY
## File Checksum Verification, De-Duplication Forensics & Ground-Truth Entity Breakdown
### Evaluation Timestamp: 2026-11-03T04:45:00+07:00 | Harvest Path: `HandicapLab/data/harvest/dribble360/`

---

## 1. Executive Summary & Forensic Findings

Prior documentation (EPIC 92 and EPIC 95) reported an extracted archive of **379,143 records** from Dribble360 across 8 seasons (2019/20 through 2026/27). 

A rigorous, independent cryptographic audit confirms that this number was **artificially inflated by an 8-fold duplication bug** in the harvest pipeline. The actual ground-truth usable archive comprises **44,899 unique matches**, **8,035 unique teams**, and **11,916 detailed team-match statistics records**, totaling **64,850 unique entities**.

---

## 2. Cryptographic Checksum & Duplicate Analysis

Each of the 8 harvested seasonal match files was subjected to SHA-256 hashing:

```powershell
Get-FileHash HandicapLab/data/harvest/dribble360/matches_*.jsonl
```

### Forensic File Verification Matrix

| File Name | Intended Season | File Size (Bytes) | SHA-256 Checksum | Forensic Integrity Status |
|:---|:---:|:---:|:---:|:---:|
| `matches_2019_2020.jsonl` | 2019/2020 | 24,887,791 | `22F6624D10D9A769588C89BC5BD1B5BE3C025163FD16063A0C8D1F3C557732A5` | **ORIGINAL SEED ARCHIVE** |
| `matches_2020_2021.jsonl` | 2020/2021 | 24,887,791 | `22F6624D10D9A769588C89BC5BD1B5BE3C025163FD16063A0C8D1F3C557732A5` | **EXACT BYTE-FOR-BYTE DUPLICATE** |
| `matches_2021_2022.jsonl` | 2021/2022 | 24,887,791 | `22F6624D10D9A769588C89BC5BD1B5BE3C025163FD16063A0C8D1F3C557732A5` | **EXACT BYTE-FOR-BYTE DUPLICATE** |
| `matches_2022_2023.jsonl` | 2022/2023 | 24,887,791 | `22F6624D10D9A769588C89BC5BD1B5BE3C025163FD16063A0C8D1F3C557732A5` | **EXACT BYTE-FOR-BYTE DUPLICATE** |
| `matches_2023_2024.jsonl` | 2023/2024 | 24,887,791 | `22F6624D10D9A769588C89BC5BD1B5BE3C025163FD16063A0C8D1F3C557732A5` | **EXACT BYTE-FOR-BYTE DUPLICATE** |
| `matches_2024_2025.jsonl` | 2024/2025 | 24,887,791 | `22F6624D10D9A769588C89BC5BD1B5BE3C025163FD16063A0C8D1F3C557732A5` | **EXACT BYTE-FOR-BYTE DUPLICATE** |
| `matches_2025_2026.jsonl` | 2025/2026 | 24,887,791 | `22F6624D10D9A769588C89BC5BD1B5BE3C025163FD16063A0C8D1F3C557732A5` | **EXACT BYTE-FOR-BYTE DUPLICATE** |
| `matches_2026_2027.jsonl` | 2026/2027 | 24,887,791 | `22F6624D10D9A769588C89BC5BD1B5BE3C025163FD16063A0C8D1F3C557732A5` | **EXACT BYTE-FOR-BYTE DUPLICATE** |

### Root Cause Analysis
In `HandicapLab/scripts/harvest_dribble360.ts`:
The harvester looped over an array of 8 season strings (`['2019/2020', '2020/2021', ...]`) and queried:
`https://dribble360.com/api/v1/matches?season=${encodeURIComponent(season)}&limit=1000&offset=...`
However, the Dribble360 REST API does not support filtering by string seasons. Dribble360 requires internal opaque alphanumeric IDs for seasons (e.g., `season_id: '6pdwluctev9iebv00r4qqukno'`). Because the query parameter was silently ignored, the API repeatedly returned the exact same global paginated match dataset across all 8 loop iterations.

---

## 3. Ground-Truth Usable Entity Breakdown

| Entity Collection | Source File | Inflated Manifest Count | True Unique Count | Date Range / Coverage | Usability Assessment |
|:---|:---|:---:|:---:|:---|:---|
| **Matches** | `matches_*.jsonl` | 359,192 ($8 \times 44,899$) | **44,899 unique matches** | Feb 29, 2020 — Dec 29, 2026 | High (Clean dates, teams, scores) |
| **Teams** | `teams.jsonl` | 8,035 | **8,035 unique teams** | Global (Domestic & international) | High (Good canonical naming) |
| **Team-Match Stats** | `team_matches.jsonl`| 11,916 | **11,916 match stats** | European Top Leagues (2022–2026) | High for Opta rolling features |
| **TOTALS** | — | **379,143 (inflated)** | **64,850 unique entities** | — | **Fully sufficient for research** |

---

## 4. Match Composition & Status Distribution

Analysis of the 44,899 unique matches reveals the following breakdown:

| Match Status | Match Count | Percentage | Description |
|:---|:---:|:---:|:---|
| `PLAYED` | **43,753** | **97.45%** | Historical completed matches with verified final scores |
| `FIXTURE` | **1,034** | **2.30%** | Scheduled upcoming fixtures through December 2026 |
| `AWARDED` | 76 | 0.17% | Matches decided by regulatory commission / walkover |
| `CANCELLED` | 34 | 0.08% | Cancelled before kickoff |
| `POSTPONED` | 2 | 0.01% | Postponed fixtures awaiting reschedule |
| **TOTAL** | **44,899** | **100.00%** | Comprehensive cross-season archive |

### Temporal & Tournament Span
- **Unique internal `season_id`s in archive**: 215 distinct tournaments and seasons.
- **Top Leagues Represented**: English Premier League, Spanish La Liga, Italian Serie A, German Bundesliga, French Ligue 1, Dutch Eredivisie, Portuguese Primeira Liga, Brazilian Serie A, plus minor global divisions.
- **Earliest Recorded Match**: February 29, 2020.
- **Latest Scheduled Fixture**: December 29, 2026.

---

## 5. Storage Integrity & Usability Verdict
1. **Deduplication Complete**: The 8 identical files represent a single 44,899-match dataset. We treat it as 1 coherent historical archive rather than 8 separate seasons.
2. **Opta Feature Coverage**: The 11,916 team-match records provide detailed shot counts (`total_scoring_att`), shots on target (`ontarget_scoring_att`), box touches, and defensive actions for top-tier European teams.
3. **Verdict**: PASS for research and shadow feature engineering.
