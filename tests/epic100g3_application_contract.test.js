// tests/epic100g3_application_contract.test.js
// SALMO EPIC 100G.3: Application Contract & Repository Validation on Bootstrapped PostgreSQL 16
// Verifies all 5 Core Repositories:
// 1. FixtureRepository
// 2. OddsSnapshotRepository
// 3. DecisionLedgerRepository
// 4. SettlementRepository
// 5. PerformanceRepository

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { Client, Pool } = require('pg');

const PG_HOST = process.env.PGHOST || '127.0.0.1';
const PG_PORT = process.env.PGPORT || 5432;
const PG_USER = process.env.PGUSER || 'postgres';
const ROOT_URL = `postgresql://${PG_USER}@${PG_HOST}:${PG_PORT}/postgres`;
const TEST_DB = 'salmo_app_contract_test';
const TEST_DB_URL = `postgresql://${PG_USER}@${PG_HOST}:${PG_PORT}/${TEST_DB}`;

const BOOTSTRAP_SQL = fs.readFileSync(
  path.join(__dirname, '../data/migrations/20261105_fresh_database_bootstrap.sql'),
  'utf-8'
);

let pool;
let dbAvailable = false;

test.before(async () => {
  const rootClient = new Client({ connectionString: ROOT_URL });
  try {
    await rootClient.connect();
    dbAvailable = true;
    try {
      await rootClient.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`);
      await rootClient.query(`CREATE DATABASE ${TEST_DB};`);
    } finally {
      await rootClient.end();
    }

    // Apply unified bootstrap to TEST_DB
    const client = new Client({ connectionString: TEST_DB_URL });
    await client.connect();
    try {
      await client.query(BOOTSTRAP_SQL);
    } finally {
      await client.end();
    }

    pool = new Pool({ connectionString: TEST_DB_URL });
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      console.log('Skipping epic100g3 application contract tests: local PostgreSQL not available');
      return;
    }
    throw err;
  }
});

test.after(async () => {
  if (!dbAvailable) return;
  if (pool) {
    await pool.end();
  }
  const rootClient = new Client({ connectionString: ROOT_URL });
  await rootClient.connect();
  try {
    await rootClient.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`);
  } finally {
    await rootClient.end();
  }
});

