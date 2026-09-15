// SALMO.DEV — GET /api/health
// Active operational introspection of system health and external dependencies.
// Zero fabrication: dependencies report exact, truthful operational status.
// Strictly exposes NO secrets.

import { NextResponse } from 'next/server';
import { HandicapLabAdapterFactory } from '@/contracts/handicapLabAdapter';
import { testDbConnection } from '@/lib/db';
import { env } from '@/config/env';

export const dynamic = 'force-dynamic';

export async function GET() {
  const start = Date.now();

  // 1. HandicapLab adapter & canonical data health
  const adapter = HandicapLabAdapterFactory.getAdapter();
  const hlHealth = await adapter.getHealth();

  // 2. Database active connection probe
  const dbHealth = await testDbConnection();
  let dbStatus: 'connected' | 'configured_unreachable' | 'not_configured' = 'not_configured';
  if (dbHealth.connected) {
    dbStatus = 'connected';
  } else if (dbHealth.configured) {
    dbStatus = 'configured_unreachable';
  }

  // 3. Providers operational checks
  const apiFootballStatus = env.providers.apiFootball.configured ? 'configured' : 'unconfigured';
  const oddsPapiStatus = env.providers.oddsPapi.configured ? 'configured' : 'unconfigured';

  // System status determination:
  // HEALTHY: Adapter healthy, DB connected, Providers configured
  // DEGRADED: Any optional dependency unconfigured/unreachable, but core service alive
  // UNAVAILABLE: Core prediction dependencies completely unavailable
  let overallStatus: 'healthy' | 'degraded' | 'unavailable' = 'healthy';

  if (hlHealth.status === 'UNAVAILABLE') {
    overallStatus = 'unavailable';
  } else if (
    hlHealth.status === 'DEGRADED' ||
    !dbHealth.connected ||
    !env.providers.apiFootball.configured ||
    !env.providers.oddsPapi.configured
  ) {
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
      database: {
        status: dbStatus,
        latencyMs: dbHealth.latencyMs,
        error: dbHealth.error,
      },
      apiFootball: {
        status: apiFootballStatus,
        provider: 'API-Football',
      },
      oddsPapi: {
        status: oddsPapiStatus,
        provider: 'OddsPapi',
        supportedMarkets: ['ASIAN_HANDICAP', 'OVER_UNDER', 'BTTS'],
      },
    },
  };

  const httpStatus = overallStatus === 'unavailable' ? 503 : 200;
  return NextResponse.json(payload, { status: httpStatus });
}
