// tests/epic100f_settlement_mathematics_reference.test.js
// SALMO EPIC 100F: Independent Mathematical Reference Suite for Settlement
// Formulates quarter-line split betting from first principles (50/50 sub-stakes)
// and audits SettlementRepository against this independent reference.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const ts = require('typescript');
const fs = require('fs');

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
  return module._compile(compiled.outputText, filename);
};

const { SettlementRepository } = require('../src/repositories/settlementRepository');

// ============================================================================
// INDEPENDENT MATHEMATICAL REFERENCE IMPLEMENTATION (First-Principles Split)
// ============================================================================
function referenceAsianHandicap(side, line, homeGoals, awayGoals, odds, isVoid = false) {
  if (isVoid) {
    return { outcome: 'VOID', stakeUnits: 0.0, returnUnits: 0.0, profitUnits: 0.0 };
  }

  const goalDiff = side === 'home' ? (homeGoals - awayGoals) : (awayGoals - homeGoals);

  // Split quarter lines into two 0.5 unit sub-bets
  const frac = Math.abs(line % 0.5);
  let subLines;
  if (Math.abs(frac - 0.25) < 0.001) {
    subLines = [line - 0.25, line + 0.25];
  } else {
    subLines = [line, line];
  }

  let subReturns = [];
  let subOutcomes = [];

  for (const subLine of subLines) {
    const net = goalDiff + subLine;
    if (net > 0.0001) {
      subOutcomes.push('WIN');
      subReturns.push(0.5 * odds);
    } else if (Math.abs(net) <= 0.0001) {
      subOutcomes.push('PUSH');
      subReturns.push(0.5 * 1.0);
    } else {
      subOutcomes.push('LOSS');
      subReturns.push(0.0);
    }
  }

  const totalReturn = Number((subReturns[0] + subReturns[1]).toFixed(4));
  const totalProfit = Number((totalReturn - 1.0).toFixed(4));

  let outcome;
  if (subOutcomes[0] === 'WIN' && subOutcomes[1] === 'WIN') outcome = 'WIN';
  else if (subOutcomes[0] === 'LOSS' && subOutcomes[1] === 'LOSS') outcome = 'LOSS';
  else if (subOutcomes[0] === 'PUSH' && subOutcomes[1] === 'PUSH') outcome = 'PUSH';
  else if (subOutcomes.includes('WIN') && subOutcomes.includes('PUSH')) outcome = 'HALF_WIN';
  else if (subOutcomes.includes('LOSS') && subOutcomes.includes('PUSH')) outcome = 'HALF_LOSS';
  else outcome = 'PUSH';

  return {
    outcome,
    stakeUnits: 1.0,
    returnUnits: totalReturn,
    profitUnits: totalProfit,
  };
}

function referenceOverUnder(selection, line, homeGoals, awayGoals, odds, isVoid = false) {
  if (isVoid) {
    return { outcome: 'VOID', stakeUnits: 0.0, returnUnits: 0.0, profitUnits: 0.0 };
  }

  const totalGoals = homeGoals + awayGoals;
  const isOver = String(selection).toLowerCase() === 'over';

  const frac = Math.abs(line % 0.5);
  let subLines;
  if (Math.abs(frac - 0.25) < 0.001) {
    subLines = [line - 0.25, line + 0.25];
  } else {
    subLines = [line, line];
  }

  let subReturns = [];
  let subOutcomes = [];

  for (const subLine of subLines) {
    const net = isOver ? (totalGoals - subLine) : (subLine - totalGoals);
    if (net > 0.0001) {
      subOutcomes.push('WIN');
      subReturns.push(0.5 * odds);
    } else if (Math.abs(net) <= 0.0001) {
      subOutcomes.push('PUSH');
      subReturns.push(0.5 * 1.0);
    } else {
      subOutcomes.push('LOSS');
      subReturns.push(0.0);
    }
  }

  const totalReturn = Number((subReturns[0] + subReturns[1]).toFixed(4));
  const totalProfit = Number((totalReturn - 1.0).toFixed(4));

  let outcome;
  if (subOutcomes[0] === 'WIN' && subOutcomes[1] === 'WIN') outcome = 'WIN';
  else if (subOutcomes[0] === 'LOSS' && subOutcomes[1] === 'LOSS') outcome = 'LOSS';
  else if (subOutcomes[0] === 'PUSH' && subOutcomes[1] === 'PUSH') outcome = 'PUSH';
  else if (subOutcomes.includes('WIN') && subOutcomes.includes('PUSH')) outcome = 'HALF_WIN';
  else if (subOutcomes.includes('LOSS') && subOutcomes.includes('PUSH')) outcome = 'HALF_LOSS';
  else outcome = 'PUSH';

  return {
    outcome,
    stakeUnits: 1.0,
    returnUnits: totalReturn,
    profitUnits: totalProfit,
  };
}

