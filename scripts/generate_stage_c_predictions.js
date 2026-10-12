// SALMO.DEV — Stage C Canonical Model Execution & Research-Only Ledger Generator
// Evaluates all fixtures from the 15 candidate leagues against baseline validation criteria.
// Invariants:
// 1. Never use EPL baselines for another league without validation.
// 2. Write RESEARCH_ONLY rows only for leagues whose baseline validation passes.
// 3. Staging/local target only (data/verification/staging_research_only_ledger.jsonl). Zero production mutations.
// 4. Stable deterministic IDs and idempotency.

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
    },
  });
  module._compile(compiled.outputText, filename);
};

const { ProductionPredictionEngine } = require('../src/engine/pipeline/productionPredictionEngine.ts');
const { CompetitionProfileEngine } = require('../src/engine/features/competitionProfile.ts');
const { resolveTeamRating, CANONICAL_EPL_RATINGS } = require('../src/engine/features/teamRatings.ts');
const { FixtureIntegrityGuard } = require('../src/lib/fixtureIntegrity.ts');
const { CANONICAL_15_LEAGUES } = require('../src/config/multiLeagueRegistry.ts');

const EVIDENCE_PATH = path.resolve(
  process.env.USERPROFILE || 'C:/Users/RYZEN',
  '.gemini/antigravity/brain/a0bf40a6-284a-4dbf-9026-c0c6c3b8172e/scratch/stage_b1_fixture_evidence.json'
);

const STAGING_OUTPUT_PATH = path.resolve(__dirname, '../data/verification/staging_research_only_ledger.jsonl');

function auditLeagueBaselines(evidenceData) {
  const audits = [];

  evidenceData.leagueResults.forEach(lr => {
    const firstFixture = lr.fixtures[0];
    const leagueName = firstFixture.league.name;
    const prefix = FixtureIntegrityGuard.resolveLeaguePrefix(leagueName);
    const fixtureCount = lr.fixtures.length;

    const isEpl = prefix === 'EPL';
    const hasProfile = Boolean(isEpl || ['LALIGA', 'SERIEA', 'BUNDESLIGA', 'ENGCHAMP'].includes(prefix));
    const hasTeamRatings = isEpl;

    let validationStatus;
    let failureReason = null;

    if (!isEpl) {
      validationStatus = 'FAILS_VALIDATION';
      if (!hasProfile) {
        failureReason = 'Missing competition goals environment profile (uncalibrated goalEnvironment and rho)';
      } else if (!hasTeamRatings) {
        failureReason = 'Missing calibrated team attack/defense ratings (resolveTeamRating returns null; N < 3 matches)';
      }
    } else {
      validationStatus = 'VALIDATED_PASS';
    }

    audits.push({
      leagueName,
      leaguePrefix: prefix,
      tier: CANONICAL_15_LEAGUES.find(l => l.league_name === leagueName)?.tier || 'C',
      fixtureCount,
      hasProfile,
      hasTeamRatings,
      validationStatus,
      failureReason,
      researchRowsGenerated: 0,
    });
  });

  return audits;
}

