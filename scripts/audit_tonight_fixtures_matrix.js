const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve('.env.local');
const lines = fs.readFileSync(envPath, 'utf8').split('\n');
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx !== -1) {
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    process.env[key] = val;
  }
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function generateMatrix() {
  const executionTimeWib = '2026-10-17 14:25:15 WIB';
  const executionTimeUtc = '2026-10-17T07:25:15Z';
  const startUtc = new Date(executionTimeUtc);
  const endStrictUtc = new Date('2026-10-17T16:59:59Z'); // 23:59:59 WIB
  const endExtendedUtc = new Date('2026-10-17T23:00:00Z'); // 06:00:00 WIB next day (Oct 18)

  console.log('========================================================================');
  console.log(`AUDIT EXECUTION TIME: ${executionTimeWib} (${executionTimeUtc})`);
  console.log(`STRICT TONIGHT WINDOW (WIB): 2026-10-17 14:25:15 to 2026-10-17 23:59:59 WIB`);
  console.log(`STRICT TONIGHT WINDOW (UTC): ${startUtc.toISOString()} to ${endStrictUtc.toISOString()}`);
  console.log(`EXTENDED TONIGHT WINDOW (UTC): ${startUtc.toISOString()} to ${endExtendedUtc.toISOString()}`);
  console.log('========================================================================\n');

  // Query matches table
  const { data: matches, error: mErr } = await supabase
    .from('matches')
    .select('*')
    .gte('kickoff', '2026-10-17T07:25:15')
    .lte('kickoff', '2026-10-18T00:00:00')
    .order('kickoff', { ascending: true });

  if (mErr) console.error('Matches query error:', mErr);

  // Query daily_picks table
  const { data: picks, error: pErr } = await supabase
    .from('daily_picks')
    .select('*')
    .gte('kickoff_utc', '2026-10-17T07:25:15Z')
    .lte('kickoff_utc', '2026-10-18T00:00:00Z')
    .order('kickoff_utc', { ascending: true });

  if (pErr) console.error('Daily picks query error:', pErr);

  console.log(`Found ${matches ? matches.length : 0} rows in matches table for tonight window.`);
  console.log(`Found ${picks ? picks.length : 0} rows in daily_picks table for tonight window.\n`);

  // Build unified fixture map
  const fixtureMap = new Map();

  if (matches) {
    for (const m of matches) {
      const fid = m.id;
      const kUtc = new Date(m.kickoff + 'Z');
      const kWib = new Date(kUtc.getTime() + 7 * 3600 * 1000).toISOString().replace('T', ' ').substring(0, 19) + ' WIB';
      
      const key = `${m.home_team}__${m.away_team}__${m.kickoff}`;
      fixtureMap.set(key, {
        matchId: m.id,
        homeTeam: m.home_team,
        awayTeam: m.away_team,
        league: m.league,
        kickoffUtc: kUtc.toISOString(),
        kickoffWib: kWib,
        status: m.status,
        ahAvailable: false,
        ouAvailable: false,
        ahOdds: null,
        ouOdds: null,
        ahLine: null,
        ouLine: null,
        bookmakers: new Set(),
        oddsUpdatedAt: null,
        verdicts: [],
        fixtureIds: new Set([m.id]),
        sources: new Set(['matches_table']),
        isQuarantined: false,
        quarantineReasons: []
      });
    }
  }

  if (picks) {
    for (const p of picks) {
      // Find matching fixture or add
      const kUtc = new Date(p.kickoff_utc);
      const kWib = new Date(kUtc.getTime() + 7 * 3600 * 1000).toISOString().replace('T', ' ').substring(0, 19) + ' WIB';
      
      // Normalize team names for matching
      const normHome = p.home_team.replace(' United', '').replace(' Town', '').trim();
      const normAway = p.away_team.replace(' United', '').replace(' Town', '').trim();
      
      let entry = null;
      for (const [k, v] of fixtureMap.entries()) {
        const vNormHome = v.homeTeam.replace(' United', '').replace(' Town', '').trim();
        const vNormAway = v.awayTeam.replace(' United', '').replace(' Town', '').trim();
        if (vNormHome === normHome && vNormAway === normAway) {
          entry = v;
          break;
        }
      }

      if (!entry) {
        const key = `${p.home_team}__${p.away_team}__${p.kickoff_utc}`;
        entry = {
          matchId: p.fixture_id,
          homeTeam: p.home_team,
          awayTeam: p.away_team,
          league: p.league,
          kickoffUtc: p.kickoff_utc,
          kickoffWib: kWib,
          status: 'upcoming',
          ahAvailable: false,
          ouAvailable: false,
          ahOdds: null,
          ouOdds: null,
          ahLine: null,
          ouLine: null,
          bookmakers: new Set(),
          oddsUpdatedAt: null,
          verdicts: [],
          fixtureIds: new Set(),
          sources: new Set(),
          isQuarantined: false,
          quarantineReasons: []
        };
        fixtureMap.set(key, entry);
      }

      entry.sources.add('daily_picks');
      entry.fixtureIds.add(p.fixture_id);
      entry.verdicts.push(`${p.market_type}:${p.verdict}`);
      
      if (p.market_bookmaker) {
        entry.bookmakers.add(p.market_bookmaker);
      }

      if (p.market_type === 'ASIAN_HANDICAP') {
        if (p.market_odds && Number(p.market_odds) > 1) {
          entry.ahAvailable = true;
          entry.ahOdds = p.market_odds;
          entry.ahLine = p.prediction || p.line;
          entry.oddsUpdatedAt = p.created_at;
        }
      }

      if (p.market_type === 'OVER_UNDER') {
        if (p.market_odds && Number(p.market_odds) > 1) {
          entry.ouAvailable = true;
          entry.ouOdds = p.market_odds;
          entry.ouLine = p.prediction || p.line;
          entry.oddsUpdatedAt = p.created_at;
        }
      }

      // Check quarantine conditions
      if (p.model_probability === 0.7064) {
        entry.isQuarantined = true;
        entry.quarantineReasons.push('STATIC_FALLBACK_PROBABILITY_0.7064');
      }
      if (p.home_team.includes('Hull') || p.away_team.includes('Hull')) {
        entry.isQuarantined = true;
        entry.quarantineReasons.push('COMPETITION_MISMATCH_HULL_CITY');
      }
      if (p.confidence === 0 && p.verdict === 'LEWATI') {
        // Normal skip
      }
    }
  }

  console.log('------------------------------------------------------------------------');
  console.log('TONIGHT FIXTURES & ODDS MATRIX (ASIA/JAKARTA TIMEZONE):');
  console.log('------------------------------------------------------------------------');
  console.log('kickoff_local | kickoff_utc | league | home | away | fixture_id | AH_available | OU_available | bookmaker_count | odds_updated_at');
  console.log('------------------------------------------------------------------------');

  const rows = Array.from(fixtureMap.values()).sort((a, b) => new Date(a.kickoffUtc) - new Date(b.kickoffUtc));

  for (const r of rows) {
    const bmCount = r.bookmakers.size;
    const fids = Array.from(r.fixtureIds).join(' / ');
    const ahStr = r.ahAvailable ? `YES (${r.ahLine} @ ${r.ahOdds})` : 'NO';
    const ouStr = r.ouAvailable ? `YES (${r.ouLine} @ ${r.ouOdds})` : 'NO';
    const updated = r.oddsUpdatedAt || 'N/A';
    console.log(`${r.kickoffWib} | ${r.kickoffUtc} | ${r.league} | ${r.homeTeam} vs ${r.awayTeam} | ${fids} | ${ahStr} | ${ouStr} | ${bmCount} | ${updated}`);
    if (r.isQuarantined) {
      console.log(`   [QUARANTINE ENFORCED]: ${r.quarantineReasons.join(', ')}`);
    }
  }

  console.log('------------------------------------------------------------------------\n');
  console.log('SUMMARY METRICS FOR TONIGHT:');
  console.log(`1. Total Upcoming Fixtures Tonight: ${rows.length}`);
  console.log(`2. Fixtures with AH Available: ${rows.filter(r => r.ahAvailable).length}`);
  console.log(`3. Fixtures with OU Available: ${rows.filter(r => r.ouAvailable).length}`);
  console.log(`4. Fixtures with BOTH AH & OU Available: ${rows.filter(r => r.ahAvailable && r.ouAvailable).length}`);
  console.log(`5. Fixtures with AH Only: ${rows.filter(r => r.ahAvailable && !r.ouAvailable).length}`);
  console.log(`6. Fixtures with NO Odds (Awaiting Lines): ${rows.filter(r => !r.ahAvailable && !r.ouAvailable).length}`);
  console.log(`7. Quarantined Fixtures: ${rows.filter(r => r.isQuarantined).length}`);
}

generateMatrix().catch(console.error);
