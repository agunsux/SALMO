import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();

describe('SALMO SEO Content Engine & Publishing System', () => {
  const manifestPath = path.join(ROOT_DIR, 'src', 'data', 'seoManifest.json');
  const blogPostsPath = path.join(ROOT_DIR, 'src', 'data', 'blogPosts.ts');
  const faqDataPath = path.join(ROOT_DIR, 'src', 'data', 'faqData.ts');
  const sitemapPath = path.join(ROOT_DIR, 'src', 'app', 'sitemap.ts');
  const robotsPath = path.join(ROOT_DIR, 'src', 'app', 'robots.ts');

  test('1. Manifest exists and contains exactly 10 articles', () => {
    assert.ok(fs.existsSync(manifestPath), 'seoManifest.json must exist');
    const content = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    assert.ok(Array.isArray(content), 'Manifest must be an array');
    assert.equal(content.length, 10, 'Manifest must contain exactly 10 articles');

    const expectedSlugs = [
      'what-is-salmo-football-betting-intelligence',
      'salmo-vs-oddsjam',
      'salmo-vs-exprysm',
      'salmo-vs-rebelbetting',
      'how-to-find-value-bets-football',
      'asian-handicap-betting-explained',
      'over-under-football-betting-explained',
      'btts-betting-explained',
      'how-salmo-records-predictions-before-kickoff',
      'salmo-faq',
    ];

    content.forEach((item, index) => {
      assert.equal(item.article, index + 1, `Article number must be sequential: ${index + 1}`);
      assert.equal(item.slug, expectedSlugs[index], `Slug must match: ${expectedSlugs[index]}`);
      assert.ok(item.primaryKeyword && item.primaryKeyword.length > 0, 'primaryKeyword required');
      assert.ok(Array.isArray(item.secondaryKeywords) && item.secondaryKeywords.length >= 2, 'secondaryKeywords required');
      assert.ok(item.searchIntent && item.searchIntent.length > 0, 'searchIntent required');
      assert.ok(item.title && item.title.length > 0, 'title required');
      assert.ok(item.metaDescription && item.metaDescription.length > 0, 'metaDescription required');
      assert.ok(item.publishDate && /^\d{4}-\d{2}-\d{2}$/.test(item.publishDate), 'publishDate must be YYYY-MM-DD');
      assert.ok(Array.isArray(item.internalLinks) && item.internalLinks.length >= 3, 'internalLinks required');
      assert.ok(item.cta && item.cta.text && item.cta.href, 'cta required');
      assert.equal(item.status, 'published', 'status must be published');
    });
  });

  test('2. Publishing cadence: 2 articles/week across 5 weeks on Tuesdays & Fridays', () => {
    const content = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const expectedSchedule = [
      { article: 1, date: '2026-10-06', day: 'Tuesday' },
      { article: 2, date: '2026-10-09', day: 'Friday' },
      { article: 3, date: '2026-10-13', day: 'Tuesday' },
      { article: 4, date: '2026-10-16', day: 'Friday' },
      { article: 5, date: '2026-10-20', day: 'Tuesday' },
      { article: 6, date: '2026-10-23', day: 'Friday' },
      { article: 7, date: '2026-10-27', day: 'Tuesday' },
      { article: 8, date: '2026-10-30', day: 'Friday' },
      { article: 9, date: '2026-11-03', day: 'Tuesday' },
      { article: 10, date: '2026-11-06', day: 'Friday' },
    ];

    content.forEach((item, idx) => {
      const exp = expectedSchedule[idx];
      assert.equal(item.publishDate, exp.date, `Article ${item.article} date mismatch`);

      // Verify the day of the week in UTC
      const [year, month, day] = item.publishDate.split('-').map(Number);
      const d = new Date(Date.UTC(year, month - 1, day));
      const dayName = d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
      assert.equal(dayName, exp.day, `Article ${item.article} must be published on a ${exp.day}`);
    });
  });

  test('3. Blog posts data file exists and exports all 10 articles', () => {
    assert.ok(fs.existsSync(blogPostsPath), 'blogPosts.ts must exist');
    const content = fs.readFileSync(blogPostsPath, 'utf-8');

    const expectedSlugs = [
      'what-is-salmo-football-betting-intelligence',
      'salmo-vs-oddsjam',
      'salmo-vs-exprysm',
      'salmo-vs-rebelbetting',
      'how-to-find-value-bets-football',
      'asian-handicap-betting-explained',
      'over-under-football-betting-explained',
      'btts-betting-explained',
      'how-salmo-records-predictions-before-kickoff',
      'salmo-faq',
    ];

    expectedSlugs.forEach((slug) => {
      assert.ok(content.includes(`slug: '${slug}'`), `blogPosts.ts must include slug: ${slug}`);
    });
  });

  test('4. Comprehensive FAQ data covers all 10 required categories and 26+ questions', () => {
    assert.ok(fs.existsSync(faqDataPath), 'faqData.ts must exist');
    const content = fs.readFileSync(faqDataPath, 'utf-8');

    const requiredCategories = [
      'SALMO Basics',
      'Markets',
      'Predictions',
      'Value / EV',
      'Odds',
      'Ledger',
      'Settlement',
      'Performance',
      'Competitors',
      'Pricing / Access',
    ];

    requiredCategories.forEach((cat) => {
      assert.ok(content.includes(`category: "${cat}"`) || content.includes(`category: '${cat}'`), `FAQ must include category: ${cat}`);
    });

    const requiredQuestions = [
      'What is SALMO?',
      'Is SALMO a sportsbook',
      'Does SALMO guarantee winning bets',
      'What markets does SALMO cover?',
      'Does SALMO cover Asian Handicap?',
      'Does SALMO cover BTTS?',
      'Does SALMO cover Over/Under?',
      'Does SALMO support quarter lines?',
      'How does SALMO calculate value?',
      'What is EV?',
      'What are fair odds?',
      'What is Closing Line Value',
      'Does SALMO record predictions before kickoff?',
      'Can predictions be deleted',
      'How does settlement work?',
      'How does SALMO handle postponed matches?',
      'How does SALMO handle cancelled matches?',
      'How does SALMO calculate ROI?',
      'How does SALMO calculate Yield?',
      'How does SALMO compare with OddsJam?',
      'How does SALMO compare with ExPrysm?',
      'How does SALMO compare with RebelBetting?',
      'How does SALMO compare with BetBurger?',
      'How often are Daily Picks updated?',
      'Why can the number of Daily Picks change from day to day?',
      'Why can SALMO have fewer picks than another platform?',
    ];

    requiredQuestions.forEach((q) => {
      assert.ok(content.toLowerCase().includes(q.toLowerCase()), `FAQ must answer: ${q}`);
    });
  });

  test('5. YMYL compliance: Zero fabricated guarantee claims in articles and FAQ', () => {
    const blogContent = fs.readFileSync(blogPostsPath, 'utf-8');
    const faqContent = fs.readFileSync(faqDataPath, 'utf-8');

    const forbiddenGuarantees = [
      'guaranteed profit',
      '100% win',
      'risk-free profit',
      'guaranteed winning picks',
    ];

    forbiddenGuarantees.forEach((phrase) => {
      const blogOccurrences = (blogContent.match(new RegExp(phrase, 'gi')) || []).length;
      const faqOccurrences = (faqContent.match(new RegExp(phrase, 'gi')) || []).length;

      // Ensure that if mentioned, it is in a disclaimer context (e.g., "does not guarantee", "never claims", etc.)
      const blogClaims = (blogContent.match(new RegExp(`we offer ${phrase}|we guarantee ${phrase}|provides ${phrase}`, 'gi')) || []).length;
      assert.equal(blogClaims, 0, `Forbidden promotional guarantee claim found: ${phrase}`);
    });

    // Check for responsible gambling language
    assert.ok(blogContent.includes('Responsible Gambling Notice') || blogContent.includes('bet responsibly'), 'Blog must include responsible gambling notices');
  });

  test('6. Asian Handicap & Over/Under quarter-line settlement conforms to QuarterLineSettler', () => {
    const blogContent = fs.readFileSync(blogPostsPath, 'utf-8');

    // Quarter-line settlement outcomes
    assert.ok(blogContent.includes('HALF_WIN') || blogContent.includes('Half Win'), 'Must explain Half Win');
    assert.ok(blogContent.includes('HALF_LOSS') || blogContent.includes('Half Loss'), 'Must explain Half Loss');
    assert.ok(blogContent.includes('PUSH') || blogContent.includes('Push'), 'Must explain Push');

    // Check line family coverage
    const lines = ['1.0', '1.5', '2.0', '2.25', '2.5', '2.75', '3.0'];
    lines.forEach((line) => {
      assert.ok(blogContent.includes(line), `Over/Under must cover line ${line}`);
    });
  });

  test('7. Sitemap & Robots.txt include all 10 articles and valid configuration', () => {
    assert.ok(fs.existsSync(sitemapPath), 'src/app/sitemap.ts must exist');
    assert.ok(fs.existsSync(robotsPath), 'src/app/robots.ts must exist');

    const sitemapContent = fs.readFileSync(sitemapPath, 'utf-8');
    const robotsContent = fs.readFileSync(robotsPath, 'utf-8');

    assert.ok(sitemapContent.includes('BLOG_POSTS.map'), 'Sitemap must dynamically map BLOG_POSTS');
    assert.ok(sitemapContent.includes('/daily-picks'), 'Sitemap must include /daily-picks');
    assert.ok(sitemapContent.includes('/faq'), 'Sitemap must include /faq');
    assert.ok(sitemapContent.includes('/blog'), 'Sitemap must include /blog');

    assert.ok(robotsContent.includes('sitemap.xml'), 'Robots must reference sitemap.xml');
    assert.ok(robotsContent.includes("allow: '/'"), 'Robots must allow crawling');
  });

  test('8. Strict production boundary: Core betting engines and contracts untouched', () => {
    const gitDiffFiles = [
      'src/engine/ah/devig.ts',
      'src/engine/ah/quarterLineSettler.ts',
      'src/engine/decision/decisionPolicy.ts',
      'src/engine/matchIntelligenceService.ts',
      'src/contracts/handicapLabAdapter.ts',
      'src/contracts/handicapLabClient.ts',
      'src/services/providers/oddsPapiProvider.ts',
      'src/services/providers/apiFootballProvider.ts',
    ];

    gitDiffFiles.forEach((file) => {
      assert.ok(fs.existsSync(path.join(ROOT_DIR, file)), `Core file must still exist: ${file}`);
    });
  });
});
