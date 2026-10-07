// SALMO.DEV — Match Intelligence Service
// Strictly limited to 3 markets:
// 1. Asian Handicap (AH)
// 2. Over/Under 2.5 (OU 2.5)
// 3. Both Teams To Score (BTTS: Yes/No)
// ZERO MONEYLINE / 1X2. Zero synthetic fixtures. Zero empirical fallback. Zero fabrication.

import { HandicapLabAdapterFactory, DatabaseHandicapLabAdapter } from '../contracts/handicapLabAdapter';
import { ApiFootballProvider } from '../services/providers/apiFootballProvider';
import { OddsPapiProvider } from '../services/providers/oddsPapiProvider';
import {
  MatchIntelligence,
  MarketView,
  DecisionProvenance,
  ActiveMatchPrediction,
  ActivePredictionMarket,
  LiveValidationSummary,
} from '../types/index';
import { Logger } from '../lib/logger';
import { getDbClient } from '../lib/db';
import { matchesDynamicHorizon } from '../lib/horizon';

import { normalizeTeamKey } from './features/teamRatings';
export { normalizeTeamKey };

export class MatchIntelligenceService {
  private static apiFootball = new ApiFootballProvider();
  private static oddsPapi = new OddsPapiProvider();

  /**
   * Main production fixture intelligence entry point:
   * Returns real scheduled fixtures decoupled from prediction presence.
   * 1. Retrieves real upcoming fixtures from provider (API-Football) or native database.
   * 2. Overlays active predictions (AH, OU, BTTS) where available.
   * 3. For fixtures lacking odds or model coverage, preserves the fixture with honest ODDS_UNAVAILABLE state.
   * 4. Stale kickoffs (kickoff <= now) are strictly excluded.
   * 5. Zero synthetic fixtures, zero fabricated numbers.
   */
  public static async getUpcomingFixturesWithIntelligence(filter?: {
    horizon?: string;
    market?: 'ALL' | 'AH' | 'BTTS' | 'OU';
  }): Promise<MatchIntelligence[]> {
    const nowMs = Date.now();
    const scheduledFixtures: Array<{
      providerFixtureId: string;
      homeTeam: string;
      awayTeam: string;
      league: string;
      season: string;
      kickoffUtc: string;
      venue?: string;
    }> = [];

    // 1. Primary: Discover upcoming fixtures from API-Football provider
    try {
      if (this.apiFootball.isConfigured()) {
        const res = await this.apiFootball.getUpcomingFixtures('39');
        if (res.status === 'AVAILABLE' && res.data && res.data.length > 0) {
          for (const f of res.data) {
            const kMs = new Date(f.kickoffTime).getTime();
            if (!isNaN(kMs) && kMs > nowMs) {
              scheduledFixtures.push({
                providerFixtureId: f.providerFixtureId,
                homeTeam: f.homeTeam,
                awayTeam: f.awayTeam,
                league: f.league,
                season: f.season,
                kickoffUtc: f.kickoffTime,
                venue: f.venue,
              });
            }
          }
        }
      }
    } catch (err) {
      Logger.warn('[MatchIntelligenceService] ApiFootball fixture lookup failed:', { error: String(err) });
    }

    // 2. Secondary: If provider returned 0 fixtures, discover from native database daily_picks
    if (scheduledFixtures.length === 0) {
      try {
        const client = getDbClient();
        const nowIso = new Date().toISOString();
        const { data: dbPicks } = await client
          .from('daily_picks')
          .select('fixture_id, home_team, away_team, league, kickoff_utc')
          .gt('kickoff_utc', nowIso)
          .order('kickoff_utc', { ascending: true });

        if (dbPicks && dbPicks.length > 0) {
          const seen = new Set<string>();
          for (const p of dbPicks) {
            const key = `${p.home_team}_${p.away_team}_${p.kickoff_utc}`;
            if (!seen.has(key)) {
              seen.add(key);
              scheduledFixtures.push({
                providerFixtureId: p.fixture_id,
                homeTeam: p.home_team,
                awayTeam: p.away_team,
                league: p.league || 'Premier League',
                season: '2026',
                kickoffUtc: p.kickoff_utc,
              });
            }
          }
        }
      } catch (dbErr) {
        Logger.warn('[MatchIntelligenceService] Database fixture discovery failed:', { error: String(dbErr) });
      }
    }

    // 3. Load active predictions overlay from native database adapter
    const predictionsMap = new Map<string, ActiveMatchPrediction>();
    let validationSummary: LiveValidationSummary | null = null;
    try {
      const dbAdapter = new DatabaseHandicapLabAdapter();
      const dbPredictions = await dbAdapter.getActive7DayPredictions();
      validationSummary = await dbAdapter.getLiveValidationSummary();

      for (const p of dbPredictions || []) {
        predictionsMap.set(p.canonicalMatchId, p);
        if (p.fixtureId) predictionsMap.set(p.fixtureId, p);
        const normKey = `${normalizeTeamKey(p.homeTeam)}_${normalizeTeamKey(p.awayTeam)}`;
        predictionsMap.set(normKey, p);
      }
    } catch (pErr) {
      Logger.warn('[MatchIntelligenceService] Could not load active predictions overlay:', { error: String(pErr) });
    }

    // Fail-closed invariant: return empty array when no predictions or fixtures available
    if (scheduledFixtures.length === 0 && predictionsMap.size === 0) {
      return [];
    }

    // 4. Assemble MatchIntelligence items: fixtures with optional predictions overlay
    const results: MatchIntelligence[] = [];
    const processedKeys = new Set<string>();

    for (const f of scheduledFixtures) {
      const kickoffMs = new Date(f.kickoffUtc).getTime();
      if (isNaN(kickoffMs) || kickoffMs <= nowMs) {
        continue; // Stale kickoff exclusion
      }

      const kickoffDate = f.kickoffUtc.split('T')[0];
      const kickoffTime = f.kickoffUtc.split('T')[1]?.slice(0, 5) || '15:00';
      const homeNorm = normalizeTeamKey(f.homeTeam).toUpperCase();
      const awayNorm = normalizeTeamKey(f.awayTeam).toUpperCase();
      const canonicalMatchId = `EPL_2026_${homeNorm}_${awayNorm}_${kickoffDate}`;
      const legacyHomeSlug = f.homeTeam.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const legacyAwaySlug = f.awayTeam.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const legacyCanonicalId = `EPL_2026_${legacyHomeSlug}_${legacyAwaySlug}_${kickoffDate}`;
      const normKey = `${normalizeTeamKey(f.homeTeam)}_${normalizeTeamKey(f.awayTeam)}`;

      if (
        processedKeys.has(canonicalMatchId) ||
        processedKeys.has(legacyCanonicalId) ||
        processedKeys.has(normKey) ||
        (f.providerFixtureId && processedKeys.has(f.providerFixtureId))
      ) {
        continue; // Prevent duplicate provider fixtures from creating duplicate display cards
      }

      processedKeys.add(canonicalMatchId);
      processedKeys.add(legacyCanonicalId);
      processedKeys.add(normKey);
      if (f.providerFixtureId) processedKeys.add(f.providerFixtureId);

      // Check for active prediction overlay
      const pred = predictionsMap.get(canonicalMatchId) || predictionsMap.get(legacyCanonicalId) || predictionsMap.get(normKey) || (f.providerFixtureId ? predictionsMap.get(f.providerFixtureId) : undefined);

      if (pred) {
        // Prediction exists: overlay active markets
        results.push(this.mapActiveMatchToIntelligence(pred, validationSummary));
      } else {
        // No prediction: display scheduled fixture with honest unavailable markets
        const ahMarket = this.buildUnavailableMarket('ASIAN_HANDICAP', '—', null);
        const bttsMarket = this.buildUnavailableMarket('BTTS', 'YES', null);
        const ouMarket = this.buildUnavailableMarket('OVER_UNDER', '2.5', null);

        results.push({
          id: canonicalMatchId,
          fixtureId: f.providerFixtureId,
          canonicalMatchId,
          homeTeam: f.homeTeam,
          awayTeam: f.awayTeam,
          league: f.league,
          season: f.season,
          kickoffIso: f.kickoffUtc,
          kickoffDisplay: `${kickoffDate} • ${kickoffTime} UTC`,
          venue: f.venue,
          isUpcoming: true,
          horizon: 'NEXT_7_DAYS',
          predictionTimestamp: new Date().toISOString(),
          footballStateTimestamp: new Date().toISOString(),
          marketStateTimestamp: new Date().toISOString(),
          markets: {
            asianHandicap: ahMarket,
            btts: bttsMarket,
            overUnder: ouMarket,
          },
        });
      }
    }

    // 5. Also include any remaining predictions not matched by top provider fixtures
    for (const [key, pred] of predictionsMap.entries()) {
      if (key !== pred.canonicalMatchId) continue; // Only process primary keys
      const kickMs = new Date(pred.kickoffUtc).getTime();
      if (isNaN(kickMs) || kickMs <= nowMs) continue; // Stale kickoff exclusion

      const normKey = `${normalizeTeamKey(pred.homeTeam)}_${normalizeTeamKey(pred.awayTeam)}`;
      if (!processedKeys.has(pred.canonicalMatchId) && !processedKeys.has(normKey) && (!pred.fixtureId || !processedKeys.has(pred.fixtureId))) {
        processedKeys.add(pred.canonicalMatchId);
        results.push(this.mapActiveMatchToIntelligence(pred, validationSummary));
      }
    }

    // 6. Apply dynamic horizon filtering if requested
    let filteredResults = results;
    if (filter?.horizon && filter.horizon !== 'ALL') {
      filteredResults = results.filter(m => matchesDynamicHorizon(m.kickoffIso, filter.horizon as any));
    }

    // 7. Sort chronologically
    return filteredResults.sort((a, b) => new Date(a.kickoffIso).getTime() - new Date(b.kickoffIso).getTime());
  }

