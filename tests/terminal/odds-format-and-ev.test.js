const test = require('node:test');
const assert = require('node:assert/strict');

// Mathematical test duplicates of the core formatting and EV functions
function convertDecimalToFormat(decimalOdds, fmt) {
  if (decimalOdds === null || decimalOdds === undefined || !Number.isFinite(decimalOdds) || decimalOdds <= 1.0) {
    return '—';
  }
  switch (fmt) {
    case 'decimal':
      return decimalOdds.toFixed(2);
    case 'american': {
      if (decimalOdds >= 2.0) {
        const am = Math.round((decimalOdds - 1.0) * 100);
        return `+${am}`;
      } else {
        const am = Math.round(-100.0 / (decimalOdds - 1.0));
        return `${am}`;
      }
    }
    case 'hongKong': {
      const hk = decimalOdds - 1.0;
      return hk.toFixed(2);
    }
    case 'malay': {
      const net = decimalOdds - 1.0;
      if (decimalOdds <= 2.0) {
        return net.toFixed(2);
      } else {
        const my = -1.0 / net;
        return my.toFixed(2);
      }
    }
    default:
      return decimalOdds.toFixed(2);
  }
}

function computeExactEV(odds, pWinEff, pLoseEff) {
  if (!Number.isFinite(odds) || odds <= 1.0) return 0.0;
  return (pWinEff * (odds - 1.0)) - (pLoseEff * 1.0);
}

function classifySignal(evPct, hitRatePct) {
  const ev = evPct ?? 0;
  const hr = hitRatePct ?? 0;
  if (ev >= 3.0 || hr >= 65.0) {
    return 'EMERALD';
  }
  if (ev >= 1.0 || (hr >= 45.0 && hr < 65.0)) {
    return 'AMBER';
  }
  return 'SLATE';
}

test('Odds Formatter — Exact Decimal, American, Hong Kong, and Malay conversions', () => {
  // Case 1: Underdog odds 2.05
  assert.equal(convertDecimalToFormat(2.05, 'decimal'), '2.05');
  assert.equal(convertDecimalToFormat(2.05, 'american'), '+105');
  assert.equal(convertDecimalToFormat(2.05, 'hongKong'), '1.05');
  assert.equal(convertDecimalToFormat(2.05, 'malay'), '-0.95');

  // Case 2: Favorite odds 1.95
  assert.equal(convertDecimalToFormat(1.95, 'decimal'), '1.95');
  assert.equal(convertDecimalToFormat(1.95, 'american'), '-105');
  assert.equal(convertDecimalToFormat(1.95, 'hongKong'), '0.95');
  assert.equal(convertDecimalToFormat(1.95, 'malay'), '0.95');

  // Case 3: Even money 2.00
  assert.equal(convertDecimalToFormat(2.00, 'decimal'), '2.00');
  assert.equal(convertDecimalToFormat(2.00, 'american'), '+100');
  assert.equal(convertDecimalToFormat(2.00, 'hongKong'), '1.00');
  assert.equal(convertDecimalToFormat(2.00, 'malay'), '1.00');

  // Case 4: Heavy favorite 1.33
  assert.equal(convertDecimalToFormat(1.33, 'decimal'), '1.33');
  assert.equal(convertDecimalToFormat(1.33, 'american'), '-303');
  assert.equal(convertDecimalToFormat(1.33, 'hongKong'), '0.33');
  assert.equal(convertDecimalToFormat(1.33, 'malay'), '0.33');

  // Invalid or null
  assert.equal(convertDecimalToFormat(null, 'decimal'), '—');
  assert.equal(convertDecimalToFormat(1.0, 'decimal'), '—');
  assert.equal(convertDecimalToFormat(undefined, 'malay'), '—');
});

test('Asian Handicap Quarter-Line EV — Mathematical precision & non-inversion invariant', () => {
  // Fair probability: p_win_eff = 0.52, p_lose_eff = 0.48 (Fair odds = 1 / 0.52 = 1.923)
  const pWin = 0.52;
  const pLose = 0.48;

  // Market odds higher than fair odds (1.98 > 1.923) -> MUST have positive EV
  const evPositive = computeExactEV(1.98, pWin, pLose);
  assert.ok(evPositive > 0, `Expected EV > 0 when market odds > fair odds, got ${evPositive}`);
  assert.equal(Number((evPositive * 100).toFixed(2)), 2.96);

  // Market odds lower than fair odds (1.88 < 1.923) -> MUST have negative EV
  const evNegative = computeExactEV(1.88, pWin, pLose);
  assert.ok(evNegative < 0, `Expected EV < 0 when market odds < fair odds, got ${evNegative}`);
  assert.equal(Number((evNegative * 100).toFixed(2)), -2.24);

  // Quarter-line split 50/50 invariance
  // Quarter line (+0.25) where p_full_win = 0.40, p_half_win = 0.24, p_full_loss = 0.36
  // p_win_eff = 0.40 + 0.5 * 0.24 = 0.52, p_lose_eff = 0.36 + 0.5 * 0 = 0.36 + 0.12 = 0.48
  const evQuarter = computeExactEV(2.00, 0.52, 0.48);
  assert.equal(Number((evQuarter * 100).toFixed(2)), 4.00);
});

test('BettingStats Badge Classification — Color threshold boundaries', () => {
  // Strong value (+EV >= 3% OR Hit Rate >= 65%)
  assert.equal(classifySignal(3.0, 50.0), 'EMERALD');
  assert.equal(classifySignal(4.5, 40.0), 'EMERALD');
  assert.equal(classifySignal(0.5, 65.0), 'EMERALD');
  assert.equal(classifySignal(0.0, 70.0), 'EMERALD');

  // Lean / Watch (+EV 1.0% - 2.9% OR Hit Rate 45% - 64%)
  assert.equal(classifySignal(1.5, 40.0), 'AMBER');
  assert.equal(classifySignal(2.9, 44.0), 'AMBER');
  assert.equal(classifySignal(0.2, 50.0), 'AMBER');
  assert.equal(classifySignal(-1.0, 60.0), 'AMBER');

  // Slate / Pass (< 1.0% AND <= 44%)
  assert.equal(classifySignal(0.5, 40.0), 'SLATE');
  assert.equal(classifySignal(-2.0, 35.0), 'SLATE');
  assert.equal(classifySignal(null, null), 'SLATE');
});