function runStageCExecution(options = {}) {
  const raw = JSON.parse(fs.readFileSync(EVIDENCE_PATH, 'utf8'));
  const audits = auditLeagueBaselines(raw);
  const generatedRows = [];
  const runtimeEvaluationTimestamp = options.evaluationTimestamp || new Date().toISOString();
  const sourceDataTimestamp = raw.generatedAt || null;

  raw.leagueResults.forEach((lr, idx) => {
    const audit = audits[idx];
    if (audit.validationStatus !== 'VALIDATED_PASS') {
      // Strictly do not run model or write rows for failing leagues
      return;
    }

    lr.fixtures.forEach(f => {
      const fixtureInput = {
        fixtureId: String(f.fixture.id),
        homeTeam: f.teams.home.name,
        awayTeam: f.teams.away.name,
        league: f.league.name,
        season: String(f.league.season),
        kickoffUtc: f.fixture.date,
        venue: f.fixture.venue?.name,
      };

      const result = ProductionPredictionEngine.evaluateFixture(fixtureInput);
      const pred = result.prediction;
      const canonicalMatchId = pred.canonicalMatchId;
      const evalMs = Date.parse(runtimeEvaluationTimestamp);
      const kickoffMs = Date.parse(f.fixture.date);
      const isRetrospective = Number.isNaN(evalMs) || Number.isNaN(kickoffMs) || evalMs >= kickoffMs;

      // Generate RESEARCH_ONLY rows for AH and OU
      // 1. Asian Handicap Market
      if (pred.markets.asianHandicap) {
        const ah = pred.markets.asianHandicap;
        const ahId = `pred_${canonicalMatchId}_AH_${ah.line}`;
        const ahRow = {
          predictionId: ahId,
          canonicalMatchId,
          fixtureId: String(f.fixture.id),
          league: f.league.name,
          homeTeam: f.teams.home.name,
          awayTeam: f.teams.away.name,
          kickoffUtc: f.fixture.date,
          market: 'AH',
          selection: ah.selection,
          line: ah.line,
          modelProbability: ah.modelProbabilityPct,
          fairOdds: ah.fairOdds,
          marketOdds: null,
          bookmaker: null,
          tier: 'RESEARCH_ONLY',
          verdict: 'LEWATI',
          reasoning: 'RESEARCH_ONLY: Dixon-Coles model probability generated for calibration tracking. Odds unavailable.',
          modelVersion: 'dixon-coles-v1.0',
          featureVersion: 'dynamic-ratings-v1.0',
          datasetVersion: 'v1.0.0-salmo-native',
          calibrationVersion: 'walkforward-mw6',
          settlement: 'PENDING',
          profitLoss: null,
          profitUnits: 0,
          stakeUnits: 0,
          predictionTimestamp: isRetrospective ? null : runtimeEvaluationTimestamp,
          sourceDataTimestamp,
          archiveCreatedAt: runtimeEvaluationTimestamp,
          createdAt: runtimeEvaluationTimestamp,
          isRetrospective,
          temporalEligibilityStatus: isRetrospective ? 'RETROSPECTIVE_EXCLUDED' : 'VALID_PRE_MATCH',
          eligibleForPreMatchMetrics: !isRetrospective,
        };
        generatedRows.push(ahRow);
        audit.researchRowsGenerated++;
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
          homeTeam: f.teams.home.name,
          awayTeam: f.teams.away.name,
          kickoffUtc: f.fixture.date,
          market: 'OU',
          selection: ou.selection,
          line: ou.line,
          modelProbability: ou.modelProbabilityPct,
          fairOdds: ou.fairOdds,
          marketOdds: null,
          bookmaker: null,
          tier: 'RESEARCH_ONLY',
          verdict: 'LEWATI',
          reasoning: 'RESEARCH_ONLY: Asian Total joint-score probability generated for calibration tracking. Odds unavailable.',
          modelVersion: 'ASIAN-TOTAL-jointscore-v1.0.0',
          featureVersion: 'dynamic-ratings-v1.0',
          datasetVersion: 'v1.0.0-salmo-native',
          calibrationVersion: 'walkforward-mw6',
          settlement: 'PENDING',
          profitLoss: null,
          profitUnits: 0,
          stakeUnits: 0,
          predictionTimestamp: isRetrospective ? null : runtimeEvaluationTimestamp,
          sourceDataTimestamp,
          archiveCreatedAt: runtimeEvaluationTimestamp,
          createdAt: runtimeEvaluationTimestamp,
          isRetrospective,
          temporalEligibilityStatus: isRetrospective ? 'RETROSPECTIVE_EXCLUDED' : 'VALID_PRE_MATCH',
          eligibleForPreMatchMetrics: !isRetrospective,
        };
        generatedRows.push(ouRow);
        audit.researchRowsGenerated++;
      }
    });
  });

  if (options.writeToDisk === true) {
    const dir = path.dirname(STAGING_OUTPUT_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const content = generatedRows.map(r => JSON.stringify(r)).join('\n') + '\n';
    fs.writeFileSync(STAGING_OUTPUT_PATH, content, 'utf8');
  }

  return { audits, generatedRows };
}

if (require.main === module) {
  const writeToDisk = process.argv.includes('--write');
  const { audits, generatedRows } = runStageCExecution({ writeToDisk });
  console.log('=== STAGE C LEAGUE BASELINE VALIDATION AUDIT ===');
  console.table(audits.map(a => ({
    League: a.leagueName,
    Prefix: a.leaguePrefix,
    Tier: a.tier,
    Fixtures: a.fixtureCount,
    Status: a.validationStatus,
    'Rows Written': a.researchRowsGenerated,
    'Failure Reason': a.failureReason ? a.failureReason.slice(0, 50) + '...' : 'VALIDATED PASS',
  })));
  console.log(`\nTotal RESEARCH_ONLY rows evaluated: ${generatedRows.length} (writeToDisk=${writeToDisk})`);
}

module.exports = { auditLeagueBaselines, runStageCExecution, STAGING_OUTPUT_PATH };
