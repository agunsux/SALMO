// SALMO.DEV — Match Intelligence Service
// Strictly limited to 3 markets:
// 1. Asian Handicap (AH)
// 2. Over/Under 2.5 (OU 2.5)
// 3. Both Teams To Score (BTTS: Yes/No)
// ZERO MONEYLINE / 1X2. Zero fake odds. Zero filesystem reliance in production.

import { HandicapLabAdapterFactory } from '../contracts/handicapLabAdapter';
import { ApiFootballProvider } from '../services/providers/apiFootballProvider';
import { OddsPapiProvider } from '../services/providers/oddsPapiProvider';
import { LiveFixtureDTO, LiveOddsDTO } from '../services/providers/types';
import { DevigEngine } from './ah/devig';
import { DecisionPolicy } from './decision/decisionPolicy';
import { MatchIntelligence, MarketView, DecisionProvenance } from '../types/index';
import { Logger } from '../lib/logger';

export class MatchIntelligenceService {
  private static apiFootball = new ApiFootballProvider();
  private static oddsPapi = new OddsPapiProvider();

  /**
   * Main production entry point: returns intelligence feeds for upcoming matches.
   * Pulls real fixtures from API-Football, joins real odds from OddsPAPI,
   * and calculates empirical edges against historical evidence via the active adapter.
   */
  public static async getTodaysMatches(): Promise<MatchIntelligence[]> {
    const adapter = HandicapLabAdapterFactory.getAdapter();
    const summary = await adapter.getDatasetSummary();

    // 1. Fetch real upcoming fixtures
    let upcomingFixtures: LiveFixtureDTO[] = [];
    if (this.apiFootball.isConfigured()) {
      const fixtureRes = await this.apiFootball.getUpcomingFixtures('39'); // Premier League ID: 39
      if (fixtureRes.status === 'AVAILABLE' && fixtureRes.data) {
        upcomingFixtures = fixtureRes.data;
      } else {
        Logger.warn('[MatchIntelligenceService] API-Football unavailable:', { error: fixtureRes.error });
      }
    }

    // If API-Football is unconfigured or returns empty, check adapter records (e.g. scheduled matches in DB or local dev)
    if (upcomingFixtures.length === 0) {
      try {
        const allRecords = await adapter.getAllRecords();
        const scheduled = allRecords.filter(r => r.status === 'SCHEDULED');
        if (scheduled.length > 0) {
          upcomingFixtures = scheduled.slice(0, 10).map(s => ({
            providerFixtureId: s.id,
            league: 'Premier League',
            season: s.season,
            kickoffTime: `${s.date}T15:00:00Z`,
            homeTeam: s.homeTeam,
            awayTeam: s.awayTeam,
            venue: `${s.homeTeam} Stadium`,
            status: 'SCHEDULED',
          }));
        }
      } catch (err) {
        Logger.warn('[MatchIntelligenceService] Could not retrieve fallback scheduled matches:', { error: String(err) });
      }
    }

    if (upcomingFixtures.length === 0) {
      return [];
    }

    // 2. For each real fixture, attempt to fetch live odds and evaluate the 3 markets
    const matches: MatchIntelligence[] = [];

    for (const fixture of upcomingFixtures) {
      let liveOdds: LiveOddsDTO[] = [];
      if (this.oddsPapi.isConfigured()) {
        const oddsRes = await this.oddsPapi.getMarketOdds(fixture.providerFixtureId);
        if (oddsRes.status === 'AVAILABLE' && oddsRes.data) {
          liveOdds = oddsRes.data;
        }
      }

      // Filter live odds strictly to the 3 approved markets
      const ahOdds = liveOdds.find(o => o.marketType === 'ASIAN_HANDICAP');
      const ouOdds = liveOdds.find(o => o.marketType === 'OVER_UNDER' && Math.abs(o.line - 2.5) < 0.01);
      const bttsOdds = liveOdds.find(o => o.marketType === 'BTTS');

      const ahMarket = await this.buildAhMarket(fixture, ahOdds, summary);
      const bttsMarket = await this.buildBttsMarket(fixture, bttsOdds, summary);
      const ouMarket = await this.buildOuMarket(fixture, ouOdds, summary);

      matches.push({
        id: fixture.providerFixtureId,
        fixtureId: fixture.providerFixtureId,
        homeTeam: fixture.homeTeam,
        awayTeam: fixture.awayTeam,
        league: fixture.league || 'Premier League',
        kickoffIso: fixture.kickoffTime,
        kickoffDisplay: `${fixture.kickoffTime.split('T')[0]} • ${fixture.kickoffTime.split('T')[1]?.slice(0, 5) || '15:00'} UTC`,
        venue: fixture.venue || `${fixture.homeTeam} Stadium`,
        isUpcoming: true,
        markets: {
          asianHandicap: ahMarket,
          btts: bttsMarket,
          overUnder: ouMarket,
        },
      });
    }

    return matches;
  }

