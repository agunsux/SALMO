# SALMO — DEDICATED EGRESS INFRASTRUCTURE & COST COMPARISON

**Document Date:** November 16, 2026  
**Auditor:** Senior Cloud Infrastructure Architect & Financial Governance Specialist  
**Financial Posture:** PURE ESTIMATION & ARCHITECTURAL COMPARISON (Zero cloud charges incurred; zero live purchasing)

---

## 1. Architectural Options Comparison Matrix

| Evaluation Dimension | Option A: Google Cloud Run + Cloud NAT | Option B: Small Dedicated VPS (Hetzner / DO) | Option C: Fly.io Machine + Dedicated IPv4 |
| :--- | :--- | :--- | :--- |
| **Primary Platform** | Google Cloud Platform (`asia-southeast2` / `asia-southeast1`) | Hetzner Cloud (EU) or DigitalOcean (Singapore) | Fly.io (`sin` Singapore / `iad` US) |
| **Outbound IP Guarantee** | **100% TECHNICAL DEDICATION**<br>Static external IP mapped exclusively to Cloud NAT pool. | **100% TECHNICAL DEDICATION**<br>Static public IPv4 bound directly to VPS network interface (`eth0`). | **FAILED / NOT GUARANTEED**<br>Dedicated IP is for *inbound* only; outbound egress uses Fly shared Anycast IP pool! |
| **Anti-Abuse Protection** | **EXCELLENT** (Zero shared tenants on egress IP). | **EXCELLENT** (Zero shared tenants on egress IP). | **UNACCEPTABLE (HIGH RISK)**<br>Reintroduces shared-IP multi-tenant egress trigger. |
| **Estimated Monthly Cost (USD)** | **~$36.01 / month** | **~$4.10 / mo** (Hetzner) or **~$6.00 / mo** (DO) | ~$2.00 – $4.00 / month |
| **Estimated Monthly Cost (IDR)** | **~Rp 579,760 / month** | **~Rp 66,000 / mo** (Hetzner) or **~Rp 96,000 / mo** (DO) | ~Rp 32,000 – Rp 64,000 / month |
| **Verified Billing to Date** | **$0.00 (Zero live charges)** | **$0.00 (Zero live charges)** | **$0.00 (Zero live charges)** |
| **Idle Cost Incurred** | **YES** ($36/mo fixed even with 0 requests). | **YES** ($4–$6/mo fixed even with 0 requests). | YES ($2–$4/mo fixed). |
| **Infrastructure Complexity** | High (VPC subnet, Cloud Router, Cloud NAT, Direct VPC Egress, IAM). | Low / Moderate (Single VM, Node.js systemd service, UFW firewall). | Low (Docker container deployment). |
| **Operational Maintenance** | Fully managed serverless (no OS patching). | Self-managed OS (Ubuntu LTS, unattended-upgrades, SSH security). | Semi-managed micro-VM. |
| **Suitability for Free Tier API** | **Low ROI** (Paying $36/mo to service a free 100 req/day API). | **High ROI** (Paying ~$4–6/mo for full dedicated egress control). | **DISQUALIFIED** (Egress IP is shared). |

---

## 2. Granular Cost Breakdown by Component

### Option A: Google Cloud Platform (Detailed Line Items)
- **Cloud NAT Gateway:** $0.045 per hour * 720 hours = **$32.40 / month** (Fixed infrastructure fee).
- **Reserved Static External IPv4:** $0.005 per hour * 720 hours = **$3.60 / month** (Standard GCP static IP fee).
- **Google Cloud Run Compute:** 1 vCPU, 512 MB RAM, ~100 req/day (~1,500 vCPU-seconds/mo). GCP Tier 1 provides 180,000 vCPU-seconds and 2,000,000 requests free each month = **$0.00 / month**.
- **Direct VPC Egress:** Direct subnet integration = **$0.00 / month** (Eliminates the legacy $18/mo Serverless VPC Access connector VM charge).
- **Data Egress:** 100 requests/day * 50 KB = 5 MB/day = 0.15 GB/month @ $0.045/GB = **<$0.01 / month**.
- **Total GCP Cost:** **~$36.01 / month (~Rp 579,760 / month)**.

### Option B: Small Dedicated VPS (Hetzner CX22 / DigitalOcean Droplet)
- **Hetzner Cloud CX22:**
  - Specs: 1 vCPU (x86), 2 GB RAM, 40 GB NVMe, 20 TB traffic, 1 dedicated public IPv4 address.
  - Price: €3.79 / month = **~$4.10 / month (~Rp 66,000 / month)**.
  - Egress: 100% outbound traffic originates from the assigned public IPv4.
- **DigitalOcean Basic Droplet (Singapore `sgp1`):**
  - Specs: 1 vCPU, 1 GB RAM, 25 GB SSD, 1 TB transfer, 1 dedicated public IPv4 address.
  - Price: **~$6.00 / month (~Rp 96,600 / month)**.
  - Egress: 100% outbound traffic originates from the assigned public IPv4.

### Option C: Fly.io (Technical Disqualification Analysis)
- **Why Fly.io Fails the Dedicated Outbound IP Requirement:**
  Fly.io documentation explicitly specifies that allocated IPv4 addresses (`fly ips allocate-v4`) attach to Fly's Anycast proxy edge for **inbound** connections. Outbound traffic initiated by the container exits through Fly's regional NAT IP pool, which is dynamically shared with hundreds of other Fly.io apps running in that region.
  Because API-Sports' anti-abuse filter specifically flags shared cloud IP ranges (as experienced previously on Cloud Run and Vercel), deploying on Fly.io without enterprise static egress would re-trigger the exact same suspension mechanism.
- **Verdict on Option C:** **REJECTED AS VIABLE SOLUTION**.

---

## 3. Financial & Operational Recommendation

1. **Do Not Purchase Cloud NAT Today:**
   Cloud NAT costs ~$36/month ($432/year) purely for the privilege of a static NAT gateway. Because SALMO's live production engine is already 100% operational without API-Football (using OddsPapi, Supabase, and local archives), there is no urgent operational justification to burn $36/month.
2. **Recommended Target Architecture (When Reinstated):**
   If API-Sports confirms Free tier reinstatement (100 req/day):
   - **Recommended Choice:** A **small dedicated VPS (DigitalOcean Singapore at $6/mo or Hetzner at $4.10/mo)**.
   - It provides a **100% guaranteed dedicated static IPv4**, reduces monthly infrastructure cost from $36/mo to $4–$6/mo (an **83% to 88% cost reduction**), and satisfies all isolation criteria.
   - The standalone gateway service (`ApiFootballGatewayService.ts`) runs as a lightweight Node.js daemon managed by `systemd` behind a local token check.
