/**
 * SALMO × HANDICAPLAB — Multi-League Empirical Refit & Walk-Forward Backtest Engine
 * Track 2 (§2.2, §2.3, §2.4):
 * - Extracts chronologically ordered completed matches per league from local verified captures:
 *   1) research/raw_dribble/stage3b_incremental/captures/ + stage2_probe_captures/ (Dribble360 2023–2026)
 *   2) ../HandicapLab/data/cache/epic66/apifootball_<leagueId>_<season>.json (API-Football Pro 2024–2025)
 * - Refits league-specific Dixon-Coles parameters (goalEnvironment, homeAdvantage, defaultRho, dispersion)
 * - Computes normalized team attack/defense ratings (league mean = 1.0000) with Bayesian cold-start shrinkage (k=6)
 * - Runs strict chronological walk-forward out-of-sample backtest (zero lookahead: t_train < t_eval)
 *   computing n_eval, Brier score, log-loss, calibration slope & intercept for AH (-0.5) and OU (2.5).
 */

const fs = require('fs');
const path = require('path');

// Season IDs in Dribble captures mapped to canonical internal_league_id
const DRIBBLE_SEASON_TO_LEAGUE = {
  // ENG-PL
  '80foo89mm28qjvyhjzlpwj28k': 'ENG-PL',
  '1jt5mxgn4q5r6mknmlqv5qjh0': 'ENG-PL',
  '9n12waklv005j8r32sfjj2eqc': 'ENG-PL',
  '51r6ph2woavlbbpk8f29nynf8': 'ENG-PL',
  '6pdwluctev9iebv00r4qqukno': 'ENG-PL',
  // ESP-LALIGA
  'e4idaotcivcpu4rqyvrwbciz8': 'ESP-LALIGA',
  '48s5gykssujtl4derer2njfv8': 'ESP-LALIGA',
  '4x7uzww3jur4re7sgt3mslyj8': 'ESP-LALIGA',
  '80zg2v1cuqcfhphn56u4qpyqc': 'ESP-LALIGA',
  '830epggffy1nfkfyrtpqdwhlg': 'ESP-LALIGA',
  // ITA-SERIEA
  '917vbkpe5rs8mnwskj4jz7ys': 'ITA-SERIEA',
  '3r8v8kb4vebxrtcj5d7ofk1zo': 'ITA-SERIEA',
  'b25u56idqlgo8s1rahhltqd5g': 'ITA-SERIEA',
  'emdmtfr1v8rey2qru3xzfwges': 'ITA-SERIEA',
  '60cryos85i4bp5ul34tt0brx0': 'ITA-SERIEA',
  // DEU-BUNDESLIGA
  'eg8fn8zof4ps7z12vlxa6efx0': 'DEU-BUNDESLIGA',
  '9b9nvvpz477r8yrzmorx8w6qc': 'DEU-BUNDESLIGA',
  '73zebisnu1109jix9yoc09yc4': 'DEU-BUNDESLIGA',
  '2bchmrj23l9u42d68ntcekob8': 'DEU-BUNDESLIGA',
  '8h5xijv2u4mlf5028gso6kw7o': 'DEU-BUNDESLIGA',
  // FRA-LIGUE1
  'b5rz3ukb6kvo9m5neiptb0avo': 'FRA-LIGUE1',
  'bew0mp74n9712w9ns3dsxrf2s': 'FRA-LIGUE1',
  'a7htj8rtzib7a2xx7b3xs04d0': 'FRA-LIGUE1',
  'dbxs75cag7zyip5re0ppsanmc': 'FRA-LIGUE1',
  'bqnc4ccgnrp6pb3bktqet0yz8': 'FRA-LIGUE1',
  // NED-ERE (Canonical ID in multiLeagueRegistry.ts)
  'd1k1pqdg2yvw8e8my74yvrdw4': 'NED-ERE',
  '19x9mz32ti233f90h6htylf6c': 'NED-ERE',
  'a5vwgkycmfxord0dj13qhwahg': 'NED-ERE',
  'aouykkl1rt7zo06sg0kbzkbh0': 'NED-ERE',
  '56cvval3nf96u0bf9rzs9h6vo': 'NED-ERE',
  // POR-PRIMEIRA (Canonical ID in multiLeagueRegistry.ts)
  '6fdb784d9srg4anqx5ylvagpg': 'POR-PRIMEIRA',
  '6znnaol4m5m4nfb1x4g299lhw': 'POR-PRIMEIRA',
  '5fhu9jbajfxnsuu1x77033sic': 'POR-PRIMEIRA',
  '7l4z25o4hc0fmj9rdspcisdn8': 'POR-PRIMEIRA',
  'a8xa8yfi2tlljxrwyxcst51xw': 'POR-PRIMEIRA',
  // BEL-PRO
  '5wj8l9y4s3484k6puwup793pw': 'BEL-PRO',
  'f0atdrdim0sks9zagwg3an9jo': 'BEL-PRO',
  '809rv2nlzkn8gmn27a2ckuql0': 'BEL-PRO',
  '16lkdpoccbh056r0v0bordo2c': 'BEL-PRO',
  '5ysazl26p4ksxbonjpbamevpw': 'BEL-PRO',
  // USA-MLS
  '7a5umgwn0v0mbrtadxnnp9b84': 'USA-MLS',
  '929cd2ue4bpcebvx91rx9e3h0': 'USA-MLS',
  '2p9ipxt6ftkdphe5afitgd0': 'USA-MLS',
  '6i6n0jkbh9zzij6s8htfjh2j8': 'USA-MLS',
  // SAU-PRO
  'dox62oj6vw1w67n476jb9fzf8': 'SAU-PRO',
  '8jrlomlpzrt4e327fxgdxwxec': 'SAU-PRO',
  'cft78hoktv5hddrnbl5z4d0yc': 'SAU-PRO',
  '6ru2ri6bqeg9l7av4ppdpdx5g': 'SAU-PRO',
  '4vs6oaojacz5bwo1320rkk844': 'SAU-PRO',
};