  /**
   * Builds Asian Handicap market view.
   * Gated on real odds: if missing, explicitly returns ODDS_UNAVAILABLE (badge GREY).
   */
  private static async buildAhMarket(
    fixture: LiveFixtureDTO,
    oddsDto: LiveOddsDTO | undefined,
    summary: any
  ): Promise<MarketView> {
    const line = oddsDto ? oddsDto.line : 0;
    const lineLabel = line > 0 ? `+${line}` : `${line}`;

    if (!oddsDto || !oddsDto.homeOdds || !oddsDto.awayOdds) {
      return this.buildUnavailableMarket('ASIAN_HANDICAP', lineLabel, summary);
    }

    const odds = oddsDto.homeOdds;
    const oppOdds = oddsDto.awayOdds;

    const adapter = HandicapLabAdapterFactory.getAdapter();
    const historicalObs = await adapter.getHistoricalObservations({ line });
    const sampleSize = historicalObs.length;

    let wins = 0;
    let halfWins = 0;
    let pushes = 0;
    let halfLosses = 0;
    let losses = 0;

    for (const obs of historicalObs) {
      if (obs.settlement === 'WIN') wins++;
      else if (obs.settlement === 'HALF_WIN') halfWins++;
      else if (obs.settlement === 'PUSH') pushes++;
      else if (obs.settlement === 'HALF_LOSS') halfLosses++;
      else if (obs.settlement === 'LOSS') losses++;
    }

    const evaluated = sampleSize - pushes;
    const coverRatePct = evaluated > 0 ? Number((((wins + 0.5 * halfWins) / evaluated) * 100).toFixed(1)) : null;

    const devig = DevigEngine.devigTwoWay(odds, oppOdds);
    const impliedProbPct = Number((devig.impliedProbA * 100).toFixed(1));

    const decision = DecisionPolicy.evaluate({
      odds,
      oppositeOdds: oppOdds,
      modelProbPct: coverRatePct,
      impliedProbPct,
      sampleSize,
      dataQuality: 'PASS',
      validationStage: 'UNVERIFIED',
    });

    const provenance: DecisionProvenance = {
      source: `${oddsDto.bookmaker} / HandicapLab Canonical`,
      datasetVersion: summary?.version || 'v0.32.0',
      dateRange: 'Historical 2019-2026',
      league: fixture.league,
      market: 'Asian Handicap',
      line: `${fixture.homeTeam} ${lineLabel}`,
      sampleSize,
      settlementMethodology: 'Quarter-Line Split Settlement v1.0',
      validationStatus: 'UNVERIFIED',
      lastUpdate: summary?.lastUpdate || new Date().toISOString(),
      checksum: summary?.checksum || 'canonical',
    };

    return {
      marketType: 'ASIAN_HANDICAP',
      lineLabel,
      numericLine: line,
      selection: 'home',
      available: true,
      odds,
      oppositeOdds: oppOdds,
      bookmaker: oddsDto.bookmaker,
      badge: decision.badge,
      status: decision.status,
      statusLabel: decision.statusLabel,
      confidence: decision.confidence,
      confidenceScore: decision.confidenceScore,
      modelProbabilityPct: coverRatePct,
      marketImpliedProbabilityPct: impliedProbPct,
      edgePercentagePoints: decision.edgePercentagePoints,
      expectedValuePct: decision.expectedValuePct,
      sampleSize,
      dataQuality: 'PASS',
      validationStage: 'UNVERIFIED',
      settlementDistribution: {
        winPct: sampleSize > 0 ? Number(((wins / sampleSize) * 100).toFixed(1)) : 0,
        halfWinPct: sampleSize > 0 ? Number(((halfWins / sampleSize) * 100).toFixed(1)) : 0,
        pushPct: sampleSize > 0 ? Number(((pushes / sampleSize) * 100).toFixed(1)) : 0,
        halfLossPct: sampleSize > 0 ? Number(((halfLosses / sampleSize) * 100).toFixed(1)) : 0,
        lossPct: sampleSize > 0 ? Number(((losses / sampleSize) * 100).toFixed(1)) : 0,
      },
      reason: decision.reason,
      provenance,
    };
  }

