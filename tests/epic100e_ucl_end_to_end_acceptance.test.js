// tests/epic100e_ucl_end_to_end_acceptance.test.js
// SALMO EPIC 100E: Authoritative End-to-End UCL Lifecycle Acceptance Test
// Validates full pipeline from fixture ingestion to decision, ledger, immutability, settlement, and ROI aggregation.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');
const { Pool } = require('pg');

const origResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (typeof request === 'string' && request.startsWith('@/')) {
    const mapped = path.join(process.cwd(), 'src', request.slice(2));
    for (const candidate of [mapped, `${mapped}.ts`, `${mapped}.tsx`, path.join(mapped, 'index.ts')]) {
      if (fs.existsSync(candidate)) {
        return origResolveFilename.call(this, candidate, parent, isMain, options);
      }
    }
  }
  return origResolveFilename.call(this, request, parent, isMain, options);
};

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

const { FixtureRepository } = require('../src/repositories/fixtureRepository');
const { OddsSnapshotRepository } = require('../src/repositories/oddsSnapshotRepository');
const { DecisionLedgerRepository } = require('../src/repositories/decisionLedgerRepository');
const { SettlementRepository } = require('../src/repositories/settlementRepository');
const { PerformanceRepository } = require('../src/repositories/performanceRepository');

const LOCAL_PG_URL = process.env.LOCAL_POSTGRES_URL || 'postgresql://postgres@127.0.0.1:5432/salmo_test';
const pool = new Pool({ connectionString: LOCAL_PG_URL });

let dbAvailable = false;
test.before(async () => {
  try {
    const client = await pool.connect();
    dbAvailable = true;
    client.release();
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      console.log('Skipping epic100e UCL test: local PostgreSQL not available');
      return;
    }
    throw err;
  }
});

