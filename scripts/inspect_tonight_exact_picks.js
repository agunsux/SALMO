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

async function inspectTonightPicks() {
  const { data, error } = await supabase
    .from('daily_picks')
    .select('*')
    .gte('kickoff_utc', '2026-10-17T07:25:15Z')
    .lte('kickoff_utc', '2026-10-17T23:59:59Z')
    .order('kickoff_utc', { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  console.log('Total picks for tonight in daily_picks:', data.length);
  for (const p of data) {
    console.log(`[${p.id}]`);
    console.log(`  Match: ${p.home_team} vs ${p.away_team} (${p.league})`);
    console.log(`  Kickoff: ${p.kickoff_utc}`);
    console.log(`  Market: ${p.market_type} | Selection: ${p.prediction} | Line: ${p.line}`);
    console.log(`  Odds: ${p.market_odds} | Bookmaker: ${p.market_bookmaker || p.bookmaker || 'NONE'}`);
    console.log(`  Model Prob: ${p.model_probability} | EV: ${p.expected_value} | Verdict: ${p.verdict} | Conf: ${p.confidence}`);
    console.log(`  Source: ${p.source} | Fixture ID: ${p.fixture_id} | Created: ${p.created_at}`);
    console.log('----------------------------------------------------');
  }
}

inspectTonightPicks();
