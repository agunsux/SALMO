// SALMO.DEV — Global Quant Terminal i18n Types & Locale Registry
// Supports the 7 highest-volume football & Asian Handicap bettor languages:
// en, es, pt, zh, id, th, vi

export const SUPPORTED_LOCALES = [
  { code: 'en', label: 'English', nativeName: 'English', flag: '🇬🇧' },
  { code: 'es', label: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'pt', label: 'Portuguese', nativeName: 'Português', flag: '🇧🇷' },
  { code: 'zh', label: 'Chinese', nativeName: '简体中文', flag: '🇨🇳' },
  { code: 'id', label: 'Indonesian', nativeName: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'th', label: 'Thai', nativeName: 'ไทย', flag: '🇹🇭' },
  { code: 'vi', label: 'Vietnamese', nativeName: 'Tiếng Việt', flag: '🇻🇳' },
] as const;

export type LocaleCode = typeof SUPPORTED_LOCALES[number]['code'];

export const DEFAULT_LOCALE: LocaleCode = 'en';

export interface TranslationSchema {
  [key: string]: any;
  brand: {
    name: string;
    tagline: string;
    terminalBadge: string;
    subBadge: string;
  };
  nav: {
    todaySlate: string;
    asianHandicap: string;
    overUnder: string;
    moneyline: string;
    valueScanner: string;
    publicLedger: string;
    pricing: string;
    methodology: string;
  };
  markets: {
    asianHandicap: string;
    ahShort: string;
    overUnder: string;
    ouShort: string;
    moneyline: string;
    mlShort: string;
    splitLines: string;
    noVigFair: string;
    marketOdds: string;
    overround: string;
    home: string;
    away: string;
    draw: string;
    over: string;
    under: string;
  };
  table: {
    kickoff: string;
    matchup: string;
    marketLineBest: string;
    fairOdds: string;
    edgeHitRate: string;
    xgProjection: string;
    action: string;
    inspect: string;
    unlock: string;
    emptyState: string;
    loading: string;
  };
  badges: {
    strongValue: string;
    leanWatch: string;
    fairPass: string;
    coverRate: string;
    hitRate: string;
  };
  drawer: {
    deepDiveTitle: string;
    ahTab: string;
    ouTab: string;
    mlTab: string;
    handicapLine: string;
    fairProb: string;
    expectedValue: string;
    poissonExp: string;
    coverRate5Match: string;
    coverRate10Match: string;
    coverRateSeason: string;
    noVigBenchmark: string;
    bookmakerVig: string;
    whyHeader: string;
  };
  filters: {
    allMatches: string;
    valueOnly: string;
    highAhCover: string;
    highOu25: string;
    top5Leagues: string;
    searchPlaceholder: string;
    allLeagues: string;
    today: string;
    tomorrow: string;
    weekend: string;
  };
  oddsFormat: {
    title: string;
    decimal: string;
    american: string;
    hongKong: string;
    malay: string;
  };
  pricing: {
    headerTitle: string;
    headerSubtitle: string;
    freeTitle: string;
    freePrice: string;
    freeDesc: string;
    freeCta: string;
    weekendTitle: string;
    weekendPrice: string;
    weekendDesc: string;
    weekendCta: string;
    starterTitle: string;
    starterPrice: string;
    starterDesc: string;
    starterCta: string;
    grinderTitle: string;
    grinderPrice: string;
    grinderDesc: string;
    grinderCta: string;
    monthlyTitle: string;
    monthlyPrice: string;
    monthlyDesc: string;
    monthlyCta: string;
    annualTitle: string;
    annualPrice: string;
    annualDesc: string;
    annualCta: string;
    earlyAccessBanner: string;
    earlyAccessCta: string;
    paymentMethodsTitle: string;
    stablecoinNotice: string;
  };
  compliance: {
    disclaimer18: string;
    nonGamblingNotice: string;
    termsNotice: string;
  };
}
