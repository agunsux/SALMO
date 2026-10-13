/**
 * SALMO / HandicapLab — API-Football Pro Expiry Harvester
 *
 * Strict Egress & Data Preservation Engine:
 * - Reads API key securely from .env.local without logging/exposing it
 * - Verifies /status before, during, and after harvest
 * - Logs every single request to docs/research/api-football/API_FOOTBALL_REQUEST_LEDGER.jsonl
 * - Stores quarantined raw JSON in research/api-football/raw/
 * - Throttles calls to 350ms to strictly comply with 300 req/min rate limit
 * - Respects safe budget cap and emergency stop if remaining < 500
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration
const BASE_URL = 'https://v3.football.api-sports.io';
const RATE_LIMIT_DELAY_MS = 360; // ~166 req/min (well below 300/min)
const MIN_SAFETY_RESERVE = 500;
const SESSION_MAX_REQUESTS = 2500;

const RAW_DIR = path.resolve('research/api-football/raw');
const LEDGER_PATH = path.resolve('docs/research/api-football/API_FOOTBALL_REQUEST_LEDGER.jsonl');

// Helper: load API key safely
function getApiKey() {
  const envPath = path.resolve('.env.local');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env.local not found');
  }
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^(?:APIFOOTBALL_KEY|API_FOOTBALL_KEY)=(.*)$/);
    if (match && match[1]) {
      const key = match[1].trim().replace(/^["']|["']$/g, '');
      if (key) return key;
    }
  }
  throw new Error('APIFOOTBALL_KEY not found in .env.local');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function computeSha256(data) {
  return crypto.createHash('sha256').update(typeof data === 'string' ? data : JSON.stringify(data)).digest('hex');
}

class Harvester {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.requestsMadeInSession = 0;
    this.lastRemainingRequests = null;
    this.statusSnapshot = null;
  }

  logLedgerEntry(entry) {
    const dir = path.dirname(LEDGER_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(LEDGER_PATH, JSON.stringify(entry) + '\n', 'utf8');
  }

  async checkStatus() {
    const start = Date.now();
    const res = await fetch(`${BASE_URL}/status`, {
      method: 'GET',
      headers: { 'x-apisports-key': this.apiKey }
    });
    const latency = Date.now() - start;
    const body = await res.json();

    const remainingReqs = parseInt(res.headers.get('x-ratelimit-requests-remaining') || '0', 10);
    const limitReqs = parseInt(res.headers.get('x-ratelimit-requests-limit') || '7500', 10);
    const rateLimitRem = parseInt(res.headers.get('x-ratelimit-remaining') || '0', 10);
    const rateLimitLim = parseInt(res.headers.get('x-ratelimit-limit') || '300', 10);

    this.lastRemainingRequests = remainingReqs;
    this.statusSnapshot = {
      timestamp: new Date().toISOString(),
      http_status: res.status,
      latency_ms: latency,
      plan: body.response?.subscription?.plan,
      expiry: body.response?.subscription?.end,
      active: body.response?.subscription?.active,
      current_used: body.response?.requests?.current,
      limit_day: body.response?.requests?.limit_day,
      requests_remaining: remainingReqs,
      requests_limit: limitReqs,
      rate_limit_remaining: rateLimitRem,
      rate_limit_limit: rateLimitLim
    };

    return this.statusSnapshot;
  }

  async fetchEndpoint(endpoint, params = {}, rawRelativePath) {
    // 1. Check session budget
    if (this.requestsMadeInSession >= SESSION_MAX_REQUESTS) {
      console.warn(`[Harvester] Reached session max request limit (${SESSION_MAX_REQUESTS}). Stopping.`);
      return { aborted: true, reason: 'SESSION_BUDGET_REACHED' };
    }

    // 2. Check quota safety reserve
    if (this.lastRemainingRequests !== null && this.lastRemainingRequests <= MIN_SAFETY_RESERVE) {
      console.warn(`[Harvester] Remaining quota (${this.lastRemainingRequests}) is at or below safety reserve (${MIN_SAFETY_RESERVE}). Emergency abort.`);
      return { aborted: true, reason: 'SAFETY_RESERVE_TRIGGERED' };
    }

    // 3. Check if raw file already exists on disk (idempotency)
    const targetFile = path.join(RAW_DIR, rawRelativePath);
    if (fs.existsSync(targetFile)) {
      const stats = fs.statSync(targetFile);
      if (stats.size > 20) {
        // File already downloaded
        return { skipped: true, targetFile, size: stats.size };
      }
    }

    // 4. Rate limit throttle
    await sleep(RATE_LIMIT_DELAY_MS);

    // 5. Build URL
    const url = new URL(`${BASE_URL}${endpoint}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.append(k, String(v));
    }

    // 6. Make request with retry logic
    let attempts = 0;
    let res = null;
    let latency = 0;
    while (attempts < 3) {
      attempts++;
      const start = Date.now();
      try {
        res = await fetch(url.toString(), {
          method: 'GET',
          headers: { 'x-apisports-key': this.apiKey }
        });
        latency = Date.now() - start;
        if (res.status === 429) {
          console.warn(`[Harvester] Rate limited (429). Backing off 5s (attempt ${attempts}/3)...`);
          await sleep(5000);
          continue;
        }
        if (res.status >= 500) {
          console.warn(`[Harvester] Server error (${res.status}). Backing off 3s (attempt ${attempts}/3)...`);
          await sleep(3000);
          continue;
        }
        break;
      } catch (err) {
        console.warn(`[Harvester] Network error: ${err.message}. Retrying in 2s (attempt ${attempts}/3)...`);
        await sleep(2000);
      }
    }

    if (!res) {
      throw new Error(`Failed to fetch ${url.toString()} after 3 attempts`);
    }

    this.requestsMadeInSession++;
    const textBody = await res.text();
    const sha256 = crypto.createHash('sha256').update(textBody).digest('hex');

    const remainingReqs = parseInt(res.headers.get('x-ratelimit-requests-remaining') || '0', 10);
    const rateLimitRem = parseInt(res.headers.get('x-ratelimit-remaining') || '0', 10);
    this.lastRemainingRequests = remainingReqs;

    let parsed = null;
    let recordsCount = 0;
    try {
      parsed = JSON.parse(textBody);
      if (Array.isArray(parsed.response)) {
        recordsCount = parsed.response.length;
      } else if (parsed.response && typeof parsed.response === 'object') {
        recordsCount = 1;
      }
    } catch (e) {
      // Non-json
    }

    // 7. Save raw file to disk
    const targetDir = path.dirname(targetFile);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(targetFile, textBody, 'utf8');

    // 8. Record in ledger
    const ledgerEntry = {
      timestamp_iso: new Date().toISOString(),
      endpoint,
      params,
      status_code: res.status,
      response_time_ms: latency,
      rate_limit_remaining: rateLimitRem,
      requests_remaining: remainingReqs,
      records_count: recordsCount,
      bytes: Buffer.byteLength(textBody, 'utf8'),
      sha256,
      target_file: path.relative(process.cwd(), targetFile).replace(/\\/g, '/')
    };
    this.logLedgerEntry(ledgerEntry);

    return {
      success: res.status === 200,
      statusCode: res.status,
      recordsCount,
      targetFile,
      sha256,
      data: parsed
    };
  }
}

module.exports = { Harvester, getApiKey };
