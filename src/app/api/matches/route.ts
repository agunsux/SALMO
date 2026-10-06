import { NextRequest, NextResponse } from 'next/server';
import { MatchIntelligenceService } from '@/engine/matchIntelligenceService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const horizon = searchParams.get('horizon') || undefined;
    const market = (searchParams.get('market') as any) || undefined;

    const matches = await MatchIntelligenceService.getForward7DayMatches({ horizon, market });

    // SALMO native dataset summary (zero blocking remote HandicapLab calls)
    let summary: any;
    try {
      const { DatabaseHandicapLabAdapter } = await import('@/contracts/handicapLabAdapter');
      const dbAdapter = new DatabaseHandicapLabAdapter();
      summary = await dbAdapter.getDatasetSummary();
    } catch {
      summary = {
        version: 'v1.0.0-salmo-native',
        verifiedMatchCount: matches.length,
        seasons: ['2025-2026'],
        lastUpdate: new Date().toISOString(),
        checksum: 'sha256-salmo-native-canonical-v1',
      };
    }

    const validation = await MatchIntelligenceService.getValidationSummary();

    return NextResponse.json({
      success: true,
      data: {
        matches,
        metadata: summary,
        validation,
      },
    });
  } catch (error) {
    console.error('[API /api/matches] Error:', error);
    return NextResponse.json(
      {
        success: false,
        status: 'DATA_TEMPORARILY_UNAVAILABLE',
        error: error instanceof Error ? error.message : 'Internal error retrieving matches',
      },
      { status: 503 }
    );
  }
}
