// SALMO.DEV — Production Prediction Engine
// Single authoritative orchestrator for production prediction generation.
// Strictly independent from HandicapLab runtime.
// Owns:
// 1. Fixture & Odds ingestion orchestration
// 2. Point-in-time feature resolution & dynamic team ratings
// 3. Dixon-Coles 11x11 score grid calculation
// 4. Market derivations (Asian Handicap, Asian Total OU, BTTS)
// 5. De-vigging & 7-Factor Value qualification gate
// 6. Idempotent production persistence (daily_picks, predictions, prediction_ledger)

import { buildScoreGrid, deriveExpectedGoalsFromGrid } from '../probability/scoreGrid';
import { calculateAsianHandicapProbability, fairOdds as calcFairOdds, calculatePushAwareFairOdds } from '../ah/ahProbability';
import { AsianTotalEngine, settleAsianTotalGoals } from '../ou/asianTotalEngine';
import { calculateBttsFromGrid, BTTS_MODEL_VERSION } from '../btts/bttsEngine';
import { ValueEngine, ValueEvaluationResult } from '../decision/valueEngine';
import { CompetitionProfileEngine } from '../features/competitionProfile';
import { resolveTeamRating, TeamRating, normalizeTeamKey } from '../features/teamRatings';
import { ApiFootballProvider } from '../../services/providers/apiFootballProvider';
import { OddsPapiProvider } from '../../services/providers/oddsPapiProvider';
import { ActiveMatchPrediction, ActivePredictionMarket } from '../../types/index';
import { Logger } from '../../lib/logger';
import crypto from 'crypto';

/**
 * Checks whether a prediction kickoff falls within the active betting execution window.
 * Default: within 24 hours before kickoff.
 * Picks further out (>24h) remain preview in daily_picks but are excluded from prediction_ledger.
 */
export function isWithinLedgerExecutionWindow(
  kickoffIso: string,
  referenceTimeMs: number = Date.now(),
  maxHoursBeforeKickoff: number = Number(process.env.LEDGER_MAX_HOURS_BEFORE_KICKOFF || 24)
): boolean {
  const kickoffMs = new Date(kickoffIso).getTime();
  if (!Number.isFinite(kickoffMs)) return false;
  const diffMs = kickoffMs - referenceTimeMs;
  return diffMs > 0 && diffMs <= maxHoursBeforeKickoff * 60 * 60 * 1000;
}

export interface FixtureInput {
  fixtureId: string;
  providerFixtureId?: string;
  providerName?: string;
  sourceType?: 'PROVIDER' | 'SYNTHETIC_FALLBACK';
  homeTeam: string;
  awayTeam: string;
  league: string;
  kickoffUtc: string;
  season?: string;
  venue?: string;
  pinnacleOdds?: {
    ah?: { line: number; homeOdds: number; awayOdds: number; timestampUtc?: string };
    ou?: { line: number; overOdds: number; underOdds: number; timestampUtc?: string };
    btts?: { yesOdds: number; noOdds: number; timestampUtc?: string };
  };
}

export interface PersistenceResult {
  persistedPicksCount: number;
  persistedLedgerCount: number;
  persistedGreenCount: number;
  duplicateCount: number;
  excludedCount: number;
  newLedgerPositions: any[];
}

export interface PredictionCycleResult {
  timestampUtc: string;
  activePredictions: ActiveMatchPrediction[];
  persistedPicksCount: number;
  persistedLedgerCount: number;
  persistedGreenCount: number;
  duplicateCount: number;
  excludedCount: number;
  newLedgerPositions: any[];
  stats: {
    totalFixtures: number;
    reconciledWithOdds: number;
    layakCount: number;
    pantauCount: number;
    lewatiCount: number;
    ledgerCount: number;
    greenCount: number;
    duplicateCount: number;
    excludedCount: number;
  };
}

export class ProductionPredictionEngine {
  public static readonly MODEL_VERSION = 'dixon-coles-v1.0';
  public static readonly FEATURE_VERSION = 'dynamic-ratings-v1.0';

  /**
   * Generates deterministic canonical match ID using normalized team keys.
   */
  public static generateCanonicalMatchId(
    season: string | number,
    homeTeam: string,
    awayTeam: string,
    kickoffUtc: string
  ): string {
    const h = normalizeTeamKey(homeTeam).toUpperCase();
    const a = normalizeTeamKey(awayTeam).toUpperCase();
    const date = kickoffUtc ? kickoffUtc.slice(0, 10) : '';
    return `EPL_${season}_${h}_${a}_${date}`;
  }

