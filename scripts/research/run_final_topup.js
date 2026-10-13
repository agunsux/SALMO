/**
 * SALMO / HandicapLab — API-Football Pro Final Top-Up Harvester
 *
 * Strict Egress Rules:
 * - Scope: /fixtures/statistics ONLY
 * - Preflight check: abort if expiry < now + 30 min
 * - Target: Local fixtures only (status FT, no stats file yet)
 * - Budget: max 3,500 requests; hard stop if remaining <= 1,000
 * - Throttle: 360ms, retry 0 on 4xx, halt on 429/5xx streak of 3
 * - Append every request to docs/research/api-football/API_FOOTBALL_REQUEST_LEDGER.jsonl
 * - Raw to research/api-football/raw/fixture_statistics/
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getApiKey } = require('./apifootball_harvester');

const BASE_URL = 'https://v3.football.api-sports.io';
const RATE_LIMIT_DELAY_MS = 360;
const HARD_FLOOR_REMAINING = 1000;
const SESSION_MAX_REQUESTS = 3500;

const RAW_DIR = path.resolve('research/api-football/raw');
const FIX_DIR = path.join(RAW_DIR, 'fixtures');
const STAT_DIR = path.join(RAW_DIR, 'fixture_statistics');
const LEDGER_PATH = path.resolve('docs/research/api-football/API_FOOTBALL_REQUEST_LEDGER.jsonl');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function logLedgerEntry(entry) {
  const dir = path.dirname(LEDGER_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(LEDGER_PATH, JSON.stringify(entry) + '\n', 'utf8');
}

async function checkStatus(apiKey) {
  const res = await fetch(`${BASE_URL}/status`, {
    headers: { 'x-apisports-key': apiKey }
  });
  const data = await res.json();
  const remainingReqs = parseInt(res.headers.get('x-ratelimit-requests-remaining') || '0', 10);
  const expiryStr = data.response?.subscription?.end;
  const expiryDate = new Date(expiryStr);
  const now = new Date();
  const minutesUntilExpiry = (expiryDate.getTime() - now.getTime()) / (1000 * 60);

  return {
    plan: data.response?.subscription?.plan,
    expiry: expiryStr,
    active: data.response?.subscription?.active,
    current_used: data.response?.requests?.current,
    limit_day: data.response?.requests?.limit_day,
    requests_remaining: remainingReqs,
    minutesUntilExpiry
  };
}

async function runTopUp() {
  console.log('============================================================');
  console.log('>>> SALMO — API-FOOTBALL FINAL TOP-UP (ONE STAGE, THEN STOP)');
  console.log('============================================================');

  const apiKey = getApiKey();

  // 0. Preflight
  console.log('\n[Step 0] Preflight Status Check...');
  const status = await checkStatus(apiKey);
  console.log(`Plan: ${status.plan}`);
  console.log(`Expiry: ${status.expiry} (${status.minutesUntilExpiry.toFixed(1)} minutes remaining)`);
  console.log(`Active: ${status.active}`);
  console.log(`Requests Remaining Today: ${status.requests_remaining}`);

  if (status.minutesUntilExpiry < 30) {
    throw new Error(`ABORT: Expiry is in less than 30 minutes (${status.minutesUntilExpiry.toFixed(1)} min)`);
  }
  if (!status.active || status.plan !== 'Pro') {
    throw new Error(`ABORT: Plan is not active Pro`);
  }
  if (status.requests_remaining <= HARD_FLOOR_REMAINING) {
    throw new Error(`ABORT: Requests remaining (${status.requests_remaining}) <= hard floor (${HARD_FLOOR_REMAINING})`);
  }

  // 1. Reconciliation is logged in docs/report.

  // 2. Build target list from local fixture files
  console.log('\n[Step 2] Building Target Fixture List from Local Files...');
  if (!fs.existsSync(STAT_DIR)) fs.mkdirSync(STAT_DIR, { recursive: true });
  const existingStats = new Set(
    fs.readdirSync(STAT_DIR).filter(f => f.endsWith('.json')).map(f => parseInt(f.replace('.json', ''), 10))
  );
  console.log(`Existing fixture_statistics on disk: ${existingStats.size}`);

  function getLocalFixtures(file) {
    const full = path.join(FIX_DIR, file);
    if (!fs.existsSync(full)) return [];
    try {
      const data = JSON.parse(fs.readFileSync(full, 'utf8'));
      const list = Array.isArray(data) ? data : (data.response || []);
      return list.filter(item => {
        const st = item.fixture?.status?.short;
        return ['FT', 'AET', 'PEN'].includes(st);
      }).map(item => ({
        fixtureId: item.fixture.id,
        leagueId: item.league.id,
        season: item.league.season,
        home: item.teams?.home?.name,
        away: item.teams?.away?.name
      }));
    } catch (e) {
      return [];
    }
  }

  // Target Priority:
  // a) Big 5 Season 2025 (ESP 140, ITA 135, DEU 78, FRA 61; EPL 39 already has 0 unpulled)
  // b) Season 2024 (ESP 140, ITA 135, DEU 78, FRA 61, EPL 39)
  // c) Other 15-league seasons if budget remains
  const planTargets = [];
  const groupA = [];
  const groupB = [];
  const groupC = [];

  // Group A
  for (const lId of [140, 135, 78, 61]) {
    const list = getLocalFixtures(`${lId}_2025.json`);
    for (const m of list) {
      if (!existingStats.has(m.fixtureId)) groupA.push(m);
    }
  }

  // Group B
  for (const lId of [140, 135, 78, 61, 39]) {
    const list = getLocalFixtures(`${lId}_2024.json`);
    for (const m of list) {
      if (!existingStats.has(m.fixtureId)) groupB.push(m);
    }
  }

  console.log(`Group A (Big 5 Season 2025 unpulled): ${groupA.length} matches`);
  console.log(`Group B (Big 5 Season 2024 unpulled): ${groupB.length} matches`);

  planTargets.push(...groupA);
  planTargets.push(...groupB);

  console.log(`\nTotal Planned Matches: ${planTargets.length} (Max budget: ${SESSION_MAX_REQUESTS})`);
  const finalQueue = planTargets.slice(0, SESSION_MAX_REQUESTS);
  console.log(`Execution Queue Size: ${finalQueue.length} requests`);

  // 3. Execution loop
  console.log('\n[Step 3] Executing Harvest Loop with Strict Guards...');
  let requestsMade = 0;
  let remainingQuota = status.requests_remaining;
  let consecutiveErrors = 0;
  let skippedCount = 0;
  let successCount = 0;

  for (const item of finalQueue) {
    if (requestsMade >= SESSION_MAX_REQUESTS) {
      console.warn(`[TopUp] Reached session limit of ${SESSION_MAX_REQUESTS} requests. Halting.`);
      break;
    }
    if (remainingQuota <= HARD_FLOOR_REMAINING) {
      console.warn(`[TopUp] Remaining quota (${remainingQuota}) reached hard floor (${HARD_FLOOR_REMAINING}). Halting.`);
      break;
    }

    const rawFile = path.join(STAT_DIR, `${item.fixtureId}.json`);
    if (fs.existsSync(rawFile) && fs.statSync(rawFile).size > 20) {
      skippedCount++;
      continue;
    }

    await sleep(RATE_LIMIT_DELAY_MS);

    const start = Date.now();
    let res = null;
    try {
      res = await fetch(`${BASE_URL}/fixtures/statistics?fixture=${item.fixtureId}`, {
        headers: { 'x-apisports-key': apiKey }
      });
    } catch (netErr) {
      console.error(`[TopUp] Network failure on fixture ${item.fixtureId}:`, netErr.message);
      consecutiveErrors++;
      if (consecutiveErrors >= 3) {
        console.error(`[TopUp] 3 consecutive network failures. Halting.`);
        break;
      }
      continue;
    }

    const latency = Date.now() - start;
    const statusCode = res.status;

    if (statusCode === 429 || statusCode >= 500) {
      consecutiveErrors++;
      console.warn(`[TopUp] Error HTTP ${statusCode} on fixture ${item.fixtureId} (consecutive: ${consecutiveErrors})`);
      if (consecutiveErrors >= 3) {
        console.error(`[TopUp] Halting due to 3 consecutive 429/5xx errors.`);
        break;
      }
      await sleep(2000);
      continue;
    } else {
      consecutiveErrors = 0;
    }

    requestsMade++;
    const textBody = await res.text();
    const sha256 = crypto.createHash('sha256').update(textBody).digest('hex');

    const remHeader = res.headers.get('x-ratelimit-requests-remaining');
    if (remHeader) remainingQuota = parseInt(remHeader, 10);

    let recordsCount = 0;
    try {
      const parsed = JSON.parse(textBody);
      if (Array.isArray(parsed.response)) recordsCount = parsed.response.length;
    } catch(e) {}

    fs.writeFileSync(rawFile, textBody, 'utf8');

    logLedgerEntry({
      timestamp_iso: new Date().toISOString(),
      endpoint: '/fixtures/statistics',
      params: { fixture: item.fixtureId },
      status_code: statusCode,
      response_time_ms: latency,
      requests_remaining: remainingQuota,
      records_count: recordsCount,
      bytes: Buffer.byteLength(textBody, 'utf8'),
      sha256,
      target_file: path.relative(process.cwd(), rawFile).replace(/\\/g, '/')
    });

    successCount++;
    if (requestsMade % 50 === 0) {
      console.log(`[TopUp] (${requestsMade}/${finalQueue.length}) Fixture ${item.fixtureId} (${item.home} vs ${item.away}): status=${statusCode}, remaining=${remainingQuota}`);
    }
  }

  console.log(`\n=== HARVEST LOOP FINISHED ===`);
  console.log(`Requests Made This Run: ${requestsMade}`);
  console.log(`Successful Files Written: ${successCount}`);
  console.log(`Skipped (already on disk): ${skippedCount}`);
  console.log(`Final Remaining Quota: ${remainingQuota}`);

  // 4. Normalization into canonical datasets
  console.log('\n[Step 4] Running Canonical Normalization & Feature Generation...');
  const { runAll: runNormalization } = require('./normalize_harvested_data');
  runNormalization();

  // 5. Dual-Disk Backup to Drive D & Manifest Generation
  console.log('\n[Step 5] Synchronizing Dual-Disk Mirror to Drive D & Updating Manifest...');
  const { runBackupAndManifest } = require('./backup_and_manifest');
  await runBackupAndManifest();

  // 6. Zero-Network Offline Survival Verification
  console.log('\n[Step 6] Executing Offline Data Survival Verification...');
  const { runOfflineSurvivalTest } = require('./offline_survival_verification');
  runOfflineSurvivalTest();
}

if (require.main === module) {
  runTopUp().catch((err) => {
    console.error('[TopUp] Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { runTopUp, checkStatus };
