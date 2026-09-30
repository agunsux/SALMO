import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'SALMO FAQ: Football Betting Predictions, Value Bets, Asian Handicap, BTTS and Over/Under',
  description: 'Everything you need to know about SALMO: markets, expected value formulas, Asian Handicap quarter-lines, pre-kickoff ledger, and competitor comparisons.',
  alternates: {
    canonical: 'https://salmo.dev/faq',
  },
  openGraph: {
    title: 'SALMO FAQ — Football Betting Intelligence Knowledge Base',
    description: 'Explore answers to questions about SALMO markets, odds devigging, expected value, settlement rules, and pre-kickoff ledgers.',
    url: 'https://salmo.dev/faq',
    siteName: 'SALMO.DEV',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SALMO FAQ — Football Betting Intelligence Knowledge Base',
    description: 'Explore answers to questions about SALMO markets, odds devigging, expected value, settlement rules, and pre-kickoff ledgers.',
  },
};

export default function FAQLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
