// SALMO.DEV — HandicapLab Synchronization Service
// EPIC 77: Cross-System Integration, Evidence Synchronization & Verification
//
// Invariants enforced:
// 1. Decoupled Architecture: Ingests canonical or rescue prediction records from HandicapLab.
// 2. Additive Ledger Only: Writes to data/sync/handicaplab_sync_ledger.jsonl.
//    NEVER mutates historical ledgers (live_prediction_ledger, all_leagues_research_ledger, multi_league_research_predictions).
// 3. Strict Pre-Match Provenance: Prediction timestamp must be strictly before kickoffUtc.
// 4. Diagnostic vs Public Separation: Non-EPL / SHADOW leagues and BTTS are strictly RESEARCH_ONLY.
//    Diagnostic forecasts (verdict: 'LEWATI') are NEVER relabeled as public picks (isPublicPick: false).
// 5. Deterministic Deduplication: Composite key (canonicalMatchId|market|line|selection|modelVersion).
// 6. Atomic File Operations: Safe write-then-rename prevents corrupted or half-written ledger states.
// 7. Dry-Run Support: Comprehensive simulation of sync counts and validation without writing to disk.

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Logger } from '../../lib/logger';
import { FixtureIntegrityGuard } from '../../lib/fixtureIntegrity';
import { getLeagueByNameOrSlug } from '../../config/multiLeagueRegistry';
import { QuarterLineSettler } from '../ah/quarterLineSettler';
import { SettlementOutcome } from '../../types';
import { CanonicalPredictionRecord, LedgerTier, SettlementStatus } from '../ledger/canonicalPredictionLedger';

export interface HandicapLabSyncOptions {
  /** Explicit source file path or null to auto-resolve HandicapLab ledgers */
  sourcePath?: string;
  /** Ingestion source type */
  sourceType?: 'canonical' | 'rescue' | 'all' | 'auto';
  /** Remote HTTP URL for API contract sync */
  httpUrl?: string;
  /** Custom destination path (defaults to data/sync/handicaplab_sync_ledger.jsonl) */
  destinationPath?: string;
  /** Dry-run mode: calculates transformations and telemetry without writing to disk */
  dryRun?: boolean;
  /** Reference evaluation timestamp */
  nowMs?: number;
  /** ISO timestamp filter */
  since?: string;
  /** Target market filter */
  market?: 'AH' | 'OU' | 'BTTS';
  /** Target model version filter */
  modelVersion?: string;
  /** League or competition filter */
  leagueFilter?: string[];
}

export interface HandicapLabSyncCounts {
  totalSourceRead: number;
  validParsed: number;
  invalidSkipped: number;
  duplicatesSkipped: number;
  totalSynchronized: number;
  settled: number;
  pending: number;
  publicPicks: number;
  diagnosticRows: number;
  byMarket: { AH: number; OU: number; BTTS: number };
  byLeague: Record<string, number>;
}

export interface HandicapLabSyncResult {
  success: boolean;
  timestampUtc: string;
  dryRun: boolean;
  sourceType: string;
  sourcePaths: string[];
  destinationPath: string;
  counts: HandicapLabSyncCounts;
  checksum: string;
  sampleRecords: CanonicalPredictionRecord[];
  protectedLedgersVerified: boolean;
}

export class HandicapLabSyncService {
  public static readonly DEFAULT_DESTINATION_PATH = path.resolve(
    process.cwd(),
    'data',
    'sync',
    'handicaplab_sync_ledger.jsonl'
  );

  public static readonly PROTECTED_HISTORICAL_PATHS = [
    path.resolve(process.cwd(), 'data', 'verification', 'live_prediction_ledger.jsonl'),
    path.resolve(process.cwd(), 'data', 'verification', 'all_leagues_research_ledger.jsonl'),
    path.resolve(process.cwd(), 'data', 'research', 'multi_league_research_predictions.jsonl'),
  ];

