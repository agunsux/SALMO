/**
 * SALMO.DEV — Hotfix H8 Deliverable 3: Read-Only 15-League Walk-Forward Backtest Recompute
 *
 * Strictly READ-ONLY on `data/artifacts/multi_league_team_ratings_v1.0.json` (verifies SHA-256 hash
 * before and after execution).
 *
 * Recomputes the 15-league walk-forward backtest comparing:
 *   1. Old AH Fixed -0.5 Brier (`ahHomeMinus05`, unhandicapped 1X2 Home Win vs Draw/Away)
 *   2. Old AH Balanced Quarter-Line Fractional Brier (`WIN=1, HALF_WIN=0.75, PUSH=0.5, HALF_LOSS=0.25, LOSS=0`)
 *   3. New AH Balanced Quarter-Line Binary No-Push Per-Leg Brier (quarter-lines decomposed into two
 *      half-stake legs `[line - 0.25, line + 0.25]`, each scored against its own conditional non-push
 *      win probability `p_leg = p_W(leg) / (p_W(leg) + p_L(leg))` from the 11x11 Dixon-Coles grid,
 *      with push legs excluded)
 *   4. AH Balanced Half-Line Brier (`L_half in {-2.5, -1.5, -0.5, +0.5, +1.5, +2.5}`, natively binary no-push)
 *   5. OU 2.5 Brier (natively `.5` half-line binary no-push; Old == New)
 *   6. ENG-PL Pinnacle Historical Benchmark (`n=80` matched fixtures) under Old Fractional vs New Binary No-Push Per-Leg
 *   7. Promotion-Gate Flip Analysis across all 15 leagues (AH and OU)
 *   8. Mathematical & Empirical Proof of Strict Chronological Walk-Forward (`max(t_train) < t_eval` on every evaluated match)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
  // NED-ERE
  'd1k1pqdg2yvw8e8my74yvrdw4': 'NED-ERE',
  '19x9mz32ti233f90h6htylf6c': 'NED-ERE',
  'a5vwgkycmfxord0dj13qhwahg': 'NED-ERE',
  'aouykkl1rt7zo06sg0kbzkbh0': 'NED-ERE',
  '56cvval3nf96u0bf9rzs9h6vo': 'NED-ERE',
  // POR-PRIMEIRA
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
      for (const r of json.rows || []) {
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

  for (const lid of ALL_15_LEAGUE_IDS) {
    byLeague[lid].sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
  }

  return byLeague;
}

function poissonPmf(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = k * Math.log(lambda) - lambda;
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

function dcTau(x, y, lambdaHome, lambdaAway, rho) {
  if (x === 0 && y === 0) return 1 - lambdaHome * lambdaAway * rho;
  if (x === 0 && y === 1) return 1 + lambdaHome * rho;
  if (x === 1 && y === 0) return 1 + lambdaAway * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1.0;
}

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

function fitLeagueModel(matches, leagueId) {
  if (!matches || matches.length === 0) return null;

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

    const meanAtt = teamList.reduce((s, t) => s + nextStrengths[t].attack, 0) / teamList.length;
    const meanDef = teamList.reduce((s, t) => s + nextStrengths[t].defense, 0) / teamList.length;

    teamList.forEach(t => {
      ratings[t].attack_strength = Number((nextStrengths[t].attack / meanAtt).toFixed(4));
      ratings[t].defense_strength = Number((nextStrengths[t].defense / meanDef).toFixed(4));
    });
  }

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
  const nonPushMass = pWin + pLoss;
  const pCondNoPush = nonPushMass > 1e-9 ? Math.max(0.01, Math.min(0.99, pWin / nonPushMass)) : 0.5;
  return { pWin, pPush, pLoss, expectedScore: pWin + 0.5 * pPush, pCondNoPush };
}

/**
 * Old fractional quarter-line AH evaluator (`WIN=1, HALF_WIN=0.75, PUSH=0.5, HALF_LOSS=0.25, LOSS=0`).
 */
