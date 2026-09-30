export interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  keyPoints?: string[];
  relatedLink?: {
    text: string;
    href: string;
  };
}

export interface FAQCategoryGroup {
  category: string;
  description: string;
  items: FAQItem[];
}

export const FAQ_DATA: FAQCategoryGroup[] = [
  {
    category: "SALMO Basics",
    description: "Core identity, licensing, and operational scope of SALMO.",
    items: [
      {
        id: "what-is-salmo",
        category: "SALMO Basics",
        question: "What is SALMO?",
        answer: "SALMO is a specialized football betting intelligence and decision-support platform. It evaluates football match data using probabilistic goal-distribution modeling, compares model outputs against devigged sharp bookmaker odds, and surfaces mathematical edge on high-liquidity football markets. SALMO operates as an analytical decision layer, not a generic tipster service.",
        keyPoints: [
          "Focused decision-intelligence platform, not a social tipping channel",
          "Concentrates exclusively on liquid two-way football markets",
          "Separates model probability, market odds, and decision gating"
        ],
        relatedLink: {
          text: "Read Platform Overview",
          href: "/blog/what-is-salmo-football-betting-intelligence"
        }
      },
      {
        id: "is-salmo-a-sportsbook",
        category: "SALMO Basics",
        question: "Is SALMO a sportsbook or bookmaker?",
        answer: "No. SALMO is strictly a research and analytics software platform. SALMO does not accept bets, manage betting accounts, handle player deposits, broker wagers, or execute transactions with bookmakers.",
        keyPoints: [
          "Zero wagering execution or financial custody",
          "100% independent analytical software",
          "Compliant with international information service standards"
        ]
      },
      {
        id: "does-salmo-accept-bets",
        category: "SALMO Basics",
        question: "Does SALMO accept bets or handle money?",
        answer: "No. SALMO never accepts bets, holds stakes, or provides gambling facilities. All model probabilities, edges, and decision badges exist solely for research, statistical comparison, and educational decision intelligence.",
        keyPoints: [
          "No deposits or withdrawals",
          "No affiliate wagering incentives",
          "Pure analytical intelligence"
        ]
      },
      {
        id: "who-is-salmo-for",
        category: "SALMO Basics",
        question: "Who is SALMO designed for?",
        answer: "SALMO is engineered for quantitative football bettors, serious sports investors, and market analysts who demand mathematical rigor over subjective opinions. If you prefer placing 5 to 10 thoroughly vetted, positive-expected-value wagers per week on Asian Handicap or Over/Under rather than scrolling through 150 unstructured accumulators, SALMO is built for you.",
        keyPoints: [
          "Data-driven football analysts and semi-pro bettors",
          "Users who value sample transparency over marketing hype",
          "Bettors specializing in Asian Handicap, O/U, and BTTS"
        ]
      }
    ]
  },
  {
    category: "Markets",
    description: "Scope of supported football betting lines and market coverage.",
    items: [
      {
        id: "what-markets-does-salmo-cover",
        category: "Markets",
        question: "What markets does SALMO cover?",
        answer: "SALMO focuses strictly on the three most liquid and mathematically robust football betting markets: Asian Handicap (including quarter, half, and full lines), Over/Under Goal Totals (the complete line family), and Both Teams To Score (BTTS Yes/No).",
        keyPoints: [
          "Asian Handicap (AH)",
          "Over/Under (O/U Line Family)",
          "Both Teams To Score (BTTS)"
        ],
        relatedLink: {
          text: "Asian Handicap Guide",
          href: "/blog/asian-handicap-betting-explained"
        }
      },
      {
        id: "does-salmo-cover-asian-handicap",
        category: "Markets",
        question: "Does SALMO cover Asian Handicap?",
        answer: "Yes. Asian Handicap is a primary pillar of SALMO. The platform tracks level handicaps (0 / Draw No Bet), half lines (±0.5, ±1.5), and quarter lines (±0.25, ±0.75, ±1.25), deriving model fair odds and assessing positive expected value against devigged benchmark quotes.",
        keyPoints: [
          "Full line family support (0, 0.25, 0.5, 0.75, 1.0, etc.)",
          "Multiplicative devigging against sharp market prices",
          "Automated quarter-line settlement validation"
        ],
        relatedLink: {
          text: "Browse Asian Handicap Fixtures",
          href: "/asian-handicap"
        }
      },
      {
        id: "does-salmo-cover-btts",
        category: "Markets",
        question: "Does SALMO cover BTTS?",
        answer: "Yes. Both Teams To Score (BTTS) is modeled using bivariate goal distributions. SALMO evaluates each club's scoring and conceding profiles under home and away conditions to compute the joint probability of both clubs scoring at least one goal, comparing it with sharp market prices.",
        keyPoints: [
          "BTTS Yes and BTTS No evaluated simultaneously",
          "Home attacking xG vs. away defensive vulnerability modeling",
          "Unbiased margin removal on two-way lines"
        ],
        relatedLink: {
          text: "Browse BTTS Fixtures",
          href: "/btts"
        }
      },
      {
        id: "does-salmo-cover-over-under",
        category: "Markets",
        question: "Does SALMO cover Over/Under?",
        answer: "Yes. Rather than limiting analysis to a single 2.5 line, SALMO treats Over/Under as a complete line family spanning 1.0, 1.5, 2.0, 2.25, 2.5, 2.75, 3.0, and 3.5. Model probabilities are generated across the entire Poisson goal matrix.",
        keyPoints: [
          "Comprehensive line family coverage, not just 2.5",
          "Calculates push probabilities for whole lines (2.0, 3.0)",
          "Full settlement logic for quarter lines (2.25, 2.75)"
        ],
        relatedLink: {
          text: "Browse Over/Under Fixtures",
          href: "/over-under"
        }
      },
      {
        id: "does-salmo-support-quarter-lines",
        category: "Markets",
        question: "Does SALMO support quarter lines?",
        answer: "Yes. Both the prediction models and the production settlement engine (QuarterLineSettler) fully support split quarter lines (e.g., -0.25, +0.75, Over 2.25, Under 2.75). The platform accurately handles Half Win and Half Loss mathematical outcomes without binary reduction.",
        keyPoints: [
          "Quarter-lines split stakes across adjacent whole/half boundaries",
          "Settlement engine resolves WIN, HALF_WIN, PUSH, HALF_LOSS, and LOSS",
          "Accurate expected value calculations reflecting half-stake mechanics"
        ]
      },
      {
        id: "why-exclude-1x2-and-props",
        category: "Markets",
        question: "Why does SALMO exclude 1X2 and player props?",
        answer: "1X2 three-way lines have higher bookmaker margins (vigorish) and lower market efficiency, while player props (cards, corners, fouls) suffer from low betting limits, high liquidity friction, and frequent bookmaker voids. SALMO deliberately restricts its model scope to markets with deep institutional liquidity, tight margins, and robust mathematical tractability.",
        keyPoints: [
          "Eliminating high-margin retail noise",
          "Focusing liquidity where syndicates trade",
          "Preserving strict statistical testability"
        ]
      }
    ]
  },
  {
    category: "Predictions",
    description: "Model probability generation, quality filtering, and update frequencies.",
    items: [
      {
        id: "does-salmo-guarantee-winning-bets",
        category: "Predictions",
        question: "Does SALMO guarantee winning bets?",
        answer: "No. SALMO categorically rejects any claim of guaranteed winnings, fixed bets, or risk-free profits. In football betting, every individual match carries irreducible variance. SALMO identifies statistical edges where the model probability exceeds the bookmaker's implied probability, but positive expected value (+EV) only manifests across a statistically large sample of wagers.",
        keyPoints: [
          "Zero profit or win guarantees",
          "Variance is an inescapable mathematical reality",
          "Only long-term edge over large samples determines expectation"
        ]
      },
      {
        id: "how-often-are-daily-picks-updated",
        category: "Predictions",
        question: "How often are Daily Picks updated?",
        answer: "Daily Picks update systematically as new sharp market odds and verified team data are processed prior to matchday kickoffs. The platform strictly enforces a 7-day UTC rolling window, updating decisions whenever new fixtures pass all mathematical quality and sample size gates.",
        keyPoints: [
          "Continuous rolling pre-match updates",
          "Dynamic UTC-based time horizons",
          "Re-evaluated whenever reference odds shift"
        ],
        relatedLink: {
          text: "View Daily Picks",
          href: "/daily-picks"
        }
      },
      {
        id: "why-daily-picks-count-changes",
        category: "Predictions",
        question: "Why can the number of Daily Picks change from day to day?",
        answer: "SALMO does not produce a quota of daily tips. The number of picks fluctuates depending entirely on whether the market offers mathematical edges that meet our quality threshold. On quiet matchdays or when bookmaker lines are exceptionally sharp, the number of qualified picks may drop to zero. On active league weekends, several fixtures may qualify.",
        keyPoints: [
          "Zero artificial pick quotas",
          "Market efficiency dictates qualification rate",
          "Fail-closed: no forced recommendations when edge is absent"
        ]
      },
      {
        id: "why-fewer-picks-than-competitors",
        category: "Predictions",
        question: "Why can SALMO have fewer picks than another platform?",
        answer: "Our core philosophy is 'Fewer But Qualified Picks'. While retail tipster platforms and scraping tools publish 50 to 200 picks a day across obscure minor leagues to look active, SALMO enforces strict statistical filters: minimum sample size (40+ matches), positive net edge (>= +3.0 pp for LAYAK), and verified sharp market odds. We prefer publishing 3 mathematically defensible picks over 50 speculative tips.",
        keyPoints: [
          "Quality over volume",
          "Protection against account turnover burnout and bookmaker limits",
          "Institutional filtering philosophy"
        ]
      }
    ]
  },
  {
    category: "Value / EV",
    description: "Expected value formulas, fair odds calculation, and edge metrics.",
    items: [
      {
        id: "how-salmo-calculates-value",
        category: "Value / EV",
        question: "How does SALMO calculate value?",
        answer: "SALMO calculates value through a four-step pipeline: (1) derive independent model probability P_model from historical performance data; (2) strip bookmaker margin from reference sharp odds using multiplicative devigging to find fair market probability P_implied; (3) calculate net edge: Edge = P_model - P_implied; and (4) calculate Expected Value: EV = (P_model * Odds) - 1. When EV is positive and exceeds our decision threshold, value is confirmed.",
        keyPoints: [
          "Model Probability vs. Devigged Market Probability",
          "Net Edge in percentage points",
          "Mathematical Expected Value percentage"
        ],
        relatedLink: {
          text: "Read Value Betting Guide",
          href: "/blog/how-to-find-value-bets-football"
        }
      },
      {
        id: "what-is-ev",
        category: "Value / EV",
        question: "What is EV?",
        answer: "EV stands for Expected Value. It measures the average amount you can expect to win or lose per dollar wagered if the exact same bet were repeated thousands of times under identical conditions. A +5.0% EV means that for every $100 wagered across a statistically significant sample, the mathematical expectation is $105 returned ($5 profit).",
        keyPoints: [
          "Formula: EV = (P_model * Decimal Odds) - 1",
          "Positive EV (+EV) represents a mathematical advantage",
          "Negative EV (-EV) represents the bookmaker margin eroding bankroll"
        ]
      },
      {
        id: "what-are-fair-odds",
        category: "Value / EV",
        question: "What are fair odds?",
        answer: "Fair odds (or 'true odds') represent the decimal odds corresponding to an event's true probability with zero bookmaker margin included. They are calculated as 1 / Probability. For example, an event with a 50% probability has fair odds of 2.00. If a bookmaker offers 2.10 on that outcome, it represents a positive expected value wager.",
        keyPoints: [
          "Fair Odds = 1 / Model Probability",
          "Zero vigorish baseline",
          "Benchmark used to evaluate commercial bookmaker offerings"
        ]
      },
      {
        id: "does-positive-ev-guarantee-profit",
        category: "Value / EV",
        question: "Does positive EV guarantee profit?",
        answer: "No. Positive EV does not guarantee that any single bet or short-term series of bets will win. Even a bet with +10% EV has a defined probability of losing on any given Saturday. EV is a long-term metric governed by the Law of Large Numbers; in the short run, downswings and variance are completely normal.",
        keyPoints: [
          "Short-term outcomes are dominated by variance",
          "Long-term outcomes converge toward expected value",
          "Disciplined staking is mandatory to withstand downswings"
        ]
      }
    ]
  },
  {
    category: "Odds",
    description: "Market pricing sources, devigging methodologies, and line movements.",
    items: [
      {
        id: "where-odds-come-from",
        category: "Odds",
        question: "Where do SALMO's market odds come from?",
        answer: "SALMO sources real-time market data from sharp bookmaker reference quotes (primarily Pinnacle and leading Asian syndicate books) via licensed sports data feeds. We reference sharp bookmakers because their high limits and low margins reflect the true consensus of the global betting market.",
        keyPoints: [
          "Sharp market benchmarks (Pinnacle reference pricing)",
          "Real-time pre-match odds ingestion",
          "Zero synthetic or hypothetical placeholder odds"
        ]
      },
      {
        id: "what-is-devigging",
        category: "Odds",
        question: "What is devigging and why is it necessary?",
        answer: "Bookmakers build a profit margin (known as the 'vig', 'juice', or 'overround') into their odds, making the sum of implied probabilities greater than 100% (typically 102%–107%). Devigging is the mathematical process of removing this margin to uncover the bookmaker's true assessment of the match probabilities.",
        keyPoints: [
          "Removes the house cut to isolate true market consensus",
          "Two-way multiplicative devigging used across AH and O/U",
          "Essential prerequisite for calculating accurate net edge"
        ]
      },
      {
        id: "what-is-clv",
        category: "Odds",
        question: "What is Closing Line Value (CLV)?",
        answer: "Closing Line Value (CLV) measures the difference between the odds you secured at the time of your prediction and the final closing odds offered right before kickoff. Beating the closing line (e.g. taking Chelsea at 2.10 when the line closes at 1.95) is widely recognized as the single strongest statistical proof of long-term betting skill.",
        keyPoints: [
          "Compares prediction odds against final pre-kickoff market price",
          "Persistent positive CLV indicates predictive advantage over the market",
          "Insulates assessment from short-term luck and match volatility"
        ]
      }
    ]
  },
  {
    category: "Ledger",
    description: "Point-in-time timestamping, kickoff gates, and immutable prediction records.",
    items: [
      {
        id: "does-salmo-record-predictions-before-kickoff",
        category: "Ledger",
        question: "Does SALMO record predictions before kickoff?",
        answer: "Yes, without exception. Every SALMO prediction is committed to an immutable database ledger with an explicit UTC timestamp, model probability, reference odds snapshot, and unique match identifier before the scheduled kickoff.",
        keyPoints: [
          "Strict UTC timestamp freeze prior to kickoff",
          "Point-in-time reference odds recorded simultaneously",
          "Auditable database trail for every prediction"
        ],
        relatedLink: {
          text: "Read Pre-Kickoff Ledger Guide",
          href: "/blog/how-salmo-records-predictions-before-kickoff"
        }
      },
      {
        id: "can-predictions-be-deleted",
        category: "Ledger",
        question: "Can predictions be deleted or modified after kickoff?",
        answer: "No. Predictions are locked and cannot be edited, updated, or deleted once published and timestamped. Modifying or cherry-picking historical picks is strictly forbidden by our architectural contracts and Zero Fabrication Policy.",
        keyPoints: [
          "Zero historical edits or deletions permitted",
          "Fail-closed architecture prevents post-match alterations",
          "All settled outcomes remain permanently on record"
        ]
      },
      {
        id: "what-is-the-kickoff-gate",
        category: "Ledger",
        question: "What is the Kickoff Gate?",
        answer: "The Kickoff Gate is an automated enforcement layer within SALMO that rejects any prediction generated after or at the exact time of match kickoff (t_prediction >= t_kickoff). If odds or model inputs arrive late, the fixture is immediately closed to new predictions to guarantee zero hindsight bias.",
        keyPoints: [
          "Automated software guardrail against data leakage",
          "Guarantees all predictions represent genuine forward-looking forecasts",
          "Eliminates retrospective curve-fitting"
        ]
      }
    ]
  },
  {
    category: "Settlement",
    description: "Automated match resolution, quarter-line rules, postponements, and cancellations.",
    items: [
      {
        id: "how-settlement-works",
        category: "Settlement",
        question: "How does settlement work?",
        answer: "Following the conclusion of a match, verified final scores are fetched from official provider feeds. The production QuarterLineSettler engine evaluates the scoreline against the exact market line and assigns one of six deterministic outcomes: WIN, HALF_WIN, PUSH, HALF_LOSS, LOSS, or VOID.",
        keyPoints: [
          "Automated reconciliation against official match results",
          "Deterministic QuarterLineSettler resolution",
          "Direct linkage to profit/loss and yield calculations"
        ]
      },
      {
        id: "how-quarter-lines-settle",
        category: "Settlement",
        question: "How are quarter-line Asian Handicap and Over/Under bets settled?",
        answer: "A quarter-line wager splits the stake evenly across the two adjacent whole and half lines. For example, Chelsea -0.75 splits into 50% Chelsea -0.5 and 50% Chelsea -1.0. If Chelsea wins by exactly 1 goal (e.g. 2-1), the -0.5 part wins and the -1.0 part pushes, resulting in a Half Win (+0.5 * (Odds - 1) profit). If the match draws, both parts lose (Loss).",
        keyPoints: [
          "Half Win pays: ((Decimal Odds - 1) / 2) * Stake",
          "Half Loss loses: -0.5 * Stake",
          "Push refunds 100% of stake with zero profit or loss"
        ],
        relatedLink: {
          text: "Detailed Quarter Line Breakdown",
          href: "/blog/asian-handicap-betting-explained"
        }
      },
      {
        id: "how-salmo-handles-postponed-matches",
        category: "Settlement",
        question: "How does SALMO handle postponed matches?",
        answer: "If a match is postponed before kickoff, its status is marked as POSTPONED. If the match is not rescheduled and completed within standard regulatory windows (typically 48 hours depending on provider rules), the prediction is automatically settled as VOID (stake returned at 1.0 odds with zero P/L impact).",
        keyPoints: [
          "Tracked in alignment with international market rules",
          "Unplayed matches resolved as VOID",
          "No artificial win/loss distortion on portfolio metrics"
        ]
      },
      {
        id: "how-salmo-handles-cancelled-matches",
        category: "Settlement",
        question: "How does SALMO handle cancelled matches?",
        answer: "Cancelled or abandoned fixtures that are not officially completed are marked as VOID. In the settlement ledger, voided picks return the initial stake with a profit/loss of exactly 0.00 units, ensuring return calculations remain statistically untainted.",
        keyPoints: [
          "Deterministic VOID outcome",
          "Zero impact on overall bankroll profit or loss",
          "Transparently marked in match audit records"
        ]
      }
    ]
  },
  {
    category: "Performance",
    description: "Mathematical definitions of ROI, Yield, and historical reporting.",
    items: [
      {
        id: "how-salmo-calculates-roi",
        category: "Performance",
        question: "How does SALMO calculate ROI?",
        answer: "Return on Investment (ROI) evaluates capital growth relative to initial starting bankroll. It is defined as: ROI (%) = (Total Net Profit / Starting Bankroll) * 100. It measures the aggregate return on portfolio capital over a specific operational timeframe.",
        keyPoints: [
          "Formula: ROI = (Net Profit / Starting Capital) * 100",
          "Evaluates portfolio growth",
          "Subject to staking sizing parameters"
        ]
      },
      {
        id: "how-salmo-calculates-yield",
        category: "Performance",
        question: "How does SALMO calculate Yield?",
        answer: "Yield measures betting efficiency per unit staked. It is calculated as: Yield (%) = (Total Net Profit / Total Sum of Stakes) * 100. For example, if you place 100 bets of 1 unit each ($100 total turnover) and finish with $106.50 (+ $6.50 profit), your Yield is +6.50%.",
        keyPoints: [
          "Formula: Yield = (Net Profit / Total Turnover) * 100",
          "True measure of predictive efficiency independent of bankroll size",
          "Standard benchmark for quantitative syndicates"
        ]
      },
      {
        id: "difference-between-roi-and-yield",
        category: "Performance",
        question: "What is the difference between ROI and Yield in SALMO?",
        answer: "While many retail websites use the terms interchangeably, SALMO strictly separates them: Yield is net profit divided by total betting turnover (volume of wagers placed), whereas ROI is net profit divided by initial starting bankroll. In quantitative sports betting, Yield is the primary measure of model edge.",
        keyPoints: [
          "Yield = Profit / Turnover",
          "ROI = Profit / Starting Bankroll",
          "High turnover can produce large ROI even with modest, steady Yield"
        ]
      },
      {
        id: "where-to-see-verified-performance",
        category: "Performance",
        question: "Where can I see verified performance data?",
        answer: "SALMO reports verified historical validation metrics on the /research page and within our production audit documentation. In strict adherence to our Zero Fabrication Policy, we do not advertise synthetic win rates or hypothetical compounding curves; performance is presented only through audited walk-forward test matrices and live ledger entries.",
        keyPoints: [
          "Audited walk-forward validation matrix available on /research",
          "Transparent distinction between in-sample and out-of-sample testing",
          "Zero marketing embellishments or fabricated streaks"
        ],
        relatedLink: {
          text: "Inspect Research & Evidence",
          href: "/research"
        }
      }
    ]
  },
  {
    category: "Competitors",
    description: "Objective comparisons between SALMO, OddsJam, ExPrysm, RebelBetting, and BetBurger.",
    items: [
      {
        id: "salmo-vs-oddsjam-faq",
        category: "Competitors",
        question: "How does SALMO compare with OddsJam?",
        answer: "OddsJam is an expansive, multi-sport market scanner built primarily around line shopping, positive EV across dozens of US/EU bookmakers, and arbitrage. SALMO is a focused football-specific platform that generates independent goal-distribution probabilities for Asian Handicap, Over/Under, and BTTS. Bettors seeking high-volume multi-sport arbitrage prefer OddsJam; football traders who want deep domain modeling on liquid markets choose SALMO.",
        keyPoints: [
          "OddsJam: broad multi-sport scanning across 50+ retail sportsbooks",
          "SALMO: dedicated football goal-distribution modeling and edge gating",
          "Both serve distinct, complementary user profiles"
        ],
        relatedLink: {
          text: "Read SALMO vs OddsJam Comparison",
          href: "/blog/salmo-vs-oddsjam"
        }
      },
      {
        id: "salmo-vs-exprysm-faq",
        category: "Competitors",
        question: "How does SALMO compare with ExPrysm?",
        answer: "ExPrysm is an AI football prediction tool covering 650+ leagues with high pick volume (60–200 daily tips across 8+ markets, including cards and corners). SALMO adopts a disciplined 'Fewer But Qualified Picks' philosophy, covering core liquid markets (Asian Handicap, O/U, BTTS), gating decisions with strict confidence tiers, and enforcing transparent pre-kickoff ledgers.",
        keyPoints: [
          "ExPrysm: wide league breadth and high daily pick volume",
          "SALMO: market specialization, rigorous quality gating, and selective volume",
          "SALMO eliminates low-liquidity secondary props to preserve execution limits"
        ],
        relatedLink: {
          text: "Read SALMO vs ExPrysm Comparison",
          href: "/blog/salmo-vs-exprysm"
        }
      },
      {
        id: "salmo-vs-rebelbetting-faq",
        category: "Competitors",
        question: "How does SALMO compare with RebelBetting?",
        answer: "RebelBetting is a pure value betting and surebetting tool that scans for retail bookmaker price delays relative to sharp markets across many sports, requiring users to place hundreds of bets per week. SALMO is a football domain intelligence platform that evaluates match dynamics, team scoring distributions, and fair odds, designed for bettors who want conviction without chasing massive turnover.",
        keyPoints: [
          "RebelBetting: price lag scraping across multiple sports, high turnover volume",
          "SALMO: football-specific Dixon-Coles modeling and curated value picks",
          "SALMO reduces bookmaker account limitation risks by avoiding obscure prop scraping"
        ],
        relatedLink: {
          text: "Read SALMO vs RebelBetting Comparison",
          href: "/blog/salmo-vs-rebelbetting"
        }
      },
      {
        id: "salmo-vs-betburger-faq",
        category: "Competitors",
        question: "How does SALMO compare with BetBurger?",
        answer: "BetBurger specializes in live and pre-match arbitrage (surebets) across a vast network of global bookmakers. It is designed for arbitrageurs who lock in risk-free mathematical spreads across different books. SALMO is not an arbitrage tool; it is a football decision-intelligence platform that models match outcomes to find value within single market lines.",
        keyPoints: [
          "BetBurger: arbitrage scanner across multiple sports and bookmakers",
          "SALMO: single-market football value intelligence and expected value modeling",
          "Different quantitative strategies for different betting approaches"
        ]
      }
    ]
  },
  {
    category: "Pricing / Access",
    description: "Platform access, tier structures, and roadmap availability.",
    items: [
      {
        id: "how-to-access-daily-picks",
        category: "Pricing / Access",
        question: "How often and where can I access Daily Picks?",
        answer: "Daily Picks are publicly accessible directly via the /daily-picks page on SALMO. All qualified matchday assessments, model probabilities, edge percentages, and decision badges (LAYAK, PANTAU, LEWATI) can be reviewed directly in your browser without requiring a subscription during our current preview phase.",
        keyPoints: [
          "Instant web access on /daily-picks",
          "Filterable by market (AH, O/U, BTTS) and verdict (LAYAK, PANTAU, LEWATI)",
          "Inspect evidence and calculation traces on every fixture"
        ],
        relatedLink: {
          text: "Explore Daily Picks Now",
          href: "/daily-picks"
        }
      },
      {
        id: "is-salmo-free",
        category: "Pricing / Access",
        question: "Is SALMO free to use?",
        answer: "SALMO is currently free to access during our launch and evaluation phase. Users can explore daily match intelligence, inspect underlying devigged odds, review evidence drawers, and read all educational guides with zero financial barrier.",
        keyPoints: [
          "Free access during public launch phase",
          "No credit card required",
          "Unrestricted educational content and articles"
        ],
        relatedLink: {
          text: "View Pricing Details",
          href: "/pricing"
        }
      },
      {
        id: "future-premium-features",
        category: "Pricing / Access",
        question: "Will there be premium features in the future?",
        answer: "Yes. As detailed on our /pricing page, advanced analytical capabilities — including programmatic API access, automated webhook notifications, institutional bankroll sizing tools, and real-time closing line value alerts — will be available in future premium tiers. Core educational content and transparent ledger validation will always remain central to SALMO.",
        keyPoints: [
          "Future tiers: Pro ($29/mo) and Institutional ($99/mo)",
          "Advanced API and portfolio tooling planned",
          "Transparent public track record remains standard"
        ]
      }
    ]
  }
];

export const TOTAL_FAQ_QUESTIONS_COUNT = FAQ_DATA.reduce(
  (total, group) => total + group.items.length,
  0
);
