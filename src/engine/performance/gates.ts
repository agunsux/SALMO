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

// ─── SHADOW-TO-PRODUCTION PROMOTION MATRIX TAXONOMY (PHASE 3) ────────────────

export const SHADOW_PROMOTION_MATRIX_STATUSES = [
  'ELIGIBLE_FOR_SHADOW_VALIDATION',
  'ELIGIBLE_FOR_MANUAL_PROMOTION_REVIEW',
  'BLOCKED_MISSING_ODDS',
  'BLOCKED_DATA_INTEGRITY',
  'BLOCKED_MODEL_VALIDATION',
  'BLOCKED_INSUFFICIENT_SAMPLE',
  'BLOCKED_OPERATIONAL_RISK',
] as const;

export type ShadowPromotionMatrixStatus = (typeof SHADOW_PROMOTION_MATRIX_STATUSES)[number];

export const OU_EVALUATED_LINES = [1.5, 2.0, 2.25, 2.5, 2.75, 3.0, 3.25, 3.5] as const;

export interface H8LeagueBinaryNoPushMetrics {
  readonly nTotalMatches: number;
  readonly nTrainInitial: number;
  readonly nEvalMatches: number;
  readonly ahBalancedHalfLineBrier: number;
  readonly ahBalancedHalfLineCi95: readonly [number, number];
  readonly ahBalancedQuarterFractionalBrierOld: number;
  readonly ahBalancedQuarterBinaryNoPushBrier: number;
  readonly ahBalancedQuarterBinaryNoPushWeightedBrier: number;
  readonly ahBalancedQuarterBinaryNoPushCi95: readonly [number, number];
  readonly ahQuarterLegsResolved: number;
  readonly ahQuarterLegsExcludedPush: number;
  readonly ouBalancedHalfLineBrier: number;
  readonly ouBalancedHalfLineCi95: readonly [number, number];
  readonly ouBalancedQuarterBinaryNoPushBrier: number;
  readonly ouBalancedQuarterBinaryNoPushCi95: readonly [number, number];
  readonly ouQuarterLegsResolved: number;
  readonly ouQuarterLegsExcludedPush: number;
  readonly ouByLineBrier: Readonly<
    Record<
      string,
      {
        readonly brier: number;
        readonly ci95: readonly [number, number];
        readonly nLegsResolved: number;
        readonly nLegsExcludedPush: number;
      }
    >
  >;
}

/**
 * Authoritative H8 binary no-push walk-forward backtest metrics across all 15 leagues
 * (computed read-only from Dribble360 + API-Football archives without mutating the frozen
 * multi_league_team_ratings_v1.0.json artifact).
 */
export const H8_WALKFORWARD_BINARY_NO_PUSH_BY_LEAGUE: Readonly<
  Record<string, H8LeagueBinaryNoPushMetrics | null>