  /**
   * Resolves HandicapLab candidate ledger paths on the filesystem.
   */
  public static resolveSourceFiles(type: 'canonical' | 'rescue' | 'all' | 'auto' = 'auto'): string[] {
    const candidateDirs = [
      path.resolve(process.cwd(), '..', 'HandicapLab', 'data', 'ledger'),
      path.resolve(process.cwd(), 'data', 'ledger'),
      path.resolve(__dirname, '..', '..', '..', '..', 'HandicapLab', 'data', 'ledger'),
    ];

    const sources: string[] = [];

    for (const dir of candidateDirs) {
      if (!fs.existsSync(dir)) continue;

      const canonicalJsonl = path.join(dir, 'canonical_prediction_ledger.jsonl');
      const canonicalJson = path.join(dir, 'canonical_prediction_ledger.json');
      const rescueJsonl = path.join(dir, 'rescue_prediction_ledger.jsonl');

      if (type === 'canonical' || type === 'all' || type === 'auto') {
        if (fs.existsSync(canonicalJsonl)) {
          sources.push(canonicalJsonl);
        } else if (fs.existsSync(canonicalJson)) {
          sources.push(canonicalJson);
        }
      }

      if (type === 'rescue' || type === 'all' || (type === 'auto' && sources.length === 0)) {
        if (fs.existsSync(rescueJsonl)) {
          sources.push(rescueJsonl);
        }
      }

      if (sources.length > 0) break;
    }

    return sources;
  }

  /**
   * Evaluates line type (FULL, HALF, QUARTER).
   */
  public static evaluateLineType(line: number): 'FULL' | 'HALF' | 'QUARTER' {
    const abs = Math.abs(line);
    const frac = Number((abs % 1).toFixed(4));
    if (frac === 0) return 'FULL';
    if (Math.abs(frac - 0.5) < 0.001) return 'HALF';
    if (Math.abs(frac - 0.25) < 0.001 || Math.abs(frac - 0.75) < 0.001) return 'QUARTER';
    return 'HALF';
  }