test('EPIC 100E — Complete End-to-End UEFA Champions League (UCL) Simulation', async (t) => {
  if (!dbAvailable) {
    t.skip('Local PostgreSQL offline');
    return;
  }
  try {
    const timestamp = Date.now();
    const canonicalUclId = `UCL_2026_RMD_MCI_${timestamp}`;
    const kickoffIso = new Date(Date.now() + 8 * 3600 * 1000).toISOString(); // 8 hours in future (within 24h window)

    // -------------------------------------------------------------------------
    // STAGE 1: Canonical Fixture Ingestion (UCL: Real Madrid vs Manchester City)
    // -------------------------------------------------------------------------
    const fixture = await FixtureRepository.saveFixture({
      canonicalMatchId: canonicalUclId,
      league: 'UEFA Champions League',
      season: '2026',
      kickoff: kickoffIso,
      homeTeam: 'Real Madrid',
      awayTeam: 'Manchester City',
      status: 'upcoming',
    });

    assert.ok(fixture.id, 'Fixture must receive database UUID');
    assert.strictEqual(fixture.canonical_match_id, canonicalUclId);
    assert.strictEqual(fixture.status, 'upcoming');

    // -------------------------------------------------------------------------
    // STAGE 2: Market Odds Snapshot Capture (Pinnacle Sharp Reference)
    // -------------------------------------------------------------------------
    const oddsCapturedAt = new Date().toISOString();
    const snapshot = await OddsSnapshotRepository.captureSnapshot({
      matchId: fixture.id,
      marketType: 'AH',
      lineLabel: '-0.25',
      numericLine: -0.25,
      bookmaker: 'pinnacle',
      homeOdds: 2.05,
      awayOdds: 1.88,
      sourceProvider: 'PINNACLE',
      capturedAt: oddsCapturedAt,
    });

    assert.ok(snapshot.id, 'Market snapshot must receive database UUID');
    assert.strictEqual(Number(snapshot.home_odds), 2.05);
    assert.strictEqual(Number(snapshot.away_odds), 1.88);

    // -------------------------------------------------------------------------
    // STAGE 3: Model Prediction & ConfidenceGate Evaluation
    // Dixon-Coles model predicts Real Madrid -0.25 cover prob = 56.5% (fair odds 1.77)
    // vs Pinnacle market odds 2.05 (+15.8% EV, Net Edge +7.7 pp)
    // -------------------------------------------------------------------------
    const decisionPayload = {
      fixtureId: fixture.id,
      canonicalMatchId: canonicalUclId,
      league: 'UEFA Champions League',
      season: '2026',
      homeTeam: 'Real Madrid',
      awayTeam: 'Manchester City',
      kickoffUtc: kickoffIso,
      marketType: 'AH',
      selection: 'Real Madrid -0.25',
      line: -0.25,
      modelProbability: 0.565,
      fairOdds: 1.77,
      pinnacleOdds: {
        sideOdds: 2.05,
        oppositeOdds: 1.88,
        timestampUtc: oddsCapturedAt,
      },
      sampleSizeHome: 12,
      sampleSizeAway: 12,
      modelVersion: 'dixon-coles-ucl-v1.0',
      featureVersion: 'ratings-ucl-v1.0',
      xgHome: 1.65,
      xgAway: 1.25,
      rho: -0.05,
      isPublicPick: true,
      skipLeagueRegistryCheck: true, // Simulation test run
    };

    // -------------------------------------------------------------------------
    // STAGE 4: Atomic Decision-to-Ledger 11-Step Transaction
    // -------------------------------------------------------------------------
    const decisionResult = await DecisionLedgerRepository.executeAtomicDecisionWorkflow(decisionPayload);

    assert.strictEqual(decisionResult.success, true, 'Atomic transaction must succeed');
    assert.strictEqual(decisionResult.committed, true, 'Transaction must be committed');
    assert.strictEqual(decisionResult.idempotentDuplicate, false, 'Must be original entry, not duplicate');
    assert.ok(decisionResult.decisionId, 'Must have decisionId');
    assert.ok(decisionResult.ledgerId, 'Must have ledgerId');
    assert.ok(decisionResult.doiId, 'Must have doiId');
    assert.ok(decisionResult.provenanceHash, 'Must have provenance sha256 checksum');

    // Verify database state: Decision record persisted
    const decQuery = await pool.query('SELECT * FROM public.decisions WHERE id = $1', [decisionResult.decisionId]);
    assert.strictEqual(decQuery.rows.length, 1);
    const decisionRow = decQuery.rows[0];
    assert.strictEqual(decisionRow.selection, 'Real Madrid -0.25');
    assert.strictEqual(decisionRow.badge, 'GREEN');
    assert.strictEqual(decisionRow.status, 'VALUE');

    // Verify database state: Prediction ledger position persisted
    const ledQuery = await pool.query('SELECT * FROM public.prediction_ledger WHERE id = $1', [decisionResult.ledgerId]);
    assert.strictEqual(ledQuery.rows.length, 1);
    const ledgerRow = ledQuery.rows[0];
    assert.strictEqual(ledgerRow.competition_id, 2); // UCL provider league ID = 2
    assert.strictEqual(ledgerRow.result_status, 'pending');
    assert.strictEqual(Number(ledgerRow.odds_at_prediction), 2.05);

    // -------------------------------------------------------------------------
    // STAGE 5: Strict Database Immutability Invariant Verification
    // -------------------------------------------------------------------------
    // Attempt 5a: Tamper with decision odds/probability -> Blocked by trigger
    await assert.rejects(
      async () => {
        await pool.query('UPDATE public.decisions SET model_prob_pct = 99.9 WHERE id = $1', [decisionResult.decisionId]);
      },
      /immutable|prohibited/i,
      'Decision updates must be blocked by immutability trigger'
    );

    // Attempt 5b: Tamper with prediction_ledger odds_at_prediction -> Blocked by trigger
    await assert.rejects(
      async () => {
        await pool.query('UPDATE public.prediction_ledger SET odds_at_prediction = 3.50 WHERE id = $1', [decisionResult.ledgerId]);
      },
      /immutable|cannot be modified/i,
      'Ledger odds modification must be blocked by immutability trigger'
    );

    // Attempt 5c: Delete historical prediction_ledger record -> Blocked by trigger
    await assert.rejects(
      async () => {
        await pool.query('DELETE FROM public.prediction_ledger WHERE id = $1', [decisionResult.ledgerId]);
      },
      /cannot be deleted/i,
      'Ledger record deletion must be blocked by immutability trigger'
    );

    // Attempt 5d: Re-submitting the exact same pick concurrently -> Handled idempotently
    const duplicateResult = await DecisionLedgerRepository.executeAtomicDecisionWorkflow(decisionPayload);
    assert.strictEqual(duplicateResult.success, true);
    assert.strictEqual(duplicateResult.idempotentDuplicate, true, 'Duplicate must be identified idempotently');

    // -------------------------------------------------------------------------
    // STAGE 6: Match Completion & Score Finalization (Real Madrid 2 - 1 Man City)
    // Score: Home 2, Away 1 (Goal diff = +1)
    // AH line is -0.25: net diff = +1 - (-0.25) = +0.75 > +0.25 => Full WIN
    // Payout = 1.0 * (2.05 - 1.0) = +1.05 profit units
    // -------------------------------------------------------------------------
    const settlementResult = await SettlementRepository.settleFixture({
      fixtureId: fixture.id,
      homeGoals: 2,
      awayGoals: 1,
      matchStatus: 'finished',
    });

    assert.strictEqual(settlementResult.settledCount, 1, 'Exactly one position must be settled');
    const posSettlement = settlementResult.settlements[0];
    assert.strictEqual(posSettlement.outcome, 'WIN');
    assert.strictEqual(Number(posSettlement.profitUnits.toFixed(2)), 1.05);

    // Verify settlement_results table row
    const srCheck = await pool.query('SELECT * FROM public.settlement_results WHERE fixture_id = $1', [fixture.id]);
    assert.strictEqual(srCheck.rows.length, 1);
    assert.strictEqual(srCheck.rows[0].outcome, 'WIN');
    assert.strictEqual(Number(Number(srCheck.rows[0].profit_units).toFixed(2)), 1.05);
    assert.strictEqual(srCheck.rows[0].home_goals, 2);
    assert.strictEqual(srCheck.rows[0].away_goals, 1);

    // Verify prediction_ledger updated to SETTLED
    const settledLedger = (await pool.query('SELECT * FROM public.prediction_ledger WHERE id = $1', [decisionResult.ledgerId])).rows[0];
    assert.strictEqual(settledLedger.result_status, 'WIN');
    assert.strictEqual(settledLedger.status, 'SETTLED');
    assert.strictEqual(Number(Number(settledLedger.profit_loss).toFixed(2)), 1.05);
    assert.ok(settledLedger.settled_at !== null);

    // -------------------------------------------------------------------------
    // STAGE 7: Performance Analytics Reconciliation
    // Verify that PerformanceRepository accurately reflects this settled decision
    // -------------------------------------------------------------------------
    const perfAnalytics = await PerformanceRepository.calculatePerformance();

    assert.ok(perfAnalytics.headline.totalDecisions >= 1, 'Total decisions must be at least 1');
    assert.ok(perfAnalytics.headline.settledDecisions >= 1, 'Settled decisions must be at least 1');
    assert.ok(perfAnalytics.headline.wins >= 1, 'Wins count must include this WIN');
    assert.ok(perfAnalytics.headline.netProfitUnits > 0, 'Net P/L must be positive');
    assert.ok(perfAnalytics.headline.roiPct !== null && perfAnalytics.headline.roiPct > 0, 'ROI must be positive');

    // Verify segmentation by UCL
    const uclSegment = perfAnalytics.byCompetition['UCL'];
    assert.ok(uclSegment, 'UCL competition breakdown must be present');
    assert.ok(uclSegment.totalDecisions >= 1);
    assert.ok(uclSegment.netProfitUnits > 0);

    // Verify Brier score and Drawdown calculations are populated
    assert.ok(typeof perfAnalytics.headline.brierScore === 'number' && perfAnalytics.headline.brierScore >= 0);
    assert.ok(typeof perfAnalytics.headline.maxDrawdownUnits === 'number' && perfAnalytics.headline.maxDrawdownUnits >= 0);

    // -------------------------------------------------------------------------
    // STAGE 8: Settlement Immutability Verification
    // -------------------------------------------------------------------------
    await assert.rejects(
      async () => {
        await pool.query('DELETE FROM public.settlement_results WHERE fixture_id = $1', [fixture.id]);
      },
      /cannot be deleted/i,
      'Settlement results must be strictly immutable and cannot be deleted'
    );
  } finally {
    if (dbAvailable) {
      await pool.end();
      const { closePostgresPool } = require('../src/repositories/dbClient');
      await closePostgresPool();
    }
  }
});
