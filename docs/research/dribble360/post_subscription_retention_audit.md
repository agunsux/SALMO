# SALMO — POST-UNSUBSCRIPTION DATA RETENTION AUDIT (DRIBBLE360)

**Audit Timestamp (UTC):** `2026-10-12T20:33:00Z` (`2026-10-13T03:33:00+07:00`)
**Workspace:** `c:\Users\RYZEN\.antigravity-ide\SALMO` (with cross-workspace reconciliation against `c:\Users\RYZEN\.antigravity-ide\HandicapLab`)
**Active Git Branch:** `feat/openfootball-fixture-ingestion` (`HEAD` = `bb0f6451c40c61530028e5c490698e2400072491`)
**Quarantined Research Branch:** `research/dribble360-exploit` (`HEAD` = `9f00d7d550a64666c8e37cd44d99b115c1f7456d`, research commit `9fd21836dae96162c66795b5017b3d4fa97bb7b8`)
**Audit Mode:** STRICT READ-ONLY ON EXISTING DATA (0 files deleted, overwritten, or migrated; 0 external API calls; 0 DB mutations)
**Overall Preservation Verdict:** **`PARTIAL / BLOCKED — LOCAL DISK ONLY (NO OFF-HOST BACKUP) & RAW POST-EXPIRY RETENTION UNCONFIRMED`**

---

## 1. Executive Summary & Four-Pillar Verdict Matrix

Before Dribble360 access terminates (initial billing cycle ending **November 2, 2026**; extended Elite evaluation hard-stop **November 27, 2026** / entitlement expiry **December 2, 2026**), SALMO required forensic proof across four pillars: **Location**, **Completeness**, **Backup/Restore**, and **Licensing**.

| Pillar | Audit Verdict | Forensic Finding Summary | Blocking Risk / Required Remediation |
| :--- | :---: | :--- | :--- |
| **1. Storage Location & Redeploy Survival** | **`AT RISK (LOCAL ONLY)`** | All **366 files (`104,324,649` bytes)** in `SALMO/research/` and **68 files (`712,960,121` bytes)** in `HandicapLab/data/research/dribble360/` reside **exclusively on the local workstation NVMe/SSD**. **0%** is stored in Supabase PostgreSQL, cloud object storage (GCS/S3/R2), or remote Git (`origin`). All `.parquet`, `.jsonl`, and raw capture files are **gitignored (`!!`)** or **untracked (`??`)**. | While a Vercel/container redeploy does not wipe the local workstation, **0% of this data exists in deployed containers**, and a local `git clean -fdX` / `git clean -fdx` or workstation disk failure would cause **100% permanent data loss**. |
| **2. Completeness & Cryptographic Reconciliation** | **`VERIFIED (WITH DOCUMENTED VENDOR GAPS)`** | **100% (`225/225`)** of Parquet files in `snapshot_20261008_v1`, **100% (`14/14`)** of JSONL harvest files in HandicapLab, and all **20** warehouse, mapping, feature, model, and simulation Parquet/JSON datasets in SALMO match their recorded SHA-256 checksums and row counts (`0` corruption/mismatches). | Known vendor-side gaps are immutable without re-harvest or cannot be fixed upstream: pre-2020 Opta data does not exist (`0` rows), `team_matches_2019_2020.jsonl` is `0` bytes, `teams`/`players`/`referees`/`transfers` are truncated at `1,000` rows, and WBA (2020/21) / Nottm Forest (2022–26) are absent from the trial snapshot. |
| **3. Independent Backup & Clean Restore** | **`NO PRE-EXISTING BACKUP / CLEAN RESTORE PROVEN`** | **No independent off-directory or cloud backup existed prior to this audit** (`SALMO/data/backup/` holds only 4 prediction-ledger files; `gs://salmo-research-warehouse/dribble360/` was never provisioned). During this audit, a read-only clean-restore verification packaged all **366 files (`104.32 MB` $\to$ `27.71 MB` ZIP)** and restored them into an isolated clean environment with `DRIBBLE_API_KEY=None`, achieving **366/366 (`100%`) SHA-256 parity** and full offline readability. | Must persist an encrypted/private off-host backup bundle of derived/cleared artifacts (and push the local branch `research/dribble360-exploit` scripts/reports) so single-host disk failure cannot destroy the research corpus. |
| **4. License & Post-Termination Rights** | **`SPLIT: DERIVED CLEARED (INTERNAL) / RAW PENDING`** | Per `research/LICENCE_STATUS.md` (Terms §6, §7, §8, §11 + Oct 8, 2026 written confirmation from Brian Simiyu `bw@dribble360.com`), **derived feature tables, aggregates, and model weights belong to SALMO and may be retained**, whereas **raw data redistribution is strictly prohibited (§6, §8)** and **post-expiry retention of raw cached payloads (`raw_dribble/`, `harvest/`) remains `PENDING` written vendor confirmation** (with `purge_raw.ps1` staged for Nov 27, 2026). | Do **not** assume raw Dribble360 captures (`raw_dribble/`, `harvest/*.jsonl`) may be legally retained after contract termination without explicit written sign-off from `bw@dribble360.com` or a signed Max addendum. Keep `DRIBBLE360_SYNC_ENABLED=false` and `DRIBBLE360_LICENSE_CLEARED=false`. |

