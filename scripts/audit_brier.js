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

const { evaluatePositionBrierLegs } = require('../src/engine/performance/brierScoring.ts');

const livePath = path.resolve('data/verification/live_prediction_ledger.jsonl');
const liveRecords = fs.readFileSync(livePath, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
const settled = liveRecords.filter(r => r.settlement === 'SETTLED' || r.settlementStatus === 'SETTLED');

console.log('--- POSITION BRIER SCORING (HOTFIX H8 BINARY NO-PUSH) ---');

const legErrors = [];
const positionErrors = [];

settled.forEach((r, idx) => {
  const brierDecomp = evaluatePositionBrierLegs({
    positionId: r.predictionId,
    canonicalMatchId: r.canonicalMatchId,
    market: r.market,
    line: r.line,
    selection: r.selection,
    homeTeam: r.homeTeam || r.canonicalMatchId.split('_')[2],
    awayTeam: r.awayTeam || r.canonicalMatchId.split('_')[3],
    league: 'Premier League',
    homeGoals: r.homeGoals,
    awayGoals: r.awayGoals,
    fallbackProbability: r.modelProbability > 1 ? r.modelProbability / 100 : r.modelProbability,
  });

  if (!brierDecomp) {
    console.log(`[${idx+1}] FAILED to decompose ${r.predictionId}`);
    return;
  }

  console.log(`[${idx+1}] ID: ${r.predictionId} | Match: ${r.canonicalMatchId} | Market: ${r.market} ${r.line} | Score: ${r.homeGoals}-${r.awayGoals}`);
  console.log(`     Legs: ${brierDecomp.legs.length} total, ${brierDecomp.nResolvedLegs} resolved, ${brierDecomp.nExcludedPushLegs} push`);
  brierDecomp.legs.forEach(l => {
    console.log(`       Leg ${l.legIndex} (line ${l.legLine}): outcome=${l.legOutcome}, pNoPush=${l.pLegNoPush}, binary=${l.binaryOutcome}, sqError=${l.brierSqError}`);
    if (l.brierSqError !== null) {
      legErrors.push(l.brierSqError);
    }
  });

  if (brierDecomp.positionBrierMean !== null) {
    positionErrors.push(brierDecomp.positionBrierMean);
    console.log(`     Position Brier Mean: ${brierDecomp.positionBrierMean}`);
  } else {
    console.log(`     Position Brier Mean: NULL (All pushed)`);
  }
});

console.log('\n--- LEG-LEVEL SUMMARY ---');
console.log('Total Resolved Legs:', legErrors.length);
const meanLeg = legErrors.reduce((a, b) => a + b, 0) / legErrors.length;
const varianceLeg = legErrors.reduce((a, b) => a + Math.pow(b - meanLeg, 2), 0) / (legErrors.length - 1);
const stdDevLeg = Math.sqrt(varianceLeg);
const stdErrLeg = stdDevLeg / Math.sqrt(legErrors.length);
const ci95LowerLeg = meanLeg - 1.96 * stdErrLeg;
const ci95UpperLeg = meanLeg + 1.96 * stdErrLeg;
console.log(`Leg Mean Brier: ${meanLeg.toFixed(4)}`);
console.log(`Leg StdDev: ${stdDevLeg.toFixed(4)}`);
console.log(`Leg StdErr: ${stdErrLeg.toFixed(4)}`);
console.log(`Leg 95% CI: [${ci95LowerLeg.toFixed(4)}, ${ci95UpperLeg.toFixed(4)}]`);

console.log('\n--- POSITION-LEVEL SUMMARY ---');
console.log('Total Resolved Positions:', positionErrors.length);
const meanPos = positionErrors.reduce((a, b) => a + b, 0) / positionErrors.length;
const variancePos = positionErrors.reduce((a, b) => a + Math.pow(b - meanPos, 2), 0) / (positionErrors.length - 1);
const stdDevPos = Math.sqrt(variancePos);
const stdErrPos = stdDevPos / Math.sqrt(positionErrors.length);
const ci95LowerPos = meanPos - 1.96 * stdErrPos;
const ci95UpperPos = meanPos + 1.96 * stdErrPos;
console.log(`Position Mean Brier: ${meanPos.toFixed(4)}`);
console.log(`Position StdDev: ${stdDevPos.toFixed(4)}`);
console.log(`Position StdErr: ${stdErrPos.toFixed(4)}`);
console.log(`Position 95% CI: [${ci95LowerPos.toFixed(4)}, ${ci95UpperPos.toFixed(4)}]`);
console.log('Covers 0.25 (Coin Flip Prior)?', ci95LowerPos <= 0.25 && 0.25 <= ci95UpperPos ? 'YES (Statistically Indistinguishable)' : 'NO');
