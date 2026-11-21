/**
 * SALMO Multi-Rail Payment Engine
 * Handles Fiat (Stripe/PayPal abstraction) and Stablecoins (USDC/USDT on Base, Polygon, Arbitrum, Tron)
 * Designed for worldwide bettor convenience with zero banking blocks.
 */

import {
  CryptoCurrency,
  CryptoNetwork,
  PaymentIntentRequest,
  PaymentIntentResponse,
  PricingPlanId
} from './types';
import { PRICING_PLANS } from '@/config/entitlements';

// Official deposit reception addresses for multi-chain stablecoin payments
export const CRYPTO_DEPOSIT_WALLETS: Record<CryptoNetwork, string> = {
  base: '0x8a92Fb045D6e06D94d5059695C0893049F4c2741',
  polygon: '0x8a92Fb045D6e06D94d5059695C0893049F4c2741',
  arbitrum: '0x8a92Fb045D6e06D94d5059695C0893049F4c2741',
  tron: 'TX4N1f8Kk9gR89qY27LmMopGhyy7zF6XvV'
};

export const SUPPORTED_NETWORKS: { id: CryptoNetwork; name: string; chain: string; fee: string }[] = [
  { id: 'base', name: 'Base Network', chain: 'EVM', fee: '< $0.05' },
  { id: 'polygon', name: 'Polygon PoS', chain: 'EVM', fee: '< $0.05' },
  { id: 'arbitrum', name: 'Arbitrum One', chain: 'EVM', fee: '< $0.10' },
  { id: 'tron', name: 'TRON TRC-20', chain: 'Tron', fee: '~ $1.00' }
];

export const SUPPORTED_CURRENCIES: CryptoCurrency[] = ['USDC', 'USDT'];

/**
 * Creates a payment intent for either Fiat or Stablecoins.
 */
export function createPaymentIntent(request: PaymentIntentRequest): PaymentIntentResponse {
  const plan = PRICING_PLANS.find(p => p.id === request.planId);
  if (!plan) {
    throw new Error(`Invalid plan id: ${request.planId}`);
  }

  const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // Half hour intent TTL

  if (request.rail === 'fiat') {
    return {
      success: true,
      paymentId,
      rail: 'fiat',
      amountUsd: plan.priceUsd,
      checkoutUrl: `/api/billing/checkout?session=${paymentId}&plan=${plan.id}`,
      expiresAt
    };
  }

  if (request.rail === 'sea_ewallet') {
    return {
      success: true,
      paymentId,
      rail: 'sea_ewallet',
      amountUsd: plan.priceUsd,
      checkoutUrl: `/api/billing/sea-checkout?session=${paymentId}&plan=${plan.id}`,
      expiresAt
    };
  }

  // Stablecoin rail
  const network = request.cryptoNetwork || 'base';
  const currency = request.cryptoCurrency || 'USDC';
  const depositAddress = CRYPTO_DEPOSIT_WALLETS[network];

  // URI Scheme for crypto payment / QR code
  let qrCodeData = '';
  if (network === 'tron') {
    qrCodeData = `tron:${depositAddress}?amount=${plan.priceUsd}&token=${currency}`;
  } else {
    qrCodeData = `ethereum:${depositAddress}?value=0&amount=${plan.priceUsd}&token=${currency}`;
  }

  return {
    success: true,
    paymentId,
    rail: 'stablecoin',
    amountUsd: plan.priceUsd,
    cryptoAddress: depositAddress,
    cryptoAmount: plan.priceUsd,
    cryptoCurrency: currency,
    cryptoNetwork: network,
    qrCodeData,
    expiresAt
  };
}