> = Object.freeze({
  'ENG-PL': {
    nTotalMatches: 1329,
    nTrainInitial: 1029,
    nEvalMatches: 300,
    ahBalancedHalfLineBrier: 0.2411,
    ahBalancedHalfLineCi95: [0.2323, 0.2496],
    ahBalancedQuarterFractionalBrierOld: 0.2073,
    ahBalancedQuarterBinaryNoPushBrier: 0.2463,
    ahBalancedQuarterBinaryNoPushWeightedBrier: 0.2465,
    ahBalancedQuarterBinaryNoPushCi95: [0.2396, 0.253],
    ahQuarterLegsResolved: 562,
    ahQuarterLegsExcludedPush: 38,
    ouBalancedHalfLineBrier: 0.2407,
    ouBalancedHalfLineCi95: [0.2332, 0.2484],
    ouBalancedQuarterBinaryNoPushBrier: 0.2433,
    ouBalancedQuarterBinaryNoPushCi95: [0.2372, 0.2497],
    ouQuarterLegsResolved: 375,
    ouQuarterLegsExcludedPush: 49,
    ouByLineBrier: {
      '1.5': { brier: 0.181, ci95: [0.1558, 0.2089], nLegsResolved: 300, nLegsExcludedPush: 0 },
      '2': { brier: 0.2188, ci95: [0.193, 0.2467], nLegsResolved: 235, nLegsExcludedPush: 65 },
      '2.25': { brier: 0.2424, ci95: [0.2292, 0.2555], nLegsResolved: 535, nLegsExcludedPush: 65 },
      '2.5': { brier: 0.2605, ci95: [0.2482, 0.2726], nLegsResolved: 300, nLegsExcludedPush: 0 },
      '2.75': { brier: 0.2569, ci95: [0.2464, 0.2664], nLegsResolved: 531, nLegsExcludedPush: 69 },
      '3': { brier: 0.2522, ci95: [0.2356, 0.2682], nLegsResolved: 231, nLegsExcludedPush: 69 },
      '3.25': { brier: 0.2305, ci95: [0.2165, 0.2432], nLegsResolved: 531, nLegsExcludedPush: 69 },
      '3.5': { brier: 0.214, ci95: [0.1932, 0.2341], nLegsResolved: 300, nLegsExcludedPush: 0 },
    },
  },
  'ESP-LALIGA': {
    nTotalMatches: 1359,
    nTrainInitial: 1059,
    nEvalMatches: 300,
    ahBalancedHalfLineBrier: 0.2452,
    ahBalancedHalfLineCi95: [0.2366, 0.2551],
    ahBalancedQuarterFractionalBrierOld: 0.2098,
    ahBalancedQuarterBinaryNoPushBrier: 0.248,
    ahBalancedQuarterBinaryNoPushWeightedBrier: 0.2481,
    ahBalancedQuarterBinaryNoPushCi95: [0.2415, 0.2551],
    ahQuarterLegsResolved: 562,
    ahQuarterLegsExcludedPush: 38,
    ouBalancedHalfLineBrier: 0.2502,
    ouBalancedHalfLineCi95: [0.2418, 0.259],
    ouBalancedQuarterBinaryNoPushBrier: 0.2484,
    ouBalancedQuarterBinaryNoPushCi95: [0.2418, 0.2557],
    ouQuarterLegsResolved: 377,
    ouQuarterLegsExcludedPush: 49,
    ouByLineBrier: {
      '1.5': { brier: 0.1698, ci95: [0.1465, 0.1913], nLegsResolved: 300, nLegsExcludedPush: 0 },
      '2': { brier: 0.206, ci95: [0.1815, 0.2283], nLegsResolved: 215, nLegsExcludedPush: 85 },
      '2.25': { brier: 0.2301, ci95: [0.216, 0.2431], nLegsResolved: 515, nLegsExcludedPush: 85 },
      '2.5': { brier: 0.248, ci95: [0.2343, 0.2611], nLegsResolved: 300, nLegsExcludedPush: 0 },
      '2.75': { brier: 0.2406, ci95: [0.2274, 0.2541], nLegsResolved: 534, nLegsExcludedPush: 66 },
      '3': { brier: 0.2309, ci95: [0.2065, 0.2559], nLegsResolved: 234, nLegsExcludedPush: 66 },
      '3.25': { brier: 0.2152, ci95: [0.1972, 0.233], nLegsResolved: 534, nLegsExcludedPush: 66 },
      '3.5': { brier: 0.2032, ci95: [0.1782, 0.2291], nLegsResolved: 300, nLegsExcludedPush: 0 },
    },
  },
  'ITA-SERIEA': {
    nTotalMatches: 1331,
    nTrainInitial: 1031,
    nEvalMatches: 300,
    ahBalancedHalfLineBrier: 0.239,
    ahBalancedHalfLineCi95: [0.2304, 0.2479],
    ahBalancedQuarterFractionalBrierOld: 0.2009,
    ahBalancedQuarterBinaryNoPushBrier: 0.2429,
    ahBalancedQuarterBinaryNoPushWeightedBrier: 0.243,
    ahBalancedQuarterBinaryNoPushCi95: [0.2361, 0.2501],
    ahQuarterLegsResolved: 562,
    ahQuarterLegsExcludedPush: 38,
    ouBalancedHalfLineBrier: 0.2507,
    ouBalancedHalfLineCi95: [0.241, 0.2611],
    ouBalancedQuarterBinaryNoPushBrier: 0.2475,
    ouBalancedQuarterBinaryNoPushCi95: [0.2404, 0.2549],
    ouQuarterLegsResolved: 382,
    ouQuarterLegsExcludedPush: 51,
    ouByLineBrier: {
      '1.5': { brier: 0.2064, ci95: [0.1846, 0.2283], nLegsResolved: 300, nLegsExcludedPush: 0 },
      '2': { brier: 0.2441, ci95: [0.2254, 0.262], nLegsResolved: 222, nLegsExcludedPush: 78 },
      '2.25': { brier: 0.2518, ci95: [0.2407, 0.2629], nLegsResolved: 522, nLegsExcludedPush: 78 },
      '2.5': { brier: 0.2577, ci95: [0.2451, 0.271], nLegsResolved: 300, nLegsExcludedPush: 0 },
      '2.75': { brier: 0.2401, ci95: [0.2248, 0.2551], nLegsResolved: 536, nLegsExcludedPush: 64 },
      '3': { brier: 0.2166, ci95: [0.1906, 0.2421], nLegsResolved: 236, nLegsExcludedPush: 64 },
      '3.25': { brier: 0.1944, ci95: [0.1753, 0.2141], nLegsResolved: 536, nLegsExcludedPush: 64 },
      '3.5': { brier: 0.1778, ci95: [0.1516, 0.2056], nLegsResolved: 300, nLegsExcludedPush: 0 },
    },
  },
  'DEU-BUNDESLIGA': {
    nTotalMatches: 1061,
    nTrainInitial: 761,
    nEvalMatches: 300,
    ahBalancedHalfLineBrier: 0.248,
    ahBalancedHalfLineCi95: [0.2394, 0.257],
    ahBalancedQuarterFractionalBrierOld: 0.2121,
    ahBalancedQuarterBinaryNoPushBrier: 0.2486,
    ahBalancedQuarterBinaryNoPushWeightedBrier: 0.2489,
    ahBalancedQuarterBinaryNoPushCi95: [0.2421, 0.2557],
    ahQuarterLegsResolved: 555,
    ahQuarterLegsExcludedPush: 45,
    ouBalancedHalfLineBrier: 0.2481,
    ouBalancedHalfLineCi95: [0.239, 0.258],
    ouBalancedQuarterBinaryNoPushBrier: 0.2492,
    ouBalancedQuarterBinaryNoPushCi95: [0.2422, 0.2571],
    ouQuarterLegsResolved: 393,
    ouQuarterLegsExcludedPush: 49,
    ouByLineBrier: {
      '1.5': { brier: 0.1407, ci95: [0.1145, 0.167], nLegsResolved: 300, nLegsExcludedPush: 0 },
      '2': { brier: 0.1681, ci95: [0.1405, 0.1952], nLegsResolved: 247, nLegsExcludedPush: 53 },
      '2.25': { brier: 0.2027, ci95: [0.1869, 0.2179], nLegsResolved: 547, nLegsExcludedPush: 53 },
      '2.5': { brier: 0.2308, ci95: [0.2158, 0.2446], nLegsResolved: 300, nLegsExcludedPush: 0 },
      '2.75': { brier: 0.238, ci95: [0.2268, 0.2485], nLegsResolved: 540, nLegsExcludedPush: 60 },
      '3': { brier: 0.247, ci95: [0.2301, 0.2654], nLegsResolved: 240, nLegsExcludedPush: 60 },
      '3.25': { brier: 0.2455, ci95: [0.2325, 0.2592], nLegsResolved: 540, nLegsExcludedPush: 60 },
      '3.5': { brier: 0.2442, ci95: [0.2259, 0.2628], nLegsResolved: 300, nLegsExcludedPush: 0 },
    },
  },
  'FRA-LIGUE1': {
    nTotalMatches: 1091,
    nTrainInitial: 791,
    nEvalMatches: 300,
    ahBalancedHalfLineBrier: 0.2451,
    ahBalancedHalfLineCi95: [0.2368, 0.2536],
    ahBalancedQuarterFractionalBrierOld: 0.2134,
    ahBalancedQuarterBinaryNoPushBrier: 0.2495,
    ahBalancedQuarterBinaryNoPushWeightedBrier: 0.2495,
    ahBalancedQuarterBinaryNoPushCi95: [0.2427, 0.2558],
    ahQuarterLegsResolved: 564,
    ahQuarterLegsExcludedPush: 36,
    ouBalancedHalfLineBrier: 0.2402,
    ouBalancedHalfLineCi95: [0.2316, 0.2488],
    ouBalancedQuarterBinaryNoPushBrier: 0.2471,
    ouBalancedQuarterBinaryNoPushCi95: [0.2405, 0.2538],
    ouQuarterLegsResolved: 382,
    ouQuarterLegsExcludedPush: 49,
    ouByLineBrier: {
      '1.5': { brier: 0.1947, ci95: [0.1669, 0.2235], nLegsResolved: 300, nLegsExcludedPush: 0 },
      '2': { brier: 0.2215, ci95: [0.1965, 0.2462], nLegsResolved: 241, nLegsExcludedPush: 59 },
      '2.25': { brier: 0.2336, ci95: [0.2206, 0.2462], nLegsResolved: 541, nLegsExcludedPush: 59 },
      '2.5': { brier: 0.2432, ci95: [0.2314, 0.2562], nLegsResolved: 300, nLegsExcludedPush: 0 },
      '2.75': { brier: 0.2408, ci95: [0.2298, 0.2515], nLegsResolved: 525, nLegsExcludedPush: 75 },
      '3': { brier: 0.2377, ci95: [0.2173, 0.2583], nLegsResolved: 225, nLegsExcludedPush: 75 },
      '3.25': { brier: 0.2264, ci95: [0.2121, 0.2404], nLegsResolved: 525, nLegsExcludedPush: 75 },
      '3.5': { brier: 0.2177, ci95: [0.1972, 0.2386], nLegsResolved: 300, nLegsExcludedPush: 0 },
    },
  },
  'NED-ERE': {
    nTotalMatches: 1095,
    nTrainInitial: 795,
    nEvalMatches: 300,
    ahBalancedHalfLineBrier: 0.2425,
    ahBalancedHalfLineCi95: [0.2346, 0.2497],
    ahBalancedQuarterFractionalBrierOld: 0.2102,
    ahBalancedQuarterBinaryNoPushBrier: 0.2455,
    ahBalancedQuarterBinaryNoPushWeightedBrier: 0.2456,
    ahBalancedQuarterBinaryNoPushCi95: [0.2391, 0.2519],
    ahQuarterLegsResolved: 562,
    ahQuarterLegsExcludedPush: 38,
    ouBalancedHalfLineBrier: 0.2438,
    ouBalancedHalfLineCi95: [0.2352, 0.2535],
    ouBalancedQuarterBinaryNoPushBrier: 0.2491,
    ouBalancedQuarterBinaryNoPushCi95: [0.2412, 0.2566],
    ouQuarterLegsResolved: 382,
    ouQuarterLegsExcludedPush: 51,
    ouByLineBrier: {
      '1.5': { brier: 0.1119, ci95: [0.0881, 0.1372], nLegsResolved: 300, nLegsExcludedPush: 0 },
      '2': { brier: 0.1404, ci95: [0.1165, 0.1644], nLegsResolved: 239, nLegsExcludedPush: 61 },
      '2.25': { brier: 0.1902, ci95: [0.1757, 0.2041], nLegsResolved: 539, nLegsExcludedPush: 61 },
      '2.5': { brier: 0.2279, ci95: [0.2139, 0.2422], nLegsResolved: 300, nLegsExcludedPush: 0 },
      '2.75': { brier: 0.2334, ci95: [0.2221, 0.2447], nLegsResolved: 537, nLegsExcludedPush: 63 },
      '3': { brier: 0.2403, ci95: [0.2251, 0.2555], nLegsResolved: 237, nLegsExcludedPush: 63 },
      '3.25': { brier: 0.2399, ci95: [0.2274, 0.2522], nLegsResolved: 537, nLegsExcludedPush: 63 },
      '3.5': { brier: 0.2396, ci95: [0.2219, 0.2567], nLegsResolved: 300, nLegsExcludedPush: 0 },
    },
  },
  'POR-PRIMEIRA': {
    nTotalMatches: 1088,
    nTrainInitial: 788,
    nEvalMatches: 300,
    ahBalancedHalfLineBrier: 0.2462,
    ahBalancedHalfLineCi95: [0.2379, 0.256],
    ahBalancedQuarterFractionalBrierOld: 0.2063,
    ahBalancedQuarterBinaryNoPushBrier: 0.245,
    ahBalancedQuarterBinaryNoPushWeightedBrier: 0.2451,
    ahBalancedQuarterBinaryNoPushCi95: [0.2384, 0.2515],
    ahQuarterLegsResolved: 563,
    ahQuarterLegsExcludedPush: 37,
    ouBalancedHalfLineBrier: 0.2519,
    ouBalancedHalfLineCi95: [0.2428, 0.2616],
    ouBalancedQuarterBinaryNoPushBrier: 0.2512,
    ouBalancedQuarterBinaryNoPushCi95: [0.244, 0.2588],
    ouQuarterLegsResolved: 382,
    ouQuarterLegsExcludedPush: 49,
    ouByLineBrier: {
      '1.5': { brier: 0.188, ci95: [0.1642, 0.2123], nLegsResolved: 300, nLegsExcludedPush: 0 },
      '2': { brier: 0.2109, ci95: [0.1904, 0.2315], nLegsResolved: 235, nLegsExcludedPush: 65 },
      '2.25': { brier: 0.2284, ci95: [0.2165, 0.2401], nLegsResolved: 535, nLegsExcludedPush: 65 },
      '2.5': { brier: 0.2425, ci95: [0.2293, 0.2561], nLegsResolved: 300, nLegsExcludedPush: 0 },
      '2.75': { brier: 0.2425, ci95: [0.23, 0.2548], nLegsResolved: 525, nLegsExcludedPush: 75 },
      '3': { brier: 0.2424, ci95: [0.2188, 0.2658], nLegsResolved: 225, nLegsExcludedPush: 75 },
      '3.25': { brier: 0.2324, ci95: [0.2155, 0.2494], nLegsResolved: 525, nLegsExcludedPush: 75 },
      '3.5': { brier: 0.2244, ci95: [0.1972, 0.2519], nLegsResolved: 300, nLegsExcludedPush: 0 },
    },
  },
  'BEL-PRO': {
    nTotalMatches: 1087,
    nTrainInitial: 787,
    nEvalMatches: 300,
    ahBalancedHalfLineBrier: 0.2366,
    ahBalancedHalfLineCi95: [0.2278, 0.2456],
    ahBalancedQuarterFractionalBrierOld: 0.2002,
    ahBalancedQuarterBinaryNoPushBrier: 0.243,
    ahBalancedQuarterBinaryNoPushWeightedBrier: 0.2431,
    ahBalancedQuarterBinaryNoPushCi95: [0.2363, 0.2503],
    ahQuarterLegsResolved: 551,
    ahQuarterLegsExcludedPush: 49,
    ouBalancedHalfLineBrier: 0.2515,
    ouBalancedHalfLineCi95: [0.2421, 0.2615],
    ouBalancedQuarterBinaryNoPushBrier: 0.2495,
    ouBalancedQuarterBinaryNoPushCi95: [0.2424, 0.2578],
    ouQuarterLegsResolved: 382,
    ouQuarterLegsExcludedPush: 49,
    ouByLineBrier: {
      '1.5': { brier: 0.1844, ci95: [0.1601, 0.2094], nLegsResolved: 300, nLegsExcludedPush: 0 },
      '2': { brier: 0.2237, ci95: [0.2005, 0.2468], nLegsResolved: 243, nLegsExcludedPush: 57 },
      '2.25': { brier: 0.246, ci95: [0.2329, 0.2592], nLegsResolved: 543, nLegsExcludedPush: 57 },
      '2.5': { brier: 0.2633, ci95: [0.2505, 0.277], nLegsResolved: 300, nLegsExcludedPush: 0 },
      '2.75': { brier: 0.2591, ci95: [0.2468, 0.2718], nLegsResolved: 534, nLegsExcludedPush: 66 },
      '3': { brier: 0.2538, ci95: [0.2278, 0.2801], nLegsResolved: 234, nLegsExcludedPush: 66 },
      '3.25': { brier: 0.2334, ci95: [0.2155, 0.2514], nLegsResolved: 534, nLegsExcludedPush: 66 },
      '3.5': { brier: 0.2178, ci95: [0.1924, 0.2431], nLegsResolved: 300, nLegsExcludedPush: 0 },
    },
  },
  'SCO-PREM': {
    nTotalMatches: 468,
    nTrainInitial: 258,
    nEvalMatches: 210,
    ahBalancedHalfLineBrier: 0.2403,
    ahBalancedHalfLineCi95: [0.2297, 0.2503],
    ahBalancedQuarterFractionalBrierOld: 0.2041,
    ahBalancedQuarterBinaryNoPushBrier: 0.2437,
    ahBalancedQuarterBinaryNoPushWeightedBrier: 0.2441,
    ahBalancedQuarterBinaryNoPushCi95: [0.2355, 0.2518],
    ahQuarterLegsResolved: 391,
    ahQuarterLegsExcludedPush: 29,
    ouBalancedHalfLineBrier: 0.2477,
    ouBalancedHalfLineCi95: [0.2365, 0.2582],
    ouBalancedQuarterBinaryNoPushBrier: 0.2438,
    ouBalancedQuarterBinaryNoPushCi95: [0.2352, 0.2522],
    ouQuarterLegsResolved: 277,
    ouQuarterLegsExcludedPush: 34,
    ouByLineBrier: {
      '1.5': { brier: 0.1805, ci95: [0.1492, 0.2139], nLegsResolved: 210, nLegsExcludedPush: 0 },
      '2': { brier: 0.2131, ci95: [0.1831, 0.244], nLegsResolved: 162, nLegsExcludedPush: 48 },
      '2.25': { brier: 0.23, ci95: [0.2139, 0.2458], nLegsResolved: 372, nLegsExcludedPush: 48 },
      '2.5': { brier: 0.2429, ci95: [0.2286, 0.2569], nLegsResolved: 210, nLegsExcludedPush: 0 },
      '2.75': { brier: 0.2404, ci95: [0.2281, 0.2525], nLegsResolved: 367, nLegsExcludedPush: 53 },
      '3': { brier: 0.2373, ci95: [0.2181, 0.256], nLegsResolved: 157, nLegsExcludedPush: 53 },
      '3.25': { brier: 0.2264, ci95: [0.2098, 0.2429], nLegsResolved: 367, nLegsExcludedPush: 53 },
      '3.5': { brier: 0.2179, ci95: [0.1942, 0.2416], nLegsResolved: 210, nLegsExcludedPush: 0 },
    },
  },
  'ENG-CHAMP': {
    nTotalMatches: 1114,
    nTrainInitial: 814,
    nEvalMatches: 300,
    ahBalancedHalfLineBrier: 0.2489,
    ahBalancedHalfLineCi95: [0.2405, 0.2568],
    ahBalancedQuarterFractionalBrierOld: 0.2139,
    ahBalancedQuarterBinaryNoPushBrier: 0.2493,
    ahBalancedQuarterBinaryNoPushWeightedBrier: 0.2494,
    ahBalancedQuarterBinaryNoPushCi95: [0.2428, 0.2562],
    ahQuarterLegsResolved: 551,
    ahQuarterLegsExcludedPush: 49,
    ouBalancedHalfLineBrier: 0.2425,
    ouBalancedHalfLineCi95: [0.2336, 0.2517],
    ouBalancedQuarterBinaryNoPushBrier: 0.2445,
    ouBalancedQuarterBinaryNoPushCi95: [0.2371, 0.2517],
    ouQuarterLegsResolved: 382,
    ouQuarterLegsExcludedPush: 51,
    ouByLineBrier: {
      '1.5': { brier: 0.1868, ci95: [0.1651, 0.2086], nLegsResolved: 300, nLegsExcludedPush: 0 },
      '2': { brier: 0.2291, ci95: [0.2091, 0.2491], nLegsResolved: 229, nLegsExcludedPush: 71 },
      '2.25': { brier: 0.2429, ci95: [0.2331, 0.2527], nLegsResolved: 529, nLegsExcludedPush: 71 },
      '2.5': { brier: 0.2531, ci95: [0.2425, 0.2632], nLegsResolved: 300, nLegsExcludedPush: 0 },
      '2.75': { brier: 0.2386, ci95: [0.2268, 0.2504], nLegsResolved: 547, nLegsExcludedPush: 53 },
      '3': { brier: 0.2191, ci95: [0.1926, 0.2456], nLegsResolved: 247, nLegsExcludedPush: 53 },
      '3.25': { brier: 0.1973, ci95: [0.1794, 0.2152], nLegsResolved: 547, nLegsExcludedPush: 53 },
      '3.5': { brier: 0.1812, ci95: [0.1562, 0.2062], nLegsResolved: 300, nLegsExcludedPush: 0 },
    },
  },
  'USA-MLS': {
    nTotalMatches: 1975,
    nTrainInitial: 1675,
    nEvalMatches: 300,
    ahBalancedHalfLineBrier: 0.2444,
    ahBalancedHalfLineCi95: [0.2364, 0.2527],
    ahBalancedQuarterFractionalBrierOld: 0.2116,
    ahBalancedQuarterBinaryNoPushBrier: 0.247,
    ahBalancedQuarterBinaryNoPushWeightedBrier: 0.2471,
    ahBalancedQuarterBinaryNoPushCi95: [0.2403, 0.2544],
    ahQuarterLegsResolved: 555,
    ahQuarterLegsExcludedPush: 45,
    ouBalancedHalfLineBrier: 0.246,
    ouBalancedHalfLineCi95: [0.2379, 0.2553],
    ouBalancedQuarterBinaryNoPushBrier: 0.248,
    ouBalancedQuarterBinaryNoPushCi95: [0.2415, 0.2552],
    ouQuarterLegsResolved: 382,
    ouQuarterLegsExcludedPush: 49,
    ouByLineBrier: {
      '1.5': { brier: 0.1433, ci95: [0.1187, 0.1679], nLegsResolved: 300, nLegsExcludedPush: 0 },
      '2': { brier: 0.1724, ci95: [0.1458, 0.199], nLegsResolved: 237, nLegsExcludedPush: 63 },
      '2.25': { brier: 0.2086, ci95: [0.1938, 0.2234], nLegsResolved: 537, nLegsExcludedPush: 63 },
      '2.5': { brier: 0.2376, ci95: [0.2243, 0.2507], nLegsResolved: 300, nLegsExcludedPush: 0 },
      '2.75': { brier: 0.2423, ci95: [0.2315, 0.2527], nLegsResolved: 532, nLegsExcludedPush: 68 },
      '3': { brier: 0.2483, ci95: [0.2323, 0.264], nLegsResolved: 232, nLegsExcludedPush: 68 },
      '3.25': { brier: 0.2408, ci95: [0.2287, 0.2529], nLegsResolved: 532, nLegsExcludedPush: 68 },
      '3.5': { brier: 0.2351, ci95: [0.2178, 0.253], nLegsResolved: 300, nLegsExcludedPush: 0 },
    },
  },
  'SAU-PRO': {
    nTotalMatches: 1076,
    nTrainInitial: 776,
    nEvalMatches: 300,
    ahBalancedHalfLineBrier: 0.2432,
    ahBalancedHalfLineCi95: [0.2347, 0.2513],
    ahBalancedQuarterFractionalBrierOld: 0.212,
    ahBalancedQuarterBinaryNoPushBrier: 0.2406,
    ahBalancedQuarterBinaryNoPushWeightedBrier: 0.2409,
    ahBalancedQuarterBinaryNoPushCi95: [0.2337, 0.248],
    ahQuarterLegsResolved: 554,
    ahQuarterLegsExcludedPush: 46,
    ouBalancedHalfLineBrier: 0.2498,
    ouBalancedHalfLineCi95: [0.2407, 0.2589],
    ouBalancedQuarterBinaryNoPushBrier: 0.2481,
    ouBalancedQuarterBinaryNoPushCi95: [0.2413, 0.2552],
    ouQuarterLegsResolved: 407,
    ouQuarterLegsExcludedPush: 40,
    ouByLineBrier: {
      '1.5': { brier: 0.1774, ci95: [0.1515, 0.2058], nLegsResolved: 300, nLegsExcludedPush: 0 },
      '2': { brier: 0.2158, ci95: [0.1883, 0.2422], nLegsResolved: 231, nLegsExcludedPush: 69 },
      '2.25': { brier: 0.2379, ci95: [0.2238, 0.2528], nLegsResolved: 531, nLegsExcludedPush: 69 },
      '2.5': { brier: 0.2549, ci95: [0.2412, 0.2683], nLegsResolved: 300, nLegsExcludedPush: 0 },
      '2.75': { brier: 0.254, ci95: [0.2432, 0.2644], nLegsResolved: 542, nLegsExcludedPush: 58 },
      '3': { brier: 0.2528, ci95: [0.2349, 0.2707], nLegsResolved: 242, nLegsExcludedPush: 58 },
      '3.25': { brier: 0.2413, ci95: [0.2281, 0.2559], nLegsResolved: 542, nLegsExcludedPush: 58 },
      '3.5': { brier: 0.232, ci95: [0.211, 0.2531], nLegsResolved: 300, nLegsExcludedPush: 0 },
    },
  },
  'JPN-J1': {
    nTotalMatches: 760,
    nTrainInitial: 460,
    nEvalMatches: 300,
    ahBalancedHalfLineBrier: 0.2493,
    ahBalancedHalfLineCi95: [0.2406, 0.2584],
    ahBalancedQuarterFractionalBrierOld: 0.2178,
    ahBalancedQuarterBinaryNoPushBrier: 0.2491,
    ahBalancedQuarterBinaryNoPushWeightedBrier: 0.2495,
    ahBalancedQuarterBinaryNoPushCi95: [0.2423, 0.2564],
    ahQuarterLegsResolved: 541,
    ahQuarterLegsExcludedPush: 59,
    ouBalancedHalfLineBrier: 0.2453,
    ouBalancedHalfLineCi95: [0.2358, 0.2553],
    ouBalancedQuarterBinaryNoPushBrier: 0.2479,
    ouBalancedQuarterBinaryNoPushCi95: [0.24, 0.2554],
    ouQuarterLegsResolved: 380,
    ouQuarterLegsExcludedPush: 54,
    ouByLineBrier: {
      '1.5': { brier: 0.2137, ci95: [0.1935, 0.2336], nLegsResolved: 300, nLegsExcludedPush: 0 },
      '2': { brier: 0.2282, ci95: [0.213, 0.2449], nLegsResolved: 244, nLegsExcludedPush: 56 },
      '2.25': { brier: 0.2367, ci95: [0.2257, 0.2477], nLegsResolved: 544, nLegsExcludedPush: 56 },
      '2.5': { brier: 0.2436, ci95: [0.2292, 0.2582], nLegsResolved: 300, nLegsExcludedPush: 0 },
      '2.75': { brier: 0.2275, ci95: [0.2138, 0.2415], nLegsResolved: 526, nLegsExcludedPush: 74 },
      '3': { brier: 0.2061, ci95: [0.1792, 0.2345], nLegsResolved: 226, nLegsExcludedPush: 74 },
      '3.25': { brier: 0.189, ci95: [0.1704, 0.2075], nLegsResolved: 526, nLegsExcludedPush: 74 },
      '3.5': { brier: 0.176, ci95: [0.1519, 0.202], nLegsResolved: 300, nLegsExcludedPush: 0 },
    },
  },
  'KOR-K1': {
    nTotalMatches: 464,
    nTrainInitial: 256,
    nEvalMatches: 208,
    ahBalancedHalfLineBrier: 0.2464,
    ahBalancedHalfLineCi95: [0.2368, 0.2566],
    ahBalancedQuarterFractionalBrierOld: 0.2135,
    ahBalancedQuarterBinaryNoPushBrier: 0.2491,
    ahBalancedQuarterBinaryNoPushWeightedBrier: 0.2493,
    ahBalancedQuarterBinaryNoPushCi95: [0.2407, 0.2571],
    ahQuarterLegsResolved: 377,
    ahQuarterLegsExcludedPush: 39,
    ouBalancedHalfLineBrier: 0.2423,
    ouBalancedHalfLineCi95: [0.2314, 0.2529],
    ouBalancedQuarterBinaryNoPushBrier: 0.2474,
    ouBalancedQuarterBinaryNoPushCi95: [0.2388, 0.2558],
    ouQuarterLegsResolved: 287,
    ouQuarterLegsExcludedPush: 32,
    ouByLineBrier: {
      '1.5': { brier: 0.2013, ci95: [0.1749, 0.2285], nLegsResolved: 208, nLegsExcludedPush: 0 },
      '2': { brier: 0.2285, ci95: [0.2081, 0.2503], nLegsResolved: 159, nLegsExcludedPush: 49 },
      '2.25': { brier: 0.2398, ci95: [0.2286, 0.2513], nLegsResolved: 367, nLegsExcludedPush: 49 },
      '2.5': { brier: 0.2485, ci95: [0.2359, 0.2605], nLegsResolved: 208, nLegsExcludedPush: 0 },
      '2.75': { brier: 0.2402, ci95: [0.2256, 0.2548], nLegsResolved: 375, nLegsExcludedPush: 41 },
      '3': { brier: 0.2298, ci95: [0.2006, 0.2587], nLegsResolved: 167, nLegsExcludedPush: 41 },
      '3.25': { brier: 0.2155, ci95: [0.193, 0.2374], nLegsResolved: 375, nLegsExcludedPush: 41 },
      '3.5': { brier: 0.2041, ci95: [0.1717, 0.2349], nLegsResolved: 208, nLegsExcludedPush: 0 },
    },
  },
  'IDN-L1': null,
});

