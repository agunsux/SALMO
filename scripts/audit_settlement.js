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

const { QuarterLineSettler } = require('../src/engine/ah/quarterLineSettler.ts');

const livePath = path.resolve('data/verification/live_prediction_ledger.jsonl');
const liveRecords = fs.readFileSync(livePath, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));

const settled = liveRecords.filter(r => r.settlement === 'SETTLED' || r.settlementStatus === 'SETTLED');
console.log('Total Settled in live ledger:', settled.length);

let totalStake = 0;
let totalProfit = 0;
let agreeCount = 0;

console.log('\n--- INDEPENDENT SETTLEMENT RECALCULATION ---');
settled.forEach((r, idx) => {
  const homeGoals = r.homeGoals;
  const awayGoals = r.awayGoals;
  const line = r.line;
  const market = r.market;
  const odds = r.oddsAtPrediction || r.marketOdds;
  const recordedResult = r.result;
  const recordedProfit = r.profitUnits ?? r.profitLoss;
  const selection = r.selection;

  let calcResult = null;
  let calcProfit = null;

  if (market === 'AH') {
    calcResult = QuarterLineSettler.settle('home', line, homeGoals, awayGoals);
    calcProfit = QuarterLineSettler.calculateProfit(calcResult, odds, 1.0);
  } else if (market === 'OU') {
    const isOver = selection.toLowerCase().startsWith('over');
    calcResult = QuarterLineSettler.settleOverUnder(isOver ? 'OVER' : 'UNDER', line, homeGoals + awayGoals);
    calcProfit = QuarterLineSettler.calculateProfit(calcResult, odds, 1.0);
  }

  const resultMatches = calcResult === recordedResult;
  const profitMatches = Math.abs(calcProfit - recordedProfit) < 1e-4;
  if (resultMatches && profitMatches) agreeCount++;

  totalStake += (r.stakeUnits ?? 1.0);
  totalProfit += calcProfit;

  console.log(`[${idx+1}] ID: ${r.predictionId} | Match: ${r.canonicalMatchId} | Score: ${homeGoals}-${awayGoals} | Market: ${market} ${line} | Odds: ${odds} | Verdict: ${r.verdict}`);
  console.log(`     Recorded: outcome=${recordedResult}, profit=${recordedProfit}`);
  console.log(`     Computed: outcome=${calcResult}, profit=${calcProfit} | Match: ${resultMatches && profitMatches ? 'VERIFIED' : 'MISMATCH'}`);
});

console.log('\n--- AGGREGATE SUMMARY ---');
console.log(`Agreements: ${agreeCount}/${settled.length}`);
console.log(`Total Turnover (Stake): ${totalStake.toFixed(2)} units`);
console.log(`Total Net Profit: ${totalProfit.toFixed(3)} units`);
console.log(`Overall ROI: ${((totalProfit / totalStake) * 100).toFixed(2)}%`);

const publicPicks = settled.filter(r => r.verdict === 'LAYAK');
console.log('\n--- PUBLIC PICKS (LAYAK) ---');
console.log(`Count: ${publicPicks.length}`);
let pubStake = 0, pubProfit = 0;
publicPicks.forEach(p => {
  pubStake += (p.stakeUnits ?? 1.0);
  pubProfit += (p.profitUnits ?? p.profitLoss);
  console.log(`  ID: ${p.predictionId} | Sel: ${p.selection} | Line: ${p.line} | Score: ${p.matchScore} | Result: ${p.result} | Profit: ${p.profitUnits ?? p.profitLoss}`);
});
console.log(`Public Picks Turnover: ${pubStake.toFixed(2)} units`);
console.log(`Public Picks Net Profit: ${pubProfit.toFixed(3)} units`);
console.log(`Public Picks ROI: ${((pubProfit / pubStake) * 100).toFixed(2)}%`);