> [!CAUTION]
> **No False Preservation Claim:** Because (1) **zero off-host/cloud backups** currently exist outside `C:\Users\RYZEN\.antigravity-ide\`, (2) all `.parquet` and `.jsonl` datasets are **untracked/gitignored in Git**, and (3) **post-termination raw data retention is contractually unconfirmed**, Dribble360 data preservation is **NOT** complete. See Section 6 for the mandatory action checklist before unsubscription.

---

## 2. Storage Location & Ephemeral / Redeploy Risk Audit

### 2.1 Storage Tier Matrix Across SALMO & HandicapLab

| Storage Tier / Environment | Path / Namespace | Dribble360 Data Present? | Git Status | Survives Container / Vercel Redeploy? | Survives `git clean -fdX` / `-fdx`? | Survives Local Disk Failure? |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **1. SALMO Raw Quarantine (Local Disk)** | `c:\Users\RYZEN\.antigravity-ide\SALMO\research\raw_dribble\` | **YES (`270` files, `82,350,459` B)** | **`!!` Gitignored** (`.gitignore` L38) | N/A (Never deployed to container; local disk only) | **NO (Destroyed by `-fdX` / `-fdx`)** | **NO (Single point of failure)** |
| **2. SALMO Normalized Warehouse, Mappings, Features & Stage 3 (Local Disk)** | `c:\Users\RYZEN\.antigravity-ide\SALMO\research\{warehouse,mappings,features,stage3,reports,scripts}\` | **YES (`96` files, `21,974,190` B)** | **`??` Untracked** on `feat/*` & `main`; `.parquet`/`.csv`/`.jsonl` **Gitignored** on `research/dribble360-exploit` | N/A (Never deployed to container; local disk only) | **NO (Destroyed by `-fdx`)** | **NO (Single point of failure)** |
| **3. SALMO Local Git Branch (`research/dribble360-exploit`)** | `.git/objects/` (`commit 9fd21836...` / `9f00d7d5...`) | **PARTIAL (`53` code/report files, `0` Parquet/JSONL datasets)** | **Committed locally ONLY** (`remotes/origin/research/dribble360-exploit` does **not** exist) | N/A (Local Git object store only) | **YES** (Protected in `.git`, unless repo deleted) | **NO (Not pushed to `origin`)** |
| **4. HandicapLab Raw Harvest & Canonical Bridge (Local Disk)** | `c:\Users\RYZEN\.antigravity-ide\HandicapLab\data\research\dribble360\` | **YES (`68` files, `712,960,121` B)** | **`!!` Gitignored** (`HandicapLab/.gitignore` L127) | N/A (Local disk only) | **NO (Destroyed by `-fdX` / `-fdx`)** | **NO (Single point of failure)** |
| **5. Production Database (Supabase PostgreSQL)** | `public.*` (`daily_picks`, `quota_state`, etc.) | **NO (`0` tables, `0` rows)** | Schema tracked in `data/migrations/` | **YES** (Persistent cloud DB, but holds **0** Dribble data) | **YES** | **YES** |
| **6. Cloud Object Storage (GCS / S3 / Supabase Storage)** | Proposed `gs://salmo-research-warehouse/dribble360/` | **NO (`0` buckets, `0` objects)** | N/A | **NO (Never provisioned or uploaded)** | N/A | N/A |
| **7. Local Backup Folder (`SALMO/data/backup/`)** | `c:\Users\RYZEN\.antigravity-ide\SALMO\data\backup\` | **NO (`0` Dribble files; only 4 prediction ledger backups)** | **`!!` Gitignored** (`.gitignore` L37) | N/A | **NO** | **NO** |

### 2.2 Critical Findings on Ephemeral & Untracked Exposure

1. **Zero Backend Database or Cloud Storage Persistence:**
   - Static and runtime inspection confirms that SALMO's Supabase PostgreSQL database and Vercel deployment artifacts contain **zero** Dribble360 tables, records, or derived features.
   - While [`STAGE_1_ACQUISITION_PLAN.md`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/research/reports/stage1/STAGE_1_ACQUISITION_PLAN.md#L73-L76) recommended storing partitioned Parquet files in `gs://salmo-research-warehouse/dribble360/` and tracking harvests in Postgres (`harvest_ledger`, `match_bridge`), **neither the GCS bucket nor the Postgres tables were ever created**.
2. **Branch Checkout & `.gitignore` Trap in `SALMO/research/`:**
   - On the local branch `research/dribble360-exploit`, [`research/.gitignore`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/research) explicitly ignores `raw_dribble/`, `*.parquet`, `*.jsonl`, `*.csv`, `*.tar.gz`, `*.zip`, and `cache/`.
   - Consequently, when switching branches from `research/dribble360-exploit` to `feat/openfootball-fixture-ingestion`, Git removed the 53 tracked Markdown/Python files (Stage 3B, Stage 4, and Stage 5 scripts/reports) from the working tree while leaving all `.parquet`, `.csv`, `.jsonl`, and `stage3/` files behind as **untracked (`?? research/`)** and **gitignored (`!! research/raw_dribble/`)** files.
   - Furthermore, `research/dribble360-exploit` has **never been pushed to `origin`** (per Case B governance in `STAGE_5_FINAL_VERDICT.md`).

---

## 3. Completeness & Cryptographic Reconciliation

Every Dribble360 dataset on disk was inspected via a read-only Python verification harness (`uv run --with pandas --with pyarrow python`). All byte sizes, record counts, unique entity IDs, seasons, competitions, and SHA-256 digests below are empirically measured from disk.

### 3.1 Layer 1A — SALMO Raw Historical Snapshot (`research/raw_dribble/snapshot_20261008_v1/`)

- **Directory Path:** `c:\Users\RYZEN\.antigravity-ide\SALMO\research\raw_dribble\snapshot_20261008_v1`
- **Manifest File:** [`manifest.json`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/research/raw_dribble/snapshot_20261008_v1/manifest.json) (`44,716` bytes, SHA-256: `f30d71a8966103b26735481fbdb79f32f79562240542c6ff3f1c958431f0ac54`)
- **Manifest Verification:** **`225 / 225` Parquet files verified bit-for-bit (`0` missing, `0` SHA-256 mismatches, `119,694` total rows, `22,901,970` data bytes + `44,716` manifest bytes = `22,946,686` bytes)**

| Dataset Path (Relative to `snapshot_20261008_v1/`) | Files | Rows / Records | Cols | Unique Primary IDs | Seasons Covered | Competitions / Scope | Size (Bytes) | SHA-256 Checksum | Reconciliation Status |
| :--- | :---: | :---: | :---: | :--- | :--- | :--- | :---: | :--- | :---: |
| `matches/matches_*.parquet` | 214 | `44,302` | 24 | `44,302` `id` (`match_id`), `214` `season_id` | `2020/21` – `2026/27` (`2020-02-29` to `2026-11-29`) | `214` global competition-season buckets (Big 5, UEFA, domestic cups, secondary leagues) | `7,545,619` | Verified across all 214 entries in `manifest.json` (`0` mismatches) | **100% COMPLETE** |
| `team_matches/team_matches_2020_2021.parquet` | 1 | `11,066` | 307 | `5,533` `match_id`, `1,612` `team_id` | `2020/2021` | Multi-league (incl. `342` ENG-PL matches; WBA missing upstream) | `2,395,365` | `0c9d91fdd0ba5298b76c780d95e0df9b54d95dfe1d4bcd7f2e7f7384210bcc77` | **VERIFIED (WBA missing upstream)** |
| `team_matches/team_matches_2021_2022.parquet` | 1 | `11,778` | 307 | `5,890` `match_id`, `1,573` `team_id` | `2021/2022` | Multi-league (incl. `380/380` ENG-PL matches) | `2,427,327` | `e972013a42114eeb70d4735ab8f89d2595b9af8750faebec0d361c1b7a3017db` | **100% COMPLETE** |
| `team_matches/team_matches_2022_2023.parquet` | 1 | `11,778` | 307 | `5,889` `match_id`, `1,572` `team_id` | `2022/2023` | Multi-league (incl. `342` ENG-PL matches; Nottm Forest missing upstream) | `2,437,467` | `d61be34d43dd0994e407ce9f219eba90b44e2e1f3f01da1c5cd1a44e44a95cd2` | **VERIFIED (NFO missing upstream)** |
| `team_matches/team_matches_2023_2024.parquet` | 1 | `11,724` | 307 | `5,862` `match_id`, `1,572` `team_id` | `2023/2024` | Multi-league (incl. `342` ENG-PL matches; Nottm Forest missing upstream) | `2,460,129` | `be1c4e4eb6ba8c90559d663248b2bd2f172581f3994c1dc4f9717fc978a10b9e` | **VERIFIED (NFO missing upstream)** |
| `team_matches/team_matches_2024_2025.parquet` | 1 | `12,138` | 307 | `6,069` `match_id`, `1,668` `team_id` | `2024/2025` | Multi-league (`342` ENG-PL, `380` ESP, `380` ITA, `306` DEU, `306` FRA) | `2,499,805` | `95f812e5ae53844a493b63065826d6f47ac6a48498c3cbe5313df74424d74b9e` | **VERIFIED (Big 4 100%, PL ex-NFO)** |
| `team_matches/team_matches_2025_2026.parquet` | 1 | `11,908` | 307 | `5,954` `match_id`, `1,593` `team_id` | `2025/2026` | Multi-league (`342` ENG-PL, `380` ESP, `380` ITA, `306` DEU, `306` FRA) | `2,479,815` | `ad7ea8354b98acb89bb54d11e0592b4867a46eda00095ae2792add49c099e81c` | **VERIFIED (Big 4 100%, PL ex-NFO)** |
| **Subtotal `team_matches/`** | **6** | **`70,392`** | **307** | **`35,197` `match_id`, `2,839` `team_id` (`70,392` unique pairs)** | **`2020/21` – `2025/26`** | **13+ leagues & cups** | **`14,699,908`** | — | **100% DEDUPLICATED** |
| `players.parquet` | 1 | `1,000` | 17 | `1,000` `id` (`10` `api_football_id`) | Cross-season | Global (Page 1 only) | `132,864` | `116268bf91b020e5efb6e53a2aa4e390422dfccb9f51c55fb678219685ebb361` | **TRUNCATED AT 1,000 ROWS** |
| `player_matches.parquet` | 1 | `1,000` | 308 | `24` `match_id`, `45` `team_id`, `944` `player_id` | Sample | Global evaluation sample | `315,794` | `39e3c8b557cbb8453e9755a6bafe28a5e3d4ef9ec5339426354b3bd5a97d70a7` | **TRUNCATED SAMPLE (1,000 ROWS)** |
| `referees.parquet` | 1 | `1,000` | 17 | `198` `match_id`, `641` `referee_id` | Cross-season | Global (`0` overlap with ENG-PL pre-holdout) | `46,603` | `3383e69342cc0910236a8c052672ccf07135a3d3eb9e3e635bb7ace0C351d280` | **TRUNCATED AT 1,000 ROWS** |
| `teams.parquet` | 1 | `1,000` | 12 | `1,000` `id`, `42` `country_id` | Cross-season | Alphabetically truncated at `'Belišće'` | `98,589` | `65ba8f77a0b5861fb7dd2d9b1fcadb152da34d3cdde0a641de537558e3f7a7a0` | **TRUNCATED AT 1,000 ROWS** |
| `transfers.parquet` | 1 | `1,000` | 8 | `948` `player_id`, `439` `from_team_id`, `525` `to_team_id` | Cross-season | Global (Page 1 only) | `62,593` | `b6144b268c4bd74a97edb2bc437035e54ffdd49c6fe90c00650d21933f3baae6` | **TRUNCATED AT 1,000 ROWS** |

---

### 3.2 Layer 1B — SALMO Raw Incremental & Probe Captures (`research/raw_dribble/`)

| Dataset / Capture Path (Relative to `SALMO/research/raw_dribble/`) | Files | Rows / Lines | Seasons Covered | Description & Scope | Size (Bytes) | SHA-256 Checksum |
| :--- | :---: | :---: | :--- | :--- | :---: | :--- |
| `probe_captures/call_01_team_matches_401.json` | 1 | 1 error payload | `2026/2027` | Phase 1 HTTP 401 expired trial key evidence | `224` | `ae5ad736fdcf672cf037d6d19f3ac9270970048e364f53f593d35250ccb7d53a` |
| `probe_captures/reprobe_call_01_team_matches_401.json` | 1 | 1 error payload | `2026/2027` | Phase 1 reprobe HTTP 401 evidence | `224` | `ae5ad736fdcf672cf037d6d19f3ac9270970048e364f53f593d35250ccb7d53a` |
| `probe_captures/stage0_req_01_team_matches_200.json` | 1 | `5` rows (`303` cols) | `2026/2027` | Stage 0 `/team_matches?season=2026/2027&limit=5&offset=0` | `36,154` | `70cf4127c74048a879c41a488d416454747a7e6077d07086bfca508a56f09fca` |
| `probe_captures/stage0_req_02_player_matches_200.json` | 1 | `5` rows (`307` cols) | `2026/2027` | Stage 0 `/player_matches?season=2026/2027&limit=5&offset=0` | `36,214` | `e4d54a05d3f9ac69a2abeda05bf2b68ce946926ad6ba88bcca8d125091634418` |
| `stage2_probe_captures/stage2_req_01_team_matches_2026_2027_lim1000_off0_200.json` | 1 | `1,000` rows | `2026/2027` | Stage 2 `/team_matches` page 1 (`offset=0`, `limit=1000`) | `7,174,296` | `c0f43d19d5f9e756047af52dde57266e24dfb109fc89b4b1d3b8d008184a7f77` |
| `stage2_probe_captures/stage2_req_02_team_matches_2026_2027_lim1000_off1000_200.json` | 1 | `1,000` rows | `2026/2027` | Stage 2 `/team_matches` page 2 (`offset=1000`, `limit=1000`) | `7,174,304` | `61ccc3e7a4c7e8c2ad0be47489d3cd81362628b70e3e463d4205c051f20b9a1b` |
| `stage2_probe_captures/stage2_req_03_team_matches_2026_2027_lim10_off0_200.json` | 1 | `10` rows | `2026/2027` | Stage 2 sort-order verification (`order=desc`) | `71,991` | `ba0c8df80a39dd89220fff17614726bd32a9ca0e76c57e616ba6e27f34cb59b4` |
| `stage2_probe_captures/stage2_req_04_matches_2026_2027_lim1000_off0_200.json` | 1 | `1,000` rows | `2026/2027` | Stage 2 `/matches` page 1 (`offset=0`, `limit=1000`) | `554,050` | `c2d3d934ad3955e261866ccc4ee9becf4b0f1e51f2e4187ae05a2b54228ea2b1` |
| `stage2_probe_captures/stage2_req_05..08_team_matches_2016..2020_lim10_off0_200.json` | 4 | `0` rows each | `2016/17` – `2019/20` | Pre-2020 depth probes proving 0 rows exist prior to 2020/21 | `1,224` (`306` × 4) | `fc06f91c...`, `4289ef3c...`, `8c407654...`, `264ec557...` |
| `stage3b_incremental/captures/*.json` | 30 | `29,332` raw rows (`4,332` `team_matches` + `25,000` `matches`) | `2026/2027` | `5` `team_matches` pages (`offsets 2000..6000`) + `25` `matches` pages (`offsets 1000..25000`) | `44,327,492` | Combined tree SHA-256: `3967087b2ac3028b41d32a172cd0c16825d2ac8176d0a146944a669260d6a2c6` |
| `stage3b_incremental/stage3b_checkpoint.json` | 1 | `87` lines | `2026/2027` | Stage 3B pagination completion checkpoint (`6,332` `team_matches`, `26,000` `matches`) | `6,323` | `19835a83628d4608c0206bce2fbe29e47aa4d0cb67cf5c13a65f62a848a18fe0` |
| `stage3b_incremental/stage3b_request_ledger.jsonl` | 1 | `30` lines | `2026/2027` | Immutable request ledger for Stage 3B (`30` API calls) | `20,193` | `b0e09b57fc4419dc5eabe5f850d47dfc63c454cd4f3a356e166685bf11869c7a` |
| `probe_request_ledger.jsonl`, `request_ledger.jsonl`, `stage2_probe_ledger.jsonl` | 3 | `4`, `8`, `8` lines | `2020` – `2027` | Immutable request ledgers for Stage 0, trial harvest, and Stage 2 | `10,055` (`2,629` + `2,260` + `5,166`) | `b6225f8f...`, `24052b55...`, `55c6d912...` |

---

### 3.3 Layer 1C — Cross-Workspace Raw Harvest (`HandicapLab/data/research/dribble360/`)

- **Manifest File:** [`HandicapLab/data/research/dribble360/manifests/WAREHOUSE_MANIFEST.json`](file:///c:/Users/RYZEN/.antigravity-ide/HandicapLab/data/research/dribble360/manifests/WAREHOUSE_MANIFEST.json) (`3,651` bytes, SHA-256: `cb9859701a6a9510a91d4dfcb4c4f5118490255b1c921d49f8ec17c818c80491`)
- **Verification:** **`14 / 14` bulk harvest JSONL files verified bit-for-bit (`661,389,195` bytes)**

| File Name (`HandicapLab/data/research/dribble360/harvest/`) | Raw Lines | Deduplicated Rows | Unique Matches | Season | Size (Bytes) | SHA-256 Checksum | Audit Note |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- | :--- |
| `matches_2019_2020.jsonl` … `matches_2025_2026.jsonl` (7 files) | `44,302` each (`310,114` total) | `44,302` | `44,302` | `2020/21` – `2026/27` | `24,558,260` each (`171,907,820` total) | `2bead2b87ec972049d648fb027a315e97eabad2759a69e9c86968d8e8501e2e9` | **7 byte-identical clones** (`/matches` ignored `season` filter) |
| `team_matches_2019_2020.jsonl` | `0` | `0` | `0` | `2019/2020` | `0` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | **Empty 0-byte stub** (Vendor has no pre-2020 Opta data) |
| `team_matches_2020_2021.jsonl` | `11,096` | `11,066` | `5,533` | `2020/2021` | `76,911,704` | `04eb346d94f3ad67f4a79325bceac5941b9c9d04edd8cf072d39015a0811abe7` | `30` duplicate rows dropped in Parquet snapshot |
| `team_matches_2021_2022.jsonl` | `11,861` | `11,778` | `5,890` | `2021/2022` | `82,295,127` | `25c28559baf16758f90228d35cdc3e64c0ab92409b25021a9292c3bdd8e3814d` | `83` duplicate rows dropped in Parquet snapshot |
| `team_matches_2022_2023.jsonl` | `11,846` | `11,778` | `5,889` | `2022/2023` | `82,164,503` | `7e16a113199d04d1a07b204c3cea34aab2b81239e486a09ae95048204f85f70d` | `68` duplicate rows dropped in Parquet snapshot |
| `team_matches_2023_2024.jsonl` | `11,794` | `11,724` | `5,862` | `2023/2024` | `81,695,456` | `84b4b82035499037990c280f3e0c2282c7e9ed81b9816f15e66208f1a704fda2` | `70` duplicate rows dropped in Parquet snapshot |
| `team_matches_2024_2025.jsonl` | `12,138` | `12,138` | `6,069` | `2024/2025` | `84,111,303` | `df0d1450ca74d53c55ba2a82b76cfdb798f3da890c78d939b2600aa8a6c36759` | `0` duplicates |
| `team_matches_2025_2026.jsonl` | `11,916` | `11,908` | `5,954` | `2025/2026` | `82,513,282` | `1b68f57b4122aa0268981cd1e312b93b95196b8f45b01ed70052099ff3411a12` | `8` duplicate rows dropped in Parquet snapshot |

---

### 3.4 Layer 2 — SALMO Normalized Active-Season Warehouse (`research/warehouse/`)

| Dataset Path (Relative to `SALMO/`) | Rows | Cols | Unique IDs & Breakdown | Season & Date Window | Competitions | Size (Bytes) | SHA-256 Checksum |
| :--- | :---: | :---: | :--- | :--- | :--- | :---: | :--- |
| [`research/warehouse/matches_2026_2027.parquet`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/research/warehouse/matches_2026_2027.parquet) | `3,662` | 22 | `3,662` `id` (`PLAYED`: `2,322`, `FIXTURE`: `1,336`, `CANCELLED`: `2`, `AWARDED`: `1`, `POSTPONED`: `1`) | `2026/2027` (`2026-07-07` to `2026-12-07`) | `28` `season_id` competitions (Big 5 + UEFA + cups) | `346,068` | `3640142712307149efd5e7fde032d3a726188125e545d4449c226dc614699793` |
| [`research/warehouse/team_matches_2026_2027.parquet`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/research/warehouse/team_matches_2026_2027.parquet) | `6,328` | 303 | `3,165` `match_id` (`3,163` paired + `2` Copa del Rey single-sided), `1,407` `team_id` (`1,890` rows with non-null `npxG`, `4,438` unplayed/lower-tier null rows) | `2026/2027` | Multi-league (`108` active Big 5 senior clubs = `1,510` rows with `100.0%` settled xG completeness) | `942,082` | `c8de1b2d1f2c19ba2a56427c5515efb57f8c3d23c024152aeef443d28e85348f` |

---

### 3.5 Layer 3 — Entity Mappings & Crosswalks (`research/mappings/` & `research/reports/stage3a/`)

| Dataset Path (Relative to `SALMO/`) | Rows | Cols | Resolution & League Breakdown | Seasons Covered | Size (Bytes) | SHA-256 Checksum |
| :--- | :---: | :---: | :--- | :--- | :---: | :--- |
| [`research/mappings/match_mapping.parquet`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/research/mappings/match_mapping.parquet) | `44,302` | 12 | **`4,834` `AUTO_RESOLVED`** (`100.0%` `scores_match=True`: `ENG-PL` `2,090`, `ESP-LALIGA` `760`, `ITA-SERIEA` `760`, `DEU-BUNDESLIGA` `612`, `FRA-LIGUE1` `612`) + **`39,468` `UNRESOLVED`** | `2020/21` – `2025/26` (ENG-PL 6 seasons; ESP/ITA/DEU/FRA 2024/25–2025/26) | `2,034,530` | `3909d681da28eedcdfde372fcc6df6a7bb9ef5640f4b54f2ce0291e289589773` |
| [`research/mappings/match_mapping.csv`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/research/mappings/match_mapping.csv) | `44,302` | 12 | CSV export of `match_mapping.parquet` (`4,834` `AUTO_RESOLVED`, `39,468` `UNRESOLVED`) | `2020/21` – `2025/26` | `6,275,874` | `6a7a804b9cd2afeccbf8ce47cafae114f511d6eb57fe927d321f5f4ce11fdb6e` |
| [`research/mappings/team_mapping.parquet`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/research/mappings/team_mapping.parquet) | `1,101` | 11 | **`113` `AUTO_RESOLVED`** (verified Big 5 first teams), `88` `NEEDS_REVIEW` (youth/B-teams/homonyms), `900` `UNRESOLVED` | Cross-season (`2020` – `2027`) | `74,646` | `871d9b2db347031f8e1b1e6f07f3d945cdcc77c74f77fcb509ea3115b3929ba2` |
| [`research/mappings/team_mapping.csv`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/research/mappings/team_mapping.csv) | `1,101` | 11 | CSV export of `team_mapping.parquet` | Cross-season (`2020` – `2027`) | `210,379` | `1c9f463dfdd0e8258322701192ebdc6a9ef9323145cbe67f862f3b948dd969fd` |
| [`research/mappings/referee_mapping.parquet`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/research/mappings/referee_mapping.parquet) | `641` | 12 | `65` `HIGH_CONFIDENCE` ($\ge 5$ matches), `576` `NEEDS_REVIEW` | Cross-season | `46,812` | `d1774ba84003f036555b545faca7fd3764f5b8f393da7fb6bdac3bc4861ab540` |
| [`research/mappings/MANUAL_REVIEW_QUEUE.csv`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/research/mappings/MANUAL_REVIEW_QUEUE.csv) | `991` | 11 | Unresolved / review-required team entities | Cross-season | `204,268` | `3403000dab78c6451a3901ac5aec0a5156e40a1cda377ca0b9b23f7f4fe3ee89` |
| [`research/mappings/MANUAL_REVIEW_QUEUE.jsonl`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/research/mappings/MANUAL_REVIEW_QUEUE.jsonl) | `991` | 11 | JSONL export of manual review queue | Cross-season | `375,701` | `98a586cd45f525bad257c03458d83d151f9912e79f3f471d06fa823d1b526977` |
| [`research/reports/stage3a/STAGE_3A_UNRESOLVED_QUEUE.csv`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/research/reports/stage3a/STAGE_3A_UNRESOLVED_QUEUE.csv) | `39,468` | 12 | Unresolved non-Big-5 / cup / pre-2024 canonical-gap fixtures | `2020/21` – `2026/27` | `8,519,188` | `7c8ee03a94e82df3807d194e368e02abd463c1e5a164aff3b574556be45b3629` |

> [!NOTE]
> **Reconciliation Note (`STAGE_1_EVIDENCE_MANIFEST.json` vs. Stage 3A `match_mapping.parquet`):**
> In Stage 1 (`2026-10-09T09:22:00Z`), `match_mapping.parquet` had SHA-256 `f60f7085...` with `2,090` `AUTO_RESOLVED` matches (ENG-PL only) and `team_mapping.parquet` had SHA-256 `a92142bc...` with `26` resolved EPL clubs. During Stage 3A (`commit d00706d` / `d66bd43`), the crosswalk was deterministically expanded to all 5 Big European leagues (`113` verified senior clubs), increasing `AUTO_RESOLVED` matches in `match_mapping.parquet` from `2,090` to **`4,834`** (`SHA-256: 3909d681...`) while preserving all `2,090` EPL matches 100% unchanged.

---

### 3.6 Layer 4 — Engineered Feature Tables, Fitted Models & Simulation Ledgers (`research/features/` & `research/stage3/`)

| Dataset Path (Relative to `SALMO/`) | Rows | Cols | Unique IDs, Seasons & Leagues | Size (Bytes) | SHA-256 Checksum |
| :--- | :---: | :---: | :--- | :---: | :--- |
| [`research/features/stage4_features_2026_2027.parquet`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/research/features/stage4_features_2026_2027.parquet) | `3,662` | 182 | `3,662` `fixture_id`, `1,115` `home_team_id`, `1,102` `away_team_id` (`2,239` `PLAYED`, `1,418` `FIXTURE`, `7` quarantined); Season `2026/2027` | `1,458,885` | `3c2b3df8a28531e337f85222844763f36d21276cb27bd34b1e6ef13a1f317896` |
| [`research/stage3/features/pre_holdout_features_v1.parquet`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/research/stage3/features/pre_holdout_features_v1.parquet) | `1,748` | 50 | `1,748` `match_id` (`ENG-PL`: `2020/21` `342`, `2021/22` `380`, `2022/23` `342`, `2023/24` `342`, `2024/25` `342`; `0` nulls; Pandas hash `0x9978df1ca570b6dd`) | `301,733` | `f9cad168d9e09eed7b09e5827e9397ff4c206c674dad343eb91df8782d05db93` |
| [`research/stage3/features/holdout_features_2025_2026_v1.parquet`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/research/stage3/features/holdout_features_2025_2026_v1.parquet) | `342` | 50 | `342` `match_id` (`ENG-PL` sealed holdout season `2025/2026`; `0` nulls) | `89,354` | `c27a67d702fa4941ca16dcb657b056b596eb11008826cd9f5e27f88dcb07b2a2` |
| [`research/stage3/models/fitted_models_v1.json`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/research/stage3/models/fitted_models_v1.json) | — | — | Fitted model coefficients & intercepts for `EXP-AH-01`, `EXP-OU-01`, `EXP-BTTS-01`, `EXP-ABL-01` | `2,410` | `f8bf480798255c5b11702a91ac2b5d81f3d56e6ad9d5d714dc83cdddc0b9c4b8` |
| [`research/stage3/simulations/bets_ledger_ah_base.parquet`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/research/stage3/simulations/bets_ledger_ah_base.parquet) | `1,038` | 23 | Pre-holdout OOS AH baseline bet ledger (`2021/22` – `2024/25`, `ENG-PL`) | `93,787` | `d8a96894e99584d8d9f7d9da29731614ef6b96b14717506bf1b189e5d742f84a` |
| [`research/stage3/simulations/bets_ledger_ah_cand.parquet`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/research/stage3/simulations/bets_ledger_ah_cand.parquet) | `1,047` | 23 | Pre-holdout OOS AH candidate bet ledger (`2021/22` – `2024/25`, `ENG-PL`) | `94,253` | `71c5d48fcc750ca2a6c25713c33c051f2220d3c3111c2c8a1d6565b215e957c9` |
| [`research/stage3/simulations/bets_ledger_ou_base.parquet`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/research/stage3/simulations/bets_ledger_ou_base.parquet) | `1,039` | 23 | Pre-holdout OOS OU baseline bet ledger (`2021/22` – `2024/25`, `ENG-PL`) | `99,786` | `1040534224ad380fcbe6564db56cd2562ad8ed32f8d56fae5574214784574477` |
| [`research/stage3/simulations/bets_ledger_ou_cand.parquet`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/research/stage3/simulations/bets_ledger_ou_cand.parquet) | `1,016` | 23 | Pre-holdout OOS OU candidate bet ledger (`2021/22` – `2024/25`, `ENG-PL`) | `101,262` | `3856e52413dea79f399867286157445b76c6d5750727296990aa32e8e40c6226` |
| [`research/stage3/simulations/holdout_bets_ledger_ah_base.parquet`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/research/stage3/simulations/holdout_bets_ledger_ah_base.parquet) | `243` | 22 | Holdout AH baseline bet ledger (`2025/2026`, `ENG-PL`) | `32,308` | `fe6ca0383f2afa06e03e3f082192c6857eed1d070bce578eea471e4f07b0ecc6` |
| [`research/stage3/simulations/holdout_bets_ledger_ah_cand.parquet`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/research/stage3/simulations/holdout_bets_ledger_ah_cand.parquet) | `240` | 22 | Holdout AH candidate bet ledger (`2025/2026`, `ENG-PL`) | `32,221` | `420b2537141c7cd79c2cbebb99007a76b64626ec0c11dfb20c22789a1d170aba` |
| [`research/stage3/simulations/holdout_bets_ledger_ou_base.parquet`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/research/stage3/simulations/holdout_bets_ledger_ou_base.parquet) | `215` | 22 | Holdout OU baseline bet ledger (`2025/2026`, `ENG-PL`) | `31,299` | `df7137e11b0dc6f6fc329003fdb752639223f6ef43cbd713ce055e87d8046c0d` |
| [`research/stage3/simulations/holdout_bets_ledger_ou_cand.parquet`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/research/stage3/simulations/holdout_bets_ledger_ou_cand.parquet) | `211` | 22 | Holdout OU candidate bet ledger (`2025/2026`, `ENG-PL`) | `31,852` | `d2f51b2758dbac471b5872fd8b9f6b433ed605c7813028ba502bd720710fbd60` |
| [`research/stage3/manifests/*.json`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/research/stage3/manifests/feature_manifest_v1.json) (4 files) | — | — | `feature_manifest_v1.json` (`1,137` B), `holdout_manifest_v1.json` (`295` B), `simulation_manifest_v1.json` (`403` B), `walk_forward_manifest_v1.json` (`530` B) | `2,365` | `bbb855ce...`, `2701b774...`, `a0ff18dc...`, `10a951cd...` |
| [`research/stage3/validation/*.json`](file:///c:/Users/RYZEN/.antigravity-ide/SALMO/research/stage3/validation/FEATURE_VALIDATION_RESULTS.json) (4 files) | — | — | `FEATURE_VALIDATION_RESULTS.json` (`1,898` B), `HOLDOUT_EVALUATION_RESULTS.json` (`8,979` B), `TRADING_SIMULATION_RESULTS.json` (`14,336` B), `WALK_FORWARD_RESULTS.json` (`13,697` B) | `38,910` | `67e9c0b5...`, `8b1f7e87...`, `877ac09b...`, `c30c9af1...` |

---

## 4. Backup & Clean-Environment Restore Verification

### 4.1 Audit of Existing Independent Backups
An exhaustive scan of both workspace trees (`SALMO` and `HandicapLab`) and configured cloud storage integrations confirmed:
- **`SALMO/data/backup/`**: Contains only 4 files (`live_prediction_ledger.jsonl.mw5_backup`, `phase0_manifest.json`, `production_snapshot_phase0.json`, `september_audit_reconciliation.json`). **Zero Dribble360 datasets are backed up here.**
- **Cloud Object Storage (`gs://salmo-research-warehouse/dribble360/`)**: Not provisioned.
- **Cross-Workspace Duplication (`HandicapLab` $\leftrightarrow$ `SALMO`)**: While the `2020/21`–`2025/26` `team_matches` (`70,392` rows) and `matches` (`44,302` rows) exist in both `HandicapLab/data/research/dribble360/harvest/*.jsonl` and `SALMO/research/raw_dribble/snapshot_20261008_v1/*.parquet`, both directories sit on the **same physical C: drive** (`C:\Users\RYZEN\.antigravity-ide\`), and the `2026/2027` incremental harvest (`research/warehouse/*`, `research/features/stage4_features_2026_2027.parquet`, and `research/stage3/*`) exists **only** in `SALMO/research/` with zero second copies anywhere.

### 4.2 Clean-Environment Archive & Restore Verification Test
Without modifying, deleting, or migrating any source file in `SALMO/research/`, we executed an end-to-end packaging and clean-restore verification test into an isolated directory with all Dribble360 credentials stripped from the environment (`DRIBBLE_API_KEY=None` and zero network access):

| Verification Metric | Empirical Result | Status |
| :--- | :--- | :---: |
| **Source Directory Archived** | `c:\Users\RYZEN\.antigravity-ide\SALMO\research` (Read-Only) | **PASS** |
| **Total Files Packaged** | **`366` files** (100% of Parquet, JSON, JSONL, CSV, Markdown, Python, and PowerShell files in `research/`) | **PASS** |
| **Uncompressed Payload Size** | **`104,324,649` bytes** (~99.49 MB) | **PASS** |
| **Compressed Archive Size (`ZIP_DEFLATED`)** | **`27,712,980` bytes** (~26.43 MB; 73.4% compression ratio) | **PASS** |
| **Archive Bundle SHA-256** | `81465186e61d0c6f57d00587c911b36e904222cc3ceedd15dbc7b4820e06dd2f` | **VERIFIED** |
| **Clean Restore Target Environment** | Isolated directory with `os.environ.pop('DRIBBLE_API_KEY', None)` and zero network calls | **PASS** |
| **Post-Restore File Count & Byte Parity** | **`366 / 366` files** (`104,324,649 / 104,324,649` bytes, `0` missing) | **100% MATCH** |
| **Post-Restore Cryptographic SHA-256 Parity** | **`366 / 366` files** matched source SHA-256 digests (`0` mismatches) | **100% MATCH** |
| **Offline Parquet Read Verification (No Credentials)** | `pre_holdout_features_v1.parquet`: `(1748, 50)`<br>`holdout_features_2025_2026_v1.parquet`: `(342, 50)`<br>`warehouse/team_matches_2026_2027.parquet`: `(6328, 303)`<br>`mappings/match_mapping.parquet`: `(44302, 12)` | **PASS** |
| **Source Mutation Check (Rule 7)** | `0` files deleted, overwritten, or migrated in `SALMO/research/` or `HandicapLab/` | **PASS** |

---

## 5. License & Post-Termination Rights Audit

All contractual, Terms of Service (`https://dribble360.com/terms`, last updated 1 September 2026), and vendor correspondence records in the repositories (`research/LICENCE_STATUS.md`, `STAGE_1_ACQUISITION_PLAN.md` §5, `DRIBBLE360_SALMO_MAX_VALUE_REPORT.md` §10.4, and `HandicapLab/src/lib/salmo/dribble360SyncContract.ts`) were inspected. **Retention permissions** and **commercial-use permissions** are documented separately below:

### 5.1 Post-Termination Retention vs. Commercial-Use Rights Matrix

| Asset Category | Specific Paths | Post-Termination **Retention** Permission | **Commercial Use / Production Serving** Permission | Contractual Basis & Evidence | Required Governance Action |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Raw Dribble360 / Opta Payloads & Snapshots** | `SALMO/research/raw_dribble/**`<br>`SALMO/research/warehouse/*.parquet`<br>`HandicapLab/data/research/dribble360/{harvest,raw_captures}/**` | **`PENDING / UNVERIFIED` (`BLOCKED_PENDING_PROVIDER_CONFIRMATION`)** | **`STRICTLY PROHIBITED`** (Zero raw fields may be exposed, served, or redistributed) | **Terms §6 & §8:** Prohibits copying, displaying, or redistributing raw Opta/Dribble data without a signed addendum.<br>**Terms §11 & Vendor Retention FAQ:** Dataset access ends after the paid period; retaining internal raw archives requires a signed Max addendum or written vendor approval.<br>**Vendor Status (`bw@dribble360.com`, Oct 8, 2026):** Raw cache retention after Dec 2, 2026 is still **PENDING** confirmation. | Keep strictly quarantined and gitignored. Enforce `ci_check_raw_leakage.ps1`. If written raw-retention approval is not received from `bw@dribble360.com` before **Nov 27, 2026**, execute `research/scripts/purge_raw.ps1` (and purge `HandicapLab/data/research/dribble360/harvest/`). |
| **2. Entity Mappings, Crosswalks & Audit Reports** | `SALMO/research/mappings/**`<br>`SALMO/research/reports/**`<br>`HandicapLab/data/research/dribble360/canonical/**` | **`PERMITTED (INTERNAL)`** (Subject to scrubbing raw vendor payload excerpts if raw purge is triggered) | **`INTERNAL RESEARCH ONLY`** (Crosswalks map internal canonical IDs to vendor IDs) | **Terms §7 ("Generated Content"):** Analyses, reports, and summaries generated by the user belong to the user, provided they do not redistribute raw Opta stats. | Safe to retain internally for audit trail and reproducibility tracking. Do not expose raw vendor slugs/IDs on public APIs. |
| **3. Derived Feature Tables, Aggregates & Fitted Model Weights** | `SALMO/research/features/stage4_features_2026_2027.parquet`<br>`SALMO/research/stage3/features/*.parquet`<br>`SALMO/research/stage3/models/fitted_models_v1.json`<br>`SALMO/research/stage3/simulations/*.parquet` | **`CLEARED IN VENDOR EMAIL (OCT 8, 2026)` / `FLAGGED IN CODE GATE G5`** | **`PERMITTED BY TERMS §7–§8 FOR NON-RECONSTRUCTIBLE OUTPUTS` — BUT `REJECTED BY QUANT GOVERNANCE`** | **Terms §7 & §8 + Brian Simiyu (`bw@dribble360.com`) Oct 8, 2026 confirmation** (`research/LICENCE_STATUS.md` §2.3a, §4.1): Pre-computed derived feature tables, rolling aggregates, and model outputs belong to SALMO and may be retained for building, retraining, and audit.<br>**Code Gate (`dribble360SyncContract.ts`):** `DRIBBLE360_SYNC_ENABLED=false` and `DRIBBLE360_LICENSE_CLEARED=false` remain locked.<br>**Quant Verdict (`STAGE_3_FINAL_REPORT.md` & `STAGE_5_FINAL_VERDICT.md`):** All candidate Dribble360 models failed to beat Pinnacle closing lines and are **REJECTED FOR PRODUCTION**. | Retain derived feature matrices (`pre_holdout_features_v1.parquet`, `holdout_features_2025_2026_v1.parquet`, `stage4_features_2026_2027.parquet`), model JSONs, and simulation ledgers in durable backup for research auditability. Keep `DRIBBLE360_SYNC_ENABLED=false` permanently in production. |

### 5.2 Uncertain Contractual Restrictions Flagged for Legal / Operator Review

1. **Boundary Between "Raw Warehouse" (`research/warehouse/*.parquet`) and "Derived Feature Table" (`research/features/*.parquet`):**
   - `research/warehouse/team_matches_2026_2027.parquet` (`6,328` rows $\times$ `303` columns) is a normalized deduplication of raw per-match Opta statistics, **not** an aggregated/lagged rolling feature table. Under Terms §6, §7, and the Vendor Retention FAQ ("non-reconstruction conditions"), `research/warehouse/*.parquet` is legally equivalent to **raw data** (`research/raw_dribble/`), even though `purge_raw.ps1` currently only deletes `research/raw_dribble/` and `research/cache/`!
   - **Flagged Defect in `purge_raw.ps1`:** If raw data purge is required on November 27, 2026, `research/warehouse/team_matches_2026_2027.parquet`, `research/warehouse/matches_2026_2027.parquet`, and `HandicapLab/data/research/dribble360/harvest/*.jsonl` + `raw_captures/*.json` would **also** fall under raw cached vendor data and must be covered by the retention decision or purge scope.
2. **Target Columns Inside `stage4_features_2026_2027.parquet` and `pre_holdout_features_v1.parquet`:**
   - Verify with `bw@dribble360.com` whether retaining 5-match rolling team averages (`home_roll_npxg_5`, `home_roll_fte_5`, etc.) alongside match identifiers after subscription expiry satisfies Dribble360's "non-reconstruction" condition without a signed Max addendum, and archive the exact Oct 8, 2026 email from Brian Simiyu (`bw@dribble360.com`) in `docs/legal/` or `docs/research/dribble360/` as a permanent legal record.

---

## 6. Mandatory Action Plan Before Subscription Expiry

To transition from **`PARTIAL / BLOCKED`** to **`FULLY PRESERVED & COMPLIANT`** before Dribble360 access ends:

1. **Create an Off-Host Encrypted Backup Bundle Immediately (P0 — Storage Durability):**
   - Upload two separate, SHA-256-checksummed archives to private persistent cloud storage (e.g., private GCS bucket `gs://salmo-research-warehouse/dribble360/` or encrypted off-host vault):
     - **Archive A (Cleared Derived & Research Audit Bundle — Permanent Retention):** `research/features/`, `research/stage3/`, `research/mappings/`, `research/reports/`, `research/scripts/`, `research/tests/`, plus the 53 tracked files on branch `research/dribble360-exploit`.
     - **Archive B (Quarantined Raw Snapshot Bundle — Conditional on Vendor Confirmation):** `SALMO/research/raw_dribble/` (`82.35 MB`), `SALMO/research/warehouse/` (`1.29 MB`), and `HandicapLab/data/research/dribble360/` (`712.96 MB`), tagged with expiration gate `2026-11-27`.
2. **Preserve the Local Git Branch `research/dribble360-exploit` (P0 — Code & Report Durability):**
   - Export a Git bundle (`git bundle create salmo_dribble360_exploit_branch.bundle research/dribble360-exploit`) or push `research/dribble360-exploit` to a private remote backup branch so the committed Stage 3A, 3B, 4, and 5 scripts (`stage3a_reconciliation.py`, `stage3b_acquisition.py`, `stage4_feature_pipeline.py`, `stage5_model_validation.py`), tests, and `LICENCE_STATUS.md` cannot be lost if the local `.git` directory is damaged.
3. **Archive Written Vendor Confirmation & Resolve Pending Raw Retention (P0 — Legal Compliance):**
   - Commit the verbatim PDF/EML record of Brian Simiyu's (`bw@dribble360.com`) October 8, 2026 written confirmation regarding derived feature retention, and obtain his written answer on post-December 2, 2026 raw cache retention before **November 27, 2026**.
   - If raw retention is declined or unanswered by November 27, 2026, update `purge_raw.ps1` to include `research/warehouse/` and `HandicapLab/data/research/dribble360/{harvest,raw_captures}/` while preserving Archive A (derived features, mappings, models, and reports).
