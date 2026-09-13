// SALMO.DEV — GET /api/v1/research
// Exposes verifiable research distributions and validation lifecycle status.

import { NextRequest, NextResponse } from 'next/server';
import { HandicapLabAdapterFactory } from '@/contracts/handicapLabAdapter';
import { ApiResponseEnvelope, ResearchParameterV1DTO } from '@/types/apiContracts';
import { Logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const start = Date.now();
  const requestId = request.headers.get('x-request-id') || `req_${Date.now()}`;

  try {
    const adapter = HandicapLabAdapterFactory.getAdapter();
    const summary = await adapter.getDatasetSummary();
    const allRecords = await adapter.getAllRecords();

    // Group by common AH handicap lines
    const lineBuckets = [-1.0, -0.75, -0.5, -0.25, 0.0, 0.25, 0.5, 0.75, 1.0];
    const linesAnalyzed = lineBuckets.map(line => {
      const subset = allRecords.filter(r => r.ahLine !== null && Math.abs(r.ahLine - line) < 0.001);
      const total = subset.length;
      const homeWins = subset.filter(r => (r.homeGoals ?? 0) > (r.awayGoals ?? 0)).length;
      const pushes = subset.filter(r => (r.homeGoals ?? 0) === (r.awayGoals ?? 0)).length;
      const awayWins = total - homeWins - pushes;

      return {
        line,
        sampleSize: total,
        homeWinPct: total > 0 ? Number(((homeWins / total) * 100).toFixed(1)) : 0,
        pushPct: total > 0 ? Number(((pushes / total) * 100).toFixed(1)) : 0,
        awayWinPct: total > 0 ? Number(((awayWins / total) * 100).toFixed(1)) : 0,
      };
    });

    const researchData: ResearchParameterV1DTO = {
      totalMatchesAnalyzed: allRecords.length,
      seasonsCovered: summary.seasons,
      linesAnalyzed,
      validationSummary: {
        stage: 'UNVERIFIED',
        status: 'Baseline frequency model out-of-sample verification unlinked.',
        verifiedFolds: 0,
      },
    };

    const latencyMs = Date.now() - start;
    Logger.info('GET /api/v1/research success', { requestId, latencyMs });

    const response: ApiResponseEnvelope<ResearchParameterV1DTO> = {
      success: true,
      version: 'v1',
      data: researchData,
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        latencyMs,
      },
    };

    return NextResponse.json(response, { headers: { 'x-request-id': requestId } });
  } catch (error) {
    const latencyMs = Date.now() - start;
    Logger.error('GET /api/v1/research failed', { requestId, latencyMs, error: String(error) });

    const response: ApiResponseEnvelope<null> = {
      success: false,
      version: 'v1',
      data: null,
      error: {
        code: 'DATA_UNAVAILABLE',
        message: 'Research dataset currently unavailable.',
        category: 'DATA_UNAVAILABLE',
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        latencyMs,
      },
    };

    return NextResponse.json(response, { status: 503, headers: { 'x-request-id': requestId } });
  }
}

