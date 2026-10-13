/**
 * SALMO / HandicapLab — Canonical Normalization & Feature Engine
 *
 * Ingests raw API-Football JSON files from research/api-football/raw/
 * and maps them to SALMO canonical standards:
 * 1. Normalized Fixtures (dates, scores, outcomes, 1X2, BTTS, OU2.5)
 * 2. Normalized Standings (rank, points, goal difference, form)
 * 3. Normalized Match Statistics (xG, shots, corners, possession, cards, saves)
 * 4. Derived Team Features (rolling xG, attack/defense ratings, goal expectation lambdas)
 */

const fs = require('fs');
const path = require('path');

const RAW_DIR = path.resolve('research/api-football/raw');
const NORM_DIR = path.resolve('research/api-football/normalized');
const FEAT_DIR = path.resolve('research/api-football/features');

const CANONICAL_LEAGUES_MAP = {
  39: { key: 'ENG-PL', name: 'Premier League', country: 'England', tier: 'A' },
  140: { key: 'ESP-LALIGA', name: 'La Liga', country: 'Spain', tier: 'A' },
  135: { key: 'ITA-SERIEA', name: 'Serie A', country: 'Italy', tier: 'A' },
  78: { key: 'DEU-BUNDESLIGA', name: 'Bundesliga', country: 'Germany', tier: 'A' },
  61: { key: 'FRA-LIGUE1', name: 'Ligue 1', country: 'France', tier: 'A' },
  88: { key: 'NED-ERE', name: 'Eredivisie', country: 'Netherlands', tier: 'B' },
  94: { key: 'POR-PRIMEIRA', name: 'Primeira Liga', country: 'Portugal', tier: 'B' },
  144: { key: 'BEL-PRO', name: 'Jupiler Pro League', country: 'Belgium', tier: 'B' },
  179: { key: 'SCO-PREM', name: 'Premiership', country: 'Scotland', tier: 'B' },
  40: { key: 'ENG-CHAMP', name: 'Championship', country: 'England', tier: 'B' },
  253: { key: 'USA-MLS', name: 'Major League Soccer', country: 'USA', tier: 'C' },
  307: { key: 'SAU-PRO', name: 'Pro League', country: 'Saudi Arabia', tier: 'C' },
  98: { key: 'JPN-J1', name: 'J1 League', country: 'Japan', tier: 'C' },
  292: { key: 'KOR-K1', name: 'K League 1', country: 'South Korea', tier: 'C' },
  274: { key: 'IDN-L1', name: 'Liga 1', country: 'Indonesia', tier: 'C' }
};

function ensureDirs() {
  if (!fs.existsSync(NORM_DIR)) fs.mkdirSync(NORM_DIR, { recursive: true });
  if (!fs.existsSync(FEAT_DIR)) fs.mkdirSync(FEAT_DIR, { recursive: true });
}

