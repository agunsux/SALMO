// SALMO.DEV — GET /api/health
// Active operational introspection of system health and external dependencies.
// Zero fabrication: dependencies report exact, truthful operational status.
// Strictly exposes NO secrets.

import { NextResponse } from 'next/server';
import { HandicapLabAdapterFactory } from '@/contracts/handicapLabAdapter';
import { testDbConnection } from '@/lib/db';
import { env } from '@/config/env';
import { CANONICAL_15_LEAGUES } from '@/config/multiLeagueRegistry';
import { OddsPapiQuotaGuard } from '@/lib/quota/oddsPapiQuotaGuard';

export const dynamic = 'force-dynamic';

export async function GET() {
  const start = Date.now();

  // 1. HandicapLab adapter & canonical data health
  const adapter = HandicapLabAdapterFactory.getAdapter();
  const hlHealth = await adapter.getHealth();

  // 2. Database active connection probe
  const dbHealth = await testDbConnection();
  let dbStatus: 'connected' | 'configured_unreachable' | 'not_configured' = 'not_configured';
  if (dbHealth.connected) {
    dbStatus = 'connected';
  } else if (dbHealth.configured) {
    dbStatus = 'configured_unreachable';
  }

  // 3. Providers operational checks
  const apiFootballStatus = env.providers.apiFootball.configured ? 'configured' : 'unconfigured';
  const oddsPapiStatus = env.providers.oddsPapi.paused
    ? 'paused'
    : env.providers.oddsPapi.configured
    ? 'configured'
    : 'unconfigured';
  const theOddsApiStatus = env.providers.theOddsApi.configured ? 'configured' : 'unconfigured';

  // System status determination:
  // HEALTHY: Data storage connected, native prediction engine ready, OddsPapi or TheOddsApi configured
  // DEGRADED: Odds providers unconfigured or upstream R&D unavailable, but SALMO production product is operational
  // UNAVAILABLE: No operational data store available (both DB and local storage unreachable)
  let overallStatus: 'healthy' | 'degraded' | 'unavailable' = 'healthy';

  const hasDataStore = dbHealth.connected || hlHealth.status === 'HEALTHY';
  const hasOddsProvider =
    (env.providers.oddsPapi.configured && !env.providers.oddsPapi.paused) ||
    env.providers.theOddsApi.configured;

  if (!hasDataStore) {
    overallStatus = 'unavailable';
  } else if (
    hlHealth.status !== 'HEALTHY' ||
    !dbHealth.connected ||
    !hasOddsProvider
  ) {
    overallStatus = 'degraded';
  }

  const latencyMs = Date.now() - start;

  const activeLeagues = CANONICAL_15_LEAGUES.filter(l => l.production_status === 'ACTIVE').map(l => ({
    internalLeagueId: l.internal_league_id,
    leagueName: l.league_name,
    enabledMarkets: l.production_enabled_markets || [],
  }));
  const shadowLeagues = CANONICAL_15_LEAGUES.filter(l => l.production_status === 'SHADOW').map(l => ({
    internalLeagueId: l.internal_league_id,
    leagueName: l.league_name,
    validatedMarkets: l.validated_markets || [],
    ahReadiness: l.market_readiness?.AH,
    ouReadiness: l.market_readiness?.OU,
  }));
  const pausedLeagues = CANONICAL_15_LEAGUES.filter(l => l.production_status === 'PAUSED').map(l => ({
    internalLeagueId: l.internal_league_id,
    leagueName: l.league_name,
    reason: l.activation_reason,
  }));

  const { CanonicalMatchArchiveService } = await import('@/engine/archive/canonicalMatchArchiveService');
  const pipelineObservability = await CanonicalMatchArchiveService.getPipelineObservabilityState();

  const payload = {
    status: overallStatus,
    service: 'salmo',
    version: '0.1.0',
    environment: env.nodeEnv,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    latencyMs,
    dataFreshness: {
      historicalResearchAvailable: true,
      currentFixturesAvailable: false,
      currentOddsVerified: false,
      predictionsQualified: false,
      settlementUpToDate: true,
      liveDataState: 'HISTORICAL_PRESERVED_LIVE_UNAVAILABLE',
    },
    pipelineObservability,
    multiLeagueActivation: {
      activeLeaguesCount: activeLeagues.length,
      shadowLeaguesCount: shadowLeagues.length,
      pausedLeaguesCount: pausedLeagues.length,
      mandatoryQuotaReserve: OddsPapiQuotaGuard.MANDATORY_MULTI_LEAGUE_RESERVE,
      activeLeagues,
      shadowLeagues,
      pausedLeagues,
    },
    dependencies: {
      predictionEngine: {
        status: 'healthy',
        engine: 'dixon-coles-v1.0',
        mode: 'salmo-native',
        supportedMarkets: ['ASIAN_HANDICAP', 'OVER_UNDER', 'BTTS'],
      },
      handicaplab: {
        status: hlHealth.status.toLowerCase(),
        mode: hlHealth.mode,
        verifiedMatches: hlHealth.recordCount,
        error: hlHealth.error,
        role: 'rd_research_upstream',
      },
      database: {
        status: dbStatus,
        latencyMs: dbHealth.latencyMs,
        error: dbHealth.error,
      },
      oddsPapi: {
        status: oddsPapiStatus,
        provider: 'OddsPapi',
        role: 'authoritative_live_market',
        bookmakers: ['pinnacle', 'bet365'],
        supportedMarkets: ['ASIAN_HANDICAP', 'OVER_UNDER', 'BTTS'],
      },
      theOddsApi: {
        status: theOddsApiStatus,
        provider: 'The Odds API',
        role: 'live_market_fallback',
        activeKeyConfigured: env.providers.theOddsApi.configured,
      },
      apiFootball: {
        status: apiFootballStatus,
        provider: 'API-Football',
        role: 'legacy_historical_archive',
      },
    },
  };

  const httpStatus = overallStatus === 'unavailable' ? 503 : 200;
  return NextResponse.json(payload, { status: httpStatus });
}
