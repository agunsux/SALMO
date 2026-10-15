// SALMO.DEV — Production Prediction & Multi-League Auto-Unlock Cron Route
// Scheduled automated prediction & quota-reset activation orchestrator.
// Authenticates via CRON_SECRET, runs non-billable Quota-Reset Detector first,
// and executes MultiLeagueAutoActivator + ProductionPredictionEngine when quota is available.

import { NextRequest, NextResponse } from 'next/server';
import { ProductionPredictionEngine } from '@/engine/pipeline/productionPredictionEngine';
import { DailyPredictionRefreshService } from '@/engine/pipeline/dailyPredictionRefreshService';
import { MultiLeagueAutoActivator } from '@/engine/activation/multiLeagueAutoActivator';
import { OddsPapiQuotaGuard } from '@/lib/quota/oddsPapiQuotaGuard';
import { Logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow sufficient runtime for provider roundtrips

function verifyAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // If CRON_SECRET is not configured, deny access in production
    if (process.env.NODE_ENV === 'production') return false;
    return true;
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${cronSecret}`) return true;

  // Also check query param fallback for secure manual administrative triggering
  const { searchParams } = new URL(request.url);
  if (searchParams.get('key') === cronSecret) return true;

  return false;
}

export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}

async function handleCron(request: NextRequest) {
  const start = Date.now();
  const requestId = request.headers.get('x-request-id') || `cron_${Date.now()}`;

  if (!verifyAuth(request)) {
    Logger.warn('[Cron:predict] Unauthorized attempt', { requestId });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestedMode = searchParams.get('mode')?.toUpperCase();

  // Allow explicit administrative simulation (AUDIT_ONLY or RESEARCH dry-run) without requiring ENABLE_PRODUCTION_CRON
  if (requestedMode === 'AUDIT_ONLY' || requestedMode === 'RESEARCH_DRY_RUN') {
    const refreshResult = await DailyPredictionRefreshService.runDailyRefresh({
      mode: 'AUDIT_ONLY',
      dryRun: true,
    });
    return NextResponse.json({
      success: refreshResult.success,
      status: refreshResult.status,
      mode: 'AUDIT_ONLY',
      report: refreshResult.report,
      qualifiedPredictionsCount: refreshResult.qualifiedPredictions.length,
    }, { status: 200 });
  }

  // H3 Safety Gate: Strict opt-in behavior (ENABLE_PRODUCTION_CRON === 'true' required; default OFF when absent/false or in preview)
  if (process.env.ENABLE_PRODUCTION_CRON !== 'true' || process.env.VERCEL_ENV === 'preview') {
    Logger.info('[Cron:predict] Prediction cron is OFF (strict opt-in ENABLE_PRODUCTION_CRON=true required; preview blocked)', {
      requestId,
      enableProductionCron: process.env.ENABLE_PRODUCTION_CRON || 'unset',
      vercelEnv: process.env.VERCEL_ENV || 'unset',
    });
    return NextResponse.json({
      success: false,
      status: 'OFF',
      billableRequestsMade: 0,
      promotionMode: 'PROPOSE_ONLY',
      message: 'Production prediction cron is OFF by default. Set ENABLE_PRODUCTION_CRON=true in production to enable.',
    }, { status: 200 });
  }

  const allowDbWrite = OddsPapiQuotaGuard.isProductionDatabaseWriteAllowed(
    process.env.ALLOW_PRODUCTION_DB_WRITE === 'true'
  );

  // Run non-billable quota-reset detector (0 billable requests, read-only unless allowDbWrite)
  const quotaDetection = await OddsPapiQuotaGuard.detectQuotaReset(2, false, undefined, allowDbWrite);

  // Fail-closed if quota is still exhausted or unverified (0 billable requests made)
  if (quotaDetection.state !== 'QUOTA_AVAILABLE') {
    const autoUnlockState = await MultiLeagueAutoActivator.runAutoUnlockCycle({
      mode: 'LIVE',
      explicitHumanApproval: false,
      persistToDatabase: false,
      allowProductionWrite: false,
    });
    const latencyMs = Date.now() - start;
    Logger.info('[Cron:predict] Quota reset not yet available; holding multi-league gate closed with 0 billable requests.', {
      requestId,
      quotaState: quotaDetection.state,
      reason: quotaDetection.reason,
      latencyMs,
    });
    return NextResponse.json({
      success: true,
      status: quotaDetection.state,
      promotionMode: autoUnlockState.promotionMode,
      billableRequestsMade: 0,
      quotaDetection,
      leaguesPromoted: autoUnlockState.leaguesPromoted,
      leaguesProposedForReview: autoUnlockState.leaguesProposedForReview,
      activeLeagues: autoUnlockState.activeLeaguesAfterRun,
      shadowLeaguesCount: autoUnlockState.shadowLeaguesAfterRun.length,
      latencyMs,
    }, { status: 200 });
  }

  try {
    Logger.info('[Cron:predict] Quota reset verified! Running MultiLeagueAutoActivator (PROPOSE_ONLY) & ProductionPredictionEngine...', {
      requestId,
      remainingOperationalBudget: quotaDetection.remainingOperationalBudget,
      allowDbWrite,
    });

    // H2: Always run activator in PROPOSE_ONLY mode (explicitHumanApproval: false) from cron
    const autoUnlockResult = await MultiLeagueAutoActivator.runAutoUnlockCycle({
      mode: 'LIVE',
      explicitHumanApproval: false,
      persistToDatabase: allowDbWrite,
      allowProductionWrite: allowDbWrite,
    });
    const result = await ProductionPredictionEngine.runPredictionCycle(
      autoUnlockResult.evaluatedFixtures,
      {
        persistToDatabase: allowDbWrite,
        allowProductionWrite: allowDbWrite,
      }
    );
    const latencyMs = Date.now() - start;

    Logger.info('[Cron:predict] Production prediction & proposal cycle completed successfully', {
      requestId,
      latencyMs,
      promotionMode: autoUnlockResult.promotionMode,
      leaguesPromoted: autoUnlockResult.leaguesPromoted,
      leaguesProposedForReview: autoUnlockResult.leaguesProposedForReview,
      billableRequestsMade: autoUnlockResult.billableRequestsMade,
      totalFixtures: result.stats.totalFixtures,
      persistedCount: result.persistedPicksCount,
      layakCount: result.stats.layakCount,
      pantauCount: result.stats.pantauCount,
      lewatiCount: result.stats.lewatiCount,
    });

    return NextResponse.json({
      success: true,
      timestamp: result.timestampUtc,
      latencyMs,
      promotionMode: autoUnlockResult.promotionMode,
      quotaState: autoUnlockResult.quotaDetection.state,
      billableRequestsMade: autoUnlockResult.billableRequestsMade,
      leaguesPromoted: autoUnlockResult.leaguesPromoted,
      leaguesProposedForReview: autoUnlockResult.leaguesProposedForReview,
      activeLeagues: autoUnlockResult.activeLeaguesAfterRun,
      stats: result.stats,
      persistedPicksCount: result.persistedPicksCount,
    });
  } catch (error) {
    const latencyMs = Date.now() - start;
    Logger.error('[Cron:predict] Prediction cycle error:', { requestId, latencyMs, error: String(error) });

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during prediction cycle',
        latencyMs,
      },
      { status: 500 }
    );
  }
}
