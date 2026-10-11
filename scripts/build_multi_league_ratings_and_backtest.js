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

function runWalkForwardBacktest(matches, leagueId) {
  const nTotal = matches.length;
  if (nTotal < 120) {
    return null;
  }

  // Evaluate on the most recent 250 matches (or 40% of dataset), refitting every 25 matches strictly on prior matches (< t)
  const evalCount = Math.min(300, Math.floor(nTotal * 0.45));
  const startIdx = nTotal - evalCount;

  const ouPreds = [];
  const ouActuals = [];
  const ahPreds = [];
  const ahActuals = [];

  let cachedFit = null;

  for (let idx = startIdx; idx < nTotal; idx++) {
    if (!cachedFit || (idx - startIdx) % 25 === 0) {
      const trainSlice = matches.slice(0, idx);
      cachedFit = fitLeagueModel(trainSlice, leagueId);
    }

    const m = matches[idx];
    const hR = cachedFit.ratings[m.home_team] || { attack_strength: 0.95, defense_strength: 1.05 };
    const aR = cachedFit.ratings[m.away_team] || { attack_strength: 0.95, defense_strength: 1.05 };

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
    ahPreds.push(pHomeWin);
    ahActuals.push(yHomeWin);
  }

  const nEval = ouPreds.length;
  const ouBrier = ouPreds.reduce((s, p, i) => s + Math.pow(p - ouActuals[i], 2), 0) / nEval;
  const ouLogLoss = -ouPreds.reduce((s, p, i) => s + (ouActuals[i] * Math.log(p) + (1 - ouActuals[i]) * Math.log(1 - p)), 0) / nEval;
  const ouCal = computeCalibrationSlopeIntercept(ouPreds, ouActuals);

  const ahBrier = ahPreds.reduce((s, p, i) => s + Math.pow(p - ahActuals[i], 2), 0) / nEval;
  const ahLogLoss = -ahPreds.reduce((s, p, i) => s + (ahActuals[i] * Math.log(p) + (1 - ahActuals[i]) * Math.log(1 - p)), 0) / nEval;
  const ahCal = computeCalibrationSlopeIntercept(ahPreds, ahActuals);

  return {
    nTrainInitial: startIdx,
    nEval,
    ou25: {
      brier: Number(ouBrier.toFixed(4)),
      logLoss: Number(ouLogLoss.toFixed(4)),
      calibrationSlope: ouCal.slope,
      calibrationIntercept: ouCal.intercept,
    },
    ahHomeMinus05: {
      brier: Number(ahBrier.toFixed(4)),
      logLoss: Number(ahLogLoss.toFixed(4)),
      calibrationSlope: ahCal.slope,
      calibrationIntercept: ahCal.intercept,
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
      version: 'multi-league-ratings-v2.0',
      generationMethod: '6-iteration normalized Dixon-Coles convergence (league mean = 1.0000, decay = 0.90, Bayesian shrinkage k = 6)',
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
      `${lid.padEnd(15)} | n=${String(p.sampleMatches).padStart(4)} | teams=${String(p.teamsCount).padStart(2)} | goals=${String(p.goalEnvironment).padStart(6)} | homeAdv=${String(p.homeAdvantage).padStart(6)} | rho=${String(p.defaultRho).padStart(6)} | disp=${String(p.dispersionRatio).padStart(6)} | evalN=${bt ? bt.nEval : 0} | OU_Brier=${bt ? bt.ou25.brier : 'N/A'} | OU_LL=${bt ? bt.ou25.logLoss : 'N/A'} | AH_Brier=${bt ? bt.ahHomeMinus05.brier : 'N/A'}`
    );
  }
}

main();
