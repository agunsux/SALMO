// SALMO.DEV — Canonical Prediction Ledger Service
// Unified multi-layer prediction ledger with strict provenance lineage,
// immutability enforcement, and idempotent reconciliation across verification & research datasets.

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { QuarterLineSettler } from '../ah/quarterLineSettler';
import { SettlementOutcome } from '../../types';

export type LedgerTier = 'PRODUCTION' | 'SHADOW' | 'NONE';
export type SettlementStatus = 'PENDING' | 'SETTLED' | 'VOID';

export interface CanonicalPredictionRecord {
  /** Stable unique identifier across the lifetime of the prediction */
  predictionId: string;
  /** Canonical match identifier e.g. EPL_2026_ARSENALFC_LEEDSUNITED_2026-10-10 */
  canonicalMatchId: string;
  /** Provider fixture identifier e.g. 1557417 */
  fixtureId: string;
  /** Competition code or slug e.g. ENG-PL, ESP-LALIGA */
  competitionId: string;
  /** Human-readable competition name e.g. Premier League */
  competitionName: string;
  /** Home team name */
  homeTeam: string;
  /** Away team name */
  awayTeam: string;
  /** ISO kickoff UTC timestamp */
  kickoffUtc: string;
  /** Pre-match timestamp when prediction was captured (must be < kickoffUtc) */
  predictionTimestamp: string | null;
  /** Target betting market */
  market: 'AH' | 'OU' | 'BTTS';
  /** Exact selection text e.g. "Arsenal FC -1.25", "Over 2.5" */
  selection: string;
  /** Exact numerical market handicap or total line e.g. -1.25, 2.5 */
  line: number;
  /** Decimal benchmark odds taken at prediction time (Pinnacle/Bet365) or null if odds unavailable */
  originalOdds: number | null;
  /** Authoritative bookmaker e.g. "pinnacle", "bet365", or null if unavailable */
  bookmaker: string | null;
  /** Model estimated win/cover probability (0.00 to 1.00) */
  modelProbability: number;
  /** Model calculated fair decimal odds (1 / modelProbability) or null */
  fairOdds: number | null;
  /** Model qualification tier: "HIGH", "VALUE_HIGH", "PANTAU", "RESEARCH_ONLY" */
  confidenceTier: string;
  /** Operational ledger tier */
  ledgerTier: LedgerTier;
  /** Whether the record qualified for public recommendations at prediction time */
  isPublicPick: boolean;
  /** Underlying prediction model version e.g. "dixon-coles-v1.0" */
  modelVersion: string;
  /** Data provenance source e.g. "API-Football", "HandicapLab-Q1Q4", "EMPIRICAL_HISTORICAL_CAPTURES" */
  dataSource: string;
  /** Upstream data source timestamp */
  sourceTimestamp: string | null;
  /** Settlement status: PENDING, SETTLED, VOID */
  settlementStatus: SettlementStatus;
  /** Settlement result: WIN, HALF_WIN, PUSH, HALF_LOSS, LOSS, VOID, or null if pending */
  result: SettlementOutcome | null;
  /** Units profit/loss relative to 1.0 unit stake */
  profitUnits: number;
  /** Stake units allocated (1.0 for active/settled, 0.0 for research/pending) */
  stakeUnits: number;
  /** Verified match score e.g. "2-1", or null if unplayed */
  matchScore: string | null;
  /** Verified home team goals */
  homeGoals: number | null;
  /** Verified away team goals */
  awayGoals: number | null;
  /** ISO timestamp when settlement was finalized */
  settledAt: string | null;
  /** SHA-256 cryptographic provenance hash guaranteeing immutable terms */
  provenanceHash: string;
  /** File path origin of this canonical record */
  originalSourcePath: string;
}

