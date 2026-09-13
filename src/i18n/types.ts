// SALMO.DEV — Multilingual i18n Types & Locale Registry
// Architecture supports 5 launch languages out of the box (en, es, pt-BR, hi, fr),
// with an extensible registry for future expansion (zh-CN, id, de, ja, ko, etc.)

export const SUPPORTED_LOCALES = [
  { code: 'en', label: 'English', nativeName: 'English', dir: 'ltr' },
  { code: 'es', label: 'Spanish', nativeName: 'Español', dir: 'ltr' },
  { code: 'pt-BR', label: 'Portuguese', nativeName: 'Português (Brasil)', dir: 'ltr' },
  { code: 'hi', label: 'Hindi', nativeName: 'हिन्दी', dir: 'ltr' },
  { code: 'fr', label: 'French', nativeName: 'Français', dir: 'ltr' },
] as const;

export type LocaleCode = typeof SUPPORTED_LOCALES[number]['code'];

export const DEFAULT_LOCALE: LocaleCode = 'en';

export interface TranslationDictionary {
  brand: {
    name: string;
    tagline: string;
    subtitle: string;
  };
  nav: {
    matches: string;
    research: string;
    pricing: string;
    account: string;
  };
  header: {
    title: string;
    subtitle: string;
    premierLeague: string;
    liveIndicator: string;
    zeroFabrication: string;
  };
  filters: {
    allMarkets: string;
    ah: string;
    btts: string;
    ou: string;
    valueOnly: string;
    highConfidence: string;
  };
  markets: {
    asianHandicap: string;
    ahShort: string;
    btts: string;
    bttsShort: string;
    overUnder: string;
    ouShort: string;
  };
  decisions: {
    green: string;
    greenLabel: string;
    yellow: string;
    yellowLabel: string;
    red: string;
    redLabel: string;
    grey: string;
    greyLabel: string;
  };
  confidence: {
    high: string;
    medium: string;
    low: string;
    none: string;
  };
  states: {
    oddsUnavailable: string;
    oddsUnavailableDesc: string;
    insufficientSample: string;
    insufficientSampleDesc: string;
    livePaused: string;
    livePausedDesc: string;
    noFixtures: string;
  };
  actions: {
    why: string;
    evidence: string;
    trace: string;
    viewMatches: string;
    close: string;
    collapse: string;
    unlockEvidence: string;
  };
  why: {
    title: string;
    sampleSize: string;
    coverRate: string;
    observedOdds: string;
    modelProb: string;
    impliedProb: string;
    estimatedEdge: string;
    dataQuality: string;
    validation: string;
  };
  evidence: {
    title: string;
    subtitle: string;
    distribution: string;
    win: string;
    halfWin: string;
    push: string;
    halfLoss: string;
    loss: string;
    matchLedger: string;
    date: string;
    fixture: string;
    score: string;
    line: string;
    odds: string;
    result: string;
    profit: string;
  };
  trace: {
    title: string;
    subtitle: string;
    formula: string;
    result: string;
    origin: string;
    devigFormula: string;
    poissonFormula: string;
    edgeFormula: string;
  };
}

