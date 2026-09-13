// SALMO.DEV — GET /api/v1/matches
// Canonical matches listing with strict versioned contract and provenance.

import { NextRequest, NextResponse } from 'next/server';
import { MatchIntelligenceService } from '@/engine/matchIntelligenceService';
import { HandicapLabAdapterFactory } from '@/contracts/handicapLabAdapter';
import { ProvenanceBuilder } from '@/types/provenance';
import { ApiResponseEnvelope, MatchesListV1Response, MatchIntelligenceV1DTO, MarketIntelligenceV1DTO } from '@/types/apiContracts';
import { Logger } from '@/lib/logger';
import { MarketView } from '@/types/index';

export const dynamic = 'force-dynamic';

function mapMarketToV1(market: MarketView, matchId: string): MarketIntelligenceV1DTO {
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

export async function GET(request: NextRequest) {
  const start = Date.now();
  const requestId = request.headers.get('x-request-id') || `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  try {
    const adapter = HandicapLabAdapterFactory.getAdapter();
    const matches = MatchIntelligenceService.getTodaysMatches();
    const summary = await adapter.getDatasetSummary();

    const v1Matches: MatchIntelligenceV1DTO[] = matches.map(m => {
      const matchProv = ProvenanceBuilder.create({
        canonicalMatchId: m.id,
        market: 'ALL',
        line: 'CLOSING',
        sampleSize: m.markets.asianHandicap.sampleSize,
        datasetVersion: summary.version,
        checksum: summary.checksum,
      });

      return {
        id: m.id,
        canonicalMatchId: m.id,
        league: m.league,
        season: '2025-2026',
        date: m.kickoffIso.split('T')[0] || m.kickoffIso,
        kickoffTime: m.kickoffIso,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        venue: m.venue,
        isUpcoming: m.isUpcoming,
        markets: {
          asianHandicap: mapMarketToV1(m.markets.asianHandicap, m.id),
          btts: mapMarketToV1(m.markets.btts, m.id),
          overUnder: mapMarketToV1(m.markets.overUnder, m.id),
        },
        provenance: matchProv,
      };
    });

    const latencyMs = Date.now() - start;
    Logger.info('GET /api/v1/matches success', { requestId, latencyMs, count: v1Matches.length });

    const response: ApiResponseEnvelope<MatchesListV1Response> = {
      success: true,
      version: 'v1',
      data: {
        matches: v1Matches,
        totalMatches: v1Matches.length,
        datasetSummary: summary,
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        latencyMs,
      },
    };

    return NextResponse.json(response, {
      headers: {
        'x-request-id': requestId,
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    const latencyMs = Date.now() - start;
    Logger.error('GET /api/v1/matches failed', { requestId, latencyMs, error: String(error) });

    const response: ApiResponseEnvelope<null> = {
      success: false,
      version: 'v1',
      data: null,
      error: {
        code: 'DATA_UNAVAILABLE',
        message: error instanceof Error ? error.message : 'Matches data currently unavailable.',
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