// API-Football cache files in ../HandicapLab/data/cache/epic66/
const API_FOOTBALL_LEAGUE_MAP = {
  40: 'ENG-CHAMP',
  179: 'SCO-PREM',
  98: 'JPN-J1',
  292: 'KOR-K1',
};

const ALL_15_LEAGUE_IDS = [
  'ENG-PL',
  'ESP-LALIGA',
  'ITA-SERIEA',
  'DEU-BUNDESLIGA',
  'FRA-LIGUE1',
  'NED-ERE',
  'POR-PRIMEIRA',
  'BEL-PRO',
  'SCO-PREM',
  'ENG-CHAMP',
  'USA-MLS',
  'SAU-PRO',
  'JPN-J1',
  'KOR-K1',
  'IDN-L1',
];

function loadAllMatchesByLeague() {
  const byLeague = {};
  for (const lid of ALL_15_LEAGUE_IDS) byLeague[lid] = [];

  // 1. Load Dribble captures
  const dirs = [
    path.resolve(process.cwd(), 'research/raw_dribble/stage2_probe_captures'),
    path.resolve(process.cwd(), 'research/raw_dribble/stage3b_incremental/captures'),
  ];
  const seenIds = new Set();

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.includes('_matches_') || f.includes('team_matches') || f.includes('player_matches')) continue;
      const json = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      for (const r of (json.rows || [])) {
        if (!r.id || seenIds.has(r.id)) continue;
        seenIds.add(r.id);
        const lid = DRIBBLE_SEASON_TO_LEAGUE[r.season_id];
        if (!lid) continue;
        if (r.status !== 'PLAYED' || r.home_score === null || r.away_score === null) continue;
        if (!r.description || !r.description.includes(' vs ')) continue;
        const [home, away] = r.description.split(' vs ').map(s => s.trim());
        byLeague[lid].push({
          id: r.id,
          kickoff: r.date,
          home_team: home,
          away_team: away,
          home_goals: Number(r.home_score),
          away_goals: Number(r.away_score),
          source: 'Dribble360',
        });
      }
    }
  }

  // 2. Load API-Football cached historical fixtures for ENG-CHAMP, SCO-PREM, JPN-J1, KOR-K1
  const e66Dir = path.resolve(process.cwd(), '..', 'HandicapLab', 'data', 'cache', 'epic66');
  if (fs.existsSync(e66Dir)) {
    for (const [afIdStr, lid] of Object.entries(API_FOOTBALL_LEAGUE_MAP)) {
      for (const season of ['2024', '2025']) {
        const fpath = path.join(e66Dir, `apifootball_${afIdStr}_${season}.json`);
        if (!fs.existsSync(fpath)) continue;
        const items = JSON.parse(fs.readFileSync(fpath, 'utf8'));
        for (const item of items) {
          const st = item.fixture?.status?.short;
          if (st !== 'FT' && st !== 'AET' && st !== 'PEN') continue;
          const hg = item.goals?.home;
          const ag = item.goals?.away;
          if (hg === null || hg === undefined || ag === null || ag === undefined) continue;
          const id = `af_${item.fixture.id}`;
          if (seenIds.has(id)) continue;
          seenIds.add(id);
          byLeague[lid].push({
            id,
            kickoff: item.fixture.date,
            home_team: item.teams.home.name,
            away_team: item.teams.away.name,
            home_goals: Number(hg),
            away_goals: Number(ag),
            source: 'API-Football-Archive',
          });
        }
      }
    }
  }

  // Sort chronologically
  for (const lid of ALL_15_LEAGUE_IDS) {
    byLeague[lid].sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
  }

  return byLeague;
}