  /**
   * Builds Both Teams To Score (BTTS) market view.
   * Gated on real odds: if missing, explicitly returns ODDS_UNAVAILABLE (badge GREY).
   */
  private static async buildBttsMarket(
    fixture: LiveFixtureDTO,
    oddsDto: LiveOddsDTO | undefined,
    summary: any
  ): Promise<MarketView> {
    if (!oddsDto || !oddsDto.homeOdds || !oddsDto.awayOdds) {
      return this.buildUnavailableMarket('BTTS', 'YES', summary);
    }

    const odds = oddsDto.homeOdds;
    const oppOdds = oddsDto.awayOdds;

    const adapter = HandicapLabAdapterFactory.getAdapter();
    const all = (await adapter.getAllRecords()).filter(r => r.homeGoals !== null && r.awayGoals !== null);
    const sampleSize = all.length;
    const bttsYesCount = all.filter(r => (r.homeGoals ?? 0) >= 1 && (r.awayGoals ?? 0) >= 1).length;
    const modelProbPct = sampleSize > 0 ? Number(((bttsYesCount / sampleSize) * 100).toFixed(1)) : null;

    const devig = DevigEngine.devigTwoWay(odds, oppOdds);
    const impliedProbPct = Number((devig.impliedProbA * 100).toFixed(1));

    const decision = DecisionPolicy.evaluate({
      odds,
      oppositeOdds: oppOdds,
      modelProbPct,
      impliedProbPct,
      sampleSize,
      dataQuality: 'PASS',
      validationStage: 'UNVERIFIED',
    });

    const provenance: DecisionProvenance = {
      source: `${oddsDto.bookmaker} / HandicapLab Canonical`,
      datasetVersion: summary?.version || 'v0.32.0',
      dateRange: 'Historical 2019-2026',
      league: fixture.league,
      market: 'Both Teams To Score',
      line: 'YES',
      sampleSize,
      settlementMethodology: 'Binary Settlement (Goals >= 1 Both)',
      validationStatus: 'UNVERIFIED',
      lastUpdate: summary?.lastUpdate || new Date().toISOString(),
      checksum: summary?.checksum || 'canonical',
    };

    return {
      marketType: 'BTTS',
      lineLabel: 'YES',
      selection: 'yes',
      available: true,
      odds,
      oppositeOdds: oppOdds,
      bookmaker: oddsDto.bookmaker,
      badge: decision.badge,
      status: decision.status,
      statusLabel: decision.statusLabel,
      confidence: decision.confidence,
      confidenceScore: decision.confidenceScore,
      modelProbabilityPct: modelProbPct,
      marketImpliedProbabilityPct: impliedProbPct,
      edgePercentagePoints: decision.edgePercentagePoints,
      expectedValuePct: decision.expectedValuePct,
      sampleSize,
      dataQuality: 'PASS',
      validationStage: 'UNVERIFIED',
      reason: decision.reason,
      provenance,
    };
  }