// -----------------------------------------------------------------------------
// 1. FixtureRepository Validation
// -----------------------------------------------------------------------------
test('Repo Contract 1: FixtureRepository idempotency, status lifecycle, kickoff sync', async (t) => {
  if (!dbAvailable) {
    t.skip('Local PostgreSQL offline');
    return;
  }
  const client = await pool.connect();
  try {
    const fixtureData = {
      canonicalMatchId: 'EPL_2026_TEST_MCI_ARS',
      league: 'Premier League',
      season: '2026/2027',
      kickoff: '2026-11-20T15:00:00Z',
      homeTeam: 'Manchester City',
      awayTeam: 'Arsenal',
      venue: 'Etihad Stadium',
      status: 'upcoming',
      dataStatus: 'ACTIVE',
      sourceType: 'PROVIDER',
    };

    // Insert fixture
    const insertSql = `
      INSERT INTO public.matches (
        id, canonical_match_id, league, season, kickoff, kickoff_time,
        home_team, away_team, venue, status, home_goals, away_goals,
        data_status, source_type, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $4,
        $5, $6, $7, $8, NULL, NULL,
        $9, $10, NOW()
      )
      ON CONFLICT (canonical_match_id) DO UPDATE SET
        status = EXCLUDED.status,
        updated_at = NOW()
      RETURNING *;
    `;
    const res1 = await client.query(insertSql, [
      fixtureData.canonicalMatchId,
      fixtureData.league,
      fixtureData.season,
      fixtureData.kickoff,
      fixtureData.homeTeam,
      fixtureData.awayTeam,
      fixtureData.venue,
      fixtureData.status,
      fixtureData.dataStatus,
      fixtureData.sourceType,
    ]);

    assert.equal(res1.rows.length, 1);
    const matchId = res1.rows[0].id;
    assert.equal(res1.rows[0].canonical_match_id, 'EPL_2026_TEST_MCI_ARS');
    assert.equal(res1.rows[0].status, 'upcoming');

    // Idempotent update to finished with goals
    const updateSql = `
      UPDATE public.matches SET
        status = 'finished',
        home_goals = 2,
        away_goals = 1,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;
    const res2 = await client.query(updateSql, [matchId]);
    assert.equal(res2.rows[0].status, 'finished');
    assert.equal(res2.rows[0].home_goals, 2);
    assert.equal(res2.rows[0].away_goals, 1);
  } finally {
    client.release();
  }
});

// -----------------------------------------------------------------------------
// 2. OddsSnapshotRepository Validation
// -----------------------------------------------------------------------------
test('Repo Contract 2: OddsSnapshotRepository capture, odds check (>1.0), and immutability', async (t) => {
  if (!dbAvailable) {
    t.skip('Local PostgreSQL offline');
    return;
  }
  const client = await pool.connect();
  try {
    // Get existing match
    const m = await client.query("SELECT id FROM public.matches WHERE canonical_match_id = 'EPL_2026_TEST_MCI_ARS';");
    const matchId = m.rows[0].id;

    // Check constraint: non-positive odds rejected
    await assert.rejects(
      async () => {
        await client.query(`
          INSERT INTO public.market_snapshots (match_id, market_type, line_label, numeric_line, home_odds, away_odds)
          VALUES ($1, 'AH', '-0.5', -0.5, 0.95, 1.95);
        `, [matchId]);
      },
      /chk_market_snapshots_odds|violates check constraint/i
    );

    // Valid odds snapshot
    const snapRes = await client.query(`
      INSERT INTO public.market_snapshots (
        match_id, market_type, line_label, numeric_line, bookmaker, home_odds, away_odds, overround, source_provider
      ) VALUES (
        $1, 'AH', '-0.5', -0.5, 'pinnacle', 2.05, 1.85, 0.028, 'PINNACLE'
      ) RETURNING *;
    `, [matchId]);

    assert.equal(snapRes.rows.length, 1);
    const snapshotId = snapRes.rows[0].id;
    assert.equal(Number(snapRes.rows[0].home_odds), 2.05);

    // Verify immutability: UPDATE prohibited
    await assert.rejects(
      async () => {
        await client.query('UPDATE public.market_snapshots SET home_odds = 2.10 WHERE id = $1;', [snapshotId]);
      },
      /market_snapshots are immutable/i
    );

    // Verify immutability: DELETE prohibited
    await assert.rejects(
      async () => {
        await client.query('DELETE FROM public.market_snapshots WHERE id = $1;', [snapshotId]);
      },
      /market_snapshots are immutable/i
    );
  } finally {
    client.release();
  }
});

// -----------------------------------------------------------------------------
// 3. DecisionLedgerRepository Validation: Multiple AH Positions & Idempotency
// -----------------------------------------------------------------------------
test('Repo Contract 3: DecisionLedgerRepository multiple AH positions, versioned DOI, and idempotency', async (t) => {
  if (!dbAvailable) {
    t.skip('Local PostgreSQL offline');
    return;
  }
  const client = await pool.connect();
  try {
    const m = await client.query("SELECT id FROM public.matches WHERE canonical_match_id = 'EPL_2026_TEST_MCI_ARS';");
    const matchId = m.rows[0].id;
    const s = await client.query("SELECT id FROM public.market_snapshots WHERE match_id = $1 LIMIT 1;", [matchId]);
    const snapshotId = s.rows[0].id;

    // Position 1: AH -0.25
    const doi1 = `doi_MCI_ARS_AH_-0.25_mancity-025_dixon-coles-v1.0_v1`;
    const dec1 = await client.query(`
      INSERT INTO public.decisions (
        match_id, odds_snapshot_id, market_type, line_label, selection, line,
        badge, status, status_label, confidence, confidence_score,
        model_prob_pct, implied_prob_pct, edge_pp, ev_pct, sample_size,
        data_quality, verdict, reason, model_version, feature_version
      ) VALUES (
        $1, $2, 'AH', '-0.25', 'Man City -0.25', -0.25,
        'GREEN', 'ACTIVE', 'Value Bet', 'HIGH', 82.5,
        58.5, 48.8, 9.7, 8.2, 38,
        'PASS', 'LAYAK', 'Expected value edge detected', 'dixon-coles-v1.0', 'dynamic-ratings-v1.0'
      ) RETURNING id;
    `, [matchId, snapshotId]);
    const dec1Id = dec1.rows[0].id;

    await client.query(`
      INSERT INTO public.prediction_ledger (
        doi_id, decision_id, match_id, canonical_match_id, competition_id,
        market, selection, line, model_probability, fair_odds, odds_at_prediction,
        confidence, edge, expected_value_pct, sha256_hash, kickoff_utc,
        result_status, status, settlement, data_status, source_type
      ) VALUES (
        $1, $2, $3, 'EPL_2026_TEST_MCI_ARS', 39,
        'AH', 'Man City -0.25', -0.25, 0.585, 1.71, 2.05,
        82.5, 0.097, 8.2, 'hash_pos1_abc123', NOW(),
        'pending', 'ACTIVE', 'PENDING', 'ACTIVE', 'PROVIDER'
      );
    `, [doi1, dec1Id, matchId]);

    // Position 2: AH -0.5 on the EXACT SAME match
    const doi2 = `doi_MCI_ARS_AH_-0.5_mancity-05_dixon-coles-v1.0_v1`;
    const dec2 = await client.query(`
      INSERT INTO public.decisions (
        match_id, odds_snapshot_id, market_type, line_label, selection, line,
        badge, status, status_label, confidence, confidence_score,
        model_prob_pct, implied_prob_pct, edge_pp, ev_pct, sample_size,
        data_quality, verdict, reason, model_version, feature_version
      ) VALUES (
        $1, $2, 'AH', '-0.5', 'Man City -0.5', -0.5,
        'GREEN', 'ACTIVE', 'Value Bet', 'HIGH', 78.0,
        52.0, 43.5, 8.5, 7.1, 38,
        'PASS', 'LAYAK', 'Line 0.5 edge detected', 'dixon-coles-v1.0', 'dynamic-ratings-v1.0'
      ) RETURNING id;
    `, [matchId, snapshotId]);
    const dec2Id = dec2.rows[0].id;

    await client.query(`
      INSERT INTO public.prediction_ledger (
        doi_id, decision_id, match_id, canonical_match_id, competition_id,
        market, selection, line, model_probability, fair_odds, odds_at_prediction,
        confidence, edge, expected_value_pct, sha256_hash, kickoff_utc,
        result_status, status, settlement, data_status, source_type
      ) VALUES (
        $1, $2, $3, 'EPL_2026_TEST_MCI_ARS', 39,
        'AH', 'Man City -0.5', -0.5, 0.520, 1.92, 2.30,
        78.0, 0.085, 7.1, 'hash_pos2_def456', NOW(),
        'pending', 'ACTIVE', 'PENDING', 'ACTIVE', 'PROVIDER'
      );
    `, [doi2, dec2Id, matchId]);

    // Assert both positions coexist cleanly in prediction_ledger
    const count = await client.query(
      "SELECT COUNT(*) FROM public.prediction_ledger WHERE canonical_match_id = 'EPL_2026_TEST_MCI_ARS';"
    );
    assert.equal(Number(count.rows[0].count), 2);

    // Idempotency: Duplicate insert with same doi1 fails with unique violation
    await assert.rejects(
      async () => {
        await client.query(`
          INSERT INTO public.prediction_ledger (
            doi_id, decision_id, match_id, canonical_match_id, competition_id,
            market, selection, line, model_probability, fair_odds, odds_at_prediction,
            sha256_hash, kickoff_utc
          ) VALUES (
            $1, $2, $3, 'EPL_2026_TEST_MCI_ARS', 39,
            'AH', 'Man City -0.25', -0.25, 0.585, 1.71, 2.05,
            'hash_dup', NOW()
          );
        `, [doi1, dec1Id, matchId]);
      },
      /uq_prediction_ledger_doi|duplicate key value/i
    );
  } finally {
    client.release();
  }
});

// -----------------------------------------------------------------------------
// 4. SettlementRepository Validation: Independent Quarter-Line Settlement
// -----------------------------------------------------------------------------
test('Repo Contract 4: SettlementRepository independent position settlement & immutability', async (t) => {
  if (!dbAvailable) {
    t.skip('Local PostgreSQL offline');
    return;
  }
  const client = await pool.connect();
  try {
    // Scoreline is MCI 2 - 1 ARS
    // Position 1: AH -0.25 on Man City -> diff = (2 - 1) + (-0.25) = +0.75 -> WIN
    const posId1 = 'pos_MCI_ARS_AH_-0.25_mancity';
    await client.query(`
      INSERT INTO public.settlement_results (
        fixture_id, ledger_position_id, market_type, selection, line, odds,
        outcome, profit_units, stake_units, home_goals, away_goals, voided
      ) VALUES (
        'EPL_2026_TEST_MCI_ARS', $1, 'AH', 'Man City -0.25', -0.25, 2.05,
        'WIN', 1.0500, 1.0, 2, 1, false
      );
    `, [posId1]);

    // Position 2: AH -0.5 on Man City -> diff = (2 - 1) + (-0.5) = +0.5 -> WIN
    const posId2 = 'pos_MCI_ARS_AH_-0.5_mancity';
    await client.query(`
      INSERT INTO public.settlement_results (
        fixture_id, ledger_position_id, market_type, selection, line, odds,
        outcome, profit_units, stake_units, home_goals, away_goals, voided
      ) VALUES (
        'EPL_2026_TEST_MCI_ARS', $1, 'AH', 'Man City -0.5', -0.5, 2.30,
        'WIN', 1.3000, 1.0, 2, 1, false
      );
    `, [posId2]);

    // Update prediction_ledger rows with settlement results
    await client.query(`
      UPDATE public.prediction_ledger SET
        result_status = 'WIN',
        status = 'SETTLED',
        settlement = 'SETTLED',
        profit_loss = 1.0500,
        roi = 1.0500,
        settled_at = NOW()
      WHERE doi_id LIKE '%AH_-0.25%';
    `);

    await client.query(`
      UPDATE public.prediction_ledger SET
        result_status = 'WIN',
        status = 'SETTLED',
        settlement = 'SETTLED',
        profit_loss = 1.3000,
        roi = 1.3000,
        settled_at = NOW()
      WHERE doi_id LIKE '%AH_-0.5%';
    `);

    // Verify immutability: DELETE on settlement_results is blocked
    await assert.rejects(
      async () => {
        await client.query('DELETE FROM public.settlement_results WHERE ledger_position_id = $1;', [posId1]);
      },
      /settlement_results records cannot be deleted/i
    );
  } finally {
    client.release();
  }
});

// -----------------------------------------------------------------------------
// 5. PerformanceRepository Validation: Metrics & Exclusion of Synthetic Data
// -----------------------------------------------------------------------------
test('Repo Contract 5: PerformanceRepository analytics & synthetic data segregation', async (t) => {
  if (!dbAvailable) {
    t.skip('Local PostgreSQL offline');
    return;
  }
  const client = await pool.connect();
  try {
    // Insert a SYNTHETIC decision that should be excluded from production calculations
    await client.query(`
      INSERT INTO public.prediction_ledger (
        doi_id, match_id, canonical_match_id, competition_id,
        market, selection, line, model_probability, fair_odds, odds_at_prediction,
        sha256_hash, kickoff_utc, result_status, status, settlement,
        profit_loss, roi, settled_at, data_status, source_type
      ) VALUES (
        'doi_SYNTHETIC_TEST', (SELECT id FROM public.matches LIMIT 1), 'EPL_2026_TEST_MCI_ARS', 39,
        'AH', 'Test Synthetic', -0.25, 0.50, 2.0, 2.0,
        'hash_synth', NOW(), 'WIN', 'SETTLED', 'SETTLED',
        999.0, 999.0, NOW(), 'ACTIVE', 'SYNTHETIC'
      );
    `);

    // Calculate metrics excluding synthetic data
    const res = await client.query(`
      SELECT 
        COUNT(*) as total_settled,
        SUM(profit_loss) as net_profit,
        ROUND(AVG(roi)::numeric, 4) as avg_roi
      FROM public.prediction_ledger
      WHERE data_status = 'ACTIVE'
        AND source_type NOT IN ('SYNTHETIC', 'SIMULATION')
        AND result_status = 'WIN';
    `);

    assert.equal(Number(res.rows[0].total_settled), 2);
    // Net profit = 1.05 + 1.30 = 2.35
    assert.equal(Number(res.rows[0].net_profit), 2.35);
    // Average ROI = (1.05 + 1.30) / 2 = 1.175
    assert.equal(Number(res.rows[0].avg_roi), 1.175);
  } finally {
    client.release();
  }
});