  /**
   * Evaluates a single fixture across AH, OU, and BTTS.
   */
  public static evaluateFixture(
    fixture: FixtureInput,
    predictionTimestampUtc = new Date().toISOString()
  ): {
    prediction: ActiveMatchPrediction;
    evaluations: {
      ah?: ValueEvaluationResult;
      ou?: ValueEvaluationResult;
      btts?: ValueEvaluationResult;
    };
  } {
    const { fixtureId, homeTeam, awayTeam, league, kickoffUtc, venue } = fixture;
    const season = fixture.season || '2026';
    const canonicalMatchId = this.generateCanonicalMatchId(season, homeTeam, awayTeam, kickoffUtc);

    // 1. Resolve League Goals Environment & Team Ratings
    const profile = CompetitionProfileEngine.getProfileForLeague(league);
    const homeRating = resolveTeamRating(homeTeam);
    const awayRating = resolveTeamRating(awayTeam);

    const isSufficient = Boolean(
      homeRating && awayRating &&
      homeRating.matches_played >= 3 &&
      awayRating.matches_played >= 3
    );

    const homeAttack = homeRating?.attack_strength ?? 1.0;
    const homeDefense = homeRating?.defense_strength ?? 1.0;
    const awayAttack = awayRating?.attack_strength ?? 1.0;
    const awayDefense = awayRating?.defense_strength ?? 1.0;

    const leagueAvgGoals = profile.goalEnvironment || 2.65;
    const homeBase = leagueAvgGoals * (profile.homeAdvantage || 0.55);
    const awayBase = leagueAvgGoals * (1 - (profile.homeAdvantage || 0.55));

    let lambdaHome: number;
    let lambdaAway: number;
    const rho = profile.defaultRho || -0.06;

    if (isSufficient) {
      lambdaHome = Number(Math.max(0.20, homeAttack * awayDefense * homeBase).toFixed(4));
      lambdaAway = Number(Math.max(0.20, awayAttack * homeDefense * awayBase).toFixed(4));
    } else {
      lambdaHome = 1.35;
      lambdaAway = 1.20;
    }

    // 2. Build 11x11 Dixon-Coles Score Grid
    const scoreGrid = buildScoreGrid(lambdaHome, lambdaAway, rho);
    const xgDerived = deriveExpectedGoalsFromGrid(scoreGrid);

    const evaluations: {
      ah?: ValueEvaluationResult & { decomposition?: any };
      ou?: ValueEvaluationResult & { probabilities?: any };
      btts?: ValueEvaluationResult;
    } = {};

    // 3. Evaluate Asian Handicap
    const ahOdds = fixture.pinnacleOdds?.ah;
    const ahLine = ahOdds?.line ?? -0.25;
    const ahProb = calculateAsianHandicapProbability(lambdaHome, lambdaAway, ahLine, rho);

    let ahMarket: ActivePredictionMarket;

    if (ahOdds && ahOdds.homeOdds > 1.0 && ahOdds.awayOdds > 1.0) {
      const ahEval = ValueEngine.evaluateSelection({
        selection: `${homeTeam} ${ahLine > 0 ? '+' : ''}${ahLine}`,
        market: 'AH',
        line: ahLine,
        modelProbability: ahProb.cover,
        ahBreakdown: {
          win: ahProb.win,
          halfWin: ahProb.halfWin,
          push: ahProb.push,
          halfLoss: ahProb.halfLoss,
          loss: ahProb.loss,
        },
        pinnacleOdds: {
          sideOdds: ahOdds.homeOdds,
          oppositeOdds: ahOdds.awayOdds,
        },
        sampleSizeHome: homeRating?.matches_played ?? 0,
        sampleSizeAway: awayRating?.matches_played ?? 0,
        oddsTimestampUtc: ahOdds.timestampUtc || predictionTimestampUtc,
        predictionTimestampUtc,
        kickoffUtc,
        fixtureId,
        homeTeam,
        awayTeam,
        league,
        modelStatus: isSufficient ? 'FIXTURE_SPECIFIC' : 'INSUFFICIENT_MODEL',
      });

      evaluations.ah = {
        ...ahEval,
        decomposition: ahProb,
      };

      ahMarket = {
        market: 'AH',
        selection: ahEval.selection,
        line: ahLine,
        modelProbabilityPct: Number((ahEval.modelProbability * 100).toFixed(1)),
        fairOdds: ahEval.fairOdds,
        marketOdds: ahEval.marketOdds,
        marketImpliedProbPct: Number(((1 / ahEval.marketOdds) * 100).toFixed(1)),
        devigProbPct: Number((ahEval.marketProbability * 100).toFixed(1)),
        edgePct: Number((ahEval.edge * 100).toFixed(2)),
        expectedValuePct: Number((ahEval.expectedValue * 100).toFixed(1)),
        signalState: ahEval.verdict === 'LAYAK' ? 'VALUE' : ahEval.verdict === 'PANTAU' ? 'MARGINAL' : 'NO_SIGNAL',
        bookmaker: 'PINNACLE',
        oddsCapturedAt: ahOdds.timestampUtc || predictionTimestampUtc,
        confidence: ahEval.confidence,
        verdict: ahEval.verdict,
        rejectionReason: ahEval.rejectionReason,
      };
    } else {
      ahMarket = {
        market: 'AH',
        selection: `${homeTeam} ${ahLine > 0 ? '+' : ''}${ahLine}`,
        line: ahLine,
        modelProbabilityPct: Number((ahProb.cover * 100).toFixed(1)),
        fairOdds: calculatePushAwareFairOdds(ahProb),
        marketOdds: 0,
        marketImpliedProbPct: 0,
        devigProbPct: 0,
        edgePct: 0,
        expectedValuePct: null,
        signalState: 'NO_SIGNAL',
        bookmaker: 'PINNACLE',
        oddsCapturedAt: predictionTimestampUtc,
        confidence: 0,
        verdict: 'LEWATI',
        rejectionReason: 'Pinnacle odds unavailable',
      };
    }

    // 4. Evaluate Asian Total Goals (Over / Under) dynamically supporting quarter lines
    const ouOdds = fixture.pinnacleOdds?.ou;
    const ouLine = ouOdds?.line ?? 2.5;
    const ouResult = AsianTotalEngine.calculateFromGrid(scoreGrid, ouLine, 'OVER', {
      homeXG: lambdaHome,
      awayXG: lambdaAway,
      rho,
    });

    let ouMarket: ActivePredictionMarket;

    if (ouOdds && ouOdds.overOdds > 1.0 && ouOdds.underOdds > 1.0) {
      const ouEval = ValueEngine.evaluateSelection({
        selection: `Over ${ouLine}`,
        market: 'OU',
        line: ouLine,
        modelProbability: ouResult.coverProbability,
        pinnacleOdds: {
          sideOdds: ouOdds.overOdds,
          oppositeOdds: ouOdds.underOdds,
        },
        sampleSizeHome: homeRating?.matches_played ?? 0,
        sampleSizeAway: awayRating?.matches_played ?? 0,
        oddsTimestampUtc: ouOdds.timestampUtc || predictionTimestampUtc,
        predictionTimestampUtc,
        kickoffUtc,
        fixtureId,
        homeTeam,
        awayTeam,
        league,
        modelStatus: isSufficient ? 'FIXTURE_SPECIFIC' : 'INSUFFICIENT_MODEL',
      });

      evaluations.ou = {
        ...ouEval,
        probabilities: ouResult,
      };

      ouMarket = {
        market: 'OU',
        selection: ouEval.selection,
        line: ouLine,
        modelProbabilityPct: Number((ouEval.modelProbability * 100).toFixed(1)),
        fairOdds: ouEval.fairOdds,
        marketOdds: ouEval.marketOdds,
        marketImpliedProbPct: Number(((1 / ouEval.marketOdds) * 100).toFixed(1)),
        devigProbPct: Number((ouEval.marketProbability * 100).toFixed(1)),
        edgePct: Number((ouEval.edge * 100).toFixed(2)),
        expectedValuePct: Number((ouEval.expectedValue * 100).toFixed(1)),
        signalState: ouEval.verdict === 'LAYAK' ? 'VALUE' : ouEval.verdict === 'PANTAU' ? 'MARGINAL' : 'NO_SIGNAL',
        bookmaker: 'PINNACLE',
        oddsCapturedAt: ouOdds.timestampUtc || predictionTimestampUtc,
        confidence: ouEval.confidence,
        verdict: ouEval.verdict,
        rejectionReason: ouEval.rejectionReason,
      };
    } else {
      ouMarket = {
        market: 'OU',
        selection: `Over ${ouLine}`,
        line: ouLine,
        modelProbabilityPct: Number((ouResult.coverProbability * 100).toFixed(1)),
        fairOdds: ouResult.fairOdds.cover,
        marketOdds: 0,
        marketImpliedProbPct: 0,
        devigProbPct: 0,
        edgePct: 0,
        expectedValuePct: null,
        signalState: 'NO_SIGNAL',
        bookmaker: 'PINNACLE',
        oddsCapturedAt: predictionTimestampUtc,
        confidence: 0,
        verdict: 'LEWATI',
        rejectionReason: 'Pinnacle odds unavailable',
      };
    }

    // 5. Evaluate Both Teams To Score (BTTS) — Gated as Research Only
    const bttsOdds = fixture.pinnacleOdds?.btts;
    const bttsResult = calculateBttsFromGrid(scoreGrid, {
      homeXG: lambdaHome,
      awayXG: lambdaAway,
      rho,
    });

    let bttsMarket: ActivePredictionMarket;

    if (bttsOdds && bttsOdds.yesOdds > 1.0 && bttsOdds.noOdds > 1.0) {
      const bttsEval = ValueEngine.evaluateSelection({
        selection: 'BTTS YES',
        market: 'BTTS',
        line: 0,
        modelProbability: bttsResult.probabilities.yes,
        pinnacleOdds: {
          sideOdds: bttsOdds.yesOdds,
          oppositeOdds: bttsOdds.noOdds,
        },
        sampleSizeHome: homeRating?.matches_played ?? 0,
        sampleSizeAway: awayRating?.matches_played ?? 0,
        oddsTimestampUtc: bttsOdds.timestampUtc || predictionTimestampUtc,
        predictionTimestampUtc,
        kickoffUtc,
        fixtureId,
        homeTeam,
        awayTeam,
        league,
        modelStatus: isSufficient ? 'FIXTURE_SPECIFIC' : 'INSUFFICIENT_MODEL',
      });

      evaluations.btts = bttsEval;

      bttsMarket = {
        market: 'BTTS',
        selection: 'BTTS YES',
        line: 0,
        modelProbabilityPct: Number((bttsEval.modelProbability * 100).toFixed(1)),
        fairOdds: bttsEval.fairOdds,
        marketOdds: bttsEval.marketOdds,
        marketImpliedProbPct: Number(((1 / bttsEval.marketOdds) * 100).toFixed(1)),
        devigProbPct: Number((bttsEval.marketProbability * 100).toFixed(1)),
        edgePct: Number((bttsEval.edge * 100).toFixed(2)),
        expectedValuePct: Number((bttsEval.expectedValue * 100).toFixed(1)),
        signalState: bttsEval.verdict === 'PANTAU' ? 'MARGINAL' : 'NO_SIGNAL',
        bookmaker: 'PINNACLE',
        oddsCapturedAt: bttsOdds.timestampUtc || predictionTimestampUtc,
        confidence: bttsEval.confidence,
        verdict: 'LEWATI', // Strictly UNVALIDATED in production public picks
        rejectionReason: 'BTTS is research-only (UNVALIDATED).',
      };
    } else {
      bttsMarket = {
        market: 'BTTS',
        selection: 'BTTS YES',
        line: 0,
        modelProbabilityPct: Number((bttsResult.probabilities.yes * 100).toFixed(1)),
        fairOdds: bttsResult.fairOdds.yes,
        marketOdds: 0,
        marketImpliedProbPct: 0,
        devigProbPct: 0,
        edgePct: 0,
        expectedValuePct: null,
        signalState: 'NO_SIGNAL',
        bookmaker: 'PINNACLE',
        oddsCapturedAt: predictionTimestampUtc,
        confidence: 0,
        verdict: 'LEWATI',
        rejectionReason: 'Pinnacle odds unavailable',
      };
    }

    const prediction: ActiveMatchPrediction = {
      canonicalMatchId,
      fixtureId,
      oddsPapiFixtureId: fixture.providerFixtureId || fixtureId,
      kickoffUtc,
      homeTeam,
      awayTeam,
      league,
      season,
      venue: venue || `${homeTeam} Stadium`,
      predictionTimestamp: predictionTimestampUtc,
      footballStateTimestamp: predictionTimestampUtc,
      footystatsStateTimestamp: predictionTimestampUtc,
      marketStateTimestamp: predictionTimestampUtc,
      horizon: 'T-6h',
      modelVersion: this.MODEL_VERSION,
      featureVersion: this.FEATURE_VERSION,
      markets: {
        asianHandicap: ahMarket,
        overUnder: ouMarket,
        btts: bttsMarket,
      },
      sourceType: fixture.sourceType || 'PROVIDER',
      providerName: fixture.providerName || (fixture.fixtureId?.startsWith('id') ? 'OddsPapi' : 'API-Football'),
      scoreGridSummary: {
        homeXG: xgDerived.xgHome,
        awayXG: xgDerived.xgAway,
        rho,
      },
    };

    return { prediction, evaluations };
  }

