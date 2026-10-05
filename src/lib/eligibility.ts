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
  referenceTimeMs: number = Date.now()
): boolean {
  if (!pick) return false;

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
