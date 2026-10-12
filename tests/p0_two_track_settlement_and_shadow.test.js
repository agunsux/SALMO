// SALMO × HANDICAPLAB — P0 Two-Track Verification Test Suite
// Covers:
// - Track 1 §1.3: All 8 mandatory Asian Handicap & Over/Under quarter/half/whole-line settlement vectors + Sat 10 Oct EPL quarter-lines
// - Track 2 §2.2–§2.6: League-specific parameter refit, mean=1.0000 normalization, cold-start prior, zero EPL rating leakage,
//   walk-forward chronological integrity, independent capability flags, and PRODUCTION vs SHADOW vs NONE ledger tier separation.

const test = require('node:test');
const assert = require('node:assert');
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

const { SettlementEngine } = require('../src/engine/settlement/settlementEngine.ts');
const {
  CANONICAL_15_LEAGUES,
  getProductionPickLeagues,
  getShadowResearchLeagues,
} = require('../src/config/multiLeagueRegistry.ts');
const { LEAGUE_PROFILES } = require('../src/engine/features/competitionProfile.ts');
const { resolveTeamRating } = require('../src/engine/features/teamRatings.ts');
const { buildScoreGrid } = require('../src/engine/probability/scoreGrid.ts');
const { calculateAsianHandicapFromGrid } = require('../src/engine/ah/ahProbability.ts');
const { AsianTotalEngine } = require('../src/engine/ou/asianTotalEngine.ts');

const RATINGS_ARTIFACT_PATH = path.resolve(__dirname, '../data/artifacts/multi_league_team_ratings_v1.0.json');
const BACKTEST_ARTIFACT_PATH = path.resolve(__dirname, '../data/artifacts/multi_league_backtest_v1.0.json');
const RESEARCH_LEDGER_PATH = path.resolve(__dirname, '../data/verification/all_leagues_research_ledger.jsonl');

// ─── TRACK 1 §1.3: MANDATORY SETTLEMENT TEST VECTORS (1 UNIT STAKE, ODDS 1.95) ───

test('T1.1: Mandatory 8 quarter/half/whole-line settlement vectors at odds 1.95 (stake 1.0)', () => {
  const vectors = [
    {
      id: 'vec_1',
      marketType: 'AH',
      selection: 'Home -0.5',
      line: -0.5,
      homeGoals: 2,
      awayGoals: 1,
      oddsTaken: 1.95,
      expectedResult: 'WIN',
      expectedProfit: 0.95,
    },
    {
      id: 'vec_2',
      marketType: 'AH',
      selection: 'Home -0.25',
      line: -0.25,
      homeGoals: 1,
      awayGoals: 1,
      oddsTaken: 1.95,
      expectedResult: 'HALF_LOSS',
      expectedProfit: -0.50,
    },
    {
      id: 'vec_3',
      marketType: 'AH',
      selection: 'Home +0.25',
      line: 0.25,
      homeGoals: 1,
      awayGoals: 1,
      oddsTaken: 1.95,
      expectedResult: 'HALF_WIN',
      expectedProfit: 0.475,
    },
    {
      id: 'vec_4',
      marketType: 'AH',
      selection: 'Home -0.75',
      line: -0.75,
      homeGoals: 2,
      awayGoals: 1,
      oddsTaken: 1.95,
      expectedResult: 'HALF_WIN',
      expectedProfit: 0.475,
    },
    {
      id: 'vec_5',
      marketType: 'AH',
      selection: 'Home -1.0',
      line: -1.0,
      homeGoals: 2,
      awayGoals: 1,
      oddsTaken: 1.95,
      expectedResult: 'PUSH',
      expectedProfit: 0.00,
    },
    {
      id: 'vec_6',
      marketType: 'OU',
      selection: 'Over 2.5',
      line: 2.5,
      homeGoals: 2,
      awayGoals: 1,
      oddsTaken: 1.95,
      expectedResult: 'WIN',
      expectedProfit: 0.95,
    },
    {
      id: 'vec_7',
      marketType: 'OU',
      selection: 'Over 2.25',
      line: 2.25,
      homeGoals: 1,
      awayGoals: 1,
      oddsTaken: 1.95,
      expectedResult: 'HALF_LOSS',
      expectedProfit: -0.50,
    },
    {
      id: 'vec_8',
      marketType: 'OU',
      selection: 'Over 2.75',
      line: 2.75,
      homeGoals: 2,
      awayGoals: 1,
      oddsTaken: 1.95,
      expectedResult: 'HALF_WIN',
      expectedProfit: 0.475,
    },
  ];

  for (const v of vectors) {
    const res = SettlementEngine.settlePosition({
      ledgerPositionId: v.id,
      marketType: v.marketType,
      selection: v.selection,
      line: v.line,
      oddsTaken: v.oddsTaken,
      homeGoals: v.homeGoals,
      awayGoals: v.awayGoals,
      matchStatus: 'FINISHED',
      homeTeam: 'Home',
      awayTeam: 'Away',
    });

    assert.strictEqual(res.settlementStatus, 'SETTLED', `${v.id} must be SETTLED`);
    assert.strictEqual(res.result, v.expectedResult, `${v.id} result must be ${v.expectedResult}, got ${res.result}`);
    assert.ok(
      Math.abs(res.profitUnits - v.expectedProfit) < 1e-6,
      `${v.id} profitUnits must be ${v.expectedProfit}, got ${res.profitUnits}`
    );
  }
});

