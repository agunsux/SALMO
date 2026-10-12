// SALMO.DEV — Pre-Registered Evaluation & Promotion Gates (Single Source of Truth)
// Governed by: docs/governance/promotion_gates.md
// Amendment Rule: May only be modified via a new dated commit before an evaluation window opens.

export const REFERENCE_BENCHMARK_BOOKMAKER = 'pinnacle' as const;

export const EXCLUDED_BENCHMARK_BOOKMAKERS = [
  '1xbet',
  'bet365',
  'unibet',
  'williamhill',
  'draftkings',
  'fanduel',
  'soft_book',
] as const;

export const SOFT_BOOK_LINE_SHOPPING_LABEL = 'soft book, not a benchmark' as const;

export const CLOSING_PRICE_RULE_ID = 'LAST_ACTIVE_AT_OR_BEFORE_KICKOFF' as const;

export const MISSING_CLOSING_LINE_REASON = 'line_not_in_series' as const;

export const PRIMARY_DEVIG_METHOD_ID = 'PROPORTIONAL_TWO_WAY' as const;

export const SENSITIVITY_DEVIG_METHOD_ID = 'SHIN_SENSITIVITY_ONLY' as const;

export const GATE_STATUS_NOT_COMPUTABLE_YET = 'NOT_COMPUTABLE_YET' as const;
export const GATE_STATUS_INSUFFICIENT_SAMPLE = 'INSUFFICIENT_SAMPLE' as const;
export const GATE_STATUS_COMPUTABLE = 'COMPUTABLE' as const;

export type PreRegisteredGateStatus =
  | typeof GATE_STATUS_NOT_COMPUTABLE_YET
  | typeof GATE_STATUS_INSUFFICIENT_SAMPLE
  | typeof GATE_STATUS_COMPUTABLE;

// Minimum sample sizes (pre-registered)
export const CLV_HEADLINE_MIN_POSITIONS = 100 as const;
export const HEADLINE_COHORT_MIN_SETTLED_POSITIONS = 100 as const;
export const BRIER_VS_MARKET_MIN_LEGS = 300 as const;

// Pass / sanity thresholds
export const BRIER_DIFF_VS_MARKET_CI95_UPPER_MAX = 0 as const; // (modelBrier - marketBrier) CI95 upper < 0
export const BRIER_COIN_FLIP_SANITY_FLOOR = 0.25 as const; // Sanity floor only, NEVER a promotion pass criterion

// SHADOW -> ACTIVE promotion & ACTIVE -> PAUSED demotion rules
export const PROMOTION_CLV_CI95_LOWER_MIN = 0 as const; // CLV mean CI95 lower bound > 0 at n >= 100
export const PROMOTION_MAX_LEAKAGE_SUSPECT_ROWS = 0 as const; // Zero leakage_suspect rows allowed in window
export const DEMOTION_CLV_CI95_UPPER_MAX = 0 as const; // ACTIVE -> PAUSED if CLV CI95 upper < 0 at n >= 100

// Data-source & licensing constraints
export const ODDSPAPI_HISTORICAL_START_MONTH = '2026-01' as const;
export const ODDSPAPI_HISTORICAL_COOLDOWN_SECONDS = 5 as const;
export const EXPOSE_RAW_BOOKMAKER_ODDS_SERIES_PUBLICLY = false as const;
export const FROZEN_RATINGS_ARTIFACT_SHA256 =
  '53466f88ae63f5246f8756f8873f71c472669b0912f09979cfc5e77b82050984' as const;

export interface PreRegisteredGatesConfig {
  readonly referenceBenchmarkBookmaker: typeof REFERENCE_BENCHMARK_BOOKMAKER;
  readonly excludedBenchmarkBookmakers: readonly string[];
  readonly softBookLineShoppingLabel: typeof SOFT_BOOK_LINE_SHOPPING_LABEL;
  readonly closingPriceRuleId: typeof CLOSING_PRICE_RULE_ID;
  readonly missingClosingLineReason: typeof MISSING_CLOSING_LINE_REASON;
  readonly primaryDevigMethodId: typeof PRIMARY_DEVIG_METHOD_ID;
  readonly sensitivityDevigMethodId: typeof SENSITIVITY_DEVIG_METHOD_ID;
  readonly clvHeadlineMinPositions: typeof CLV_HEADLINE_MIN_POSITIONS;
  readonly headlineCohortMinSettledPositions: typeof HEADLINE_COHORT_MIN_SETTLED_POSITIONS;
  readonly brierVsMarketMinLegs: typeof BRIER_VS_MARKET_MIN_LEGS;
  readonly brierDiffVsMarketCi95UpperMax: typeof BRIER_DIFF_VS_MARKET_CI95_UPPER_MAX;
  readonly brierCoinFlipSanityFloor: typeof BRIER_COIN_FLIP_SANITY_FLOOR;
  readonly promotionRules: {
    readonly minClvPositions: typeof CLV_HEADLINE_MIN_POSITIONS;
    readonly clvCi95LowerMin: typeof PROMOTION_CLV_CI95_LOWER_MIN;
    readonly minBrierLegs: typeof BRIER_VS_MARKET_MIN_LEGS;
    readonly brierDiffVsMarketCi95UpperMax: typeof BRIER_DIFF_VS_MARKET_CI95_UPPER_MAX;
    readonly maxLeakageSuspectRows: typeof PROMOTION_MAX_LEAKAGE_SUSPECT_ROWS;
    readonly requireFrozenModelAndRatingsHash: true;
  };
  readonly demotionRules: {
    readonly minClvPositions: typeof CLV_HEADLINE_MIN_POSITIONS;
    readonly clvCi95UpperMax: typeof DEMOTION_CLV_CI95_UPPER_MAX;
  };
  readonly dataSourceConstraints: {
    readonly oddsPapiHistoricalStartMonth: typeof ODDSPAPI_HISTORICAL_START_MONTH;
    readonly oddsPapiHistoricalCooldownSeconds: typeof ODDSPAPI_HISTORICAL_COOLDOWN_SECONDS;
    readonly exposeRawBookmakerOddsSeriesPublicly: typeof EXPOSE_RAW_BOOKMAKER_ODDS_SERIES_PUBLICLY;
    readonly frozenRatingsArtifactSha256: typeof FROZEN_RATINGS_ARTIFACT_SHA256;
  };
}