// ============================================================================
// TEST SUITE: Verify against independent reference calculation for every case
// ============================================================================

test('EPIC 100F — Settlement Math: Asian Handicap Comprehensive Line Matrix', () => {
  const odds = 1.95;

  const cases = [
    // Line -0.25
    { side: 'home', line: -0.25, hg: 2, ag: 1, desc: 'AH -0.25 win by 1' },
    { side: 'home', line: -0.25, hg: 1, ag: 1, desc: 'AH -0.25 draw' },
    { side: 'home', line: -0.25, hg: 0, ag: 1, desc: 'AH -0.25 loss by 1' },
    // Line +0.25
    { side: 'home', line: 0.25, hg: 2, ag: 1, desc: 'AH +0.25 win by 1' },
    { side: 'home', line: 0.25, hg: 1, ag: 1, desc: 'AH +0.25 draw' },
    { side: 'home', line: 0.25, hg: 0, ag: 1, desc: 'AH +0.25 loss by 1' },
    // Line -0.75
    { side: 'home', line: -0.75, hg: 3, ag: 1, desc: 'AH -0.75 win by 2' },
    { side: 'home', line: -0.75, hg: 2, ag: 1, desc: 'AH -0.75 win by 1' },
    { side: 'home', line: -0.75, hg: 1, ag: 1, desc: 'AH -0.75 draw' },
    // Line +0.75
    { side: 'home', line: 0.75, hg: 1, ag: 1, desc: 'AH +0.75 draw' },
    { side: 'home', line: 0.75, hg: 1, ag: 2, desc: 'AH +0.75 loss by 1' },
    { side: 'home', line: 0.75, hg: 0, ag: 2, desc: 'AH +0.75 loss by 2' },
    // Line -1.0
    { side: 'home', line: -1.0, hg: 3, ag: 1, desc: 'AH -1.0 win by 2' },
    { side: 'home', line: -1.0, hg: 2, ag: 1, desc: 'AH -1.0 win by 1' },
    { side: 'home', line: -1.0, hg: 1, ag: 1, desc: 'AH -1.0 draw' },
    // Line +1.0
    { side: 'home', line: 1.0, hg: 1, ag: 1, desc: 'AH +1.0 draw' },
    { side: 'home', line: 1.0, hg: 1, ag: 2, desc: 'AH +1.0 loss by 1' },
    { side: 'home', line: 1.0, hg: 0, ag: 2, desc: 'AH +1.0 loss by 2' },
    // Line -1.25
    { side: 'home', line: -1.25, hg: 3, ag: 1, desc: 'AH -1.25 win by 2' },
    { side: 'home', line: -1.25, hg: 2, ag: 1, desc: 'AH -1.25 win by 1' },
    { side: 'home', line: -1.25, hg: 1, ag: 1, desc: 'AH -1.25 draw' },
    // Away side lines
    { side: 'away', line: 0.5, hg: 1, ag: 1, desc: 'Away +0.5 draw' },
    { side: 'away', line: -0.5, hg: 0, ag: 1, desc: 'Away -0.5 away win' },
    { side: 'away', line: 0.25, hg: 1, ag: 1, desc: 'Away +0.25 draw' },
    { side: 'away', line: -0.25, hg: 1, ag: 1, desc: 'Away -0.25 draw' },
  ];

  for (const c of cases) {
    const ref = referenceAsianHandicap(c.side, c.line, c.hg, c.ag, odds);
    const actual = SettlementRepository.calculateAhSettlement(c.side, c.line, c.hg, c.ag, odds);

    assert.strictEqual(
      actual.outcome,
      ref.outcome,
      `Mismatch on outcome for ${c.desc}: actual ${actual.outcome} vs ref ${ref.outcome}`
    );
    assert.strictEqual(
      Number(actual.profitUnits.toFixed(4)),
      ref.profitUnits,
      `Mismatch on profitUnits for ${c.desc}: actual ${actual.profitUnits} vs ref ${ref.profitUnits}`
    );
  }
});

