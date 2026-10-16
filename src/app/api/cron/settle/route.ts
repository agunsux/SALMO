// SALMO.DEV — Production Settlement Cron Route
// Scheduled automated settlement orchestrator.
// Authenticates via CRON_SECRET and invokes native runProductionSettlement.

import { NextRequest, NextResponse } from 'next/server';
import { runProductionSettlement } from '@/engine/settlement/productionSettlementRunner';
import { Logger } from '@/lib/logger';

import { verifyCronRequest } from '@/lib/auth/cronAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow sufficient runtime for provider roundtrips

export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}

async function handleCron(request: NextRequest) {
  const start = Date.now();
  const requestId = request.headers.get('x-request-id') || `cron_settle_${Date.now()}`;

  const authResult = await verifyCronRequest(request);
  if (!authResult.authorized) {
    Logger.warn('[Cron:settle] Unauthorized attempt', { requestId, reason: authResult.reason });
    return NextResponse.json({ error: 'Unauthorized', reason: authResult.reason }, { status: 401 });
  }

  // H3 Safety Gate: Strict opt-in behavior (ENABLE_PRODUCTION_CRON === 'true' required; preview blocked)
  if (process.env.ENABLE_PRODUCTION_CRON !== 'true' || process.env.VERCEL_ENV === 'preview') {
    Logger.info('[Cron:settle] Settlement cron is OFF (strict opt-in ENABLE_PRODUCTION_CRON=true required; preview blocked)', {
      requestId,
      enableProductionCron: process.env.ENABLE_PRODUCTION_CRON || 'unset',
      vercelEnv: process.env.VERCEL_ENV || 'unset',
    });
    return NextResponse.json({
      success: false,
      status: 'OFF',
      message: 'Production settlement cron is OFF by default. Set ENABLE_PRODUCTION_CRON=true in production to enable.',
    }, { status: 200 });
  }

  const allowProductionWrite = process.env.ALLOW_PRODUCTION_DB_WRITE === 'true';

  try {
    Logger.info('[Cron:settle] Starting automated production settlement cycle...', {
      requestId,
      dryRun: !allowProductionWrite,
    });

    const result = await runProductionSettlement({ dryRun: !allowProductionWrite });
    const latencyMs = Date.now() - start;

    Logger.info('[Cron:settle] Production settlement cycle completed successfully', {
      requestId,
      latencyMs,
      dryRun: !allowProductionWrite,
      settledCount: result.settledCount,
      pendingCount: result.pendingCount,
    });

    return NextResponse.json({
      success: true,
      dryRun: !allowProductionWrite,
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
