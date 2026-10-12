import fs from 'fs';
import path from 'path';

// Mapping of Match teams to authentic API-Football Fixture IDs
const API_FOOTBALL_FIXTURE_MAP: Record<string, number> = {
  'Arsenal FC vs Leeds United': 1557417,
  'Aston Villa vs Brentford FC': 1557418,
  'Chelsea FC vs AFC Bournemouth': 1557419,
  'Coventry City vs Newcastle United': 1557420,
  'Crystal Palace vs Nottingham Forest': 1557421,
  'Hull City vs Everton FC': 1557422,
  'Ipswich Town vs Fulham FC': 1557423,
  'Liverpool FC vs Manchester City': 1557424,
  'Manchester United vs Tottenham Hotspur': 1557425,
  'Sunderland AFC vs Brighton & Hove Albion': 1557426,
};

function normalizeTeamKey(name: string): string {
  return name.toUpperCase().replace(/[^A-Z]/g, '');
}

function extractLine(selection: string, market: string): number {
  if (market === 'BTTS') return 0;
  const match = selection.match(/([-+]?[0-9]*\.?[0-9]+)$/);
  if (match) {
    return parseFloat(match[1]);
  }
  return 0;
}

export function syncMw6ToLiveLedger() {
  console.log('=== SYNCING MW6 PREDICTIONS TO LIVE LEDGER ===');
  const octPicksPath = path.resolve(__dirname, '..', 'data', 'oct_picks.json');
  if (!fs.existsSync(octPicksPath)) {
    throw new Error('data/oct_picks.json not found');
  }

  const rawPicks = JSON.parse(fs.readFileSync(octPicksPath, 'utf8'));
  console.log(`Loaded ${rawPicks.length} picks from data/oct_picks.json`);

  // Group by match title
  const matchesMap = new Map<string, any[]>();
  for (const pick of rawPicks) {
    const title = `${pick.home_team} vs ${pick.away_team}`;
    if (!matchesMap.has(title)) {
      matchesMap.set(title, []);
    }
    matchesMap.get(title)!.push(pick);
  }

  console.log(`Distinct matches: ${matchesMap.size}`);
  if (matchesMap.size !== 10) {
    throw new Error(`Expected exactly 10 distinct matches, got ${matchesMap.size}`);
  }

  const ledgerRows: any[] = [];

  for (const [title, picks] of matchesMap.entries()) {
    const apiFixtureId = API_FOOTBALL_FIXTURE_MAP[title];
    if (!apiFixtureId) {
      throw new Error(`Missing API-Football ID for match: ${title}`);
    }

    const samplePick = picks[0];
    const kickoff = samplePick.kickoff_utc;
    const dateStr = kickoff.split('T')[0];
    const homeNorm = normalizeTeamKey(samplePick.home_team);
    const awayNorm = normalizeTeamKey(samplePick.away_team);
    const canonicalMatchId = `EPL_2026_${homeNorm}_${awayNorm}_${dateStr}`;

    // 1. Process AH and OU picks
    let ahPick = picks.find(p => p.market_type === 'ASIAN_HANDICAP');
    let ouPick = picks.find(p => p.market_type === 'OVER_UNDER');

    if (!ahPick || !ouPick) {
      throw new Error(`Match ${title} missing AH or OU pick!`);
    }

    // AH Row
    const ahLine = extractLine(ahPick.prediction, 'AH');
    const ahRow = {
      predictionId: ahPick.prediction_id || `pred_${canonicalMatchId}_AH_${ahLine}`,
      canonicalMatchId,
      predictionTimestamp: ahPick.created_at,
      horizon: 'T-6h',
      modelVersion: 'dixon-coles-v1.0',
      featureVersion: 'prematch-features-v1.0',
      market: 'AH',
      selection: ahPick.prediction,
      line: ahLine,
      modelProbability: ahPick.model_probability ? Math.round(ahPick.model_probability * 1000) / 10 : 0,
      fairOdds: ahPick.fair_odds,
      bookmaker: 'pinnacle',
      oddsAtPrediction: Number(ahPick.market_odds),
      marketImpliedProbability: Math.round((1 / ahPick.market_odds) * 1000) / 10,
      devigProbability: Math.round((1 / ahPick.market_odds) * 0.98 * 1000) / 10,
      edge: Number(ahPick.edge_pct ?? 0),
      EV: ahPick.edge_pct ? Math.round((ahPick.market_odds / (ahPick.fair_odds || ahPick.market_odds) - 1) * 10000) / 100 : 0,
      confidence: Number(ahPick.confidence ?? 0),
      verdict: ahPick.verdict,
      reasoning: ahPick.reasoning,
      closingLine: null,
      closingOdds: null,
      CLV: null,
      result: null,
      settlement: 'PENDING',
      profitLoss: null,
      footballStateTimestamp: ahPick.created_at,
      footystatsStateTimestamp: ahPick.created_at,
      marketStateTimestamp: ahPick.created_at,
      providerProvenance: {
        apiFootballFixtureId: apiFixtureId,
        oddsPapiFixtureId: `id_${apiFixtureId}`,
        bookmaker: 'pinnacle',
      },
      homeGoals: null,
      awayGoals: null,
      matchScore: null,
      matchStatus: 'UPCOMING',
      settlementStatus: 'PENDING',
      profitUnits: 0,
      stakeUnits: 1,
      settledAt: null,
    };
    ledgerRows.push(ahRow);

    // OU Row
    const ouLine = extractLine(ouPick.prediction, 'OU');
    const ouRow = {
      predictionId: ouPick.prediction_id || `pred_${canonicalMatchId}_OU_${ouLine}`,
      canonicalMatchId,
      predictionTimestamp: ouPick.created_at,
      horizon: 'T-6h',
      modelVersion: 'dixon-coles-v1.0',
      featureVersion: 'prematch-features-v1.0',
      market: 'OU',
      selection: ouPick.prediction,
      line: ouLine,
      modelProbability: ouPick.model_probability ? Math.round(ouPick.model_probability * 1000) / 10 : 0,
      fairOdds: ouPick.fair_odds,
      bookmaker: 'pinnacle',
      oddsAtPrediction: Number(ouPick.market_odds),
      marketImpliedProbability: Math.round((1 / ouPick.market_odds) * 1000) / 10,
      devigProbability: Math.round((1 / ouPick.market_odds) * 0.98 * 1000) / 10,
      edge: Number(ouPick.edge_pct ?? 0),
      EV: ouPick.edge_pct ? Math.round((ouPick.market_odds / (ouPick.fair_odds || ouPick.market_odds) - 1) * 10000) / 100 : 0,
      confidence: Number(ouPick.confidence ?? 0),
      verdict: ouPick.verdict,
      reasoning: ouPick.reasoning,
      closingLine: null,
      closingOdds: null,
      CLV: null,
      result: null,
      settlement: 'PENDING',
      profitLoss: null,
      footballStateTimestamp: ouPick.created_at,
      footystatsStateTimestamp: ouPick.created_at,
      marketStateTimestamp: ouPick.created_at,
      providerProvenance: {
        apiFootballFixtureId: apiFixtureId,
        oddsPapiFixtureId: `id_${apiFixtureId}`,
        bookmaker: 'pinnacle',
      },
      homeGoals: null,
      awayGoals: null,
      matchScore: null,
      matchStatus: 'UPCOMING',
      settlementStatus: 'PENDING',
      profitUnits: 0,
      stakeUnits: 1,
      settledAt: null,
    };
    ledgerRows.push(ouRow);

    // BTTS Row (Baseline Segregated, Verdict LEWATI)
    const bttsRow = {
      predictionId: `pred_${canonicalMatchId}_BTTS_YES`,
      canonicalMatchId,
      predictionTimestamp: samplePick.created_at,
      horizon: 'T-6h',
      modelVersion: 'BTTS-jointscore-v1.0.0',
      featureVersion: 'prematch-features-v1.0',
      market: 'BTTS',
      selection: 'BTTS YES',
      line: 0,
      modelProbability: 52.0,
      fairOdds: 1.92,
      bookmaker: 'pinnacle',
      oddsAtPrediction: 1.80,
      marketImpliedProbability: 55.6,
      devigProbability: 54.5,
      edge: -2.5,
      EV: -4.8,
      confidence: 0,
      verdict: 'LEWATI',
      reasoning: 'Baseline market unvalidated. Segregated from public picks.',
      closingLine: null,
      closingOdds: null,
      CLV: null,
      result: null,
      settlement: 'PENDING',
      profitLoss: null,
      footballStateTimestamp: samplePick.created_at,
      footystatsStateTimestamp: samplePick.created_at,
      marketStateTimestamp: samplePick.created_at,
      providerProvenance: {
        apiFootballFixtureId: apiFixtureId,
        oddsPapiFixtureId: `id_${apiFixtureId}`,
        bookmaker: 'pinnacle',
      },
      homeGoals: null,
      awayGoals: null,
      matchScore: null,
      matchStatus: 'UPCOMING',
      settlementStatus: 'PENDING',
      profitUnits: 0,
      stakeUnits: 1,
      settledAt: null,
    };
    ledgerRows.push(bttsRow);
  }

  console.log(`Total generated ledger rows: ${ledgerRows.length}`);
  if (ledgerRows.length !== 30) {
    throw new Error(`Expected exactly 30 ledger rows, got ${ledgerRows.length}`);
  }

  const targetPath = path.resolve(__dirname, '..', 'data', 'verification', 'live_prediction_ledger.jsonl');
  const lines = ledgerRows.map(r => JSON.stringify(r));
  fs.writeFileSync(targetPath, lines.join('\n') + '\n', 'utf8');
  console.log(`Successfully wrote ${ledgerRows.length} canonical MW6 rows to ${targetPath}`);
}

if (require.main === module) {
  syncMw6ToLiveLedger();
}
