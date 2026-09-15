// SALMO.DEV — GET /api/v1/matches/:id
// Retrieves single match intelligence by canonical match ID.

import { NextRequest, NextResponse } from 'next/server';
import { MatchIntelligenceService } from '@/engine/matchIntelligenceService';
import { ProvenanceBuilder } from '@/types/provenance';
import { ApiResponseEnvelope, MatchIntelligenceV1DTO } from '@/types/apiContracts';
import { Logger } from '@/lib/logger';
import { MarketView } from '@/types/index';

export const dynamic = 'force-dynamic';

function mapMarketToV1(market: MarketView, matchId: string) {
  const provenance = ProvenanceBuilder.create({
    canonicalMatchId: matchId,
    market: market.marketType,
    line: market.lineLabel,
    sampleSize: market.sampleSize,
    datasetVersion: market.provenance.datasetVersion,
    validationStage: market.validationStage,
    checksum: market.provenance.checksum,
  });

  return {
    marketType: market.marketType,
    lineLabel: market.lineLabel,
    numericLine: market.numericLine ?? null,
    selection: market.selection,
    available: market.available,
    odds: market.odds,
    bookmaker: market.bookmaker,
    badge: market.badge,
    status: market.status,
    statusLabel: market.statusLabel,
    confidence: market.confidence,
    modelProbabilityPct: market.modelProbabilityPct,
    marketImpliedProbabilityPct: market.marketImpliedProbabilityPct,
    edgePercentagePoints: market.edgePercentagePoints,
    expectedValuePct: market.expectedValuePct,
    sampleSize: market.sampleSize,
    dataQuality: market.dataQuality,
    validationStage: market.validationStage,
    reason: market.reason,
    provenance,
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const start = Date.now();
  const requestId = request.headers.get('x-request-id') || `req_${Date.now()}`;
  const { id } = await context.params;

  try {
    const matches = await MatchIntelligenceService.getTodaysMatches();
    const match = matches.find(m => m.id === id);

    if (!match) {
      const latencyMs = Date.now() - start;
      const response: ApiResponseEnvelope<null> = {
        success: false,
        version: 'v1',
        data: null,
        error: {
          code: 'MATCH_NOT_FOUND',
          message: `Match with ID '${id}' not found in active schedule.`,
          category: 'CLIENT_ERROR',
        },
        meta: {
          requestId,
          timestamp: new Date().toISOString(),
          latencyMs,
        },
      };
      return NextResponse.json(response, { status: 404, headers: { 'x-request-id': requestId } });
    }

    const matchProv = ProvenanceBuilder.create({
      canonicalMatchId: match.id,
      market: 'ALL',
      line: 'CLOSING',
      sampleSize: match.markets.asianHandicap.sampleSize,
    });

    const v1Match: MatchIntelligenceV1DTO = {
      id: match.id,
      canonicalMatchId: match.id,
      league: match.league,
      season: '2025-2026',
      date: match.kickoffIso.split('T')[0] || match.kickoffIso,
      kickoffTime: match.kickoffIso,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      venue: match.venue,
      isUpcoming: match.isUpcoming,
      markets: {
        asianHandicap: mapMarketToV1(match.markets.asianHandicap, match.id),
        btts: mapMarketToV1(match.markets.btts, match.id),
        overUnder: mapMarketToV1(match.markets.overUnder, match.id),
      },
      provenance: matchProv,
    };

    const latencyMs = Date.now() - start;
    Logger.info(`GET /api/v1/matches/${id} success`, { requestId, latencyMs });

    const response: ApiResponseEnvelope<MatchIntelligenceV1DTO> = {
      success: true,
      version: 'v1',
      data: v1Match,
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        latencyMs,
      },
    };

    return NextResponse.json(response, { headers: { 'x-request-id': requestId } });
  } catch (error) {
    const latencyMs = Date.now() - start;
    Logger.error(`GET /api/v1/matches/${id} failed`, { requestId, latencyMs, error: String(error) });

    const response: ApiResponseEnvelope<null> = {
      success: false,
      version: 'v1',
      data: null,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Error resolving match details.',
        category: 'INTERNAL_ERROR',
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        latencyMs,
      },
    };

    return NextResponse.json(response, { status: 500, headers: { 'x-request-id': requestId } });
  }
}
