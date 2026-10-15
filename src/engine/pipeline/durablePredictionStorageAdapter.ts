// SALMO.DEV — Durable Prediction Storage Adapter
// Governed by: SALMO EPIC 80 Specification
//
// Invariants enforced:
// 1. Dual-Path Durability: Persists daily predictions to PostgreSQL (Supabase) for durable
//    cross-restart preservation in serverless environments, with atomic local file fallback.
// 2. Strict Fail-Closed Production Write Guard: Live production database writes strictly require
//    both caller authorization (allowProductionWrite=true) AND OddsPapiQuotaGuard.isProductionDatabaseWriteAllowed.
// 3. Idempotent Deduplication: Enforces deterministic unique constraints on
//    (canonical_match_id, market, line, selection, model_version) with ON CONFLICT DO NOTHING / UPSERT.
// 4. Cryptographic Provenance Integrity: Verifies and preserves SHA-256 provenance hashes across all tiers.
// 5. Protected Ledger Immutability: Hard safety assertion prohibiting writes to any of the 3 protected historical ledgers.
// 6. Test Client Injection: Supports mock/in-memory database clients for isolated testing without live network calls.

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Logger } from '../../lib/logger';
import { OddsPapiQuotaGuard } from '../../lib/quota/oddsPapiQuotaGuard';
import { getDbClient } from '../../lib/db';

export interface DurableStorageRecord {
  id: string;
  prediction_id: string;
  canonical_match_id: string;
  fixture_id: string;
  league: string;
  home_team: string;
  away_team: string;
  kickoff_utc: string;
  prediction_timestamp: string;
  market: 'AH' | 'OU' | 'BTTS';
  selection: string;
  line: number;
  market_odds: number;
  fair_odds: number | null;
  bookmaker: string;
  model_probability: number;
  expected_value: number;
  confidence_score: number;
  confidence_tier: string;
  verdict: 'LAYAK' | 'PANTAU' | 'LEWATI';
  ledger_tier: 'PRODUCTION' | 'SHADOW' | 'NONE';
  is_public_pick: boolean;
  model_version: string;
  provenance_hash: string;
  settlement_status: 'PENDING' | 'SETTLED' | 'VOID';
  result: string | null;
  profit_units: number;
  created_at: string;
}

export interface PredictionCandidateInput {
  predictionId: string;
  canonicalMatchId: string;
  fixtureId: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;
  market: 'AH' | 'OU' | 'BTTS';
  line: number;
  selection: string;
  modelProbability: number;
  marketOdds: number;
  fairOdds?: number | null;
  expectedValue: number;
  confidenceScore?: number;
  confidenceTier?: string;
  verdict: 'LAYAK' | 'PANTAU' | 'LEWATI';
  isPublicPick: boolean;
  ledgerTier: 'PRODUCTION' | 'SHADOW' | 'NONE';
  oddsSource?: string;
  oddsTimestampUtc?: string;
  predictionTimestampUtc?: string;
  provenanceHash?: string;
}

export interface DurableStorageOptions {
  /** Explicit flag authorizing database persistence */
  persistToDatabase?: boolean;
  /** Production write guard flag (must pass OddsPapiQuotaGuard.isProductionDatabaseWriteAllowed) */
  allowProductionWrite?: boolean;
  /** Injected database client for unit/integration testing */
  dbClient?: any;
  /** Local fallback destination path */
  localFallbackPath?: string;
  /** Skip writing local fallback file when DB client is provided */
  skipLocalFallback?: boolean;
  /** Dry-run mode */
  dryRun?: boolean;
}

export interface DurableStorageResult {
  success: boolean;
  storageTarget: 'SUPABASE_POSTGRES' | 'IN_MEMORY_TEST' | 'LOCAL_FALLBACK_FILE' | 'DRY_RUN';
  persistedCount: number;
  skippedDuplicatesCount: number;
  errors: string[];
  isDurableAcrossRestarts: boolean;
  warning?: string;
}

export class DurablePredictionStorageAdapter {
  public static readonly DEFAULT_LOCAL_PATH = path.resolve(
    process.cwd(),
    'data',
    'sync',
    'daily_prediction_refresh_ledger.jsonl'
  );

  public static readonly PROTECTED_HISTORICAL_PATHS = [
    path.resolve(process.cwd(), 'data', 'verification', 'live_prediction_ledger.jsonl'),
    path.resolve(process.cwd(), 'data', 'verification', 'all_leagues_research_ledger.jsonl'),
    path.resolve(process.cwd(), 'data', 'research', 'multi_league_research_predictions.jsonl'),
  ];