export const PRE_REGISTERED_GATES: PreRegisteredGatesConfig = Object.freeze({
  referenceBenchmarkBookmaker: REFERENCE_BENCHMARK_BOOKMAKER,
  excludedBenchmarkBookmakers: Object.freeze([...EXCLUDED_BENCHMARK_BOOKMAKERS]),
  softBookLineShoppingLabel: SOFT_BOOK_LINE_SHOPPING_LABEL,
  closingPriceRuleId: CLOSING_PRICE_RULE_ID,
  missingClosingLineReason: MISSING_CLOSING_LINE_REASON,
  primaryDevigMethodId: PRIMARY_DEVIG_METHOD_ID,
  sensitivityDevigMethodId: SENSITIVITY_DEVIG_METHOD_ID,
  clvHeadlineMinPositions: CLV_HEADLINE_MIN_POSITIONS,
  headlineCohortMinSettledPositions: HEADLINE_COHORT_MIN_SETTLED_POSITIONS,
  brierVsMarketMinLegs: BRIER_VS_MARKET_MIN_LEGS,
  brierDiffVsMarketCi95UpperMax: BRIER_DIFF_VS_MARKET_CI95_UPPER_MAX,
  brierCoinFlipSanityFloor: BRIER_COIN_FLIP_SANITY_FLOOR,
  promotionRules: Object.freeze({
    minClvPositions: CLV_HEADLINE_MIN_POSITIONS,
    clvCi95LowerMin: PROMOTION_CLV_CI95_LOWER_MIN,
    minBrierLegs: BRIER_VS_MARKET_MIN_LEGS,
    brierDiffVsMarketCi95UpperMax: BRIER_DIFF_VS_MARKET_CI95_UPPER_MAX,
    maxLeakageSuspectRows: PROMOTION_MAX_LEAKAGE_SUSPECT_ROWS,
    requireFrozenModelAndRatingsHash: true as const,
  }),
  demotionRules: Object.freeze({
    minClvPositions: CLV_HEADLINE_MIN_POSITIONS,
    clvCi95UpperMax: DEMOTION_CLV_CI95_UPPER_MAX,
  }),
  dataSourceConstraints: Object.freeze({
    oddsPapiHistoricalStartMonth: ODDSPAPI_HISTORICAL_START_MONTH,
    oddsPapiHistoricalCooldownSeconds: ODDSPAPI_HISTORICAL_COOLDOWN_SECONDS,
    exposeRawBookmakerOddsSeriesPublicly: EXPOSE_RAW_BOOKMAKER_ODDS_SERIES_PUBLICLY,
    frozenRatingsArtifactSha256: FROZEN_RATINGS_ARTIFACT_SHA256,
  }),
});

/**
 * Strictly validates that a bookmaker slug is the sole pre-registered benchmark ('pinnacle').
 * Rejects '1xbet' and all other soft or non-Pinnacle bookmakers.
 */
export function isValidBenchmarkBookmaker(bookmaker: unknown): boolean {
  if (typeof bookmaker !== 'string') return false;
  return bookmaker.trim().toLowerCase() === REFERENCE_BENCHMARK_BOOKMAKER;
}

/**
 * Asserts that a bookmaker slug is 'pinnacle' before allowing any CLV or market-baseline computation.
 * Throws if any non-'pinnacle' bookmaker (such as '1xbet') is supplied.
 */
export function assertBenchmarkBookmaker(
  bookmaker: unknown
): typeof REFERENCE_BENCHMARK_BOOKMAKER {
  if (!isValidBenchmarkBookmaker(bookmaker)) {
    throw new Error(
      `Invalid reference benchmark bookmaker '${String(bookmaker)}': only '${REFERENCE_BENCHMARK_BOOKMAKER}' is permitted for CLV and market-baseline evaluation (1xBet and soft books are strictly excluded).`
    );
  }
  return REFERENCE_BENCHMARK_BOOKMAKER;
}

/**
 * Formats the standard insufficient-sample label: "Insufficient sample (n/minRequired)".
 */
export function formatInsufficientSampleLabel(
  n: number,
  minRequired: number = HEADLINE_COHORT_MIN_SETTLED_POSITIONS
): string {
  const safeN = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  return `Insufficient sample (${safeN}/${minRequired})`;
}
