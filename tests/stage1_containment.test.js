// SALMO.DEV — Stage 1B Public-Data Containment Regression Suite
// Verifies containment invariants:
// A: Past LAYAK record is excluded
// B: Upcoming LAYAK with valid modelVersion and market odds is eligible
// C: Upcoming LAYAK without modelVersion is excluded (provenance gate)
// C2: Upcoming LAYAK without valid market odds is excluded from public picks
// D: Empty state distinction: ODDS NOT YET AVAILABLE vs NO QUALIFIED PICKS
// E: Monetization flag controls /pricing and Footer navigation
// F: /performance enforces sample < 30 gate and zero CLV calculation
// G: Eligibility determinism: Evaluated with reference timestamp produces identical results regardless of system clock
// H: Daily picks empty-state regression: Historical rows with odds do NOT suppress ODDS NOT YET AVAILABLE for current actionable rows without odds
// I: Daily picks state classification: Genuinely no qualified picks vs available picks

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const { isPublicPickEligible, isCandidateQualifiedWithoutOdds, classifyDailyPicksState } = require('../src/lib/eligibility.ts');

test('A. Past LAYAK record is excluded by eligibility boundary', async () => {
  const pastPick = {
    fixtureId: 1001,
    homeTeam: 'Arsenal',
    awayTeam: 'Tottenham',
    market: 'AH',
    verdict: 'LAYAK',
    modelVersion: 'poisson_v1_rescue',
    kickoffUtc: '2026-09-18T19:00:00.000Z',
    marketOdds: 1.95,
  };

  const nowMs = new Date('2026-10-05T12:00:00.000Z').getTime();
  const isEligible = isPublicPickEligible(pastPick, nowMs);

  assert.strictEqual(isEligible, false, 'Past LAYAK pick must be strictly excluded from public display');
});

test('B. Upcoming LAYAK with valid modelVersion and market odds is eligible', async () => {
  const futurePick = {
    fixtureId: 1002,
    homeTeam: 'Liverpool',
    awayTeam: 'Chelsea',
    market: 'AH',
    verdict: 'LAYAK',
    modelVersion: 'poisson_v1_rescue',
    kickoffUtc: '2026-10-10T14:00:00.000Z',
    marketOdds: 1.92,
  };

  const nowMs = new Date('2026-10-05T12:00:00.000Z').getTime();
  const isEligible = isPublicPickEligible(futurePick, nowMs);

  assert.strictEqual(isEligible, true, 'Upcoming LAYAK pick with valid modelVersion and odds must be eligible');

  // Also verify provenance resolvable via reasoning string
  const pickWithReasoningProvenance = {
    fixtureId: 1003,
    homeTeam: 'Man City',
    awayTeam: 'Newcastle',
    market: 'OU',
    verdict: 'LAYAK',
    kickoffUtc: '2026-10-10T16:30:00.000Z',
    reasoning: 'Calibrated edge under modelVersion: poisson_v1_rescue',
    marketOdds: 1.88,
  };

  assert.strictEqual(
    isPublicPickEligible(pickWithReasoningProvenance, nowMs),
    true,
    'Upcoming LAYAK with modelVersion in reasoning string must be eligible'
  );
});

test('C. Upcoming LAYAK without modelVersion is excluded (provenance gate)', async () => {
  const pickWithoutProvenance = {
    fixtureId: 1004,
    homeTeam: 'Aston Villa',
    awayTeam: 'Everton',
    market: 'AH',
    verdict: 'LAYAK',
    modelVersion: null,
    reasoning: 'Manual selection without model audit',
    kickoffUtc: '2026-10-10T14:00:00.000Z',
    marketOdds: 2.05,
  };

  const nowMs = new Date('2026-10-05T12:00:00.000Z').getTime();
  const isEligible = isPublicPickEligible(pickWithoutProvenance, nowMs);

  assert.strictEqual(
    isEligible,
    false,
    'Upcoming LAYAK pick lacking modelVersion provenance must be rejected'
  );
});

test('C2. Upcoming LAYAK without valid market odds is excluded from public picks', async () => {
  const pickWithoutOdds = {
    fixtureId: 1005,
    homeTeam: 'Tottenham',
    awayTeam: 'Brentford',
    market: 'AH',
    verdict: 'LAYAK',
    modelVersion: 'poisson_v1_rescue',
    kickoffUtc: '2026-10-10T14:00:00.000Z',
    marketOdds: null,
  };

  const nowMs = new Date('2026-10-05T12:00:00.000Z').getTime();
  assert.strictEqual(
    isPublicPickEligible(pickWithoutOdds, nowMs),
    false,
    'Upcoming pick with null marketOdds must not be qualified for public picks'
  );

  const pickWithZeroOdds = {
    ...pickWithoutOdds,
    marketOdds: 0,
  };
  assert.strictEqual(
    isPublicPickEligible(pickWithZeroOdds, nowMs),
    false,
    'Upcoming pick with zero marketOdds must not be qualified for public picks'
  );
});

