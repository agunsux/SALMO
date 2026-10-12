export type TemporalEligibilityStatus =
  | 'VALID_PRE_MATCH'
  | 'RETROSPECTIVE_EXCLUDED'
  | 'UNVERIFIED_TIMESTAMP_PROVENANCE'
  | 'MISSING_PREDICTION_TIMESTAMP'
  | 'INVALID_PREDICTION_TIMESTAMP'
  | 'INVALID_KICKOFF_TIMESTAMP';

export interface TemporalTimestamps {
  /** Genuine timestamp when the prediction was computed and recorded before kickoff (null if unverified) */
  predictionTimestamp: string | null;
  /** Timestamp of the underlying fixture/odds snapshot used for evaluation */
  sourceDataTimestamp: string | null;
  /** Timestamp when the record was inserted into the research ledger or archive table */
  archiveCreatedAt: string | null;
  /** Match kickoff timestamp in UTC */
  kickoffUtc: string | null;
}

export interface TemporalIntegrityEvaluation extends TemporalTimestamps {
  temporalEligibilityStatus: TemporalEligibilityStatus;
  eligibleForPreMatchMetrics: boolean;
  temporalExclusionReason: string | null;
  leadTimeHoursBeforeKickoff: number | null;
  isBatchPlaceholderTimestamp: boolean;
  provenanceVerified: boolean;
}

export interface TemporalEvaluationContext {
  /** Verified pre-match prediction timestamp from canonical production ledger (if matched) */
  verifiedPredictionTimestamp?: string | null;
  /** Verified source-data / market-state timestamp from canonical source (if known) */
  verifiedSourceDataTimestamp?: string | null;
  /** Explicit flag indicating whether timestamp provenance is independently verified */
  hasVerifiedPreMatchProvenance?: boolean;
  /** Commit timestamp when a batch file was committed, used for additional audit detail */
  batchCommitTimestampUtc?: string | null;
}

/**
 * Known hardcoded batch placeholder timestamps found in historical research scripts
 * (e.g. scripts/generate_all_leagues_research_predictions.js line 76).
 * Any row carrying one of these timestamps without independent canonical ledger provenance
 * must never be treated as a verified pre-match prediction timestamp.
 */
export const KNOWN_PLACEHOLDER_TIMESTAMPS = new Set<string>([
  '2026-10-11T05:00:00.000Z',
  '2026-10-11T05:00:00Z',
  '2026-10-11T05:00:00+00:00',
]);

export function isKnownBatchPlaceholderTimestamp(ts: string | null | undefined): boolean {
  if (!ts || typeof ts !== 'string') return false;
  const trimmed = ts.trim();
  if (KNOWN_PLACEHOLDER_TIMESTAMPS.has(trimmed)) return true;
  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed) && parsed === Date.parse('2026-10-11T05:00:00.000Z')) {
    return true;
  }
  return false;
}

/**
 * Evaluates a research/archive prediction row for strict pre-match temporal integrity.
 *
 * Rules enforced:
 * 1. Separates predictionTimestamp, sourceDataTimestamp, archiveCreatedAt, and kickoffUtc.
 * 2. Never assumes `created_at` / `createdAt` is a genuine prediction timestamp unless
 *    provenance is explicitly verified.
 * 3. Any row with candidate timestamp >= kickoffUtc is classified as RETROSPECTIVE_EXCLUDED.
 * 4. Any row with candidate timestamp < kickoffUtc that uses a known batch placeholder
 *    or lacks verified prediction-timestamp provenance is classified as UNVERIFIED_TIMESTAMP_PROVENANCE.
 * 5. Only rows with verified prediction-timestamp provenance AND predictionTimestamp < kickoffUtc
 *    are classified as VALID_PRE_MATCH (eligibleForPreMatchMetrics = true).
 */
