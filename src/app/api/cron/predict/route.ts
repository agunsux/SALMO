// SALMO.DEV — Production Prediction & Multi-League Auto-Unlock Cron Route
// Scheduled automated prediction & quota-reset activation orchestrator.
// Authenticates via CRON_SECRET, runs non-billable Quota-Reset Detector first,
// and executes MultiLeagueAutoActivator + ProductionPredictionEngine when quota is available.

import { NextRequest, NextResponse } from 'next/server';
import { ProductionPredictionEngine } from '@/engine/pipeline/productionPredictionEngine';
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

  // Always run non-billable quota-reset detector first (0 billable requests)
  const quotaDetection = await OddsPapiQuotaGuard.detectQuotaReset(3);

  // Explicit opt-out kill switch only when ENABLE_PRODUCTION_CRON === 'false'
  if (process.env.ENABLE_PRODUCTION_CRON === 'false') {
    Logger.info('[Cron:predict] Prediction cron is explicitly paused via kill-switch (ENABLE_PRODUCTION_CRON === false)', {
      requestId,
      quotaState: quotaDetection.state,
    });
    return NextResponse.json({
      success: false,
      status: 'OFF',
      quotaState: quotaDetection.state,
      quotaDetection,
      message: 'Production prediction cron is explicitly paused via ENABLE_PRODUCTION_CRON=false.',
    }, { status: 200 });
  }

  // Fail-closed if quota is still exhausted or unverified (0 billable requests made)
  if (quotaDetection.state !== 'QUOTA_AVAILABLE') {
    const autoUnlockState = await MultiLeagueAutoActivator.runAutoUnlockCycle({
      mode: 'LIVE',
      persistToDatabase: true,
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
      billableRequestsMade: 0,
      quotaDetection,
      activeLeagues: autoUnlockState.activeLeaguesAfterRun,
      shadowLeaguesCount: autoUnlockState.shadowLeaguesAfterRun.length,
      latencyMs,
    }, { status: 200 });
  }

  try {
    Logger.info('[Cron:predict] Quota reset verified! Running MultiLeagueAutoActivator & ProductionPredictionEngine...', {
      requestId,
      remainingOperationalBudget: quotaDetection.remainingOperationalBudget,
    });

    const autoUnlockResult = await MultiLeagueAutoActivator.runAutoUnlockCycle({
      mode: 'LIVE',
      persistToDatabase: true,
    });
    const result = await ProductionPredictionEngine.runPredictionCycle(
      autoUnlockResult.evaluatedFixtures
    );
    const latencyMs = Date.now() - start;

    Logger.info('[Cron:predict] Production prediction & auto-unlock cycle completed successfully', {
      requestId,
      latencyMs,
      leaguesPromoted: autoUnlockResult.leaguesPromoted,
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
      quotaState: autoUnlockResult.quotaDetection.state,
      billableRequestsMade: autoUnlockResult.billableRequestsMade,
      leaguesPromoted: autoUnlockResult.leaguesPromoted,
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