// 1. Normalize Fixtures
function normalizeFixtures() {
  const fixDir = path.join(RAW_DIR, 'fixtures');
  if (!fs.existsSync(fixDir)) return { count: 0, byLeague: {} };

  const files = fs.readdirSync(fixDir).filter(f => f.endsWith('.json'));
  const normalizedRecords = [];
  const byLeague = {};

  for (const file of files) {
    const fullPath = path.join(fixDir, file);
    try {
      const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      if (!Array.isArray(data.response)) continue;

      for (const item of data.response) {
        const fixtureId = item.fixture?.id;
        const apiLeagueId = item.league?.id;
        const canonical = CANONICAL_LEAGUES_MAP[apiLeagueId];
        const leagueKey = canonical ? canonical.key : `UNKNOWN-${apiLeagueId}`;
        const season = item.league?.season;
        const dateUtc = item.fixture?.date;
        const status = item.fixture?.status?.short;

        const homeTeamId = item.teams?.home?.id;
        const homeTeamName = item.teams?.home?.name;
        const awayTeamId = item.teams?.away?.id;
        const awayTeamName = item.teams?.away?.name;

        const homeGoals = item.goals?.home;
        const awayGoals = item.goals?.away;
        const homeHtGoals = item.score?.halftime?.home;
        const awayHtGoals = item.score?.halftime?.away;

        let outcome1x2 = null;
        let bttsOutcome = null;
        let ou25Outcome = null;
        let totalGoals = null;
        let goalDiff = null;

        if (homeGoals !== null && awayGoals !== null && ['FT', 'AET', 'PEN'].includes(status)) {
          totalGoals = homeGoals + awayGoals;
          goalDiff = homeGoals - awayGoals;
          outcome1x2 = homeGoals > awayGoals ? 'H' : (homeGoals === awayGoals ? 'D' : 'A');
          bttsOutcome = homeGoals > 0 && awayGoals > 0;
          ou25Outcome = totalGoals > 2.5;
        }

        const record = {
          fixture_id: fixtureId,
          canonical_league_id: leagueKey,
          api_league_id: apiLeagueId,
          league_name: item.league?.name,
          season,
          round: item.league?.round,
          date_utc: dateUtc,
          status,
          referee: item.fixture?.referee,
          venue_name: item.fixture?.venue?.name,
          venue_city: item.fixture?.venue?.city,
          home_team_id: homeTeamId,
          home_team_name: homeTeamName,
          away_team_id: awayTeamId,
          away_team_name: awayTeamName,
          home_goals: homeGoals,
          away_goals: awayGoals,
          home_ht_goals: homeHtGoals,
          away_ht_goals: awayHtGoals,
          total_goals: totalGoals,
          goal_difference: goalDiff,
          outcome_1x2: outcome1x2,
          btts_outcome: bttsOutcome,
          ou25_outcome: ou25Outcome
        };

        normalizedRecords.push(record);
        byLeague[leagueKey] = (byLeague[leagueKey] || 0) + 1;
      }
    } catch (err) {
      console.warn(`Error parsing ${file}: ${err.message}`);
    }
  }

  // Deduplicate by fixture_id
  const seen = new Set();
  const deduped = [];
  for (const r of normalizedRecords) {
    if (!seen.has(r.fixture_id)) {
      seen.add(r.fixture_id);
      deduped.push(r);
    }
  }

  const outPath = path.join(NORM_DIR, 'canonical_fixtures.json');
  fs.writeFileSync(outPath, JSON.stringify(deduped, null, 2), 'utf8');

  // Also write JSONL for streaming analytics
  const jsonlPath = path.join(NORM_DIR, 'canonical_fixtures.jsonl');
  fs.writeFileSync(jsonlPath, deduped.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');

  return { total: deduped.length, byLeague };
}

// 2. Normalize Standings
function normalizeStandings() {
  const stdDir = path.join(RAW_DIR, 'standings');
  if (!fs.existsSync(stdDir)) return { count: 0 };

  const files = fs.readdirSync(stdDir).filter(f => f.endsWith('.json'));
  const normalizedRecords = [];

  for (const file of files) {
    const fullPath = path.join(stdDir, file);
    try {
      const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      if (!Array.isArray(data.response) || data.response.length === 0) continue;

      const leagueData = data.response[0]?.league;
      const apiLeagueId = leagueData?.id;
      const canonical = CANONICAL_LEAGUES_MAP[apiLeagueId];
      const leagueKey = canonical ? canonical.key : `UNKNOWN-${apiLeagueId}`;
      const season = leagueData?.season;

      if (Array.isArray(leagueData?.standings)) {
        for (const table of leagueData.standings) {
          for (const row of table) {
            normalizedRecords.push({
              canonical_league_id: leagueKey,
              api_league_id: apiLeagueId,
              season,
              rank: row.rank,
              team_id: row.team?.id,
              team_name: row.team?.name,
              points: row.points,
              goals_diff: row.goalsDiff,
              group: row.group,
              form: row.form,
              status: row.status,
              description: row.description,
              all_played: row.all?.played,
              all_win: row.all?.win,
              all_draw: row.all?.draw,
              all_lose: row.all?.lose,
              all_goals_for: row.all?.goals?.for,
              all_goals_against: row.all?.goals?.against,
              home_played: row.home?.played,
              home_win: row.home?.win,
              home_draw: row.home?.draw,
              home_lose: row.home?.lose,
              home_goals_for: row.home?.goals?.for,
              home_goals_against: row.home?.goals?.against,
              away_played: row.away?.played,
              away_win: row.away?.win,
              away_draw: row.away?.draw,
              away_lose: row.away?.lose,
              away_goals_for: row.away?.goals?.for,
              away_goals_against: row.away?.goals?.against,
            });
          }
        }
      }
    } catch (err) {
      console.warn(`Error parsing ${file}: ${err.message}`);
    }
  }

  const outPath = path.join(NORM_DIR, 'canonical_standings.json');
  fs.writeFileSync(outPath, JSON.stringify(normalizedRecords, null, 2), 'utf8');
  return { total: normalizedRecords.length };
}

// 3. Normalize Match Statistics
function normalizeMatchStatistics() {
  const statDir = path.join(RAW_DIR, 'fixture_statistics');
  if (!fs.existsSync(statDir)) return { count: 0 };

  const files = fs.readdirSync(statDir).filter(f => f.endsWith('.json'));
  const normalizedRecords = [];

  for (const file of files) {
    const fixtureId = parseInt(file.replace('.json', ''), 10);
    const fullPath = path.join(statDir, file);
    try {
      const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      if (!Array.isArray(data.response) || data.response.length < 2) continue;

      const homeStatsArr = data.response[0]?.statistics || [];
      const awayStatsArr = data.response[1]?.statistics || [];

      function parseStatMap(arr) {
        const m = {};
        for (const item of arr) {
          let val = item.value;
          if (typeof val === 'string') {
            if (val.endsWith('%')) val = parseFloat(val.replace('%', ''));
            else if (!isNaN(parseFloat(val))) val = parseFloat(val);
          }
          m[item.type] = val;
        }
        return m;
      }

      const hMap = parseStatMap(homeStatsArr);
      const aMap = parseStatMap(awayStatsArr);

      const hXg = hMap['expected_goals'] !== undefined && hMap['expected_goals'] !== null ? parseFloat(hMap['expected_goals']) : null;
      const aXg = aMap['expected_goals'] !== undefined && aMap['expected_goals'] !== null ? parseFloat(aMap['expected_goals']) : null;

      normalizedRecords.push({
        fixture_id: fixtureId,
        home_team_id: data.response[0]?.team?.id,
        home_team_name: data.response[0]?.team?.name,
        away_team_id: data.response[1]?.team?.id,
        away_team_name: data.response[1]?.team?.name,
        home_xg: hXg,
        away_xg: aXg,
        total_xg: hXg !== null && aXg !== null ? parseFloat((hXg + aXg).toFixed(2)) : null,
        xg_difference: hXg !== null && aXg !== null ? parseFloat((hXg - aXg).toFixed(2)) : null,
        home_shots_total: hMap['Total Shots'] || 0,
        away_shots_total: aMap['Total Shots'] || 0,
        home_shots_on_target: hMap['Shots on Goal'] || 0,
        away_shots_on_target: aMap['Shots on Goal'] || 0,
        home_shots_off_target: hMap['Shots off Goal'] || 0,
        away_shots_off_target: aMap['Shots off Goal'] || 0,
        home_blocked_shots: hMap['Blocked Shots'] || 0,
        away_blocked_shots: aMap['Blocked Shots'] || 0,
        home_corners: hMap['Corner Kicks'] || 0,
        away_corners: aMap['Corner Kicks'] || 0,
        home_possession_pct: hMap['Ball Possession'] || 0,
        away_possession_pct: aMap['Ball Possession'] || 0,
        home_fouls: hMap['Fouls'] || 0,
        away_fouls: aMap['Fouls'] || 0,
        home_yellow_cards: hMap['Yellow Cards'] || 0,
        away_yellow_cards: aMap['Yellow Cards'] || 0,
        home_red_cards: hMap['Red Cards'] || 0,
        away_red_cards: aMap['Red Cards'] || 0,
        home_saves: hMap['Goalkeeper Saves'] || 0,
        away_saves: aMap['Goalkeeper Saves'] || 0,
        home_total_passes: hMap['Total passes'] || 0,
        away_total_passes: aMap['Total passes'] || 0,
        home_pass_accuracy_pct: hMap['Passes %'] || 0,
        away_pass_accuracy_pct: aMap['Passes %'] || 0,
      });
    } catch (err) {
      console.warn(`Error parsing stat ${file}: ${err.message}`);
    }
  }

  const outPath = path.join(NORM_DIR, 'canonical_match_statistics.json');
  fs.writeFileSync(outPath, JSON.stringify(normalizedRecords, null, 2), 'utf8');

  const jsonlPath = path.join(NORM_DIR, 'canonical_match_statistics.jsonl');
  fs.writeFileSync(jsonlPath, normalizedRecords.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');

  return { total: normalizedRecords.length };
}

// 4. Generate Research Modeling Features
function generateResearchFeatures() {
  const normFixPath = path.join(NORM_DIR, 'canonical_fixtures.json');
  const normStatPath = path.join(NORM_DIR, 'canonical_match_statistics.json');

  if (!fs.existsSync(normFixPath)) return { count: 0 };
  const fixtures = JSON.parse(fs.readFileSync(normFixPath, 'utf8'));
  const statsMap = new Map();

  if (fs.existsSync(normStatPath)) {
    const stats = JSON.parse(fs.readFileSync(normStatPath, 'utf8'));
    for (const s of stats) statsMap.set(s.fixture_id, s);
  }

  // Group finished matches by team
  const teamMatches = new Map();
  for (const f of fixtures) {
    if (!['FT', 'AET', 'PEN'].includes(f.status)) continue;
    const stat = statsMap.get(f.fixture_id) || {};

    // Home record
    if (f.home_team_id) {
      if (!teamMatches.has(f.home_team_id)) teamMatches.set(f.home_team_id, []);
      teamMatches.get(f.home_team_id).push({
        date: f.date_utc,
        league: f.canonical_league_id,
        season: f.season,
        opponent_id: f.away_team_id,
        is_home: true,
        goals_scored: f.home_goals,
        goals_conceded: f.away_goals,
        xg_for: stat.home_xg ?? null,
        xg_against: stat.away_xg ?? null,
        shots_for: stat.home_shots_total ?? null,
        shots_against: stat.away_shots_total ?? null,
        sot_for: stat.home_shots_on_target ?? null,
        sot_against: stat.away_shots_on_target ?? null,
        corners_for: stat.home_corners ?? null,
        corners_against: stat.away_corners ?? null,
      });
    }

    // Away record
    if (f.away_team_id) {
      if (!teamMatches.has(f.away_team_id)) teamMatches.set(f.away_team_id, []);
      teamMatches.get(f.away_team_id).push({
        date: f.date_utc,
        league: f.canonical_league_id,
        season: f.season,
        opponent_id: f.home_team_id,
        is_home: false,
        goals_scored: f.away_goals,
        goals_conceded: f.home_goals,
        xg_for: stat.away_xg ?? null,
        xg_against: stat.home_xg ?? null,
        shots_for: stat.away_shots_total ?? null,
        shots_against: stat.home_shots_total ?? null,
        sot_for: stat.away_shots_on_target ?? null,
        sot_against: stat.home_shots_on_target ?? null,
        corners_for: stat.away_corners ?? null,
        corners_against: stat.home_corners ?? null,
      });
    }
  }

  // Calculate team aggregated ratings
  const teamProfiles = [];
  for (const [teamId, matches] of teamMatches.entries()) {
    matches.sort((a, b) => new Date(a.date) - new Date(b.date));
    const totalMatches = matches.length;
    if (totalMatches === 0) continue;

    const goalsScored = matches.reduce((acc, m) => acc + (m.goals_scored || 0), 0);
    const goalsConceded = matches.reduce((acc, m) => acc + (m.goals_conceded || 0), 0);

    const xgMatches = matches.filter(m => m.xg_for !== null && m.xg_against !== null);
    const avgXgFor = xgMatches.length > 0 ? xgMatches.reduce((acc, m) => acc + m.xg_for, 0) / xgMatches.length : null;
    const avgXgAgainst = xgMatches.length > 0 ? xgMatches.reduce((acc, m) => acc + m.xg_against, 0) / xgMatches.length : null;

    const cleanSheets = matches.filter(m => m.goals_conceded === 0).length;
    const failedToScore = matches.filter(m => m.goals_scored === 0).length;
    const bttsCount = matches.filter(m => (m.goals_scored || 0) > 0 && (m.goals_conceded || 0) > 0).length;
    const over25Count = matches.filter(m => ((m.goals_scored || 0) + (m.goals_conceded || 0)) > 2.5).length;

    // Last 5 form
    const last5 = matches.slice(-5);
    const last5GoalsFor = last5.reduce((acc, m) => acc + (m.goals_scored || 0), 0);
    const last5GoalsAgainst = last5.reduce((acc, m) => acc + (m.goals_conceded || 0), 0);

    teamProfiles.push({
      team_id: teamId,
      sample_size: totalMatches,
      xg_sample_size: xgMatches.length,
      league_key: matches[matches.length - 1].league,
      avg_goals_scored: parseFloat((goalsScored / totalMatches).toFixed(2)),
      avg_goals_conceded: parseFloat((goalsConceded / totalMatches).toFixed(2)),
      avg_xg_for: avgXgFor !== null ? parseFloat(avgXgFor.toFixed(2)) : null,
      avg_xg_against: avgXgAgainst !== null ? parseFloat(avgXgAgainst.toFixed(2)) : null,
      clean_sheet_pct: parseFloat(((cleanSheets / totalMatches) * 100).toFixed(1)),
      failed_to_score_pct: parseFloat(((failedToScore / totalMatches) * 100).toFixed(1)),
      btts_rate_pct: parseFloat(((bttsCount / totalMatches) * 100).toFixed(1)),
      over25_rate_pct: parseFloat(((over25Count / totalMatches) * 100).toFixed(1)),
      last5_goals_for: last5GoalsFor,
      last5_goals_against: last5GoalsAgainst
    });
  }

  const outPath = path.join(FEAT_DIR, 'team_empirical_profiles.json');
  fs.writeFileSync(outPath, JSON.stringify(teamProfiles, null, 2), 'utf8');

  return { totalTeams: teamProfiles.length };
}

function runAll() {
  ensureDirs();
  console.log('=== NORMALIZING HARVESTED API-FOOTBALL DATA ===');
  const fixRes = normalizeFixtures();
  console.log(`Normalized Fixtures: ${fixRes.total} matches across ${Object.keys(fixRes.byLeague).length} leagues`);

  const stdRes = normalizeStandings();
  console.log(`Normalized Standings: ${stdRes.total} table rows`);

  const statRes = normalizeMatchStatistics();
  console.log(`Normalized Match Statistics: ${statRes.total} matches with deep stats (xG/shots/corners/possession)`);

  const featRes = generateResearchFeatures();
  console.log(`Generated Research Profiles: ${featRes.totalTeams} team empirical profiles`);
}

if (require.main === module) {
  runAll();
}

module.exports = { normalizeFixtures, normalizeStandings, normalizeMatchStatistics, generateResearchFeatures, runAll };
