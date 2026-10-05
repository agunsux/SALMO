// SALMO.DEV — Stage 1B Public-Data Containment Regression Suite
// Verifies containment invariants:
// A: Past LAYAK record is excluded
// B: Upcoming LAYAK with valid modelVersion and market odds is eligible
// C: Upcoming LAYAK without modelVersion is excluded (provenance gate)
// C2: Upcoming LAYAK without valid market odds is excluded from public picks
// D: Empty state distinction: ODDS NOT YET AVAILABLE vs NO QUALIFIED PICKS
// E: Monetization flag controls /pricing and Footer navigation
// F: /performance enforces sample < 30 gate and zero CLV calculation

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const { isPublicPickEligible } = require('../src/lib/eligibility.ts');

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
