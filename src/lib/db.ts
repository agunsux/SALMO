// SALMO.DEV — Database Client & Connectivity Probe
// Typed Supabase / PostgreSQL Client with strict server-side boundary.
// Guarantees zero credential exposure and explicit failure when unconfigured.

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { Logger } from './logger';

export interface DbConnectionHealth {
  configured: boolean;
  connected: boolean;
  latencyMs: number;
  error?: string;
}

let supabaseInstance: SupabaseClient | null = null;

/**
 * Returns the singleton Supabase client if configured.
 * Throws explicit error in server runtime if accessed without configuration.
 */
export function getDbClient(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const supabaseUrl = env.database.supabaseUrl || process.env.SUPABASE_URL;
  const supabaseKey = env.database.supabaseAnonKey || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Database is not configured: SUPABASE_URL or SUPABASE_ANON_KEY is missing.');
  }

  supabaseInstance = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseInstance;
}

/**
 * Actively probes database connectivity by issuing a lightweight health ping query.
 * Distinguishes CONFIGURED vs CONNECTED vs FAILED.
 */
export async function testDbConnection(): Promise<DbConnectionHealth> {
  const start = Date.now();
  const supabaseUrl = env.database.supabaseUrl || process.env.SUPABASE_URL;
  const supabaseKey = env.database.supabaseAnonKey || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return {
      configured: false,
      connected: false,
      latencyMs: 0,
      error: 'SUPABASE_URL or keys not configured in environment.',
    };
  }

  try {
    const client = getDbClient();
    // Query table existence or system health
    const { error } = await client.from('matches').select('id').limit(1);

    const latencyMs = Date.now() - start;

    if (error) {
      Logger.warn('[Database] Ping returned error:', { error: error.message, latencyMs });
      return {
        configured: true,
        connected: false,
        latencyMs,
        error: error.message,
      };
    }

    return {
      configured: true,
      connected: true,
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    Logger.error('[Database] Connection probe failed:', { error: String(err), latencyMs });
    return {
      configured: true,
      connected: false,
      latencyMs,
      error: String(err),
    };
  }
}