export interface MarketPromotionGateInput {
  leagueId: string;
  market: 'AH' | 'OU';
  historicalMatchesTotal: number;
  evalSampleSize: number;
  maxHistoricalDate: string | null;
  ratedTeamsCount: number;
  coldStartTeamsCount: number;
  unratedTeamsCount: number;
  chronologicalWalkForwardVerified: boolean;
  leakageSuspectRows?: number;
  frozenModelAndRatingsHashVerified?: boolean;
  dispersionRatio: number | null;
  primaryBrier: number | null;
  primaryBrierCi95: [number, number] | null;
  beatsConstant05At95Ci: boolean;
  logLoss: number | null;
  calibrationSlope: number | null;
  isMarketCalibrated: boolean;
  balancedQuarterBinaryNoPushBrier?: number | null;
  balancedQuarterBinaryNoPushCi95?: readonly [number, number] | null;
  ouBalancedDynamicBrier?: number | null;
  ouBalancedDynamicCi95?: readonly [number, number] | null;
  pinnacleBenchmarkAvailable: boolean;
  pinnacleBenchmarkMatchedFixtures: number;
  pinnacleModelBrierOnMatched?: number | null;
  pinnacleMarketBrierOnMatched?: number | null;
  nClvPositions?: number;
  clvCi95Lower?: number | null;
  liveFixturesWithOddsCount: number;
  quotaAvailable: boolean;
  smokeTestPassed: boolean;
}

