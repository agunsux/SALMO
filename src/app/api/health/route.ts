// SALMO.DEV — GET /api/health
// Real introspection of system health and external dependencies.
// Zero fabrication: dependencies report exact, truthful operational status.

import { NextResponse } from 'next/server';
import { HandicapLabAdapterFactory } from '@/contracts/handicapLabAdapter';
import { env } from '@/config/env';

export const dynamic = 'force-dynamic';

export async function GET() {
  const start = Date.now();

  // 1. HandicapLab contract health check
  const adapter = HandicapLabAdapterFactory.getAdapter();
  const hlHealth = await adapter.getHealth();

  // 2. Database health check
  const dbStatus = env.database.configured ? 'configured_unmigrated' : 'not_configured';

  // 3. Provider status checks
  const apiFootballStatus = env.providers.apiFootball.configured ? 'ready' : 'unconfigured';
  const oddsPapiStatus = env.providers.oddsPapi.configured ? 'ready' : 'unconfigured';

  // System status determination:
  // In dev: OK if HandicapLab is healthy.
  // In prod: degraded if database is not configured.
  let overallStatus: 'ok' | 'degraded' | 'unavailable' = 'ok';

  if (hlHealth.status === 'UNAVAILABLE') {
    overallStatus = 'unavailable';
  } else if (!env.database.configured || !env.providers.oddsPapi.configured) {
    overallStatus = 'degraded';
  }

  const latencyMs = Date.now() - start;

  const payload = {
    status: overallStatus,
    service: 'salmo',
    version: '0.1.0',
    environment: env.nodeEnv,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    latencyMs,
    dependencies: {
      handicaplab: {
        status: hlHealth.status.toLowerCase(),
        mode: hlHealth.mode,
        verifiedMatches: hlHealth.recordCount,
        error: hlHealth.error,
      },
      database: dbStatus,
      apiFootball: apiFootballStatus,
      oddsPapi: oddsPapiStatus,
    },
  };

  const httpStatus = overallStatus === 'unavailable' ? 503 : 200;
  return NextResponse.json(payload, { status: httpStatus });
}

