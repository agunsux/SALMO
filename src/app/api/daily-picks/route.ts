import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { getDbClient } = await import('@/lib/db');
    const client = getDbClient();

    const { searchParams } = new URL(request.url);
    const verdictParam = searchParams.get('verdict')?.toUpperCase() || 'ALL';
    const marketParam = searchParams.get('market')?.toUpperCase() || 'ALL';

    const { data: picks, error } = await client
      .from('daily_picks')
      .select('*')
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
        { status: 503 }
      );
    }

    if (!picks || picks.length === 0) {
      return NextResponse.json({
        success: true,
        status: 'NO_QUALIFIED_PICKS',
        count: 0,
        totalCanonicalPicks: 0,
        data: [],
      });
    }

    // Filter strictly based on canonical criteria
    const filtered = picks.filter((pick: any) => {
      if (verdictParam !== 'ALL' && pick.verdict !== verdictParam) {
        return false;
      }
      if (marketParam !== 'ALL' && pick.market_type !== marketParam) {
        return false;
      }
      return true;
    });

    const formatted = filtered.map((p: any) => ({
      id: p.id,
      fixtureId: p.fixture_id,
      match: `${p.home_team} vs ${p.away_team}`,
      homeTeam: p.home_team,
      awayTeam: p.away_team,
      league: p.league || 'Premier League',
      kickoffUtc: p.kickoff_utc,
      marketType: p.market_type,
      selection: p.prediction,
      modelProbability: p.model_probability,
      modelProbabilityPct: p.model_probability ? Number((p.model_probability * 100).toFixed(1)) : null,
      fairOdds: p.fair_odds ? Number(p.fair_odds) : null,
      marketOdds: p.market_odds ? Number(p.market_odds) : null,
      marketBookmaker: p.market_bookmaker || 'Pinnacle',
      edgePct: p.edge_pct ? Number(p.edge_pct) : 0,
      expectedValuePct: p.expected_value !== null && p.expected_value !== undefined ? Number((p.expected_value * 100).toFixed(1)) : null,
      confidence: Number(p.confidence) || 0,
      verdict: p.verdict as 'LAYAK' | 'PANTAU' | 'LEWATI',
      reasoning: p.reasoning,
      rejectionReason: p.rejection_reason || null,
      status: p.status,
      createdAt: p.created_at,
    }));

    return NextResponse.json({
      success: true,
      status: 'AVAILABLE',
      count: formatted.length,
      totalCanonicalPicks: picks.length,
      data: formatted,
    });
  } catch (err) {
    console.error('[API /api/daily-picks] Internal exception:', err);
    return NextResponse.json(
      {
        success: false,
        status: 'DATA_UNAVAILABLE',
        error: err instanceof Error ? err.message : 'Database connection unavailable',
        data: [],
      },
      { status: 503 }
    );
  }
}
