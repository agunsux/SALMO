// SALMO.DEV — GET /api/v1/evidence
// REST endpoint for Out-of-Sample Evidence Accumulation & Prediction Tracking.
// Returns comprehensive statistical evidence report, cohort breakdowns,
// calibration metrics, dimensional sample sizes, and pre-registered gate evaluation.

import { NextRequest, NextResponse } from 'next/server';
import { EvidenceAccumulationService } from '@/engine/evidence/evidenceAccumulationService';
import { Logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const start = Date.now();
  const requestId = request.headers.get('x-request-id') || `req_${Date.now()}`;

  try {
    const report = EvidenceAccumulationService.generateStatisticalEvidenceReport();
    const latencyMs = Date.now() - start;

    Logger.info('GET /api/v1/evidence success', {
      requestId,
      latencyMs,
      totalGenerated: report.summary.totalPredictionsGenerated,
      settledPositions: report.summary.totalSettledWithVerifiedResults,
    });

    return NextResponse.json(
      {
        success: true,
        version: 'v1',
        data: report,
        meta: {
          requestId,
          timestamp: new Date().toISOString(),
          latencyMs,
        },
      },
      { headers: { 'x-request-id': requestId } }
    );
  } catch (error) {
    const latencyMs = Date.now() - start;
    Logger.error('GET /api/v1/evidence failed', { requestId, latencyMs, error: String(error) });

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'EVIDENCE_REPORT_UNAVAILABLE',
          message: 'Failed to generate statistical evidence report.',
        },
        meta: {
          requestId,
          timestamp: new Date().toISOString(),
          latencyMs,
        },
      },
      { status: 500, headers: { 'x-request-id': requestId } }
    );
  }
}
