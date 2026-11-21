/**
 * Stablecoin Rail Adapter (USDC / USDT on Base, Polygon, Arbitrum, TRC-20)
 * 0% chargeback risk, worldwide bettor accessible without credit card limits.
 * Ready for CoinGate / NOWPayments / Cryptomus.
 */

import { PaymentProviderAdapter, StablecoinPaymentIntent } from './types';

const WALLET_ADDRESSES = {
  base: '0x8a92Fb045D6e06D94d5059695C0893049F4c2741',
  polygon: '0x8a92Fb045D6e06D94d5059695C0893049F4c2741',
  arbitrum: '0x8a92Fb045D6e06D94d5059695C0893049F4c2741',
  trc20: 'TX4N1f8Kk9gR89qY27LmMopGhyy7zF6XvV',
};

export class StablecoinAdapter implements PaymentProviderAdapter {
  rail = 'STABLECOIN' as const;

  async createIntent(params: {
    userId: string;
    itemType: string;
    amountUsd: number;
    metadata?: { network?: 'base' | 'polygon' | 'arbitrum' | 'trc20'; token?: 'USDC' | 'USDT' };
  }): Promise<StablecoinPaymentIntent> {
    const network = params.metadata?.network || 'base';
    const token = params.metadata?.token || 'USDC';
    const depositAddress = WALLET_ADDRESSES[network];
    const intentId = `tx_stbl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const qrCodeUri = network === 'trc20'
      ? `tron:${depositAddress}?amount=${params.amountUsd}&token=${token}`
      : `ethereum:${depositAddress}?value=0&amount=${params.amountUsd}&token=${token}`;

    return {
      intentId,
      rail: 'STABLECOIN',
      amountUsd: params.amountUsd,
      itemType: params.itemType,
      createdAt: new Date().toISOString(),
      expiresAt,
      depositAddress,
      network,
      token,
      cryptoAmount: params.amountUsd,
      qrCodeUri,
    };
  }

  async verifyPayment(intentId: string): Promise<{ success: boolean; txHash?: string }> {
    // In production, poll on-chain RPC or listen to payment gateway webhooks
    return { success: true, txHash: `0xmock_${intentId}` };
  }
}
