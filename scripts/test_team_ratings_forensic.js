const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const sb = createClient(supabaseUrl, supabaseKey);

function calculateTeamRatings(recentMatches) {
  if (!recentMatches || recentMatches.length === 0) return {};
  const sortedMatches = [...recentMatches].sort(
    (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()
  );

  const teamMatchesMap = {};
  const teamNames = {};
  const teamLeagues = {};

  sortedMatches.forEach((m, idx) => {
    const home = m.home_team;
    const away = m.away_team;
    teamNames[home] = home;
    teamNames[away] = away;
    teamLeagues[home] = m.league;
    teamLeagues[away] = m.league;

    if (!teamMatchesMap[home]) teamMatchesMap[home] = [];
    if (!teamMatchesMap[away]) teamMatchesMap[away] = [];

    teamMatchesMap[home].push({ isHome: true, matchIndex: idx, opponent: away, scored: m.home_goals, conceded: m.away_goals });
    teamMatchesMap[away].push({ isHome: false, matchIndex: idx, opponent: home, scored: m.away_goals, conceded: m.home_goals });
  });

  const ratings = {};
  Object.keys(teamNames).forEach(team => {
    ratings[team] = {
      team_id: team,
      team_name: teamNames[team],
      league_id: teamLeagues[team],
      attack_strength: 1.0,
      defense_strength: 1.0,
      matches_played: teamMatchesMap[team].length
    };
  });

  const decayRate = 0.90;
  for (let iter = 0; iter < 5; iter++) {
    const nextStrengths = {};
    Object.keys(teamNames).forEach(team => {
      const matches = teamMatchesMap[team];
      let weightedGoalsScored = 0;
      let weightedGoalsConceded = 0;
      let weightedOpponentDefense = 0;
      let weightedOpponentAttack = 0;
      let totalWeight = 0;

      matches.forEach((m, idx) => {
        const age = matches.length - 1 - idx;
        const weight = Math.pow(decayRate, age);
        const opponentRating = ratings[m.opponent] || { attack_strength: 1.0, defense_strength: 1.0 };
        weightedGoalsScored += m.scored * weight;
        weightedGoalsConceded += m.conceded * weight;
        weightedOpponentDefense += opponentRating.defense_strength * weight;
        weightedOpponentAttack += opponentRating.attack_strength * weight;
        totalWeight += weight;
      });

      const avgScored = totalWeight > 0 ? weightedGoalsScored / totalWeight : 1.25;
      const avgConceded = totalWeight > 0 ? weightedGoalsConceded / totalWeight : 1.25;
      const avgOppDefense = totalWeight > 0 ? weightedOpponentDefense / totalWeight : 1.0;
      const avgOppAttack = totalWeight > 0 ? weightedOpponentAttack / totalWeight : 1.0;

      const attack = avgOppDefense > 0 ? Math.max(0.2, avgScored / (1.35 * avgOppDefense)) : 1.0;
      const defense = avgOppAttack > 0 ? Math.max(0.2, avgConceded / (1.35 * avgOppAttack)) : 1.0;

      nextStrengths[team] = { attack: Number(attack.toFixed(4)), defense: Number(defense.toFixed(4)) };
    });

    Object.keys(nextStrengths).forEach(team => {
      ratings[team].attack_strength = nextStrengths[team].attack;
      ratings[team].defense_strength = nextStrengths[team].defense;
    });
  }

  return ratings;
}

(async () => {
  console.log('=== FORENSIC AUDIT: REAL FINISHED MATCHES & TEAM RATINGS ===');

  // 1. Check all finished matches in database
  const { data: allFinished, error: mErr } = await sb
    .from('matches')
    .select('id, home_team, away_team, home_goals, away_goals, league, status, kickoff')
    .eq('status', 'finished')
    .order('kickoff', { ascending: false });

  if (mErr) {
    console.error('Error fetching matches:', mErr);
    process.exit(1);
  }

  console.log(`Total finished matches in Supabase public.matches: ${allFinished?.length || 0}`);

  // Breakdown by league
  const leagueCounts = {};
  allFinished.forEach(m => {
    leagueCounts[m.league] = (leagueCounts[m.league] || 0) + 1;
  });
  console.log('Finished matches by league:', leagueCounts);

  // Focus on the 6 teams
  const targetTeams = [
    'Nottingham Forest', 'Arsenal',
    'Aston Villa', 'Manchester City',
    'Hull City', 'Brentford'
  ];

  console.log('\n--- Match Counts for Target Teams ---');
  for (const team of targetTeams) {
    const teamMatches = allFinished.filter(m => 
      m.home_team.toLowerCase() === team.toLowerCase() ||
      m.away_team.toLowerCase() === team.toLowerCase() ||
      m.home_team.toLowerCase().includes(team.toLowerCase()) ||
      m.away_team.toLowerCase().includes(team.toLowerCase())
    );
    console.log(`Team: ${team} -> Finished matches: ${teamMatches.length}`);
    if (teamMatches.length > 0) {
      console.log(`  Sample matches:`);
      teamMatches.slice(0, 3).forEach(m => {
        console.log(`    ${m.kickoff.slice(0, 10)} | [${m.league}] ${m.home_team} ${m.home_goals} - ${m.away_goals} ${m.away_team}`);
      });
    }
  }

  // Calculate ratings for EPL matches
  const eplMatches = allFinished.filter(m => 
    m.league && m.league.toLowerCase().includes('premier')
  );
  console.log(`\nCalculating ratings using ${eplMatches.length} Premier League finished matches...`);
  const ratings = calculateTeamRatings(eplMatches);

  console.log('\n--- Computed Dynamic Ratings (EPL cohort) ---');
  for (const team of targetTeams) {
    const r = Object.values(ratings).find(item => 
      item.team_name.toLowerCase() === team.toLowerCase() ||
      item.team_name.toLowerCase().includes(team.toLowerCase())
    );
    if (r) {
      console.log(`Team: ${r.team_name} | Matches: ${r.matches_played} | Attack: ${r.attack_strength} | Defense: ${r.defense_strength}`);
    } else {
      console.log(`Team: ${team} | NO RATING FOUND (0 matches in cohort)`);
    }
  }

  // Inspect why CanonicalOrchestrator.resolveTeamRatings failed:
  // Recall: CanonicalOrchestrator did:
  // 1. supabase.from('team_ratings').select('*')
  // 2. Fallback: supabase.from('matches').select(...).eq('status', 'finished').lt('kickoff', predTimestamp).order('kickoff', { ascending: false }).limit(100)
  // Notice it did NOT filter by league, and had .limit(100)!
  const top100Globally = allFinished.slice(0, 100);
  console.log('\n--- In Top 100 Finished Matches (Global Canonical Fallback) ---');
  for (const team of targetTeams) {
    const inTop100 = top100Globally.filter(m =>
      m.home_team.toLowerCase().includes(team.toLowerCase()) ||
      m.away_team.toLowerCase().includes(team.toLowerCase())
    );
    console.log(`Team: ${team} in top 100: ${inTop100.length} matches`);
  }
})();
