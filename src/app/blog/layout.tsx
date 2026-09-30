import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Football Betting Intelligence Blog & Quantitative Guides | SALMO',
  description: 'Explore deep quantitative football guides on Asian Handicap, Over/Under, BTTS, odds devigging, expected value (+EV), and verifiable pre-kickoff ledgers.',
  alternates: {
    canonical: 'https://salmo.dev/blog',
  },
  openGraph: {
    title: 'Football Betting Intelligence Blog | SALMO.DEV',
    description: 'Disciplined football analytics, model probabilities, and decision-intelligence guides for serious sports bettors.',
    url: 'https://salmo.dev/blog',
    siteName: 'SALMO.DEV',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Football Betting Intelligence Blog | SALMO.DEV',
    description: 'Disciplined football analytics, model probabilities, and decision-intelligence guides for serious sports bettors.',
  },
};

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