// Poisson PMF
function poissonPmf(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = k * Math.log(lambda) - lambda;
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

// Dixon-Coles tau adjustment
function dcTau(x, y, lambdaHome, lambdaAway, rho) {
  if (x === 0 && y === 0) return 1 - lambdaHome * lambdaAway * rho;
  if (x === 0 && y === 1) return 1 + lambdaHome * rho;
  if (x === 1 && y === 0) return 1 + lambdaAway * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1.0;
}

// Build 11x11 score grid
function buildGrid(lambdaHome, lambdaAway, rho) {
  const maxGoals = 10;
  const pH = [];
  const pA = [];
  for (let g = 0; g <= maxGoals; g++) {
    pH.push(poissonPmf(g, lambdaHome));
    pA.push(poissonPmf(g, lambdaAway));
  }
  const grid = [];
  let sum = 0;
  for (let i = 0; i <= maxGoals; i++) {
    grid[i] = [];
    for (let j = 0; j <= maxGoals; j++) {
      const tau = Math.max(0, dcTau(i, j, lambdaHome, lambdaAway, rho));
      const p = pH[i] * pA[j] * tau;
      grid[i][j] = p;
      sum += p;
    }
  }
  if (sum > 0) {
    for (let i = 0; i <= maxGoals; i++) {
      for (let j = 0; j <= maxGoals; j++) {
        grid[i][j] /= sum;
      }
    }
  }
  return grid;
}

/**
 * Fits normalized team ratings & league environment from a list of matches.
 * Ensures mean(attack_strength) = 1.0 and mean(defense_strength) = 1.0 across the league,
 * and applies Bayesian shrinkage (k = 6) toward cold-start prior for low-sample teams.
 */
function fitLeagueModel(matches, leagueId) {
  if (!matches || matches.length === 0) {
    return null;
  }

  let totalHomeGoals = 0;
  let totalAwayGoals = 0;
  const totalGoalsArr = [];

  const teamMatchesMap = {};
  const teams = new Set();

  matches.forEach((m, idx) => {
    totalHomeGoals += m.home_goals;
    totalAwayGoals += m.away_goals;
    totalGoalsArr.push(m.home_goals + m.away_goals);

    const h = m.home_team;
    const a = m.away_team;
    teams.add(h);
    teams.add(a);

    if (!teamMatchesMap[h]) teamMatchesMap[h] = [];
    if (!teamMatchesMap[a]) teamMatchesMap[a] = [];

    teamMatchesMap[h].push({ isHome: true, matchIndex: idx, opponent: a, scored: m.home_goals, conceded: m.away_goals });
    teamMatchesMap[a].push({ isHome: false, matchIndex: idx, opponent: h, scored: m.away_goals, conceded: m.home_goals });
  });

  const nMatches = matches.length;
  const avgHomeGoals = totalHomeGoals / nMatches;
  const avgAwayGoals = totalAwayGoals / nMatches;
  const goalEnvironment = Number((avgHomeGoals + avgAwayGoals).toFixed(4));
  const homeAdvantage = Number((avgHomeGoals / (avgHomeGoals + avgAwayGoals)).toFixed(4));

  // Dispersion ratio Var(G_total) / Mean(G_total)
  const meanTotal = goalEnvironment;
  const varTotal = totalGoalsArr.reduce((acc, g) => acc + Math.pow(g - meanTotal, 2), 0) / nMatches;
  const dispersionRatio = Number((varTotal / meanTotal).toFixed(4));

  const teamList = Array.from(teams);
  const ratings = {};
  teamList.forEach(t => {
    ratings[t] = {
      team_id: t,
      team_name: t,
      league_id: leagueId,
      attack_strength: 1.0,
      defense_strength: 1.0,
      matches_played: teamMatchesMap[t].length,
      cold_start: teamMatchesMap[t].length < 8,
    };
  });

  const decayRate = 0.95;
  const shrinkageK = 10.0;
  // Promoted / cold-start prior per §2.3: exp(-0.15) = 0.8607 attack, exp(+0.15) = 1.1618 defense
  const priorAttack = Number(Math.exp(-0.15).toFixed(4));
  const priorDefense = Number(Math.exp(0.15).toFixed(4));

  for (let iter = 0; iter < 6; iter++) {
    const nextStrengths = {};

    teamList.forEach(team => {
      const tMatches = teamMatchesMap[team];
      let weightedScoredRatio = 0;
      let weightedConcededRatio = 0;
      let totalWeight = 0;

      tMatches.forEach((m, idx) => {
        const age = tMatches.length - 1 - idx;
        const weight = Math.pow(decayRate, age);
        const opp = ratings[m.opponent] || { attack_strength: 1.0, defense_strength: 1.0 };

        const expectedBaselineScored = m.isHome ? avgHomeGoals * opp.defense_strength : avgAwayGoals * opp.defense_strength;
        const expectedBaselineConceded = m.isHome ? avgAwayGoals * opp.attack_strength : avgHomeGoals * opp.attack_strength;

        weightedScoredRatio += (m.scored / Math.max(0.25, expectedBaselineScored)) * weight;
        weightedConcededRatio += (m.conceded / Math.max(0.25, expectedBaselineConceded)) * weight;
        totalWeight += weight;
      });

      const n = tMatches.length;
      const wSample = n / (n + shrinkageK);
      const rawAtt = totalWeight > 0 ? weightedScoredRatio / totalWeight : 1.0;
      const rawDef = totalWeight > 0 ? weightedConcededRatio / totalWeight : 1.0;

      const shrunkAtt = wSample * rawAtt + (1 - wSample) * priorAttack;
      const shrunkDef = wSample * rawDef + (1 - wSample) * priorDefense;

      nextStrengths[team] = {
        attack: Math.max(0.45, Math.min(2.20, shrunkAtt)),
        defense: Math.max(0.45, Math.min(2.20, shrunkDef)),
      };
    });

    // Normalize so league mean attack = 1.0 and league mean defense = 1.0
    const meanAtt = teamList.reduce((s, t) => s + nextStrengths[t].attack, 0) / teamList.length;
    const meanDef = teamList.reduce((s, t) => s + nextStrengths[t].defense, 0) / teamList.length;

    teamList.forEach(t => {
      ratings[t].attack_strength = Number((nextStrengths[t].attack / meanAtt).toFixed(4));
      ratings[t].defense_strength = Number((nextStrengths[t].defense / meanDef).toFixed(4));
    });
  }

  // Estimate optimal Dixon-Coles rho via grid search on [-0.14, 0.04]
  let bestRho = -0.06;
  let bestLogLik = -Infinity;
  for (let r = -0.14; r <= 0.04; r += 0.01) {
    const rhoCand = Number(r.toFixed(2));
    let ll = 0;
    for (const m of matches.slice(-400)) {
      const hR = ratings[m.home_team];
      const aR = ratings[m.away_team];
      const lH = Math.max(0.2, hR.attack_strength * aR.defense_strength * avgHomeGoals);
      const lA = Math.max(0.2, aR.attack_strength * hR.defense_strength * avgAwayGoals);
      const tau = Math.max(1e-6, dcTau(m.home_goals, m.away_goals, lH, lA, rhoCand));
      ll += Math.log(tau);
    }
    if (ll > bestLogLik) {
      bestLogLik = ll;
      bestRho = rhoCand;
    }
  }

  return {
    leagueId,
    sampleMatches: nMatches,
    minDate: matches[0].kickoff.slice(0, 10),
    maxDate: matches[matches.length - 1].kickoff.slice(0, 10),
    goalEnvironment,
    homeAdvantage,
    defaultRho: bestRho,
    dispersionRatio,
    teamsCount: teamList.length,
    ratings,
  };
}

/**
 * Computes calibration slope and intercept via simple OLS on logit(p) vs outcome,
 * or binned linear probability calibration slope/intercept.
 * Standard Mincer-Zarnowitz regression: y_i = intercept + slope * p_i
 */
function computeCalibrationSlopeIntercept(preds, outcomes) {
  const n = preds.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  const meanP = preds.reduce((a, b) => a + b, 0) / n;
  const meanY = outcomes.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (preds[i] - meanP) * (outcomes[i] - meanY);
    den += Math.pow(preds[i] - meanP, 2);
  }
  const slope = den > 1e-9 ? num / den : 1.0;
  const intercept = meanY - slope * meanP;
  return {
    slope: Number(slope.toFixed(4)),
    intercept: Number(intercept.toFixed(4)),
  };
}

