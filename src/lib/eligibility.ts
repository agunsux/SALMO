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
  kickoffUtc?: string | null;
  kickoff_utc?: string | null;
  verdict?: string | null;
  modelVersion?: string | null;
  model_version?: string | null;
  reasoning?: string | null;
  marketOdds?: number | null;
  market_odds?: number | null;
  [key: string]: any;
}

export function isPublicPickEligible(
  pick: CandidatePick,
  referenceTimeMs: number
): boolean {
  if (!pick || typeof referenceTimeMs !== 'number' || isNaN(referenceTimeMs)) {
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
    (typeof pick.reasoning === 'string' && pick.reasoning.includes('modelVersion'))
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
    (typeof pick.reasoning === 'string' && pick.reasoning.includes('modelVersion'))
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

  const currentPicks = picks.filter(isUpcoming);
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