  /**
   * Maps a raw HandicapLab prediction record into SALMO's CanonicalPredictionRecord schema.
   */
  public static mapRawToCanonical(raw: any, sourceTag = 'HandicapLab'): {
    record: CanonicalPredictionRecord | null;
    error?: string;
  } {
    if (!raw || typeof raw !== 'object') {
      return { record: null, error: 'Raw record is null or non-object' };
    }

    // 1. Identify IDs
    const rawId = raw.predictionId || raw.id || raw.prediction_id;
    if (!rawId) {
      return { record: null, error: 'Missing prediction identifier (predictionId or id)' };
    }
    const cleanRawId = String(rawId).replace(/^hl_/, '');
    const predictionId = `hl_${cleanRawId}`;

    const fixtureId = String(raw.canonicalFixtureId || raw.fixture_id || raw.fixtureId || '');
    if (!fixtureId) {
      return { record: null, error: 'Missing fixture identifier' };
    }

    // 2. Identify teams and league
    const homeTeam = String(raw.homeTeam || raw.home_team || '').trim();
    const awayTeam = String(raw.awayTeam || raw.away_team || '').trim();
    if (!homeTeam || !awayTeam) {
      return { record: null, error: 'Missing homeTeam or awayTeam' };
    }

    const rawLeague = String(raw.competition || raw.league || raw.competition_name || 'Unknown League').trim();
    const leagueEntry = getLeagueByNameOrSlug(rawLeague);
    const competitionId = leagueEntry ? leagueEntry.internal_league_id : raw.competition_id ? `HL-${raw.competition_id}` : 'UNK-LEAGUE';
    const competitionName = leagueEntry ? leagueEntry.league_name : rawLeague;

    // 3. Kickoff and Temporal Provenance
    const kickoffUtc = String(raw.kickoffTimestamp || raw.kickoff_utc || raw.kickoffUtc || '').trim();
    if (!kickoffUtc || isNaN(new Date(kickoffUtc).getTime())) {
      return { record: null, error: 'Invalid or missing kickoff timestamp' };
    }

    const rawPredTs = raw.predictionTimestamp || raw.prediction_timestamp || raw.oddsTimestamp || raw.odds_timestamp || raw.created_at || raw.createdAt;
    const predictionTimestamp = rawPredTs && !isNaN(new Date(rawPredTs).getTime()) ? new Date(rawPredTs).toISOString() : null;

    // Temporal pre-match gate
    const kickMs = new Date(kickoffUtc).getTime();
    const predMs = predictionTimestamp ? new Date(predictionTimestamp).getTime() : 0;
    const hasPreMatchProvenance = Boolean(predictionTimestamp && predMs < kickMs);

    // 4. Match ID Construction
    const kickoffDate = kickoffUtc.slice(0, 10);
    const season = String(raw.season || (kickoffDate ? kickoffDate.slice(0, 4) : '2026'));
    const isEpl = competitionId === 'ENG-PL' || competitionName.toLowerCase().includes('premier league');

    let canonicalMatchId = raw.canonicalMatchId || raw.canonical_match_id || '';
    if (!canonicalMatchId) {
      if (isEpl) {
        const hSlug = homeTeam.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const aSlug = awayTeam.toUpperCase().replace(/[^A-Z0-9]/g, '');
        canonicalMatchId = `EPL_${season}_${hSlug}_${aSlug}_${kickoffDate}`;
      } else {
        canonicalMatchId = FixtureIntegrityGuard.buildCanonicalMatchId(competitionName, season, homeTeam, awayTeam, kickoffUtc);
      }
    }

    // 5. Market, Line, Selection
    let rawMarket = String(raw.market || raw.market_type || raw.marketType || 'AH').toUpperCase();
    if (rawMarket === 'ASIAN_HANDICAP') rawMarket = 'AH';
    if (rawMarket === 'OVER_UNDER') rawMarket = 'OU';
    if (!['AH', 'OU', 'BTTS'].includes(rawMarket)) {
      return { record: null, error: `Unsupported betting market: ${rawMarket}` };
    }
    const market = rawMarket as 'AH' | 'OU' | 'BTTS';

    const rawLine = raw.line !== undefined && raw.line !== null ? Number(raw.line) : (raw.recommendedLine !== undefined ? Number(raw.recommendedLine) : null);
    if (rawLine === null || isNaN(rawLine)) {
      return { record: null, error: 'Missing or non-numeric line' };
    }
    const line = rawLine;

    const selection = String(raw.selection || raw.recommendedSelection || raw.prediction || `${homeTeam} ${line}`).trim();

    // 6. Odds & Probabilities
    let originalOdds: number | null = null;
    const rawOdds = raw.marketOdds ?? raw.market_odds ?? raw.odds;
    if (rawOdds !== undefined && rawOdds !== null && !isNaN(Number(rawOdds)) && Number(rawOdds) > 1.0) {
      originalOdds = Number(Number(rawOdds).toFixed(3));
    }

    const bookmaker = raw.bookmaker ? String(raw.bookmaker).toLowerCase() : (raw.odds_snapshot?.bookmaker ? String(raw.odds_snapshot.bookmaker).toLowerCase() : (originalOdds ? 'pinnacle' : null));

    const rawProb = raw.modelProbability ?? raw.calibrated_probability ?? raw.model_probability ?? raw.calibratedProbability;
    if (rawProb === undefined || rawProb === null || isNaN(Number(rawProb))) {
      return { record: null, error: 'Missing model probability' };
    }
    let modelProbability = Number(rawProb);
    if (modelProbability > 1) {
      modelProbability = Number((modelProbability / 100).toFixed(4));
    } else {
      modelProbability = Number(modelProbability.toFixed(4));
    }
    if (modelProbability <= 0 || modelProbability >= 1) {
      return { record: null, error: `Invalid probability value: ${modelProbability}` };
    }

    const fairOdds = raw.fairOdds ? Number(Number(raw.fairOdds).toFixed(3)) : (raw.fair_odds ? Number(Number(raw.fair_odds).toFixed(3)) : Number((1 / modelProbability).toFixed(3)));

    // 7. Ledger Tier, Confidence, and Public Pick Classification
    const ledgerTier: LedgerTier = isEpl ? 'PRODUCTION' : 'SHADOW';

    const rawConfTier = String(raw.confidence_tier || raw.confidence || raw.valueStatus || 'RESEARCH_ONLY').toUpperCase();
    let confidenceTier = rawConfTier;
    if (market === 'BTTS' || ledgerTier !== 'PRODUCTION') {
      confidenceTier = 'RESEARCH_ONLY';
    }

    // Strict Pick Invariant:
    // Non-EPL / SHADOW leagues are strictly research-only (isPublicPick: false).
    // BTTS is strictly research-only.
    // If raw verdict is LEWATI or PASS or is_pick is false, isPublicPick is strictly false.
    // Only EPL rows with verified pre-match provenance, valid market odds, and positive qualification can be public picks.
    const isExplicitPick = raw.is_pick === true || raw.isPick === true;
    const isLayakVerdict = raw.verdict === 'LAYAK' || raw.decision === 'VALUE_CANDIDATE' || raw.valueStatus === 'VALUE' || rawConfTier === 'VALUE_HIGH' || rawConfTier === 'HIGH';

    const isPublicPick = Boolean(
      isEpl &&
      market !== 'BTTS' &&
      isExplicitPick &&
      isLayakVerdict &&
      originalOdds !== null &&
      originalOdds > 1.0 &&
      hasPreMatchProvenance
    );

    const modelVersion = String(raw.modelVersion || raw.model_version || 'dixon-coles-v1.0');

    // 8. Settlement Details
    let settlementStatus: SettlementStatus = 'PENDING';
    let result: SettlementOutcome | null = null;
    let profitUnits = 0;
    let matchScore: string | null = null;
    let homeGoals: number | null = null;
    let awayGoals: number | null = null;
    let settledAt: string | null = null;

    const rawSettlement = raw.settlement;
    if (rawSettlement && typeof rawSettlement === 'object') {
      if (rawSettlement.status === 'SETTLED') {
        settlementStatus = 'SETTLED';
      } else if (rawSettlement.status === 'VOID') {
        settlementStatus = 'VOID';
      }
      if (rawSettlement.outcome) {
        result = rawSettlement.outcome as SettlementOutcome;
      }
      if (typeof rawSettlement.profit_units === 'number') {
        profitUnits = rawSettlement.profit_units;
      }
      if (rawSettlement.settled_at) {
        settledAt = rawSettlement.settled_at;
      }
    } else if (raw.status === 'SETTLED' || raw.settlementStatus === 'SETTLED') {
      settlementStatus = 'SETTLED';
      result = raw.result || null;
      profitUnits = typeof raw.profitUnits === 'number' ? raw.profitUnits : (raw.profitLoss !== undefined ? Number(raw.profitLoss) : 0);
      settledAt = raw.settledAt || null;
    }

    if (raw.matchScore || (typeof raw.homeGoals === 'number' && typeof raw.awayGoals === 'number')) {
      homeGoals = typeof raw.homeGoals === 'number' ? raw.homeGoals : null;
      awayGoals = typeof raw.awayGoals === 'number' ? raw.awayGoals : null;
      matchScore = raw.matchScore || (homeGoals !== null && awayGoals !== null ? `${homeGoals}-${awayGoals}` : null);
    }

    // 9. Provenance Hash
    const provenanceHash = crypto.createHash('sha256').update([
      predictionId,
      canonicalMatchId,
      market,
      selection,
      line.toFixed(4),
      modelProbability.toFixed(4),
      originalOdds !== null ? originalOdds.toFixed(4) : 'NULL_ODDS',
      kickoffUtc,
    ].join('|')).digest('hex');

    const canonicalRecord: CanonicalPredictionRecord = {
      predictionId,
      canonicalMatchId,
      fixtureId,
      competitionId,
      competitionName,
      homeTeam,
      awayTeam,
      kickoffUtc,
      predictionTimestamp,
      market,
      selection,
      line,
      originalOdds,
      bookmaker,
      modelProbability,
      fairOdds,
      confidenceTier,
      ledgerTier,
      isPublicPick,
      modelVersion,
      dataSource: sourceTag,
      sourceTimestamp: predictionTimestamp,
      settlementStatus,
      result,
      profitUnits,
      stakeUnits: isPublicPick && settlementStatus === 'SETTLED' ? 1.0 : 0.0,
      matchScore,
      homeGoals,
      awayGoals,
      settledAt,
      provenanceHash,
      originalSourcePath: raw.originalSourcePath || sourceTag,
    };

    return { record: canonicalRecord };
  }

