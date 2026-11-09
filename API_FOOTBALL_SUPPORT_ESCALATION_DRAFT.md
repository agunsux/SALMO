# API-FOOTBALL SUPPORT ESCALATION & REINSTATEMENT REQUEST

**Target Recipient:** API-Sports Support Team (`support@api-sports.io` / Dashboard Support Desk)  
**Date of Communication:** November 7, 2026  
**Account Holder on Record:** Brian SALMO  
**Registered Account Email:** `[REDACTED]@gmail.com`  
**API Key Fingerprint:** `cb36...aab6` (Full key available in dashboard)  
**Current Account Status:** Suspended / Administrative Hold  
**Target Resolution:** Formal Review and Reinstatement to Standard Free Tier

---

## 1. Context & Operational Background for the Operator

*Instructions for the operator:*  
1. Log in to `https://dashboard.api-football.com`.
2. Locate the support ticket portal or send an email to `support@api-sports.io` using the exact email address registered to the account (`[REDACTED]@gmail.com`).
3. Replace bracketed placeholders `[...]` with your specific account details before sending.
4. Do not include your full API key in plain text; API-Sports identifies accounts by registered email address.

---

## 2. Formal Support Ticket Draft (Subject & Body)

**Subject:** Request for Account Review & Reinstatement to Free Tier — Account: Brian SALMO (`[REDACTED]@gmail.com`)

**Body:**

Dear API-Sports Support & Compliance Team,

I am writing to formally request a technical review and reinstatement of our API-Football account (`[REDACTED]@gmail.com`), which is currently showing an administrative suspension status (`"access": "Your account is suspended, check on https://dashboard.api-football.com."`).

### 1. Account Background & Subscription History
Our account was previously an active, paying subscriber on the **Football Pro** plan ($19/month, 7,500 requests/day). Our contractual billing cycle concluded on **October 14, 2026 at 07:53:10 UTC**.

Prior to the expiration of our Pro cycle, all requests were executed strictly within our contractual entitlements (our last harvesting session on October 13 consumed 3,690 requests out of 7,500, with sequential 360ms throttling, 100% HTTP 200 responses, and zero HTTP 429 rate-limit errors).

Upon the conclusion of the paid Pro cycle on October 14, 2026, we decided not to renew the paid tier immediately, intending to transition to the standard **Free Tier (100 requests/day)** to evaluate our low-frequency baseline research needs.

### 2. Addressing Potential Suspension Factors
Your previous guidance indicated two primary triggers for automated account protection:
1. *Multiple Free accounts.*
2. *Shared outbound IP environments (such as Cloudflare Workers, Google Cloud Run, AWS Lambda, shared proxies, or VPNs).*

We conducted an exhaustive internal forensic audit of our entire codebase and infrastructure, and can confirm the following technical facts:

- **Single Account Invariant:** Our organization operates **only ONE single account** on API-Sports. We have never registered, operated, rotated, or intended to create multiple accounts or duplicate Free keys. Our internal engineering policies strictly forbid account multiplication or limit evasion.
- **Shared Cloud Egress (The Root Cause):** Our research platform previously deployed backend microservices on **Google Cloud Run** (`asia-southeast2` region) and **Vercel** (AWS Lambda serverless infrastructure). As you are aware, public cloud serverless platforms route outbound traffic through shared dynamic NAT IP pools used simultaneously by thousands of third-party cloud tenants. We now recognize that other tenants sharing those same cloud IP ranges may have generated API-Football traffic, causing your automated edge fraud detection systems to correlate our requests with third-party activity from the same IP addresses and flag our account as a potential "multi-account" risk.

### 3. Architecture Remediation Already Implemented
To ensure 100% compliance with API-Sports' terms of service and eliminate any future shared-IP ambiguity, we have completed the following architectural safeguards:

1. **Complete Decommissioning of Serverless Egress:** We have entirely removed and disarmed all direct outbound API-Football calls from Google Cloud Run and Vercel serverless functions.
2. **Single-Origin Execution:** Any future API-Football ingestion will run exclusively from a single, dedicated origin (a dedicated single-tenant machine or local operator workstation), ensuring a stable, non-shared IP footprint.
3. **Strict Rate Limiting & Pacing:** We have implemented a sequential token bucket limiter with a mandatory **10-second delay between requests**, enforcing a maximum throughput of **6 requests/minute** (well below your 10 requests/minute Free tier ceiling).
4. **Conservative Daily Volume:** Our scheduled operations are strictly budgeted at **~42.5 requests/day** across our research portfolio, leaving a generous 57.5% safety buffer under the 100 requests/day Free limit.

### 4. Requested Action
We respectfully request your team to:
1. Review our account record (`[REDACTED]@gmail.com`) and confirm that our historical Pro usage was compliant.
2. Clear the administrative suspension / shared-IP fraud flag on our account.
3. Re-enable our account on the **Standard Free Tier (100 requests/day)** so we may resume low-volume research under our remediated single-origin architecture.

We appreciate your support, value your service, and are committed to maintaining full compliance with API-Sports' operational policies.

Thank you for your time and assistance.

Sincerely,

Brian SALMO  
Platform Engineer & Quantitative Research Lead  
Salmo.dev  
Registered Account Email: `[REDACTED]@gmail.com`
