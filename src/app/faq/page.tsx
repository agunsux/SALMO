'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { FAQ_DATA, FAQItem, TOTAL_FAQ_QUESTIONS_COUNT } from '@/data/faqData';
import { 
  Search, 
  HelpCircle, 
  ChevronDown, 
  ChevronUp, 
  Sparkles, 
  ArrowUpRight, 
  CheckCircle2, 
  Layers, 
  ShieldCheck,
  BookOpen
} from 'lucide-react';

export default function FAQPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({
    'what-is-salmo': true,
    'what-markets-does-salmo-cover': true,
    'how-salmo-calculates-value': true,
  });

  const categories = useMemo(() => {
    return ['All', ...FAQ_DATA.map((c) => c.category)];
  }, []);

  const toggleItem = (id: string) => {
    setOpenItems((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const expandAll = () => {
    const allOpen: Record<string, boolean> = {};
    FAQ_DATA.forEach((group) => {
      group.items.forEach((item) => {
        allOpen[item.id] = true;
      });
    });
    setOpenItems(allOpen);
  };

  const collapseAll = () => {
    setOpenItems({});
  };

  // Filter groups and items
  const filteredGroups = useMemo(() => {
    return FAQ_DATA.map((group) => {
      const isCategoryMatch =
        selectedCategory === 'All' || group.category === selectedCategory;

      if (!isCategoryMatch) {
        return null;
      }

      const q = searchQuery.toLowerCase().trim();
      const matchingItems = group.items.filter((item) => {
        if (!q) return true;
        return (
          item.question.toLowerCase().includes(q) ||
          item.answer.toLowerCase().includes(q) ||
          (item.keyPoints &&
            item.keyPoints.some((kp) => kp.toLowerCase().includes(q)))
        );
      });

      if (matchingItems.length === 0) {
        return null;
      }

      return {
        ...group,
        items: matchingItems,
      };
    }).filter(Boolean) as typeof FAQ_DATA;
  }, [selectedCategory, searchQuery]);

  const totalFilteredCount = useMemo(() => {
    return filteredGroups.reduce((acc, g) => acc + g.items.length, 0);
  }, [filteredGroups]);

  // Generate FAQPage JSON-LD schema
  const faqSchema = {
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
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0D10] text-[#E6E9EE] dark:bg-[#0B0D10] dark:text-[#E6E9EE] light:bg-[#F6F7F9] light:text-[#14171C]">
      {/* Inject FAQPage Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <Header />

      <main className="flex-1">
        {/* Header Hero Section */}
        <section className="relative overflow-hidden border-b border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-gradient-to-b from-[#111418] via-[#0B0D10] to-[#0B0D10] py-14 px-4 sm:px-6">
          <div className="mx-auto max-w-5xl">
            <div className="flex flex-col items-start gap-4">
              <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
                <HelpCircle className="h-3.5 w-3.5" />
                <span>SALMO Knowledge Base</span>
                <span className="text-[#8A93A0]">•</span>
                <span>{TOTAL_FAQ_QUESTIONS_COUNT} Verified Questions & Answers</span>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl text-white dark:text-white light:text-[#14171C]">
                Frequently Asked Questions
              </h1>
              <p className="max-w-3xl text-sm sm:text-base leading-relaxed text-[#8A93A0] dark:text-[#8A93A0] light:text-[#5A6270]">
                Everything you need to know about SALMO’s football intelligence engine: supported markets, devigging mathematics, Asian Handicap quarter-lines, pre-kickoff ledgers, and competitor comparisons.
              </p>
            </div>

            {/* Search Bar */}
            <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8A93A0]" />
                <input
                  type="text"
                  placeholder="Search by question, market, formula (e.g. quarter line, EV, OddsJam, settlement)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] dark:bg-[#111418] light:bg-white pl-10 pr-4 py-2.5 text-xs sm:text-sm text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C] placeholder-[#8A93A0] focus:border-emerald-500 focus:outline-none shadow-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={expandAll}
                  className="rounded-lg border border-[#232830] bg-[#111418] px-3 py-2 text-xs font-medium text-[#8A93A0] hover:text-white transition-colors"
                >
                  Expand All
                </button>
                <button
                  onClick={collapseAll}
                  className="rounded-lg border border-[#232830] bg-[#111418] px-3 py-2 text-xs font-medium text-[#8A93A0] hover:text-white transition-colors"
                >
                  Collapse All
                </button>
              </div>
            </div>

            {/* Category Tabs */}
            <div className="mt-6 flex flex-wrap gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    selectedCategory === cat
                      ? 'bg-emerald-500 text-black font-semibold shadow-sm'
                      : 'border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] dark:bg-[#111418] light:bg-[#EFF1F5] text-[#8A93A0] hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ Accordion Groups */}
        <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
          <div className="flex items-center justify-between border-b border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] pb-3 mb-8">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#8A93A0]">
              Showing {totalFilteredCount} Questions
            </span>
            <span className="text-xs text-emerald-400 font-medium">
              Zero Fabrication • Audited Answers
            </span>
          </div>

          {filteredGroups.length === 0 ? (
            <div className="rounded-xl border border-[#232830] bg-[#111418] p-12 text-center">
              <p className="text-sm text-[#8A93A0]">
                No questions found matching "{searchQuery}". Try searching with different terms.
              </p>
              <button
                onClick={() => {
                  setSelectedCategory('All');
                  setSearchQuery('');
                }}
                className="mt-4 rounded-lg bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/30 transition-colors"
              >
                Reset Search & Categories
              </button>
            </div>
          ) : (
            <div className="space-y-12">
              {filteredGroups.map((group, groupIdx) => (
                <div key={group.category} className="space-y-4">
                  {/* Category Header */}
                  <div className="flex items-center justify-between border-b border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] pb-2">
                    <div>
                      <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white dark:text-white light:text-[#14171C] flex items-center gap-2">
                        <span className="font-mono text-emerald-400 text-sm">{groupIdx + 1}.</span>
                        <span>{group.category}</span>
                      </h2>
                      <p className="mt-0.5 text-xs text-[#8A93A0]">
                        {group.description}
                      </p>
                    </div>
                    <span className="text-[11px] font-mono text-[#8A93A0] rounded bg-[#171B20] px-2 py-0.5">
                      {group.items.length} Qs
                    </span>
                  </div>

                  {/* Category Accordion Items */}
                  <div className="space-y-3">
                    {group.items.map((item) => {
                      const isOpen = !!openItems[item.id];

                      return (
                        <div
                          key={item.id}
                          className="rounded-xl border border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] bg-[#111418] dark:bg-[#111418] light:bg-[#FFFFFF] overflow-hidden transition-all duration-200"
                        >
                          <button
                            onClick={() => toggleItem(item.id)}
                            className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-[#171B20]/40 transition-colors"
                            aria-expanded={isOpen}
                          >
                            <span className="text-sm font-semibold text-[#E6E9EE] dark:text-[#E6E9EE] light:text-[#14171C]">
                              {item.question}
                            </span>
                            <div className="shrink-0 text-[#8A93A0]">
                              {isOpen ? (
                                <ChevronUp className="h-4 w-4 text-emerald-400" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </div>
                          </button>

                          {isOpen && (
                            <div className="border-t border-[#232830] dark:border-[#232830] light:border-[#DCE0E7] p-4 bg-[#0E1013]/60 dark:bg-[#0E1013]/60 light:bg-[#FAFAFA] text-xs sm:text-sm text-[#D2D7E0] dark:text-[#D2D7E0] light:text-[#384150] space-y-3 leading-relaxed">
                              <p>{item.answer}</p>

                              {item.keyPoints && item.keyPoints.length > 0 && (
                                <div className="rounded-lg border border-[#232830] bg-[#111418] dark:bg-[#111418] light:bg-white p-3 space-y-1.5">
                                  <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                                    Key Takeaways:
                                  </div>
                                  <ul className="space-y-1">
                                    {item.keyPoints.map((point, pIdx) => (
                                      <li key={pIdx} className="flex items-start gap-2 text-xs">
                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                                        <span>{point}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {item.relatedLink && (
                                <div className="pt-2">
                                  <Link
                                    href={item.relatedLink.href}
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
                                  >
                                    <span>{item.relatedLink.text}</span>
                                    <ArrowUpRight className="h-3.5 w-3.5" />
                                  </Link>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Cross link to Educational Blogs */}
          <div className="mt-14 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-[#111418] to-[#151c22] p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">
                <BookOpen className="h-4 w-4" />
                <span>Deep Quantitative Learning</span>
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white">
                Looking for Comprehensive In-Depth Guides?
              </h3>
              <p className="mt-1 text-xs sm:text-sm text-[#8A93A0] max-w-lg">
                Read our complete 10-article educational series covering Asian Handicap lines, Over/Under families, BTTS modeling, odds devigging, and competitor comparisons.
              </p>
            </div>
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-xs sm:text-sm font-bold text-black hover:bg-emerald-400 transition-colors shrink-0"
            >
              <span>Explore All Articles</span>
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
