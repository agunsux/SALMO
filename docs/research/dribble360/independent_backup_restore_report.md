# SALMO P0 — INDEPENDENT DRIBBLE360 BACKUP & CLEAN-RESTORE VERIFICATION REPORT

**Execution Timestamp (UTC):** `2026-10-12T23:46:00Z` (`2026-10-13T06:46:00+07:00`)
**Workspaces Audited:** `c:\Users\RYZEN\.antigravity-ide\SALMO` & `c:\Users\RYZEN\.antigravity-ide\HandicapLab`
**Active Git Branch:** `feat/openfootball-fixture-ingestion` (`HEAD` = `bb0f6451c40c61530028e5c490698e2400072491`)
**Local Research Branch Audited:** `research/dribble360-exploit` (`HEAD` = `9f00d7d550a64666c8e37cd44d99b115c1f7456d`)
**Machine-Readable Source Manifest:** [`dribble360_backup_manifest_v1.json`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/docs/research/dribble360/dribble360_backup_manifest_v1.json) (`200,034` bytes, SHA-256: `badd26a4b26f997c099cf0843d08efa1d4319ed9378db403e66ebe075d7daca1`)
**Source Mutation / Cleanup / Network Calls:** **`0` source files modified/deleted/moved · `0` `git clean` or purge scripts run · `0` external API calls (`Dribble360=0`, `API-Football=0`, `OddsPapi=0`) · `0` DB writes · `0` commits/pushes/deploys**

---

## 1. Explicit Acceptance Verdict