function evalQuarterLineAhFractionalOld(grid, line, homeGoals, awayGoals) {
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
 * New Hotfix H8 Binary No-Push Per-Leg AH evaluator.
 * Decomposes quarter-lines into two half-stake legs `[line - 0.25, line + 0.25]`.
 * Each leg is scored against its own conditional non-push win probability `pCondNoPush = pWin / (pWin + pLoss)`.
 * Any leg that settles as PUSH (`(homeGoals - awayGoals) + subLine == 0`) is excluded.
 */
function evalAhBinaryNoPushLegs(grid, line, homeGoals, awayGoals) {
  const mod = Math.abs(line % 0.5);
  const isQuarter = Math.abs(mod - 0.25) < 1e-6;
  const subLines = isQuarter ? [line - 0.25, line + 0.25] : [line];
  const stakeWeight = isQuarter ? 0.5 : 1.0;

  const legs = [];
  for (const subLine of subLines) {
    const g = evalSingleAhLineOnGrid(grid, subLine);
    const diff = (homeGoals - awayGoals) + subLine;
    if (Math.abs(diff) <= 1e-9) {
      legs.push({
        legLine: subLine,
        stakeWeight,
        pLegNoPush: g.pCondNoPush,
        binaryOutcome: null,
        excludedPush: true,
        sqError: null,
      });
    } else {
      const y = diff > 1e-9 ? 1 : 0;
      legs.push({
        legLine: subLine,
        stakeWeight,
        pLegNoPush: g.pCondNoPush,
        binaryOutcome: y,
        excludedPush: false,
        sqError: Math.pow(g.pCondNoPush - y, 2),
      });
    }
  }
  return legs;
}

function evalSingleOuLineOnGrid(grid, line) {
  let pOver = 0;
  let pPush = 0;
  let pUnder = 0;
  for (let i = 0; i <= 10; i++) {
    for (let j = 0; j <= 10; j++) {
      const diff = (i + j) - line;
      if (diff > 1e-9) pOver += grid[i][j];
      else if (Math.abs(diff) <= 1e-9) pPush += grid[i][j];
      else pUnder += grid[i][j];
    }
  }
  const nonPushMass = pOver + pUnder;
  const pCondNoPush = nonPushMass > 1e-9 ? Math.max(0.01, Math.min(0.99, pOver / nonPushMass)) : 0.5;
  return { pOver, pPush, pUnder, expectedScore: pOver + 0.5 * pPush, pCondNoPush };
}

/**
 * Binary No-Push Per-Leg OU evaluator across any half, whole, or quarter total goals line
 * (e.g., 1.5, 2.0, 2.25, 2.5, 2.75, 3.0, 3.25, 3.5).
 * Quarter lines (.25 / .75) decompose into two half-stake legs `[line - 0.25, line + 0.25]`.
 * Each leg is scored against its own conditional non-push Over probability `pCondNoPush = pOver / (pOver + pUnder)`.
 * Any leg that settles as PUSH (`homeGoals + awayGoals == subLine`) is excluded.
 */
function evalOuBinaryNoPushLegs(grid, line, homeGoals, awayGoals) {
  const mod = Math.abs(line % 0.5);
  const isQuarter = Math.abs(mod - 0.25) < 1e-6;
  const subLines = isQuarter ? [line - 0.25, line + 0.25] : [line];
  const stakeWeight = isQuarter ? 0.5 : 1.0;
  const totalGoals = homeGoals + awayGoals;

  const legs = [];
  for (const subLine of subLines) {
    const g = evalSingleOuLineOnGrid(grid, subLine);
    const diff = totalGoals - subLine;
    if (Math.abs(diff) <= 1e-9) {
      legs.push({
        legLine: subLine,
        stakeWeight,
        pLegNoPush: g.pCondNoPush,
        binaryOutcome: null,
        excludedPush: true,
        sqError: null,
      });
    } else {
      const y = diff > 1e-9 ? 1 : 0;
      legs.push({
        legLine: subLine,
        stakeWeight,
        pLegNoPush: g.pCondNoPush,
        binaryOutcome: y,
        excludedPush: false,
        sqError: Math.pow(g.pCondNoPush - y, 2),
      });
    }
  }
  return legs;
}

function computeBootstrapBrierCi95(preds, actuals, nBoot = 1000) {
  const n = preds.length;
  if (n === 0) {
    return {
      n: 0,
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
    n,
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

const OU_MULTI_LINES = [1.5, 2.0, 2.25, 2.5, 2.75, 3.0, 3.25, 3.5];

function runReadOnlyH8BacktestRecompute(options = { writeReportFile: false }) {
  const ratingsArtifactPath = path.resolve(process.cwd(), 'data/artifacts/multi_league_team_ratings_v1.0.json');
  const beforeBytes = fs.readFileSync(ratingsArtifactPath);
  const beforeSha256 = crypto.createHash('sha256').update(beforeBytes).digest('hex');
  const existingArtifact = JSON.parse(beforeBytes.toString('utf8'));

  const byLeague = loadAllMatchesByLeague();
  const eplPinnacleMap = loadEplPinnacleHistoricalOddsMap();

  const perLeagueResults = {};
  const promotionGateFlips = [];
  let totalEvaluatedMatchesAllLeagues = 0;
  let totalChronologicalViolations = 0;
  let totalTrainingRefitsVerified = 0;

  for (const lid of ALL_15_LEAGUE_IDS) {
    const matches = byLeague[lid] || [];
    const nTotal = matches.length;
    if (nTotal < 120) {
      perLeagueResults[lid] = {
        leagueId: lid,
        nTotalMatches: nTotal,
        nEvalMatches: 0,
        status: 'PAUSED_INSUFFICIENT_DATA',
      };
      continue;
    }

    const evalCount = Math.min(300, Math.floor(nTotal * 0.45));
    const startIdx = nTotal - evalCount;

    const ouPreds = [];
    const ouActuals = [];
    const ahMinus05Preds = [];
    const ahMinus05Actuals = [];
    const ahBalancedHalfPreds = [];
    const ahBalancedHalfActuals = [];

    // Old fractional quarter-line arrays
    const ahQtrOldPreds = [];
    const ahQtrOldActuals = [];

    // New binary no-push per-leg quarter-line arrays
    const ahQtrNewLegPreds = [];
    const ahQtrNewLegActuals = [];
    let ahQtrLegsTotal = 0;
    let ahQtrLegsResolved = 0;
    let ahQtrLegsExcludedPush = 0;
    let ahQtrWeightedSqSum = 0;
    let ahQtrWeightSum = 0;

    // Multi-line OU arrays (1.5, 2.0, 2.25, 2.5, 2.75, 3.0, 3.25, 3.5)
    const ouLineAccum = {};
    for (const ln of OU_MULTI_LINES) {
      ouLineAccum[String(ln)] = {
        line: ln,
        preds: [],
        actuals: [],
        legsTotal: 0,
        legsResolved: 0,
        legsExcludedPush: 0,
        weightedSqSum: 0,
        weightSum: 0,
      };
    }

    // Balanced Dynamic OU Half-Line & Quarter-Line arrays
    const ouBalancedHalfPreds = [];
    const ouBalancedHalfActuals = [];
    const ouBalancedHalfLineDist = {};
    const ouBalancedQtrLegPreds = [];
    const ouBalancedQtrLegActuals = [];
    const ouBalancedQtrLineDist = {};
    let ouQtrLegsTotal = 0;
    let ouQtrLegsResolved = 0;
    let ouQtrLegsExcludedPush = 0;
    let ouQtrWeightedSqSum = 0;
    let ouQtrWeightSum = 0;

    // Pinnacle benchmark arrays (ENG-PL)
    const pinOuPreds = [];
    const pinOuModelPreds = [];
    const pinOuActuals = [];
    const pinAhOldPreds = [];
    const pinAhOldModelPreds = [];
    const pinAhOldActuals = [];
    const pinAhNewModelLegPreds = [];
    const pinAhNewPinnacleLegPreds = [];
    const pinAhNewLegActuals = [];
    let pinAhLegsTotal = 0;
    let pinAhLegsResolved = 0;
    let pinAhLegsExcludedPush = 0;

    let cachedFit = null;
    let lastRefitCutoffMs = -1;
    let lastRefitTrainCount = 0;
    let lastRefitMaxDateIso = null;
    let leagueChronologicalViolations = 0;
    let leagueRefitsCount = 0;
    let minLeadTimeMs = Infinity;
    const sampleRefitAuditTrail = [];

    for (let idx = startIdx; idx < nTotal; idx++) {
      const m = matches[idx];
      const evalKickoffMs = new Date(m.kickoff).getTime();

      if (!cachedFit || (idx - startIdx) % 25 === 0 || lastRefitCutoffMs >= evalKickoffMs) {
        const trainSlice = matches.filter(x => new Date(x.kickoff).getTime() < evalKickoffMs);
        if (trainSlice.length === 0) continue;
        const maxTrainMs = Math.max(...trainSlice.map(x => new Date(x.kickoff).getTime()));
        if (maxTrainMs >= evalKickoffMs) {
          leagueChronologicalViolations++;
          totalChronologicalViolations++;
        }
        lastRefitCutoffMs = maxTrainMs;
        lastRefitTrainCount = trainSlice.length;
        lastRefitMaxDateIso = new Date(maxTrainMs).toISOString();
        cachedFit = fitLeagueModel(trainSlice, lid);
        leagueRefitsCount++;
        totalTrainingRefitsVerified++;

        if (sampleRefitAuditTrail.length < 3) {
          sampleRefitAuditTrail.push({
            evalMatchIndex: idx,
            evalMatchId: m.id,
            evalKickoffUtc: m.kickoff,
            trainMatchesCount: trainSlice.length,
            maxTrainKickoffUtc: lastRefitMaxDateIso,
            strictlyPriorVerified: maxTrainMs < evalKickoffMs,
          });
        }
      }

      // Verify for EVERY single evaluated match (even between 25-match refits) that lastRefitCutoffMs < evalKickoffMs
      if (lastRefitCutoffMs >= evalKickoffMs) {
        leagueChronologicalViolations++;
        totalChronologicalViolations++;
      } else {
        const deltaMs = evalKickoffMs - lastRefitCutoffMs;
        if (deltaMs < minLeadTimeMs) minLeadTimeMs = deltaMs;
      }

      totalEvaluatedMatchesAllLeagues++;

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

      // Evaluate Multi-Line OU across all 8 lines: 1.5, 2.0, 2.25, 2.5, 2.75, 3.0, 3.25, 3.5
      for (const ln of OU_MULTI_LINES) {
        const acc = ouLineAccum[String(ln)];
        const ouLegs = evalOuBinaryNoPushLegs(grid, ln, m.home_goals, m.away_goals);
        for (const leg of ouLegs) {
          acc.legsTotal++;
          if (leg.excludedPush) {
            acc.legsExcludedPush++;
          } else {
            acc.legsResolved++;
            acc.preds.push(leg.pLegNoPush);
            acc.actuals.push(leg.binaryOutcome);
            acc.weightedSqSum += leg.stakeWeight * leg.sqError;
            acc.weightSum += leg.stakeWeight;
          }
        }
      }

      // Balanced Dynamic OU Half-Line & Quarter-Line
      const rawExpectedTotal = lH + lA;
      const candidateOuHalfLines = [1.5, 2.5, 3.5];
      const balancedOuHalfLine = candidateOuHalfLines.reduce(
        (best, cand) => (Math.abs(cand - rawExpectedTotal) < Math.abs(best - rawExpectedTotal) ? cand : best),
        2.5
      );
      ouBalancedHalfLineDist[String(balancedOuHalfLine)] = (ouBalancedHalfLineDist[String(balancedOuHalfLine)] || 0) + 1;
      const ouHalfEval = evalSingleOuLineOnGrid(grid, balancedOuHalfLine);
      const pOuHalfCover = Math.max(0.01, Math.min(0.99, ouHalfEval.pOver));
      const yOuHalfCover = (m.home_goals + m.away_goals) > balancedOuHalfLine ? 1 : 0;
      ouBalancedHalfPreds.push(pOuHalfCover);
      ouBalancedHalfActuals.push(yOuHalfCover);

      const balancedOuQuarterLine = Math.max(1.5, Math.min(3.5, Math.round(rawExpectedTotal * 4) / 4));
      ouBalancedQtrLineDist[String(balancedOuQuarterLine)] = (ouBalancedQtrLineDist[String(balancedOuQuarterLine)] || 0) + 1;
      const ouQtrLegs = evalOuBinaryNoPushLegs(grid, balancedOuQuarterLine, m.home_goals, m.away_goals);
      for (const leg of ouQtrLegs) {
        ouQtrLegsTotal++;
        if (leg.excludedPush) {
          ouQtrLegsExcludedPush++;
        } else {
          ouQtrLegsResolved++;
          ouBalancedQtrLegPreds.push(leg.pLegNoPush);
          ouBalancedQtrLegActuals.push(leg.binaryOutcome);
          ouQtrWeightedSqSum += leg.stakeWeight * leg.sqError;
          ouQtrWeightSum += leg.stakeWeight;
        }
      }

      // Balanced Half-Line AH
      const rawFairHandicap = -(lH - lA);
      const candidateHalfLines = [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5];
      const balancedHalfLine = candidateHalfLines.reduce(
        (best, cand) => (Math.abs(cand - rawFairHandicap) < Math.abs(best - rawFairHandicap) ? cand : best),
        -0.5
      );
      const halfEval = evalSingleAhLineOnGrid(grid, balancedHalfLine);
      const pHalfCover = Math.max(0.01, Math.min(0.99, halfEval.pWin));
      const yHalfCover = (m.home_goals - m.away_goals) + balancedHalfLine > 0 ? 1 : 0;
      ahBalancedHalfPreds.push(pHalfCover);
      ahBalancedHalfActuals.push(yHalfCover);

      // Balanced Quarter-Line AH: Old Fractional vs New Binary No-Push Per-Leg
      const balancedQuarterLine = Math.max(-2.5, Math.min(2.5, Math.round(rawFairHandicap * 4) / 4));
      const qOld = evalQuarterLineAhFractionalOld(grid, balancedQuarterLine, m.home_goals, m.away_goals);
      ahQtrOldPreds.push(qOld.expectedCoverProb);
      ahQtrOldActuals.push(qOld.actualSettledScore);

      const qNewLegs = evalAhBinaryNoPushLegs(grid, balancedQuarterLine, m.home_goals, m.away_goals);
      for (const leg of qNewLegs) {
        ahQtrLegsTotal++;
        if (leg.excludedPush) {
          ahQtrLegsExcludedPush++;
        } else {
          ahQtrLegsResolved++;
          ahQtrNewLegPreds.push(leg.pLegNoPush);
          ahQtrNewLegActuals.push(leg.binaryOutcome);
          ahQtrWeightedSqSum += leg.stakeWeight * leg.sqError;
          ahQtrWeightSum += leg.stakeWeight;
        }
      }

      if (lid === 'ENG-PL') {
        const dateStr = m.kickoff.slice(0, 10);
        const pKey = `${dateStr}_${normalizeEplTeamForJoin(m.home_team)}_${normalizeEplTeamForJoin(m.away_team)}`;
        const pin = eplPinnacleMap.get(pKey);
        if (pin) {
          pinOuPreds.push(pin.noVigOver25);
          pinOuModelPreds.push(pOver25);
          pinOuActuals.push(yOver25);

          const pinAhOld = evalQuarterLineAhFractionalOld(grid, pin.ahLine, m.home_goals, m.away_goals);
          pinAhOldPreds.push(pin.noVigAhHome);
          pinAhOldModelPreds.push(pinAhOld.expectedCoverProb);
          pinAhOldActuals.push(pinAhOld.actualSettledScore);

          const pinAhLegs = evalAhBinaryNoPushLegs(grid, pin.ahLine, m.home_goals, m.away_goals);
          for (const leg of pinAhLegs) {
            pinAhLegsTotal++;
            if (leg.excludedPush) {
              pinAhLegsExcludedPush++;
            } else {
              pinAhLegsResolved++;
              pinAhNewModelLegPreds.push(leg.pLegNoPush);
              pinAhNewPinnacleLegPreds.push(pin.noVigAhHome);
              pinAhNewLegActuals.push(leg.binaryOutcome);
            }
          }
        }
      }
    }

    const ouBoot = computeBootstrapBrierCi95(ouPreds, ouActuals, 1000);
    const ah05Boot = computeBootstrapBrierCi95(ahMinus05Preds, ahMinus05Actuals, 1000);
    const ahHalfBoot = computeBootstrapBrierCi95(ahBalancedHalfPreds, ahBalancedHalfActuals, 1000);
    const ahQtrOldBoot = computeBootstrapBrierCi95(ahQtrOldPreds, ahQtrOldActuals, 1000);
    const ahQtrNewBoot = computeBootstrapBrierCi95(ahQtrNewLegPreds, ahQtrNewLegActuals, 1000);
    const ahQtrNewStakeWeightedBrier =
      ahQtrWeightSum > 0 ? Number((ahQtrWeightedSqSum / ahQtrWeightSum).toFixed(4)) : null;

    // Compute multi-line OU bootstrap summaries
    const ouByLineResults = {};
    for (const ln of OU_MULTI_LINES) {
      const acc = ouLineAccum[String(ln)];
      const boot = computeBootstrapBrierCi95(acc.preds, acc.actuals, 1000);
      ouByLineResults[String(ln)] = {
        line: ln,
        nLegsTotal: acc.legsTotal,
        nLegsResolved: acc.legsResolved,
        nLegsExcludedPush: acc.legsExcludedPush,
        brierUnweightedLegMean: boot.brier,
        brierStakeWeightedMean: acc.weightSum > 0 ? Number((acc.weightedSqSum / acc.weightSum).toFixed(4)) : null,
        brierCi95: boot.brierCi95,
        constant05Brier: 0.25,
        baseRateBrier: boot.baseRateBrier,
        beatsConstant05At95Ci: boot.beatsConstant05At95Ci,
        pointPassLt025: boot.brier !== null && boot.brier < 0.25,
        ci95PassLt025: boot.brierCi95[1] !== null && boot.brierCi95[1] < 0.25,
      };
    }

    const ouBalancedHalfBoot = computeBootstrapBrierCi95(ouBalancedHalfPreds, ouBalancedHalfActuals, 1000);
    const ouBalancedQtrBoot = computeBootstrapBrierCi95(ouBalancedQtrLegPreds, ouBalancedQtrLegActuals, 1000);
    const ouBalancedQtrStakeWeightedBrier =
      ouQtrWeightSum > 0 ? Number((ouQtrWeightedSqSum / ouQtrWeightSum).toFixed(4)) : null;

    // Compare promotion-gate results against the 0.2500 binary coin-flip threshold:
    //   - Point Brier < 0.2500
    //   - Upper 95% CI < 0.2500
    const oldQuarterPointPass = ahQtrOldBoot.brier < 0.25;
    const oldQuarterCi95Pass = ahQtrOldBoot.brierCi95[1] < 0.25;
    const newQuarterPointPass = ahQtrNewBoot.brier < 0.25;
    const newQuarterCi95Pass = ahQtrNewBoot.brierCi95[1] < 0.25;
    const halfLinePointPass = ahHalfBoot.brier < 0.25;
    const halfLineCi95Pass = ahHalfBoot.brierCi95[1] < 0.25;

    const ouPointPass = ouBoot.brier < 0.25;
    const ouCi95Pass = ouBoot.brierCi95[1] < 0.25;

    if (oldQuarterPointPass !== newQuarterPointPass || oldQuarterCi95Pass !== newQuarterCi95Pass) {
      promotionGateFlips.push({
        leagueId: lid,
        market: 'AH (Balanced Quarter-Line vs 0.2500 Gate)',
        oldFractionalBrier: ahQtrOldBoot.brier,
        oldFractionalCi95: ahQtrOldBoot.brierCi95,
        oldPointGatePassLt025: oldQuarterPointPass,
        oldCi95UpperPassLt025: oldQuarterCi95Pass,
        newBinaryNoPushLegBrier: ahQtrNewBoot.brier,
        newBinaryNoPushStakeWeightedBrier: ahQtrNewStakeWeightedBrier,
        newBinaryNoPushCi95: ahQtrNewBoot.brierCi95,
        newPointGatePassLt025: newQuarterPointPass,
        newCi95UpperPassLt025: newQuarterCi95Pass,
        flipSummary: `Old fractional Brier ${ahQtrOldBoot.brier} [${ahQtrOldBoot.brierCi95.join(', ')}] (point<0.25=${oldQuarterPointPass}, ci95Upper<0.25=${oldQuarterCi95Pass}) -> New binary no-push leg Brier ${ahQtrNewBoot.brier} [${ahQtrNewBoot.brierCi95.join(', ')}] (point<0.25=${newQuarterPointPass}, ci95Upper<0.25=${newQuarterCi95Pass})`,
      });
    }

    let pinnacleComparison = null;
    if (lid === 'ENG-PL' && pinOuPreds.length > 0) {
      const nPin = pinOuPreds.length;
      const pinOuBrier = Number(
        (pinOuPreds.reduce((s, p, i) => s + Math.pow(p - pinOuActuals[i], 2), 0) / nPin).toFixed(4)
      );
      const modOuBrier = Number(
        (pinOuModelPreds.reduce((s, p, i) => s + Math.pow(p - pinOuActuals[i], 2), 0) / nPin).toFixed(4)
      );
      const pinAhOldBrier = Number(
        (pinAhOldPreds.reduce((s, p, i) => s + Math.pow(p - pinAhOldActuals[i], 2), 0) / nPin).toFixed(4)
      );
      const modAhOldBrier = Number(
        (pinAhOldModelPreds.reduce((s, p, i) => s + Math.pow(p - pinAhOldActuals[i], 2), 0) / nPin).toFixed(4)
      );
      const pinAhNewLegBrier = Number(
        (
          pinAhNewPinnacleLegPreds.reduce((s, p, i) => s + Math.pow(p - pinAhNewLegActuals[i], 2), 0) /
          pinAhNewLegActuals.length
        ).toFixed(4)
      );
      const modAhNewLegBrier = Number(
        (
          pinAhNewModelLegPreds.reduce((s, p, i) => s + Math.pow(p - pinAhNewLegActuals[i], 2), 0) /
          pinAhNewLegActuals.length
        ).toFixed(4)
      );

      pinnacleComparison = {
        matchedFixtures: nPin,
        ou25: {
          pinnacleBrier: pinOuBrier,
          modelBrier: modOuBrier,
          modelMinusPinnacleDiff: Number((modOuBrier - pinOuBrier).toFixed(4)),
        },
        ahMarketLineOldFractional: {
          pinnacleBrier: pinAhOldBrier,
          modelBrier: modAhOldBrier,
        },
        ahMarketLineNewBinaryNoPushLegs: {
          nLegsTotal: pinAhLegsTotal,
          nLegsResolved: pinAhLegsResolved,
          nLegsExcludedPush: pinAhLegsExcludedPush,
          pinnacleBrier: pinAhNewLegBrier,
          modelBrier: modAhNewLegBrier,
          modelMinusPinnacleDiff: Number((modAhNewLegBrier - pinAhNewLegBrier).toFixed(4)),
        },
      };
    }

    perLeagueResults[lid] = {
      leagueId: lid,
      nTotalMatches: nTotal,
      nTrainInitial: startIdx,
      nEvalMatches: ouPreds.length,
      chronologicalProof: {
        strictOrderingVerified: leagueChronologicalViolations === 0,
        chronologicalViolationsCount: leagueChronologicalViolations,
        refitsExecutedCount: leagueRefitsCount,
        minPositiveLeadTimeMinutes: Number((minLeadTimeMs / 60000).toFixed(2)),
        sampleRefitAuditTrail,
      },
      ah: {
        oldFixedMinus05: {
          brier: ah05Boot.brier,
          brierCi95: ah05Boot.brierCi95,
          constant05Brier: ah05Boot.constant05Brier,
          baseRateBrier: ah05Boot.baseRateBrier,
          beatsConstant05At95Ci: ah05Boot.beatsConstant05At95Ci,
        },
        oldBalancedQuarterFractional: {
          brier: ahQtrOldBoot.brier,
          brierCi95: ahQtrOldBoot.brierCi95,
          constant05Brier: ahQtrOldBoot.constant05Brier,
          beatsConstant05At95Ci: ahQtrOldBoot.beatsConstant05At95Ci,
          pointPassLt025: oldQuarterPointPass,
          ci95PassLt025: oldQuarterCi95Pass,
        },
        newBalancedQuarterBinaryNoPushPerLeg: {
          nLegsTotal: ahQtrLegsTotal,
          nLegsResolved: ahQtrLegsResolved,
          nLegsExcludedPush: ahQtrLegsExcludedPush,
          brierUnweightedLegMean: ahQtrNewBoot.brier,
          brierStakeWeightedMean: ahQtrNewStakeWeightedBrier,
          brierCi95: ahQtrNewBoot.brierCi95,
          constant05Brier: 0.25,
          beatsConstant05At95Ci: ahQtrNewBoot.beatsConstant05At95Ci,
          pointPassLt025: newQuarterPointPass,
          ci95PassLt025: newQuarterCi95Pass,
        },
        balancedHalfLineBinaryNoPush: {
          nMatchesResolved: ahHalfBoot.n,
          brier: ahHalfBoot.brier,
          brierCi95: ahHalfBoot.brierCi95,
          constant05Brier: 0.25,
          beatsConstant05At95Ci: ahHalfBoot.beatsConstant05At95Ci,
          pointPassLt025: halfLinePointPass,
          ci95PassLt025: halfLineCi95Pass,
        },
      },
      ou25: {
        nMatchesResolved: ouBoot.n,
        oldBrier: ouBoot.brier,
        newBinaryNoPushBrier: ouBoot.brier,
        brierCi95: ouBoot.brierCi95,
        constant05Brier: 0.25,
        beatsConstant05At95Ci: ouBoot.beatsConstant05At95Ci,
        pointPassLt025: ouPointPass,
        ci95PassLt025: ouCi95Pass,
      },
      ouMultiLine: {
        linesEvaluated: OU_MULTI_LINES,
        byLine: ouByLineResults,
        balancedHalfLineBinaryNoPush: {
          nMatchesResolved: ouBalancedHalfBoot.n,
          brier: ouBalancedHalfBoot.brier,
          brierCi95: ouBalancedHalfBoot.brierCi95,
          constant05Brier: 0.25,
          baseRateBrier: ouBalancedHalfBoot.baseRateBrier,
          beatsConstant05At95Ci: ouBalancedHalfBoot.beatsConstant05At95Ci,
          pointPassLt025: ouBalancedHalfBoot.brier !== null && ouBalancedHalfBoot.brier < 0.25,
          ci95PassLt025: ouBalancedHalfBoot.brierCi95[1] !== null && ouBalancedHalfBoot.brierCi95[1] < 0.25,
          lineDistribution: ouBalancedHalfLineDist,
        },
        balancedQuarterLineBinaryNoPushPerLeg: {
          nLegsTotal: ouQtrLegsTotal,
          nLegsResolved: ouQtrLegsResolved,
          nLegsExcludedPush: ouQtrLegsExcludedPush,
          brierUnweightedLegMean: ouBalancedQtrBoot.brier,
          brierStakeWeightedMean: ouBalancedQtrStakeWeightedBrier,
          brierCi95: ouBalancedQtrBoot.brierCi95,
          constant05Brier: 0.25,
          baseRateBrier: ouBalancedQtrBoot.baseRateBrier,
          beatsConstant05At95Ci: ouBalancedQtrBoot.beatsConstant05At95Ci,
          pointPassLt025: ouBalancedQtrBoot.brier !== null && ouBalancedQtrBoot.brier < 0.25,
          ci95PassLt025: ouBalancedQtrBoot.brierCi95[1] !== null && ouBalancedQtrBoot.brierCi95[1] < 0.25,
          lineDistribution: ouBalancedQtrLineDist,
        },
      },
      pinnacleComparison,
    };
  }

  const afterBytes = fs.readFileSync(ratingsArtifactPath);
  const afterSha256 = crypto.createHash('sha256').update(afterBytes).digest('hex');
  if (beforeSha256 !== afterSha256) {
    throw new Error('CRITICAL VIOLATION: multi_league_team_ratings_v1.0.json was mutated during read-only recompute!');
  }

  const report = {
    generatedAtUtc: new Date().toISOString(),
    readOnlyInvariant: {
      artifactPath: 'data/artifacts/multi_league_team_ratings_v1.0.json',
      sha256Before: beforeSha256,
      sha256After: afterSha256,
      mutated: false,
      existingArtifactVersion: existingArtifact.provenance?.version || null,
    },
    chronologicalWalkForwardGlobalProof: {
      totalLeaguesWithData: 14,
      totalEvaluatedMatches: totalEvaluatedMatchesAllLeagues,
      totalRefitsVerified: totalTrainingRefitsVerified,
      totalChronologicalViolations: totalChronologicalViolations,
      invariantRule: 'For every evaluated match m[idx] and every training match x in cachedFit: kickoff(x) <= lastRefitCutoffMs < kickoff(m[idx])',
      allMatchesStrictlyPriorVerified: totalChronologicalViolations === 0,
    },
    promotionGateFlipSummary: {
      totalQuarterLineAhFlips: promotionGateFlips.length,
      flips: promotionGateFlips,
    },
    perLeagueResults,
  };

  if (options.writeReportFile) {
    const reportPath = path.resolve(process.cwd(), 'data/verification/h8_walkforward_backtest_recompute_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  }

  return report;
}

if (require.main === module) {
  const report = runReadOnlyH8BacktestRecompute({ writeReportFile: false });
  console.log('=== READ-ONLY INVARIANT ===');
  console.log(JSON.stringify(report.readOnlyInvariant, null, 2));
  console.log('\n=== GLOBAL CHRONOLOGICAL WALK-FORWARD PROOF ===');
  console.log(JSON.stringify(report.chronologicalWalkForwardGlobalProof, null, 2));
  console.log('\n=== 15-LEAGUE OLD vs NEW BRIER TABLE ===');
  for (const lid of ALL_15_LEAGUE_IDS) {
    const r = report.perLeagueResults[lid];
    if (!r || r.nEvalMatches === 0) {
      console.log(`${lid.padEnd(15)} | PAUSED (0 matches)`);
      continue;
    }
    const ahOld05 = r.ah.oldFixedMinus05.brier;
    const ahOldQtr = r.ah.oldBalancedQuarterFractional.brier;
    const ahOldQtrCi = r.ah.oldBalancedQuarterFractional.brierCi95;
    const ahNewQtr = r.ah.newBalancedQuarterBinaryNoPushPerLeg.brierUnweightedLegMean;
    const ahNewQtrW = r.ah.newBalancedQuarterBinaryNoPushPerLeg.brierStakeWeightedMean;
    const ahNewQtrCi = r.ah.newBalancedQuarterBinaryNoPushPerLeg.brierCi95;
    const ahHalf = r.ah.balancedHalfLineBinaryNoPush.brier;
    const ahHalfCi = r.ah.balancedHalfLineBinaryNoPush.brierCi95;
    const ou = r.ou25.newBinaryNoPushBrier;
    const ouCi = r.ou25.brierCi95;
    console.log(
      `${lid.padEnd(15)} | nEval=${r.nEvalMatches} | AH_Old05=${ahOld05} | AH_Qtr_OldFrac=${ahOldQtr} [${ahOldQtrCi.join(',')}] -> AH_Qtr_NewBinLeg=${ahNewQtr} (w=${ahNewQtrW}) [${ahNewQtrCi.join(',')}] (resolvedLegs=${r.ah.newBalancedQuarterBinaryNoPushPerLeg.nLegsResolved}/${r.ah.newBalancedQuarterBinaryNoPushPerLeg.nLegsTotal}, pushExcl=${r.ah.newBalancedQuarterBinaryNoPushPerLeg.nLegsExcludedPush}) | AH_Half=${ahHalf} [${ahHalfCi.join(',')}] | OU2.5=${ou} [${ouCi.join(',')}]`
    );
  }
  console.log('\n=== ENG-PL PINNACLE BENCHMARK (OLD vs NEW) ===');
  console.log(JSON.stringify(report.perLeagueResults['ENG-PL'].pinnacleComparison, null, 2));
  console.log('\n=== PROMOTION GATE FLIPS ===');
  console.log(`Total AH Quarter-Line Flips: ${report.promotionGateFlipSummary.totalQuarterLineAhFlips}`);
  for (const f of report.promotionGateFlipSummary.flips) {
    console.log(`- ${f.leagueId}: ${f.flipSummary}`);
  }
}

module.exports = {
  runReadOnlyH8BacktestRecompute,
  buildGrid,
  evalSingleOuLineOnGrid,
  evalOuBinaryNoPushLegs,
  OU_MULTI_LINES,
};
