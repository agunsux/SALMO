import { NextResponse } from 'next/server';
import { MatchIntelligenceService } from '@/engine/matchIntelligenceService';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { HandicapLabAdapterFactory } = await import('@/contracts/handicapLabAdapter');
    const adapter = HandicapLabAdapterFactory.getAdapter();
    const matches = await MatchIntelligenceService.getTodaysMatches();
    const summary = await adapter.getDatasetSummary();

    return NextResponse.json({
      success: true,
      data: {
        matches,
        metadata: summary,
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
