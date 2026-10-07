// SALMO.DEV — Production Prediction Cron Route
// Scheduled automated prediction orchestrator.
// Authenticates via CRON_SECRET and invokes native ProductionPredictionEngine.

import { NextRequest, NextResponse } from 'next/server';
import { ProductionPredictionEngine } from '@/engine/pipeline/productionPredictionEngine';
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

  if (process.env.ENABLE_PRODUCTION_CRON !== 'true') {
    Logger.info('[Cron:predict] Prediction cron is disabled (ENABLE_PRODUCTION_CRON !== true)', { requestId });
    return NextResponse.json({
      success: false,
      status: 'OFF',
      message: 'Production prediction cron is explicitly disabled pending paid OddsPAPI key configuration.',
    }, { status: 200 });
  }

  try {
    Logger.info('[Cron:predict] Starting automated production prediction cycle...', { requestId });

    const result = await ProductionPredictionEngine.runPredictionCycle();
    const latencyMs = Date.now() - start;

    Logger.info('[Cron:predict] Production prediction cycle completed successfully', {
      requestId,
      latencyMs,
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