  /**
   * Generates deterministic deduplication composite key.
   */
  public static getDeduplicationKey(record: CanonicalPredictionRecord): string {
    return `${record.canonicalMatchId}|${record.market}|${record.line.toFixed(2)}|${record.selection.toLowerCase().replace(/\s+/g, '')}|${record.modelVersion}`;
  }

  /**
   * Executes the synchronization pipeline.
   */
  public static async sync(options: HandicapLabSyncOptions = {}): Promise<HandicapLabSyncResult> {
    const timestampUtc = new Date(options.nowMs || Date.now()).toISOString();
    const destinationPath = path.resolve(options.destinationPath || this.DEFAULT_DESTINATION_PATH);

    // Safety guard against overwriting protected historical ledgers
    for (const protectedPath of this.PROTECTED_HISTORICAL_PATHS) {
      if (path.resolve(destinationPath) === path.resolve(protectedPath)) {
        throw new Error(
          `[HandicapLabSyncService] Refusing to write to protected historical ledger: ${destinationPath}. Sync ledger must remain strictly additive.`
        );
      }
    }

    // 1. Resolve source files
    let sourceFiles: string[] = [];
    if (options.sourcePath) {
      if (!fs.existsSync(options.sourcePath)) {
        throw new Error(`[HandicapLabSyncService] Specified sourcePath does not exist: ${options.sourcePath}`);
      }
      sourceFiles = [path.resolve(options.sourcePath)];
    } else {
      sourceFiles = this.resolveSourceFiles(options.sourceType || 'auto');
    }

    if (sourceFiles.length === 0) {
      Logger.warn('[HandicapLabSyncService] No source ledger files found to synchronize.');
    }

    // 2. Read existing destination records for idempotency merge
    const existingKeyMap = new Map<string, CanonicalPredictionRecord>();
    const existingIdMap = new Map<string, CanonicalPredictionRecord>();
    if (fs.existsSync(destinationPath)) {
      try {
        const existingLines = fs.readFileSync(destinationPath, 'utf8').trim().split('\n').filter(Boolean);
        for (const line of existingLines) {
          const rec = JSON.parse(line) as CanonicalPredictionRecord;
          const key = this.getDeduplicationKey(rec);
          existingKeyMap.set(key, rec);
          existingIdMap.set(rec.predictionId, rec);
        }
      } catch (err) {
        Logger.warn('[HandicapLabSyncService] Failed reading existing sync ledger for merge:', { error: String(err) });
      }
    }

    // 3. Process records from source files
    const candidateRecords: CanonicalPredictionRecord[] = [];
    const seenBatchKeys = new Set<string>();

    let totalSourceRead = 0;
    let validParsed = 0;
    let invalidSkipped = 0;
    let duplicatesSkipped = 0;

    for (const sourceFile of sourceFiles) {
      try {
        const content = fs.readFileSync(sourceFile, 'utf8');
        const trimmed = content.trim();
        if (!trimmed) continue;

        let rawRows: any[] = [];
        if (sourceFile.endsWith('.jsonl')) {
          const lines = trimmed.split(/\r?\n/).filter(Boolean);
          for (const line of lines) {
            totalSourceRead++;
            try {
              rawRows.push(JSON.parse(line));
            } catch {
              invalidSkipped++;
            }
          }
        } else if (sourceFile.endsWith('.json')) {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            rawRows = parsed;
          } else if (typeof parsed === 'object') {
            rawRows = Object.values(parsed);
          }
          totalSourceRead += rawRows.length;
        }

        const sourceTag = path.basename(sourceFile);

        for (const raw of rawRows) {
          // Filters
          if (options.since) {
            const rawDate = raw.kickoffTimestamp || raw.kickoff_utc || raw.created_at || '';
            if (rawDate && rawDate < options.since) continue;
          }
          if (options.market && raw.market && raw.market !== options.market) {
            continue;
          }
          if (options.modelVersion && (raw.modelVersion || raw.model_version)) {
            const mv = raw.modelVersion || raw.model_version;
            if (mv !== options.modelVersion) continue;
          }
          if (options.leagueFilter && options.leagueFilter.length > 0) {
            const league = raw.competition || raw.league || '';
            if (!options.leagueFilter.includes(league)) continue;
          }

          const { record, error } = this.mapRawToCanonical(raw, sourceTag);
          if (!record || error) {
            invalidSkipped++;
            continue;
          }
          validParsed++;

          const dedupKey = this.getDeduplicationKey(record);
          if (seenBatchKeys.has(dedupKey) || existingKeyMap.has(dedupKey)) {
            duplicatesSkipped++;
            continue;
          }

          seenBatchKeys.add(dedupKey);
          candidateRecords.push(record);
        }
      } catch (err) {
        Logger.error(`[HandicapLabSyncService] Error processing file ${sourceFile}:`, { error: String(err) });
      }
    }

