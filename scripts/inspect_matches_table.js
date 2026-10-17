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

async function inspectMatches() {
  const { data, error } = await supabase
    .from('matches')
    .select('id, home_team, away_team, league, kickoff, status, data_status, source_type')
    .gte('kickoff', '2026-10-16T00:00:00')
    .order('kickoff', { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  console.log(`Matches in matches table from 2026-10-16 onwards: ${data.length}`);
  data.forEach(m => {
    console.log(`[${m.id}] ${m.kickoff} | ${m.league} | ${m.home_team} vs ${m.away_team} | status: ${m.status} | data_status: ${m.data_status} | source_type: ${m.source_type}`);
  });
}

inspectMatches();
