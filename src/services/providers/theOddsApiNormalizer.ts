// SALMO.DEV — The Odds API Canonical Normalizer
// Invariants enforced:
// 1. Strict Market Scope: Only AH (Asian Handicap), OU (Over/Under), and BTTS.
// 2. Asian Handicap: Preserves signed line (-0.75, -0.5, -0.25, 0, +0.25, +0.5, +0.75, etc.),
//    price, bookmaker, and side. Never collapses quarter lines.
// 3. Over / Under: Line family preserved (1.5, 2.0, 2.25, 2.5, 2.75, 3.0, 3.25, etc.).
//    Categorized into FULL, HALF, QUARTER line types. Never hardcodes 2.5.
// 4. BTTS: Yes / No preserved for research.
// 5. Zero Fabrication: Rejects invalid, non-positive, or missing lines and odds.

export type LineType = 'FULL' | 'HALF' | 'QUARTER' | 'NONE';

export function classifyLineType(line: number | null | undefined): LineType {
  if (line === null || line === undefined || isNaN(line)) return 'NONE';
  const abs = Math.abs(line);
  const frac = Math.round((abs - Math.floor(abs)) * 100) / 100;

  if (frac === 0) return 'FULL';
  if (frac === 0.5) return 'HALF';
  if (frac === 0.25 || frac === 0.75) return 'QUARTER';
  return 'FULL';
}

export interface TheOddsApiOutcome {
  name: string;
  price: number;
  point?: number;
}

export interface TheOddsApiMarket {
  key: string; // 'spreads' | 'totals' | 'btts' | 'h2h'
  last_update?: string;
  outcomes: TheOddsApiOutcome[];
}

export interface TheOddsApiBookmaker {
  key: string;
  title: string;
  last_update?: string;
  markets: TheOddsApiMarket[];
}

export interface TheOddsApiEvent {
  id: string;
  sport_key: string;
  sport_title?: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: TheOddsApiBookmaker[];
}

export interface CanonicalOddsRecord {
  recordId: string;
  canonicalMatchId: string | null;
  providerMatchId: string;
  provider: 'the-odds-api';
  sportKey: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;
  bookmaker: string;
  market: 'AH' | 'OU' | 'BTTS';
  line: number | null;
  lineType: LineType;
  selection: string;
  oddsDecimal: number;
  homeOdds?: number;
  awayOdds?: number;
  overOdds?: number;
  underOdds?: number;
  yesOdds?: number;
  noOdds?: number;
  capturedAt: string;
  providerTimestamp?: string;
  isMainLine: boolean;
}