export interface MarketPromotionGateEvaluation {
  primaryStatus: ShadowPromotionMatrixStatus;
  shadowValidationEligibility: 'ELIGIBLE_FOR_SHADOW_VALIDATION' | ShadowPromotionMatrixStatus;
  failingGates: string[];
  allPreRegisteredPromotionGatesPass: boolean;
}

/**
 * Evaluates a league-market (AH or OU) against all pre-registered promotion gates in gates.ts
 * and assigns the most restrictive ShadowPromotionMatrixStatus when multiple gates fail.
 */
export function evaluateMarketPromotionGates(
  input: MarketPromotionGateInput
): MarketPromotionGateEvaluation {
  const failingGates: string[] = [];
  let hasDataIntegrityFailure = false;
  let hasInsufficientSampleFailure = false;
  let hasModelValidationFailure = false;
  let hasMissingOddsFailure = false;
  let hasOperationalRiskFailure = false;

  // 1. Data Integrity & Cold-Start Checks
  if (input.historicalMatchesTotal < 120 || input.ratedTeamsCount === 0) {
    hasDataIntegrityFailure = true;
    failingGates.push(
      `DATA_INTEGRITY_MISSING_HISTORICAL_BASELINE (historicalMatches=${input.historicalMatchesTotal}, ratedTeams=${input.ratedTeamsCount})`
    );
  }
  if (
    input.leagueId === 'SCO-PREM' ||
    input.leagueId === 'ENG-CHAMP' ||
    input.leagueId === 'JPN-J1' ||
    (input.maxHistoricalDate && input.maxHistoricalDate < '2026-08-01')
  ) {
    hasDataIntegrityFailure = true;
    failingGates.push(
      `DATA_INTEGRITY_STALE_SEASON_COVERAGE (maxHistoricalDate=${input.maxHistoricalDate ?? 'null'} < 2026-08-01)`
    );
  }
  const isStaleSeasonCoverage = !input.maxHistoricalDate || input.maxHistoricalDate < '2026-08-01';
  if (
    (input.ratedTeamsCount > 0 && input.coldStartTeamsCount > input.ratedTeamsCount * 0.25) ||
    (isStaleSeasonCoverage && input.unratedTeamsCount > 0) ||
    input.leagueId === 'KOR-K1'
  ) {
    hasDataIntegrityFailure = true;
    failingGates.push(
      `DATA_INTEGRITY_COLD_START_TEAMS (coldStartTeams=${input.coldStartTeamsCount}/${input.ratedTeamsCount}, unratedTeams=${input.unratedTeamsCount})`
    );
  }
  if (!input.chronologicalWalkForwardVerified) {
    hasDataIntegrityFailure = true;
    failingGates.push('DATA_INTEGRITY_CHRONOLOGICAL_WALK_FORWARD_UNVERIFIED');
  }
  if ((input.leakageSuspectRows ?? 0) > PROMOTION_MAX_LEAKAGE_SUSPECT_ROWS) {
    hasDataIntegrityFailure = true;
    failingGates.push(`DATA_INTEGRITY_LEAKAGE_SUSPECT_ROWS (${input.leakageSuspectRows} > 0)`);
  }
  if (input.frozenModelAndRatingsHashVerified === false) {
    hasDataIntegrityFailure = true;
    failingGates.push('DATA_INTEGRITY_FROZEN_RATINGS_HASH_MISMATCH');
  }

  // 2. Sample Size Checks
  if (input.evalSampleSize < BRIER_VS_MARKET_MIN_LEGS) {
    hasInsufficientSampleFailure = true;
    failingGates.push(
      `INSUFFICIENT_WALK_FORWARD_SAMPLE (nEval=${input.evalSampleSize} < ${BRIER_VS_MARKET_MIN_LEGS})`
    );
  }

  // 3. Model Validation Checks (Dispersion, Brier Sanity Floor, Multi-Line OU, Calibration Slope)
  if (input.dispersionRatio === null || input.dispersionRatio > 1.15) {
    hasModelValidationFailure = true;
    failingGates.push(
      `MODEL_VALIDATION_OVERDISPERSION (dispersionRatio=${input.dispersionRatio ?? 'null'} > 1.1500)`
    );
  }
  if (
    input.primaryBrier === null ||
    input.primaryBrier >= BRIER_COIN_FLIP_SANITY_FLOOR ||
    !input.beatsConstant05At95Ci ||
    input.logLoss === null ||
    input.logLoss >= 0.6931 ||
    input.calibrationSlope === null ||
    input.calibrationSlope < 0.5 ||
    !input.isMarketCalibrated
  ) {
    hasModelValidationFailure = true;
    const ciStr = input.primaryBrierCi95 ? `[${input.primaryBrierCi95[0]}, ${input.primaryBrierCi95[1]}]` : 'null';
    failingGates.push(
      `MODEL_VALIDATION_WALK_FORWARD_GATE_FAILED (Brier=${input.primaryBrier ?? 'null'}, CI95=${ciStr}, beats025=${input.beatsConstant05At95Ci}, LogLoss=${input.logLoss ?? 'null'}, slope=${input.calibrationSlope ?? 'null'})`
    );
  }
  if (
    input.market === 'OU' &&
    input.ouBalancedDynamicCi95 &&
    input.ouBalancedDynamicCi95[1] >= BRIER_COIN_FLIP_SANITY_FLOOR
  ) {
    // Record dynamic multi-line OU 95% CI overlap when fixed 2.5 was skewed by high league goal environment
    failingGates.push(
      `MODEL_VALIDATION_OU_BALANCED_MULTILINE_CI95_OVERLAPS_025 (ouBalancedBrier=${input.ouBalancedDynamicBrier ?? 'null'}, CI95=[${input.ouBalancedDynamicCi95[0]}, ${input.ouBalancedDynamicCi95[1]}])`
    );
  }
  if (
    input.market === 'AH' &&
    input.balancedQuarterBinaryNoPushCi95 &&
    input.balancedQuarterBinaryNoPushCi95[1] >= BRIER_COIN_FLIP_SANITY_FLOOR
  ) {
    failingGates.push(
      `MODEL_VALIDATION_AH_QUARTER_LINE_BINARY_CI95_OVERLAPS_025 (ahQtrBinaryBrier=${input.balancedQuarterBinaryNoPushBrier ?? 'null'}, CI95=[${input.balancedQuarterBinaryNoPushCi95[0]}, ${input.balancedQuarterBinaryNoPushCi95[1]}])`
    );
  }

  // 4. Odds & Pinnacle Benchmark Checks
  if (!input.pinnacleBenchmarkAvailable || input.pinnacleBenchmarkMatchedFixtures === 0) {
    hasMissingOddsFailure = true;
    failingGates.push(
      `MISSING_HISTORICAL_PINNACLE_BENCHMARK_ODDS (matchedFixtures=${input.pinnacleBenchmarkMatchedFixtures}/${BRIER_VS_MARKET_MIN_LEGS})`
    );
  } else {
    if (
      typeof input.pinnacleModelBrierOnMatched === 'number' &&
      typeof input.pinnacleMarketBrierOnMatched === 'number' &&
      input.pinnacleModelBrierOnMatched >= input.pinnacleMarketBrierOnMatched
    ) {
      hasModelValidationFailure = true;
      failingGates.push(
        `MODEL_DOES_NOT_BEAT_PINNACLE_CLOSING_BRIER (model=${input.pinnacleModelBrierOnMatched} >= pinnacle=${input.pinnacleMarketBrierOnMatched})`
      );
    }
    if (input.pinnacleBenchmarkMatchedFixtures < BRIER_VS_MARKET_MIN_LEGS) {
      hasInsufficientSampleFailure = true;
      failingGates.push(
        `INSUFFICIENT_PINNACLE_BENCHMARK_SAMPLE (matchedFixtures=${input.pinnacleBenchmarkMatchedFixtures} < ${BRIER_VS_MARKET_MIN_LEGS})`
      );
    }
  }

  const nClv = input.nClvPositions ?? 0;
  if (nClv < CLV_HEADLINE_MIN_POSITIONS) {
    hasMissingOddsFailure = true;
    failingGates.push(
      `MISSING_PINNACLE_CLOSING_CLV_SAMPLE (nClv=${nClv}/${CLV_HEADLINE_MIN_POSITIONS})`
    );
  } else if (typeof input.clvCi95Lower === 'number' && input.clvCi95Lower <= PROMOTION_CLV_CI95_LOWER_MIN) {
    hasModelValidationFailure = true;
    failingGates.push(`CLV_CI95_LOWER_NOT_POSITIVE (clvCi95Lower=${input.clvCi95Lower} <= 0)`);
  }

  if (input.liveFixturesWithOddsCount === 0) {
    hasMissingOddsFailure = true;
    failingGates.push('MISSING_LIVE_PINNACLE_MARKET_ODDS (liveFixturesWithOdds=0)');
  }

  // 5. Operational Safety Checks
  if (!input.quotaAvailable) {
    hasOperationalRiskFailure = true;
    failingGates.push('OPERATIONAL_RISK_ODDSPAPI_QUOTA_UNAVAILABLE');
  }
  if (!input.smokeTestPassed && input.liveFixturesWithOddsCount > 0) {
    hasOperationalRiskFailure = true;
    failingGates.push('OPERATIONAL_RISK_SMOKE_TEST_FAILED');
  }

  // Most restrictive status selection
  let primaryStatus: ShadowPromotionMatrixStatus;
  if (hasDataIntegrityFailure) {
    primaryStatus = 'BLOCKED_DATA_INTEGRITY';
  } else if (hasInsufficientSampleFailure && input.evalSampleSize < BRIER_VS_MARKET_MIN_LEGS) {
    primaryStatus = 'BLOCKED_INSUFFICIENT_SAMPLE';
  } else if (hasModelValidationFailure) {
    primaryStatus = 'BLOCKED_MODEL_VALIDATION';
  } else if (hasMissingOddsFailure) {
    primaryStatus = 'BLOCKED_MISSING_ODDS';
  } else if (hasInsufficientSampleFailure) {
    primaryStatus = 'BLOCKED_INSUFFICIENT_SAMPLE';
  } else if (hasOperationalRiskFailure) {
    primaryStatus = 'BLOCKED_OPERATIONAL_RISK';
  } else {
    primaryStatus = 'ELIGIBLE_FOR_MANUAL_PROMOTION_REVIEW';
  }

  // Shadow validation eligibility: a league-market that passes data integrity, nEval >= 300,
  // and primary statistical calibration is ELIGIBLE_FOR_SHADOW_VALIDATION once live odds are collected,
  // even while its production promotion status is BLOCKED_MISSING_ODDS.
  const shadowValidationEligibility: 'ELIGIBLE_FOR_SHADOW_VALIDATION' | ShadowPromotionMatrixStatus =
    !hasDataIntegrityFailure &&
    input.evalSampleSize >= BRIER_VS_MARKET_MIN_LEGS &&
    !hasModelValidationFailure
      ? 'ELIGIBLE_FOR_SHADOW_VALIDATION'
      : primaryStatus;

  const allPreRegisteredPromotionGatesPass =
    primaryStatus === 'ELIGIBLE_FOR_MANUAL_PROMOTION_REVIEW' && failingGates.length === 0;

  return {
    primaryStatus,
    shadowValidationEligibility,
    failingGates,
    allPreRegisteredPromotionGatesPass,
  };
}
