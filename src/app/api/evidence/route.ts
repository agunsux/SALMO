import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lineParam = searchParams.get('line');
    const teamParam = searchParams.get('team') || undefined;

    const line = lineParam !== null ? parseFloat(lineParam) : undefined;
    const { HandicapLabAdapterFactory } = await import('@/contracts/handicapLabAdapter');
    const adapter = HandicapLabAdapterFactory.getAdapter();
    const observations = await adapter.getHistoricalObservations({
      line,
      team: teamParam,
    });

    const summary = await adapter.getDatasetSummary();

    return NextResponse.json({
      success: true,
      data: {
        observations: observations.slice(0, 50), // top 50 recent
        totalObservations: observations.length,
        metadata: summary,
      },
    });
  } catch (error) {
    console.error('[API /api/evidence] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal error retrieving evidence',
      },
      { status: 500 }
    );
  }
}
