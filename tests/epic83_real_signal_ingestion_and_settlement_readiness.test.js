const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ts = require('typescript');

// TypeScript in-memory transpile loader for seamless Node test execution
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

const {
  isPublicPickEligible,
  isCandidateQualifiedWithoutOdds,
  classifyDailyPicksState,
  isQuarantinedSignal,
  QUARANTINED_SIGNAL_IDS,
} = require('../src/lib/eligibility.ts');

const { SettlementEngine } = require('../src/engine/settlement/settlementEngine.ts');
const { QuarterLineSettler } = require('../src/engine/ah/quarterLineSettler.ts');
const { isLeagueMarketProductionEnabled } = require('../src/config/multiLeagueRegistry.ts');

test('EPIC — SALMO Real EPL Signal Ingestion, Quarantine, and Settlement Readiness', async (t) => {
  const refTimeMs = new Date('2026-10-17T03:00:00Z').getTime();

  // 1. Upstream Contract & Candidate Inspection
  await t.test('1. Quarantine Guard excludes all 3 uncalibrated pilot candidates by ID', () => {
    assert.strictEqual(QUARANTINED_SIGNAL_IDS.has('cbd13e02-6be4-4b22-95d9-59c26eb603bc'), true);
    assert.strictEqual(QUARANTINED_SIGNAL_IDS.has('abe7d4da-0659-4869-b560-635a017710f5'), true);
    assert.strictEqual(QUARANTINED_SIGNAL_IDS.has('224dd97b-bee6-4875-b97a-f14d9607995a'), true);

    const candidate1 = {
      id: 'cbd13e02-6be4-4b22-95d9-59c26eb603bc',
      fixture_id: 'ac3b6909-9417-5b2f-beb1-38c6a54b111d',
      league: 'Premier League',
      home_team: 'Nottingham Forest',
      away_team: 'Arsenal',
      kickoff_utc: '2026-10-18T15:30:00Z',
      market_type: 'ASIAN_HANDICAP',
      prediction: 'Nottingham Forest +0.75',
      model_probability: 0.7064,
      market_odds: 2.05,
      verdict: 'LAYAK',
      modelVersion: 'dixon-coles-v1.0',
    };

    const qCheck = isQuarantinedSignal(candidate1);
    assert.strictEqual(qCheck.quarantined, true);
    assert.ok(qCheck.reason.includes('QUARANTINED_SIGNAL_ID'));
    assert.strictEqual(isPublicPickEligible(candidate1, refTimeMs), false, 'Quarantined candidate must NOT be eligible');
  });

  // 2. Uncalibrated Fallback Probability Detection (70.64% trigger)
  await t.test('2. Quarantine Guard catches identical 70.64% default fallback probability artifact', () => {
    const uncalibratedPick = {
      id: 'fresh-candidate-uuid-1234',
      fixture_id: 'fresh-fixture-uuid',
      league: 'Premier League',
      home_team: 'Aston Villa',
      away_team: 'Manchester City',
      kickoff_utc: '2026-10-24T11:30:00Z',
      market_type: 'ASIAN_HANDICAP',
      prediction: 'Aston Villa +0.75',
      model_probability: 0.7064,
      market_odds: 1.93,
      verdict: 'LAYAK',
      modelVersion: 'dixon-coles-v1.0',
    };

    const qCheck = isQuarantinedSignal(uncalibratedPick);
    assert.strictEqual(qCheck.quarantined, true);
    assert.ok(qCheck.reason.includes('UNCALIBRATED_FALLBACK_ARTIFACT'));
    assert.strictEqual(isPublicPickEligible(uncalibratedPick, refTimeMs), false);
  });

  // 3. Competition Mismatch Detection (Hull City in Premier League)
  await t.test('3. Quarantine Guard catches competition mismatch (Hull City under Premier League)', () => {
    const mismatchPick = {
      id: 'any-new-uuid',
      league: 'Premier League',
      home_team: 'Hull City',
      away_team: 'Brentford',
      kickoff_utc: '2026-10-25T14:00:00Z',
      market_type: 'ASIAN_HANDICAP',
      prediction: 'Hull City +0.75',
      model_probability: 0.55,
      market_odds: 1.95,
      verdict: 'LAYAK',
      modelVersion: 'dixon-coles-v1.0',
    };

    const qCheck = isQuarantinedSignal(mismatchPick);
    assert.strictEqual(qCheck.quarantined, true);
    assert.ok(qCheck.reason.includes('COMPETITION_MISMATCH'));
    assert.strictEqual(isPublicPickEligible(mismatchPick, refTimeMs), false);
  });

  // 4. Daily Picks State Classification with Quarantined Records
  await t.test('4. classifyDailyPicksState cleanly excludes quarantined signals and yields NO_QUALIFIED_PICKS', () => {
    const picksWithQuarantine = [
      {
        id: 'cbd13e02-6be4-4b22-95d9-59c26eb603bc',
        league: 'Premier League',
        home_team: 'Nottingham Forest',
        away_team: 'Arsenal',
        kickoff_utc: '2026-10-18T15:30:00Z',
        market_type: 'ASIAN_HANDICAP',
        prediction: 'Nottingham Forest +0.75',
        model_probability: 0.7064,
        market_odds: 2.05,
        verdict: 'LAYAK',
        modelVersion: 'dixon-coles-v1.0',
      },
      {
        id: '224dd97b-bee6-4875-b97a-f14d9607995a',
        league: 'Premier League',
        home_team: 'Hull City',
        away_team: 'Brentford',
        kickoff_utc: '2026-10-25T14:00:00Z',
        market_type: 'ASIAN_HANDICAP',
        prediction: 'Hull City +0.75',
        model_probability: 0.7064,
        market_odds: 1.93,
        verdict: 'LAYAK',
        modelVersion: 'dixon-coles-v1.0',
      },
    ];

    const stateResult = classifyDailyPicksState(picksWithQuarantine, refTimeMs);
    assert.strictEqual(stateResult.state, 'NO_QUALIFIED_PICKS');
    assert.strictEqual(stateResult.eligiblePicks.length, 0);
    assert.strictEqual(stateResult.currentPicks.length, 0, 'Quarantined picks must not be included in current actionable picks');
  });

  // 5. MultiLeague Registry Gate Protection
  await t.test('5. isLeagueMarketProductionEnabled blocks unpromoted SHADOW leagues including Premier League', () => {
    // Under current shadow registry, Premier League is not yet promoted to active production picks
    const isEplAhEnabled = isLeagueMarketProductionEnabled('Premier League', 'AH');
    const isEplOuEnabled = isLeagueMarketProductionEnabled('Premier League', 'OU');
    assert.strictEqual(isEplAhEnabled, false, 'Premier League AH is currently SHADOW (fail-closed)');
    assert.strictEqual(isEplOuEnabled, false, 'Premier League OU is currently SHADOW (fail-closed)');
  });

  // 6. Quarter-Line Asian Handicap Settlement Mathematics
  await t.test('6. Quarter-line AH settlement math correctly computes split outcomes and profit', () => {
    // Case A: Home +0.75 with score 0 - 1 (Home loses by 1 goal)
    // Quarter line +0.75 splits into +0.5 (loss: 0.5 - 1 = -0.5) and +1.0 (push: 1.0 - 1 = 0)
    // Result: HALF_LOSS
    const ahOutcomeHalfLoss = QuarterLineSettler.settle('home', 0.75, 0, 1);
    assert.strictEqual(ahOutcomeHalfLoss, 'HALF_LOSS');
    const profitHalfLoss = QuarterLineSettler.calculateProfit(ahOutcomeHalfLoss, 2.05, 1.0);
    assert.strictEqual(profitHalfLoss, -0.5, 'Half loss on 1 unit stake must be exactly -0.5');

    // Case B: Home +0.75 with score 1 - 1 (Draw)
    // Both +0.5 and +1.0 win! Result: WIN
    const ahOutcomeWin = QuarterLineSettler.settle('home', 0.75, 1, 1);
    assert.strictEqual(ahOutcomeWin, 'WIN');
    const profitWin = QuarterLineSettler.calculateProfit(ahOutcomeWin, 2.05, 1.0);
    assert.strictEqual(profitWin, 1.05, 'Full win on 2.05 odds with 1 unit stake must be exactly +1.05');

    // Case C: Home -0.25 with score 1 - 1 (Draw)
    // Quarter line -0.25 splits into 0 (push) and -0.5 (loss) -> Result: HALF_LOSS
    const ahOutcomeQuarterMinus = QuarterLineSettler.settle('home', -0.25, 1, 1);
    assert.strictEqual(ahOutcomeQuarterMinus, 'HALF_LOSS');
    assert.strictEqual(QuarterLineSettler.calculateProfit(ahOutcomeQuarterMinus, 1.95, 1.0), -0.5);

    // Case D: Over 2.75 with exactly 3 goals
    // Splits into Over 2.5 (win) and Over 3.0 (push) -> Result: HALF_WIN
    const ouOutcomeHalfWin = QuarterLineSettler.settleOverUnder('OVER', 2.75, 3);
    assert.strictEqual(ouOutcomeHalfWin, 'HALF_WIN');
    const profitOuHalfWin = QuarterLineSettler.calculateProfit(ouOutcomeHalfWin, 2.00, 1.0);
    assert.strictEqual(profitOuHalfWin, 0.5, 'Half win on 2.00 odds with 1 unit stake must be (2.0 - 1)/2 = +0.5');
  });

  // 7. Settlement Engine Idempotency & Pending Handling
  await t.test('7. SettlementEngine handles unfinished matches and valid completed settlements deterministically', () => {
    // Unfinished match
    const pendingSettlement = SettlementEngine.settlePosition({
      ledgerPositionId: 'pos_123',
      marketType: 'AH',
      selection: 'Nottingham Forest +0.75',
      line: 0.75,
      oddsTaken: 2.05,
      homeGoals: null,
      awayGoals: null,
      matchStatus: 'SCHEDULED',
    });
    assert.strictEqual(pendingSettlement.settlementStatus, 'PENDING');
    assert.strictEqual(pendingSettlement.profitUnits, 0);
    assert.strictEqual(pendingSettlement.stakeUnits, 0);

    // Finished match
    const completedSettlement = SettlementEngine.settlePosition({
      ledgerPositionId: 'pos_123',
      marketType: 'AH',
      selection: 'Nottingham Forest +0.75',
      line: 0.75,
      oddsTaken: 2.05,
      homeGoals: 1,
      awayGoals: 1,
      matchStatus: 'FINISHED',
      homeTeam: 'Nottingham Forest',
      awayTeam: 'Arsenal',
    });
    assert.strictEqual(completedSettlement.settlementStatus, 'SETTLED');
    assert.strictEqual(completedSettlement.result, 'WIN');
    assert.strictEqual(completedSettlement.profitUnits, 1.05);
    assert.strictEqual(completedSettlement.stakeUnits, 1.0);
  });

  // 8. Cryptographic Immutability of the 4 Protected Historical Ledgers
  await t.test('8. 100% SHA-256 byte immutability of the four protected historical ledgers', () => {
    const EXPECTED_HASHES = {
      'HandicapLab/data/verification/live_prediction_ledger.jsonl': 'F610A1CD6C2BFE01F224BBC10D950EB306E774261B5F72E15D424C4AA3BB5377',
      'SALMO/data/verification/live_prediction_ledger.jsonl': '317FC037A63B811420400EA9DE094092EC7D68B119AD6ABC57743BE12D568527',
      'SALMO/data/verification/all_leagues_research_ledger.jsonl': 'EAE8F364A5393255D276FCA2650056951FB601BA829C1710B26AC673DFFB967B',
      'SALMO/data/research/multi_league_research_predictions.jsonl': '0128616A43968BE5FDDAB76EA5C57DA731955E22B1BF27BCA3F886938187A12F',
    };

    const files = [
      { key: 'HandicapLab/data/verification/live_prediction_ledger.jsonl', path: path.resolve('..', 'HandicapLab', 'data', 'verification', 'live_prediction_ledger.jsonl') },
      { key: 'SALMO/data/verification/live_prediction_ledger.jsonl', path: path.resolve('data', 'verification', 'live_prediction_ledger.jsonl') },
      { key: 'SALMO/data/verification/all_leagues_research_ledger.jsonl', path: path.resolve('data', 'verification', 'all_leagues_research_ledger.jsonl') },
      { key: 'SALMO/data/research/multi_league_research_predictions.jsonl', path: path.resolve('data', 'research', 'multi_league_research_predictions.jsonl') },
    ];

    for (const f of files) {
      assert.ok(fs.existsSync(f.path), `File must exist: ${f.path}`);
      const buf = fs.readFileSync(f.path);
      const hash = crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
      assert.strictEqual(hash, EXPECTED_HASHES[f.key], `SHA-256 mismatch on ${f.key}`);
    }
  });
});