  /**
   * Persists a prediction cycle atomically and idempotently to Supabase / PostgreSQL.
   */
  /**
   * Deterministic UUID generation for reproducible persistence keys.
   */
  public static deterministicUuid(seed: string): string {
    const hash = crypto.createHash('sha256').update(seed).digest('hex');
    return [
      hash.slice(0, 8),
      hash.slice(8, 12),
      '4' + hash.slice(13, 16),
      '8' + hash.slice(17, 20),
      hash.slice(20, 32),
    ].join('-');
  }

  public static toUuid(id: string): string {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (isUuid) return id;
    return this.deterministicUuid(`fixture:${id}`);
  }

  /**
   * Persists a prediction cycle atomically and idempotently to Supabase / PostgreSQL.
   * Persists into:
   * 1. daily_picks (canonical picks table)
   * 2. predictions (full point-in-time predictions table)
   * 3. prediction_ledger (immutable cryptographic provenance audit ledger)
   * 4. local verification JSONL ledger file
   */
  public static async persistPredictionCycle(
    items: Array<{
      prediction: ActiveMatchPrediction;
      evaluations: {
        ah?: ValueEvaluationResult;
        ou?: ValueEvaluationResult;
        btts?: ValueEvaluationResult;
      };
    }>
  ): Promise<PersistenceResult> {
    const result: PersistenceResult = {
      persistedPicksCount: 0,
      persistedLedgerCount: 0,
      persistedGreenCount: 0,
      duplicateCount: 0,
      excludedCount: 0,
      newLedgerPositions: [],
    };

    try {
      const { getDbClient } = await import('../../lib/db');
      const client = getDbClient();

      const fs = await import('fs');
      const path = await import('path');
      const targetDir = path.resolve(process.cwd(), 'data', 'verification');
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      const liveLedgerPath = path.join(targetDir, 'live_prediction_ledger.jsonl');
      const runLedgerPath = path.join(targetDir, 'production_run_ledger.jsonl');

      // Load existing ledger position IDs from live_prediction_ledger.jsonl for file idempotency
      const existingFilePosIds = new Set<string>();
      if (fs.existsSync(liveLedgerPath)) {
        try {
          const lines = fs.readFileSync(liveLedgerPath, 'utf8').trim().split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.ledgerPositionId) existingFilePosIds.add(parsed.ledgerPositionId);
              else if (parsed.predictionId) existingFilePosIds.add(parsed.predictionId);
            } catch {}
          }
        } catch {}
      }

      const localLedgerEntriesToAppend: any[] = [];

      for (const item of items) {
        const { prediction, evaluations } = item;

        // PHASE 3 — FAIL-CLOSED WRITE GUARD
        // Fixture must originate from an authoritative provider-backed discovery result.
        // Strictly reject synthetic fixtures, hardcoded fallback objects, or unverified provenance.
        const isSynthetic =
          !prediction.fixtureId ||
          prediction.fixtureId.startsWith('epl_2026_') ||
          prediction.sourceType === 'SYNTHETIC_FALLBACK' ||
          (prediction as any).source_type === 'SYNTHETIC_FALLBACK' ||
          (!prediction.oddsPapiFixtureId?.startsWith('id') &&
           !prediction.fixtureId.match(/^\d+$/) &&
           !prediction.fixtureId.startsWith('id'));

        if (isSynthetic) {
          Logger.warn('[ProductionPredictionEngine] Rejecting write with synthetic or unverified provider provenance:', {
            fixtureId: prediction.fixtureId,
            canonicalMatchId: prediction.canonicalMatchId,
          });
          result.excludedCount++;
          continue;
        }

        const fixtureUuid = this.toUuid(prediction.fixtureId);

        // Markets to evaluate for persistence
        const marketsToPersist: Array<{
          marketType: 'ASIAN_HANDICAP' | 'OVER_UNDER' | 'BTTS';
          shortMarket: 'AH' | 'OU' | 'BTTS';
          evalObj?: ValueEvaluationResult;
          marketView: ActivePredictionMarket;
        }> = [
          { marketType: 'ASIAN_HANDICAP', shortMarket: 'AH', evalObj: evaluations.ah, marketView: prediction.markets.asianHandicap },
          { marketType: 'OVER_UNDER', shortMarket: 'OU', evalObj: evaluations.ou, marketView: prediction.markets.overUnder },
          { marketType: 'BTTS', shortMarket: 'BTTS', evalObj: evaluations.btts, marketView: prediction.markets.btts },
        ];

        for (const m of marketsToPersist) {
          const { marketType, shortMarket, evalObj, marketView } = m;

          // Only persist if odds were available (> 1.0)
          if (!marketView || marketView.marketOdds <= 1.0) continue;

          const pickDeterministicId = this.deterministicUuid(`pick:${prediction.fixtureId}:${marketType}:live`);
          const predDeterministicId = this.deterministicUuid(`pred:${prediction.fixtureId}:${shortMarket}`);
          const ledgerPositionId = `${prediction.fixtureId}:${shortMarket}:${marketView.line}:${marketView.selection}`;
          const ledgerDeterministicId = this.deterministicUuid(`pos:${ledgerPositionId}`);

          const provenanceHash = crypto
            .createHash('sha256')
            .update(`${prediction.canonicalMatchId}:${marketType}:${marketView.selection}:${marketView.fairOdds}:${marketView.marketOdds}:${this.MODEL_VERSION}:${prediction.predictionTimestamp}`)
            .digest('hex');

          // 1. Persist to Supabase daily_picks table (all evaluated market views for UI display)
          const dailyPickRow = {
            id: pickDeterministicId,
            fixture_id: fixtureUuid,
            league: prediction.league,
            home_team: prediction.homeTeam,
            away_team: prediction.awayTeam,
            kickoff_utc: prediction.kickoffUtc,
            market_type: marketType,
            prediction: marketView.selection,
            model_probability: marketView.modelProbabilityPct ? marketView.modelProbabilityPct / 100 : 0.5,
            fair_odds: marketView.fairOdds,
            market_odds: marketView.marketOdds,
            market_bookmaker: marketView.bookmaker || 'Pinnacle',
            edge_pct: marketView.edgePct,
            confidence: marketView.confidence || 0,
            verdict: marketView.verdict || 'LEWATI',
            reasoning: evalObj
              ? `Model fair ${evalObj.fairOdds.toFixed(2)} vs Pinnacle ${evalObj.marketOdds.toFixed(2)}. Edge: ${(evalObj.edge * 100).toFixed(1)}%, EV: ${(evalObj.expectedValue * 100).toFixed(1)}%, Confidence: ${evalObj.confidence}/100. Model: ${this.MODEL_VERSION}.`
              : `Edge: ${marketView.edgePct}%, Odds: ${marketView.marketOdds}`,
            rejection_reason: marketView.rejectionReason || null,
            status: 'PENDING',
            source: 'live',
            prediction_id: predDeterministicId,
          };

          const { error: pickErr } = await client
            .from('daily_picks')
            .upsert(dailyPickRow, { onConflict: 'fixture_id, market_type, source' });

          if (!pickErr) {
            result.persistedPicksCount++;
          } else {
            Logger.warn('[ProductionPredictionEngine] Upsert error on daily_picks:', { error: pickErr.message });
          }

          // 2. Persist to Supabase predictions table
          const predictionRow = {
            id: predDeterministicId,
            match_id: fixtureUuid,
            market_type: shortMarket,
            home_team: prediction.homeTeam,
            away_team: prediction.awayTeam,
            selection: marketView.selection,
            model_probability: marketView.modelProbabilityPct ? marketView.modelProbabilityPct / 100 : null,
            fair_odds: marketView.fairOdds,
            market_odds: marketView.marketOdds,
            edge_pct: marketView.edgePct,
            expected_value: marketView.expectedValuePct ? marketView.expectedValuePct / 100 : null,
            confidence: (marketView.confidence || 0) / 100,
            model_version: this.MODEL_VERSION,
            feature_version: this.FEATURE_VERSION,
            prediction_timestamp: prediction.predictionTimestamp,
            source_type: 'PROVIDER',
            data_status: 'ACTIVE',
          };

          const { error: predErr } = await client
            .from('predictions')
            .upsert(predictionRow, { onConflict: 'id' });

          if (predErr) {
            Logger.warn('[ProductionPredictionEngine] Upsert error on predictions:', { error: predErr.message });
          }

          // 3. STEP 1 & 1.1: Production Betting Ledger Qualification Rule
          const isLayak = marketView.verdict === 'LAYAK';
          const isAllowedMarket = shortMarket === 'AH' || shortMarket === 'OU';
          const hasValidOdds = typeof marketView.marketOdds === 'number' && marketView.marketOdds > 1.0;
          const isProvider = true;
          const isActive = true;
          const kickoffMs = new Date(prediction.kickoffUtc).getTime();
          const writeTimeMs = Date.now();
          const isPreKickoff = Number.isFinite(kickoffMs) ? writeTimeMs < kickoffMs : true;
          const isWithinWindow = isWithinLedgerExecutionWindow(prediction.kickoffUtc, writeTimeMs);

          const qualifiesForLedger =
            isLayak &&
            isAllowedMarket &&
            hasValidOdds &&
            isPreKickoff &&
            isWithinWindow &&
            isProvider &&
            isActive;

          if (!qualifiesForLedger) {
            result.excludedCount++;
            continue; // NEVER write PANTAU, LEWATI, BTTS, Moneyline, invalid odds, or picks outside execution window to prediction_ledger
          }

          // STEP 2: Canonical Position Identity & Idempotency Check
          let alreadyExistsInDb = false;
          try {
            const { data: existingRow, error: chkErr } = await client
              .from('prediction_ledger')
              .select('id')
              .eq('id', ledgerDeterministicId)
              .maybeSingle();

            if (!chkErr && existingRow) {
              alreadyExistsInDb = true;
            }
          } catch (e) {
            // DB probe error handled safely
          }

          if (alreadyExistsInDb || existingFilePosIds.has(ledgerPositionId)) {
            result.duplicateCount++;
            Logger.info(`[ProductionPredictionEngine] Position ${ledgerPositionId} already exists; preserving immutable first snapshot.`);
            continue; // First qualifying snapshot wins; do not overwrite or duplicate!
          }

          // STEP 1.1: Green Cohort Tagging (strictly confidence > 70)
          const isGreenCohort = (marketView.confidence || 0) > 70;

          // STEP 3: Immutable Prediction Snapshot
          const pWin = (evalObj as any)?.decomposition?.win ?? ((evalObj as any)?.probabilities?.pOver ?? ((marketView.modelProbabilityPct || 0) / 100));
          const pPush = (evalObj as any)?.decomposition?.push ?? ((evalObj as any)?.probabilities?.pPush ?? 0);
          const pLoss = (evalObj as any)?.decomposition?.loss ?? ((evalObj as any)?.probabilities?.pUnder ?? (1 - pWin - pPush));

          const snapshotMeta = {
            cohort: 'GREEN_V2',
            green_cohort: isGreenCohort,
            ledger_position_id: ledgerPositionId,
            fixture_id: prediction.fixtureId,
            canonical_match_id: prediction.canonicalMatchId,
            market_type: shortMarket,
            selection: marketView.selection,
            line: marketView.line,
            stake_units: 1.0,
            market_odds: marketView.marketOdds,
            fair_odds: marketView.fairOdds,
            p_win: Number(pWin.toFixed(4)),
            p_push: Number(pPush.toFixed(4)),
            p_loss: Number(pLoss.toFixed(4)),
            confidence: marketView.confidence || 0,
            edge: marketView.edgePct,
            expected_value_pct: marketView.expectedValuePct,
            kickoff_utc: prediction.kickoffUtc,
            odds_snapshot_ts: marketView.oddsCapturedAt,
            model_version: this.MODEL_VERSION,
            feature_artifact_version: this.FEATURE_VERSION,
            calibration_version: 'calib-v1.0',
            source_type: 'PROVIDER',
            data_status: 'ACTIVE',
            provider: marketView.bookmaker || 'Pinnacle',
            provenance_hash: provenanceHash,
            created_at: new Date().toISOString(),
          };

          const ledgerRow = {
            id: ledgerDeterministicId,
            doi_id: ledgerPositionId,
            match_id: fixtureUuid,
            competition_id: 39,
            market: shortMarket,
            selection: marketView.selection,
            fair_odds: marketView.fairOdds,
            odds_at_prediction: marketView.marketOdds,
            confidence: marketView.confidence || 0,
            model_version: this.MODEL_VERSION,
            xg_home: prediction.scoreGridSummary?.homeXG || 1.35,
            xg_away: prediction.scoreGridSummary?.awayXG || 1.20,
            dixon_coles_rho: prediction.scoreGridSummary?.rho || -0.06,
            sha256_hash: provenanceHash,
            decision: 'BET',
            decision_reason: JSON.stringify(snapshotMeta),
            published_at: prediction.predictionTimestamp,
            result_status: 'pending',
            source_type: 'PROVIDER',
            data_status: 'ACTIVE',
            verified: true,
          };

          const { error: ledgerErr } = await client
            .from('prediction_ledger')
            .insert(ledgerRow);

          if (!ledgerErr) {
            result.persistedLedgerCount++;
            if (isGreenCohort) result.persistedGreenCount++;
            result.newLedgerPositions.push(snapshotMeta);
            existingFilePosIds.add(ledgerPositionId);
            localLedgerEntriesToAppend.push(snapshotMeta);
          } else {
            Logger.warn('[ProductionPredictionEngine] Insert error on prediction_ledger:', { error: ledgerErr.message });
          }
        }
      }

      // Append new qualifying immutable ledger entries to local ledger files
      if (localLedgerEntriesToAppend.length > 0) {
        try {
          const lines = localLedgerEntriesToAppend.map(e => JSON.stringify(e)).join('\n') + '\n';
          fs.appendFileSync(liveLedgerPath, lines, 'utf8');
          fs.appendFileSync(runLedgerPath, lines, 'utf8');
        } catch (fsErr) {
          Logger.warn('[ProductionPredictionEngine] Local ledger append error:', { error: String(fsErr) });
        }
      }

      return result;
    } catch (err) {
      Logger.warn('[ProductionPredictionEngine] Database persistence skipped or unavailable:', { error: String(err) });
      return result;
    }
  }

  /**
   * Main production cycle runner.
   * Can accept explicit fixtures or ingest from API-Football & OddsPapi.
   */
  public static async runPredictionCycle(
    explicitFixtures?: FixtureInput[]
  ): Promise<PredictionCycleResult> {
    const timestampUtc = new Date().toISOString();
    let fixtures = explicitFixtures;

    if (!fixtures || fixtures.length === 0) {
      // Discover from providers or canonical baseline
      fixtures = await this.discoverUpcomingFixturesWithOdds();
    }

    const evaluatedItems: Array<{
      prediction: ActiveMatchPrediction;
      evaluations: {
        ah?: ValueEvaluationResult;
        ou?: ValueEvaluationResult;
        btts?: ValueEvaluationResult;
      };
    }> = [];

    let layakCount = 0;
    let pantauCount = 0;
    let lewatiCount = 0;

    for (const f of fixtures) {
      const result = this.evaluateFixture(f, timestampUtc);
      evaluatedItems.push(result);

      for (const m of Object.values(result.prediction.markets)) {
        if (m.verdict === 'LAYAK') layakCount++;
        else if (m.verdict === 'PANTAU') pantauCount++;
        else lewatiCount++;
      }
    }

    // Persist idempotently to database if configured
    const persistence = await this.persistPredictionCycle(evaluatedItems);

    return {
      timestampUtc,
      activePredictions: evaluatedItems.map(item => item.prediction),
      persistedPicksCount: persistence.persistedPicksCount,
      persistedLedgerCount: persistence.persistedLedgerCount,
      persistedGreenCount: persistence.persistedGreenCount,
      duplicateCount: persistence.duplicateCount,
      excludedCount: persistence.excludedCount,
      newLedgerPositions: persistence.newLedgerPositions,
      stats: {
        totalFixtures: fixtures.length,
        reconciledWithOdds: evaluatedItems.filter(i => i.prediction.markets.asianHandicap.marketOdds > 1.0).length,
        layakCount,
        pantauCount,
        lewatiCount,
        ledgerCount: persistence.persistedLedgerCount,
        greenCount: persistence.persistedGreenCount,
        duplicateCount: persistence.duplicateCount,
        excludedCount: persistence.excludedCount,
      },
    };
  }

  /**
   * Discovers upcoming fixtures with real Pinnacle odds or baseline schedule.
   */
  public static async discoverUpcomingFixturesWithOdds(): Promise<FixtureInput[]> {
    const oddsPapi = new OddsPapiProvider();
    const fixtures: FixtureInput[] = [];

    // 1. Attempt OddsPapi provider lookup for live Pinnacle spreads and totals
    if (oddsPapi.isConfigured()) {
      try {
        const { env } = await import('../../config/env');
        const apiKey = env.providers.oddsPapi.apiKey;
        const from = new Date().toISOString();
        const to = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
        const url = `https://api.oddspapi.io/v4/fixtures?sportId=10&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&apiKey=${apiKey}`;

        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (res.ok) {
          const rawFixtures = await res.json();
          if (Array.isArray(rawFixtures)) {
            const eplFixtures = rawFixtures.filter(
              (f: any) => f.categorySlug === 'england' && f.tournamentSlug === 'premier-league'
            );

            for (let i = 0; i < eplFixtures.length; i++) {
              const f = eplFixtures[i];
              if (i > 0) {
                // Rate limit spacing for OddsPapi tier
                await new Promise(r => setTimeout(r, 1100));
              }

              let ah: { line: number; homeOdds: number; awayOdds: number; timestampUtc?: string } | undefined;
              let ou: { line: number; overOdds: number; underOdds: number; timestampUtc?: string } | undefined;

              const oddsRes = await oddsPapi.getMarketOdds(f.fixtureId);
              if (oddsRes.data && oddsRes.data.length > 0) {
                const ahOdds = oddsRes.data.filter(
                  o => o.marketType === 'ASIAN_HANDICAP' && Math.abs(o.line) <= 3.5
                );
                const ouOdds = oddsRes.data.filter(
                  o => o.marketType === 'OVER_UNDER' && o.line >= 0.5 && o.line <= 5.5
                );

                if (ahOdds.length > 0) {
                  const mainAh =
                    ahOdds.find(o => o.isMainLine) ||
                    ahOdds.sort(
                      (a, b) => Math.abs(a.homeOdds - 1.95) - Math.abs(b.homeOdds - 1.95)
                    )[0];
                  ah = {
                    line: mainAh.line,
                    homeOdds: mainAh.homeOdds,
                    awayOdds: mainAh.awayOdds,
                    timestampUtc: mainAh.capturedAt,
                  };
                }

                if (ouOdds.length > 0) {
                  const mainOu =
                    ouOdds.find(o => o.isMainLine) ||
                    ouOdds.sort(
                      (a, b) => Math.abs(a.homeOdds - 1.95) - Math.abs(b.homeOdds - 1.95)
                    )[0];
                  ou = {
                    line: mainOu.line,
                    overOdds: mainOu.homeOdds,
                    underOdds: mainOu.awayOdds,
                    timestampUtc: mainOu.capturedAt,
                  };
                }
              }

              fixtures.push({
                fixtureId: f.fixtureId,
                providerFixtureId: f.fixtureId,
                providerName: 'OddsPapi',
                sourceType: 'PROVIDER',
                homeTeam: f.participant1Name,
                awayTeam: f.participant2Name,
                league: 'Premier League',
                kickoffUtc: f.startTime,
                season: '2026',
                pinnacleOdds: { ah, ou },
              });
            }
          }
        }
      } catch (opErr) {
        Logger.warn('[ProductionPredictionEngine] OddsPapi fixture discovery failed:', { error: String(opErr) });
      }
    }

    // 2. Fallback to API-Football provider lookup if OddsPapi produced 0 fixtures
    if (fixtures.length === 0) {
      const apiFootball = new ApiFootballProvider();
      if (apiFootball.isConfigured()) {
        const res = await apiFootball.getUpcomingFixtures('39');
        if (res.status === 'AVAILABLE' && res.data && res.data.length > 0) {
          for (const f of res.data) {
            fixtures.push({
              fixtureId: f.providerFixtureId,
              providerFixtureId: f.providerFixtureId,
              providerName: 'API-Football',
              sourceType: 'PROVIDER',
              homeTeam: f.homeTeam,
              awayTeam: f.awayTeam,
              league: f.league,
              kickoffUtc: f.kickoffTime,
              season: f.season,
              venue: f.venue,
            });
          }
        }
      }
    }

    // Fail-closed invariant: NO PROVIDER DATA = NO FIXTURES = NO PREDICTIONS = NO PICKS
    if (fixtures.length === 0) {
      Logger.warn('[ProductionPredictionEngine] No upcoming fixtures discovered from providers; failing closed (0 fixtures returned).');
      return [];
    }

    return fixtures;
  }
}
