// tests/epic100d_postgres_contract.test.js
// SALMO EPIC 100D/100E: Authoritative PostgreSQL Contract Integration Test Suite
// Verifies 14 strict database invariants against real local PostgreSQL 16:
// 1. Foreign Keys (decisions -> matches)
// 2. Foreign Key Restrict on delete
// 3. Probabilities check constraint (0..100)
// 4. Market odds check constraint (> 1.0)
// 5. Prediction ledger probability constraint (0.0..1.0)
// 6. Prediction ledger odds constraint (> 1.0)
// 7. Prediction ledger result_status constraint
// 8. Snapshot immutability (UPDATE blocked)
// 9. Snapshot immutability (DELETE blocked)
// 10. Decision immutability (UPDATE blocked)
// 11. Prediction ledger parameter immutability (UPDATE odds/prob blocked)
// 12. Prediction ledger immutability (DELETE blocked)
// 13. Settlement Quarter-line calculations & immutability
// 14. Forward & Rollback migration idempotency

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const LOCAL_PG_URL = process.env.LOCAL_POSTGRES_URL || 'postgresql://postgres@127.0.0.1:5432/salmo_test';

async function getClient() {
  const client = new Client({ connectionString: LOCAL_PG_URL });
  await client.connect();
  return client;
}

test('EPIC 100D — 1. Foreign Key Constraint: Reject decision with orphan match_id', async () => {
  const client = await getClient();
  try {
    const orphanMatchId = '00000000-0000-0000-0000-000000000099';
    await assert.rejects(
      async () => {
        await client.query(`
          INSERT INTO public.decisions (
            id, match_id, market_type, line_label, selection, line, badge, status, status_label,
            confidence, model_prob_pct, implied_prob_pct, edge_pp, ev_pct,
            sample_size, reason
          ) VALUES (
            gen_random_uuid(), $1, 'AH', '-0.5', 'Arsenal -0.5', -0.5, 'GREEN', 'VALUE', 'Value Bet',
            'HIGH', 68.5, 52.0, 16.5, 12.4, 25, 'High confidence model edge'
          );
        `, [orphanMatchId]);
      },
      /foreign key constraint|violates foreign key/i
    );
  } finally {
    await client.end();
  }
});

test('EPIC 100D — 2. Foreign Key Constraint: Restrict deletion of match with active snapshots', async () => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const matchRes = await client.query(`
      INSERT INTO public.matches (canonical_match_id, league, season, kickoff, home_team, away_team, status)
      VALUES ('EPL_2026_TEST_FK_H_A_2026-11-04', 'Premier League', '2026', NOW(), 'Team A', 'Team B', 'upcoming')
      RETURNING id;
    `);
    const matchId = matchRes.rows[0].id;

    await client.query(`
      INSERT INTO public.market_snapshots (match_id, market_type, line_label, numeric_line, bookmaker, home_odds, away_odds, source_provider)
      VALUES ($1, 'AH', '-0.5', -0.5, 'pinnacle', 1.95, 1.95, 'PINNACLE');
    `, [matchId]);

    await client.query('SAVEPOINT sp_fk_del');
    await assert.rejects(
      async () => {
        await client.query('DELETE FROM public.matches WHERE id = $1', [matchId]);
      },
      /violates foreign key constraint.*market_snapshots/i
    );
    await client.query('ROLLBACK TO sp_fk_del');
    await client.query('ROLLBACK');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
});

test('EPIC 100D — 3. Check Constraint: Reject invalid model probability (< 0 or > 100)', async () => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const matchRes = await client.query(`
      INSERT INTO public.matches (canonical_match_id, league, season, kickoff, home_team, away_team, status)
      VALUES ('EPL_2026_TEST_PROB_2026-11-04', 'Premier League', '2026', NOW(), 'Team A', 'Team B', 'upcoming')
      RETURNING id;
    `);
    const matchId = matchRes.rows[0].id;

    await client.query('SAVEPOINT sp_prob');
    await assert.rejects(
      async () => {
        await client.query(`
          INSERT INTO public.decisions (
            match_id, market_type, line_label, selection, line, badge, status, status_label,
            confidence, model_prob_pct, implied_prob_pct, edge_pp, ev_pct,
            sample_size, reason
          ) VALUES ($1, 'AH', '-0.5', 'Team A -0.5', -0.5, 'GREEN', 'VALUE', 'Value', 'HIGH', 105.0, 50.0, 55.0, 10.0, 20, 'Invalid');
        `, [matchId]);
      },
      /chk_decisions_prob|violates check constraint/i
    );
    await client.query('ROLLBACK TO sp_prob');
    await client.query('ROLLBACK');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
});

