/**
 * Global Fiat Rail Adapter (Cards, Apple Pay, Google Pay, PayPal)
 * Preserves ~97% revenue vs Apple/Google In-App Purchase 15-30% fees.
 * Ready for Stripe / Checkout.com / PayPal SDK.
 */

import { PaymentProviderAdapter, FiatPaymentIntent } from './types';

export class FiatAdapter implements PaymentProviderAdapter {
  rail = 'FIAT' as const;

  async createIntent(params: {
    userId: string;
    itemType: string;
    amountUsd: number;
    metadata?: Record<string, any>;
  }): Promise<FiatPaymentIntent> {
    const intentId = `tx_fiat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    return {
      intentId,
      rail: 'FIAT',
      amountUsd: params.amountUsd,
      itemType: params.itemType,
      createdAt: new Date().toISOString(),
      expiresAt,
      methods: ['card', 'apple_pay', 'google_pay', 'paypal'],
      checkoutUrl: `/api/billing/checkout?session=${intentId}&item=${params.itemType}`,
    };
  }

  async verifyPayment(intentId: string): Promise<{ success: boolean; txHash?: string }> {
    return { success: true };
  }
}
