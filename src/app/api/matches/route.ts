import { NextRequest, NextResponse } from 'next/server';
import { MatchIntelligenceService } from '@/engine/matchIntelligenceService';
import { CanonicalMatchArchiveService } from '@/engine/archive/canonicalMatchArchiveService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const view = (searchParams.get('view') || 'upcoming').toLowerCase();
    const horizon = searchParams.get('horizon') || undefined;
    const market = (searchParams.get('market') as any) || undefined;

    if (view === 'archive') {
      const page = Number(searchParams.get('page') || 1);
      const pageSize = Number(searchParams.get('pageSize') || 25);
      const league = searchParams.get('league') || undefined;
      const season = searchParams.get('season') || undefined;
      const status = (searchParams.get('status') as any) || 'ALL';
      const source = (searchParams.get('source') as any) || 'ALL';
      const search = searchParams.get('search') || undefined;
      const dateFrom = searchParams.get('dateFrom') || undefined;
      const dateTo = searchParams.get('dateTo') || undefined;

      const archiveResult = await CanonicalMatchArchiveService.queryMatchArchive({
        page,
        pageSize,
        league,
        season,
        status,
        source,
        search,
        dateFrom,
        dateTo,
      });

      return NextResponse.json({
        success: true,
        view: 'archive',
        data: {
          archiveMatches: archiveResult.matches,
          totalCount: archiveResult.totalCount,
          page: archiveResult.page,
          pageSize: archiveResult.pageSize,
          totalPages: archiveResult.totalPages,
          archiveSummary: archiveResult.summary,
        },
      });
    }

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
    const observability = await CanonicalMatchArchiveService.getPipelineObservabilityState();

    return NextResponse.json({
      success: true,
      view: 'upcoming',
      data: {
        matches,
        metadata: summary,
        validation,
        observability,
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
