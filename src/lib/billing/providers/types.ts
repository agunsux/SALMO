/**
 * HandicapLab / SALMO — Payment Provider Adapter Types
 * Clean web-first abstraction for Stablecoins, Global Fiat, and SEA Local E-Wallets.
 */

export type PaymentRail = 'STABLECOIN' | 'FIAT' | 'SEA_EWALLET';

export interface BasePaymentIntent {
  intentId: string;
  rail: PaymentRail;
  amountUsd: number;
  itemType: string;
  createdAt: string;
  expiresAt: string;
}

export interface StablecoinPaymentIntent extends BasePaymentIntent {
  rail: 'STABLECOIN';
  depositAddress: string;
  network: 'base' | 'polygon' | 'arbitrum' | 'trc20';
  token: 'USDC' | 'USDT';
  cryptoAmount: number;
  qrCodeUri: string;
}

export interface FiatPaymentIntent extends BasePaymentIntent {
  rail: 'FIAT';
  methods: ('card' | 'apple_pay' | 'google_pay' | 'paypal')[];
  checkoutUrl: string;
}

export interface SeaEwalletPaymentIntent extends BasePaymentIntent {
  rail: 'SEA_EWALLET';
  walletType: 'QRIS' | 'GOPAY' | 'OVO' | 'DANA' | 'TRUEMONEY';
  localCurrency: 'IDR' | 'THB' | 'VND';
  localAmount: number;
  qrString?: string;
  checkoutUrl?: string;
}

export interface PaymentProviderAdapter {
  rail: PaymentRail;
  createIntent(params: {
    userId: string;
    itemType: string;
    amountUsd: number;
    metadata?: Record<string, any>;
  }): Promise<BasePaymentIntent>;
  verifyPayment(intentId: string): Promise<{ success: boolean; txHash?: string }>;
}