  /**
   * Builds Over / Under 2.5 market view.
   * Gated on real odds: if missing, explicitly returns ODDS_UNAVAILABLE (badge GREY).
   */
  private static async buildOuMarket(
    fixture: LiveFixtureDTO,
    oddsDto: LiveOddsDTO | undefined,
    summary: any
  ): Promise<MarketView> {
    if (!oddsDto || !oddsDto.homeOdds || !oddsDto.awayOdds) {
      return this.buildUnavailableMarket('OVER_UNDER', 'OVER 2.5', summary);
    }

    const odds = oddsDto.homeOdds;
    const oppOdds = oddsDto.awayOdds;

    const adapter = HandicapLabAdapterFactory.getAdapter();
    const all = (await adapter.getAllRecords()).filter(r => r.homeGoals !== null && r.awayGoals !== null);
    const sampleSize = all.length;
    const overCount = all.filter(r => ((r.homeGoals ?? 0) + (r.awayGoals ?? 0)) > 2.5).length;
    const modelProbPct = sampleSize > 0 ? Number(((overCount / sampleSize) * 100).toFixed(1)) : null;

    const devig = DevigEngine.devigTwoWay(odds, oppOdds);
    const impliedProbPct = Number((devig.impliedProbA * 100).toFixed(1));

    const decision = DecisionPolicy.evaluate({
      odds,
      oppositeOdds: oppOdds,
      modelProbPct,
      impliedProbPct,
      sampleSize,
      dataQuality: 'PASS',
      validationStage: 'UNVERIFIED',
    });

    const provenance: DecisionProvenance = {
      source: `${oddsDto.bookmaker} / HandicapLab Canonical`,
      datasetVersion: summary?.version || 'v0.32.0',
      dateRange: 'Historical 2019-2026',
      league: fixture.league,
      market: 'Over / Under Goals',
      line: 'OVER 2.5',
      sampleSize,
      settlementMethodology: 'Single Half-Line Goal Settlement (2.5 Goals)',
      validationStatus: 'UNVERIFIED',
      lastUpdate: summary?.lastUpdate || new Date().toISOString(),
      checksum: summary?.checksum || 'canonical',
    };

    return {
      marketType: 'OVER_UNDER',
      lineLabel: 'OVER 2.5',
      numericLine: 2.5,
      selection: 'over',
      available: true,
      odds,
      oppositeOdds: oppOdds,
      bookmaker: oddsDto.bookmaker,
      badge: decision.badge,
      status: decision.status,
      statusLabel: decision.statusLabel,
      confidence: decision.confidence,
      confidenceScore: decision.confidenceScore,
      modelProbabilityPct: modelProbPct,
      marketImpliedProbabilityPct: impliedProbPct,
      edgePercentagePoints: decision.edgePercentagePoints,
      expectedValuePct: decision.expectedValuePct,
      sampleSize,
      dataQuality: 'PASS',
      validationStage: 'UNVERIFIED',
      reason: decision.reason,
      provenance,
    };
  }

  /**
   * Intentional GREY unavailable market state with zero fake numbers.
   */
  private static buildUnavailableMarket(
    marketType: 'ASIAN_HANDICAP' | 'BTTS' | 'OVER_UNDER',
    lineLabel: string,
    summary: any
  ): MarketView {
    return {
      marketType,
      lineLabel,
      selection: 'none',
      available: false,
      odds: null,
      bookmaker: null,
      badge: 'GREY',
      status: 'ODDS_UNAVAILABLE',
      statusLabel: 'ODDS UNAVAILABLE',
      confidence: 'NONE',
      confidenceScore: 0,
      modelProbabilityPct: null,
      marketImpliedProbabilityPct: null,
      edgePercentagePoints: null,
      expectedValuePct: null,
      sampleSize: 0,
      dataQuality: 'NONE',
      validationStage: 'UNAVAILABLE',
      reason: 'Real bookmaker market odds are not currently published for this fixture.',
      provenance: {
        source: 'HandicapLab Registry',
        datasetVersion: summary?.version || 'v0.32.0',
        dateRange: 'Real-time',
        league: 'Premier League',
        market: marketType,
        line: lineLabel,
        sampleSize: 0,
        settlementMethodology: 'Unsettled',
        validationStatus: 'UNAVAILABLE',
        lastUpdate: new Date().toISOString(),
      },
    };
  }
}
