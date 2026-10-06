import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { 
  BLOG_POSTS, 
  BlogPost, 
  isBlogPostPublished, 
  getBlogPostPublishTimestamp, 
  formatBlogPublishDate 
} from '@/data/blogPosts';
import { FAQ_DATA } from '@/data/faqData';
import { 
  Calendar, 
  Clock, 
  ArrowLeft, 
  ArrowRight, 
  ShieldCheck, 
  Tag, 
  CheckCircle2, 
  AlertTriangle, 
  Info, 
  ChevronRight,
  Calculator,
  Share2,
  CalendarClock
} from 'lucide-react';

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export const revalidate = 3600;

// Generate static params for all articles
export async function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({
    slug: post.slug,
  }));
}

// Generate dynamic SEO metadata
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = BLOG_POSTS.find((p) => p.slug === slug);

  if (!post) {
    return {
      title: 'Article Not Found | SALMO',
    };
  }

  const published = isBlogPostPublished(post.publishDate);
  const canonicalUrl = `https://salmo.dev/blog/${post.slug}`;
  const publishTimestamp = getBlogPostPublishTimestamp(post.publishDate);
  const isoPublishDate = new Date(publishTimestamp).toISOString();

  // Non-indexable scheduled content for upcoming articles (Section 6)
  const robotsConfig = published
    ? { index: true, follow: true }
    : { index: false, follow: true, nocache: true };

  return {
    title: published ? `${post.metaTitle} | SALMO` : `[Scheduled] ${post.metaTitle} | SALMO`,
    description: post.metaDescription,
    keywords: [post.primaryKeyword, ...post.secondaryKeywords],
    robots: robotsConfig,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: post.metaTitle,
      description: post.metaDescription,
      url: canonicalUrl,
      siteName: 'SALMO.DEV — Football Intelligence Platform',
      type: published ? 'article' : 'website',
      ...(published
        ? {
            publishedTime: isoPublishDate,
            authors: [post.author.name],
            tags: [post.primaryKeyword, ...post.secondaryKeywords],
          }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: post.metaTitle,
      description: post.metaDescription,
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = BLOG_POSTS.find((p) => p.slug === slug);

  if (!post) {
    notFound();
  }

  const published = isBlogPostPublished(post.publishDate);
  const canonicalUrl = `https://salmo.dev/blog/${post.slug}`;
  const formattedDate = formatBlogPublishDate(post.publishDate, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  // Find previous and next articles in chronological order
  const currentIndex = BLOG_POSTS.findIndex((p) => p.slug === slug);
  const prevPost = currentIndex > 0 ? BLOG_POSTS[currentIndex - 1] : null;
  const nextPost = currentIndex < BLOG_POSTS.length - 1 ? BLOG_POSTS[currentIndex + 1] : null;

  // JSON-LD Article Schema (Only generated for legitimately published articles per Section 6)
  const articleSchema = published
    ? {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        headline: post.title,
        description: post.metaDescription,
        author: {
          '@type': 'Organization',
          name: post.author.name,
          url: 'https://salmo.dev',
        },
        publisher: {
          '@type': 'Organization',
          name: 'SALMO.DEV',
          logo: {
            '@type': 'ImageObject',
            url: 'https://salmo.dev/logo.png',
          },
        },
        datePublished: new Date(getBlogPostPublishTimestamp(post.publishDate)).toISOString(),
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': canonicalUrl,
        },
        keywords: [post.primaryKeyword, ...post.secondaryKeywords].join(', '),
      }
    : null;

  // Breadcrumb Schema
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://salmo.dev',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Blog',
        item: 'https://salmo.dev/blog',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: post.title,
        item: canonicalUrl,
      },
    ],
  };

  // FAQ Schema if this is the FAQ article
  const isFaqArticle = post.slug === 'salmo-faq';
  const faqSchema = isFaqArticle
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: FAQ_DATA.flatMap((cat) =>
          cat.items.map((item) => ({
            '@type': 'Question',
            name: item.question,
            acceptedAnswer: {
              '@type': 'Answer',
              text: item.answer,
            },
          }))
        ),
      }
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0D10] text-[#E6E9EE] dark:bg-[#0B0D10] dark:text-[#E6E9EE] light:bg-[#F6F7F9] light:text-[#14171C]">
      {/* Structured Data injection */}
      {articleSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      {faqSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      )}

      <Header />

      {!published && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
          <div className="mx-auto max-w-4xl flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            <span>
              <strong>Scheduled Publication Preview:</strong> This article is scheduled for release on {formattedDate} (Asia/Jakarta / WIB). It is currently unlisted from search indexing.
            </span>
          </div>
        </div>
      )}

      <main className="flex-1">
        {/* Breadcrumb Navigation */}
        <div className="border-b border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] dark:bg-[#111418] light:bg-[#EFF1F5] py-2.5 px-4 sm:px-6">
          <nav aria-label="Breadcrumb" className="mx-auto flex max-w-4xl items-center gap-2 text-xs text-[#8A93A0]">
            <Link href="/" className="hover:text-emerald-400 transition-colors">
              Home
            </Link>
            <ChevronRight className="h-3 w-3" />
            <Link href="/blog" className="hover:text-emerald-400 transition-colors">
              Blog
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className="truncate text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C] font-medium">
              {post.category}
            </span>
          </nav>
        </div>

        {/* Article Header */}
        <header className="border-b border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-gradient-to-b from-[#111418] to-[#0B0D10] py-12 px-4 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className={`rounded-md border px-2.5 py-1 font-semibold ${
                published
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
              }`}>
                {published ? post.category : `Scheduled • ${post.category}`}
              </span>
              <span className={`flex items-center gap-1.5 ${published ? 'text-[#8A93A0]' : 'text-amber-400 font-medium'}`}>
                {published ? (
                  <>
                    <Calendar className="h-3.5 w-3.5 text-emerald-400" />
                    Published {formattedDate}
                  </>
                ) : (
                  <>
                    <CalendarClock className="h-3.5 w-3.5 text-amber-400" />
                    Scheduled: {formattedDate} (WIB)
                  </>
                )}
              </span>
              <span className="text-[#8A93A0]">•</span>
              <span className="flex items-center gap-1.5 text-[#8A93A0]">
                <Clock className="h-3.5 w-3.5 text-emerald-400" />
                {post.readTimeMinutes} min read
              </span>
            </div>

            <h1 className="mt-4 text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white dark:text-white light:text-[#14171C] leading-tight">
              {post.title}
            </h1>

            <p className="mt-4 text-sm sm:text-base text-[#8A93A0] dark:text-[#8A93A0] light:text-[#5A6270] leading-relaxed">
              {post.summary}
            </p>

            {/* Author and Primary Keyword metadata */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] pt-4 text-xs">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
                  S
                </div>
                <div>
                  <div className="font-semibold text-white dark:text-white light:text-[#14171C]">
                    {post.author.name}
                  </div>
                  <div className="text-[11px] text-[#8A93A0]">
                    {post.author.role}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-[#8A93A0]">
                <Tag className="h-3 w-3 text-emerald-400" />
                <span>Primary Keyword:</span>
                <span className="rounded bg-[#171B20] px-2 py-0.5 font-mono text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C]">
                  {post.primaryKeyword}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Article Body Content */}
        <article className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
          {/* Table of Contents Box */}
          <div className="mb-10 rounded-xl border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] dark:bg-[#111418] light:bg-[#FFFFFF] p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Table of Contents
            </h2>
            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#8A93A0]">
              {post.sections.map((section, idx) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="hover:text-emerald-400 transition-colors flex items-center gap-1.5"
                  >
                    <span className="text-emerald-500 font-mono text-[11px]">{idx + 1}.</span>
                    <span className="truncate">{section.heading}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Sections */}
          <div className="space-y-12 text-sm sm:text-base leading-relaxed text-[#D2D7E0] dark:text-[#D2D7E0] light:text-[#2E3542]">
            {post.sections.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-20">
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white dark:text-white light:text-[#14171C] border-b border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] pb-3 mb-4">
                  {section.heading}
                </h2>

                {section.subheading && (
                  <p className="text-xs sm:text-sm font-medium text-emerald-400 mb-4">
                    {section.subheading}
                  </p>
                )}

                <div className="space-y-4">
                  {section.paragraphs.map((p, pIdx) => {
                    // Check if paragraph is formatted as bold question
                    if (p.startsWith('**Q:')) {
                      return (
                        <h3 key={pIdx} className="text-base sm:text-lg font-bold text-emerald-400 pt-3">
                          {p.replace(/\*\*/g, '')}
                        </h3>
                      );
                    }
                    return <p key={pIdx}>{p}</p>;
                  })}
                </div>

                {/* Callout Block */}
                {section.callout && (
                  <div className={`mt-6 rounded-xl border p-4 sm:p-5 ${
                    section.callout.type === 'formula'
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : section.callout.type === 'warning'
                      ? 'border-amber-500/30 bg-amber-500/5'
                      : 'border-blue-500/30 bg-blue-500/5'
                  }`}>
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-2">
                      {section.callout.type === 'formula' && <Calculator className="h-4 w-4" />}
                      {section.callout.type === 'warning' && <AlertTriangle className="h-4 w-4 text-amber-400" />}
                      {section.callout.type === 'info' && <Info className="h-4 w-4 text-blue-400" />}
                      <span>{section.callout.title}</span>
                    </div>
                    <pre className="font-mono text-xs sm:text-sm whitespace-pre-wrap leading-relaxed text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C]">
                      {section.callout.text}
                    </pre>
                  </div>
                )}

                {/* Table Block */}
                {section.table && (
                  <div className="mt-6 overflow-x-auto rounded-xl border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] dark:bg-[#111418] light:bg-[#FFFFFF]">
                    {section.table.caption && (
                      <div className="border-b border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] px-4 py-2.5 text-xs font-semibold text-emerald-400">
                        {section.table.caption}
                      </div>
                    )}
                    <table className="w-full text-left text-xs sm:text-sm">
                      <thead className="border-b border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#171B20] dark:bg-[#171B20] light:bg-[#EFF1F5] text-[#8A93A0]">
                        <tr>
                          {section.table.headers.map((h, hIdx) => (
                            <th key={hIdx} className="px-4 py-3 font-semibold text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C]">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#232830] dark:divide-[#232830] light:divide-[#DCE0E7]">
                        {section.table.rows.map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-[#171B20]/50 dark:hover:bg-[#171B20]/50 light:hover:bg-[#F6F7F9]">
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} className="px-4 py-3 text-xs leading-relaxed">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Bullet Points */}
                {section.bulletPoints && section.bulletPoints.length > 0 && (
                  <ul className="mt-4 space-y-2 text-xs sm:text-sm">
                    {section.bulletPoints.map((bp, bpIdx) => (
                      <li key={bpIdx} className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{bp}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>

          {/* Internal Links Graph & Cross-References */}
          <div className="mt-14 rounded-xl border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] dark:bg-[#111418] light:bg-[#FFFFFF] p-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Related Research & Internal Guides
            </h3>
            <p className="mt-1 text-xs text-[#8A93A0]">
              Continue exploring SALMO's quantitative methodology and liquid market models:
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {post.internalLinks.map((link) => {
                const linkLabel = link.replace('/blog/', '').replace(/-/g, ' ');
                return (
                  <Link
                    key={link}
                    href={link}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#171B20] dark:bg-[#171B20] light:bg-[#EFF1F5] px-3 py-1.5 text-xs text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C] hover:border-emerald-500 hover:text-emerald-400 transition-colors capitalize"
                  >
                    <span>{linkLabel.length > 0 ? linkLabel : 'SALMO Home'}</span>
                    <ChevronRight className="h-3 w-3 text-[#8A93A0]" />
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Conversion CTA Card */}
          <div className="mt-10 rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-[#111418] via-[#111418] to-[#151f1a] p-6 sm:p-8 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Zero Fabrication Intelligence</span>
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white">
                {post.cta.title}
              </h3>
              <p className="text-xs sm:text-sm text-[#8A93A0] max-w-xl">
                {post.cta.description}
              </p>
            </div>
            <Link
              href={post.cta.href}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-xs sm:text-sm font-bold text-black hover:bg-emerald-400 transition-colors shrink-0 shadow-md"
            >
              <span>{post.cta.buttonText}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Responsible Betting Disclaimer */}
          <div className="mt-12 rounded-xl border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418]/60 p-4 text-xs text-[#8A93A0] leading-relaxed">
            <p>
              <strong className="text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C]">Responsible Gambling Notice:</strong> Football betting involves substantial risk of financial capital loss. No model prediction or statistical analysis can guarantee positive returns on any individual match. Never wager capital you cannot afford to lose. Please bet responsibly. 18+ only.
            </p>
          </div>

          {/* Next & Previous Navigation */}
          <div className="mt-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-t border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] pt-6">
            {prevPost ? (
              <Link
                href={`/blog/${prevPost.slug}`}
                className="flex items-center gap-2 rounded-lg border border-[#232830] p-3 text-xs text-[#8A93A0] hover:border-emerald-500 hover:text-white transition-colors"
              >
                <ArrowLeft className="h-4 w-4 text-emerald-400" />
                <div className="text-left">
                  <div className="text-[10px] text-[#8A93A0] uppercase font-semibold">Previous Article</div>
                  <div className="font-medium text-[#E6E9EE] truncate max-w-xs">{prevPost.title}</div>
                </div>
              </Link>
            ) : <div />}

            {nextPost && (
              <Link
                href={`/blog/${nextPost.slug}`}
                className="flex items-center gap-2 rounded-lg border border-[#232830] p-3 text-xs text-[#8A93A0] hover:border-emerald-500 hover:text-white transition-colors ml-auto"
              >
                <div className="text-right">
                  <div className="text-[10px] text-[#8A93A0] uppercase font-semibold">Next Article</div>
                  <div className="font-medium text-[#E6E9EE] truncate max-w-xs">{nextPost.title}</div>
                </div>
                <ArrowRight className="h-4 w-4 text-emerald-400" />
              </Link>
            )}
          </div>
        </article>
      </main>

      <Footer />
    </div>
  );
}