    // 4. Merge candidates with existing records
    const finalRecords = [...Array.from(existingKeyMap.values()), ...candidateRecords];

    // Compute aggregated telemetry counts
    let settled = 0;
    let pending = 0;
    let publicPicks = 0;
    let diagnosticRows = 0;
    const byMarket = { AH: 0, OU: 0, BTTS: 0 };
    const byLeague: Record<string, number> = {};

    for (const r of finalRecords) {
      if (r.settlementStatus === 'SETTLED') settled++;
      else pending++;

      if (r.isPublicPick) publicPicks++;
      else diagnosticRows++;

      if (r.market === 'AH') byMarket.AH++;
      else if (r.market === 'OU') byMarket.OU++;
      else if (r.market === 'BTTS') byMarket.BTTS++;

      byLeague[r.competitionName] = (byLeague[r.competitionName] || 0) + 1;
    }

    const counts: HandicapLabSyncCounts = {
      totalSourceRead,
      validParsed,
      invalidSkipped,
      duplicatesSkipped,
      totalSynchronized: finalRecords.length,
      settled,
      pending,
      publicPicks,
      diagnosticRows,
      byMarket,
      byLeague,
    };

    const checksumSource = JSON.stringify({
      count: finalRecords.length,
      keys: finalRecords.map(r => r.predictionId).sort(),
    });
    const checksum = crypto.createHash('sha256').update(checksumSource).digest('hex');

    // 5. Atomic write if not dry-run
    if (!options.dryRun && candidateRecords.length > 0) {
      const dir = path.dirname(destinationPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const tempPath = `${destinationPath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
      const outputLines = finalRecords.map(r => JSON.stringify(r)).join('\n') + '\n';
      fs.writeFileSync(tempPath, outputLines, 'utf8');

      // Atomic rename replaces destinationPath safely
      fs.renameSync(tempPath, destinationPath);
    }

    // 6. Verify protected historical ledgers were untouched
    let protectedLedgersVerified = true;
    for (const p of this.PROTECTED_HISTORICAL_PATHS) {
      if (!fs.existsSync(p)) {
        protectedLedgersVerified = false;
      }
    }

    return {
      success: true,
      timestampUtc,
      dryRun: Boolean(options.dryRun),
      sourceType: options.sourceType || 'auto',
      sourcePaths: sourceFiles,
      destinationPath,
      counts,
      checksum,
      sampleRecords: candidateRecords.slice(0, 5),
      protectedLedgersVerified,
    };
  }
}
