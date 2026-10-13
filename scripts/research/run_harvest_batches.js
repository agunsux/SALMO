/**
 * SALMO / HandicapLab — Batch Harvest Runner
 *
 * Executes Batches 1 through 7 with strict rate-limiting, error handling,
 * quota tracking, and progress logging.
 */

const fs = require('fs');
const path = require('path');
const { Harvester, getApiKey } = require('./apifootball_harvester');

const CANONICAL_15_LEAGUES = [
  { key: 'ENG-PL', id: 39, name: 'Premier League', tier: 'A' },
  { key: 'ESP-LALIGA', id: 140, name: 'La Liga', tier: 'A' },
  { key: 'ITA-SERIEA', id: 135, name: 'Serie A', tier: 'A' },
  { key: 'DEU-BUNDESLIGA', id: 78, name: 'Bundesliga', tier: 'A' },
  { key: 'FRA-LIGUE1', id: 61, name: 'Ligue 1', tier: 'A' },
  { key: 'NED-ERE', id: 88, name: 'Eredivisie', tier: 'B' },
  { key: 'POR-PRIMEIRA', id: 94, name: 'Primeira Liga', tier: 'B' },
  { key: 'BEL-PRO', id: 144, name: 'Jupiler Pro League', tier: 'B' },
  { key: 'SCO-PREM', id: 179, name: 'Premiership', tier: 'B' },
  { key: 'ENG-CHAMP', id: 40, name: 'Championship', tier: 'B' },
  { key: 'USA-MLS', id: 253, name: 'Major League Soccer', tier: 'C' },
  { key: 'SAU-PRO', id: 307, name: 'Pro League', tier: 'C' },
  { key: 'JPN-J1', id: 98, name: 'J1 League', tier: 'C' },
  { key: 'KOR-K1', id: 292, name: 'K League 1', tier: 'C' },
  { key: 'IDN-L1', id: 274, name: 'Liga 1', tier: 'C' },
];

