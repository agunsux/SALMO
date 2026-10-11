// SALMO.DEV — Production Settlement Cron Route
// Scheduled automated settlement orchestrator.
// Authenticates via CRON_SECRET and invokes native runProductionSettlement.

import { NextRequest, NextResponse } from 'next/server';
import { runProductionSettlement } from '@/engine/settlement/productionSettlementRunner';
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

  // Query parameter fallback for administrative / manual triggers
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
  const requestId = request.headers.get('x-request-id') || `cron_settle_${Date.now()}`;

  if (!verifyAuth(request)) {
    Logger.warn('[Cron:settle] Unauthorized attempt', { requestId });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    Logger.info('[Cron:settle] Starting automated production settlement cycle...', { requestId });

    const result = await runProductionSettlement({ dryRun: false });
    const latencyMs = Date.now() - start;

    Logger.info('[Cron:settle] Production settlement cycle completed successfully', {
      requestId,
      latencyMs,
      settledCount: result.settledCount,
      pendingCount: result.pendingCount,
    });

    return NextResponse.json({
      success: true,
      timestamp: result.timestampUtc,
      latencyMs,
      settledCount: result.settledCount,
      pendingCount: result.pendingCount,
      finishedFixturesCount: result.finishedFixturesCount,
      report: result.report,
    });
  } catch (error) {
    const latencyMs = Date.now() - start;
    Logger.error('[Cron:settle] Settlement cycle error:', { requestId, latencyMs, error: String(error) });

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during settlement cycle',
        latencyMs,
      },
      { status: 500 }
    );
  }
}