> [!CAUTION]
> ### **FINAL VERDICT: `BLOCKED` (`FAIL` ON INDEPENDENT STORAGE TARGET REQUIREMENT)**
>
> Per Task 2 (*"Create a separate backup destination on an approved independent storage target. If none is configured, STOP and report the exact requirement; do not silently substitute another destination"*) and the Acceptance Criteria (*"PASS only if an independent backup exists, every required file matches its source hash, and a clean restore succeeds. Otherwise report BLOCKED and explain precisely what remains unresolved"*):
>
> 1. **Source Inventory & Cryptographic Hash Verification:** **PASS (`495 / 495` artifacts = `821,248,428` bytes verified bit-for-bit; `0` missing, `0` unreadable, `0` mismatched)**
> 2. **License-Segregated Clean-Restore Verification (`CAT-1` through `CAT-5`, Parquet + JSONL, Zero Credentials):** **PASS (`495 / 495` restored files matched source SHA-256 hashes; representative Parquet & JSONL datasets loaded offline)**
> 3. **Approved Independent Backup Destination:** **BLOCKED (`NONE CONFIGURED / APPROVED`)** — Neither `SALMO` nor `HandicapLab` has a configured or operator-approved independent backup target, and Strict Rule 6 prohibits uploading raw provider data (`CAT-1_RAW_PROVIDER_DATA`, `326` files / `775.65 MB`) to third-party storage without explicit access-control and licensing approval. In strict compliance with Task 2, **no unapproved destination (`D:\` or cloud) was silently substituted**.

---

## 2. Backup Destination, Physical Storage Topology & Access Controls

### 2.1 Audit of Configured & Physical Storage Targets

An inspection of all environment files (`.env*` across `SALMO` and `HandicapLab`), repository configurations, and Windows physical storage devices (`Get-PhysicalDisk`, `Get-Volume`, `Get-PSDrive`) established the following hardware and configuration state:

| Target Candidate | Physical Device / Location | Capacity / Free Space | Current Configuration Status | Survives Primary NVMe (`C:\`) Failure? | Survives Host / Site Failure? | Permitted Under Task 2 & Rule 6 Without Explicit Operator Approval? |
| :--- | :--- | :---: | :--- | :---: | :---: | :---: |
| **1. Primary Workstation Drive (`C:\`)** | `DeviceId 1`: `Micron_2400_MTFDKBA512QFM` (NVMe SSD, NTFS) | `511.05 GB` total / `118.41 GB` free | Holds both `SALMO` and `HandicapLab` source trees | **NO (Same physical SSD)** | **NO** | **NO** (Same disk; fails SSD-failure protection) |
| **2. Secondary Internal Drive (`D:\`)** | `DeviceId 0`: `ST500DM009-2DM14C` (SATA HDD, NTFS, `New Volume`) | `500.10 GB` total / `351.15 GB` free | **Unconfigured / Unapproved** (Outside workspace `c:\Users\RYZEN\.antigravity-ide\SALMO`) | **YES (Separate physical disk `DeviceId 0`)** | **NO (Same PC chassis / PSU / OS)** | **NO** (Task 2 forbids silently substituting an unconfigured target) |
| **3. Cloud Object Storage (`gs://salmo-research-warehouse/dribble360/`)** | Google Cloud Storage / S3 / R2 / Supabase Storage | Unprovisioned (`0` buckets) | **Unconfigured** (`NO` env vars or bucket in `.env*`) | **YES** | **YES** | **NO** (Rule 6 forbids uploading raw data to third-party storage without approved access controls & licensing) |
| **4. Removable External Media / Offline Encrypted Vault** | External USB SSD / NAS Share | Not mounted | **Unconfigured** | **YES** | **YES** | **NO** (Not mounted / configured) |

### 2.2 Exact Requirement to Unblock Task 2 (Operator Authorization Needed)

To unblock creation of the persistent independent backup without violating **Task 2** (*no silent substitution*) or **Rule 6** (*no unapproved third-party raw data upload*), the operator must explicitly authorize and configure a two-tier backup target:

1. **Tier 1 — Local Cross-Disk Encrypted Vault on Physical Disk 0 (`D:\`) for Immediate SSD-Failure Protection:**
   - **Target Path:** `D:\SALMO_Backups\dribble360_vault_20261013\` (residing on `DeviceId 0: ST500DM009-2DM14C`, physically independent of `DeviceId 1: Micron_2400_MTFDKBA512QFM` on `C:\`).
   - **Access Controls & Encryption:** Windows NTFS ACL restricted exclusively to `RYZEN` (`icacls "D:\SALMO_Backups\dribble360_vault_20261013" /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)F"`) + AES-256 archive encryption (or BitLocker volume encryption) with strict directory segregation between `CAT-1_RAW_PROVIDER_DATA` (subject to the Nov 27, 2026 purge gate) and `CAT-2..CAT-5` (cleared derived/audit artifacts).
2. **Tier 2 — Off-Host Independent Encrypted Backup (Host/Site-Failure Protection):**
   - **For `CAT-2` through `CAT-5` (Cleared Derived Features, Mappings, Models, Simulations, Reports, and Git Branch Bundle — `169` artifacts, `45.60 MB` uncompressed):**
     - Immediately eligible for upload to a private off-host target (e.g., private GCS bucket `gs://salmo-research-warehouse/dribble360-derived/` with `uniform-bucket-level-access=true`, `public-access-prevention=enforced`, and single-principal IAM, or an external USB drive).
   - **For `CAT-1_RAW_PROVIDER_DATA` (`326` files, `775.65 MB` uncompressed):**
     - Must **only** be copied to an operator-controlled physical external drive (`USB SSD`) or a client-side AES-256-GCM encrypted vault after written vendor retention confirmation is obtained from `bw@dribble360.com`.

---

## 3. Source Inventory & Reconciliation Against `post_subscription_retention_audit.md` (Tasks 1, 3, 6 & 8)

Every Dribble360 file across both `SALMO` and `HandicapLab` (including `HandicapLab/data/cache/` and the local Git branch `research/dribble360-exploit`) has been inventoried with exact relative paths, byte sizes, `LastWriteTimeUtc` timestamps, SHA-256 digests, and licensing classifications in [`dribble360_backup_manifest_v1.json`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/docs/research/dribble360/dribble360_backup_manifest_v1.json).

### 3.1 Exact Reconciliation Table (`post_subscription_retention_audit.md` vs. Full Forensic Inventory)

| Workspace / Namespace | Reported in `post_subscription_retention_audit.md` | Verified in Current Forensic Inventory (`dribble360_backup_manifest_v1.json`) | File Delta | Byte Delta | Forensic Explanation of Reconciliation |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **1. `SALMO/research/` (Working Tree Total)** | `366` files<br>`104,324,649` B | **`366` files**<br>**`104,324,649` B** | **`0`** | **`0` B** | **100% Exact Match.**<br>*(Sub-breakdown clarification: Inside the `366` files, `research/raw_dribble/` contains **`273` files (`82,359,430` B)** and the remaining `research/` subfolders contain **`93` files (`21,965,219` B)**. The prior report's prose cited `270` + `96` = `366` by grouping the 3 top-level `.jsonl` request ledgers [`probe_request_ledger.jsonl`, `request_ledger.jsonl`, `stage2_probe_ledger.jsonl` = `10,055` B] with the non-snapshot files.)* |
| **2. `HandicapLab/data/research/dribble360/`** | `68` files<br>`712,960,121` B | **`73` files**<br>**`715,620,783` B** | **`+5` files** | **`+2,660,662` B** | **Reconciled upward (+5 files / +2.66 MB):**<br>1. The earlier PowerShell discovery filter (`Where-Object { $_.FullName -match "dribble" }`) ran with output truncation and summed `harvest/` as `661,389,195` B instead of the exact `171,907,820 + 489,691,375 = 661,599,195` B (`+210,000` B).<br>2. `raw_captures/` on disk contains `35` files totaling `29,515,327` B (vs. `28,674,625` B previously summed, `+840,702` B).<br>3. All `17` root JSON/JSONL files in `data/research/dribble360/` (`7,239,405` B) are now included rather than `12` (`+5` files, `+1,609,960` B). |
| **3. `HandicapLab/data/cache/dribble_*.json`** | Not separately listed | **`2` files**<br>**`886,447` B** | **`+2` files** | **`+886,447` B** | **Newly Inventoried Raw Cache Files:**<br>• `data/cache/dribble_audit_raw.json` (`19,430` B, SHA-256: `ff5ba0d9...`)<br>• `data/cache/dribble_team_matches_cache.json` (`867,017` B, SHA-256: `9aa32ff3...`) |
| **Subtotal: Working-Tree Files on Disk (`C:\`)** | `434` files<br>`817,284,770` B | **`441` files**<br>**`820,831,879` B** | **`+7` files** | **`+3,547,109` B** | All `441` working-tree files on disk are accounted for and SHA-256 hashed in `dribble360_backup_manifest_v1.json`. |
| **4. `SALMO` Git Branch `research/dribble360-exploit`** | `53` files (prose count) | **`54` tracked files**<br>**`416,549` B** | **`+1` file** (`research/.gitignore`, `110` B) | **`+416,549` B** | **Critical Discovery:** All **`54` files (`416,549` B)** tracked on local branch `research/dribble360-exploit` (including `research/LICENCE_STATUS.md`, `research/scripts/purge_raw.ps1`, `purge_raw.sh`, `stage3a_reconciliation.py`, `stage3b_acquisition.py`, `stage4_feature_pipeline.py`, `stage5_model_validation.py`, and Stage 3B/4/5 reports) are **100% absent from the current working tree on `feat/openfootball-fixture-ingestion`** (`0` overlap with the `366` working-tree files) and exist **only** inside `.git/objects/` on the unpushed local branch `research/dribble360-exploit`! |
| **GRAND TOTAL AUDITED CORPUS** | — | **`495` artifacts**<br>**`821,248,428` B** (~`783.20 MB`) | — | — | **100% Reconciled & Cryptographically Hashed.** |

### 3.2 Complete Subfolder Breakdown Across Both Workspaces

| Workspace | Subfolder / Source | Artifact Count | Total Size (Bytes) | Licensing Category | Git Status on Active Branch |
| :--- | :--- | :---: | :---: | :--- | :---: |
| **SALMO (Working Tree)** | `research/raw_dribble/` (root ledgers) | `3` | `10,055` | `CAT-1_RAW_PROVIDER_DATA` | `!!` Gitignored |
| **SALMO (Working Tree)** | `research/raw_dribble/probe_captures/` | `4` | `72,816` | `CAT-1_RAW_PROVIDER_DATA` | `!!` Gitignored |
| **SALMO (Working Tree)** | `research/raw_dribble/snapshot_20261008_v1/` (root) | `6` | `701,159` | `CAT-1_RAW_PROVIDER_DATA` | `!!` Gitignored |
| **SALMO (Working Tree)** | `research/raw_dribble/snapshot_20261008_v1/matches/` | `214` | `7,545,619` | `CAT-1_RAW_PROVIDER_DATA` | `!!` Gitignored |
| **SALMO (Working Tree)** | `research/raw_dribble/snapshot_20261008_v1/team_matches/` | `6` | `14,699,908` | `CAT-1_RAW_PROVIDER_DATA` | `!!` Gitignored |
| **SALMO (Working Tree)** | `research/raw_dribble/stage2_probe_captures/` | `8` | `14,975,865` | `CAT-1_RAW_PROVIDER_DATA` | `!!` Gitignored |
| **SALMO (Working Tree)** | `research/raw_dribble/stage3b_incremental/` (checkpoint + ledger) | `2` | `26,516` | `CAT-1_RAW_PROVIDER_DATA` | `!!` Gitignored |
| **SALMO (Working Tree)** | `research/raw_dribble/stage3b_incremental/captures/` | `30` | `44,327,492` | `CAT-1_RAW_PROVIDER_DATA` | `!!` Gitignored |
| **SALMO (Working Tree)** | `research/warehouse/` (`matches` & `team_matches` 2026/27) | `2` | `1,288,150` | `CAT-1_RAW_PROVIDER_DATA` | `??` Untracked |
| **SALMO (Working Tree)** | `research/mappings/` | `7` | `9,222,210` | `CAT-2_ENTITY_MAPPINGS_AND_CROSSWALKS` | `??` Untracked |
| **SALMO (Working Tree)** | `research/reports/stage3a/STAGE_3A_UNRESOLVED_QUEUE.csv` | `1` | `8,519,188` | `CAT-2_ENTITY_MAPPINGS_AND_CROSSWALKS` | `??` Untracked |
| **SALMO (Working Tree)** | `research/features/stage4_features_2026_2027.parquet` | `1` | `1,458,885` | `CAT-3_DERIVED_FEATURES_AND_AGGREGATES` | `??` Untracked |
| **SALMO (Working Tree)** | `research/stage3/features/` (`pre_holdout` & `holdout` Parquet) | `2` | `391,087` | `CAT-3_DERIVED_FEATURES_AND_AGGREGATES` | `??` Untracked |
| **SALMO (Working Tree)** | `research/stage3/{models,simulations,validation,manifests}/` | `17` | `560,453` | `CAT-4_MODEL_AND_SIMULATION_ARTIFACTS` | `??` Untracked |
| **SALMO (Working Tree)** | `research/{reports,scripts}/` & `research/stage3/{reports,scripts}/` | `63` | `525,246` | `CAT-5_REPORTS_MANIFESTS_AND_SCRIPTS` | `??` Untracked |
| **SALMO (Git Branch)** | `research/dribble360-exploit` (`.git/objects/` only) | `54` | `416,549` | `CAT-5_REPORTS_MANIFESTS_AND_SCRIPTS` | Local branch only (Not on `origin`) |
| **HandicapLab** | `data/research/dribble360/harvest/*.jsonl` | `14` | `661,599,195` | `CAT-1_RAW_PROVIDER_DATA` | `!!` Gitignored |
| **HandicapLab** | `data/research/dribble360/raw_captures/*.json` | `35` | `29,515,327` | `CAT-1_RAW_PROVIDER_DATA` | `!!` Gitignored |
| **HandicapLab** | `data/cache/dribble_*.json` | `2` | `886,447` | `CAT-1_RAW_PROVIDER_DATA` | `!!` Gitignored |
| **HandicapLab** | `data/research/dribble360/canonical/*` + root mapping JSONs | `4` | `19,914,243` | `CAT-2_ENTITY_MAPPINGS_AND_CROSSWALKS` | `!!` Gitignored |
| **HandicapLab** | `data/research/dribble360/{coverage,quality,schemas}/*` + feature manifest | `4` | `349,075` | `CAT-3_DERIVED_FEATURES_AND_AGGREGATES` | `!!` Gitignored |
| **HandicapLab** | `data/research/dribble360/{replay_*,research_predictions*,shadow_*,*simulation*}` | `5` | `4,000,040` | `CAT-4_MODEL_AND_SIMULATION_ARTIFACTS` | `!!` Gitignored |
| **HandicapLab** | `data/research/dribble360/{manifests,raw}/*` + root audit/usage ledgers | `11` | `242,903` | `CAT-5_REPORTS_MANIFESTS_AND_SCRIPTS` | `!!` Gitignored |
| **TOTAL** | **All Workspaces & Local Git Branch** | **`495`** | **`821,248,428`** | **5 Segregated Categories** | **0 Data Files in Remote Git** |

---

## 4. License-Segregated Classification Matrix (Task 6 — Zero Category Mixing)

To prevent any mixing of licensing categories during backup, retention, or purge operations, all `495` artifacts are partitioned into five strictly disjoint directories/categories in [`dribble360_backup_manifest_v1.json`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/docs/research/dribble360/dribble360_backup_manifest_v1.json):

| Category ID | Description | SALMO Files / Bytes | HandicapLab Files / Bytes | Combined Files / Bytes | Post-Termination Retention Status | Commercial / Production Status |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| **`CAT-1_RAW_PROVIDER_DATA`** | Raw API JSON captures, JSONL bulk harvests, Parquet snapshot tables (`snapshot_20261008_v1`), normalized 303-column match warehouse (`research/warehouse/`), and raw caches (`data/cache/dribble_*`). | `275` files<br>`83,647,580` B | `51` files<br>`692,000,969` B | **`326` files**<br>**`775,648,549` B** (~`739.72 MB`) | **`PENDING VENDOR CONFIRMATION`** (`BLOCKED_PENDING_PROVIDER_CONFIRMATION` after Dec 2, 2026; subject to Nov 27, 2026 purge gate) | **`STRICTLY PROHIBITED`** (Terms §6 & §8 forbid raw display, export, or redistribution) |
| **`CAT-2_ENTITY_MAPPINGS_AND_CROSSWALKS`** | Match, team, and referee entity resolution bridges (`match_mapping.*`, `team_mapping.*`, `referee_mapping.parquet`, `DRIBBLE_MATCH_BRIDGE.json`, `DRIBBLE_TEAM_MAPPING.json`, unresolved queues). | `8` files<br>`17,741,398` B | `4` files<br>`19,914,243` B | **`12` files**<br>**`37,655,641` B** (~`35.91 MB`) | **`PERMITTED (INTERNAL RESEARCH)`** (Crosswalk metadata generated by SALMO/HandicapLab; scrub vendor slugs if raw purge is required) | **`INTERNAL RESEARCH ONLY`** (Not exposed on public APIs) |
| **`CAT-3_DERIVED_FEATURES_AND_AGGREGATES`** | Closed-before-kickoff lagged rolling team feature tables (`stage4_features_2026_2027.parquet`, `pre_holdout_features_v1.parquet`, `holdout_features_2025_2026_v1.parquet`), feature coverage/quality summaries, and schema registries. | `3` files<br>`1,849,972` B | `4` files<br>`349,075` B | **`7` files**<br>**`2,199,047` B** (~`2.10 MB`) | **`CLEARED IN WRITING (OCT 8, 2026)`** (Confirmed by Brian Simiyu `bw@dribble360.com` under Terms §7–§8; verbatim email must be archived) | **`REJECTED BY QUANT GOVERNANCE`** (`DRIBBLE360_SYNC_ENABLED=false`; models failed to beat Pinnacle closing lines) |
| **`CAT-4_MODEL_AND_SIMULATION_ARTIFACTS`** | Fitted model weights (`fitted_models_v1.json`), walk-forward/holdout validation JSONs, pre-holdout & holdout bet simulation ledgers (`bets_ledger_*.parquet`, `replay_prediction_ledger.jsonl`), and stage manifests. | `17` files<br>`560,453` B | `5` files<br>`4,000,040` B | **`22` files**<br>**`4,560,493` B** (~`4.35 MB`) | **`CLEARED (100% OWNED BY SALMO)`** (Terms §7 "Generated Content" + Oct 8, 2026 vendor confirmation) | **`RESEARCH / AUDIT ONLY`** (Models rejected for production in Stages 3 & 5) |
| **`CAT-5_REPORTS_MANIFESTS_AND_SCRIPTS`** | Markdown audit reports, coverage CSVs, Python/TypeScript/PowerShell pipeline & test scripts (`63` SALMO working-tree + `54` branch-only + `11` HandicapLab). | `63` WT + `54` branch<br>`941,795` B | `11` files<br>`242,903` B | **`128` files**<br>**`1,184,698` B** (~`1.13 MB`) | **`CLEARED (100% PROPRIETARY CODE & REPORTS)`** | **`INTERNAL ENGINEERING & GOVERNANCE`** |

---

## 5. Hash Verification & Clean-Restore Test Results (Tasks 4 & 5)

### 5.1 Source vs. Restored Hash Verification Summary
During this audit, all `495` artifacts (`441` working-tree files across `SALMO` and `HandicapLab` + `54` Git-branch-only files from `research/dribble360-exploit`) were copied into a clean, category-segregated isolated directory (`isolated_category_restore_test/{CAT-1..CAT-5}/...`) with all provider credentials removed from the process environment (`DRIBBLE_API_KEY`, `ODDS_PAPI_KEY`, `API_FOOTBALL_KEY` unset) and zero network access:

| Verification Check | Target Scope | Evaluated Count | Verified Count | Missing / Unreadable / Mismatched | Result |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **1. `SALMO/research/` Working-Tree Hash Check** | All Parquet, JSON, JSONL, CSV, MD, PY, PS1 files | `366` files (`104,324,649` B) | `366` files (`104,324,649` B) | **`0` missing · `0` unreadable · `0` mismatched** | **PASS (100%)** |
| **2. `HandicapLab/data/research/dribble360/` Hash Check** | All JSONL bulk harvests, JSON raw captures, bridges, ledgers | `73` files (`715,620,783` B) | `73` files (`715,620,783` B) | **`0` missing · `0` unreadable · `0` mismatched** | **PASS (100%)** |
| **3. `HandicapLab/data/cache/dribble_*.json` Hash Check** | Raw audit & team-matches cache JSON files | `2` files (`886,447` B) | `2` files (`886,447` B) | **`0` missing · `0` unreadable · `0` mismatched** | **PASS (100%)** |
| **4. `SALMO` Git Branch `research/dribble360-exploit` Check** | All tracked blobs in `research/` extracted via `git cat-file blob` | `54` files (`416,549` B) | `54` files (`416,549` B) | **`0` missing · `0` unreadable · `0` mismatched** | **PASS (100%)** |
| **TOTAL CLEAN-RESTORE HASH PARITY** | **All 5 Licensing Categories (`CAT-1` – `CAT-5`)** | **`495` files (`821,248,428` B)** | **`495` files (`821,248,428` B)** | **`0` missing · `0` unreadable · `0` mismatched** | **PASS (100%)** |

### 5.2 Offline Dataset Load Verification From Clean Restore (Zero Credentials, Zero Network)
Representative Parquet and JSONL datasets across `CAT-1`, `CAT-2`, `CAT-3`, and `CAT-4` were loaded directly from the isolated clean-restore directory using `pandas`/`pyarrow` and native JSONL streaming:

| Restored Dataset | Licensing Category | Format | Verified Dimensions (Rows $\times$ Cols) | SHA-256 Digest Verified Before Load | Load Status |
| :--- | :--- | :---: | :---: | :--- | :---: |
| `research/features/stage4_features_2026_2027.parquet` | `CAT-3_DERIVED_FEATURES_AND_AGGREGATES` | Parquet | `3,662 rows × 182 cols` | `3c2b3df8a28531e337f85222844763f36d21276cb27bd34b1e6ef13a1f317896` | **PASS** |
| `research/stage3/features/pre_holdout_features_v1.parquet` | `CAT-3_DERIVED_FEATURES_AND_AGGREGATES` | Parquet | `1,748 rows × 50 cols` | `f9cad168d9e09eed7b09e5827e9397ff4c206c674dad343eb91df8782d05db93` | **PASS** |
| `research/stage3/features/holdout_features_2025_2026_v1.parquet` | `CAT-3_DERIVED_FEATURES_AND_AGGREGATES` | Parquet | `342 rows × 50 cols` | `c27a67d702fa4941ca16dcb657b056b596eb11008826cd9f5e27f88dcb07b2a2` | **PASS** |
| `research/mappings/match_mapping.parquet` | `CAT-2_ENTITY_MAPPINGS_AND_CROSSWALKS` | Parquet | `44,302 rows × 12 cols` | `3909d681da28eedcdfde372fcc6df6a7bb9ef5640f4b54f2ce0291e289589773` | **PASS** |
| `research/warehouse/team_matches_2026_2027.parquet` | `CAT-1_RAW_PROVIDER_DATA` | Parquet | `6,328 rows × 303 cols` | `c8de1b2d1f2c19ba2a56427c5515efb57f8c3d23c024152aeef443d28e85348f` | **PASS** |
| `data/research/dribble360/harvest/team_matches_2025_2026.jsonl` | `CAT-1_RAW_PROVIDER_DATA` | JSONL | `11,916 lines × 303 keys` | `1b68f57b4122aa0268981cd1e312b93b95196b8f45b01ed70052099ff3411a12` | **PASS** |
| `data/research/dribble360/replay_prediction_ledger.jsonl` | `CAT-4_MODEL_AND_SIMULATION_ARTIFACTS` | JSONL | `6,266 lines` | `2540f7032d3a51744d8eb1f5657b43556ce1af493cba5e373a2816c7b0c4f543` | **PASS** |

*(After verification completed, the temporary scratch restore directory on `C:\` was removed so zero unapproved duplicate copies remain on the primary SSD.)*

---

## 6. Forensic Inspection of Existing Purge Scripts (Task 7 — Report Only)

Per Task 7 (*"Inspect existing purge scripts for raw-data paths they omit. Report findings only; do not execute or modify purge scripts"*), we inspected `research/scripts/purge_raw.ps1` (Git blob `dec9f865fc585eeb5c39dcf5c1578163cfdbaafc`, `2,160` bytes) and `research/scripts/purge_raw.sh` (Git blob `43412af1fb3fa2d4c7b5a9749a1e138e0fb4e740`, `1,606` bytes) committed on branch `research/dribble360-exploit`.

### 6.1 What `purge_raw.ps1` and `purge_raw.sh` Currently Purge
Both scripts define only two target directories relative to `SALMO/research/`:
1. `$researchDir\raw_dribble` (`$RESEARCH_DIR/raw_dribble`) — **`273` files (`82,359,430` bytes / ~`78.54 MB`)**
2. `$researchDir\cache` (`$RESEARCH_DIR/cache`) — **`0` files (`0` bytes; directory does not exist)**

### 6.2 Raw-Data Paths Omitted by `purge_raw.ps1` and `purge_raw.sh`
If executed as written on November 27, 2026, `purge_raw.ps1` / `purge_raw.sh` would delete only **`10.62%` (`82.36 MB`)** of the **`775.65 MB`** of `CAT-1_RAW_PROVIDER_DATA` on disk, **omitting `53` raw provider data files totaling `693,289,119` bytes (~`661.17 MB` / `89.38%` of all raw data)**:

| Omitted Raw-Data Path | Workspace | Files Omitted | Bytes Omitted | Why This Path Is `CAT-1_RAW_PROVIDER_DATA` (Must Not Be Omitted From Raw Purge Scope) |
| :--- | :--- | :---: | :---: | :--- |
| **1. `SALMO/research/warehouse/team_matches_2026_2027.parquet`** | `SALMO` | `1` | `942,082` | Contains `6,328` deduplicated rows with **all `303` raw per-match Opta event columns** (`expected_goals`, `att_ibox_*`, `accurate_pass`, `ppda`, etc.) from `/team_matches?season=2026/2027`. It is a normalized copy of raw vendor rows, **not** a derived/aggregated feature table. |
| **2. `SALMO/research/warehouse/matches_2026_2027.parquet`** | `SALMO` | `1` | `346,068` | Contains `3,662` deduplicated rows with all `22` raw match catalog fields from `/matches?season=2026/2027`. |
| **3. `HandicapLab/data/research/dribble360/harvest/*.jsonl`** | `HandicapLab` | `14` | `661,599,195` | Contains the raw JSONL bulk harvest of `310,114` `matches` lines (`7` files) and `70,651` `team_matches` lines (`6` populated files + `1` empty stub) with all `303` raw Opta columns per team-match. |
| **4. `HandicapLab/data/research/dribble360/raw_captures/*.json`** | `HandicapLab` | `35` | `29,515,327` | Contains raw HTTP response payloads captured directly from Dribble360 endpoints, including `player_matches_2b4d3000aafc7578.json` (`10,241,576` B), `team_matches_2b4d3000aafc7578.json` (`9,891,660` B), `matches_*.json` (`10` files, ~`7.14 MB`), `players_*.json` (`610,120` B), `referees_*.json` (`591,045` B), `teams_*.json` (`408,407` B), `transfers_*.json` (`316,944` B), and `managers_*.json` (`303,784` B). |
| **5. `HandicapLab/data/cache/dribble_team_matches_cache.json` & `dribble_audit_raw.json`** | `HandicapLab` | `2` | `886,447` | Raw cached Dribble360 API responses stored in `HandicapLab/data/cache/` (`867,017` B + `19,430` B). |
| **TOTAL OMITTED BY EXISTING PURGE SCRIPTS** | **Both** | **`53` files** | **`693,289,119` B** (~`661.17 MB`) | **89.38% of `CAT-1_RAW_PROVIDER_DATA` on disk is currently missed by `purge_raw.ps1` / `purge_raw.sh`.** |

> [!WARNING]
> **Additional Operational Defect in `purge_raw.ps1` / `purge_raw.sh`:**
> Because `purge_raw.ps1` and `purge_raw.sh` were committed *only* on the local branch `research/dribble360-exploit`, **neither script exists in the working tree when `SALMO` is checked out on `feat/openfootball-fixture-ingestion` or `main`**.

---

## 7. Raw-Data Licensing Status & Outstanding Vendor Confirmation

1. **Raw Data (`CAT-1_RAW_PROVIDER_DATA` — `326` files, `775,648,549` bytes):**
   - **Redistribution / Public Exposure:** **STRICTLY PROHIBITED** under Dribble360 Terms of Service §6 and §8. Enforced by `research/scripts/ci_check_raw_leakage.ps1` (`0` references in `SALMO/src/`).
   - **Post-Termination Retention (After November 2 / December 2, 2026):** **`UNVERIFIED / PENDING VENDOR CONFIRMATION` (`BLOCKED_PENDING_PROVIDER_CONFIRMATION`)**. Under Dribble360 Terms §11 (*"Upon termination, your right to use the Service immediately ceases"*) and the Official Vendor Retention FAQ (*"Dataset access ends after the paid or evaluation period. Under the signed Max addendum, approved internal raw archives and derived models may be retained... otherwise the standard Terms apply"*), **raw data may NOT be assumed retainable after subscription termination**.
   - **Action Required:** Obtain explicit written confirmation from Brian Simiyu (`bw@dribble360.com`) before the **November 27, 2026** hard stop regarding whether internal encrypted archival of `CAT-1_RAW_PROVIDER_DATA` is permitted post-termination. If denied or unanswered by November 27, 2026, all `326` `CAT-1_RAW_PROVIDER_DATA` files (`775,648,549` bytes across both `SALMO` and `HandicapLab`, plus any backup copies of `CAT-1`) must be permanently purged.
2. **Derived Features, Aggregates, Models & Reports (`CAT-2` through `CAT-5` — `169` artifacts, `45,599,879` bytes):**
   - Reported in `research/LICENCE_STATUS.md` (§2.3a & §4.1) as **CLEARED IN WRITING** by Brian Simiyu (`bw@dribble360.com`) on October 8, 2026 under Terms §7 ("Generated Content") and §8 ("API Elite Commercial Use").
   - **Action Required:** Archive the verbatim October 8, 2026 email/addendum from `bw@dribble360.com` inside `docs/research/dribble360/` as permanent legal evidence. Note that in code (`HandicapLab/src/lib/salmo/dribble360SyncContract.ts`), `DRIBBLE360_SYNC_ENABLED=false` and `DRIBBLE360_LICENSE_CLEARED=false` remain locked, and all candidate Dribble360 models were rejected for production in Stages 3 and 5.

---

## 8. Exact Unblocking Steps for Operator

To transition this gate from **`BLOCKED`** to **`PASS`**, please provide explicit authorization for one of the following backup destinations:

1. **Option A (Recommended Immediate Local Cross-Disk + Off-Host Split):**
   - Authorize creating an AES-256 encrypted, category-segregated backup on the secondary physical disk **`D:\SALMO_Backups\dribble360_vault_20261013\`** (`DeviceId 0: ST500DM009-2DM14C`, `351.15 GB` free, separate physical drive from `C:\`) **AND** specify an external USB drive letter or private encrypted off-host bucket URI for off-machine durability.
2. **Option B (Cleared Artifacts Only to Cloud + Raw on Local Secondary Disk):**
   - Authorize uploading `CAT-2` through `CAT-5` (`169` non-raw artifacts, `45.60 MB`, plus the `research/dribble360-exploit` Git bundle) to a private cloud bucket while isolating `CAT-1_RAW_PROVIDER_DATA` (`326` files, `775.65 MB`) in an encrypted container on `D:\SALMO_Backups\dribble360_raw_quarantine\` until `bw@dribble360.com` confirms post-termination raw retention rights.
