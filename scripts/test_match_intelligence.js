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

async function testMatchIntelligence() {
  const { MatchIntelligenceService } = require('../src/engine/matchIntelligenceService');
  
  // Set reference time to 2026-10-17T07:25:15Z (14:25:15 WIB)
  const nowMs = new Date('2026-10-17T07:25:15Z').getTime();
  
  console.log('Testing MatchIntelligenceService with nowMs =', new Date(nowMs).toISOString());
  const matches = await MatchIntelligenceService.getUpcomingFixturesWithIntelligence({ nowMs });
  
  console.log(`Total upcoming fixtures returned by MatchIntelligenceService: ${matches.length}`);
  
  for (const m of matches) {
    const kUtc = new Date(m.kickoffUtc);
    const kWib = new Date(kUtc.getTime() + 7 * 3600 * 1000).toISOString().replace('T', ' ').substring(0, 19) + ' WIB';
    console.log(`\n--- [${m.league}] ${kWib} (${m.kickoffUtc}) | ${m.homeTeam} vs ${m.awayTeam} ---`);
    console.log(`  Canonical ID: ${m.canonicalMatchId} | Fixture ID: ${m.fixtureId}`);
    console.log(`  Prediction Available: ${m.isPredictionAvailable}`);
    console.log(`  AH Market: state=${m.markets.asianHandicap.state}, line=${m.markets.asianHandicap.line}, odds=${m.markets.asianHandicap.marketOdds}, bookmaker=${m.markets.asianHandicap.bookmaker}, verdict=${m.markets.asianHandicap.verdict}`);
    console.log(`  OU Market: state=${m.markets.overUnder.state}, line=${m.markets.overUnder.line}, odds=${m.markets.overUnder.marketOdds}, bookmaker=${m.markets.overUnder.bookmaker}, verdict=${m.markets.overUnder.verdict}`);
    console.log(`  BTTS Market: state=${m.markets.btts.state}, line=${m.markets.btts.line}, odds=${m.markets.btts.marketOdds}`);
  }
}

testMatchIntelligence().catch(console.error);