test('T1.2: Saturday 10 Oct 2026 EPL quarter-line positions settle to exact HALF_LOSS and HALF_WIN', () => {
  // Arsenal FC vs Bournemouth (2-1): Arsenal FC -1.25 @ 1.95 -> HALF_LOSS (-0.50)
  const arsenalAh = SettlementEngine.settlePosition({
    ledgerPositionId: 'pred_epl_20261010_arsenal_fc_bournemouth_ah',
    marketType: 'AH',
    selection: 'Arsenal FC -1.25',
    line: -1.25,
    oddsTaken: 1.95,
    homeGoals: 2,
    awayGoals: 1,
    matchStatus: 'FINISHED',
    homeTeam: 'Arsenal FC',
    awayTeam: 'Bournemouth',
  });
  assert.strictEqual(arsenalAh.result, 'HALF_LOSS');
  assert.strictEqual(arsenalAh.profitUnits, -0.5);

  // Ipswich Town vs Fulham FC (2-1): Over 2.75 @ 1.98 -> HALF_WIN (+0.49)
  const ipswichOu = SettlementEngine.settlePosition({
    ledgerPositionId: 'pred_epl_20261010_ipswich_town_fulham_fc_ou',
    marketType: 'OU',
    selection: 'Over 2.75',
    line: 2.75,
    oddsTaken: 1.98,
    homeGoals: 2,
    awayGoals: 1,
    matchStatus: 'FINISHED',
    homeTeam: 'Ipswich Town',
    awayTeam: 'Fulham FC',
  });
  assert.strictEqual(ipswichOu.result, 'HALF_WIN');
  assert.strictEqual(ipswichOu.profitUnits, 0.49);
});

// ─── TRACK 2 §2.2–§2.6: MULTI-LEAGUE REFIT, WALK-FORWARD & SHADOW SEPARATION ───

