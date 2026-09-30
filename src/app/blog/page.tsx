'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { BLOG_POSTS, BlogPost } from '@/data/blogPosts';
import { 
  Search, 
  Calendar, 
  Clock, 
  ArrowRight, 
  BookOpen, 
  Sparkles, 
  ShieldCheck, 
  Tag, 
  Filter,
  CheckCircle2
} from 'lucide-react';

const CATEGORIES = [
  'All',
  'Markets',
  'Methodology',
  'Comparison',
  'Platform',
  'Trust & Architecture',
  'FAQ'
] as const;

export default function BlogIndexPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Sort newest first by publishDate descending
  const sortedPosts = useMemo(() => {
    return [...BLOG_POSTS].sort((a, b) => {
      return new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime();
    });
  }, []);

  // Filter posts based on category and search query
  const filteredPosts = useMemo(() => {
    return sortedPosts.filter((post) => {
      const matchesCategory =
        selectedCategory === 'All' || post.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        post.title.toLowerCase().includes(q) ||
        post.summary.toLowerCase().includes(q) ||
        post.primaryKeyword.toLowerCase().includes(q) ||
        post.secondaryKeywords.some((k) => k.toLowerCase().includes(q));

      return matchesCategory && matchesSearch;
    });
  }, [sortedPosts, selectedCategory, searchQuery]);

  const featuredPost = sortedPosts[0];

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0D10] text-[#E6E9EE] dark:bg-[#0B0D10] dark:text-[#E6E9EE] light:bg-[#F6F7F9] light:text-[#14171C]">
      <Header />

      <main className="flex-1">
        {/* Hero Header Section */}
        <section className="relative overflow-hidden border-b border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-gradient-to-b from-[#111418] via-[#0B0D10] to-[#0B0D10] py-14 px-4 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-col items-start gap-4">
              <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
                <Sparkles className="h-3.5 w-3.5" />
                <span>SALMO Quantitative Content Cluster</span>
                <span className="text-[#8A93A0]">•</span>
                <span>5-Week Publication Cadence</span>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl text-white dark:text-white light:text-[#14171C]">
                Football Betting Intelligence & Methodology
              </h1>
              <p className="max-w-3xl text-sm sm:text-base leading-relaxed text-[#8A93A0] dark:text-[#8A93A0] light:text-[#5A6270]">
                Institutional-grade research on Asian Handicap quarter-lines, Over/Under goal distributions, BTTS bivariate models, odds devigging, and immutable pre-kickoff ledgers. No generic tips, no fabricated win rates.
              </p>
            </div>

            {/* Filter and Search Bar */}
            <div className="mt-8 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
              {/* Category Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      selectedCategory === cat
                        ? 'bg-emerald-500 text-black font-semibold'
                        : 'border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] dark:bg-[#111418] light:bg-[#EFF1F5] text-[#8A93A0] hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Search Input */}
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8A93A0]" />
                <input
                  type="text"
                  placeholder="Search articles, keywords, markets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] dark:bg-[#111418] light:bg-white pl-9 pr-4 py-1.5 text-xs text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C] placeholder-[#8A93A0] focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Featured Post Callout (when viewing All and no search) */}
        {selectedCategory === 'All' && !searchQuery && featuredPost && (
          <section className="mx-auto max-w-7xl px-4 pt-10 sm:px-6">
            <div className="relative rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-[#111418] via-[#111418] to-[#151a22] p-6 sm:p-8 shadow-xl">
              <div className="flex items-center gap-3 text-xs text-emerald-400 font-semibold uppercase tracking-wider mb-3">
                <span className="rounded bg-emerald-500/20 px-2 py-0.5">Latest Release</span>
                <span>•</span>
                <span>{featuredPost.category}</span>
                <span>•</span>
                <span>{featuredPost.readTimeMinutes} min read</span>
              </div>
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-white hover:text-emerald-400 transition-colors">
                <Link href={`/blog/${featuredPost.slug}`}>
                  {featuredPost.title}
                </Link>
              </h2>
              <p className="mt-3 text-xs sm:text-sm text-[#8A93A0] leading-relaxed max-w-4xl">
                {featuredPost.summary}
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-[#232830] pt-4">
                <div className="flex items-center gap-4 text-xs text-[#8A93A0]">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-emerald-400" />
                    Published {new Date(featuredPost.publishDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <span>•</span>
                  <span>Primary: <strong className="text-[#E6E9EE]">{featuredPost.primaryKeyword}</strong></span>
                </div>
                <Link
                  href={`/blog/${featuredPost.slug}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-black hover:bg-emerald-400 transition-colors"
                >
                  Read Full Article <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* Article Cards Grid */}
        <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <div className="flex items-center justify-between border-b border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] pb-4 mb-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#8A93A0]">
              <BookOpen className="h-4 w-4 text-emerald-400" />
              <span>Showing {filteredPosts.length} of {BLOG_POSTS.length} Articles (Ordered Newest First)</span>
            </div>
            <span className="text-xs text-[#8A93A0]">
              Tuesday & Friday Publishing Cadence
            </span>
          </div>

          {filteredPosts.length === 0 ? (
            <div className="rounded-xl border border-[#232830] bg-[#111418] p-12 text-center">
              <p className="text-sm text-[#8A93A0]">
                No articles match your search criteria. Try resetting your filter or search keywords.
              </p>
              <button
                onClick={() => {
                  setSelectedCategory('All');
                  setSearchQuery('');
                }}
                className="mt-4 rounded-lg bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/30 transition-colors"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredPosts.map((post) => {
                const formattedDate = new Date(post.publishDate).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                });

                return (
                  <article
                    key={post.slug}
                    className="flex flex-col justify-between rounded-xl border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] dark:bg-[#111418] light:bg-[#FFFFFF] p-5 hover:border-emerald-500/50 hover:shadow-lg transition-all duration-200"
                  >
                    <div>
                      {/* Meta badge strip */}
                      <div className="flex items-center justify-between gap-2 text-[11px] mb-3">
                        <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-400">
                          {post.category}
                        </span>
                        <span className="flex items-center gap-1 text-[#8A93A0]">
                          <Clock className="h-3 w-3" />
                          {post.readTimeMinutes} min
                        </span>
                      </div>

                      {/* Title */}
                      <h3 className="text-base font-bold tracking-tight text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C] hover:text-emerald-400 transition-colors leading-snug">
                        <Link href={`/blog/${post.slug}`}>
                          {post.title}
                        </Link>
                      </h3>

                      {/* Summary */}
                      <p className="mt-2.5 text-xs text-[#8A93A0] dark:text-[#8A93A0] light:text-[#5A6270] leading-relaxed line-clamp-3">
                        {post.summary}
                      </p>

                      {/* Primary keyword pill */}
                      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-[#8A93A0]">
                        <Tag className="h-3 w-3 text-emerald-400" />
                        <span className="font-mono text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C]">{post.primaryKeyword}</span>
                      </div>
                    </div>

                    {/* Bottom Date and Action */}
                    <div className="mt-5 flex items-center justify-between border-t border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] pt-3.5 text-xs">
                      <span className="flex items-center gap-1 text-[11px] text-[#8A93A0]">
                        <Calendar className="h-3 w-3 text-[#8A93A0]" />
                        {formattedDate}
                      </span>
                      <Link
                        href={`/blog/${post.slug}`}
                        className="inline-flex items-center gap-1 font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
                      >
                        Read <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