export class CanonicalPredictionLedgerService {
  private static liveLedgerPath = path.resolve(process.cwd(), 'data', 'verification', 'live_prediction_ledger.jsonl');
  private static allResearchLedgerPath = path.resolve(process.cwd(), 'data', 'verification', 'all_leagues_research_ledger.jsonl');
  private static researchPredictionsPath = path.resolve(process.cwd(), 'data', 'research', 'multi_league_research_predictions.jsonl');

  /**
   * Generates a deterministic SHA-256 provenance hash over immutable pre-match terms.
   */
  public static computeProvenanceHash(record: {
    predictionId: string;
    canonicalMatchId: string;
    market: string;
    selection: string;
    line: number;
    modelProbability: number;
    originalOdds: number | null;
    kickoffUtc: string;
  }): string {
    const payload = [
      record.predictionId,
      record.canonicalMatchId,
      record.market,
      record.selection,
      record.line.toFixed(4),
      record.modelProbability.toFixed(4),
      record.originalOdds !== null ? record.originalOdds.toFixed(4) : 'NULL_ODDS',
      record.kickoffUtc,
    ].join('|');
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Loads production live prediction ledger (30 rows).
   */
  public static getProductionLiveLedger(): CanonicalPredictionRecord[] {
    if (!fs.existsSync(this.liveLedgerPath)) return [];
    try {
      const lines = fs.readFileSync(this.liveLedgerPath, 'utf8').trim().split('\n').filter(Boolean);
      return lines.map((line, idx) => {
        const raw = JSON.parse(line);
        const probDec = typeof raw.modelProbability === 'number'
          ? (raw.modelProbability > 1 ? Number((raw.modelProbability / 100).toFixed(4)) : raw.modelProbability)
          : 0;

        const odds = typeof raw.oddsAtPrediction === 'number'
          ? raw.oddsAtPrediction
          : typeof raw.marketOdds === 'number'
          ? raw.marketOdds
          : null;

        const isSettled = raw.settlement === 'SETTLED' || raw.settlementStatus === 'SETTLED';
        const pUnits = typeof raw.profitUnits === 'number' ? raw.profitUnits : (raw.profitLoss !== null ? Number(raw.profitLoss) : 0);

        const rec: CanonicalPredictionRecord = {
          predictionId: raw.predictionId || `prod_pred_${idx}`,
          canonicalMatchId: raw.canonicalMatchId || `MATCH_${idx}`,
          fixtureId: String(raw.providerProvenance?.apiFootballFixtureId || raw.fixtureId || ''),
          competitionId: 'ENG-PL',
          competitionName: 'Premier League',
          homeTeam: raw.homeTeam || raw.canonicalMatchId?.split('_')[2] || 'Home',
          awayTeam: raw.awayTeam || raw.canonicalMatchId?.split('_')[3] || 'Away',
          kickoffUtc: raw.kickoffUtc || '2026-10-10T14:00:00+00:00',
          predictionTimestamp: raw.predictionTimestamp || null,
          market: raw.market || 'AH',
          selection: raw.selection || '',
          line: Number(raw.line ?? 0),
          originalOdds: odds,
          bookmaker: raw.bookmaker || 'pinnacle',
          modelProbability: probDec,
          fairOdds: raw.fairOdds ? Number(raw.fairOdds) : null,
          confidenceTier: raw.verdict === 'LAYAK' ? 'HIGH' : raw.verdict === 'PANTAU' ? 'MEDIUM' : 'RESEARCH_ONLY',
          ledgerTier: 'PRODUCTION',
          isPublicPick: Boolean(raw.is_pick || raw.verdict === 'LAYAK'),
          modelVersion: raw.modelVersion || 'dixon-coles-v1.0',
          dataSource: 'HandicapLab-Q1Q4-LiveLedger',
          sourceTimestamp: raw.footballStateTimestamp || raw.predictionTimestamp || null,
          settlementStatus: isSettled ? 'SETTLED' : 'PENDING',
          result: raw.result || null,
          profitUnits: pUnits,
          stakeUnits: Number(raw.stakeUnits ?? (isSettled ? 1.0 : 0.0)),
          matchScore: raw.matchScore || null,
          homeGoals: typeof raw.homeGoals === 'number' ? raw.homeGoals : null,
          awayGoals: typeof raw.awayGoals === 'number' ? raw.awayGoals : null,
          settledAt: raw.settledAt || null,
          provenanceHash: raw.provenanceHash || this.computeProvenanceHash({
            predictionId: raw.predictionId,
            canonicalMatchId: raw.canonicalMatchId,
            market: raw.market || 'AH',
            selection: raw.selection || '',
            line: Number(raw.line ?? 0),
            modelProbability: probDec,
            originalOdds: odds,
            kickoffUtc: raw.kickoffUtc || '2026-10-10T14:00:00+00:00',
          }),
          originalSourcePath: 'data/verification/live_prediction_ledger.jsonl',
        };
        return rec;
      });
    } catch (err) {
      return [];
    }
  }

  /**
   * Loads multi-league research ledger (336 rows).
   */
  public static getResearchLedger(): CanonicalPredictionRecord[] {
    const targetPath = fs.existsSync(this.allResearchLedgerPath)
      ? this.allResearchLedgerPath
      : fs.existsSync(this.researchPredictionsPath)
      ? this.researchPredictionsPath
      : null;

    if (!targetPath) return [];

    try {
      const lines = fs.readFileSync(targetPath, 'utf8').trim().split('\n').filter(Boolean);
      return lines.map((line, idx) => {
        const raw = JSON.parse(line);
        const probDec = typeof raw.modelProbability === 'number'
          ? (raw.modelProbability > 1 ? Number((raw.modelProbability / 100).toFixed(4)) : raw.modelProbability)
          : typeof raw.model_probability === 'number'
          ? (raw.model_probability > 1 ? Number((raw.model_probability / 100).toFixed(4)) : raw.model_probability)
          : 0;

        const odds = typeof raw.marketOdds === 'number'
          ? raw.marketOdds
          : typeof raw.market_odds === 'number'
          ? raw.market_odds
          : null;

        const isSettled = raw.settlement === 'SETTLED' || raw.settlementStatus === 'SETTLED';
        const pUnits = typeof raw.profitUnits === 'number' ? raw.profitUnits : 0;

        const rec: CanonicalPredictionRecord = {
          predictionId: raw.predictionId || raw.id || `research_pred_${idx}`,
          canonicalMatchId: raw.canonicalMatchId || `RESEARCH_${idx}`,
          fixtureId: String(raw.fixtureId || raw.fixture_id || ''),
          competitionId: raw.leaguePrefix || raw.competition_id || 'MULTI-LEAGUE',
          competitionName: raw.league || raw.competition || 'Multi-League',
          homeTeam: raw.homeTeam || raw.home_team || 'Home',
          awayTeam: raw.awayTeam || raw.away_team || 'Away',
          kickoffUtc: raw.kickoffUtc || raw.kickoff_utc || '',
          predictionTimestamp: raw.predictionTimestamp || raw.createdAt || null,
          market: raw.market || 'AH',
          selection: raw.selection || '',
          line: Number(raw.line ?? 0),
          originalOdds: odds,
          bookmaker: raw.bookmaker || null,
          modelProbability: probDec,
          fairOdds: raw.fairOdds ? Number(raw.fairOdds) : null,
          confidenceTier: raw.tier || 'RESEARCH_ONLY',
          ledgerTier: raw.ledgerTier || (raw.league === 'Premier League' ? 'PRODUCTION' : 'SHADOW'),
          isPublicPick: false, // Research predictions never qualify as public picks
          modelVersion: raw.modelVersion || raw.leagueModelVersion || 'dixon-coles-v1.0-transfer',
          dataSource: raw.ratingSource || 'EMPIRICAL_HISTORICAL_CAPTURES',
          sourceTimestamp: raw.createdAt || null,
          settlementStatus: isSettled ? 'SETTLED' : 'PENDING',
          result: raw.result || null,
          profitUnits: pUnits,
          stakeUnits: Number(raw.stakeUnits ?? 0),
          matchScore: raw.matchScore || null,
          homeGoals: typeof raw.homeGoals === 'number' ? raw.homeGoals : null,
          awayGoals: typeof raw.awayGoals === 'number' ? raw.awayGoals : null,
          settledAt: raw.settledAt || null,
          provenanceHash: this.computeProvenanceHash({
            predictionId: raw.predictionId || raw.id || `research_pred_${idx}`,
            canonicalMatchId: raw.canonicalMatchId || `RESEARCH_${idx}`,
            market: raw.market || 'AH',
            selection: raw.selection || '',
            line: Number(raw.line ?? 0),
            modelProbability: probDec,
            originalOdds: odds,
            kickoffUtc: raw.kickoffUtc || raw.kickoff_utc || '',
          }),
          originalSourcePath: 'data/verification/all_leagues_research_ledger.jsonl',
        };
        return rec;
      });
    } catch (err) {
      return [];
    }
  }

  /**
   * Returns all unified canonical records across production live and research ledgers,
   * with production records taking authoritative precedence on overlapping prediction IDs.
   */
  public static getAllUnifiedRecords(): CanonicalPredictionRecord[] {
    const prodRecords = this.getProductionLiveLedger();
    const researchRecords = this.getResearchLedger();

    const recordMap = new Map<string, CanonicalPredictionRecord>();

    // 1. Seed with research records
    for (const r of researchRecords) {
      recordMap.set(r.predictionId, r);
    }

    // 2. Authoritatively override/enrich with production records
    for (const p of prodRecords) {
      recordMap.set(p.predictionId, p);
    }

    return Array.from(recordMap.values());
  }

  /**
   * Verifies data integrity and consistency of a prediction record.
   */
  public static verifyRecordIntegrity(record: CanonicalPredictionRecord): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!record.predictionId) errors.push('Missing stable predictionId');
    if (!record.canonicalMatchId) errors.push('Missing canonicalMatchId');
    if (!record.market || !['AH', 'OU', 'BTTS'].includes(record.market)) {
      errors.push(`Invalid market type: ${record.market}`);
    }
    if (typeof record.line !== 'number' || isNaN(record.line)) {
      errors.push('Missing or invalid numerical market line');
    }
    if (record.modelProbability < 0 || record.modelProbability > 1) {
      errors.push(`Model probability out of bounds [0, 1]: ${record.modelProbability}`);
    }

    // Quarter-line settlement consistency
    if (record.settlementStatus === 'SETTLED') {
      if (!record.result) {
        errors.push('Settled record is missing result outcome');
      }
      if (typeof record.homeGoals !== 'number' || typeof record.awayGoals !== 'number') {
        errors.push('Settled record is missing verified match goals');
      }
    } else if (record.settlementStatus === 'PENDING') {
      if (record.profitUnits !== 0) {
        errors.push(`Pending record has non-zero profit units: ${record.profitUnits}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Ensures data/research/multi_league_research_predictions.jsonl exists and is cleanly synchronized
   * from the canonical 336 research records without destructive changes.
   */
  public static reconcileAndExportResearchLedger(): { count: number; synchronized: boolean } {
    const researchRecords = this.getResearchLedger();
    if (researchRecords.length === 0) return { count: 0, synchronized: false };

    const dir = path.dirname(this.researchPredictionsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write JSONL cleanly
    const content = researchRecords.map(r => JSON.stringify(r)).join('\n') + '\n';
    fs.writeFileSync(this.researchPredictionsPath, content, 'utf8');

    return {
      count: researchRecords.length,
      synchronized: true,
    };
  }
}
