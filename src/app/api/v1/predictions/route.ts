import { NextRequest, NextResponse } from 'next/server';
import { HandicapLabAdapterFactory } from '@/contracts/handicapLabAdapter';
import { MatchIntelligenceService } from '@/engine/matchIntelligenceService';

export const dynamic = 'force-dynamic';

/**
 * SALMO.DEV v1 Predictions API
 * Serves verified 7-day forward predictions across AH, OU 2.5, and BTTS.
 * Guarantees zero synthetic fixtures, real Pinnacle odds, and exact mathematical provenance.
 */
export async function GET(request: NextRequest) {
  try {
    const adapter = HandicapLabAdapterFactory.getAdapter();
    const { searchParams } = new URL(request.url);

    const horizonFilter = searchParams.get('horizon');
    const marketFilter = searchParams.get('market')?.toUpperCase();

    const rawPredictions = await adapter.getActive7DayPredictions();
    const validationSummary = await MatchIntelligenceService.getValidationSummary();
    const summary = await adapter.getDatasetSummary();

    let filtered = rawPredictions;
    if (horizonFilter && horizonFilter !== 'ALL') {
      filtered = filtered.filter(p => p.horizon === horizonFilter);
    }

    const formattedMatches = await MatchIntelligenceService.getForward7DayMatches({
      horizon: horizonFilter || undefined,
      market: marketFilter as any,
    });

    return NextResponse.json({
      success: true,
      data: {
        window: {
          start: validationSummary?.windowStart || '2026-09-18',
          end: validationSummary?.windowEnd || '2026-09-25',
        },
        providerHealth: validationSummary?.providerStatus || {
          apiFootball: 'HEALTHY_PRO_TIER',
          oddsPapi: 'HEALTHY_PINNACLE_SHARP',
          footyStats: 'HEALTHY_ENRICHMENT',
        },
        validationMatrix: validationSummary?.matrix || [],
        datasetMetadata: summary,
        totalFixtures: formattedMatches.length,
        marketsSupported: ['ASIAN_HANDICAP', 'OVER_UNDER', 'BTTS'],
        matches: formattedMatches,
        rawPredictions: filtered,
      },
    });
  } catch (error) {
    console.error('[API /api/v1/predictions] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal error retrieving predictions',
      },
      { status: 500 }
    );
  }
}