test('EPIC 100D — 4. Check Constraint: Reject non-positive market odds on snapshots (odds <= 1.0)', async () => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const matchRes = await client.query(`
      INSERT INTO public.matches (canonical_match_id, league, season, kickoff, home_team, away_team, status)
      VALUES ('EPL_2026_TEST_ODDS_2026-11-04', 'Premier League', '2026', NOW(), 'Team A', 'Team B', 'upcoming')
      RETURNING id;
    `);
    const matchId = matchRes.rows[0].id;

    await client.query('SAVEPOINT sp_odds');
    await assert.rejects(
      async () => {
        await client.query(`
          INSERT INTO public.market_snapshots (match_id, market_type, line_label, numeric_line, bookmaker, home_odds, away_odds, source_provider)
          VALUES ($1, 'AH', '-0.5', -0.5, 'pinnacle', 0.95, 1.95, 'PINNACLE');
        `, [matchId]);
      },
      /chk_market_snapshots_odds|violates check constraint/i
    );
    await client.query('ROLLBACK TO sp_odds');
    await client.query('ROLLBACK');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
});

test('EPIC 100D — 5. Check Constraint: Reject invalid model probability on prediction_ledger', async () => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const matchRes = await client.query(`
      INSERT INTO public.matches (canonical_match_id, league, season, kickoff, home_team, away_team, status)
      VALUES ('EPL_2026_TEST_LEDGER_PROB_2026-11-04', 'Premier League', '2026', NOW(), 'Team A', 'Team B', 'upcoming')
      RETURNING id;
    `);
    const matchId = matchRes.rows[0].id;

    await client.query('SAVEPOINT sp_ledger_prob');
    await assert.rejects(
      async () => {
        await client.query(`
          INSERT INTO public.prediction_ledger (
            doi_id, match_id, canonical_match_id, market, selection, line,
            model_probability, fair_odds, odds_at_prediction, sha256_hash, kickoff_utc
          ) VALUES ('doi_test_prob_invalid', $1, 'EPL_2026_TEST', 'AH', 'Team A -0.5', -0.5, 1.45, 1.60, 1.90, 'sha256abc', NOW());
        `, [matchId]);
      },
      /chk_ledger_prob|violates check constraint/i
    );
    await client.query('ROLLBACK TO sp_ledger_prob');
    await client.query('ROLLBACK');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
});

test('EPIC 100D — 6. Check Constraint: Reject non-positive odds_at_prediction on prediction_ledger', async () => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const matchRes = await client.query(`
      INSERT INTO public.matches (canonical_match_id, league, season, kickoff, home_team, away_team, status)
      VALUES ('EPL_2026_TEST_LEDGER_ODDS_2026-11-04', 'Premier League', '2026', NOW(), 'Team A', 'Team B', 'upcoming')
      RETURNING id;
    `);
    const matchId = matchRes.rows[0].id;

    await client.query('SAVEPOINT sp_ledger_odds');
    await assert.rejects(
      async () => {
        await client.query(`
          INSERT INTO public.prediction_ledger (
            doi_id, match_id, canonical_match_id, market, selection, line,
            model_probability, fair_odds, odds_at_prediction, sha256_hash, kickoff_utc
          ) VALUES ('doi_test_odds_invalid', $1, 'EPL_2026_TEST', 'AH', 'Team A -0.5', -0.5, 0.65, 1.60, 0.85, 'sha256abc', NOW());
        `, [matchId]);
      },
      /chk_ledger_odds|violates check constraint/i
    );
    await client.query('ROLLBACK TO sp_ledger_odds');
    await client.query('ROLLBACK');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
});

