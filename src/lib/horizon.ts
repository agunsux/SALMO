// SALMO.DEV — Dynamic Time Horizon Calculation
// Strictly dynamic UTC timestamp filtering. Zero hardcoded date strings.

export type TimeHorizonFilter = '7_DAYS' | 'TODAY' | 'TOMORROW' | 'PLUS_3_DAYS' | 'WEEKEND';

/**
 * Evaluates whether a match kickoff matches a dynamic time horizon.
 * Operates strictly on UTC calendar and millisecond offsets.
 */
export function matchesDynamicHorizon(
  kickoffIso: string,
  horizon: TimeHorizonFilter,
  referenceDate: Date = new Date()
): boolean {
  if (horizon === '7_DAYS') {
    return true;
  }

  const kickoffTime = new Date(kickoffIso).getTime();
  if (isNaN(kickoffTime)) {
    return false;
  }

  const refTime = referenceDate.getTime();
  const refDateStr = referenceDate.toISOString().split('T')[0];

  const tomorrow = new Date(refTime + 24 * 60 * 60 * 1000);
  const tomorrowDateStr = tomorrow.toISOString().split('T')[0];

  const kickoffDate = new Date(kickoffTime);
  const kickoffDateStr = kickoffDate.toISOString().split('T')[0];

  switch (horizon) {
    case 'TODAY':
      return kickoffDateStr === refDateStr;

    case 'TOMORROW':
      return kickoffDateStr === tomorrowDateStr;

    case 'PLUS_3_DAYS': {
      const diffMs = kickoffTime - refTime;
      // Within range: from 12 hours ago (in-play/recent today) up to 72 hours ahead
      return diffMs >= -12 * 3600 * 1000 && diffMs <= 3 * 24 * 3600 * 1000;
    }

    case 'WEEKEND': {
      const day = kickoffDate.getUTCDay();
      return day === 5 || day === 6 || day === 0; // Friday, Saturday, Sunday
    }

    default:
      return true;
  }
}