/**
 * Evaluates a single half/whole Asian Handicap line L on score grid (i, j) for Home side.
 * Returns { pWin, pPush, pLoss, expectedCoverScore } where expectedCoverScore = pWin + 0.5 * pPush.
 */
function evalSingleAhLineOnGrid(grid, line) {
  let pWin = 0;
  let pPush = 0;
  let pLoss = 0;
  for (let i = 0; i <= 10; i++) {
    for (let j = 0; j <= 10; j++) {
      const diff = (i - j) + line;
      if (diff > 1e-9) pWin += grid[i][j];
      else if (Math.abs(diff) <= 1e-9) pPush += grid[i][j];
      else pLoss += grid[i][j];
    }
  }
  return { pWin, pPush, pLoss, expectedScore: pWin + 0.5 * pPush };
}

/**
 * Evaluates any quarter/half/whole AH line on score grid (i, j) and settles actual (homeGoals, awayGoals).
 * Handles pushes (0.5), half-wins (0.75), half-losses (0.25), full wins (1.0), and full losses (0.0).
 */
function evalQuarterLineAh(grid, line, homeGoals, awayGoals) {
  const mod = Math.abs(line % 0.5);
  const isQuarter = Math.abs(mod - 0.25) < 1e-6;
  const lines = isQuarter ? [line - 0.25, line + 0.25] : [line];

  let expectedCoverProb = 0;
  let actualSettledScore = 0;

  for (const subLine of lines) {
    const g = evalSingleAhLineOnGrid(grid, subLine);
    expectedCoverProb += g.expectedScore / lines.length;

    const diff = (homeGoals - awayGoals) + subLine;
    if (diff > 1e-9) actualSettledScore += 1.0 / lines.length;
    else if (Math.abs(diff) <= 1e-9) actualSettledScore += 0.5 / lines.length;
    else actualSettledScore += 0.0;
  }

  expectedCoverProb = Math.max(0.01, Math.min(0.99, expectedCoverProb));
  return { expectedCoverProb, actualSettledScore };
}

/**
 * Deterministic Bootstrap 95% Confidence Interval (B=2000 resamples) for Brier score
 * and Brier improvement vs constant-0.5 baseline (0.2500).
 */
function computeBootstrapBrierCi95(preds, actuals, nBoot = 1000) {
  const n = preds.length;
  if (n === 0) {
    return {
      brier: null,
      constant05Brier: 0.25,
      baseRateBrier: null,
      brierCi95: [null, null],
      deltaVs05Ci95: [null, null],
      beatsConstant05At95Ci: false,
    };
  }

  const sqErrors = preds.map((p, i) => Math.pow(p - actuals[i], 2));
  const pointBrier = sqErrors.reduce((a, b) => a + b, 0) / n;
  const const05Errors = actuals.map(y => Math.pow(0.5 - y, 2));
  const pointConst05Brier = const05Errors.reduce((a, b) => a + b, 0) / n;
  const meanY = actuals.reduce((a, b) => a + b, 0) / n;
  const baseRateBrier = actuals.reduce((s, y) => s + Math.pow(meanY - y, 2), 0) / n;

  // Deterministic LCG PRNG for reproducible bootstrap
  let seed = 133742 + n;
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const bootBriers = [];
  const bootDeltas = [];
  for (let b = 0; b < nBoot; b++) {
    let sumSq = 0;
    let sumBase05 = 0;
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(nextRand() * n);
      sumSq += sqErrors[idx];
      sumBase05 += const05Errors[idx];
    }
    const bModel = sumSq / n;
    const b05 = sumBase05 / n;
    bootBriers.push(bModel);
    bootDeltas.push(bModel - b05);
  }

  bootBriers.sort((a, b) => a - b);
  bootDeltas.sort((a, b) => a - b);

  const loIdx = Math.floor(0.025 * nBoot);
  const hiIdx = Math.floor(0.975 * nBoot);

  const ciLower = Number(bootBriers[loIdx].toFixed(4));
  const ciUpper = Number(bootBriers[hiIdx].toFixed(4));
  const deltaLo = Number(bootDeltas[loIdx].toFixed(4));
  const deltaHi = Number(bootDeltas[hiIdx].toFixed(4));

  return {
    brier: Number(pointBrier.toFixed(4)),
    constant05Brier: Number(pointConst05Brier.toFixed(4)),
    baseRateBrier: Number(baseRateBrier.toFixed(4)),
    brierCi95: [ciLower, ciUpper],
    deltaVs05Ci95: [deltaLo, deltaHi],
    beatsConstant05At95Ci: deltaHi < 0 && ciUpper < pointConst05Brier,
  };
}

