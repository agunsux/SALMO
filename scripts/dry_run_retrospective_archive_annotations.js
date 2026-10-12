#!/usr/bin/env node
/**
 * SALMO — HOTFIX H7 (P1): Dry-Run Retrospective Archive & Temporal Provenance Classifier
 *
 * SAFETY GUARANTEE:
 * - Strictly READ-ONLY / DRY-RUN ONLY.
 * - Makes ZERO database mutations and ZERO local file writes.
 * - Inspects all 336 rows in `data/verification/all_leagues_research_ledger.jsonl` alongside
 *   canonical pre-match provenance from `data/verification/live_prediction_ledger.jsonl`
 *   and `data/verification/stage_b1_fixture_evidence.json`.
 * - Classifies every row into:
 *   1. VALID_PRE_MATCH
 *   2. RETROSPECTIVE_EXCLUDED
 *   3. UNVERIFIED_TIMESTAMP_PROVENANCE
 * - Outputs full summary counts, per-league breakdown, row IDs, exclusion reasons,
 *   and the additive non-destructive SQL annotation proposal for `public.forecast_archive`.
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

if (!require.extensions['.ts']) {
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
    module._compile(compiled.outputText, filename);
  };
}

const {
  evaluateRowTemporalIntegrity,
  isKnownBatchPlaceholderTimestamp,
} = require('../src/engine/archive/temporalIntegrityGuard.ts');

function runDryRunAudit() {
  const rootDir = process.cwd();
  const researchPath = path.resolve(rootDir, 'data', 'verification', 'all_leagues_research_ledger.jsonl');
  const livePath = path.resolve(rootDir, 'data', 'verification', 'live_prediction_ledger.jsonl');
  const evidencePath = path.resolve(rootDir, 'data', 'verification', 'stage_b1_fixture_evidence.json');

  const researchRows = fs
    .readFileSync(researchPath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));

  const liveRows = fs.existsSync(livePath)
    ? fs
        .readFileSync(livePath, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];

  const liveMap = new Map();
  for (const r of liveRows) {
    const apiId = r.providerProvenance?.apiFootballFixtureId || r.fixtureId;
    if (apiId && r.market) {
      liveMap.set(`${apiId}_${r.market}`, r);
    }
  }

  let evidenceGeneratedAt = null;
  const ftMap = new Map();
  if (fs.existsSync(evidencePath)) {
    const ev = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    evidenceGeneratedAt = ev.generatedAt || null;
    for (const lr of ev.leagueResults || []) {
      for (const f of lr.fixtures || []) {
        if (
          f.fixture?.status?.short === 'FT' &&
          typeof f.goals?.home === 'number' &&
          typeof f.goals?.away === 'number'
        ) {
          ftMap.set(String(f.fixture.id), `${f.goals.home}-${f.goals.away}`);
        }
      }
    }
  }

  const batchCommitTimestampUtc = '2026-10-11T18:56:38Z';

  const classifications = [];
  const byStatus = {
    VALID_PRE_MATCH: [],
    RETROSPECTIVE_EXCLUDED: [],
    UNVERIFIED_TIMESTAMP_PROVENANCE: [],
    MISSING_PREDICTION_TIMESTAMP: [],
    INVALID_PREDICTION_TIMESTAMP: [],
    INVALID_KICKOFF_TIMESTAMP: [],
  };

  const byLeague = new Map();

  for (let i = 0; i < researchRows.length; i++) {
    const row = researchRows[i];
    const fixtureId = String(row.fixtureId || row.fixture_id);
    const market = row.market || 'AH';
    const rowId = row.id || `${fixtureId}_${market}_${i}`;
    const ledgerTier = row.ledgerTier || (row.league === 'Premier League' ? 'PRODUCTION' : 'SHADOW');
    const liveMatch = ledgerTier === 'PRODUCTION' ? liveMap.get(`${fixtureId}_${market}`) : undefined;

    const explicitPredTs =
      liveMatch?.predictionTimestamp ||
      liveMatch?.publishedAt ||
      row.predictionTimestamp ||
      (ledgerTier === 'PRODUCTION' && row.createdAt && !isKnownBatchPlaceholderTimestamp(row.createdAt)
        ? row.createdAt
        : null);

    const verifiedSourceTs =
      liveMatch?.marketStateTimestamp ||
      row.sourceDataTimestamp ||
      evidenceGeneratedAt ||
      null;

    const hasVerifiedPreMatchProvenance = Boolean(
      explicitPredTs && !isKnownBatchPlaceholderTimestamp(explicitPredTs)
    );

    const evalResult = evaluateRowTemporalIntegrity(row, {
      verifiedPredictionTimestamp: explicitPredTs,
      verifiedSourceDataTimestamp: verifiedSourceTs,
      hasVerifiedPreMatchProvenance,
      batchCommitTimestampUtc,
    });

    const ftScore =
      liveMatch?.matchScore ||
      ftMap.get(fixtureId) ||
      (typeof row.homeGoals === 'number' && typeof row.awayGoals === 'number'
        ? `${row.homeGoals}-${row.awayGoals}`
        : null);

    const entry = {
      rowId,
      fixtureId,
      league: row.league,
      ledgerTier,
      market,
      selection: row.selection,
      kickoffUtc: evalResult.kickoffUtc,
      predictionTimestamp: evalResult.predictionTimestamp,
      sourceDataTimestamp: evalResult.sourceDataTimestamp,
      archiveCreatedAt: evalResult.archiveCreatedAt,
      temporalEligibilityStatus: evalResult.temporalEligibilityStatus,
      eligibleForPreMatchMetrics: evalResult.eligibleForPreMatchMetrics,
      temporalExclusionReason: evalResult.temporalExclusionReason,
      leadTimeHoursBeforeKickoff: evalResult.leadTimeHoursBeforeKickoff,
      hasFinalScoreInArchive: Boolean(ftScore),
      matchScore: ftScore,
    };

    classifications.push(entry);
    byStatus[evalResult.temporalEligibilityStatus].push(entry);

    if (!byLeague.has(row.league)) {
      byLeague.set(row.league, {
        league: row.league,
        tier: ledgerTier,
        total: 0,
        VALID_PRE_MATCH: 0,
        RETROSPECTIVE_EXCLUDED: 0,
        UNVERIFIED_TIMESTAMP_PROVENANCE: 0,
        excludedWithFtScore: 0,
        eligibleWithFtScore: 0,
      });
    }
    const lg = byLeague.get(row.league);
    lg.total++;
    lg[evalResult.temporalEligibilityStatus] = (lg[evalResult.temporalEligibilityStatus] || 0) + 1;
    if (ftScore) {
      if (evalResult.eligibleForPreMatchMetrics) lg.eligibleWithFtScore++;
      else lg.excludedWithFtScore++;
    }
  }

  // Reconcile the 70 additional rows within UNVERIFIED_TIMESTAMP_PROVENANCE where kickoff <= commit timestamp (2026-10-11T18:56:38Z)
  const commitMs = Date.parse(batchCommitTimestampUtc);
  const unverifiedKickoffBeforeCommit = byStatus.UNVERIFIED_TIMESTAMP_PROVENANCE.filter(
    (r) => Date.parse(r.kickoffUtc) <= commitMs
  );
  const unverifiedKickoffAfterCommit = byStatus.UNVERIFIED_TIMESTAMP_PROVENANCE.filter(
    (r) => Date.parse(r.kickoffUtc) > commitMs
  );

  const sqlProposal = `-- DRY-RUN ONLY SQL PROPOSAL (DO NOT RUN ON PRODUCTION WITHOUT HUMAN APPROVAL)
-- Non-destructively annotates public.forecast_archive with 4 separated timestamps and temporal eligibility status.
ALTER TABLE public.forecast_archive
  ADD COLUMN IF NOT EXISTS prediction_timestamp TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS source_data_timestamp TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS archive_created_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS kickoff_utc TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS temporal_eligibility_status TEXT NOT NULL DEFAULT 'UNVERIFIED_TIMESTAMP_PROVENANCE',
  ADD COLUMN IF NOT EXISTS eligible_for_pre_match_metrics BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS temporal_exclusion_reason TEXT NULL;

-- Step 1: Populate archive_created_at from existing created_at without assuming created_at is prediction_timestamp
UPDATE public.forecast_archive
SET archive_created_at = created_at
WHERE archive_created_at IS NULL;

-- Step 2: Classify 20 verified EPL pre-match rows matched to public.prediction_ledger
UPDATE public.forecast_archive fa
SET
  prediction_timestamp = pl.published_at,
  source_data_timestamp = pl.published_at,
  kickoff_utc = m.kickoff_time,
  temporal_eligibility_status = 'VALID_PRE_MATCH',
  eligible_for_pre_match_metrics = TRUE,
  temporal_exclusion_reason = NULL
FROM public.prediction_ledger pl
JOIN public.matches m ON m.id = fa.fixture_id
WHERE fa.fixture_id = pl.fixture_id
  AND fa.league = 'Premier League'
  AND pl.published_at < m.kickoff_time;

-- Step 3: Classify 144 non-EPL rows where archive_created_at ('2026-10-11T05:00:00Z') >= kickoff_time as RETROSPECTIVE_EXCLUDED
UPDATE public.forecast_archive fa
SET
  prediction_timestamp = NULL,
  source_data_timestamp = '2026-10-10T10:47:13.681Z'::timestamptz,
  kickoff_utc = m.kickoff_time,
  temporal_eligibility_status = 'RETROSPECTIVE_EXCLUDED',
  eligible_for_pre_match_metrics = FALSE,
  temporal_exclusion_reason = 'Retrospective evaluation excluded: batch archive_created_at >= kickoff_utc'
FROM public.matches m
WHERE fa.fixture_id = m.id
  AND fa.league <> 'Premier League'
  AND fa.created_at >= m.kickoff_time;

-- Step 4: Classify remaining 172 non-EPL rows with batch placeholder '2026-10-11T05:00:00Z' < kickoff_time as UNVERIFIED_TIMESTAMP_PROVENANCE
UPDATE public.forecast_archive fa
SET
  prediction_timestamp = NULL,
  source_data_timestamp = '2026-10-10T10:47:13.681Z'::timestamptz,
  kickoff_utc = m.kickoff_time,
  temporal_eligibility_status = 'UNVERIFIED_TIMESTAMP_PROVENANCE',
  eligible_for_pre_match_metrics = FALSE,
  temporal_exclusion_reason = 'Excluded from pre-match metrics: row carries hardcoded batch placeholder timestamp (2026-10-11T05:00:00.000Z) without verified pre-match prediction provenance'
FROM public.matches m
WHERE fa.fixture_id = m.id
  AND fa.league <> 'Premier League'
  AND fa.created_at < m.kickoff_time;`;

  const report = {
    mode: 'DRY_RUN_ONLY_ZERO_MUTATIONS',
    summary: {
      totalRowsInspected: classifications.length,
      validPreMatchCount: byStatus.VALID_PRE_MATCH.length,
      confirmedRetrospectiveExcludedCount: byStatus.RETROSPECTIVE_EXCLUDED.length,
      unverifiedTimestampProvenanceCount: byStatus.UNVERIFIED_TIMESTAMP_PROVENANCE.length,
      unverifiedBreakdown: {
        kickoffAtOrBeforeBatchCommit_1ad1b70: unverifiedKickoffBeforeCommit.length,
        kickoffAfterBatchCommit_1ad1b70: unverifiedKickoffAfterCommit.length,
      },
      missingOrInvalidTimestampCount:
        byStatus.MISSING_PREDICTION_TIMESTAMP.length +
        byStatus.INVALID_PREDICTION_TIMESTAMP.length +
        byStatus.INVALID_KICKOFF_TIMESTAMP.length,
      eligiblePreMatchWithFinalScoreCount: byStatus.VALID_PRE_MATCH.filter((r) => r.hasFinalScoreInArchive).length,
      excludedRetrospectiveWithFinalScoreCount: byStatus.RETROSPECTIVE_EXCLUDED.filter((r) => r.hasFinalScoreInArchive)
        .length,
    },
    perLeagueBreakdown: Array.from(byLeague.values()),
    rowIdsByClassification: {
      VALID_PRE_MATCH: byStatus.VALID_PRE_MATCH.map((r) => r.rowId),
      RETROSPECTIVE_EXCLUDED: byStatus.RETROSPECTIVE_EXCLUDED.map((r) => r.rowId),
      UNVERIFIED_TIMESTAMP_PROVENANCE: byStatus.UNVERIFIED_TIMESTAMP_PROVENANCE.map((r) => r.rowId),
    },
    sampleExcludedRetrospectiveRowsWithScores: byStatus.RETROSPECTIVE_EXCLUDED.filter(
      (r) => r.hasFinalScoreInArchive
    ).slice(0, 16),
    sqlProposal,
  };

  return report;
}

if (require.main === module) {
  const report = runDryRunAudit();
  console.log(JSON.stringify(report, null, 2));
}

module.exports = { runDryRunAudit };
