import { NextRequest, NextResponse } from 'next/server';
import { MatchIntelligenceService } from '@/engine/matchIntelligenceService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { HandicapLabAdapterFactory } = await import('@/contracts/handicapLabAdapter');
    const adapter = HandicapLabAdapterFactory.getAdapter();

    const { searchParams } = new URL(request.url);
    const horizon = searchParams.get('horizon') || undefined;
    const market = (searchParams.get('market') as any) || undefined;

    const matches = await MatchIntelligenceService.getForward7DayMatches({ horizon, market });
    const summary = await adapter.getDatasetSummary();
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
        error: error instanceof Error ? error.message : 'Internal error retrieving matches',
      },
      { status: 500 }
    );
  }
}