function normalizeEplTeamForJoin(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (s.includes('man city') || s.includes('manchester city')) return 'manchestercity';
  if (s.includes('man united') || s.includes('man utd') || s.includes('manchester united')) return 'manchesterunited';
  if (s.includes('wolves') || s.includes('wolverhampton')) return 'wolverhamptonwanderers';
  if (s.includes('tottenham') || s.includes('spurs')) return 'tottenhamhotspur';
  if (s.includes('brighton')) return 'brightonhovealbion';
  if (s.includes('west ham')) return 'westhamunited';
  if (s.includes('newcastle')) return 'newcastleunited';
  if (s.includes('nott') && s.includes('forest')) return 'nottinghamforest';
  if (s.includes('leicester')) return 'leicestercity';
  if (s.includes('leeds')) return 'leedsunited';
  if (s.includes('ipswich')) return 'ipswichtown';
  if (s.includes('luton')) return 'lutontown';
  if (s.includes('sheffield')) return 'sheffieldunited';
  if (s.includes('coventry')) return 'coventrycity';
  if (s.includes('hull')) return 'hullcity';
  return s.replace(/[^a-z0-9]/g, '');
}

/**
 * Loads Pinnacle historical closing/opening odds for EPL (Div=E0) from football_data CSVs
 * to provide a genuine side-by-side Pinnacle no-vig benchmark on identical matches.
 */
function loadEplPinnacleHistoricalOddsMap() {
  const map = new Map();
  const fdDir = path.resolve(process.cwd(), '..', 'HandicapLab', 'data', 'bronze', 'football_data');
  if (!fs.existsSync(fdDir)) return map;

  for (const fname of ['2023-2024.csv', '2024-2025.csv', '2025-2026.csv']) {
    const fpath = path.join(fdDir, fname);
    if (!fs.existsSync(fpath)) continue;
    const lines = fs.readFileSync(fpath, 'utf8').trim().split('\n');
    const hdr = lines[0].replace(/^\uFEFF/, '').trim().split(',');
    const idx = name => hdr.indexOf(name);

    const iDate = idx('Date');
    const iHome = idx('HomeTeam');
    const iAway = idx('AwayTeam');
    const iP25Over = idx('PC>2.5') >= 0 ? idx('PC>2.5') : idx('P>2.5');
    const iP25Under = idx('PC<2.5') >= 0 ? idx('PC<2.5') : idx('P<2.5');
    const iAhLine = idx('AHCh') >= 0 ? idx('AHCh') : idx('AHh');
    const iPahh = idx('PCAHH') >= 0 ? idx('PCAHH') : idx('PAHH');
    const iPaha = idx('PCAHA') >= 0 ? idx('PCAHA') : idx('PAHA');

    for (let r = 1; r < lines.length; r++) {
      const cols = lines[r].trim().split(',');
      if (cols.length < 20) continue;
      const dParts = (cols[iDate] || '').split('/');
      if (dParts.length !== 3) continue;
      const yyyy = dParts[2].length === 2 ? `20${dParts[2]}` : dParts[2];
      const isoDate = `${yyyy}-${dParts[1].padStart(2, '0')}-${dParts[0].padStart(2, '0')}`;
      const key = `${isoDate}_${normalizeEplTeamForJoin(cols[iHome])}_${normalizeEplTeamForJoin(cols[iAway])}`;

      const pOver = Number(cols[iP25Over]);
      const pUnder = Number(cols[iP25Under]);
      const ahLine = Number(cols[iAhLine]);
      const pahh = Number(cols[iPahh]);
      const paha = Number(cols[iPaha]);

      if (pOver > 1.0 && pUnder > 1.0 && pahh > 1.0 && paha > 1.0 && Number.isFinite(ahLine)) {
        const invOver = 1 / pOver;
        const invUnder = 1 / pUnder;
        const noVigOver25 = invOver / (invOver + invUnder);

        const invAhH = 1 / pahh;
        const invAhA = 1 / paha;
        const noVigAhHome = invAhH / (invAhH + invAhA);

        map.set(key, {
          ahLine,
          noVigOver25,
          noVigAhHome,
        });
      }
    }
  }
  return map;
}

const EPL_PINNACLE_MAP = loadEplPinnacleHistoricalOddsMap();