test('D. Empty state distinction: ODDS NOT YET AVAILABLE vs NO QUALIFIED PICKS', async () => {
  const dailyPicksPageSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'src', 'app', 'daily-picks', 'page.tsx'),
    'utf8'
  );

  assert.ok(
    dailyPicksPageSource.includes('ODDS NOT YET AVAILABLE'),
    'daily-picks page must contain distinct State A: ODDS NOT YET AVAILABLE'
  );
  assert.ok(
    dailyPicksPageSource.includes('No Qualified Picks Today') ||
    dailyPicksPageSource.includes('NO QUALIFIED PICKS'),
    'daily-picks page must contain distinct State B: No Qualified Picks Today'
  );

  const homePageSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'src', 'app', 'page.tsx'),
    'utf8'
  );

  assert.ok(
    homePageSource.includes('ODDS NOT YET AVAILABLE'),
    'home page must contain distinct State A: ODDS NOT YET AVAILABLE'
  );
  assert.ok(
    homePageSource.includes('NO QUALIFIED PICKS') ||
    homePageSource.includes('No Qualified Picks Today'),
    'home page must contain distinct State B: NO QUALIFIED PICKS'
  );
});

test('E. Monetization flag controls /pricing and Footer navigation', async () => {
  const entitlementsSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'src', 'config', 'entitlements.ts'),
    'utf8'
  );
  assert.ok(
    entitlementsSource.includes("MONETIZATION_ENABLED = process.env.NEXT_PUBLIC_MONETIZATION_ENABLED === 'true'"),
    'entitlements.ts must export client-safe MONETIZATION_ENABLED flag'
  );

  const pricingSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'src', 'app', 'pricing', 'page.tsx'),
    'utf8'
  );
  assert.ok(
    pricingSource.includes('MONETIZATION_ENABLED'),
    'pricing page must check MONETIZATION_ENABLED'
  );
  assert.ok(
    pricingSource.includes('notFound()') || pricingSource.includes('redirect('),
    'pricing page must return 404 (notFound) or redirect when monetization is disabled'
  );

  const sitemapSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'src', 'app', 'sitemap.ts'),
    'utf8'
  );
  assert.ok(
    sitemapSource.includes('MONETIZATION_ENABLED'),
    'sitemap.ts must gate /pricing behind MONETIZATION_ENABLED'
  );

  const footerSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'src', 'components', 'layout', 'Footer.tsx'),
    'utf8'
  );
  assert.ok(
    footerSource.includes('process.env.NEXT_PUBLIC_MONETIZATION_ENABLED === \'true\''),
    'Footer must conditionally render /pricing only when monetization is enabled'
  );
  assert.ok(
    footerSource.includes('href="/performance"'),
    'Footer must include link to /performance'
  );
});

test('F. /performance enforces sample < 30 gate and zero CLV calculation', async () => {
  const performanceSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'src', 'app', 'performance', 'page.tsx'),
    'utf8'
  );

  assert.ok(
    performanceSource.includes('settledCount < 30'),
    'Performance page must enforce settledCount < 30 minimum sample gate'
  );
  assert.ok(
    performanceSource.includes('INSUFFICIENT SAMPLE'),
    'Performance page must render INSUFFICIENT SAMPLE badge when under 30 samples'
  );
  assert.ok(
    !performanceSource.includes('clvPercent') && !performanceSource.includes('roiPercent'),
    'Performance page must not calculate synthetic CLV or ROI percentages'
  );
});

test('G. Eligibility determinism: Evaluated with reference timestamp produces identical results regardless of system clock', async () => {
  const fixedReferenceMs = new Date('2026-10-06T00:00:00.000Z').getTime();
  const pick = {
    fixtureId: 2001,
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    verdict: 'LAYAK',
    modelVersion: 'poisson_v1_rescue',
    kickoffUtc: '2026-10-06T18:00:00.000Z',
    marketOdds: 1.95,
  };

  // Calling multiple times produces deterministic result
  const result1 = isPublicPickEligible(pick, fixedReferenceMs);
  const result2 = isPublicPickEligible(pick, fixedReferenceMs);
  assert.strictEqual(result1, true);
  assert.strictEqual(result2, true);

  // When reference time is after kickoff, strictly false
  const futureReferenceMs = new Date('2026-10-06T20:00:00.000Z').getTime();
  assert.strictEqual(isPublicPickEligible(pick, futureReferenceMs), false);

  // Missing or invalid reference timestamp fails closed
  assert.strictEqual(isPublicPickEligible(pick, undefined), false);
  assert.strictEqual(isPublicPickEligible(pick, NaN), false);
});