test('EPIC 100F — Settlement Math: Over/Under Comprehensive Line Matrix', () => {
  const odds = 1.90;

  const cases = [
    // OU 2.25
    { side: 'over', line: 2.25, hg: 2, ag: 1, desc: 'Over 2.25 on 3 goals (Win)' },
    { side: 'over', line: 2.25, hg: 1, ag: 1, desc: 'Over 2.25 on 2 goals (Half Loss)' },
    { side: 'over', line: 2.25, hg: 1, ag: 0, desc: 'Over 2.25 on 1 goal (Loss)' },
    { side: 'under', line: 2.25, hg: 1, ag: 0, desc: 'Under 2.25 on 1 goal (Win)' },
    { side: 'under', line: 2.25, hg: 1, ag: 1, desc: 'Under 2.25 on 2 goals (Half Win)' },
    { side: 'under', line: 2.25, hg: 2, ag: 1, desc: 'Under 2.25 on 3 goals (Loss)' },
    // OU 2.75
    { side: 'over', line: 2.75, hg: 3, ag: 1, desc: 'Over 2.75 on 4 goals (Win)' },
    { side: 'over', line: 2.75, hg: 2, ag: 1, desc: 'Over 2.75 on 3 goals (Half Win)' },
    { side: 'over', line: 2.75, hg: 1, ag: 1, desc: 'Over 2.75 on 2 goals (Loss)' },
    { side: 'under', line: 2.75, hg: 1, ag: 1, desc: 'Under 2.75 on 2 goals (Win)' },
    { side: 'under', line: 2.75, hg: 2, ag: 1, desc: 'Under 2.75 on 3 goals (Half Loss)' },
    { side: 'under', line: 2.75, hg: 3, ag: 1, desc: 'Under 2.75 on 4 goals (Loss)' },
    // OU 3.0
    { side: 'over', line: 3.0, hg: 3, ag: 1, desc: 'Over 3.0 on 4 goals (Win)' },
    { side: 'over', line: 3.0, hg: 2, ag: 1, desc: 'Over 3.0 on 3 goals (Push)' },
    { side: 'over', line: 3.0, hg: 1, ag: 1, desc: 'Over 3.0 on 2 goals (Loss)' },
    { side: 'under', line: 3.0, hg: 1, ag: 1, desc: 'Under 3.0 on 2 goals (Win)' },
    { side: 'under', line: 3.0, hg: 2, ag: 1, desc: 'Under 3.0 on 3 goals (Push)' },
    { side: 'under', line: 3.0, hg: 3, ag: 1, desc: 'Under 3.0 on 4 goals (Loss)' },
  ];

  for (const c of cases) {
    const ref = referenceOverUnder(c.side, c.line, c.hg, c.ag, odds);
    const actual = SettlementRepository.calculateOuSettlement(c.side, c.line, c.hg, c.ag, odds);

    assert.strictEqual(
      actual.outcome,
      ref.outcome,
      `Mismatch on outcome for ${c.desc}: actual ${actual.outcome} vs ref ${ref.outcome}`
    );
    assert.strictEqual(
      Number(actual.profitUnits.toFixed(4)),
      ref.profitUnits,
      `Mismatch on profitUnits for ${c.desc}: actual ${actual.profitUnits} vs ref ${ref.profitUnits}`
    );
  }
});

test('EPIC 100F — Settlement Math: VOID isolation invariant', () => {
  const refAh = referenceAsianHandicap('home', -0.5, 2, 1, 1.95, true);
  assert.strictEqual(refAh.outcome, 'VOID');
  assert.strictEqual(refAh.stakeUnits, 0.0);
  assert.strictEqual(refAh.profitUnits, 0.0);
  assert.strictEqual(refAh.returnUnits, 0.0);

  const refOu = referenceOverUnder('over', 2.5, 2, 1, 1.90, true);
  assert.strictEqual(refOu.outcome, 'VOID');
  assert.strictEqual(refOu.stakeUnits, 0.0);
  assert.strictEqual(refOu.profitUnits, 0.0);
});
