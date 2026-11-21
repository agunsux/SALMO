/**
 * SALMO Entitlements & Pricing Configuration
 * Worldwide low-friction monetization: Subscriptions + Non-expiring Credit Packs + Weekend Passes
 */

import { PricingPlan } from '@/lib/billing/types';

export const MONETIZATION_ENABLED = process.env.NEXT_PUBLIC_MONETIZATION_ENABLED === 'true';

export const DAILY_FREE_MATCH_LIMIT = 3;

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'free',
    name: 'Free Scout',
    priceUsd: 0,
    periodLabel: 'forever',
    type: 'free',
    features: [
      '3 full match analyses per calendar day',
      'Benchmark Asian Handicap & Over/Under market lines',
      'Fair odds vs market odds comparison',
      'Daily value signals',
      'Standard OddsJam-style terminal interface'
    ]
  },
  {
    id: 'weekend_pass',
    name: 'Weekend Pass',
    priceUsd: 1.99,
    periodLabel: '48 hours',
    type: 'pass',
    durationHours: 48,
    features: [
      '48 hours unlimited terminal access',
      'All weekend fixtures across all leagues',
      'Full quarter-line handicap splits (-1.25 to +1.25)',
      'Over/Under Poisson distribution hit-rates',
      'Zero recurring charge — non-subscription'
    ]
  },
  {
    id: 'starter_credits_40',
    name: 'Starter 40 Pack',
    priceUsd: 4.99,
    periodLabel: 'non-expiring',
    type: 'credits',
    creditsCount: 40,
    features: [
      '40 match deep-dive unlocks ($0.12/match)',
      'Credits NEVER expire',
      'Unlock matches on demand when you bet',
      'Full AH quarter-line & O/U Poisson matrices',
      'Pay with Card, PayPal, or Stablecoins (USDC/USDT)'
    ]
  },
  {
    id: 'grinder_credits_100',
    name: 'Grinder 100 Pack',
    priceUsd: 9.99,
    periodLabel: 'non-expiring',
    type: 'credits',
    creditsCount: 100,
    popular: true,
    features: [
      '100 match deep-dive unlocks ($0.09/match)',
      'Credits NEVER expire',
      'Best value for selective weekend bettors',
      'Full AH quarter-line & O/U Poisson matrices',
      'Instant access via Stablecoin (Base/Polygon/Tron) or Card'
    ]
  },
  {
    id: 'pro_monthly',
    name: 'Pro Monthly',
    priceUsd: 7.99,
    periodLabel: 'per month',
    type: 'subscription',
    features: [
      'Unlimited match access across all supported leagues',
      'Full Asian Handicap quarter lines (-1.50 to +1.50)',
      'Live Value Scanner (+EV alerts)',
      'Full transparent public ledger & closing line stats',
      'Cancel anytime with 1-click'
    ]
  },
  {
    id: 'pro_annual',
    name: 'Pro Annual',
    priceUsd: 59.00,
    periodLabel: 'per year ($4.91/mo)',
    type: 'subscription',
    features: [
      'Everything in Pro Monthly',
      'Save 38% compared to monthly billing',
      'Full season pass covering all European leagues',
      'Priority quant terminal updates & feature voting',
      'Billed annually at $59/year'
    ]
  }
];
