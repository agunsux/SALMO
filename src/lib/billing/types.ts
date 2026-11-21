/**
 * SALMO Billing & Entitlements Types
 * Worldwide low-friction monetization: Subscriptions + Non-expiring Credit Packs + Weekend Passes
 */

export type PricingPlanId = 
  | 'free'
  | 'weekend_pass'
  | 'starter_credits_40'
  | 'grinder_credits_100'
  | 'pro_monthly'
  | 'pro_annual';

export type PaymentRail = 'stablecoin' | 'fiat' | 'sea_ewallet';

export type CryptoNetwork = 'base' | 'polygon' | 'arbitrum' | 'tron';
export type CryptoCurrency = 'USDC' | 'USDT';

export interface PricingPlan {
  id: PricingPlanId;
  name: string;
  priceUsd: number;
  periodLabel?: string;
  type: 'free' | 'pass' | 'credits' | 'subscription';
  creditsCount?: number;
  durationHours?: number;
  features: string[];
  popular?: boolean;
}

export interface UserEntitlements {
  isPro: boolean;
  isWeekendPassActive: boolean;
  weekendPassExpiresAt?: string | null;
  creditsBalance: number;
  unlockedMatchIds: string[];
  dailyFreeUsed: number;
  dailyFreeLimit: number;
}

export interface PaymentIntentRequest {
  planId: PricingPlanId;
  rail: PaymentRail;
  cryptoNetwork?: CryptoNetwork;
  cryptoCurrency?: CryptoCurrency;
  customerEmail?: string;
}

export interface PaymentIntentResponse {
  success: boolean;
  paymentId: string;
  rail: PaymentRail;
  amountUsd: number;
  checkoutUrl?: string;
  cryptoAddress?: string;
  cryptoAmount?: number;
  cryptoCurrency?: string;
  cryptoNetwork?: string;
  qrCodeData?: string;
  expiresAt: string;
}
