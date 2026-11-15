// src/repositories/dbClient.ts
// SALMO.DEV — Unified PostgreSQL Client & Transaction Manager
// Provides direct PostgreSQL connection pooling, transactional execution, and fail-closed safety.

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { Logger } from '../lib/logger';
import { EnvironmentGuard } from '../lib/security/environmentGuard';

let poolInstance: Pool | null = null;

export function getPostgresPool(): Pool {
  if (poolInstance) {
    return poolInstance;
  }

  let connectionString: string;

  // Staging Isolation Guard: In staging mode, explicit STAGING_DATABASE_URL is mandatory
  if (process.env.APP_ENV === 'staging' || (process.env.NODE_ENV as string) === 'staging') {
    if (!process.env.STAGING_DATABASE_URL) {
      throw new Error(
        '[PostgresPool] FATAL: Staging environment requires explicit STAGING_DATABASE_URL. Silent fallback to production or local database is prohibited.'
      );
    }
    EnvironmentGuard.assertProductionWriteBlocked(process.env.STAGING_DATABASE_URL, 'STAGING_CONNECT');
    connectionString = process.env.STAGING_DATABASE_URL;
  } else {
    connectionString =
      process.env.LOCAL_POSTGRES_URL ||
      process.env.DATABASE_URL ||
      'postgresql://postgres@127.0.0.1:5432/salmo_test';
  }

  poolInstance = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  poolInstance.on('error', (err) => {
    Logger.error('[PostgresPool] Unexpected client error on idle client:', { error: String(err) });
  });

  return poolInstance;
}

export async function executeQuery<T extends QueryResultRow = any>(
  text: string,
  params?: any[],
  client?: PoolClient
): Promise<QueryResult<T>> {
  if (client) {
    return client.query<T>(text, params);
  }
  const pool = getPostgresPool();
  return pool.query<T>(text, params);
}

export async function executeTransaction<T>(
  action: (client: PoolClient) => Promise<T>,
  existingClient?: PoolClient
): Promise<T> {
  if (existingClient) {
    // Sub-transaction / savepoint if needed, or join existing
    return action(existingClient);
  }

  const pool = getPostgresPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function closePostgresPool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
  }
}
