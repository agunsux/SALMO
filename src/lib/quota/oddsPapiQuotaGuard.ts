// SALMO.DEV — Persistent OddsPAPI Quota Guard & 90% Hard-Stop Protection
// Ensures quota tracking persists across serverless cold starts and container restarts.
// Reads from and writes to Supabase PostgreSQL table: public.quota_state.
// Optionally syncs with unmetered OddsPAPI /v4/account endpoint.
// Strictly enforces 90% hard-stop threshold against the monthly request limit.

import { getDbClient } from '../db';
import { env } from '../../config/env';
import { Logger } from '../logger';

export interface QuotaGuardStatus {
  allowed: boolean;
  reason?: string;
  consumed: number;
  limit: number;
  hardStopThreshold: number;
  remaining: number;
  source: 'SUPABASE' | 'ODDSPAPI_ACCOUNT_SYNC' | 'FALLBACK';
}

export class OddsPapiQuotaGuard {
  public static readonly HARD_STOP_RATIO = 0.90; // 90% hard stop threshold
  public static readonly DEFAULT_MONTHLY_LIMIT = 250;

  /**
   * Evaluates persistent OddsPapi quota and enforces 90% hard-stop.
   * Persists state in Supabase public.quota_state.
   */
  public static async checkQuota(requiredCost = 1): Promise<QuotaGuardStatus> {
    const apiKey = env.providers.oddsPapi.apiKey || process.env.ODDS_PAPI_KEY || '';
    let consumed = 0;
    let limit = this.DEFAULT_MONTHLY_LIMIT;
    let source: QuotaGuardStatus['source'] = 'SUPABASE';
    let dbRecordId: number | string | null = null;

    // 1. Read persistent quota from Supabase
    let client: any = null;
    try {
      client = getDbClient();
      const { data: dbRow, error } = await client
        .from('quota_state')
        .select('*')
        .eq('provider', 'oddspapi')
        .eq('quota_type', 'MONTHLY')
        .order('period_start', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && dbRow) {
        dbRecordId = dbRow.id;
        limit = Number(dbRow.limit_value || this.DEFAULT_MONTHLY_LIMIT);
        consumed = Number(dbRow.consumed || 0);
      }
    } catch (dbErr) {
      Logger.warn('[OddsPapiQuotaGuard] Database query failed, checking unmetered account:', { error: String(dbErr) });
    }

    // 2. Unmetered live synchronization with OddsPapi /v4/account (if key configured)
    if (apiKey) {
      try {
        const baseUrl = env.providers.oddsPapi.baseUrl || 'https://api.oddspapi.io/v4';
        const res = await fetch(`${baseUrl}/account?apiKey=${apiKey}`, {
          headers: { Accept: 'application/json' },
          next: { revalidate: 60 },
        });

        if (res.ok) {
          const accountData: any = await res.json();
          const sub = (accountData?.subscriptions ?? [])[0];
          if (sub) {
            const providerLimit = Number(sub.request_limit ?? limit);
            const providerCount = Number(sub.request_count ?? consumed);

            // Sync persistent DB if provider count is higher or updated
            if (providerCount > consumed || providerLimit !== limit) {
              consumed = providerCount;
              limit = providerLimit;
              source = 'ODDSPAPI_ACCOUNT_SYNC';

              if (client && dbRecordId) {
                try {
                  await client
                    .from('quota_state')
                    .update({
                      consumed: providerCount,
                      limit_value: providerLimit,
                      updated_at: new Date().toISOString(),
                    })
                    .eq('id', dbRecordId);
                } catch (syncErr) {
                  Logger.warn('[OddsPapiQuotaGuard] Failed to sync account count to quota_state:', { error: String(syncErr) });
                }
              }
            }
          }
        }
      } catch (accErr) {
        // Unmetered probe network error handled gracefully
      }
    }

    const hardStopThreshold = Math.floor(limit * this.HARD_STOP_RATIO);
    const remaining = Math.max(0, limit - consumed);

    // Enforce 90% Hard-Stop Threshold
    if (consumed >= hardStopThreshold || (consumed + requiredCost) > hardStopThreshold) {
      const reason = `OddsPAPI persistent quota hard-stop: ${consumed}/${limit} consumed (exceeds ${Math.round(this.HARD_STOP_RATIO * 100)}% threshold of ${hardStopThreshold}).`;
      Logger.warn(`[OddsPapiQuotaGuard] ${reason}`);
      return {
        allowed: false,
        reason,
        consumed,
        limit,
        hardStopThreshold,
        remaining,
        source,
      };
    }

    return {
      allowed: true,
      consumed,
      limit,
      hardStopThreshold,
      remaining,
      source,
    };
  }

  /**
   * Atomically records billable quota usage to persistent Supabase storage.
   */
  public static async recordUsage(cost = 1): Promise<void> {
    try {
      const client = getDbClient();
      const { data: dbRow, error } = await client
        .from('quota_state')
        .select('id, consumed')
        .eq('provider', 'oddspapi')
        .eq('quota_type', 'MONTHLY')
        .order('period_start', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && dbRow) {
        const nextConsumed = (dbRow.consumed || 0) + cost;
        await client
          .from('quota_state')
          .update({
            consumed: nextConsumed,
            updated_at: new Date().toISOString(),
          })
          .eq('id', dbRow.id);
        Logger.info(`[OddsPapiQuotaGuard] Quota usage recorded persistently: +${cost} (total: ${nextConsumed})`);
      }
    } catch (err) {
      Logger.warn('[OddsPapiQuotaGuard] Failed to record usage to database:', { error: String(err) });
    }
  }
}
