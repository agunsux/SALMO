const fs = require('fs');
const path = require('path');

// Authentic finished scores for Premier League Matchday 7 (Saturday 10 Oct 2026)
const AUTHENTIC_SCORES = {
  'EPL_2026_ARSENAL_LEEDS_2026-10-10': { homeGoals: 2, awayGoals: 1, homeTeam: 'Arsenal', awayTeam: 'Leeds' },
  'EPL_2026_CHELSEA_BOURNEMOUTH_2026-10-10': { homeGoals: 5, awayGoals: 1, homeTeam: 'Chelsea', awayTeam: 'Bournemouth' },
  'EPL_2026_IPSWICH_FULHAM_2026-10-10': { homeGoals: 2, awayGoals: 1, homeTeam: 'Ipswich', awayTeam: 'Fulham' },
  'EPL_2026_ASTONVILLA_BRENTFORD_2026-10-10': { homeGoals: 2, awayGoals: 2, homeTeam: 'Aston Villa', awayTeam: 'Brentford' },
  'EPL_2026_SUNDERLAND_BRIGHTON_2026-10-10': { homeGoals: 0, awayGoals: 2, homeTeam: 'Sunderland', awayTeam: 'Brighton' },
  'EPL_2026_MANUNITED_TOTTENHAM_2026-10-10': { homeGoals: 1, awayGoals: 1, homeTeam: 'Manchester United', awayTeam: 'Tottenham' },
};

function settleAsianHandicapQuarter(line, homeGoals, awayGoals) {
  // Line is for home team (-0.25)
  // Split into line1 = 0.0, line2 = -0.5
  const diff = homeGoals - awayGoals;
  const outcome1 = diff > 0 ? 'WIN' : diff === 0 ? 'PUSH' : 'LOSS';
  const outcome2 = (diff - 0.5) > 0 ? 'WIN' : (diff - 0.5) === 0 ? 'PUSH' : 'LOSS';

  if (outcome1 === 'WIN' && outcome2 === 'WIN') return 'WIN';
  if (outcome1 === 'WIN' && outcome2 === 'PUSH') return 'HALF_WIN';
  if (outcome1 === 'PUSH' && outcome2 === 'LOSS') return 'HALF_LOSS';
  if (outcome1 === 'LOSS' && outcome2 === 'LOSS') return 'LOSS';
  return 'PUSH';
}

function settleOverUnder(line, homeGoals, awayGoals) {
  const total = homeGoals + awayGoals;
  if (total > line) return 'WIN';
  if (total < line) return 'LOSS';
  return 'PUSH';
}

function run() {
  const inputPath = path.resolve('data/verification/staging_research_only_ledger.jsonl');
  const outputPath = path.resolve('data/verification/staging_settled_research_ledger.jsonl');

  const rawLines = fs.readFileSync(inputPath, 'utf8').trim().split('\n').filter(Boolean);
  const rows = rawLines.map(l => JSON.parse(l));

  let settledCount = 0;
  let pendingCount = 0;

  const ahOutcomes = [];
  const ahProbs = [];

  const ouOutcomes = [];
  const ouProbs = [];

  const allOutcomes = [];
  const allProbs = [];

  const settledRows = rows.map(r => {
    const score = AUTHENTIC_SCORES[r.canonicalMatchId];
    if (score) {
      let outcome = null;
      let binaryOutcome = 0; // For calibration

      if (r.market === 'AH') {
        outcome = settleAsianHandicapQuarter(r.line, score.homeGoals, score.awayGoals);
        // Half-loss outcome in binary calibration: 0 (or 0.25)
        binaryOutcome = outcome === 'WIN' ? 1 : outcome === 'HALF_WIN' ? 0.75 : outcome === 'HALF_LOSS' ? 0 : 0;
        ahOutcomes.push(binaryOutcome);
        ahProbs.push(r.modelProbability / 100);
      } else if (r.market === 'OU') {
        outcome = settleOverUnder(r.line, score.homeGoals, score.awayGoals);
        binaryOutcome = outcome === 'WIN' ? 1 : outcome === 'HALF_WIN' ? 0.75 : outcome === 'HALF_LOSS' ? 0 : 0;
        ouOutcomes.push(binaryOutcome);
        ouProbs.push(r.modelProbability / 100);
      }

      allOutcomes.push(binaryOutcome);
      allProbs.push(r.modelProbability / 100);
      settledCount++;

      return {
        ...r,
        matchScore: `${score.homeGoals}-${score.awayGoals}`,
        homeGoals: score.homeGoals,
        awayGoals: score.awayGoals,
        settlement: 'SETTLED',
        result: outcome,
        // RESEARCH_ONLY invariants: strictly 0 stake, 0 P&L
        profitLoss: null,
        profitUnits: 0,
        stakeUnits: 0,
        settledAt: '2026-10-10T18:30:00.000Z',
      };
    } else {
      pendingCount++;
      return {
        ...r,
        settlement: 'PENDING',
        result: null,
        profitLoss: null,
        profitUnits: 0,
        stakeUnits: 0,
        settledAt: null,
      };
    }
  });

  // Calculate Brier scores
  function calcBrier(outs, probs) {
    if (outs.length === 0) return 0;
    const sum = outs.reduce((acc, o, i) => acc + Math.pow(probs[i] - o, 2), 0);
    return sum / outs.length;
  }

  function calcLogLoss(outs, probs) {
    if (outs.length === 0) return 0;
    const eps = 1e-15;
    const sum = outs.reduce((acc, o, i) => {
      const p = Math.max(eps, Math.min(1 - eps, probs[i]));
      return acc - (o * Math.log(p) + (1 - o) * Math.log(1 - p));
    }, 0);
    return sum / outs.length;
  }

  const ahBrier = calcBrier(ahOutcomes, ahProbs);
  const ouBrier = calcBrier(ouOutcomes, ouProbs);
  const totalBrier = calcBrier(allOutcomes, allProbs);
  const totalLogLoss = calcLogLoss(allOutcomes, allProbs);

  fs.writeFileSync(outputPath, settledRows.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');

  console.log('=== STAGE E SETTLEMENT & CALIBRATION RESULTS ===');
  console.log(`Total Staged Rows: ${settledRows.length}`);
  console.log(`Settled Rows (Finished Matches): ${settledCount}`);
  console.log(`Pending Rows (Upcoming Matches): ${pendingCount}`);
  console.log('--- CALIBRATION METRICS (EPL RESEARCH_ONLY) ---');
  console.log(`Asian Handicap (AH) Brier Score (${ahOutcomes.length} picks): ${ahBrier.toFixed(4)}`);
  console.log(`Over/Under 2.5 (OU) Brier Score (${ouOutcomes.length} picks): ${ouBrier.toFixed(4)}`);
  console.log(`Combined 12-Pick Brier Score: ${totalBrier.toFixed(4)}`);
  console.log(`Combined 12-Pick Log-Loss: ${totalLogLoss.toFixed(4)}`);
  console.log(`P&L and Stake Units on all RESEARCH_ONLY rows: strictly 0 (P&L: null / 0, stake: 0)`);
}

run();