test('T2.1: Multi-league registry has independent capability flags and strict PRODUCTION / SHADOW / NONE separation', () => {
  assert.strictEqual(CANONICAL_15_LEAGUES.length, 15);

  const prodLeagues = getProductionPickLeagues();
  assert.strictEqual(prodLeagues.length, 0, 'In Phase 2D NO-GO status, exactly 0 leagues are enabled for PRODUCTION picks');

  const shadowLeagues = getShadowResearchLeagues();
  assert.strictEqual(shadowLeagues.length, 14, '14 empirically refitted leagues (including demoted ENG-PL) are in SHADOW mode');

  for (const l of shadowLeagues) {
    assert.strictEqual(l.production_status, 'SHADOW', `${l.internal_league_id} production_status must be SHADOW`);
    assert.strictEqual(l.ledger_tier, 'SHADOW', `${l.internal_league_id} ledger_tier must be SHADOW`);
    assert.strictEqual(l.model_ready, true, `${l.internal_league_id} model_ready must be true`);
    assert.strictEqual(l.ah_research_enabled, true);
    assert.strictEqual(l.ou_research_enabled, true);
    assert.strictEqual(l.ah_prediction_enabled, true, `${l.internal_league_id} ah_prediction_enabled must be true for shadow probability generation`);
    assert.strictEqual(l.ou_prediction_enabled, true, `${l.internal_league_id} ou_prediction_enabled must be true for shadow probability generation`);
    assert.strictEqual(l.production_pick_enabled, false, `${l.internal_league_id} production_pick_enabled must be false`);
    assert.strictEqual(l.odds_enabled, false, `${l.internal_league_id} odds_enabled must be false while OddsPapi quota hard-stopped`);
  }

  const idn = CANONICAL_15_LEAGUES.find(l => l.internal_league_id === 'IDN-L1');
  assert.ok(idn);
  assert.strictEqual(idn.production_status, 'PAUSED');
  assert.strictEqual(idn.ledger_tier, 'NONE');
  assert.strictEqual(idn.model_ready, false);
  assert.strictEqual(idn.ah_prediction_enabled, false);
  assert.strictEqual(idn.ou_prediction_enabled, false);
  assert.strictEqual(idn.production_pick_enabled, false);
});

test('T2.2: All 14 refitted leagues have distinct empirical parameters and mean=1.0000 normalized ratings', () => {
  const ratingsArtifact = JSON.parse(fs.readFileSync(RATINGS_ARTIFACT_PATH, 'utf8'));

  const refittedIds = [
    'ENG-PL', 'ESP-LALIGA', 'ITA-SERIEA', 'DEU-BUNDESLIGA', 'FRA-LIGUE1',
    'NED-ERE', 'POR-PRIMEIRA', 'BEL-PRO', 'SCO-PREM', 'ENG-CHAMP',
    'USA-MLS', 'SAU-PRO', 'JPN-J1', 'KOR-K1'
  ];

  for (const id of refittedIds) {
    const lProfile = ratingsArtifact.leagueProfiles[id];
    const lTeamsMap = ratingsArtifact.leagues[id];
    assert.ok(lProfile, `Ratings artifact leagueProfiles must contain ${id}`);
    assert.ok(lTeamsMap, `Ratings artifact leagues must contain ${id}`);
    assert.ok(lProfile.sampleMatches >= 400, `${id} must have >= 400 historical matches analyzed, got ${lProfile.sampleMatches}`);

    const teams = Object.values(lTeamsMap);
    assert.ok(teams.length >= 12, `${id} must have >= 12 rated teams`);
    const nonColdTeams = teams.filter(t => !t.cold_start);
    const meanAtt = nonColdTeams.reduce((s, t) => s + t.attack_strength, 0) / nonColdTeams.length;
    const meanDef = nonColdTeams.reduce((s, t) => s + t.defense_strength, 0) / nonColdTeams.length;

    assert.ok(Math.abs(meanAtt - 1.0) < 0.05, `${id} mean attack must be normalized near 1.0000, got ${meanAtt}`);
    assert.ok(Math.abs(meanDef - 1.0) < 0.05, `${id} mean defense must be normalized near 1.0000, got ${meanDef}`);

    // Verify cold start teams use conservative priors if present
    const coldTeams = teams.filter(t => t.cold_start);
    for (const ct of coldTeams) {
      assert.ok(ct.matches_played < 8, `Cold start team ${ct.team_name} must have < 8 matches`);
    }

    const profile = LEAGUE_PROFILES[id];
    assert.ok(profile, `Competition profile must exist for ${id}`);
    assert.ok(profile.sampleMatches >= 400, `${id} profile sampleMatches must be >= 400`);
    assert.ok(profile.dispersionRatio > 0.8 && profile.dispersionRatio < 1.5, `${id} dispersionRatio must be empirical`);
  }
});

test('T2.3: Zero EPL rating leakage across leagues', () => {
  // Arsenal must NOT resolve in La Liga or Serie A
  assert.strictEqual(resolveTeamRating('Arsenal', undefined, false, 'La Liga'), null);
  assert.strictEqual(resolveTeamRating('Arsenal', undefined, false, 'Serie A'), null);

  // Barcelona must NOT resolve in Premier League
  assert.strictEqual(resolveTeamRating('Barcelona', undefined, false, 'Premier League'), null);
});

