// SALMO.DEV — Blog Publish Date & Asia/Jakarta Timezone Engine Test Suite
// Verifies:
// 1. Past article => Published.
// 2. Today article => Published under date-only calendar-day contract.
// 3. Future article => Upcoming / NOT Published.
// 4. Asia/Jakarta timezone boundary deterministic test matrix (Section 7).
// 5. UTC vs WIB conversion (7 hours offset exactness).
// 6. Date-only parsing preserves calendar day regardless of local runtime timezone.
// 7. Published index excludes future articles (1 Published, 9 Upcoming on 2026-10-07 WIB).
// 8. Sorting does not change publication state.
// 9. No regression for existing published articles.
// 10. Sitemap & SEO behavior: only published articles are exposed.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const ts = require('typescript');

// On-the-fly TypeScript transpile hook for tests
require.extensions['.ts'] = function (module, filename) {
  const content = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(content, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  module._compile(compiled.outputText, filename);
};

const { 
  BLOG_POSTS, 
  getBlogPostPublishTimestamp, 
  isBlogPostPublished, 
  getPublishedBlogPosts, 
  getUpcomingBlogPosts, 
  formatBlogPublishDate,
  ASIA_JAKARTA_OFFSET_HOURS,
  ASIA_JAKARTA_TIMEZONE
} = require('../src/data/blogPosts.ts');

test('SALMO Blog Publish Date & Asia/Jakarta Timezone Suite', async (t) => {
  // Reference date: 2026-10-07 05:57:20 WIB (UTC+7) = 2026-10-06 22:57:20 UTC
  const NOW_OCT_7_WIB = new Date('2026-10-07T05:57:20+07:00').getTime();

  await t.test('1. Past article => Published (2026-10-06 is Published on 2026-10-07 WIB)', () => {
    const isPastPublished = isBlogPostPublished('2026-10-06', NOW_OCT_7_WIB);
    assert.strictEqual(isPastPublished, true, 'Article published on 2026-10-06 must be Published on 2026-10-07 WIB');
  });

  await t.test('2. Today article => Published under date-only calendar-day contract', () => {
    // Under calendar-day semantics, 2026-10-07 begins at 00:00:00 WIB
    const isTodayPublished = isBlogPostPublished('2026-10-07', NOW_OCT_7_WIB);
    assert.strictEqual(isTodayPublished, true, 'Article dated 2026-10-07 must be Published during 2026-10-07 WIB');
  });

  await t.test('3. Future article => Upcoming / NOT Published', () => {
    const isOct8Published = isBlogPostPublished('2026-10-08', NOW_OCT_7_WIB);
    assert.strictEqual(isOct8Published, false, 'Article dated 2026-10-08 must be Upcoming on 2026-10-07 WIB');

    const isOct9Published = isBlogPostPublished('2026-10-09', NOW_OCT_7_WIB);
    assert.strictEqual(isOct9Published, false, 'Article dated 2026-10-09 (Article 2) must be Upcoming on 2026-10-07 WIB');

    const isNov6Published = isBlogPostPublished('2026-11-06', NOW_OCT_7_WIB);
    assert.strictEqual(isNov6Published, false, 'Article dated 2026-11-06 (Article 10) must be Upcoming on 2026-10-07 WIB');
  });

  await t.test('4. Asia/Jakarta timezone boundary deterministic test matrix (Section 7)', () => {
    // Exact test matrix from Section 7 of prompt:
    // 2026-10-06 23:59:59 WIB => 2026-10-06T16:59:59.000Z
    // 2026-10-07 00:00:00 WIB => 2026-10-06T17:00:00.000Z
    // 2026-10-07 00:00:01 WIB => 2026-10-06T17:00:01.000Z
    // 2026-10-07 11:00:00 WIB => 2026-10-07T04:00:00.000Z
    // 2026-10-07 23:59:59 WIB => 2026-10-07T16:59:59.000Z
    // 2026-10-08 00:00:00 WIB => 2026-10-07T17:00:00.000Z

    const boundaryCases = [
      {
        label: '2026-10-06 23:59:59 WIB',
        utcIso: '2026-10-06T16:59:59.000Z',
        expectedOct6: true,
        expectedOct7: false,
        expectedOct8: false,
      },
      {
        label: '2026-10-07 00:00:00 WIB',
        utcIso: '2026-10-06T17:00:00.000Z',
        expectedOct6: true,
        expectedOct7: true,
        expectedOct8: false,
      },
      {
        label: '2026-10-07 00:00:01 WIB',
        utcIso: '2026-10-06T17:00:01.000Z',
        expectedOct6: true,
        expectedOct7: true,
        expectedOct8: false,
      },
      {
        label: '2026-10-07 11:00:00 WIB',
        utcIso: '2026-10-07T04:00:00.000Z',
        expectedOct6: true,
        expectedOct7: true,
        expectedOct8: false,
      },
      {
        label: '2026-10-07 23:59:59 WIB',
        utcIso: '2026-10-07T16:59:59.000Z',
        expectedOct6: true,
        expectedOct7: true,
        expectedOct8: false,
      },
      {
        label: '2026-10-08 00:00:00 WIB',
        utcIso: '2026-10-07T17:00:00.000Z',
        expectedOct6: true,
        expectedOct7: true,
        expectedOct8: true,
      },
    ];

    for (const c of boundaryCases) {
      const now = new Date(c.utcIso).getTime();
      assert.strictEqual(
        isBlogPostPublished('2026-10-06', now),
        c.expectedOct6,
        `${c.label}: 2026-10-06 publication mismatch`
      );
      assert.strictEqual(
        isBlogPostPublished('2026-10-07', now),
        c.expectedOct7,
        `${c.label}: 2026-10-07 publication mismatch`
      );
      assert.strictEqual(
        isBlogPostPublished('2026-10-08', now),
        c.expectedOct8,
        `${c.label}: 2026-10-08 publication mismatch`
      );
    }
  });

  await t.test('5. UTC vs WIB conversion (7 hours offset exactness)', () => {
    assert.strictEqual(ASIA_JAKARTA_OFFSET_HOURS, 7, 'Asia/Jakarta offset must be 7 hours');
    assert.strictEqual(ASIA_JAKARTA_TIMEZONE, 'Asia/Jakarta', 'Timezone identifier must be Asia/Jakarta');

    const tsOct7 = getBlogPostPublishTimestamp('2026-10-07');
    const expectedUtcOct7 = new Date('2026-10-06T17:00:00.000Z').getTime();
    assert.strictEqual(tsOct7, expectedUtcOct7, '2026-10-07 00:00:00 WIB must equal 2026-10-06 17:00:00.000 UTC');

    const diffHours = (new Date('2026-10-07T00:00:00.000Z').getTime() - tsOct7) / (3600 * 1000);
    assert.strictEqual(diffHours, 7, 'Offset between UTC midnight and WIB start must be exactly 7 hours');
  });

  await t.test('6. Date-only parsing preserves calendar day regardless of local runtime timezone', () => {
    const formattedOct6 = formatBlogPublishDate('2026-10-06', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    assert.ok(formattedOct6.includes('Oct 6, 2026'), 'Formatted Oct 6 must stay Oct 6');
    assert.ok(formattedOct6.includes('Tue'), 'Oct 6 2026 must be Tuesday');

    const formattedOct9 = formatBlogPublishDate('2026-10-09', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    assert.ok(formattedOct9.includes('Oct 9, 2026'), 'Formatted Oct 9 must stay Oct 9');
    assert.ok(formattedOct9.includes('Fri'), 'Oct 9 2026 must be Friday');
  });

  await t.test('7. Published index excludes future articles (1 Published, 9 Upcoming on 2026-10-07 WIB)', () => {
    const published = getPublishedBlogPosts(NOW_OCT_7_WIB);
    const upcoming = getUpcomingBlogPosts(NOW_OCT_7_WIB);

    assert.strictEqual(published.length, 1, 'Exactly 1 article must be published on 2026-10-07 WIB');
    assert.strictEqual(published[0].slug, 'what-is-salmo-football-betting-intelligence', 'Published article must be Article 1');
    assert.strictEqual(upcoming.length, 9, 'Remaining 9 articles must be Upcoming');

    const upcomingSlugs = upcoming.map((p) => p.slug);
    assert.ok(upcomingSlugs.includes('salmo-vs-oddsjam'), 'Article 2 must be in upcoming list');
    assert.ok(upcomingSlugs.includes('salmo-faq'), 'Article 10 must be in upcoming list');

    // Upcoming articles must be sorted ascending (earliest upcoming release first)
    assert.strictEqual(upcoming[0].slug, 'salmo-vs-oddsjam', 'First upcoming article must be Oct 9 release');
    assert.strictEqual(upcoming[upcoming.length - 1].slug, 'salmo-faq', 'Last upcoming article must be Nov 6 release');
  });

  await t.test('8. Sorting does not change publication state', () => {
    const published = getPublishedBlogPosts(NOW_OCT_7_WIB);
    const slugsBefore = published.map((p) => p.slug);

    // Shuffle or re-sort
    const reSorted = [...published].sort((a, b) => a.title.localeCompare(b.title));
    const publishedCheck = reSorted.every((p) => isBlogPostPublished(p.publishDate, NOW_OCT_7_WIB));
    assert.strictEqual(publishedCheck, true, 'All posts in published collection must remain published regardless of sorting');
    assert.strictEqual(reSorted.length, slugsBefore.length, 'Count must remain identical');
  });

  await t.test('9. No regression for existing published articles', () => {
    const post = BLOG_POSTS.find((p) => p.slug === 'what-is-salmo-football-betting-intelligence');
    assert.ok(post, 'Article 1 must exist');
    assert.strictEqual(post.publishDate, '2026-10-06');
    assert.strictEqual(post.category, 'Platform');
    assert.ok(post.sections.length > 0, 'Sections must be populated');
    assert.strictEqual(isBlogPostPublished(post.publishDate, NOW_OCT_7_WIB), true, 'Article 1 must be published');
  });

  await t.test('10. Sitemap & SEO behavior: only published articles are exposed', () => {
    // When generating sitemap on 2026-10-07 WIB:
    const sitemapEligible = BLOG_POSTS.filter((p) => isBlogPostPublished(p.publishDate, NOW_OCT_7_WIB));
    assert.strictEqual(sitemapEligible.length, 1, 'Only 1 blog post should be included in sitemap on 2026-10-07 WIB');
    assert.strictEqual(sitemapEligible[0].slug, 'what-is-salmo-football-betting-intelligence');

    // On 2026-10-09 00:00:00 WIB, Article 2 becomes eligible:
    const nowOct9Wib = new Date('2026-10-09T00:00:00+07:00').getTime();
    const sitemapEligibleOct9 = BLOG_POSTS.filter((p) => isBlogPostPublished(p.publishDate, nowOct9Wib));
    assert.strictEqual(sitemapEligibleOct9.length, 2, '2 blog posts should be eligible on 2026-10-09 WIB');
  });
});
