// SALMO.DEV — GET /api/v1/evidence/:id
// Returns verifiable historical ledger and settlement statistics.

import { NextRequest, NextResponse } from 'next/server';
import { HandicapLabAdapterFactory } from '@/contracts/handicapLabAdapter';
import { ProvenanceBuilder } from '@/types/provenance';
import { ApiResponseEnvelope, EvidenceDetailV1DTO } from '@/types/apiContracts';
import { Logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const start = Date.now();
  const requestId = request.headers.get('x-request-id') || `req_${Date.now()}`;
  const { id } = await context.params;

  try {
    const { searchParams } = new URL(request.url);
    const lineParam = searchParams.get('line');
    const teamParam = searchParams.get('team') || undefined;

    const line = lineParam !== null ? parseFloat(lineParam) : undefined;
    const adapter = HandicapLabAdapterFactory.getAdapter();
    const observations = await adapter.getHistoricalObservations({ line, team: teamParam });

    let wins = 0;
    let halfWins = 0;
    let pushes = 0;
    let halfLosses = 0;
    let losses = 0;

    for (const obs of observations) {
      if (obs.settlement === 'WIN') wins++;
      else if (obs.settlement === 'HALF_WIN') halfWins++;
      else if (obs.settlement === 'PUSH') pushes++;
      else if (obs.settlement === 'HALF_LOSS') halfLosses++;
      else if (obs.settlement === 'LOSS') losses++;
    }

    const n = observations.length;

    const evidence: EvidenceDetailV1DTO = {
      marketId: id,
      matchTitle: teamParam ? `Historical Evidence for ${teamParam}` : 'HandicapLab League Historical Baseline',
      lineLabel: line !== undefined ? (line > 0 ? `+${line}` : `${line}`) : 'ALL',
      sampleSize: n,
      settlementBreakdown: {
        winPct: n > 0 ? Number(((wins / n) * 100).toFixed(1)) : null,
        halfWinPct: n > 0 ? Number(((halfWins / n) * 100).toFixed(1)) : null,
        pushPct: n > 0 ? Number(((pushes / n) * 100).toFixed(1)) : null,
        halfLossPct: n > 0 ? Number(((halfLosses / n) * 100).toFixed(1)) : null,
        lossPct: n > 0 ? Number(((losses / n) * 100).toFixed(1)) : null,
      },
      observations: observations.slice(0, 50).map(o => ({
        matchId: o.matchId,
        date: o.date,
        homeTeam: o.homeTeam,
        awayTeam: o.awayTeam,
        line: o.line,
        homeGoals: o.homeGoals,
        awayGoals: o.awayGoals,
        goalDifference: o.homeGoals - o.awayGoals,
        settlement: o.settlement,
        odds: o.odds,
        bookmaker: 'Pinnacle',
      })),
      provenance: ProvenanceBuilder.create({
        canonicalMatchId: id,
        market: 'ASIAN_HANDICAP',
        line: line !== undefined ? String(line) : 'ALL',
        sampleSize: n,
      }),
    };

    const latencyMs = Date.now() - start;
    Logger.info(`GET /api/v1/evidence/${id} success`, { requestId, latencyMs, count: n });

    const response: ApiResponseEnvelope<EvidenceDetailV1DTO> = {
      success: true,
      version: 'v1',
      data: evidence,
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        latencyMs,
      },
    };

    return NextResponse.json(response, { headers: { 'x-request-id': requestId } });
  } catch (error) {
    const latencyMs = Date.now() - start;
    Logger.error(`GET /api/v1/evidence/${id} failed`, { requestId, latencyMs, error: String(error) });

    const response: ApiResponseEnvelope<null> = {
      success: false,
      version: 'v1',
      data: null,
      error: {
        code: 'DATA_UNAVAILABLE',
        message: 'Evidence ledger currently unavailable.',
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