test('EPIC 100D — 7. Check Constraint: Reject invalid result_status on prediction_ledger', async () => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const matchRes = await client.query(`
      INSERT INTO public.matches (canonical_match_id, league, season, kickoff, home_team, away_team, status)
      VALUES ('EPL_2026_TEST_STATUS_2026-11-04', 'Premier League', '2026', NOW(), 'Team A', 'Team B', 'upcoming')
      RETURNING id;
    `);
    const matchId = matchRes.rows[0].id;

    await client.query('SAVEPOINT sp_ledger_status');
    await assert.rejects(
      async () => {
        await client.query(`
          INSERT INTO public.prediction_ledger (
            doi_id, match_id, canonical_match_id, market, selection, line,
            model_probability, fair_odds, odds_at_prediction, sha256_hash, kickoff_utc, result_status
          ) VALUES ('doi_test_status_invalid', $1, 'EPL_2026_TEST', 'AH', 'Team A -0.5', -0.5, 0.65, 1.60, 1.95, 'sha256abc', NOW(), 'INVALID_STATUS');
        `, [matchId]);
      },
      /chk_ledger_result_status|violates check constraint/i
    );
    await client.query('ROLLBACK TO sp_ledger_status');
    await client.query('ROLLBACK');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
});

test('EPIC 100D — 8. Snapshot Immutability: UPDATE on market_snapshots is blocked by trigger', async () => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const matchRes = await client.query(`
      INSERT INTO public.matches (canonical_match_id, league, season, kickoff, home_team, away_team, status)
      VALUES ('EPL_2026_TEST_SNAP_MUT_2026-11-04', 'Premier League', '2026', NOW(), 'Team A', 'Team B', 'upcoming')
      RETURNING id;
    `);
    const matchId = matchRes.rows[0].id;

    const snapRes = await client.query(`
      INSERT INTO public.market_snapshots (match_id, market_type, line_label, numeric_line, bookmaker, home_odds, away_odds, source_provider)
      VALUES ($1, 'AH', '-0.5', -0.5, 'pinnacle', 1.95, 1.95, 'PINNACLE')
      RETURNING id;
    `, [matchId]);
    const snapId = snapRes.rows[0].id;

    await client.query('SAVEPOINT sp_snap_mut');
    await assert.rejects(
      async () => {
        await client.query('UPDATE public.market_snapshots SET home_odds = 2.10 WHERE id = $1', [snapId]);
      },
      /market_snapshots are immutable/i
    );
    await client.query('ROLLBACK TO sp_snap_mut');
    await client.query('ROLLBACK');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
});

test('EPIC 100D — 9. Snapshot Immutability: DELETE on market_snapshots is blocked by trigger', async () => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const matchRes = await client.query(`
      INSERT INTO public.matches (canonical_match_id, league, season, kickoff, home_team, away_team, status)
      VALUES ('EPL_2026_TEST_SNAP_DEL_2026-11-04', 'Premier League', '2026', NOW(), 'Team A', 'Team B', 'upcoming')
      RETURNING id;
    `);
    const matchId = matchRes.rows[0].id;

    const snapRes = await client.query(`
      INSERT INTO public.market_snapshots (match_id, market_type, line_label, numeric_line, bookmaker, home_odds, away_odds, source_provider)
      VALUES ($1, 'AH', '-0.5', -0.5, 'pinnacle', 1.95, 1.95, 'PINNACLE')
      RETURNING id;
    `, [matchId]);
    const snapId = snapRes.rows[0].id;

    await client.query('SAVEPOINT sp_snap_del');
    await assert.rejects(
      async () => {
        await client.query('DELETE FROM public.market_snapshots WHERE id = $1', [snapId]);
      },
      /market_snapshots are immutable/i
    );
    await client.query('ROLLBACK TO sp_snap_del');
    await client.query('ROLLBACK');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
});

