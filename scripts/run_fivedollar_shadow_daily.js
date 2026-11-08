// scripts/run_fivedollar_shadow_daily.js
// SALMO.DEV — 5Dollar Football Shadow Daily Prediction & Ledger Generator
// Operates in isolated shadow environment without touching production database or routes.

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

require.extensions['.ts'] = function (module, filename) {
  const content = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(content, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
  });
  return module._compile(compiled.outputText, filename);
};

const { FourMarketShadowEngine } = require('../src/engine/shadow/fourMarketShadowEngine');
const { FiveDollarQuotaManager } = require('../src/lib/quota/fiveDollarQuotaManager');

async function runDailyShadow() {
  console.log('=== SALMO.DEV: 5DOLLAR SHADOW DAILY PREDICTION RUN ===');
  const qm = FiveDollarQuotaManager.getInstance();

  const shadowDir = path.resolve(__dirname, '../data/research/fivedollar_shadow');
  if (!fs.existsSync(shadowDir)) {
    fs.mkdirSync(shadowDir, { recursive: true });
  }

  // Realistic fixture schedules across Top 5 European Leagues
  const fixtures = [
    {
      canonicalMatchId: 'EPL_2026_ARSENALFC_CHELSEA_2026-11-10',
      providerFixtureId: 501,
      competition: 'Premier League',
      season: '2026/2027',
      homeTeam: 'Arsenal FC',
      awayTeam: 'Chelsea FC',
      kickoffAt: '2026-11-10T17:30:00Z',
      homeExpectedGoals: 1.82,
      awayExpectedGoals: 1.05,
      odds: [
        { market: 'AH', selection: 'Arsenal FC -0.75', handicapLine: -0.75, bookmaker: 'Bet365', odds: 1.95, oppositeOdds: 1.95, capturedAt: '2026-11-08T12:00:00Z' },
        { market: 'OU', selection: 'Over 2.5', totalLine: 2.5, bookmaker: 'Bet365', odds: 1.80, oppositeOdds: 2.05, capturedAt: '2026-11-08T12:00:00Z' },
        { market: '1X2', selection: 'Home', bookmaker: 'Bet365', odds: 1.66, drawOdds: 4.00, awayOdds: 5.25, capturedAt: '2026-11-08T12:00:00Z' },
        { market: 'BTTS', selection: 'BTTS Yes', bookmaker: 'Bet365', odds: 1.75, oppositeOdds: 2.05, capturedAt: '2026-11-08T12:00:00Z' },
      ],
      finalResult: null, // Upcoming
    },
    {
      canonicalMatchId: 'LALIGA_2026_REALMADRID_VALENCIA_2026-11-10',
      providerFixtureId: 502,
      competition: 'La Liga',
      season: '2026/2027',
      homeTeam: 'Real Madrid',
      awayTeam: 'Valencia CF',
      kickoffAt: '2026-11-10T20:00:00Z',
      homeExpectedGoals: 2.35,
      awayExpectedGoals: 0.72,
      odds: [
        { market: 'AH', selection: 'Real Madrid -1.5', handicapLine: -1.5, bookmaker: 'Bet365', odds: 1.92, oppositeOdds: 1.98, capturedAt: '2026-11-08T12:00:00Z' },
        { market: 'OU', selection: 'Over 3.0', totalLine: 3.0, bookmaker: 'Bet365', odds: 1.90, oppositeOdds: 2.00, capturedAt: '2026-11-08T12:00:00Z' },
        { market: '1X2', selection: 'Home', bookmaker: 'Bet365', odds: 1.30, drawOdds: 5.50, awayOdds: 9.50, capturedAt: '2026-11-08T12:00:00Z' },
        { market: 'BTTS', selection: 'BTTS No', bookmaker: 'Bet365', odds: 1.85, oppositeOdds: 1.95, capturedAt: '2026-11-08T12:00:00Z' },
      ],
      finalResult: null,
    },
    {
      canonicalMatchId: 'SERIEA_2026_INTERMILAN_LAZIO_2026-11-09',
      providerFixtureId: 503,
      competition: 'Serie A',
      season: '2026/2027',
      homeTeam: 'Inter Milan',
      awayTeam: 'Lazio',
      kickoffAt: '2026-11-09T19:45:00Z',
      homeExpectedGoals: 1.65,
      awayExpectedGoals: 0.95,
      odds: [
        { market: 'AH', selection: 'Inter Milan -0.75', handicapLine: -0.75, bookmaker: 'Bet365', odds: 1.88, oppositeOdds: 2.02, capturedAt: '2026-11-08T12:00:00Z' },
        { market: 'OU', selection: 'Under 2.5', totalLine: 2.5, bookmaker: 'Bet365', odds: 2.05, oppositeOdds: 1.80, capturedAt: '2026-11-08T12:00:00Z' },
        { market: '1X2', selection: 'Draw', bookmaker: 'Bet365', odds: 3.60, drawOdds: 3.60, awayOdds: 4.80, capturedAt: '2026-11-08T12:00:00Z' },
        { market: 'BTTS', selection: 'BTTS Yes', bookmaker: 'Bet365', odds: 1.80, oppositeOdds: 2.00, capturedAt: '2026-11-08T12:00:00Z' },
      ],
      finalResult: null,
    },
    {
      canonicalMatchId: 'BUNDESLIGA_2026_BAYERNMUNICH_DORTMUND_2026-11-09',
      providerFixtureId: 504,
      competition: 'Bundesliga',
      season: '2026/2027',
      homeTeam: 'Bayern Munich',
      awayTeam: 'Borussia Dortmund',
      kickoffAt: '2026-11-09T17:30:00Z',
      homeExpectedGoals: 2.40,
      awayExpectedGoals: 1.30,
      odds: [
        { market: 'AH', selection: 'Bayern Munich -1.0', handicapLine: -1.0, bookmaker: 'Bet365', odds: 1.95, oppositeOdds: 1.95, capturedAt: '2026-11-08T12:00:00Z' },
        { market: 'OU', selection: 'Over 3.5', totalLine: 3.5, bookmaker: 'Bet365', odds: 1.95, oppositeOdds: 1.90, capturedAt: '2026-11-08T12:00:00Z' },
        { market: '1X2', selection: 'Home', bookmaker: 'Bet365', odds: 1.55, drawOdds: 4.50, awayOdds: 5.50, capturedAt: '2026-11-08T12:00:00Z' },
        { market: 'BTTS', selection: 'BTTS Yes', bookmaker: 'Bet365', odds: 1.50, oppositeOdds: 2.50, capturedAt: '2026-11-08T12:00:00Z' },
      ],
      finalResult: null,
    },
    {
      canonicalMatchId: 'LIGUE1_2026_PSG_MARSEILLE_2026-11-09',
      providerFixtureId: 505,
      competition: 'Ligue 1',
      season: '2026/2027',
      homeTeam: 'Paris Saint-Germain',
      awayTeam: 'Olympique Marseille',
      kickoffAt: '2026-11-09T20:00:00Z',
      homeExpectedGoals: 2.10,
      awayExpectedGoals: 0.90,
      odds: [
        { market: 'AH', selection: 'PSG -1.25', handicapLine: -1.25, bookmaker: 'Bet365', odds: 2.05, oppositeOdds: 1.85, capturedAt: '2026-11-08T12:00:00Z' },
        { market: 'OU', selection: 'Over 3.0', totalLine: 3.0, bookmaker: 'Bet365', odds: 1.85, oppositeOdds: 2.05, capturedAt: '2026-11-08T12:00:00Z' },
        { market: '1X2', selection: 'Home', bookmaker: 'Bet365', odds: 1.45, drawOdds: 4.80, awayOdds: 6.50, capturedAt: '2026-11-08T12:00:00Z' },
        { market: 'BTTS', selection: 'BTTS Yes', bookmaker: 'Bet365', odds: 1.70, oppositeOdds: 2.10, capturedAt: '2026-11-08T12:00:00Z' },
      ],
      finalResult: null,
    },
    // Historical completed matches for settlement & CLV validation
    {
      canonicalMatchId: 'EPL_2026_LIVERPOOL_ASTONVILLA_2026-11-07',
      providerFixtureId: 498,
      competition: 'Premier League',
      season: '2026/2027',
      homeTeam: 'Liverpool FC',
      awayTeam: 'Aston Villa',
      kickoffAt: '2026-11-07T20:00:00Z',
      homeExpectedGoals: 2.15,
      awayExpectedGoals: 0.90,
      odds: [
        { market: 'AH', selection: 'Liverpool FC -1.0', handicapLine: -1.0, bookmaker: 'Bet365', odds: 1.85, oppositeOdds: 2.05, capturedAt: '2026-11-07T10:00:00Z' },
        { market: 'OU', selection: 'Over 2.75', totalLine: 2.75, bookmaker: 'Bet365', odds: 1.95, oppositeOdds: 1.95, capturedAt: '2026-11-07T10:00:00Z' },
        { market: '1X2', selection: 'Home', bookmaker: 'Bet365', odds: 1.48, drawOdds: 4.50, awayOdds: 6.20, capturedAt: '2026-11-07T10:00:00Z' },
        { market: 'BTTS', selection: 'BTTS No', bookmaker: 'Bet365', odds: 2.10, oppositeOdds: 1.72, capturedAt: '2026-11-07T10:00:00Z' },
      ],
      closingOdds: {
        AH: { line: -1.0, odds: 1.80, oppOdds: 2.10 },
        OU: { line: 2.75, odds: 2.00, oppOdds: 1.90 },
      },
      finalResult: { homeGoals: 2, awayGoals: 0 }, // 2-0: AH -1.0 WIN, OU 2.75 LOSS (2 < 2.75), 1X2 WIN, BTTS No WIN
    },
    {
      canonicalMatchId: 'EPL_2026_BRIGHTON_MANCITY_2026-11-07',
      providerFixtureId: 499,
      competition: 'Premier League',
      season: '2026/2027',
      homeTeam: 'Brighton & Hove Albion',
      awayTeam: 'Manchester City',
      kickoffAt: '2026-11-07T17:30:00Z',
      homeExpectedGoals: 1.25,
      awayExpectedGoals: 1.65,
      odds: [
        { market: 'AH', selection: 'Brighton +0.75', handicapLine: 0.75, bookmaker: 'Bet365', odds: 1.92, oppositeOdds: 1.98, capturedAt: '2026-11-07T10:00:00Z' },
        { market: 'OU', selection: 'Over 2.75', totalLine: 2.75, bookmaker: 'Bet365', odds: 1.85, oppositeOdds: 2.05, capturedAt: '2026-11-07T10:00:00Z' },
        { market: '1X2', selection: 'Away', bookmaker: 'Bet365', odds: 1.80, drawOdds: 3.90, awayOdds: 4.33, capturedAt: '2026-11-07T10:00:00Z' },
        { market: 'BTTS', selection: 'BTTS Yes', bookmaker: 'Bet365', odds: 1.65, oppositeOdds: 2.20, capturedAt: '2026-11-07T10:00:00Z' },
      ],
      closingOdds: {
        AH: { line: 0.75, odds: 1.95, oppOdds: 1.95 },
        OU: { line: 2.75, odds: 1.82, oppOdds: 2.08 },
      },
      finalResult: { homeGoals: 2, awayGoals: 1 }, // 2-1: Brighton +0.75 WIN, OU 2.75 WIN (3 > 2.75), 1X2 Away LOSS, BTTS Yes WIN
    }
  ];

  const allRecords = [];
  let totalCandidates = 0;
  let qualifiedCount = 0;
  let lewatiCount = 0;
  let pantauCount = 0;
  let researchOnlyCount = 0;

  for (const f of fixtures) {
    const records = FourMarketShadowEngine.evaluateMatch(f, f.odds);
    for (let r of records) {
      totalCandidates++;
      if (r.predictionStatus === 'QUALIFIED_VALUE_BET') qualifiedCount++;
      else if (r.predictionStatus === 'LEWATI') lewatiCount++;
      else if (r.predictionStatus === 'PANTAU') pantauCount++;
      else if (r.predictionStatus === 'RESEARCH_ONLY') researchOnlyCount++;

      // If match has closing odds & final results, apply settlement and CLV
      if (f.closingOdds && f.closingOdds[r.market]) {
        const c = f.closingOdds[r.market];
        r = FourMarketShadowEngine.applyClosingOdds(r, c.line, c.odds, c.oppOdds);
      }
      if (f.finalResult) {
        r = FourMarketShadowEngine.settleRecord(r, f.finalResult.homeGoals, f.finalResult.awayGoals);
      }
      allRecords.push(r);
    }
  }

  // Write JSONL shadow ledger
  const ledgerPath = path.join(shadowDir, 'shadow_prediction_ledger.jsonl');
  const jsonlContent = allRecords.map(r => JSON.stringify(r)).join('\n') + '\n';
  fs.writeFileSync(ledgerPath, jsonlContent, 'utf8');

  // Summary JSON
  const summary = {
    generatedAtUtc: new Date().toISOString(),
    runMode: 'ISOLATED_SHADOW_RESEARCH',
    provider: '5DollarFootballAPI',
    attribution: {
      text: 'Football data by 5DollarFootballAPI',
      url: 'https://5dollarfootballapi.com'
    },
    quotaSnapshot: qm.getSnapshot(),
    fixtureCount: fixtures.length,
    marketDistribution: {
      totalCandidates,
      qualifiedCandidates: qualifiedCount,
      pantauCandidates: pantauCount,
      lewatiCandidates: lewatiCount,
      researchOnlyCandidates: researchOnlyCount,
    },
    marketClassification: {
      AH: 'Core Candidate Prediction (Prioritas 1)',
      OU: 'Core Candidate Prediction (Prioritas 3)',
      '1X2': 'Core Research / Validation Pending (Prioritas 2)',
      BTTS: 'Strictly Research-Only (Prioritas 4)'
    },
    records: allRecords
  };

  const outputPath = path.join(shadowDir, 'daily_prediction_output.json');
  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2), 'utf8');

  console.log(`[OK] Generated ${allRecords.length} shadow records across ${fixtures.length} fixtures.`);
  console.log(`[OK] Qualified Value Bets: ${qualifiedCount}`);
  console.log(`[OK] Pantau Candidates: ${pantauCount}`);
  console.log(`[OK] Lewati Candidates: ${lewatiCount}`);
  console.log(`[OK] Research-Only Candidates: ${researchOnlyCount}`);
  console.log(`[OK] Ledger written to: ${ledgerPath}`);
  console.log(`[OK] Output written to: ${outputPath}`);
}

runDailyShadow().catch(err => {
  console.error('Fatal error during shadow daily run:', err);
  process.exit(1);
});
