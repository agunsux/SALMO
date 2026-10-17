const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve('.env.local');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase configuration in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('=== TONIGHT FOOTBALL FIXTURE & ODDS INSPECTION ===');
  
  // Execution time: 2026-10-17T14:25:15+07:00
  // Current time in UTC: 2026-10-17T07:25:15Z
  const nowUtc = new Date('2026-10-17T07:25:15Z');
  const nowMs = nowUtc.getTime();

  // Define tonight windows:
  // Window A (Strict End of Day Local): 2026-10-17 14:25:15 WIB to 2026-10-17 23:59:59 WIB (UTC: 2026-10-17T07:25:15Z to 2026-10-17T16:59:59Z)
  // Window B (Extended Football Tonight - European prime time until 06:00 WIB next morning): UTC 2026-10-17T07:25:15Z to 2026-10-17T23:00:00Z (2026-10-18 06:00 WIB)
  // Window C (Full Weekend / Next 48h): UTC 2026-10-17T07:25:15Z to 2026-10-19T07:25:15Z
  
  const tonightStrictEndUtc = new Date('2026-10-17T16:59:59Z');
  const tonightExtendedEndUtc = new Date('2026-10-17T23:00:00Z');

  console.log('Current Audit Time (WIB):', '2026-10-17 14:25:15 WIB');
  console.log('Current Audit Time (UTC):', nowUtc.toISOString());
  console.log('Strict Tonight Window (WIB):', '2026-10-17 14:25:15 to 2026-10-17 23:59:59 WIB');
  console.log('Strict Tonight Window (UTC):', nowUtc.toISOString(), 'to', tonightStrictEndUtc.toISOString());
  console.log('Extended Tonight Window (UTC):', nowUtc.toISOString(), 'to', tonightExtendedEndUtc.toISOString());

  // 1. Inspect Supabase matches table
  console.log('\n--- 1. Supabase public.matches inspection ---');
  const { data: allMatches, error: matchesErr } = await supabase
    .from('matches')
    .select('*')
    .order('kickoff_time', { ascending: true });

  if (matchesErr) {
    console.error('Error querying matches:', matchesErr);
  } else {
    console.log(`Total rows in matches table: ${allMatches.length}`);
    const finished = allMatches.filter(m => m.status === 'FINISHED' || (m.home_goals !== null && m.away_goals !== null));
    const upcoming = allMatches.filter(m => m.status !== 'FINISHED' && m.home_goals === null && m.away_goals === null);
    console.log(`Finished matches: ${finished.length}, Non-finished/Upcoming: ${upcoming.length}`);
    
    // Check upcoming matches around today/tonight
    const upcomingTonightStrict = upcoming.filter(m => {
      if (!m.kickoff_time) return false;
      const k = new Date(m.kickoff_time);
      return k >= nowUtc && k <= tonightStrictEndUtc;
    });

    const upcomingTonightExt = upcoming.filter(m => {
      if (!m.kickoff_time) return false;
      const k = new Date(m.kickoff_time);
      return k >= nowUtc && k <= tonightExtendedEndUtc;
    });

    const upcomingNext7Days = upcoming.filter(m => {
      if (!m.kickoff_time) return false;
      const k = new Date(m.kickoff_time);
      return k >= nowUtc;
    });

    console.log(`Upcoming in matches table (Strict Tonight): ${upcomingTonightStrict.length}`);
    console.log(`Upcoming in matches table (Extended Tonight): ${upcomingTonightExt.length}`);
    console.log(`Upcoming in matches table (Future): ${upcomingNext7Days.length}`);

    if (upcomingNext7Days.length > 0) {
      console.log('Sample upcoming matches in matches table:');
      upcomingNext7Days.slice(0, 10).forEach(m => {
        console.log(`  [${m.canonical_match_id || m.id}] ${m.kickoff_time} | ${m.competition_code || m.league} | ${m.home_team} vs ${m.away_team} | status: ${m.status}`);
      });
    }
  }

  // 2. Inspect Supabase market_snapshots table
  console.log('\n--- 2. Supabase public.market_snapshots inspection ---');
  const { data: snapshots, error: snapErr } = await supabase
    .from('market_snapshots')
    .select('*')
    .order('captured_at', { ascending: false })
    .limit(50);

  if (snapErr) {
    console.error('Error querying market_snapshots:', snapErr);
  } else {
    console.log(`Sample market_snapshots count: ${snapshots ? snapshots.length : 0}`);
    if (snapshots && snapshots.length > 0) {
      console.log('Recent snapshot sample:');
      snapshots.slice(0, 5).forEach(s => {
        console.log(`  Match: ${s.match_id} | Type: ${s.market_type} | Line: ${s.numeric_line} | H: ${s.home_odds} | A: ${s.away_odds} | Bookmaker: ${s.bookmaker} | Captured: ${s.captured_at}`);
      });
    }
  }

  // 3. Inspect Supabase public.daily_picks table
  console.log('\n--- 3. Supabase public.daily_picks inspection ---');
  const { data: picks, error: picksErr } = await supabase
    .from('daily_picks')
    .select('*')
    .order('kickoff_utc', { ascending: true });

  if (picksErr) {
    console.error('Error querying daily_picks:', picksErr);
  } else {
    console.log(`Total rows in daily_picks: ${picks.length}`);
    const futurePicks = picks.filter(p => {
      if (!p.kickoff_utc) return false;
      const k = new Date(p.kickoff_utc);
      return k >= nowUtc;
    });
    console.log(`Future picks (kickoff >= now): ${futurePicks.length}`);

    const tonightPicksStrict = picks.filter(p => {
      if (!p.kickoff_utc) return false;
      const k = new Date(p.kickoff_utc);
      return k >= nowUtc && k <= tonightStrictEndUtc;
    });

    const tonightPicksExt = picks.filter(p => {
      if (!p.kickoff_utc) return false;
      const k = new Date(p.kickoff_utc);
      return k >= nowUtc && k <= tonightExtendedEndUtc;
    });

    console.log(`Picks in daily_picks (Strict Tonight): ${tonightPicksStrict.length}`);
    console.log(`Picks in daily_picks (Extended Tonight): ${tonightPicksExt.length}`);

    // Group future picks by fixture
    const fixturesMap = new Map();
    for (const p of futurePicks) {
      const fid = p.fixture_id || `${p.home_team}_${p.away_team}_${p.kickoff_utc}`;
      if (!fixturesMap.has(fid)) {
        fixturesMap.set(fid, {
          fixtureId: fid,
          homeTeam: p.home_team,
          awayTeam: p.away_team,
          league: p.league,
          kickoffUtc: p.kickoff_utc,
          ahPick: null,
          ouPick: null,
          allPicks: [],
        });
      }
      const entry = fixturesMap.get(fid);
      entry.allPicks.push(p);
      if (p.market_type === 'ASIAN_HANDICAP') entry.ahPick = p;
      if (p.market_type === 'OVER_UNDER') entry.ouPick = p;
    }

    console.log(`Unique future fixtures in daily_picks: ${fixturesMap.size}`);
    console.log('List of all future fixtures in daily_picks:');
    for (const f of fixturesMap.values()) {
      const kUtc = new Date(f.kickoffUtc);
      const kLocal = new Date(kUtc.getTime() + 7 * 3600 * 1000).toISOString().replace('T', ' ').substring(0, 19) + ' WIB';
      const hasAh = !!(f.ahPick && f.ahPick.market_odds);
      const hasOu = !!(f.ouPick && f.ouPick.market_odds);
      const ahOdds = f.ahPick ? f.ahPick.market_odds : 'NONE';
      const ouOdds = f.ouPick ? f.ouPick.market_odds : 'NONE';
      const ahLine = f.ahPick ? (f.ahPick.prediction || f.ahPick.line) : 'NONE';
      const ouLine = f.ouPick ? (f.ouPick.prediction || f.ouPick.line) : 'NONE';
      const verdicts = f.allPicks.map(p => `${p.market_type}:${p.verdict}`).join(', ');
      console.log(`  [${f.league}] ${kLocal} (${f.kickoffUtc}) | ${f.homeTeam} vs ${f.awayTeam}`);
      console.log(`    Fixture ID: ${f.fixtureId}`);
      console.log(`    AH: odds=${ahOdds}, line=${ahLine} | OU: odds=${ouOdds}, line=${ouLine}`);
      console.log(`    Verdicts: ${verdicts}`);
    }
  }

  // 4. Inspect HandicapLab local files
  console.log('\n--- 4. HandicapLab Local Fixture & Cache Files ---');
  const cachePath = 'c:\\Users\\RYZEN\\.antigravity-ide\\HandicapLab\\data\\cache\\canonical_fixtures.json';
  if (fs.existsSync(cachePath)) {
    try {
      const cacheContent = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      console.log(`canonical_fixtures.json exists! Count: ${cacheContent.length}`);
      const futureInCache = cacheContent.filter(f => {
        const k = new Date(f.kickoffUtc);
        return k >= nowUtc;
      });
      console.log(`Future fixtures in canonical_fixtures.json: ${futureInCache.length}`);
      futureInCache.slice(0, 10).forEach(f => {
        console.log(`  ${f.kickoffUtc} | ${f.competitionName || f.competitionId} | ${f.homeTeam} vs ${f.awayTeam}`);
      });
    } catch (e) {
      console.error('Error reading canonical_fixtures.json:', e);
    }
  } else {
    console.log('canonical_fixtures.json not found');
  }

  // 5. Inspect test_cache or other fixture files in HandicapLab
  const testCachePath = 'c:\\Users\\RYZEN\\.antigravity-ide\\HandicapLab\\data\\test_cache\\canonical_fixtures.json';
  if (fs.existsSync(testCachePath)) {
    try {
      const testContent = JSON.parse(fs.readFileSync(testCachePath, 'utf8'));
      console.log(`test_cache/canonical_fixtures.json exists! Count: ${testContent.length}`);
    } catch (e) {}
  }
}

run().catch(console.error);
