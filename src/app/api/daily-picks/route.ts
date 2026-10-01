import { NextRequest, NextResponse } from 'next/server';
import { HandicapLabAdapterFactory, HttpHandicapLabAdapter } from '@/contracts/handicapLabAdapter';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const verdictParam = searchParams.get('verdict')?.toUpperCase() || 'ALL';
    const marketParam = searchParams.get('market')?.toUpperCase() || 'ALL';

    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    const adapter = HandicapLabAdapterFactory.getAdapter();

    // 1. HTTP Adapter Mode (Canonical HandicapLab Production Flow)
    if (adapter.mode === 'http') {
      const httpAdapter = adapter as HttpHandicapLabAdapter;
      const syncRes = await httpAdapter.getSalmoSync({ horizon: 'ALL', view: 'daily_picks' });

      if (!syncRes) {
        console.error('[API /api/daily-picks] HandicapLab HTTP sync unreachable in http mode');
        return NextResponse.json(
          {
            success: false,
            status: 'DATA_UNAVAILABLE',
            error: 'HandicapLab canonical sync service unreachable',
            data: [],
          },
          {
            status: 503,
            headers: {
              'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0',
            },
          }
        );
      }

      if (syncRes.dataState === 'DATA_TEMPORARILY_UNAVAILABLE' || syncRes.dataState === 'DATA_UNAVAILABLE') {
        return NextResponse.json(
          {
            success: false,
            status: 'DATA_UNAVAILABLE',
            error: 'HandicapLab reports data temporarily unavailable',
            data: [],
          },
          {
            status: 503,
            headers: {
              'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0',
            },
          }
        );
      }

      const rawPicks = syncRes.dailyPicks || [];
      const validFuturePicks: any[] = [];

      for (const p of rawPicks) {
        const kickUtc = p.kickoffUtc || '';
        const kickMs = new Date(kickUtc).getTime();

        // Stale Data Kill Switch: matches must be strictly in the future
        if (isNaN(kickMs) || kickMs <= nowMs) {
          continue;
        }

        // Integrity gates: fixture identity and valid odds
        if (!p.fixtureId || !p.homeTeam || !p.awayTeam) {
          continue;
        }
        if (!p.marketOdds || Number(p.marketOdds) <= 1.0) {
          continue;
        }

        // Parameter filters
        if (verdictParam !== 'ALL' && p.verdict !== verdictParam) {
          continue;
        }
        if (marketParam !== 'ALL' && p.marketType !== marketParam) {
          continue;
        }

        const modelProbPct = p.modelProbability ? Number((p.modelProbability * 100).toFixed(1)) : null;
        const marketOdds = Number(p.marketOdds);
        const impliedProbPct = marketOdds > 1 ? Number((100 / marketOdds).toFixed(1)) : null;
        const edgePct = Number(p.edgePct) || 0;
        const evPct = p.modelProbability && marketOdds > 1
          ? Number(((p.modelProbability * marketOdds - 1) * 100).toFixed(1))
          : null;

        validFuturePicks.push({
          id: p.predictionId || p.projectionId,
          fixtureId: p.fixtureId,
          match: `${p.homeTeam} vs ${p.awayTeam}`,
          homeTeam: p.homeTeam,
          awayTeam: p.awayTeam,
          league: p.leagueName || 'Premier League',
          kickoffUtc: kickUtc,
          marketType: p.marketType,
          selection: p.recommendedSelection,
          modelProbability: p.modelProbability,
          modelProbabilityPct: modelProbPct,
          fairOdds: p.fairOdds ? Number(p.fairOdds) : null,
          marketOdds,
          marketBookmaker: p.sourceBookmaker || 'Pinnacle',
          edgePct,
          expectedValuePct: evPct,
          confidence: Number(p.confidenceScore) || 0,
          verdict: p.verdict as 'LAYAK' | 'PANTAU' | 'LEWATI',
          reasoning: `Model prob ${modelProbPct}% vs implied ${impliedProbPct}% (${edgePct > 0 ? '+' : ''}${edgePct}% edge)`,
          rejectionReason: null,
          status: 'ACTIVE',
          createdAt: p.oddsCapturedAt || p.syncTimestampUtc || nowIso,
        });
      }

      const responseStatus = validFuturePicks.length > 0 ? 'AVAILABLE' : 'NO_QUALIFIED_PICKS';

      return NextResponse.json(
        {
          success: true,
          status: responseStatus,
          count: validFuturePicks.length,
          totalCanonicalPicks: rawPicks.length,
          syncChecksum: syncRes.syncChecksum,
          dataState: syncRes.dataState,
          data: validFuturePicks,
        },
        {
          status: 200,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'X-Data-Source': 'HandicapLab-HTTP',
            'X-Sync-Checksum': syncRes.syncChecksum || 'none',
          },
        }
      );
    }

    // 2. Database Adapter Mode (Fail-Closed Fallback for standalone DB environments)
    // NOTE: If configured for HTTP, the above block already executed; fail-closed applies.
    const { getDbClient } = await import('@/lib/db');
    const client = getDbClient();

    const { data: picks, error } = await client
      .from('daily_picks')
      .select('*')
      .gt('kickoff_utc', nowIso)
      .order('kickoff_utc', { ascending: true });

    if (error) {
      console.error('[API /api/daily-picks] Database error:', error);
      return NextResponse.json(
        {
          success: false,
          status: 'DATA_UNAVAILABLE',
          error: error.message,
          data: [],
        },
        {
          status: 503,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        }
      );
    }

    if (!picks || picks.length === 0) {
      return NextResponse.json(
        {
          success: true,
          status: 'NO_QUALIFIED_PICKS',
          count: 0,
          totalCanonicalPicks: 0,
          data: [],
        },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        }
      );
    }

    // In-memory verification for strict backend invariants
    const validPicks: any[] = [];
    for (const pick of picks) {
      const kickMs = new Date(pick.kickoff_utc).getTime();
      if (isNaN(kickMs) || kickMs <= nowMs) {
        continue;
      }
      if (!pick.market_odds || Number(pick.market_odds) <= 1.0) {
        continue;
      }
      if (verdictParam !== 'ALL' && pick.verdict !== verdictParam) {
        continue;
      }
      if (marketParam !== 'ALL' && pick.market_type !== marketParam) {
        continue;
      }

      validPicks.push({
        id: pick.id,
        fixtureId: pick.fixture_id,
        match: `${pick.home_team} vs ${pick.away_team}`,
        homeTeam: pick.home_team,
        awayTeam: pick.away_team,
        league: pick.league || 'Premier League',
        kickoffUtc: pick.kickoff_utc,
        marketType: pick.market_type,
        selection: pick.prediction,
        modelProbability: pick.model_probability,
        modelProbabilityPct: pick.model_probability ? Number((pick.model_probability * 100).toFixed(1)) : null,
        fairOdds: pick.fair_odds ? Number(pick.fair_odds) : null,
        marketOdds: pick.market_odds ? Number(pick.market_odds) : null,
        marketBookmaker: pick.market_bookmaker || 'Pinnacle',
        edgePct: pick.edge_pct ? Number(pick.edge_pct) : 0,
        expectedValuePct: pick.expected_value !== null && pick.expected_value !== undefined
          ? Number((pick.expected_value * 100).toFixed(1))
          : null,
        confidence: Number(pick.confidence) || 0,
        verdict: pick.verdict as 'LAYAK' | 'PANTAU' | 'LEWATI',
        reasoning: pick.reasoning,
        rejectionReason: pick.rejection_reason || null,
        status: pick.status,
        createdAt: pick.created_at,
      });
    }

    return NextResponse.json(
      {
        success: true,
        status: validPicks.length > 0 ? 'AVAILABLE' : 'NO_QUALIFIED_PICKS',
        count: validPicks.length,
        totalCanonicalPicks: picks.length,
        data: validPicks,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'X-Data-Source': 'Database-Direct',
        },
      }
    );
  } catch (err) {
    console.error('[API /api/daily-picks] Internal exception:', err);
    return NextResponse.json(
      {
        success: false,
        status: 'DATA_UNAVAILABLE',
        error: err instanceof Error ? err.message : 'Service unavailable',
        data: [],
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  }
}