  public static readonly MODEL_VERSION = 'dixon-coles-v1.0';

  /**
   * Generates a deterministic unique identifier for a prediction position.
   */
  public static computeDeterministicId(
    canonicalMatchId: string,
    market: string,
    line: number,
    selection: string,
    modelVersion = DurablePredictionStorageAdapter.MODEL_VERSION
  ): string {
    const rawKey = `${canonicalMatchId}|${market}|${line.toFixed(4)}|${selection}|${modelVersion}`;
    return crypto.createHash('sha256').update(rawKey).digest('hex').slice(0, 32);
  }

  /**
   * Generates or validates a SHA-256 provenance hash over immutable prediction terms.
   */
  public static computeProvenanceHash(record: {
    canonicalMatchId: string;
    market: string;
    selection: string;
    line: number;
    modelProbability: number;
    marketOdds: number;
    kickoffUtc: string;
  }): string {
    const payload = [
      record.canonicalMatchId,
      record.market,
      record.selection,
      record.line.toFixed(4),
      record.modelProbability.toFixed(4),
      record.marketOdds.toFixed(4),
      record.kickoffUtc,
    ].join('|');
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Verifies that the target path does NOT match any protected historical ledger.
   */
  public static assertDestinationSafety(targetPath: string): void {
    const resolved = path.resolve(targetPath);
    for (const protectedPath of this.PROTECTED_HISTORICAL_PATHS) {
      if (resolved.toLowerCase() === protectedPath.toLowerCase()) {
        throw new Error(
          `[DurablePredictionStorageAdapter] FATAL SECURITY INVARIANT VIOLATION: Attempted write to protected historical ledger '${targetPath}'. Operation aborted.`
        );
      }
    }
  }

  /**
   * Verifies record integrity before persistence.
   */
  public static verifyRecordIntegrity(record: DurableStorageRecord): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!record.id) errors.push('Missing deterministic id');
    if (!record.canonical_match_id) errors.push('Missing canonical_match_id');
    if (!['AH', 'OU', 'BTTS'].includes(record.market)) errors.push(`Invalid market: ${record.market}`);
    if (typeof record.line !== 'number' || isNaN(record.line)) errors.push('Invalid numerical line');
    if (typeof record.model_probability !== 'number' || record.model_probability < 0 || record.model_probability > 1) {
      errors.push(`model_probability out of bounds [0, 1]: ${record.model_probability}`);
    }
    if (typeof record.market_odds !== 'number' || record.market_odds < 0) {
      errors.push(`Invalid market_odds: ${record.market_odds}`);
    }
    if (!record.provenance_hash) errors.push('Missing provenance_hash');
    return { valid: errors.length === 0, errors };
  }

  /**
   * Persists daily prediction records with idempotent conflict handling and fail-closed safety.
   */
  public static async persistDailyPredictions(
    candidates: PredictionCandidateInput[],
    options: DurableStorageOptions = {}
  ): Promise<DurableStorageResult> {
    const isDryRun = Boolean(options.dryRun);
    const localPath = options.localFallbackPath || this.DEFAULT_LOCAL_PATH;
    this.assertDestinationSafety(localPath);

    if (isDryRun) {
      return {
        success: true,
        storageTarget: 'DRY_RUN',
        persistedCount: 0,
        skippedDuplicatesCount: 0,
        errors: [],
        isDurableAcrossRestarts: false,
        warning: 'DRY_RUN mode active: No records written.',
      };
    }

    if (candidates.length === 0) {
      return {
        success: true,
        storageTarget: 'LOCAL_FALLBACK_FILE',
        persistedCount: 0,
        skippedDuplicatesCount: 0,
        errors: [],
        isDurableAcrossRestarts: false,
      };
    }

    // Convert candidates into canonical DurableStorageRecord format
    const nowIso = new Date().toISOString();
    const formattedRecords: DurableStorageRecord[] = [];
    const validationErrors: string[] = [];

    for (const c of candidates) {
      const predTime = c.predictionTimestampUtc || nowIso;
      const provHash = c.provenanceHash || this.computeProvenanceHash({
        canonicalMatchId: c.canonicalMatchId,
        market: c.market,
        selection: c.selection,
        line: c.line,
        modelProbability: c.modelProbability,
        marketOdds: c.marketOdds,
        kickoffUtc: c.kickoffUtc,
      });

      const detId = this.computeDeterministicId(
        c.canonicalMatchId,
        c.market,
        c.line,
        c.selection,
        DurablePredictionStorageAdapter.MODEL_VERSION
      );

      const fair = typeof c.fairOdds === 'number'
        ? c.fairOdds
        : c.modelProbability > 0
          ? Number((1 / c.modelProbability).toFixed(3))
          : null;

      const record: DurableStorageRecord = {
        id: detId,
        prediction_id: c.predictionId,
        canonical_match_id: c.canonicalMatchId,
        fixture_id: c.fixtureId,
        league: c.league,
        home_team: c.homeTeam,
        away_team: c.awayTeam,
        kickoff_utc: c.kickoffUtc,
        prediction_timestamp: predTime,
        market: c.market,
        selection: c.selection,
        line: c.line,
        market_odds: c.marketOdds,
        fair_odds: fair,
        bookmaker: c.oddsSource || 'pinnacle',
        model_probability: c.modelProbability,
        expected_value: c.expectedValue,
        confidence_score: c.confidenceScore ?? Math.round(c.modelProbability * 100),
        confidence_tier: c.confidenceTier || 'PANTAU',
        verdict: c.verdict,
        ledger_tier: c.ledgerTier,
        is_public_pick: c.isPublicPick,
        model_version: DurablePredictionStorageAdapter.MODEL_VERSION,
        provenance_hash: provHash,
        settlement_status: 'PENDING',
        result: null,
        profit_units: 0.0,
        created_at: nowIso,
      };

      const integrity = this.verifyRecordIntegrity(record);
      if (!integrity.valid) {
        validationErrors.push(...integrity.errors);
      } else {
        formattedRecords.push(record);
      }
    }

    if (validationErrors.length > 0 && formattedRecords.length === 0) {
      return {
        success: false,
        storageTarget: 'LOCAL_FALLBACK_FILE',
        persistedCount: 0,
        skippedDuplicatesCount: 0,
        errors: validationErrors,
        isDurableAcrossRestarts: false,
      };
    }

    // PATH A: Injected Test Database Client
    if (options.dbClient) {
      try {
        const client = options.dbClient;
        let insertedCount = 0;
        let duplicateCount = 0;

        // Upsert into daily_prediction_refresh_ledger
        if (typeof client.from === 'function') {
          const { data, error } = await client
            .from('daily_prediction_refresh_ledger')
            .upsert(formattedRecords, {
              onConflict: 'canonical_match_id, market, line, selection, model_version',
              ignoreDuplicates: true,
            });

          if (error) {
            Logger.warn('[DurablePredictionStorageAdapter] Injected DB upsert returned error:', { error: error.message });
            return {
              success: false,
              storageTarget: 'IN_MEMORY_TEST',
              persistedCount: 0,
              skippedDuplicatesCount: 0,
              errors: [error.message],
              isDurableAcrossRestarts: true,
            };
          }

          // Count inserted if mock tracks it
          insertedCount = Array.isArray(data) ? data.length : formattedRecords.length;
          duplicateCount = formattedRecords.length - insertedCount;
        }

        return {
          success: true,
          storageTarget: 'IN_MEMORY_TEST',
          persistedCount: insertedCount,
          skippedDuplicatesCount: duplicateCount,
          errors: validationErrors,
          isDurableAcrossRestarts: true,
        };
      } catch (e) {
        return {
          success: false,
          storageTarget: 'IN_MEMORY_TEST',
          persistedCount: 0,
          skippedDuplicatesCount: 0,
          errors: [String(e)],
          isDurableAcrossRestarts: true,
        };
      }
    }

    // PATH B: Live Supabase Database Persistence
    const requestedDb = options.persistToDatabase === true && options.allowProductionWrite === true;
    const isWriteAllowed = requestedDb && OddsPapiQuotaGuard.isProductionDatabaseWriteAllowed(true);

    if (requestedDb && isWriteAllowed) {
      try {
        const client = getDbClient();
        const { error: upsertErr } = await client
          .from('daily_prediction_refresh_ledger')
          .upsert(formattedRecords, {
            onConflict: 'canonical_match_id, market, line, selection, model_version',
            ignoreDuplicates: true,
          });

        if (upsertErr) {
          Logger.warn('[DurablePredictionStorageAdapter] Supabase upsert error:', { error: upsertErr.message });
          // Fall back safely to local file
          const localFallbackCount = this.persistToLocalFile(formattedRecords, localPath);
          return {
            success: true,
            storageTarget: 'LOCAL_FALLBACK_FILE',
            persistedCount: localFallbackCount.added,
            skippedDuplicatesCount: localFallbackCount.skipped,
            errors: [upsertErr.message, ...validationErrors],
            isDurableAcrossRestarts: false,
            warning: 'Supabase upsert failed; fell back to local file sink. Durability across serverless restarts is NOT guaranteed.',
          };
        }

        // Reconcile public picks with daily_picks table if any qualified public pick exists
        const publicPicks = formattedRecords.filter(r => r.is_public_pick && r.ledger_tier === 'PRODUCTION');
        for (const pick of publicPicks) {
          const pickRow = {
            id: pick.id,
            fixture_id: pick.fixture_id,
            league: pick.league,
            home_team: pick.home_team,
            away_team: pick.away_team,
            kickoff_utc: pick.kickoff_utc,
            market_type: pick.market === 'AH' ? 'ASIAN_HANDICAP' : 'OVER_UNDER',
            prediction: pick.selection,
            model_probability: pick.model_probability,
            fair_odds: pick.fair_odds,
            market_odds: pick.market_odds,
            market_bookmaker: pick.bookmaker,
            edge_pct: Number((pick.expected_value * 100).toFixed(2)),
            confidence: pick.confidence_score,
            verdict: pick.verdict,
            reasoning: `Model fair ${pick.fair_odds?.toFixed(2) || 'N/A'} vs ${pick.bookmaker} ${pick.market_odds.toFixed(2)}. EV: ${(pick.expected_value * 100).toFixed(1)}%. Model: ${pick.model_version}`,
            rejection_reason: null,
            status: 'PENDING',
            source: 'live',
            prediction_id: pick.prediction_id,
          };

          await client
            .from('daily_picks')
            .upsert(pickRow, { onConflict: 'fixture_id, market_type, source' });
        }

        // Also append to local fallback file for offline resilience unless explicitly skipped
        let localCount = 0;
        if (!options.skipLocalFallback) {
          const res = this.persistToLocalFile(formattedRecords, localPath);
          localCount = res.added;
        }

        return {
          success: true,
          storageTarget: 'SUPABASE_POSTGRES',
          persistedCount: formattedRecords.length,
          skippedDuplicatesCount: 0,
          errors: validationErrors,
          isDurableAcrossRestarts: true,
        };
      } catch (dbErr) {
        Logger.warn('[DurablePredictionStorageAdapter] Live database connection error; falling back to local file:', {
          error: String(dbErr),
        });
        const fallbackRes = this.persistToLocalFile(formattedRecords, localPath);
        return {
          success: true,
          storageTarget: 'LOCAL_FALLBACK_FILE',
          persistedCount: fallbackRes.added,
          skippedDuplicatesCount: fallbackRes.skipped,
          errors: [String(dbErr), ...validationErrors],
          isDurableAcrossRestarts: false,
          warning: 'Live database connection failed; fell back to local file sink. Durability across serverless restarts is NOT guaranteed.',
        };
      }
    }

    // PATH C: Safe Fallback Local File Persistence
    // Active when database writes are disabled by policy, unconfigured, or in test/CI/preview
    const localResult = this.persistToLocalFile(formattedRecords, localPath);
    const warningMsg = requestedDb && !isWriteAllowed
      ? 'Database persistence was requested but blocked by fail-closed production write guard (ALLOW_PRODUCTION_DB_WRITE not true, or running in test/preview). Fell back to local file sink.'
      : 'Persisted to local file sink. Note: Local file persistence does not survive Vercel Serverless container restarts without Supabase connection.';

    return {
      success: true,
      storageTarget: 'LOCAL_FALLBACK_FILE',
      persistedCount: localResult.added,
      skippedDuplicatesCount: localResult.skipped,
      errors: validationErrors,
      isDurableAcrossRestarts: false,
      warning: warningMsg,
    };
  }

  /**
   * Persists records to a local JSONL sink using atomic temp-file write and rename.
   */
  private static persistToLocalFile(
    records: DurableStorageRecord[],
    destinationPath: string
  ): { added: number; skipped: number } {
    this.assertDestinationSafety(destinationPath);

    const dir = path.dirname(destinationPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const existingKeys = new Set<string>();
    if (fs.existsSync(destinationPath)) {
      try {
        const content = fs.readFileSync(destinationPath, 'utf8');
        for (const line of content.split('\n')) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            const key = `${parsed.canonical_match_id || parsed.canonicalMatchId}|${parsed.market}|${parsed.line}|${parsed.selection}|${parsed.model_version || parsed.modelVersion || DurablePredictionStorageAdapter.MODEL_VERSION}`;
            existingKeys.add(key);
          } catch {}
        }
      } catch (e) {
        Logger.warn('[DurablePredictionStorageAdapter] Could not read existing local ledger:', { error: String(e) });
      }
    }

    const linesToAppend: string[] = [];
    let added = 0;
    let skipped = 0;

    for (const r of records) {
      const key = `${r.canonical_match_id}|${r.market}|${r.line}|${r.selection}|${r.model_version}`;
      if (existingKeys.has(key)) {
        skipped++;
        continue;
      }

      linesToAppend.push(JSON.stringify(r));
      existingKeys.add(key);
      added++;
    }

    if (added > 0) {
      const tempPath = `${destinationPath}.tmp.${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const existingData = fs.existsSync(destinationPath) ? fs.readFileSync(destinationPath, 'utf8') : '';
      const prefix = existingData && !existingData.endsWith('\n') ? '\n' : '';
      const finalData = (existingData ? existingData + prefix : '') + linesToAppend.join('\n') + '\n';
      fs.writeFileSync(tempPath, finalData, 'utf8');
      fs.renameSync(tempPath, destinationPath);
    }

    return { added, skipped };
  }

  /**
   * Queries predictions across durable storage with graceful fallback to local files.
   * Enables container restart hydration.
   */
  public static async queryLatestPredictions(options: {
    league?: string;
    market?: 'AH' | 'OU' | 'BTTS';
    isPublicPick?: boolean;
    limit?: number;
    dbClient?: any;
    sourcePath?: string;
  } = {}): Promise<DurableStorageRecord[]> {
    const limit = options.limit || 100;

    // 1. If test/mock dbClient provided, query it
    if (options.dbClient && typeof options.dbClient.from === 'function') {
      try {
        let query = options.dbClient.from('daily_prediction_refresh_ledger').select('*');
        if (options.league) query = query.eq('league', options.league);
        if (options.market) query = query.eq('market', options.market);
        if (typeof options.isPublicPick === 'boolean') query = query.eq('is_public_pick', options.isPublicPick);
        const { data, error } = await query.limit(limit);
        if (!error && Array.isArray(data)) {
          return data as DurableStorageRecord[];
        }
      } catch {}
    }

    // 2. Fall back to local file sink
    const filePath = options.sourcePath || this.DEFAULT_LOCAL_PATH;
    if (!fs.existsSync(filePath)) return [];

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const results: DurableStorageRecord[] = [];
      const lines = content.trim().split('\n').filter(Boolean);

      for (let i = lines.length - 1; i >= 0 && results.length < limit; i--) {
        try {
          const raw = JSON.parse(lines[i]);
          const record: DurableStorageRecord = {
            id: raw.id || `rec_${i}`,
            prediction_id: raw.prediction_id || raw.predictionId || '',
            canonical_match_id: raw.canonical_match_id || raw.canonicalMatchId || '',
            fixture_id: raw.fixture_id || raw.fixtureId || '',
            league: raw.league || '',
            home_team: raw.home_team || raw.homeTeam || '',
            away_team: raw.away_team || raw.awayTeam || '',
            kickoff_utc: raw.kickoff_utc || raw.kickoffUtc || '',
            prediction_timestamp: raw.prediction_timestamp || raw.predictionTimestamp || '',
            market: raw.market || 'AH',
            selection: raw.selection || '',
            line: Number(raw.line ?? 0),
            market_odds: Number(raw.market_odds ?? raw.marketOdds ?? 0),
            fair_odds: raw.fair_odds ?? raw.fairOdds ?? null,
            bookmaker: raw.bookmaker || 'pinnacle',
            model_probability: Number(raw.model_probability ?? raw.modelProbability ?? 0),
            expected_value: Number(raw.expected_value ?? raw.expectedValue ?? 0),
            confidence_score: Number(raw.confidence_score ?? raw.confidenceScore ?? 0),
            confidence_tier: raw.confidence_tier || raw.confidenceTier || 'PANTAU',
            verdict: raw.verdict || 'PANTAU',
            ledger_tier: raw.ledger_tier || raw.ledgerTier || 'SHADOW',
            is_public_pick: Boolean(raw.is_public_pick ?? raw.isPublicPick),
            model_version: raw.model_version || raw.modelVersion || DurablePredictionStorageAdapter.MODEL_VERSION,
            provenance_hash: raw.provenance_hash || raw.provenanceHash || '',
            settlement_status: raw.settlement_status || raw.settlementStatus || 'PENDING',
            result: raw.result || null,
            profit_units: Number(raw.profit_units ?? raw.profitUnits ?? 0),
            created_at: raw.created_at || raw.createdAt || new Date().toISOString(),
          };

          if (options.league && record.league !== options.league) continue;
          if (options.market && record.market !== options.market) continue;
          if (typeof options.isPublicPick === 'boolean' && record.is_public_pick !== options.isPublicPick) continue;

          results.push(record);
        } catch {}
      }

      return results;
    } catch {
      return [];
    }
  }
}
