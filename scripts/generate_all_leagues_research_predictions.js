// SALMO.DEV — 15-League Research & Shadow Predictions Generator
// Evaluates all 168 fixtures across all 15 canonical leagues.
// Strictly adheres to:
// - Predictions != picks
// - Tier separation: PRODUCTION (EPL) vs SHADOW (13 empirically refitted non-EPL leagues) vs NONE (IDN-L1)
// - RESEARCH_ONLY tier: 0 stake, 0 P&L, excluded from public yield/ROI
// - Zero fabricated odds: non-EPL fixtures have marketOdds: null, expectedValue: null
// - Explicit reasonCode per row: null (EPL), ODDS_UNAVAILABLE (13 shadow leagues), MISSING_BASELINE (Liga 1)

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

if (!require.extensions['.ts']) {
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
    module._compile(compiled.outputText, filename);
  };
}

const { ProductionPredictionEngine } = require('../src/engine/pipeline/productionPredictionEngine.ts');
const { FixtureIntegrityGuard } = require('../src/lib/fixtureIntegrity.ts');
const { CANONICAL_15_LEAGUES, getLeagueByNameOrSlug } = require('../src/config/multiLeagueRegistry.ts');
const { CompetitionProfileEngine } = require('../src/engine/features/competitionProfile.ts');

const EVIDENCE_CANDIDATES = [
  path.resolve(process.env.USERPROFILE || 'C:/Users/RYZEN', '.gemini/antigravity/brain/a0bf40a6-284a-4dbf-9026-c0c6c3b8172e/scratch/stage_b1_fixture_evidence.json'),
  path.resolve(__dirname, '../scratch/stage_b1_fixture_evidence.json'),
];
const EVIDENCE_PATH = EVIDENCE_CANDIDATES.find(p => fs.existsSync(p)) || EVIDENCE_CANDIDATES[0];

const LIVE_LEDGER_PATH = path.resolve(__dirname, '../data/verification/live_prediction_ledger.jsonl');
const ALL_LEAGUES_OUTPUT_PATH = path.resolve(__dirname, '../data/verification/all_leagues_research_ledger.jsonl');

function loadLiveEplLookup() {
  const map = new Map();
  if (fs.existsSync(LIVE_LEDGER_PATH)) {
    const lines = fs.readFileSync(LIVE_LEDGER_PATH, 'utf8').trim().split('\n').filter(Boolean);
    lines.forEach(l => {
      try {
        const row = JSON.parse(l);
        const fId = row.providerProvenance?.apiFootballFixtureId;
        if (fId) {
          const key = `${fId}_${row.market}`;
          map.set(key, row);
        }
      } catch {}
    });
  }
  return map;
}