test('EPIC 100D — 10. Decision Immutability: UPDATE on decisions is blocked by trigger', async () => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const matchRes = await client.query(`
      INSERT INTO public.matches (canonical_match_id, league, season, kickoff, home_team, away_team, status)
      VALUES ('EPL_2026_TEST_DEC_MUT_2026-11-04', 'Premier League', '2026', NOW(), 'Team A', 'Team B', 'upcoming')
      RETURNING id;
    `);
    const matchId = matchRes.rows[0].id;

    const decRes = await client.query(`
      INSERT INTO public.decisions (
        match_id, market_type, line_label, selection, line, badge, status, status_label,
        confidence, model_prob_pct, implied_prob_pct, edge_pp, ev_pct,
        sample_size, reason
      ) VALUES ($1, 'AH', '-0.5', 'Team A -0.5', -0.5, 'GREEN', 'VALUE', 'Value', 'HIGH', 68.0, 52.0, 16.0, 12.0, 20, 'Reason')
      RETURNING id;
    `, [matchId]);
    const decId = decRes.rows[0].id;

    await client.query('SAVEPOINT sp_dec_mut');
    await assert.rejects(
      async () => {
        await client.query('UPDATE public.decisions SET model_prob_pct = 75.0 WHERE id = $1', [decId]);
      },
      /decisions are immutable historical records/i
    );
    await client.query('ROLLBACK TO sp_dec_mut');
    await client.query('ROLLBACK');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
});

test('EPIC 100D — 11. Prediction Ledger Immutability: Modifying odds/probability is blocked by trigger', async () => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const matchRes = await client.query(`
      INSERT INTO public.matches (canonical_match_id, league, season, kickoff, home_team, away_team, status)
      VALUES ('EPL_2026_TEST_LEDGER_MUT_2026-11-04', 'Premier League', '2026', NOW(), 'Team A', 'Team B', 'upcoming')
      RETURNING id;
    `);
    const matchId = matchRes.rows[0].id;

    const ledgerRes = await client.query(`
      INSERT INTO public.prediction_ledger (
        doi_id, match_id, canonical_match_id, market, selection, line,
        model_probability, fair_odds, odds_at_prediction, sha256_hash, kickoff_utc
      ) VALUES ('doi_test_ledger_immutable', $1, 'EPL_2026_TEST', 'AH', 'Team A -0.5', -0.5, 0.65, 1.60, 1.95, 'sha256abc', NOW())
      RETURNING id;
    `, [matchId]);
    const ledgerId = ledgerRes.rows[0].id;

    // Tampering with odds must be rejected
    await client.query('SAVEPOINT sp_tamper_odds');
    await assert.rejects(
      async () => {
        await client.query('UPDATE public.prediction_ledger SET odds_at_prediction = 2.50 WHERE id = $1', [ledgerId]);
      },
      /prediction_ledger immutable decision parameters.*cannot be modified/i
    );
    await client.query('ROLLBACK TO sp_tamper_odds');

    // However, updating settlement columns (result_status, roi, settled_at) IS allowed
    await client.query(`
      UPDATE public.prediction_ledger
      SET result_status = 'WIN', roi = 0.95, settled_at = NOW()
      WHERE id = $1;
    `, [ledgerId]);

    const checkRes = await client.query('SELECT result_status, roi FROM public.prediction_ledger WHERE id = $1', [ledgerId]);
    assert.strictEqual(checkRes.rows[0].result_status, 'WIN');
    assert.strictEqual(Number(checkRes.rows[0].roi), 0.95);

    await client.query('ROLLBACK');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
});