async function run() {
  const args = process.argv.slice(2);
  let selectedBatches = ['1', '2', '3', '4', '5', '6', '7'];
  const batchArgIndex = args.indexOf('--batches');
  if (batchArgIndex !== -1 && args[batchArgIndex + 1]) {
    selectedBatches = args[batchArgIndex + 1].split(',').map(s => s.trim());
  }
  console.log(`[RunBatches] Configured to run batches: [${selectedBatches.join(', ')}]`);

  const apiKey = getApiKey();
  const harvester = new Harvester(apiKey);

  console.log('=== API-FOOTBALL PRO PREFLIGHT STATUS CHECK ===');
  const status = await harvester.checkStatus();
  console.log(`Plan: ${status.plan}`);
  console.log(`Expiry: ${status.expiry}`);
  console.log(`Active: ${status.active}`);
  console.log(`Requests Used Today: ${status.current_used} / ${status.limit_day}`);
  console.log(`Requests Remaining: ${status.requests_remaining}`);
  console.log(`Rate Limit: ${status.rate_limit_remaining} / ${status.rate_limit_limit}`);

  if (!status.active || status.plan !== 'Pro') {
    throw new Error(`Invalid plan or inactive status: ${JSON.stringify(status)}`);
  }
  if (status.requests_remaining < 500) {
    throw new Error(`Insufficient requests remaining: ${status.requests_remaining}`);
  }

  const initialRemaining = status.requests_remaining;
  const big5Leagues = [39, 140, 135, 78, 61];

  // Helper functions
  function getTeamsForLeague(leagueId, season) {
    const standingsPath = path.resolve(`research/api-football/raw/standings/${leagueId}_${season}.json`);
    if (fs.existsSync(standingsPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(standingsPath, 'utf8'));
        const teams = new Map();
        if (data.response && data.response[0] && data.response[0].league && data.response[0].league.standings) {
          for (const group of data.response[0].league.standings) {
            for (const item of group) {
              if (item.team && item.team.id) {
                teams.set(item.team.id, item.team.name);
              }
            }
          }
        }
        if (teams.size > 0) return Array.from(teams.entries());
      } catch (e) {}
    }
    const fixPath = path.resolve(`research/api-football/raw/fixtures/${leagueId}_${season}.json`);
    if (fs.existsSync(fixPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(fixPath, 'utf8'));
        const teams = new Map();
        if (Array.isArray(data.response)) {
          for (const item of data.response) {
            if (item.teams?.home?.id) teams.set(item.teams.home.id, item.teams.home.name);
            if (item.teams?.away?.id) teams.set(item.teams.away.id, item.teams.away.name);
          }
        }
        if (teams.size > 0) return Array.from(teams.entries());
      } catch (e) {}
    }
    return [];
  }

  function getFinishedFixtures(leagueId, season) {
    const fixPath = path.resolve(`research/api-football/raw/fixtures/${leagueId}_${season}.json`);
    if (!fs.existsSync(fixPath)) return [];
    try {
      const data = JSON.parse(fs.readFileSync(fixPath, 'utf8'));
      const finished = [];
      if (Array.isArray(data.response)) {
        for (const item of data.response) {
          const status = item.fixture?.status?.short;
          if (['FT', 'AET', 'PEN'].includes(status)) {
            finished.push({
              id: item.fixture.id,
              date: item.fixture.date,
              home: item.teams?.home?.name,
              away: item.teams?.away?.name
            });
          }
        }
      }
      return finished;
    } catch (e) {
      return [];
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // BATCH 1: MISSING FIXTURES FOR 15 CANONICAL LEAGUES
  // ───────────────────────────────────────────────────────────────────────────
  if (selectedBatches.includes('1')) {
    console.log('\n============================================================');
    console.log('>>> STARTING BATCH 1: MISSING FIXTURES (15 LEAGUES)');
    console.log('============================================================');

    const missingFixturesTargets = [
      // Big 5 missing & deep historical
      { leagueId: 39, season: 2022 },
      { leagueId: 39, season: 2023 },
      { leagueId: 39, season: 2024 },
      { leagueId: 39, season: 2025 },
      { leagueId: 140, season: 2022 },
      { leagueId: 140, season: 2023 },
      { leagueId: 135, season: 2022 },
      { leagueId: 135, season: 2023 },
      { leagueId: 135, season: 2025 },
      { leagueId: 78, season: 2022 },
      { leagueId: 78, season: 2023 },
      { leagueId: 61, season: 2022 },
      { leagueId: 61, season: 2023 },
      // Other missing 2026/seasons
      { leagueId: 94, season: 2026 },
      { leagueId: 144, season: 2026 },
      { leagueId: 253, season: 2026 },
      { leagueId: 307, season: 2026 },
      { leagueId: 98, season: 2026 },
      { leagueId: 274, season: 2024 },
      { leagueId: 274, season: 2025 }
    ];

    let batch1Count = 0;
    for (const t of missingFixturesTargets) {
      const rawPath = `fixtures/${t.leagueId}_${t.season}.json`;
      const res = await harvester.fetchEndpoint('/fixtures', { league: t.leagueId, season: t.season }, rawPath);
      if (res.aborted) {
        console.warn(`[Batch 1] Aborted due to: ${res.reason}`);
        break;
      }
      batch1Count++;
      if (res.skipped) {
        console.log(`[Batch 1] (${batch1Count}/${missingFixturesTargets.length}) League ${t.leagueId} s=${t.season}: SKIPPED (already exists, ${res.size} bytes)`);
      } else {
        console.log(`[Batch 1] (${batch1Count}/${missingFixturesTargets.length}) League ${t.leagueId} s=${t.season}: FETCHED (${res.recordsCount} records, remaining=${harvester.lastRemainingRequests})`);
      }
    }

    for (const lId of big5Leagues) {
      const rawPath = `fixtures/${lId}_2026.json`;
      const res = await harvester.fetchEndpoint('/fixtures', { league: lId, season: 2026 }, rawPath);
      if (!res.skipped) {
        console.log(`[Batch 1 - Big 5 2026] League ${lId} s=2026: FETCHED (${res.recordsCount} records)`);
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // BATCH 2: STANDINGS FOR 15 CANONICAL LEAGUES (2024, 2025, 2026)
  // ───────────────────────────────────────────────────────────────────────────
  if (selectedBatches.includes('2')) {
    console.log('\n============================================================');
    console.log('>>> STARTING BATCH 2: STANDINGS (15 LEAGUES x 3 SEASONS)');
    console.log('============================================================');

    let batch2Count = 0;
    const standingsSeasons = [2024, 2025, 2026];
    for (const l of CANONICAL_15_LEAGUES) {
      for (const season of standingsSeasons) {
        batch2Count++;
        const rawPath = `standings/${l.id}_${season}.json`;
        const res = await harvester.fetchEndpoint('/standings', { league: l.id, season }, rawPath);
        if (res.aborted) {
          console.warn(`[Batch 2] Aborted due to: ${res.reason}`);
          break;
        }
        if (res.skipped) {
          console.log(`[Batch 2] (${batch2Count}/${CANONICAL_15_LEAGUES.length * 3}) ${l.key} s=${season}: SKIPPED (already exists)`);
        } else {
          console.log(`[Batch 2] (${batch2Count}/${CANONICAL_15_LEAGUES.length * 3}) ${l.key} s=${season}: FETCHED (${res.recordsCount} standings records, remaining=${harvester.lastRemainingRequests})`);
        }
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // BATCH 3: TEAM AGGREGATE STATISTICS FOR BIG 5 (2025, 2026)
  // ───────────────────────────────────────────────────────────────────────────
  if (selectedBatches.includes('3')) {
    console.log('\n============================================================');
    console.log('>>> STARTING BATCH 3: TEAM AGGREGATE STATISTICS (BIG 5)');
    console.log('============================================================');

    let batch3Count = 0;
    for (const lId of big5Leagues) {
      for (const season of [2025, 2026]) {
        const teams = getTeamsForLeague(lId, season);
        console.log(`[Batch 3] League ${lId} s=${season}: found ${teams.length} teams`);
        for (const [tId, tName] of teams) {
          batch3Count++;
          const rawPath = `team_statistics/${lId}_${season}_${tId}.json`;
          const res = await harvester.fetchEndpoint('/teams/statistics', { league: lId, season, team: tId }, rawPath);
          if (res.aborted) {
            console.warn(`[Batch 3] Aborted due to: ${res.reason}`);
            break;
          }
          if (!res.skipped && batch3Count % 5 === 0) {
            console.log(`[Batch 3] (${batch3Count}) Team ${tName} (${tId}) s=${season}: remaining=${harvester.lastRemainingRequests}`);
          }
        }
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // BATCH 4: FINISHED MATCH STATISTICS FOR BIG 5 (SEASON 2026)
  // ───────────────────────────────────────────────────────────────────────────
  if (selectedBatches.includes('4')) {
    console.log('\n============================================================');
    console.log('>>> STARTING BATCH 4: FINISHED MATCH STATISTICS (BIG 5 - 2026)');
    console.log('============================================================');

    let batch4Count = 0;
    for (const lId of big5Leagues) {
      const finished2026 = getFinishedFixtures(lId, 2026);
      console.log(`[Batch 4] League ${lId} 2026: found ${finished2026.length} finished fixtures`);
      for (const fix of finished2026) {
        batch4Count++;
        const rawPath = `fixture_statistics/${fix.id}.json`;
        const res = await harvester.fetchEndpoint('/fixtures/statistics', { fixture: fix.id }, rawPath);
        if (res.aborted) {
          console.warn(`[Batch 4] Aborted due to: ${res.reason}`);
          break;
        }
        if (!res.skipped && batch4Count % 20 === 0) {
          console.log(`[Batch 4] (${batch4Count}) Fixture ${fix.id} (${fix.home} vs ${fix.away}): remaining=${harvester.lastRemainingRequests}`);
        }
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // BATCH 5: FINISHED MATCH STATISTICS FOR PREMIER LEAGUE (SEASON 2025 - FULL 380)
  // ───────────────────────────────────────────────────────────────────────────
  if (selectedBatches.includes('5')) {
    console.log('\n============================================================');
    console.log('>>> STARTING BATCH 5: PREMIER LEAGUE 2024/25 FULL MATCH STATS (380 MATCHES)');
    console.log('============================================================');

    const pl2025Finished = getFinishedFixtures(39, 2025);
    console.log(`[Batch 5] Premier League 2025: found ${pl2025Finished.length} finished fixtures`);
    let batch5Count = 0;
    for (const fix of pl2025Finished) {
      batch5Count++;
      const rawPath = `fixture_statistics/${fix.id}.json`;
      const res = await harvester.fetchEndpoint('/fixtures/statistics', { fixture: fix.id }, rawPath);
      if (res.aborted) {
        console.warn(`[Batch 5] Aborted due to: ${res.reason}`);
        break;
      }
      if (!res.skipped && batch5Count % 25 === 0) {
        console.log(`[Batch 5] (${batch5Count}/${pl2025Finished.length}) Fixture ${fix.id}: remaining=${harvester.lastRemainingRequests}`);
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // BATCH 6: LA LIGA (140) & SERIE A (135) 2024/25 FULL MATCH STATS
  // ───────────────────────────────────────────────────────────────────────────
  if (selectedBatches.includes('6')) {
    console.log('\n============================================================');
    console.log('>>> STARTING BATCH 6: LA LIGA & SERIE A 2024/25 MATCH STATS');
    console.log('============================================================');

    for (const lId of [140, 135]) {
      const finished = getFinishedFixtures(lId, 2025);
      console.log(`[Batch 6] League ${lId} 2025: found ${finished.length} finished fixtures`);
      let count = 0;
      for (const fix of finished) {
        count++;
        const rawPath = `fixture_statistics/${fix.id}.json`;
        const res = await harvester.fetchEndpoint('/fixtures/statistics', { fixture: fix.id }, rawPath);
        if (res.aborted) {
          console.warn(`[Batch 6] Aborted due to: ${res.reason}`);
          break;
        }
        if (!res.skipped && count % 25 === 0) {
          console.log(`[Batch 6] (${count}/${finished.length}) League ${lId} Fixture ${fix.id}: remaining=${harvester.lastRemainingRequests}`);
        }
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // BATCH 7: BUNDESLIGA (78) & LIGUE 1 (61) 2024/25 FULL MATCH STATS
  // ───────────────────────────────────────────────────────────────────────────
  if (selectedBatches.includes('7')) {
    console.log('\n============================================================');
    console.log('>>> STARTING BATCH 7: BUNDESLIGA & LIGUE 1 2024/25 MATCH STATS');
    console.log('============================================================');

    for (const lId of [78, 61]) {
      const finished = getFinishedFixtures(lId, 2025);
      console.log(`[Batch 7] League ${lId} 2025: found ${finished.length} finished fixtures`);
      let count = 0;
      for (const fix of finished) {
        count++;
        const rawPath = `fixture_statistics/${fix.id}.json`;
        const res = await harvester.fetchEndpoint('/fixtures/statistics', { fixture: fix.id }, rawPath);
        if (res.aborted) {
          console.warn(`[Batch 7] Aborted due to: ${res.reason}`);
          break;
        }
        if (!res.skipped && count % 25 === 0) {
          console.log(`[Batch 7] (${count}/${finished.length}) League ${lId} Fixture ${fix.id}: remaining=${harvester.lastRemainingRequests}`);
        }
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // FINAL STATUS & SUMMARY
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n============================================================');
  console.log('>>> FINAL STATUS CHECK');
  console.log('============================================================');
  const finalStatus = await harvester.checkStatus();
  console.log(`Total Requests Made in Session: ${harvester.requestsMadeInSession}`);
  console.log(`Initial Remaining Quota: ${initialRemaining}`);
  console.log(`Final Remaining Quota: ${finalStatus.requests_remaining}`);
  console.log(`Net Quota Consumed: ${initialRemaining - finalStatus.requests_remaining}`);
  console.log(`Safe Reserve Still Available: ${finalStatus.requests_remaining - 500}`);
}

if (require.main === module) {
  run().catch((err) => {
    console.error('[RunBatches] Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { run };