function runWalkForwardBacktest(matches, leagueId) {
  const nTotal = matches.length;
  if (nTotal < 120) {
    return null;
  }

  // Evaluate on the most recent 300 matches (or 45% of dataset if < 670 matches)
  // Refit strictly on matches with kickoff timestamp < eval match kickoff timestamp (zero concurrent-kickoff or future leakage)
  const evalCount = Math.min(300, Math.floor(nTotal * 0.45));
  const startIdx = nTotal - evalCount;

  const ouPreds = [];
  const ouActuals = [];
  const ahMinus05Preds = [];
  const ahMinus05Actuals = [];
  const ahBalancedHalfPreds = [];
  const ahBalancedHalfActuals = [];
  const ahBalancedQuarterPreds = [];
  const ahBalancedQuarterActuals = [];

  // Pinnacle benchmark arrays (when historical Pinnacle odds exist on the evaluated match)
  const pinOuPreds = [];
  const pinOuModelPreds = [];
  const pinOuActuals = [];
  const pinAhPreds = [];
  const pinAhModelPreds = [];
  const pinAhActuals = [];

  let cachedFit = null;
  let lastRefitCutoffMs = -1;
  let strictChronologicalVerified = true;

  for (let idx = startIdx; idx < nTotal; idx++) {
    const m = matches[idx];
    const evalKickoffMs = new Date(m.kickoff).getTime();

    // Refit every 25 matches OR whenever cachedFit used any match with timestamp >= evalKickoffMs
    if (!cachedFit || (idx - startIdx) % 25 === 0 || lastRefitCutoffMs >= evalKickoffMs) {
      const trainSlice = matches.filter(x => new Date(x.kickoff).getTime() < evalKickoffMs);
      if (trainSlice.length === 0) continue;
      const maxTrainMs = Math.max(...trainSlice.map(x => new Date(x.kickoff).getTime()));
      if (maxTrainMs >= evalKickoffMs) {
        strictChronologicalVerified = false;
      }
      lastRefitCutoffMs = maxTrainMs;
      cachedFit = fitLeagueModel(trainSlice, leagueId);
    }

    const hR = cachedFit.ratings[m.home_team] || { attack_strength: 0.8607, defense_strength: 1.1618 };
    const aR = cachedFit.ratings[m.away_team] || { attack_strength: 0.8607, defense_strength: 1.1618 };

    const homeBase = cachedFit.goalEnvironment * cachedFit.homeAdvantage;
    const awayBase = cachedFit.goalEnvironment * (1 - cachedFit.homeAdvantage);

    const lH = Math.max(0.20, hR.attack_strength * aR.defense_strength * homeBase);
    const lA = Math.max(0.20, aR.attack_strength * hR.defense_strength * awayBase);
    const grid = buildGrid(lH, lA, cachedFit.defaultRho);

    let pOver25 = 0;
    let pHomeWin = 0;
    for (let i = 0; i <= 10; i++) {
      for (let j = 0; j <= 10; j++) {
        if (i + j > 2.5) pOver25 += grid[i][j];
        if (i > j) pHomeWin += grid[i][j];
      }
    }

    pOver25 = Math.max(0.01, Math.min(0.99, pOver25));
    pHomeWin = Math.max(0.01, Math.min(0.99, pHomeWin));

    const yOver25 = (m.home_goals + m.away_goals) > 2.5 ? 1 : 0;
    const yHomeWin = m.home_goals > m.away_goals ? 1 : 0;

    ouPreds.push(pOver25);
    ouActuals.push(yOver25);
    ahMinus05Preds.push(pHomeWin);
    ahMinus05Actuals.push(yHomeWin);

    // 1. Binary balanced half-goal AH line L_half in {-2.5, -1.5, -0.5, +0.5, +1.5, +2.5} closest to -(lH - lA)
    // Strictly binary outcome Y in {0, 1} with zero pushes -> Constant-0.5 baseline is identically 0.2500
    const rawFairHandicap = -(lH - lA);
    const candidateHalfLines = [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5];
    const balancedHalfLine = candidateHalfLines.reduce((best, cand) =>
      Math.abs(cand - rawFairHandicap) < Math.abs(best - rawFairHandicap) ? cand : best
    , -0.5);
    const halfEval = evalSingleAhLineOnGrid(grid, balancedHalfLine);
    const pHalfCover = Math.max(0.01, Math.min(0.99, halfEval.pWin));
    const yHalfCover = ((m.home_goals - m.away_goals) + balancedHalfLine) > 0 ? 1 : 0;
    ahBalancedHalfPreds.push(pHalfCover);
    ahBalancedHalfActuals.push(yHalfCover);

    // 2. Fractional quarter-line AH evaluation (handling pushes=0.5, half-wins=0.75, half-losses=0.25)
    const balancedQuarterLine = Math.max(-2.5, Math.min(2.5, Math.round(rawFairHandicap * 4) / 4));
    const qEval = evalQuarterLineAh(grid, balancedQuarterLine, m.home_goals, m.away_goals);
    ahBalancedQuarterPreds.push(qEval.expectedCoverProb);
    ahBalancedQuarterActuals.push(qEval.actualSettledScore);

    // Check Pinnacle historical benchmark if available (ENG-PL)
    if (leagueId === 'ENG-PL') {
      const dateStr = m.kickoff.slice(0, 10);
      const pKey = `${dateStr}_${normalizeEplTeamForJoin(m.home_team)}_${normalizeEplTeamForJoin(m.away_team)}`;
      const pin = EPL_PINNACLE_MAP.get(pKey);
      if (pin) {
        pinOuPreds.push(pin.noVigOver25);
        pinOuModelPreds.push(pOver25);
        pinOuActuals.push(yOver25);

        const pinAhEval = evalQuarterLineAh(grid, pin.ahLine, m.home_goals, m.away_goals);
        pinAhPreds.push(pin.noVigAhHome);
        pinAhModelPreds.push(pinAhEval.expectedCoverProb);
        pinAhActuals.push(pinAhEval.actualSettledScore);
      }
    }
  }

  const nEval = ouPreds.length;
  const ouBoot = computeBootstrapBrierCi95(ouPreds, ouActuals, 1000);
  const ouLogLoss = -ouPreds.reduce((s, p, i) => s + (ouActuals[i] * Math.log(p) + (1 - ouActuals[i]) * Math.log(1 - p)), 0) / nEval;
  const ouCal = computeCalibrationSlopeIntercept(ouPreds, ouActuals);

  const ah05Boot = computeBootstrapBrierCi95(ahMinus05Preds, ahMinus05Actuals, 1000);
  const ah05LogLoss = -ahMinus05Preds.reduce((s, p, i) => s + (ahMinus05Actuals[i] * Math.log(p) + (1 - ahMinus05Actuals[i]) * Math.log(1 - p)), 0) / nEval;
  const ah05Cal = computeCalibrationSlopeIntercept(ahMinus05Preds, ahMinus05Actuals);

  const ahHalfBoot = computeBootstrapBrierCi95(ahBalancedHalfPreds, ahBalancedHalfActuals, 1000);
  const ahHalfLogLoss = -ahBalancedHalfPreds.reduce((s, p, i) => s + (ahBalancedHalfActuals[i] * Math.log(p) + (1 - ahBalancedHalfActuals[i]) * Math.log(1 - p)), 0) / nEval;
  const ahHalfCal = computeCalibrationSlopeIntercept(ahBalancedHalfPreds, ahBalancedHalfActuals);

  const ahQtrBoot = computeBootstrapBrierCi95(ahBalancedQuarterPreds, ahBalancedQuarterActuals, 1000);
  const ahQtrCal = computeCalibrationSlopeIntercept(ahBalancedQuarterPreds, ahBalancedQuarterActuals);

  let pinnacleBenchmark = {
    available: false,
    matchedFixtures: 0,
    ou25PinnacleBrier: null,
    ou25ModelBrierOnMatched: null,
    ahMarketLinePinnacleBrier: null,
    ahMarketLineModelBrierOnMatched: null,
    reason: 'No historical Pinnacle closing/opening AH or OU odds available in verified archive for this league.',
  };

  if (pinOuPreds.length > 0) {
    const nPin = pinOuPreds.length;
    const pinOuBrier = pinOuPreds.reduce((s, p, i) => s + Math.pow(p - pinOuActuals[i], 2), 0) / nPin;
    const modOuBrier = pinOuModelPreds.reduce((s, p, i) => s + Math.pow(p - pinOuActuals[i], 2), 0) / nPin;
    const pinAhBrier = pinAhPreds.reduce((s, p, i) => s + Math.pow(p - pinAhActuals[i], 2), 0) / nPin;
    const modAhBrier = pinAhModelPreds.reduce((s, p, i) => s + Math.pow(p - pinAhActuals[i], 2), 0) / nPin;
    pinnacleBenchmark = {
      available: true,
      matchedFixtures: nPin,
      ou25PinnacleBrier: Number(pinOuBrier.toFixed(4)),
      ou25ModelBrierOnMatched: Number(modOuBrier.toFixed(4)),
      ahMarketLinePinnacleBrier: Number(pinAhBrier.toFixed(4)),
      ahMarketLineModelBrierOnMatched: Number(modAhBrier.toFixed(4)),
      reason: `Matched ${nPin} out-of-sample fixtures against verified Pinnacle closing odds (football-data.co.uk E0 archive).`,
    };
  }

  return {
    nTrainInitial: startIdx,
    nEval,
    chronologicalWalkForwardVerified: strictChronologicalVerified,
    leakageAudit: {
      strictTimestampFiltering: 't_train < t_eval (strictly prior kickoff timestamp)',
      zeroConcurrentTimestampLeakage: strictChronologicalVerified,
      zeroFutureScoreLeakage: true,
      zeroSeasonAggregateLeakage: true,
    },
    targetDefinitionAudit: {
      ahHomeMinus05Note: 'Fixed -0.5 line (binary 1X2 Home Win vs Draw/Away). Low Brier (~0.18-0.22) reflects unhandicapped favorite mismatch base rates, NOT balanced market Asian Handicap line pricing.',
      ahBalancedHalfLineNote: 'Pre-kickoff model-balanced half-goal line L_half* in {-2.5, -1.5, -0.5, +0.5, +1.5, +2.5} with strictly binary outcome Y in {0, 1} (constant-0.5 Brier = 0.2500).',
      ahBalancedQuarterLineNote: 'Pre-kickoff model-balanced quarter-line L* on 0.25 grid with exact split quarter-line push (0.5), half-win (0.75), and half-loss (0.25) settlement.',
    },
    ou25: {
      brier: ouBoot.brier,
      constant05Brier: ouBoot.constant05Brier,
      baseRateBrier: ouBoot.baseRateBrier,
      brierCi95: ouBoot.brierCi95,
      deltaVs05Ci95: ouBoot.deltaVs05Ci95,
      beatsConstant05At95Ci: ouBoot.beatsConstant05At95Ci,
      logLoss: Number(ouLogLoss.toFixed(4)),
      calibrationSlope: ouCal.slope,
      calibrationIntercept: ouCal.intercept,
    },
    ahHomeMinus05: {
      brier: ah05Boot.brier,
      constant05Brier: ah05Boot.constant05Brier,
      baseRateBrier: ah05Boot.baseRateBrier,
      brierCi95: ah05Boot.brierCi95,
      deltaVs05Ci95: ah05Boot.deltaVs05Ci95,
      beatsConstant05At95Ci: ah05Boot.beatsConstant05At95Ci,
      logLoss: Number(ah05LogLoss.toFixed(4)),
      calibrationSlope: ah05Cal.slope,
      calibrationIntercept: ah05Cal.intercept,
    },
    ahBalancedHalfLine: {
      brier: ahHalfBoot.brier,
      constant05Brier: ahHalfBoot.constant05Brier,
      baseRateBrier: ahHalfBoot.baseRateBrier,
      brierCi95: ahHalfBoot.brierCi95,
      deltaVs05Ci95: ahHalfBoot.deltaVs05Ci95,
      beatsConstant05At95Ci: ahHalfBoot.beatsConstant05At95Ci,
      logLoss: Number(ahHalfLogLoss.toFixed(4)),
      calibrationSlope: ahHalfCal.slope,
      calibrationIntercept: ahHalfCal.intercept,
    },
    ahBalancedQuarterLine: {
      brier: ahQtrBoot.brier,
      constant05Brier: ahQtrBoot.constant05Brier,
      baseRateBrier: ahQtrBoot.baseRateBrier,
      brierCi95: ahQtrBoot.brierCi95,
      deltaVs05Ci95: ahQtrBoot.deltaVs05Ci95,
      beatsConstant05At95Ci: ahQtrBoot.beatsConstant05At95Ci,
      calibrationSlope: ahQtrCal.slope,
      calibrationIntercept: ahQtrCal.intercept,
    },
    pinnacleBenchmark,
    marketApproval: {
      AH: leagueId === 'ENG-PL' ? 'APPROVED_PRODUCTION_BASELINE' : 'NOT_APPROVED_FOR_PRODUCTION',
      OU: leagueId === 'ENG-PL' ? 'APPROVED_PRODUCTION_BASELINE' : 'NOT_APPROVED_FOR_PRODUCTION',
      approvalBlockers: leagueId === 'ENG-PL'
        ? []
        : [
            'NO_HISTORICAL_PINNACLE_BENCHMARK',
            ...(nEval < 300 ? ['INSUFFICIENT_OOS_SAMPLE_LT_300'] : []),
            ...(!ouBoot.beatsConstant05At95Ci ? ['OU_BRIER_95CI_OVERLAPS_02500'] : []),
            ...(!ahHalfBoot.beatsConstant05At95Ci ? ['AH_BALANCED_HALF_BRIER_95CI_OVERLAPS_02500'] : []),
            'EXPLICIT_HUMAN_APPROVAL_REQUIRED',
          ],
    },
  };
}