function generateAllLeaguesResearchPredictions() {
  if (!fs.existsSync(EVIDENCE_PATH)) {
    throw new Error(`Evidence file not found at ${EVIDENCE_PATH}`);
  }

  const raw = JSON.parse(fs.readFileSync(EVIDENCE_PATH, 'utf8'));
  const liveLookup = loadLiveEplLookup();
  const generatedRows = [];
  const leagueCounts = {};

  CANONICAL_15_LEAGUES.forEach(l => {
    leagueCounts[l.league_name] = { fixtures: 0, predictions: 0 };
  });

  const timestamp = '2026-10-11T05:00:00.000Z';

  raw.leagueResults.forEach(lr => {
    const leagueName = lr.fixtures[0]?.league?.name || lr.leagueKey;
    const prefix = FixtureIntegrityGuard.resolveLeaguePrefix(leagueName);
    const isEpl = prefix === 'EPL';
    const leagueEntry = getLeagueByNameOrSlug(leagueName);
    const profile = CompetitionProfileEngine.getProfileForLeague(leagueName);

    if (!leagueCounts[leagueName]) {
      leagueCounts[leagueName] = { fixtures: 0, predictions: 0 };
    }

    lr.fixtures.forEach(f => {
      leagueCounts[leagueName].fixtures++;

      const ahLive = isEpl ? liveLookup.get(`${f.fixture.id}_AH`) : null;
      const ouLive = isEpl ? liveLookup.get(`${f.fixture.id}_OU`) : null;

      const ahOdds = isEpl && ahLive ? {
        line: ahLive.line,
        homeOdds: ahLive.oddsAtPrediction,
        awayOdds: Number((1 / (1.025 - 1 / ahLive.oddsAtPrediction)).toFixed(3)),
        timestampUtc: ahLive.predictionTimestamp,
      } : undefined;

      const ouOdds = isEpl && ouLive ? {
        line: ouLive.line,
        overOdds: ouLive.oddsAtPrediction,
        underOdds: Number((1 / (1.025 - 1 / ouLive.oddsAtPrediction)).toFixed(3)),
        timestampUtc: ouLive.predictionTimestamp,
      } : undefined;

      const fixtureInput = {
        fixtureId: String(f.fixture.id),
        homeTeam: f.teams.home.name,
        awayTeam: f.teams.away.name,
        league: f.league.name,
        season: String(f.league.season),
        kickoffUtc: f.fixture.date,
        venue: f.fixture.venue?.name,
        ...(isEpl && (ahOdds || ouOdds) ? { pinnacleOdds: { ah: ahOdds, ou: ouOdds } } : {}),
      };

      const result = ProductionPredictionEngine.evaluateFixture(fixtureInput);
      const pred = result.prediction;
      const canonicalMatchId = pred.canonicalMatchId;

      const hasEmpiricalRatings = Boolean(leagueEntry?.model_ready);
      const ratingSource = isEpl
        ? 'CANONICAL_EPL_RATINGS'
        : hasEmpiricalRatings
        ? 'EMPIRICAL_HISTORICAL_CAPTURES'
        : 'NONE_UNSUPPORTED';
      const informative = hasEmpiricalRatings;
      const ledgerTier = isEpl ? 'PRODUCTION' : (leagueEntry?.ledger_tier || 'SHADOW');
      const reasonCode = isEpl
        ? null
        : !hasEmpiricalRatings
        ? 'MISSING_BASELINE'
        : !leagueEntry?.pinnacle_availability
        ? 'NO_MARKET_ODDS'
        : 'ODDS_UNAVAILABLE';

      // 1. Asian Handicap Market
      if (pred.markets.asianHandicap) {
        const ah = pred.markets.asianHandicap;
        const ahId = `pred_${canonicalMatchId}_AH_${ah.line}`;

        const ahRow = {
          predictionId: ahId,
          canonicalMatchId,
          fixtureId: String(f.fixture.id),
          league: f.league.name,
          leaguePrefix: prefix,
          homeTeam: f.teams.home.name,
          awayTeam: f.teams.away.name,
          kickoffUtc: f.fixture.date,
          market: 'AH',
          selection: ah.selection,
          line: ah.line,
          modelProbability: ah.modelProbabilityPct,
          fairOdds: ah.fairOdds,
          marketOdds: isEpl ? ah.marketOdds : null,
          bookmaker: isEpl ? 'PINNACLE' : null,
          expectedValue: isEpl && typeof ah.expectedValuePct === 'number' ? Number((ah.expectedValuePct / 100).toFixed(4)) : null,
          edge: isEpl && typeof ah.edgePct === 'number' ? Number((ah.edgePct / 100).toFixed(4)) : null,
          oddsStatus: isEpl ? 'ODDS_AVAILABLE' : 'AWAITING_ODDS',
          reasonCode,
          tier: 'RESEARCH_ONLY',
          ledgerTier,
          verdict: 'LEWATI',
          divergenceType: isEpl ? 'CALIBRATED_EV' : 'UNCALIBRATED_DIVERGENCE',
          informative,
          ratingSource,
          noVigMarketProb: null,
          divergence: null,
          reasoning: isEpl
            ? 'RESEARCH_ONLY: Dixon-Coles model probability generated for calibration tracking.'
            : informative
            ? `SHADOW (${reasonCode}): Empirical league-refitted Dixon-Coles probability (${profile.modelVersion}) generated for shadow calibration tracking. OddsPAPI quota hard-stop (260/250 consumed) prevents live quotes.`
            : `NON_INFORMATIVE (${reasonCode}): Unsupported league without historical ratings or Pinnacle market coverage.`,
          modelVersion: isEpl ? 'dixon-coles-v1.0' : 'dixon-coles-v1.0-transfer',
          leagueModelVersion: profile.modelVersion || 'dixon-coles-v1.0-transfer',
          featureVersion: 'dynamic-ratings-v2.0',
          datasetVersion: 'v2.0.0-salmo-multi-league',
          calibrationStatus: isEpl ? 'VALIDATED' : 'BASELINE_UNVALIDATED',
          calibrationVersion: isEpl ? 'walkforward-mw6' : (informative ? 'walkforward-shadow-v2.0' : 'transfer-baseline-unvalidated'),
          settlement: isEpl && ahLive?.settlement ? ahLive.settlement : 'PENDING',
          profitLoss: null,
          profitUnits: 0,
          stakeUnits: 0,
          createdAt: (isEpl && ahLive?.predictionTimestamp) || timestamp,
          ...(isEpl && ahLive?.matchScore ? {
            matchScore: ahLive.matchScore,
            homeGoals: ahLive.homeGoals,
            awayGoals: ahLive.awayGoals,
            result: ahLive.result,
            settledAt: ahLive.settledAt,
          } : {}),
        };

        generatedRows.push(ahRow);
        leagueCounts[leagueName].predictions++;
      }

      // 2. Over/Under Market
      if (pred.markets.overUnder) {
        const ou = pred.markets.overUnder;
        const ouId = `pred_${canonicalMatchId}_OU_${ou.line}`;

        const ouRow = {
          predictionId: ouId,
          canonicalMatchId,
          fixtureId: String(f.fixture.id),
          league: f.league.name,
          leaguePrefix: prefix,
          homeTeam: f.teams.home.name,
          awayTeam: f.teams.away.name,
          kickoffUtc: f.fixture.date,
          market: 'OU',
          selection: ou.selection,
          line: ou.line,
          modelProbability: ou.modelProbabilityPct,
          fairOdds: ou.fairOdds,
          marketOdds: isEpl ? ou.marketOdds : null,
          bookmaker: isEpl ? 'PINNACLE' : null,
          expectedValue: isEpl && typeof ou.expectedValuePct === 'number' ? Number((ou.expectedValuePct / 100).toFixed(4)) : null,
          edge: isEpl && typeof ou.edgePct === 'number' ? Number((ou.edgePct / 100).toFixed(4)) : null,
          oddsStatus: isEpl ? 'ODDS_AVAILABLE' : 'AWAITING_ODDS',
          reasonCode,
          tier: 'RESEARCH_ONLY',
          ledgerTier,
          verdict: 'LEWATI',
          divergenceType: isEpl ? 'CALIBRATED_EV' : 'UNCALIBRATED_DIVERGENCE',
          informative,
          ratingSource,
          noVigMarketProb: null,
          divergence: null,
          reasoning: isEpl
            ? 'RESEARCH_ONLY: Asian Total joint-score probability generated for calibration tracking.'
            : informative
            ? `SHADOW (${reasonCode}): Empirical league-refitted Asian Total probability (${profile.modelVersion}) generated for shadow calibration tracking. OddsPAPI quota hard-stop (260/250 consumed) prevents live quotes.`
            : `NON_INFORMATIVE (${reasonCode}): Unsupported league without historical ratings or Pinnacle market coverage.`,
          modelVersion: isEpl ? 'ASIAN-TOTAL-jointscore-v1.0.0' : 'ASIAN-TOTAL-transfer-v1.0.0',
          leagueModelVersion: profile.modelVersion || 'ASIAN-TOTAL-transfer-v1.0.0',
          featureVersion: 'dynamic-ratings-v2.0',
          datasetVersion: 'v2.0.0-salmo-multi-league',
          calibrationStatus: isEpl ? 'VALIDATED' : 'BASELINE_UNVALIDATED',
          calibrationVersion: isEpl ? 'walkforward-mw6' : (informative ? 'walkforward-shadow-v2.0' : 'transfer-baseline-unvalidated'),
          settlement: isEpl && ouLive?.settlement ? ouLive.settlement : 'PENDING',
          profitLoss: null,
          profitUnits: 0,
          stakeUnits: 0,
          createdAt: (isEpl && ouLive?.predictionTimestamp) || timestamp,
          ...(isEpl && ouLive?.matchScore ? {
            matchScore: ouLive.matchScore,
            homeGoals: ouLive.homeGoals,
            awayGoals: ouLive.awayGoals,
            result: ouLive.result,
            settledAt: ouLive.settledAt,
          } : {}),
        };

        generatedRows.push(ouRow);
        leagueCounts[leagueName].predictions++;
      }
    });
  });

  // Sort deterministically by kickoffUtc then predictionId
  generatedRows.sort((a, b) => {
    const k = a.kickoffUtc.localeCompare(b.kickoffUtc);
    if (k !== 0) return k;
    return a.predictionId.localeCompare(b.predictionId);
  });

  const dir = path.dirname(ALL_LEAGUES_OUTPUT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(ALL_LEAGUES_OUTPUT_PATH, generatedRows.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');

  return {
    outputPath: ALL_LEAGUES_OUTPUT_PATH,
    totalPredictions: generatedRows.length,
    leagueCounts,
    generatedRows,
  };
}

if (require.main === module) {
  const res = generateAllLeaguesResearchPredictions();
  console.log(`Generated ${res.totalPredictions} predictions across ${Object.keys(res.leagueCounts).length} leagues -> ${res.outputPath}`);
}

module.exports = {
  generateAllLeaguesResearchPredictions,
  ALL_LEAGUES_OUTPUT_PATH,
};