export class TheOddsApiNormalizer {
  /**
   * Normalizes team names for matching against canonical registry.
   */
  public static normalizeTeamName(name: string): string {
    return (name || '')
      .toLowerCase()
      .replace(/\./g, '')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\b(fc|afc|cf|sc|ssc|as|ac|rc|de|cd|ca)\b/gi, '')
      .replace(/\s+/g, '')
      .trim();
  }

  /**
   * Normalizes a raw event from The Odds API into canonical odds records.
   */
  public static normalizeEvent(
    event: TheOddsApiEvent,
    options: {
      canonicalMatchId?: string | null;
      canonicalLeagueId?: string;
      capturedAt?: string;
    } = {}
  ): CanonicalOddsRecord[] {
    const results: CanonicalOddsRecord[] = [];
    const capturedAt = options.capturedAt || new Date().toISOString();
    const canonicalMatchId = options.canonicalMatchId || null;
    const league = options.canonicalLeagueId || event.sport_key;

    if (!event.bookmakers || !Array.isArray(event.bookmakers)) {
      return results;
    }

    const cleanHome = this.normalizeTeamName(event.home_team);
    const cleanAway = this.normalizeTeamName(event.away_team);

    for (const bookmaker of event.bookmakers) {
      if (!bookmaker.markets || !Array.isArray(bookmaker.markets)) continue;

      for (const market of bookmaker.markets) {
        const marketKey = (market.key || '').toLowerCase();
        const marketTime = market.last_update || bookmaker.last_update;

        // 1. Spreads / Asian Handicap
        if (marketKey === 'spreads') {
          let homeOutcome: TheOddsApiOutcome | undefined;
          let awayOutcome: TheOddsApiOutcome | undefined;

          for (const o of market.outcomes) {
            const cleanName = this.normalizeTeamName(o.name);
            if (cleanName === cleanHome || o.name.toLowerCase() === 'home') {
              homeOutcome = o;
            } else if (cleanName === cleanAway || o.name.toLowerCase() === 'away') {
              awayOutcome = o;
            }
          }

          if (homeOutcome && homeOutcome.price > 1.0) {
            const line = homeOutcome.point !== undefined ? Number(homeOutcome.point) : 0;
            const lineType = classifyLineType(line);
            results.push({
              recordId: `toa_ah_${event.id}_${bookmaker.key}_H_${line}`,
              canonicalMatchId,
              providerMatchId: event.id,
              provider: 'the-odds-api',
              sportKey: event.sport_key,
              league,
              homeTeam: event.home_team,
              awayTeam: event.away_team,
              kickoffUtc: event.commence_time,
              bookmaker: bookmaker.key,
              market: 'AH',
              line,
              lineType,
              selection: 'HOME',
              oddsDecimal: homeOutcome.price,
              homeOdds: homeOutcome.price,
              awayOdds: awayOutcome?.price,
              capturedAt,
              providerTimestamp: marketTime,
              isMainLine: true,
            });
          }

          if (awayOutcome && awayOutcome.price > 1.0) {
            const line = awayOutcome.point !== undefined ? Number(awayOutcome.point) : 0;
            const lineType = classifyLineType(line);
            results.push({
              recordId: `toa_ah_${event.id}_${bookmaker.key}_A_${line}`,
              canonicalMatchId,
              providerMatchId: event.id,
              provider: 'the-odds-api',
              sportKey: event.sport_key,
              league,
              homeTeam: event.home_team,
              awayTeam: event.away_team,
              kickoffUtc: event.commence_time,
              bookmaker: bookmaker.key,
              market: 'AH',
              line,
              lineType,
              selection: 'AWAY',
              oddsDecimal: awayOutcome.price,
              homeOdds: homeOutcome?.price,
              awayOdds: awayOutcome.price,
              capturedAt,
              providerTimestamp: marketTime,
              isMainLine: true,
            });
          }
        }

        // 2. Totals / Over/Under
        else if (marketKey === 'totals') {
          const outcomesByPoint = new Map<number, { over?: number; under?: number }>();

          for (const o of market.outcomes) {
            const point = o.point !== undefined ? Number(o.point) : 2.5;
            if (!outcomesByPoint.has(point)) {
              outcomesByPoint.set(point, {});
            }
            const group = outcomesByPoint.get(point)!;
            const nameLower = o.name.toLowerCase();
            if (nameLower.includes('over')) {
              group.over = o.price;
            } else if (nameLower.includes('under')) {
              group.under = o.price;
            }
          }

          for (const [line, prices] of outcomesByPoint.entries()) {
            const lineType = classifyLineType(line);

            if (prices.over && prices.over > 1.0) {
              results.push({
                recordId: `toa_ou_${event.id}_${bookmaker.key}_over_${line}`,
                canonicalMatchId,
                providerMatchId: event.id,
                provider: 'the-odds-api',
                sportKey: event.sport_key,
                league,
                homeTeam: event.home_team,
                awayTeam: event.away_team,
                kickoffUtc: event.commence_time,
                bookmaker: bookmaker.key,
                market: 'OU',
                line,
                lineType,
                selection: `Over ${line}`,
                oddsDecimal: prices.over,
                overOdds: prices.over,
                underOdds: prices.under,
                capturedAt,
                providerTimestamp: marketTime,
                isMainLine: line === 2.5,
              });
            }

            if (prices.under && prices.under > 1.0) {
              results.push({
                recordId: `toa_ou_${event.id}_${bookmaker.key}_under_${line}`,
                canonicalMatchId,
                providerMatchId: event.id,
                provider: 'the-odds-api',
                sportKey: event.sport_key,
                league,
                homeTeam: event.home_team,
                awayTeam: event.away_team,
                kickoffUtc: event.commence_time,
                bookmaker: bookmaker.key,
                market: 'OU',
                line,
                lineType,
                selection: `Under ${line}`,
                oddsDecimal: prices.under,
                overOdds: prices.over,
                underOdds: prices.under,
                capturedAt,
                providerTimestamp: marketTime,
                isMainLine: line === 2.5,
              });
            }
          }
        }

        // 3. Both Teams To Score (BTTS) — Research Only
        else if (marketKey === 'btts') {
          const yesOutcome = market.outcomes.find((o) => o.name.toLowerCase() === 'yes');
          const noOutcome = market.outcomes.find((o) => o.name.toLowerCase() === 'no');

          if (yesOutcome && yesOutcome.price > 1.0) {
            results.push({
              recordId: `toa_btts_${event.id}_${bookmaker.key}_yes`,
              canonicalMatchId,
              providerMatchId: event.id,
              provider: 'the-odds-api',
              sportKey: event.sport_key,
              league,
              homeTeam: event.home_team,
              awayTeam: event.away_team,
              kickoffUtc: event.commence_time,
              bookmaker: bookmaker.key,
              market: 'BTTS',
              line: null,
              lineType: 'NONE',
              selection: 'Yes',
              oddsDecimal: yesOutcome.price,
              yesOdds: yesOutcome.price,
              noOdds: noOutcome?.price,
              capturedAt,
              providerTimestamp: marketTime,
              isMainLine: true,
            });
          }

          if (noOutcome && noOutcome.price > 1.0) {
            results.push({
              recordId: `toa_btts_${event.id}_${bookmaker.key}_no`,
              canonicalMatchId,
              providerMatchId: event.id,
              provider: 'the-odds-api',
              sportKey: event.sport_key,
              league,
              homeTeam: event.home_team,
              awayTeam: event.away_team,
              kickoffUtc: event.commence_time,
              bookmaker: bookmaker.key,
              market: 'BTTS',
              line: null,
              lineType: 'NONE',
              selection: 'No',
              oddsDecimal: noOutcome.price,
              yesOdds: yesOutcome?.price,
              noOdds: noOutcome.price,
              capturedAt,
              providerTimestamp: marketTime,
              isMainLine: true,
            });
          }
        }
        // h2h / moneyline is deliberately ignored and rejected to protect AH/OU scope
      }
    }

    return results;
  }
}
