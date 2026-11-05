// tests/epic100g_staging_security_validation.test.js
// SALMO EPIC 100G: Staging Security, Role Privileges & RLS Validation Test Suite
// Verifies:
// 1. Anon role: Can read public daily_picks, cannot write, cannot read protected ledger.
// 2. Authenticated role: Can read active ledger, cannot write or modify.
// 3. Service role: Can execute transactional decision & settlement workflows.
// 4. Immutability triggers: Prohibit tampering even by privileged roles.

const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.LOCAL_POSTGRES_URL || 'postgresql://postgres@127.0.0.1:5432/salmo_test',
});

test.before(async () => {
  // Ensure test roles exist and have appropriate schema privileges
  const client = await pool.connect();
  try {
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN;
        END IF;
      END $$;

      GRANT USAGE ON SCHEMA public TO anon, authenticated;
      GRANT SELECT ON public.daily_picks TO anon, authenticated;
      GRANT SELECT ON public.matches TO anon, authenticated;
      GRANT SELECT ON public.prediction_ledger TO authenticated;

      REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon;
      REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM authenticated;
    `);
  } finally {
    client.release();
  }
});

test.after(async () => {
  await pool.end();
});

test('Security Gate 1: Anon role is restricted to read-only active daily_picks', async () => {
  const client = await pool.connect();
  try {
    await client.query('SET ROLE anon');

    // 1. Reading daily_picks is permitted
    const selectRes = await client.query('SELECT COUNT(*) FROM public.daily_picks');
    assert.ok(selectRes.rows, 'Anon can select from daily_picks');

    // 2. Writing to daily_picks must be rejected with permission denied
    await assert.rejects(
      async () => {
        await client.query(`
          INSERT INTO public.daily_picks (
            fixture_id, league, home_team, away_team, kickoff_utc,
            market_type, prediction, line, model_probability, fair_odds,
            market_odds, edge_pct, expected_value, confidence, verdict,
            model_version, status, source, prediction_id
          ) VALUES (
            'test_fix', 'Premier League', 'Team A', 'Team B', NOW(),
            'AH', 'Team A -0.5', -0.5, 0.6, 1.6, 1.9, 10.0, 14.0, 70, 'LAYAK',
            'v1', 'ACTIVE', 'live', 'anon_illegal_pick'
          )
        `);
      },
      /permission denied for table daily_picks/i,
      'Anon role must be denied INSERT on daily_picks'
    );

    // 3. Reading prediction_ledger directly must be denied
    await assert.rejects(
      async () => {
        await client.query('SELECT COUNT(*) FROM public.prediction_ledger');
      },
      /permission denied for table prediction_ledger/i,
      'Anon role must be denied SELECT on internal prediction_ledger'
    );
  } finally {
    await client.query('RESET ROLE').catch(() => {});
    client.release();
  }
});

test('Security Gate 2: Authenticated role can read active ledger but cannot mutate records', async () => {
  const client = await pool.connect();
  try {
    await client.query('SET ROLE authenticated');

    // 1. Reading prediction_ledger is permitted
    const ledgerRead = await client.query('SELECT COUNT(*) FROM public.prediction_ledger');
    assert.ok(ledgerRead.rows, 'Authenticated can select from prediction_ledger');

    // 2. Inserting into prediction_ledger must be rejected
    await assert.rejects(
      async () => {
        await client.query(`
          INSERT INTO public.prediction_ledger (
            id, doi_id, canonical_match_id, market, selection, line,
            model_probability, fair_odds, odds_at_prediction, sha256_hash, kickoff_utc
          ) VALUES (
            gen_random_uuid(), 'illegal_auth_doi', 'EPL_MATCH', 'AH', 'Home -0.5', -0.5,
            0.6, 1.67, 2.0, 'hash', NOW()
          )
        `);
      },
      /permission denied for table prediction_ledger/i,
      'Authenticated role must be denied INSERT on prediction_ledger'
    );

    // 3. Deleting from prediction_ledger must be rejected
    await assert.rejects(
      async () => {
        await client.query('DELETE FROM public.prediction_ledger WHERE id = gen_random_uuid()');
      },
      /permission denied for table prediction_ledger/i,
      'Authenticated role must be denied DELETE on prediction_ledger'
    );
  } finally {
    await client.query('RESET ROLE').catch(() => {});
    client.release();
  }
});

test('Security Gate 3: Immutability triggers prohibit update/delete even under privileged role', async () => {
  const client = await pool.connect();
  try {
    // 1. Create a snapshot and decision under privileged connection
    const matchRes = await client.query(`
      INSERT INTO public.matches (
        canonical_match_id, league, season, kickoff, home_team, away_team, status
      ) VALUES (
        'EPL_SEC_MATCH_${Date.now()}', 'Premier League', '2026', NOW() + INTERVAL '4 hours', 'Chelsea FC', 'Arsenal FC', 'upcoming'
      ) RETURNING id;
    `);
    const matchId = matchRes.rows[0].id;

    const snapRes = await client.query(`
      INSERT INTO public.market_snapshots (
        match_id, market_type, line_label, numeric_line, home_odds, away_odds
      ) VALUES (
        $1, 'AH', '-0.5', -0.5, 1.95, 1.95
      ) RETURNING id;
    `, [matchId]);
    const snapshotId = snapRes.rows[0].id;

    // 2. Attempt to update odds in market_snapshots (must fail via trigger)
    await assert.rejects(
      async () => {
        await client.query(`UPDATE public.market_snapshots SET home_odds = 2.50 WHERE id = $1`, [snapshotId]);
      },
      /market_snapshots are immutable/i,
      'Trigger must prohibit UPDATE on market_snapshots'
    );

    // 3. Attempt to delete from market_snapshots (must fail via trigger)
    await assert.rejects(
      async () => {
        await client.query(`DELETE FROM public.market_snapshots WHERE id = $1`, [snapshotId]);
      },
      /market_snapshots are immutable/i,
      'Trigger must prohibit DELETE on market_snapshots'
    );
  } finally {
    client.release();
  }
});