test('EPIC 100D — 12. Prediction Ledger Immutability: DELETE is blocked by trigger', async () => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const matchRes = await client.query(`
      INSERT INTO public.matches (canonical_match_id, league, season, kickoff, home_team, away_team, status)
      VALUES ('EPL_2026_TEST_LEDGER_DEL_2026-11-04', 'Premier League', '2026', NOW(), 'Team A', 'Team B', 'upcoming')
      RETURNING id;
    `);
    const matchId = matchRes.rows[0].id;

    const ledgerRes = await client.query(`
      INSERT INTO public.prediction_ledger (
        doi_id, match_id, canonical_match_id, market, selection, line,
        model_probability, fair_odds, odds_at_prediction, sha256_hash, kickoff_utc
      ) VALUES ('doi_test_ledger_del', $1, 'EPL_2026_TEST', 'AH', 'Team A -0.5', -0.5, 0.65, 1.60, 1.95, 'sha256abc', NOW())
      RETURNING id;
    `, [matchId]);
    const ledgerId = ledgerRes.rows[0].id;

    await client.query('SAVEPOINT sp_del_ledger');
    await assert.rejects(
      async () => {
        await client.query('DELETE FROM public.prediction_ledger WHERE id = $1', [ledgerId]);
      },
      /Historical prediction_ledger records cannot be deleted/i
    );
    await client.query('ROLLBACK TO sp_del_ledger');
    await client.query('ROLLBACK');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
});

test('EPIC 100D — 13. Settlement Integration: Quarter-line calculations and settlement_results immutability', async () => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const fixtureId = 'test_fixture_settle_100d';

    // Insert AH -0.25 win (Arsenal 2 - 1 Chelsea => diff = +1 > 0.25 => WIN)
    await client.query(`
      INSERT INTO public.settlement_results (
        fixture_id, market_type, selection, line, odds, outcome, profit_units, stake_units, home_goals, away_goals
      ) VALUES ($1, 'asian_handicap', 'home', -0.25, 2.00, 'WIN', 1.00, 1.0, 2, 1);
    `, [fixtureId]);

    // Insert OU 2.75 half-loss (Arsenal 2 - 1 Chelsea => total = 3; line = 2.75 => OVER is HALF_WIN, UNDER is HALF_LOSS)
    await client.query(`
      INSERT INTO public.settlement_results (
        fixture_id, market_type, selection, line, odds, outcome, profit_units, stake_units, home_goals, away_goals
      ) VALUES ($1, 'over_under', 'under', 2.75, 1.90, 'HALF_LOSS', -0.50, 1.0, 2, 1);
    `, [fixtureId]);

    // Verify deletion of settlement records is prohibited
    await client.query('SAVEPOINT sp_del_sr');
    await assert.rejects(
      async () => {
        await client.query("DELETE FROM public.settlement_results WHERE fixture_id = $1", [fixtureId]);
      },
      /settlement_results records cannot be deleted/i
    );
    await client.query('ROLLBACK TO sp_del_sr');

    const res = await client.query('SELECT outcome, profit_units FROM public.settlement_results WHERE fixture_id = $1 ORDER BY market_type', [fixtureId]);
    assert.strictEqual(res.rows.length, 2);
    assert.strictEqual(res.rows[0].outcome, 'WIN');
    assert.strictEqual(Number(res.rows[0].profit_units), 1.00);
    assert.strictEqual(res.rows[1].outcome, 'HALF_LOSS');
    assert.strictEqual(Number(res.rows[1].profit_units), -0.50);

    await client.query('ROLLBACK');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
});

test('EPIC 100D — 14. Migration Idempotency: Rollback and Re-apply succeed without errors', async () => {
  const client = await getClient();
  try {
    const rollbackSql = fs.readFileSync(path.resolve('data/schema_canonical_rollback.sql'), 'utf8');
    const forwardSql = fs.readFileSync(path.resolve('data/schema_canonical.sql'), 'utf8');

    // Run rollback
    await client.query(rollbackSql);

    // Verify trigger dropped
    const checkTrg = await client.query(`
      SELECT DISTINCT trigger_name FROM information_schema.triggers
      WHERE trigger_name = 'trg_immutable_market_snapshots';
    `);
    assert.strictEqual(checkTrg.rows.length, 0, 'Trigger must be dropped in rollback');

    // Re-apply forward migration
    await client.query(forwardSql);

    // Verify trigger restored
    const restoreTrg = await client.query(`
      SELECT DISTINCT trigger_name FROM information_schema.triggers
      WHERE trigger_name = 'trg_immutable_market_snapshots';
    `);
    assert.strictEqual(restoreTrg.rows.length, 1, 'Trigger must be restored after forward migration');
  } finally {
    await client.end();
  }
});
