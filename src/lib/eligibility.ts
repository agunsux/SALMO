/**
 * SALMO Public Pick Eligibility Boundary
 *
 * Enforces strict criteria before any candidate prediction can be qualified
 * and displayed as an actionable public pick:
 * 1. Future Kickoff: kickoffUtc strictly in the future compared to reference time
 * 2. Qualified Verdict: verdict strictly 'LAYAK'
 * 3. Resolvable Provenance: modelVersion present in payload or execution reasoning
 * 4. Required Market Odds: valid market odds available (> 1.0)
 *
 * NOTE: This boundary governs public pick qualification ONLY.
 * Research predictions on /research are NOT subject to this filter and display
 * regardless of odds availability.
 */

export interface CandidatePick {
  id?: string | null;
  predictionId?: string | null;
  kickoffUtc?: string | null;
  kickoff_utc?: string | null;
  verdict?: string | null;
  modelVersion?: string | null;
  model_version?: string | null;
  reasoning?: string | null;
  marketOdds?: number | null;
  market_odds?: number | null;
  modelProbability?: number | null;
  model_probability?: number | null;
  prediction?: string | null;
  line?: number | null;
  homeTeam?: string | null;
  home_team?: string | null;
  awayTeam?: string | null;
  away_team?: string | null;
  league?: string | null;
  competition?: string | null;
  status?: string | null;
  data_status?: string | null;
  quarantined?: boolean | null;
  [key: string]: any;
}

/**
 * Known quarantined candidate IDs from uncalibrated upstream runs
 * (e.g. 70.64% default-fallback parameter artifact from run daily-2026-10-16T20:00Z)
 */
export const QUARANTINED_SIGNAL_IDS = new Set<string>([
  'cbd13e02-6be4-4b22-95d9-59c26eb603bc', // Nottingham Forest vs Arsenal (uncalibrated 70.64% default fallback)
  'abe7d4da-0659-4869-b560-635a017710f5', // Aston Villa vs Manchester City (uncalibrated 70.64% default fallback)
  '224dd97b-bee6-4875-b97a-f14d9607995a', // Hull City vs Brentford (competition mismatch & uncalibrated fallback)
]);

/**
 * Evaluates whether a signal is quarantined due to:
 * - Explicit quarantine ID or flag
 * - Default uncalibrated probability artifact (70.64% fallback marker from static default xG 1.45/1.15)
 * - Competition mismatch (e.g. Hull City in Premier League)
 */
export function isQuarantinedSignal(pick: CandidatePick): { quarantined: boolean; reason?: string } {
  if (!pick) return { quarantined: false };

  // 1. Explicit ID quarantine
  const id = pick.id || pick.predictionId;
  if (id && QUARANTINED_SIGNAL_IDS.has(String(id))) {
    return { quarantined: true, reason: 'QUARANTINED_SIGNAL_ID: Known uncalibrated model fallback artifact' };
  }

  // 2. Explicit status or data_status
  if (pick.status === 'QUARANTINED' || pick.data_status === 'QUARANTINED' || pick.quarantined === true) {
    return { quarantined: true, reason: 'EXPLICIT_QUARANTINE_FLAG' };
  }

  // 3. Detect uncalibrated fallback probability artifact:
  // In HandicapLab dailyOrchestrator, missing team ratings fall back to homeXg=1.45, awayXg=1.15, rho=-0.05,
  // which produces exactly 0.7064 (70.64%) on AH +0.75 lines.
  const prob = pick.modelProbability ?? pick.model_probability;
  const line = pick.line ?? (typeof pick.prediction === 'string' && pick.prediction.includes('+0.75') ? 0.75 : null);
  if (typeof prob === 'number' && Math.abs(prob - 0.7064) < 0.0001 && line === 0.75) {
    return { quarantined: true, reason: 'UNCALIBRATED_FALLBACK_ARTIFACT: Identical 70.64% probability from default parameters' };
  }

  // 4. Competition mismatch: Hull City is not in Premier League
  const home = String(pick.home_team || pick.homeTeam || '');
  const away = String(pick.away_team || pick.awayTeam || '');
  const league = String(pick.league || pick.competition || '');
  if (league.toLowerCase().includes('premier league')) {
    if (home.toLowerCase().includes('hull') || away.toLowerCase().includes('hull')) {
      return { quarantined: true, reason: 'COMPETITION_MISMATCH: Hull City is not a Premier League club' };
    }
  }

  return { quarantined: false };
}

