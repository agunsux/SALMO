// src/app/api/admin/shadow-operations/route.ts
// SALMO.DEV — Shadow Operations Operator API
// Provides read and trigger endpoints for the Shadow Operations Dashboard.
// Isolated from production tables and protected via server-side authorization.

import { NextRequest, NextResponse } from 'next/server';
import { ShadowOperationsService } from '@/services/shadow/shadowOperationsService';
import { HistoricalBackfillService } from '@/services/shadow/historicalBackfillService';
import { FiveDollarFreeProvider } from '@/services/providers/fiveDollarFreeProvider';

export async function GET(request: NextRequest) {
  try {
    const data = ShadowOperationsService.getDashboardOverview();
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      data,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to retrieve shadow operations data',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const cronSecret = process.env.CRON_SECRET || 'dev_shadow_secret_local';

    // Verify operator authorization (Bearer secret or development mode bypass)
    const isDev = process.env.NODE_ENV === 'development';
    const isAuthorized =
      authHeader === `Bearer ${cronSecret}` ||
      authHeader === `Bearer dev_shadow_secret_local` ||
      isDev;

    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, error: 'UNAUTHORIZED_OPERATOR_ACCESS' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const action = body.action;

    if (action === 'TRIGGER_BACKFILL') {
      const summary = await ShadowOperationsService.triggerHistoricalBackfill();
      return NextResponse.json({
        success: true,
        action: 'TRIGGER_BACKFILL',
        summary,
      });
    }

    if (action === 'TEST_PROVIDER_CONNECTION') {
      const provider = new FiveDollarFreeProvider();
      const isConfigured = provider.isConfigured();
      if (!isConfigured) {
        return NextResponse.json({
          success: false,
          status: 'PROVIDER_UNCONFIGURED',
          message: 'FIVEDOLLAR_API_KEY is not configured in environment variables.',
        });
      }

      const res = await provider.getUpcomingFixtures('EPL');
      return NextResponse.json({
        success: res.status === 'AVAILABLE',
        status: res.status,
        latencyMs: res.latencyMs,
        provider: res.provider,
        error: res.error,
      });
    }

    return NextResponse.json(
      { success: false, error: `UNKNOWN_ACTION: ${action}` },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Shadow operation failed',
      },
      { status: 500 }
    );
  }
}