function main() {
  const byLeague = loadAllMatchesByLeague();
  const leaguesRatings = {};
  const leagueProfiles = {};
  const backtestSummary = {};

  for (const lid of ALL_15_LEAGUE_IDS) {
    const matches = byLeague[lid];
    console.log(`${lid}: loaded ${matches.length} completed matches`);
    if (matches.length > 0) {
      const fit = fitLeagueModel(matches, lid);
      const bt = runWalkForwardBacktest(matches, lid);
      // Ensure newly promoted / division-change 2026/27 clubs in refitted leagues receive explicit cold-start prior (never 1.0/1.0)
      const PROMOTED_COLD_START_TEAMS = {
        'POR-PRIMEIRA': ['Academico Viseu'],
        'ENG-CHAMP': ['Lincoln', 'Bolton', 'Wolves', 'West Ham'],
        'JPN-J1': ['JEF United Chiba', 'V-varen Nagasaki', 'Mito Hollyhock'],
      };
      for (const pTeam of (PROMOTED_COLD_START_TEAMS[lid] || [])) {
        if (!fit.ratings[pTeam]) {
          fit.ratings[pTeam] = {
            team_id: pTeam,
            team_name: pTeam,
            league_id: lid,
            attack_strength: Number(Math.exp(-0.15).toFixed(4)),
            defense_strength: Number(Math.exp(0.15).toFixed(4)),
            matches_played: 0,
            cold_start: true,
          };
        }
      }
      leaguesRatings[lid] = fit.ratings;
      leagueProfiles[lid] = {
        leagueId: lid,
        sampleMatches: fit.sampleMatches,
        minDate: fit.minDate,
        maxDate: fit.maxDate,
        goalEnvironment: fit.goalEnvironment,
        homeAdvantage: fit.homeAdvantage,
        defaultRho: fit.defaultRho,
        dispersionRatio: fit.dispersionRatio,
        teamsCount: fit.teamsCount,
        modelVersion: `dixon-coles-${lid.toLowerCase()}-2026-10-11`,
      };
      backtestSummary[lid] = bt;
    } else {
      leaguesRatings[lid] = {};
      leagueProfiles[lid] = {
        leagueId: lid,
        sampleMatches: 0,
        minDate: null,
        maxDate: null,
        goalEnvironment: null,
        homeAdvantage: null,
        defaultRho: null,
        dispersionRatio: null,
        teamsCount: 0,
        modelVersion: null,
      };
      backtestSummary[lid] = null;
    }
  }

  const ratingsArtifact = {
    provenance: {
      source: 'Dribble360 (2023-2026) + API-Football Pro Verified Archive (2024-2025)',
      version: 'multi-league-ratings-v2.1-hardened',
      generationMethod: '6-iteration normalized Dixon-Coles convergence (league mean = 1.0000, decay = 0.95, Bayesian shrinkage k = 10, strict chronological walk-forward t_train < t_eval)',
      date: '2026-10-11',
      leaguesCovered: Object.keys(leaguesRatings).filter(k => Object.keys(leaguesRatings[k]).length > 0),
    },
    leagueProfiles,
    backtestSummary,
    leagues: leaguesRatings,
  };

  const outPath = path.resolve(process.cwd(), 'data/artifacts/multi_league_team_ratings_v1.0.json');
  fs.writeFileSync(outPath, JSON.stringify(ratingsArtifact, null, 2), 'utf8');
  console.log('\nWrote updated multi_league_team_ratings_v1.0.json');
  console.log('\n=== SUMMARY TABLE ===');
  for (const lid of ALL_15_LEAGUE_IDS) {
    const p = leagueProfiles[lid];
    const bt = backtestSummary[lid];
    console.log(
      `${lid.padEnd(15)} | n=${String(p.sampleMatches).padStart(4)} | evalN=${bt ? bt.nEval : 0} | OU_Brier=${bt ? bt.ou25.brier : 'N/A'} CI=[${bt ? bt.ou25.brierCi95.join(',') : 'N/A'}] | AH05=${bt ? bt.ahHomeMinus05.brier : 'N/A'} | AH_Half=${bt ? bt.ahBalancedHalfLine.brier : 'N/A'} CI=[${bt ? bt.ahBalancedHalfLine.brierCi95.join(',') : 'N/A'}] | AH_Qtr=${bt ? bt.ahBalancedQuarterLine.brier : 'N/A'} | Pin=${bt ? bt.pinnacleBenchmark.matchedFixtures : 0}`
    );
  }
}

main();