export function evaluateRowTemporalIntegrity(
  row: Record<string, any>,
  context: TemporalEvaluationContext = {}
): TemporalIntegrityEvaluation {
  const kickoffRaw =
    row?.kickoffUtc ??
    row?.kickoff_utc ??
    row?.matchDate ??
    row?.match_date ??
    null;

  const archiveCreatedRaw =
    row?.archiveCreatedAt ??
    row?.archive_created_at ??
    row?.createdAt ??
    row?.created_at ??
    null;

  const explicitPredictionRaw =
    context.verifiedPredictionTimestamp ??
    row?.predictionTimestamp ??
    row?.prediction_timestamp ??
    row?.publishedAt ??
    row?.published_at ??
    null;

  const sourceDataRaw =
    context.verifiedSourceDataTimestamp ??
    row?.sourceDataTimestamp ??
    row?.source_data_timestamp ??
    row?.marketStateTimestamp ??
    row?.market_state_timestamp ??
    null;

  const kickoffStr = typeof kickoffRaw === 'string' && kickoffRaw.trim() !== '' ? kickoffRaw.trim() : null;
  const archiveCreatedAt =
    typeof archiveCreatedRaw === 'string' && archiveCreatedRaw.trim() !== ''
      ? archiveCreatedRaw.trim()
      : null;
  const sourceDataTimestamp =
    typeof sourceDataRaw === 'string' && sourceDataRaw.trim() !== ''
      ? sourceDataRaw.trim()
      : null;

  // Validate kickoff timestamp first
  if (!kickoffStr) {
    return {
      predictionTimestamp: null,
      sourceDataTimestamp,
      archiveCreatedAt,
      kickoffUtc: null,
      temporalEligibilityStatus: 'MISSING_PREDICTION_TIMESTAMP',
      eligibleForPreMatchMetrics: false,
      temporalExclusionReason: 'Missing kickoff_utc timestamp; cannot verify pre-match temporal ordering.',
      leadTimeHoursBeforeKickoff: null,
      isBatchPlaceholderTimestamp: false,
      provenanceVerified: false,
    };
  }

  const kickoffMs = Date.parse(kickoffStr);
  if (Number.isNaN(kickoffMs)) {
    return {
      predictionTimestamp: null,
      sourceDataTimestamp,
      archiveCreatedAt,
      kickoffUtc: kickoffStr,
      temporalEligibilityStatus: 'INVALID_KICKOFF_TIMESTAMP',
      eligibleForPreMatchMetrics: false,
      temporalExclusionReason: `Unparseable kickoff_utc timestamp ("${kickoffStr}").`,
      leadTimeHoursBeforeKickoff: null,
      isBatchPlaceholderTimestamp: false,
      provenanceVerified: false,
    };
  }

  // Candidate timestamp for temporal comparison: prefer explicit prediction timestamp, fallback to archiveCreatedAt, then context.batchCommitTimestampUtc
  const batchCommitTs =
    typeof context.batchCommitTimestampUtc === 'string' && context.batchCommitTimestampUtc.trim() !== ''
      ? context.batchCommitTimestampUtc.trim()
      : null;

  const candidateRaw =
    typeof explicitPredictionRaw === 'string' && explicitPredictionRaw.trim() !== ''
      ? explicitPredictionRaw.trim()
      : archiveCreatedAt || batchCommitTs;

  if (!candidateRaw) {
    return {
      predictionTimestamp: null,
      sourceDataTimestamp,
      archiveCreatedAt,
      kickoffUtc: kickoffStr,
      temporalEligibilityStatus: 'MISSING_PREDICTION_TIMESTAMP',
      eligibleForPreMatchMetrics: false,
      temporalExclusionReason: 'Missing prediction_timestamp and archive_created_at; pre-match eligibility requires verified timestamp.',
      leadTimeHoursBeforeKickoff: null,
      isBatchPlaceholderTimestamp: false,
      provenanceVerified: false,
    };
  }

  const candidateMs = Date.parse(candidateRaw);
  if (Number.isNaN(candidateMs)) {
    return {
      predictionTimestamp: null,
      sourceDataTimestamp,
      archiveCreatedAt,
      kickoffUtc: kickoffStr,
      temporalEligibilityStatus: 'INVALID_PREDICTION_TIMESTAMP',
      eligibleForPreMatchMetrics: false,
      temporalExclusionReason: `Unparseable candidate prediction timestamp ("${candidateRaw}").`,
      leadTimeHoursBeforeKickoff: null,
      isBatchPlaceholderTimestamp: false,
      provenanceVerified: false,
    };
  }

  const isPlaceholder =
    isKnownBatchPlaceholderTimestamp(candidateRaw) ||
    isKnownBatchPlaceholderTimestamp(archiveCreatedAt);

  // Determine whether provenance is verified
  // Provenance is verified ONLY if:
  // - context.hasVerifiedPreMatchProvenance === true, OR
  // - context.verifiedPredictionTimestamp is provided and not a placeholder, OR
  // - row has an explicit predictionTimestamp/publishedAt (not just created_at) AND is not a known placeholder AND context.hasVerifiedPreMatchProvenance !== false
  const hasExplicitPredTs =
    typeof explicitPredictionRaw === 'string' && explicitPredictionRaw.trim() !== '';

  const provenanceVerified =
    context.hasVerifiedPreMatchProvenance === true ||
    (hasExplicitPredTs && !isPlaceholder && context.hasVerifiedPreMatchProvenance !== false);

  const leadTimeHours = Number(((kickoffMs - candidateMs) / (1000 * 60 * 60)).toFixed(2));

  // Explicit retrospective flag on row OR candidateMs >= kickoffMs
  if (row?.isRetrospective === true || candidateMs >= kickoffMs) {
    const comparisonOp = candidateMs === kickoffMs ? '==' : '>';
    const placeholderNote = isPlaceholder
      ? ' (row also carries hardcoded batch placeholder timestamp 2026-10-11T05:00:00.000Z)'
      : '';
    return {
      predictionTimestamp: provenanceVerified ? candidateRaw : null,
      sourceDataTimestamp,
      archiveCreatedAt,
      kickoffUtc: kickoffStr,
      temporalEligibilityStatus: 'RETROSPECTIVE_EXCLUDED',
      eligibleForPreMatchMetrics: false,
      temporalExclusionReason: `Retrospective evaluation excluded: candidate timestamp (${candidateRaw}) ${comparisonOp} kickoff_utc (${kickoffStr}), leadTime=${leadTimeHours}h${placeholderNote}.`,
      leadTimeHoursBeforeKickoff: leadTimeHours,
      isBatchPlaceholderTimestamp: isPlaceholder,
      provenanceVerified: false,
    };
  }

  // At this point candidateMs < kickoffMs numerically.
  // Check whether provenance is verified and not a batch placeholder.
  if (isPlaceholder || !provenanceVerified) {
    const commitNote =
      context.batchCommitTimestampUtc && Date.parse(context.batchCommitTimestampUtc) >= kickoffMs
        ? `; furthermore, batch commit timestamp (${context.batchCommitTimestampUtc}) was at or after kickoff_utc (${kickoffStr})`
        : '';
    const reason = isPlaceholder
      ? `Excluded from pre-match metrics: row carries hardcoded batch placeholder timestamp (${candidateRaw}) without verified pre-match prediction provenance${commitNote}.`
      : `Excluded from pre-match metrics: archive created_at (${candidateRaw}) lacks verified pre-match prediction-timestamp provenance${commitNote}.`;

    return {
      predictionTimestamp: null,
      sourceDataTimestamp,
      archiveCreatedAt,
      kickoffUtc: kickoffStr,
      temporalEligibilityStatus: 'UNVERIFIED_TIMESTAMP_PROVENANCE',
      eligibleForPreMatchMetrics: false,
      temporalExclusionReason: reason,
      leadTimeHoursBeforeKickoff: null,
      isBatchPlaceholderTimestamp: isPlaceholder,
      provenanceVerified: false,
    };
  }

  return {
    predictionTimestamp: candidateRaw,
    sourceDataTimestamp,
    archiveCreatedAt,
    kickoffUtc: kickoffStr,
    temporalEligibilityStatus: 'VALID_PRE_MATCH',
    eligibleForPreMatchMetrics: true,
    temporalExclusionReason: null,
    leadTimeHoursBeforeKickoff: leadTimeHours,
    isBatchPlaceholderTimestamp: false,
    provenanceVerified: true,
  };
}