test('H. Daily picks empty-state regression: Historical rows with odds do NOT suppress ODDS NOT YET AVAILABLE for current actionable rows without odds', async () => {
  const referenceTimeMs = new Date('2026-10-06T00:00:00.000Z').getTime();

  // 30 past historical picks from September with valid market odds (1.95)
  const pastPicksWithOdds = Array.from({ length: 30 }, (_, i) => ({
    id: `past-${i}`,
    fixtureId: `fix-past-${i}`,
    match: `Past Home ${i} vs Past Away ${i}`,
    homeTeam: `Past Home ${i}`,
    awayTeam: `Past Away ${i}`,
    league: 'Premier League',
    kickoffUtc: '2026-09-20T14:00:00.000Z',
    marketType: 'ASIAN_HANDICAP',
    selection: 'Home -0.5',
    verdict: 'LAYAK',
    modelVersion: 'poisson_v1_rescue',
    marketOdds: 1.95,
  }));

  // 19 upcoming October picks without market odds (marketOdds === null)
  const upcomingPicksWithoutOdds = Array.from({ length: 19 }, (_, i) => ({
    id: `upcoming-${i}`,
    fixtureId: `fix-upcoming-${i}`,
    match: `Upcoming Home ${i} vs Upcoming Away ${i}`,
    homeTeam: `Upcoming Home ${i}`,
    awayTeam: `Upcoming Away ${i}`,
    league: 'Premier League',
    kickoffUtc: '2026-10-10T14:00:00.000Z',
    marketType: 'ASIAN_HANDICAP',
    selection: 'Home -0.5',
    verdict: i === 0 ? 'LAYAK' : 'PANTAU',
    modelVersion: 'poisson_v1_rescue',
    marketOdds: null,
  }));

  // Total 49 picks mimicking the exact production database state
  const totalPicks = [...pastPicksWithOdds, ...upcomingPicksWithoutOdds];
  assert.strictEqual(totalPicks.length, 49);

  // Evaluate empty-state classification
  const classification = classifyDailyPicksState(totalPicks, referenceTimeMs);

  assert.strictEqual(
    classification.state,
    'ODDS_NOT_YET_AVAILABLE',
    'Historical rows with odds must NOT suppress ODDS NOT YET AVAILABLE for current actionable rows without odds'
  );
  assert.strictEqual(classification.eligiblePicks.length, 0);
  assert.strictEqual(classification.currentPicks.length, 19);
});

test('I. Daily picks state classification: Genuinely no qualified picks vs available picks', async () => {
  const referenceTimeMs = new Date('2026-10-06T00:00:00.000Z').getTime();

  // Case B: Upcoming picks exist with odds, but none are qualified (all PANTAU/LEWATI)
  const unqualifiedUpcoming = [
    {
      id: 'up-1',
      fixtureId: '101',
      kickoffUtc: '2026-10-10T14:00:00.000Z',
      verdict: 'PANTAU',
      modelVersion: 'poisson_v1_rescue',
      marketOdds: 1.90,
    },
    {
      id: 'up-2',
      fixtureId: '102',
      kickoffUtc: '2026-10-10T16:30:00.000Z',
      verdict: 'LEWATI',
      modelVersion: 'poisson_v1_rescue',
      marketOdds: 2.10,
    },
  ];
  const classB = classifyDailyPicksState(unqualifiedUpcoming, referenceTimeMs);
  assert.strictEqual(classB.state, 'NO_QUALIFIED_PICKS', 'Must classify as NO_QUALIFIED_PICKS when no candidates are LAYAK');

  // Case C: Upcoming pick exists with odds and verdict LAYAK
  const qualifiedWithOdds = [
    ...unqualifiedUpcoming,
    {
      id: 'up-3',
      fixtureId: '103',
      kickoffUtc: '2026-10-10T19:00:00.000Z',
      verdict: 'LAYAK',
      modelVersion: 'poisson_v1_rescue',
      marketOdds: 1.95,
    },
  ];
  const classC = classifyDailyPicksState(qualifiedWithOdds, referenceTimeMs);
  assert.strictEqual(classC.state, 'AVAILABLE', 'Must classify as AVAILABLE when qualified pick with odds exists');
  assert.strictEqual(classC.eligiblePicks.length, 1);
});