test('T2.4: AH and OU probability outputs sum to 1.0 across whole, half, and quarter lines', () => {
  const grid = buildScoreGrid(1.65, 1.15, -0.05);

  for (const line of [-1.25, -1.0, -0.75, -0.5, -0.25, 0, 0.25, 0.5]) {
    const ah = calculateAsianHandicapFromGrid(grid, line);
    const totalHome = ah.win + ah.halfWin + ah.push + ah.halfLoss + ah.loss;
    assert.ok(Math.abs(totalHome - 1.0) < 1e-3, `AH line ${line} home outcomes must sum to 1.0, got ${totalHome}`);
  }

  for (const line of [2.0, 2.25, 2.5, 2.75, 3.0]) {
    const ouOver = AsianTotalEngine.calculateFromGrid(grid, line, 'OVER');
    const pOver = ouOver.probabilities;
    const totalOver = pOver.fullWin + pOver.halfWin + pOver.push + pOver.halfLoss + pOver.fullLoss;
    assert.ok(Math.abs(totalOver - 1.0) < 1e-3, `OU line ${line} over outcomes must sum to 1.0, got ${totalOver}`);
  }
});

test('T2.5: Chronological walk-forward backtest has valid Brier and log-loss across all 14 refitted leagues', () => {
  const ratingsArtifact = JSON.parse(fs.readFileSync(RATINGS_ARTIFACT_PATH, 'utf8'));
  const refittedIds = [
    'ENG-PL', 'ESP-LALIGA', 'ITA-SERIEA', 'DEU-BUNDESLIGA', 'FRA-LIGUE1',
    'NED-ERE', 'POR-PRIMEIRA', 'BEL-PRO', 'SCO-PREM', 'ENG-CHAMP',
    'USA-MLS', 'SAU-PRO', 'JPN-J1', 'KOR-K1'
  ];

  for (const id of refittedIds) {
    const b = ratingsArtifact.backtestSummary[id];
    assert.ok(b, `Backtest summary must exist for ${id}`);
    assert.ok(b.nTrainInitial >= 250, `${id} nTrainInitial must be >= 250, got ${b.nTrainInitial}`);
    assert.ok(b.nEval >= 200, `${id} nEval must be >= 200, got ${b.nEval}`);
    assert.ok(b.ou25.brier > 0.15 && b.ou25.brier < 0.30, `${id} OU 2.5 Brier must be valid`);
    assert.ok(b.ahHomeMinus05.brier > 0.15 && b.ahHomeMinus05.brier < 0.30, `${id} AH -0.5 Brier must be valid`);
  }
});

test('T2.6: Research ledger separates PRODUCTION (20), SHADOW (294), and NONE (22) rows with explicit reason codes', () => {
  const lines = fs.readFileSync(RESEARCH_LEDGER_PATH, 'utf8').trim().split('\n').filter(Boolean);
  const rows = lines.map(l => JSON.parse(l));

  assert.strictEqual(rows.length, 336);

  const prodRows = rows.filter(r => r.ledgerTier === 'PRODUCTION');
  const shadowRows = rows.filter(r => r.ledgerTier === 'SHADOW');
  const noneRows = rows.filter(r => r.ledgerTier === 'NONE');

  assert.strictEqual(prodRows.length, 20, 'EPL must have 20 PRODUCTION rows');
  assert.strictEqual(shadowRows.length, 294, '13 shadow leagues must have 294 SHADOW rows (147 fixtures x 2)');
  assert.strictEqual(noneRows.length, 22, 'IDN-L1 must have 22 NONE rows (11 fixtures x 2)');

  for (const r of shadowRows) {
    assert.strictEqual(r.reasonCode, 'ODDS_UNAVAILABLE');
    assert.strictEqual(r.expectedValue, null);
    assert.strictEqual(r.verdict, 'LEWATI');
    assert.strictEqual(r.stakeUnits, 0);
  }

  for (const r of noneRows) {
    assert.strictEqual(r.reasonCode, 'MISSING_BASELINE');
    assert.strictEqual(r.informative, false);
    assert.strictEqual(r.expectedValue, null);
    assert.strictEqual(r.verdict, 'LEWATI');
  }
});
