const { createClient } = require('@supabase/supabase-js');

const fs = require('fs');
const path = require('path');

if (!process.env.SUPABASE_URL && fs.existsSync('.env.local')) {
  const lines = fs.readFileSync('.env.local', 'utf8').split('\n');
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
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase configuration in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectDailyPicks() {
  console.log('--- Inspecting Supabase public.daily_picks ---');
  
  // Total count
  const { count, error: countErr } = await supabase
    .from('daily_picks')
    .select('*', { count: 'exact', head: true });
    
  console.log('Total daily_picks count:', count);

  // Breakdown by source
  const { data: allPicks, error: allErr } = await supabase
    .from('daily_picks')
    .select('id, fixture_id, league, home_team, away_team, kickoff_utc, market_type, prediction, model_probability, market_odds, fair_odds, edge_pct, confidence, verdict, source, created_at, reasoning')
    .order('created_at', { ascending: false });

  if (allErr) {
    console.error('Query error:', allErr);
    process.exit(1);
  }

  const bySource = {};
  const byVerdict = {};
  allPicks.forEach(p => {
    bySource[p.source] = (bySource[p.source] || 0) + 1;
    byVerdict[p.verdict] = (byVerdict[p.verdict] || 0) + 1;
  });

  console.log('Breakdown by source:', bySource);
  console.log('Breakdown by verdict:', byVerdict);

  // Filter for LAYAK picks
  const layakPicks = allPicks.filter(p => p.verdict === 'LAYAK');
  console.log('\n================ LAYAK PICKS (' + layakPicks.length + ') ================');
  layakPicks.forEach((p, idx) => {
    console.log(`[LAYAK #${idx + 1}] ID: ${p.id}`);
    console.log(`  Match: ${p.home_team} vs ${p.away_team} (${p.league})`);
    console.log(`  Fixture ID: ${p.fixture_id}`);
    console.log(`  Kickoff UTC: ${p.kickoff_utc}`);
    console.log(`  Market: ${p.market_type} | Selection: ${p.prediction}`);
    console.log(`  Model Prob: ${p.model_probability} (${(p.model_probability * 100).toFixed(2)}%) | Fair Odds: ${p.fair_odds}`);
    console.log(`  Market Odds: ${p.market_odds} | Edge: ${p.edge_pct}% | Confidence: ${p.confidence}`);
    console.log(`  Source: ${p.source} | Created At: ${p.created_at}`);
    console.log(`  Reasoning:`, typeof p.reasoning === 'string' ? p.reasoning.slice(0, 300) : p.reasoning);
    console.log('----------------------------------------------------');
  });

  // Filter for most recent run records (e.g. from 2026-10-16 / 2026-10-17)
  const recentPicks = allPicks.filter(p => p.created_at && p.created_at.startsWith('2026-10-16'));
  console.log('\n================ RECENT RUN PICKS (2026-10-16) (' + recentPicks.length + ') ================');
  console.log('Recent breakdown by verdict:');
  const recentVerdicts = {};
  recentPicks.forEach(p => {
    recentVerdicts[p.verdict] = (recentVerdicts[p.verdict] || 0) + 1;
  });
  console.log(recentVerdicts);

  const sampleRecent = recentPicks.slice(0, 5);
  sampleRecent.forEach((p, idx) => {
    console.log(`[Recent #${idx + 1}] ${p.home_team} vs ${p.away_team} | ${p.market_type} | ${p.prediction} | Verdict: ${p.verdict} | Odds: ${p.market_odds} | Prob: ${p.model_probability}`);
  });
}

inspectDailyPicks().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
