import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const l of lines) {
    const t = l.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i !== -1) {
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

// Known MW6 UUIDs already present in daily_picks
const MW6_UUID_MAPPING: Record<number, string> = {
  1557417: 'bffe1c0e-d8f8-4dd7-8445-994354aa2e69', // Arsenal vs Leeds
  1557419: 'c8161f89-3e5b-4fd7-85ca-0e6bb21d093b', // Chelsea vs Bournemouth
  1557423: '68943f54-971d-421b-8739-b4910cddadbf', // Ipswich vs Fulham
  1557418: '2c2f99ba-cc5a-46e7-8420-a44366754db7', // Aston Villa vs Brentford
  1557426: 'bbb42fff-3825-452a-8b7e-391c638da27b', // Sunderland vs Brighton
  1557425: '5aa8d276-28e0-4fc6-8668-a847f97004e4', // Man Utd vs Tottenham
  1557421: '5d7ff312-412d-457e-875b-dc34f96e31ea', // Crystal Palace vs Nottingham Forest
  1557422: 'cf871ae2-10b2-4c8f-8852-047767805e96', // Hull City vs Everton
  1557424: '888304ad-ae6b-41ef-8bc9-e5db159839a9', // Liverpool vs Man City
  1557420: '8d709e7d-0a50-4d4b-8b24-b2ab1ac5c923', // Coventry vs Newcastle
};

// Deterministic UUID generation for MW7
function getDeterministicUuid(apiId: number): string {
  const hash = crypto.createHash('md5').update(`SALMO_FIXTURE_${apiId}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

async function main() {
  loadEnv();
  const apiKey = process.env.API_FOOTBALL_KEY || process.env.APIFOOTBALL_KEY;
  const baseUrl = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!apiKey || !supabaseUrl || !supabaseKey) {
    throw new Error('Missing environment configuration.');
  }

  const sb = createClient(supabaseUrl, supabaseKey);

  console.log('=== INGESTING 10-18 OCTOBER 2026 AUTHENTIC FIXTURES ===');

  // Fetch authentic fixtures from API-Football
  const url = `${baseUrl}/fixtures?league=39&from=2026-10-10&to=2026-10-18&season=2026`;
  const res = await fetch(url, {
    headers: {
      'x-apisports-key': apiKey,
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`API-Football responded with ${res.status}: ${res.statusText}`);
  }

  const json = await res.json();
  const fixtures = json.response || [];
  console.log(`Fetched ${fixtures.length} authentic Premier League fixtures.`);

  const matchRecordsToUpsert: any[] = [];

  for (const item of fixtures) {
    const f = item.fixture;
    const teams = item.teams;
    const apiId = f.id;
    const matchId = MW6_UUID_MAPPING[apiId] || getDeterministicUuid(apiId);

    matchRecordsToUpsert.push({
      id: matchId,
      home_team: teams.home.name,
      away_team: teams.away.name,
      league: 'Premier League',
      kickoff: f.date,
      status: 'upcoming',
      home_goals: null,
      away_goals: null,
      source_type: 'PROVIDER',
      data_status: 'ACTIVE',
      pipeline_state: 'CREATED',
      pipeline_mode: 'LIVE',
      pipeline_metadata: {
        apiFootballFixtureId: apiId,
        round: item.league.round,
        venue: f.venue?.name,
        referee: f.referee,
      },
      updated_at: new Date().toISOString(),
    });
  }

  console.log(`Upserting ${matchRecordsToUpsert.length} records into 'matches' table...`);

  const { data: upserted, error } = await sb
    .from('matches')
    .upsert(matchRecordsToUpsert, { onConflict: 'id' })
    .select('id, home_team, away_team, kickoff, status, source_type, data_status');

  if (error) {
    throw new Error(`Error upserting matches: ${error.message}`);
  }

  console.log(`[PASS] Successfully ingested/updated ${upserted.length} authentic matches!`);
  for (const m of upserted) {
    console.log(`  - [${m.kickoff}] ${m.home_team} vs ${m.away_team} (${m.status}, ${m.source_type}, ${m.data_status})`);
  }
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