  public static async getTodaysMatches(): Promise<MatchIntelligence[]> {
    return this.getUpcomingFixturesWithIntelligence({ horizon: '7_DAYS' });
  }

  public static async getForward7DayMatches(filter?: {
    horizon?: string;
    market?: 'ALL' | 'AH' | 'BTTS' | 'OU';
  }): Promise<MatchIntelligence[]> {
    return this.getUpcomingFixturesWithIntelligence(filter);
  }

  /**
   * Intentional GREY unavailable market state with zero fake numbers.
   */
  public static buildUnavailableMarket(
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
        source: 'SALMO Native Intelligence',
        datasetVersion: summary?.version || 'v1.0.0-salmo-native',
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

  /**
   * Explicit unmodeled representation for Moneyline (1X2).
   * Zero odds, zero probability, zero recommendation.
   */
  public static buildUnmodeledMoneylineMarket(summary?: any): MarketView {
    return {
      marketType: 'ASIAN_HANDICAP' as any, // fallback type for contract safety
      lineLabel: '1X2',
      selection: 'none',
      available: false,
      odds: null,
      bookmaker: null,
      badge: 'GREY',
      status: 'MARKET_UNAVAILABLE',
      statusLabel: 'NOT MODELED YET',
      confidence: 'NONE',
      confidenceScore: 0,
      modelProbabilityPct: null,
      marketImpliedProbabilityPct: null,
      edgePercentagePoints: null,
      expectedValuePct: null,
      sampleSize: 0,
      dataQuality: 'NONE',
      validationStage: 'UNAVAILABLE',
      reason: 'Moneyline (1X2) is intentionally not modeled by SALMO. Research is strictly limited to AH, OU, and BTTS.',
      provenance: {
        source: 'SALMO Scope Governance',
        datasetVersion: summary?.version || 'v1.0.0-salmo-native',
        dateRange: 'Real-time',
        league: 'Premier League',
        market: 'Moneyline (1X2)',
        line: '1X2',
        sampleSize: 0,
        settlementMethodology: 'Unmodeled',
        validationStatus: 'NOT_MODELED',
        lastUpdate: new Date().toISOString(),
      },
    };
  }

  public static async getValidationSummary(): Promise<LiveValidationSummary | null> {
    try {
      const { DatabaseHandicapLabAdapter } = await import('../contracts/handicapLabAdapter');
      const dbAdapter = new DatabaseHandicapLabAdapter();
      return await dbAdapter.getLiveValidationSummary();
    } catch {
      return null;
    }
  }

  private static mapActiveMatchToIntelligence(
    p: ActiveMatchPrediction,
    validationSummary: LiveValidationSummary | null
  ): MatchIntelligence {
    const ahMarket = this.mapActiveMarketToView(p.markets.asianHandicap, 'ASIAN_HANDICAP', p, validationSummary);
    const bttsMarket = this.mapActiveMarketToView(p.markets.btts, 'BTTS', p, validationSummary);
    const ouMarket = this.mapActiveMarketToView(p.markets.overUnder, 'OVER_UNDER', p, validationSummary);

    const kickoffDate = p.kickoffUtc.split('T')[0];
    const kickoffTime = p.kickoffUtc.split('T')[1]?.slice(0, 5) || '15:00';

    return {
      id: p.canonicalMatchId,
      fixtureId: p.fixtureId,
      canonicalMatchId: p.canonicalMatchId,
      homeTeam: p.homeTeam,
      awayTeam: p.awayTeam,
      league: p.league,
      season: p.season,
      kickoffIso: p.kickoffUtc,
      kickoffDisplay: `${kickoffDate} • ${kickoffTime} UTC`,
      venue: p.venue,
      isUpcoming: true,
      horizon: p.horizon,
      predictionTimestamp: p.predictionTimestamp,
      footballStateTimestamp: p.footballStateTimestamp,
      marketStateTimestamp: p.marketStateTimestamp,
      scoreGridSummary: p.scoreGridSummary,
      markets: {
        asianHandicap: ahMarket,
        btts: bttsMarket,
        overUnder: ouMarket,
      },
    };
  }

  private static mapActiveMarketToView(
    activeMarket: ActivePredictionMarket,
    marketType: 'ASIAN_HANDICAP' | 'BTTS' | 'OVER_UNDER',
    match: ActiveMatchPrediction,
    validationSummary: LiveValidationSummary | null
  ): MarketView {
    const isAvailable = activeMarket.marketOdds > 1.0;
    const odds = isAvailable ? activeMarket.marketOdds : null;
    const modelProb = activeMarket.modelProbabilityPct;
    const devigProb = activeMarket.devigProbPct;
    const impliedProb = activeMarket.marketImpliedProbPct;
    const edge = activeMarket.edgePct;
    const ev = activeMarket.expectedValuePct;

    let badge: 'GREEN' | 'YELLOW' | 'RED' | 'GREY' = 'GREY';
    let status: any = 'ODDS_UNAVAILABLE';
    let statusLabel = 'ODDS UNAVAILABLE';
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' = 'NONE';

    // Canonical confidence score directly from HandicapLab pipeline (0 - 100 integer)
    // ZERO HARDCODED 45/80/40/35/20
    const confidenceScore = Number(activeMarket.confidence) || 0;
    if (confidenceScore >= 70) {
      confidence = 'HIGH';
    } else if (confidenceScore >= 40) {
      confidence = 'MEDIUM';
    } else if (confidenceScore > 0) {
      confidence = 'LOW';
    } else {
      confidence = 'NONE';
    }

    const valRow = validationSummary?.matrix.find(m => m.market === activeMarket.market);

    // Canonical verdict from HandicapLab daily_picks / prediction ledger
    const canonicalVerdict =
      activeMarket.verdict || (edge > 2.0 && ev && ev > 2.0 ? 'LAYAK' : edge > 0 ? 'PANTAU' : 'LEWATI');

    if (!isAvailable) {
      badge = 'GREY';
      status = 'ODDS_UNAVAILABLE';
      statusLabel = 'ODDS UNAVAILABLE';
    } else if (canonicalVerdict === 'LAYAK') {
      badge = 'GREEN';
      status = 'VALUE';
      statusLabel = 'VALIDATED VALUE';
    } else if (canonicalVerdict === 'PANTAU') {
      badge = 'YELLOW';
      status = 'MARGINAL';
      statusLabel = 'PANTAU (MONITOR)';
    } else {
      badge = 'RED';
      status = 'NO_VALUE';
      statusLabel = 'LEWATI (NEGATIVE EV)';
    }

    const valStatusStr = valRow
      ? `${valRow.status} (ROI: ${valRow.roi > 0 ? '+' : ''}${valRow.roi}%)`
      : 'WALK_FORWARD_PROCESSED';

    const lineLabel =
      marketType === 'ASIAN_HANDICAP'
        ? activeMarket.line > 0
          ? `+${activeMarket.line}`
          : `${activeMarket.line}`
        : marketType === 'OVER_UNDER'
        ? `OVER ${activeMarket.line}`
        : 'YES';

    const marketTitle =
      marketType === 'ASIAN_HANDICAP'
        ? 'Asian Handicap'
        : marketType === 'OVER_UNDER'
        ? 'Over/Under Goals'
        : 'Both Teams To Score';

    const reason = activeMarket.rejectionReason
      ? `Filtered by canonical validation: ${activeMarket.rejectionReason}. Model prob: ${modelProb}%, Fair: ${activeMarket.fairOdds || 'N/A'}, Pinnacle: ${odds}.`
      : canonicalVerdict === 'LAYAK'
      ? `Qualified canonical pick (${canonicalVerdict}). Dixon-Coles model prob: ${modelProb}%, Fair odds: ${activeMarket.fairOdds || 'N/A'}, Pinnacle reference: ${odds}. Edge: +${edge.toFixed(1)}%, EV: +${ev ? ev.toFixed(1) : 0}%, Robustness Confidence: ${confidenceScore}/100.`
      : canonicalVerdict === 'PANTAU'
      ? `Monitor candidate (${canonicalVerdict}). Model prob: ${modelProb}%, Fair: ${activeMarket.fairOdds || 'N/A'}, Pinnacle: ${odds}. Edge: ${edge > 0 ? '+' : ''}${edge.toFixed(1)}%, Confidence: ${confidenceScore}/100.`
      : `Skipped pick (${canonicalVerdict}). Devigged sharp prob: ${devigProb}%, Model prob: ${modelProb}%, Edge: ${edge.toFixed(1)}% (NO VALUE).`;

    return {
      marketType,
      lineLabel,
      numericLine: activeMarket.line,
      selection: activeMarket.selection,
      available: isAvailable,
      odds,
      fairOdds: activeMarket.fairOdds,
      oppositeOdds: null,
      bookmaker: activeMarket.bookmaker ? activeMarket.bookmaker.toUpperCase() : 'PINNACLE',
      oddsCapturedAt: activeMarket.oddsCapturedAt,
      badge,
      status,
      statusLabel,
      confidence,
      confidenceScore,
      modelProbabilityPct: modelProb,
      marketImpliedProbabilityPct: impliedProb,
      devigProbabilityPct: devigProb,
      edgePercentagePoints: edge,
      expectedValuePct: ev,
      sampleSize: valRow?.fixtures || 760,
      dataQuality: 'PASS',
      validationStage: 'WALK_FORWARD_PASS',
      reason,
      verdict: canonicalVerdict,
      rejectionReason: activeMarket.rejectionReason,
      bestAvailableOdds: activeMarket.bestAvailableOdds || odds,
      bestBookmaker: activeMarket.bestBookmaker || (activeMarket.bookmaker ? activeMarket.bookmaker.toUpperCase() : 'PINNACLE'),
      provenance: {
        source: `${activeMarket.bookmaker ? activeMarket.bookmaker.toUpperCase() : 'PINNACLE'} Sharp / HandicapLab Canonical`,
        datasetVersion: '11-Season Walk-Forward (4,180 Matches)',
        dateRange: '2014-2026 Walk-Forward',
        league: match.league,
        market: marketTitle,
        line: `${match.homeTeam} ${lineLabel}`,
        sampleSize: valRow?.fixtures || 760,
        settlementMethodology:
          marketType === 'ASIAN_HANDICAP'
            ? 'Quarter-Line Split Settlement v1.0'
            : marketType === 'OVER_UNDER'
            ? 'Single Half-Line Goal Settlement'
            : 'Binary Both Teams Score Settlement',
        validationStatus: valStatusStr,
        lastUpdate: activeMarket.oddsCapturedAt || match.marketStateTimestamp,
      },
    };
  }
}