export function isPublicPickEligible(
  pick: CandidatePick,
  referenceTimeMs: number
): boolean {
  if (!pick || typeof referenceTimeMs !== 'number' || isNaN(referenceTimeMs)) {
    return false;
  }

  // 0. Quarantine Guard: exclude uncalibrated, mismatched, or quarantined signals
  if (isQuarantinedSignal(pick).quarantined) {
    return false;
  }

  // 1. Future Kickoff: must be strictly in the future
  const kickoff = pick.kickoffUtc || pick.kickoff_utc;
  if (!kickoff) return false;
  const kickoffMs = new Date(kickoff).getTime();
  if (isNaN(kickoffMs) || kickoffMs <= referenceTimeMs) {
    return false;
  }

  // 2. Qualified Verdict: must be strictly LAYAK
  if (pick.verdict !== 'LAYAK') {
    return false;
  }

  // 3. Resolvable Provenance: modelVersion must be present in payload or reasoning
  const hasProvenance = Boolean(
    pick.modelVersion ||
    pick.model_version ||
    (typeof pick.reasoning === 'string' && (pick.reasoning.includes('modelVersion') || pick.reasoning.includes('Model:')))
  );
  if (!hasProvenance) {
    return false;
  }

  // 4. Required Market Odds: valid market odds must be available (> 1.0)
  const odds = pick.marketOdds ?? pick.market_odds;
  if (odds === null || odds === undefined || typeof odds !== 'number' || isNaN(odds) || odds <= 1.0) {
    return false;
  }

  return true;
}

/**
 * Checks if a candidate pick meets all model criteria for qualification
 * (future kickoff, verdict LAYAK, resolvable provenance) but lacks valid market odds.
 */
export function isCandidateQualifiedWithoutOdds(
  pick: CandidatePick,
  referenceTimeMs: number
): boolean {
  if (!pick || typeof referenceTimeMs !== 'number' || isNaN(referenceTimeMs)) {
    return false;
  }

  // 0. Quarantine Guard: exclude uncalibrated, mismatched, or quarantined signals
  if (isQuarantinedSignal(pick).quarantined) {
    return false;
  }

  // 1. Future Kickoff: must be strictly in the future
  const kickoff = pick.kickoffUtc || pick.kickoff_utc;
  if (!kickoff) return false;
  const kickoffMs = new Date(kickoff).getTime();
  if (isNaN(kickoffMs) || kickoffMs <= referenceTimeMs) {
    return false;
  }

  // 2. Qualified Verdict: must be strictly LAYAK
  if (pick.verdict !== 'LAYAK') {
    return false;
  }

  // 3. Resolvable Provenance: modelVersion must be present in payload or reasoning
  const hasProvenance = Boolean(
    pick.modelVersion ||
    pick.model_version ||
    (typeof pick.reasoning === 'string' && (pick.reasoning.includes('modelVersion') || pick.reasoning.includes('Model:')))
  );
  if (!hasProvenance) {
    return false;
  }

  // 4. Odds missing or <= 1.0
  const odds = pick.marketOdds ?? pick.market_odds;
  return odds === null || odds === undefined || typeof odds !== 'number' || isNaN(odds) || odds <= 1.0;
}

export type DailyPicksState = 'AVAILABLE' | 'ODDS_NOT_YET_AVAILABLE' | 'NO_QUALIFIED_PICKS';

/**
 * Classifies the state of daily picks against an authoritative reference timestamp:
 * - 'AVAILABLE': 1 or more current qualified picks have valid odds.
 * - 'ODDS_NOT_YET_AVAILABLE': Current qualified picks exist lacking odds, OR all current actionable picks lack odds.
 * - 'NO_QUALIFIED_PICKS': No current qualified picks exist.
 * Historical / past-kickoff rows are strictly isolated and cannot alter current state classification.
 */
export function classifyDailyPicksState(
  picks: CandidatePick[],
  referenceTimeMs: number
): {
  state: DailyPicksState;
  eligiblePicks: CandidatePick[];
  currentPicks: CandidatePick[];
} {
  if (!Array.isArray(picks) || typeof referenceTimeMs !== 'number' || isNaN(referenceTimeMs)) {
    return { state: 'NO_QUALIFIED_PICKS', eligiblePicks: [], currentPicks: [] };
  }

  const isUpcoming = (p: CandidatePick) => {
    const kickoff = p.kickoffUtc || p.kickoff_utc;
    if (!kickoff) return false;
    const kMs = new Date(kickoff).getTime();
    return !isNaN(kMs) && kMs > referenceTimeMs;
  };

  const currentPicks = picks.filter(isUpcoming).filter(p => !isQuarantinedSignal(p).quarantined);
  const eligiblePicks = currentPicks.filter(p => isPublicPickEligible(p, referenceTimeMs));

  if (eligiblePicks.length > 0) {
    return { state: 'AVAILABLE', eligiblePicks, currentPicks };
  }

  // Case A: Current qualified picks exist without odds, OR all current actionable picks lack odds
  const hasCurrentQualifiedWaitingForOdds = currentPicks.some(p =>
    isCandidateQualifiedWithoutOdds(p, referenceTimeMs)
  );

  const currentActionableLacksOdds =
    currentPicks.length > 0 &&
    currentPicks.every(p => {
      const odds = p.marketOdds ?? p.market_odds;
      return odds === null || odds === undefined || typeof odds !== 'number' || isNaN(odds) || odds <= 1.0;
    });

  if (hasCurrentQualifiedWaitingForOdds || currentActionableLacksOdds) {
    return { state: 'ODDS_NOT_YET_AVAILABLE', eligiblePicks, currentPicks };
  }

  // Case B: No current qualified picks exist
  return { state: 'NO_QUALIFIED_PICKS', eligiblePicks, currentPicks };
}
