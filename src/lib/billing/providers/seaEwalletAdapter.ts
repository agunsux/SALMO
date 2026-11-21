/**
 * SEA Local E-Wallets Rail Adapter (QRIS, GoPay, OVO, DANA, TrueMoney)
 * Essential for Indonesia, Thailand, Vietnam where credit card penetration is < 15%.
 * Ready for Xendit / DOKU integration.
 */

import { PaymentProviderAdapter, SeaEwalletPaymentIntent } from './types';

const FX_RATES = {
  IDR: 16200,
  THB: 36.5,
  VND: 25400,
};

export class SeaEwalletAdapter implements PaymentProviderAdapter {
  rail = 'SEA_EWALLET' as const;

  async createIntent(params: {
    userId: string;
    itemType: string;
    amountUsd: number;
    metadata?: { walletType?: 'QRIS' | 'GOPAY' | 'OVO' | 'DANA' | 'TRUEMONEY'; currency?: 'IDR' | 'THB' | 'VND' };
  }): Promise<SeaEwalletPaymentIntent> {
    const walletType = params.metadata?.walletType || 'QRIS';
    const localCurrency = params.metadata?.currency || 'IDR';
    const rate = FX_RATES[localCurrency] || 16200;
    const localAmount = Math.round(params.amountUsd * rate);

    const intentId = `tx_sea_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    return {
      intentId,
      rail: 'SEA_EWALLET',
      amountUsd: params.amountUsd,
      itemType: params.itemType,
      createdAt: new Date().toISOString(),
      expiresAt,
      walletType,
      localCurrency,
      localAmount,
      qrString: `00020101021226${intentId}5204581253033605802ID5911HANDICAPLAB6007JAKARTA`,
      checkoutUrl: `/api/billing/sea-checkout?session=${intentId}&wallet=${walletType}`,
    };
  }

  async verifyPayment(intentId: string): Promise<{ success: boolean; txHash?: string }> {
    return { success: true };
  }
}
